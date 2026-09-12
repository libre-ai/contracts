# Auth retention v3 candidate plan

Goal: register a complete, non-adopted retention v3 candidate for the four persistent
Auth derivatives/transaction classes. Preserve every locked byte and all seventeen
v2 rules; retain Sessions source ownership and exclude persistent controller state.

Base: 0317fc188581290a45a84ef57c5e964745c29d68. Source proposal is
`docs/proposals/auth-retention-next-major.md` and its pinned JSON. Projection
semantics suffice for this contract: verified current source required, invalidation
or deletion ends retention, no grace/history; implementation transport remains a
consumer gate, not an unresolved retention choice.

1. Write failing tests in `tools/quality/auth-retention-v3.test.ts` covering schema
   closure, exact inheritance, subminute OIDC boundaries, trigger/dependency changes,
   currentness/deletion and restore prerequisites. Run them red before implementation.
2. Add `contracts/schemas/retention-policy.v3.schema.json`,
   `contracts/data/retention.v3.json`, `contracts/retention-v3/SEMANTICS.md`,
   `contracts/fixtures/retention-v3/vectors.json`, and reference validator/evaluator
   `tools/quality/auth-retention-v3.ts`. No SQL or runtime adapter.
3. Wire the existing contract checker, append schema fixtures/catalog candidates,
   update only the candidate inventory expectation, and add a review dossier with
   pending architecture/security/privacy roles. Preserve existing entries exactly.
4. Run focused coverage with a blocking 90% threshold, canonical checks, immutable
   authority byteproof and independent vector arithmetic checks. Commit exact owned
   files with DCO; record SHA, hashes, evidence and unqualified consumers privately.
