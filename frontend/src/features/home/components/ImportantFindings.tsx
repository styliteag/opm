import { useState } from "react";
import { Clock, RotateCcw, ShieldCheck } from "lucide-react";

import { SeverityBadge } from "@/components/data-display/SeverityBadge";
import { Button } from "@/components/ui/button";
import { AcceptRiskDialog } from "@/features/alerts/components/triage/AcceptRiskDialog";
import { useTriage } from "@/features/alerts/hooks/useTriage";
import {
  alertDisplayTitle,
  alertToolLabel,
} from "@/features/alerts/lib/alertDisplayTitle";
import type { HomeQueueMode } from "@/features/home/hooks/useHomeData";
import type { FindingGroup } from "@/features/home/lib/homeQueue";
import { useHasRole } from "@/lib/roles";
import { TRIAGE_ACTIONS } from "@/lib/terminology";
import { formatRelativeTime } from "@/lib/utils";

interface ImportantFindingsProps {
  /** Identical findings across networks are one group (one row). */
  findings: FindingGroup[];
  mode: HomeQueueMode;
  onOpenDetails: (alertId: number) => void;
}

/**
 * High/critical findings only (ADR 0013); lower ones live on the host page.
 * Snooze / Accept risk / Reopen act on every alert of a group.
 */
export function ImportantFindings({
  findings,
  mode,
  onOpenDetails,
}: ImportantFindingsProps) {
  const triage = useTriage();
  const canTriage = useHasRole("analyst");
  const canAcceptRisk = useHasRole("operator");
  const [riskTarget, setRiskTarget] = useState<FindingGroup | null>(null);

  if (findings.length === 0) return null;

  return (
    <section className="space-y-2" aria-label="Important findings">
      <h2 className="text-sm font-strong text-foreground">
        Important findings
      </h2>
      <ul className="rounded-lg border border-border bg-card">
        {findings.map((group) => {
          const f = group.alert;
          const tool = alertToolLabel(f);
          return (
            <li
              key={group.key}
              data-testid="finding-row"
              onClick={() => onOpenDetails(f.id)}
              className="grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b border-border px-4 py-3 last:border-b-0 transition-colors hover:bg-accent/40"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <SeverityBadge severity={group.severity} />
                  <span className="truncate text-sm text-foreground">
                    {alertDisplayTitle(f)}
                  </span>
                  {group.networks.length > 1 && (
                    <span
                      className="shrink-0 rounded-md border border-border px-1.5 py-0.5 text-xs text-muted-foreground"
                      title={group.networks.join(", ")}
                    >
                      in {group.networks.length} networks
                    </span>
                  )}
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  <span className="font-mono">
                    {f.ip}
                    {f.port != null && `:${f.port}`}
                  </span>
                  {group.networks.length > 0 && (
                    <> · {group.networks.join(", ")}</>
                  )}{" "}
                  · {tool.label}
                  {tool.tool && (
                    <span className="opacity-70"> ({tool.tool})</span>
                  )}{" "}
                  · {formatRelativeTime(group.newestAt)}
                </p>
              </div>
              <div
                className="flex shrink-0 gap-1.5"
                onClick={(e) => e.stopPropagation()}
              >
                {!canTriage ? null : mode === "inbox" ? (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      title={TRIAGE_ACTIONS.snooze.description}
                      disabled={triage.pending}
                      onClick={() => triage.snooze(group.alertIds)}
                    >
                      <Clock />
                      {TRIAGE_ACTIONS.snooze.label}
                    </Button>
                    {canAcceptRisk && (
                      <Button
                        variant="outline"
                        size="sm"
                        title={TRIAGE_ACTIONS.acceptRisk.description}
                        onClick={() => setRiskTarget(group)}
                      >
                        <ShieldCheck />
                        {TRIAGE_ACTIONS.acceptRisk.label}
                      </Button>
                    )}
                  </>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    title={TRIAGE_ACTIONS.reopen.description}
                    disabled={triage.pending}
                    onClick={() => triage.reopen(group.alertIds)}
                  >
                    <RotateCcw />
                    {TRIAGE_ACTIONS.reopen.label}
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <AcceptRiskDialog
        open={riskTarget !== null}
        onOpenChange={(open) => !open && setRiskTarget(null)}
        target={riskTarget ? alertDisplayTitle(riskTarget.alert) : ""}
        pending={triage.pending}
        onConfirm={(reason) =>
          riskTarget &&
          triage.acceptRisk(riskTarget.alertIds, reason, () =>
            setRiskTarget(null),
          )
        }
      />
    </section>
  );
}
