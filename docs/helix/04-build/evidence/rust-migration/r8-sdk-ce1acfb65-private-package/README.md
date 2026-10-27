---
ddx:
  id: umf.evidence.rust-migration.r8-sdk-ce1acfb65-private-package
  type: evidence
  activity: build
  status: captured
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: umf.evidence.rust-migration.r7-sdk-default-route
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-sdk-default-package-replay-prep
      kind: informed_by
---

# R8 private SDK package: source cohort ce1acfb65

The private SDK archive was built from clean source commit
`ce1acfb65caac61c4437fecd4d06a9bf3e089f99`. The builder reports a fixed-point
source transform with zero generated-input changes. The captured source closure,
captured live closure, and independent live rehash all equal
`4d4fcdc18399339146e5cb710521f68124833adb5cbba6b19a4543bf07aee0e7`.

The archive SHA-256 is
`5513efdca5ddb98fce9c5f8d9e105b07205bed1ebd8cd7cf87354e912da0a02e`; the
sidecar manifest SHA-256 is
`54a333679e8bbd743d03ea5ed36d68a322ad8c43ad0d8cdb542cdf019d4853ca`. An
independent check matched all 1,801 sidecar-listed member hashes; the tarball
contains 1,802 regular files, including `package/manifest.json`. The build
reported 1,795 source/assets. Bun 1.4.3, Rust/Cargo 1.90.0, and wasm-bindgen
0.2.100 are recorded with their exact versions and Cargo lock hash in
[`package-receipt.json`](package-receipt.json).

The archive, sidecar manifest, builder receipt, and inner Rust-default manifest
are stored at `/private/tmp/umf-r8-sdk-ce1acfb65/`. The SDK's own installed
package check also passed against this archive on Node 26.12.1, Bun 1.4.3, and
Chromium 153.0.8010.12. It covered the recorded R3, numeric, cardinality,
facets, Keys, Bit128, and compact Dataset cases, verified 1,120 exports and the
archive routes, and refused the tested tampered/missing native and WASM assets.
See [`installed-test-receipt.json`](installed-test-receipt.json) for the exact
results. Selected relationship behavior is separately recorded in the
[relationship-consumer replay](../r8-relationship-consumers-installed-ce1acfb65/README.md).
The package remains private and explicitly nonpublishable. This evidence does
not retire declarations or establish release readiness.

Rebuild from a clean checkout of source commit
`ce1acfb65caac61c4437fecd4d06a9bf3e089f99`; run these commands from its
repository root with the pinned toolchain:

```sh
mkdir -p .cache/tmp
PATH=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin:/private/tmp/umf-wasm-bindgen-0.2.100/bin:/opt/homebrew/bin:/usr/bin:/bin \
TMPDIR="$PWD/.cache/tmp" \
UMF_RUST_DEFAULT_BUILD_ONLY=1 \
UMF_RUST_DEFAULT_DIST="$PWD/dist" \
bun scripts/package-sdk-rust-default.ts
python3 scripts/package-sdk.py
```
