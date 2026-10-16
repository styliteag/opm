import { describe, expect, it } from "vitest";

import { buildScansQuery, parseScansSearch, SCANS_PAGE_SIZE } from "./scansQuery";

describe("buildScansQuery", () => {
  it("defaults to the newest page of visible scans", () => {
    const p = new URLSearchParams(buildScansQuery({ status: "all", page: 0 }));
    expect(p.getAll("status")).toEqual([]);
    expect(p.get("limit")).toBe(String(SCANS_PAGE_SIZE));
    expect(p.get("offset")).toBe("0");
    expect(p.get("include_hidden")).toBeNull();
  });

  it("maps the active preset to planned + running", () => {
    const p = new URLSearchParams(buildScansQuery({ status: "active", page: 0 }));
    expect(p.getAll("status")).toEqual(["planned", "running"]);
  });

  it("passes network, hidden and page offset", () => {
    const p = new URLSearchParams(
      buildScansQuery({ status: "failed", networkId: 4, showHidden: true, page: 2 }),
    );
    expect(p.getAll("status")).toEqual(["failed"]);
    expect(p.get("network_id")).toBe("4");
    expect(p.get("include_hidden")).toBe("true");
    expect(p.get("offset")).toBe(String(2 * SCANS_PAGE_SIZE));
  });
});

describe("parseScansSearch", () => {
  it("keeps valid values and drops junk", () => {
    expect(parseScansSearch({ network_id: "4", status: "failed" })).toEqual({
      network_id: 4,
      status: "failed",
    });
    expect(parseScansSearch({ network_id: "x", status: "bogus" })).toEqual({});
  });
});
