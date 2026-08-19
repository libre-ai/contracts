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
file does not exist anywhere in this repository as of this candidate — the same gap flagged by
`docs/reviews/boussole-v3-numeric-polarity-omission-review.md`. The independent review passes
below are therefore blocked on a protocol document that has yet to be written, in addition to
being blocked on finding genuinely independent reviewers/roles for a solo-maintained repository.
Flagging both blockers here rather than inventing either the protocol document or a fictitious
review.

## Review passes required before promotion to `locked`

| Role         | Scope                                                                                                                                                                                                                                    | Status  |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| architecture | Whether narrowing `verifyOsPeer` from `const: true` to `{ "type": "boolean" }` and dropping it from `required` is the correct successor shape given no `harness-profile.v1` producer was ever released (`COMPATIBILITY.md` "Pre-implementation candidates"), and whether the runtime refusal semantics documented above belong in this dossier versus a normative document consumers can cite programmatically. | pending |
| security     | Whether an optional, unconstrained boolean is sufficient to prevent a resolving engine from silently downgrading OS-peer verification when a profile actually requests it — i.e., whether "refuse at resolution when untenable" is enforceable purely as documented semantics, or needs a machine-checkable companion (attestation field, golden vector) before this candidate can lock. | pending |

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
