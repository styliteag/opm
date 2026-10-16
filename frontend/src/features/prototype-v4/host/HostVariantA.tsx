// PROTOTYPE (UI v4) — Variant A "Port table + expand": the planned shape. One table,
// Why column, findings collapsed under each port; info findings folded away.
import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { cn, formatRelativeTime } from "@/lib/utils";

import { findingsByPort, isImportant, portStatus, portWhy } from "../protoData";
import { ExpectedButton, SnoozeButton } from "../PrototypeActions";
import { FindingRow, HostHeader, PortStatusPill } from "./HostShared";
import type { HostData } from "./types";

export function HostVariantA({ data }: { data: HostData }) {
  const byPort = findingsByPort(data.vulns);
  const [open, setOpen] = useState<number | null>(null);
  const [advanced, setAdvanced] = useState(false);

  return (
    <div className="space-y-6 pb-24">
      <HostHeader data={data} variant="A" />

      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-card text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="w-8" />
              <th className="px-3 py-2">Port</th>
              <th className="px-3 py-2">Service</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Why</th>
              <th className="px-3 py-2">Findings</th>
              <th className="px-3 py-2 text-right" />
            </tr>
          </thead>
          <tbody>
            {data.ports.map((p) => {
              const findings = byPort.get(p.port) ?? [];
              const important = findings.filter((f) => isImportant(f.severity_label));
              const status = portStatus(p);
              const isOpen = open === p.port;
              return (
                <Fragment key={p.id}>
                  <tr
                    className={cn(
                      "border-t border-border",
                      (status === "new" || status === "review") && "bg-orange-500/[0.03]",
                    )}
                  >
                    <td className="pl-2">
                      {findings.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setOpen(isOpen ? null : p.port)}
                          className="p-1 text-muted-foreground"
                        >
                          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </button>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono">{p.port}</td>
                    <td className="px-3 py-2">{p.service_guess ?? "unknown"}</td>
                    <td className="px-3 py-2">
                      <PortStatusPill port={p} />
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{portWhy(p) ?? "—"}</td>
                    <td className="px-3 py-2 text-xs">
                      {important.length > 0 ? (
                        <span className="text-orange-400">{important.length} important</span>
                      ) : findings.length > 0 ? (
                        <span className="text-muted-foreground">{findings.length} info</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {(status === "new" || status === "review") && (
                        <div className="inline-flex gap-2">
                          <ExpectedButton target={`${p.ip}:${p.port}`} />
                          <SnoozeButton target={`${p.ip}:${p.port}`} />
                        </div>
                      )}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="border-t border-border bg-card/50">
                      <td />
                      <td colSpan={6} className="px-3 py-2">
                        <div className="divide-y divide-border">
                          {[...important, ...findings.filter((f) => !isImportant(f.severity_label))]
                            .slice(0, 8)
                            .map((f) => (
                              <FindingRow key={f.id} v={f} />
                            ))}
                        </div>
                        {findings.length > 8 && (
                          <p className="pt-1 text-xs text-muted-foreground">
                            + {findings.length - 8} more informational
                          </p>
                        )}
                        <p className="pt-2 text-xs text-muted-foreground">
                          Banner: {p.banner ?? "—"} · first seen {formatRelativeTime(p.first_seen_at)}
                        </p>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <button
        type="button"
        onClick={() => setAdvanced(!advanced)}
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        {advanced ? "Hide" : "Show"} advanced (scans, hostnames, custom scan, raw IDs)
      </button>
      {advanced && (
        <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
          Advanced section placeholder — last scan:{" "}
          {data.lastScan ? `#${data.lastScan.id} (${data.lastScan.status})` : "none"} ·{" "}
          {data.vulns.length} raw findings with finding IDs.
        </div>
      )}
    </div>
  );
}
