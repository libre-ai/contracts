# Contracts Canonical Agent Rules

## Authority

This repository is the **contract authority** of the Libre AI constellation
(ADR-0020, general activation 2026-07-28): the canonical contract
authorities, their vectors and fixtures, the catalog
(`contracts/catalog.v1.json`) and the compatibility policy
(`contracts/COMPATIBILITY.md`). The `governance` repository is the other
transverse authority
(https://raw.githubusercontent.com/libre-ai/governance/main/AGENTS.md) —
doctrine, invariants and fleet gates live there, never here.

## Boundaries

- Everything canonical about a contract lives here. Consumers (SDKs,
  products) carry byte-exact vendored copies under a drift gate (I-05):
  verified projections, never hand-edited, never canonical.
- Locked contracts are immutable and major-versioned; evolution follows
  `contracts/COMPATIBILITY.md`.
- Implementation conformance (vector verifiers bound to an SDK) is proved
  in the implementing repository, against this authority at a pinned
  revision — never here.
- Protocol-authority documents (application specifications) resolve in the
  hub archive during dismantling, then in each product repository (γ 3.5).

## Quality gates

Run `bun run check` (Bun floor and toolchain, contract verification —
schemas, catalog, fixtures, HTTP operations —, secret scan, personal-data
boundary, lint, typecheck, tests). Never hide a red test.

## Agents

- Read actual state before editing.
- Stage files before running tree-walking gates.
- Contract changes require role-separated technical review; a locked
  contract never changes in place.
- Security > quality > performance > completeness.
