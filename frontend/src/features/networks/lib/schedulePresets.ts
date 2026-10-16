/**
 * Schedule presets for the one-page network form (ADR 0011): Manual only,
 * Daily at HH:MM, Weekly on <day> at HH:MM. Anything else (intervals,
 * monthly, several weekdays, cron) is "custom" and edited with the
 * ScheduleBuilder under advanced settings. JSON shapes match
 * backend/src/app/schemas/schedule.py and ScheduleBuilder's serialisation.
 */

export type ScheduleMode = "manual" | "daily" | "weekly" | "custom";

export const WEEKDAYS = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
] as const;

export type Weekday = (typeof WEEKDAYS)[number];

export const WEEKDAY_NAMES: Record<Weekday, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

export interface SchedulePresetValue {
  mode: ScheduleMode;
  /** "HH:MM", used by daily/weekly. */
  time: string;
  day: Weekday;
  /** Raw stored value for custom schedules. */
  custom: string;
}

const DEFAULTS: SchedulePresetValue = {
  mode: "manual",
  time: "02:00",
  day: "mon",
  custom: "",
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function timeOf(data: Record<string, unknown>): string {
  return `${pad(Number(data.hour) || 0)}:${pad(Number(data.minute) || 0)}`;
}

function isWeekday(value: unknown): value is Weekday {
  return (WEEKDAYS as readonly unknown[]).includes(value);
}

function parseJson(raw: string): Record<string, unknown> | null {
  try {
    const data: unknown = JSON.parse(raw);
    return data && typeof data === "object"
      ? (data as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function parseSchedule(
  raw: string | null | undefined,
): SchedulePresetValue {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return DEFAULTS;
  const data = trimmed.startsWith("{") ? parseJson(trimmed) : null;
  if (data?.type === "daily") {
    return { ...DEFAULTS, mode: "daily", time: timeOf(data) };
  }
  if (
    data?.type === "weekly" &&
    Array.isArray(data.days) &&
    data.days.length === 1 &&
    isWeekday(data.days[0])
  ) {
    return { ...DEFAULTS, mode: "weekly", day: data.days[0], time: timeOf(data) };
  }
  return { ...DEFAULTS, mode: "custom", custom: trimmed };
}

function parseTime(time: string): { hour: number; minute: number } {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) return { hour: 2, minute: 0 };
  const hour = Math.min(23, Number(match[1]));
  const minute = Math.min(59, Number(match[2]));
  return { hour, minute };
}

/** Value for `scan_schedule`; null clears it (Manual only). */
export function scheduleToValue(value: SchedulePresetValue): string | null {
  switch (value.mode) {
    case "manual":
      return null;
    case "daily": {
      const { hour, minute } = parseTime(value.time);
      return JSON.stringify({ type: "daily", hour, minute });
    }
    case "weekly": {
      const { hour, minute } = parseTime(value.time);
      return JSON.stringify({ type: "weekly", days: [value.day], hour, minute });
    }
    case "custom":
      return value.custom.trim() || null;
  }
}

export function describeSchedulePreset(value: SchedulePresetValue): string {
  const { hour, minute } = parseTime(value.time);
  const time = `${pad(hour)}:${pad(minute)}`;
  switch (value.mode) {
    case "manual":
      return "Manual only";
    case "daily":
      return `Daily at ${time}`;
    case "weekly":
      return `Weekly on ${WEEKDAY_NAMES[value.day]} at ${time}`;
    case "custom":
      return "Custom schedule";
  }
}
