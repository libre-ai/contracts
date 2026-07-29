/**
 * Declared-vs-effective licence gate.
 *
 * A publishable package states its licence twice: once to consumers, in the
 * manifest `license` field, and once to the repository, through the REUSE
 * annotations that `reuse spdx` resolves per file. Nothing compared the two.
 * `packages/ui` declared `"license": "Apache-2.0"` to npm consumers while REUSE
 * attributed it `EUPL-1.2` — a reciprocity mismatch, not a cosmetic one — and
 * every required check stayed green for the whole time it was published that
 * way. `reuse lint` cannot see it: it verifies that each file *has* an
 * unambiguous licence, never that a manifest restates the same one.
 *
 * Authority is not symmetric between the two statements. LICENSING.md
 * ("Machine-readable precedence") gives it to the SPDX notice, then to the
 * closest `REUSE.toml` annotation, then to the first-party `EUPL-1.2` default.
 * The manifest field appears nowhere in that order: it restates a grant, it
 * cannot make one. A mismatch is therefore always a defect in the manifest's
 * claim, and this gate treats the REUSE resolution as the reference.
 *
 * Three states, reported distinctly, because "found nothing" and "could not
 * look" must never read the same:
 *
 *   conforming    — every compared file carries exactly the declared licence;
 *   divergent     — at least one file does not (FAIL);
 *   indeterminate — the comparison could not be established (FAIL): no declared
 *                   licence, an SPDX expression this gate does not model, or no
 *                   attributed file at all.
 *
 * The gate reports how many packages it examined and fails on zero, so a
 * renamed directory or a broken scan turns it red instead of passing on an
 * empty set — the failure mode that let the original defect through.
 *
 * Editorial prose is deliberately not compared. LICENSING.md ("Documentation
 * and executable examples") licenses editorial documentation `CC-BY-4.0`
 * repository-wide, so a Markdown file resolved to `CC-BY-4.0` is doctrine
 * conformant and says nothing about the licence of the software the manifest
 * describes; comparing it would make almost every package look mixed and the
 * gate would be trained away. The skipped count is printed per package, never
 * hidden. This is a rule about a licence class, not about a package: any other
 * file — a source under a documentation licence, a Markdown file under a third
 * licence — is compared like the rest, and no package is ever exempted.
 */

import { execSync } from "node:child_process";
import { dirname } from "node:path";

/** Licence identifiers `reuse spdx` resolved for one file. */
export interface SpdxFileAttribution {
  readonly path: string;
  readonly licenses: readonly string[];
}

/** A package whose manifest makes a licence claim to consumers. */
export interface PublishableTarget {
  readonly manifestPath: string;
  readonly directory: string;
  readonly name: string;
  readonly declared: string | null;
}

export type Classification =
  | { readonly kind: "publishable"; readonly target: PublishableTarget }
  | { readonly kind: "excluded"; readonly reason: string };

export type Verdict =
  | { readonly state: "conforming"; readonly compared: number; readonly editorialSkipped: number }
  | {
      readonly state: "divergent";
      readonly compared: number;
      readonly editorialSkipped: number;
      readonly divergences: readonly { readonly path: string; readonly effective: string }[];
    }
  | { readonly state: "indeterminate"; readonly reason: string };

export interface PackageReport {
  readonly target: PublishableTarget;
  readonly verdict: Verdict;
}

const EDITORIAL_LICENSE = "CC-BY-4.0";

// SPDX short-form identifiers: letters, digits, dot, plus, hyphen.
const LICENSE_IDENTIFIER = /^[A-Za-z0-9.+-]+$/;

/**
 * Parses the tag-value document produced by `reuse spdx`.
 *
 * A dual-licensed file is emitted as several `LicenseInfoInFile` lines rather
 * than as one expression, so a file's licence is a set, not a string.
 * `FileCopyrightText` opens a `<text>` block that spans lines and holds
 * arbitrary content; tags inside it are skipped so a copyright notice can never
 * be mistaken for structure.
 */
