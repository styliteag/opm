import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { useAuthStore } from "@/stores/auth.store";

import { Breadcrumbs } from "./BreadcrumbNav";

const path = vi.hoisted(() => ({ current: "/" }));

vi.mock("@tanstack/react-router", () => ({
  useRouterState: (opts?: {
    select?: (s: { location: { pathname: string } }) => unknown;
  }) => {
    const state = { location: { pathname: path.current } };
    return opts?.select ? opts.select(state) : state;
  },
}));

const RESPONSES: Record<string, unknown> = {
  "/api/networks": { networks: [{ id: 4, name: "DMZ" }] },
  "/api/scanners": { scanners: [{ id: 3, name: "edge-1" }] },
  "/api/users/7": { id: 7, email: "ops@example.com" },
  "/api/hosts/42/overview": { host: { hostname: null, ip: "10.0.0.42" } },
};

function renderAt(pathname: string) {
  path.current = pathname;
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  render(
    <QueryClientProvider client={qc}>
      <Breadcrumbs />
    </QueryClientProvider>,
  );
}

describe("Breadcrumbs", () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    useAuthStore.setState({ token: "t", user: null, isAuthenticated: true });
    mockFetch = vi.fn((url: string) => {
      const body = RESPONSES[url];
      return Promise.resolve(
        body
          ? { ok: true, status: 200, json: () => Promise.resolve(body) }
          : { ok: false, status: 404, statusText: "Not Found", json: () => Promise.resolve({}) },
      );
    });
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    useAuthStore.setState({ token: null, user: null, isAuthenticated: false });
  });

  it.each([
    ["/networks/4/edit", "DMZ"],
    ["/settings/scanners/3", "edge-1"],
    ["/settings/users/7", "ops@example.com"],
    ["/hosts/42", "10.0.0.42"],
  ])("%s shows the name %s", async (pathname, name) => {
    renderAt(pathname);
    expect(await screen.findByText(name)).toBeInTheDocument();
  });

  it("labels a scan without fetching", () => {
    renderAt("/scans/12");
    expect(screen.getByText("Scan #12")).toBeInTheDocument();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("falls back to the id when the entity is unknown", async () => {
    renderAt("/networks/99");
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.getByText("99")).toBeInTheDocument();
  });
});
