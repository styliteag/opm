import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { AlertDetailPanel } from "@/features/alerts/components/AlertDetailPanel";

interface AlertSlideOverProps {
  alertId: number | undefined;
  onClose: () => void;
}

/** Right-side sheet with the alert details; driven by the `?alert=<id>` search param. */
export function AlertSlideOver({ alertId, onClose }: AlertSlideOverProps) {
  const open = alertId !== undefined && alertId > 0;
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        className="top-0 right-0 left-auto h-full max-h-screen w-full max-w-full translate-x-0 translate-y-0 overflow-y-auto rounded-none border-y-0 border-r-0 p-6 sm:max-w-2xl data-open:zoom-in-100 data-closed:zoom-out-100 data-open:slide-in-from-right-8 data-closed:slide-out-to-right-8"
      >
        <DialogTitle className="sr-only">Alert details</DialogTitle>
        {open && <AlertDetailPanel key={alertId} alertId={alertId} onResolved={onClose} />}
      </DialogContent>
    </Dialog>
  );
}
