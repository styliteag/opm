import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { HostsTable } from "./HostsTable";
import type { Host } from "@/lib/types";

// Mock TanStack Router's Link
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    ...props
  }: {
    children: React.ReactNode;
    to: string;
    params?: Record<string, string>;
    className?: string;
  }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

// Mock sonner toast
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// Mock patchApi
vi.mock("@/lib/api", () => ({
  patchApi: vi.fn(),
}));

function renderWithQuery(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const now = new Date("2026-03-22T12:00:00Z");

const makeHost = (overrides: Partial<Host> = {}): Host => ({
  id: 1,
  ip: "192.168.1.1",
  hostname: null,
  is_pingable: null,
  mac_address: null,
  mac_vendor: null,
  first_seen_at: "2026-03-20T10:00:00Z",
  last_seen_at: "2026-03-22T11:00:00Z",
  user_comment: null,
  seen_by_networks: [1],
  open_port_count: 5,
  ...overrides,
});

describe("HostsTable", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders host IP as link", () => {
    renderWithQuery(<HostsTable hosts={[makeHost()]} />);
    expect(screen.getByText("192.168.1.1")).toBeInTheDocument();
  });

  it("renders hostname when available", () => {
    renderWithQuery(
      <HostsTable hosts={[makeHost({ hostname: "web-server-01" })]} />,
    );
    expect(screen.getByText("web-server-01")).toBeInTheDocument();
  });

  it("shows dash for missing hostname", () => {
    renderWithQuery(<HostsTable hosts={[makeHost({ hostname: null })]} />);
    expect(screen.getByText("-")).toBeInTheDocument();
  });

  it("renders open port count", () => {
    renderWithQuery(<HostsTable hosts={[makeHost({ open_port_count: 12 })]} />);
    expect(screen.getByText("12")).toBeInTheDocument();
  });

  it("renders multiple hosts", () => {
    const hosts = [
      makeHost({ id: 1, ip: "10.0.0.1" }),
      makeHost({ id: 2, ip: "10.0.0.2" }),
      makeHost({ id: 3, ip: "10.0.0.3" }),
    ];
    renderWithQuery(<HostsTable hosts={hosts} />);
    expect(screen.getByText("10.0.0.1")).toBeInTheDocument();
    expect(screen.getByText("10.0.0.2")).toBeInTheDocument();
    expect(screen.getByText("10.0.0.3")).toBeInTheDocument();
  });

});
