export interface ScannerKindBadge {
  label: string;
  /** Tool names stay available as secondary detail (ADR 0010). */
  title: string;
  variant: "neutral" | "warning" | "info";
}

const STANDARD: ScannerKindBadge = {
  label: "Port scans",
  title: "Standard scanner: masscan / nmap / nuclei",
  variant: "neutral",
};

const BADGES: Record<string, ScannerKindBadge> = {
  standard: STANDARD,
  gvm: {
    label: "Deep scans",
    title: "Greenbone / GVM scanner",
    variant: "warning",
  },
  unified: {
    label: "Port + deep scans",
    title: "Unified scanner: masscan / nmap / nuclei and Greenbone / GVM",
    variant: "info",
  },
};

/** Plain badge for `Scanner.kind`; unknown kinds render as standard. */
export function scannerKindBadge(kind: string): ScannerKindBadge {
  return BADGES[kind] ?? STANDARD;
}
