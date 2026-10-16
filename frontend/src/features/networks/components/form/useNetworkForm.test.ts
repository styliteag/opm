import { describe, it, expect } from "vitest";

import type { Network, ScanPhase } from "@/lib/types";
import { COMMON_PORTS } from "../../lib/portPresets";
import type { NetworkFormData } from "../networkFormSchema";
import {
  buildNetworkDefaults,
  buildNetworkPayload,
  buildSshOverridesPayload,
  readSshOverrides,
} from "./useNetworkForm";

function formData(overrides: Partial<NetworkFormData> = {}): NetworkFormData {
  return {
    name: "Test",
    cidr: "10.0.0.0/24",
    port_preset: "all",
    port_spec: "",
    exclude_ports: "",
    scanner_id: 1,
    scanner_type: "masscan",
    scan_protocol: "tcp",
    scan_rate: 1000,
    scan_timeout: 60,
    port_timeout: 1500,
    schedule_mode: "manual",
    schedule_time: "02:00",
    schedule_day: "mon",
    host_discovery_enabled: true,
    gvm_keep_reports: true,
    ssh_probe_enabled: true,
    nuclei_enabled: false,
    nuclei_tags: "cve",
    nuclei_exclude_tags: "dos",
    nuclei_sni_enabled: false,
    email_recipients: "",
    ssh_override_insecure_auth: "inherit",
    ssh_override_weak_cipher: "inherit",
    ssh_override_weak_kex: "inherit",
    ssh_override_outdated_version: "inherit",
    ssh_override_config_regression: "inherit",
    ssh_override_version_threshold: "",
    ...overrides,
  } as NetworkFormData;
}

const baseCtx = {
  isGreenbone: false,
  phases: null,
  gvmScanConfig: "Full and fast",
  gvmPortList: "",
  sourceAlertConfig: null,
};

describe("buildNetworkPayload", () => {
  it("converts timeout minutes to seconds", () => {
    const payload = buildNetworkPayload(formData({ scan_timeout: 90 }), baseCtx);
    expect(payload.scan_timeout).toBe(5400);
  });

  it("nulls GVM fields for non-greenbone scanners", () => {
    const payload = buildNetworkPayload(formData(), baseCtx);
    expect(payload.gvm_scan_config).toBeNull();
    expect(payload.gvm_port_list).toBeNull();
    expect(payload.gvm_alert_severity).toBeNull();
  });

  it("nulls phases and nuclei for greenbone", () => {
    const phases: ScanPhase[] = [
      { name: "port_scan", enabled: true, tool: "masscan", config: {} },
    ];
    const payload = buildNetworkPayload(
      formData({ scanner_type: "greenbone", nuclei_enabled: true }),
      { ...baseCtx, isGreenbone: true, phases, gvmPortList: "All TCP" },
    );
    expect(payload.phases).toBeNull();
    expect(payload.nuclei_enabled).toBe(false);
    expect(payload.nuclei_tags).toBeNull();
    expect(payload.gvm_scan_config).toBe("Full and fast");
    expect(payload.gvm_port_list).toBe("All TCP");
  });

  it("patches the port_scan phase tool to the scanner type", () => {
    const phases: ScanPhase[] = [
      { name: "port_scan", enabled: true, tool: "masscan", config: {} },
      { name: "vulnerability", enabled: true, tool: "nmap_nse", config: {} },
    ];
    const payload = buildNetworkPayload(
      formData({ scanner_type: "nmap" }),
      { ...baseCtx, phases },
    );
    const result = payload.phases as ScanPhase[];
    expect(result[0].tool).toBe("nmap");
    expect(result[1].tool).toBe("nmap_nse");
  });

  it("clears nuclei config when nuclei is disabled", () => {
    const payload = buildNetworkPayload(
      formData({ nuclei_enabled: false, nuclei_tags: "cve" }),
      baseCtx,
    );
    expect(payload.nuclei_enabled).toBe(false);
    expect(payload.nuclei_tags).toBeNull();
    expect(payload.nuclei_timeout).toBeNull();
  });

  it("keeps nuclei config and converts its timeout when enabled", () => {
    const payload = buildNetworkPayload(
      formData({ nuclei_enabled: true, nuclei_timeout: 120 }),
      baseCtx,
    );
    expect(payload.nuclei_enabled).toBe(true);
    expect(payload.nuclei_tags).toBe("cve");
    expect(payload.nuclei_timeout).toBe(7200);
  });

  it("builds alert_config from recipients + non-inherit SSH overrides", () => {
    const payload = buildNetworkPayload(
      formData({
        email_recipients: "a@x.de, b@x.de",
        ssh_override_weak_cipher: "off",
        ssh_override_insecure_auth: "on",
      }),
      baseCtx,
    );
    expect(payload.alert_config).toEqual({
      email_recipients: ["a@x.de", "b@x.de"],
      ssh_weak_cipher: false,
      ssh_insecure_auth: true,
    });
  });

  it("carries unmanaged alert_config keys, drops managed ones", () => {
    const payload = buildNetworkPayload(formData(), {
      ...baseCtx,
      sourceAlertConfig: {
        smtp_override: "custom",
        email_recipients: ["old@x.de"],
        ssh_weak_kex: true,
      },
    });
    // inherit → managed keys removed; unmanaged key rides along
    expect(payload.alert_config).toEqual({ smtp_override: "custom" });
  });

  it("returns null alert_config when nothing is set", () => {
    const payload = buildNetworkPayload(formData(), baseCtx);
    expect(payload.alert_config).toBeNull();
  });
});

