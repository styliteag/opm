import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { useAuthStore, type UserRole } from "@/stores/auth.store";
import type { PortRule } from "../types";

import { AlertRulesPage } from "./AlertRulesPage";

const RULES: PortRule[] = [
  {
    id: 1,
    network_id: null,
    network_name: null,
    rule_type: "accepted",
    ip: "10.0.0.5",
    port: "443",
    source: "port",
    alert_type: null,
    script_name: null,
    description: "Web server",
    enabled: true,
    created_at: "2026-10-16T10:00:00",
    hit_count: 3,
  },
  {
    id: 2,
    network_id: null,
    network_name: null,
    rule_type: "critical",
    ip: null,
    port: "23",
    source: "ssh",
    alert_type: null,
    script_name: null,
    description: null,
    enabled: true,
    created_at: "2026-10-16T10:00:00",
    hit_count: 0,
  },
];

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status < 400,
    status,
    json: () => Promise.resolve(body),
  };
}

function renderPage(role: UserRole) {
  useAuthStore.setState({
    token: "t",
    user: { id: 1, email: "u@example.com", role, theme_preference: "dark" },
  });
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  render(
    <QueryClientProvider client={qc}>
      <AlertRulesPage />
    </QueryClientProvider>,
  );
}

describe("AlertRulesPage", () => {
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

  it("shows glossary labels and plain source names", async () => {
    renderPage("operator");
    expect(
      await screen.findByRole("heading", { name: "Port rules" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "Expected (1)" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "Always critical (1)" }),
    ).toBeInTheDocument();
    expect(screen.getByText("SSH check")).toBeInTheDocument();
    expect(screen.queryByText("Allowed")).not.toBeInTheDocument();
  });

  it("filters by rule type", async () => {
    renderPage("operator");
    expect(await screen.findByText("10.0.0.5:443")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Always critical (1)" }));
    expect(screen.queryByText("10.0.0.5:443")).not.toBeInTheDocument();
    expect(screen.getByText("23")).toBeInTheDocument();
  });

  it("confirms before deleting a rule", async () => {
    const confirmSpy = vi.spyOn(window, "confirm");
    renderPage("operator");
    const buttons = await screen.findAllByRole("button", {
      name: "Delete rule",
    });
    fireEvent.click(buttons[0]);
    expect(await screen.findByText("Delete this rule?")).toBeInTheDocument();
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(
      mockFetch.mock.calls.some(([, init]) => init?.method === "DELETE"),
    ).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(
        mockFetch.mock.calls.some(
          ([url, init]) =>
            init?.method === "DELETE" &&
            String(url).endsWith("/api/port-rules/global/1"),
        ),
      ).toBe(true),
    );
  });

  it("hides editing controls for viewers", async () => {
    renderPage("viewer");
    await screen.findByRole("heading", { name: "Port rules" });
    expect(screen.queryByRole("button", { name: /add rule/i })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete rule" })).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();
  });
});
