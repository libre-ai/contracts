import { isBunVersionAtLeast } from "./bun-version";

interface PackageManifest {
  name?: string;
  packageManager?: string;
  engines?: { bun?: string };
  scripts?: Record<string, string>;
}

interface BunToolchainPolicy {
  minimumVersion: string;
  version: string;
  revision: string;
}

const policy = (await Bun.file("toolchains/bun.json").json()) as BunToolchainPolicy;
const expectedEngine = `>=${policy.minimumVersion}`;
const selectedPackageManager = `bun@${policy.revision.split("+")[0]}`;
const root = (await Bun.file("package.json").json()) as PackageManifest;
const failures: string[] = [];

if (!isBunVersionAtLeast(policy.version, policy.minimumVersion)) {
  failures.push("toolchains/bun.json: selected version is below the minimum");
}
if (root.packageManager !== selectedPackageManager) {
  failures.push(`package.json: packageManager must be ${selectedPackageManager}`);
}
if (root.engines?.bun !== expectedEngine) {
  failures.push(`package.json: engines.bun must be ${expectedEngine}`);
}
if (root.scripts?.["check:bun:runtime"] !== "bun tools/quality/check-bun-minimum.ts") {
  failures.push("package.json: check:bun:runtime must verify the active Bun process");
}
if (
  root.scripts?.["check:bun"] !==
  "bun run check:bun:runtime && bun tools/quality/check-bun-manifests.ts"
) {
  failures.push("package.json: check:bun must verify runtime and workspace manifests");
}
if (!root.scripts?.["check:toolchain"]?.startsWith("bun run check:bun && ")) {
  failures.push("package.json: check:toolchain must enforce the Bun floor first");
}
for (const script of ["build", "check"]) {
  if (!root.scripts?.[script]?.startsWith("bun run check:bun && ")) {
    failures.push(`package.json: ${script} must enforce the Bun floor first`);
  }
}
if (root.scripts?.pretest !== "bun run check:bun") {
  failures.push("package.json: pretest must enforce the Bun floor");
}
for (const [name, command] of Object.entries(root.scripts ?? {})) {
  if (
    name.startsWith("pre") ||
    ["check:bun:runtime", "check:bun", "check:toolchain", "build", "check", "test"].includes(name)
  ) {
    continue;
  }
  if (!command.startsWith("bun run check:bun:runtime && ")) {
    failures.push(`package.json: ${name} must enforce the Bun floor first`);
  }
}

const manifestPaths = new Set<string>();
for (const pattern of [
  "apps/*/package.json",
  "packages/*/package.json",
  "distribution/templates/*/package.json",
]) {
  const glob = new Bun.Glob(pattern);
  for await (const path of glob.scan({ cwd: ".", onlyFiles: true })) manifestPaths.add(path);
}

for (const path of [...manifestPaths].sort()) {
  const manifest = (await Bun.file(path).json()) as PackageManifest;
  const template = path.startsWith("distribution/templates/");
  const expectedCheck = template
    ? "bun scripts/check-bun-version.ts"
    : "bun ../../tools/quality/check-bun-minimum.ts";

  if (manifest.engines?.bun !== expectedEngine) {
    failures.push(`${path}: engines.bun must be ${expectedEngine}`);
  }
  if (template && manifest.packageManager !== selectedPackageManager) {
    failures.push(`${path}: packageManager must be ${selectedPackageManager}`);
  }
  if (manifest.scripts?.["check:bun"] !== expectedCheck) {
    failures.push(`${path}: check:bun must be ${expectedCheck}`);
  }
  if (template) {
    const guardSource = await Bun.file(
      path.replace(/package\.json$/, "scripts/check-bun-version.ts"),
    ).text();
    if (!guardSource.includes(`const MINIMUM_BUN_VERSION = "${policy.minimumVersion}";`)) {
      failures.push(`${path}: standalone Bun guard must match ${expectedEngine}`);
    }
  }
  for (const script of Object.keys(manifest.scripts ?? {})) {
    if (script === "check:bun" || script.startsWith("pre")) continue;
    if (manifest.scripts?.[`pre${script}`] !== "bun run check:bun") {
      failures.push(`${path}: pre${script} must enforce the Bun floor`);
    }
  }
}

if (manifestPaths.size === 0) failures.push("No Bun package or template manifests found");

if (failures.length > 0) {
  for (const failure of failures) console.error(failure);
  process.exit(1);
}

console.log(
  `Bun manifests verified: root + ${manifestPaths.size} package/template manifests require ${expectedEngine}`,
);
