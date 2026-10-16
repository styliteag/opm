import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { useAuthStore } from "@/stores/auth.store";

import { expectedRequest, useTriageActions } from "./useTriageActions";

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
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

function call(mockFetch: ReturnType<typeof vi.fn>, index = 0) {
  const [url, init] = mockFetch.mock.calls[index] as [string, RequestInit];
  return {
    url,
    method: init.method,
    body: init.body ? JSON.parse(init.body as string) : undefined,
  };
}

describe("expectedRequest", () => {
  it.each([
    ["host", "/api/alerts/bulk-accept-network", "host"],
    ["network", "/api/alerts/bulk-accept-network", "all_hosts"],
    ["global", "/api/alerts/bulk-accept-global", "all_hosts"],
  ] as const)("scope %s -> %s match=%s", (scope, path, match) => {
    expect(expectedRequest({ alertIds: [1, 2], scope })).toEqual({
      path,
      body: { alert_ids: [1, 2], match },
    });
  });

  it("includes a trimmed reason only when given", () => {
    expect(
      expectedRequest({ alertIds: [1], scope: "host", reason: "  Web server " })
        .body,
    ).toEqual({ alert_ids: [1], match: "host", reason: "Web server" });
    expect(
      expectedRequest({ alertIds: [1], scope: "host", reason: "   " }).body,
    ).toEqual({ alert_ids: [1], match: "host" });
  });
});

describe("useTriageActions", () => {
  beforeEach(() => {
    useAuthStore.setState({ token: "t", user: null, isAuthenticated: true });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    useAuthStore.setState({ token: null, user: null, isAuthenticated: false });
  });

  it("expected posts to the network endpoint with match=host by default", async () => {
    const mockFetch = okFetch({ accepted_count: 1, dismissed_ids: [4], missing_ids: [], errors: [] });
    vi.stubGlobal("fetch", mockFetch);
    const { result } = renderHook(() => useTriageActions(), { wrapper: createWrapper() });

    await result.current.expected.mutateAsync({ alertIds: [4, 5], scope: "host" });

    expect(call(mockFetch)).toEqual({
      url: "/api/alerts/bulk-accept-network",
      method: "POST",
      body: { alert_ids: [4, 5], match: "host" },
    });
  });

  it("expected everywhere posts to the global endpoint with a reason", async () => {
    const mockFetch = okFetch({ accepted_count: 1, dismissed_ids: [4], missing_ids: [], errors: [] });
    vi.stubGlobal("fetch", mockFetch);
    const { result } = renderHook(() => useTriageActions(), { wrapper: createWrapper() });

    await result.current.expected.mutateAsync({
      alertIds: [4],
      scope: "global",
      reason: "VPN endpoint",
    });

    expect(call(mockFetch)).toEqual({
      url: "/api/alerts/bulk-accept-global",
      method: "POST",
      body: { alert_ids: [4], match: "all_hosts", reason: "VPN endpoint" },
    });
  });

  it("snooze posts bulk-dismiss without a reason", async () => {
    const mockFetch = okFetch({ dismissed_ids: [1, 2], missing_ids: [] });
    vi.stubGlobal("fetch", mockFetch);
    const { result } = renderHook(() => useTriageActions(), { wrapper: createWrapper() });

    await result.current.snooze.mutateAsync({ alertIds: [1, 2] });

    expect(call(mockFetch)).toEqual({
      url: "/api/alerts/bulk-dismiss",
      method: "POST",
      body: { alert_ids: [1, 2] },
    });
  });

  it("reopen PUTs every alert id", async () => {
    const mockFetch = okFetch({});
    vi.stubGlobal("fetch", mockFetch);
    const { result } = renderHook(() => useTriageActions(), { wrapper: createWrapper() });

    await result.current.reopen.mutateAsync({ alertIds: [3, 8] });

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(call(mockFetch, 0)).toMatchObject({ url: "/api/alerts/3/reopen", method: "PUT" });
    expect(call(mockFetch, 1)).toMatchObject({ url: "/api/alerts/8/reopen", method: "PUT" });
  });

  it("acceptRisk posts the required reason", async () => {
    const mockFetch = okFetch({ id: 9 });
    vi.stubGlobal("fetch", mockFetch);
    const { result } = renderHook(() => useTriageActions(), { wrapper: createWrapper() });

    await result.current.acceptRisk.mutateAsync({ alertId: 9, reason: " known " });

    expect(call(mockFetch)).toEqual({
      url: "/api/alerts/9/accept-risk",
      method: "POST",
      body: { reason: "known" },
    });
  });

  it("assign PATCHes every alert id with user_id", async () => {
    const mockFetch = okFetch({});
    vi.stubGlobal("fetch", mockFetch);
    const { result } = renderHook(() => useTriageActions(), { wrapper: createWrapper() });

    await result.current.assign.mutateAsync({ alertIds: [1, 2], userId: 5 });

    expect(call(mockFetch, 0)).toEqual({
      url: "/api/alerts/1/assign",
      method: "PATCH",
      body: { user_id: 5 },
    });
    expect(call(mockFetch, 1).url).toBe("/api/alerts/2/assign");
  });

  it("remove posts bulk-delete", async () => {
    const mockFetch = okFetch({ deleted_ids: [1], missing_ids: [] });
    vi.stubGlobal("fetch", mockFetch);
    const { result } = renderHook(() => useTriageActions(), { wrapper: createWrapper() });

    await result.current.remove.mutateAsync({ alertIds: [1] });

    expect(call(mockFetch)).toEqual({
      url: "/api/alerts/bulk-delete",
      method: "POST",
      body: { alert_ids: [1] },
    });
  });

  it("invalidates the alerts root key on success", async () => {
    vi.stubGlobal("fetch", okFetch({ dismissed_ids: [], missing_ids: [] }));
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, "invalidateQueries");
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useTriageActions(), { wrapper });

    await result.current.snooze.mutateAsync({ alertIds: [1] });

    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith({ queryKey: ["alerts"] }),
    );
  });
});
