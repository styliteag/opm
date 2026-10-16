import { useCallback, useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectOption } from "@/components/ui/select";
import {
  DEFAULT_STATE,
  NTH_OPTIONS,
  WEEKDAY_LABELS,
  WEEKDAYS,
  describeSchedule,
  parseValue,
  stateToJson,
  type ScheduleState,
  type ScheduleType,
} from "../lib/scheduleState";

const TYPE_OPTIONS = [
  { value: "interval_hours" as const, label: "Every N hours" },
  { value: "daily" as const, label: "Daily" },
  { value: "weekly" as const, label: "Weekly" },
  { value: "monthly_date" as const, label: "Monthly (date)" },
  { value: "monthly_nth" as const, label: "Monthly (nth weekday)" },
  { value: "custom_cron" as const, label: "Custom cron" },
];

const PRESETS = [
  {
    label: "Hourly",
    state: { ...DEFAULT_STATE, type: "interval_hours" as const, hours: 1 },
  },
  {
    label: "Daily 02:00",
    state: { ...DEFAULT_STATE, type: "daily" as const, hour: 2, minute: 0 },
  },
  {
    label: "Weekly Mon",
    state: {
      ...DEFAULT_STATE,
      type: "weekly" as const,
      days: ["mon"],
      hour: 2,
      minute: 0,
    },
  },
  {
    label: "Monthly 1st",
    state: {
      ...DEFAULT_STATE,
      type: "monthly_date" as const,
      day: 1,
      hour: 2,
      minute: 0,
    },
  },
  {
    label: "3rd Sunday",
    state: {
      ...DEFAULT_STATE,
      type: "monthly_nth" as const,
      nth: 3,
      weekday: "sun",
      hour: 2,
      minute: 0,
    },
  },
];

/* ── Component ── */

interface ScheduleBuilderProps {
  value: string;
  onChange: (json: string) => void;
}

