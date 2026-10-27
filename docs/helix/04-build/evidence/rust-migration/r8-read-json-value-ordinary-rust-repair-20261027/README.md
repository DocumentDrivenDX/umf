---
ddx:
  id: umf.evidence.rust-migration.r8-read-json-value-ordinary-rust-repair-20261027
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-read-json-value-ordinary-20261027
      kind: extends
    - id: umf.evidence.rust-migration.r8-read-json-value-ordinary-diagnostic-source-oracle-20261027
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
---

# Opt-in ordinary JSON Rust repair replay

The dedicated opt-in N-API entry now matches **17 of 18** selected primitive-string
cases against the TypeScript reference on both Node 26.12.1 and Bun 1.4.3.
After the live host `JSON.parse` preflight succeeds, the new Rust continuation
composes through its YAML parser. The Rust TypeScript-profile diagnostic mapper
now reproduces the positioned duplicate-key and permissive-live-preflight
diagnostics without invoking the TypeScript parser from the candidate route.
Its Rust test matches all 40 cases in the separate source-only diagnostic packet
(21 returned value trees and 19 exact error envelopes). The focused
serialization suite passes 24/24, including a low-work malformed-input refusal.
The prior 15/18 capture remains in the [ordinary acceptance packet](../r8-read-json-value-ordinary-20261027/package-parity.md).

One case still differs and is counted as a mismatch in both receipts:

| Case | Remaining difference |
|---|---|
| `array-own-index-under-inherited-setter` | The TypeScript YAML implementation performs five observable inherited index-setter calls while parsing `[41,42]`; the Rust parser performs none. |

The [40-case ordinary diagnostic source packet](../r8-read-json-value-ordinary-diagnostic-source-oracle-20261027/README.md)
shows that permissive live preflight can lead to both diagnostics and returned
values. The Rust mapper uses general scanner state and is scoped to the
TypeScript YAML profile; the 40-case sample does not establish general parser
equivalence. Parser-stage setter effects vary by input and exception boundary.

The receipts compare direct values, prototypes, ordered own keys, descriptors,
public error fields and setter counts. They bind the actual sibling addon loaded
by the dedicated entry to its SHA-256 and pin thirteen selected source files.
The requalified bundle SHA-256 is
`6a3070233ae485bf04b150d2ece7ecee36e3a71fbbfa716ccef64864ae568674`;
the current compiled addon SHA-256 is
`56215b6758d3e80777e0f99f3924929e490886467e64796a931ae85aac7162f0`.
The prior `b250acc9180c95c3758950af9b2735eeacb395422948c5ff2b55927cb411a84a`
receipts are preserved under [historical](historical/prior-addon-b250acc9180c/).
Those selected pins are not a complete transitive source closure or an installed
SDK qualification. The route remains private and opt-in; the public Node and
browser defaults are unchanged. Catalog mode, raw host inputs, shared Context
across host work, WASM/Chromium and release qualification remain open.

## Replay

From the repository root, build the addon with Rust/Cargo 1.90.0 and the
dedicated entry with Bun 1.4.3, placing the addon beside the entry:

```sh
RUSTC=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin/rustc \
  CARGO_TARGET_DIR=/private/tmp/umf-cargo-target \
  /Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin/cargo build --locked \
  --manifest-path bindings/core/node/Cargo.toml
mkdir -p /private/tmp/umf-r8-json-repair-20261027b
cp /private/tmp/umf-cargo-target/debug/libumf_core_node.dylib \
  /private/tmp/umf-r8-json-repair-20261027b/umf_core_node.node
bun build scripts/rust-migration/r8/read-json-value-ordinary-entry.ts \
  --target=node --format=esm \
  --outfile=/private/tmp/umf-r8-json-repair-20261027b/entry.mjs
```

Set `UMF_RUST_ORDINARY_BUNDLE` to that entry and
`UMF_RUST_ORDINARY_ADDON` to its sibling addon, then run
`node` and `bun` on
`scripts/rust-migration/r8/read-json-value-ordinary-package-parity.mjs --expected-mismatches`.
The expected-mismatch mode succeeds only for the exact case ID above and
17/18 matches. Without that flag, the runner exits nonzero while the
mismatch remains. This replay copied the historical entry from
`/private/tmp/umf-r8-json-repair-20261027b/entry.mjs` and the current addon from
`/private/tmp/umf-r8-compact-v4-stable-20261027d/umf_core_node.node` into
`/private/tmp/umf-r8-json-current-requal-20261027/`. The receipts bind the
actual source hashes reported by the runner. Their hashes are pinned in
[SHA256SUMS](SHA256SUMS).
