import { Link } from "@tanstack/react-router";

import type { NetworkStatusEntry } from "@/lib/types";
import { cn } from "@/lib/utils";

const DOT: Record<NetworkStatusEntry["status"], string> = {
  red: "bg-red-500",
  amber: "bg-yellow-500",
  green: "bg-emerald-500",
};

const STATUS_TEXT: Record<NetworkStatusEntry["status"], string> = {
  red: "critical or high alerts open",
  amber: "alerts open",
  green: "all clear",
};

/** Per-network traffic lights at the bottom of Home. */
export function NetworkStatusStrip({ networks }: { networks: NetworkStatusEntry[] }) {
  if (networks.length === 0) return null;
  return (
    <section
      aria-label="Network status"
      className="flex flex-wrap gap-x-6 gap-y-2 border-t border-border pt-4 text-sm"
    >
      {networks.map((n) => (
        <Link
          key={n.network_id}
          to="/networks/$networkId"
          params={{ networkId: String(n.network_id) }}
          title={`${n.name}: ${STATUS_TEXT[n.status]}`}
          className="flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
        >
          <span className={cn("inline-block h-2 w-2 shrink-0 rounded-full", DOT[n.status])} />
          {n.name}
        </Link>
      ))}
      <Link to="/scans" className="ml-auto text-primary hover:underline">
        Recent scans →
      </Link>
    </section>
  );
}
