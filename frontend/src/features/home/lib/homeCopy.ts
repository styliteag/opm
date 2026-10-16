export function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

/** Home headline: the review count drives the page (ADR 0008). */
export function homeTitle(mode: "inbox" | "handled", portCount: number): string {
  if (mode === "handled") return "Snoozed & handled";
  if (portCount === 0) return "All open ports are explained";
  return `${portCount} new open ${plural(portCount, "port", "ports")} to review`;
}
