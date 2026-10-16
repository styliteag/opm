// PROTOTYPE (UI v4) — Variant B "Split view": narrow port list on the left, everything
// about the selected port on the right (status, Why, decision, findings, history).
import { useState } from "react";

import { cn, formatRelativeTime } from "@/lib/utils";

import { PORT_STATUS_LABEL, findingsByPort, isImportant, portStatus, portWhy } from "../protoData";
import { ExpectedButton, SnoozeButton, WhyPicker } from "../PrototypeActions";
import { FindingRow, HostHeader, PortStatusPill } from "./HostShared";
import type { HostData } from "./types";

const STATUS_DOT: Record<string, string> = {
  new: "bg-orange-500",
  review: "bg-yellow-500",
  expected: "bg-emerald-500",
  snoozed: "bg-muted-foreground",
  critical: "bg-red-500",
};

export function HostVariantB({ data }: { data: HostData }) {
  const byPort = findingsByPort(data.vulns);
  const firstOpen =
    data.ports.find((p) => ["new", "review"].includes(portStatus(p))) ?? data.ports[0];
  const [selected, setSelected] = useState<number | undefined>(firstOpen?.port);
  const port = data.ports.find((p) => p.port === selected);
  const findings = port ? (byPort.get(port.port) ?? []) : [];
  const important = findings.filter((f) => isImportant(f.severity_label));
  const info = findings.filter((f) => !isImportant(f.severity_label));
  const [showInfo, setShowInfo] = useState(false);

  return (
    <div className="space-y-6 pb-24">
      <HostHeader data={data} variant="B" />
      <div className="grid min-h-[480px] grid-cols-[260px_1fr] overflow-hidden rounded-lg border border-border">
        <nav className="border-r border-border bg-card">
          {data.ports.map((p) => {
            const s = portStatus(p);
            const imp = (byPort.get(p.port) ?? []).some((f) => isImportant(f.severity_label));
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelected(p.port)}
                className={cn(
                  "flex w-full items-center gap-3 border-b border-border px-3 py-2.5 text-left",
                  p.port === selected ? "bg-accent" : "hover:bg-accent/50",
                )}
              >
                <span className={cn("h-2 w-2 rounded-full", STATUS_DOT[s])} />
                <span className="w-14 font-mono text-sm">{p.port}</span>
                <span className="flex-1 truncate text-xs text-muted-foreground">
                  {p.service_guess ?? "unknown"}
                </span>
                {imp && <span className="text-xs text-orange-400">!</span>}
                <span className="sr-only">{PORT_STATUS_LABEL[s]}</span>
              </button>
            );
          })}
        </nav>

        {port ? (
          <section className="space-y-6 p-6">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-mono text-xl font-strong">
                  {port.port}/{port.protocol}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {port.service_guess ?? "unknown service"} · {port.banner ?? "no banner"}
                </p>
              </div>
              <PortStatusPill port={port} />
            </div>

            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Why is it open?</p>
              <p className="text-sm">{portWhy(port) ?? "No reason recorded yet."}</p>
              {["new", "review"].includes(portStatus(port)) && (
                <div className="space-y-3 pt-1">
                  <WhyPicker />
                  <div className="flex gap-2">
                    <ExpectedButton target={`${port.ip}:${port.port}`} />
                    <SnoozeButton target={`${port.ip}:${port.port}`} />
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-1">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                Findings on this port
              </p>
              {important.length === 0 && (
                <p className="text-sm text-muted-foreground">Nothing important.</p>
              )}
              <div className="divide-y divide-border">
                {important.map((f) => (
                  <FindingRow key={f.id} v={f} />
                ))}
              </div>
              {info.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowInfo(!showInfo)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  {showInfo ? "Hide" : "Show"} {info.length} informational
                </button>
              )}
              {showInfo && (
                <div className="divide-y divide-border">
                  {info.map((f) => (
                    <FindingRow key={f.id} v={f} />
                  ))}
                </div>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              First seen {formatRelativeTime(port.first_seen_at)} · last seen{" "}
              {formatRelativeTime(port.last_seen_at)}
            </p>
          </section>
        ) : (
          <section className="p-6 text-sm text-muted-foreground">No open ports.</section>
        )}
      </div>
    </div>
  );
}
