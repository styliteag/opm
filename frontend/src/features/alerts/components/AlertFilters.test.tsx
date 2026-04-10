import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { AlertFilters } from "./AlertFilters";

const networks = [
  { id: 1, name: "Internal LAN" },
  { id: 2, name: "Public DMZ" },
];

describe("AlertFilters", () => {
  it("renders all filter dropdowns", () => {
    render(
      <AlertFilters filters={{}} onChange={() => {}} networks={networks} />,
    );
    expect(screen.getByText("Severity:")).toBeInTheDocument();
    expect(screen.getByText("Source:")).toBeInTheDocument();
    expect(screen.getByText("Type:")).toBeInTheDocument();
    expect(screen.getByText("Network:")).toBeInTheDocument();
    expect(screen.getByText("Status:")).toBeInTheDocument();
    // All 5 dropdowns should show "All" as default value
    expect(screen.getAllByText("All")).toHaveLength(5);
  });

  it("shows selected severity label", () => {
    render(
      <AlertFilters
        filters={{ severity: "critical" }}
        onChange={() => {}}
        networks={networks}
      />,
    );
    expect(screen.getByText("Critical")).toBeInTheDocument();
  });

  it("shows selected status label", () => {
    render(
      <AlertFilters
        filters={{ dismissed: true }}
        onChange={() => {}}
        networks={networks}
      />,
    );
    expect(screen.getByText("Dismissed")).toBeInTheDocument();
  });

  it("shows active status label when dismissed is false", () => {
    render(
      <AlertFilters
        filters={{ dismissed: false }}
        onChange={() => {}}
        networks={networks}
      />,
    );
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("shows selected network label", () => {
    render(
      <AlertFilters
        filters={{ network_id: 1 }}
        onChange={() => {}}
        networks={networks}
      />,
    );
    expect(screen.getByText("Internal LAN")).toBeInTheDocument();
  });
});
