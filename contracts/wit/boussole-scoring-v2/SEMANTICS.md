# Boussole scoring v2 — candidate normative semantics

Status: **candidate**. Public scoring remains release-disabled until distinct named humans approve the exact method/dataset hashes for methodology and France/EU legal/privacy review. No agent or dataset editor may approve its own output.

## Boundary and bounds

Inputs are strict UTF-8 JSON without BOM or duplicate keys and conform to:

- `public-vote-dataset.v2.schema.json` — at most 8 MiB;
- `boussole-method.v2.schema.json` — at most 64 KiB;
- `boussole-response-set.v2.schema.json` — at most 256 KiB.

Output is at most 512 KiB and conforms to `local-comparison.v2.schema.json`. All success bytes use RFC 8785 JCS. `computed-at` is an exact valid UTC-seconds timestamp. There are no capabilities, respondent/user identifiers, account, cookie, telemetry or network transfer. Method and dataset inputs do carry public professional `reviewerId` attestation metadata; these identifiers are never linked to local responses and never cross the output/error boundary.

## Structural invariants

Statement IDs and response statement IDs are each unique. Every response refers to exactly one dataset statement. The response set binds the exact dataset/method IDs and digests. The dataset binds the exact method ID/digest. Unknown, duplicate or mismatched references return `response-invalid` or `digest-mismatch`.

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

All intermediate operations use exact signed integer/rational arithmetic with checked overflow. Under the schema maxima, total considered votes are at most `3 × 4,294,967,295 × 1,000 = 12,884,901,885,000`; total omitted votes are at most `4 × 4,294,967,295 × 1,000 = 17,179,869,180,000`; `M × denominator` is at most `64,424,509,425,000`, and the absolute accumulated weighted numerator is at most `5 × 4,294,967,295 × 1,000 = 21,474,836,475,000`. These bounds fit exactly in a signed 64-bit integer and in the JSON safe-integer range; implementations MUST use at least signed 64-bit checked accumulators and MUST NOT use floating point before final decimal rounding. Each emitted contribution and score is rounded to six decimal places, ties-to-even; negative zero is emitted as `0`. Contributions are sorted by statement ID.

## Refusal and release behavior

Errors expose only the closed WIT enum and no response, political position, source text, reviewer identity or implementation diagnostic. A method/dataset without valid independent approvals returns `approval-invalid`. This runtime check does not replace the release feature gate: code and vectors MAY be built, but public scoring MUST remain disabled until both human approvals are recorded against the exact candidate hashes.
