import { useState } from "react";
import { ChevronDown, ChevronRight, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SeverityRuleDialog } from "@/features/severity-rules/components/SeverityRuleDialog";
import { cn } from "@/lib/utils";
import type { Vulnerability } from "@/lib/types";
import { useVulnerabilities } from "@/features/scans/hooks/useVulnerabilities";

const SEVERITY_STYLES: Record<string, string> = {
  critical: "bg-red-500/10 text-red-400 border-red-500/20",
  high: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  medium: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  low: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  info: "bg-accent text-muted-foreground border-border",
};

const SOURCE_STYLES: Record<string, string> = {
  gvm: "bg-indigo-500/10 text-indigo-300 border-indigo-500/20",
  nuclei: "bg-teal-500/10 text-teal-300 border-teal-500/20",
  nse: "bg-fuchsia-500/10 text-fuchsia-300 border-fuchsia-500/20",
};

function VulnSeverityBadge({ label }: { label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-emphasis uppercase tracking-wide",
        SEVERITY_STYLES[label] ?? SEVERITY_STYLES.info,
      )}
    >
      {label}
    </span>
  );
}

function VulnSourceBadge({ source }: { source: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-emphasis uppercase tracking-wide",
        SOURCE_STYLES[source] ?? SOURCE_STYLES.gvm,
      )}
    >
      {source}
    </span>
  );
}

function SeveritySummary({ vulnerabilities }: { vulnerabilities: Vulnerability[] }) {
  const counts: Record<string, number> = {};
  for (const v of vulnerabilities) {
    counts[v.severity_label] = (counts[v.severity_label] ?? 0) + 1;
  }

  const order = ["critical", "high", "medium", "low", "info"];
  return (
    <div className="flex items-center gap-3">
      {order.map((label) =>
        counts[label] ? (
          <span key={label} className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <VulnSeverityBadge label={label} />
            <span>{counts[label]}</span>
          </span>
        ) : null,
      )}
    </div>
  );
}

function VulnRow({
  vuln,
  networkId,
  networkName,
}: {
  vuln: Vulnerability;
  networkId: number | null;
  networkName: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const [ruleOpen, setRuleOpen] = useState(false);

  return (
    <>
      <tr
        className="border-b border-border hover:bg-card cursor-pointer"
        onClick={() => setExpanded((p) => !p)}
      >
        <td className="px-3 py-2 w-8">
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </td>
        <td className="px-3 py-2">
          <VulnSeverityBadge label={vuln.severity_label} />
        </td>
        <td className="px-3 py-2 text-xs text-muted-foreground tabular-nums">
          {vuln.severity.toFixed(1)}
        </td>
        <td className="px-3 py-2 text-sm text-foreground">{vuln.name}</td>
        <td className="px-3 py-2">
          <VulnSourceBadge source={vuln.source} />
        </td>
        <td className="px-3 py-2 text-xs text-secondary-foreground tabular-nums">
          {vuln.ip}
          {vuln.port != null ? `:${vuln.port}` : ""}
        </td>
        <td className="px-3 py-2 text-xs text-muted-foreground">
          {vuln.cve_ids.length > 0
            ? vuln.cve_ids.slice(0, 3).join(", ") +
              (vuln.cve_ids.length > 3 ? ` +${vuln.cve_ids.length - 3}` : "")
            : "—"}
        </td>
        <td className="px-3 py-2 text-xs text-muted-foreground tabular-nums">
          {vuln.qod != null ? `${vuln.qod}%` : "—"}
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-border">
          <td />
          <td colSpan={7} className="px-3 py-3">
            <div className="space-y-2 text-sm">
              {vuln.description && (
                <div>
                  <span className="text-muted-foreground text-xs uppercase">Description</span>
                  <p className="text-secondary-foreground mt-0.5 whitespace-pre-line">
                    {vuln.description}
                  </p>
                </div>
              )}
              {vuln.solution && (
                <div>
                  <span className="text-muted-foreground text-xs uppercase">
                    Solution
                    {vuln.solution_type ? ` (${vuln.solution_type})` : ""}
                  </span>
                  <p className="text-secondary-foreground mt-0.5 whitespace-pre-line">
                    {vuln.solution}
                  </p>
                </div>
              )}
              {vuln.cve_ids.length > 0 && (
                <div>
                  <span className="text-muted-foreground text-xs uppercase">CVEs</span>
                  <p className="text-secondary-foreground mt-0.5">{vuln.cve_ids.join(", ")}</p>
                </div>
              )}
              <div className="text-xs text-muted-foreground">
                Source: {vuln.source.toUpperCase()} | OID: {vuln.oid}
                {vuln.cvss_base_vector ? ` | CVSS: ${vuln.cvss_base_vector}` : ""}
              </div>
              <div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={(e) => {
                    e.stopPropagation();
                    setRuleOpen(true);
                  }}
                >
                  <ShieldAlert className="mr-1 h-3.5 w-3.5" />
                  Change alert severity
                </Button>
              </div>
            </div>
          </td>
        </tr>
      )}
      {ruleOpen && (
        <tr className="hidden">
          <td>
            <SeverityRuleDialog
              open={ruleOpen}
              onClose={() => setRuleOpen(false)}
              oid={vuln.oid}
              findingName={vuln.name}
              nativeSeverity={vuln.severity_label}
              networkId={networkId}
              networkName={networkName}
            />
          </td>
        </tr>
      )}
    </>
  );
}

export function VulnerabilitiesTable({
  scanId,
  networkId,
  networkName,
}: {
  scanId: number;
  networkId: number | null;
  networkName: string | null;
}) {
  const { data, isLoading } = useVulnerabilities(scanId);

  if (isLoading) {
    return (
      <div className="text-sm text-muted-foreground py-4">Loading vulnerabilities...</div>
    );
  }

  if (!data || data.total === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-emphasis text-foreground">
          Vulnerabilities ({data.total})
        </h3>
        <SeveritySummary vulnerabilities={data.results} />
      </div>
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground uppercase">
              <th className="px-3 py-2 w-8" />
              <th className="px-3 py-2">Severity</th>
              <th className="px-3 py-2">CVSS</th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Source</th>
              <th className="px-3 py-2">Target</th>
              <th className="px-3 py-2">CVEs</th>
              <th className="px-3 py-2">QoD</th>
            </tr>
          </thead>
          <tbody>
            {data.results.map((vuln) => (
              <VulnRow
                key={vuln.id}
                vuln={vuln}
                networkId={networkId}
                networkName={networkName}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
