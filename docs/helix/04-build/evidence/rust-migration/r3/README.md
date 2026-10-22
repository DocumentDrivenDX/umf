# R3 compiler migration evidence

R3 ports the complete dependency closure of the seven Python V8 bridge
operations and the separate stage-one access generator/diff APIs into the
host-independent `umf-codegen` Rust crate. The
[implementation plan](../../../rust-migration-plan.md) governs scope and gates.
Production default cutover, removal of MiniRacer and publication remain R4 or
later work.

## Interface and resource decisions

`CodegenEngine` receives immutable trusted `CodegenResources` and a live
per-operation `Context`. Node/Bun, browser WASM, installed Python and the native
Rust CLI expose the same additive `codegen/` dispatch. Host wrappers supply nine
independently admitted resources: the five core resources, tables/actions package
manifests, binding 0.1.0 and stable binding 0.2.0 manifests. Package schemas are
compiled from those supplied resources. The fixed tables operation compiler
schema and inert Python output templates ship with the crate. Artifact content
cannot install validators, callbacks or host capabilities.

Resolved stage-one IR remains private. The retained public contract is the
complete candidate/refusal result, ordered diagnostics/dispositions/obligations,
exact generated paths and text, source archives and hashes. Cooperative controls
span host admission, Rust work and result copies; unavailable hard isolation
fails before work. This is not a hard memory or preemptive execution guarantee.

## Evidence layers

- [Predecessor baseline](baseline/README.md): immutable complete bridge and
  stage-one results captured before implementation, with source identities.
- [Action closure](sol-action-closure/README.md): analyzer source-order,
  literal/domain, graph and control checks. Later review packets preserve
  additional parser precedence findings.
- [Migration/row-scope closure](sol-implementation-closure/README.md): scoped
  compiler results and PostgreSQL/Weft execution evidence. Later `sol-final-*`
  and `sol-second-*` packets record independent findings and their controls.
- [Native clients](native-client/README.md): installed runtime/type-checker and
  native database observations for the exact retained candidate artifacts.
- `binding-admission-review/frozen.json`: positive legacy/stable PostgreSQL and
  declarative Lakebase candidates plus schema, semantic, correspondence and raw
  profile refusals. Declarative acceptance is not native Lakebase qualification.
- `target-admission-review/frozen.json` and
  `sol-independent-target-admission-review/frozen.json`: target naming,
  relevance, projection and dependency-key behavior.
- `stage-runtime-review/frozen.json` and
  `stage-capacity-review/frozen.json.gz`: existing creation/codec scenarios and
  aggregate output capacity, separate from ordinary source admission limits.

`full-conformance.ts` discovers every public `frozen.json`/`frozen.json.gz`
packet, alongside the named baseline/supplement controls. Direct analyzer and
auxiliary table-query packets stay native-only where they are outside the nine
public operations. No failing expectation is refreshed to match Rust.

## Historical installed-host checkpoint

The [pre-client-admission scope record](before-final-client-admission-scope.json)
and [receipt](before-final-client-admission-qualification.json) retain the first
coherent 94-packet, 582-case qualification across six compiler host cohorts.
The feature WASM run separately qualifies retained core/regex controls. The final source reread found missing
client admission checks and native query output mapping; that earlier pass does
not qualify the subsequent repair or complete R3. The additional immutable
controls and source census are retained in `sol-final-client-source-gates-review`
and the related native query packets.

## Current qualification status

Implementation, independent exact-source review and local qualification pass.
The [final validation index](final-validation.json) and
[coherent installed-host receipt](production-host-qualification.json) record
615/615 compiler cases in 102 immutable packets for each of six cohorts: packed
Node, Bun, empty-PATH native CLI, default Chromium WASM, installed CPython wheel
and offline extracted-sdist rebuilt wheel. The feature WASM run separately
qualifies retained core/schema/regex controls. All source hashes remain unchanged
through the complete build/test run.

Workspace testing passes 330 tests in 56 suites; type checking, boundaries,
inventory and metamodel fixed point pass. [Native consumer checks](final-native-consumer-checks.json)
retain final producer/file hashes, three pinned type checkers with negative
controls, and three installed runtime scenarios. Earlier native database evidence
keeps its original versions and subsets. The final client source census and
[review renewal](sol-final-client-source-gates-review/final-source-review-renewal.json)
supersede the earlier incomplete approval. Current-main, required CI and merge
identities will be recorded by the pull request.

R4 still owns default generator cutover and MiniRacer removal. No package is
published and no broader native semantic support is claimed.


Post-qualification Ruff amendment: PR45 adds only standard-library import cleanup
in `python/src/umf/rust_codegen.py` and test cleanup in
`python/tests/test_rust_codegen.py`. The [supplemental review](sol-delivery-review/post-qualification-ruff-review.json)
records exact before/after hashes and independent non-import AST equality. The
615-case six-cohort receipt above remains immutable evidence for its original
source hashes. Affected tests pass 8/8, the temporary installed Python suite passes 206/206,
and pinned Ruff 0.17.1 passes. The complete hosted qualification gate remains
required against the successor checked PR head; the temporary environment check
is not a fresh wheel build.


Hosted clean-build amendment: the metamodel source-bound CLI census now includes
the transitive `umf-codegen` crate and its authored operation schema. Generated
outputs and the retained V8 payload were regenerated for the expanded compiler
provenance; independent whole-bundle comparison finds only five repeated source
hash tokens changed. The [supplemental build review](sol-delivery-review/hosted-build-source-closure-review.json)
records exact file and bundle identities. The original full qualification receipt
remains scoped to its captured sources. Complete hosted qualification is required
against the successor PR head before merge.
