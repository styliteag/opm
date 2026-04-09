import { useId, useState } from "react";

import { LoadingState } from "@/components/data-display/LoadingState";
import { SeverityBadge } from "@/components/data-display/SeverityBadge";
import type { NseResult, Vulnerability, VulnerabilitySeverity } from "@/lib/types";
import { cn, formatRelativeTime } from "@/lib/utils";

const GVM_SEVERITY_STYLES: Record<VulnerabilitySeverity, string> = {
  critical: "bg-red-500/10 text-red-400 border-red-500/20",
  high: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  medium: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  low: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  info: "bg-accent text-muted-foreground border-border",
};

function GvmSeverityBadge({ label }: { label: VulnerabilitySeverity }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-emphasis uppercase tracking-wide",
        GVM_SEVERITY_STYLES[label],
      )}
    >
      {label}
    </span>
  );
}

function GvmVulnRow({ vuln }: { vuln: Vulnerability }) {
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();

  return (
    <div className="px-5 py-4">
      <button
        type="button"
        className="flex w-full items-start justify-between gap-4 rounded-md text-left transition-colors hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-expanded={expanded}
        aria-controls={detailsId}
        onClick={() => setExpanded((p) => !p)}
      >
        <div className="flex items-center gap-3">
          <GvmSeverityBadge label={vuln.severity_label} />
          <div>
            <p className="text-sm font-emphasis text-foreground">{vuln.name}</p>
            <p className="text-xs text-muted-foreground">
              {vuln.port != null
                ? `Port ${vuln.port}/${vuln.protocol}`
                : "Host-level"}
              {" · CVSS "}
              {vuln.severity.toFixed(1)}
              {vuln.qod != null && ` · QoD ${vuln.qod}%`}
              {" · "}
              {formatRelativeTime(vuln.created_at)}
            </p>
          </div>
        </div>
        {vuln.cve_ids.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {vuln.cve_ids.slice(0, 5).map((cve) => (
              <span
                key={cve}
                className="rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-mono text-destructive"
              >
                {cve}
              </span>
            ))}
            {vuln.cve_ids.length > 5 && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
                +{vuln.cve_ids.length - 5}
              </span>
            )}
          </div>
        )}
      </button>
      {expanded && (
        <div id={detailsId} className="mt-3 space-y-2 text-sm">
          {vuln.description && (
            <div>
              <span className="text-muted-foreground text-xs uppercase">
                Description
              </span>
              <p className="mt-0.5 whitespace-pre-line text-secondary-foreground">
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
              <p className="mt-0.5 whitespace-pre-line text-secondary-foreground">
                {vuln.solution}
              </p>
            </div>
          )}
          {vuln.cvss_base_vector && (
            <p className="text-xs text-muted-foreground">
              CVSS: {vuln.cvss_base_vector}
            </p>
          )}
          <p className="text-xs text-muted-foreground">OID: {vuln.oid}</p>
        </div>
      )}
    </div>
  );
}

export function HostVulnerabilitiesPanel({
  nseResults,
  gvmResults,
  isLoading,
}: {
  nseResults: NseResult[];
  gvmResults: Vulnerability[];
  isLoading: boolean;
}) {
  if (isLoading) {
    return <LoadingState rows={4} />;
  }

  if (nseResults.length === 0 && gvmResults.length === 0) {
    return (
      <div className="rounded-lg border border-border p-8 text-center text-sm text-muted-foreground">
        No vulnerabilities detected
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {gvmResults.length > 0 && (
        <div>
          <h4 className="mb-3 text-sm font-emphasis text-foreground">
            GVM Findings ({gvmResults.length})
          </h4>
          <div className="rounded-lg border border-border">
            <div className="divide-y divide-border">
              {gvmResults.map((vuln) => (
                <GvmVulnRow key={vuln.id} vuln={vuln} />
              ))}
            </div>
          </div>
        </div>
      )}

      {nseResults.length > 0 && (
        <div>
          <h4 className="mb-3 text-sm font-emphasis text-foreground">
            NSE Findings ({nseResults.length})
          </h4>
          <div className="rounded-lg border border-border">
            <div className="divide-y divide-border">
              {nseResults.map((vuln) => (
                <div key={vuln.id} className="px-5 py-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <SeverityBadge severity={vuln.severity} />
                      <div>
                        <p className="text-sm font-emphasis text-foreground">
                          {vuln.script_name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Port {vuln.port}/{vuln.protocol} ·{" "}
                          {formatRelativeTime(vuln.created_at)}
                        </p>
                      </div>
                    </div>
                    {vuln.cve_ids.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {vuln.cve_ids.map((cve) => (
                          <span
                            key={cve}
                            className="rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-mono text-destructive"
                          >
                            {cve}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  {vuln.script_output && (
                    <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded bg-accent/50 p-3 text-xs text-muted-foreground">
                      {vuln.script_output}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
