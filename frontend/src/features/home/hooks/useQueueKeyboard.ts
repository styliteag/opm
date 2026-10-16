import { useMemo } from "react";

import {
  useKeyboardShortcuts,
  type KeyboardShortcut,
} from "@/hooks/useKeyboardShortcuts";

interface QueueKeyboardOptions {
  enabled: boolean;
  count: number;
  /** Index of the row under the cursor, -1 when empty. */
  active: number;
  setCursor: (index: number) => void;
  onToggle: (index: number) => void;
  onOpen: (index: number) => void;
  onExpected?: (index: number) => void;
  onSnooze?: (index: number) => void;
}

/** j/k move, x select, e Expected, s Snooze, Enter details (ADR 0012 keyboard flow). */
export function useQueueKeyboard({
  enabled,
  count,
  active,
  setCursor,
  onToggle,
  onOpen,
  onExpected,
  onSnooze,
}: QueueKeyboardOptions): void {
  const shortcuts = useMemo<KeyboardShortcut[]>(() => {
    const at = (fn?: (i: number) => void) => () => {
      if (fn && active >= 0) fn(active);
    };
    return [
      { key: "j", description: "Next", handler: () => setCursor(Math.min(active + 1, count - 1)) },
      { key: "k", description: "Previous", handler: () => setCursor(Math.max(active - 1, 0)) },
      { key: "x", description: "Select", handler: at(onToggle) },
      { key: "Enter", description: "Open details", handler: at(onOpen) },
      ...(onExpected ? [{ key: "e", description: "Expected", handler: at(onExpected) }] : []),
      ...(onSnooze ? [{ key: "s", description: "Snooze", handler: at(onSnooze) }] : []),
    ];
  }, [active, count, setCursor, onToggle, onOpen, onExpected, onSnooze]);

  useKeyboardShortcuts(shortcuts, enabled);
}
