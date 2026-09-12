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
| architecture | Ten endpoints including pre-acceptance subject discovery, version boundaries, immutable body and receipt append, workspace lifecycle, finite pagination and response envelopes | pending |
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

The INT-P2-01 correction adds subject discovery through existing package/read
rights, not workspace/read or a new signing service. The owning Specifications
protocol candidate is Spec Studio `6c1dec85e84e3ea59b09692b5a3d06972b0f8ae3`,
`docs/apps/specifications.md` SHA256
`0cca8c515495663b631b2687f2c66960a1de7dd6d1af5c218a9b1654345bcd1b`.
Its Queries v2 candidate includes GetAcceptanceSubject; v1 stays unchanged.
Neither that owner candidate nor this contract is published by local qualification.
Remote CI divergence remains a real composition gate until the owner authority is
available through its canonical resolver; no local mirror is committed here.
