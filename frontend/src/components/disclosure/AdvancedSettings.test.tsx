import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { AdvancedSettings } from "./AdvancedSettings";

describe("AdvancedSettings", () => {
  it("starts closed and hides its children", () => {
    render(
      <AdvancedSettings>
        <p>Rate limit</p>
      </AdvancedSettings>,
    );
    const toggle = screen.getByRole("button", {
      name: "Show advanced settings",
    });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Rate limit")).not.toBeInTheDocument();
  });

  it("toggles open and closed", () => {
    render(
      <AdvancedSettings>
        <p>Rate limit</p>
      </AdvancedSettings>,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Show advanced settings" }),
    );
    const hide = screen.getByRole("button", { name: "Hide advanced settings" });
    expect(hide).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Rate limit")).toBeInTheDocument();

    fireEvent.click(hide);
    expect(screen.queryByText("Rate limit")).not.toBeInTheDocument();
  });

  it("honours defaultOpen", () => {
    render(
      <AdvancedSettings defaultOpen>
        <p>Rate limit</p>
      </AdvancedSettings>,
    );
    expect(screen.getByText("Rate limit")).toBeInTheDocument();
  });

  it("shows the summary only while closed", () => {
    render(
      <AdvancedSettings summary="Rate 1000 pps · timeout 60 min">
        <p>Rate limit</p>
      </AdvancedSettings>,
    );
    expect(
      screen.getByText("Rate 1000 pps · timeout 60 min"),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Show advanced settings" }),
    );
    expect(
      screen.queryByText("Rate 1000 pps · timeout 60 min"),
    ).not.toBeInTheDocument();
  });

  it("supports controlled open state", () => {
    const changes: boolean[] = [];
    const { rerender } = render(
      <AdvancedSettings open={false} onOpenChange={(o) => changes.push(o)}>
        <p>Rate limit</p>
      </AdvancedSettings>,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Show advanced settings" }),
    );
    expect(changes).toEqual([true]);
    // Parent has not flipped the prop yet: still closed.
    expect(screen.queryByText("Rate limit")).not.toBeInTheDocument();
    rerender(
      <AdvancedSettings open onOpenChange={(o) => changes.push(o)}>
        <p>Rate limit</p>
      </AdvancedSettings>,
    );
    expect(screen.getByText("Rate limit")).toBeInTheDocument();
  });
});
