import { beforeEach, describe, expect, it, vi } from "vitest";

import { exportAlerts } from "./exportAlerts";

const download = vi.fn();
vi.mock("@/lib/download", () => ({
  downloadAuthenticated: (...args: unknown[]) => download(...args),
}));

describe("exportAlerts", () => {
  beforeEach(() => download.mockReset());

  it("exports the open queue", async () => {
    await exportAlerts("csv", "open");
    expect(download).toHaveBeenCalledWith(
      "/api/alerts/export/csv?queue_state=inbox",
      "alerts-open.csv",
    );
  });

  it("exports snoozed alerts without an Expected rule", async () => {
    await exportAlerts("pdf", "snoozed");
    expect(download).toHaveBeenCalledWith(
      "/api/alerts/export/pdf?queue_state=out_of_inbox&policy_state=none",
      "alerts-snoozed.pdf",
    );
  });

  it("exports alerts covered by an Expected rule", async () => {
    await exportAlerts("csv", "expected");
    expect(download).toHaveBeenCalledWith(
      "/api/alerts/export/csv?policy_state=allowed",
      "alerts-expected.csv",
    );
  });
});
