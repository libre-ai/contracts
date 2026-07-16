# Bun canary redistribution notice

This directory records the legal and reproducibility evidence for the exact Bun toolchain used by the Libre AI bootstrap.

## Identity

- Bun revision: `1.4.0-canary.1+57f349f63`
- Bun source commit: `57f349f6307cf89dcfb8893f003c1ef421a74589`
- Upstream: <https://github.com/oven-sh/bun>
- Binaries: unmodified upstream canary artifacts for Linux x64 and macOS ARM64
- Source archive: exact GitHub source archive for the commit above
- WebKit source revision pinned by Bun: `4895f45dfbd0d1226c4d41799887bc0ecb9f341b`
- WebKit upstream: <https://github.com/oven-sh/WebKit>

Checksums are in `SHA256SUMS`. The verbatim upstream notice is in `BUN-LICENSE.md`.

## Licence disposition

Bun itself is MIT-licensed. The executable statically links JavaScriptCore/WebKit under LGPL-2 and other libraries listed in the upstream notice. Redistribution therefore keeps together:

1. the unmodified binary artifacts ;
2. the exact Bun application source archive and build scripts ;
3. the upstream licence/relinking instructions ;
4. the exact Bun and WebKit source revisions ;
5. cryptographic checksums.

The Bun source archive contains `scripts/build/deps/webkit.ts`, which pins the WebKit revision and documents source/prebuilt build modes. The upstream notice explains how to rebuild and relink Bun against a modified JavaScriptCore/WebKit checkout.

This technical compliance record is not legal advice; external redistribution beyond the public CI archive requires owner or counsel approval. It approves the canary only for bootstrap and shared CI while no stable Bun release contains the selected Rust-line commit. It is not a general production approval. G2 must replace it with the first qualified stable Rust release or repeat this review for any different binary.

## Sovereignty exception

GitHub hosts the public source, archive and CI artifacts under the accepted forge decision D03. GitHub is a US service and is not a sovereign runtime provider. No production secret, personal data or application workload is permitted in this release or its CI retrieval path. Clever Cloud Paris/UE remains the only planned runtime target.
