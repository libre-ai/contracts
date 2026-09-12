# Retention v3 candidate semantics

Status: candidate, unimplemented, not adopted. Authority reference is the prospective
ADR-0042 boundary, not a declaration that its reviews or adoption are complete.
No approvedAt is fabricated. Architecture/security/privacy reviews remain pending in
`docs/reviews/auth-retention-v3-review.md`. No consumer or SQL storage is admitted.

## Exact inheritance and ownership

The first seventeen rules and execution restoreOrder are identical to retention v2.
Existing v1/v2 files are immutable. Their duration grammar remains whole positive
ISO days/years; no conversion of P1Y to a fixed seconds count is introduced here.
The v3 schema fixes the canonical rule inventory/order, owners, triggers and bounds;
unknown fields, duplicate/reordered rules and changed inheritance refuse.

Four new PostgreSQL Auth-owned classes are added: OIDC transactions, keyed session
locators, current membership projections, and verified-subject locators. Sessions
continues to own the source membership; Auth cannot author that relationship or retain
history. No membership-source lifecycle change or persistent controller record exists.

## One-use OIDC time and deletion

maximumActiveSeconds is a maximum of 600 seconds, not a minimum time-to-live. Producers
may set an earlier expiry, including subminute intervals. Positive integer milliseconds
in conformance vectors are precise clock instants; expiresAt must be greater than
createdAt and no later than createdAt + 600000 milliseconds. Invalid/unsafe/noninteger
clock values or now before creation refuse. At now >= expiresAt no state may be used
or retained. Atomic consume deletes before provider exchange; consumed state never
returns on exchange failure, crash or lost response. postEventRetentionSeconds is
exactly zero. No daily sweep grace, retry copy or fallback verifier store is allowed.
Actual physical deletion and concurrent one-use consume require real database tests;
the synthetic evaluator does not prove these properties or authorize persistence.

## Dependent retention, freshness and rotation

A session locator has no independent lifetime and is removed atomically with its
browser-session row. Digest rotation invalidates the old locator atomically and creates
only the new mapping. A retained locator for terminal refusal evidence does not make
the session valid. Browser-session retention and active caps remain the inherited rule.

Auth membership projection requires a positively verified current Sessions source,
not a stored revision presumed latest. Source deletion/revocation, projection
invalidation, or unverifiable freshness forbids use and removes the projection and its
subject locator without grace or history. Subject locator depends on that projection
and may never extend it. Unknown source currentness fails closed. No stale-while-
revalidate access, guessed organization, cross-product direct SQL, or locally authored
membership authority is introduced. Transport of current facts and atomic local
projection/locator mutation must be proved through an authorized versioned interface.
This contract defines the refusal/deletion requirement, not a distributed transaction
or an already-existing invalidation service. An implementation unable to establish
currentness or deletion coupling cannot be admitted.

## Restore and backup

The existing encrypted backup ceiling remains P35D. Backups do not extend active
retention or prove current authorization. Before reopening discard all restored Auth
sessions, locators, OIDC rows and membership projections; invalidate old cookie and
transaction key epochs; replay accepted deletion evidence. Rebuild only projections
and subject locators from independently current Sessions authority. Missing authority
or deletion evidence blocks reopening. Preserve inherited execution-tombstone-before-
execution-record ordering. Controller capability is memory-only operation state and
cannot survive restoration; no persisted controller grant or history is created.

## Conformance and limits

`contracts/fixtures/retention-v3/vectors.json` contains portable synthetic decision
vectors. `retain` means only that the stated retention predicate holds, never login or
SQL authorization. `delete` requires immediate logical refusal and deletion; `deny`
means input or restore prerequisites cannot establish conformance; `rebuild` permits
only the above reconstruction after all represented prerequisites are true, not service
activation. Facts are supplied by a qualified trusted boundary, not by callers.

Schema mutation fixtures and the focused coverage gate reject altered duration units,
triggers, dependencies, owner transfer, restore relaxation and inherited rules.
Consumer admission additionally needs real PostgreSQL expiry/consume races, clocked
no-request cleanup, source invalidation against sensitive writes, cross-organization
refusals, role confinement, browser flows and a pre-revocation backup restore drill.
The candidate and repository checks alone qualify none of those implementations.
