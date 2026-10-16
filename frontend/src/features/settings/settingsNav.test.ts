import { describe, it, expect } from "vitest";

import {
  defaultSettingsPath,
  isSettingsEntryActive,
  visibleSettingsNav,
} from "./settingsNav";

const labels = (role: Parameters<typeof visibleSettingsNav>[0]) =>
  visibleSettingsNav(role).map((e) => e.label);

describe("settings navigation", () => {
  it("shows every entry to admins", () => {
    expect(labels("admin")).toEqual([
      "Scanners",
      "Rules",
      "Scan profiles",
      "Users",
      "Organization",
      "System",
      "Account",
    ]);
  });

  it("hides admin-only entries from operators", () => {
    expect(labels("operator")).toEqual([
      "Scanners",
      "Rules",
      "Scan profiles",
      "Account",
    ]);
  });

  it("shows only Account to analysts and viewers", () => {
    expect(labels("analyst")).toEqual(["Account"]);
    expect(labels("viewer")).toEqual(["Account"]);
  });

  it("lands operators on scanners and everyone else on account security", () => {
    expect(defaultSettingsPath("admin")).toBe("/settings/scanners");
    expect(defaultSettingsPath("operator")).toBe("/settings/scanners");
    expect(defaultSettingsPath("viewer")).toBe("/settings/security");
    expect(defaultSettingsPath(undefined)).toBe("/settings/security");
  });

  it("treats nested pages as active without prefix collisions", () => {
    expect(isSettingsEntryActive("/settings/scanners", "/settings/scanners/3")).toBe(true);
    expect(isSettingsEntryActive("/settings/users", "/settings/users")).toBe(true);
    expect(
      isSettingsEntryActive("/settings/scan-profiles", "/settings/scan-profiles/scripts/x"),
    ).toBe(true);
    expect(isSettingsEntryActive("/settings/scan", "/settings/scan-profiles")).toBe(false);
  });
});
