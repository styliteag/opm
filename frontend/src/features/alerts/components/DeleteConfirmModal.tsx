import { SeverityBadge } from "@/components/data-display/SeverityBadge";
import { ConfirmDialog } from "@/components/feedback/ConfirmDialog";

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
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Delete ${alertCount} alert${alertCount !== 1 ? "s" : ""} permanently?`}
      description={
        <>
          This can't be undone. These alerts are removed for good:
          {entries.length > 0 && (
            <span className="mt-3 flex flex-wrap gap-3">
              {entries.map((sev) => (
                <span key={sev} className="flex items-center gap-1.5">
                  <SeverityBadge severity={sev} />
                  <span className="text-sm font-emphasis text-foreground">
                    {severityCounts[sev]}
                  </span>
                </span>
              ))}
            </span>
          )}
        </>
      }
      confirmLabel="Delete permanently"
      onConfirm={() => {
        onConfirm();
        onOpenChange(false);
      }}
    />
  );
}
