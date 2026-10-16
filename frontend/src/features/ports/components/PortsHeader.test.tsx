import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { PropsWithChildren } from "react";

import { useAuthStore, type UserRole } from "@/stores/auth.store";

import { PortsHeader } from "./PortsHeader";

const download = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("@/lib/download", () => ({ downloadAuthenticated: download }));

// Flatten the base-ui menu so items render without a pointer-driven popup.
vi.mock("@/components/ui/dropdown-menu", () => {
  const Pass = ({ children }: PropsWithChildren) => <div>{children}</div>;
  return {
    DropdownMenu: Pass,
    DropdownMenuContent: Pass,
    DropdownMenuGroup: Pass,
    DropdownMenuLabel: Pass,
    DropdownMenuSeparator: () => <hr />,
    DropdownMenuTrigger: ({
      children,
      ...props
    }: PropsWithChildren<{ "aria-label"?: string }>) => (
      <button aria-label={props["aria-label"]}>{children}</button>
    ),
    DropdownMenuItem: ({
      children,
      onClick,
    }: PropsWithChildren<{ onClick?: () => void }>) => (
      <button role="menuitem" onClick={onClick}>
        {children}
      </button>
    ),
  };
});

function signIn(role: UserRole) {
  useAuthStore.setState({
    token: "t",
    isAuthenticated: true,
    user: { id: 1, email: "u@example.com", role, theme_preference: "dark" },
  });
}

describe("PortsHeader", () => {
  beforeEach(() => {
    download.mockClear();
    signIn("analyst");
  });
  afterEach(() => {
    useAuthStore.setState({ token: null, user: null, isAuthenticated: false });
  });

  it("has a labelled options menu", () => {
    render(<PortsHeader />);
    expect(screen.getByRole("button", { name: "Ports options" })).toBeInTheDocument();
  });

  it.each([
    ["Export hosts (CSV)", "/api/hosts/export/csv", "hosts.csv"],
    ["Export hosts (PDF)", "/api/hosts/export/pdf", "hosts.pdf"],
    ["Export SSH report (PDF)", "/api/ssh/export/pdf", "ssh-report.pdf"],
    ["Export SSH report (CSV)", "/api/ssh/export/csv", "ssh-report.csv"],
  ])("%s downloads %s", (label, path, filename) => {
    render(<PortsHeader />);
    fireEvent.click(screen.getByRole("menuitem", { name: label }));
    expect(download).toHaveBeenCalledWith(path, filename);
  });

  it("hides the host exports from viewers (analyst+ on the backend)", () => {
    signIn("viewer");
    render(<PortsHeader />);
    expect(screen.queryByRole("menuitem", { name: /Export hosts/ })).not.toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Export SSH report (PDF)" })).toBeInTheDocument();
  });
});
