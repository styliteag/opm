import { describe, expect, it } from "vitest";

import { scannerKindBadge } from "@/features/scanners/lib/scannerKind";

describe("scannerKindBadge", () => {
  it("uses plain labels and keeps the tool name in the tooltip", () => {
    expect(scannerKindBadge("standard")).toEqual({
      label: "Port scans",
      title: "Standard scanner: masscan / nmap / nuclei",
      variant: "neutral",
    });
    expect(scannerKindBadge("gvm")).toEqual({
      label: "Deep scans",
      title: "Greenbone / GVM scanner",
      variant: "warning",
    });
    expect(scannerKindBadge("unified")).toEqual({
      label: "Port + deep scans",
      title: "Unified scanner: masscan / nmap / nuclei and Greenbone / GVM",
      variant: "info",
    });
  });

  it("falls back to the standard badge for unknown kinds", () => {
    expect(scannerKindBadge("other").label).toBe("Port scans");
  });
});
