import { describe, expect, test } from "bun:test";

import {
  containsSensitivePublicMarker,
  decodeSensitiveMarkers,
  publicSourceScannerSelfTestFailures,
  publicSourceScannerSelfTests,
} from "./public-source-scanner";

describe("specialized-vector public-source scanner", () => {
  for (const [label, value, expectedSensitive] of publicSourceScannerSelfTests) {
    test(label, () => {
      expect(containsSensitivePublicMarker(value)).toBe(expectedSensitive);
    });
  }

  test("keeps the executable gate self-tests coherent", () => {
    expect(publicSourceScannerSelfTestFailures()).toEqual([]);
  });

  test("uses exact case-sensitive HTML5 names", () => {
    expect(decodeSensitiveMarkers("&commat;|&CommaT;|&alpha;|&QUOT;")).toBe('@|&CommaT;|α|"');
  });

  test("stays bounded on maximum adversarial strings", () => {
    const maximum = 65_536;
    const cases = [
      "a".repeat(maximum),
      "@".repeat(maximum),
      `a@${"a.".repeat(32_760)}1`,
      `${"a".repeat(65_520)}"@example.org`,
      `${"&amp;".repeat(13_000)}text`,
    ];
    const started = Bun.nanoseconds();
    for (const value of cases) expect(containsSensitivePublicMarker(value)).toBe(false);
    expect((Bun.nanoseconds() - started) / 1e6).toBeLessThan(2_000);
  });
});
