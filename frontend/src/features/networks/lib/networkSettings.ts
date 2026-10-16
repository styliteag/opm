import { SSH_ALERT_KEYS } from "@/features/admin/hooks/useAdmin";
import type { Network } from "@/lib/types";
import {
  DEFAULT_NUCLEI_TIMEOUT_MIN,
  engineName,
  formatSeconds,
  scanTypeLabel,
} from "./networkLabels";
import { parsePortSpec } from "./portPresets";

export interface SettingRow {
  label: string;
  value: string;
  mono?: boolean;
}

export interface SettingSection {
  title: string;
  rows: SettingRow[];
}

const PROTOCOLS: Record<string, string> = {
  tcp: "TCP",
  udp: "UDP",
  both: "TCP + UDP",
};

function portsText(network: Network): SettingRow[] {
  const { preset, include, exclude } = parsePortSpec(network.port_spec);
  const rows: SettingRow[] = [
    preset === "custom"
      ? { label: "Ports", value: include, mono: true }
      : {
          label: "Ports",
          value: preset === "common" ? "Common ports" : "All ports (1–65535)",
        },
  ];
  if (exclude) rows.push({ label: "Excluded ports", value: exclude, mono: true });
  return rows;
}

function scheduleText(network: Network): string {
  if (!network.scan_schedule) return "Manual only";
  const text = network.schedule_description ?? "Custom schedule";
  return network.scan_schedule_enabled ? text : `${text} (paused)`;
}

function vulnCheckText(network: Network): string {
  if (network.scanner_type === "greenbone") return "Always (Greenbone)";
  return network.nuclei_enabled ? "Yes (nuclei)" : "No";
}

function recipients(network: Network): string {
  const raw = network.alert_config?.email_recipients;
  if (Array.isArray(raw) && raw.length > 0) return raw.join(", ");
  if (typeof raw === "string" && raw) return raw;
  return "Global recipients";
}

function sshOverrideCount(network: Network): number {
  const config = network.alert_config ?? {};
  return SSH_ALERT_KEYS.filter((key) => key in config).length;
}

function thresholdText(value: string | null): string {
  return value ?? "high (default)";
}

/** Read-only, plain-language summary of a network's configuration. */
export function networkSettingsSections(
  network: Network,
  names: { scanner?: string; nseProfile?: string } = {},
): SettingSection[] {
  const greenbone = network.scanner_type === "greenbone";
  const basics: SettingSection = {
    title: "Basics",
    rows: [
      { label: "Address range", value: network.cidr, mono: true },
      { label: "Scanner", value: names.scanner ?? `#${network.scanner_id}` },
      {
        label: "Scan type",
        value: `${scanTypeLabel(network.scanner_type)} (${engineName(network.scanner_type)})`,
      },
      ...portsText(network),
      { label: "Schedule", value: scheduleText(network) },
      { label: "Check for vulnerabilities", value: vulnCheckText(network) },
    ],
  };

  const engine: SettingSection = {
    title: "Advanced",
    rows: greenbone
      ? [
          { label: "Scan timeout", value: network.scan_timeout != null ? formatSeconds(network.scan_timeout) : "Default" },
          { label: "Alert recipients", value: recipients(network) },
        ]
      : [
          { label: "Protocol", value: PROTOCOLS[network.scan_protocol] ?? network.scan_protocol },
          { label: "Rate", value: network.scan_rate != null ? `${network.scan_rate.toLocaleString("en-US")} packets/s` : "Default" },
          { label: "Scan timeout", value: network.scan_timeout != null ? formatSeconds(network.scan_timeout) : "Default" },
          { label: "Port timeout", value: network.port_timeout != null ? `${network.port_timeout} ms` : "Default" },
          { label: "Host discovery after first scan", value: network.host_discovery_enabled ? "On" : "Off" },
          { label: "NSE profile", value: network.nse_profile_id != null ? (names.nseProfile ?? `#${network.nse_profile_id}`) : "None" },
          { label: "SSH check", value: network.ssh_probe_enabled ? "On" : "Off" },
          {
            label: "SSH alert overrides",
            value: sshOverrideCount(network) > 0 ? `${sshOverrideCount(network)} overridden` : "Global defaults",
          },
          { label: "Alert recipients", value: recipients(network) },
        ],
  };

  const sections = [basics, engine];

  if (!greenbone && network.nuclei_enabled) {
    sections.push({
      title: "Web vulnerability check (nuclei)",
      rows: [
        { label: "Include tags", value: network.nuclei_tags || "All", mono: true },
        { label: "Exclude tags", value: network.nuclei_exclude_tags || "fuzz,dos,intrusive (scanner default)", mono: true },
        { label: "Alert threshold", value: thresholdText(network.nuclei_severity) },
        {
          label: "Timeout",
          value:
            network.nuclei_timeout != null
              ? formatSeconds(network.nuclei_timeout)
              : `${formatSeconds(DEFAULT_NUCLEI_TIMEOUT_MIN * 60)} (default)`,
        },
        { label: "Scan every known hostname (SNI)", value: network.nuclei_sni_enabled ? "On" : "Off" },
      ],
    });
  }

  if (greenbone) {
    sections.push({
      title: "Deep vulnerability scan (Greenbone)",
      rows: [
        { label: "Scan config", value: network.gvm_scan_config ?? "Full and fast" },
        { label: "Port list", value: network.gvm_port_list ?? "From the ports above" },
        { label: "Keep reports in Greenbone", value: network.gvm_keep_reports ? "Yes" : "No" },
        { label: "Alert threshold", value: thresholdText(network.gvm_alert_severity) },
      ],
    });
  }

  return sections;
}
