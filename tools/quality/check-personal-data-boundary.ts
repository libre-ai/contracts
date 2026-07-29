/**
 * Personal-data boundary guard (ADR-0012, invariant I-21).
 *
 * This repository publishes CODE — engines, contracts, schemas, curation rules.
 * It never publishes INSTANCE DATA. Curated items about organisations live in a
 * private Radar tenant behind RLS; anything about a natural person lives only on
 * the owner's device, inside Notebook, under a non-exportable key. Neither ever
 * reaches a public commit.
 *
 * `DATA-PROVENANCE.md` already states that policy — "data with unresolved
 * provenance, privacy or redistribution rights is not published" — but a policy
 * with no instrument is a convention, and conventions lose. This scanner is the
 * instrument. It fails closed: it over-blocks by design, and every exemption is a
 * named, justified entry rather than a pattern loosened until the gate goes quiet.
 *
 * Two independent signals, because the two accidents differ:
 *
 * 1. `scanDatasetPaths` — a real dataset entered the tree. This is the likely
 *    accident of a dogfooding session: an OPML subscription export, a curated
 *    NDJSON dump, a whole working directory pasted in "just to test". Judged on
 *    the path alone, so a binary blob is caught without reading it.
 * 2. `scanPersonalIdentifiers` — an identifier was pasted into authored prose or
 *    source. Judged line by line, one finding per line.
 *
 * What it does NOT do, stated so nobody mistakes its silence for proof: it cannot
 * recognise a person's name, an inferred opinion, or an organisational affiliation
 * written in plain sentences — which is precisely the Article 9 material the ADR
 * governs. That material is kept out by architecture (Notebook is local-only and
 * has no outbound primitive, enforced by `check-no-transmission.ts`) and by the
 * sourced-facts-only rule on person records. This gate stops the accidental and
 * the obvious paste, not authored prose about a human being.
 */
export interface ScanTarget {
  readonly path: string;
  readonly content: string;
}

export interface BoundaryFinding {
  readonly path: string;
  readonly line?: number;
  readonly reason: string;
}

// Extensions that carry records rather than code. `.opml`, `.vcf`, `.ics`,
// `.mbox` and `.eml` are here specifically because a veille workflow produces
// them: feed subscriptions, contact cards, calendars, raw mail.
const DATASET_EXTENSIONS: ReadonlySet<string> = new Set([
  ".arrow",
  ".avro",
  ".bak",
  ".csv",
  ".db",
  ".dump",
  ".eml",
  ".ics",
  ".jsonl",
  ".mbox",
  ".ndjson",
  ".ods",
  ".opml",
  ".parquet",
  ".sql",
  ".sqlite",
  ".sqlite3",
  ".tsv",
  ".vcf",
  ".xlsx",
]);

// Leading path segments reserved against a pasted working directory. Reserving
// the NAME (not a content pattern) is what makes the check total: whatever the
// extension, nothing under these may be committed.
const RESERVED_INSTANCE_SEGMENTS: readonly string[] = [
  ".notebook",
  ".radar",
  "data",
  "exports",
  "instance",
];

// The single dataset exemption, and it mirrors a written policy rather than
// creating one: DATA-PROVENANCE.md classifies fixtures under contracts/fixtures
// as synthetic software test vectors under Apache-2.0, explicitly "not published
// real-world datasets".
const FIXTURE_PREFIX = "contracts/fixtures/";

function extensionOf(path: string): string {
  const dot = path.lastIndexOf(".");
  const slash = path.lastIndexOf("/");
  return dot > slash ? path.slice(dot).toLowerCase() : "";
}

// A product migration is schema, not data: it declares tables, policies and
// constraints. Excluding it by path segment keeps `.sql` in scope everywhere else,
// where it would mean a dump.
function isMigration(path: string): boolean {
  return path.split("/").includes("migrations");
}

