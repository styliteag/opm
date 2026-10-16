import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { useAuthStore } from "@/stores/auth.store";

import { useGlobalPortList, usePortComment } from "./usePorts";

function createWrapper(
  qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  }),
) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

function okFetch(body: unknown = {}) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  });
}

describe("usePorts hooks", () => {
  beforeEach(() => useAuthStore.setState({ token: "t" }));
  afterEach(() => vi.unstubAllGlobals());

  it("lists global ports with the status view as repeated params", async () => {
    const mockFetch = okFetch({ ports: [] });
    vi.stubGlobal("fetch", mockFetch);
    const { result } = renderHook(
      () => useGlobalPortList({ view: "decide", page: 1, networkId: 3 }),
      { wrapper: createWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url.startsWith("/api/global-ports?")).toBe(true);
    const params = new URLSearchParams(url.split("?")[1]);
    expect(params.getAll("status")).toEqual(["new", "review"]);
    expect(params.get("network_id")).toBe("3");
    expect(params.get("offset")).toBe("50");
  });

  it("PATCHes the port comment and invalidates ports + hosts", async () => {
    const mockFetch = okFetch({ id: 9 });
    vi.stubGlobal("fetch", mockFetch);
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => usePortComment(), {
      wrapper: createWrapper(qc),
    });
    await result.current.mutateAsync({ portId: 9, comment: "  Web server " });
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/global-ports/9/comment");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({
      user_comment: "Web server",
    });
    await waitFor(() => {
      expect(spy).toHaveBeenCalledWith({ queryKey: ["global-ports"] });
      expect(spy).toHaveBeenCalledWith({ queryKey: ["hosts"] });
    });
  });

  it("sends null to clear an empty comment", async () => {
    const mockFetch = okFetch({ id: 9 });
    vi.stubGlobal("fetch", mockFetch);
    const { result } = renderHook(() => usePortComment(), {
      wrapper: createWrapper(),
    });
    await result.current.mutateAsync({ portId: 9, comment: "   " });
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ user_comment: null });
  });
});
