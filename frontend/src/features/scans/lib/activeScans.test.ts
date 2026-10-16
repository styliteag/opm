import { describe, expect, it } from "vitest";

import type { ScanListItem } from "@/lib/types";

import { activeScanLabel, activeScansByNetwork } from "./activeScans";

function scan(overrides: Partial<ScanListItem>): ScanListItem {
  return {
    id: 1,
    network_id: 1,
    network_name: "LAN",
    scanner_id: 1,
    scanner_name: "Local",
    status: "running",
    started_at: null,
    completed_at: null,
    cancelled_at: null,
    cancelled_by: null,
    cancelled_by_email: null,
    error_message: null,
    trigger_type: "manual",
    hidden: false,
    progress_percent: null,
    progress_message: null,
    actual_rate: null,
    port_count: 0,
    ...overrides,
  };
}

describe("activeScanLabel", () => {
  it("shows rounded progress for running scans", () => {
    expect(activeScanLabel(scan({ progress_percent: 44.6 }))).toBe("Running 45%");
  });

  it("shows plain Running without progress", () => {
    expect(activeScanLabel(scan({}))).toBe("Running");
  });

  it("shows Queued for planned scans", () => {
    expect(activeScanLabel(scan({ status: "planned" }))).toBe("Queued");
  });
});

describe("activeScansByNetwork", () => {
  it("keeps one scan per network, preferring a running one", () => {
    const map = activeScansByNetwork([
      scan({ id: 3, network_id: 1, status: "planned" }),
      scan({ id: 2, network_id: 1, status: "running" }),
      scan({ id: 5, network_id: 2, status: "planned" }),
    ]);
    expect(map.get(1)?.id).toBe(2);
    expect(map.get(2)?.id).toBe(5);
    expect(map.size).toBe(2);
  });
});
