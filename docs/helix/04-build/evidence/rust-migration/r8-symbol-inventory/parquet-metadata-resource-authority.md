---
ddx:
  id: umf.evidence.rust-migration.r8-parquet-metadata-resource-authority
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
    - id: CONTRACT-019
      kind: informed_by
    - id: US-019
      kind: informed_by
---

# R8 Parquet metadata schema resource authority

The exact Bun writer `scripts/parquet-metadata-schema.ts` emits these two
resources from one in-memory build:

| Output | Direct writer inputs | Public root export | SHA-256 |
| --- | --- | --- | --- |
| `spec/extensions/parquet/metadata.schema.json` | `spec/extensions/parquet/idl.json`, `spec/extensions/parquet/footer-decode.schema.json` | `parquetMetadataSchema` | `3ae48f23c36b25a1ec23256bf821b35b82fb3ea51903b24935d19bb515a0a435` |
| `spec/extensions/parquet/metadata-inspection.schema.json` | same | `parquetMetadataInspectionSchema` | `3e466f94dba3b21da3aa36a9e771f5e6afb375d9c23efa89448c2305de179159` |

CONTRACT-019's “Pinned IDL and named metadata” section explicitly names the
writer, both outputs and the pinned IDL; US-019-AC6 governs the generated
metadata descriptors and named FileMetaData view. The ledger hashes the
writer, these direct input resources, the Parquet source manifest and IDL
source/generator, runtime consumer, focused test, root export, and SDK
build/archive chain. The transitive authority of imported input files is not
promoted by this writer mapping. Its `package/dist/spec/extensions/parquet/`
route is build/archive source closure only; installed archive bytes remain
unqualified.

The writer's `--check` compares both expected byte strings before returning
and never writes either output. The isolated negative control corrupts each
output separately and confirms check mode rejects it without rewriting the
corrupted file or its sibling. `tests/parquet/metadata.test.ts` passes 3/3
(226 assertions); the full R8 ledger suite passes 26/26. Writer `--check`,
ledger `--check`, and `git diff --check` pass.

At this moving-source checkpoint the ledger records 32
`generated-authority-known`, 13 `authored-authority-known`, 91
`candidate-generated`, and 62 `authority-unresolved` resource authorities.
All 922 executable retirement gaps remain. Ledger SHA-256:
`6c967ab20be1efb9097895969c223928f427f30d080a401255cee32f3b56b499`.
Writer SHA-256 is
`94f7b57122dc8272e1ce028102511fb9c7166750f3c71b7157d4afa28eaef9f4`; direct
input hashes are `9e3b9b3c8c24e9c1e22b89f02c8dcce708e37434813ad40bec4e8bb95197a4fb`
and `8cfe8a3f412456ca064a6e4a947479680a35403c5387f65008c35a827dec62db`.
The ledger generator and focused test hash to
`6b22d8c80a16d972d9b0e7766c6eae185681650be26ce607bab604e71924069c` and
`0a9670719f0d024e5628d27853abd5266c1f0afa7d2fb8871e94684b5e5dfeea`.

`./reference`, default-route retirement, installed-release qualification and
the final shared-source recapture remain open.
