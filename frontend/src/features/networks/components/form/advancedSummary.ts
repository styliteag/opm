import { engineName } from "../../lib/networkLabels";
import type { NetworkFormData } from "../networkFormSchema";

const PROTOCOL_LABELS: Record<NetworkFormData["scan_protocol"], string> = {
  tcp: "TCP",
  udp: "UDP",
  both: "TCP+UDP",
};

/** One-line recap shown next to the closed "Show advanced settings" toggle. */
export function advancedSummary(values: NetworkFormData): string {
  const greenbone = values.scanner_type === "greenbone";
  const parts: string[] = [engineName(values.scanner_type)];
  if (!greenbone) {
    parts.push(PROTOCOL_LABELS[values.scan_protocol] ?? values.scan_protocol);
    if (values.scan_rate) parts.push(`${values.scan_rate.toLocaleString("en-US")} pps`);
  }
  if (values.scan_timeout) parts.push(`${values.scan_timeout} min timeout`);
  if (!greenbone) {
    parts.push(`SSH check ${values.ssh_probe_enabled ? "on" : "off"}`);
  }
  if (values.exclude_ports?.trim()) parts.push(`excludes ${values.exclude_ports.trim()}`);
  if (values.schedule_mode === "custom") parts.push("custom schedule");
  return parts.join(" · ");
}
