# API Stability & Semver Policy

**Scope:** Public contract for consumers of published `@libre-ai/*` bricks (wave 1: `@libre-ai/contracts`, `@libre-ai/ui`, `@libre-ai/auth-web`, `@libre-ai/web-platform`).

**Last updated:** 2026-07-22 · **Status:** Locked for publication (wave 1).

---

## Linked Versioning

The four wave-1 satellites share one semantic version: `0.1.0`. All version bumps are coordinated across the set—no individual satellite drifts. The bump applies to the dependency order:

1. `@libre-ai/contracts` (SDK, zero runtime deps)
2. `@libre-ai/web-platform` (foundation)
3. `@libre-ai/ui` (layer 4 components, depends on React peer)
4. `@libre-ai/auth-web` (composition, depends on contracts + web-platform)

Bumping the set: `bun tools/release/bump-version.ts patch|minor|major|x.y.z`. The `publish-preflight` gate verifies version coherence before any publish.

---

## Public vs. Internal Surface

**Public API:** Exports from the package root index only. E.g.:

- `@libre-ai/contracts`: `{ JsonSchemaContractRegistry, loadCanonicalContractRegistry, evaluateAgentReviewQuorum, … }`
- `@libre-ai/ui`: Default export (component primitives) + named exports
- `@libre-ai/auth-web`: Default export + named authentication/session APIs
- `@libre-ai/web-platform`: SSR + hydration helpers, `secureResponse` hardening

**Internal (unsupported deep imports):** All other paths, including:

- `@libre-ai/contracts/generated/*` (schema validators, type codegen—consumed internally; changes without notice)
- `@libre-ai/ui/styles.css`, `@libre-ai/ui/tailwind` (theme tokens; reserved for future UX policy)
- `@libre-ai/web-platform/client` (client-side initialization; private interface)

Consumers relying on internal paths accept zero stability guarantees and inherit full risk of breakage on every release.

---

## Semver Semantics

**MAJOR** (0 → 1): Any breaking change in public-API shape (removed export, renamed function, changed parameter signature, different return type), or peer-dep range contraction (e.g. React 18+ required where 17 was supported). Includes major version bumps of critical dependencies (`react@18` → `react@19`).

**MINOR** (0.1 → 0.2): New public exports, new optional parameters, new peer-dep ranges (e.g. support for React 19 _in addition_ to 18), or new experimental stability tier (see below).

**PATCH** (0.1.0 → 0.1.1): Bug fixes, documentation, internal refactors, schema validation improvements (same envelope, tighter rules).

---

## Breaking Changes & Deprecation

**Notice period:** Minimum one MINOR release before removing a public export or changing its signature. Deprecation is signaled inline:

```typescript
/**
 * @deprecated Use `newName()` instead. Will be removed in 0.3.0.
 */
export function oldName() { … }
```

**Migration guidance:** Every breaking change includes an example in the release notes showing the old vs. new pattern.

**Stability tiers:**

- **Experimental**: Subject to breaking change without notice. Marked with `@experimental` JSDoc tag or released in a preview branch.
- **Stable**: Covered by the semver contract above (one MINOR deprecation window before removal).
- **Deprecated**: Publicly marked; one MINOR window before removal.

Tier transitions:

- Experimental → Stable: Promoted in a MINOR release; no prior deprecation window required.
- Stable → Deprecated: MINOR release announcing the exit window.
- Deprecated → Removed: MAJOR release.

---

## Support Matrix

| Platform      | Minimum | Notes                                                                     |
| ------------- | ------- | ------------------------------------------------------------------------- |
| **Bun**       | 1.4.0   | Required for all. Tested against `>=1.4.0`; no backport to Node/Deno.     |
| **React**     | 18.0.0  | Peer for `@libre-ai/ui`, `@libre-ai/web-platform`. Optional in contracts. |
| **React-DOM** | 18.0.0  | Peer for `@libre-ai/ui`, `@libre-ai/web-platform`.                        |
| **Tailwind**  | 3.x     | Optional peer for `@libre-ai/ui`; unstyled components work without it.    |

**Sovereignty stance:** All bricks work offline (no runtime phone-home). No telemetry, no CDN fetches. Bun-first TS source shipping (no build step required for consumers).

---

## CI Enforcement (Proposal)

An API-report diffing gate (post-publication):

- On each PR: Collect public exports from the package index via static analysis.
- Diff against the previous release: new exports = OK, removed = FAIL (requires version bump decision), renamed = FAIL, signature-changed = FAIL.
- Auto-comment on the PR with the proposed version bump (patch/minor/major).

**Not implemented here.** Reference: `tools/release/` for the linked-version model; `tools/quality/` for available gates. A follow-up work package (e.g. `WP-G2-W02`) will wire this as a CI pre-merge gate.

---

## Ownership & Evolution

Changes to this policy require an ADR. The policy itself is versioned: breaking changes to _this document_ (e.g., new mandatory peer-dep across all satellites) bump to a new MAJOR version across the set. Clarifications and new tiers (e.g., `Locked` for production-grade APIs) can be added in MINOR releases.

For questions on API surface stability, refer to `docs/decisions/LEXICON.md` (§7, satellites) for naming conventions and `WAVE1-PUBLICATION-RUNBOOK.md` for publication sequencing.
