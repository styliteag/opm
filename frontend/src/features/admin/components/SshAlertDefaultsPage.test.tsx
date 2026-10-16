import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { useAuthStore } from "@/stores/auth.store";

import { SshAlertDefaultsPage } from "./SshAlertDefaultsPage";

const DEFAULTS = {
  ssh_insecure_auth: true,
  ssh_weak_cipher: true,
  ssh_weak_kex: false,
  ssh_outdated_version: true,
  ssh_config_regression: true,
  ssh_version_threshold: "8.0.0",
};

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: () => Promise.resolve(body) };
}

function renderPage() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  render(
    <QueryClientProvider client={qc}>
      <SshAlertDefaultsPage />
    </QueryClientProvider>,
  );
}

describe("SshAlertDefaultsPage", () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    useAuthStore.setState({ token: "t" });
    mockFetch = vi.fn((url: string, init?: RequestInit) => {
      if (url.includes("overriding-networks"))
        return Promise.resolve(jsonResponse({ total_count: 0, networks: [] }));
      if (init?.method === "PUT")
        return Promise.resolve(
          jsonResponse({ ...DEFAULTS, ...JSON.parse(String(init.body)) }),
        );
      return Promise.resolve(jsonResponse(DEFAULTS));
    });
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses plain labels with technical detail as secondary text", async () => {
    renderPage();
    expect(await screen.findByText("Weak key exchange")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "SSH defaults" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/^Weak Key Exchange$/)).toBeNull();
    expect(
      screen.getByText(/Key exchange \(KEX\) methods/),
    ).toBeInTheDocument();
  });

  it("saves the minimum version on blur without a Save button", async () => {
    renderPage();
    const input = await screen.findByLabelText("Minimum version");
    expect(screen.queryByRole("button", { name: /save/i })).toBeNull();
    fireEvent.change(input, { target: { value: "9.6" } });
    fireEvent.blur(input);
    await waitFor(() => {
      const put = mockFetch.mock.calls.find(
        ([, init]) => init?.method === "PUT",
      );
      expect(put).toBeDefined();
      expect(JSON.parse(String(put?.[1]?.body))).toEqual({
        ssh_version_threshold: "9.6",
      });
    });
  });

  it("does not save an invalid version", async () => {
    renderPage();
    const input = await screen.findByLabelText("Minimum version");
    fireEvent.change(input, { target: { value: "abc" } });
    fireEvent.blur(input);
    expect(await screen.findByText(/digits and dots only/)).toBeInTheDocument();
    expect(
      mockFetch.mock.calls.some(([, init]) => init?.method === "PUT"),
    ).toBe(false);
  });
});
