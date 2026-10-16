import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { InlineTextCell } from "./inline-text-cell";

describe("InlineTextCell", () => {
  it("names the cell after the field, not its (placeholder) text", () => {
    render(<InlineTextCell value={null} placeholder="-" editLabel="Edit hostname" onSave={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Edit hostname" })).toBeInTheDocument();
  });

  it("labels the icon-only save and cancel buttons while editing", () => {
    const onSave = vi.fn();
    render(
      <InlineTextCell
        value="db01"
        editLabel="Edit hostname"
        saveLabel="Save hostname"
        onSave={onSave}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit hostname" }));
    expect(screen.getByRole("textbox", { name: "Edit hostname" })).toHaveValue("db01");
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole("button", { name: "Save hostname" }));
    expect(onSave).toHaveBeenCalledWith("db01");
  });
});
