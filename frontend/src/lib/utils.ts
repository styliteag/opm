import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Parse an API timestamp as UTC. The backend returns ISO timestamps
 * without a timezone suffix, which browsers interpret as local time.
 * This ensures they are always treated as UTC.
 */
export function parseUTC(date: string | Date): Date {
  if (date instanceof Date) return date;
  // Append 'Z' only when no timezone info is present
  return date.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(date)
    ? new Date(date)
    : new Date(date + "Z");
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parseUTC(date));
}

type StatusVariant = "success" | "warning" | "danger" | "neutral";

const STATUS_VARIANT_MAP: Record<string, StatusVariant> = {
  completed: "success",
  running: "warning",
  error: "danger",
  failed: "danger",
};

export function scanStatusVariant(status: string | undefined): StatusVariant {
  return (status && STATUS_VARIANT_MAP[status]) ?? "neutral";
}

export function formatRelativeTime(date: string | Date): string {
  const now = Date.now();
  const then = parseUTC(date).getTime();
  const diffMs = now - then;

  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return formatDate(date);
}

/** Return the most relevant display timestamp for a scan (completed > started). */
export function getScanDisplayTime(scan: {
  completed_at?: string | null;
  started_at?: string | null;
}): string {
  const ts = scan.completed_at ?? scan.started_at;
  return ts ? formatRelativeTime(ts) : "";
}

/** Return true when a device's last_seen_at is within the given threshold (default 5 min). */
export function isOnline(
  lastSeenAt: string | null | undefined,
  thresholdMs = 5 * 60 * 1000,
): boolean {
  if (!lastSeenAt) return false;
  return Date.now() - parseUTC(lastSeenAt).getTime() < thresholdMs;
}

/** Format a scanner version + kind as "2.0.1 (gvm)" / "2.0.1 (std)". */
export function formatScannerVersion(
  version: string | null | undefined,
  kind: "standard" | "gvm" | null | undefined,
): string {
  if (!version) return "-";
  const suffix = kind === "gvm" ? "gvm" : "std";
  return `${version} (${suffix})`;
}

/** Format a packets-per-second rate as a human-readable string. */
export function formatRate(pps: number): string {
  if (pps >= 1_000_000) return `${(pps / 1_000_000).toFixed(1)}M pps`;
  if (pps >= 1_000) return `${(pps / 1_000).toFixed(1)}k pps`;
  return `${Math.round(pps)} pps`;
}
