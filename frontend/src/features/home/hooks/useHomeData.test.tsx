import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { useAuthStore } from "@/stores/auth.store";

import { useHomeAlerts } from "./useHomeData";

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

describe("useHomeAlerts", () => {
  beforeEach(() => {
    useAuthStore.setState({ token: "t", user: null, isAuthenticated: true });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    useAuthStore.setState({ token: null, user: null, isAuthenticated: false });
  });

  it.each([
    ["inbox", "queue_state=inbox"],
    ["handled", "queue_state=out_of_inbox"],
  ] as const)("mode %s requests %s with limit 200", async (mode, expected) => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ alerts: [], total: 0, severity_counts: {} }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { result } = renderHook(() => useHomeAlerts(mode), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toContain("/api/alerts/?");
    expect(url).toContain(expected);
    expect(url).toContain("limit=200");
  });

  it("passes the network and search filters to the alerts API", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ alerts: [], total: 0, severity_counts: {} }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { result } = renderHook(
      () => useHomeAlerts("inbox", { network_id: 4, search: "db01" }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const params = new URL(mockFetch.mock.calls[0][0] as string, "http://x").searchParams;
    expect(params.get("network_id")).toBe("4");
    expect(params.get("search")).toBe("db01");
    expect(params.get("queue_state")).toBe("inbox");
  });
});
