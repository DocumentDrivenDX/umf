---
ddx:
  id: umf.evidence.rust-migration.r5-dataset-values
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: TP-001
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-049
      kind: informed_by
    - id: CONTRACT-056
      kind: informed_by
---

# R5 dataset-values: TypeScript behavior freeze

This packet contains the frozen live TypeScript baseline and a bounded opt-in
Rust core implementation of `validateCoreDatasetValues`. It does not change the
default TypeScript API or add Node, Bun, Python, or WASM bindings.

## Surface and boundaries

The full operation exports `validateCoreDatasetValues` and
`verifyCoreDatasetValues` from `src/model/dataset-values.ts`, and
`coreDatasetValueOperationSchema`. The adjacent
`src/model/dataset-values-compact.ts` exports compact validate/verify wrappers
plus internal work-accounting helpers and its separate operation schema. The
compact profile is governed by CONTRACT-056 and is not included in the proposed
first Rust slice. The full operation composes document validation, Record value
receipts, Key tuple v3 receipts, key uniqueness, and a directed monomorphic
independent-lifecycle relationship subset. It preserves unresolved source and
input meaning as residuals and never claims native coverage or authority.

`crates/umf-core/src/dataset_values.rs` exports
`validate_core_dataset_values`, `verify_core_dataset_values`, and reusable
`CoreDatasetValueValidator` with cached `validate`/`verify` methods. It
validates the operation input and complete receipt against the checked-in
versioned schemas, copies source/input, applies the current count/byte/work
preflight, composes the existing Record and Key operations, resolves supplied
relationship endpoints, preserves unsupported declarations as residuals,
checks distinct-peer multiplicity, and enforces final receipt limits. The module
is registered in the core crate. Record and Key receipts are produced by the
existing shared Rust operations, under the caller's single `Context`,
`Registry`, and capability set.

The bounded evidence cohort exercises: complete positive commerce envelope;
complete duplicate-locator invalid envelope; closed-scope and unknown-input
refusals; resource refusal; preserved unknown source meaning; supplementary and
lone-surrogate UTF-16 data; and an unsupported relationship lifecycle retained
as unresolved. The complete commerce differential validates all 11 Records, 11
Keys, and 10 relationship occurrences. The compact operation and receipt
verifiers remain outside this shard. Bindings and default TypeScript cutover
remain open.

## Frozen cohort

`freeze.ts` reconstructs inputs from the checked-in ontology and graph fixtures,
then records each full outcome in its own `frozen-*.json` file. Run it from the
repository root with `bun docs/helix/04-build/evidence/rust-migration/r5-dataset-values/freeze.ts`.
`frozen-typescript.json` indexes those case files. Each case contains the
complete copied envelope or full refusal, and each file fits the Rust source-text
limit. JSON serialization preserves JavaScript UTF-16 code units, including the
lone surrogate case. The cohort also includes mutation-sensitive controls for
first-wins duplicate locators, unknown relationship declarations, surrogate
unknown paths, duplicate-key diagnostic paths, unknown-key residuals,
unsupported-relationship source order, nested Key control failures, and a
50,000-value unknown source payload that reaches the conservative work/retained
receipt preflight. It also freezes invalid and unknown target-Key tuples to
check that the shared encoder updates both dataset obligations and unresolved
Key tracking.

Focused baseline: `bun test tests/core-dataset-values.test.ts` passed 8 tests and
86 assertions. Those tests cover the full receipt, verification, invalid
locators/keys/endpoints/multiplicity, parallel occurrences, unknown and
unsupported declarations, arbitrary integer tokens, copy/accessor safety and
the actual retained receipt budget. Output schema checks are part of the live
operation exercised by these tests.

The frozen source hashes are:

| File | SHA-256 |
| --- | --- |
| `src/model/dataset-values.ts` | `959d1a2b93e1337ff525e08ce67333adb963393f807e155380356946be8cd3c3` |
| `src/model/dataset-values-compact.ts` | `6f3a6c953f5880fa43ef90aa4ea135500a17bfd7592716dce2dbba3914889607` |
| `src/model/record-values.ts` | `925f28808e17058ee97cd7ab80c4358e5a09539613c5a8bf77b5a6e745ed8d74` |
| `src/model/key-tuple.ts` | `3351dce5112b1d3a8178af6d19f92597cb6b558f7327f32f33ecf10f73959f46` |
| `spec/core/dataset-value-operation.schema.json` | `217cc3c05e10cec1bb4e93cca1205c039f596e95080cba075823a9b8b351013d` |
| `spec/core/dataset-value-compact-operation.schema.json` | `89f502aa0cea1a75fba2ff586c795c875a980b96af3e01d3117538e9fe12e74e` |

