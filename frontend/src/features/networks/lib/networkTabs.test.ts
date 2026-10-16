import { describe, expect, it } from "vitest";

import { parseNetworkTab } from "./networkTabs";

describe("parseNetworkTab", () => {
  it.each(["ports", "scans", "rules", "settings"])("keeps %s", (tab) => {
    expect(parseNetworkTab(tab)).toBe(tab);
  });

  it.each([undefined, "", "overview", "configuration", 3])(
    "falls back to ports for %s",
    (tab) => {
      expect(parseNetworkTab(tab)).toBe("ports");
    },
  );
});
