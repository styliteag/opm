import { useQuery } from "@tanstack/react-query";
import {
  ArrowRightLeft,
  CheckCircle,
  Clock,
  MessageSquare,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  UserPlus,
} from "lucide-react";

import { LoadingState } from "@/components/data-display/LoadingState";
import { fetchAlertTimeline } from "@/lib/api-client-helpers";
import type { TimelineEvent } from "@/lib/types";
import { cn, formatRelativeTime } from "@/lib/utils";

interface AlertActivityFeedProps {
  alertId: number;
}

const EVENT_ICONS: Record<
  string,
  React.ComponentType<{ className?: string }>
> = {
  CREATED: ShieldAlert,
  DISMISSED: CheckCircle,
  REOPENED: RotateCcw,
  ASSIGNED: UserPlus,
  STATUS_CHANGED: ArrowRightLeft,
  COMMENTED: MessageSquare,
  SEVERITY_OVERRIDDEN: ShieldAlert,
  RECURRENCE: RefreshCw,
};

function eventTypeLabel(type: string): string {
  const lower = type.toLowerCase().replace(/_/g, " ");
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

export function AlertActivityFeed({ alertId }: AlertActivityFeedProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["alerts", alertId, "timeline"],
    queryFn: () => fetchAlertTimeline(alertId),
  });

  if (isLoading) {
    return <LoadingState rows={4} />;
  }

  const events: TimelineEvent[] = [
    ...(data?.scan_groups.flatMap((g) => g.events) ?? []),
  ].sort(
    (a, b) =>
      new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime(),
  );

  if (events.length === 0) {
    return (
      <div className="rounded-lg border border-border p-8 text-center text-sm text-muted-foreground">
        No activity recorded for this alert
      </div>
    );
  }

  return (
    <ol className="relative space-y-0">
      {events.map((event, idx) => {
        const Icon = EVENT_ICONS[event.event_type] ?? Clock;
        const isLast = idx === events.length - 1;

        return (
          <li key={event.id} className="flex gap-4">
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-card",
                  "text-primary",
                )}
              >
                <Icon className="h-4 w-4" />
              </div>
              {!isLast && <div className="w-px flex-1 bg-border" />}
            </div>
            <div className="pb-6 pt-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-emphasis text-foreground">
                  {eventTypeLabel(event.event_type)}
                </span>
                <span className="text-xs text-muted-foreground ml-3">
                  {event.user_email ?? "System"}
                </span>
              </div>
              {event.description && (
                <p className="text-sm text-muted-foreground">
                  {event.description}
                </p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">
                {formatRelativeTime(event.occurred_at)}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
