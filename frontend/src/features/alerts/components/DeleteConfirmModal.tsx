import { Button } from "@/components/ui/button";
import { SeverityBadge } from "@/components/data-display/SeverityBadge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface DeleteConfirmModalProps {
  alertCount: number;
  severityCounts: Record<string, number>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

const SEVERITY_ORDER = ["critical", "high", "medium", "info"] as const;

export function DeleteConfirmModal({
  alertCount,
  severityCounts,
  open,
  onOpenChange,
  onConfirm,
}: DeleteConfirmModalProps) {
  const entries = SEVERITY_ORDER.filter((s) => (severityCounts[s] ?? 0) > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Delete {alertCount} alert{alertCount !== 1 ? "s" : ""} permanently
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <p className="text-sm text-muted-foreground">
            This action cannot be undone. The following alerts will be
            permanently removed:
          </p>
          {entries.length > 0 && (
            <div className="flex flex-wrap gap-3">
              {entries.map((sev) => (
                <div key={sev} className="flex items-center gap-1.5">
                  <SeverityBadge severity={sev} />
                  <span className="text-sm font-emphasis text-foreground">
                    {severityCounts[sev]}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
          >
            Delete Permanently
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
