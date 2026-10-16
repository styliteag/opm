import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { useAuthStore } from "@/stores/auth.store";
import type { PortRule } from "../hooks/useNetworkDetail";

import { PortRulesEditor } from "./PortRulesEditor";

const RULES: PortRule[] = [
  {
    id: 11,
    network_id: 3,
    rule_type: "accepted",
    match_criteria: { ip: "10.0.0.5", port: 443 },
    description: "Web server",
    created_at: "2026-10-16T10:00:00",
  },
  {
    id: 12,
    network_id: 3,
    rule_type: "critical",
    match_criteria: { port: 23 },
    description: null,
    created_at: "2026-10-16T10:00:00",
  },
];

function renderEditor() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  render(
    <QueryClientProvider client={qc}>
      <PortRulesEditor networkId={3} rules={RULES} />
    </QueryClientProvider>,
  );
}

describe("PortRulesEditor", () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    useAuthStore.setState({ token: "t" });
    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      json: () => Promise.resolve({}),
    });
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("labels rule types with glossary terms", () => {
    renderEditor();
    expect(screen.getByText("Expected")).toBeInTheDocument();
    expect(screen.getByText("Always critical")).toBeInTheDocument();
  });

  it("asks before deleting and does nothing on cancel", () => {
    renderEditor();
    fireEvent.click(
      screen.getByRole("button", { name: "Remove rule for 10.0.0.5:443" }),
    );
    expect(screen.getByText("Remove rule for 10.0.0.5:443?")).toBeInTheDocument();
    expect(
      screen.getByText("Future scans alert on this port again."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("deletes after confirmation", async () => {
    renderEditor();
    fireEvent.click(
      screen.getByRole("button", { name: "Remove rule for any IP:23" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove rule" }));
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/networks/3/rules/12");
    expect(init.method).toBe("DELETE");
  });
});
