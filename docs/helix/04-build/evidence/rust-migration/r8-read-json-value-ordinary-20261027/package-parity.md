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

Node 26.12.1 and Bun 1.4.3 each matched 15 of 18 cases. The same three cases
mismatch on both runtimes:

| Case | TypeScript reference | Opt-in Rust route |
|---|---|---|
| `json-duplicate-key` | `UmfError(SYNTAX, "Map keys must be unique at line 1, column 8:\n\n{\"x\":1,\"x\":2}\n       ^\n")` | `UmfError(DUPLICATE_KEY, "Duplicate object key")` |
| `array-own-index-under-inherited-setter` | returns `[41,42]`, inherited index setter called 5 times | returns `[41,42]`, inherited index setter called 0 times |
| `json-live-parse-accepts-malformed-input` | a monkeypatched live `JSON.parse` accepts `{`, then YAML parsing reports `Flow map must end with a } at line 1, column 2` | Rust's internal JSON preflight reports `Invalid JSON syntax` |

These remain counted mismatches, not passing cases. The ordinary result-frame
JSON parse and result reconstruction run in TypeScript outside Rust `Context`
accounting. Explicit JSON preflight invokes live `JSON.parse` synchronously;
that host work is opaque and unmetered. This evidence does not claim a hard
bound for explicit JSON parsing or for reconstruction allocations.

## Reproduction

From the repository root, build the native addon and package-entry bundle, then
place the built addon beside the bundle so its `createRequire` resolves the
same artifact tested by the replay:

```sh
cargo build --locked --manifest-path bindings/core/node/Cargo.toml
bun build scripts/rust-migration/r8/read-json-value-ordinary-entry.ts --target=node --format=esm --outfile=/private/tmp/umf-ordinary-test-entry.mjs
cp target/debug/libumf_core_node.dylib /private/tmp/umf_core_node.node
UMF_RUST_ORDINARY_BUNDLE=/private/tmp/umf-ordinary-test-entry.mjs \
UMF_RUST_ORDINARY_ADDON=/private/tmp/umf_core_node.node \
node scripts/rust-migration/r8/read-json-value-ordinary-package-parity.mjs
```

The normal replay exits nonzero while any parity mismatch exists. To verify
that the three known mismatches remain present and all other cases match, pass
`--expected-mismatches`; that mode exits zero only for exactly these three case
IDs and exact 15/18 counts:

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
