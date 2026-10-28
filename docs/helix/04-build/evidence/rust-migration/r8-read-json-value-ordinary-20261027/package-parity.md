---
ddx:
  id: umf.evidence.rust-migration.r8-read-json-value-ordinary-package-parity-20261027
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.evidence.rust-migration.r8-read-json-value-ordinary-20261027
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-read-json-value-production-interface-proposal-20261027
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-011
      kind: informed_by
---

# Opt-in Rust dedicated-entry parity replay

This replay calls a dedicated opt-in test entry `readJsonValueOrdinary` and
compares its results and public errors against the TypeScript reference. It
covers a deliberately bounded set of 18 primitive-string inputs; the separate
59-case ordinary-profile packet remains reference/default-route evidence and
is not Rust parity evidence.
The default Node and browser package roots retain their prior declarations;
this entry is not a new public package export.
For returned values the replay compares prototypes, ordered own keys, own
property descriptor flags, and values recursively in memory. These direct
checks supplement deep value comparison; large strings are not copied into
the saved receipt when they match.

The rebuilt dedicated-entry addon (release profile, Rust 1.90.0, offline locked
dependencies) matched 17 of 18 cases on Node 26.12.1 and Bun 1.4.3. The two
previous mismatches, `json-duplicate-key` and
`json-live-parse-accepts-malformed-input`, now match because the facade's live
`JSON.parse` preflight is not repeated inside Rust. One mismatch remains:

| Case | TypeScript reference | Opt-in Rust route |
|---|---|---|
| `array-own-index-under-inherited-setter` | returns `[41,42]`, inherited index setter called 5 times | returns `[41,42]`, inherited index setter called 0 times |

The inherited-setter difference remains a counted mismatch, not a passing case.
The ordinary result-frame
JSON parse and result reconstruction run in TypeScript outside Rust `Context`
accounting. Explicit JSON preflight invokes live `JSON.parse` synchronously;
that host work is opaque and unmetered. This evidence does not claim a hard
bound for explicit JSON parsing or for reconstruction allocations.

## Reproduction

From the repository root, build the native addon and package-entry bundle, then
place the built addon beside the bundle so its `createRequire` resolves the
same artifact tested by the replay:

```sh
PATH=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin:$PATH \
  RUSTC=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin/rustc \
  CARGO_TARGET_DIR=/private/tmp/umf-json-read-target \
  cargo build --locked --offline --release --manifest-path bindings/core/node/Cargo.toml
bun build scripts/rust-migration/r8/read-json-value-ordinary-entry.ts --target=node --format=esm --outfile=/private/tmp/umf-ordinary-test-entry.mjs
cp /private/tmp/umf-json-read-target/release/libumf_core_node.dylib /private/tmp/umf_core_node.node
UMF_RUST_ORDINARY_BUNDLE=/private/tmp/umf-ordinary-test-entry.mjs \
UMF_RUST_ORDINARY_ADDON=/private/tmp/umf_core_node.node \
node scripts/rust-migration/r8/read-json-value-ordinary-package-parity.mjs
```

The normal replay exits nonzero while any parity mismatch exists. To verify
that the inherited-setter mismatch remains and all other cases match, pass
`--expected-mismatches`; that mode exits zero only for the inherited-setter case
and an exact 17/18 count:

```sh
UMF_RUST_ORDINARY_BUNDLE=/private/tmp/umf-ordinary-test-entry.mjs \
UMF_RUST_ORDINARY_ADDON=/private/tmp/umf_core_node.node \
node scripts/rust-migration/r8/read-json-value-ordinary-package-parity.mjs --expected-mismatches \
  > docs/helix/04-build/evidence/rust-migration/r8-read-json-value-ordinary-20261027/node-rust-parity.json
UMF_RUST_ORDINARY_BUNDLE=/private/tmp/umf-ordinary-test-entry.mjs \
UMF_RUST_ORDINARY_ADDON=/private/tmp/umf_core_node.node \
bun scripts/rust-migration/r8/read-json-value-ordinary-package-parity.mjs --expected-mismatches \
  > docs/helix/04-build/evidence/rust-migration/r8-read-json-value-ordinary-20261027/bun-rust-parity.json
```

Each machine-readable receipt includes runtime, bundle and addon SHA-256,
selected source-file SHA-256 fingerprints, all matched case IDs, and every
mismatch outcome. The source fingerprints are not a complete transitive build
closure or an installed SDK qualification. The runner verifies that the
recorded addon path resolves to the bundle-relative binary loaded through
`createRequire(import.meta.url)`.
Error code, path, message and name are compared across independently bundled
reference and test entries; shared public constructor identity is not
established by this replay.
The captured build artifact hashes and results are in
[`node-rust-parity.json`](node-rust-parity.json) and
[`bun-rust-parity.json`](bun-rust-parity.json).

The 2026-10-28 rebuilt release addon used Rust 1.90.0 and the locked offline
dependency set. Its bundle SHA-256 is
`6a3070233ae485bf04b150d2ece7ecee36e3a71fbbfa716ccef64864ae568674`, addon
SHA-256 is `69a76d7133938a6d19f675f43f3c5f2ed2c9139cfffc441b99f891e6c6062275`,
and Rust source SHA-256 is
`8c597a3e910d9984762ef73d6450f02a0d914b83c2552e33cc832e3bba82059e`. Receipt
SHA-256 values are Node `29ad6d2b7dca135d14e989846d040a0df5e16ec511bfa7e8c322c0326da6004d`
and Bun `69702705aa26031613a5856ebedaa1963fdfca694027f26188f56aae068648d5`.