export function scanDatasetPaths(paths: readonly string[]): BoundaryFinding[] {
  const findings: BoundaryFinding[] = [];
  for (const path of paths) {
    const segment = path.split("/")[0] ?? "";
    if (RESERVED_INSTANCE_SEGMENTS.includes(segment)) {
      findings.push({ path, reason: `instance directory (${segment}/)` });
      continue;
    }
    if (path.startsWith(FIXTURE_PREFIX)) continue;
    const extension = extensionOf(path);
    if (!DATASET_EXTENSIONS.has(extension)) continue;
    if (extension === ".sql" && isMigration(path)) continue;
    findings.push({ path, reason: `dataset file (${extension})` });
  }
  return findings;
}

// Reviewed exemptions, each with a reason that survives re-reading. Adding an
// entry is a privacy decision, not a way to silence a finding.
const ALLOWLISTED_ADDRESSES: ReadonlySet<string> = new Set([
  // The project's own contribution identity: every REUSE header and DCO sign-off
  // carries it, and DCO makes it public by design (CONTRIBUTING.md).
  "cjais@pm.me",
]);

// Matched as the exact domain or as a suffix, so `host.invalid` resolves through
// `invalid` and `libre-ai.example` through `example`. RFC 2606 reserves all four
// documentation and testing names; `libre-ai.fr` and `github.com` carry role
// addresses of the project and its forge, never a third party's contact details.
const ALLOWLISTED_DOMAINS: readonly string[] = [
  "example",
  "example.com",
  "example.net",
  "example.org",
  "github.com",
  "invalid",
  "libre-ai.fr",
  "localhost",
  "test",
];

const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// French national numbering: +33 or a leading 0, then 9 digits in pairs, with the
// usual space, dot or dash separators.
//
// The two guards are what keep it off ordinary repository content. The trailing
// \b keeps it off a hex digest — `0123456789abcdef` offers no word boundary after
// the digits. The leading (?<![\d.-]) keeps it off a chain of ISO dates, where
// `…-2026-01-13-…` otherwise reads as a zero, a digit and four separated pairs,
// and off long decimal fractions — `4.0767416621` (an OKLCH conversion
// coefficient) otherwise reads as a mobile number: a zero that follows a
// decimal point is a fraction, never a dialling prefix.
const PHONE_FR_PATTERN = /(?:\+33[\s.-]?|(?<![\d.-])\b0)[1-9](?:[\s.-]?\d{2}){4}\b/;
const IBAN_FR_PATTERN = /\bFR\d{2}(?:\s?[A-Z0-9]{4}){5}\s?[A-Z0-9]{3}\b/;

function isAllowlistedEmail(address: string): boolean {
  const lower = address.toLowerCase();
  if (ALLOWLISTED_ADDRESSES.has(lower)) return true;
  const domain = lower.slice(lower.lastIndexOf("@") + 1);
  return ALLOWLISTED_DOMAINS.some(
    (allowed) => domain === allowed || domain.endsWith(`.${allowed}`),
  );
}

/**
 * Addresses on a line, minus the ones that are really URL userinfo.
 *
 * `postgresql://user:pw@host.example.com/db` has an email-shaped userinfo tail.
 * The discriminator is the scheme: an address directly preceded by `:` or `/`
 * on a line that already opened a `://` is a credential, not a contact. Keying
 * on `://` rather than on the punctuation alone keeps `mailto:someone@x.fr`
 * caught, which is a real contact address.
 */
function contactAddresses(line: string): string[] {
  const found: string[] = [];
  for (const match of line.matchAll(EMAIL_PATTERN)) {
    const before = line.slice(0, match.index ?? 0);
    const previous = before.at(-1);
    if ((previous === ":" || previous === "/") && before.includes("://")) continue;
    found.push(match[0]);
  }
  return found;
}

