# G04 portable first slice — source review 001

Correction required for TWO finite issues below. Review is bounded to the supplied eleven frozen postimages against handoffs ffb93f41/f86a04f4 and already-read CONTRACT081. It is not acceptance of full G04 recipes/domains/dependency DAG/roundtrip/native bridge. No runtime or type/schema execution occurred.

1. **Test optional review dereference.** `tests/lifecycle/g04-checked-conversion.test.ts:42` calls `result.plan.review.map(...)`, but `TableMigrationResult` supplies generic `TableMigrationPlan` and its `review` member remains optional (`index.ts:50`). The compiled-status guard does not narrow it to a required G04 review array. Add an actual definedness guard with a failure identifying the missing required G04 field, then assert its codes; do not cast away undefined or silently replace it by an empty array. This is a source-level strict TypeScript issue, not an executed compiler result.

2. **Schema permits crossed operation pair.** In `spec/extensions/tables/migration-0.7.schema.json` `$defs.conversionStep`, operation and phaseOperation independently accept all three literals. Thus `operation:capture-originals, phaseOperation:convert-field` satisfies this local schema despite the adopted exact SAME-literal contract. Encode the three matching pairs using closed oneOf branches or correctly required conditional constraints; keep the existing complete common properties/required/additionalProperties:false. Add meaningful schema negatives for crossed pairs using a genuinely compiled otherwise-valid plan. Exact source recompilation remains authoritative and already rejects such tampering; schema correction does not grant native capability.

The remaining bounded source correspondence is sound for the declared partial slice: .7 is dispatched separately after genuine source-bundle verification; the copied original request remains closed; .1–.6 branch bodies are retained, with type-only LegacyTableMigrationOptions propagation. Discovery .4 normalizes only irreversible marker reference, binds full sources/domain/configuration and ordered effects, and exact five-member marker equality is enforced. The portable producer emits retained capture iff selected, then conversions, then validations in one required phase, cycle-free bindings and source pointers, original approval/profile meanings, nativeQualified:false and full source-recompile equality. It conservatively refuses roundtrip and affected default/key/FK/check/index/policy/command dependency closure rather than inventing renderer/native support. No native Weft capability is issued. Broader recipe/domain combinations and the actual native phase bridge remain unqualified, as requested.

Existing fixture controls meaningfully construct an int4→int8 stored rank Field outside the Record key, discover original markers, compile retained/irreversible variants and exercise roundtrip/index/stale marker/legacy qualifier refusals. They do not establish runtime success or complete recipe/DAG coverage. Restore/public host/native/provider integration remains OPEN. R2 graph/API files were not inspected or changed during this review.

Exact frozen inputs (rechecked at sealing):
- `src/table-migration/g04-conversion.ts` — `ed83fd0eea7c22ea7a87e491d3b5d0b75279246e6873494fb5dfffed1b93ad7d`
- `src/table-migration/index.ts` — `53374e7395a34f2b861f94e97878f9fc314fbfa901d5357bfc141c72659a73ed`
- `src/table-migration/options.ts` — `90762c75fd26a240cd7cb020a000018db0b35d47978ada590a2bb2ba5d90bc8e`
- `src/table-migration/phases-options.ts` — `84839c49132de1d8f639df3ed8b9730d5b2c5d2596fb0dcbe398f2e86c133915`
- `src/table-migration/internal.ts` — `84be6258dc632f74f560ba9aa2e6c801cda66d62647f4d62486010fe0dbaf519`
- `src/table-migration/inventory.ts` — `8c6d52141a3da380f763d2e81299537fc6246d8b6a06c8027e78afee992a035c`
- `spec/extensions/tables/migration-discovery-0.4.schema.json` — `857fe9f0499c300ff3dd4cf73758905cc9deff9c4269a51826ec362d7eed824e`
- `spec/extensions/tables/migration-options-0.7.schema.json` — `0c6d45aa516cff85c92cad288c8a0ff61358d0003ad873fb982f8ff20ec95f0b`
- `spec/extensions/tables/migration-0.7.schema.json` — `eb2d3899bb8242bcac2bb38e60923c7d77e614258d2a5cb5e8ad51cf5fc29fe1`
- `spec/extensions/tables/migration-phases-0.6.schema.json` — `5921e57c46ec674d5af00eadcb7b9646697f13aee0c4c86f7c89c94821f2a433`
- `tests/lifecycle/g04-checked-conversion.test.ts` — `96c7c237f89ed2a9c44be2436ccf7e64f0e709964934302988b2fa3d525030f9`

No product edits, imports, runtime, AST/type/schema evaluation, tests, SQL, process probes or Git mutations. One affected correction batch is sufficient; reuse this review for the unchanged nine files and inspect only the two fixes plus their controls.
