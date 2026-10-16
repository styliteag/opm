/**
 * Ports presets for the one-page network form (ADR 0011). `port_spec` stays
 * the only stored value: presets are detected from it and mapped back to it,
 * and exclusions are the scanner's `!port` entries (utils.split_port_spec).
 */

export type PortPreset = "common" | "all" | "custom";

export const ALL_PORTS = "1-65535";

/** Privileged range plus well-known service ports above 1024. */
export const COMMON_PORTS =
  "1-1024,1433,1521,2049,2375,2376,3000,3306,3389,5000,5432,5601,5900," +
  "5985,5986,6379,6443,8000,8008,8080,8081,8088,8443,8888,9000,9090," +
  "9200,9443,10250,11211,27017";

const PRESET_SPECS: Record<Exclude<PortPreset, "custom">, string> = {
  common: COMMON_PORTS,
  all: ALL_PORTS,
};

export interface ParsedPortSpec {
  preset: PortPreset;
  /** Include list (the preset's spec for common/all). */
  include: string;
  /** Excluded ports without the `!` prefix. */
  exclude: string;
}

function segments(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function parsePortSpec(spec: string): ParsedPortSpec {
  const parts = segments(spec);
  const include = parts.filter((p) => !p.startsWith("!")).join(",");
  const exclude = parts
    .filter((p) => p.startsWith("!"))
    .map((p) => p.slice(1).trim())
    .filter(Boolean)
    .join(",");
  // Only exclusions → the scanner scans the full range.
  const effective = include || ALL_PORTS;
  const preset: PortPreset =
    effective === ALL_PORTS
      ? "all"
      : effective === COMMON_PORTS
        ? "common"
        : "custom";
  return { preset, include: effective, exclude };
}

export function buildPortSpec(
  preset: PortPreset,
  customInclude: string,
  exclude: string,
): string {
  const base =
    preset === "custom" ? segments(customInclude).join(",") : PRESET_SPECS[preset];
  const excluded = segments(exclude).map((p) => `!${p.replace(/^!+/, "")}`);
  return [base, ...excluded].filter(Boolean).join(",");
}

function validPort(value: string): boolean {
  if (!/^\d+$/.test(value)) return false;
  const n = Number(value);
  return n >= 1 && n <= 65535;
}

/** Comma list of ports/ranges (an optional `!` prefix is tolerated). */
export function isValidPortList(value: string): boolean {
  return segments(value).every((raw) => {
    const part = raw.replace(/^!/, "");
    const [start, end, ...rest] = part.split("-");
    if (rest.length > 0) return false;
    if (end === undefined) return validPort(start);
    return validPort(start) && validPort(end) && Number(start) <= Number(end);
  });
}
