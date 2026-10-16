import { useId, useState } from "react";
import { ChevronDown, ChevronRight, Clock, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { AcceptRiskDialog } from "@/features/alerts/components/triage/AcceptRiskDialog";
import { useTriage } from "@/features/alerts/hooks/useTriage";
import { useTriageActions } from "@/features/alerts/hooks/useTriageActions";
import type { HostFinding } from "@/features/hosts/lib/hostFindings";
import { TOOL_LABELS, TRIAGE_ACTIONS } from "@/lib/terminology";
import type { VulnerabilitySeverity } from "@/lib/types";
import { cn } from "@/lib/utils";

// SeverityBadge palette plus "low" (blue) and a muted "info".
const SEVERITY_STYLES: Record<VulnerabilitySeverity, string> = {
  critical: "bg-red-500/10 text-red-400 border-red-500/20",
  high: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  medium: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  low: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  info: "bg-muted text-muted-foreground border-border",
};

const TOOL_NAMES: Record<HostFinding["source"], string> = {
  gvm: "GVM",
  nuclei: "nuclei",
  nse: "NSE",
  ssh: "ssh-audit",
};

export function FindingSeverityBadge({
  severity,
}: {
  severity: VulnerabilitySeverity;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-md border px-1.5 py-0.5 text-[10px] font-emphasis uppercase",
        SEVERITY_STYLES[severity],
      )}
    >
      {severity}
    </span>
  );
}

/** Accept risk for every open alert of the finding (one per network). */
function useAcceptFindingRisk() {
  const { acceptRisk } = useTriageActions();
  return {
    pending: acceptRisk.isPending,
    accept: (alertIds: number[], reason: string, onDone: () => void) =>
      Promise.all(
        alertIds.map((alertId) => acceptRisk.mutateAsync({ alertId, reason })),
      )
        .then(() => {
          toast.success("Risk accepted");
          onDone();
        })
        .catch((e: Error) => toast.error(e.message)),
  };
}

/** One finding: plain title, severity, tool as secondary label, details on demand. */
export function FindingItem({ finding }: { finding: HostFinding }) {
  const [open, setOpen] = useState(false);
  const [riskOpen, setRiskOpen] = useState(false);
  const detailsId = useId();
  const triage = useTriage();
  const risk = useAcceptFindingRisk();
  const hasAlert = finding.openAlertIds.length > 0;
  const hasDetails = Boolean(
    finding.description || finding.solution || finding.findingId,
  );
  const Chevron = open ? ChevronDown : ChevronRight;

  return (
    <li className="py-2">
      <div className="flex items-start gap-2">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={open ? detailsId : undefined}
          disabled={!hasDetails}
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 flex-1 cursor-pointer items-start gap-2 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
        >
          <Chevron
            className={cn(
              "mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground",
              !hasDetails && "invisible",
            )}
          />
          <FindingSeverityBadge severity={finding.severity} />
          <span className="min-w-0">
            <span className="block text-sm text-foreground">
              {finding.title}
            </span>
            <span className="block text-xs text-muted-foreground">
              {TOOL_LABELS[finding.source]}
              {finding.cveIds.length > 0 && (
                <>
                  {" · "}
                  <span className="font-mono">
                    {finding.cveIds.slice(0, 3).join(", ")}
                  </span>
                  {finding.cveIds.length > 3 &&
                    ` +${finding.cveIds.length - 3}`}
                </>
              )}
            </span>
          </span>
        </button>
        {hasAlert && (
          <div className="flex shrink-0 gap-1.5">
            <Button
              variant="outline"
              size="xs"
              title={TRIAGE_ACTIONS.snooze.description}
              disabled={triage.pending}
              onClick={() => triage.snooze(finding.openAlertIds)}
            >
              <Clock />
              {TRIAGE_ACTIONS.snooze.label}
            </Button>
            <Button
              variant="outline"
              size="xs"
              title={TRIAGE_ACTIONS.acceptRisk.description}
              onClick={() => setRiskOpen(true)}
            >
              <ShieldCheck />
              {TRIAGE_ACTIONS.acceptRisk.label}
            </Button>
          </div>
        )}
      </div>

      {open && (
        <div id={detailsId} className="mt-2 space-y-2 pl-6 text-sm">
          {finding.description && (
            <p className="whitespace-pre-line text-secondary-foreground">
              {finding.description}
            </p>
          )}
          {finding.solution && (
            <div>
              <p className="text-xs uppercase text-muted-foreground">
                Solution
              </p>
              <p className="whitespace-pre-line text-secondary-foreground">
                {finding.solution}
              </p>
            </div>
          )}
          {finding.findingId && (
            <p className="text-xs text-muted-foreground">
              {TOOL_LABELS.oid}:{" "}
              <span className="font-mono">{finding.findingId}</span> ·{" "}
              {TOOL_NAMES[finding.source]}
            </p>
          )}
        </div>
      )}

      {hasAlert && (
        <AcceptRiskDialog
          open={riskOpen}
          onOpenChange={setRiskOpen}
          target={finding.title}
          pending={risk.pending}
          onConfirm={(reason) =>
            risk.accept(finding.openAlertIds, reason, () => setRiskOpen(false))
          }
        />
      )}
    </li>
  );
}
