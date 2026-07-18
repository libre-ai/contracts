# Contract catalog — canonical lock

Machine authority: [`catalog.v1.json`](catalog.v1.json).

| Family | Count | Authority | Compatibility |
| --- | ---: | --- | --- |
| JSON Schema 2020-12 | 60 | `contracts/schemas/` | strict payloads; additive v1 only through coordinated producer/consumer qualification; breaking changes use a new major |
| Retention policy | 1 | `contracts/data/` | exact ADR-0002 lifecycle projection |
| OpenAPI 3.1 | 11 | `contracts/openapi/` | routes and payload majors remain aligned |
| WIT worlds | 9 | `contracts/wit/` | exact major-versioned component boundary + cataloged profile |
| Biscuit authority/policies | 4 | `contracts/authz/` | minimal authority plus deny-by-default authorizers |

The catalog records one ID, path, owner set, consumer set, classification, compatibility mode and
status for every contract. All 85 current entries are `locked`. The status model can still represent a
future `pending-independent-agent-review` candidate; such a candidate would not authorize implementation
or release and would require dedicated review-only verdicts under
[`AGENT-REVIEW-PROTOCOL.md`](../docs/reviews/AGENT-REVIEW-PROTOCOL.md).

Some locked engine profiles and vector payloads retain candidate-era status strings because their exact
bytes are hash-bound review evidence. Those embedded strings are historical metadata, not live catalog
state. They must not be edited merely to reconcile wording: any byte change follows compatibility and
re-review rules. `catalog.v1.json` is the sole live status authority.

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
- Notebook: locked context v2 plus authenticated Argon2id/AES-GCM backup envelope; runtime use remains gated ;
- Sessions: event and audience-safe export ;
- Model Policy: locked v1 and v2 policy/need/snapshot/evaluation boundaries with human approval separation ;
- Boussole: locked v1 and v2 reviewed dataset/method/responses/comparison boundaries, with public scoring disabled ;
- Specifications: immutable SpecPackage and planning handoff ;
- Missions: locked v1 human-verdict baseline plus locked, unimplemented v2 two-agent plan/result quorums ;
- Agent Orchestrator/Harness: locked immutable plan, separate authorization, causal events, monotone budgets and signed fail-closed isolation profile/attestation; only the simulation control core is implemented, never a harness or worker runtime.

See [`COMPATIBILITY.md`](COMPATIBILITY.md) for evolution rules and [`fixtures/schema-fixtures.v1.json`](fixtures/schema-fixtures.v1.json) for executable positive/negative vectors.
