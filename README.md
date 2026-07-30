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

## État du projet

<!-- libre-ai:project-status:begin -->
<!-- Section générée depuis project.v1.yaml — ne pas éditer à la main. -->

- Situation actuelle : Née verte en γ 3.3 (149 commits, 88 entrées de catalogue vérifiées) ; les produits et briques résolvent contrats, fixtures et datalog à travers cette git-dep épinglée.
- Maturité : usable
- Exposition : usable-verifiable
- Confiance : medium
- Preuves vérifiées le : 2026-07-30
- Avancement : 50 % du périmètre actuellement déclaré

<!-- libre-ai:project-status:end -->

La fiche [`project.v1.yaml`](./project.v1.yaml) est l'autorité de l'état du projet ; cette section en est générée et le gate de flotte échoue si elles divergent.
