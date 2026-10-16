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

export type BreadcrumbEntityKind = "host" | "network" | "scan" | "scanner" | "user";

/** A detail page's entity: its kind, id and the segment index holding the id. */
export interface BreadcrumbEntity {
  kind: BreadcrumbEntityKind;
  id: number;
  index: number;
}

const ENTITY_PATHS: readonly [RegExp, BreadcrumbEntityKind, number][] = [
  [/^\/hosts\/(\d+)\/?$/, "host", 1],
  [/^\/networks\/(\d+)(\/edit)?\/?$/, "network", 1],
  [/^\/scans\/(\d+)\/?$/, "scan", 1],
  [/^\/settings\/scanners\/(\d+)\/?$/, "scanner", 2],
  [/^\/settings\/users\/(\d+)\/?$/, "user", 2],
];

/** The entity whose numeric id appears in the path, otherwise null. */
export function breadcrumbEntity(pathname: string): BreadcrumbEntity | null {
  for (const [pattern, kind, index] of ENTITY_PATHS) {
    const match = pattern.exec(pathname);
    if (match) return { kind, id: Number(match[1]), index };
  }
  return null;
}

/**
 * Path segments as readable labels. `entityLabel` replaces the entity's id
 * segment (e.g. a host's name instead of its numeric id) once it is known;
 * scans need no lookup and read "Scan #<id>".
 */
export function breadcrumbSegments(
  pathname: string,
  entityLabel?: string,
): string[] {
  const segments = pathname
    .split("/")
    .filter(Boolean)
    .map((seg) => {
      const decoded = safeDecode(seg);
      return SEGMENT_LABELS[decoded] ?? decoded;
    });
  if (segments.length === 0) return ["Home"];
  const entity = breadcrumbEntity(pathname);
  if (!entity) return segments;
  const label =
    entity.kind === "scan" ? `Scan #${entity.id}` : entityLabel;
  return label
    ? segments.map((seg, i) => (i === entity.index ? label : seg))
    : segments;
}

function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}
