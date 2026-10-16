import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { ConfirmDialog } from "./ConfirmDialog";

function renderDialog(over: Partial<Parameters<typeof ConfirmDialog>[0]> = {}) {
  const props = {
    open: true,
    onOpenChange: vi.fn(),
    title: "Delete scanner?",
    description: "Its networks stop scanning.",
    confirmLabel: "Delete scanner",
    onConfirm: vi.fn(),
    ...over,
  };
  render(<ConfirmDialog {...props} />);
  return props;
}

describe("ConfirmDialog", () => {
  it("shows title and description", () => {
    renderDialog();
    expect(screen.getByText("Delete scanner?")).toBeInTheDocument();
    expect(screen.getByText("Its networks stop scanning.")).toBeInTheDocument();
  });

  it("calls onConfirm only from the confirm button", () => {
    const props = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(props.onConfirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Delete scanner" }));
    expect(props.onConfirm).toHaveBeenCalledTimes(1);
  });

  it("disables both buttons while pending", () => {
    renderDialog({ pending: true });
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Delete scanner" })).toBeDisabled();
  });

  it("renders nothing when closed", () => {
    renderDialog({ open: false });
    expect(screen.queryByText("Delete scanner?")).not.toBeInTheDocument();
  });
});
