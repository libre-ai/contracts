# Radar engine v2 — normative execution profile

This file is part of `libre-ai:radar-engine@2.0.0`. The WIT signatures, this profile,
`curation-rule-set.v2.schema.json` and the three `radar-*.v1.schema.json` schemas form one
candidate contract. Keywords **MUST**, **MUST NOT**, **SHOULD** and **MAY** are normative.

## 1. Purity and byte model

The component imports no host capability. It MUST NOT access network, DNS, files, clocks,
randomness, environment variables, storage or tenant context. `parse-feed` receives an already
decompressed response body. It never follows links and never performs feed discovery.

All successful results are UTF-8 RFC 8785 JSON Canonicalization Scheme (JCS) bytes with no BOM,
leading/trailing whitespace or final line feed. JSON object member names are the ASCII names fixed
by the schemas. SHA-256 means FIPS 180-4 SHA-256, rendered as 64 lowercase hexadecimal characters.

## 2. Accepted media types and feed dialects

The UTF-8 encoding of `media-type` MUST contain at most 128 bytes and only ASCII characters;
otherwise parsing returns `media-type-unsupported`. The media type parser trims optional ASCII
whitespace around the complete value. Type, subtype, parameter name and charset value are ASCII
case-insensitive. Exactly zero or one parameter is accepted: `charset=utf-8` or
`charset="utf-8"`. Any other parameter, duplicate parameter, malformed syntax or non-UTF-8 charset
returns `media-type-unsupported`.

| Base media type | Accepted document |
| --- | --- |
| `application/rss+xml` | RSS 2.0 only |
| `application/atom+xml` | Atom 1.0 only |
| `application/xml`, `text/xml` | RSS 2.0 or Atom 1.0 |
| `application/feed+json`, `application/json` | JSON Feed 1 or 1.1 |

RSS means an XML `rss` root in no namespace, an exact `version="2.0"`, and one direct `channel`
child. Atom means an XML `feed` root and recognized descendants in the exact
`http://www.w3.org/2005/Atom` namespace. JSON Feed means a root object whose `version` is exactly
`https://jsonfeed.org/version/1` or `https://jsonfeed.org/version/1.1`, whose `title` is a string,
and whose `items` is an array of objects with a non-empty string `id`. A media-specific type whose
document belongs to another family returns `feed-kind-unsupported`. Other roots or versions return
`feed-kind-unsupported`. Broken JSON syntax, a duplicate member name, a missing required JSON Feed
member, a wrong type for `version`, `title`, `items` or item `id`, or an empty item `id` returns
`feed-malformed`.

The only accepted character encoding is UTF-8. One leading UTF-8 BOM is removed. XML declarations
MAY omit encoding or declare `UTF-8` case-insensitively and MUST declare version `1.0`. Invalid UTF-8,
UTF-16/32 BOMs, another XML encoding, gzip/zlib bytes, or a second BOM return
`encoding-unsupported`. The component performs no decompression.

## 3. Parse limits

A `parse-limits` value is valid only when:

- `1 <= max-input-bytes <= 10_485_760`;
- `1 <= max-output-bytes <= 52_428_800`;
- `1 <= max-items <= 5_000`;
- `1 <= max-depth <= 64`.

Any value outside those ranges returns `invalid-limits` before inspecting any other argument.

`max-input-bytes` is the exact length of `payload` as received by WIT, including a BOM. If the
length is greater than the limit, parsing returns `body-too-large` before decoding. Equality is
accepted. The host separately bounds compressed and decompressed HTTP bodies; the engine sees only
the latter. During canonical serialization, the component counts every would-be JCS output byte and
returns `output-too-large` as soon as the next bytes would exceed `max-output-bytes`; equality is
accepted and no partial value is exposed.

`max-items` counts candidate source members before normalization or deduplication: every direct RSS
`channel/item`, direct Atom `feed/entry`, or member of the JSON Feed `items` array counts once. The
first candidate that would make the count greater than the limit returns `max-items-exceeded` and
no partial result. Empty feeds are accepted.

`max-depth` applies to the complete syntax tree, including ignored/unknown fields. The XML root and
the JSON root object have depth 1. Each entered XML element, JSON object or JSON array adds 1;
attributes, object members, scalar values, comments and processing instructions add 0. An empty XML
element still enters its depth. The first structure deeper than the limit returns
`max-depth-exceeded` and no partial result.

