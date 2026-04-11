import * as z from "zod/v4";

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
  nuclei_enabled: z.boolean().default(false),
  nuclei_tags: z.string().optional(),
  nuclei_severity: z
    .enum(["info", "low", "medium", "high", "critical"])
    .optional(),
  nuclei_timeout: z.preprocess(
    (val) =>
      val === "" || val === undefined || val === null ? undefined : Number(val),
    z.number().min(60).max(7200).optional(),
  ),
  email_recipients: z.string().optional(),
});

export type NetworkFormData = z.infer<typeof networkFormSchema>;
