import type { Scanner } from "@/lib/types";

export interface ScannerActionTarget {
  action: "regenerate" | "delete";
  scanner: Scanner;
}

export function scannerConfirmCopy(
  target: ScannerActionTarget,
  networkCount: number,
): { title: string; description: string; confirmLabel: string } {
  const name = target.scanner.name;
  if (target.action === "regenerate") {
    return {
      title: `Regenerate the API key of ${name}?`,
      description:
        "The current key stops working immediately. The scanner cannot connect until you put the new key into its configuration.",
      confirmLabel: "Regenerate key",
    };
  }
  // Backend cascades scanner → networks → scans/alerts.
  const networks =
    networkCount === 0
      ? "No networks use it."
      : `Its ${networkCount} network${networkCount === 1 ? "" : "s"}, their scans and alerts are deleted with it.`;
  return {
    title: `Delete scanner ${name}?`,
    description: `The scanner and its API key are removed permanently. ${networks}`,
    confirmLabel: "Delete scanner",
  };
}
