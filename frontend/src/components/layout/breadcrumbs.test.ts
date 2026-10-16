import { describe, it, expect } from "vitest";

import {
  breadcrumbEntity,
  breadcrumbSegments,
} from "./breadcrumbs";

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

describe("breadcrumbEntity", () => {
  it.each([
    ["/hosts/42", { kind: "host", id: 42, index: 1 }],
    ["/networks/4", { kind: "network", id: 4, index: 1 }],
    ["/networks/4/edit", { kind: "network", id: 4, index: 1 }],
    ["/scans/12", { kind: "scan", id: 12, index: 1 }],
    ["/settings/scanners/3", { kind: "scanner", id: 3, index: 2 }],
    ["/settings/users/7/", { kind: "user", id: 7, index: 2 }],
  ])("recognises %s", (path, expected) => {
    expect(breadcrumbEntity(path)).toEqual(expected);
  });

  it("returns null for list pages and non-numeric ids", () => {
    expect(breadcrumbEntity("/networks")).toBeNull();
    expect(breadcrumbEntity("/networks/new")).toBeNull();
    expect(breadcrumbEntity("/settings/scan-profiles/scripts/x")).toBeNull();
    expect(breadcrumbEntity("/hosts/abc")).toBeNull();
  });
});

describe("breadcrumbSegments with an entity label", () => {
  it("replaces the id segment, not the trailing action", () => {
    expect(breadcrumbSegments("/networks/4/edit", "DMZ")).toEqual([
      "Networks",
      "DMZ",
      "Edit",
    ]);
    expect(breadcrumbSegments("/settings/users/7", "ops@example.com")).toEqual([
      "Settings",
      "Users",
      "ops@example.com",
    ]);
  });

  it("labels scans as Scan #id without a lookup", () => {
    expect(breadcrumbSegments("/scans/12")).toEqual(["Scans", "Scan #12"]);
  });

  it("keeps the id while the name is unknown", () => {
    expect(breadcrumbSegments("/networks/4/edit")).toEqual([
      "Networks",
      "4",
      "Edit",
    ]);
  });
});
