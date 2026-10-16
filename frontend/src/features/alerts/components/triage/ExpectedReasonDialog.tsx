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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ExpectedScope } from "@/features/alerts/hooks/useTriageActions";
import {
  EXPECTED_SCOPES,
  TRIAGE_ACTIONS,
  WHY_QUICK_PICKS,
} from "@/lib/terminology";
import { cn } from "@/lib/utils";

interface ExpectedReasonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What is being marked, e.g. "10.0.0.1:53" or "3 ports". */
  target: string;
  pending?: boolean;
  onConfirm: (input: { scope: ExpectedScope; reason: string }) => void;
}

/** Expected with an optional Why (quick picks or free text) and a scope choice. */
export function ExpectedReasonDialog({
  open,
  onOpenChange,
  target,
  pending,
  onConfirm,
}: ExpectedReasonDialogProps) {
  const [reason, setReason] = useState("");
  const [scope, setScope] = useState<ExpectedScope>("host");

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setReason("");
      setScope("host");
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {TRIAGE_ACTIONS.expected.label}: {target}
          </DialogTitle>
          <DialogDescription>
            {TRIAGE_ACTIONS.expected.description} The reason is shown as Why
            next to the port.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            onConfirm({ scope, reason });
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="expected-reason">Why (optional)</Label>
            <div className="flex flex-wrap gap-1.5">
              {WHY_QUICK_PICKS.map((pick) => (
                <button
                  key={pick}
                  type="button"
                  onClick={() => setReason(pick)}
                  className={cn(
                    "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                    reason === pick
                      ? "border-primary bg-primary/15 text-foreground"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {pick}
                </button>
              ))}
            </div>
            <Input
              id="expected-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Web server for the intranet"
              maxLength={500}
            />
          </div>

          <fieldset className="space-y-1.5">
            <legend className="mb-1.5 text-sm font-emphasis">Applies to</legend>
            {(Object.keys(EXPECTED_SCOPES) as ExpectedScope[]).map(
              (value) => (
                <label
                  key={value}
                  className="flex items-center gap-2 text-sm text-foreground"
                >
                  <input
                    type="radio"
                    name="expected-scope"
                    value={value}
                    checked={scope === value}
                    onChange={() => setScope(value)}
                    className="accent-primary"
                  />
                  {EXPECTED_SCOPES[value]}
                </label>
              ),
            )}
          </fieldset>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : `Mark ${TRIAGE_ACTIONS.expected.label}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
