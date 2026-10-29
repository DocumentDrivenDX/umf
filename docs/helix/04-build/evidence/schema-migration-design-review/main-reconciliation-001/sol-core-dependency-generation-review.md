# Migration Core dependency merge and generation-input source review

Verdict: **SOURCE ACCEPT**, limited to the reviewed local dependency merge and artifact-only merged-source generation recipe. No remaining concrete source blocker in this batch.

The pending merge binds migration parent `63762c9ac233debf1cb6021a3db1fcdc763e64aa` and Core producer parent `cdebbc26896b9ed597ef0c7e634f674b2a5e09e3`. The six conflict resolutions preserve the union of exact branch exclusions, normal tag pushes, pull requests, manual triggers and existing jobs. The clean Python action-runtime merge retains Core 0.10.2 distribution checks and migration-only push exclusions. No PR gate is disabled.

The held generator requires push on the exact merged-generation branch, actual HEAD/source identity, both source ancestors, and the adopted accounted companion. Its pinned Stage-A manifest is compared against the exact four current source/schema inputs, including byte counts. Core package 0.10.2 is distinguished from Core schema semantic version 0.10.0; the closed runtime resource manifest and actual coreSchema digest are checked without introducing a phantom version field. Historical inventory cc6f8343 is explicitly a seed, not current migration qualification evidence.

The existing action-plan identity, codegen, checks, R3 inventory and boundary-check order is retained. The 1800-second monotonic aggregate, 60-second evidence reserve, bounded commands, aggregate 1 MiB logs and 16 MiB artifact cap are retained. The complete deduplicated output family is checked for regular files, unsafe paths/symlinks and total stat size before output read/copy/hash/parse. Fresh bounded assembly preserves failure status and withholds generated outputs on failure.

Reviewed postimage SHA-256 pins:

```
0e6e0b970d917c1bc25f15ebdc98c5c7ae2755c36291ee733d39caa345521a80  .github/workflows/merged-source-generation.yml
32adc936396297d8ca49ef2919574f025ece1d635bb109aa4ffc2bfc0c87b5f9  .github/workflows/access-boundaries.yml
0de61410bd78e34587121c6c1faa4d87f29d37f36776033d2ac5954baad07d3c  .github/workflows/actions.yml
a35b50cc37b3169ee2e7d27054662f5e78a836967378f36bd9dab802dbe0642f  .github/workflows/python.yml
4401e44a491c459790e5c079c4d8c865a0332e425688918310b2b6048383248e  .github/workflows/rust-core.yml
e5295c36e259dad84edad9489bfa9c7a2fc8eaa178a1d79563892a55cf08dbb3  .github/workflows/rust-spike.yml
a918a625d62a39372eb176bade5d92f7e1fc78c82d54c29577f0e51e88262d52  .github/workflows/sql-containment.yml
584f64a1e8e385f6b4fbf49243e8c2e4762afeb8ddb5ba2e34841e35fff453e5  .github/workflows/python-action-runtime.yml
14778a7dd33c86f8a5097640d4652c7a9ffbe1cbef0d3108fdbfbedb524be9b7  docs/helix/04-build/evidence/schema-migration-design-review/main-reconciliation-001/core-dependency-integration.json
314cac8416711899285bc3f1a734765d557f7446f7ab0cf58d3dbd2a7dfdd81e  src/generated/core-validators-accounted.ts
dea18d8019a736568fc12416044217dacaf7555dc9ab9ea258cbd2316de09605  python/pyproject.toml
5c6f478e65626135f596d412fafe903b611102e12578c7cfa11505aca55e991e  python/src/umf/__init__.py
7b24a7c50a2597feba42bed3bf5f85a121f3b0f787c569fb2414c54fc98f57ec  python/src/umf/action_runtime_resource_manifest.json
bdcf1c6b8a197dfbd769ea47a879eaabeeb1d71cc00cab1f9e600175354c5da7  spec/core/schema.json
cc6f8343fe4c210b1120495151ec6bb38fe048b515886198573329873b621a67  docs/helix/04-build/evidence/rust-migration/r3/inventory.json
```

This review reuses the accepted Stage-A output review `cb7a1e4141460b415665f561dbb395b188dcff623d2dfd8ebadf451ad797b757` and Core inventory output review `b74bc81ac80090e91e8d634523ba26aa2b10f6f7d3ca7daceb12dad17409beee`. Old provenance remains historical. The final generator hash was confirmed again when sealing this receipt.

No local runtime, imports, tests, AST/schema evaluation, generation, source edits or Git mutations were performed by this review. Actual emitted files require output/provenance review before adoption, followed by the original merged qualification gates. This does not qualify native behavior, current generated resources, retirement, release or installed/public bytes. PR49 remains standalone; Core publication/public-byte verification and dependent PR48 merge/release gates remain open.
