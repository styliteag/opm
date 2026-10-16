import { describe, expect, it } from "vitest";

import type { Network, ScanSummary } from "@/lib/types";

import {
  networkOverridesSsh,
  nextRunText,
  sortNetworks,
  visibleScans,
} from "./networkList";

function net(over: Partial<Network>): Network {
  return {
    id: 1,
    name: "A",
    scanner_id: 1,
    scan_schedule: null,
    scan_schedule_enabled: true,
    next_fire_time: null,
    alert_config: null,
    ...over,
  } as Network;
}

const ctx = {
  latestScans: new Map<number, ScanSummary | null>([
    [1, { completed_at: "2026-10-15T10:00:00" } as ScanSummary],
    [2, { completed_at: "2026-10-16T10:00:00" } as ScanSummary],
    [3, null],
  ]),
  scannerNames: new Map([
    [1, "zeta"],
    [2, "alpha"],
  ]),
};

const list = [
  net({ id: 1, name: "Bravo", scanner_id: 1, next_fire_time: "2026-10-17T02:00:00" }),
  net({ id: 2, name: "alpha", scanner_id: 2, next_fire_time: "2026-10-16T22:00:00" }),
  net({ id: 3, name: "Charlie", scanner_id: 2 }),
];

const ids = (networks: Network[]) => networks.map((n) => n.id);

describe("sortNetworks", () => {
  it("sorts by name both ways", () => {
    expect(ids(sortNetworks(list, "name", "asc", ctx))).toEqual([2, 1, 3]);
    expect(ids(sortNetworks(list, "name", "desc", ctx))).toEqual([3, 1, 2]);
  });

  it("keeps networks without a next run last", () => {
    expect(ids(sortNetworks(list, "next_run", "asc", ctx))).toEqual([2, 1, 3]);
    expect(ids(sortNetworks(list, "next_run", "desc", ctx))).toEqual([1, 2, 3]);
  });

  it("treats paused schedules as no next run", () => {
    const paused = [
      net({ id: 1, next_fire_time: "2026-10-17T02:00:00", scan_schedule_enabled: false }),
      net({ id: 2, next_fire_time: "2026-10-18T02:00:00" }),
    ];
    expect(ids(sortNetworks(paused, "next_run", "asc", ctx))).toEqual([2, 1]);
  });

  it("sorts by last run, never-run last", () => {
    expect(ids(sortNetworks(list, "last_run", "desc", ctx))).toEqual([2, 1, 3]);
  });

  it("sorts by scanner name", () => {
    expect(ids(sortNetworks(list, "scanner", "asc", ctx))).toEqual([2, 3, 1]);
  });

  it("does not mutate the input", () => {
    const copy = [...list];
    sortNetworks(list, "name", "desc", ctx);
    expect(list).toEqual(copy);
  });
});

describe("nextRunText", () => {
  const until = (iso: string | null) => (iso ? "in 2h" : null);

  it("says Manual without a schedule", () => {
    expect(nextRunText(net({}), until)).toBe("Manual");
  });

  it("says Paused for a paused schedule", () => {
    expect(
      nextRunText(net({ scan_schedule: "x", scan_schedule_enabled: false }), until),
    ).toBe("Paused");
  });

  it("shows the relative next run", () => {
    expect(
      nextRunText(net({ scan_schedule: "x", next_fire_time: "2026-10-16T12:00:00" }), until),
    ).toBe("in 2h");
  });
});

describe("networkOverridesSsh", () => {
  it("detects SSH keys in alert_config", () => {
    expect(networkOverridesSsh(net({ alert_config: { ssh_weak_kex: true } }))).toBe(true);
    expect(networkOverridesSsh(net({ alert_config: { email_recipients: [] } }))).toBe(false);
    expect(networkOverridesSsh(net({}))).toBe(false);
  });
});

describe("visibleScans", () => {
  const scans = [
    { id: 1, hidden: false },
    { id: 2, hidden: true },
  ] as ScanSummary[];

  it("drops hidden scans by default and shows them on request", () => {
    expect(visibleScans(scans, false).map((s) => s.id)).toEqual([1]);
    expect(visibleScans(scans, true).map((s) => s.id)).toEqual([1, 2]);
  });
});
