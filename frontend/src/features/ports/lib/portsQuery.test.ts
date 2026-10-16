import { describe, expect, it } from "vitest";

import {
  buildPortsParams,
  hasNextPage,
  parsePortSearch,
  STALENESS_OPTIONS,
  STATUS_VIEWS,
} from "./portsQuery";

function params(qs: string) {
  const p = new URLSearchParams(qs);
  return {
    status: p.getAll("status"),
    network_id: p.get("network_id"),
    ip_range: p.get("ip_range"),
    service: p.get("service"),
    q: p.get("q"),
    port_min: p.get("port_min"),
    port_max: p.get("port_max"),
    offset: p.get("offset"),
    limit: p.get("limit"),
    sort_by: p.get("sort_by"),
  };
}

describe("STATUS_VIEWS", () => {
  it("maps each view to backend statuses", () => {
    expect(STATUS_VIEWS.decide.statuses).toEqual(["new", "review"]);
    expect(STATUS_VIEWS.expected.statuses).toEqual(["expected"]);
    expect(STATUS_VIEWS.snoozed.statuses).toEqual(["snoozed"]);
    expect(STATUS_VIEWS.all.statuses).toEqual([]);
  });
});

describe("parsePortSearch", () => {
  it.each([
    ["10.0.0.5", { ip_range: "10.0.0.5" }],
    ["10.0.0.0/24", { ip_range: "10.0.0.0/24" }],
    ["10.0.0.1-10.0.0.9", { ip_range: "10.0.0.1-10.0.0.9" }],
    ["2001:db8::1", { ip_range: "2001:db8::1" }],
    ["443", { port_min: 443, port_max: 443 }],
    ["gw.example", { q: "gw.example" }],
    ["  ssh  ", { q: "ssh" }],
    ["", {}],
    ["70000", { q: "70000" }],
    ["10.0.0", { q: "10.0.0" }],
  ])("%s", (input, expected) => {
    expect(parsePortSearch(input)).toEqual(expected);
  });
});

describe("buildPortsParams", () => {
  it("defaults to the To decide view, first page of 50", () => {
    expect(params(buildPortsParams({ view: "decide", page: 0 }))).toEqual({
      status: ["new", "review"],
      network_id: null,
      ip_range: null,
      service: null,
      q: null,
      port_min: null,
      port_max: null,
      offset: "0",
      limit: "50",
      sort_by: "ip",
    });
  });

  it("sends no status for All and pages by 50", () => {
    const p = params(buildPortsParams({ view: "all", page: 2 }));
    expect(p.status).toEqual([]);
    expect(p.offset).toBe("100");
  });

  it("combines network, text search and service chip", () => {
    const p = params(
      buildPortsParams({
        view: "expected",
        page: 0,
        networkId: 7,
        search: "nginx",
        service: "http",
      }),
    );
    expect(p).toMatchObject({
      status: ["expected"],
      network_id: "7",
      q: "nginx",
      service: "http",
    });
  });

  it("keeps an IP search next to a service chip", () => {
    const p = params(
      buildPortsParams({
        view: "all",
        page: 0,
        search: "10.0.0.0/8",
        service: "ssh",
      }),
    );
    expect(p).toMatchObject({ ip_range: "10.0.0.0/8", service: "ssh" });
  });
});

describe("staleness filter", () => {
  const staleness = (qs: string) => new URLSearchParams(qs).get("staleness");

  it("omits the param for All (the backend default)", () => {
    expect(staleness(buildPortsParams({ view: "all", page: 0 }))).toBeNull();
    expect(
      staleness(buildPortsParams({ view: "all", page: 0, staleness: "all" })),
    ).toBeNull();
  });

  it.each(["active", "stale"] as const)("sends staleness=%s", (value) => {
    expect(
      staleness(buildPortsParams({ view: "all", page: 0, staleness: value })),
    ).toBe(value);
  });

  it("offers All / Active / Stale", () => {
    expect(STALENESS_OPTIONS.map((o) => o.label)).toEqual(["All", "Active", "Stale"]);
  });
});

describe("hasNextPage", () => {
  it("uses the total when the API reports one", () => {
    expect(hasNextPage(0, 50, 120)).toBe(true);
    expect(hasNextPage(1, 50, 100)).toBe(false);
    expect(hasNextPage(2, 20, 120)).toBe(false);
  });

  it("falls back to a full page meaning maybe more", () => {
    expect(hasNextPage(0, 50, undefined)).toBe(true);
    expect(hasNextPage(0, 49, undefined)).toBe(false);
  });
});
