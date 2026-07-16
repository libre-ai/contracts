# Candidat de revue cryptographique — Notebook Core v2

> **Statut : candidat catalogué — Gate A architecture, sécurité, cryptographie et vie privée en attente.** Ce profil est normatif pour évaluer le candidat v2, mais n'autorise aucune implémentation ni émission de sauvegarde. La promotion `candidate → locked` exige les quatre verdicts agentiques par rôle puis l’autorisation de merge du propriétaire définis par `docs/reviews/AGENT-REVIEW-PROTOCOL.md` ; cette autorisation n’est pas une revue technique ; la conformité du futur moteur et les gates de release resteront distinctes.

Les mots **DOIT**, **NE DOIT PAS** et **DEVRAIT** sont normatifs. Les standards de référence sont RFC 9106 (Argon2id), NIST SP 800-38D (GCM), RFC 4648 §4 (Base64) et RFC 8785 (JCS).

## 1. Surface corrigée

- `contracts/wit/notebook-core-v2/world.wit` exporte une interface autonome `api` et reçoit explicitement un identifiant opaque, le sel et le nonce. Regrouper types et fonctions dans cette interface empêche qu'un `use` inter-interface devienne un import réel dans le composant.
- `contracts/schemas/notebook-backup-seal-request.v2.schema.json` est la projection JSON de test de la requête WIT. Le `recovery-secret` en est volontairement absent et reste un argument binaire séparé.
- `contracts/schemas/notebook-backup.v2.schema.json` définit l'enveloppe persistable.
- `contracts/fixtures/notebook-core-v2/golden-vectors.v1.json` fixe les octets intermédiaires et les mutations.
- le dossier de décision ADR-0003 motive le changement de major.
- `docs/reviews/notebook-core-v2/README.md` décrit les approbations indépendantes à enregistrer sur un commit immuable.

Le WIT transporte `plaintext`, `salt`, `nonce` et `recovery-secret` comme octets déjà décodés. Dans la projection JSON seulement, `plaintext`, `salt` et `nonce` utilisent le Base64 normatif ci-dessous. `seal-backup` renvoie l'enveloppe en JSON JCS UTF-8 sans BOM ni saut de ligne terminal.


## 1A. Canonicalisation de ContextDocument v2

`canonicalize-context` accepte au plus 22 370 044 octets de JSON UTF-8 strict conforme à `context-document.v2.schema.json`, avec au plus 16 777 216 octets cumulés dans les contenus avant **et** après normalisation. Les clés dupliquées, BOM, champs inconnus et JSON imbriqué invalide ou à clés dupliquées sont refusés comme `invalid-document`.

Avant l'appel, le host DOIT remapper chaque ID local sélectionné vers un nouvel identifiant export-scoped `blk_` suivi de 32 hexadécimaux minuscules issus de 16 octets CSPRNG. Le même mapping est appliqué aux racines et liens ; aucun ID local, numéro de révision ou identifiant de bloc exclu ne franchit la frontière. `revision` et `excludedBlockIds` sont donc des champs inconnus refusés.

Les IDs export-scoped sont uniques. Chaque `rootBlockId` et chaque lien désigne un bloc présent. Le cœur trie `rootBlockIds` et chaque tableau `links` par ordre lexicographique croissant des octets UTF-8. Il trie `blocks` par ce même ordre appliqué au champ `id`; aucun autre champ ne participe au comparateur. Aucun doublon sémantique n'est accepté.

Pour `application/json`, `content` est remplacé par le JCS RFC 8785 de la valeur JSON imbriquée. Le parseur traite chaque nombre comme un IEEE 754 binary64 fini, refuse toute valeur de magnitude supérieure à `9 007 199 254 740 991`, puis applique la sérialisation numérique ECMAScript de RFC 8785. Le nombre `333333333.33333329` devient donc `333333333.3333333`; `9007199254740992` et `1e16` sont refusés. Les autres contenus sont conservés octet pour octet après validation UTF-8.

