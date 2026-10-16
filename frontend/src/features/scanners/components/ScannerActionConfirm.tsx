import { ConfirmDialog } from "@/components/feedback/ConfirmDialog";
import {
  scannerConfirmCopy,
  type ScannerActionTarget,
} from "../lib/scannerConfirmCopy";

interface ScannerActionConfirmProps {
  target: ScannerActionTarget | null;
  networkCount: number;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/** Confirmation for the scanner list's Delete and Regenerate key (bug #8). */
export function ScannerActionConfirm({
  target,
  networkCount,
  pending,
  onCancel,
  onConfirm,
}: ScannerActionConfirmProps) {
  const copy = target ? scannerConfirmCopy(target, networkCount) : null;
  return (
    <ConfirmDialog
      open={target !== null}
      onOpenChange={(open) => !open && onCancel()}
      title={copy?.title ?? ""}
      description={copy?.description ?? ""}
      confirmLabel={copy?.confirmLabel ?? "Confirm"}
      pending={pending}
      onConfirm={onConfirm}
    />
  );
}
