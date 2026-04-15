import { useMemo, useId, useState } from "react";
import { ShieldAlert } from "lucide-react";

import { LoadingState } from "@/components/data-display/LoadingState";
import { Button } from "@/components/ui/button";
import { SeverityRuleDialog } from "@/features/severity-rules/components/SeverityRuleDialog";
import type {
  Vulnerability,
  VulnerabilitySeverity,
  VulnerabilitySource,
} from "@/lib/types";
import { cn, formatRelativeTime } from "@/lib/utils";

const GVM_SEVERITY_STYLES: Record<VulnerabilitySeverity, string> = {
  critical: "bg-red-500/10 text-red-400 border-red-500/20",
  high: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  medium: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  low: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  info: "bg-accent text-muted-foreground border-border",
};

const SOURCE_STYLES: Record<VulnerabilitySource, { label: string; className: string }> = {
  gvm: {
    label: "GVM",
    className: "bg-indigo-500/10 text-indigo-300 border-indigo-500/20",
  },
  nuclei: {
    label: "Nuclei",
    className: "bg-teal-500/10 text-teal-300 border-teal-500/20",
  },
  nse: {
    label: "NSE",
    className: "bg-fuchsia-500/10 text-fuchsia-300 border-fuchsia-500/20",
  },
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

function SourceBadge({ source }: { source: VulnerabilitySource }) {
  const style = SOURCE_STYLES[source] ?? SOURCE_STYLES.gvm;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-emphasis uppercase tracking-wider",
        style.className,
      )}
    >
      {style.label}
    </span>
  );
}

function parseNucleiOid(oid: string): { templateId: string; matcher: string | null } {
  const lastColon = oid.lastIndexOf(":");
  if (lastColon <= 0) return { templateId: oid, matcher: null };
  return {
    templateId: oid.slice(0, lastColon),
    matcher: oid.slice(lastColon + 1),
  };
}

function NucleiVulnRow({ vuln }: { vuln: Vulnerability }) {
  const [expanded, setExpanded] = useState(true);
  const [ruleOpen, setRuleOpen] = useState(false);
  const detailsId = useId();
  const { templateId, matcher } = parseNucleiOid(vuln.oid);
  const target =
    vuln.port != null ? `${vuln.ip}:${vuln.port}/${vuln.protocol}` : vuln.ip;

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
              {target}
              {" · CVSS "}
              {vuln.severity.toFixed(1)}
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
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded bg-teal-500/10 px-1.5 py-0.5 font-mono text-teal-300">
              {templateId}
            </span>
            {matcher && (
              <span className="rounded bg-card px-1.5 py-0.5 font-mono text-muted-foreground">
                {matcher}
              </span>
            )}
          </div>
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
          <div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setRuleOpen(true)}
            >
              <ShieldAlert className="mr-1 h-3.5 w-3.5" />
              Change alert severity
            </Button>
          </div>
        </div>
      )}
      {ruleOpen && (
        <SeverityRuleDialog
          open={ruleOpen}
          onClose={() => setRuleOpen(false)}
          oid={vuln.oid}
          findingName={vuln.name}
          nativeSeverity={vuln.severity_label}
          networkId={null}
        />
      )}
    </div>
  );
}

function GvmVulnRow({ vuln }: { vuln: Vulnerability }) {
  const [expanded, setExpanded] = useState(false);
  const [ruleOpen, setRuleOpen] = useState(false);
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
          <SourceBadge source={vuln.source ?? "gvm"} />
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
          <div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setRuleOpen(true)}
            >
              <ShieldAlert className="mr-1 h-3.5 w-3.5" />
              Change alert severity
            </Button>
          </div>
        </div>
      )}
      {ruleOpen && (
        <SeverityRuleDialog
          open={ruleOpen}
          onClose={() => setRuleOpen(false)}
          oid={vuln.oid}
          findingName={vuln.name}
          nativeSeverity={vuln.severity_label}
          networkId={null}
        />
      )}
    </div>
  );
}

export function HostVulnerabilitiesPanel({
  results,
  isLoading,
}: {
  results: Vulnerability[];
  isLoading: boolean;
}) {
  const nucleiFindings = useMemo(
    () => results.filter((v) => v.source === "nuclei"),
    [results],
  );
  const gvmFindings = useMemo(
    () => results.filter((v) => v.source === "gvm"),
    [results],
  );
  const nseFindings = useMemo(
    () => results.filter((v) => v.source === "nse"),
    [results],
  );

  if (isLoading) {
    return <LoadingState rows={4} />;
  }

  const hasAny =
    nucleiFindings.length > 0 ||
    gvmFindings.length > 0 ||
    nseFindings.length > 0;

  return (
    <div className="space-y-6">
      {/* ── Nuclei Web Findings (always shown) ── */}
      <div>
        <h4 className="mb-3 flex items-center gap-2 text-sm font-emphasis text-foreground">
          <SourceBadge source="nuclei" />
          Nuclei Web Findings ({nucleiFindings.length})
        </h4>
        {nucleiFindings.length === 0 ? (
          <div className="rounded-lg border border-border p-6 text-center text-sm text-muted-foreground">
            No nuclei findings for this host. Nuclei scans target HTTP/HTTPS
            services on discovered ports.
          </div>
        ) : (
          <div className="rounded-lg border border-border">
            <div className="divide-y divide-border">
              {nucleiFindings.map((vuln) => (
                <NucleiVulnRow key={vuln.id} vuln={vuln} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── GVM Findings ── */}
      {gvmFindings.length > 0 && (
        <div>
          <h4 className="mb-3 flex items-center gap-2 text-sm font-emphasis text-foreground">
            <SourceBadge source="gvm" />
            GVM Findings ({gvmFindings.length})
          </h4>
          <div className="rounded-lg border border-border">
            <div className="divide-y divide-border">
              {gvmFindings.map((vuln) => (
                <GvmVulnRow key={vuln.id} vuln={vuln} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── NSE Findings ── */}
      {nseFindings.length > 0 && (
        <div>
          <h4 className="mb-3 flex items-center gap-2 text-sm font-emphasis text-foreground">
            <SourceBadge source="nse" />
            NSE Findings ({nseFindings.length})
          </h4>
          <div className="rounded-lg border border-border">
            <div className="divide-y divide-border">
              {nseFindings.map((vuln) => (
                <GvmVulnRow key={vuln.id} vuln={vuln} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── All empty (no nuclei section either) ── */}
      {!hasAny && nucleiFindings.length === 0 && (
        <div className="rounded-lg border border-border p-8 text-center text-sm text-muted-foreground">
          No vulnerabilities detected
        </div>
      )}
    </div>
  );
}
