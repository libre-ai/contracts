# Contract catalog — G1 lock

Machine authority: [`catalog.v1.json`](catalog.v1.json).

| Family | Count | Authority | Compatibility |
| --- | ---: | --- | --- |
| JSON Schema 2020-12 | 48 | `contracts/schemas/` | strict payloads; additive v1 only through coordinated producer/consumer qualification; breaking changes use a new major |
| Retention policy | 1 | `contracts/data/` | exact ADR-0002 lifecycle projection |
| OpenAPI 3.1 | 10 | `contracts/openapi/` | routes and payload majors remain aligned |
| WIT worlds | 9 | `contracts/wit/` | exact major-versioned component boundary + cataloged profile |
| Biscuit authority/policies | 3 | `contracts/authz/` | minimal authority plus deny-by-default authorizers |

The catalog records one ID, path, owner set, consumer set, classification, compatibility mode and
`locked` or pending-independent-review `candidate` status for every contract. Candidate entries are
not implementation or release approvals. Their dossier names every required human role. Uncataloged files and missing authorities fail `bun run check:contracts`.

## Shared contracts

- `work-package-plan.v1`: exclusive agent paths, dependencies and human gates ;
- `browser-session.v1`: opaque server-side browser session record ;
- `retention-policy.v1` and `deletion-receipt.v1`: executable lifecycle and deletion evidence ;
- `problem-details.v1`: stable HTTP refusal envelope ;
- `evidence-report.v1`: attributable gate results ;
- `artifact-manifest.v1`: content-addressed release/export/evidence files ;
- `agent-handoff.v1`: planning-only Specifications → Missions boundary ;
- `common.v1`: identifiers, tenant IDs, digests, source, artifact and approval references.

## Application contracts

- Website: public projection and correction record ;
- Practices: activity definition/outcome and local progress export ;
- Radar: v2 source-scoped parsing/rules with exact normalized feed/item and bounded output ;
- Notebook: candidate context v2 plus authenticated Argon2id/AES-GCM backup envelope ;
- Sessions: event and audience-safe export ;
- Model Policy: locked v1 policy/need/snapshot/evaluation plus candidate v2 with human approval separation ;
- Boussole: locked v1 reviewed dataset/method/comparison plus candidate v2 local responses, with public scoring disabled ;
- Specifications: immutable SpecPackage and planning handoff ;
- Missions: orchestrator event and human-verdict MissionRecord.

See [`COMPATIBILITY.md`](COMPATIBILITY.md) for evolution rules and [`fixtures/schema-fixtures.v1.json`](fixtures/schema-fixtures.v1.json) for executable positive/negative vectors.
