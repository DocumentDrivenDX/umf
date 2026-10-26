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
