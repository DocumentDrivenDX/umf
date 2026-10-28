---
ddx:
  id: umf.evidence.rust-migration.r8-access-temporal-default-installed-5cddac8
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
    - id: umf.evidence.rust-migration.r8-access-temporal-installed-80614a5
      kind: informed_by
---

# R8 access-temporal V4 installed default-route evidence

This evidence is limited to the installed SDK archive built from committed
source `5cddac83425d406571057ec1ba350eb5e936ee03` on Darwin arm64. The
source was snapshotted with `git archive` into a private temporary directory;
concurrent worktree changes were excluded. Builder output reports
`fixed-point`, zero source transforms, and matching source closure digests:
`81038dee03caaf35f2fea118f7bc89461dddc943b62dbfc3a3ea54afa8677a6b`.

The retained [`umf-sdk.tgz`](umf-sdk.tgz) SHA-256 is
`1701e8197490c7e369a3c32f2fba887cc99c51b175485d488924e3c250c88003`.
Its [`archive-manifest.json`](archive-manifest.json) SHA-256 is
`35bfd0f4eee501aaa390684f4b12e36bf3f42e41277d5ce2e0cc3b53a2efe545`.
The archive verifier reported 1,808 files and 1,814 tar members. The package
routes `.` to `dist/umf-node.js` for Node and `dist/umf-browser.js` for browser;
`./reference` remains `dist/umf.js`. The exact Node addon SHA-256 is
`93ad0ba67a2b96a0daae315643e5d2f976e91a1ee83a77539dca407ceaa585bc`; the
WASM file SHA-256 is
`cb34eaeacc75554bcdeb829c79272fc37a09b622208ace53ed1fcaa0a9c2938f`.

## Installed runtime results

The extracted archive was run directly, without rebuilding source after
packaging. Node `v26.12.1` and Bun `1.4.3` each matched the 48 tagged packet
cases on the installed default route and `./reference`. Each also refused all
eight raw JavaScript host values with `TypeError: Access temporal requires
text`, before proxy traps or accessor getters ran (zero traps and zero getter
calls). Edge `156.0.4314.50` (Chromium engine) loaded the archive's default
browser bundle, reference bundle and WASM bytes from a local HTTP server. Its
default and `./reference` outputs matched each other on all 48 tagged cases
and all eight raw-host refusals, also with zero proxy traps/getter calls.

The non-ASCII packet case `date-9` contains full-width digits
`２０２４-01-01` (UTF-16 units `[65298,65296,65298,65300,45,48,49,45,48,49]`).
The browser replay served its inline fixture as UTF-8 and confirmed the string
length is 10. Node, Bun and Chromium default/reference each returned the frozen
`RangeError: Gregorian date syntax` outcome; all 48 tagged packet outcomes
matched in each host. The UTF-8 response header is part of the browser harness
provenance because omitting it caused browser-only mojibake during an earlier
probe; that probe was discarded and not counted as evidence.

Missing and zeroed native addon controls failed closed during Node import with
module-not-found and invalid Mach-O loader errors. In Edge, a missing WASM
asset failed initialization with `WebAssembly.instantiate(): expected magic
word ... found 45 72 72 6f` (the local server's 404 body); a zeroed WASM asset
failed with `WebAssembly.instantiateStreaming(): expected magic word ... found
00 00 00 00`. Both rejected initialization before a temporal result was
returned. These controls show failure for these specific missing/corrupt
conditions; they do not establish every packaging or runtime failure mode.

## Reproduction

Source snapshot and fixed-point archive construction:

```sh
mkdir -p /private/tmp/umf-access-temporal-default-source-5cddac8
git archive 5cddac83425d406571057ec1ba350eb5e936ee03 | tar -x -C /private/tmp/umf-access-temporal-default-source-5cddac8
ln -s /Users/erik/.codex/worktrees/rust-binding-spike/umf/node_modules /private/tmp/umf-access-temporal-default-source-5cddac8/node_modules
cd /private/tmp/umf-access-temporal-default-source-5cddac8
PATH=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin:/private/tmp/umf-wasm-bindgen-0.2.100/bin:$PATH \
  UMF_RUST_DEFAULT_BUILD_ONLY=1 \
  UMF_RUST_DEFAULT_DIST=/private/tmp/umf-access-temporal-default-dist-5cddac8 \
  bun scripts/package-sdk-rust-default.ts
mkdir -p dist
cp -R /private/tmp/umf-access-temporal-default-dist-5cddac8/. dist/
python3 -c 'import importlib.util; from pathlib import Path; spec=importlib.util.spec_from_file_location("package_sdk", "scripts/package-sdk.py"); module=importlib.util.module_from_spec(spec); spec.loader.exec_module(module); print(module.package(Path.cwd(), Path("/private/tmp/umf-access-temporal-default-package-5cddac8")))'
```

The committed V4 default-route selection test passed 3/3 under Bun 1.4.3:
`bun test tests/rust-core/access-temporal-v4-default-route.test.mjs`.

The reproducible installed-archive suite is retained in
[`scripts/rust-migration/r8/access-temporal-installed-suite.mjs`](../../../../../../scripts/rust-migration/r8/access-temporal-installed-suite.mjs).
It extracts the retained archive into a temporary installation, installs it
under `node_modules/@umf/core`, and runs the installed package exports in Node
and Bun, Node native-addon controls, and Edge Chromium tagged/raw-host plus
missing/corrupt WASM controls. The browser harness sets both a UTF-8 document
meta tag and `text/html; charset=utf-8` response header so the full-width
digits in `date-9` reach JavaScript unchanged. The suite removes its temporary
installation on exit. Its packet is the committed
[`reference-packet.json`](../r8-access-temporal/reference-packet.json).

Run the entire installed-archive qualification from the repository root:

```sh
node scripts/rust-migration/r8/access-temporal-installed-suite.mjs \
  docs/helix/04-build/evidence/rust-migration/r8-access-temporal-default-installed-5cddac8
```

For another Chromium executable, set `UMF_CHROMIUM_PATH` to its absolute path.
The committed V4 route-selection test can also be rerun separately with:

```sh
bun test tests/rust-core/access-temporal-v4-default-route.test.mjs
```

This is bounded installed-route evidence for this source commit and these
host versions. It does not retire the reference implementation, qualify an
SDK release, or establish that other V4 operations are Rust-backed.
