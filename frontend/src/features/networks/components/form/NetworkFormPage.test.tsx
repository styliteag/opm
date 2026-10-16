import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import type { Network } from "@/lib/types";
import { useAuthStore } from "@/stores/auth.store";

const navigate = vi.fn();
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...props }: { children: React.ReactNode }) => (
    <a {...props}>{children}</a>
  ),
  useNavigate: () => navigate,
}));

import { NetworkFormPage } from "./NetworkFormPage";

const SCANNERS = {
  scanners: [{ id: 3, name: "dmz-1", last_seen_at: null }],
};

function respond(body: unknown) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  });
}

function renderForm(props: Parameters<typeof NetworkFormPage>[0]) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  render(
    <QueryClientProvider client={qc}>
      <NetworkFormPage {...props} />
    </QueryClientProvider>,
  );
}

function sentBody(mockFetch: ReturnType<typeof vi.fn>, method: string) {
  const call = mockFetch.mock.calls.find(
    ([, init]) => (init as RequestInit | undefined)?.method === method,
  );
  return call
    ? { url: String(call[0]), body: JSON.parse(String((call[1] as RequestInit).body)) }
    : undefined;
}

const EXISTING = {
  id: 5,
  name: "Office",
  cidr: "10.0.0.0/24",
  port_spec: "22,80,!8080",
  scanner_id: 3,
  scanner_type: "masscan",
  scan_protocol: "tcp",
  scan_rate: 1000,
  scan_timeout: 3600,
  port_timeout: 1500,
  scan_schedule: '{"type":"monthly_date","day":1,"hour":2,"minute":0}',
  scan_schedule_enabled: true,
  host_discovery_enabled: true,
  phases: null,
  nse_profile_id: null,
  alert_config: null,
  ssh_probe_enabled: true,
  nuclei_enabled: false,
  gvm_keep_reports: true,
} as unknown as Network;

describe("NetworkFormPage", () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    navigate.mockReset();
    useAuthStore.setState({ token: "t" });
    mockFetch = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === "POST" || init?.method === "PUT") return respond({ id: 9 });
      if (String(url).endsWith("/api/scanners")) return respond(SCANNERS);
      if (String(url).includes("/nse/profiles")) return respond({ profiles: [] });
      return respond({});
    });
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the essentials and keeps engine knobs behind advanced", () => {
    renderForm({ mode: "create" });
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(screen.getByLabelText("Address range")).toBeInTheDocument();
    expect(screen.getByLabelText("Scanner")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Ports" })).toBeInTheDocument();
    expect(screen.getByLabelText("Schedule")).toHaveValue("manual");
    expect(screen.getByLabelText("Check for vulnerabilities")).not.toBeChecked();
    expect(screen.queryByLabelText("Rate (packets/s)")).not.toBeInTheDocument();
    expect(
      screen.getByText("masscan · TCP · 1,000 pps · 60 min timeout · SSH check on"),
    ).toBeInTheDocument();
  });

  it("creates with All ports and a manual schedule", async () => {
    renderForm({ mode: "create" });
    await screen.findByRole("option", { name: /dmz-1/ });
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Lab" } });
    fireEvent.change(screen.getByLabelText("Address range"), {
      target: { value: "10.1.0.0/24" },
    });
    fireEvent.change(screen.getByLabelText("Scanner"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Create network" }));

    await waitFor(() => expect(sentBody(mockFetch, "POST")).toBeDefined());
    const { url, body } = sentBody(mockFetch, "POST")!;
    expect(url).toMatch(/\/api\/networks$/);
    expect(body).toMatchObject({
      name: "Lab",
      cidr: "10.1.0.0/24",
      scanner_id: 3,
      port_spec: "1-65535",
      scan_schedule: null,
      nuclei_enabled: false,
    });
    expect(body).not.toHaveProperty("port_preset");
    expect(navigate).toHaveBeenCalledWith({
      to: "/networks/$networkId",
      params: { networkId: "9" },
    });
  });

  it("shows the weekly day and time pickers", () => {
    renderForm({ mode: "create" });
    fireEvent.change(screen.getByLabelText("Schedule"), {
      target: { value: "weekly" },
    });
    expect(screen.getByLabelText("Day of week")).toBeInTheDocument();
    expect(screen.getByLabelText("Time of day")).toHaveValue("02:00");
  });

  it("opens advanced for a custom schedule and keeps it on save", async () => {
    renderForm({ mode: "edit", network: EXISTING });
    expect(screen.getByLabelText("Schedule")).toHaveValue("custom");
    expect(screen.getByText("Custom schedule", { selector: "label" })).toBeInTheDocument();
    expect(screen.getByLabelText("Custom ports")).toHaveValue("22,80");
    expect(screen.getByLabelText("Exclude ports")).toHaveValue("8080");

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(sentBody(mockFetch, "PUT")).toBeDefined());
    const { url, body } = sentBody(mockFetch, "PUT")!;
    expect(url).toMatch(/\/api\/networks\/5$/);
    expect(body.port_spec).toBe("22,80,!8080");
    expect(body.scan_schedule).toBe(EXISTING.scan_schedule);
  });

  it("selects the network's scanner once scanners have loaded", async () => {
    renderForm({ mode: "edit", network: EXISTING });
    await screen.findByRole("option", { name: /dmz-1/ });
    expect(screen.getByLabelText("Scanner")).toHaveValue("3");
  });

  it("clears the schedule when switched to Manual only", async () => {
    renderForm({ mode: "edit", network: EXISTING });
    fireEvent.change(screen.getByLabelText("Schedule"), {
      target: { value: "manual" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(sentBody(mockFetch, "PUT")).toBeDefined());
    expect(sentBody(mockFetch, "PUT")!.body).toHaveProperty("scan_schedule", null);
  });

  it("opens advanced settings when an advanced field is invalid", async () => {
    renderForm({ mode: "edit", network: { ...EXISTING, scan_schedule: null } });
    fireEvent.click(screen.getByRole("button", { name: "Show advanced settings" }));
    fireEvent.change(screen.getByLabelText("Exclude ports"), {
      target: { value: "abc" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Hide advanced settings" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(
      await screen.findByText("Use ports or ranges, e.g. 22,3389 or 8000-8100"),
    ).toBeInTheDocument();
    expect(sentBody(mockFetch, "PUT")).toBeUndefined();
  });
});
