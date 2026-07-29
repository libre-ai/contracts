# contracts

The contract authority of the [Libre AI](https://github.com/libre-ai)
constellation: the canonical contract authorities (schemas, vectors,
OpenAPI documents), the catalog, the compatibility policy and their gates.

Born from the hub dismantling (ADR-0020, general activation): history
carried by `git filter-repo` from `libre-ai/libre-ai`, which remains the
clonable archive. The `governance` repository is the other authority.
Consumers carry byte-exact vendored copies under a drift gate (I-05) —
projections, never canonical.

## Verify

```sh
bun install --frozen-lockfile
bun run check
```
