export {};

interface BunToolchain {
  version: string;
  revision: string;
  sourceCommit: string;
  preRelease: boolean;
}

const expected = (await Bun.file("toolchains/bun.json").json()) as BunToolchain;
const revisionResult = Bun.spawnSync({
  cmd: [process.execPath, "--revision"],
  stdout: "pipe",
  stderr: "pipe",
});

if (revisionResult.exitCode !== 0) {
  throw new Error("Unable to read the Bun revision");
}

const actualVersion = Bun.version;
const actualRevision = revisionResult.stdout.toString().trim();
const failures: string[] = [];

if (actualVersion !== expected.version) {
  failures.push(`Bun version ${actualVersion} does not match ${expected.version}`);
}
if (actualRevision !== expected.revision) {
  failures.push(`Bun revision ${actualRevision} does not match ${expected.revision}`);
}
if (!actualRevision.includes(expected.sourceCommit.slice(0, 9))) {
  failures.push("Bun revision does not contain the pinned source commit");
}

if (failures.length > 0) {
  for (const failure of failures) console.error(failure);
  process.exit(1);
}

console.log(`Bun toolchain verified: ${actualRevision}`);
