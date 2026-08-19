# Review dossier — HarnessProfile v2 (`verifyOsPeer` becomes optional)

- **Candidate contract:** `harness-profile-v2`
  (`contracts/schemas/harness-profile.v2.schema.json`).
- **Status:** `pending-independent-agent-review` (catalog `review.state`), authored solo.
- **Required roles (catalog `review.required`):** architecture, security.
- **Owner-arbitration:** 2026-08-19 — `governance` ADR-0030. `harness-profile.v1` locked
  `workerTransport.verifyOsPeer` to `const: true`, but that control is inapplicable on the
  transport this layer actually uses: SO_PEERCRED has no meaning on an anonymous socketpair, so
  no implementation can satisfy the v1 const without either lying about the control or blocking
  on a transport change out of scope for this candidate. The owner resolved this by a major
  successor rather than a v1 patch, because `const: true` is a promise a v1-conformant producer
  cannot keep: `verifyOsPeer` moves out of `required` and its schema narrows from `const: true` to
  `{ "type": "boolean" }`. Nothing else in the schema changes.

## Runtime semantics (documented here, not encoded in the schema)

The schema alone cannot express "true is only accepted from engines that actually enforce
SO_PEERCRED" — JSON Schema has no way to make a boolean's validity depend on which engine is
resolving the profile. That constraint is runtime, not wire-format, and is recorded here as the
binding semantics for this contract:

- `verifyOsPeer: true` prescribes OS-peer verification. An engine that cannot honor it (no
  SO_PEERCRED-equivalent on its transport) MUST refuse to resolve the profile rather than resolve
  it and silently skip the check.
- `verifyOsPeer: false` or an absent field means the profile does not prescribe OS-peer
  verification; no engine is required to refuse on this basis.
- A profile that sets `verifyOsPeer: true` for a `workerTransport.kind` known not to support it is
  a producer error to be caught at resolution time, not a schema-level violation — this candidate
  does not attempt to encode the `kind` × `verifyOsPeer` compatibility matrix in JSON Schema
  (doing so would require a `kind`-conditional `allOf`/`if`/`then` the resolving engine still has
  to re-check at runtime against its actual capabilities, which are not knowable from the schema).

## What this dossier is, and is not

This dossier satisfies the catalog's mechanical requirement that a `candidate` entry name a
dossier under `docs/reviews/` referencing the independent agent review protocol
(`contracts/COMPATIBILITY.md` "Evidence"; `contracts/CATALOG.md`; `contracts/README.md`). It is
**not** a completed review. Authoring and review are required to be separate passes
(`COMPATIBILITY.md`), and this candidate was produced by a single agent session with no
independent second pass of either required role.

**Known repository gap, not fixed by this candidate:** `contracts/CATALOG.md`,
`contracts/README.md` and `contracts/COMPATIBILITY.md` all point to
`docs/reviews/AGENT-REVIEW-PROTOCOL.md` as the process the review passes below must follow. That
file does not exist in this repository as of this candidate — the same gap flagged by
`docs/reviews/boussole-v3-numeric-polarity-omission-review.md`. The protocol itself lives in the
`governance` authority (`docs/reviews/AGENT-REVIEW-PROTOCOL.md` there), which defines review
independence as **role separation and review-only passes on an immutable commit** — a second
human or a distinct agent identity is explicitly not an independence criterion. The passes below
follow that governance protocol; the missing local pointer file remains a documentation gap of
this repository, nothing more.

## Review passes — both required roles executed (2026-08-19)

Both passes ran review-only on the immutable authoring commit `cd59011`, per the governance
`AGENT-REVIEW-PROTOCOL.md` (authoring committed first, worktree clean, explicit role-scoped
review passes; the two roles ran on two distinct models).

| Role         | Scope                                                                                                                                                                                             | Verdict                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Record                                                 |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| architecture | Successor shape (no v1 producer released → consumers move directly, `COMPATIBILITY.md` "Pre-implementation candidates"); delta exactness; catalog entry mechanics; digest-vector reproducibility. | **accept** — diff v1→v2 verified to be exactly the four declared hunks; pure addition (515 insertions, 0 deletions), v1 schema/vector and the `harness-attestation` signature vector byte-intact; the v2 vector's `expectedDigest` (`6b521fdf…`) independently reproduced with the same method that reproduces the committed v1 digest (`b3e3198e…`).                                                                                                                                                                                                                                                                                                                              | orchestrator pass (model `claude-fable-5`), 2026-08-19 |
| security     | Whether the optional boolean weakens any REAL guarantee; adversarial validation of the schema; fixture/mutation correctness; self-reported gaps verified.                                         | **accept** — 11/11 adversarial Ajv cases behave as declared (omitted/`true`/`false` valid; wrong type rejected; unknown property rejected; `runBoundToken`/`hostLoopbackAllowed` const locks intact; a v2-shaped payload still rejected by v1); no delivered guarantee is weakened (v1's `const: true` was never enforceable by any released engine). One **major, non-blocking** finding, already self-flagged above: the schema cannot express `kind`-conditional validity, so "refuse at resolution when untenable" lives entirely in engine behaviour — to be resolved (attestation field or golden vector) **before promotion to `locked`**, not before this candidate merge. | subagent pass (model `claude-sonnet-4-8`), 2026-08-19  |

Promotion of this candidate to `locked` remains an owner act, gated on the major non-blocking
finding above and pronounced together with the WP-G3-H01 re-delivery hard stop it serves
(`governance` ADR-0030, `docs/reviews/wp-g3-h01/BOOTSTRAP-DOSSIER.md` § Round 4).

## Known follow-up outside this pull request's scope

`contracts/fixtures/agent-orchestration-v1/digest-vectors.v1.json` is not itself cataloged or
gated by `bun tools/quality/check-contracts.ts` (confirmed while authoring this candidate: no
catalog entry references it, and no checker in `tools/quality/` reads it). The `harness-profile-v2`
digest vector added alongside this candidate is reproducible with the same
`jq -S -cj '.' | shasum -a 256` method as the existing `harness-profile` (v1) vector, verified
against its committed `expectedDigest` before being applied to v2, but nothing in CI currently
re-derives either vector's digest automatically. Wiring a digest-reproduction check into
`check-contracts.ts` (or a sibling tool) for this fixture family is out of scope for this
candidate and not requested by it.
