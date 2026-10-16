import { describe, expect, it } from "vitest";

import { scansRedirectTarget } from "./scansRedirect";

describe("scansRedirectTarget", () => {
  it("sends a network filter to that network's Scans tab", () => {
    expect(scansRedirectTarget({ network_id: 7 })).toEqual({
      to: "/networks/$networkId",
      params: { networkId: "7" },
      search: { tab: "scans" },
    });
    expect(scansRedirectTarget({ network_id: "12" })).toEqual({
      to: "/networks/$networkId",
      params: { networkId: "12" },
      search: { tab: "scans" },
    });
  });

  it.each([{}, { network_id: "abc" }, { network_id: 0 }, { network_id: -3 }])(
    "falls back to the Networks list for %o",
    (search) => {
      expect(scansRedirectTarget(search)).toEqual({ to: "/networks" });
    },
  );
});