The case files retain complete source/input copies and results; the largest
case is `frozen-commerce.json` at 1,423,072 bytes. Deterministic outcome digests (SHA-256 over
compact Python `json.dumps(..., ensure_ascii=True)` of each outcome) are:

| Case | Outcome | Digest |
| --- | --- | --- |
| commerce | complete success envelope | `6923d6257fd79ffac1b2c772c6749956a432c382814e3e648eae77a1cfb88ac6` |
| closed_scope | `CORE_DATASET_INPUT` refusal | `3f41f6bbcad0434885f8377afd01216545f9fd433bf0cdac275fd07389fd0e79` |
| unknown_input_member | `CORE_DATASET_INPUT` refusal | same as closed_scope |
| duplicate_instance | complete invalid-result envelope | `37e7e6709e608adfbc2977448a846a6fc9d419f9856cce801e514cadaf06b0f6` |
| unknown_source_meaning | complete unresolved envelope retaining opaque value | `9d9d42a8a3ae4ea68d3580c6de8bb1196a971abfcadb10b2c094e3eaf2fc500b` |
| supplementary_and_surrogate | complete envelope retaining UTF-16 text | `fde2dcec3c1421c681e338aeacb6b2f3c4698325c709bc78fb64899122e4ee7f` |
| oversized | `LIMIT` refusal | `02337f3bf5390dea332aa336dd7b6fdbf75300968e3d1543215b0517d339c7cd` |
| unsupported_lifecycle | complete unresolved envelope | `3632877e51deecc1021ecec1e528c1353831cfa7ab4d17ab7c12e0a1cc7ddf11` |

The Rust integration test compares complete parsed values with object-member
order ignored and array order retained. These digests are supplemental checks;
they do not claim byte-preserving source serialization. The Rust implementation
uses `Value::Utf16` throughout admission, residual retention, and output.

## Rust evidence and remaining gates

The focused Rust integration suite uses Rust 1.90.0 and passed nine tests
(`cargo test -p umf-core --test r5_dataset_values --locked --offline`; 9 passed,
0 failed, 247.12 seconds). It compares complete
successful and invalid receipt
values recursively (object order ignored, array order retained), including all
receipt fields and diagnostics in the checked cases. It compares refusal code
and message for schema, closed-scope, unknown-member, oversized, and source
value-count inputs. The source value-count case confirms TypeScript and Rust
both refuse in the earlier work/retained-receipt preflight; it does not exercise
the final assembled-result copy limit. Mutation-sensitive target-Key cases
confirm invalid tuple values invalidate both dataset obligations, while unknown
target equality marks both unresolved, retains the target values, and prevents
inferred multiplicity failures. The independent oracle
`independent-schema-check.mjs` passed Ajv 8.20.0 Draft 2020-12 validation over
the serialized Rust-produced artifact from the final post-repair run at
`/private/tmp/umf-r5-dataset-values-rust-output-final.json`; its SHA-256 is
`df5f219672740cd314a1ac0b3ff1d452e3e40d3e985a0ae5f5d640d425bef701`.

Current implementation hashes:

| Rust source | SHA-256 |
| --- | --- |
| `crates/umf-core/src/dataset_values.rs` | `83a0589a92a70588c03e99f9a9b57f6ba8911c3d549ce8de73ca476063a2bdea` |
| `crates/umf-core/tests/r5_dataset_values.rs` | `0dbd0347028c303981afc81c044053e1ebf31f07cae61cc0418164c541c16715` |

These hashes identify the Rust files tested in this packet. The TypeScript
source hashes above identify the live predecessor captured by `freeze.ts`.
The new target-Key frozen outcome digests (SHA-256 over compact Python
`json.dumps(..., ensure_ascii=True)`) are:

| Case | Outcome | Digest |
| --- | --- | --- |
| invalid target Key tuple | `dataset.keys` and `dataset.relationships` invalid; `KEY_TUPLE_VALUE` | `5e524ee77478faef4edbf637fc5b602383ac97d6d3d13e44be19bf26b88327ec` |
| unknown target Key equality | both obligations unresolved; key and relationship residuals retained | `b524d6c1dba975d26f61f384bc44ee0e5340578843ad484266133057c1cc9313` |

The live-TypeScript freezer was extended without replacing historical cases.
The wrong-version source packet proves the expected `CORE_DATASET_SOURCE`
refusal; the mutation-sensitive Rust test also observes source-validation
meter charges before that refusal. Four separate verify packets cover complete
commerce recomputation, stale current source, stale expected input, and a
forged result. Rust matches the exact successful envelope or refusal code and
message. The verifier's object comparison sorts UTF-16 member references,
retains array order and literal values, and charges sort comparisons by maximum
key length plus key/string equality units. A long-common-prefix unit vector
asserts those charges are delivered to the caller's meter.

