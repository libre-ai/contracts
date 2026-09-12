# Specifications API v2 — candidate HTTP semantics

Candidate, unimplemented and unpublished. This source complements the exact
`contracts/openapi/specifications.v2.yaml` and
`contracts/schemas/build-brief-api.v2.schema.json` definitions; neither success
fixtures nor a schema validator grants runtime admission. The inherited
`contracts/build-brief-v2/SEMANTICS.md` supplies immutable content, strict Ed25519,
historical acceptance and plan-only handoff semantics without modification.

## Version boundary and endpoint matrix

All paths below are relative to `/v2/specifications`. Only the listed method is
supported; unsupported methods, including HEAD/OPTIONS, return 405 with exact
Allow and invoke no command. All operations require the verified session cookie
and current membership. Every POST requires canonical JSON, Idempotency-Key,
If-Match and X-CSRF-Token. All successes are `{data, meta}`; meta contains opaque
requestId and safe-integer revision. Each error is the closed content-free
`{data:null,meta:{requestId,code,message}}` schema for its exact HTTP status,
served as application/problem+json. Successes use application/json.

| Method and path | Operation / success | Required resource operation |
| --- | --- | --- |
| POST `/workspaces` | createSpecWorkspace / 201 workspace | independently allocated spec-workspace / author |
| GET `/workspaces/{workspaceId}` | getSpecWorkspace / 200 workspace | spec-workspace / read |
| POST `/workspaces/{workspaceId}/acceptance` | acceptSpecPackage / 201 full package | independently bound spec-package / approve on exact bodyDigest |
| GET `/packages/{packageId}?version=N` | getAcceptedPackage / 200 full package | spec-package / read |
| POST `/packages/{packageId}/handoffs?version=N` | createPlanningHandoff / 201 handoff | spec-package / export |
| POST `/workspaces/{workspaceId}/commands` | executeSpecCommand / 200 workspace | spec-workspace / author, except review requires review |
| GET `/workspaces/{workspaceId}/views/{view}` | getSpecView / 200 tagged page | spec-workspace / read; approvals additionally require referenced spec-package / read |
| POST `/packages/{packageId}/commands?version=N` | executePackageCommand / 200 full package | spec-package / export; command is exactly export |
| GET `/handoffs/{handoffId}` | getHandoff / 200 handoff | agent-handoff / plan |

The existing names describe retained domain purposes; the v2 route/payload is a
separate contract. No v1 OpenAPI/schema/policy changes, v1 digest reinterpretation,
automatic adapter or Missions quorum expansion are allowed. Draft authoring
fields and command variants are closed by schema; command-specific mandatory
fields cannot be supplied to unrelated commands. No generic patch/SQL endpoint.
No new key, membership, retention or signing operation is exposed.

## Current authority inputs

Consumer interfaces must provide the following named trusted ports. These are
responsibilities with exact required observations, not new wire APIs or issuers:

- `CurrentSessionAuthority`: authenticated principal, current organization and
  membership revision, cookie/CSRF validity; never roles/organization from payload.
- `BriefOwnershipAuthority`: workspace ownership, exact package id/version/body
  linkage and handoff producer/resource binding. Creation reserves one exact
  workspace identity before issuing author rights; no wildcard creation grant.
- `BriefResourceAuthorizer`: the byte-exact dedicated Build Brief policy plus
  exact current user/resource/operation/revision and, for approval, body digest
  and independently proven non-contribution. Reserved host facts cannot be issued
  by an untrusted token block. Appended blocks restrict, never invent authority.
- `HistoricalAcceptanceAuthority`: authenticated membership/role at acceptedAt,
  complete contributor provenance, historical public key validity and the exact
  acceptance record's policy. This does not replace current caller permission.
- `AcceptanceKeyAuthority`: independently approved organization/approver/key
  binding and current revocation/availability; strict key admission as well as
  each signature verification. Never trust a supplied key or cached success.
- `BriefSnapshotAuthority`: authoritative aggregate revision, exact bytes,
  idempotency outcome and reference lifecycle. It is not a permission to persist
  drafts, handoffs or full key/member history.

Unknown, ambiguous, invalid or unavailable observations fail closed. Fixture
contexts are synthetic observations only. Current membership and revocation are
rechecked for each request; historical validity alone cannot authorize export.

## Content and concurrency

Creation takes problem and actors; the trusted principal enters the contributor
set. Initial revision is 1 and If-Match is exactly `"0"`. Other writes require a
canonical quoted decimal safe integer equal to the current target revision; a
header matching the lexical pattern but exceeding MAX_SAFE_INTEGER is invalid.
No lossy number parsing. Every successful state-changing command advances its
resource revision once; exact retries return original status/body and revision.
The accepted body/receipt aggregate shares the workspace revision. Export observes
that revision without advancing it. Handoff creation checks the package revision
and returns revision 1 for the new ephemeral handoff, without modifying the package.

Workspace authoring is draft -> submitted -> accepted -> superseded. Add/record/
resolve/attach/define act only on draft. Submit requires complete body criteria and
no unresolved decision. Review requires submitted and records a decision; accepted
review is not signed package acceptance. Rejected review returns to draft.
Every actual modifying or review contributor enters independently authenticated
provenance; the payload contributor list is compared to it, never trusted alone.

Acceptance request is `{body,acceptance}`. Resolve workspace-to-package identity
independently, compare body bytes/digest to the exact submitted version, validate
the complete acceptance statement and historical/current evidence, then atomically
commit the first package and receipt. For a workspace already accepted, the same
body may receive a new valid detached acceptance under a fresh revision/key;
existing body or statement id with different bytes conflicts. Identical signed
receipt bytes are idempotent and cannot extend retention. Every response includes
all committed acceptances, each reverified; acceptance count cannot exceed 100.
No server-side signing, default approver or two-agent quorum is inferred.

