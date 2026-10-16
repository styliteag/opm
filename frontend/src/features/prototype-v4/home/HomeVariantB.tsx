// PROTOTYPE (UI v4) — Variant B "Board by network": one column per network with its
// traffic light; new ports listed inside their network; findings in a right rail.
import { Link } from "@tanstack/react-router";
import { Check, Clock } from "lucide-react";

import { SeverityBadge } from "@/components/data-display/SeverityBadge";
import { cn } from "@/lib/utils";

import { TOOL_LABEL, effectiveSeverity, plainTitle, stubAction } from "../protoData";
import type { PortGroup } from "../protoData";
import { OfflineBanner, StatusDot } from "./HomeShared";
import type { HomeData } from "./types";

function byNetwork(groups: PortGroup[]): Map<string, PortGroup[]> {
  const out = new Map<string, PortGroup[]>();
  for (const g of groups) {
    for (const n of g.networks.length ? g.networks : ["No network"]) {
      out.set(n, [...(out.get(n) ?? []), g]);
    }
  }
  return out;
}

export function HomeVariantB({ data }: { data: HomeData }) {
  const { groups, findings, networks, offlineScanners } = data;
  const columns = byNetwork(groups);
  const quiet = networks.filter((n) => !columns.has(n.name));

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-strong">Networks</h1>
        <span className="text-sm text-muted-foreground">
          {groups.length} ports to review across {columns.size} networks
        </span>
      </div>
      <OfflineBanner names={offlineScanners} />

      <div className="grid grid-cols-[minmax(0,1fr)_300px] gap-4">
        <div className="flex gap-3 overflow-x-auto pb-2">
          {[...columns.entries()].map(([name, items]) => {
            const status = networks.find((n) => n.name === name)?.status ?? "amber";
            return (
              <div
                key={name}
                className="w-72 shrink-0 rounded-lg border border-border bg-card"
              >
                <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                  <StatusDot status={status} />
                  <span className="truncate text-sm font-emphasis">{name}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{items.length}</span>
                </div>
                <div className="space-y-2 p-2">
                  {items.map((g) => (
                    <div
                      key={g.key}
                      className={cn(
                        "rounded-md border border-border p-2",
                        g.severity === "critical" && "border-red-500/30",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-sm">:{g.port}</span>
                        <SeverityBadge severity={g.severity} />
                      </div>
                      <Link
                        to="/hosts/$hostId"
                        params={{ hostId: String(g.hostId ?? 0) }}
                        search={{ variant: "B" } as never}
                        className="block truncate text-xs text-muted-foreground hover:text-foreground"
                      >
                        {g.hostname ?? g.ip}
                      </Link>
                      <div className="mt-2 flex gap-1">
                        <button
                          type="button"
                          onClick={() => stubAction(`Expected: ${g.key}`)}
                          className="flex flex-1 items-center justify-center gap-1 rounded bg-primary/15 py-1 text-xs hover:bg-primary/25"
                        >
                          <Check className="h-3 w-3" /> Expected
                        </button>
                        <button
                          type="button"
                          onClick={() => stubAction(`Snooze: ${g.key}`)}
                          className="flex items-center justify-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
                        >
                          <Clock className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          {quiet.length > 0 && (
            <div className="w-56 shrink-0 space-y-2 rounded-lg border border-dashed border-border p-3">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                Nothing new
              </p>
              {quiet.map((n) => (
                <div key={n.network_id} className="flex items-center gap-2 text-sm">
                  <StatusDot status={n.status} /> {n.name}
                </div>
              ))}
            </div>
          )}
        </div>

        <aside className="space-y-2 rounded-lg border border-border bg-card p-3">
          <h2 className="text-sm font-strong">Important findings ({findings.length})</h2>
          {findings.length === 0 && (
            <p className="text-sm text-muted-foreground">Nothing high or critical.</p>
          )}
          {findings.map((f) => (
            <div key={f.id} className="space-y-1 border-t border-border pt-2">
              <div className="flex items-center gap-2">
                <SeverityBadge severity={effectiveSeverity(f)} />
                <span className="text-xs text-muted-foreground">
                  {TOOL_LABEL[f.source] ?? f.source}
                </span>
              </div>
              <p className="line-clamp-2 text-sm">{plainTitle(f)}</p>
              <p className="font-mono text-xs text-muted-foreground">
                {f.ip}
                {f.port != null && `:${f.port}`}
              </p>
            </div>
          ))}
        </aside>
      </div>
    </div>
  );
}
