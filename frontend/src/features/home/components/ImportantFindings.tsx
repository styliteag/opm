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
import { effectiveSeverity } from "@/features/home/lib/homeQueue";
import { TRIAGE_ACTIONS } from "@/lib/terminology";
import type { Alert } from "@/lib/types";
import { formatRelativeTime } from "@/lib/utils";

interface ImportantFindingsProps {
  findings: Alert[];
  mode: HomeQueueMode;
  onOpenDetails: (alertId: number) => void;
}

/** High/critical findings only (ADR 0013); lower ones live on the host page. */
export function ImportantFindings({ findings, mode, onOpenDetails }: ImportantFindingsProps) {
  const triage = useTriage();
  const [riskTarget, setRiskTarget] = useState<Alert | null>(null);

  if (findings.length === 0) return null;

  return (
    <section className="space-y-2" aria-label="Important findings">
      <h2 className="text-sm font-strong text-foreground">Important findings</h2>
      <ul className="rounded-lg border border-border bg-card">
        {findings.map((f) => {
          const tool = alertToolLabel(f);
          return (
            <li
              key={f.id}
              data-testid="finding-row"
              onClick={() => onOpenDetails(f.id)}
              className="grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b border-border px-4 py-3 last:border-b-0 transition-colors hover:bg-accent/40"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <SeverityBadge severity={effectiveSeverity(f)} />
                  <span className="truncate text-sm text-foreground">
                    {alertDisplayTitle(f)}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  <span className="font-mono">
                    {f.ip}
                    {f.port != null && `:${f.port}`}
                  </span>
                  {f.network_name && <> · {f.network_name}</>} · {tool.label}
                  {tool.tool && <span className="opacity-70"> ({tool.tool})</span>} ·{" "}
                  {formatRelativeTime(f.created_at)}
                </p>
              </div>
              <div className="flex shrink-0 gap-1.5" onClick={(e) => e.stopPropagation()}>
                {mode === "inbox" ? (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      title={TRIAGE_ACTIONS.snooze.description}
                      disabled={triage.pending}
                      onClick={() => triage.snooze([f.id])}
                    >
                      <Clock />
                      {TRIAGE_ACTIONS.snooze.label}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      title={TRIAGE_ACTIONS.acceptRisk.description}
                      onClick={() => setRiskTarget(f)}
                    >
                      <ShieldCheck />
                      {TRIAGE_ACTIONS.acceptRisk.label}
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    title={TRIAGE_ACTIONS.reopen.description}
                    disabled={triage.pending}
                    onClick={() => triage.reopen([f.id])}
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
        target={riskTarget ? alertDisplayTitle(riskTarget) : ""}
        pending={triage.pending}
        onConfirm={(reason) =>
          riskTarget &&
          triage.acceptRisk(riskTarget.id, reason, () => setRiskTarget(null))
        }
      />
    </section>
  );
}
