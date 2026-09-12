# Specifications API v2 candidate implementation plan

Base: `8d199f2ab61e903be7e251efbdd7f48803c333dc`; dedicated isolated worktree.
Owner choices: stable body and detached acceptances, dedicated Build Brief policy,
no Missions rights expansion. This bounded increment creates contract authority
only, not runtime, persistence, key issuance, retention or publication.

1. Add failing real YAML/OpenAPI shape and strict AJV schema tests for all nine
   retained endpoint purposes, exact response/status/authorization metadata and
   per-endpoint payload refusal vectors. Pin inherited catalog entries and every
   inherited contract byte. Observe missing-v2 failure before authoring authority.
2. Author candidate OpenAPI Specifications v2 with closed request/response schemas,
   data/meta envelopes, explicit canonical/raw boundary, idempotency/revision,
   cookie/CSRF, cursor paging and stable content-free refusals. Retain all v1
   domain operation purposes without changing v1. Supersession is workspace
   authoring metadata; package bytes stay immutable. Accept appends independently
   verified detached receipt bound to the complete stable body.
3. Add synthetic endpoint matrix/fixtures and checks; register only new candidate
   entries, preserve all inherited catalog records and use a separate schema
   fixture inventory. Wire checks through canonical contracts verification.
4. Document transition, historical/current authority ports, ephemeral draft and
   handoff boundary, consumer tests and role-review prerequisites. Run focused
   checks then full canonical gate; inspect exact staged file inventory and commit.

Acceptance: actual YAML parse and strict AJV compilation, each endpoint has a
   positive request (where applicable)/response and schema-negative cases, exact
   headers/security/status sets, no unknown fields or execution rights, generated
   reference integrity, full inherited hashes unchanged, all repository gates
   green. No runtime/API E2E claim follows from contract fixture checks.
