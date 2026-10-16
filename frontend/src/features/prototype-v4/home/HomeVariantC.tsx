// PROTOTYPE (UI v4) — Variant C "One at a time": a single big decision card per
// host:port with a plain-language question, Why quick picks, and a progress counter.
// Upcoming items as a thin list on the left, status summary on the right.
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Check, Clock, SkipForward } from "lucide-react";

import { SeverityBadge } from "@/components/data-display/SeverityBadge";
import { Button } from "@/components/ui/button";
import { cn, formatRelativeTime } from "@/lib/utils";

import { effectiveSeverity, plainTitle, stubAction } from "../protoData";
import { OfflineBanner, StatusDot, WhyPicker } from "./HomeShared";
import type { HomeData } from "./types";

export function HomeVariantC({ data }: { data: HomeData }) {
  const { groups, findings, networks, offlineScanners } = data;
  const [index, setIndex] = useState(0);
  const [done, setDone] = useState<string[]>([]);
  const remaining = groups.filter((g) => !done.includes(g.key));
  const current = remaining[Math.min(index, remaining.length - 1)];

  const decide = (label: string) => {
    if (!current) return;
    stubAction(`${label}: ${current.key}`);
    setDone([...done, current.key]);
  };

  return (
    <div className="grid grid-cols-[180px_minmax(0,1fr)_200px] gap-6 pb-24">
      <aside className="space-y-1">
        <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
          Up next ({remaining.length})
        </p>
        {remaining.map((g, i) => (
          <button
            key={g.key}
            type="button"
            onClick={() => setIndex(i)}
            className={cn(
              "block w-full truncate rounded px-2 py-1 text-left font-mono text-xs",
              g === current ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/50",
            )}
          >
            {g.ip}:{g.port}
          </button>
        ))}
      </aside>

      <main className="min-w-0 space-y-6">
        <OfflineBanner names={offlineScanners} />
        <p className="text-sm text-muted-foreground">
          {done.length} of {groups.length} decided
        </p>
        <div className="h-1 overflow-hidden rounded bg-muted">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${groups.length ? (done.length / groups.length) * 100 : 100}%` }}
          />
        </div>

        {current ? (
          <div className="space-y-6 rounded-xl border border-border bg-card p-8">
            <div className="flex items-center gap-2">
              <SeverityBadge severity={current.severity} />
              <span className="text-xs text-muted-foreground">
                first seen {formatRelativeTime(current.newestAt)}
              </span>
            </div>
            <h1 className="text-3xl font-strong tracking-tight">
              Port <span className="font-mono">{current.port}</span> is newly open on{" "}
              {current.hostId ? (
                <Link
                  to="/hosts/$hostId"
                  params={{ hostId: String(current.hostId) }}
                  search={{ variant: "C" } as never}
                  className="underline decoration-muted-foreground/40 underline-offset-4"
                >
                  {current.hostname ?? current.ip}
                </Link>
              ) : (
                current.ip
              )}
            </h1>
            <p className="text-muted-foreground">
              {current.ip} · seen in{" "}
              {current.networks.length > 1
                ? `${current.networks.length} networks (${current.networks.join(", ")})`
                : (current.networks[0] ?? "no network")}
            </p>
            <div className="space-y-2">
              <p className="text-sm font-emphasis">Is this supposed to be open? Why?</p>
              <WhyPicker />
            </div>
            <div className="flex gap-3">
              <Button size="lg" onClick={() => decide("Expected (this host)")}>
                <Check className="h-4 w-4" /> Yes, expected
              </Button>
              <Button size="lg" variant="outline" onClick={() => decide("Snooze")}>
                <Clock className="h-4 w-4" /> Snooze
              </Button>
              <Button
                size="lg"
                variant="ghost"
                onClick={() => setIndex((index + 1) % Math.max(remaining.length, 1))}
              >
                <SkipForward className="h-4 w-4" /> Skip
              </Button>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card p-8 text-center">
            <h1 className="text-2xl font-strong">Every new port is decided.</h1>
          </div>
        )}
      </main>

      <aside className="min-w-0 space-y-6">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Networks</p>
          {networks.map((n) => (
            <div key={n.network_id} className="flex items-center gap-2 text-sm">
              <StatusDot status={n.status} />
              <span className="truncate">{n.name}</span>
            </div>
          ))}
        </div>
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Important findings
          </p>
          {findings.slice(0, 5).map((f) => (
            <div key={f.id} className="flex items-start gap-2 text-sm">
              <SeverityBadge severity={effectiveSeverity(f)} />
              <span className="line-clamp-2">{plainTitle(f)}</span>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}
