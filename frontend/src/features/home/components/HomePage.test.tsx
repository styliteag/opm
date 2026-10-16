import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { useAuthStore } from "@/stores/auth.store";
import type { Alert } from "@/lib/types";
import {
  groupPortAlerts,
  importantFindings,
} from "@/features/home/lib/homeQueue";

import { HomePage } from "./HomePage";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

vi.mock("@/features/alerts/components/AlertDetailPanel", () => ({
  AlertDetailPanel: ({ alertId }: { alertId: number }) => (
    <div>Detail panel for alert {alertId}</div>
  ),
}));

const homeData = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/features/home/hooks/useHomeData", () => ({
  HOME_ALERT_LIMIT: 200,
  useHomeData: () => homeData.current,
}));

function alert(overrides: Partial<Alert>): Alert {
  return {
    id: 1,
    type: "new_port",
    source: "port",
    source_key: null,
    network_id: 1,
    network_name: "LAN",
    global_open_port_id: null,
    ip: "10.0.0.1",
    port: 53,
    message: "New open port detected: 10.0.0.1:53",
    dismissed: false,
    assigned_to_user_id: null,
    assigned_to_email: null,
    created_at: "2026-10-16T10:00:00",
    dismiss_reason: null,
    severity: "high",
    severity_override: null,
    host_id: null,
    hostname: null,
    user_comment: null,
    last_comment: null,
    last_comment_by: null,
    last_comment_at: null,
    ssh_summary: null,
    related_ssh_alert_count: 0,
    related_ssh_alerts_dismissed: true,
    matching_rules: [],
    queue_state: "inbox",
    policy_state: "none",
    allow_rule_id: null,
    allow_scope: null,
    ...overrides,
  };
}

function setAlerts(alerts: Alert[], extra: Record<string, unknown> = {}) {
  homeData.current = {
    groups: groupPortAlerts(alerts),
    findings: importantFindings(alerts),
    offline: [],
    failedScans: [],
    networkStatus: [],
    total: alerts.length,
    loaded: alerts.length,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    ...extra,
  };
}

const ALERTS = [
  alert({ id: 1, ip: "10.0.0.1", port: 53, network_name: "LAN" }),
  alert({ id: 2, ip: "10.0.0.1", port: 53, network_id: 2, network_name: "DMZ" }),
  alert({ id: 3, ip: "10.0.0.2", port: 80, severity: "critical" }),
  alert({
    id: 10,
    source: "gvm",
    type: "gvm_vulnerability",
    severity: "high",
    message: "GVM OID 1.2.3 found 'OpenSSL Heartbleed' on 10.0.0.1:443/tcp.",
  }),
  alert({
    id: 11,
    source: "nuclei",
    type: "nuclei_vulnerability",
    severity: "medium",
    message: "Nuclei template x:y matched 'Low noise' on 10.0.0.1:80/tcp.",
  }),
];

function renderHome(props: Partial<Parameters<typeof HomePage>[0]> = {}) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const onOpenAlert = vi.fn();
  const onCloseAlert = vi.fn();
  render(
    <QueryClientProvider client={qc}>
      <HomePage onOpenAlert={onOpenAlert} onCloseAlert={onCloseAlert} {...props} />
    </QueryClientProvider>,
  );
  return { onOpenAlert, onCloseAlert };
}

