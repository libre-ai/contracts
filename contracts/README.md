# Canonical contracts

JSON Schema, OpenAPI, WIT and Biscuit policies are the only cross-module protocol authority. Generated Rust/TypeScript types are disposable projections and cannot override these files.

## Layout

- `catalog.v1.json` — machine-readable ownership and compatibility registry ;
- `schemas/` — strict JSON Schema 2020-12 payloads ;
- `openapi/` — OpenAPI 3.1 HTTP surfaces and complete domain command/query inventory ;
- `wit/` — capability-free Rust/WASM component worlds ;
- `authz/` — deny-by-default Biscuit authorizer policies ;
- `fixtures/` — portable positive and explicit negative schema vectors.

OpenAPI `x-libre-ai-domain` lists the complete protocol from each application specification. Only commands/queries crossing HTTP appear under `paths`; local and offline commands remain visible without becoming endpoints.

## Verification

`bun run check:contracts` fails on:

- uncataloged/missing/duplicate authority ;
- non-strict or invalid JSON Schema and unresolved references ;
- rejected positive fixture or accepted negative/unknown-field fixture ;
- divergence between application protocols and OpenAPI inventory ;
- unversioned routes, missing idempotency/revision/CSRF or refusal responses ;
- WIT host imports and malformed package/world conventions ;
- Biscuit allow rules without user, role and matching tenant, or missing final deny.

Cargo tests parse/resolve all WIT worlds with `wit-parser` and parse both Biscuit policy sources with `biscuit-parser`. Security behavior remains subject to end-to-end authorizer vectors when the G2 authz capability is implemented.
