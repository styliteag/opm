import { describe, it, expect } from "vitest";

import { breadcrumbSegments, hostIdFromPath } from "./breadcrumbs";

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

  it("replaces the last segment with a resolved label", () => {
    expect(breadcrumbSegments("/hosts/42", "db01.example.com")).toEqual([
      "Hosts",
      "db01.example.com",
    ]);
    expect(breadcrumbSegments("/hosts/42", undefined)).toEqual(["Hosts", "42"]);
  });
});

describe("hostIdFromPath", () => {
  it("extracts the id from a host detail path", () => {
    expect(hostIdFromPath("/hosts/42")).toBe(42);
    expect(hostIdFromPath("/hosts/42/")).toBe(42);
  });

  it("returns null for other paths", () => {
    expect(hostIdFromPath("/hosts")).toBeNull();
    expect(hostIdFromPath("/networks/3")).toBeNull();
    expect(hostIdFromPath("/hosts/abc")).toBeNull();
  });
});
