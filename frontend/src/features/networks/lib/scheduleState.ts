/**
 * ScheduleBuilder state model: parse/serialise the structured schedule JSON
 * (backend/src/app/schemas/schedule.py) and describe it in plain words.
 */

/* ── Schedule type definitions (mirror backend schemas/schedule.py) ── */

export type ScheduleType =
  | "interval_hours"
  | "daily"
  | "weekly"
  | "monthly_date"
  | "monthly_nth"
  | "custom_cron";

export interface ScheduleState {
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

export const DEFAULT_STATE: ScheduleState = {
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

export const WEEKDAYS = [
  { value: "mon", label: "Mon" },
  { value: "tue", label: "Tue" },
  { value: "wed", label: "Wed" },
  { value: "thu", label: "Thu" },
  { value: "fri", label: "Fri" },
  { value: "sat", label: "Sat" },
  { value: "sun", label: "Sun" },
] as const;

export const WEEKDAY_LABELS: Record<string, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

export const NTH_OPTIONS = [
  { value: 1, label: "1st" },
  { value: 2, label: "2nd" },
  { value: 3, label: "3rd" },
  { value: 4, label: "4th" },
  { value: 5, label: "5th" },
] as const;

/* ── Serialization ── */

export function stateToJson(s: ScheduleState): string {
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

export function parseValue(raw: string): ScheduleState {
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

export function describeSchedule(s: ScheduleState): string {
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

/** Human-readable text for a stored scan_schedule value. */
export function describeScheduleValue(raw: string): string {
  return raw.trim() ? describeSchedule(parseValue(raw)) : "No schedule";
}

/** Schedule cell for network lists: "Manual" when unset, else readable text. */
export function scheduleCellText(raw: string | null): string {
  return raw?.trim() ? describeScheduleValue(raw) : "Manual";
}
