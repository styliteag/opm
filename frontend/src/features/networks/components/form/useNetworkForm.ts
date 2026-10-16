import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import type { Network, ScanPhase } from "@/lib/types";
import {
  networkFormSchema,
  type NetworkFormData,
  type SshOverrideValue,
} from "../networkFormSchema";
import { buildPortSpec, parsePortSpec } from "../../lib/portPresets";
import { parseSchedule, scheduleToValue } from "../../lib/schedulePresets";

/**
 * Form state + payload mapping for the one-page network form (create, edit,
 * clone — ADR 0011). Presets (ports, schedule) are UI-only fields mapped
 * to port_spec / scan_schedule here so the backend schema is unchanged.
 */

export const SSH_ALERT_CONFIG_KEYS = [
  "ssh_insecure_auth",
  "ssh_weak_cipher",
  "ssh_weak_kex",
  "ssh_outdated_version",
  "ssh_config_regression",
  "ssh_version_threshold",
] as const;

/**
 * Map an existing alert_config blob to the SSH override form fields. Boolean
 * keys missing from the blob become "inherit". The version threshold maps to
 * an empty string (= inherit) when absent.
 */
export function readSshOverrides(
  alertConfig: Record<string, unknown> | null | undefined,
): {
  ssh_override_insecure_auth: SshOverrideValue;
  ssh_override_weak_cipher: SshOverrideValue;
  ssh_override_weak_kex: SshOverrideValue;
  ssh_override_outdated_version: SshOverrideValue;
  ssh_override_config_regression: SshOverrideValue;
  ssh_override_version_threshold: string;
} {
  const tri = (key: string): SshOverrideValue => {
    const v = alertConfig?.[key];
    if (v === true) return "on";
    if (v === false) return "off";
    return "inherit";
  };
  const threshold = alertConfig?.ssh_version_threshold;
  return {
    ssh_override_insecure_auth: tri("ssh_insecure_auth"),
    ssh_override_weak_cipher: tri("ssh_weak_cipher"),
    ssh_override_weak_kex: tri("ssh_weak_kex"),
    ssh_override_outdated_version: tri("ssh_outdated_version"),
    ssh_override_config_regression: tri("ssh_config_regression"),
    ssh_override_version_threshold:
      typeof threshold === "string" ? threshold : "",
  };
}

/**
 * Inverse of `readSshOverrides`. Builds the SSH-related slice of alert_config
 * from form values, omitting any field set to "inherit" / empty.
 */
export function buildSshOverridesPayload(
  data: NetworkFormData,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const apply = (field: SshOverrideValue, key: string) => {
    if (field === "on") out[key] = true;
    else if (field === "off") out[key] = false;
  };
  apply(data.ssh_override_insecure_auth, "ssh_insecure_auth");
  apply(data.ssh_override_weak_cipher, "ssh_weak_cipher");
  apply(data.ssh_override_weak_kex, "ssh_weak_kex");
  apply(data.ssh_override_outdated_version, "ssh_outdated_version");
  apply(data.ssh_override_config_regression, "ssh_config_regression");
  if (data.ssh_override_version_threshold) {
    out.ssh_version_threshold = data.ssh_override_version_threshold;
  }
  return out;
}

/** Phase-level port overrides the one-page form no longer shows (ADR 0011). */
const REMOVED_PORT_SCAN_KEYS = ["port_range", "exclude_ports"] as const;

/**
 * Ports the scanner actually uses: a non-empty port_scan `port_range`
 * override replaces port_spec (scanner orchestration), so the form shows
 * that. The phase's `exclude_ports` was never read by the scanner; it is
 * shown as an exclusion so saving makes the user's intent effective.
 */
function sourcePorts(source: Network): ReturnType<typeof parsePortSpec> {
  const config =
    source.phases?.find((p) => p.name === "port_scan")?.config ?? {};
  const override =
    typeof config.port_range === "string" ? config.port_range.trim() : "";
  const parsed = parsePortSpec(override || source.port_spec);
  const deadExclude =
    typeof config.exclude_ports === "string" ? config.exclude_ports.trim() : "";
  if (!deadExclude) return parsed;
  return {
    ...parsed,
    exclude: [parsed.exclude, deadExclude].filter(Boolean).join(","),
  };
}

