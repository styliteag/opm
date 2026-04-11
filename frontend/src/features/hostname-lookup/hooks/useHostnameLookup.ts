import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { deleteApi, fetchApi, postApi, putApi } from "@/lib/api";

/* Types mirror the backend Pydantic schemas in
 * backend/src/app/schemas/hostname_lookup.py. Any drift here and the
 * admin page will silently miss fields — keep in sync. */

export type HostnameLookupStatus = "success" | "no_results" | "failed";

export interface HostnameLookupEntry {
  ip: string;
  hostnames: string[];
  source: string;
  status: HostnameLookupStatus;
  queried_at: string | null;
  expires_at: string | null;
  error_message: string | null;
}

export interface CacheExportDocument {
  format_version: number;
  exported_at: string;
  source_instance: string;
  entry_count: number;
  entries: HostnameLookupEntry[];
}

export interface CacheStatusByStatus {
  success: number;
  no_results: number;
  failed: number;
}

export interface CacheBudgetStatus {
  source: string;
  used: number;
  limit: number;
  remaining: number;
  day: string;
}

export interface CacheStatusResponse {
  filler_enabled: boolean;
  filler_interval_minutes: number;
  total_entries: number;
  entries_by_status: CacheStatusByStatus;
  total_vhosts: number;
  total_hosts: number;
  enriched_hosts: number;
  coverage_percent: number;
  last_queried_at: string | null;
  budgets: CacheBudgetStatus[];
}

export interface CacheImportSummary {
  total: number;
  inserted: number;
  overwritten: number;
  skipped: number;
  rejected: number;
  errors: string[];
}

/* -------------------------------------------------------------------- */

/** Status card data — cache coverage, budget, row counts. */
export function useHostnameLookupStatus() {
  return useQuery({
    queryKey: ["hostname-lookup", "status"],
    queryFn: () =>
      fetchApi<CacheStatusResponse>("/api/admin/hostname-lookup/status"),
    refetchInterval: 15_000, // poll while the admin page is open
  });
}

/** Full cache snapshot used as the entries table data source. */
export function useHostnameLookupExport() {
  return useQuery({
    queryKey: ["hostname-lookup", "export"],
    queryFn: () =>
      fetchApi<CacheExportDocument>("/api/admin/hostname-lookup/export"),
  });
}

/** Manually trigger the filler job outside its scheduled slot. */
export function useRunHostnameCacheFiller() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      postApi<{ status: string; message: string }>(
        "/api/admin/hostname-lookup/run-filler",
        {},
      ),
    onSuccess: () => {
      // The filler runs in the background — poll status/export to
      // pick up freshly-cached rows as they land.
      qc.invalidateQueries({ queryKey: ["hostname-lookup"] });
    },
  });
}

/** Import a JSON document into the cache with the given strategy. */
export function useImportHostnameCache() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      document,
      strategy,
    }: {
      document: CacheExportDocument;
      strategy: "skip" | "overwrite";
    }) =>
      postApi<CacheImportSummary>(
        `/api/admin/hostname-lookup/import?strategy=${strategy}`,
        document,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hostname-lookup"] });
    },
  });
}

/** Admin: hand-edit a cache row — full replacement of the vhost list. */
export function useUpdateHostnameCacheEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ip, hostnames }: { ip: string; hostnames: string[] }) =>
      putApi<HostnameLookupEntry>(
        `/api/admin/hostname-lookup/entries/${encodeURIComponent(ip)}`,
        { hostnames },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hostname-lookup"] });
    },
  });
}

/** Admin: delete a cache row. */
export function useDeleteHostnameCacheEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ip: string) =>
      deleteApi(
        `/api/admin/hostname-lookup/entries/${encodeURIComponent(ip)}`,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hostname-lookup"] });
    },
  });
}

/* -------------------------------------------------------------------- */
/* Host-scoped hook — used by the host detail page's "Known Hostnames"
 * panel. Authenticated user, not admin-only. */

export interface HostCachedHostnamesResponse {
  ip: string;
  hostnames: string[];
  source: string | null;
  queried_at: string | null;
  expires_at: string | null;
}

export function useHostCachedHostnames(hostId: number | null) {
  return useQuery({
    queryKey: ["host-hostnames", hostId],
    queryFn: () =>
      fetchApi<HostCachedHostnamesResponse>(
        `/api/hosts/${hostId}/hostnames`,
      ),
    enabled: hostId !== null,
  });
}

/** Shape of the 202 payload returned by the refresh endpoints. */
export interface HostnameLookupRefreshResponse {
  status: "queued";
  queue_entry: {
    id: number;
    ip: string;
    status: "pending" | "claimed" | "completed" | "failed";
    requested_by_user_id: number | null;
    requested_at: string;
    claimed_at: string | null;
    completed_at: string | null;
    error_message: string | null;
  };
}

/**
 * Enqueue a manual hostname lookup for a host's IP.
 *
 * Posts to ``POST /api/hosts/{host_id}/hostname-lookup/refresh`` and
 * schedules a delayed invalidation of the ``host-hostnames`` query
 * so the panel refetches after the scanner has had time to drain
 * the queue (next poll cycle, typically 5–10 s, plus network
 * egress time for the HT / RapidDNS chain). The delay is a
 * compromise: short enough that users see results "soon", long
 * enough that we don't spam the backend with empty refetches
 * while the scanner is still running.
 */
export function useRefreshHostHostnames(hostId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      postApi<HostnameLookupRefreshResponse>(
        `/api/hosts/${hostId}/hostname-lookup/refresh`,
        {},
      ),
    onSuccess: () => {
      // The scanner picks up the queued job on its next poll cycle
      // (default 10 s). Re-invalidate after a generous delay so the
      // panel refetches once the cache row has been written.
      window.setTimeout(() => {
        qc.invalidateQueries({ queryKey: ["host-hostnames", hostId] });
        qc.invalidateQueries({ queryKey: ["hosts"] });
      }, 10_000);
    },
  });
}
