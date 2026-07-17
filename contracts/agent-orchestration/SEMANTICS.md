# Agent orchestration candidate semantics v1

- **Status:** candidate; no implementation or real mission is authorized.
- **RFC:** `docs/rfcs/0001-agent-orchestration-option-b.md`
- **Normative JSON:** the cataloged schemas under `contracts/schemas/`.

## Canonical JSON and digests

Every digest preimage uses RFC 8785 JSON Canonicalization Scheme (JCS), encoded as UTF-8 without BOM or trailing newline. SHA-256 output is 32 bytes rendered as 64 lowercase hexadecimal characters.

The following digest fields are excluded from their own preimage and every signature field is also excluded:

| Contract | Digest field | Excluded fields |
| --- | --- | --- |
| `ExecutionPlanBody v1` | `bodyDigest` | `bodyDigest` |
| `AgentContributorLineage v1` | `lineageDigest` | `lineageDigest`, `signature` |
| `AgentReview v1` | `preimageDigest` | `preimageDigest`, `signature` |
| `AgentReviewSessionAttestation v1` | `attestationDigest` | `attestationDigest`, `signature` |
| `AgentReviewQuorum v1` | `quorumDigest` | `quorumDigest` |
| `ExecutionAuthorization v1` | `authorizationDigest` | `authorizationDigest` |
| `OrchestratorEvent v2` | `eventDigest` | `eventDigest` |
| `HarnessProfile v1` | `profileDigest` | `profileDigest` |
| `HarnessAttestation v1` | `attestationDigest` | `attestationDigest`, `signature` |

An implementation must reject non-canonical input before computing a digest. It must not parse and silently reserialize a non-canonical payload into an accepted object.

## Signatures

Lineage, review-session, review and harness-attestation signatures use Ed25519. `signature` is the canonical Base64url encoding without padding of exactly 64 bytes, hence 86 characters.

The signed message is:

```text
UTF8(schemaVersion) || 0x00 || raw_32_bytes(digest)
```

`signingKeyId` selects a key from an approved harness key registry. Unknown, expired or revoked keys fail closed. Key-registry outage fails closed. Signature verification happens before quorum evaluation and emits no rejected value or signature bytes in logs.

## Contributor lineage

The harness constructs lineage only from its own signed observations of writes, hunks and corrections. A worker-provided contributor list has no authority.

For a result, every agent that authored, executed, fixed or edited any byte contributing to `subjectDigest` appears exactly once in `contributors`. The lineage `subjectDigest` must equal the reviewed subject digest. `contributorAgentIds` in each review is the sorted list of those `agentId` values and its `contributorLineage.digest` equals `lineageDigest`; any omission or divergence fails closed.

An empty contributor list is permitted only for a deterministically compiled execution plan whose input authorities and compiler manifest are present in `observations`. Missing or divergent observations fail closed.

## Review eligibility and blind review

A review is eligible only when all conditions hold:

1. tenant, mission, subject type and subject digest match the review request;
2. the reviewer identity and run are issued by the harness roster, not by the worker;
3. the contributor-lineage signature and completeness checks succeed against harness observations;
4. the signed review-session attestation proves trusted roster identity, read-only isolation, no shared mutable state and non-disclosure; every duplicated reviewer/pool/runtime/model/provider/profile field in the review is byte-identical to that attestation;
5. `reviewerAgentId` is absent from the contributor lineage;
6. the two quorum reviews have distinct reviewer agent IDs, distinct reviewer run IDs, distinct nonces and distinct signatures;
7. both reviews reference the same lineage digest and exact set of evidence digests;
8. `issuedAt <= evaluation time < expiresAt` and `issuedAt < expiresAt`;
9. nonce claim succeeds exactly once in the replay store and leaves a durable claim receipt; outage fails closed;
10. `blindReview` is `true` and the signed harness disclosure record proves that no sibling verdict or findings were available before irreversible submission;
11. signing key, signature and preimage digest verify;
12. verdict is `approve` and summary contains no `blocking` or `major` finding.

