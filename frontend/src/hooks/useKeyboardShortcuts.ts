import { useEffect } from "react";

export interface KeyboardShortcut {
  /** Matched case-insensitively against KeyboardEvent.key (e.g. "j", "a"). */
  key: string;
  handler: (event: KeyboardEvent) => void;
  description?: string;
}

/**
 * Shortcuts must never fire while the user is typing or a dialog/menu is
 * open (alert-state-action-matrix.md, interaction rule 8).
 */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  if (
    target.closest(
      '[role="dialog"], [role="menu"], [role="listbox"], [role="combobox"]',
    )
  ) {
    return true;
  }
  return false;
}

/**
 * Buttons, links and other focusable controls handle Enter/Space themselves;
 * a shortcut on those keys would hijack the native activation.
 */
export function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.closest(
      'button, a[href], summary, [role="button"], [role="link"], [role="tab"], [role="checkbox"], [role="switch"]',
    ) !== null
  );
}

const ACTIVATION_KEYS = new Set(["enter", " "]);

/**
 * Registers global keyboard shortcuts for the lifetime of the component.
 * Pass a memoized array — the listener re-subscribes when the array identity
 * changes. Shortcuts with modifier keys held are ignored so browser and OS
 * combinations keep working.
 */
export function useKeyboardShortcuts(
  shortcuts: KeyboardShortcut[],
  enabled = true,
): void {
  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (isEditableTarget(event.target)) return;
      if (
        ACTIVATION_KEYS.has(event.key.toLowerCase()) &&
        isInteractiveTarget(event.target)
      ) {
        return;
      }

      const match = shortcuts.find(
        (shortcut) => shortcut.key.toLowerCase() === event.key.toLowerCase(),
      );
      if (!match) return;

      event.preventDefault();
      match.handler(event);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [shortcuts, enabled]);
}
