# Build Brief v2 — candidate semantics

Status: candidate, unimplemented. Owner selected stable content with detached
signed acceptance and a dedicated resource policy on 2026-09-12. This document
and its schemas/vectors require the three review passes in
`docs/reviews/build-brief-v2-review.md` before any consumer implementation.
No locked SpecPackage, Handoff or Missions v1 authority changes.

## Exact content preimage

The entire `build-brief-body.v2` object, and only that object, is the content
preimage. Its complete required field set is:

`schemaVersion`, `id`, `tenantId`, `version`, `problem`, `actors`, `requirements`,
`decisions`, `contracts`, `risks`, `acceptanceCriteria`, `contributors`.

All nested fields follow the closed body schema. `tenantId` is the existing wire
name for organization. Unknown fields are refused recursively. There are no
implicit defaults, removed fields, extension maps or self-referential digest.
Contributors identify every actual contributor, including review changes; consumers
must compare the set to independently authenticated provenance, not trust the list.
Requirement/decision/risk/criterion ids are unique within their respective arrays.
Array order is significant to the digest and is never silently sorted. Unicode
strings are not normalized. Only safe integers are admitted; no floating point,
NaN, infinity or unsafe version/revision integers occur in this schema family.

`bodyDigest = lowercase_hex(SHA256(UTF8(RFC8785(body))))`.

Artifact's existing `canonical_document_digest` is the intended Rust primitive;
Contracts' existing `canonicalJson` safe-integer profile supplies the local fixture
oracle. Producers serialize JCS once. Consumers reject noncanonical wire bytes
before hashing, including whitespace variants, duplicate members, invalid UTF-8,
BOM, unpaired surrogates and noncanonical number spellings. Each package or handoff
wire input is bounded to 2 MiB and depth 32. Schema validation precedes semantic
acceptance. These requirements must be verified at the consuming raw-byte boundary.

## Detached acceptance and trust

The package envelope has exactly `schemaVersion`, `body`, `bodyDigest`,
`acceptances`. One or more valid acceptances are required. Neither the envelope
nor the acceptance set defines content identity. Adding a valid acceptance leaves
bodyDigest unchanged. Every supplied acceptance must verify; no silently ignored
invalid record. Acceptance statement ids must be distinct.

Each detached record has exactly `schemaVersion`, `statement`, `signature`.
The complete statement preimage has exactly:

`schemaVersion`, `id`, `tenantId`, `specPackageId`, `specPackageVersion`,
`subjectDigest`, `approverId`, `role`, `acceptedAt`, `membershipRevision`,
`policyDigest`, `signingKeyId`.

The statement schemaVersion is `libre-ai.build-brief-acceptance-statement.v2`.
Its role is exactly `build-brief-approver`. It binds the exact body id, organization,
version and bodyDigest, and SHA256 of the exact dedicated policy file bytes.
The approver must not be in the independently verified contributor set. AcceptedAt
must not be in the future. No two-agent quorum is inferred or imported from Missions.

Compute `statementDigest = SHA256(UTF8(RFC8785(statement)))`. Reuse the existing
agent-orchestration signature convention:

```
Ed25519(UTF8(statement.schemaVersion) || 0x00 || raw_32_bytes(statementDigest))
```

Signature encoding is canonical unpadded Base64url of exactly 64 bytes (86 chars,
canonical unused final bits). Public keys are 32 bytes. The statement includes no
signature, public key, preimageDigest or mutable acceptance list. A signature over
bare digest, bare JCS, a different schema domain or another body is invalid.

`signingKeyId` selects an independently approved acceptance-verification record,
never a payload-supplied public key. That trusted record binds the key to this
organization and approver, their authorized membership revision **at acceptance**,
and the key validity interval. Unknown/ambiguous/unavailable or revoked keys fail
closed; acceptedAt must fall inside the validity interval [from, until). The
membership proof is authenticated historical acceptance evidence, not a claim that
the key registry itself is the membership authority. Key possession alone is not
approval authorization. Registry admission AND each verification must reject a key
unless its 32-byte compressed Edwards encoding is canonical, on-curve,
nonidentity and in the prime-order subgroup. The signature R point has exactly
the same conditions. Canonical re-encoding must equal the supplied bytes; no
unreduced-y, negative-zero, torsion or mixed-order encoding is accepted. The scalar
S is the canonical little-endian integer in [0, L), where L is the Ed25519
prime subgroup order. The identity is forbidden even though it is torsion-free.
These conditions are stronger than generic runtime/ZIP215 signature acceptance.

The candidate verifier uses pinned `@noble/curves` 2.4.0 point decoding with
ZIP215 disabled, nonidentity and torsion-free checks, canonical roundtrip, then
Ed25519 verify with `{ zip215: false }` (including scalar range validation).
No native-crypto fallback, blacklist or custom field/curve arithmetic is permitted.
Both points are prime-order, so a cofactored equation cannot admit torsion aliases.
A separate Rust oracle applies curve25519-dalek 4.1.3 canonical point/nonidentity/
torsion-free checks and ed25519-dalek 2.2.0 `verify_strict` to identical vectors.
Consumers must enforce all these conditions, not just a method named strict.
This is ordinary Ed25519 over the domain-separated message above, not Ed25519ph.
Dependency provenance, license and audit-scope limits are recorded in
`docs/reviews/build-brief-v2-crypto-dependencies.md`. The fixture context compresses these trusted facts solely
for testing; it does not implement their issuance or storage.

