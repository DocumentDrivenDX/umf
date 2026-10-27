---
ddx:
  id: umf.evidence.rust-migration.r8-sdk-26aa44ca1-private-package
  type: evidence
  activity: build
  status: draft
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

# R8 private SDK package: source cohort 26aa44ca1

This private zero-transform package was built from clean source commit
`26aa44ca1583e3e511eaf7cd23bc137b87782498`. Its captured source closure and
`dist/rust-default-manifest.json` both hash to
`2063ba59a111da1c4812e3a18967487aadc966bed3d858e8da4b358ca97287ff`; the
manifest reports `fixed-point` and zero generated-input changes. The installed
archive SHA-256 is
`8ff3aa827681d759ac7e4bf842b5aef4275d906b3ae3d7f8f433918320aa18e3`; its
sidecar manifest SHA-256 is
`30ff2d1d8785f773a549bbdc6fa7154bcf1446e895791b9586e6a5cbee6bfcdd`.

An independent archive check matched all 1,800 sidecar-listed file hashes; the
archive contains 1,801 regular files including its additional
`package/manifest.json`. The builder reported 1,795 packaged source/assets and
1,801 total archive members. The archive, sidecar manifest, builder receipt,
and inner Rust-default manifest are copied to
`/private/tmp/umf-r8-sdk-26aa44ca1/`. This receipt establishes package
provenance only; installed behavioral replays and release qualification are
separate evidence.

Build commands, from the repository root:

```sh
PATH=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin:/private/tmp/umf-wasm-bindgen-0.2.100/bin:/opt/homebrew/bin:/usr/bin:/bin \
UMF_RUST_DEFAULT_BUILD_ONLY=1 \
UMF_RUST_DEFAULT_DIST="$PWD/dist" \
bun scripts/package-sdk-rust-default.ts
bun scripts/package-sdk.ts
```

The source builder used Bun 1.4.3, Rust/Cargo 1.90.0 and wasm-bindgen 0.2.100.
See [`package-receipt.json`](package-receipt.json) for archive, sidecar,
closure, toolchain, and copied-sidecar hashes.
