import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { useUiStore } from "@/stores/ui.store";
import { useAuthStore } from "@/stores/auth.store";

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
  useRouterState: () => ({
    location: { pathname: "/" },
  }),
}));

// Import after mocks
import { Sidebar } from "./Sidebar";

describe("Sidebar", () => {
  beforeEach(() => {
    useUiStore.setState({ sidebarCollapsed: false, quickScanModalOpen: false });
    useAuthStore.setState({
      user: {
        id: 1,
        email: "admin@test.com",
        role: "admin",
        theme_preference: "dark",
      },
      token: "token",
      isAuthenticated: true,
    });
  });

  it("renders the app name", () => {
    render(<Sidebar />);
    expect(screen.getByText("Onyx Port Monitor")).toBeInTheDocument();
  });

  it("renders main navigation items", () => {
    render(<Sidebar />);
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Hosts")).toBeInTheDocument();
    expect(screen.getByText("Scans")).toBeInTheDocument();
    expect(screen.getByText("Alerts")).toBeInTheDocument();
    expect(screen.getByText("Networks")).toBeInTheDocument();
  });

  it("renders admin-only items for admin users", () => {
    render(<Sidebar />);
    expect(screen.getByText("Users")).toBeInTheDocument();
    expect(screen.getByText("Roles")).toBeInTheDocument();
    expect(screen.getByText("Organization")).toBeInTheDocument();
  });

  it("hides admin items for non-admin users", () => {
    useAuthStore.setState({
      user: {
        id: 2,
        email: "viewer@test.com",
        role: "viewer",
        theme_preference: "dark",
      },
      token: "token",
      isAuthenticated: true,
    });
    render(<Sidebar />);
    expect(screen.queryByText("Users")).not.toBeInTheDocument();
    expect(screen.queryByText("Roles")).not.toBeInTheDocument();
    expect(screen.queryByText("Organization")).not.toBeInTheDocument();
  });

  it("renders Scan Now button", () => {
    render(<Sidebar />);
    expect(screen.getByText("Scan Now")).toBeInTheDocument();
  });

  it("opens quick scan modal when Scan Now is clicked", () => {
    render(<Sidebar />);
    fireEvent.click(screen.getByText("Scan Now"));
    expect(useUiStore.getState().quickScanModalOpen).toBe(true);
  });

  it("hides labels when collapsed", () => {
    useUiStore.setState({ sidebarCollapsed: true, quickScanModalOpen: false });
    render(<Sidebar />);
    expect(screen.queryByText("Onyx Port Monitor")).not.toBeInTheDocument();
    expect(screen.queryByText("Dashboard")).not.toBeInTheDocument();
  });

  it("shows NSE Scripts nav item", () => {
    render(<Sidebar />);
    expect(screen.getByText("NSE Scripts")).toBeInTheDocument();
  });
});