describe("HomePage", () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    useAuthStore.setState({ token: "t", user: null, isAuthenticated: true });
    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          users: [],
          accepted_count: 1,
          dismissed_ids: [],
          missing_ids: [],
          errors: [],
        }),
    });
    vi.stubGlobal("fetch", mockFetch);
    setAlerts(ALERTS);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    useAuthStore.setState({ token: null, user: null, isAuthenticated: false });
  });

  const posts = () =>
    mockFetch.mock.calls
      .filter(([, init]) => (init as RequestInit | undefined)?.method === "POST")
      .map(([url, init]) => ({
        url: url as string,
        body: JSON.parse((init as RequestInit).body as string),
      }));

  it("groups port alerts by ip:port and shows the review count", () => {
    renderHome();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "2 new open ports to review",
    );
    const rows = screen.getAllByTestId("review-row");
    expect(rows).toHaveLength(2);
    // critical first, then the grouped row with its network badge
    expect(within(rows[0]).getByText("10.0.0.2:80")).toBeInTheDocument();
    expect(within(rows[1]).getByText("10.0.0.1:53")).toBeInTheDocument();
    expect(within(rows[1]).getByText("in 2 networks")).toBeInTheDocument();
  });

  it("shows only high+ findings with plain titles", () => {
    renderHome();
    expect(screen.getByText("1 important finding")).toBeInTheDocument();
    const findings = screen.getAllByTestId("finding-row");
    expect(findings).toHaveLength(1);
    expect(within(findings[0]).getByText("OpenSSL Heartbleed")).toBeInTheDocument();
    expect(screen.queryByText("Low noise")).not.toBeInTheDocument();
    expect(screen.queryByText(/GVM OID/)).not.toBeInTheDocument();
  });

  it("shows the empty state when nothing needs review", () => {
    setAlerts([]);
    renderHome();
    expect(
      screen.getByRole("heading", { name: "All open ports are explained" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Every open port has a reason")).toBeInTheDocument();
  });

  it("shows scanner and scan problem banners only when present", () => {
    setAlerts(ALERTS, {
      offline: ["edge-1"],
      failedScans: [{ networkId: 4, name: "Branch", scanId: 9, error: "timeout" }],
    });
    renderHome();
    const banners = screen.getAllByRole("alert");
    expect(banners).toHaveLength(2);
    expect(banners[0]).toHaveTextContent("1 scanner is offline: edge-1");
    expect(banners[1]).toHaveTextContent("Latest scan of Branch failed: timeout");
  });

  it("renders no banners when everything is healthy", () => {
    renderHome();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("j / Enter move the cursor and open details for the grouped row", () => {
    const { onOpenAlert } = renderHome();
    fireEvent.keyDown(window, { key: "j" });
    fireEvent.keyDown(window, { key: "Enter" });
    expect(onOpenAlert).toHaveBeenCalledWith(1);
    fireEvent.keyDown(window, { key: "k" });
    fireEvent.keyDown(window, { key: "Enter" });
    expect(onOpenAlert).toHaveBeenLastCalledWith(3);
  });

  it("e marks the row under the cursor Expected for this host (all grouped ids)", async () => {
    renderHome();
    fireEvent.keyDown(window, { key: "j" });
    fireEvent.keyDown(window, { key: "e" });
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0]).toEqual({
      url: "/api/alerts/bulk-accept-network",
      body: { alert_ids: [1, 2], match: "host" },
    });
  });

  it("s snoozes the row under the cursor", async () => {
    renderHome();
    fireEvent.keyDown(window, { key: "s" });
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0]).toEqual({
      url: "/api/alerts/bulk-dismiss",
      body: { alert_ids: [3] },
    });
  });

  it("x selects rows and the bulk bar snoozes every selected alert", async () => {
    renderHome();
    fireEvent.keyDown(window, { key: "x" });
    fireEvent.keyDown(window, { key: "j" });
    fireEvent.keyDown(window, { key: "x" });
    expect(screen.getByText("2 selected")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: /Snooze/ })[0]);
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0].body.alert_ids).toEqual([3, 1, 2]);
  });

  it("clicking Expected on a row is one click with no reason", async () => {
    renderHome();
    const row = screen.getAllByTestId("review-row")[1];
    fireEvent.click(within(row).getByRole("button", { name: /^Expected$/ }));
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0].body).toEqual({ alert_ids: [1, 2], match: "host" });
  });

  it("ignores shortcuts while the slide-over is open", () => {
    const { onOpenAlert } = renderHome({ selectedAlertId: 3 });
    fireEvent.keyDown(window, { key: "Enter" });
    expect(onOpenAlert).not.toHaveBeenCalled();
  });

  it("opens the details slide-over for the selected alert id", () => {
    renderHome({ selectedAlertId: 42 });
    expect(screen.getByText("Detail panel for alert 42")).toBeInTheDocument();
  });

  it("clicking a row opens its details", () => {
    const { onOpenAlert } = renderHome();
    fireEvent.click(screen.getAllByTestId("review-row")[0]);
    expect(onOpenAlert).toHaveBeenCalledWith(3);
  });
});
