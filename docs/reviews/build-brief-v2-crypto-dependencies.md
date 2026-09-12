# Build Brief v2 strict cryptography dependency evidence

Scope: authority-fixture verification only; no production signer, key registry or
consumer admission. Exact pins live in package.json/bun.lock and the independent
oracle Cargo.toml/Cargo.lock. This document is authoring evidence, not role review.

## Security rationale and profile

Native Bun/OpenSSL verification accepted identity-key identity-R zero-S forgeries.
A format-valid registry record does not establish key unforgeability. The remedy
uses existing curve primitives rather than bespoke EC arithmetic or a weak-point
blacklist: canonical nonidentity prime-subgroup A and R plus canonical scalar and
strict verification. SEMANTICS states the full protocol profile. `zip215:false`
alone is insufficient to declare our additional prime-subgroup R/A requirement.

## JavaScript authority verifier

- `@noble/curves` 2.4.0, MIT, exact sole runtime dependency `@noble/hashes` 2.4.0, MIT.
- Official repository: https://github.com/paulmillr/noble-curves
- npm gitHead: `656c4364dffa44c64aa0c49914b8000b278b67a9`.
- Curves npm integrity:
  `sha512-P4/62zrgfH33CneE3Dn4WhJVA22YUU0eR51wKIan4NVRvwsA0YnPTwWGpNbpuacSujmSFLvyzpyuR30+fbq2Ew==`.
- Hashes npm integrity:
  `sha512-X5XaVWZIBCT7HHZGm5I7ZQXDwLG+bGXuSrMQAW+7Zvl87h1kmc1ZB1VSRJcpUfoUrGQp4Fkoxm5kZ+Ms+aW+eA==`.
- 2026-09-12: an isolated, scripts-disabled npm installation followed by
  `npm audit signatures --json --include-attestations` verified both registry
  signatures and both attestations; zero invalid/missing. Install tarball integrity
  is pinned by the committed Bun lock. Original MIT notices remain in packages.

Primary sources inspected:
[exact release](https://github.com/paulmillr/noble-curves/releases/tag/2.4.0),
[exact Edwards implementation](https://github.com/paulmillr/noble-curves/blob/2.4.0/src/abstract/edwards.ts),
[official security history](https://github.com/paulmillr/noble-curves/blob/2.4.0/README.md#security),
[MIT license](https://github.com/paulmillr/noble-curves/blob/2.4.0/LICENSE).
The current README reports Trail of Bits/OpenAI review at 2.3.0 in August 2026
and earlier Cure53 review at 1.6.0 covering Edwards/Ed25519. Those are upstream
scope statements, not an independently established full audit of 2.4.0 by this
change. Provenance proves artifact origin, not correctness. Exact-version local
qualification is the shared positive/adversarial corpus plus independent oracle;
role review of this integration is still mandatory.

## Independent Rust oracle

`tools/quality/build-brief-crypto-oracle` is an opt-in, nonpublished fixture runner.
It imports no TypeScript verification code and reads the same immutable vector
bytes. Exact dependencies: curve25519-dalek 4.1.3 and ed25519-dalek 2.2.0 (BSD-3-Clause),
base64 0.22.1 (MIT OR Apache-2.0), serde_json 1.0.149 (MIT OR Apache-2.0).
Cargo.lock pins registry checksums; the authoring run used cached registry crates
with `--locked --offline`, rustc 1.97.0. Transitive declared licenses were inspected;
no vendored source is relicensed by this fixture runner's EUPL project license.
The runner makes no blanket audit claim about its whole dependency graph.

[dalek verify_strict documentation](https://docs.rs/ed25519-dalek/2.2.0/ed25519_dalek/struct.VerifyingKey.html#method.verify_strict)
explicitly distinguishes weak-key and malleability behavior. Additional canonical
point roundtrip, nonidentity and torsion-free checks apply to both A and R before
verify_strict. All eight torsion points and seven BASE+nonidentity-torsion points
come from curve25519-dalek constants/operations; no custom curve implementation.

```sh
bun run check:build-brief
cargo run --locked --offline --manifest-path tools/quality/build-brief-crypto-oracle/Cargo.toml -- contracts/fixtures/build-brief-v2/strict-ed25519-vectors.json
cargo clippy --locked --offline --manifest-path tools/quality/build-brief-crypto-oracle/Cargo.toml -- -D warnings
```

The Rust recipe is explicit and separately recorded; a normal Bun check does not
pretend that it ran the Rust oracle. Fixture vectors carry only public material
and synthetic signatures. No private signing key or production provider is added.
