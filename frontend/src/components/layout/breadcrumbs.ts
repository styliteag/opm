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

export function breadcrumbSegments(pathname: string): string[] {
  const segments = pathname
    .split("/")
    .filter(Boolean)
    .map((seg) => {
      const decoded = safeDecode(seg);
      return SEGMENT_LABELS[decoded] ?? decoded;
    });
  return segments.length === 0 ? ["Home"] : segments;
}

function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}
