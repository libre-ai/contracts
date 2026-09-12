# Auth retention next-major proposal plan

**Goal:** prepare a reviewable retention proposal for the selected minimal Auth index followed by organization RLS, without inventing membership authority or granting persistence.

**Architecture:** preserve all current contract bytes. Keep the scoped proposal outside the executable catalog; record established bounds and unresolved decisions separately. Sessions remains the membership authority; Auth stores only a disposable current projection. No Build Brief change or consumer implementation belongs here.

**Inputs:** Missions design/plan at `58c05b184d1241f41fe44840df619080b09c91f1`; Contracts at `8d199f2ab61e903be7e251efbdd7f48803c333dc`; Governance DATA-LIFECYCLE and IDENTITY-AUTHORIZATION; Sessions application protocol; prospective ADR-0042 (unadopted).

## Bounded steps

- [x] Inspect exact authorities and distinguish ownership from lifecycle bounds. Preserve Sessions ownership rather than infer an Auth transfer.
- [x] Write `docs/proposals/auth-retention-next-major.md`: mappings, out-of-scope source membership lifecycle, memory-only operational capability limits, restore and review gates.
- [x] Write `docs/proposals/auth-retention-next-major.json`: machine-readable non-executable proposal with immutable source hashes, existing inheritance, proposed constraints and explicit unresolved fields. Do not assign an approval date or register an incomplete retention policy.
- [x] Validate JSON parsing, source hashes, unchanged inherited contract tree and required proposal assertions; run repository canonical checks after staging only these three files. Documentation/data proposal introduces no executable retention implementation or browser flow.
- [x] Commit exact owned paths with DCO. Record immutable revision and actual evidence in the private ledger. Dedicated architecture/security/privacy reviews remain prerequisites to a complete next-major authority.
