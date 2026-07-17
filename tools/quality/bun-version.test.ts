import { describe, expect, test } from "bun:test";
import { compareBunVersions, isBunVersionAtLeast, parseBunVersion } from "./bun-version";

describe("Bun minimum version policy", () => {
  test.each([
    ["1.3.14", false],
    ["1.3.99", false],
    ["1.4.0-canary.1", true],
    ["1.4.0", true],
    ["1.4.1", true],
    ["1.5.0", true],
    ["2.0.0", true],
    ["invalid", false],
  ])("checks %s against the 1.4.0 floor", (actual, expected) => {
    expect(isBunVersionAtLeast(actual, "1.4.0")).toBe(expected);
  });

  test("orders semantic core versions", () => {
    const lower = parseBunVersion("1.4.0");
    const higher = parseBunVersion("1.4.1+build.2");
    expect(lower).not.toBeNull();
    expect(higher).not.toBeNull();
    if (lower === null || higher === null) throw new Error("valid versions must parse");
    expect(compareBunVersions(lower, higher)).toBe(-1);
  });

  test.each(["1.4", "v1.4.0", "1.4.0.1", "", "1.4.x"])("rejects malformed version %s", (value) => {
    expect(parseBunVersion(value)).toBeNull();
  });
});
