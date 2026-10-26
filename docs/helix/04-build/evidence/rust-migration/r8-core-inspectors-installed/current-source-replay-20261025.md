---
ddx:
  id: umf.evidence.rust-migration.r8-core-inspectors-current-source
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
    - id: umf.evidence.rust-migration.r8-core-inspectors-installed
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-040
      kind: informed_by
---

# Final pinned fixed-point archive cohort — 2026-10-25

All receipts in this section are pinned to private fixed-point archive `/private/tmp/umf-r8-provenance-final-20261025/umf-sdk.tgz`, SHA-256 `591e5e5e3e919d2a613ed90f31dd1faf50e158f2666d6c613e21b3dc35d41711`. At archive capture, the captured and live source closure both hashed to `65a6458ad8950da0669fa713d736d1b81e576793d0f6c12896ccf59027ed941d` across 3,431 source files. The archive contains 1,788 members including its manifest; the replay verified all 1,787 manifest-listed package members. The archive transform was fixed-point with no generated-input changes. Later source changes do not alter these archive-pinned observations.

The [final frozen replay receipt](current-source-replay-provenance-final-20261025.json) records the 26 frozen predecessor cases: scalar type 8/8, record members 9/9, and reference links 9/9, matching the explicit reference route in Node 26.12.1, Bun 1.4.3, and Chromium 153.0.8010.12. The replay also confirms expected missing/corrupt Node addon refusal controls. Its harness hash is `31c02a0dae312adbb145e6325b46c52af2dc671ff6392865098d0c3a248a3559`.

The [Node/Bun host-shape receipt](host-shapes-provenance-final-20261025.json) and [Chromium host-shape receipt](host-shapes-browser-provenance-final-20261025.json) use the same archive and frozen predecessor hash `9563378b9fb00b213f76d6c0d09ac0c8278c0fb829c719b566b019971a0f3a7a`. Across all three inspectors and both default/reference routes, accessor source, accessor identity, hidden source, and symbol-key source return the exact matching `UmfError/NON_JSON` code, message, and local path. Every getter count is zero. The additional forged Proxy probe returns the same caller `AdmissionError/ACCESSOR_PROPERTY` (`/source/probe`, `caller-controlled proxy failure`) after one `getPrototypeOf` trap on both routes; it is not rewritten as `NON_JSON`. Node/Bun also retain the existing successful Proxy trap-sequence and copy-isolation observations. Browser probes establish only these four refusals and the forged Proxy outcome; they do not cover those extra successful Proxy/copy observations.

For the adjacent CSV Boolean route, the same archive's [14-case frozen receipt](csv-installed-provenance-final-20261025.json) passes in Node, Bun, and Chromium. The [18-case adversarial receipt](csv-adversarial-provenance-final-20261025.json) records zero Node/Bun/Chromium outcome mismatches. These are adjacent route observations and do not extend the inspector case count.

Receipt SHA-256 values: frozen inspector replay `9212632d8321b2ce5a308e6260caf67211c48f0e48047d6df2f57dcf4ba8947a`; Node/Bun host shapes `6b16a3b1182d516047615726dfff02e79fa7b18268a2eb62cee2a69e971f3c56`; browser host shapes `3623b128ab0c18aca0bdb5f9448f0f0d46bf7d93006a7ce7a5da5a3b752c01d7`; CSV frozen replay `e750a7fc2082feec1adb352168dc9a76a78b5b46d916fe31b08db69c1ec52c69`; CSV adversarial replay `202d37a80c20692308ca5941ea0db99a7d40eb2990b85f1702fad755a4a762b5`.

Reproduce the inspector receipts from the repository root with:

