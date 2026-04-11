import { useState } from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";

import { useHostCachedHostnames } from "@/features/hostname-lookup/hooks/useHostnameLookup";

interface CachedVhostsChipProps {
  hostId: number;
  count: number;
}

/**
 * Compact `+N vhosts` chip for the hosts table.
 *
 * Renders only when the host has more than one cached vhost in
 * `hostname_lookup_cache`. The chip displays the extra count
 * (`+N` where N = total - 1, since the first vhost is shown in the
 * adjacent hostname column). Hovering/focusing the chip opens a
 * tooltip with the full vhost list, lazy-fetched via
 * `useHostCachedHostnames` only after the tooltip first opens.
 *
 * The lazy-load gate is controlled via Radix's `open` /
 * `onOpenChange` props paired with a `hasOpened` flag — once the
 * tooltip has opened once, the query stays enabled so subsequent
 * re-opens render instantly from the React Query cache.
 */
export function CachedVhostsChip({ hostId, count }: CachedVhostsChipProps) {
  const [open, setOpen] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);

  const extra = Math.max(count - 1, 0);
  const { data, isLoading } = useHostCachedHostnames(hasOpened ? hostId : null);

  if (extra <= 0) {
    return null;
  }

  return (
    <TooltipPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setHasOpened(true);
      }}
    >
      <TooltipPrimitive.Trigger asChild>
        <button
          type="button"
          aria-label={`Show all ${count} cached hostnames`}
          className="ml-2 inline-flex items-center rounded-md border border-border/60 bg-accent/40 px-1.5 py-0.5 text-[10px] font-emphasis text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
          // Stop the click bubbling into a row link click handler.
          onClick={(e) => e.stopPropagation()}
        >
          +{extra}
        </button>
      </TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          sideOffset={6}
          className="z-50 max-w-sm rounded-md border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95"
        >
          {isLoading || !data ? (
            <span className="text-muted-foreground">Loading vhosts…</span>
          ) : data.hostnames.length === 0 ? (
            <span className="text-muted-foreground">No cached hostnames</span>
          ) : (
            <div className="flex flex-col gap-1">
              <span className="font-emphasis text-foreground">
                {data.hostnames.length} cached vhosts
              </span>
              <ul className="flex flex-col gap-0.5 max-h-64 overflow-y-auto font-mono text-[11px]">
                {data.hostnames.map((name) => (
                  <li key={name} className="truncate">
                    {name}
                  </li>
                ))}
              </ul>
              {data.source ? (
                <span className="mt-1 text-[10px] text-muted-foreground">
                  source: {data.source}
                </span>
              ) : null}
            </div>
          )}
          <TooltipPrimitive.Arrow className="fill-border" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
