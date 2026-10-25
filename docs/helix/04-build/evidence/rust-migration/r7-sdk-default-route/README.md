---
ddx:
  id: R7-SDK-DEFAULT-ROUTE-QUALIFICATION
  type: evidence
  activity: build
  status: captured
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: ADR-006
      kind: informed_by
    - id: CONTRACT-067
      kind: informed_by
    - id: CONTRACT-068
      kind: informed_by
    - id: CONTRACT-069
      kind: informed_by
    - id: CONTRACT-070
      kind: informed_by
    - id: CONTRACT-071
      kind: informed_by
    - id: CONTRACT-072
      kind: informed_by
    - id: CONTRACT-073
      kind: informed_by
    - id: CONTRACT-074
      kind: informed_by
    - id: CONTRACT-075
      kind: informed_by
---

# Private SDK Rust default-route qualification

The generated private SDK archive routes its package root to the synchronous
Rust V4 `generatePythonClient` entry. Node selects `dist/umf-node.js`; browser
and import conditions select `dist/umf-browser.js`. Other root exports are
preserved, and the archive retains the legacy TypeScript bundle plus V2, V3,
and V4 candidate subpaths. The repository `package.json` and ordinary
`bun run build` keep the TypeScript root route.

This is a local macOS arm64 installed-artifact qualification, not a release
qualification. It does not change the source package default or establish R7
retirement for other exports. The package remains private at version
`0.5.6-preview.r7.darwin-aarch64`. The archive's generated metamodel snapshot
had 11 generated inputs differ from the captured live inputs, so its manifest
records `derived-private-snapshot-not-release-fixed-point` and explicitly marks
the package nonpublishable. The transformed snapshot is reproducible and
source-bound, but cannot satisfy the R8 metamodel fixed-point gate.

The build used Rust/Cargo 1.90.0 and wasm-bindgen 0.2.100, with a fresh Cargo
target and private source snapshot. It ran the metamodel and action identity
generators in that snapshot, the PostgreSQL browser asset builder, TypeScript
declaration emission, `checkCoreDistribution`, and archive member inspection.
The package receipt and installed-host receipt are included in this directory.

The clean packed package was imported by package name in Node 26.12.1 and Bun
1.4.3. Both hosts replayed all 31 frozen R3 `generatePythonClient` cases, checked
the 1,120-name root export set against the retained TypeScript bundle, sync
behavior, output shape, resource controls, and loader-contract/V2 subpaths. The
real Chromium 153.0.8010.12 run repeated the frozen cases and resource controls
with no external requests. Missing native-addon and missing/corrupt WASM probes
failed at their requested native/WASM asset boundaries. The captured replay
used loopback port 51452 and exited successfully.

The archive is
`/private/tmp/umf-sdk-default-output/umf-core-0.5.6-preview.r7.darwin-aarch64.tgz`,
SHA-256 `892f121b9e53262d86120e236b9ae60704c932653b9cf39d01621b825b3aec93`.
Its captured live source tree SHA-256 is
`ee2b708ff45655bb4138007dcb0b90af8fb9b5dde963c9603ac4b812929a04a5`; the
derived build snapshot tree SHA-256 is
`aeb984f39a2930d0f3af178f4b421850d569fbee1972faf3df793d1d2352cff0`. The
source-bound manifest covers 3,226 inputs and the archive contains 1,777 exact
members, including 1,771 SHA-256-bound assets. The independent review
recomputed the source tree and asset hashes.

The builder and replay implementation are
[`package-sdk-rust-default.ts`](../../../../../../scripts/package-sdk-rust-default.ts)
and [`test-sdk-rust-default.ts`](../../../../../../scripts/test-sdk-rust-default.ts).
Their SHA-256 values are `436d3a38eabdb58baf26817d4554045cd4d22b56bdf2991f25d4a920751455fc`
and `e49d1e5c810c797f689c5a1bcb439b8866ce81bb75d7af241d3da052dc0eb44e`.
`bun run typecheck` passed. Hosted Linux/macOS and CPython release cohorts,
the generated-source fixed point, complete R7 retirement census, final package
version, and release publication remain outside this qualification.
