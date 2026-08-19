# Review dossier — Boussole v3 numeric, rational-form, polarity and omission contracts

- **Candidate contracts:** `public-vote-dataset-v3`, `boussole-method-v3`, `local-comparison-v3`
  (`contracts/schemas/public-vote-dataset.v3.schema.json`,
  `contracts/schemas/boussole-method.v3.schema.json`,
  `contracts/schemas/local-comparison.v3.schema.json`).
- **Status:** `pending-independent-agent-review` (catalog `review.state`), authored solo.
- **Required roles (catalog `review.required`):** architecture, security, methodology, privacy.
- **Owner-arbitration:** 2026-08-18 — the four decisions this candidate encodes (micros-integer
  numeric output with a six-decimal string twin, exact rational form
  `weightedNumerator`/`scaledDenominator`, required `polarity` per statement, closed
  `omissions` taxonomy replacing the scalar `omitted` count) were arbitrated by the repository
  owner on 2026-08-18, resolving `governance` ADR-0013 (option C+D), ADR-0014 (option B) and
  ADR-0015 (Q1-A, Q2-A) once those ADRs move from `deferred` to `accepted`.

## What this dossier is, and is not

This dossier satisfies the catalog's mechanical requirement that a `candidate` entry name a
dossier under `docs/reviews/` referencing the independent agent review protocol
(`contracts/COMPATIBILITY.md` "Evidence"; `contracts/CATALOG.md`; `contracts/README.md`). It is
**not** a completed review. Authoring and review are required to be separate passes
(`COMPATIBILITY.md`), and this candidate was produced by a single agent session with no
independent second pass of any of the four required roles.

**Gap found while authoring this candidate, not fixed by it:** `contracts/CATALOG.md`,
`contracts/README.md` and `contracts/COMPATIBILITY.md` all point to
`docs/reviews/AGENT-REVIEW-PROTOCOL.md` as the process the review passes below must follow. That
file does not exist anywhere in this repository as of this candidate (`docs/reviews/` itself did
not exist before this dossier). No prior `candidate`-status contract in this repository's history
established the protocol document either — every other cataloged contract is `locked`. The
independent review passes below are therefore blocked on a protocol document that has yet to be
written, in addition to being blocked on finding genuinely independent reviewers/roles for a
solo-maintained repository. Flagging both blockers here rather than inventing either the protocol
document or a fictitious review.

## Review passes required before promotion to `locked`

| Role         | Scope                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Status  |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| architecture | Cross-contract coordination: the three schemas move together (shared digests, shared `computedAt`/version-const discipline); WIT world `boussole-scoring-v2` still declares `local-comparison.v2`/`boussole-method.v2`/`public-vote-dataset.v2` in its `compare()` doc comment and has no v3 counterpart in this candidate (out of the arbitrated scope for this pull request — flagged as a follow-up, see below).                                                                                                                   | pending |
| security     | `not: "-0.000000"` and the closed `omissionReason`/`polarity` enums are the load-bearing anti-ambiguity constraints; strict-Ajv compilation and array-bound checks pass locally (`bun run check:contracts`), but no adversarial fixture pass beyond the added positive/negative pair has been run.                                                                                                                                                                                                                                    | pending |
| methodology  | The `omissions` reason taxonomy (`explicit-skip`, `abstention`, `vote-data-unavailable`, `representative-absent`) is this session's operationalization of the four categories named in the 2026-08-18 owner arbitration and of ADR-0015 §"Vocabulaire d'omission"; it has not been checked against the actual scoring engine's per-statement omission logic (no Rust/WASM scoring implementation exists yet — see `libre-ai/boussole-politique` `docs/apps/boussole.md` "Runtime boundaries": "this amendment implements no engine"). | pending |
| privacy      | `polarity` and `omissions` add no new personal or identifying data (statement-scoped, aggregate-only, same `personTargeting: prohibited` boundary as v2); this reading has not been independently checked.                                                                                                                                                                                                                                                                                                                            | pending |

## Known follow-up outside this pull request's scope

The `boussole-scoring-v2` WIT world (`contracts/wit/boussole-scoring-v2/world.wit`,
`SEMANTICS.md`) still names the v2 majors of these three schemas in its normative comment and in
`contracts/fixtures/boussole-scoring-v2/golden-vectors.v1.json`/`security-vectors.v1.json`. ADR-0013 and
ADR-0014's own cost tables count a `boussole-scoring-v3` WIT major as part of options C and B
respectively. That WIT/SEMANTICS/golden-vector major bump was not requested for this pull request
and is not included here; `local-comparison.v3` therefore describes a wire format no producer
emits yet, which is the same pre-implementation-candidate posture v2 itself was in
(`contracts/COMPATIBILITY.md` "Pre-implementation candidates" — v2 had no producer either, per
`docs/apps/boussole.md`).
