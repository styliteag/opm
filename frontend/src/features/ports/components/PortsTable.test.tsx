import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { useAuthStore, type UserRole } from "@/stores/auth.store";
import type { GlobalOpenPort } from "@/lib/types";

import { PortsTable } from "./PortsTable";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    params,
    className,
  }: {
    children: React.ReactNode;
    to: string;
    params?: Record<string, string>;
    className?: string;
  }) => (
    <a href={to.replace("$hostId", params?.hostId ?? "")} className={className}>
      {children}
    </a>
  ),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

function port(over: Partial<GlobalOpenPort>): GlobalOpenPort {
  return {
    id: 1,
    ip: "10.0.0.1",
    port: 22,
    protocol: "tcp",
    banner: null,
    service_guess: "ssh",
    mac_address: null,
    mac_vendor: null,
    first_seen_at: "2026-10-01T00:00:00Z",
    last_seen_at: "2026-10-02T00:00:00Z",
    seen_by_networks: [1],
    user_comment: null,
    is_stale: false,
    host_id: 82,
    hostname: "gw.example",
    status: "new",
    why: null,
    alert_id: 500,
    ...over,
  };
}

function signIn(role: UserRole) {
  useAuthStore.setState({
    token: "t",
    user: { id: 1, email: "u@example.com", role, theme_preference: "dark" },
  });
}

function renderTable(ports: GlobalOpenPort[]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <PortsTable ports={ports} networkNames={new Map([[1, "LAN"]])} />
    </QueryClientProvider>,
  );
}

describe("PortsTable", () => {
  const mockFetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve({}),
  });

  beforeEach(() => {
    signIn("admin");
    vi.stubGlobal("fetch", mockFetch);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    mockFetch.mockClear();
  });

  it("renders status, host link, network, stale chip and Why", () => {
    renderTable([
      port({}),
      port({
        id: 2,
        port: 443,
        status: "expected",
        why: "Web server",
        is_stale: true,
        alert_id: null,
      }),
    ]);
    const rows = screen.getAllByTestId("port-row");
    expect(within(rows[0]).getByText("New")).toBeInTheDocument();
    expect(
      within(rows[0]).getByRole("link", { name: "10.0.0.1" }),
    ).toHaveAttribute("href", "/hosts/82");
    expect(within(rows[0]).getByText("gw.example")).toBeInTheDocument();
    expect(within(rows[0]).getByText("LAN")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Expected")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Web server")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Stale")).toBeInTheDocument();
  });

  it("offers Expected + Snooze only for new rows with an alert", () => {
    renderTable([
      port({}),
      port({ id: 2, status: "review", alert_id: null }),
      port({ id: 3, status: "snoozed", alert_id: 9 }),
    ]);
    const rows = screen.getAllByTestId("port-row");
    expect(
      within(rows[0]).getByRole("button", { name: "Expected" }),
    ).toBeInTheDocument();
    expect(
      within(rows[0]).getByRole("button", { name: /Snooze/ }),
    ).toBeInTheDocument();
    expect(
      within(rows[1]).queryByRole("button", { name: /Snooze/ }),
    ).toBeNull();
    expect(
      within(rows[1]).getByRole("button", { name: /Add why/ }),
    ).toBeInTheDocument();
    expect(
      within(rows[2]).queryByRole("button", { name: /Snooze/ }),
    ).toBeNull();
  });

  it("Snooze sends the row's alert id", async () => {
    renderTable([port({})]);
    fireEvent.click(screen.getByRole("button", { name: /Snooze/ }));
    await vi.waitFor(() => expect(mockFetch).toHaveBeenCalled());
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/alerts/bulk-dismiss");
    expect(JSON.parse(init.body as string)).toEqual({ alert_ids: [500] });
  });

  it("edits one Why at a time and saves only changed text", async () => {
    renderTable([port({}), port({ id: 2, why: "Old" })]);
    fireEvent.click(screen.getByRole("button", { name: /Add why/ }));
    expect(screen.getAllByLabelText("Why is this port open?")).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Edit why: Old" }));
    const inputs = screen.getAllByLabelText("Why is this port open?");
    expect(inputs).toHaveLength(1);
    expect(inputs[0]).toHaveValue("Old");

    fireEvent.keyDown(inputs[0], { key: "Enter" });
    expect(mockFetch).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /Old/ }));
    const input = screen.getByLabelText("Why is this port open?");
    fireEvent.change(input, { target: { value: "Jump host" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await vi.waitFor(() => expect(mockFetch).toHaveBeenCalled());
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/global-ports/2/comment");
    expect(JSON.parse(init.body as string)).toEqual({
      user_comment: "Jump host",
    });
  });

  it("hides triage controls from viewers (Why stays editable, backend allows any user)", () => {
    signIn("viewer");
    renderTable([port({})]);
    expect(screen.queryByRole("button", { name: "Expected" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Snooze/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Add why/ })).toBeInTheDocument();
  });

  it("shows Snooze but not Expected to analysts", () => {
    signIn("analyst");
    renderTable([port({})]);
    expect(screen.queryByRole("button", { name: "Expected" })).toBeNull();
    expect(screen.getByRole("button", { name: /Snooze/ })).toBeInTheDocument();
  });
});
