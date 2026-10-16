import { describe, expect, it } from "vitest";

import type { NetworkFormData } from "../networkFormSchema";
import { advancedSummary } from "./advancedSummary";

function values(over: Partial<NetworkFormData> = {}): NetworkFormData {
  return {
    scanner_type: "masscan",
    scan_protocol: "tcp",
    scan_rate: 1000,
    scan_timeout: 60,
    exclude_ports: "",
    schedule_mode: "manual",
    ssh_probe_enabled: true,
    ...over,
  } as NetworkFormData;
}

describe("advancedSummary", () => {
  it("summarises engine, protocol, rate, timeout and SSH check", () => {
    expect(advancedSummary(values())).toBe(
      "masscan · TCP · 1,000 pps · 60 min timeout · SSH check on",
    );
  });

  it("mentions exclusions, custom schedules and a disabled SSH check", () => {
    expect(
      advancedSummary(
        values({
          scanner_type: "nmap",
          scan_protocol: "both",
          exclude_ports: "22,3389",
          schedule_mode: "custom",
          ssh_probe_enabled: false,
        }),
      ),
    ).toBe(
      "nmap · TCP+UDP · 1,000 pps · 60 min timeout · SSH check off · excludes 22,3389 · custom schedule",
    );
  });

  it("drops rate and SSH for deep vulnerability scans", () => {
    expect(
      advancedSummary(values({ scanner_type: "greenbone", scan_timeout: undefined })),
    ).toBe("Greenbone / GVM");
  });
});
