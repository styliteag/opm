import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { useAuthStore } from "@/stores/auth.store";
import type { GvmSeverityRule } from "../api";

import { SeverityRulesPage } from "./SeverityRulesPage";

const base: GvmSeverityRule = {
  id: 5,
  oid: "1.3.6.1.4.1.25623.1.0.147232",
  network_id: null,
  network_name: null,
  severity_override: "info",
  reason: "Internal resolver",
  created_by_user_id: 1,
  created_by_username: "admin",
  created_at: "2026-10-16T10:00:00",
  updated_at: "2026-10-16T10:00:00",
};

const RULES: GvmSeverityRule[] = [
  base,
  {
    ...base,
    id: 6,
    oid: "nse:ssl-cert",
    severity_override: "high",
    reason: null,
  },
];

function jsonResponse(body: unknown, status = 200) {
  return { ok: status < 400, status, json: () => Promise.resolve(body) };
}

function renderPage() {
  useAuthStore.setState({
    token: "t",
    user: {
      id: 1,
      email: "a@example.com",
      role: "operator",
      theme_preference: "dark",
    },
  });
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  render(
    <QueryClientProvider client={qc}>
      <SeverityRulesPage />
    </QueryClientProvider>,
  );
}

describe("SeverityRulesPage", () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === "DELETE")
        return Promise.resolve(jsonResponse({}, 204));
      if (url.includes("/api/networks"))
        return Promise.resolve(jsonResponse({ networks: [] }));
      return Promise.resolve(jsonResponse({ rules: RULES }));
    });
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    useAuthStore.setState({ user: null, token: null });
  });

  it("uses Finding ID and marks accepted risks", async () => {
    renderPage();
    expect(
      await screen.findByRole("heading", { name: "Finding rules" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Finding ID")).toBeInTheDocument();
    expect(screen.queryByText("OID")).not.toBeInTheDocument();
    expect(screen.getByText("Accepted risk")).toBeInTheDocument();
    expect(screen.getByText("Deep vulnerability scan")).toBeInTheDocument();
  });

  it("shows Created with the app date format, not the browser locale", async () => {
    renderPage();
    const cells = await screen.findAllByText(/^Oct 16, 2026/);
    expect(cells).toHaveLength(RULES.length);
  });

  it("keeps import/export behind advanced settings", async () => {
    renderPage();
    await screen.findByRole("heading", { name: "Finding rules" });
    expect(screen.queryByRole("button", { name: /export json/i })).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: /show advanced settings/i }),
    );
    expect(
      screen.getByRole("button", { name: /export json/i }),
    ).toBeInTheDocument();
  });

  it("confirms before deleting", async () => {
    renderPage();
    const buttons = await screen.findAllByRole("button", {
      name: "Delete rule",
    });
    fireEvent.click(buttons[0]);
    expect(await screen.findByText("Delete this rule?")).toBeInTheDocument();
    expect(
      mockFetch.mock.calls.some(([, init]) => init?.method === "DELETE"),
    ).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(
        mockFetch.mock.calls.some(
          ([url, init]) =>
            init?.method === "DELETE" &&
            String(url).endsWith("/api/severity-rules/5"),
        ),
      ).toBe(true),
    );
  });
});