These four limits are the complete caller-controlled `parse-feed` budgets in v2. An implementation
MUST support every value in the stated ranges and MUST NOT expose a lower input, output, item, depth,
allocation or time-derived limit. Internal guards MAY only detect a condition that a preceding
normative rule already requires to be refused, and MUST return that rule's refusal code. Timing,
allocation and parser diagnostics are never exposed.

## 4. Hostile XML and JSON

XML parsing is XML 1.0 only. Comments and processing instructions are ignored. CDATA contributes
text. Numeric character references are accepted only for valid XML 1.0 Unicode scalar values. The
five predefined entity references `amp`, `lt`, `gt`, `apos` and `quot` are accepted.

Any document type declaration, internal subset, external subset or entity declaration returns
`xml-dtd-forbidden` before tree construction. Any named entity reference other than the five
predefined references returns `xml-entity-forbidden`. External identifiers are never opened. DTD
refusal has precedence when a document contains both a DTD and a reference.

JSON MUST use the RFC 8259 grammar. Duplicate object member names at any depth return
`feed-malformed` in `parse-feed` and `json-invalid` in `evaluate-rules`. Non-finite numbers and lone
UTF-16 surrogates are invalid. Unknown source-feed XML elements, attributes and JSON members are
ignored after they have consumed byte/depth budgets. Unknown members in `evaluate-rules` inputs are
rejected by their strict JSON Schemas.

## 5. Source-field selection

Before parsing the feed, `source-id` MUST contain at most 256 ASCII bytes and match exactly
`^urn:libre-ai:[a-z][a-z0-9-]*:[A-Za-z0-9._~-]+$`. `base-url` MUST contain at most 2,048 ASCII
bytes and be an absolute canonical HTTP(S) URL under section 6.2. Any failure returns
`invalid-source`. The host supplies the authorized source ID and the final URL after redirects and
SSRF checks.

Only direct children/members listed below are observed. For a scalar XML field, the first direct
occurrence in document order is used. Authors and tags collect all listed occurrences in document
order. Relative HTTP references are resolved against `base-url` under RFC 3986 section 5 before URL
canonicalization. Recognized fields with the wrong source type or an unresolvable URL are absent.
Structural requirements from section 2 still reject the feed.

| Output | RSS 2.0 | Atom 1.0 | JSON Feed 1/1.1 |
| --- | --- | --- | --- |
| feed `title` | `channel/title` | `feed/title` | `title` |
| feed `homeUrl` | `channel/link` | first `feed/link` with absent or `alternate` rel | `home_page_url` |
| item `externalId` | `item/guid` | `entry/id` | `item.id` |
| item `url` | `item/link` | first `entry/link` with absent or `alternate` rel | `url`, then `external_url` |
| item `title` | `item/title` | `entry/title` | `title` |
| item `summary` | `item/description` | `entry/summary` | `summary` |
| item `authors` | every `item/author` | every direct `entry/author/name` | `authors[].name`; v1 also accepts `author.name` |
| item `tags` | every `item/category` | every direct `entry/category@term` | `tags[]` |
| item `publishedAt` | `item/pubDate` | `entry/published` | `date_published` |
| item `updatedAt` | absent | `entry/updated` | `date_modified` |

Atom text constructs are consumed only when `type` is absent or exactly `text`. RSS scalar fields
with a child element are absent. JSON Feed `content_html`, `content_text`, attachments, icons and all
extension members are never copied into normalized output.

## 6. Normalization

### 6.1 Text

`normalize-text(value, limit)` performs these steps in order using Unicode 15.1 data:

1. normalize to NFC;
2. map every scalar with the Unicode `White_Space` property to U+0020;
3. delete remaining U+0000–U+001F, U+007F–U+009F, U+202A–U+202E,
   U+2066–U+2069 and U+FEFF;
4. collapse runs of U+0020 and trim leading/trailing U+0020;
5. keep at most `limit` Unicode scalar values, then trim a trailing U+0020.