```sh
bun scripts/rust-migration/r8/core-inspectors-current-installed.mjs \
  /private/tmp/umf-r8-provenance-final-20261025/umf-sdk.tgz \
  /tmp/current-source-replay-provenance-final-20261025.json \
  65a6458ad8950da0669fa713d736d1b81e576793d0f6c12896ccf59027ed941d
bun docs/helix/04-build/evidence/rust-migration/r8-core-inspectors-installed/host-shapes-current-source.mjs \
  /private/tmp/umf-r8-provenance-final-20261025/umf-sdk.tgz \
  591e5e5e3e919d2a613ed90f31dd1faf50e158f2666d6c613e21b3dc35d41711 \
  65a6458ad8950da0669fa713d736d1b81e576793d0f6c12896ccf59027ed941d
bun docs/helix/04-build/evidence/rust-migration/r8-core-inspectors-installed/host-shapes-current-source-browser.mjs \
  /private/tmp/umf-r8-provenance-final-20261025/umf-sdk.tgz \
  591e5e5e3e919d2a613ed90f31dd1faf50e158f2666d6c613e21b3dc35d41711 \
  65a6458ad8950da0669fa713d736d1b81e576793d0f6c12896ccf59027ed941d
bun scripts/rust-migration/r8/csv-boolean-default-route-installed.mjs \
  /private/tmp/umf-r8-provenance-final-20261025/umf-sdk.tgz \
  /tmp/csv-installed-provenance-final-20261025.json
bun docs/helix/04-build/evidence/rust-migration/r8-csv-boolean-default-route/adversarial-replay-20261025.mjs \
  /private/tmp/umf-r8-provenance-final-20261025/umf-sdk.tgz \
  /tmp/csv-adversarial-provenance-final-20261025.json
```

These receipts establish bounded behavior for this private macOS arm64 archive and the recorded runtimes. They do not qualify the full SDK, retire the inspectors, establish other operating systems or architectures, or authorize a release.

## Historical pre-provenance captures

The following earlier cohort observations are retained only as historical records. They were captured before the error-provenance correction and must not be used as current-source results.

## Earlier current-source installed core-inspector replay

This replay uses private SDK archive `/private/tmp/umf-r8-csv-admission-20261025/umf-sdk.tgz`, SHA-256 `bdd14aa62e09df465d784bb7889c4d7ddfc79c61f8186acf6eb2423ce35e8b3b`. Its 3,431-file source closure is `83730261e84c90533a4cf2b5710550c92655f1f9519961e04e718a86187851e9`; the captured live closure has the same hash and the package transform is fixed-point with no generated-input changes. The package is private version 0.5.6, with Node `./dist/umf-node.js`, browser `./dist/umf-browser.js`, and explicit TypeScript reference `./dist/umf.js` routes.

The current-source harness `scripts/rust-migration/r8/core-inspectors-current-installed.mjs` hashes to `31c02a0dae312adbb145e6325b46c52af2dc671ff6392865098d0c3a248a3559`. Its [receipt](current-source-replay-20261025.json) verifies all 1,787 archive members, the selected entrypoint/declaration members, and the frozen predecessor container. The `inspectCoreScalarType` 8/8, `inspectCoreRecordMembers` 9/9, and `inspectCoreReferenceLinks` 9/9 outcomes match the frozen predecessor through both the installed default route and explicit reference route in Node 26.12.1, Bun 1.4.3, and Chromium 153.0.8010.12. Node/Bun success-result prototypes and selected `UmfError` name/prototype/code/message/path observations also agree between routes. Chromium loaded the WASM package and observed no Node globals.

The receipt's four missing/corrupt addon controls cover Node and Bun. Each damaged default package root refused import, and each direct native-loader probe refused the missing or invalid addon. This is a Darwin arm64 private-package cohort.

