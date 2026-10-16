import { describe, expect, it } from "vitest";

import { isCustomScript, scriptActions } from "@/features/nse/lib/scriptKind";

describe("isCustomScript", () => {
  it("uses the type field, not the name prefix", () => {
    expect(isCustomScript({ type: "custom" })).toBe(true);
    expect(isCustomScript({ type: "builtin" })).toBe(false);
  });

  it("treats a custom_-prefixed built-in as built-in", () => {
    expect(isCustomScript({ type: "builtin" })).toBe(false);
  });
});

describe("scriptActions", () => {
  it("offers only Clone for a built-in script", () => {
    expect(
      scriptActions({ type: "builtin", cloned_from: null }, true),
    ).toEqual({ edit: false, clone: true, restore: false, remove: false });
  });

  it("offers Edit and Delete for a custom script, Restore only when cloned", () => {
    expect(
      scriptActions({ type: "custom", cloned_from: null }, true),
    ).toEqual({ edit: true, clone: false, restore: false, remove: true });
    expect(
      scriptActions({ type: "custom", cloned_from: "http-title" }, true),
    ).toEqual({ edit: true, clone: false, restore: true, remove: true });
  });

  it("offers nothing without operator rights", () => {
    expect(
      scriptActions({ type: "custom", cloned_from: "http-title" }, false),
    ).toEqual({ edit: false, clone: false, restore: false, remove: false });
  });
});
