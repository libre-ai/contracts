import { describe, expect, test } from "bun:test";
import { type SecretFinding, scanForSecrets } from "./check-secret-scan";

/**
 * WP-G2-Q01 acceptance criterion 2, the "secret" gate: no committed
 * credential appears in any living surface. The detector itself
 * (containsSensitivePublicMarker) is already covered by
 * public-source-scanner.test.ts and its self-tests; here we cover only the
 * tree-wide gate wiring — scope, exclusions, path/line reporting — reusing
 * that detector rather than duplicating the credential patterns.
 */

function findingsFor(path: string, content: string): SecretFinding[] {
  return scanForSecrets([{ path, content }]);
}

describe("scanForSecrets", () => {
  test("flags an AWS access key id on its line", () => {
    const findings = findingsFor("apps/x/config.ts", "const id = 'AKIA1234567890ABCDEF';");
    expect(findings).toHaveLength(1);
    expect(findings[0]?.path).toBe("apps/x/config.ts");
    expect(findings[0]?.line).toBe(1);
  });

  test("flags a private key header", () => {
    const findings = findingsFor(
      "deploy/key.pem",
      "line one\n-----BEGIN OPENSSH PRIVATE KEY-----\nbase64",
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.line).toBe(2);
  });

  test("flags a GitHub token", () => {
    const findings = findingsFor(
      "scripts/ci.ts",
      "const t = 'ghp_0123456789abcdefghijABCDEFGHIJ0123';",
    );
    expect(findings).toHaveLength(1);
  });

  test("does NOT flag ordinary source without secrets", () => {
    const findings = findingsFor(
      "packages/data/src/x.ts",
      "export const answer = 42;\nconst name = 'radar';",
    );
    expect(findings).toHaveLength(0);
  });

  test("excludes the secret detector source itself (it holds the patterns)", () => {
    const findings = findingsFor(
      "tools/quality/public-source-scanner.ts",
      "const marker = /AKIA[0-9A-Z]{16}/;",
    );
    expect(findings).toHaveLength(0);
  });

  test("excludes this gate's own test fixtures", () => {
    const findings = findingsFor(
      "tools/quality/check-secret-scan.test.ts",
      "const id = 'AKIA1234567890ABCDEF';",
    );
    expect(findings).toHaveLength(0);
  });

  test("excludes non-normative review evidence", () => {
    const findings = findingsFor(
      "crates/authz-biscuit/evidence/reviews/x/NOTE.md",
      "example token ghp_0123456789abcdefghijABCDEFGHIJ0123",
    );
    expect(findings).toHaveLength(0);
  });

  // K4 review of f49fc18, finding 4: exemptions were file-wide and matched by
  // unanchored endsWith, so any path ending with an exempted name inherited
  // the exemption and every other vendor-token form went unscanned.
  test("exemptions are exact paths, not unanchored suffixes", () => {
    const findings = findingsFor(
      "apps/evil/public-source-scanner.ts",
      "const id = 'AKIA1234567890ABCDEF';",
    );
    expect(findings).toHaveLength(1);
  });

  test("sibling gates are scanned again: only marked fixture lines are exempt", () => {
    const findings = findingsFor(
      "tools/quality/check-no-clever-production.test.ts",
      [
        "const ok = 1;",
        "'postgresql://u:pw@b0-postgresql.services.hebergeur-fictif.fr:5432/db', // secret-scan:allowed-fixture",
        "const t = 'ghp_0123456789abcdefghijABCDEFGHIJ0123';",
      ].join("\n"),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.line).toBe(3);
  });

  test("the line marker is honoured only inside the fixture allowlist", () => {
    // A secrets gate on a public repository must not offer a universal mute:
    // outside the two known fixture files, the marker is inert and the
    // credential on the line is still reported (K4 re-pass of 344aea0).
    const findings = findingsFor(
      "apps/web/src/config.ts",
      "const t = 'ghp_0123456789abcdefghijABCDEFGHIJ0123'; // secret-scan:allowed-fixture",
    );
    expect(findings).toHaveLength(1);
  });

  test("the line marker does not exempt other files' unmarked credentials", () => {
    const findings = findingsFor(
      "apps/x/config.ts",
      "const db = 'postgresql://u:pw@db-prod.acme.fr:5432/db';",
    );
    expect(findings).toHaveLength(1);
  });
});