Les budgets sémantiques sont cumulatifs sur le document : profondeur maximale 64 pour chaque valeur JSON imbriquée (racine à profondeur 1, chaque objet/tableau enfant ajoute 1), au plus 100 000 valeurs JSON (chaque objet, tableau ou primitive compte un nœud) et au plus 16 384 liens au total. Les bornes de schéma restent 1 000 blocs et 1 000 liens par bloc. Dépasser un budget retourne `invalid-document`, jamais un fallback ni une sortie partielle.

Les valeurs d'entrée `totalBytes` et `digest` doivent satisfaire le schéma mais sont remplacées, sans comparaison avec leur valeur entrante. `totalBytes` devient la somme exacte des longueurs UTF-8 des champs `content` après normalisation. Le digest est :

```text
SHA-256(UTF8("libre-ai.context-document.v2") || 0x00 || JCS(document sans digest))
```

L'ID du document est `urn:libre-ai:context:` suivi de 32 hexadécimaux minuscules encodant 16 octets CSPRNG neufs et sans sémantique. `createdAt` est absent du document ; un horodatage métier éventuel appartient au contenu explicitement sélectionné. La sortie est le JCS du document normalisé avec `totalBytes` et `digest` recalculés.

## 2. Validation bornée

### Identité opaque

Le host DOIT fournir :

- `schema-version = "libre-ai.notebook-backup-seal-request.v2"` ;
- un nouvel `id` ASCII `urn:libre-ai:backup:` suivi d'exactement 32 caractères hexadécimaux minuscules. Le suffixe encode directement 16 octets issus d'un CSPRNG et NE DOIT PAS contenir d'identifiant utilisateur, nom, date ou autre sémantique.

Le cœur n'importe aucune horloge. `createdAt` n'existe pas dans l'enveloppe claire ; un produit qui en a besoin l'inclut dans le plaintext chiffré. L'enveloppe reprend exactement l'`id` après validation et utilise `schemaVersion = "libre-ai.notebook-backup.v2"`.

### Base64

Toute valeur Base64 DOIT utiliser l'alphabet standard RFC 4648 §4 (`A-Z a-z 0-9 + /`), avec bourrage `=` obligatoire, sans espace ni saut de ligne. Le décodeur DOIT rejeter les bits inutilisés non nuls et toute représentation non canonique ; le test autoritatif est `base64_encode(base64_decode(value)) == value`.

- sel Argon2id : **16 octets exactement**, donc 24 caractères Base64 terminés par `==` ;
- nonce GCM : **12 octets exactement**, donc 16 caractères Base64 sans bourrage ;
- ciphertext : encodage de `C || T`, où `T` est le tag de 16 octets placé à la fin.

### Tailles

| Valeur binaire | Minimum | Maximum |
| --- | ---: | ---: |
| `recovery-secret` | 16 octets | 16 octets |
| plaintext | 1 octet | 16 777 216 octets (16 MiB) |
| ciphertext `C || T` | 17 octets | 16 777 232 octets |
| clé dérivée | 32 octets | 32 octets |
| tag GCM | 16 octets | 16 octets |

L'entrée brute `open-backup.envelope` est limitée à **22 370 044 octets**, maximum d'une enveloppe JCS conforme avec le ciphertext maximal. Les longueurs décodées sont vérifiées en plus des longueurs JSON Schema. Aucun calcul Argon2id n'a lieu avant validation de la structure, des algorithmes, des paramètres et de ces bornes publiques.

Le seul profil recovery v2 est `libre-ai.recovery-secret-code.v1` : le host génère exactement 16 octets par CSPRNG, affiche exactement 32 hexadécimaux minuscules sans séparateur et restaure par décodage hexadécimal strict vers les 16 octets originaux. Le cœur reçoit uniquement ces octets et ne réalise aucune transformation. Une saisie libre, une passphrase, Unicode, trim, casse, séparateurs ou détection heuristique de format sont interdits en v2 ; les introduire exigera un nouveau contrat major-versionné et ses propres vecteurs. La longueur fixe ne remplace pas l'exigence CSPRNG.

