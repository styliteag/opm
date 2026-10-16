// PROTOTYPE (UI v4) — Variant C "Needs you first": no table up front. Section 1 = ports
// that need a decision as large cards; section 2 = important findings; section 3 = a
// compact line of everything already explained; info findings only as a count.
import { useState } from "react";

import { formatRelativeTime } from "@/lib/utils";

import { findingsByPort, isImportant, portStatus, portWhy } from "../protoData";
import { ExpectedButton, SnoozeButton, WhyPicker } from "../PrototypeActions";
import { FindingRow, HostHeader, PortStatusPill } from "./HostShared";
import type { HostData } from "./types";

export function HostVariantC({ data }: { data: HostData }) {
  const byPort = findingsByPort(data.vulns);
  const pending = data.ports.filter((p) => ["new", "review"].includes(portStatus(p)));
  const settled = data.ports.filter((p) => !["new", "review"].includes(portStatus(p)));
  const important = data.vulns.filter((v) => isImportant(v.severity_label));
  const infoCount = data.vulns.length - important.length;
  const [showSettled, setShowSettled] = useState(false);

  return (
    <div className="mx-auto max-w-4xl space-y-8 pb-24">
      <HostHeader data={data} variant="C" />

      <section className="space-y-3">
        <h2 className="text-sm font-strong">Needs your decision</h2>
        {pending.length === 0 && (
          <p className="rounded-lg border border-border bg-card p-4 text-sm text-emerald-400">
            Every open port on this host has a reason.
          </p>
        )}
        {pending.map((p) => (
          <div key={p.id} className="space-y-3 rounded-lg border border-orange-500/20 bg-card p-5">
            <div className="flex items-center justify-between">
              <p className="text-lg">
                <span className="font-mono font-strong">{p.port}</span>{" "}
                <span className="text-muted-foreground">{p.service_guess ?? "unknown service"}</span>
              </p>
              <PortStatusPill port={p} />
            </div>
            <p className="text-xs text-muted-foreground">
              {p.banner ?? "no banner"} · first seen {formatRelativeTime(p.first_seen_at)}
              {(byPort.get(p.port) ?? []).some((f) => isImportant(f.severity_label)) &&
                " · has important findings"}
            </p>
            <WhyPicker />
            <div className="flex gap-2">
              <ExpectedButton target={`${p.ip}:${p.port}`} />
              <SnoozeButton target={`${p.ip}:${p.port}`} />
            </div>
          </div>
        ))}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-strong">Important findings ({important.length})</h2>
        <div className="divide-y divide-border rounded-lg border border-border bg-card px-4">
          {important.length === 0 && (
            <p className="py-3 text-sm text-muted-foreground">Nothing high or critical.</p>
          )}
          {important.map((v) => (
            <div key={v.id} className="flex items-center gap-3">
              <span className="w-12 font-mono text-xs text-muted-foreground">
                {v.port != null ? `:${v.port}` : "host"}
              </span>
              <div className="flex-1">
                <FindingRow v={v} />
              </div>
            </div>
          ))}
        </div>
        {infoCount > 0 && (
          <p className="text-xs text-muted-foreground">
            {infoCount} informational findings hidden (technology detection, etc.)
          </p>
        )}
      </section>

      <section className="space-y-2">
        <button
          type="button"
          onClick={() => setShowSettled(!showSettled)}
          className="text-sm font-strong hover:underline"
        >
          Already explained ({settled.length}) {showSettled ? "▾" : "▸"}
        </button>
        {!showSettled ? (
          <p className="font-mono text-sm text-muted-foreground">
            {settled.map((p) => p.port).join(" · ") || "—"}
          </p>
        ) : (
          <div className="divide-y divide-border rounded-lg border border-border">
            {settled.map((p) => (
              <div key={p.id} className="flex items-center gap-4 px-4 py-2 text-sm">
                <span className="w-14 font-mono">{p.port}</span>
                <span className="w-28 text-muted-foreground">{p.service_guess ?? "—"}</span>
                <PortStatusPill port={p} />
                <span className="text-muted-foreground">{portWhy(p) ?? "—"}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
