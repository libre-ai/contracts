# Contract compatibility policy

## JSON payloads

- Every v1 schema rejects unknown fields unless a named extension map is explicitly declared.
- Required-field removal, rename, type/meaning change, enum narrowing or identifier reinterpretation requires a new major contract.
- `additive-v1` permits an optional field only through a coordinated monorepo change: all consumers qualify the new schema before any producer emits the field. There is no mixed-version production rollout during the Big Bang.
- Consumers read an older payload only through an explicit bounded adapter with fixtures and deletion criteria. Producers emit one current version.

## HTTP APIs

A new route, operation or optional request/response field may remain in v1 if it does not alter existing semantics and follows the coordinated rule above. Every mutation keeps idempotency key, expected revision, stable refusal envelope and CSRF protection for cookie-authenticated browsers. Removing an operation or changing a refusal/authorization meaning requires v2.

## WIT and Biscuit

WIT worlds and authorizer policies are exact major-versioned boundaries. Signature/type changes, new host imports, expanded operations or expanded role rights require a new major plus adversarial conformance vectors. An attenuation or additional denial may remain in the same major only before release; after release it is treated as a security migration with explicit rollout/rollback evidence.

## Evidence

A contract change is incomplete until catalog, schemas/protocol source, positive and negative fixtures, generated/validated projections and every named consumer pass in the same candidate. Contract artifacts never contain secrets or production/personal fixture data.
