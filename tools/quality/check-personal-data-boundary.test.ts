import { describe, expect, test } from "bun:test";
import {
  type BoundaryFinding,
  scanDatasetPaths,
  scanPersonalIdentifiers,
} from "./check-personal-data-boundary";

// The personal-data boundary guard (ADR-0012, I-21): this repository publishes
// CODE, never instance DATA. Real datasets and personal identifiers belong to a
// private Radar tenant or an on-device Notebook, never to a public commit.
// DATA-PROVENANCE.md already states the policy; this guard is its instrument.

function identifiersFor(path: string, content: string): BoundaryFinding[] {
  return scanPersonalIdentifiers([{ path, content }]);
}

describe("scanDatasetPaths", () => {
  test("flags tabular and columnar dataset extensions anywhere in the tree", () => {
    const findings = scanDatasetPaths([
      "docs/veille/organisations.csv",
      "tools/export.tsv",
      "packages/data/sample.parquet",
    ]);
    expect(findings).toHaveLength(3);
    expect(findings[0]?.reason).toContain("dataset file");
  });

  test("flags line-delimited exports, spreadsheets and embedded databases", () => {
    expect(
      scanDatasetPaths([
        "items.ndjson",
        "decisions.jsonl",
        "contacts.xlsx",
        "radar.sqlite",
        "notebook.db",
      ]),
    ).toHaveLength(5);
  });

  test("flags the personal-record interchange formats a veille workflow produces", () => {
    // .opml is a feed-subscription export, .vcf a contact card, .ics a calendar,
    // .mbox/.eml raw mail: each is exactly what a dogfooding session would be
    // tempted to drop into the repo "just to test".
    expect(
      scanDatasetPaths(["sources.opml", "carnet.vcf", "agenda.ics", "inbox.mbox", "reply.eml"]),
    ).toHaveLength(5);
  });

  test("flags a SQL dump but not a product migration", () => {
    expect(scanDatasetPaths(["backup/radar-dump.sql"])).toHaveLength(1);
    expect(scanDatasetPaths(["apps/sessions/migrations/0004_restriction.sql"])).toHaveLength(0);
    expect(scanDatasetPaths(["packages/data/migrations/0003_retention_role.sql"])).toHaveLength(0);
  });

  test("does not flag synthetic contract fixtures", () => {
    // DATA-PROVENANCE.md already rules on these: fixtures under contracts/fixtures
    // are software test vectors under Apache-2.0, not published real-world data.
    // The allowlist mirrors a written policy, it is not a convenience exemption.
    expect(
      scanDatasetPaths([
        "contracts/fixtures/radar/golden-vectors.v1.json",
        "contracts/fixtures/radar/sample-feed.ndjson",
      ]),
    ).toHaveLength(0);
  });

  test("does not flag ordinary source, schema or documentation files", () => {
    expect(
      scanDatasetPaths([
        "contracts/schemas/envelope.v1.schema.json",
        "packages/data/src/retention-sweep.ts",
        "docs/adr/0012-personal-data-boundary.md",
        "ecosystem/repositories.v1.yaml",
      ]),
    ).toHaveLength(0);
  });

  test("flags any file under an instance directory whatever its extension", () => {
    // The likeliest accident is not an exotic extension, it is a whole working
    // directory pasted in. Reserve the names and refuse them wholesale.
    const findings = scanDatasetPaths([
      "data/notes.md",
      "exports/2026-07/summary.json",
      "instance/config.ts",
      ".radar/state.json",
      ".notebook/blocks.json",
    ]);
    expect(findings).toHaveLength(5);
    expect(findings[0]?.reason).toContain("instance directory");
  });

  test("does not flag a path that merely contains the reserved word", () => {
    // `packages/data` is the shared data-platform package, not an instance
    // directory: only a leading path segment is reserved.
    expect(
      scanDatasetPaths(["packages/data/src/index.ts", "docs/architecture/DATA-OWNERSHIP.md"]),
    ).toHaveLength(0);
  });
});

