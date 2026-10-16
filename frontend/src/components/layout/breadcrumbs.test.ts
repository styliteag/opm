import { describe, it, expect } from "vitest";

import { breadcrumbSegments } from "./breadcrumbs";

describe("breadcrumbSegments", () => {
  it("labels the root as Home", () => {
    expect(breadcrumbSegments("/")).toEqual(["Home"]);
  });

  it("uses readable labels for settings paths", () => {
    expect(breadcrumbSegments("/settings/scan-profiles")).toEqual([
      "Settings",
      "Scan profiles",
    ]);
    expect(breadcrumbSegments("/settings/security")).toEqual([
      "Settings",
      "Account security",
    ]);
  });

  it("keeps ids and script names verbatim", () => {
    expect(breadcrumbSegments("/settings/scanners/3")).toEqual([
      "Settings",
      "Scanners",
      "3",
    ]);
    expect(
      breadcrumbSegments("/settings/scan-profiles/scripts/custom_http-title"),
    ).toEqual(["Settings", "Scan profiles", "Scripts", "custom_http-title"]);
  });
});
