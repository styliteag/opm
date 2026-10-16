import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { HubTabs } from "./HubTabs";

const TABS = [
  { key: "a", label: "Alpha" },
  { key: "b", label: "Beta" },
] as const;

describe("HubTabs", () => {
  it("marks the active tab as selected", () => {
    render(<HubTabs tabs={TABS} active="b" onChange={() => {}} />);
    expect(screen.getByRole("tab", { name: "Beta" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "Alpha" })).toHaveAttribute(
      "aria-selected",
      "false",
    );
  });

  it("reports the clicked tab key", () => {
    const onChange = vi.fn();
    render(<HubTabs tabs={TABS} active="a" onChange={onChange} />);
    fireEvent.click(screen.getByRole("tab", { name: "Beta" }));
    expect(onChange).toHaveBeenCalledWith("b");
  });
});