## 3. Argon2id vers AES-256

Les paramètres acceptés sont strictement :

| Paramètre | Valeur acceptée |
| --- | --- |
| variante | Argon2id |
| version | `0x13` (champ JSON décimal `19`) |
| mémoire `m` | 65 536 à 131 072 KiB inclus, multiple de 1 024 KiB |
| passes `t` | 3 ou 4 |
| lanes `p` | 1, 2 ou 4 |
| longueur de sortie `T` | 32 octets |

La configuration producteur initiale DOIT être `m=65536, t=3, p=1` jusqu'à qualification de performance sur les navigateurs supportés. Pour la fonction Argon2 de RFC 9106 :

- `P` est exactement `recovery-secret` ;
- `S` est le sel décodé de 16 octets ;
- `K` (secret Argon2 optionnel) est vide ;
- `X` (associated data Argon2 optionnelle) est vide ;
- la sortie brute de 32 octets est directement la clé AES-256 ; aucune chaîne PHC, aucun encodage texte, HKDF, hash ou troncature supplémentaire n'est appliqué ;
- `p` fixe les lanes ; le nombre de threads d'exécution ne change pas le résultat.

Un tuple hors bornes est une requête/enveloppe invalide et n'est jamais « ajusté », arrondi ou remplacé par un défaut.

## 4. Octets AAD exacts

Soit `JCS(x)` la sérialisation RFC 8785 en UTF-8, sans BOM ni terminaison. L'objet de métadonnées contient exactement les champs suivants et aucun autre :

```json
{
  "schemaVersion": "libre-ai.notebook-backup.v2",
  "id": "<id>",
  "cipher": "aes-256-gcm",
  "kdf": {
    "algorithm": "argon2id",
    "version": 19,
    "memoryKiB": 65536,
    "iterations": 3,
    "parallelism": 1,
    "outputLengthBytes": 32,
    "salt": "<Base64 canonique>"
  },
  "nonce": "<Base64 canonique>"
}
```

Les nombres montrés pour `m`, `t` et `p` sont remplacés par les valeurs validées de la requête. Les AAD sont exactement :

```text
UTF8("libre-ai.notebook-backup.v2/aad") || 0x00 || JCS(metadata)
```

Le golden vector fournit le JSON JCS et l'hexadécimal complets. L'`id` opaque, tous les paramètres KDF, le sel et le nonce sont donc authentifiés. Le plaintext, le ciphertext, le tag et le digest ne figurent pas dans les AAD ; GCM authentifie nativement le ciphertext, le tag et leurs longueurs.

## 5. AES-256-GCM et enveloppe

Le chiffrement est exclusivement AES-256-GCM avec : clé de 32 octets issue d'Argon2id, nonce de 12 octets, AAD ci-dessus et tag de 128 bits. Le champ binaire chiffré est `C || T`, sans nonce ni tag préfixé. Réutiliser un couple `(clé, nonce)` est interdit.

Le host DOIT produire, par CSPRNG, un nouvel identifiant de 16 octets, un nouveau sel de 16 octets et un nouveau nonce de 12 octets pour chaque scellement. Ces trois valeurs sont des entrées explicites parce que le composant WASM n'importe aucun aléa. Les valeurs du golden vector sont publiques, déterministes et interdites en production.

## 6. Digest exact

Le digest sert à l'identité/corruption de fichier ; il ne remplace jamais l'authentification GCM. Construire l'enveloppe avec tous ses champs sauf `digest`, puis calculer :

```text
SHA-256(
  UTF8("libre-ai.notebook-backup.v2/digest") || 0x00 ||
  JCS(envelope-without-digest)
)
```

