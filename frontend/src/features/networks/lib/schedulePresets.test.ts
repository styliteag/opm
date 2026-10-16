import { describe, expect, it } from "vitest";

import {
  describeSchedulePreset,
  parseSchedule,
  scheduleToValue,
  type SchedulePresetValue,
} from "./schedulePresets";

const base: SchedulePresetValue = {
  mode: "manual",
  time: "02:00",
  day: "mon",
  custom: "",
};

describe("parseSchedule", () => {
  it.each([null, undefined, "", "   "])("%s → manual", (raw) => {
    expect(parseSchedule(raw).mode).toBe("manual");
  });

  it("detects daily with time", () => {
    expect(parseSchedule('{"type":"daily","hour":3,"minute":5}')).toEqual({
      ...base,
      mode: "daily",
      time: "03:05",
    });
  });

  it("detects weekly with a single day", () => {
    expect(
      parseSchedule('{"type":"weekly","days":["fri"],"hour":22,"minute":30}'),
    ).toEqual({ ...base, mode: "weekly", day: "fri", time: "22:30" });
  });

  it("keeps multi-day weekly as custom", () => {
    const raw = '{"type":"weekly","days":["mon","thu"],"hour":2,"minute":0}';
    expect(parseSchedule(raw)).toEqual({ ...base, mode: "custom", custom: raw });
  });

  it.each([
    '{"type":"interval_hours","hours":4}',
    '{"type":"monthly_date","day":1,"hour":2,"minute":0}',
    "0 2 * * *",
  ])("keeps %s as custom", (raw) => {
    expect(parseSchedule(raw)).toEqual({ ...base, mode: "custom", custom: raw });
  });
});

describe("scheduleToValue", () => {
  it("manual clears the schedule", () => {
    expect(scheduleToValue(base)).toBeNull();
  });

  it("serialises daily like the schedule builder", () => {
    expect(scheduleToValue({ ...base, mode: "daily", time: "04:15" })).toBe(
      '{"type":"daily","hour":4,"minute":15}',
    );
  });

  it("serialises weekly with one day", () => {
    expect(
      scheduleToValue({ ...base, mode: "weekly", day: "sun", time: "01:00" }),
    ).toBe('{"type":"weekly","days":["sun"],"hour":1,"minute":0}');
  });

  it("passes custom through; empty custom means manual", () => {
    expect(scheduleToValue({ ...base, mode: "custom", custom: "0 2 * * *" })).toBe(
      "0 2 * * *",
    );
    expect(scheduleToValue({ ...base, mode: "custom", custom: " " })).toBeNull();
  });

  it("falls back to 02:00 for an unparsable time", () => {
    expect(scheduleToValue({ ...base, mode: "daily", time: "" })).toBe(
      '{"type":"daily","hour":2,"minute":0}',
    );
  });

  it("round-trips daily and weekly", () => {
    for (const v of [
      { ...base, mode: "daily" as const, time: "23:59" },
      { ...base, mode: "weekly" as const, day: "wed" as const, time: "00:00" },
    ]) {
      expect(parseSchedule(scheduleToValue(v))).toEqual(v);
    }
  });
});

describe("describeSchedulePreset", () => {
  it.each([
    [base, "Manual only"],
    [{ ...base, mode: "daily" as const, time: "02:00" }, "Daily at 02:00"],
    [
      { ...base, mode: "weekly" as const, day: "tue" as const, time: "06:30" },
      "Weekly on Tuesday at 06:30",
    ],
  ])("%o → %s", (value, text) => {
    expect(describeSchedulePreset(value)).toBe(text);
  });
});