The limits are 1,000 scalars for feed/item titles, 5,000 for summaries, 2,048 for external IDs,
500 per author and 200 per tag. Missing or emptied title/summary becomes `""`; missing or emptied
external ID becomes `null`; empty authors/tags are discarded. Authors are exact-string deduplicated
while preserving first occurrence, then limited to the first 20. Tags are exact-string deduplicated,
limited to the first 100 source occurrences, then sorted by unsigned UTF-8 byte order.

The engine has no HTML parser. A source document with an HTML media type is unsupported. Atom
`html`/`xhtml` text constructs, XML title/summary fields containing child markup, and any normalized
title/summary candidate containing U+003C `<` or U+003E `>` are treated as absent. HTML-named JSON
Feed fields are ignored. No script, style, URL or entity is executed or fetched. Consumers MUST still
render every output string as untrusted text, never as markup.

### 6.2 URLs and host

A URL field is retained only when it is an absolute ASCII RFC 3986 hierarchical HTTP(S) URI with no
userinfo and with a valid DNS A-label/IPv4 host or bracketed IPv6 literal. Unicode host labels must
already be IDNA A-labels. Canonicalization lowercases scheme and host, serializes IPv6 per RFC 5952,
removes port 80 for HTTP and 443 for HTTPS, removes the fragment, uppercases percent-escape hex digits
and decodes percent-encoded unreserved characters, then removes every resulting dot segment per RFC
3986 section 5.2.4 and emits `/` for an empty path. Query order and all other query octets are
preserved. The
result must be at most 2,048 Unicode scalars. An invalid URL becomes `null`.

`sourceHost` is the canonical host (including brackets for IPv6) of `base-url`, never a host inferred
from an item link. Feed `homeUrl` and item URLs use the same URL algorithm after relative resolution.

### 6.3 Dates

Atom and JSON Feed dates accept valid RFC 3339 date-times with a four-digit year from 0001 through
9999, a numeric offset or `Z`, optional fractional seconds, and no leap second. RSS dates accept the
ASCII form `[Wdy, ]DD Mon YYYY HH:MM:SS zone`, where weekday is ignored, day has two digits, month is
an English three-letter abbreviation, year has four digits, and zone is `UT`, `GMT`, `Z` or
`+/-HHMM`. Calendar values and offsets must be valid.

Accepted instants are converted to UTC, fractional seconds are discarded toward the earlier whole
second, and output is exactly `YYYY-MM-DDTHH:MM:SSZ`. Numeric negative-zero offsets (`-00:00` and
`-0000`) are invalid because they do not assert a known UTC offset. If UTC conversion would leave the
inclusive year range 0001 through 9999, the date is invalid. An absent or invalid date becomes JSON
`null` and does not reject the item or feed.

## 7. Identifiers, deduplication, ordering and canonical JSON

For each normalized candidate, let `identityValue` be `externalId` when non-null, otherwise `url`
when non-null, otherwise the object containing exactly `authors`, `publishedAt`, `summary`, `tags`,
`title`, and `updatedAt`. Identity material is:

```text
UTF8("libre-ai.radar-item.v1") || 0x00 ||
JCS({"kind": "external-id" | "url" | "content", "sourceId": source-id, "value": identityValue})
```

`deduplicationKey` is SHA-256 of that material. `id` is `urn:libre-ai:radar-item:` followed by the
same digest. Including the authorized source ID prevents collisions between feeds with equal GUIDs;
no cross-source identity is inferred.

Within one parse call, candidates with a repeated `deduplicationKey` are deduplicated after all
candidates have counted against `max-items`; the first source occurrence is retained. Retained items
are sorted by valid `publishedAt` instant descending, null dates last, then `id` by unsigned UTF-8
byte order ascending. Authors preserve their order; tags follow section 6.1. No other array is sorted.

The parse result contains exactly `schemaVersion`, `sourceId`, `baseUrl`, `format`, normalized feed
`title`, normalized `homeUrl`, and `items` conforming to `radar-normalized-feed.v1.schema.json`. Each
item repeats the exact `sourceId` and contains exactly the members required by
`radar-normalized-item.v1.schema.json`. The whole feed and every extracted item, when serialized
independently, use RFC 8785 JCS.

## 8. Rule evaluation