A later membership revision is not silently substituted into a historical
statement. New requests and sensitive commands separately require current membership
and revision through the dedicated authorizer; verifying old acceptance grants no
current caller permission. Consumers must qualify the registry, historical role
proof, contributor provenance and revocation handling before runtime admission.
No fixture establishes any real approver, key grant or membership.

## Handoff v2

The successor binds `specPackageId`, `specPackageVersion`, `specPackageDigest`,
organization and `acceptanceDigest = SHA256(UTF8(RFC8785(detached_record)))`.
Unlike bodyDigest, acceptanceDigest includes the record signature and wrapper.
A consumer must fetch/receive the actual package and exact referenced acceptance,
verify both body and all acceptance records, and independently authorize its caller.
Opaque digests or a syntactically valid handoff alone authorize nothing.

Capabilities are exactly `["plan"]`. Up to 1000 criteria match the body bound (v1's 100-item handoff bound is not inherited). Criteria ids must equal the body's criterion
set with no duplicates, omission or invention. CreatedAt is at/after the referenced
acceptance and at/before trusted now; expiresAt is strictly later than both now and
createdAt. Transport/storage must bind the handoff to its authorized producer;
this schema is not itself a bearer token or signed execution grant. Export cannot
create execution capabilities. Evidence reports remain references, not proof of
validity, authorship, rights or acceptance.

## Dedicated Build Brief authorizer

The wire resource classes retain `spec-workspace`, `spec-package`, `agent-handoff`.
Policy roles are namespaced; a Missions `approver`, `operator` or `orchestrator`
gets no implicit Build Brief rights.

| Role | Resource class | Allowed operations |
| --- | --- | --- |
| build-brief-author | spec-workspace | author, read, export |
| build-brief-reviewer | spec-workspace | review, read, export |
| build-brief-approver | spec-package | approve, read, export |
| build-brief-planner | agent-handoff | plan |

All other combinations deny. Review means recording a workspace decision; it does
not grant author editing or package acceptance. Package export is the authorization
seam for producing a plan-only handoff from an already verified accepted package.
The consumer still checks the handoff conditions above. Creation resolves a trusted
workspace ownership record before issuing an exact resource grant; no wildcard
resource, implicit ownership from client input or unscoped organization grant.

Issuer authority facts: user, organization, namespaced role, exact brief_resource
(id, kind), membership_revision(user, revision), and for approve exact brief_subject
(bodyDigest), plus an expiration check. The issuer rejects reserved host predicates
or rules in issued authority blocks. Host context includes trusted time, one exact
resource/id/kind/organization/operation, current_member(user, organization, revision),
and, for approval, independently proven non_contributor and resource_digest.
Unknown ownership, membership or provenance is absence of permission, never true
by default. The default Biscuit trust set includes authority and authorizer;
appended blocks may restrict but cannot supply trusted roles or context. The issuer
is trusted and cannot issue arbitrary host context; this boundary is required,
not solved by prompt discipline or naming facts. Browser cookie/session validation,
CSRF, issuer-only private keys, current membership, service Biscuit checks,
idempotency, expected revision and organization RLS remain separate mandatory seams.

## Evidence and implementation gate

- `fixtures/build-brief-v2/vectors.json`: synthetic positive JCS/digest/Ed25519 values.
- `negative-vectors.json`: exact semantic refusal mutations.
- `policy-vectors.json`: 168 full role/resource/operation combinations plus 11
  cross-context, expiration, provenance and attenuation denials, bound to policy SHA.
- `bun run check:build-brief`: byte parsing, schemas, real signature verification,
  semantic negatives, stable identity, digest and policy drift. A dedicated 90%
  blocking coverage threshold gates new verifier functions/lines and emits LCOV;
  existing dependency verifiers are excluded from this scoped measurement.
- `bun tools/quality/check-build-brief-biscuit.ts /absolute/biscuit SHA256`: explicit
  local CLI 0.6.0 conformance recipe, ephemeral synthetic signing key, no live issuer.
  It checks signature result, structured policy decision and exit code for every
  vector and removes its own temporary key/token directory. Binary pin is selected
  independently by the controller; a matching arbitrary binary is not qualified.

No SDK implementation, production issuer, registry, HTTP v2 route, persistence
migration, v1 adapter or deployed authorization is delivered here. Consumer work
must vendor a byte-exact immutable authority revision, prove Artifact cross-runtime
vectors and raw boundaries, and test actual HTTP/storage/authorization behavior.
Passing Contracts tests does not satisfy those consumer gates.


## Persistence and historical-proof inheritance — consumer gate

`retention.v1.json` already defines `spec-package` / `accepted-spec-package`:
PostgreSQL authority, while-referenced, reference-release trigger and P5Y after
reference release. Splitting an accepted package into stable body and detached
acceptance does not grant a new retention period, independent proof class or
unlimited key/membership history. Body, acceptance and required verification
proofs must remain jointly verifiable for the accepted package's permitted life.
Before consumer implementation, an explicit reviewed storage mapping must bind
those rows/references and historical membership/provenance/key-status evidence to
the existing class and lifecycle; distinguish current revocation from historical
validity, and qualify deletion/restore consistency. No such storage mapping,
privacy exception or new retention policy is approved by this candidate.
