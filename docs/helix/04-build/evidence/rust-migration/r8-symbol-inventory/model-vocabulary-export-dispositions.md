---
ddx:
  id: umf.evidence.rust-migration.r8-model-vocabulary-export-dispositions
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-symbol-inventory
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-040
      kind: informed_by
---

# R8 model vocabulary export dispositions

The gap ledger supplement distinguishes the five runtime exports from
`src/model/types.ts` individually. `SCALAR_TYPES`, `ELEMENT_KINDS`,
`NULLABILITIES`, and `CARDINALITIES` are frozen data aliases of generated
`coreVocabulary` arrays. Their value authority is `spec/metamodel/umf.yaml`:
`domains.vocabulary.scalarType` resolves `knownScalarType`, `kind` resolves
`knownElementKind`, `nullability` resolves `knownNullability`, and
`cardinality` resolves `knownCardinality`. `crates/umf-metamodel` emits these
arrays into `src/generated/core-model.ts`; the Bun host records the source
closure and Rust compiler provenance in
`spec/metamodel/generated/manifest.json`.

The generated arrays at model version 0.10.0 are:

| Export | Generated values | Direct runtime callers | Disposition |
| --- | --- | --- | --- |
| `SCALAR_TYPES` | `boolean`, `integer`, `decimal`, `float`, `string`, `binary`, `date`, `time`, `timestamp`, `bits128`, `uuid` | Parquet Cardinality shape; Security protection functions | Frozen generated data alias |
| `ELEMENT_KINDS` | `field`, `record`, `group` | Core Field-kind operations | Frozen generated data alias |
| `NULLABILITIES` | `required`, `absent-allowed`, `unspecified` | Core Nullability operations | Frozen generated data alias |
| `CARDINALITIES` | `one`, `array`, `map`, `unspecified` | Core Cardinality operations | Frozen generated data alias |
| `scalarTypesForVersion` | Current version returns `SCALAR_TYPES`; unsupported version returns `[]` | Core scalar-type inspection; Bit128 Field validation | Executable TypeScript version gate |

The generated source and model are hash-bound in the supplement. At this
checkpoint the model hash is
`42144576e3b15da4945ca744623a31967e3b29efa54da8ba3961e446b1c0e34b`, generated
`core-model.ts` hash is
`6536e081663c2662866e2805c0db981807ca658fb10e195d4732034691b9761e`, and
`src/model/types.ts` hash is
`6943cdad1c110de2dae56ac3820524f2874eddd9a84580be4da93477bbe76a0c`.
The two direct `SCALAR_TYPES` callers are also included in the generated
provenance closure: `src/core-ideals/parquet-cardinality-shape.ts` hashes to
`b2fbf87e2cf110403288d0f91d591bf6a659e413c3db3bf512af0d56133febb5`, and
`src/extensions/security/protection/functions.ts` hashes to
`812cc514b453f519c19c256401f3bc71b7e63c1cc962ec2907e25debc528098c`.

All five appear on Node and browser V4 roots through `export * from './index'`
and `src/index.ts`'s model export. `./reference` is the explicit TypeScript
`src/index.ts` route. The supplement records no Rust binding route for these
exports and does not change their ledger declaration kind, retire any route,
or reduce the 922 logical executable gaps. It makes no installed-byte or
release qualification claim.

The focused test imports the actual Bun runtime exports, verifies the four
array aliases are identical to the generated `coreVocabulary` arrays and
frozen, checks current/unsupported version behavior, verifies the recorded
callers and route rows, and checks every provenance hash. The ledger suite
passes 24/24 and this disposition test passes 1/1. Ledger `--check` and
`git diff --check` pass for this moving-source checkpoint. Ledger SHA-256:
`5ed4c681422756ea16835905e810e21eba739ef6623d22893e75f95a1b70f23d`.
