# Build Brief v2 candidate review dossier

Status: pending-independent-agent-review; candidate and unimplemented.
Authoring base: 1c977091e42c766979b176a834436faf3ec8c114.
Owner decision (2026-09-12): stable JCS/SHA256 body plus detached signed acceptances;
consumers verify both; dedicated Build Brief policy without Missions v1 expansion.

Required protocol: Governance `docs/reviews/AGENT-REVIEW-PROTOCOL.md`.
Authoring and review are separate passes on an immutable authoring commit; no
review acceptance or implementation admission is asserted in this authoring file.
Review records must identify exact commit, role, scope, evidence, findings and
verdict, outside the commit they review. Subsequent changes invalidate affected
review scope. Catalog stays candidate until required review and promotion decision.

| Required role | Scope | State |
| --- | --- | --- |
| architecture | Closed field sets; detached identity; handoff/consumer binding; no v1 change; bounded adapters and S3 seams | pending |
| security | Dedicated role matrix, current membership, resource ownership, contributor separation, trusted issuer/context, replay/attenuation/refusal vectors | pending |
| cryptography | JCS preimage exactness, Ed25519 domain, canonical encodings, trusted historical acceptance evidence, key lifecycle, cross-runtime oracles | pending |

Authorities: build-brief-body-v2, build-brief-acceptance-v2, spec-package-v2,
agent-handoff-v2, build-brief-policy-v2. Normative semantics and explicit limits
are in `contracts/build-brief-v2/SEMANTICS.md`. No role pass has yet reviewed these
new authorities; this dossier is not an acceptance record.

Machine checks are authority tooling only. The intended Missions/Artifact/authz
consumers have not been implemented or qualified against this candidate. In
particular real membership evidence, contributor provenance, key registry and
HTTP/database admission must be qualified after these role passes. The local
Biscuit CLI recipe tests synthetic policies, not a production issuer.
