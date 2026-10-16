import { useState } from "react";
import { ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FindingSeverityBadge } from "@/features/hosts/components/FindingItem";
import { FindingsList } from "@/features/hosts/components/FindingsList";
import { SeverityRuleDialog } from "@/features/severity-rules/components/SeverityRuleDialog";
import { AdvancedSettings } from "@/components/disclosure/AdvancedSettings";
import { useVulnerabilities } from "@/features/scans/hooks/useVulnerabilities";
import { TOOL_LABELS } from "@/lib/terminology";
import {
  findingRuleTargets,
  groupScanFindings,
  type FindingRuleTarget,
} from "../lib/scanFindings";
import { HostTargetLink } from "./HostTargetLink";

interface ScanFindingsProps {
  scanId: number;
  networkId: number;
  networkName: string | null;
  hostIds: Map<string, number>;
  canOperate: boolean;
}

/** Scan findings per host:port with the shared Findings list (ADR 0008). */
export function ScanFindings({
  scanId,
  networkId,
  networkName,
  hostIds,
  canOperate,
}: ScanFindingsProps) {
  const { data, isLoading } = useVulnerabilities(scanId);
  const [ruleTarget, setRuleTarget] = useState<FindingRuleTarget | null>(null);

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading findings…</p>;
  }
  const vulns = data?.results ?? [];
  if (vulns.length === 0) return null;

  const groups = groupScanFindings(vulns);
  const important = groups.reduce((n, g) => n + g.importantCount, 0);

  return (
    <section className="rounded-lg border border-border">
      <div className="border-b border-border bg-card px-4 py-3">
        <h3 className="text-sm font-strong text-foreground">
          Findings ({vulns.length})
        </h3>
        <p className="text-xs text-muted-foreground">
          {important > 0
            ? `${important} important · grouped by host and port`
            : "No important findings · grouped by host and port"}
        </p>
      </div>
      <div className="divide-y divide-border">
        {groups.map((group) => (
          <div key={group.key} className="px-4 py-3">
            <HostTargetLink
              ip={group.ip}
              port={group.port}
              hostId={hostIds.get(group.ip)}
            />
            <div className="mt-1">
              <FindingsList findings={group.findings} />
            </div>
          </div>
        ))}
      </div>

      {canOperate && (
        <div className="border-t border-border px-4 py-3">
          <AdvancedSettings summary="Alert severity rules per finding ID">
            <p className="text-xs text-muted-foreground">
              Change how loud a finding is on future scans. The rule applies to
              its {TOOL_LABELS.oid.toLowerCase()} everywhere or on this network.
            </p>
            <ul className="divide-y divide-border">
              {findingRuleTargets(vulns).map((t) => (
                <li
                  key={t.oid}
                  className="flex flex-wrap items-center justify-between gap-2 py-2"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <FindingSeverityBadge severity={t.severity} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-foreground">
                        {t.name}
                      </span>
                      <span className="block truncate font-mono text-xs text-muted-foreground">
                        {t.oid}
                        {t.count > 1 && ` · ${t.count} targets`}
                      </span>
                    </span>
                  </span>
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() => setRuleTarget(t)}
                  >
                    <ShieldAlert />
                    Change alert severity
                  </Button>
                </li>
              ))}
            </ul>
          </AdvancedSettings>
        </div>
      )}

      {ruleTarget && (
        <SeverityRuleDialog
          open
          onClose={() => setRuleTarget(null)}
          oid={ruleTarget.oid}
          findingName={ruleTarget.name}
          nativeSeverity={ruleTarget.severity}
          networkId={networkId}
          networkName={networkName}
        />
      )}
    </section>
  );
}
