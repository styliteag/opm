import { PORT_STATUS, type PortStatusKey } from "@/lib/terminology";
import { cn } from "@/lib/utils";

// Same raw-palette pattern as SeverityBadge; emerald marks "explained".
const STATUS_STYLES: Record<PortStatusKey, string> = {
  new: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  review: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  expected: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  snoozed: "bg-muted text-muted-foreground border-border",
  critical: "bg-red-500/10 text-red-400 border-red-500/20",
};

export function PortStatusPill({
  status,
  className,
}: {
  status: PortStatusKey;
  className?: string;
}) {
  return (
    <span
      title={PORT_STATUS[status].description}
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-emphasis",
        STATUS_STYLES[status],
        className,
      )}
    >
      {PORT_STATUS[status].label}
    </span>
  );
}
