---
ddx:
  id: umf.evidence.rust-migration.r8-core-inspectors-installed
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: umf.evidence.rust-migration.r5-core-inspectors-default
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-040
      kind: informed_by
---

# R8 installed core-inspector qualification

## Current-source replay: archive `4c3187be9`

The fresh installed replay used the sealed private SDK archive
`/private/tmp/umf-current-4c3187be9/umf-sdk.tgz` (SHA-256
`64e46f86bfb2ffbd97066d84d8a36cbd5a5cd48f45d6337a2400b4b4a79286ff`). Its
captured-live and recorded source-closure hashes both equal
`7870eee151f2633c48f49194e20f2bc590cbfabc62b80ef7abffeefa095e91f9`; the
closure records 3,461 files and a fixed-point transform with no generated
inputs. The archive manifest verified 1,793 packaged members. The package is
version 0.5.6.

The frozen predecessor container and its three packet hashes are the same
hash-pinned data described below. The main replay passed all 26 cases across
`inspectCoreScalarType` (8), `inspectCoreRecordMembers` (9), and
`inspectCoreReferenceLinks` (9) through the installed default route and the
explicit reference route in Node 26.12.1, Bun 1.4.3, and Chromium 153.0.8010.12.
The browser requested the package WASM member and had no Node globals. Node and
Bun also matched the predecessor's selected result/error observations and
default/reference result and host-shape observations. Missing and corrupt
native-addon controls refused the package root in both Node and Bun.

The additional host-shape replays matched default and reference behavior for
all three inspectors across Node, Bun, and Chromium: four accessor/hidden/
symbol admission refusals had zero observer events, and forged-proxy errors
matched including the `source.getPrototypeOf` event. These are bounded tested
shapes, not exhaustive host-object or proxy coverage. The detailed receipts are
`current-source-4c3187be9-main.json`,
`current-source-4c3187be9-node-bun-host.json`, and
`current-source-4c3187be9-browser-host.json`; the harness hashes and exact
runtime observations are recorded there.

This replay found no concrete behavioral blocker in these three inspector rows
within the frozen 26-case and recorded host-shape sets. Current-source SDK
source closure remains an independent qualification boundary; the run does not
retire ledger gaps or qualify every input shape, platform, architecture, full
SDK behavior, or release readiness. The earlier archive receipt below remains
historical evidence for its own cohort.

### Nested host-object admission probe

The four prior host refusals placed their accessor, hidden property, or symbol
on the source root. The installed nested probe adds each of those shapes to
`modules[0].elements[0]`, an element other than the one selected by each
inspector. Across all three inspectors and installed default/reference routes,
Node 26.12.1, Bun 1.4.3, and Chromium 153.0.8010.12 returned the same
`UmfError/NON_JSON` message and deep JSON Pointer path. Accessor counters stayed
at zero. Chromium loaded the packaged WASM. This specifically checks that
admission traverses an unrelated nested part of the retained source tree; it
does not establish exhaustive deep host-object or proxy behavior.

The [nested-shape receipt](nested-host-shapes-4c3187be9.json) pins the archive,
source closure, harness, and predecessor packet container. Reproduce with:

```sh
bun docs/helix/04-build/evidence/rust-migration/r8-core-inspectors-installed/nested-host-shapes-current-source.mjs \
  /private/tmp/umf-current-4c3187be9/umf-sdk.tgz \
  64e46f86bfb2ffbd97066d84d8a36cbd5a5cd48f45d6337a2400b4b4a79286ff \
  7870eee151f2633c48f49194e20f2bc590cbfabc62b80ef7abffeefa095e91f9
```

The isolated harness replays the exact frozen predecessor container for the
three default-selected inspector exports from the private SDK archive
`/private/tmp/umf-r8-csv-boolean-default/umf-sdk.tgz`. The archive SHA-256 is
`3d2c6b3b154ff3ffc45d63919eee4572b491f242bea3976289c34f9cb63ceffc`; its
fixed-point source closure and captured live source both hash to
`1a28de92f1c2e0f51a0b9b2c63bb55afa202057096e2cc399feaa638a994f39f`.
All 3,426 source-closure files are represented by that source digest, and the
archive member hashes are checked before replay.

The hash-pinned frozen container is
`r5-core-inspectors-default/frozen-predecessors.json` (SHA-256
`9563378b9fb00b213f76d6c0d09ac0c8278c0fb829c719b566b019971a0f3a7a`). It
embeds the three predecessor packets and their recorded packet hashes. The
replay covers `inspectCoreScalarType` 8/8, `inspectCoreRecordMembers` 9/9 and
`inspectCoreReferenceLinks` 9/9. Every result and frozen error
`code`/`message`/`path` triple matches through the installed package root and
the explicit `./reference` export in Node 26.12.1, Bun 1.4.3 and Chromium
153.0.8010.12. Node and Bun also match the installed/reference result prototype
and selected error name/prototype/code/message/path observations. The browser
loaded the package's bundled WASM glue and reports no Node globals.

Four damaged-package controls copy the Node root bundle into an isolated root,
then remove or corrupt the native addon. Node and Bun both refuse the damaged
default package root at import with `MODULE_NOT_FOUND` or `ERR_DLOPEN_FAILED`;
direct native-loader controls also refuse all four conditions. These controls
cover the Darwin arm64 package cohort only.

The receipt pins the archive, package manifest, selected entrypoint/declaration
members, source closure, frozen predecessor container and packet hashes, runtime
versions, Chromium version, and harness hash. Reproduce with:

```sh
bun scripts/rust-migration/r8/core-inspectors-installed.mjs \
  /private/tmp/umf-r8-csv-boolean-default/umf-sdk.tgz \
  docs/helix/04-build/evidence/rust-migration/r8-core-inspectors-installed/receipt.json
```

This qualifies the three installed inspector routes for this private 0.5.6
archive on the recorded hosts. It does not qualify the full SDK, other operating
systems or architectures, route retirement, or a release.
