import { isBunVersionAtLeast, parseBunVersion } from "./bun-version";

interface BunToolchainPolicy {
  minimumVersion: string;
}

const policy = (await Bun.file(
  new URL("../../toolchains/bun.json", import.meta.url),
).json()) as BunToolchainPolicy;

if (parseBunVersion(policy.minimumVersion) === null) {
  console.error("Bun minimum version policy is invalid");
  process.exit(1);
}

if (!isBunVersionAtLeast(Bun.version, policy.minimumVersion)) {
  console.error(
    `Bun ${Bun.version} is unsupported; Libre AI requires Bun >=${policy.minimumVersion}`,
  );
  process.exit(1);
}

console.log(`Bun minimum verified: ${Bun.version} >= ${policy.minimumVersion}`);
