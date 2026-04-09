import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import type { Vulnerability } from "@/lib/types";
import { useVulnerabilities } from "@/features/scans/hooks/useVulnerabilities";

const SEVERITY_STYLES: Record<string, string> = {
  critical: "bg-red-500/10 text-red-400 border-red-500/20",
  high: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  medium: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  low: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  info: "bg-[rgba(255,255,255,0.05)] text-quaternary border-[rgba(255,255,255,0.08)]",
};

function VulnSeverityBadge({ label }: { label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-emphasis uppercase",
        SEVERITY_STYLES[label] ?? SEVERITY_STYLES.info,
      )}
    >
      {label}
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
          <span key={label} className="flex items-center gap-1.5 text-sm text-secondary">
            <VulnSeverityBadge label={label} />
            <span>{counts[label]}</span>
          </span>
        ) : null,
      )}
    </div>
  );
}

function VulnRow({ vuln }: { vuln: Vulnerability }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr
        className="border-b border-[rgba(255,255,255,0.05)] hover:bg-[rgba(255,255,255,0.02)] cursor-pointer"
        onClick={() => setExpanded((p) => !p)}
      >
        <td className="px-3 py-2 w-8">
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-quaternary" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-quaternary" />
          )}
        </td>
        <td className="px-3 py-2">
          <VulnSeverityBadge label={vuln.severity_label} />
        </td>
        <td className="px-3 py-2 text-xs text-tertiary tabular-nums">
          {vuln.severity.toFixed(1)}
        </td>
        <td className="px-3 py-2 text-sm text-primary">{vuln.name}</td>
        <td className="px-3 py-2 text-xs text-secondary tabular-nums">
          {vuln.ip}
          {vuln.port != null ? `:${vuln.port}` : ""}
        </td>
        <td className="px-3 py-2 text-xs text-tertiary">
          {vuln.cve_ids.length > 0
            ? vuln.cve_ids.slice(0, 3).join(", ") +
              (vuln.cve_ids.length > 3 ? ` +${vuln.cve_ids.length - 3}` : "")
            : "—"}
        </td>
        <td className="px-3 py-2 text-xs text-quaternary tabular-nums">
          {vuln.qod != null ? `${vuln.qod}%` : "—"}
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-[rgba(255,255,255,0.05)]">
          <td />
          <td colSpan={6} className="px-3 py-3">
            <div className="space-y-2 text-sm">
              {vuln.description && (
                <div>
                  <span className="text-quaternary text-xs uppercase">Description</span>
                  <p className="text-secondary mt-0.5 whitespace-pre-line">
                    {vuln.description}
                  </p>
                </div>
              )}
              {vuln.solution && (
                <div>
                  <span className="text-quaternary text-xs uppercase">
                    Solution
                    {vuln.solution_type ? ` (${vuln.solution_type})` : ""}
                  </span>
                  <p className="text-secondary mt-0.5 whitespace-pre-line">
                    {vuln.solution}
                  </p>
                </div>
              )}
              {vuln.cve_ids.length > 0 && (
                <div>
                  <span className="text-quaternary text-xs uppercase">CVEs</span>
                  <p className="text-secondary mt-0.5">{vuln.cve_ids.join(", ")}</p>
                </div>
              )}
              <div className="text-xs text-quaternary">
                OID: {vuln.oid}
                {vuln.cvss_base_vector ? ` | CVSS: ${vuln.cvss_base_vector}` : ""}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export function VulnerabilitiesTable({ scanId }: { scanId: number }) {
  const { data, isLoading } = useVulnerabilities(scanId);

  if (isLoading) {
    return (
      <div className="text-sm text-quaternary py-4">Loading vulnerabilities...</div>
    );
  }

  if (!data || data.total === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-emphasis text-primary">
          Vulnerabilities ({data.total})
        </h3>
        <SeveritySummary vulnerabilities={data.results} />
      </div>
      <div className="rounded-lg border border-[rgba(255,255,255,0.05)] bg-[rgba(255,255,255,0.02)] overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-[rgba(255,255,255,0.08)] text-xs text-quaternary uppercase">
              <th className="px-3 py-2 w-8" />
              <th className="px-3 py-2">Severity</th>
              <th className="px-3 py-2">CVSS</th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Target</th>
              <th className="px-3 py-2">CVEs</th>
              <th className="px-3 py-2">QoD</th>
            </tr>
          </thead>
          <tbody>
            {data.results.map((vuln) => (
              <VulnRow key={vuln.id} vuln={vuln} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