The exact byte length of `item` MUST be at most 262,144 and the exact byte length of `rules` MUST be
at most 524,288. Equality is accepted. The item length is checked first, then the rules length; an
excess returns `body-too-large` before UTF-8 or JSON decoding. These fixed budgets are part of v2 and
MUST NOT be lowered by an implementation.

`evaluate-rules` then parses both inputs without retaining diagnostics. Malformed UTF-8/JSON or a
duplicate key returns `json-invalid`. Each parsed value is reserialized with RFC 8785; byte inequality
with its input returns `json-not-canonical`. The item must then validate against
`radar-normalized-item.v1.schema.json` and satisfy every normalization, URL/host, array ordering,
source binding, identity and digest invariant in sections 6 and 7; otherwise evaluation returns
`item-invalid`. Rules must validate against `curation-rule-set.v2.schema.json`, including a
`version` from 1 through 2,147,483,647; rule IDs must be unique; each non-date value must already
equal `normalize-text(value, 500)`; a `sourceHost` value must
already be a canonical lowercase host; and a `publishedAt` value must be an exact valid
`YYYY-MM-DDTHH:MM:SSZ` timestamp under section 6.3. Failure returns `rule-invalid`. Rule-set `status`,
`tenantId` and `createdAt` do not affect matching; `id` and `version` are copied into the result and
all bytes remain bound by `ruleSetDigest`.

The engine does not authorize tenants. Bun MUST authorize the rule set and item source before calling
the pure component. No tenant value appears in a success result or refusal.

Rules are evaluated in array order. All rules produce one ordered `ruleResults` entry, including
rules after the deciding rule. The first matching rule decides; later matches cannot change it. If no
rule matches, the decision is `reject`, `reasonCode` is `radar.default_reject`, and
`decidingRuleId`/`explanation` are null. Otherwise decision and explanation are copied from the first
matching rule and `reasonCode` is `radar.rule_matched`.

Allowed field/operator pairs and matching are exact and case-sensitive:

- `title`, `summary`, `sourceHost`: `equals` compares the whole scalar string, `contains` compares a
  contiguous Unicode-scalar subsequence, and `prefix` compares from the first scalar;
- `author`, `tags`: the same operation is applied independently to each array member and matches if
  any member matches;
- `publishedAt`: `before` and `after` compare instants strictly; equality is false and null is false.

No locale, collation, case folding, tokenization, stemming, regex, coercion or implicit field fallback
is permitted. `itemDigest` is SHA-256 of the exact canonical item input; `ruleSetDigest` is SHA-256 of
the exact canonical rules input. Output conforms to `radar-rule-evaluation.v1.schema.json` and is JCS.

## 9. Refusals and precedence

The WIT enum is the complete refusal set. Refusals contain only that enum and MUST NOT include input
bytes, excerpts, URLs, XML/JSON names, rule values, identifiers, tenant data, parser messages, offsets,
line/column numbers or implementation details. Hosts MAY map enum `x-y` to public reason code
`radar.x_y`; no other mapping is allowed.

Deterministic `parse-feed` preflight order is invalid limits, source identity/base URL, payload body
length, media type, then encoding. Output size is checked after complete normalization and before
success. XML DTD preflight precedes entity and structural parsing. During structural parsing the first
observed fatal condition wins; depth is checked when entering a structure and item count when
entering a candidate. `evaluate-rules` order is item byte length, rules byte length, JSON validity,
canonical-byte equality, item schema/semantics, then rule schema/semantics. No partial successful
value is returned with a refusal.

## 10. Golden vectors

`contracts/fixtures/radar-engine-v2/golden-vectors.v1.json` and
`contracts/fixtures/radar-engine-v2/security-vectors.v1.json` are the executable corpus indexes. Paths
are repository-relative, input hashes cover raw fixture bytes, and success hashes cover exact JCS
output bytes. The vectors include every accepted dialect, unknown fields, UTC year rollover,
deduplication/content identity, HTML suppression, DTD/entity/reference attacks, BOM/UTF-8 and
JSON-duplicate failures, exact and over depth/item/byte limits, composite refusal precedence, every
rule operator and every closed refusal. Generated boundary cases avoid committing duplicate
multi-megabyte blobs. The review recipe is in `docs/reviews/radar-engine-v2/README.md`.
