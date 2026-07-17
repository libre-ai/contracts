# Contract catalog — G1 lock

Machine authority: [`catalog.v1.json`](catalog.v1.json).

| Family | Count | Authority | Compatibility |
| --- | ---: | --- | --- |
| JSON Schema 2020-12 | 60 | `contracts/schemas/` | strict payloads; additive v1 only through coordinated producer/consumer qualification; breaking changes use a new major |
| Retention policy | 1 | `contracts/data/` | exact ADR-0002 lifecycle projection |
| OpenAPI 3.1 | 11 | `contracts/openapi/` | routes and payload majors remain aligned |
| WIT worlds | 9 | `contracts/wit/` | exact major-versioned component boundary + cataloged profile |
| Biscuit authority/policies | 4 | `contracts/authz/` | minimal authority plus deny-by-default authorizers |

The catalog records one ID, path, owner set, consumer set, classification, compatibility mode and
`locked` or `pending-independent-agent-review` candidate status for every contract. Candidate entries
are not implementation or release approvals. Their dossier names every required role and binds each
verdict to a dedicated review-only pass under [`AGENT-REVIEW-PROTOCOL.md`](../docs/reviews/AGENT-REVIEW-PROTOCOL.md).
Uncataloged files and missing authorities fail `bun run check:contracts`.

## Shared contracts

- `work-package-plan.v1`: exclusive agent paths, dependencies and human gates ;
- `browser-session.v1`: opaque server-side browser session record ;
- `retention-policy.v1` and `deletion-receipt.v1`: executable lifecycle and deletion evidence ;
- `problem-details.v1`: stable HTTP refusal envelope ;
- `evidence-report.v1`: attributable gate results ;
- `artifact-manifest.v1`: content-addressed release/export/evidence files ;
- `agent-handoff.v1`: planning-only Specifications → Missions boundary ;
- `common.v1`: identifiers, tenant IDs, digests, source, artifact and approval references ;
- `engine-golden-vectors.v1`: locked bounded public-vector envelope; engine WIT/semantics and dedicated
  checkers remain authoritative, with no product/runtime authorization.

## Application contracts

- Website: public projection and correction record ;
- Practices: activity definition/outcome and local progress export ;
- Radar: locked v2 source-scoped parsing/rules with exact normalized feed/item and bounded output ;
- Notebook: candidate context v2 plus authenticated Argon2id/AES-GCM backup envelope ;
- Sessions: event and audience-safe export ;
- Model Policy: locked v1 and v2 policy/need/snapshot/evaluation boundaries with human approval separation ;
- Boussole: locked v1 and v2 reviewed dataset/method/responses/comparison boundaries, with public scoring disabled ;
- Specifications: immutable SpecPackage and planning handoff ;
- Missions: locked v1 human-verdict baseline plus locked, unimplemented v2 two-agent plan/result quorums ;
- Agent Orchestrator/Harness: locked, unimplemented immutable plan, separate authorization, causal events, monotone budgets and signed fail-closed isolation profile/attestation.

See [`COMPATIBILITY.md`](COMPATIBILITY.md) for evolution rules and [`fixtures/schema-fixtures.v1.json`](fixtures/schema-fixtures.v1.json) for executable positive/negative vectors.
