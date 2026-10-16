import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import type { Scanner } from "@/lib/types";

import { scannerConfirmCopy } from "../lib/scannerConfirmCopy";
import { ScannerActionConfirm } from "./ScannerActionConfirm";

const scanner = { id: 4, name: "dmz-1" } as Scanner;

describe("scannerConfirmCopy", () => {
  it("warns that networks are deleted with the scanner", () => {
    expect(
      scannerConfirmCopy({ action: "delete", scanner }, 2).description,
    ).toContain("Its 2 networks, their scans and alerts are deleted with it.");
    expect(
      scannerConfirmCopy({ action: "delete", scanner }, 0).description,
    ).toContain("No networks use it.");
  });

  it("explains that the old key stops working", () => {
    const copy = scannerConfirmCopy({ action: "regenerate", scanner }, 0);
    expect(copy.title).toBe("Regenerate the API key of dmz-1?");
    expect(copy.description).toMatch(/stops working immediately/);
  });
});

describe("ScannerActionConfirm", () => {
  it("does not fire the action on cancel", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ScannerActionConfirm
        target={{ action: "delete", scanner }}
        networkCount={1}
        pending={false}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalled();
  });

  it("fires the action on confirm", () => {
    const onConfirm = vi.fn();
    render(
      <ScannerActionConfirm
        target={{ action: "regenerate", scanner }}
        networkCount={0}
        pending={false}
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Regenerate key" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
