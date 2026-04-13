import { AlertTriangle, Shield, XCircle } from "lucide-react";

const SEVERITY_STYLES: Record<string, string> = {
  critical: "bg-red-500/10 text-red-400 border-red-500/20",
  high: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  medium: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  low: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  info: "bg-accent text-muted-foreground border-border",
};

const SEVERITY_ORDER = ["critical", "high", "medium", "low", "info"];

interface NucleiSummaryCardProps {
  summary: {
    ran: boolean;
    findings_count: number;
    hosts_scanned: number;
    severity_counts: Record<string, number>;
    status?: string;
  };
  scanStatus?: string;
}

export function NucleiSummaryCard({ summary, scanStatus }: NucleiSummaryCardProps) {
  if (!summary.ran) return null;

  const isActive = scanStatus === "running" || scanStatus === "planned";
  const isTimeout = summary.status === "timeout";
  const isError = summary.status === "error";

  const hasSeverities = Object.keys(summary.severity_counts).length > 0;

  const borderColor = isTimeout
    ? "border-yellow-500/20"
    : isError
      ? "border-red-500/20"
      : "border-teal-500/20";
  const bgColor = isTimeout
    ? "bg-yellow-500/5"
    : isError
      ? "bg-red-500/5"
      : "bg-teal-500/5";

  return (
    <div className={`rounded-lg border ${borderColor} ${bgColor} p-4`}>
      <div className="flex items-center gap-2 text-sm font-emphasis text-teal-300">
        <Shield className="h-4 w-4" />
        Nuclei Scan
      </div>

      {isTimeout && (
        <div className="mt-2 flex items-center gap-2 rounded-md border border-yellow-500/20 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-400">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          Timed out — results may be incomplete. Increase the nuclei timeout in network settings.
        </div>
      )}
      {isError && (
        <div className="mt-2 flex items-center gap-2 rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">
          <XCircle className="h-3.5 w-3.5 shrink-0" />
          Nuclei scan failed — check engine logs for details.
        </div>
      )}

      <div className="mt-3 flex items-baseline gap-6">
        <div>
          <p className="text-2xl font-strong text-foreground">
            {summary.findings_count}
          </p>
          <p className="text-xs text-muted-foreground">findings</p>
        </div>
        <div>
          <p className="text-2xl font-strong text-foreground">
            {summary.hosts_scanned}
          </p>
          <p className="text-xs text-muted-foreground">hosts scanned</p>
        </div>
      </div>
      {hasSeverities ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {SEVERITY_ORDER.filter((s) => summary.severity_counts[s]).map(
            (sev) => (
              <span
                key={sev}
                className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-emphasis uppercase tracking-wide ${SEVERITY_STYLES[sev] ?? ""}`}
              >
                {summary.severity_counts[sev]} {sev}
              </span>
            ),
          )}
        </div>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">
          {isActive ? "Scanning…" : isTimeout ? "No findings (timed out)" : "No findings"}
        </p>
      )}
    </div>
  );
}
