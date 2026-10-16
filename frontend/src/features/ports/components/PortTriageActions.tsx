import { useState } from "react";
import { Clock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ExpectedReasonDialog } from "@/features/alerts/components/triage/ExpectedReasonDialog";
import { ExpectedSplitButton } from "@/features/alerts/components/triage/ExpectedSplitButton";
import { useTriage } from "@/features/alerts/hooks/useTriage";
import { useHasRole } from "@/lib/roles";
import { TRIAGE_ACTIONS } from "@/lib/terminology";

interface PortTriageActionsProps {
  /** Open port alerts for this ip:port — one per network (ADR 0012 grouping). */
  alertIds: number[];
  /** "ip:port" shown in the reason dialog. */
  target: string;
}

/**
 * Expected ▾ + Snooze for a port that still needs a decision. Snooze needs
 * analyst+, Expected operator+; controls the role can't use are hidden.
 */
export function PortTriageActions({
  alertIds,
  target,
}: PortTriageActionsProps) {
  const triage = useTriage();
  const canTriage = useHasRole("analyst");
  const canDecide = useHasRole("operator");
  const [reasonOpen, setReasonOpen] = useState(false);

  if (!canTriage) return null;

  return (
    <div className="inline-flex items-center gap-1.5">
      {canDecide && (
        <ExpectedSplitButton
          disabled={triage.pending}
          onExpected={(scope) => triage.markExpected({ alertIds, scope })}
          onExpectedWithReason={() => setReasonOpen(true)}
        />
      )}
      <Button
        variant="outline"
        size="sm"
        title={TRIAGE_ACTIONS.snooze.description}
        disabled={triage.pending}
        onClick={() => triage.snooze(alertIds)}
      >
        <Clock />
        {TRIAGE_ACTIONS.snooze.label}
      </Button>
      <ExpectedReasonDialog
        open={reasonOpen}
        onOpenChange={setReasonOpen}
        target={target}
        pending={triage.pending}
        onConfirm={({ scope, reason }) =>
          triage.markExpected({ alertIds, scope, reason }, () =>
            setReasonOpen(false),
          )
        }
      />
    </div>
  );
}
