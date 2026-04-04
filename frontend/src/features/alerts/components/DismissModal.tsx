import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  useAlertMutations,
  useDismissSuggestions,
} from "@/features/alerts/hooks/useAlerts";

interface DismissModalProps {
  alertIds: number[];
  port?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function DismissModal({
  alertIds,
  port,
  open,
  onOpenChange,
  onSuccess,
}: DismissModalProps) {
  const [reason, setReason] = useState("");
  const { dismiss, bulkDismiss } = useAlertMutations();
  const suggestions = useDismissSuggestions(port);

  const isBulk = alertIds.length > 1;

  const handleDismiss = () => {
    const trimmed = reason.trim();
    if (!trimmed) return;

    if (isBulk) {
      bulkDismiss.mutate(
        { alert_ids: alertIds, reason: trimmed },
        {
          onSuccess: () => {
            toast.success(`${alertIds.length} alerts dismissed`);
            onOpenChange(false);
            setReason("");
            onSuccess?.();
          },
          onError: (e) => toast.error(e.message),
        },
      );
    } else {
      dismiss.mutate(
        { id: alertIds[0], reason: trimmed },
        {
          onSuccess: () => {
            toast.success("Alert dismissed");
            onOpenChange(false);
            setReason("");
            onSuccess?.();
          },
          onError: (e) => toast.error(e.message),
        },
      );
    }
  };

  const isPending = dismiss.isPending || bulkDismiss.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isBulk ? `Dismiss ${alertIds.length} Alerts` : "Dismiss Alert"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">
            Dismissing hides {isBulk ? "these alerts" : "this alert"} from the
            active list. Future scans that detect the same issue{" "}
            <span className="font-emphasis text-foreground">
              will still generate new alerts
            </span>
            . To permanently suppress alerts for a port, use{" "}
            <span className="font-emphasis text-foreground">Accept</span>{" "}
            instead.
          </p>
          <div>
            <label className="block text-sm font-emphasis text-foreground mb-1">
              Reason <span className="text-destructive">*</span>
            </label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this alert being dismissed?"
              rows={3}
            />
          </div>

          {(suggestions.data?.suggestions ?? []).length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-2">Suggestions:</p>
              <div className="flex flex-wrap gap-1.5">
                {(suggestions.data?.suggestions ?? []).slice(0, 5).map((s) => (
                  <button
                    key={s.reason}
                    onClick={() => setReason(s.reason)}
                    className="rounded-md bg-secondary px-2 py-1 text-xs text-secondary-foreground hover:bg-accent transition-colors"
                  >
                    {s.reason}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleDismiss}
            disabled={isPending || !reason.trim()}
          >
            {isPending ? "Dismissing..." : "Dismiss"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
