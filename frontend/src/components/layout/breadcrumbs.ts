/** Readable labels for static path segments; unknown segments (ids, script names) stay verbatim. */
const SEGMENT_LABELS: Record<string, string> = {
  ports: "Ports",
  hosts: "Hosts",
  networks: "Networks",
  scans: "Scans",
  alerts: "Alerts",
  settings: "Settings",
  scanners: "Scanners",
  rules: "Rules",
  "scan-profiles": "Scan profiles",
  scripts: "Scripts",
  users: "Users",
  organization: "Organization",
  system: "System",
  security: "Account security",
  new: "New",
  edit: "Edit",
};

/**
 * Path segments as readable labels. `lastLabel` replaces the final segment
 * (e.g. a host's name instead of its numeric id) once it is known.
 */
export function breadcrumbSegments(
  pathname: string,
  lastLabel?: string,
): string[] {
  const segments = pathname
    .split("/")
    .filter(Boolean)
    .map((seg) => {
      const decoded = safeDecode(seg);
      return SEGMENT_LABELS[decoded] ?? decoded;
    });
  if (segments.length === 0) return ["Home"];
  return lastLabel ? [...segments.slice(0, -1), lastLabel] : segments;
}

/** Host id of a `/hosts/$hostId` path, otherwise null. */
export function hostIdFromPath(pathname: string): number | null {
  const match = /^\/hosts\/(\d+)\/?$/.exec(pathname);
  return match ? Number(match[1]) : null;
}

function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}