Any `reject`, invalid review or changed subject/evidence/lineage digest prevents quorum for that digest. A `plan-rejected` or result `rejected` projection carries the exact eligible signed rejection-review reference; rejection is never inferred from an empty review set. Remediation creates a new digest and requires two new reviews. A reviewer that modifies the subject becomes a contributor and is ineligible to review the new digest.

The threshold is two favorable reviews. High-risk policy may additionally require `reviewer-pool`, `runtime-family`, `model-family` or `provider` diversity. `diversityRequirements` must exactly match the requirements resolved by `policyDigest`, and both reviews must differ on every named dimension. The policy cannot reduce the threshold or permit self-review.

## Quorum state

`AgentReviewQuorum v1` contains exactly two full reviews. All duplicated tenant, mission, subject and lineage fields must be byte-identical across the quorum and both reviews. `reachedAt` is not earlier than either `issuedAt` and remains before both `expiresAt` values.

Missions computes `quorumDigest` only after all semantic checks pass. `ExecutionAuthorization` is a server-owned consequence of the accepted plan quorum, never a reviewer-callable API command. A JSON-Schema-valid document that fails any semantic check is refused with a closed reason code and cannot transition a mission.

## Mission transitions

The candidate v2 transition relation is closed:

| From | Allowed next states |
| --- | --- |
| `proposed` | `assessed`, `abandoned` |
| `assessed` | `plan-review`, `abandoned` |
| `plan-review` | `plan-rejected`, `authorized`, `abandoned` |
| `plan-rejected` | `plan-review` on a new digest, `abandoned` |
| `authorized` | `running`, `cancelled`, `abandoned` |
| `running` | `blocked`, `paused`, `cancelled`, `failed`, `result-submitted` |
| `blocked` | `running`, `paused`, `cancelled`, `failed` |
| `paused` | `running`, `cancelled`, `failed` |
| `result-submitted` | `result-review` |
| `result-review` | `rejected`, `validated` |
| `rejected` | `result-submitted` on a new result/evidence/lineage digest, `abandoned` |
| `cancelled`, `validated`, `failed`, `abandoned` | none |

Every unlisted transition is refused. `plan-review → authorized` requires a valid plan quorum and `ExecutionAuthorization`. Transition to `running` additionally requires a signed `HarnessAttestation v1` whose requested profile and effective controls satisfy the plan; a missing capability or attestation refuses startup. `result-review → validated` requires a valid result quorum over artifact, evidence and contributor-lineage digests. `validated` is technical validation by two other agents, not an individual agent verdict.

A protected human gate remains an additional prerequisite for canonical contracts, authorization, migrations, releases and deployments. It never substitutes for either agent review.

## Control and causal events

Control commands are idempotent by `(tenantId, missionId, idempotencyKey)`; non-start controls additionally bind the exact `runId`. A `start` control never preselects a run ID: the orchestrator creates it only after plan, authorization, token, quorum and harness preflight verification. `start`, `pause` and `resume` reject stale revisions. An authorized `cancel` targeting the exact run, plan and authorization remains monotone even when `expectedRevision` is stale; it cannot target another run.

For event sequence 1, `previousEventDigest` is null. For every later event it equals the accepted prior event digest. Duplicate event ID or sequence is idempotent only when the previously verified canonical digest matches; any divergence quarantines the event and cannot project success. Tenant, mission, run, orchestrator, plan and authorization identities remain byte-identical across the chain. Sequence increments by exactly one and the predecessor digest equals the accepted prior event; causal-store outage fails closed.

Before projection, the TypeScript/Rust event-chain validator checks these identities and component-wise budget arithmetic against accepted state. Every budget total is component-wise greater than or equal to the prior accepted total. Delta plus prior total equals current total. Retry, pause, resume and worker replacement never decrement totals.

## Privacy and evidence

Review summaries contain only closed codes, severity and counts. Detailed findings are tenant-private evidence artifacts with approved retention. Agent/reviewer IDs, review references, subject digests and findings never enter operational logs or OTEL attributes.

Views and exports disclose reviewer and contributor identities only to authorized roles with a need to know. Deletion, anonymization and restore replay follow `docs/specifications/DATA-LIFECYCLE.md`; accepted deletion cannot be resurrected.
