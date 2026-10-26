# Exact portable four-row / generator-literal repair plan

**PLAN ACCEPT for the explicit allowlist below; no bulk hash refresh authorized.** Reviewed report `/private/tmp/migration-post-generation-pin-preparation.md` SHA256 `300d9cf9180d33cba948e26c5f6ca7e0cc0d8aa2669ec1c1e1fe80f773eaaba2` against actual source and fixed pin rosters. No source edits, runtime/imports/AST/tests, Git mutations or generation were performed.

The current97-row manifest has97 unique paths and exactly the reported three mismatches. The native32 rows all match. These are source-identity updates to already accepted source, not replacement of expected artifacts with arbitrary current bytes:

| Portable manifest path | Authorized target SHA256 |
|---|---|
| package.json | c7b69fba001805dc9cd4e26e84a9b786be379c1413d020c34600c063d287101b |
| .github/workflows/pypi.yml | b970dfb643281fb8c9e58b89d4da872f379809397937f01dcd277705c34d7c09 |
| .github/workflows/access-boundaries.yml | e94235c9e027748fecfa218350ed82684ba5f6e33cf978728e4064125b01f50a |
| scripts/qualification/r2-metering-generate.ts | fb265f8b027fe40e50556ba88fc5b91f585b03f6c7a4526e175fd2d8b04ca7d0, conditional on the exact single-literal edit below |

The package/private0.5.7 and access distribution assertion were accepted in six-file review64f83499; the actual current pypi workflow is the accepted normal-main release dispatcher, source identity only. Its lifecycle trigger is not permission to invoke a publisher from portable qualification.

In `r2-metering-generate.ts`, change ONLY `LOCKED_FILES` package.json expected SHA from031bdb38c663c33804c02de06906c9c4fdd7bbf32728204cd4c8d30959c324ed to the already reviewed c7b69fba… above. The preimage is32d66948460ea7f6118082af70ea80bf563a6c67b5bef6eb441a25f0c97731c1; independently computed exact one-replacement postimage isfb265f8b… above. Verify actual postimage, then update its own portable manifest row. Do not refresh unrelated rows, paths, caps, cases, event/ref guards or expected output bytes. Preserve the all-row sha256sum check and all97 paths.

## No extra companion/provenance rewrite

All four `INPUTS` already exactly match: validator4a88fd9b…, core schemabdcf1c6b…, semantic-reference48def424…, extension-packagea4f4694b…. The structural transformer63b0171e…, Bun lock5fb58795… and bunfigb9fc65ec… also match. Actual accounted companion remains314cac8416711899285bc3f1a734765d557f7446f7ab0cf58d3dbd2a7dfdd81e. The transformer consumes validator/schema bytes, not the SDK package-version string; no structural-source pin, transformer digest or adopted companion change is indicated by this version-only repair.

Keep the original Stage-A manifest and its old package lock as truthful historical provenance; do not rewrite it to pretend it was generated under0.5.7. New reproduction manifests will record the new package lock and actual new run/source identity while comparing the exact same companion output. Actual reproduction still must pass; unchanged input proof is not a new execution result. SDK/action/codegen build identities affected by package/source changes are handled by genuine canonical generation, not hand-editing generated data.

## Required ordering

Let active canonical run40378170714 from source02e finish unchanged and retain its actual outcome/output; do not cancel or relabel it final. Commit the exact one-literal/four-row repair and freeze its real source identity. Because this TypeScript generator is an actual R3 inventoried script, a new canonical generation from that genuinely changed final source is required using the existing reviewed recipe/caps. This is changed-source generation, not an unchanged optional retry.

Review/adopt those actual generated outputs, preserving the old inventory and run as historical evidence. Then refresh only actual adopted changed source/output rows in existing pin rosters with exact provenance; this plan does not pre-authorize unknown future output hashes. No current native32 update is needed solely for this literal/portable-manifest repair. Recheck final complete manifests before the original portable/native jobs. Original fixed resource limits, reproduction semantics, native/full-fixture cases and the four-cell matrix remain required; no gate is waived.
