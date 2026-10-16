import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import type { ReactNode } from "react";

import type { ScanListItem } from "@/lib/types";

import { ActiveScansStrip } from "./ActiveScansStrip";

function renderWithRouter(ui: ReactNode) {
  const rootRoute = createRootRoute({ component: () => <>{ui}</> });
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return render(<RouterProvider router={router} />);
}

const base: ScanListItem = {
  id: 7,
  network_id: 2,
  network_name: "DMZ",
  scanner_id: 1,
  scanner_name: "Local",
  status: "running",
  started_at: null,
  completed_at: null,
  cancelled_at: null,
  cancelled_by: null,
  cancelled_by_email: null,
  error_message: null,
  trigger_type: "manual",
  hidden: false,
  progress_percent: 45,
  progress_message: "Port scan",
  actual_rate: null,
  port_count: 0,
};

describe("ActiveScansStrip", () => {
  it("renders nothing when no scan is active", () => {
    const { container } = render(<ActiveScansStrip scans={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("lists running and queued scans with links to the scan", async () => {
    renderWithRouter(
      <ActiveScansStrip
        scans={[base, { ...base, id: 8, network_name: "LAN", status: "planned", progress_percent: null }]}
      />,
    );
    expect(await screen.findByText("Scans in progress (2)")).toBeInTheDocument();
    expect(screen.getByText("Running 45%")).toBeInTheDocument();
    expect(screen.getByText("Queued")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /DMZ/ })).toHaveAttribute("href", "/scans/7");
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "45");
  });
});
