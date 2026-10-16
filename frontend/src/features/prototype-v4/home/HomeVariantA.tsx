// PROTOTYPE (UI v4) — Variant A "Queue list": one column, grouped host:port rows with
// inline Expected/Snooze, important findings below, network strip at the bottom.
import { Link } from "@tanstack/react-router";

import { SeverityBadge } from "@/components/data-display/SeverityBadge";
import { formatRelativeTime } from "@/lib/utils";

import { TOOL_LABEL, effectiveSeverity, plainTitle, stubAction } from "../protoData";
import { ExpectedButton, OfflineBanner, SnoozeButton, StatusDot } from "./HomeShared";
import type { HomeData } from "./types";

export function HomeVariantA({ data }: { data: HomeData }) {
  const { groups, findings, networks, offlineScanners, rawPortAlertCount } = data;
  return (
    <div className="mx-auto max-w-5xl space-y-8 pb-24">
      <header className="space-y-1">
        <h1 className="text-2xl font-strong tracking-tight">
          {groups.length === 0
            ? "All open ports are explained"
            : `${groups.length} new open port${groups.length > 1 ? "s" : ""} to review`}
        </h1>
        <p className="text-sm text-muted-foreground">
          {findings.length} important finding{findings.length === 1 ? "" : "s"} ·{" "}
          {rawPortAlertCount} raw alerts grouped into {groups.length} host:port rows
        </p>
      </header>

      <OfflineBanner names={offlineScanners} />

      <section className="rounded-lg border border-border bg-card">
        <div className="grid grid-cols-[1fr_auto] items-center gap-4 border-b border-border px-4 py-2 text-xs uppercase tracking-wider text-muted-foreground">
          <span>Port</span>
          <span>Is this okay?</span>
        </div>
        {groups.map((g) => (
          <div
            key={g.key}
            className="grid grid-cols-[1fr_auto] items-center gap-4 border-b border-border px-4 py-3 last:border-b-0 hover:bg-accent/40"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <SeverityBadge severity={g.severity} />
                {g.hostId ? (
                  <Link
                    to="/hosts/$hostId"
                    params={{ hostId: String(g.hostId) }}
                    search={{ variant: "A" } as never}
                    className="font-mono text-sm font-emphasis hover:underline"
                  >
                    {g.ip}:{g.port}
                  </Link>
                ) : (
                  <span className="font-mono text-sm font-emphasis">
                    {g.ip}:{g.port}
                  </span>
                )}
                {g.hostname && (
                  <span className="truncate text-sm text-muted-foreground">{g.hostname}</span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {g.networks.length > 1
                  ? `in ${g.networks.length} networks`
                  : (g.networks[0] ?? "—")}{" "}
                · first seen {formatRelativeTime(g.newestAt)}
                {g.why && <> · Why: {g.why}</>}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <ExpectedButton target={g.key} />
              <SnoozeButton target={g.key} />
            </div>
          </div>
        ))}
      </section>

      {findings.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-strong">Important findings</h2>
          <div className="rounded-lg border border-border bg-card">
            {findings.map((f) => (
              <div
                key={f.id}
                className="flex items-center justify-between gap-4 border-b border-border px-4 py-3 last:border-b-0"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <SeverityBadge severity={effectiveSeverity(f)} />
                    <span className="truncate text-sm">{plainTitle(f)}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {f.ip}
                    {f.port != null && `:${f.port}`} · {TOOL_LABEL[f.source] ?? f.source}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <SnoozeButton target={`finding #${f.id}`} />
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => stubAction(`Accept risk (reason required): #${f.id}`)}
                  >
                    Accept risk
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="flex flex-wrap gap-x-6 gap-y-2 border-t border-border pt-4 text-sm">
        {networks.map((n) => (
          <Link
            key={n.network_id}
            to="/networks/$networkId"
            params={{ networkId: String(n.network_id) }}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
          >
            <StatusDot status={n.status} />
            {n.name}
          </Link>
        ))}
      </section>
    </div>
  );
}
