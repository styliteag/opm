import { describe, it, expect } from "vitest";

import {
  parseRulesTab,
  parseScanProfileTab,
  parseUsersTab,
  rulesTabFromAlerting,
  scanProfileTabFromScanTemplates,
} from "./settingsTabs";

describe("settings tab parsing", () => {
  it("keeps only non-default rules tabs", () => {
    expect(parseRulesTab("findings")).toBe("findings");
    expect(parseRulesTab("ssh")).toBe("ssh");
    expect(parseRulesTab("ports")).toBeUndefined();
    expect(parseRulesTab("bogus")).toBeUndefined();
  });

  it("keeps only non-default scan profile tabs", () => {
    expect(parseScanProfileTab("scripts")).toBe("scripts");
    expect(parseScanProfileTab("gvm")).toBe("gvm");
    expect(parseScanProfileTab("nse")).toBeUndefined();
  });

  it("parses the users roles tab", () => {
    expect(parseUsersTab("roles")).toBe("roles");
    expect(parseUsersTab("users")).toBeUndefined();
  });
});

describe("v3 hub tab mapping", () => {
  it("maps /alerting tabs onto Settings → Rules", () => {
    expect(rulesTabFromAlerting(undefined)).toBeUndefined();
    expect(rulesTabFromAlerting("rules")).toBeUndefined();
    expect(rulesTabFromAlerting("severity")).toBe("findings");
    expect(rulesTabFromAlerting("ssh")).toBe("ssh");
  });

  it("maps /scan-templates tabs onto Settings → Scan profiles", () => {
    expect(scanProfileTabFromScanTemplates("profiles")).toBeUndefined();
    expect(scanProfileTabFromScanTemplates("scripts")).toBe("scripts");
    expect(scanProfileTabFromScanTemplates("gvm")).toBe("gvm");
  });
});
