---
ddx:
  id: umf.evidence.rust-migration.r8-access-temporal-installed-80614a5
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: ADR-006
      kind: informed_by
    - id: TP-001
      kind: informed_by
    - id: CONTRACT-075
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-access-temporal
      kind: informed_by
---

# R8 access-temporal installed SDK candidate evidence

This packet qualifies the opt-in access-temporal binding against the SDK bytes
built from committed source `80614a5877ea0b88f43c61b6653569ad24fa8f40` on
Darwin arm64. The archive was built from a clean `git archive` snapshot after
concurrent edits appeared in the working tree. Its source closure reports
`fixed-point`, zero generated-input transforms, and equal source-tree digests:
`a744d8eea2fbd67d6477fd38c94f74e66956e1d7c342a40ba4a9297218f9dbec`.

The canonical SDK archive is [`umf-sdk.tgz`](umf-sdk.tgz), SHA-256
`167347198e2536daa4fafcbe30b77b14e9a0be61a8cc944e8145018ab6e090d9`.
Its archive manifest SHA-256 is
`ef74349cfa95f92dc860150d32541dfce2d5e2a9690af6537536a67e280943ad`.
The exact installed native addon hash is
`9079d273f8649212eac908d19ac4ff1f654a6fd51fa805240fc058831e276382`; the
archive WASM asset hash is
`ee36ca76c2973c94729cbd98db09883d412c62b98c326f88f05e52869d3c7130`.
The retained [`archive-receipt.json`](archive-receipt.json) records the
archive path, member counts and closure result. The full hash list is in
[`archive-manifest.json`](archive-manifest.json).

## Archive construction

The archive and its manifest were created without modifying the live source
checkout. From the repository root, the clean source snapshot was made with:

```sh
mkdir -p /private/tmp/umf-access-temporal-sdk-source
git archive 80614a5877ea0b88f43c61b6653569ad24fa8f40 | tar -x -C /private/tmp/umf-access-temporal-sdk-source
ln -s /Users/erik/.codex/worktrees/rust-binding-spike/umf/node_modules /private/tmp/umf-access-temporal-sdk-source/node_modules
cd /private/tmp/umf-access-temporal-sdk-source
PATH=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin:/private/tmp/umf-wasm-bindgen-0.2.100/bin:$PATH \
  UMF_RUST_DEFAULT_BUILD_ONLY=1 \
  UMF_RUST_DEFAULT_DIST=/private/tmp/umf-access-temporal-sdk-dist \
  bun scripts/package-sdk-rust-default.ts
mkdir -p dist
cp -R /private/tmp/umf-access-temporal-sdk-dist/. dist/
python3 -c 'import importlib.util; from pathlib import Path; spec=importlib.util.spec_from_file_location("package_sdk", "scripts/package-sdk.py"); module=importlib.util.module_from_spec(spec); spec.loader.exec_module(module); print(module.package(Path.cwd(), Path("/private/tmp/umf-access-temporal-sdk-package")))'
```

The source builder reported `fixed-point`, zero transformations and matching
live/captured source hashes. The package verifier reported 1,808 SDK dist files
and 1,814 archive members. The retained archive and manifest in this directory
are those exact outputs.

## Installed binding replay

The archive was extracted and its exact `dist/umf_core_node.node` installed
alongside the committed opt-in Node adapter sources in a temporary package
copy. Node `v26.12.1` and Bun `1.4.3` each matched all 48 frozen tagged
reference cases, then refused all eight raw-host predecessor inputs. Both
runtimes also refused a non-string Proxy kind before traps, with zero Proxy
trap calls and zero accessor getter calls. Missing-addon and corrupt-addon
package copies failed during module import under both runtimes (`MODULE_NOT_FOUND`
and `ERR_DLOPEN_FAILED`); no fallback route loaded.

The browser candidate used the archive's exact WASM bytes with the committed
opt-in browser adapter bundled for the browser. Microsoft Edge
`156.0.4314.50` supplied the Chromium engine. Chromium matched 48/48 tagged
cases, refused the raw-host controls, observed zero traps/getters, and had no
Node globals. The browser adapter reported `RUST_WASM_BINDING_MISSING` for an
absent binding object and `RUST_WASM_BINDING_PROFILE_MISMATCH` for a wrong
profile. Missing WASM and invalid WASM asset controls both rejected
initialization (`WebAssembly.instantiate()` on empty bytes and invalid magic
bytes, respectively).

The installed candidate commands were:

```sh
node /private/tmp/umf-access-temporal-installed/node/replay.mjs
bun /private/tmp/umf-access-temporal-installed/node/replay.mjs
node /private/tmp/umf-access-temporal-installed/node/binding-control.mjs missing
node /private/tmp/umf-access-temporal-installed/node/binding-control.mjs corrupt
bun /private/tmp/umf-access-temporal-installed/node/binding-control.mjs missing
bun /private/tmp/umf-access-temporal-installed/node/binding-control.mjs corrupt
UMF_CHROMIUM_PATH='/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge' \
  node /private/tmp/umf-access-temporal-installed/wasm-browser-test.mjs
```

Build tools were Rust/Cargo `1.90.0`, wasm-bindgen `0.2.100`, Bun `1.4.3`,
Node `26.12.1`, and Chromium engine `156.0.4314.50`. The SDK archive records
`releaseStatus: private-r7-default-route-qualification-not-publishable`.
The temporal factory remains explicitly selected and opt-in; this packet does
not establish a V4 default route, route retirement, generic core temporal
meaning, Python carrier agreement, or release qualification. The two logical
exports remain open in the R8 retirement ledger.
