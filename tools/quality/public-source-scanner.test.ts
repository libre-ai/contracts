import { describe, expect, test } from "bun:test";

import {
  containsCredentialMarker,
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

  describe("credential marker — provisioned connection URIs", () => {
    // A provisioned connection string matches no vendor token shape, so the
    // credential path used to let `postgresql://user:pw@host/db` through every
    // per-PR gate while catching a GitHub token on the same line.
    const cases: ReadonlyArray<readonly [label: string, value: string, expected: boolean]> = [
      ["postgres URI with password", "postgresql://u:pw@db.internal.acme.fr:5432/mydb", true],
      ["redis URI with password", "redis://default:pw@cache-prod.acme.fr:6379", true],
      [
        "addon-host URI with password",
        "postgresql://u:pw@bXXX-postgresql.example-cloud.fr/db",
        true,
      ],
      ["vendor token still caught", "ghp_0000000000000000000000000000000000", true],
      // Empty-username userinfo is the canonical Redis form; percent-encoded
      // userinfo is the canonical Azure form. Both are credentials by position
      // (K4 review of f49fc18, findings 1-2: the positional regex missed both).
      ["empty-username redis URI", "redis://:tYm9x2QpLw7fVb@cache-prod.acme.fr:6379", true],
      [
        "empty-username postgres URI",
        "postgresql://:tYm9x2QpLw7fVb@db-prod.acme.fr:5432/appdb",
        true,
      ],
      ["percent-encoded @ in username", "postgresql://admin%40pgsrv:pw@db-prod.acme.fr/db", true],
      [
        "percent-encoded / in password",
        "postgresql://admin:tYm9%2Fx2QpLw7fVb@db-prod.acme.fr/db",
        true,
      ],
      // An empty password is not a credential: the userinfo is an identifier.
      ["empty-password userinfo", "postgresql://user:@db-prod.acme.fr/db", false],
      // RFC 2606 and localhost cannot name a provisioned service: an example.
      ["reserved-host example", "https://user:secret@example.org/feed.xml", false],
      ["reserved-host empty username", "redis://:pw@localhost:6379", false],
      ["localhost example", "amqp://u:pw@localhost:5672", false],
      // Userinfo without a password is an identifier, handled by the PII path.
      ["userinfo without password", "git://git@acme.fr/repo.git", false],
      ["plain URL", "https://github.com/libre-ai/libre-ai.git", false],
    ];
    for (const [label, value, expected] of cases) {
      test(label, () => {
        expect(containsCredentialMarker(value)).toBe(expected);
      });
    }
  });

  test("uses exact case-sensitive HTML5 names", () => {
    expect(decodeSensitiveMarkers("&commat;|&CommaT;|&alpha;|&QUOT;")).toBe('@|&CommaT;|α|"');
  });

  test("stays bounded on maximum adversarial strings", () => {
    const maximum = 65_536;
    const cases = [
      "a".repeat(maximum),
      "@".repeat(maximum),
      '""'.repeat(maximum / 2),
      `a@${"a.".repeat(32_760)}1`,
      `${"a".repeat(65_520)}"@example.org`,
      `${"&amp;".repeat(13_000)}text`,
      `${"(".repeat(32_760)}release@2${")".repeat(32_760)}`,
    ];
    const started = Bun.nanoseconds();
    for (const value of cases) expect(containsSensitivePublicMarker(value)).toBe(false);
    expect(
      containsSensitivePublicMarker(`${"(".repeat(32_750)}alice@example.org${")".repeat(32_750)}`),
    ).toBe(true);
    expect((Bun.nanoseconds() - started) / 1e6).toBeLessThan(2_000);
  });
});
