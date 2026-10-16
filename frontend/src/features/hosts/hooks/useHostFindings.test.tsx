import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { useAuthStore } from "@/stores/auth.store";

import { useHostFindings } from "./useHostFindings";

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

const VULN = {
  id: 1,
  scan_id: 1,
  ip: "10.0.0.1",
  port: 443,
  protocol: "tcp",
  oid: "1.2.3",
  name: "Old TLS",
  description: "",
  severity: 7.5,
  severity_label: "high",
  cvss_base_vector: null,
  cve_ids: [],
  solution: null,
  solution_type: null,
  qod: null,
  source: "gvm",
  created_at: "2026-10-01T00:00:00",
};

const NSE = {
  id: 2,
  scan_id: 1,
  ip: "10.0.0.1",
  port: 22,
  protocol: "tcp",
  script_name: "ssh2-enum-algos",
  script_output: "weak",
  cve_ids: [],
  severity: "medium",
  template_id: null,
  created_at: "2026-10-01T00:00:00",
};

describe("useHostFindings", () => {
  beforeEach(() => useAuthStore.setState({ token: "t" }));
  afterEach(() => vi.unstubAllGlobals());

  it("fetches vulnerabilities + NSE results and merges them", async () => {
    const mockFetch = vi.fn((url: string) =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve(
            url.startsWith("/api/nse")
              ? { results: [NSE], total: 1 }
              : { results: [VULN], total: 1 },
          ),
      }),
    );
    vi.stubGlobal("fetch", mockFetch);

    const { result } = renderHook(() => useHostFindings(5, "10.0.0.1", []), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.findings).toHaveLength(2));
    const urls = mockFetch.mock.calls.map((c) => c[0]).sort();
    expect(urls).toEqual([
      "/api/hosts/5/vulnerabilities",
      "/api/nse/results?ip=10.0.0.1",
    ]);
    expect(result.current.findings.map((f) => f.title)).toEqual([
      "Old TLS",
      "ssh2-enum-algos",
    ]);
  });
});
