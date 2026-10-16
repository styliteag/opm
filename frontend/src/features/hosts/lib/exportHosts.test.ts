import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAuthStore } from "@/stores/auth.store";

import { exportHostsCsv } from "./exportHosts";

describe("exportHostsCsv", () => {
  const click = vi.fn();

  beforeEach(() => {
    useAuthStore.setState({ token: "tok" });
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:x"),
      revokeObjectURL: vi.fn(),
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(click);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    click.mockReset();
  });

  it("downloads with the bearer token and network filter", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(new Blob(["ip"])),
    });
    vi.stubGlobal("fetch", mockFetch);

    await exportHostsCsv(4);

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/hosts/export/csv?network_id=4");
    expect(init.headers).toEqual({ Authorization: "Bearer tok" });
    expect(click).toHaveBeenCalledOnce();
  });

  it("does not download on an error response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, statusText: "Forbidden" }),
    );
    await exportHostsCsv();
    expect(click).not.toHaveBeenCalled();
  });
});