describe("buildNetworkPayload ports + schedule presets", () => {
  it("maps the All preset to 1-65535", () => {
    const payload = buildNetworkPayload(formData(), baseCtx);
    expect(payload.port_spec).toBe("1-65535");
  });

  it("maps the Common preset and appends exclusions", () => {
    const payload = buildNetworkPayload(
      formData({ port_preset: "common", exclude_ports: "22,3389" }),
      baseCtx,
    );
    expect(payload.port_spec).toBe(`${COMMON_PORTS},!22,!3389`);
  });

  it("uses the custom port list", () => {
    const payload = buildNetworkPayload(
      formData({ port_preset: "custom", port_spec: "80, 443" }),
      baseCtx,
    );
    expect(payload.port_spec).toBe("80,443");
  });

  it("sends scan_schedule null for Manual only (clears it on update)", () => {
    const payload = buildNetworkPayload(
      formData({ schedule_mode: "manual", scan_schedule: "0 2 * * *" }),
      baseCtx,
    );
    expect(payload).toHaveProperty("scan_schedule", null);
  });

  it("builds daily and weekly schedules", () => {
    expect(
      buildNetworkPayload(
        formData({ schedule_mode: "daily", schedule_time: "03:30" }),
        baseCtx,
      ).scan_schedule,
    ).toBe('{"type":"daily","hour":3,"minute":30}');
    expect(
      buildNetworkPayload(
        formData({
          schedule_mode: "weekly",
          schedule_day: "sat",
          schedule_time: "01:00",
        }),
        baseCtx,
      ).scan_schedule,
    ).toBe('{"type":"weekly","days":["sat"],"hour":1,"minute":0}');
  });

  it("keeps a custom schedule verbatim", () => {
    const raw = '{"type":"interval_hours","hours":4}';
    const payload = buildNetworkPayload(
      formData({ schedule_mode: "custom", scan_schedule: raw }),
      baseCtx,
    );
    expect(payload.scan_schedule).toBe(raw);
  });

  it("sends nse_profile_id null when no profile is chosen", () => {
    const payload = buildNetworkPayload(formData(), baseCtx);
    expect(payload).toHaveProperty("nse_profile_id", null);
    expect(
      buildNetworkPayload(formData({ nse_profile_id: 3 }), baseCtx)
        .nse_profile_id,
    ).toBe(3);
  });

  it("never sends UI-only fields", () => {
    const payload = buildNetworkPayload(formData(), baseCtx);
    for (const key of [
      "port_preset",
      "exclude_ports",
      "schedule_mode",
      "schedule_time",
      "schedule_day",
      "ssh_override_weak_cipher",
      "email_recipients",
    ]) {
      expect(payload).not.toHaveProperty(key);
    }
    expect(payload.host_discovery_enabled).toBe(true);
  });

  it("drops the removed port_range / exclude_ports phase overrides", () => {
    const phases: ScanPhase[] = [
      {
        name: "port_scan",
        enabled: true,
        tool: "masscan",
        config: { port_range: "1-100", exclude_ports: "22", max_retries: 3 },
      },
    ];
    const payload = buildNetworkPayload(formData(), { ...baseCtx, phases });
    expect((payload.phases as ScanPhase[])[0].config).toEqual({
      max_retries: 3,
    });
  });
});

