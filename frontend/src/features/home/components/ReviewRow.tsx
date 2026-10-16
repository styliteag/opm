import { useEffect, useRef } from "react";
import { Link } from "@tanstack/react-router";
import { Clock, MoreHorizontal, RotateCcw } from "lucide-react";

import { SeverityBadge } from "@/components/data-display/SeverityBadge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useUsers } from "@/features/admin/hooks/useAdmin";
import { ExpectedSplitButton } from "@/features/alerts/components/triage/ExpectedSplitButton";
import type { ExpectedScope } from "@/features/alerts/hooks/useTriageActions";
import type { HomeQueueMode } from "@/features/home/hooks/useHomeData";
import type { PortGroup } from "@/features/home/lib/homeQueue";
import { TRIAGE_ACTIONS } from "@/lib/terminology";
import { cn, formatRelativeTime } from "@/lib/utils";

interface ReviewRowProps {
  group: PortGroup;
  mode: HomeQueueMode;
  active: boolean;
  selected: boolean;
  disabled: boolean;
  onToggleSelect: () => void;
  onOpenDetails: () => void;
  onExpected: (scope: ExpectedScope) => void;
  onExpectedWithReason: () => void;
  onSnooze: () => void;
  onReopen: () => void;
  onAssign: (userId: number | null) => void;
}

function stop(e: React.SyntheticEvent) {
  e.stopPropagation();
}

export function ReviewRow({
  group,
  mode,
  active,
  selected,
  disabled,
  onToggleSelect,
  onOpenDetails,
  onExpected,
  onExpectedWithReason,
  onSnooze,
  onReopen,
  onAssign,
}: ReviewRowProps) {
  const ref = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (active) ref.current?.scrollIntoView?.({ block: "nearest" });
  }, [active]);

  const target = `${group.ip}:${group.port}`;

  return (
    <li
      ref={ref}
      aria-selected={active}
      data-testid="review-row"
      onClick={onOpenDetails}
      className={cn(
        "grid cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-border px-4 py-3 last:border-b-0 transition-colors",
        active ? "bg-accent/60" : "hover:bg-accent/40",
      )}
    >
      <input
        type="checkbox"
        aria-label={`Select ${target}`}
        checked={selected}
        onChange={onToggleSelect}
        onClick={stop}
        className="h-3.5 w-3.5 rounded border-border bg-background accent-primary"
      />
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <SeverityBadge severity={group.severity} />
          {group.hostId ? (
            <Link
              to="/hosts/$hostId"
              params={{ hostId: String(group.hostId) }}
              onClick={stop}
              className="font-mono text-sm font-emphasis text-foreground hover:underline"
            >
              {target}
            </Link>
          ) : (
            <span className="font-mono text-sm font-emphasis text-foreground">
              {target}
            </span>
          )}
          {group.hostname && (
            <span className="truncate text-sm text-muted-foreground">
              {group.hostname}
            </span>
          )}
          {group.networks.length > 1 && (
            <span
              className="rounded-md border border-border px-1.5 py-0.5 text-xs text-muted-foreground"
              title={group.networks.join(", ")}
            >
              in {group.networks.length} networks
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {group.networks.join(", ") || "—"} ·{" "}
          {formatRelativeTime(group.newestAt)}
          {group.why && <> · Why: {group.why}</>}
        </p>
      </div>
      <div className="flex items-center gap-1.5" onClick={stop}>
        {mode === "inbox" ? (
          <>
            <ExpectedSplitButton
              disabled={disabled}
              onExpected={onExpected}
              onExpectedWithReason={onExpectedWithReason}
            />
            <Button
              variant="outline"
              size="sm"
              title={TRIAGE_ACTIONS.snooze.description}
              disabled={disabled}
              onClick={onSnooze}
            >
              <Clock />
              {TRIAGE_ACTIONS.snooze.label}
            </Button>
          </>
        ) : (
          <Button
            variant="outline"
            size="sm"
            title={TRIAGE_ACTIONS.reopen.description}
            disabled={disabled}
            onClick={onReopen}
          >
            <RotateCcw />
            {TRIAGE_ACTIONS.reopen.label}
          </Button>
        )}
        <RowOverflowMenu onOpenDetails={onOpenDetails} onAssign={onAssign} />
      </div>
    </li>
  );
}

function RowOverflowMenu({
  onOpenDetails,
  onAssign,
}: {
  onOpenDetails: () => void;
  onAssign: (userId: number | null) => void;
}) {
  const users = useUsers();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="More actions"
        render={<Button variant="ghost" size="icon-sm" />}
      >
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={onOpenDetails}>Open details</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>{TRIAGE_ACTIONS.assign.label}</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-56">
            <DropdownMenuItem onClick={() => onAssign(null)}>Unassign</DropdownMenuItem>
            <DropdownMenuSeparator />
            {(users.data?.users ?? []).map((user) => (
              <DropdownMenuItem key={user.id} onClick={() => onAssign(user.id)}>
                {user.email}
              </DropdownMenuItem>
            ))}
            {users.isLoading && (
              <DropdownMenuItem disabled>Loading users…</DropdownMenuItem>
            )}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
