export interface ParsedAlertSource {
  source: "gvm" | "nuclei" | "nse";
  networkId: number | null;
  ip: string;
  port: number | null;
  protocol: string;
  oid: string;
}

const RULE_SOURCES = new Set(["gvm", "nuclei", "nse"]);

/**
 * Derive the severity-rule key (OID + network) from an alert's persisted
 * source_key. Returns `null` for alerts that cannot be tied back to a
 * severity rule: port/ssh alerts, legacy alerts written before source_key
 * existed, or keys that don't match the expected
 * `{source}:{network_id}:{ip}:{port}:{protocol}:{oid}` shape.
 *
 * The OID may itself contain `:` (nuclei composite `template:matcher`,
 * NSE `nse:script-name`), so we only split off the first five segments
 * and keep the remainder as the OID.
 */
export function parseAlertSourceKey(
  source: string | null | undefined,
  sourceKey: string | null | undefined,
): ParsedAlertSource | null {
  if (!source || !sourceKey) return null;
  if (!RULE_SOURCES.has(source)) return null;

  const segments = sourceKey.split(":");
  if (segments.length < 6) return null;
  const [keySource, rawNetworkId, ip, rawPort, protocol] = segments;
  if (keySource !== source) return null;

  const networkId = rawNetworkId === "" ? null : Number(rawNetworkId);
  if (Number.isNaN(networkId)) return null;

  const port = rawPort === "host" ? null : Number(rawPort);
  if (rawPort !== "host" && Number.isNaN(port)) return null;

  const oid = segments.slice(5).join(":");
  if (!oid) return null;

  return {
    source: source as ParsedAlertSource["source"],
    networkId,
    ip,
    port,
    protocol,
    oid,
  };
}
