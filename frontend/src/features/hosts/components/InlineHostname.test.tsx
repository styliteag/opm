import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { useAuthStore } from "@/stores/auth.store";

import { InlineHostname } from "./InlineHostname";

function renderHostname() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  render(
    <QueryClientProvider client={qc}>
      <InlineHostname hostId={1} hostname="db01" ip="10.0.0.1" />
    </QueryClientProvider>,
  );
}

describe("InlineHostname", () => {
  beforeEach(() => {
    useAuthStore.setState({
      token: "t",
      isAuthenticated: true,
      user: { id: 1, email: "o@example.com", role: "operator", theme_preference: "dark" },
    });
  });
  afterEach(() => {
    useAuthStore.setState({ token: null, user: null, isAuthenticated: false });
  });

  it("offers a keyboard-reachable, labelled edit button", () => {
    renderHostname();
    fireEvent.click(screen.getByRole("button", { name: "Edit hostname" }));
    expect(screen.getByRole("textbox", { name: "Hostname" })).toHaveValue("db01");
    expect(screen.getByRole("button", { name: "Save hostname" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });
});
