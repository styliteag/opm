import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TRIAGE_ACTIONS } from "@/lib/terminology";

interface AcceptRiskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Plain-language finding title. */
  target: string;
  pending?: boolean;
  onConfirm: (reason: string) => void;
}

/** Accept risk for a finding — reason required for the audit trail (ADR 0012). */
export function AcceptRiskDialog({
  open,
  onOpenChange,
  target,
  pending,
  onConfirm,
}: AcceptRiskDialogProps) {
  const [reason, setReason] = useState("");
  const valid = reason.trim().length > 0;

  const handleOpenChange = (next: boolean) => {
    if (!next) setReason("");
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{TRIAGE_ACTIONS.acceptRisk.label}</DialogTitle>
          <DialogDescription>
            <span className="text-foreground">{target}</span>
            <br />
            {TRIAGE_ACTIONS.acceptRisk.description}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) onConfirm(reason.trim());
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="accept-risk-reason">Reason (required)</Label>
            <Textarea
              id="accept-risk-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this risk acceptable?"
              maxLength={1000}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!valid || pending}>
              {pending ? "Saving…" : TRIAGE_ACTIONS.acceptRisk.label}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