The bounded unit regression passed separately with
`cargo test -p umf-core --lib comparison_meter_covers_long_prefix_sort_and_string_equality --locked --offline` (1 passed). Compact validate/verify remains open. CONTRACT-056's historical core 0.8.0 statement was reconciled with the operation schema and current implementation's core 0.10.0 profile before compact qualification.

Independent Sol review on 2026-10-24 checked the final source/test hashes above,
reran the focused Rust suite (9/9, 249.38 seconds), the live Bun suite (8/8,
86 assertions), and the complete commerce capture (1/1, 74.62 seconds).
Ajv 8.20.0 independently validated that Rust-produced receipt against the
Draft 2020-12 result schema; the captured artifact SHA-256 is
`df5f219672740cd314a1ac0b3ff1d452e3e40d3e985a0ae5f5d640d425bef701`.
No P1/P2 remains in this bounded full-receipt validate/verify cohort. The
compact version conflict was resolved in CONTRACT-056 to the current core
0.10.0 schema and TypeScript source; compact implementation is still open.

| Added evidence | SHA-256 |
| --- | --- |
| `freeze.ts` | `7629961876a08fe54b62ec94b2f1b612480ffbf1c1352d6ef923d9e77969f441` |
| `frozen-typescript.json` | `faeb7ad54e503427b1a3d1ad7e0361088f3480992dda0d28432a774fb52f7031` |
| `frozen-wrong_version_document_validation_order.json` | `771504b5b33a5616fc26780148ad97394017e04ef7ab0cc70427445e03c189a9` |
| `frozen-verify-typescript.json` | `7121d6454ddbe8b5ac5b260ec52044fd0c2378aa851dea6e6280b85b45e8edec` |
| `frozen-verify-valid_commerce.json` | `3618fe8853a6acfda52866420ee7a69b77d2273d0e26903ee99cb0d0779ba9b3` |
| `frozen-verify-stale_source.json` | `4011beeff9fae6be61d487568b3fa55d5615246f0d64603189e4e05808474c21` |
| `frozen-verify-stale_input.json` | `486cff8a2fb4b2bd22b13b440ebbb1691d57a38a7e6076468579b4218e1e3020` |
| `frozen-verify-forged_result.json` | `9bfb5a505895cda3756c86fa9aff8c591da44e1567893631fe541002c00a9fd0` |

The Rust implementation performs the predecessor's final structural copy and
normalizes its structural-limit error shape. The 50,000-value case is stopped
by the earlier preflight, and this cohort has not demonstrated an input whose
assembled output independently crosses the final copy value limit while passing
preflight. An additional live-TypeScript boundary search used a schema-valid
projection of the commerce source containing the `customers` Record, its two
Fields, and one Key (52 source values, one maximum Key, no relationships or
declarations), with repeated Customers records and unique instance IDs. With
empty field values, 656 records passed preflight at an estimate of 99,916
values and assembled to 87,988 values; 657 records refused in preflight at
100,068 estimated values. With the original present values, 378 records passed
at an estimate of 99,996 and assembled to 75,301 values; 379 records refused in
preflight at 100,260. The returned receipts were counted by the same recursive
JSON-value definition used by the final copy. This search found no independently
reachable final-copy overflow and was not a Rust differential over these large
synthetic receipts; it does not prove Rust assembled-copy boundary safety.
Aggregate-output boundary reachability and parity therefore remain unproven;
no aggregate-output parity claim is made.

This is a bounded validate/verify operation slice, not complete
`validateCoreDatasetValues` or `verifyCoreDatasetValues` parity. Verification
is tested on the commerce receipt and the three frozen stale/forged cases; the
whole adversarial verifier input, budget, and refusal-order space remains open.
The validate slice covers the commerce graph's exercised
relationship subset and one unsupported lifecycle residual, but does not
establish all CONTRACT-049 relationship branches or key-equality corner cases.
It does not implement compact operations. Rust `Value` copies and input/output
traversal are bounded by preflight and shared context;
auxiliary `Vec`/`BTreeMap` capacity is not separately allocator-metered, so no
hard-isolation claim is made. Bindings and browser/native host behavior remain
unqualified.
TypeScript remains the default and authoritative runtime for consumers.

## Remaining gates

Remaining gates are full current `CONTRACT-049` adversarial relationship and
key-equality coverage, adversarial verification/recomputation beyond the frozen
commerce/stale/forged cohort, compact receipts
under `CONTRACT-056`, aggregate-output final-copy boundary parity, Node/Bun and
real Chromium/WASM bindings, and native/browser host resource controls. Rust
`Value` copies and input/output traversal are bounded by
the preflight and common context; auxiliary `Vec`/`BTreeMap` capacity is not
separately allocator-metered and no hard-isolation claim is made. No binding
invokes this operation yet. TypeScript remains the default and authoritative
runtime for consumers. Do not promote this opt-in core candidate to complete
support until those gates pass.