export function ScheduleBuilder({ value, onChange }: ScheduleBuilderProps) {
  const externalState = useMemo(() => parseValue(value), [value]);
  const [localState, setLocalState] = useState<ScheduleState | null>(null);

  // Use local state if user has interacted, otherwise derive from value prop.
  // Reset local state when external value changes (e.g. form reset / preset).
  const state = localState !== null && stateToJson(localState) !== stateToJson(externalState)
    ? localState
    : externalState;

  const emit = useCallback(
    (next: ScheduleState) => {
      setLocalState(next);
      onChange(stateToJson(next));
    },
    [onChange],
  );

  const update = useCallback(
    (patch: Partial<ScheduleState>) => {
      emit({ ...state, ...patch });
    },
    [state, emit],
  );

  const description = useMemo(() => describeSchedule(state), [state]);

  const toggleDay = useCallback(
    (day: string) => {
      const current = state.days;
      const next = current.includes(day)
        ? current.filter((d) => d !== day)
        : [...current, day];
      if (next.length === 0) return; // At least one day required
      update({ days: next });
    },
    [state.days, update],
  );

  return (
    <div className="space-y-2">
      <Label>Custom schedule</Label>

      {/* Type selector */}
      <Select
        value={state.type}
        onChange={(e) =>
          update({ type: e.target.value as ScheduleType })
        }
      >
        {TYPE_OPTIONS.map((o) => (
          <SelectOption key={o.value} value={o.value}>
            {o.label}
          </SelectOption>
        ))}
      </Select>

      {/* Type-specific fields */}
      <div className="grid grid-cols-2 gap-2">
        {state.type === "interval_hours" && (
          <div>
            <Label htmlFor="sched-hours" className="text-[10px] text-muted-foreground">
              Every N hours
            </Label>
            <Input
              id="sched-hours"
              type="number"
              min={1}
              max={24}
              value={state.hours}
              onChange={(e) => update({ hours: clamp(Number(e.target.value), 1, 24) })}
            />
          </div>
        )}

        {state.type === "custom_cron" && (
          <div className="col-span-2">
            <Label htmlFor="sched-cron" className="text-[10px] text-muted-foreground">
              Cron expression
            </Label>
            <Input
              id="sched-cron"
              value={state.expression}
              onChange={(e) => update({ expression: e.target.value })}
              placeholder="0 2 * * *"
              className="font-mono"
            />
          </div>
        )}

        {state.type === "weekly" && (
          <div className="col-span-2">
            <Label className="text-[10px] text-muted-foreground">Days</Label>
            <div className="flex gap-1">
              {WEEKDAYS.map((w) => (
                <button
                  key={w.value}
                  type="button"
                  onClick={() => toggleDay(w.value)}
                  className={`cursor-pointer rounded px-2 py-1 text-[11px] transition-colors ${
                    state.days.includes(w.value)
                      ? "bg-primary text-primary-foreground"
                      : "bg-surface-2 text-text-quaternary hover:text-text-secondary"
                  }`}
                >
                  {w.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {state.type === "monthly_date" && (
          <div>
            <Label htmlFor="sched-day" className="text-[10px] text-muted-foreground">
              Day of month
            </Label>
            <Input
              id="sched-day"
              type="number"
              min={1}
              max={31}
              value={state.day}
              onChange={(e) => update({ day: clamp(Number(e.target.value), 1, 31) })}
            />
          </div>
        )}

        {state.type === "monthly_nth" && (
          <>
            <div>
              <Label htmlFor="sched-nth" className="text-[10px] text-muted-foreground">
                Occurrence
              </Label>
              <Select
                id="sched-nth"
                value={state.nth}
                onChange={(e) => update({ nth: Number(e.target.value) })}
              >
                {NTH_OPTIONS.map((o) => (
                  <SelectOption key={o.value} value={o.value}>
                    {o.label}
                  </SelectOption>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="sched-weekday" className="text-[10px] text-muted-foreground">
                Weekday
              </Label>
              <Select
                id="sched-weekday"
                value={state.weekday}
                onChange={(e) => update({ weekday: e.target.value })}
              >
                {WEEKDAYS.map((w) => (
                  <SelectOption key={w.value} value={w.value}>
                    {WEEKDAY_LABELS[w.value]}
                  </SelectOption>
                ))}
              </Select>
            </div>
          </>
        )}

        {/* Time picker — shown for all types except interval_hours and custom_cron */}
        {state.type !== "interval_hours" && state.type !== "custom_cron" && (
          <>
            <div>
              <Label htmlFor="sched-hour" className="text-[10px] text-muted-foreground">
                Hour
              </Label>
              <Input
                id="sched-hour"
                type="number"
                min={0}
                max={23}
                value={state.hour}
                onChange={(e) => update({ hour: clamp(Number(e.target.value), 0, 23) })}
              />
            </div>
            <div>
              <Label htmlFor="sched-minute" className="text-[10px] text-muted-foreground">
                Minute
              </Label>
              <Input
                id="sched-minute"
                type="number"
                min={0}
                max={59}
                value={state.minute}
                onChange={(e) => update({ minute: clamp(Number(e.target.value), 0, 59) })}
              />
            </div>
          </>
        )}
      </div>

      {/* Presets */}
      <div className="flex gap-1">
        {PRESETS.map((p) => {
          const active = stateToJson(state) === stateToJson(p.state);
          return (
            <button
              key={p.label}
              type="button"
              onClick={() => emit(p.state)}
              className={`cursor-pointer rounded px-1.5 py-0.5 text-[10px] transition-colors ${
                active
                  ? "bg-primary text-primary-foreground"
                  : "bg-surface-2 text-text-quaternary hover:text-text-secondary"
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {/* Human-readable description */}
      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}
    </div>
  );
}

function clamp(v: number, min: number, max: number): number {
  if (Number.isNaN(v)) return min;
  return Math.max(min, Math.min(max, v));
}
