import { useInfiniteQuery } from "@tanstack/react-query";
import {
  ArrowRightLeft,
  Bug,
  CheckCircle,
  Globe,
  MessageSquare,
  RefreshCw,
  Scan,
  ShieldAlert,
  Terminal,
  UserPlus,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/data-display/ErrorState";
import { LoadingState } from "@/components/data-display/LoadingState";
import { fetchHostTimeline } from "@/lib/api-client-helpers";
import type { HostTimelineEvent } from "@/lib/types";
import { cn, formatRelativeTime } from "@/lib/utils";

interface HostActivityFeedProps {
  hostId: number;
}

const PAGE_SIZE = 50;

const EVENT_ICONS: Record<
  string,
  React.ComponentType<{ className?: string }>
> = {
  alert_created: ShieldAlert,
  port_discovered: Globe,
  ssh_scanned: Terminal,
  vulnerability_found: Bug,
  alert_action: MessageSquare,
  "alert_event:CREATED": ShieldAlert,
  "alert_event:DISMISSED": CheckCircle,
  "alert_event:REOPENED": RefreshCw,
  "alert_event:ASSIGNED": UserPlus,
  "alert_event:STATUS_CHANGED": ArrowRightLeft,
  "alert_event:COMMENTED": MessageSquare,
  "alert_event:SEVERITY_OVERRIDDEN": ShieldAlert,
  "alert_event:RECURRENCE": RefreshCw,
};

const EVENT_COLORS: Record<string, string> = {
  alert_created: "text-destructive",
  port_discovered: "text-primary",
  ssh_scanned: "text-yellow-500",
  vulnerability_found: "text-orange-500",
  alert_action: "text-primary",
  "alert_event:CREATED": "text-primary",
  "alert_event:DISMISSED": "text-primary",
  "alert_event:REOPENED": "text-primary",
  "alert_event:ASSIGNED": "text-primary",
  "alert_event:STATUS_CHANGED": "text-primary",
  "alert_event:COMMENTED": "text-primary",
  "alert_event:SEVERITY_OVERRIDDEN": "text-primary",
  "alert_event:RECURRENCE": "text-primary",
};

export function HostActivityFeed({ hostId }: HostActivityFeedProps) {
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    error,
  } = useInfiniteQuery({
    queryKey: ["hosts", hostId, "timeline"],
    queryFn: ({ pageParam }) =>
      fetchHostTimeline(hostId, {
        limit: PAGE_SIZE,
        before: pageParam || undefined,
      }),
    initialPageParam: "" as string,
    getNextPageParam: (lastPage) => {
      if (lastPage.events.length < PAGE_SIZE) return undefined;
      const lastEvent = lastPage.events[lastPage.events.length - 1];
      return lastEvent?.timestamp;
    },
  });

  if (isLoading) return <LoadingState rows={6} />;
  if (error) return <ErrorState message={error.message} />;

  const events: HostTimelineEvent[] =
    data?.pages.flatMap((p) => p.events) ?? [];

  if (events.length === 0) {
    return (
      <div className="rounded-lg border border-border p-8 text-center text-sm text-muted-foreground">
        No activity recorded for this host
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ol className="relative space-y-0">
        {events.map((event, idx) => {
          const Icon = EVENT_ICONS[event.event_type] ?? Scan;
          const colorClass =
            EVENT_COLORS[event.event_type] ?? "text-muted-foreground";
          const isLast = idx === events.length - 1;

          return (
            <li key={`${event.event_type}-${event.id}`} className="flex gap-4">
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-card",
                    colorClass,
                  )}
                >
                  <Icon className="h-4 w-4" />
                </div>
                {!isLast && <div className="w-px flex-1 bg-border" />}
              </div>
              <div className="pb-6 pt-1">
                <p className="text-sm font-emphasis text-foreground">
                  {event.title}
                </p>
                <p className="text-xs text-muted-foreground">
                  {event.description}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatRelativeTime(event.timestamp)}
                </p>
              </div>
            </li>
          );
        })}
      </ol>

      {hasNextPage && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
          >
            {isFetchingNextPage ? "Loading..." : "Load more"}
          </Button>
        </div>
      )}
    </div>
  );
}
