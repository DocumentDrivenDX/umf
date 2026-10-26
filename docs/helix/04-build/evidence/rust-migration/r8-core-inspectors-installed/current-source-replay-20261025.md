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

# Current-source installed core-inspector replay

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
