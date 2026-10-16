import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";

import {
  isEditableTarget,
  isInteractiveTarget,
  useKeyboardShortcuts,
} from "./useKeyboardShortcuts";

function pressKey(
  key: string,
  options: KeyboardEventInit = {},
  target: HTMLElement | Window = window,
) {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...options,
  });
  target.dispatchEvent(event);
  return event;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("useKeyboardShortcuts", () => {
  it("fires the handler for a matching key", () => {
    const handler = vi.fn();
    renderHook(() => useKeyboardShortcuts([{ key: "j", handler }]));

    pressKey("j");
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("matches case-insensitively", () => {
    const handler = vi.fn();
    renderHook(() => useKeyboardShortcuts([{ key: "a", handler }]));

    pressKey("A");
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("ignores keys with modifiers held", () => {
    const handler = vi.fn();
    renderHook(() => useKeyboardShortcuts([{ key: "a", handler }]));

    pressKey("a", { ctrlKey: true });
    pressKey("a", { metaKey: true });
    pressKey("a", { altKey: true });
    expect(handler).not.toHaveBeenCalled();
  });

  it("ignores non-matching keys", () => {
    const handler = vi.fn();
    renderHook(() => useKeyboardShortcuts([{ key: "a", handler }]));

    pressKey("b");
    expect(handler).not.toHaveBeenCalled();
  });

  it("does not fire while typing in an input", () => {
    const handler = vi.fn();
    renderHook(() => useKeyboardShortcuts([{ key: "a", handler }]));

    const input = document.createElement("input");
    document.body.appendChild(input);
    pressKey("a", {}, input);
    expect(handler).not.toHaveBeenCalled();
  });

  it("does not fire inside a dialog", () => {
    const handler = vi.fn();
    renderHook(() => useKeyboardShortcuts([{ key: "a", handler }]));

    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    const button = document.createElement("button");
    dialog.appendChild(button);
    document.body.appendChild(dialog);
    pressKey("a", {}, button);
    expect(handler).not.toHaveBeenCalled();
  });

  it("leaves Enter and Space to a focused button or link", () => {
    const handler = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts([
        { key: "Enter", handler },
        { key: " ", handler },
      ]),
    );

    const button = document.createElement("button");
    const link = document.createElement("a");
    link.href = "/ports";
    document.body.append(button, link);
    const onButton = pressKey("Enter", {}, button);
    pressKey(" ", {}, button);
    const onLink = pressKey("Enter", {}, link);

    expect(handler).not.toHaveBeenCalled();
    expect(onButton.defaultPrevented).toBe(false);
    expect(onLink.defaultPrevented).toBe(false);
  });

  it("still fires letter shortcuts while a button has focus", () => {
    const handler = vi.fn();
    renderHook(() => useKeyboardShortcuts([{ key: "j", handler }]));

    const button = document.createElement("button");
    document.body.appendChild(button);
    pressKey("j", {}, button);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("does nothing when disabled", () => {
    const handler = vi.fn();
    renderHook(() => useKeyboardShortcuts([{ key: "a", handler }], false));

    pressKey("a");
    expect(handler).not.toHaveBeenCalled();
  });

  it("removes the listener on unmount", () => {
    const handler = vi.fn();
    const { unmount } = renderHook(() =>
      useKeyboardShortcuts([{ key: "a", handler }]),
    );

    unmount();
    pressKey("a");
    expect(handler).not.toHaveBeenCalled();
  });
});

describe("isEditableTarget", () => {
  it("detects inputs, textareas, and selects", () => {
    for (const tag of ["input", "textarea", "select"]) {
      const el = document.createElement(tag);
      document.body.appendChild(el);
      expect(isEditableTarget(el)).toBe(true);
    }
  });

  it("detects elements inside menus", () => {
    const menu = document.createElement("div");
    menu.setAttribute("role", "menu");
    const item = document.createElement("span");
    menu.appendChild(item);
    document.body.appendChild(menu);
    expect(isEditableTarget(item)).toBe(true);
  });

  it("returns false for plain elements", () => {
    const div = document.createElement("div");
    document.body.appendChild(div);
    expect(isEditableTarget(div)).toBe(false);
  });
});

describe("isInteractiveTarget", () => {
  it("detects buttons, links, and role=button elements", () => {
    const button = document.createElement("button");
    const link = document.createElement("a");
    link.href = "/";
    const roleButton = document.createElement("div");
    roleButton.setAttribute("role", "button");
    const icon = document.createElement("span");
    button.appendChild(icon);
    document.body.append(button, link, roleButton);

    expect(isInteractiveTarget(button)).toBe(true);
    expect(isInteractiveTarget(icon)).toBe(true);
    expect(isInteractiveTarget(link)).toBe(true);
    expect(isInteractiveTarget(roleButton)).toBe(true);
  });

  it("returns false for plain elements", () => {
    const div = document.createElement("div");
    document.body.appendChild(div);
    expect(isInteractiveTarget(div)).toBe(false);
  });
});
