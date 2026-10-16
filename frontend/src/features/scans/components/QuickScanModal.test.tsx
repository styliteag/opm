import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { useAuthStore } from "@/stores/auth.store";
import { useUiStore } from "@/stores/ui.store";

import { QuickScanModal } from "./QuickScanModal";

const NETWORKS = {
  networks: [
    {
      id: 7,
      name: "Office",
      cidr: "10.0.0.0/24",
      port_spec: "1-1024",
      scan_rate: 1000,
      scanner_type: "masscan",
      nuclei_enabled: false,
    },
  ],
};

function respond(body: unknown) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  });
}

function renderModal() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  render(
    <QueryClientProvider client={qc}>
      <QuickScanModal />
    </QueryClientProvider>,
  );
}

function posts(mockFetch: ReturnType<typeof vi.fn>) {
  return mockFetch.mock.calls
    .map(([url, init]) => ({ url: String(url), init: init as RequestInit }))
    .filter((c) => c.init?.method === "POST")
    .map((c) => ({ url: c.url, body: JSON.parse(String(c.init.body)) }));
}

describe("QuickScanModal", () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    useAuthStore.setState({ token: "t" });
    useUiStore.setState({ quickScanModalOpen: true });
    mockFetch = vi.fn((url: string) =>
      respond(
        String(url).endsWith("/api/networks")
          ? NETWORKS
          : String(url).endsWith("/api/nse/profiles")
            ? { profiles: [{ id: 4, name: "Vulners", nse_scripts: ["vulners"] }] }
            : { scan_id: 1 },
      ),
    );
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function pickNetwork() {
    renderModal();
    await screen.findByRole("option", { name: "Office (10.0.0.0/24)" });
    fireEvent.change(screen.getByLabelText("Network"), {
      target: { value: "7" },
    });
  }

  it("offers scan and host discovery, no separate NSE mode", () => {
    renderModal();
    expect(screen.getAllByRole("radio")).toHaveLength(2);
  });

  it("sends the chosen NSE profile (bug #1)", async () => {
    await pickNetwork();
    fireEvent.click(screen.getByRole("button", { name: "Show advanced settings" }));
    await screen.findByRole("option", { name: "Vulners (1 scripts)" });
    fireEvent.change(screen.getByLabelText(/NSE profile/), {
      target: { value: "4" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Start scan" }));
    await waitFor(() =>
      expect(posts(mockFetch)).toEqual([
        {
          url: expect.stringContaining("/api/nse/scan"),
          body: { network_id: 7, template_id: 4 },
        },
      ]),
    );
  });

  it("starts the network scan with an empty body", async () => {
    await pickNetwork();
    fireEvent.click(screen.getByRole("button", { name: "Start scan" }));
    await waitFor(() =>
      expect(posts(mockFetch)).toEqual([
        { url: expect.stringContaining("/api/networks/7/scan"), body: {} },
      ]),
    );
  });

  it("starts host discovery", async () => {
    await pickNetwork();
    fireEvent.click(screen.getByRole("radio", { name: /Find live hosts/ }));
    fireEvent.click(screen.getByRole("button", { name: "Find live hosts" }));
    await waitFor(() =>
      expect(posts(mockFetch)).toEqual([
        {
          url: expect.stringContaining("/api/networks/7/discover-hosts"),
          body: {},
        },
      ]),
    );
  });

  it("keeps the start button disabled until a network is chosen", () => {
    renderModal();
    expect(screen.getByRole("button", { name: "Start scan" })).toBeDisabled();
  });
});
