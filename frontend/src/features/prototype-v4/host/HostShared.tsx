// PROTOTYPE (UI v4) — pieces reused by Host variants.
import { Link } from "@tanstack/react-router";
import { ArrowLeft, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { EnrichedHostPort, Vulnerability } from "@/lib/types";
import { cn } from "@/lib/utils";

import {
  PORT_STATUS_CLASS,
  PORT_STATUS_LABEL,
  TOOL_LABEL,
  isImportant,
  portStatus,
  stubAction,
  vulnSevClass,
} from "../protoData";
import type { HostData } from "./types";

export function PortStatusPill({ port }: { port: EnrichedHostPort }) {
  const s = portStatus(port);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-emphasis",
        PORT_STATUS_CLASS[s],
      )}
    >
      {PORT_STATUS_LABEL[s]}
    </span>
  );
}

export function FindingRow({ v }: { v: Vulnerability }) {
  return (
    <div className="flex items-start gap-3 py-2">
      <span
        className={cn(
          "mt-0.5 inline-flex shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-emphasis uppercase",
          vulnSevClass(v.severity_label),
        )}
      >
        {v.severity_label}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm">{v.name}</p>
        <p className="text-xs text-muted-foreground">
          {TOOL_LABEL[v.source] ?? v.source}
          {v.cve_ids.length > 0 && ` · ${v.cve_ids.slice(0, 3).join(", ")}`}
        </p>
      </div>
      {isImportant(v.severity_label) && (
        <button
          type="button"
          onClick={() => stubAction(`Accept risk: ${v.name}`)}
          className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
        >
          Accept risk
        </button>
      )}
    </div>
  );
}

export function HostHeader({ data, variant }: { data: HostData; variant: string }) {
  const { host, ports, vulns, networks } = data;
  const toReview = ports.filter((p) => ["new", "review"].includes(portStatus(p))).length;
  const important = vulns.filter((v) => isImportant(v.severity_label)).length;
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        <Link
          to="/hosts"
          title={`variant ${variant}`}
          className="mt-1 rounded-md p-1 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-strong tracking-tight">
            {host.hostname ?? host.ip}
          </h1>
          <p className="font-mono text-sm text-muted-foreground">
            {host.ip} · {networks.map((n) => n.name).join(", ")}
          </p>
          <p className="mt-1 text-sm">
            <span className={toReview ? "text-orange-400" : "text-emerald-400"}>
              {toReview ? `${toReview} port${toReview > 1 ? "s" : ""} to review` : "All ports explained"}
            </span>
            <span className="text-muted-foreground">
              {" "}
              · {important} important finding{important === 1 ? "" : "s"}
            </span>
          </p>
        </div>
      </div>
      <Button variant="outline" onClick={() => stubAction("Scan again")}>
        <RefreshCw className="h-4 w-4" /> Scan again
      </Button>
    </div>
  );
}