const CREATE_DEFAULTS = {
  scanner_type: "masscan",
  scan_protocol: "tcp",
  port_preset: "all",
  port_spec: "",
  exclude_ports: "",
  scan_rate: 1000,
  scan_timeout: 60,
  port_timeout: 1500,
  schedule_mode: "manual",
  schedule_time: "02:00",
  schedule_day: "mon",
  scan_schedule: "",
  host_discovery_enabled: true,
  gvm_keep_reports: true,
  ssh_probe_enabled: true,
  nuclei_enabled: false,
  nuclei_sni_enabled: false,
  nuclei_tags: "cve,exposure,misconfig,tech",
  nuclei_exclude_tags: "fuzz,dos,intrusive",
  email_recipients: "",
  ssh_override_insecure_auth: "inherit",
  ssh_override_weak_cipher: "inherit",
  ssh_override_weak_kex: "inherit",
  ssh_override_outdated_version: "inherit",
  ssh_override_config_regression: "inherit",
  ssh_override_version_threshold: "",
} as const;

export function buildNetworkDefaults(
  source: Network | undefined,
  options: { cloneName?: boolean } = {},
): NetworkFormData {
  if (!source) {
    return { ...CREATE_DEFAULTS } as unknown as NetworkFormData;
  }
  const ports = sourcePorts(source);
  const schedule = parseSchedule(source.scan_schedule);
  return {
    name: options.cloneName ? `Copy of ${source.name}` : source.name,
    cidr: source.cidr,
    port_preset: ports.preset,
    port_spec: ports.preset === "custom" ? ports.include : "",
    exclude_ports: ports.exclude,
    scanner_id: source.scanner_id,
    scanner_type: source.scanner_type as "masscan" | "nmap" | "greenbone",
    scan_protocol: source.scan_protocol as "tcp" | "udp" | "both",
    scan_rate: source.scan_rate ?? undefined,
    scan_timeout:
      source.scan_timeout != null
        ? Math.round(source.scan_timeout / 60)
        : undefined,
    port_timeout: source.port_timeout ?? undefined,
    schedule_mode: schedule.mode,
    schedule_time: schedule.time,
    schedule_day: schedule.day,
    scan_schedule: schedule.custom,
    host_discovery_enabled: source.host_discovery_enabled ?? true,
    nse_profile_id: source.nse_profile_id ?? undefined,
    gvm_keep_reports: source.gvm_keep_reports ?? true,
    gvm_alert_severity:
      (source.gvm_alert_severity as
        | "info"
        | "low"
        | "medium"
        | "high"
        | "critical"
        | null) ?? undefined,
    ssh_probe_enabled: source.ssh_probe_enabled ?? true,
    nuclei_enabled: source.nuclei_enabled ?? false,
    nuclei_tags: source.nuclei_tags || "cve,exposure,misconfig,tech",
    nuclei_exclude_tags: source.nuclei_exclude_tags || "fuzz,dos,intrusive",
    nuclei_severity:
      (source.nuclei_severity as
        | "info"
        | "low"
        | "medium"
        | "high"
        | "critical"
        | null) ?? undefined,
    nuclei_timeout:
      source.nuclei_timeout != null
        ? Math.round(source.nuclei_timeout / 60)
        : undefined,
    nuclei_sni_enabled: source.nuclei_sni_enabled ?? false,
    email_recipients: (source.alert_config as Record<string, unknown> | null)
      ?.email_recipients
      ? String(
          (source.alert_config as Record<string, unknown>).email_recipients,
        )
      : "",
    ...readSshOverrides(source.alert_config as Record<string, unknown> | null),
  } as NetworkFormData;
}

function cleanPortScanPhase(phase: ScanPhase, tool: string): ScanPhase {
  const config = Object.fromEntries(
    Object.entries(phase.config).filter(
      ([key]) => !(REMOVED_PORT_SCAN_KEYS as readonly string[]).includes(key),
    ),
  );
  return { ...phase, tool, config };
}

export interface NetworkPayloadContext {
  isGreenbone: boolean;
  phases: ScanPhase[] | null;
  gvmScanConfig: string;
  gvmPortList: string;
  sourceAlertConfig: Record<string, unknown> | null;
}

/**
 * Form values → API payload. Rules preserved from the monolithic form:
 * minutes → seconds for timeouts, phases/GVM/nuclei fields nulled based on
 * scanner type, alert_config merged from existing config minus managed keys
 * plus email recipients and non-inherit SSH overrides.
 */
