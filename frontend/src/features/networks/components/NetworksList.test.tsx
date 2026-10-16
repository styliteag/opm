import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import type { Network, Scanner, ScanSummary } from "@/lib/types";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    params,
    ...props
  }: {
    children: React.ReactNode;
    to: string;
    params?: Record<string, string>;
    className?: string;
  }) => (
    <a
      href={Object.entries(params ?? {}).reduce(
        (href, [k, v]) => href.replace(`$${k}`, v),
        to,
      )}
      {...props}
    >
      {children}
    </a>
  ),
  useNavigate: () => vi.fn(),
}));

import { NetworksList } from "./NetworksList";

function net(over: Partial<Network>): Network {
  return {
    id: 1,
    name: "Office",
    cidr: "10.0.0.0/24",
    port_spec: "1-65535",
    scanner_id: 1,
    scanner_type: "masscan",
    scan_schedule: null,
    scan_schedule_enabled: true,
    next_fire_time: null,
    schedule_description: null,
    nuclei_enabled: false,
    alert_config: null,
    ...over,
  } as Network;
}

const NETWORKS = [
  net({ id: 1, name: "Office" }),
  net({
    id: 2,
    name: "DMZ",
    cidr: "192.168.5.0/24",
    scanner_type: "nmap",
    nuclei_enabled: true,
    scan_schedule: "x",
    scan_schedule_enabled: false,
    alert_config: { ssh_weak_kex: true },
  }),
];

const LATEST = [
  {
    network_id: 1,
    scan: {
      status: "completed",
      completed_at: "2026-10-16T10:00:00",
      started_at: "2026-10-16T09:55:00",
      port_count: 12,
    } as ScanSummary,
  },
  { network_id: 2, scan: { status: "failed", started_at: "2026-10-16T08:00:00" } as ScanSummary },
];

function renderList(over: Partial<Parameters<typeof NetworksList>[0]> = {}) {
  const qc = new QueryClient();
  render(
    <QueryClientProvider client={qc}>
      <NetworksList
        networks={NETWORKS}
        scanners={[{ id: 1, name: "dmz-1" } as Scanner]}
        latestScans={LATEST}
        canOperate
        sshOverrideOnly={false}
        onClearFilter={vi.fn()}
        {...over}
      />
    </QueryClientProvider>,
  );
}

function row(name: string) {
  return screen.getByRole("link", { name }).closest("li") as HTMLElement;
}

describe("NetworksList", () => {
  it("renders slim rows with plain scan types", () => {
    renderList();
    const office = row("Office");
    expect(within(office).getByText("10.0.0.0/24")).toBeInTheDocument();
    expect(within(office).getByText("Port scan — fast")).toBeInTheDocument();
    expect(within(office).getByText("12 open ports")).toBeInTheDocument();
    expect(within(office).getByText("Manual")).toBeInTheDocument();
    expect(within(office).getByRole("img", { name: "Last scan OK" })).toBeInTheDocument();

    const dmz = row("DMZ");
    expect(within(dmz).getByText("Port scan — detailed")).toBeInTheDocument();
    expect(within(dmz).getByText("nmap + nuclei")).toBeInTheDocument();
    expect(within(dmz).getByText("Paused")).toBeInTheDocument();
    expect(within(dmz).getByRole("img", { name: "Last scan failed" })).toBeInTheDocument();
  });

  it("drops the v3 summary cards and phase toggles", () => {
    renderList();
    expect(screen.queryByText("Scanner Status")).not.toBeInTheDocument();
    expect(screen.queryByText("Network Summary")).not.toBeInTheDocument();
    expect(screen.queryByText("Host discovery")).not.toBeInTheDocument();
  });

  it("shows Scan now and the overflow menu only to operators", () => {
    renderList();
    expect(screen.getAllByRole("button", { name: "Scan now" })).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: "More actions for Office" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Add network/ })).toBeInTheDocument();
  });

  it("hides operator actions for viewers", () => {
    renderList({ canOperate: false });
    expect(screen.queryByRole("button", { name: "Scan now" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Add network/ })).not.toBeInTheDocument();
  });

  it("filters to SSH overrides", () => {
    renderList({ sshOverrideOnly: true });
    expect(screen.queryByRole("link", { name: "Office" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "DMZ" })).toBeInTheDocument();
    expect(screen.getByText(/1 of 2/)).toBeInTheDocument();
  });

  it("sorts by name descending on a second click", () => {
    renderList();
    fireEvent.click(screen.getByRole("button", { name: "Name" }));
    const names = screen
      .getAllByRole("link")
      .map((a) => a.textContent)
      .filter((t) => t === "Office" || t === "DMZ");
    expect(names).toEqual(["Office", "DMZ"]);
  });
});
