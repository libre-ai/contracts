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

## Review target

The immutable authoring commit SHA, changed-file inventory, digest reproduction results and
role-specific verdicts are recorded here after the candidate authority set is complete. Until
then this dossier is an explicit review queue, not review evidence and not a lock decision.

## Promotion boundary

Promotion to `locked` is a separate Specification Lock owner act after all review findings are
closed. This implementation phase stops before that gate.
