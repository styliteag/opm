import { Link } from "@tanstack/react-router";
import { AlertTriangle, ServerOff } from "lucide-react";

import type { FailedNetworkScan } from "@/features/home/lib/homeQueue";

interface ProblemBannersProps {
  offlineScanners: string[];
  failedScans: FailedNetworkScan[];
}

const BANNER =
  "flex items-start gap-2 rounded-md border border-orange-500/20 bg-orange-500/10 px-3 py-2 text-sm text-orange-400";

/** Scanner / scan problems — rendered only when something is actually wrong. */
export function ProblemBanners({ offlineScanners, failedScans }: ProblemBannersProps) {
  if (offlineScanners.length === 0 && failedScans.length === 0) return null;
  return (
    <div className="space-y-2">
      {offlineScanners.length > 0 && (
        <div role="alert" className={BANNER}>
          <ServerOff className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {offlineScanners.length === 1
              ? "1 scanner is offline"
              : `${offlineScanners.length} scanners are offline`}
            : {offlineScanners.join(", ")}.{" "}
            <Link to="/settings/scanners" className="underline underline-offset-2">
              Check scanners
            </Link>
          </span>
        </div>
      )}
      {failedScans.map((f) => (
        <div key={f.networkId} role="alert" className={BANNER}>
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Latest scan of{" "}
            <Link
              to="/networks/$networkId"
              params={{ networkId: String(f.networkId) }}
              className="underline underline-offset-2"
            >
              {f.name}
            </Link>{" "}
            failed
            {f.error ? `: ${f.error}` : "."}{" "}
            <Link
              to="/scans/$scanId"
              params={{ scanId: String(f.scanId) }}
              className="underline underline-offset-2"
            >
              View scan
            </Link>
          </span>
        </div>
      ))}
    </div>
  );
}
