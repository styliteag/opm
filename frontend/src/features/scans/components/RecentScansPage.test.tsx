import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import type { Network, ScanListItem } from "@/lib/types";
import { useAuthStore } from "@/stores/auth.store";

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
      href={Object.entries(params ?? {}).reduce((h, [k, v]) => h.replace(`$${k}`, v), to)}
      {...props}
    >
      {children}
    </a>
  ),
}));

import { RecentScansPage } from "./RecentScansPage";

const SCAN = {
  id: 57,
  network_id: 3,
  network_name: "DMZ",
  scanner_name: "Local",
  status: "completed",
  started_at: "2026-10-16T10:00:00",
  completed_at: "2026-10-16T10:05:00",
  trigger_type: "scheduled",
  port_count: 12,
  hidden: false,
} as ScanListItem;

describe("RecentScansPage", () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    useAuthStore.setState({ token: "t" });
    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          scans: [SCAN, { ...SCAN, id: 58, status: "running", progress_percent: 30 }],
        }),
    });
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => vi.unstubAllGlobals());

  function renderPage(onFiltersChange = vi.fn()) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    render(
      <QueryClientProvider client={qc}>
        <RecentScansPage
          networks={[{ id: 3, name: "DMZ" } as Network]}
          status="all"
          onFiltersChange={onFiltersChange}
        />
      </QueryClientProvider>,
    );
    return onFiltersChange;
  }

  it("lists scans with network, status and links", async () => {
    renderPage();
    expect(await screen.findByRole("link", { name: "#57" })).toHaveAttribute("href", "/scans/57");
    expect(screen.getAllByRole("link", { name: "DMZ" })[0]).toHaveAttribute("href", "/networks/3");
    expect(screen.getByText("Running 30%")).toBeInTheDocument();
    expect(screen.getAllByText("Scheduled")).toHaveLength(2);
  });

  it("reports filter changes", async () => {
    const onChange = renderPage();
    await screen.findByRole("link", { name: "#57" });
    fireEvent.click(screen.getByRole("button", { name: "Failed" }));
    expect(onChange).toHaveBeenCalledWith({ status: "failed", networkId: undefined });
    fireEvent.change(screen.getByLabelText("Network"), { target: { value: "3" } });
    expect(onChange).toHaveBeenCalledWith({ status: "all", networkId: 3 });
  });

  it("requests hidden scans when asked", async () => {
    renderPage();
    await screen.findByRole("link", { name: "#57" });
    fireEvent.click(screen.getByLabelText("Show hidden scans"));
    await waitFor(() => {
      const urls = mockFetch.mock.calls.map((c) => String(c[0]));
      expect(urls.some((u) => u.includes("include_hidden=true"))).toBe(true);
    });
  });
});
