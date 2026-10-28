---
ddx:
  id: umf.evidence.rust-migration.r8-protobuf-descriptor-document-installed
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-003
      kind: informed_by
    - id: ADR-006
      kind: informed_by
---

# R8 Protobuf descriptor/document installed qualification harness

The bounded installed receipt is [`darwin-arm64-sdk-receipt.json`](darwin-arm64-sdk-receipt.json). Its archive and source-closure hashes identify the exact tested cut. This evidence does not authorize default-route retirement or package release.

The runner is `scripts/rust-migration/r8/protobuf-descriptor-document-installed.mjs`. It requires explicit SHA-256 pins for the immutable archive and source closure, verifies the archive's fixed-point/source-input hashes against current repository files, verifies all tar members against the package manifest, checks Node/browser default and `./reference` routes plus native/WASM assets, and loads the frozen packets from the repository under independent pins. It then performs offline dependency resolution, Node and Bun host replay, and a real Chromium browser replay. It writes the receipt only after every gate succeeds. The packet JSON files intentionally are not assumed to be package members.

The independent frozen inputs currently pinned by the runner are:

- `docs/helix/04-build/evidence/rust-migration/r8-protobuf-descriptor-predecessor/predecessor.json`: `226eb9fb46781b45e82789e5efaf80a2d22c298c5fa0893a81d7a91cd5852f41` (18 predecessor operation vectors).
- `tests/rust-core/protobuf-read-descriptor-predecessor.json`: `8b123ca2343ae272969c5ecefaf9dd7394e84f24209a99ad20969a29b5342647` (14 descriptor-reader cases).

Focused source-build observations on 2026-10-28: Node and Bun each replayed all 18 operation vectors and 14 descriptor-reader cases on the V4 default and TypeScript reference routes. A real Chromium 153.0.8010.12 run replayed the same cases on both routes, confirmed the WASM asset loaded once, no Node globals or external requests, getter ordering, public `UmfError` identity, and copied output ownership. The browser run used the fresh local browser build produced by `bun /private/tmp/build-umf-protobuf-v4-browser.mjs`; it is a development observation, not an installed-package receipt.

The direct binding browser test also passed on Chromium 153.0.8010.12 with a freshly generated local WASM package, including public error-constructor injection, malformed diagnostic, getter ordering, unknown-wire round-trip, copied input/output, and over-limit admission. This does not establish installed-package behavior.

The first immutable fixed-point archive, SHA-256
`852ac31aa575a900f1440c663f9e7962d5c7aa9ed9c1a0ff91ba6a610b36d691`,
passed the harness's offline dependency-resolved install and Node, Bun, and
Chromium 153 replay. The default route passed 18 frozen operation vectors and
14 descriptor-reader cases per host, with native dispatch on Node and Bun;
`./reference` passed the same cases without native dispatch. Chromium loaded
the package WASM once and recorded no Node globals, external requests, or page
errors. This source cut was superseded by subsequent WASM binding and harness
edits; only a receipt whose closure matches the current source can qualify a
later cut.

Qualification limits: the frozen packet covers the declared bounded predecessor subset only. General non-byte raw-host parity is not claimed. Runtime missing/corrupt WASM refusal has not been exercised in Chromium; static missing/corrupt asset refusal is covered by `tests/rust-migration/r8-protobuf-descriptor-document-qualification-core.test.mjs`. No complete parity claim is made, and no gap-ledger retirement is authorized by this evidence.
