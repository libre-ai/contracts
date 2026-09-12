# Auth retention next-major proposal

Status: scoped engineering proposal, not an executable retention authority.
The expected successor of retention v2 is v3; this document neither registers that
policy nor supplies an approval date. Persistence remains blocked. All existing
contract/catalog/schema/fixture bytes remain unchanged. Build Brief candidate review
is separate and receives no acceptance or modification from this proposal.

## Established authority and provenance

The companion JSON pins inspected committed inputs by revision and SHA-256. The
Missions input is `58c05b184d1241f41fe44840df619080b09c91f1`. The owner selected the
minimal pre-authentication index followed by organization RLS. Subsequent explicit
coordination retained Sessions as membership authority and limited maintenance scope
to ephemeral operational capabilities without history. These instructions clarify
this proposal; they do not constitute adoption of a new policy.

- Governance `DATA-LIFECYCLE.md:10-16,38,48`: every record has one owner; projections
  are disposable; Sessions owns memberships; sharing cannot use direct product
  tables. Its Sessions row gives presence and content/outcome durations only.
- Sessions `docs/apps/sessions.md:10,29,54-60`: owners/facilitators manage membership;
  PostgreSQL holds memberships; presence/content retention follows ADR-0002.
  The document supplies neither a membership expiry nor a historical retention bound.
- Governance `IDENTITY-AUTHORIZATION.md:25,28,35`: OIDC state is one-use with a
  ten-minute lifetime; browser sessions have a twelve-hour absolute maximum and
  terminal refusal evidence expires within twenty-four hours after expiry.
- Contracts `contracts/data/retention.v2.json`: the `browser-session` rule belongs
  to `auth-web`, with `P1D` after expiry and twelve active hours. `sessions-content`
  covers `session-content-and-outcome`, not memberships. No membership, subject
  locator, OIDC transaction or controller-scope rule exists. All seventeen existing
  rules, including execution deletion and restore ordering, must be inherited intact.
- Contracts `contracts/COMPATIBILITY.md`, Data policy: a new server class requires a
  new policy candidate plus ADR/privacy review. Existing v1/v2 are immutable.

The prospective Governance ADR-0042 enumerates the selected bootstrap exception and
requires separate retention mapping. Its unadopted working text is engineering
context only; no mutable text is represented as accepted authority. No claimed
controller appointment or membership retention is derived from that ADR.

## Proposed mapping

| Stored responsibility | Owner and source | Proposed lifecycle |
| --- | --- | --- |
| Browser session and terminal refusal evidence | Existing `auth-web` rule | Unchanged: active at most 12 hours, retain at most effective expiry + 24 hours. Effective expiry is the earliest applicable idle, absolute or revocation time; late revocation never extends it. |
| Session locator | Auth-owned derivative of browser session | No independent retention. Atomic source deletion removes it; committed rotation invalidates the old digest immediately. Retaining the current locator alongside refusal evidence grants no authentication. |
| One-use OIDC transaction | Auth responsibility, requiring new reviewed class | At most 600 active seconds. Atomic consume removes state before provider exchange; expiry removes it, with no post-event allowance. Provider failure, unknown response or restart cannot restore consumed state. |
| Source membership | Sessions authority | Outside this Auth change. Existing ownership and lifecycle remain untouched; no new retention or historical class is introduced. |
| Current membership projection | Auth-owned disposable projection of Sessions | No authoritative edits or historical snapshots. Delete/invalidate on source revocation/deletion or loss of valid projection; no independent retention or stale authorization fallback. |
| Subject locator | Auth-owned derivative of the current Sessions membership | Only digest and opaque organization/user tuple. Delete together with invalidated/deleted source projection. Rebuild only from current authority; no guessed first organization. |
| Maintenance scope capability | Existing independently authorized controller required | Operation-local memory capability only; no persistent record, new retention class, backup or history is proposed. Discard on completion, revocation or expiry. |

The Auth projection does not transfer the source of truth. Cross-product delivery
must use a reviewed versioned interface, never direct Sessions SQL or an Auth-local
membership-manager pretending to originate roles. Every authorization needs proven
current facts. A stored revision alone does not prove it is still the latest one.
The actual invalidation/deletion transport and sensitive-write serialization remain
missing contract/implementation evidence; unknown currentness fails closed.

Derived lifetimes are upper bounds, not independent promises to keep records. A
missing source never turns a projection into authority. Source deletion, revocation
or unprovable freshness makes the projection unavailable and invalidates/removes its
locator; no fixed cache grace or detached history is introduced.

## Scope closure without a new owner decision

Sessions source membership retention is unspecified by the inspected machine policy,
but changing it is unnecessary to the authorized Auth projection. It remains outside
this proposal. Do not apply `P90D` content retention or `P1D` session retention by
analogy. Before activation, the consumer must prove current source facts and source
invalidation/deletion coupling through an authorized versioned interface. If it cannot,
it refuses access; this is a missing implementation/authority-interface proof, not
permission to invent an Auth-local source or history.

The controller capability remains local to a bounded operation and is never persisted
or backed up in this proposal. Issuer authority, process confinement and an operation
expiry must be qualified in the consumer; an unbounded operation or self-issued grant
is not accepted. No new controller, numeric policy TTL or privileged pool is appointed.
A future demonstrated need for durable scope records would reopen a separate class
and retention review. No consequential owner choice is needed for the present Auth
retention scope.

Historical membership proof retention, including any separate consumer dependency,
remains outside this proposal. No Build Brief authority or review state changes.

## Expiry execution and backup/restore

Logical refusal applies exactly at expiry, independently of whether a sweep is
running. The new OIDC proposal permits no retained verifier after consumption or
expiry. Bounded expiry deletion must be tested with a controlled clock, including
no-request cleanup. A delayed sweep is a retention failure, not a silently invented
24-hour grace borrowed from the existing daily product job.

Encrypted snapshots retain the existing maximum 35-day expiry and separate keys/access.
This does not extend active data access. Before reopening a restore, discard all
restored browser sessions, their locators and OIDC state; controller capabilities
are memory-only and cannot survive the restore. Invalidate previous cookie/transaction HMAC epochs. Replay accepted deletion evidence
and rebuild membership projections/subject locators only from independently current
Sessions authority. If it or deletion evidence is missing, remain closed. Reissue
controller capabilities only from current authorization. Preserve the inherited
execution-deletion-tombstone-before-execution-record ordering as well.

A restored backup cannot prove current membership, replay safety or current controller
scope. No new historical table, tombstone duration, key custody system or production
provider is created by these requirements.

## Complete successor admission

The complete retention v3 schema/policy must cover only the new persistent Auth
classes and inherit every v2 rule. Source membership lifecycle and persistent
controller metadata are not added. Current projection/deletion interface evidence
and operation-local controller confinement remain consumer admission prerequisites.
The v2 duration grammar accepts positive whole days/years only; represent sub-hour
active limits and zero post-event retention explicitly in the successor without
reinterpreting existing duration fields. Require architecture, security and privacy
review on an immutable commit, plus adopted Governance authority. This proposal
metadata must never be accepted as an executable policy or confused with an adopted catalog authority.

Required vectors include exact 600-second OIDC expiry/consume races, session idle
expiry and late revocation, atomic locator rotation/deletion, source invalidation
versus current authorization, absence/ambiguity refusal, scope expiry/completion,
restore predating revocation and consumption, missing current Sessions authority,
and preservation of all inherited retention rules. Real PostgreSQL, capability
confinement, browser flows and restore qualification belong to implementing consumers;
a documentation check proves none of them. No SQL or consumer implementation is
included in this candidate.
