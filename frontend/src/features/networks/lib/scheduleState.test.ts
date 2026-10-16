import { describe, expect, it } from "vitest";

import { describeScheduleValue } from "./scheduleState";

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