The separate [installed host-shape receipt](host-shapes-current-source-20261025.json), made with [its auxiliary harness](host-shapes-current-source.mjs), records Node and Bun results for `inspectCoreScalarType`. Input mutation after return leaves the result snapshot unchanged, and mutating the result snapshot leaves the input unchanged. A plain Proxy over the source document produces the same value and the same observed top-level trap sequence through default and reference routes: `getPrototypeOf`, `ownKeys`, `ownKeys`, then descriptors for `umf`, `id`, `vocabularies`, and `modules`. The frozen `repeated_opaque_order` case also passes in all three runtimes with role order `record-type`, `future-role`, `record-type`, preserving both the unknown future role and repetition. Host refusals have these exact differences: accessor source gives default `AdmissionError/ACCESSOR_PROPERTY` at `/source/probe`, reference `UmfError/NON_JSON` at `/probe`; accessor identity gives default `AdmissionError/ACCESSOR_PROPERTY` at `/identity/module`, reference `UmfError/NON_JSON` at `/module`; non-enumerable source gives default `AdmissionError/NON_ENUMERABLE_PROPERTY` at `/source/probe`, reference `UmfError/NON_JSON` at `/probe`; and symbol-key source gives default `AdmissionError/UNSUPPORTED_KEY` at `/source`, reference `UmfError/NON_JSON` at the empty path. Getter callbacks are not invoked in these observed cases. These differences prevent an exact host-error parity claim for those inputs.

Identity forwarding was checked at the binder-to-engine seam in the prior [R5 source review](../r5-core-inspectors-default/sol-review.md); the installed public route necessarily crosses the native/WASM admission boundary, so JavaScript object identity is not observable there. Meter callbacks and zero-work refusal were exercised by the prior isolated WASM engine harness, but the installed public package root does not expose a configurable inspector engine or controls. This replay therefore does not extend those controls to the installed package API. The extra host-shape probes cover Node and Bun only; they do not establish browser host-shape parity.

These receipts establish the three selected inspector routes for this private archive and recorded hosts. The exact error-envelope gaps, hidden host controls, single-architecture cohort, and other untested host shapes remain retirement blockers. This does not qualify the full SDK, retire any logical row, establish other operating systems/architectures, or authorize a release.

Reproduce the frozen installed replay with:

```sh
bun scripts/rust-migration/r8/core-inspectors-current-installed.mjs \
  /private/tmp/umf-r8-csv-admission-20261025/umf-sdk.tgz \
  docs/helix/04-build/evidence/rust-migration/r8-core-inspectors-installed/current-source-replay-20261025.json \
  83730261e84c90533a4cf2b5710550c92655f1f9519961e04e718a86187851e9
```

The auxiliary harness runs from the repository root:

```sh
bun docs/helix/04-build/evidence/rust-migration/r8-core-inspectors-installed/host-shapes-current-source.mjs \
  /private/tmp/umf-r8-csv-admission-20261025/umf-sdk.tgz \
  bdd14aa62e09df465d784bb7889c4d7ddfc79c61f8186acf6eb2423ce35e8b3b \
  83730261e84c90533a4cf2b5710550c92655f1f9519961e04e718a86187851e9
```

## Source correction after this capture — 2026-10-25

The default-route binder now translates Rust wire-admission
`ACCESSOR_PROPERTY`, `NON_ENUMERABLE_PROPERTY`, and `UNSUPPORTED_KEY`
errors for `/source` and `/identity` inputs to the reference
`UmfError/NON_JSON` envelope, including its local path and message. The
focused Bun test `tests/rust-migration/r8-core-inspector-host-errors.test.ts`
passes 3 tests and 29 assertions across all three inspector methods. It checks
the four captured error shapes and that accessor getters remain uncalled.
`bun run typecheck` also passes. A separately bundled binder probe passed the
same 12 operation/error combinations under Node 26.12.1.

This correction is newer than both receipts above; the captured archive and
host-shape outcomes still describe the pre-correction source. A fresh Node/Bun
installed replay and browser replay are pending. A local Chromium launch
attempt was blocked by the host's Mach port permission failure. `bun run build`
could not run in this worktree because `rustc` is absent from `PATH`, so the
focused tests validate the binder translation with controlled Rust error
envelopes rather than a rebuilt native/WASM artifact. These results do not
close the installed host-error gap or establish browser host-shape parity.
