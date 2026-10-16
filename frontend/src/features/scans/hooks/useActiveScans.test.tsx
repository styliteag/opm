import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { useAuthStore } from "@/stores/auth.store";

import { useActiveScans } from "./useActiveScans";

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("useActiveScans", () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    useAuthStore.setState({ token: "t" });
    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ scans: [] }),
    });
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => vi.unstubAllGlobals());

  it("asks for planned and running scans, including hidden ones", async () => {
    const { result } = renderHook(() => useActiveScans(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toContain("/api/scans?");
    const params = new URLSearchParams(url.split("?")[1]);
    expect(params.getAll("status")).toEqual(["planned", "running"]);
    expect(params.get("include_hidden")).toBe("true");
    expect(params.get("limit")).toBe("200");
  });
});
