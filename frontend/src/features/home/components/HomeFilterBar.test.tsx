import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

import { HomeFilterBar } from "./HomeFilterBar";

const NETWORKS = [
  { id: 1, name: "LAN" },
  { id: 2, name: "DMZ" },
];

describe("HomeFilterBar", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("debounces the search before reporting it", () => {
    const onChange = vi.fn();
    render(<HomeFilterBar value={{}} networks={NETWORKS} onChange={onChange} />);
    fireEvent.change(screen.getByRole("searchbox", { name: "Search the queue" }), {
      target: { value: " db01 " },
    });
    expect(onChange).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(300));
    expect(onChange).toHaveBeenCalledWith({ search: "db01" });
  });

  it("reports the network immediately and keeps the search", () => {
    const onChange = vi.fn();
    render(
      <HomeFilterBar value={{ search: "db" }} networks={NETWORKS} onChange={onChange} />,
    );
    fireEvent.change(screen.getByRole("combobox", { name: "Network" }), {
      target: { value: "2" },
    });
    expect(onChange).toHaveBeenCalledWith({ search: "db", network_id: 2 });
  });

  it("Clear resets both filters and is hidden when nothing is filtered", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <HomeFilterBar value={{}} networks={NETWORKS} onChange={onChange} />,
    );
    expect(screen.queryByRole("button", { name: "Clear filters" })).not.toBeInTheDocument();
    rerender(
      <HomeFilterBar
        value={{ search: "db", network_id: 1 }}
        networks={NETWORKS}
        onChange={onChange}
      />,
    );
    expect(screen.getByRole("searchbox")).toHaveValue("db");
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(onChange).toHaveBeenCalledWith({});
    rerender(<HomeFilterBar value={{}} networks={NETWORKS} onChange={onChange} />);
    expect(screen.getByRole("searchbox")).toHaveValue("");
  });

  it("follows an external search change (e.g. browser back)", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <HomeFilterBar value={{ search: "a" }} networks={NETWORKS} onChange={onChange} />,
    );
    rerender(
      <HomeFilterBar value={{ search: "b" }} networks={NETWORKS} onChange={onChange} />,
    );
    expect(screen.getByRole("searchbox")).toHaveValue("b");
    act(() => vi.advanceTimersByTime(300));
    expect(onChange).not.toHaveBeenCalled();
  });
});
