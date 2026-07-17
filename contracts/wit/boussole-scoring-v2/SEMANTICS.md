# Boussole scoring v2 — candidate normative semantics

Status: **candidate**. Public scoring remains release-disabled until distinct named humans approve the exact method/dataset hashes for methodology and France/EU legal/privacy review. No agent or dataset editor may approve its own output.

## Boundary and bounds

Inputs are strict UTF-8 JSON without BOM or duplicate keys and conform to:

- `public-vote-dataset.v2.schema.json` — at most 8 MiB;
- `boussole-method.v2.schema.json` — at most 64 KiB;
- `boussole-response-set.v2.schema.json` — at most 256 KiB.

Output is at most 512 KiB and conforms to `local-comparison.v2.schema.json`. All success bytes use RFC 8785 JCS. `computed-at` is an exact valid Gregorian UTC-seconds timestamp. There are no capabilities, identifiers of a person, account, cookie, telemetry or network transfer.
Method IDs use `urn:libre-ai:method:*`; dataset IDs use `urn:libre-ai:dataset:*`.
Reviewers are represented only by opaque `rev_*` identifiers. Their separately hosted professional
attestations are public HTTPS citations bound by SHA-256, explicit publication consent and a
professional-only identity boundary; the component never resolves those citations.

The resolved WIT world exports one `api` interface and MUST have zero imports. Input
byte limits are checked before decoding; any input or successful output above its
limit returns `resource-limit-exceeded`. The decoder rejects BOM, invalid UTF-8,
duplicate object member names, unpaired surrogates, nesting deeper than 64 values
and non-JSON numbers. Validation
and refusal precedence is:

1. resource preflight → `resource-limit-exceeded`;
2. strict JSON, schema and aggregate-publication policy validation → `input-invalid`;
3. exact real Gregorian `computed-at` → `computed-at-invalid`;
4. symmetric supported scale/formula/rounding → `method-unsupported`;
5. IDs and content digests → `digest-mismatch`;
6. hash-bound distinct human approvals and unexpired publication review → `approval-invalid`;
7. statement/response uniqueness and references → `response-invalid`;
8. non-zero final denominator → `denominator-zero`;
9. output byte preflight → `resource-limit-exceeded`.

No refusal crosses the component boundary with a response value, source text,
`reviewerId`, JSON/parser path or implementation diagnostic.

## Structural invariants

Statement IDs and response statement IDs are each unique. Every response refers to exactly one dataset statement. The response set binds the exact dataset/method IDs and digests. The dataset binds the exact method ID/digest. Cross-kind, unknown, duplicate or mismatched references fail closed as `input-invalid`, `response-invalid` or `digest-mismatch` according to the precedence above.

Every dataset carries a hash-bound aggregate publication policy. `minimumGroupSize` is at least 5,
and each included statement MUST have `votesFor + votesAgainst + abstentions + absent >= minimumGroupSize`.
Smaller groups are excluded before publication, individual identity fields are prohibited, and a
roll-call source may be represented only as an identity-free aggregate. Every statement MUST declare
`subjectKind = public-policy-proposal` and `personTargeting = prohibited`; any other or absent value
fails schema validation. Wording remains human language, so the release privacy reviewer verifies
that it concerns a public proposal or issue and neither identifies nor profiles a natural person.
The complete wording and declarations are dataset-digest-bound: any edit invalidates the prior
privacy approval and requires a fresh attestation. The publication review has an exact UTC-seconds
expiry; comparison after that instant returns `approval-invalid`. A real dataset review MAY require
a higher threshold or reject a source, but never a lower threshold.

`responseScale` is strictly ascending, symmetric (`x` implies `-x`) and has a non-zero maximum absolute value `M`. An answer is one exact scale member. A skip carries no value. Review approvals have distinct `reviewerId` values, `actorKind=human`, the two required roles, and `subjectDigest` equal to the object digest.

## Digests

`JCS(x)` is RFC 8785 and `H(label,x)` is lowercase SHA-256 of `UTF8(label) || 0x00 || JCS(x)`.

- method digest: `H("libre-ai.boussole-method.v2", method without approvedAt, digest, approvals)`;
- dataset digest: `H("libre-ai.public-vote-dataset.v2", dataset without publishedAt, digest, approvals)` after sorting statements by ID;
- response-set digest: `H("libre-ai.boussole-response-set.v2", responses)` after sorting responses by statement ID.

Method/dataset approval subject digests equal their computed digest. No output hash includes personal identity.

## `normalized-agreement-v2`

For an answered statement `i`, let `r_i` be the local integer answer and `u_i = r_i / M`.

- With `excluded-from-denominator`: `considered_i = for_i + against_i`; `votesOmitted_i = abstentions_i + absent_i`.
- With `neutral`: `considered_i = for_i + against_i + abstentions_i`; `votesOmitted_i = absent_i`.

If `considered_i = 0`, the statement is omitted. Otherwise:

```text
publicPosition_i = (for_i - against_i) / considered_i
contribution_i = u_i * publicPosition_i
```

A skipped or missing response omits all votes (`for + against + abstentions + absent`) and emits no contribution. `denominator` is the sum of `considered_i` for answered usable statements. `omitted` is the sum of `votesOmitted_i` for answered statements plus all votes for skipped/missing/zero-denominator statements. A zero final denominator returns `denominator-zero`.

The global score is:

```text
sum(contribution_i * considered_i) / denominator
```

All intermediate operations use exact signed integer/rational arithmetic with checked overflow. Under schema maxima, total considered votes are at most `12,884,901,885,000`, total omitted votes `17,179,869,180,000`, the absolute weighted numerator `21,474,836,475,000`, and `M × denominator` `64,424,509,425,000`. Six-decimal scaling can reach `21,474,836,475,000,000,000`, above unsigned 64-bit; the representation MUST accommodate that exact value (signed 128-bit or an equivalent checked rational representation). Each emitted contribution and score is rounded to six decimal places, ties-to-even; negative zero is emitted as `0`. Contributions are sorted by statement ID.

## Refusal and release behavior

`contracts/fixtures/boussole-scoring-v2/security-vectors.v1.json` is the normative
bounded security corpus for raw decoding, refusal coverage, byte ceilings,
redaction and maximum arithmetic. Errors expose only the closed WIT enum and no
response, political position, source text, reviewer identity or implementation diagnostic. A method/dataset without valid independent approvals returns `approval-invalid`. The release caller
verifies each attestation URI, digest, professional capacity and explicit publication consent before
admitting the object; network resolution is deliberately outside the pure component. This runtime
check does not replace the release feature gate: code and vectors MAY be built, but public scoring
MUST remain disabled until both human approvals are recorded against the exact candidate hashes.
