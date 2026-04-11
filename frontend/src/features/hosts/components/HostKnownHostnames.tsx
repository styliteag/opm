import { useState } from "react";
import { ChevronDown, ChevronRight, Globe } from "lucide-react";

import { useHostCachedHostnames } from "@/features/hostname-lookup/hooks/useHostnameLookup";

interface HostKnownHostnamesProps {
  hostId: number;
}

/**
 * Compact panel on the host detail page showing cached reverse-IP
 * hostnames for this host's IP. Collapsed by default; clicking the
 * header expands a chip grid of every known vhost. When the backend
 * cache has no row yet, the component hides itself (hostnames
 * aren't relevant for hosts the filler hasn't reached).
 */
export function HostKnownHostnames({ hostId }: HostKnownHostnamesProps) {
  const { data, isLoading } = useHostCachedHostnames(hostId);
  const [expanded, setExpanded] = useState(false);

  if (isLoading || !data) {
    return null;
  }

  // Hide the panel entirely when the host has no cache row.
  // A row with an empty hostname list (source=manual + no_results) is
  // still shown so operators see their "explicitly nothing" markers.
  if (data.source === null) {
    return null;
  }

  const count = data.hostnames.length;
  const isManual = data.source === "manual";

  return (
    <div className="rounded-md border border-border/40 bg-card/40">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm"
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
        <Globe className="h-4 w-4 text-muted-foreground" />
        <span className="font-emphasis text-foreground">
          Known Hostnames ({count})
        </span>
        <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          {isManual && (
            <span className="rounded-sm bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-emphasis uppercase tracking-wider text-amber-300">
              Manual
            </span>
          )}
          <span>{data.source ?? "—"}</span>
          {data.queried_at && (
            <span title={new Date(data.queried_at).toLocaleString()}>
              cached {new Date(data.queried_at).toLocaleDateString()}
            </span>
          )}
        </span>
      </button>
      {expanded && (
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
                {data.hostnames.map((hostname) => (
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
    </div>
  );
}