// Files that carry identifier fixtures by design, exactly as the no-transmission
// scanner excludes itself. This guard and its test hold the patterns above;
// public-source-scanner.ts holds a table of deliberately malformed addresses
// (IDN, punycode, empty labels) that exercises its own address validator. None is
// a place where veille data could plausibly land.
const FIXTURE_BEARING_PATHS: readonly string[] = [
  "tools/quality/check-personal-data-boundary.test.ts",
  "tools/quality/check-personal-data-boundary.ts",
  "tools/quality/public-source-scanner.ts",
];

// Verbatim third-party licence texts and vendored upstream source carry their
// authors' addresses and must not be edited; lockfiles are generated, not authored.
const IDENTIFIER_OUT_OF_SCOPE_PREFIXES: readonly string[] = ["LICENSES/", "third_party/"];
const IDENTIFIER_OUT_OF_SCOPE_SUFFIXES: readonly string[] = [".lock"];

function identifierInScope(path: string): boolean {
  if (FIXTURE_BEARING_PATHS.includes(path)) return false;
  if (IDENTIFIER_OUT_OF_SCOPE_PREFIXES.some((prefix) => path.startsWith(prefix))) return false;
  if (IDENTIFIER_OUT_OF_SCOPE_SUFFIXES.some((suffix) => path.endsWith(suffix))) return false;
  return true;
}

function reasonForLine(line: string): string | undefined {
  if (contactAddresses(line).some((address) => !isAllowlistedEmail(address))) {
    return "email address";
  }
  if (IBAN_FR_PATTERN.test(line)) return "French IBAN";
  if (PHONE_FR_PATTERN.test(line)) return "French phone number";
  return undefined;
}

export function scanPersonalIdentifiers(targets: readonly ScanTarget[]): BoundaryFinding[] {
  const findings: BoundaryFinding[] = [];
  for (const target of targets) {
    if (!identifierInScope(target.path)) continue;
    const lines = target.content.split("\n");
    for (let i = 0; i < lines.length; i += 1) {
      // One finding per line: the message points the author at a place to look,
      // and a line stuffed with identifiers should not drown the report.
      const reason = reasonForLine(lines[i] ?? "");
      if (reason !== undefined) findings.push({ path: target.path, line: i + 1, reason });
    }
  }
  return findings;
}

// Only files Git tracks are in scope, because those are exactly the files a push
// publishes. It also means an ignored local scratch directory is the owner's
// business, and node_modules/target never enter the walk.
function trackedFiles(): string[] {
  const result = Bun.spawnSync(["git", "ls-files", "-z"]);
  if (!result.success) throw new Error("git ls-files failed; run this guard inside the repository");
  return new TextDecoder().decode(result.stdout).split("\0").filter(Boolean);
}

// Identifiers are only searched in authored text. A dataset hiding in a binary is
// the other signal's job, and it judges the path without reading the bytes.
const AUTHORED_EXTENSIONS: ReadonlySet<string> = new Set([
  ".json",
  ".md",
  ".rs",
  ".sql",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml",
]);

if (import.meta.main) {
  const paths = trackedFiles();
  const findings = scanDatasetPaths(paths);
  const targets: ScanTarget[] = [];
  for (const path of paths) {
    if (!AUTHORED_EXTENSIONS.has(extensionOf(path))) continue;
    targets.push({ path, content: await Bun.file(path).text() });
  }
  findings.push(...scanPersonalIdentifiers(targets));

  if (findings.length > 0) {
    for (const finding of findings) {
      const at = finding.line === undefined ? finding.path : `${finding.path}:${finding.line}`;
      console.error(`${at}: ${finding.reason}`);
    }
    console.error(
      "Personal-data boundary violated (ADR-0012, I-21). This repository publishes code, not instance data: curated organisation records belong to a private Radar tenant, anything about a natural person stays on-device in Notebook.",
    );
    process.exit(1);
  }
  console.log(`Personal-data boundary verified across ${paths.length} tracked files`);
}
