---
ddx:
  id: R7-SDK-SOURCE-DEFAULT-ROUTE-LOCAL-20261024
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

# Source-package default route: local private cohort

The repository package root now selects the synchronous Rust V4
`generatePythonClient` route for the supported Node and browser conditions.
The `./reference` export retains the TypeScript implementation, and all other
root export names were preserved. The package remains private at version
`0.5.6`; this is a single-family default-route qualification, not full R7
retirement or an R8 release qualification.

The live model metamodel and action identity fixed-point checks passed before
the build. The source builder compared its declared input set with the full
metamodel compiler/workspace closure, copied the cohort to a private snapshot,
built a fresh native addon and browser WASM with Rust/Cargo 1.90.0 and
wasm-bindgen 0.2.100, and replaced `dist` only after live source and asset
hashes matched. The source transform status is `fixed-point` with zero
generated-input changes. The build source tree and captured live tree both
have SHA-256
`0bf95b9c99c7fd328cf5d9f2cc5a04d1a4d637832a45446c6a0bc4893081cc55`.
The manifest covers this archive's declared build and qualification inputs; it
is not a hash of every repository file or a substitute for the authority-bound
R8 executable census.

The canonical packer is `bun scripts/package-sdk.ts`, which delegates to
`scripts/package-sdk.py` and writes `.cache/sdk-distribution/umf-sdk.tgz`.
It snapshots each distribution member once, checks the snapshot against the
verified asset map, writes archive members and hashes from those same bytes,
and rechecks the live source closure before atomic archive replacement. The
nine-case packer suite includes source/external-resource drift, path traversal,
dist mutation, source mutation during archive creation, and byte-exact archive
member checks. Both `python3 scripts/test-sdk-package.py` and the compatibility
entrypoint `python3 tests/package-sdk-layout.py` pass 9/9.

The clean installed replay passed on Node 26.12.1, Bun 1.4.3 and real Chromium
153.0.8010.12 (loopback port 54185): 31 frozen R3 generator cases, 1,120 root
export names, synchronous behavior, resource controls, and missing/corrupt
native-addon and WASM refusal controls. It verified 1,772 distribution assets
and exactly 1,779 archive members. A separate manual run of
`bun scripts/test-sdk-install.ts` also passed against the same archive,
including 139 installed conformance cases, bundled action registry checks,
loader entrypoint behavior and unified generation. Its source hash and result
are pinned in `action-conformance-smoke-receipt.json`. This smoke is not part
of the default `test:sdk` command and remains a separate qualification step.

The local archive SHA-256 is
`1fc91d66f756edcc8fd39fe3180b684beb8381f16f986807cb9b5fb257ea0dee`; its
sidecar manifest SHA-256 is
`8c69a4d04e5c47cbd22691a4092c11a826e97d85fd802f414aff8d65cfe29a53`. The
installed replay receipt SHA-256 is
`479eed26f70885ddaee51ac727d6e94468e3cfc7cb70ac19f2a725db15f430e2`.
The source-build manifest SHA-256 is
`19a8be279630086b3def5fe29d3b5697c5f8e6be3335ffc9330b40787aa09585`, and the
package receipt SHA-256 is
`7fd02b4f3322eb34de271882452e34c99fcfcbb0449a37f7a8f6558d998bbd45`. The
separate action/conformance smoke receipt SHA-256 is
`49de682e13c0085f4e1e634b515354c48da43df1533dd5f0843422709adf2134`.
Captured source build manifest, archive manifest, package receipt and installed
replay receipt are retained beside this document. The archive itself remains
in the local `.cache` output and is not committed.

The current tree's R8 symbol inventory is a separate, condition-aware census.
The historical `r7-sdk-default-route` packet describes an earlier private
preview cohort and must not be used as this source-package receipt. Hosted
platform cohorts, complete operation-family coverage, remaining export
retirement, and R8 release gates remain open. This is a local captured cohort;
the R8 census/docs and concurrent integration work are outside its declared
build input closure. Rebuild from a later frozen integration cohort before
treating it as the combined-worktree qualification.