describe("readSshOverrides / buildSshOverridesPayload", () => {
  it("round-trips tri-state values", () => {
    const config = { ssh_weak_cipher: false, ssh_insecure_auth: true };
    const fields = readSshOverrides(config);
    expect(fields.ssh_override_weak_cipher).toBe("off");
    expect(fields.ssh_override_insecure_auth).toBe("on");
    expect(fields.ssh_override_weak_kex).toBe("inherit");

    const back = buildSshOverridesPayload(formData(fields));
    expect(back).toEqual(config);
  });
});

function network(over: Partial<Network>): Network {
  return {
    id: 1,
    name: "Office",
    cidr: "10.0.0.0/24",
    port_spec: "1-65535",
    scanner_id: 2,
    scanner_type: "masscan",
    scan_protocol: "tcp",
    scan_timeout: 3600,
    scan_schedule: null,
    phases: null,
    alert_config: null,
    host_discovery_enabled: false,
    ...over,
  } as Network;
}

describe("buildNetworkDefaults", () => {
  it("prefixes the name when cloning", () => {
    const defaults = buildNetworkDefaults(
      {
        id: 1,
        name: "Office",
        cidr: "10.0.0.0/24",
        port_spec: "1-1000",
        scanner_id: 2,
        scanner_type: "nmap",
        scan_protocol: "tcp",
        scan_timeout: 3600,
        alert_config: null,
      } as never,
      { cloneName: true },
    );
    expect(defaults.name).toBe("Copy of Office");
    // seconds → minutes
    expect(defaults.scan_timeout).toBe(60);
  });

  it("provides safe create defaults without a source", () => {
    const defaults = buildNetworkDefaults(undefined);
    expect(defaults.scanner_type).toBe("masscan");
    expect(defaults.port_preset).toBe("all");
    expect(defaults.schedule_mode).toBe("manual");
    expect(defaults.ssh_override_weak_cipher).toBe("inherit");
  });

  it("detects presets from an existing network", () => {
    const defaults = buildNetworkDefaults(
      network({
        port_spec: "22,80,!8080",
        scan_schedule: '{"type":"daily","hour":4,"minute":0}',
      }),
    );
    expect(defaults.port_preset).toBe("custom");
    expect(defaults.port_spec).toBe("22,80");
    expect(defaults.exclude_ports).toBe("8080");
    expect(defaults.schedule_mode).toBe("daily");
    expect(defaults.schedule_time).toBe("04:00");
  });

  it("shows complex schedules as custom", () => {
    const raw = '{"type":"monthly_date","day":1,"hour":2,"minute":0}';
    const defaults = buildNetworkDefaults(network({ scan_schedule: raw }));
    expect(defaults.schedule_mode).toBe("custom");
    expect(defaults.scan_schedule).toBe(raw);
  });

  it("folds a phase port_range override into the ports and keeps exclusions", () => {
    const defaults = buildNetworkDefaults(
      network({
        port_spec: "1-65535",
        phases: [
          {
            name: "port_scan",
            enabled: true,
            tool: "masscan",
            config: { port_range: "80,443", exclude_ports: "8443" },
          },
        ],
      }),
    );
    expect(defaults.port_preset).toBe("custom");
    expect(defaults.port_spec).toBe("80,443");
    expect(defaults.exclude_ports).toBe("8443");
  });
});
