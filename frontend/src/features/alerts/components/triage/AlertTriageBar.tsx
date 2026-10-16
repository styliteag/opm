import { useState } from "react";
import { Clock, RotateCcw, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AcceptRiskDialog } from "@/features/alerts/components/triage/AcceptRiskDialog";
import { ExpectedReasonDialog } from "@/features/alerts/components/triage/ExpectedReasonDialog";
import { ExpectedSplitButton } from "@/features/alerts/components/triage/ExpectedSplitButton";
import { useTriage } from "@/features/alerts/hooks/useTriage";
import { alertDisplayTitle } from "@/features/alerts/lib/alertDisplayTitle";
import { TRIAGE_ACTIONS } from "@/lib/terminology";
import type { Alert } from "@/lib/types";

interface AlertTriageBarProps {
  alert: Alert;
  onResolved?: () => void;
}

/**
 * v4 actions for one alert (ADR 0012): port alerts get Expected ▾ + Snooze,
 * findings get Snooze + Accept risk, handled alerts get Reopen.
 */
export function AlertTriageBar({ alert, onResolved }: AlertTriageBarProps) {
  const triage = useTriage();
  const [reasonOpen, setReasonOpen] = useState(false);
  const [riskOpen, setRiskOpen] = useState(false);
  const target =
    alert.port != null ? `${alert.ip}:${alert.port}` : alert.ip;

  if (alert.dismissed) {
    return (
      <Button
        variant="outline"
        size="sm"
        title={TRIAGE_ACTIONS.reopen.description}
        disabled={triage.pending}
        onClick={() => triage.reopen([alert.id], onResolved)}
      >
        <RotateCcw />
        {TRIAGE_ACTIONS.reopen.label}
      </Button>
    );
  }

  const snoozeButton = (
    <Button
      variant="outline"
      size="sm"
      title={TRIAGE_ACTIONS.snooze.description}
      disabled={triage.pending}
      onClick={() => triage.snooze([alert.id], onResolved)}
    >
      <Clock />
      {TRIAGE_ACTIONS.snooze.label}
    </Button>
  );

  if (alert.source === "port") {
    return (
      <>
        <ExpectedSplitButton
          disabled={triage.pending}
          onExpected={(scope) =>
            triage.markExpected({ alertIds: [alert.id], scope }, onResolved)
          }
          onExpectedWithReason={() => setReasonOpen(true)}
        />
        {snoozeButton}
        <ExpectedReasonDialog
          open={reasonOpen}
          onOpenChange={setReasonOpen}
          target={target}
          pending={triage.pending}
          onConfirm={({ scope, reason }) =>
            triage.markExpected({ alertIds: [alert.id], scope, reason }, () => {
              setReasonOpen(false);
              onResolved?.();
            })
          }
        />
      </>
    );
  }

  return (
    <>
      {snoozeButton}
      <Button
        variant="outline"
        size="sm"
        title={TRIAGE_ACTIONS.acceptRisk.description}
        onClick={() => setRiskOpen(true)}
      >
        <ShieldCheck />
        {TRIAGE_ACTIONS.acceptRisk.label}
      </Button>
      <AcceptRiskDialog
        open={riskOpen}
        onOpenChange={setRiskOpen}
        target={alertDisplayTitle(alert)}
        pending={triage.pending}
        onConfirm={(reason) =>
          triage.acceptRisk(alert.id, reason, () => {
            setRiskOpen(false);
            onResolved?.();
          })
        }
      />
    </>
  );
}
