import { useFormContext, useWatch } from "react-hook-form";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useScanners } from "@/features/dashboard/hooks/useDashboardData";
import { SegmentedControl } from "@/features/ports/components/ListControls";
import { TOOL_LABELS } from "@/lib/terminology";
import { isOnline } from "@/lib/utils";
import {
  WEEKDAYS,
  WEEKDAY_NAMES,
  type ScheduleMode,
} from "../../lib/schedulePresets";
import { describeScheduleValue } from "../../lib/scheduleState";
import type { NetworkFormData } from "../networkFormSchema";

const SCHEDULE_OPTIONS: { value: ScheduleMode; label: string }[] = [
  { value: "manual", label: "Manual only" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "custom", label: "Custom (advanced)" },
];

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs text-destructive">{message}</p>;
}

interface EssentialFieldsProps {
  /** Greenbone port list in use — port_spec is ignored then. */
  gvmPortList: string;
  /** Called when the user picks "Custom" so the advanced section opens. */
  onCustomSchedule: () => void;
}

/** The six visible fields of the one-page network form (ADR 0011). */
export function EssentialFields({
  gvmPortList,
  onCustomSchedule,
}: EssentialFieldsProps) {
  const {
    register,
    setValue,
    getValues,
    control,
    formState: { errors },
  } = useFormContext<NetworkFormData>();
  const scanners = useScanners();
  const [portPreset, scheduleMode, scannerType, protocol, customSchedule, scannerId] =
    useWatch({
      control,
      name: [
        "port_preset",
        "schedule_mode",
        "scanner_type",
        "scan_protocol",
        "scan_schedule",
        "scanner_id",
      ],
    });
  const isGreenbone = scannerType === "greenbone";

  const pickSchedule = (mode: ScheduleMode) => {
    setValue("schedule_mode", mode, { shouldDirty: true });
    if (mode === "custom") {
      if (!getValues("scan_schedule")) {
        // Seed the builder with a daily run at the chosen time.
        const [hour, minute] = (getValues("schedule_time") || "02:00")
          .split(":")
          .map(Number);
        setValue(
          "scan_schedule",
          JSON.stringify({ type: "daily", hour: hour || 0, minute: minute || 0 }),
          { shouldDirty: true },
        );
      }
      onCustomSchedule();
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="name">Name</Label>
          <Input id="name" {...register("name")} placeholder="Office LAN" />
          <FieldError message={errors.name?.message} />
        </div>
        <div>
          <Label htmlFor="cidr">Address range</Label>
          <Input
            id="cidr"
            {...register("cidr")}
            placeholder="192.168.1.0/24"
            className="font-mono"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            CIDR notation, e.g. 10.0.0.0/24 or a single host 10.0.0.5/32.
          </p>
          <FieldError message={errors.cidr?.message} />
        </div>
      </div>

      <div className="sm:w-1/2 sm:pr-2">
        <Label htmlFor="scanner_id">Scanner</Label>
        {/* Controlled: options load after the form mounts. */}
        <Select
          id="scanner_id"
          {...register("scanner_id")}
          value={scannerId ? String(scannerId) : ""}
        >
          <option value="">Select scanner…</option>
          {(scanners.data?.scanners ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {isOnline(s.last_seen_at) ? "" : " (offline)"}
            </option>
          ))}
        </Select>
        <FieldError message={errors.scanner_id?.message} />
      </div>

      <div>
        <Label>Ports</Label>
        <div className="mt-1">
          <SegmentedControl
            label="Ports"
            options={[
              { key: "common", label: "Common ports" },
              {
                key: "all",
                label: protocol === "tcp" ? "All TCP ports" : "All ports",
              },
              { key: "custom", label: "Custom" },
            ]}
            value={portPreset}
            onChange={(key) =>
              setValue("port_preset", key, { shouldDirty: true })
            }
          />
        </div>
        {portPreset === "common" && (
          <p className="mt-1 text-xs text-muted-foreground">
            Ports 1–1024 plus well-known service ports (databases, remote
            desktop, web admin).
          </p>
        )}
        {portPreset === "all" && (
          <p className="mt-1 text-xs text-muted-foreground">
            Every port, 1–65535.
          </p>
        )}
        {portPreset === "custom" && (
          <div className="mt-2">
            <Input
              id="port_spec"
              aria-label="Custom ports"
              {...register("port_spec")}
              placeholder="22,80,443,8000-8100"
              className="font-mono"
            />
            <FieldError message={errors.port_spec?.message} />
          </div>
        )}
        {isGreenbone && gvmPortList && (
          <p className="mt-1 text-xs text-muted-foreground">
            Not used: ports come from the Greenbone port list{" "}
            <span className="font-mono">{gvmPortList}</span> (advanced
            settings).
          </p>
        )}
      </div>

      <div>
        <Label htmlFor="schedule_mode">Schedule</Label>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            id="schedule_mode"
            className="w-48"
            value={scheduleMode}
            onChange={(e) => pickSchedule(e.target.value as ScheduleMode)}
          >
            {SCHEDULE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
          {scheduleMode === "weekly" && (
            <Select
              aria-label="Day of week"
              className="w-40"
              {...register("schedule_day")}
            >
              {WEEKDAYS.map((d) => (
                <option key={d} value={d}>
                  on {WEEKDAY_NAMES[d]}
                </option>
              ))}
            </Select>
          )}
          {(scheduleMode === "daily" || scheduleMode === "weekly") && (
            <Input
              type="time"
              aria-label="Time of day"
              className="w-32"
              {...register("schedule_time")}
            />
          )}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {scheduleMode === "manual" &&
            "Runs only when you click Scan now."}
          {(scheduleMode === "daily" || scheduleMode === "weekly") &&
            "In the server's schedule time zone."}
          {scheduleMode === "custom" &&
            `${describeScheduleValue(customSchedule ?? "")} — edit it under advanced settings.`}
        </p>
      </div>

      <div className="rounded-md border border-border bg-card/40 p-3">
        {isGreenbone ? (
          <label className="flex items-center gap-2 text-sm font-emphasis text-foreground">
            <input
              type="checkbox"
              checked
              disabled
              className="h-4 w-4 rounded border-border bg-background"
            />
            Check for vulnerabilities
          </label>
        ) : (
          <label className="flex items-center gap-2 text-sm font-emphasis text-foreground">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-border bg-background"
              {...register("nuclei_enabled")}
            />
            Check for vulnerabilities
          </label>
        )}
        <p className="mt-1 pl-6 text-xs text-muted-foreground">
          {isGreenbone
            ? `Always on: a ${TOOL_LABELS.gvm.toLowerCase()} checks every host (Greenbone).`
            : `Runs a ${TOOL_LABELS.nuclei.toLowerCase()} (nuclei) on web services found by the port scan.`}
        </p>
      </div>
    </div>
  );
}
