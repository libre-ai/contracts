import { describe, expect, test } from "bun:test";

import { DOCTRINE_ANCHOR, protocolAuthorityAnchors } from "./protocol-authority";

const index = `schema_version: libre-ai.repositories.v1
repositories:
  - repository: libre-ai/feed-radar
    canonical_paths:
      - apps/radar
  - repository: libre-ai/notebook
    canonical_paths:
      - apps/notebook
      - crates/notebook-core
  - repository: libre-ai/policy
    canonical_paths:
      - apps/model-policy
      - crates/policy-core
  - repository: libre-ai/spec-studio
    canonical_paths:
      - apps/specifications
  - repository: libre-ai/website
    canonical_paths:
      - docs/apps/website.md
  - repository: libre-ai/envelope
`;

describe("protocolAuthorityAnchors", () => {
  test("maps an application slug to the repository that owns it", () => {
    const anchors = protocolAuthorityAnchors(index);
    // The slug is the contract filename stem, not the repository name: the
    // dismantling renamed several homes (radar → feed-radar, specifications →
    // spec-studio, model-policy → policy) and the contracts keep the slug.
    expect(anchors.get("radar")).toBe("libre-ai/feed-radar");
    expect(anchors.get("specifications")).toBe("libre-ai/spec-studio");
    expect(anchors.get("model-policy")).toBe("libre-ai/policy");
  });

  test("accepts a canonical path that already names the document", () => {
    expect(protocolAuthorityAnchors(index).get("website")).toBe("libre-ai/website");
  });

  test("ignores canonical paths that are not applications", () => {
    const anchors = protocolAuthorityAnchors(index);
    expect(anchors.has("notebook-core")).toBe(false);
    expect(anchors.has("policy-core")).toBe(false);
    expect(anchors.get("notebook")).toBe("libre-ai/notebook");
  });

  test("a repository without canonical paths contributes nothing", () => {
    expect([...protocolAuthorityAnchors(index).values()]).not.toContain("libre-ai/envelope");
  });

  test("the doctrine anchor is governance, never the archived hub", () => {
    expect(DOCTRINE_ANCHOR).toBe("libre-ai/governance");
    expect(DOCTRINE_ANCHOR).not.toBe("libre-ai/libre-ai");
  });

  test("two repositories claiming the same application is refused, not resolved last-wins", () => {
    // Silently keeping the last writer would let an index entry redirect the
    // protocol authority of a contract owned by another repository.
    const ambiguous = `repositories:
  - repository: libre-ai/feed-radar
    canonical_paths:
      - apps/radar
  - repository: libre-ai/evil
    canonical_paths:
      - apps/radar
`;
    expect(() => protocolAuthorityAnchors(ambiguous)).toThrow(/radar/);
  });

  test("an index schema this module was not written against is named, not silently empty", () => {
    expect(() => protocolAuthorityAnchors("schema_version: libre-ai.repositories.v9\n")).toThrow(
      /v9/,
    );
  });
});
