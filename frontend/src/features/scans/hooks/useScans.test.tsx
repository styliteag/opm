import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { useAuthStore } from "@/stores/auth.store";

import { useScanMutations } from "./useScans";

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("useScanMutations.triggerNse", () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    useAuthStore.setState({ token: "t" });
    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: () => Promise.resolve({ scan_id: 3, status: "planned" }),
    });
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => vi.unstubAllGlobals());

  it("posts network_id + template_id to /api/nse/scan", async () => {
    const { result } = renderHook(() => useScanMutations(), { wrapper });
    result.current.triggerNse.mutate({ networkId: 7, profileId: 4 });
    await waitFor(() => expect(result.current.triggerNse.isSuccess).toBe(true));
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/api\/nse\/scan$/);
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      network_id: 7,
      template_id: 4,
    });
  });
});
