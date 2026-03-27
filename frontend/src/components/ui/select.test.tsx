import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { Select, SelectOption } from "./select";

describe("Select", () => {
  it("renders with default styling", () => {
    render(
      <Select data-testid="sel">
        <option value="a">A</option>
      </Select>,
    );
    const el = screen.getByTestId("sel");
    expect(el.tagName).toBe("SELECT");
    expect(el).toHaveAttribute("data-slot", "select");
  });

  it("accepts custom className", () => {
    render(
      <Select data-testid="sel" className="w-48">
        <option value="a">A</option>
      </Select>,
    );
    expect(screen.getByTestId("sel")).toHaveClass("w-48");
  });

  it("forwards disabled prop", () => {
    render(
      <Select data-testid="sel" disabled>
        <option value="a">A</option>
      </Select>,
    );
    expect(screen.getByTestId("sel")).toBeDisabled();
  });

  it("forwards aria-label", () => {
    render(
      <Select aria-label="Choose option">
        <option value="a">A</option>
      </Select>,
    );
    expect(screen.getByLabelText("Choose option")).toBeInTheDocument();
  });

  it("renders SelectOption with correct value", () => {
    render(
      <Select data-testid="sel">
        <SelectOption value="beta">Beta</SelectOption>
      </Select>,
    );
    const option = screen.getByText("Beta");
    expect(option.tagName).toBe("OPTION");
    expect(option).toHaveAttribute("value", "beta");
  });
});