`envelope-without-digest` contient donc `schemaVersion`, l'`id` opaque, `cipher`, l'objet `kdf`, `nonce` et le Base64 canonique de `ciphertext`. Le champ `digest` est **le seul champ exclu**. La sortie est 64 caractères hexadécimaux minuscules. L'enveloppe finale renvoyée par `seal-backup` est `JCS(envelope-with-digest)`.

À l'ouverture, le digest est recalculé mais une égalité de digest n'autorise rien : le succès requiert **à la fois** comparaison en temps constant du digest et vérification du tag GCM.

## 7. Ouverture sans oracle

`open-backup` suit cet ordre logique :

1. borner les octets d'entrée, décoder un JSON UTF-8 strict, refuser clés dupliquées/champs inconnus, valider la version, le schéma, le Base64 canonique et les longueurs ;
2. reconstruire les AAD et le préimage du digest à partir des valeurs validées ;
3. calculer le digest candidat sans prendre de décision d'authentification ;
4. dériver la clé avec Argon2id puis tenter AES-GCM dans tous les cas où l'enveloppe publique est structurellement valide ;
5. ne libérer le plaintext que si le tag **et** le digest sont valides ; sinon effacer tout plaintext transitoire et renvoyer l'unique erreur d'authentification.

Si le recovery secret fourni à l'ouverture est hors des bornes, le cœur DOIT exécuter le même chemin coûteux avec une valeur factice interne de 16 octets, forcer le résultat en échec et zéroïser cette valeur. Il NE DOIT PAS retourner avant Argon2id/AES-GCM ni accepter un plaintext qui s'authentifierait accidentellement avec la valeur factice.

Une implémentation NE DOIT PAS court-circuiter AES-GCM sur mismatch de digest. Les comparaisons de tag sont déléguées à une primitive auditée ; la comparaison du digest est constante. Aucun message, log, métrique ou détail ne distingue mauvais secret, digest faux, tag faux, nonce/sel/ciphertext/AAD modifié.

Le WIT n’expose que l’enum fermé `error-code`. Le host PEUT afficher le libellé statique associé ci-dessous, sans jamais reprendre un diagnostic du cœur ou d’une bibliothèque.

| Code WIT | Libellé host exact | Cas |
| --- | --- | --- |
| `invalid-document` | `Invalid context document.` | entrée de canonicalisation publique invalide |
| `invalid-seal-request` | `Invalid backup seal request.` | requête de scellement ou secret hors bornes |
| `invalid-envelope` | `Invalid backup envelope.` | structure, Base64, taille ou paramètres publics invalides |
| `unsupported-version` | `Unsupported backup version.` | version publique non supportée |
| `resource-limit-exceeded` | `Backup operation unavailable.` | allocation bornée impossible |
| `authentication-failed` | `Backup authentication failed.` | mauvais secret ou toute intégrité cryptographique invalide |
| `internal-failure` | `Backup operation failed.` | échec interne non classifiable |

Les codes sont fermés et les éventuels libellés host sont statiques : aucun identifiant, timestamp, secret, longueur privée, valeur de champ, chemin JSON, plaintext, ciphertext, clé, backtrace ou erreur de bibliothèque n'en franchit la frontière. À l'ouverture, un `recovery-secret` hors bornes produit aussi `authentication-failed`.

## 8. Zéroïsation et capacités WASM

Le cœur DOIT zéroïser avant tout retour succès/erreur, autant que le modèle mémoire le permet : toutes ses copies du recovery secret, la clé de 32 octets, l'état clé AES, la mémoire de travail Argon2id et tout plaintext produit avant un échec global. Ces valeurs NE DOIVENT PAS être placées dans une globale, un cache, une chaîne de caractères, une erreur, un log, un dump, une télémétrie ou une enveloppe, ni être renvoyées. La clé n'est jamais persistée et n'existe que pendant un appel.

