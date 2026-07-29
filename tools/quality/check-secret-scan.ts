import { containsCredentialMarker } from "./public-source-scanner";

/**
 * WP-G2-Q01 acceptance criterion 2, the tree-wide "secret" gate: no committed
 * credential (cloud key, VCS/CI token, private key, etc.) appears in a living
 * surface. The credential detection is delegated to containsCredentialMarker
 * (credential-only sibling of the contract PII scanner, same decoding
 * hardening, already covered by public-source-scanner's tests) — this file is
 * only the scope + reporting shell, so the patterns live in exactly one place.
 * Email/URL identifiers are intentionally out of scope here: an example
 * address in a scanner fixture is not a committed credential.
 *
 * Excluded: the detector source (it holds the patterns), this gate's own test
 * and the schema-fixtures vector corpus (both carry anti-pattern fixtures by
 * design, already validated in their own context by check-contracts),
 * non-normative review evidence (docs/reviews and any evidence directory), and
 * the usual build or vendored trees. File exclusions are exact paths — an
 * unanchored suffix would let any same-named path inherit the exemption — and
 * a fixture that must carry a positive detection case on a non-reserved host
 * (e.g. the no-clever gate's own canary) exempts its single line with the
 * greppable `secret-scan:allowed-fixture` marker instead of its whole file
 * (K4 review of f49fc18, finding 4: file-wide exemptions silently unscanned
 * every other vendor-token form).
 */
export interface SecretScanTarget {
  readonly path: string;
  readonly content: string;
}

export interface SecretFinding {
  readonly path: string;
  readonly line: number;
}

const IGNORED_PREFIXES = ["node_modules/", "target/", "dist/", ".git/", "docs/reviews/"];
const IGNORED_SUBSTRINGS = ["/evidence/"];
// Exact paths only: the detector pair (it holds the patterns), this gate's own
// pair (anti-pattern fixtures by design) and the scanner vector corpus.
const IGNORED_FILES = new Set([
  "tools/quality/public-source-scanner.ts",
  "tools/quality/public-source-scanner.test.ts",
  "tools/quality/check-secret-scan.ts",
  "tools/quality/check-secret-scan.test.ts",
  "contracts/fixtures/schema-fixtures.v1.json",
]);
// Line-level exemption for a fixture that must exercise a positive detection
// case on a non-reserved host. Greppable, reviewed, single-line by design —
// and honoured ONLY inside the allowlisted fixture files below: a secrets
// gate on a public repository must not offer a universal mute (K4 re-pass
// of 344aea0). Extending the allowlist is a security decision.
const LINE_EXEMPTION_MARKER = "secret-scan:allowed-fixture";
const LINE_EXEMPTION_FILES = new Set([
  "tools/quality/check-no-clever-production.test.ts",
  "tools/quality/check-personal-data-boundary.test.ts",
]);

function isIgnored(path: string): boolean {
  if (IGNORED_PREFIXES.some((prefix) => path.startsWith(prefix))) return true;
  if (IGNORED_SUBSTRINGS.some((part) => path.includes(part))) return true;
  return IGNORED_FILES.has(path);
}

export function scanForSecrets(targets: readonly SecretScanTarget[]): SecretFinding[] {
  const findings: SecretFinding[] = [];
  for (const target of targets) {
    if (isIgnored(target.path)) {
      continue;
    }
    const lines = target.content.split("\n");
    const markerHonoured = LINE_EXEMPTION_FILES.has(target.path);
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i] ?? "";
      if (markerHonoured && line.includes(LINE_EXEMPTION_MARKER)) continue;
      if (containsCredentialMarker(line)) {
        findings.push({ path: target.path, line: i + 1 });
      }
    }
  }
  return findings;
}

if (import.meta.main) {
  const glob = new Bun.Glob("**/*.{ts,tsx,json,jsonc,yaml,yml,toml,md,rs,sql,sh,env}");
  const targets: SecretScanTarget[] = [];
  for await (const path of glob.scan({ cwd: ".", onlyFiles: true, dot: true })) {
    if (isIgnored(path)) {
      continue;
    }
    targets.push({ path, content: await Bun.file(path).text() });
  }
  const findings = scanForSecrets(targets);
  if (findings.length > 0) {
    for (const finding of findings) {
      console.error(`${finding.path}:${finding.line}: committed credential marker`);
    }
    console.error("Secret scan failed (WP-G2-Q01 acceptance 2): a credential marker was found.");
    process.exit(1);
  }
  console.log("Secret scan clean (WP-G2-Q01 acceptance 2) verified");
}
