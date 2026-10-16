import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import type {
  EnrichedHostPort,
  HostAlertSummary,
  Vulnerability,
} from "@/lib/types";

import {
  findingsByPort,
  hostPortRows,
  mergeHostFindings,
} from "../lib/hostFindings";
import { HostPortTable } from "./HostPortTable";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

function port(over: Partial<EnrichedHostPort>): EnrichedHostPort {
  return {
    id: 1,
    ip: "10.0.0.1",
    port: 22,
    protocol: "tcp",
    banner: "SSH-2.0-OpenSSH_7.4",
    service_guess: "ssh",
    user_comment: null,
    first_seen_at: "2026-10-01T00:00:00Z",
    last_seen_at: "2026-10-02T00:00:00Z",
    is_stale: false,
    alert_id: null,
    alert_status: null,
    alert_severity: null,
    dismiss_reason: null,
    rule_status: null,
    matching_rules: [],
    ssh_summary: null,
    ...over,
  };
}

function vuln(i: number, over: Partial<Vulnerability> = {}): Vulnerability {
  return {
    id: i,
    scan_id: 1,
    ip: "10.0.0.1",
    port: 443,
    protocol: "tcp",
    oid: `tpl-${i}:m`,
    name: `Tech detect ${i}`,
    description: `Detected tech ${i}`,
    severity: 0,
    severity_label: "info",
    cvss_base_vector: null,
    cve_ids: [],
    solution: null,
    solution_type: null,
    qod: null,
    source: "nuclei",
    created_at: "2026-10-01T00:00:00Z",
    ...over,
  };
}

const sshAlert: HostAlertSummary = {
  id: 77,
  type: "ssh_insecure_auth",
  port: 22,
  message: "SSH password authentication enabled on 10.0.0.1:22",
  severity: "high",
  dismissed: false,
  created_at: "2026-10-02T00:00:00Z",
  dismiss_reason: null,
  network_id: 1,
  network_name: "LAN",
  ssh_summary: null,
  related_ssh_alert_count: 1,
  related_ssh_alerts_dismissed: false,
};

function renderTable() {
  const ports = [
    port({
      id: 1,
      port: 443,
      service_guess: "https",
      user_comment: "Web",
      rule_status: "accepted",
    }),
    port({
      id: 2,
      port: 22,
      ssh_summary: {
        ssh_version: "OpenSSH_7.4",
        publickey_enabled: true,
        password_enabled: true,
        keyboard_interactive_enabled: false,
        has_weak_ciphers: false,
        has_weak_kex: false,
        last_scanned: "2026-10-02T00:00:00Z",
        recent_scans: [],
        total_scans: 0,
        completed_scans: 0,
        failed_scans: 0,
        avg_scan_duration_seconds: null,
        scans_last_24h: 0,
        scans_last_7d: 0,
      },
    }),
  ];
  const findings = mergeHostFindings({
    vulns: [
      vuln(1),
      vuln(2),
      vuln(3, {
        severity_label: "high",
        name: "Exposed admin panel",
        cve_ids: ["CVE-1", "CVE-2", "CVE-3", "CVE-4"],
      }),
    ],
    nseResults: [],
    alerts: [sshAlert],
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <HostPortTable
        rows={hostPortRows(ports, [sshAlert], [])}
        findingsByPort={findingsByPort(findings)}
      />
    </QueryClientProvider>,
  );
}

describe("HostPortTable", () => {
  it("sorts decision-needed ports first and summarises findings", () => {
    renderTable();
    const rows = screen.getAllByTestId("host-port-row");
    expect(within(rows[0]).getByText("22")).toBeInTheDocument();
    expect(within(rows[0]).getByText("To review")).toBeInTheDocument();
    expect(within(rows[0]).getByText("1 important")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Expected")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Web")).toBeInTheDocument();
    expect(within(rows[1]).getByText("1 important")).toBeInTheDocument();
  });

  it("expands a port: important findings, collapsed info, SSH bullets, banner", () => {
    renderTable();
    fireEvent.click(screen.getByRole("button", { name: "Expand port 443" }));
    expect(screen.getByText("Exposed admin panel")).toBeInTheDocument();
    expect(screen.getByText("CVE-1, CVE-2, CVE-3")).toBeInTheDocument();
    expect(screen.queryByText("Tech detect 1")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: /Show 2 informational findings/ }),
    );
    expect(screen.getByText("Tech detect 1")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Expand port 22" }));
    expect(screen.getByText("Password login allowed")).toBeInTheDocument();
    expect(screen.getByText("Password login is allowed")).toBeInTheDocument();
    expect(screen.getAllByText("SSH-2.0-OpenSSH_7.4")).toHaveLength(2);
    // Open SSH alert -> finding-level actions
    expect(
      screen.getByRole("button", { name: /Accept risk/ }),
    ).toBeInTheDocument();
  });

  it("hides finding IDs until a finding is expanded", () => {
    renderTable();
    fireEvent.click(screen.getByRole("button", { name: "Expand port 443" }));
    expect(screen.queryByText("tpl-3:m")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: /Exposed admin panel/ }),
    );
    expect(screen.getByText("tpl-3:m")).toBeInTheDocument();
  });
});
