import { describe, expect, it } from "vitest";

import {
  ALL_PORTS,
  COMMON_PORTS,
  buildPortSpec,
  isValidPortList,
  parsePortSpec,
} from "./portPresets";

describe("parsePortSpec", () => {
  it("detects the All preset", () => {
    expect(parsePortSpec("1-65535")).toEqual({
      preset: "all",
      include: ALL_PORTS,
      exclude: "",
    });
  });

  it("detects the Common preset regardless of spacing", () => {
    const spaced = COMMON_PORTS.split(",").join(", ");
    expect(parsePortSpec(spaced).preset).toBe("common");
  });

  it("falls back to Custom and keeps the include list", () => {
    expect(parsePortSpec("22,80-443")).toEqual({
      preset: "custom",
      include: "22,80-443",
      exclude: "",
    });
  });

  it("splits ! exclusions into the exclude list", () => {
    expect(parsePortSpec("1-65535,!22,!3389")).toEqual({
      preset: "all",
      include: ALL_PORTS,
      exclude: "22,3389",
    });
  });

  it("treats an exclusion-only spec as all ports (scanner default)", () => {
    expect(parsePortSpec("!88").preset).toBe("all");
  });
});

describe("buildPortSpec", () => {
  it("returns the preset spec", () => {
    expect(buildPortSpec("all", "", "")).toBe("1-65535");
    expect(buildPortSpec("common", "", "")).toBe(COMMON_PORTS);
  });

  it("uses the custom list normalised", () => {
    expect(buildPortSpec("custom", " 22, 80 ,,443 ", "")).toBe("22,80,443");
  });

  it("appends exclusions with a ! prefix once", () => {
    expect(buildPortSpec("all", "", "22, !3389,8000-8100")).toBe(
      "1-65535,!22,!3389,!8000-8100",
    );
  });

  it("round-trips through parsePortSpec", () => {
    const spec = buildPortSpec("custom", "80,443", "8443");
    const parsed = parsePortSpec(spec);
    expect(buildPortSpec(parsed.preset, parsed.include, parsed.exclude)).toBe(
      spec,
    );
  });
});

describe("isValidPortList", () => {
  it.each([
    ["", true],
    ["22", true],
    ["22,80-443", true],
    ["!22", true],
    ["0", false],
    ["70000", false],
    ["443-80", false],
    ["abc", false],
  ])("%s → %s", (value, ok) => {
    expect(isValidPortList(value)).toBe(ok);
  });
});
