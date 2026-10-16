import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { useUiStore } from "@/stores/ui.store";
import type { UserRole } from "@/stores/auth.store";
import { useAuthStore } from "@/stores/auth.store";

let mockPathname = "/";

// Mock TanStack Router
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    ...props
  }: {
    children: React.ReactNode;
    to: string;
    className?: string;
    title?: string;
  }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useRouterState: (opts?: {
    select?: (s: { location: { pathname: string } }) => unknown;
  }) => {
    const state = { location: { pathname: mockPathname } };
    return opts?.select ? opts.select(state) : state;
  },
}));

// Import after mocks
import { Sidebar } from "./Sidebar";

function setRole(role: UserRole) {
  useAuthStore.setState({
    user: {
      id: 1,
      email: `${role}@test.com`,
      role,
      theme_preference: "dark",
    },
    token: "token",
    isAuthenticated: true,
  });
}

function activeLabel(): string | null {
  const active = document.querySelector('a[aria-current="page"]');
  return active?.textContent ?? null;
}

describe("Sidebar", () => {
  beforeEach(() => {
    mockPathname = "/";
    useUiStore.setState({ sidebarCollapsed: false, quickScanModalOpen: false });
    setRole("admin");
  });

  it("renders the app name", () => {
    render(<Sidebar />);
    expect(screen.getByText("STYLiTE Orbit Monitor")).toBeInTheDocument();
  });

  it("renders the four v4 areas plus Scans nested under Networks", () => {
    render(<Sidebar />);
    const links = screen.getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual([
      "Home",
      "Ports",
      "Networks",
      "Scans",
      "Settings",
    ]);
    expect(links.map((l) => l.getAttribute("href"))).toEqual([
      "/",
      "/ports",
      "/networks",
      "/scans",
      "/settings",
    ]);
    expect(screen.getByRole("link", { name: "Scans" })).toHaveAttribute(
      "data-nav-level",
      "sub",
    );
  });

  it("shows Settings to every role (sub-nav filters by role)", () => {
    setRole("viewer");
    render(<Sidebar />);
    expect(screen.getByText("Settings")).toBeInTheDocument();
  });

  it("renders no group labels", () => {
    render(<Sidebar />);
    expect(screen.queryByText("Monitor")).not.toBeInTheDocument();
    expect(screen.queryByText("Configuration")).not.toBeInTheDocument();
    expect(screen.queryByText("Administration")).not.toBeInTheDocument();
  });

  it.each([
    ["/", "Home"],
    ["/ports", "Ports"],
    ["/hosts/12", "Ports"],
    ["/networks", "Networks"],
    ["/networks/4", "Networks"],
    ["/scans", "Scans"],
    ["/scans/99", "Scans"],
    ["/settings/scanners/2", "Settings"],
    ["/settings/security", "Settings"],
  ])("highlights the right entry for %s", (path, label) => {
    mockPathname = path;
    render(<Sidebar />);
    expect(activeLabel()).toBe(label);
  });

  it("highlights nothing for unrelated pages", () => {
    mockPathname = "/alerts";
    render(<Sidebar />);
    expect(activeLabel()).toBeNull();
  });

  it("renders Scan Now button", () => {
    render(<Sidebar />);
    expect(screen.getByText("Scan Now")).toBeInTheDocument();
  });

  it.each(["viewer", "analyst"] as const)(
    "hides Scan Now for %s (backend requires operator)",
    (role) => {
      setRole(role);
      render(<Sidebar />);
      expect(screen.queryByText("Scan Now")).not.toBeInTheDocument();
    },
  );

  it("opens quick scan modal when Scan Now is clicked", () => {
    render(<Sidebar />);
    fireEvent.click(screen.getByText("Scan Now"));
    expect(useUiStore.getState().quickScanModalOpen).toBe(true);
  });

  it("hides labels when collapsed", () => {
    useUiStore.setState({ sidebarCollapsed: true, quickScanModalOpen: false });
    render(<Sidebar />);
    expect(screen.queryByText("STYLiTE Orbit Monitor")).not.toBeInTheDocument();
    expect(screen.queryByText("Ports")).not.toBeInTheDocument();
    expect(screen.getByTitle("Ports")).toBeInTheDocument();
  });

  it("does not render retired v3 nav items", () => {
    render(<Sidebar />);
    for (const label of [
      "Overview",
      "Dashboard",
      "Alerts",
      "Hosts",
      "Scanners",
      "Scan Templates",
      "Alerting",
      "Users & Roles",
    ]) {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    }
  });
});
