import * as z from "zod/v4";

const sshOverrideEnum = z.enum(["inherit", "on", "off"]).default("inherit");

export const networkFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  cidr: z.string().min(1, "CIDR is required"),
  port_spec: z.string().min(1, "Port spec is required"),
  scanner_id: z.coerce.number().min(1, "Scanner is required"),
  scanner_type: z.enum(["masscan", "nmap", "greenbone"]),
  scan_protocol: z.enum(["tcp", "udp", "both"]),
  scan_rate: z.coerce.number().optional(),
  scan_timeout: z.preprocess(
    (val) =>
      val === "" || val === undefined || val === null ? undefined : Number(val),
    z.number().min(60).max(86400).optional(),
  ),
  port_timeout: z.preprocess(
    (val) =>
      val === "" || val === undefined || val === null ? undefined : Number(val),
    z.number().min(100).max(30000).optional(),
  ),
  scan_schedule: z.string().optional(),
  nse_profile_id: z.preprocess(
    (val) =>
      val === "" || val === undefined || val === null ? undefined : Number(val),
    z.number().optional(),
  ),
  gvm_keep_reports: z.boolean().default(true),
  ssh_probe_enabled: z.boolean().default(true),
  nuclei_enabled: z.boolean().default(false),
  nuclei_tags: z.string().optional(),
  nuclei_severity: z.preprocess(
    (val) => (val === "" || val === null ? undefined : val),
    z.enum(["info", "low", "medium", "high", "critical"]).optional(),
  ),
  nuclei_timeout: z.preprocess(
    (val) =>
      val === "" || val === undefined || val === null ? undefined : Number(val),
    z.number().min(60).max(7200).optional(),
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
      "Format z. B. 8.0 oder 8.0.0",
    ),
});

export type NetworkFormData = z.infer<typeof networkFormSchema>;

export type SshOverrideValue = "inherit" | "on" | "off";
