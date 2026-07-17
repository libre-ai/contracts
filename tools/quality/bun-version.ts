export interface BunSemanticVersion {
  major: number;
  minor: number;
  patch: number;
}

const BUN_VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

export function parseBunVersion(value: string): BunSemanticVersion | null {
  const match = BUN_VERSION_PATTERN.exec(value);
  if (!match) return null;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  if (![major, minor, patch].every(Number.isSafeInteger)) return null;
  return { major, minor, patch };
}

export function compareBunVersions(left: BunSemanticVersion, right: BunSemanticVersion): number {
  if (left.major !== right.major) return left.major < right.major ? -1 : 1;
  if (left.minor !== right.minor) return left.minor < right.minor ? -1 : 1;
  if (left.patch !== right.patch) return left.patch < right.patch ? -1 : 1;
  return 0;
}

/** Bun 1.4 prereleases qualify for the 1.4 runtime line; build metadata is ignored. */
export function isBunVersionAtLeast(actual: string, minimum: string): boolean {
  const actualVersion = parseBunVersion(actual);
  const minimumVersion = parseBunVersion(minimum);
  return (
    actualVersion !== null &&
    minimumVersion !== null &&
    compareBunVersions(actualVersion, minimumVersion) >= 0
  );
}
