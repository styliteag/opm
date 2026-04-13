import { useCallback, useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectOption } from "@/components/ui/select";

/* ── Schedule type definitions (mirror backend schemas/schedule.py) ── */

type ScheduleType =
  | "interval_hours"
  | "daily"
  | "weekly"
  | "monthly_date"
  | "monthly_nth"
  | "custom_cron";

interface ScheduleState {
  type: ScheduleType;
  hours: number;
  hour: number;
  minute: number;
  days: string[];
  day: number;
  nth: number;
  weekday: string;
  expression: string;
}

const DEFAULT_STATE: ScheduleState = {
  type: "daily",
  hours: 4,
  hour: 2,
  minute: 0,
  days: ["mon"],
  day: 1,
  nth: 1,
  weekday: "sun",
  expression: "0 2 * * *",
};

const WEEKDAYS = [
  { value: "mon", label: "Mon" },
  { value: "tue", label: "Tue" },
  { value: "wed", label: "Wed" },
  { value: "thu", label: "Thu" },
  { value: "fri", label: "Fri" },
  { value: "sat", label: "Sat" },
  { value: "sun", label: "Sun" },
] as const;

const WEEKDAY_LABELS: Record<string, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

const NTH_OPTIONS = [
  { value: 1, label: "1st" },
  { value: 2, label: "2nd" },
  { value: 3, label: "3rd" },
  { value: 4, label: "4th" },
  { value: 5, label: "5th" },
] as const;

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
    label: "Daily 2am",
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
];

/* ── Serialization ── */

function stateToJson(s: ScheduleState): string {
  switch (s.type) {
    case "interval_hours":
      return JSON.stringify({ type: s.type, hours: s.hours });
    case "daily":
      return JSON.stringify({ type: s.type, hour: s.hour, minute: s.minute });
    case "weekly":
      return JSON.stringify({
        type: s.type,
        days: s.days,
        hour: s.hour,
        minute: s.minute,
      });
    case "monthly_date":
      return JSON.stringify({
        type: s.type,
        day: s.day,
        hour: s.hour,
        minute: s.minute,
      });
    case "monthly_nth":
      return JSON.stringify({
        type: s.type,
        nth: s.nth,
        weekday: s.weekday,
        hour: s.hour,
        minute: s.minute,
      });
    case "custom_cron":
      return JSON.stringify({ type: s.type, expression: s.expression });
  }
}

function parseValue(raw: string): ScheduleState {
  const trimmed = raw.trim();
  if (!trimmed) return DEFAULT_STATE;

  if (trimmed.startsWith("{")) {
    try {
      const data = JSON.parse(trimmed) as Record<string, unknown>;
      const t = data.type as ScheduleType | undefined;
      if (t === "interval_hours") {
        return { ...DEFAULT_STATE, type: t, hours: Number(data.hours) || 4 };
      }
      if (t === "daily") {
        return {
          ...DEFAULT_STATE,
          type: t,
          hour: Number(data.hour) || 0,
          minute: Number(data.minute) || 0,
        };
      }
      if (t === "weekly") {
        return {
          ...DEFAULT_STATE,
          type: t,
          days: Array.isArray(data.days) ? (data.days as string[]) : ["mon"],
          hour: Number(data.hour) || 0,
          minute: Number(data.minute) || 0,
        };
      }
      if (t === "monthly_date") {
        return {
          ...DEFAULT_STATE,
          type: t,
          day: Number(data.day) || 1,
          hour: Number(data.hour) || 0,
          minute: Number(data.minute) || 0,
        };
      }
      if (t === "monthly_nth") {
        return {
          ...DEFAULT_STATE,
          type: t,
          nth: Number(data.nth) || 1,
          weekday: (data.weekday as string) || "sun",
          hour: Number(data.hour) || 0,
          minute: Number(data.minute) || 0,
        };
      }
      if (t === "custom_cron") {
        return {
          ...DEFAULT_STATE,
          type: t,
          expression: (data.expression as string) || "",
        };
      }
    } catch {
      // Fall through to legacy cron
    }
  }

  // Legacy cron string → show as custom_cron
  return { ...DEFAULT_STATE, type: "custom_cron", expression: trimmed };
}

function describeSchedule(s: ScheduleState): string {
  const time = `${String(s.hour).padStart(2, "0")}:${String(s.minute).padStart(2, "0")}`;
  switch (s.type) {
    case "interval_hours":
      return s.hours === 1 ? "Every hour" : `Every ${s.hours} hours`;
    case "daily":
      return `Daily at ${time}`;
    case "weekly": {
      const ordered = [...s.days].sort(
        (a, b) =>
          WEEKDAYS.findIndex((w) => w.value === a) -
          WEEKDAYS.findIndex((w) => w.value === b),
      );
      const names = ordered.map((d) => WEEKDAY_LABELS[d] ?? d);
      return `Weekly on ${names.join(", ")} at ${time}`;
    }
    case "monthly_date":
      return `Monthly on day ${s.day} at ${time}`;
    case "monthly_nth": {
      const nth = NTH_OPTIONS.find((o) => o.value === s.nth)?.label ?? `${s.nth}th`;
      return `Monthly on the ${nth} ${WEEKDAY_LABELS[s.weekday] ?? s.weekday} at ${time}`;
    }
    case "custom_cron":
      return s.expression ? `Cron: ${s.expression}` : "No schedule";
  }
}

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
      <Label>Schedule</Label>

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
