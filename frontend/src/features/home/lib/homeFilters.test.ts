import { describe, expect, it } from "vitest";

import { hasHomeFilters, parseHomeFilters } from "./homeFilters";

describe("parseHomeFilters", () => {
  it("keeps a trimmed search and a positive network id", () => {
    expect(parseHomeFilters({ search: " 10.0.0.1 ", network_id: "4" })).toEqual({
      search: "10.0.0.1",
      network_id: 4,
    });
  });

  it("drops empty, oversized and invalid values", () => {
    expect(parseHomeFilters({ search: "   ", network_id: "abc" })).toEqual({});
    expect(parseHomeFilters({ search: "x".repeat(201), network_id: -1 })).toEqual({});
    expect(parseHomeFilters({ search: 5, network_id: 2.5 })).toEqual({});
    expect(parseHomeFilters({})).toEqual({});
  });
});

describe("hasHomeFilters", () => {
  it("is true when any filter is set", () => {
    expect(hasHomeFilters({})).toBe(false);
    expect(hasHomeFilters({ search: "db" })).toBe(true);
    expect(hasHomeFilters({ network_id: 2 })).toBe(true);
  });
});
