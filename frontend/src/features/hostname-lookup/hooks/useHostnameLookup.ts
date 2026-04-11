import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchApi, postApi } from "@/lib/api";

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
