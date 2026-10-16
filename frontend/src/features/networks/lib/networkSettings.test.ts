import { describe, expect, it } from "vitest";

import type { Network } from "@/lib/types";

import { networkSettingsSections } from "./networkSettings";

function net(over: Partial<Network> = {}): Network {
  return {
    id: 1,
    name: "Office",
    cidr: "10.0.0.0/24",
    port_spec: "1-65535",
    scanner_id: 2,
    scanner_type: "masscan",
    scan_protocol: "tcp",
    scan_rate: 1000,
    scan_timeout: 3600,
    port_timeout: 1500,
    scan_schedule: null,
    scan_schedule_enabled: true,
    schedule_description: null,
    alert_config: null,
    nse_profile_id: null,
    host_discovery_enabled: true,
    ssh_probe_enabled: true,
    nuclei_enabled: false,
    nuclei_tags: null,
    nuclei_exclude_tags: null,
    nuclei_severity: null,
    nuclei_timeout: null,
    nuclei_sni_enabled: false,
    gvm_scan_config: null,
    gvm_port_list: null,
    gvm_keep_reports: true,
    gvm_alert_severity: null,
    ...over,
  } as Network;
}

function value(sections: ReturnType<typeof networkSettingsSections>, label: string) {
  return sections.flatMap((s) => s.rows).find((r) => r.label === label)?.value;
}

describe("networkSettingsSections", () => {
  it("describes the basics in plain words", () => {
    const s = networkSettingsSections(net(), { scanner: "dmz-1" });
    expect(value(s, "Scanner")).toBe("dmz-1");
    expect(value(s, "Scan type")).toBe("Port scan — fast (masscan)");
    expect(value(s, "Ports")).toBe("All ports (1–65535)");
    expect(value(s, "Schedule")).toBe("Manual only");
    expect(value(s, "Check for vulnerabilities")).toBe("No");
  });

  it("shows custom ports, exclusions and a paused schedule", () => {
    const s = networkSettingsSections(
      net({
        port_spec: "22,80,!8080",
        scan_schedule: "{}",
        schedule_description: "Daily at 02:00",
        scan_schedule_enabled: false,
      }),
    );
    expect(value(s, "Ports")).toBe("22,80");
    expect(value(s, "Excluded ports")).toBe("8080");
    expect(value(s, "Schedule")).toBe("Daily at 02:00 (paused)");
  });

  it("uses the scanner's 2h nuclei default and the high threshold default", () => {
    const s = networkSettingsSections(net({ nuclei_enabled: true }));
    expect(value(s, "Check for vulnerabilities")).toBe("Yes (nuclei)");
    expect(value(s, "Timeout")).toBe("2h (default)");
    expect(value(s, "Alert threshold")).toBe("high (default)");
  });

  it("adds the Greenbone block and drops port-scan knobs", () => {
    const s = networkSettingsSections(net({ scanner_type: "greenbone" }));
    expect(value(s, "Check for vulnerabilities")).toBe("Always (Greenbone)");
    expect(value(s, "Scan config")).toBe("Full and fast");
    expect(value(s, "Rate")).toBeUndefined();
  });

  it("counts SSH overrides and lists recipients", () => {
    const s = networkSettingsSections(
      net({
        alert_config: {
          ssh_weak_kex: true,
          ssh_insecure_auth: false,
          email_recipients: ["a@x.de", "b@x.de"],
        },
      }),
    );
    expect(value(s, "SSH alert overrides")).toBe("2 overridden");
    expect(value(s, "Alert recipients")).toBe("a@x.de, b@x.de");
  });
});
