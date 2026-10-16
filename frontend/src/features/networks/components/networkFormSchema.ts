import * as z from "zod/v4";

import { isValidPortList } from "../lib/portPresets";
import { WEEKDAYS } from "../lib/schedulePresets";

const sshOverrideEnum = z.enum(["inherit", "on", "off"]).default("inherit");

const PORT_LIST_HINT = "Use ports or ranges, e.g. 22,3389 or 8000-8100";

export const networkFormSchema = z
  .object({
    name: z.string().min(1, "Name is required"),
    cidr: z.string().min(1, "Address range is required"),
    // Ports preset (UI only); port_spec holds the custom include list and is
    // combined with exclude_ports into the stored port_spec on save.
    port_preset: z.enum(["common", "all", "custom"]).default("all"),
    port_spec: z.string().default(""),
    exclude_ports: z
      .string()
      .default("")
      .refine((v) => isValidPortList(v), PORT_LIST_HINT),
    scanner_id: z.coerce.number().min(1, "Scanner is required"),
    scanner_type: z.enum(["masscan", "nmap", "greenbone"]),
    scan_protocol: z.enum(["tcp", "udp", "both"]),
    scan_rate: z.coerce.number().optional(),
    scan_timeout: z.preprocess(
      (val) =>
        val === "" || val === undefined || val === null
          ? undefined
          : Number(val),
      z.number().min(1).max(1440).optional(),
    ),
    port_timeout: z.preprocess(
      (val) =>
        val === "" || val === undefined || val === null
          ? undefined
          : Number(val),
      z.number().min(100).max(30000).optional(),
    ),
    // Schedule preset (UI only) + the raw custom value edited by the
    // ScheduleBuilder; combined into scan_schedule on save.
    schedule_mode: z.enum(["manual", "daily", "weekly", "custom"]).default("manual"),
    schedule_time: z.string().default("02:00"),
    schedule_day: z.enum(WEEKDAYS).default("mon"),
    scan_schedule: z.string().optional(),
    host_discovery_enabled: z.boolean().default(true),
    nse_profile_id: z.preprocess(
      (val) =>
        val === "" || val === undefined || val === null
          ? undefined
          : Number(val),
      z.number().optional(),
    ),
    gvm_keep_reports: z.boolean().default(true),
    gvm_alert_severity: z.preprocess(
      (val) => (val === "" || val === null ? undefined : val),
      z.enum(["info", "low", "medium", "high", "critical"]).optional(),
    ),
    ssh_probe_enabled: z.boolean().default(true),
    nuclei_enabled: z.boolean().default(false),
    nuclei_tags: z.string().default("cve,exposure,misconfig,tech"),
    nuclei_exclude_tags: z.string().default("fuzz,dos,intrusive"),
    nuclei_severity: z.preprocess(
      (val) => (val === "" || val === null ? undefined : val),
      z.enum(["info", "low", "medium", "high", "critical"]).optional(),
    ),
    nuclei_timeout: z.preprocess(
      (val) =>
        val === "" || val === undefined || val === null
          ? undefined
          : Number(val),
      z.number().min(1).max(1440).optional(),
    ),
    nuclei_sni_enabled: z.boolean().default(false),
    email_recipients: z.string().optional(),
    // Per-network SSH alert overrides. "inherit" means: do not set the key in
    // alert_config — global default applies. "on"/"off" force a specific value.
    ssh_override_insecure_auth: sshOverrideEnum,
    ssh_override_weak_cipher: sshOverrideEnum,
    ssh_override_weak_kex: sshOverrideEnum,
    ssh_override_outdated_version: sshOverrideEnum,
    ssh_override_config_regression: sshOverrideEnum,
    // Empty string = inherit. When set, must be a valid OpenSSH version.
    ssh_override_version_threshold: z
      .string()
      .optional()
      .refine(
        (v) => !v || /^\d+(\.\d+){1,2}$/.test(v),
        "Use a version like 8.0 or 8.0.0",
      ),
  })
  .superRefine((data, ctx) => {
    if (data.port_preset !== "custom") return;
    if (!data.port_spec.trim()) {
      ctx.addIssue({
        code: "custom",
        path: ["port_spec"],
        message: "Enter the ports to scan",
      });
    } else if (!isValidPortList(data.port_spec)) {
      ctx.addIssue({ code: "custom", path: ["port_spec"], message: PORT_LIST_HINT });
    }
  });

export type NetworkFormData = z.infer<typeof networkFormSchema>;

export type SshOverrideValue = "inherit" | "on" | "off";
