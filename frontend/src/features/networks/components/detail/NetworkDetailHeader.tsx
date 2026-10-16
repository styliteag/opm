import { Link } from "@tanstack/react-router";
import { ArrowLeft, Pencil, Play } from "lucide-react";
import { toast } from "sonner";

import { StatusBadge } from "@/components/data-display/StatusBadge";
import { Button, buttonVariants } from "@/components/ui/button";
import type { NetworkOverviewResponse } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useNetworkMutations } from "../../hooks/useNetworkDetail";
import { engineName, scanTypeLabel } from "../../lib/networkLabels";

interface ScheduleSwitchProps {
  checked: boolean;
  disabled: boolean;
  onChange: (next: boolean) => void;
}

/** Labelled switch replacing the v3 "Scheduled" badge that was a hidden pause button. */
function ScheduleSwitch({ checked, disabled, onChange }: ScheduleSwitchProps) {
  return (
    <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label="Scheduled scans"
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex h-4 w-7 shrink-0 cursor-pointer items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          checked ? "bg-primary" : "bg-surface-3",
        )}
      >
        <span
          className={cn(
            "inline-block h-3 w-3 rounded-full bg-background transition-transform",
            checked ? "translate-x-3.5" : "translate-x-0.5",
          )}
        />
      </button>
      {checked ? "Scheduled scans on" : "Scheduled scans paused"}
    </label>
  );
}

interface NetworkDetailHeaderProps {
  overview: NetworkOverviewResponse;
  canOperate: boolean;
}

export function NetworkDetailHeader({
  overview,
  canOperate,
}: NetworkDetailHeaderProps) {
  const n = overview.network;
  const { triggerScan, update } = useNetworkMutations();

  const toggleSchedule = (enabled: boolean) =>
    update.mutate(
      { id: n.id, scan_schedule_enabled: enabled },
      {
        onSuccess: () =>
          toast.success(enabled ? "Schedule resumed" : "Schedule paused"),
        onError: (e) => toast.error(e.message),
      },
    );

  return (
    <div className="flex flex-wrap items-start gap-4">
      <Link
        to="/networks"
        aria-label="Back to networks"
        className="mt-1 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-5 w-5" />
      </Link>
      <div className="min-w-0 flex-1 space-y-1">
        <h1 className="text-2xl font-strong text-foreground">{n.name}</h1>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="font-mono text-primary">{n.cidr}</span>
          <span className="text-muted-foreground">
            {scanTypeLabel(n.scanner_type)}{" "}
            <span className="text-xs">({engineName(n.scanner_type)})</span>
          </span>
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            {overview.scanner_name}
            <StatusBadge
              label={overview.scanner_online ? "Online" : "Offline"}
              variant={overview.scanner_online ? "success" : "danger"}
              dot
            />
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span>{n.schedule_description ?? "Manual only"}</span>
          {n.scan_schedule && (
            <ScheduleSwitch
              checked={n.scan_schedule_enabled}
              disabled={!canOperate || update.isPending}
              onChange={toggleSchedule}
            />
          )}
        </div>
      </div>
      {canOperate && (
        <div className="flex items-center gap-2">
          <Link
            to="/networks/$networkId/edit"
            params={{ networkId: String(n.id) }}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <Pencil />
            Edit
          </Link>
          <Button
            size="sm"
            disabled={triggerScan.isPending}
            onClick={() =>
              triggerScan.mutate(n.id, {
                onSuccess: () => toast.success("Scan started"),
                onError: (e) => toast.error(e.message),
              })
            }
          >
            <Play />
            {triggerScan.isPending ? "Starting…" : "Scan now"}
          </Button>
        </div>
      )}
    </div>
  );
}
