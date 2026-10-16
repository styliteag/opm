import { describe, expect, it } from "vitest";

import { describeScheduleValue, scheduleCellText } from "./scheduleState";

describe("describeScheduleValue", () => {
  it.each([
    ["", "No schedule"],
    ['{"type":"interval_hours","hours":4}', "Every 4 hours"],
    ['{"type":"monthly_date","day":1,"hour":2,"minute":0}', "Monthly on day 1 at 02:00"],
    ["0 2 * * *", "Cron: 0 2 * * *"],
  ])("%s → %s", (raw, text) => {
    expect(describeScheduleValue(raw)).toBe(text);
  });
});

describe("scheduleCellText", () => {
  it.each([
    [null, "Manual"],
    ["  ", "Manual"],
    [
      '{"type":"monthly_nth","nth":1,"weekday":"sun","hour":2,"minute":0}',
      "Monthly on the 1st Sunday at 02:00",
    ],
  ])("%s → %s", (raw, text) => {
    expect(scheduleCellText(raw)).toBe(text);
  });
});