export function buildNetworkPayload(
  data: NetworkFormData,
  ctx: NetworkPayloadContext,
): Record<string, unknown> {
  const {
    email_recipients,
    port_preset,
    exclude_ports,
    schedule_mode,
    schedule_time,
    schedule_day,
    ssh_override_insecure_auth: _a,
    ssh_override_weak_cipher: _b,
    ssh_override_weak_kex: _c,
    ssh_override_outdated_version: _d,
    ssh_override_config_regression: _e,
    ssh_override_version_threshold: _f,
    ...rest
  } = data;
  void _a;
  void _b;
  void _c;
  void _d;
  void _e;
  void _f;

  const { isGreenbone, phases, gvmScanConfig, gvmPortList } = ctx;
  const nucleiActive = !isGreenbone && rest.nuclei_enabled;
  const payload: Record<string, unknown> = {
    ...rest,
    port_spec: buildPortSpec(port_preset, rest.port_spec, exclude_ports),
    // null = Manual only; the key is always present so an update clears it.
    scan_schedule: scheduleToValue({
      mode: schedule_mode,
      time: schedule_time,
      day: schedule_day,
      custom: rest.scan_schedule ?? "",
    }),
    scan_timeout: rest.scan_timeout != null ? rest.scan_timeout * 60 : null,
    // Explicit null so "None" clears an existing profile on update.
    nse_profile_id: rest.nse_profile_id ?? null,
    phases: isGreenbone
      ? null
      : (phases?.map((p) =>
          p.name === "port_scan" ? cleanPortScanPhase(p, rest.scanner_type) : p,
        ) ?? null),
    gvm_scan_config: isGreenbone ? gvmScanConfig : null,
    gvm_port_list: isGreenbone && gvmPortList ? gvmPortList : null,
    gvm_keep_reports: isGreenbone ? rest.gvm_keep_reports : true,
    gvm_alert_severity:
      isGreenbone && rest.gvm_alert_severity ? rest.gvm_alert_severity : null,
    nuclei_enabled: nucleiActive,
    nuclei_tags: nucleiActive && rest.nuclei_tags ? rest.nuclei_tags : null,
    nuclei_exclude_tags:
      nucleiActive && rest.nuclei_exclude_tags
        ? rest.nuclei_exclude_tags
        : null,
    nuclei_severity:
      nucleiActive && rest.nuclei_severity ? rest.nuclei_severity : null,
    nuclei_timeout:
      nucleiActive && rest.nuclei_timeout ? rest.nuclei_timeout * 60 : null,
    nuclei_sni_enabled: nucleiActive && (rest.nuclei_sni_enabled ?? false),
  };

  const baseConfig = ctx.sourceAlertConfig ?? {};
  const carriedConfig: Record<string, unknown> = { ...baseConfig };
  delete carriedConfig.email_recipients;
  for (const key of SSH_ALERT_CONFIG_KEYS) {
    delete carriedConfig[key];
  }

  const sshOverrides = buildSshOverridesPayload(data);
  const recipientsList = email_recipients
    ?.split(",")
    .map((e) => e.trim())
    .filter(Boolean);

  const mergedConfig: Record<string, unknown> = {
    ...carriedConfig,
    ...sshOverrides,
  };
  if (recipientsList && recipientsList.length > 0) {
    mergedConfig.email_recipients = recipientsList;
  }

  payload.alert_config =
    Object.keys(mergedConfig).length > 0 ? mergedConfig : null;

  return payload;
}

export function useNetworkFormState(
  source: Network | undefined,
  options: { cloneName?: boolean } = {},
) {
  const [phases, setPhases] = useState<ScanPhase[] | null>(
    source?.phases ?? null,
  );
  const [gvmScanConfig, setGvmScanConfig] = useState<string>(
    source?.gvm_scan_config ?? "Full and fast",
  );
  const [gvmPortList, setGvmPortList] = useState<string>(
    source?.gvm_port_list ?? "",
  );

  const form = useForm<NetworkFormData>({
    resolver: zodResolver(networkFormSchema),
    defaultValues: buildNetworkDefaults(source, options),
  });

  const watchedScannerType = useWatch({
    control: form.control,
    name: "scanner_type",
  });
  const watchedNucleiEnabled =
    useWatch({ control: form.control, name: "nuclei_enabled" }) ?? false;
  const isGreenbone = watchedScannerType === "greenbone";

  // Nuclei is only supported for masscan/nmap — auto-disable on the flip to
  // greenbone so the backend validator never sees an invalid combination.
  useEffect(() => {
    if (isGreenbone && watchedNucleiEnabled) {
      form.setValue("nuclei_enabled", false, { shouldDirty: true });
      toast.info(
        "Web vulnerability check turned off — a deep vulnerability scan already covers it",
      );
    }
  }, [isGreenbone, watchedNucleiEnabled, form]);

  const buildPayload = (data: NetworkFormData) =>
    buildNetworkPayload(data, {
      isGreenbone,
      phases,
      gvmScanConfig,
      gvmPortList,
      sourceAlertConfig:
        (source?.alert_config as Record<string, unknown> | null) ?? null,
    });

  return {
    form,
    phases,
    setPhases,
    gvmScanConfig,
    setGvmScanConfig,
    gvmPortList,
    setGvmPortList,
    isGreenbone,
    buildPayload,
  };
}

export type NetworkFormState = ReturnType<typeof useNetworkFormState>;
