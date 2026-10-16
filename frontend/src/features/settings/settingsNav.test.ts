import { describe, it, expect } from "vitest";

import {
  defaultSettingsPath,
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
});
