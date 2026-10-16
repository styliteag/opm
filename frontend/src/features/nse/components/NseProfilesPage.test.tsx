import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { NseProfilesPage } from "@/features/nse/components/NseProfilesPage";
import { useAuthStore, type UserRole } from "@/stores/auth.store";

const profiles = [
  {
    id: 7,
    name: "My web checks",
    description: null,
    severity: null,
    nse_scripts: ["http-title"],
    platform: "any",
    category: "web",
    type: "custom",
  },
];

function renderPage(role: UserRole) {
  useAuthStore.setState({
    token: "t",
    isAuthenticated: true,
    user: { id: 1, email: "u@example.com", role, theme_preference: "dark" },
  });
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <NseProfilesPage />
    </QueryClientProvider>,
  );
}

describe("NseProfilesPage", () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn((_url: string, init?: RequestInit) =>
      Promise.resolve(
        init?.method === "DELETE"
          ? { ok: true, status: 204, json: () => Promise.resolve(undefined) }
          : {
              ok: true,
              status: 200,
              json: () => Promise.resolve({ profiles }),
            },
      ),
    );
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    useAuthStore.setState({ token: null, user: null, isAuthenticated: false });
  });

  const deletes = () =>
    mockFetch.mock.calls.filter(
      ([, init]) => (init as RequestInit | undefined)?.method === "DELETE",
    );

  it("asks before deleting a profile", async () => {
    renderPage("operator");
    fireEvent.click(await screen.findByRole("button", { name: /delete/i }));

    expect(await screen.findByText("Delete profile?")).toBeInTheDocument();
    expect(deletes()).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(deletes()).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: /delete/i }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Delete profile" }),
    );
    await waitFor(() => expect(deletes()).toHaveLength(1));
    expect(String(deletes()[0][0])).toContain("/api/nse/profiles/7");
  });

  it("hides create, edit, duplicate and delete for viewers", async () => {
    renderPage("viewer");
    expect(await screen.findByText("My web checks")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /create profile/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /delete/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /duplicate/i })).toBeNull();
  });
});
