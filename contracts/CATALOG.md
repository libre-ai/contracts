# Contract catalog — G1 lock

Machine authority: [`catalog.v1.json`](catalog.v1.json).

| Family | Count | Authority | Compatibility |
| --- | ---: | --- | --- |
| JSON Schema 2020-12 | 26 | `contracts/schemas/` | strict payloads; additive v1 only through coordinated producer/consumer qualification |
| OpenAPI 3.1 | 7 | `contracts/openapi/` | additive routes/operations; existing payloads remain strict |
| WIT worlds | 5 | `contracts/wit/` | exact major-versioned component boundary |
| Biscuit policies | 2 | `contracts/authz/` | exact major-versioned authorizer policy |

The catalog records one ID, path, owner set, consumer set, classification, compatibility mode and lock status for every contract. Uncataloged files and missing authorities fail `bun run check:contracts`.

## Shared contracts

- `problem-details.v1`: stable HTTP refusal envelope ;
- `evidence-report.v1`: attributable gate results ;
- `artifact-manifest.v1`: content-addressed release/export/evidence files ;
- `agent-handoff.v1`: planning-only Specifications → Missions boundary ;
- `common.v1`: identifiers, tenant IDs, digests, source, artifact and approval references.

## Application contracts

- Website: public projection and correction record ;
- Practices: activity definition/outcome and local progress export ;
- Radar: bounded fetch, deterministic rule set and curation export ;
- Notebook: context document and encrypted backup envelope ;
- Sessions: event and audience-safe export ;
- Model Policy: policy, sourced snapshot and deterministic evaluation ;
- Boussole: reviewed dataset/method and local comparison ;
- Specifications: immutable SpecPackage and planning handoff ;
- Missions: orchestrator event and human-verdict MissionRecord.

See [`COMPATIBILITY.md`](COMPATIBILITY.md) for evolution rules and [`fixtures/schema-fixtures.v1.json`](fixtures/schema-fixtures.v1.json) for executable positive/negative vectors.
