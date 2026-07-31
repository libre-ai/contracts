/**
 * Where each OpenAPI contract's protocol authority document lives.
 *
 * Until milestone γ 3.5 every application document sat in the hub, so a single
 * anchor sufficed. The hub was archived on 2026-07-30 and its `docs/` tree left
 * with the second removal wave: that anchor now resolves to 404 for every
 * contract, and the whole protocol-authority check fails open-eyed but silent
 * until someone pushes. ADR-0020 names the replacement — each repository owns
 * its perimeter, and the ecosystem index says which application it owns.
 *
 * The index is read from the SHA-pinned `@libre-ai/governance` git dependency,
 * so this resolution is as deterministic as the pin itself.
 */

/** Doctrine documents stayed with the doctrine, not with a product. */
export const DOCTRINE_ANCHOR = "libre-ai/governance";

const APPLICATION_DIRECTORY = /^apps\/([a-z0-9][a-z0-9-]*)$/;
const APPLICATION_DOCUMENT = /^docs\/apps\/([a-z0-9][a-z0-9-]*)\.md$/;

interface RepositoryEntry {
  readonly repository?: unknown;
  readonly canonical_paths?: unknown;
}

/**
 * Application slug → repository owning its protocol authority document.
 *
 * The slug is the contract filename stem (`radar.v2.yaml` → `radar`), which the
 * dismantling deliberately kept stable while several repositories were renamed
 * around it — hence a derived map rather than a name-to-name convention.
 */
export function protocolAuthorityAnchors(indexYaml: string): ReadonlyMap<string, string> {
  const yaml = (Bun as unknown as { YAML: { parse(text: string): unknown } }).YAML;
  const document = yaml.parse(indexYaml) as { readonly repositories?: readonly RepositoryEntry[] };
  const anchors = new Map<string, string>();
  for (const entry of document.repositories ?? []) {
    const repository = entry.repository;
    if (typeof repository !== "string" || !Array.isArray(entry.canonical_paths)) continue;
    for (const path of entry.canonical_paths) {
      if (typeof path !== "string") continue;
      const slug = (APPLICATION_DIRECTORY.exec(path) ?? APPLICATION_DOCUMENT.exec(path))?.[1];
      if (slug !== undefined) anchors.set(slug, repository);
    }
  }
  return anchors;
}