Supersede is a workspace-author command, not package mutation or a new package
policy right. It requires an accepted workspace and a separately verified same-
organization successor identity/version/digest, different from the old body,
resolved through trusted ownership. It marks only the old workspace terminal;
body/receipt bytes and references remain intact. It cannot bypass the successor's
approval, grant reads, or trigger reference release by itself.

Idempotency binds current organization, principal, method, normalized path/query,
payload digest and expected revision. The same key with a different binding is
409. Authentication/authorization are rechecked even on replay; a previously
authorized result cannot leak after revocation. Concurrent identical calls commit
once. Conflicting CAS writes are 412 with no partial body/receipt/reference write.
Unknown commit outcome requires read/reconciliation against the same binding,
never a new key for a blind second effect. These are consumer tests, not provided
by the authority fixture runner.

## Reads, views, export and handoff

Package version is explicit; a route never silently chooses latest. Reads and
exports must verify canonical stored bytes, all supplied receipts and current
permission. Return full package within the inherited 2 MiB/depth-32 raw boundary;
oversized compositions are refused, not truncated or partially verified.
The wrapper's transport meta is outside every signed/digested preimage. Request
JSON is canonical RFC8785 UTF-8; schema validation never rescues duplicate keys,
BOM, invalid UTF-8, surrogate, unsafe number or noncanonical input.

Views are exactly open-decisions, validation, version-diff and approvals. Returned
data.view equals the path value. Every page is bounded to limit (default/max 100)
with meta.nextCursor mandatory: canonical opaque string or null on the final page.
Cursor binds principal, organization, workspace, view, limit, snapshot revision,
comparison version and last stable item key; authenticated tamper/cross-context,
stale snapshot and unknown cursor all return 400. No arbitrary decoded SQL offset.
Open decisions sort by id; approvals by statement id; diffs by JSON pointer;
validation returns one summary item and null cursor. A version-diff requires
compareVersion; other views refuse that parameter. Unknown/duplicate parameters,
noncanonical integers and cursor/limit disagreements are 400. Diff compares
independently owned versions; it cannot expose a foreign package or proof.

Handoff input contains the actual v2 handoff, whose id/organization/package/version
and referenced acceptanceDigest are checked against trusted context and current
package bytes. All criteria must match without duplication; times must satisfy
the inherited current interval and capabilities must be exactly [plan]. The
producer/resource binding is authenticated outside the unsigned handoff. Reading
an expired or unverifiable handoff refuses. No handoff grants execution or turns
historical acceptance into a current bearer permission.

Drafts and handoffs may be held only in bounded ephemeral memory or exported until
their storage classification is separately reviewed. An evicted/expired ephemeral
object is 404; restart may lose it. No unconditional durable idempotency guarantee
is claimed for an unqualified persistence adapter: when required authoritative
outcome cannot be reconciled, return 503 and do not re-emit an uncertain effect.
Accepted package storage must pass the previously specified joint proof/P5Y/P35D
mapping before durable admission. This API adds no retention class or interval.

## Closed HTTP refusals and evaluation order

Each code is exactly `build-brief.http_STATUS` and message exactly `Request refused`.
The public code conveys the HTTP category without leaking signature/key/member
details, input bytes, identifiers or personal facts. Internal semantic failures
remain content-free classified observations, not raw logs.

| Status | Trigger |
| --- | --- |
| 400 | invalid parameters/header grammar/canonical bytes/cursor or request shape |
| 401 | absent, invalid or expired session |
| 403 | failed CSRF/current membership/resource operation/non-contributor permission |
| 404 | unknown or outside-scope resource; do not distinguish foreign ownership |
| 405 | unsupported method, exact Allow, no handler effect |
| 409 | idempotency binding conflict, immutable identity collision or incompatible lifecycle |
| 412 | valid expected revision differs from current revision |
| 413 | bounded request or composed response exceeds byte/depth limits |
| 415 | unsupported request media type/content encoding |
| 422 | structurally valid but invalid signed package/handoff or incomplete submit/acceptance |
| 503 | unavailable/ambiguous trusted authority, missing historical proof or unresolved commit |

GET exposes only 400/401/403/404/405/503: invalid or oversized stored package/handoff
is not returned and maps to 503, not a successful diagnostic. Mutations expose all listed
categories. Canonical/input schema errors map to 400; signature/semantic errors
after structural admission map to 422. Evaluate method, bounded media/transport,
session/CSRF, trusted resource scope/current permission, canonical/schema input,
idempotency/revision and semantic verification in that order. Public lookups do
not reveal existence before authorization. Transport method/size errors disclose
no resource content. Responses are no-store and must not echo user-controlled
headers/content. Consumer tests must prove status, envelope and zero mutation for
each endpoint/refusal; this contract does not implement that evaluation pipeline.

## Verification and admission

The endpoint fixture suite parses OpenAPI YAML and validates actual referenced
request/response schema definitions with strict AJV. It verifies all nine endpoint
inventories, closed status sets, cookie/CSRF/revision/idempotency declarations and
per-endpoint positive/negative payloads. Inherited bytes/catalog entries are
hashed and checked independently. Ordinary contract checks retain all prior
schema, HTTP, doctrine, secret/PII and type/lint gates.

Missing consumer proof: complete actual HTTP dispatch/errors, current/historical
ports, policy attenuation matrix, cursor authentication, CAS/idempotent races,
crypto across real runtimes, API responses against schema, PostgreSQL roles/RLS,
deletion/restore, and browser author -> review -> independent approval -> export
journey with refusals. SDK generation remains upstream and byte-exact; generated
types alone are not verified inputs. Separate immutable architecture/security/
cryptography role passes and owner control precede admission or publication.