Le host reste responsable de ses propres buffers d'entrée/sortie et DOIT écraser ses `Uint8Array` sensibles après l'appel ; JavaScript et les copies de mémoire WASM empêchent toute promesse d'effacement physique absolu. La Gate A examine si ces exigences sont suffisantes et implémentables. La Gate B vérifie leurs effets réels sur les chemins succès, erreur, allocation et panic ainsi que le comportement des bibliothèques retenues.

`world.wit` ne déclare aucun `import` et n'utilise aucune interface de types séparée. Le module et le composant construits DOIVENT avoir une liste d'imports vide : pas de WASI clocks, random, sockets, HTTP, filesystem, key/value, environment ou logging. L'`id` opaque, le sel et le nonce proviennent uniquement de la requête. Le scan du composant final et le test sans WASI appartiennent à la Gate B.

## 9. Gate A — protocole avant implémentation

La Gate A peut et DOIT être réalisée sans moteur Notebook. Elle exige quatre passes review-only séparées — architecture, sécurité, cryptographie et vie privée — sur le même commit immuable, conformément au protocole agent. Chaque reviewer complète son rôle dans [`INDEPENDENT-REVIEW.md`](../../../docs/security/notebook-core-v2-review/INDEPENDENT-REVIEW.md) sans s'auto-approuver ; la passe cryptographie utilise une chaîne indépendante de la Gate S.

La promotion et l'implémentation sont refusées tant que ces passes n'ont pas :

1. reproduit la clé Argon2id, les AAD, le ciphertext/tag, le digest et l'enveloppe avec une implémentation indépendante de celles consignées dans le golden vector ;
2. exécuté le golden backup et ses dix mutations, le golden Context v2, ses douze refus, ses cas limites ressources/nombres et l'unique recovery code ; confirmé les erreurs attendues et l'absence de plaintext sur échec ;
3. examiné les octets AAD/digest, Base64, JCS, nonce/sel, bornes, dérivation `P/S/K/X` et migration v2 ;
4. analysé le modèle anti-oracle, y compris secret hors bornes, digest recalculé par un attaquant et paramètres KDF invalides ;
5. approuvé la sécurité des bornes Argon2id et défini les budgets mémoire/latence à mesurer en Gate B sur les navigateurs supportés ;
6. confirmé que l'interface exportée `api`, les exigences de zéroïsation, la non-persistance et l'absence totale d'import sont vérifiables lors de la Gate B ;
7. lié sa décision, ses outils et ses éventuelles réserves au SHA du commit candidat.

Toute modification normative après approbation invalide les verdicts affectés et impose leur reprise. Une Gate A approuvée par les agents requis puis autorisée au merge par le propriétaire permet uniquement la promotion `candidate → locked` et le développement du moteur derrière les gates ; elle n'autorise ni release, ni sauvegarde utilisateur.

## 10. Gate B — conformité du moteur avant release

Après implémentation, un reviewer indépendant vérifie sur le composant réellement livrable :

1. conformité exacte WIT/schémas/golden et mutations dans les runtimes Rust et navigateur ;
2. choix, versions, provenance et configuration des primitives Argon2id/AES-GCM/JCS ;
3. zéroïsation effective du secret, de la clé, de la mémoire Argon2id et des plaintexts d'échec sur succès, erreur, allocation et panic ;
4. absence de clé/plaintext dans persistance, logs, erreurs, télémétrie, globals et caches ;
5. liste d'imports WASM vide et exécution sans WASI ;
6. budgets mémoire/latence Gate A respectés sur chaque navigateur et classe d'appareil supportés ;
7. même erreur observable pour mauvais secret et mutations cryptographiques, sans libération de plaintext.

La release reste bloquée jusqu'à approbation de la Gate B, puis des gates projet `rust-boundary-value-review` et `local-crypto-and-privacy-review`.
