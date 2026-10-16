import { Link } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";

import { activeScanLabel } from "@/features/scans/lib/activeScans";
import type { ScanListItem } from "@/lib/types";

interface ActiveScansStripProps {
  scans: ScanListItem[];
}

/** Scans that are queued or running — rendered only while there are any. */
export function ActiveScansStrip({ scans }: ActiveScansStripProps) {
  if (scans.length === 0) return null;
  return (
    <section aria-label="Scans in progress" className="rounded-md border border-border bg-card">
      <h2 className="flex items-center gap-2 border-b border-border px-3 py-2 text-xs font-emphasis uppercase tracking-wider text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Scans in progress ({scans.length})
      </h2>
      <ul className="divide-y divide-border">
        {scans.map((scan) => (
          <li key={scan.id} className="flex items-center gap-4 px-3 py-2 text-sm">
            <Link
              to="/scans/$scanId"
              params={{ scanId: String(scan.id) }}
              className="min-w-0 flex-1 truncate text-foreground hover:text-primary"
            >
              {scan.network_name}
              <span className="ml-2 text-xs text-muted-foreground">
                Scan #{scan.id} · {scan.scanner_name}
              </span>
            </Link>
            {scan.status === "running" && scan.progress_percent != null && (
              <div
                role="progressbar"
                aria-label={`${scan.network_name} progress`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(scan.progress_percent)}
                className="hidden h-1.5 w-32 overflow-hidden rounded-full bg-muted sm:block"
              >
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${Math.min(100, scan.progress_percent)}%` }}
                />
              </div>
            )}
            <span className="w-24 shrink-0 text-right text-xs text-muted-foreground">
              {activeScanLabel(scan)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
