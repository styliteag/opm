import { useState } from "react";
import { ChevronDown, ChevronRight, Globe, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import {
  useHostCachedHostnames,
  useRefreshHostHostnames,
} from "@/features/hostname-lookup/hooks/useHostnameLookup";

interface HostKnownHostnamesProps {
  hostId: number;
}

/**
 * Compact panel on the host detail page showing cached reverse-IP
 * hostnames for this host's IP. The header always renders a
 * Refresh button that enqueues a manual hostname lookup — the
 * scanner picks it up on its next poll cycle (typically 5–10 s),
 * runs the HackerTarget / RapidDNS chain, posts results back to
 * the cache, and the panel auto-refetches via a delayed
 * ``host-hostnames`` query invalidation.
 *
 * When a cache row exists, clicking the header expands a chip
 * grid of every known vhost. When no row exists yet, the panel
 * still renders the Refresh affordance so operators can trigger
 * first-time enrichment from the host detail page.
 */
export function HostKnownHostnames({ hostId }: HostKnownHostnamesProps) {
  const { data, isLoading } = useHostCachedHostnames(hostId);
  const refresh = useRefreshHostHostnames(hostId);
  const [expanded, setExpanded] = useState(false);

  const hasCacheRow = data !== undefined && data.source !== null;
  const count = data?.hostnames.length ?? 0;
  const isManual = data?.source === "manual";

  const handleRefresh = (e: React.MouseEvent) => {
    e.stopPropagation();
    refresh.mutate(undefined, {
      onSuccess: () => {
        toast.success(
          "Hostname lookup queued — results appear on next scanner poll (~10 s)",
        );
      },
      onError: (err: Error) => {
        toast.error(err.message || "Failed to queue hostname lookup");
      },
    });
  };

  if (isLoading) {
    return null;
  }

  return (
    <div className="rounded-md border border-border/40 bg-card/40">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm"
        onClick={() => hasCacheRow && setExpanded((v) => !v)}
        aria-disabled={!hasCacheRow}
      >
        {hasCacheRow ? (
          expanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )
        ) : (
          <span className="h-4 w-4" aria-hidden="true" />
        )}
        <Globe className="h-4 w-4 text-muted-foreground" />
        <span className="font-emphasis text-foreground">
          Known Hostnames{hasCacheRow ? ` (${count})` : ""}
        </span>
        <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          {isManual && (
            <span className="rounded-sm bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-emphasis uppercase tracking-wider text-amber-300">
              Manual
            </span>
          )}
          {data?.source ? <span>{data.source}</span> : null}
          {data?.queried_at && (
            <span title={new Date(data.queried_at).toLocaleString()}>
              cached {new Date(data.queried_at).toLocaleDateString()}
            </span>
          )}
          <span
            role="button"
            tabIndex={0}
            aria-label="Refresh hostname lookup"
            aria-disabled={refresh.isPending}
            onClick={handleRefresh}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleRefresh(e as unknown as React.MouseEvent);
              }
            }}
            className="flex items-center gap-1 rounded-sm border border-border/60 px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer data-[disabled=true]:cursor-not-allowed data-[disabled=true]:opacity-60"
            data-disabled={refresh.isPending}
          >
            <RefreshCw
              className={`h-3 w-3 ${refresh.isPending ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
            Refresh
          </span>
        </span>
      </button>
      {hasCacheRow && expanded && (
        <div className="border-t border-border/40 px-4 py-3">
          {count === 0 ? (
            <p className="text-xs text-muted-foreground">
              The cache row for this IP has no hostnames
              {isManual
                ? " — operator explicitly marked this host as having nothing to scan."
                : " — the reverse-IP source returned no results."}
            </p>
          ) : (
            <>
              <p className="mb-2 text-xs text-muted-foreground">
                These are the vhosts nuclei will fan out over when SNI
                fan-out is enabled on this host&apos;s network.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {data?.hostnames.map((hostname) => (
                  <span
                    key={hostname}
                    className="rounded-sm bg-card/60 px-2 py-0.5 font-mono text-[11px] text-foreground"
                  >
                    {hostname}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      )}
      {!hasCacheRow && (
        <div className="border-t border-border/40 px-4 py-2">
          <p className="text-xs text-muted-foreground">
            No cached hostnames yet. Click Refresh to enqueue a reverse-IP
            lookup; the scanner picks it up on its next poll (~10 s) and
            the panel refreshes with the results.
          </p>
        </div>
      )}
    </div>
  );
}
