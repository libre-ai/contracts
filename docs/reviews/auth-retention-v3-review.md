# Auth retention v3 review dossier

Status: pending-independent-agent-review. Catalog authorities retention-policy-v3
and retention-policy-schema-v3 remain candidate and unimplemented.
Protocol: Governance `docs/reviews/AGENT-REVIEW-PROTOCOL.md`.

Authoring base 0317fc188581290a45a84ef57c5e964745c29d68. The approved bounded direction
is minimal Auth lookup then RLS, Sessions-owned membership source, disposable current
Auth projection, no history and no persistent controller metadata. The proposal's
prior review does not review this new machine policy or implementation tooling.

| Required role | Scope | State |
| --- | --- | --- |
| architecture | Exact seventeen-rule inheritance, four-class inventory, source/projection ownership, dependency and consumer interfaces | pending |
| security | One-use consume, exact expiry, unverifiable freshness refusal, atomic local derivatives, restore and capability boundaries | pending |
| privacy | Zero post-event OIDC retention, dependent deletion, no membership history, backup ceiling and deletion replay | pending |

Each role performs a dedicated review-only pass on the immutable candidate commit.
Record revision, scope, input/recipe hashes, findings and verdict outside that commit.
Authoring tests are not acceptance. Changed scope invalidates its prior review.
No adopted Governance exception, promotion to locked, SQL or consumer qualification
is implied. Key custody, source-currentness delivery, deletion coupling, real database
races and restore remain implementation admission evidence requirements.
