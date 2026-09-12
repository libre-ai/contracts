# Build Brief v2 candidate implementation plan

Goal: machine-checkable, unimplemented candidate for stable content identity,
detached signed acceptance, plan-only handoff and separate resource authorization.
Authority: owner selected these two semantics on 2026-09-12; base
1c977091e42c766979b176a834436faf3ec8c114. COMPATIBILITY requires role-separated
immutable review before implementation. No locked v1 bytes change.

Architecture: exact closed body schema hashed as SHA256(UTF8(RFC8785(body))).
Detached acceptance statement binds body id/organization/version/digest,
approver/time/key and policy digest; its Ed25519 message reuses
UTF8(schemaVersion)||0x00||raw32(SHA256(JCS(statement))). Handoff binds body
and exact detached acceptance digest, grants only plan. Registry, membership,
resource ownership and contributor lineage are trusted inputs, never payload grants.

Tech: existing Ajv2020/formats, strict JSON parser, canonicalJson safe-integer
profile and Bun/Node Ed25519 verification; no new production stack. Artifact Rust
JCS remains consumer primitive and needs pinned cross-runtime conformance later.

- [x] Add failing candidate inventory/schema tests, then four schemas (body,
  detached acceptance, package envelope, handoff), dedicated policy and catalog.
  Paths: contracts/schemas/build-brief-{body,acceptance}.v2.schema.json,
  spec-package.v2.schema.json, agent-handoff.v2.schema.json,
  contracts/authz/build-brief-v2.datalog, contracts/catalog.v1.json.
- [x] Define exact semantics and role matrix; positive/negative schema fixtures,
  crypto and raw-input vectors, source-bound policy vectors. Add local authority
  verifier/tests in tools/quality/build-brief-v2*.ts, wired to check:contracts.
  Fail tampered body/statement/signature, wrong key/domain/org/version, self-accept,
  missing acceptance, altered handoff, noncanonical/duplicate/surrogate input.
- [x] Add pending architecture/security/cryptography dossier; update existing
  candidate inventory test explicitly, preserving 99 locked entries/hash tests.
- [x] Run scoped tests, canonical check, check unchanged locked authorities;
  commit exact owned paths DCO with personal worktree identity. Record actual
  proof and unqualified consumer/Biscuit/runtime boundaries in private ledger.

Review dossier and normative semantics travel with this plan. No SDK, live key
registry, token issuer, deployment, approval grant or v1 compatibility adapter is
implemented. Source fixture authorship and synthetic keys imply no real authority.

Verification completed before authoring commit: schema/semantic/crypto tests and
179 real Biscuit CLI vectors; exact canonical CI check recorded in private ledger.
Role reviews and consumer conformance remain pending, not checked off by this plan.