describe("scanPersonalIdentifiers", () => {
  test("flags an email address that is not on the allowlist", () => {
    const findings = identifiersFor(
      "docs/veille/fiche.md",
      "Contact : marie.durand@syndicat-fictif.fr",
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.line).toBe(1);
    expect(findings[0]?.reason).toContain("email address");
  });

  test("reports the line number of the finding", () => {
    expect(
      identifiersFor("docs/x.md", "premiere ligne\ndeuxieme ligne\njean.martin@organisation.fr"),
    ).toEqual([{ path: "docs/x.md", line: 3, reason: "email address" }]);
  });

  test("does not flag the project's own contribution identity", () => {
    // Every REUSE header and DCO sign-off carries it; flagging it would make the
    // gate unusable and teach contributors to bypass it.
    expect(
      identifiersFor("LICENSING.md", "SPDX-FileCopyrightText: Constantin Jais <cjais@pm.me>"),
    ).toHaveLength(0);
  });

  test("does not flag RFC 2606 reserved documentation domains", () => {
    expect(
      identifiersFor(
        "docs/apps/radar.md",
        "owner@example.com, a@example.org, b@example.net, c@host.invalid, d@host.test",
      ),
    ).toHaveLength(0);
  });

  test("does not flag third-party licence texts", () => {
    // LICENSES/ holds verbatim legal texts that carry upstream authors' contact
    // addresses. They must not be edited, so they cannot be in scope.
    expect(
      identifiersFor("LICENSES/EUPL-1.2.txt", "questions to joinup@ec.europa.eu"),
    ).toHaveLength(0);
  });

  test("flags a French phone number in both notations", () => {
    expect(identifiersFor("docs/x.md", "tel +33 6 12 34 56 78")).toHaveLength(1);
    expect(identifiersFor("docs/x.md", "tel 06 12 34 56 78")).toHaveLength(1);
    expect(identifiersFor("docs/x.md", "tel 01.42.68.53.00")).toHaveLength(1);
  });

  test("flags a French IBAN", () => {
    const findings = identifiersFor("docs/x.md", "IBAN FR76 3000 6000 0112 3456 7890 189");
    expect(findings).toHaveLength(1);
    expect(findings[0]?.reason).toContain("IBAN");
  });

  test("does not flag version strings, digests, dates or ports", () => {
    // The cost of a false positive here is a contributor learning to skip the
    // gate, so the numeric patterns must not fire on ordinary repository content.
    expect(identifiersFor("package.json", '"version": "1.4.0-canary.1+57f349f63"')).toHaveLength(0);
    expect(
      identifiersFor("docs/x.md", "digest f45dfad0a1b2c3d4e5f60718293a4b5c6d7e8f90"),
    ).toHaveLength(0);
    expect(identifiersFor("docs/x.md", "le 2026-07-25, port 3000, 35 jours")).toHaveLength(0);
    expect(identifiersFor("docs/x.md", "sha256 0123456789abcdef")).toHaveLength(0);
  });

  test("does not flag long decimal fractions as phone numbers", () => {
    // Found on the real tree: OKLCH conversion matrices (packages/ui/color-system)
    // carry ten-digit fractions whose digits after the decimal point read as a
    // valid mobile number ("4.0767416621" contains 07 67 41 66 21). A zero that
    // follows a decimal point is a fraction, never a dialling prefix.
    expect(
      identifiersFor("packages/ui/color-system/color.ts", "4.0767416621 * l - 3.3077 * m"),
    ).toHaveLength(0);
    expect(
      identifiersFor("packages/ui/color-system/color.ts", "lightness - 0.0894841775 * a"),
    ).toHaveLength(0);
    // The guard must not weaken the real notations.
    expect(identifiersFor("docs/x.md", "joignable au 0767416621")).toHaveLength(1);
  });

  test("does not flag a run of concatenated ISO dates as a phone number", () => {
    // Found on the real tree: an evidence-feed fixture id. A date chain offers
    // "0" + digit + four separated pairs, so the pattern must refuse a leading
    // zero that itself follows a digit or a dash.
    expect(
      identifiersFor(
        "distribution/fixtures/evidence-feed/expected/evidence.json",
        '"id": "gate-2026-01-13-2026-01-13-ligne-incomplete-sans-les-quatre-cellules"',
      ),
    ).toHaveLength(0);
  });

  test("does not flag the userinfo of a connection URL", () => {
    // Found on the real tree: a sibling scanner's fixture holds a database URL
    // whose `user:pw@host` is userinfo, not a contact address. The host here is
    // deliberately neutral — reproducing the real one would trip
    // check-no-clever-production.ts — and deliberately NOT on the domain
    // allowlist, so the test exercises the userinfo rule and nothing else.
    expect(
      identifiersFor(
        "tools/quality/some-scanner.test.ts",
        'const db = "postgresql://user:pw@b0000-postgresql.services.hebergeur-fictif.fr:5432/db";', // secret-scan:allowed-fixture
      ),
    ).toHaveLength(0);
  });

  test("still flags an address behind a mailto: scheme", () => {
    // The userinfo exemption keys on `://`, so a real contact link stays caught.
    expect(
      identifiersFor("docs/x.md", "[écrire](mailto:marie.durand@organisation.fr)"),
    ).toHaveLength(1);
  });

  test("does not flag the RFC 2606 .example TLD", () => {
    // Found on the real tree: the key-ceremony runbook signs with
    // owner@libre-ai.example. RFC 2606 reserves .example alongside .invalid/.test.
    expect(
      identifiersFor(
        "docs/security/KEY-CEREMONY-RUNBOOK.md",
        '"signatory": "owner@libre-ai.example"',
      ),
    ).toHaveLength(0);
  });

  test("does not flag vendored third-party source", () => {
    // third_party/ holds upstream code carrying its authors' headers. Like
    // LICENSES/, it must not be edited, so it cannot be in scope.
    expect(
      identifiersFor(
        "third_party/rustcrypto-aes-0.8.4/src/soft/fixslice32.rs",
        "// Author: someone@rustcrypto-fictif.example.org",
      ),
    ).toHaveLength(0);
  });

  test("does not flag a scanner that carries address vectors by design", () => {
    // public-source-scanner.ts holds a table of deliberately malformed addresses
    // (IDN, punycode, empty labels) to exercise its own validator.
    expect(
      identifiersFor(
        "tools/quality/public-source-scanner.ts",
        '["punycode email", "alice@x.xn--p1ai", true],',
      ),
    ).toHaveLength(0);
  });

  test("reports one finding per line even when several patterns match", () => {
    // One line, one finding: the message tells the author where to look, and a
    // line stuffed with identifiers should not drown the report.
    expect(
      identifiersFor("docs/x.md", "marie.durand@organisation.fr / 06 12 34 56 78"),
    ).toHaveLength(1);
  });

  test("excludes the guard's own source and test from the scan", () => {
    // Both files carry identifier fixtures by design, exactly as the
    // no-transmission scanner excludes itself.
    expect(
      identifiersFor("tools/quality/check-personal-data-boundary.ts", "a@organisation.fr"),
    ).toHaveLength(0);
    expect(
      identifiersFor("tools/quality/check-personal-data-boundary.test.ts", "b@organisation.fr"),
    ).toHaveLength(0);
  });

  test("does not flag binary or lock artefacts that are not authored prose", () => {
    expect(identifiersFor("bun.lock", "https://registry.npmjs.org/@libre-ai/ui")).toHaveLength(0);
  });
});
