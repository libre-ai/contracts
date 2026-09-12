# Specifications API v2 candidate review dossier

Status: pending-independent-agent-review; no consumer or publication admission.
Base: `8d199f2ab61e903be7e251efbdd7f48803c333dc`.
Protocol: Governance `docs/reviews/AGENT-REVIEW-PROTOCOL.md`.

The API and combined HTTP schema are new major-version candidates. All inherited
authority bytes and catalog entries are pinned by the independent fixture inventory.
Review only an immutable commit, record every source/vector hash and a separate
role verdict outside its authoring tree. This authoring dossier accepts nothing.

| Required role | Scope | State |
| --- | --- | --- |
| architecture | Nine endpoint purposes, version boundaries, immutable body and receipt append, workspace lifecycle, finite pagination and response envelopes | pending |
| security | Exact resource/operation matrix, current authority ports, cookie/CSRF, revision/idempotency, refusal precedence, no execution or implicit grants | pending |
| cryptography | Raw-byte preimages through HTTP, detached signature verification, cursor binding and no stored success bypass | pending |

Evidence recipes: `bun run check` and the included
`bun test tools/quality/build-brief-api-v2.test.ts` stage. These parse real OpenAPI
YAML, resolve request/response schemas through strict AJV 2020-12 and validate
synthetic endpoint fixtures. They are authority checks, not a deployed HTTP
server, cryptographic cursor implementation or a consumer E2E suite.

Existing Build Brief crypto/policy/storage review requirements remain independent.
The API names authority ports and denies unavailable inputs; it does not qualify
production issuers, historical evidence, persistence or deletion/restoration.
Review transition semantics in `contracts/build-brief-api-v2/SEMANTICS.md`.