export function parseSpdxDocument(document: string): SpdxFileAttribution[] {
  const attributions: SpdxFileAttribution[] = [];
  let path: string | null = null;
  let licenses: string[] = [];
  let insideTextBlock = false;

  const flush = (): void => {
    if (path !== null) attributions.push({ path, licenses });
  };

  for (const line of document.split("\n")) {
    if (insideTextBlock) {
      if (line.includes("</text>")) insideTextBlock = false;
      continue;
    }
    if (line.includes("<text>") && !line.includes("</text>")) {
      insideTextBlock = true;
      continue;
    }
    if (line.startsWith("FileName:")) {
      flush();
      path = line.slice("FileName:".length).trim().replace(/^\.\//, "");
      licenses = [];
      continue;
    }
    if (path !== null && line.startsWith("LicenseInfoInFile:")) {
      const value = line.slice("LicenseInfoInFile:".length).trim();
      if (value.length > 0 && value !== "NONE" && value !== "NOASSERTION") licenses.push(value);
    }
  }
  flush();
  return attributions;
}

/**
 * Splits a declared expression into the identifier set REUSE would resolve.
 * Returns null for an expression this gate does not model, so the package is
 * reported as indeterminate instead of being silently compared as a string.
 */
export function parseDeclaredExpression(expression: string): readonly string[] | null {
  const trimmed = expression.trim();
  if (trimmed.length === 0) return null;
  const parts = trimmed.split(/\s+OR\s+/);
  const identifiers = parts.map((part) => part.trim());
  if (identifiers.some((identifier) => !LICENSE_IDENTIFIER.test(identifier))) return null;
  return [...new Set(identifiers)];
}

/** Doctrine-conformant editorial prose: Markdown resolved to the documentation licence. */
export function isEditorialProse(path: string, licenses: readonly string[]): boolean {
  return path.endsWith(".md") && licenses.length === 1 && licenses[0] === EDITORIAL_LICENSE;
}

function sameLicenseSet(left: readonly string[], right: readonly string[]): boolean {
  const a = new Set(left);
  const b = new Set(right);
  if (a.size !== b.size) return false;
  for (const value of a) if (!b.has(value)) return false;
  return true;
}

export interface BunManifest {
  readonly name?: unknown;
  readonly private?: unknown;
  readonly license?: unknown;
}

/**
 * A Bun/npm package engages consumers unless it opts out with `private: true`,
 * the field npm itself honours to refuse publication.
 */
export function classifyBunManifest(manifestPath: string, manifest: BunManifest): Classification {
  if (manifest.private === true) return { kind: "excluded", reason: "private: true" };
  const directory = dirname(manifestPath);
  return {
    kind: "publishable",
    target: {
      manifestPath,
      directory,
      name: typeof manifest.name === "string" ? manifest.name : manifestPath,
      declared: typeof manifest.license === "string" ? manifest.license : null,
    },
  };
}

export interface CargoManifest {
  readonly package?: {
    readonly name?: unknown;
    readonly publish?: unknown;
    readonly license?: unknown;
  };
}

/**
 * A crate engages consumers unless it opts out with `publish = false` or an
 * empty registry list, the two forms cargo honours. Vendored third-party trees
 * are out of scope: LICENSING.md ("Third-party material") keeps their upstream
 * licence, and Libre AI does not publish them.
 */
export function classifyCargoManifest(
  manifestPath: string,
  manifest: CargoManifest,
  workspaceLicense: string | null,
): Classification {
  if (manifestPath.startsWith("third_party/")) {
    return { kind: "excluded", reason: "vendored third-party material" };
  }
  const crate = manifest.package;
  if (crate === undefined) return { kind: "excluded", reason: "workspace manifest, no [package]" };
  const { publish } = crate;
  if (publish === false || (Array.isArray(publish) && publish.length === 0)) {
    return { kind: "excluded", reason: "publish disabled" };
  }

  let declared: string | null = null;
  if (typeof crate.license === "string") {
    declared = crate.license;
  } else if (
    crate.license !== null &&
    typeof crate.license === "object" &&
    (crate.license as { workspace?: unknown }).workspace === true
  ) {
    declared = workspaceLicense;
  }

  return {
    kind: "publishable",
    target: {
      manifestPath,
      directory: dirname(manifestPath),
      name: typeof crate.name === "string" ? crate.name : manifestPath,
      declared,
    },
  };
}

/**
 * Files a package answers for: everything under its directory that no nested
 * manifest owns. Nesting is resolved against every manifest, not only the
 * publishable ones, so a private package inside a published one is not
 * attributed to its parent.
 */
export function filesOwnedBy(
  directory: string,
  manifestDirectories: readonly string[],
  attributions: readonly SpdxFileAttribution[],
): SpdxFileAttribution[] {
  const prefix = directory === "." ? "" : `${directory}/`;
  const nested = manifestDirectories
    .filter((candidate) => candidate !== directory && `${candidate}/`.startsWith(prefix))
    .map((candidate) => `${candidate}/`);
  return attributions.filter(
    (file) => file.path.startsWith(prefix) && !nested.some((inner) => file.path.startsWith(inner)),
  );
}

export function evaluateTarget(
  target: PublishableTarget,
  ownedFiles: readonly SpdxFileAttribution[],
): Verdict {
  if (target.declared === null) {
    return { state: "indeterminate", reason: "manifest declares no licence" };
  }
  const declaredIdentifiers = parseDeclaredExpression(target.declared);
  if (declaredIdentifiers === null) {
    return {
      state: "indeterminate",
      reason: `declared expression "${target.declared}" is not modelled by this gate`,
    };
  }

  const editorialSkipped = ownedFiles.filter((file) =>
    isEditorialProse(file.path, file.licenses),
  ).length;
  const compared = ownedFiles.filter((file) => !isEditorialProse(file.path, file.licenses));

  if (compared.length === 0) {
    return {
      state: "indeterminate",
      reason: "no attributed software file — REUSE resolved nothing to compare",
    };
  }

  const divergences = compared
    .filter((file) => !sameLicenseSet(file.licenses, declaredIdentifiers))
    .map((file) => ({
      path: file.path,
      effective: file.licenses.length > 0 ? file.licenses.join(" OR ") : "no licence resolved",
    }));

  if (divergences.length > 0) {
    return { state: "divergent", compared: compared.length, editorialSkipped, divergences };
  }
  return { state: "conforming", compared: compared.length, editorialSkipped };
}

export function evaluateTargets(
  targets: readonly PublishableTarget[],
  manifestDirectories: readonly string[],
  attributions: readonly SpdxFileAttribution[],
): PackageReport[] {
  return targets.map((target) => ({
    target,
    verdict: evaluateTarget(
      target,
      filesOwnedBy(target.directory, manifestDirectories, attributions),
    ),
  }));
}

if (import.meta.main) {
  const root = execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim();
  const tracked = execSync("git ls-files", { encoding: "utf8", cwd: root, maxBuffer: 1 << 28 })
    .split("\n")
    .filter(Boolean);

  const bunManifests = tracked.filter(
    (path) => path === "package.json" || path.endsWith("/package.json"),
  );
  const cargoManifests = tracked.filter(
    (path) => path === "Cargo.toml" || path.endsWith("/Cargo.toml"),
  );
  const manifestDirectories = [...bunManifests, ...cargoManifests].map((path) => dirname(path));

  const workspaceLicense = await (async (): Promise<string | null> => {
    try {
      const rootCargo = Bun.TOML.parse(await Bun.file(`${root}/Cargo.toml`).text()) as {
        workspace?: { package?: { license?: unknown } };
      };
      const value = rootCargo.workspace?.package?.license;
      return typeof value === "string" ? value : null;
    } catch {
      return null;
    }
  })();

  const targets: PublishableTarget[] = [];
  const excluded: { path: string; reason: string }[] = [];
  const unreadable: string[] = [];

  for (const path of bunManifests) {
    let manifest: BunManifest;
    try {
      manifest = (await Bun.file(`${root}/${path}`).json()) as BunManifest;
    } catch {
      unreadable.push(path);
      continue;
    }
    const classification = classifyBunManifest(path, manifest);
    if (classification.kind === "publishable") targets.push(classification.target);
    else excluded.push({ path, reason: classification.reason });
  }

  for (const path of cargoManifests) {
    let manifest: CargoManifest;
    try {
      manifest = Bun.TOML.parse(await Bun.file(`${root}/${path}`).text()) as CargoManifest;
    } catch {
      unreadable.push(path);
      continue;
    }
    const classification = classifyCargoManifest(path, manifest, workspaceLicense);
    if (classification.kind === "publishable") targets.push(classification.target);
    else excluded.push({ path, reason: classification.reason });
  }

  // The effective licence comes from REUSE, never from a re-reading of
  // REUSE.toml here: re-implementing its precedence rules would reproduce the
  // very drift this gate exists to catch.
  let document: string;
  try {
    const spdx = Bun.spawnSync(["reuse", "spdx"], { cwd: root, stdout: "pipe", stderr: "pipe" });
    if (spdx.exitCode !== 0) {
      console.error("Declared-vs-effective licence gate: CANNOT SEARCH");
      console.error(`  \`reuse spdx\` exited ${spdx.exitCode}`);
      console.error(`  ${spdx.stderr.toString().trim()}`);
      process.exit(1);
    }
    document = spdx.stdout.toString();
  } catch (error) {
    console.error("Declared-vs-effective licence gate: CANNOT SEARCH");
    console.error(`  \`reuse spdx\` could not be run: ${(error as Error).message}`);
    console.error(
      "  install the pinned toolchain: pip install -r tools/licensing/requirements.txt",
    );
    process.exit(1);
  }

  const attributions = parseSpdxDocument(document);
  if (attributions.length === 0) {
    console.error("Declared-vs-effective licence gate: CANNOT SEARCH");
    console.error("  `reuse spdx` produced no file attribution — nothing could be compared");
    process.exit(1);
  }

  const reports = evaluateTargets(targets, manifestDirectories, attributions);

  console.log("Declared-vs-effective licence gate");
  console.log(
    `  manifests discovered: ${bunManifests.length} package.json, ${cargoManifests.length} Cargo.toml`,
  );
  console.log(`  SPDX file attributions parsed: ${attributions.length}`);
  console.log(`  examined ${targets.length} publishable package(s):`);
  for (const { target, verdict } of reports) {
    if (verdict.state === "conforming") {
      const editorial =
        verdict.editorialSkipped > 0
          ? `, ${verdict.editorialSkipped} editorial ${EDITORIAL_LICENSE} file(s) skipped`
          : "";
      console.log(
        `    OK          ${target.name} — ${target.declared} over ${verdict.compared} file(s)${editorial}`,
      );
    } else if (verdict.state === "divergent") {
      console.log(`    DIVERGENT   ${target.name} — declares ${target.declared}`);
    } else {
      console.log(`    UNDECIDABLE ${target.name} — ${verdict.reason}`);
    }
  }
  for (const entry of excluded) console.log(`  excluded ${entry.path}: ${entry.reason}`);

  const failures: string[] = [];
  // Zero manifests discovered means the gate lost its inputs (wrong cwd, broken
  // scan) and cannot prove anything. Zero PUBLISHABLE packages while private
  // manifests were discovered and classified is the legitimate state of an
  // authority repository (ADR-0020): there is simply nothing to prove here.
  if (targets.length === 0 && bunManifests.length === 0 && cargoManifests.length === 0) {
    failures.push(
      "examined 0 publishable packages — the gate lost its inputs and cannot prove anything",
    );
  }
  for (const path of unreadable) failures.push(`unreadable manifest, cannot classify: ${path}`);
  for (const { target, verdict } of reports) {
    if (verdict.state === "divergent") {
      for (const divergence of verdict.divergences) {
        failures.push(
          `${target.name} declares ${target.declared} but REUSE attributes ${divergence.effective} to ${divergence.path}`,
        );
      }
    } else if (verdict.state === "indeterminate") {
      failures.push(`${target.name} (${target.manifestPath}): ${verdict.reason}`);
    }
  }

  if (failures.length > 0) {
    console.error(`\n${failures.length} licence-claim failure(s):`);
    for (const failure of failures) console.error(`  - ${failure}`);
    console.error(
      "\nREUSE is authoritative (LICENSING.md, machine-readable precedence): correct the manifest,",
    );
    console.error("or change the grant in REUSE.toml if the permissive claim is the intended one.");
    process.exit(1);
  }

  console.log("\nEvery publishable manifest restates the licence REUSE resolves for its files.");
}
