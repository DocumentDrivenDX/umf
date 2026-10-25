---
ddx:
  id: umf.evidence.rust-migration.r8-symbol-inventory.delta-checkpoint-and-native-json-authority
  type: execution-evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-018
      kind: informed_by
    - id: CONTRACT-077
      kind: informed_by
    - id: US-018
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-symbol-inventory
      kind: informed_by
---

# R8 Delta checkpoint and native JSON resource authority checkpoint

## Delta Parquet checkpoint report schema

`CONTRACT-018` AC18 names
`spec/extensions/delta-log/parquet-checkpoint.schema.json` as the report schema;
`US-018-AC18` specifies the operation and its V1/V2 and sidecar boundaries.
The exact writer is `scripts/delta-parquet-checkpoint-schema.ts`. It composes
the reconciliation, sidecar-reconciliation, and Parquet-action schemas, embeds
their local definitions under distinct roots, and writes the named target. Its
current source has no `--check` mode. The ledger therefore pins the writer,
those three exact inputs, the transitive schema-builder/source closure, public
export, test, build, and archive rules. A focused regression copies the writer
and exact inputs to an isolated temporary tree, executes Bun there, and compares
the produced bytes with the checked-in schema without changing the repository
resource.

The output has `$id` `urn:umf:delta-log:parquet-checkpoint:0.1.0`. The checked-in
schema appeared in the repository checkpoint at `fc77c010a`; its blob SHA-256
there was `a398d31690e428417d5d8db22034210a74c3ee4130fe6c2b708ccdfd64627bcc`.
The metamodel-current-definition update `8706814a9` changed core references;
its output blob SHA-256 is
`32f00130c87f375894c1f6502c872cfbe0d7b988efcc21ee425e49e9aebdc228`.
This supports generated authority from the exact current writer and inputs;
normal ledger generation does not query Git history.

## Native JSON tree schema

`CONTRACT-001` directly states that
`spec/core/native-json.schema.json` and `src/model/native-json.ts` own the exact
JSON tree. `CONTRACT-077` uses that tree as the required `sourceData`
representation and forbids host-number rounding. The checked-in schema has
`$id` `urn:umf:native-json:0.1.0`, is exported from `src/index.ts`, and is used
by model/adapters and schema builders. The ledger hashes both governing
contracts, parser/export, representative direct consumers, focused parser
tests, and SDK build/archive rules.

The schema is present in the repository checkpoint `fc77c010a` with blob
SHA-256 `071e2dc97ffae0b8743b691ae4786c0b74eaa1ee54d881e1d8116dcb3f6a2839`;
its current bytes retain that hash. This repository history does not expose a
separate earlier authoring commit for the file. The authority disposition is
therefore based on the contracts' direct ownership/representation statements,
not an inferred authoring event or an executable schema writer. Its evidence is
limited to representation shape, contract-defined exact JSON-tree usage, source
consumers, and the current public export.

## Limits

For both resources, the SDK build rule copies `spec/` into `dist/spec`, and the
archive builder includes `dist`. These are source/build-rule findings. Neither
schema has an installed archive-byte replay here, so both remain
`not-installed-qualified`. This evidence does not claim full Delta checkpoint
recovery, Parquet reader equivalence, or native storage semantics.
