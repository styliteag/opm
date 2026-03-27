import { RULE_SOURCE_BADGES } from "@/lib/alert-types";

export function SourceBadge({ source }: { source: string }) {
  const badge = RULE_SOURCE_BADGES[source] ?? RULE_SOURCE_BADGES.port;
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${badge.className}`}
    >
      {badge.label}
    </span>
  );
}
