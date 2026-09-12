// Explicit local conformance recipe; never a deployed issuer or token service.
import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import vectors from "../../contracts/fixtures/build-brief-v2/policy-vectors.json";

async function main(): Promise<void> {
  const [binary, pin] = process.argv.slice(2);
  if (
    !binary ||
    !isAbsolute(binary) ||
    !pin ||
    !/^[a-f0-9]{64}$/.test(pin) ||
    createHash("sha256")
      .update(await readFile(binary))
      .digest("hex") !== pin
  )
    throw new Error("brief-biscuit.binary-pin-invalid");
  const version = Bun.spawnSync([binary, "--version"], { stdout: "pipe", stderr: "pipe" });
  if (version.exitCode !== 0 || version.stdout.toString().trim() !== "biscuit-cli 0.6.0")
    throw new Error("brief-biscuit.version-invalid");
  const policy = await readFile(
    new URL("../../contracts/authz/build-brief-v2.datalog", import.meta.url),
    "utf8",
  );
  if (createHash("sha256").update(policy).digest("hex") !== vectors.policyDigest)
    throw new Error("brief-biscuit.policy-drift");
  const directory = await mkdtemp(join(tmpdir(), "brief-policy-"));
  function run(args: string[]): { code: number; output: Buffer } {
    const result = Bun.spawnSync([binary as string, ...args], {
      stdout: "pipe",
      stderr: "pipe",
      timeout: 10000,
    });
    return { code: result.exitCode, output: result.stdout };
  }
  try {
    const keyPath = join(directory, "private-key");
    await writeFile(keyPath, randomBytes(32), { mode: 0o600 });
    const publicResult = run([
      "keypair",
      "--from-file",
      keyPath,
      "--from-format",
      "raw",
      "--from-algorithm",
      "ed25519",
      "--only-public-key",
    ]);
    if (publicResult.code !== 0) throw new Error("brief-biscuit.key-generation-failed");
    const publicPath = join(directory, "public-key");
    await writeFile(publicPath, publicResult.output, { mode: 0o600 });
    for (const vector of vectors.cases) {
      const mutation = "mutation" in vector ? (vector.mutation ?? "") : "";
      const role = mutation === "attenuation-escalation" ? "build-brief-author" : vector.role;
      const expires =
        mutation === "expired-token" ? "2026-09-12T00:00:00Z" : "2026-09-13T00:00:00Z";
      const authority = `user("fixture_user"); tenant("ten_1234567890abcdef"); role("fixture_user", "${role}"); brief_resource("fixture_resource", "${vector.resourceKind}"); membership_revision("fixture_user", 7); brief_subject("fixture_digest"); check if time($time), $time < ${expires};`;
      const authorityPath = join(directory, "authority.datalog");
      await writeFile(authorityPath, authority, { mode: 0o600 });
      const generated = run([
        "generate",
        "--private-key-file",
        keyPath,
        "--private-key-format",
        "raw",
        "--private-key-algorithm",
        "ed25519",
        authorityPath,
      ]);
      if (generated.code !== 0) throw new Error(`brief-biscuit.generate:${vector.id}`);
      const tokenPath = join(directory, "token");
      await writeFile(tokenPath, generated.output, { mode: 0o600 });
      if (mutation.startsWith("attenuation-")) {
        const block =
          mutation === "attenuation-escalation"
            ? 'role("fixture_user", "build-brief-approver");'
            : mutation === "attenuation-context"
              ? 'current_member("fixture_user", "ten_1234567890abcdef", 7);'
              : 'check if operation("read");';
        const attenuated = run(["attenuate", tokenPath, "--block", block]);
        if (attenuated.code !== 0) throw new Error(`brief-biscuit.attenuate:${vector.id}`);
        await writeFile(tokenPath, attenuated.output, { mode: 0o600 });
      }
      const organization =
        mutation === "cross-organization" ? "ten_ffffffffffffffff" : "ten_1234567890abcdef";
      const resource = mutation === "other-resource" ? "different_resource" : "fixture_resource";
      const revision = mutation === "stale-membership" ? 8 : 7;
      const membership = ["missing-membership", "attenuation-context"].includes(mutation)
        ? ""
        : `current_member("fixture_user", "${organization}", ${revision});`;
      const ownership =
        mutation === "missing-ownership" ? "" : `resource_tenant("${organization}");`;
      const independent =
        mutation === "contributor" ? "" : 'non_contributor("fixture_user", "fixture_resource");';
      const digest = mutation === "subject-substitution" ? "other_digest" : "fixture_digest";
      const context = `time(2026-09-12T12:00:00Z); ${membership} resource("${resource}"); resource_kind("${vector.resourceKind}"); ${ownership} operation("${vector.operation}"); ${independent} resource_digest("${digest}");`;
      const authorizerPath = join(directory, "authorizer.datalog");
      await writeFile(authorizerPath, `${context}\n${policy}`, { mode: 0o600 });
      const result = run([
        "inspect",
        "--json",
        "--public-key-file",
        publicPath,
        "--authorize-with-file",
        authorizerPath,
        tokenPath,
      ]);
      const parsed = JSON.parse(result.output.toString()) as {
        signatures_check?: boolean;
        auth?: { result?: unknown };
      };
      const outcome = parsed.auth?.result;
      const allows = Array.isArray(outcome) && typeof outcome[0] === "number";
      const denied =
        typeof outcome === "object" &&
        outcome !== null &&
        "error" in outcome &&
        JSON.stringify(outcome).includes("Unauthorized");
      if (
        parsed.signatures_check !== true ||
        (vector.expected === "allow" ? result.code !== 0 || !allows : result.code !== 1 || !denied)
      )
        throw new Error(`brief-biscuit.verdict:${vector.id}`);
    }
    console.log(
      `Build Brief Biscuit vectors verified: ${vectors.cases.length}; biscuit-cli 0.6.0; binary SHA256 ${pin}; policy SHA256 ${vectors.policyDigest}.`,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    console.error(
      error instanceof Error && error.message.startsWith("brief-biscuit.")
        ? error.message
        : "brief-biscuit.failed",
    );
    process.exitCode = 1;
  }
}
