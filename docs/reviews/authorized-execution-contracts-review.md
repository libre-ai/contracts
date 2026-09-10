# Review dossier — Authorized execution contracts

- **Candidates:** `execution-graph-v1`, `execution-plan-body-v2`,
  `execution-transfer-v1`, `execution-authorization-v2`,
  `human-decision-request-v1`, `human-decision-response-v1`,
  `step-invocation-v1`, `effect-attestation-v1`, `orchestrator-event-v3`,
  `retention-policy-schema-v2` and `retention-policy-v2`.
- **Status:** `pending-independent-agent-review`; authored as one protocol family.
- **Required roles:** architecture, security and privacy.
- **Owner decision:** Governance ADR-0034 / D40 authorizes candidate contract design only.
  It does not authorize runtime adoption or promotion to `locked`.

## Binding review protocol

Review follows Governance
[`AGENT-REVIEW-PROTOCOL.md`](https://github.com/libre-ai/governance/blob/main/docs/reviews/AGENT-REVIEW-PROTOCOL.md):
role-scoped review-only passes run against one immutable authoring commit. The same session may
perform serial passes, but authoring and review contexts remain separate. Findings are remediated
in a new authoring commit and all affected roles re-review the new immutable commit.

## Authority and security invariants

- Contracts own every wire shape, preimage and closed outcome. SDKs are disposable projections;
  no runtime repository is changed by this candidate.
- LangGraph remains a research and failure-scenario oracle. It is neither a dependency nor an
  implicit specification.
- Organization, lineage, generation, causal digest, one-shot decision and effect identities are
  explicit and bounded. Reuse with divergent content quarantines instead of overwriting.
- Raw prompts, tool arguments, destinations, observations, human comments and personal data are
  excluded from execution records and operational errors; only classified artifact references
  may carry such content.
- Existing retention v1 rules remain byte-intact. The v2 candidate adds only the content-free
  execution record and deletion tombstone classes authorized by the design.

## Immutable reviewed set

The three specialized passes below reviewed one clean, immutable cross-repository set on
2026-09-10:

- Governance design and plan: commit `388b89bdba89c80a39b560b3284d8984101813ce`;
- Contracts authority: commit `cb865613039c78e344bcbb51f4dbdfd469f634b9`, contracts tree
  `8015ead233c805a30f2bb1e74c5feedaaafdb7ce`, quality-checker tree
  `f9fc981cba086f175a5b2b68f25f49b141690522`;
- TypeScript projection: commit `1c5f26076f622a7a3d129b87465bfa6905df0d70`, tree
  `eca20d1018215aae94a6c4a7530a0c2a5cf0e092`;
- Rust projection: commit `9c1201eb0f1f40bd45df637f053be98846070bc4`, tree
  `a7dce082b9c0689db92cea915f05ec7bcd5ab683`.

Both SDK manifests pin the complete Contracts SHA above. Their ten authorized-execution schema
copies are byte-identical to the authority. The TypeScript projection also synchronizes five
other schemas introduced between its previous pin and this authority SHA; those files are a
mechanical consequence of the repository-wide byte-drift gate, not new authority in this dossier.

### Authority and vector SHA-256 inventory

| Artifact | SHA-256 |
| --- | --- |
| Governance design | `5f8fad83047dda568d1c9bb3ddd4aaf0e0020a4b89f949e608c1f87cb5c54983` |
| Governance implementation plan | `3f8a2e9a9ab9df3a696b3c01ef5f7e47288b5793bf8f0d2e545c14d012616663` |
| `effect-attestation.v1` | `1cba4b8965543ee7e32af283d5769b95df010b79ef3c7a90d0bb8766d23a8952` |
| `execution-authorization.v2` | `37b6a7a63d0c9604f928a03758ca0f91cdba36f0cf1b2f2af06a969d1bc3d85a` |
| `execution-graph.v1` | `fb1abf6a75bfc4890e5c08acf43418dfc03719a85944d881baca7da7c3f153b6` |
| `execution-plan-body.v2` | `cbc47c01b2dd5a3bf01fc210ca087cb3c90dedaef4f84e0213df43609bc5791d` |
| `execution-transfer.v1` | `443ac48dbd9acb006d7d64f570ae41ce99493579289cab05b7085a23f3690b34` |
| `human-decision-request.v1` | `6afb4b776dc08d3af967eeb03e88ae3540ad056288012c3882d7fb1dd89f8c4e` |
| `human-decision-response.v1` | `3e6d854175bb4376c91e12ac9039560fa17f8adc1f91e35310fb895454104e6e` |
| `orchestrator-event.v3` | `df7b8bc07647a4e1d606c7420e3005290f58ecf95411720f36beb75b5e8d87ea` |
| `retention-policy.v2` schema | `1d6b10e39388451faf111ab96c1ab3085a2e3c3226bf469bdf27d3afa3a0208f` |
| `step-invocation.v1` | `7d2e0cf1331f9f45f0dfaaefe285186589b1471dcf16f39ad5121163f266a14c` |
| retention v2 authority data | `1622c32bf106160a524590db42bd0e8a0e7bbbadc2ee1bedd5dbb9bddef9db84` |
| nine RFC 8785 digest vectors | `02e1d78866a0841f8fdb958a7979fe5621452d07e251221cd90334c1c16c9c04` |
| semantic vectors | `d3a63edb3f146abe9061a3af0a9ae1bbb2d8d66f3d67fa34bbf7e859c0d0447e` |

## Remediation history before the final passes

The first authoring commit `3f406b668785b50d1ef78c624ff4782d91513d96` was not approved.
An architecture challenge found missing Graph/Plan binding semantics, an event effect-status
mismatch, incomplete one-shot transfer/decision replay scenarios and a self-declared human actor.
Commit `8b22a3dbe3970f2475590c6e76835badf1108b17` closed those findings, added strict UTC/expiry and
old-run checks, and bound the positive Graph and Plan fixtures in CI. Rust projection then exposed
a recursive Typify name collision in `orchestrator-event.v3`; commit
`cb865613039c78e344bcbb51f4dbdfd469f634b9` replaced that nullable reference with a bounded direct
wire shape. Every earlier informal verdict was treated as stale.

## Role-separated review passes

The harness exposes the reviewing agent as `Codex / root`; it does not expose a stable session,
provider or model identifier, so none is invented. Every pass was review-only, started and ended
with all three reviewed worktrees clean, and produced exactly one verdict.

### `authorized-execution-architecture-20260910-01`

- **Role / mode:** architecture / specialized catalog role.
- **Evidence:** `bun test tools/quality/authorized-execution.test.ts` (71/71), Contracts checker,
  TypeScript `generate:check` plus registry/digest tests (155/155), Rust schema drift gate plus
  schema/digest tests (6/6), exact schema `cmp`, exact pins, authority-addition inventory and
  unchanged-authority diff.
- **Findings:** Blocking 0; Major 0; Minor 0; non-blocking 0.
- **Residual risk:** runtime state-machine conformance is intentionally unproven in Phase 3; Phase
  4 must consume the semantic vectors independently before any product-engine enablement.
- **Verdict:** `approve`.

### `authorized-execution-security-20260910-01`

- **Role / mode:** security / specialized catalog role.
- **Evidence:** 71 semantic tests; explicit graph/organization/run/attempt/authorization
  substitution, collision, divergent replay, consumed generation, exact-expiry, fencing,
  two-emission, unknown-state and administrative-closure cases; nine digest reproductions in both
  SDKs; repository secret and personal-data scans.
- **Findings:** Blocking 0; Major 0; Minor 0; non-blocking 0.
- **Residual risk:** schemas and vectors define fail-closed behavior but do not make a future
  runtime atomic; the Phase 4 storage implementation must prove transaction serialization and
  executor-side idempotency without weakening these outcomes.
- **Verdict:** `approve`.

### `authorized-execution-privacy-20260910-01`

- **Role / mode:** privacy / specialized catalog role.
- **Evidence:** personal-data scans in all three repositories; tenant-private classification for
  all execution records; content-free references instead of prompts, comments, destinations or
  observations; exact semantic equality of the 15 inherited v1 retention rules; P1Y/P6Y mission
  alignment; exact P35D tombstone; tombstone-first restore tests in Contracts and both SDK schema
  suites.
- **Findings:** Blocking 0; Major 0; Minor 0; non-blocking 0.
- **Residual risk:** a future operational logger can still violate the contract by logging wire
  values; runtime log allow-list and deletion/restore integration tests remain mandatory before
  enablement.
- **Verdict:** `approve`.

These approvals satisfy the candidate's three catalog roles for the immutable authority SHA. The
catalog remains `candidate` with `pending-independent-agent-review` because that wire value is the
repository's pre-lock review state and is not changed by a dossier-only record. It must not be
interpreted as a Specification Lock.

## Promotion boundary

Promotion to `locked` is a separate Specification Lock owner act after all review findings are
closed. This implementation phase stops before that gate.
