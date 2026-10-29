# Migration/main reconciliation — bounded source plan

Inputs: migration `f1bbe34ea46b1da1aadd903074dbfe9cedc3ac6f`; main `f5f4b7dbef12a757bc0bba6ae2f581998fe50dba`; common base `9a11ae5c04c23f0cc0ae1d61a27c4d7a64819b08`. The migration checkout was clean at inspection. This plan uses read-only Git diffs and `merge-tree --trivial-merge`, plus the affected source, contracts and qualification recipes. No merge, source modification, generation, import, test or runtime was performed.

**Decision:** perform one normal main merge into the migration integration line, resolve the six text-conflict paths and one binary conflict below, then rebuild the dependent generated resources from the merged source. Preserve migration behavior and upstream action/kind behavior together. This is not a release or merged-code qualification receipt.

## Actual overlap and resolution

Eleven paths changed on both sides. Six have textual conflicts:

- `src/validation/document.ts`: retain migration's private `validateDocumentWithAccounting`/copy hooks and main's explicit `registry.kindRuntime` dispatch. Put the main dispatch/refusal in the shared internal entry, before the ordinary copy: public unmetered native-kind dispatch stays intact; a supplied meter still refuses with `EXTENSION_KIND_RUNTIME_CONTROLS`. Do not send native-kind execution through the unqualified R2 structural companion or silently fall back to ordinary validation. Preserve explicit opt-in and opaque unregistered extension content under CONTRACT-907.
- `src/extensions/actions/plan-identity.ts`: neither branch's producer digest describes the merged source. Regenerate with the existing source-bound identity recipe after the final generated TS companion/source set is fixed. Preserve the authored schema digest domain.
- `python/umf_codegen/src/umf_codegen/_assets/manifest.json` and `_release.py`: regenerate with the actual merged codegen import closure, together with conflicting binary `_assets/generator.js.gz`. Choosing either old blob would discard the other source cohort or misstate custody.
- `docs/helix/04-build/evidence/rust-migration/r3/{inventory,boundary-check}.json`: preserve old evidence in its original provenance; create current generated results from the real merged tree using the existing inventory/check recipes. Do not manually union old inventory records or claim prior checks passed for the merge.

Four both-changed paths merge textually without markers: `.github/workflows/python.yml`, `scripts/check-rust-boundaries.py`, `scripts/rust-core/full-conformance.ts`, and `src/index.ts`. Confirm their combined intent: main's Hatchling installation and kind-boundary rules coexist with migration's exact codegen-version debt pin; full-conformance retains both the shared redaction fix and upstream installed-build dependencies; the public index retains main's kind export and migration's explicit public exports, without leaking private accounting APIs.

The table deployment/migration, Python lifecycle/custody and selected native runner implementations are not directly modified by the upstream delta. Retain all reviewed G02/G03/G04/R2 changes; do not replace these with upstream baseline copies. Main's new Rust single-SET admission, binding transports, Python Core distribution 0.10.1 and extension-kind registration/constraints come across as their own upstream additions. Preserve CONTRACT-906/907, source truth and opt-in semantics; no new native support follows from this merge.

## Generated-resource dependency that cannot merge unchanged

Main's ordinary validator is **305070 bytes**, SHA256 `4a88fd9bc398c56d71e535841322dcf10d2851e16b026c14679e2d79062e90a7`; migration's R2 driver/transformer still bind `88e425…`. Main also changes all three bound schemas:

- core: `bdcf1c6b8a197dfbd769ea47a879eaabeeb1d71cc00cab1f9e600175354c5da7`
- semantic reference: `48def42448706bbdfe68c458746d23610767feae0da6456735674524b8018887`
- extension package: `a4f4694b3ae32ef47a898f49fdce969b890f1ac901fc6747a43cb8c9c6c77c35`

Therefore the old accounted companion `42218…` is historical, not a valid merged-schema output. Retain main's ordinary model/schema/metamodel outputs; check their source regeneration consistency. Adapt the *existing* closed transformer to the exact new generated source only where its fail-closed source/AST/alias/schema checks require it, retain before-growth accounting semantics, and refresh the driver input/transformer pins. Use the existing hosted artifact-only generation step, inspect its actual output before adoption/import, then reproduce and exercise ordinary/accounted parity in Bun and Chromium against the new source. Include the upstream kind-catalog schema cases in that parity coverage. Do not merely update expected hashes to bypass a transformer refusal.

After that output is fixed, regenerate action-plan identity and the codegen asset family from merged source. Preserve main's fixed Python action-runtime resource roster, strict manifest/hash checks, direct/sdist payload checks and genuine platform tags; refresh its manifest/runtime digest constants only if the corresponding canonical resource bytes change. Its source-derived core schema/constraints must agree with the merged generated authority. Keep Core 0.10.1 distribution distinct from semantic core 0.10.0 and Access/Codegen package versions; no incidental version bump.

## One implementation batch and renewed gates

Root performs the normal merge; Luna resolves these concrete source/generated conflicts as one integration batch. Retain all prior provenance, including portable PASS **40270287717** and the frozen native run **40270912993** at evidence-only **14db4f4b**. Neither qualifies merged bytes; do not cancel, relabel or overwrite that run.

Refresh qualification source closures and actual hashes *after* final generated bytes: combined expected-pins, generator source/schema/transformer pins, companion reproduction hash, G04 Python and G02/G03 native input manifests and installed codegen cohort. Preserve originals as historical. Keep fixed R2 work/bytes/subjects, full fixtures, test deadlines, cleanup and native authority checks unchanged.

Renew existing combined full/tools/scoped TypeScript gates, complete portable migration/API and R2 controls, legacy regressions, G04 fixture tests, actual Chromium parity and exact companion reproduction. Renew the affected upstream metamodel/schema, Rust boundary/inventory/conformance and extension-kind cross-binding/browser checks, and Core 0.10.1 action-runtime direct-wheel/sdist/installed artifact gates. Run the existing G04 Python source-unit and selected installed G02/G03 disposable-native recipes on the merged cohort; keep G04 native/other unqualified boundaries explicit. Original held-session/approval/recovery/cleanup assertions remain required.

Before an isolated push, reconcile event scheduling: main adds **`python-action-runtime.yml` with unfiltered push, pull_request and workflow_dispatch**, including Linux-x86_64 and macOS-arm64 artifact jobs. Existing migration push exclusions do not isolate this new workflow. Either deliberately schedule that existing gate, or add only the exact qualification-branch push exclusion while preserving PR/manual/tag obligations; record the actual roster. Preserve the existing Python/Rust/access/actions and other PR gates, not only the selected migration job. A later PR must satisfy the real merged workflow obligations; old selected evidence is not a substitute.

**PR49 / Core 0.10.2 producer is explicitly excluded.** Await the independent Stack/Rust tag and ownership-collision reply; do not fold, close or publish it as part of this reconciliation. The only new implementation uncertainty here is whether the changed generated source requires additional closed transformer cases; fail-closed diagnosis determines that, not a broad feature audit.
