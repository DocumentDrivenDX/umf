---
ddx:
  id: umf.evidence.rust-migration.r8-symbol-inventory.versioned-core-operation-resource-authority
  type: execution-evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-symbol-inventory
      kind: informed_by
    - id: CONTRACT-040
      kind: informed_by
    - id: CONTRACT-076
      kind: informed_by
    - id: ADR-005
      kind: informed_by
    - id: CONTRACT-080
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-symbol-inventory.older-core-operation-schema-authority
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-symbol-inventory.core-operation-schema-authority
      kind: informed_by
---

# R8 versioned core operation resource authority

## Scope and conclusion

This review covers the versioned Core operation schemas named in the resource
authority task. It resolves direct authored authority for `kind-operation-v8`
and `nullability-operation-v7`. The following six resources remain
`authority-unresolved`: `cardinality-operation-v4`, `facet-operation-v3`,
`key-operation-v2`, `kind-operation-v6`, `nullability-operation-v5`, and
`record-type-operation-v6`.

| Resource | Classification | Current SHA-256 | Evidence boundary |
| --- | --- | --- | --- |
| `spec/core/kind-operation-v8.schema.json` | `authored-authority-known` | `3f7cc27f133f0a242b42ae2f41b665d046d0e069668235c82b0b2cd38c8bd68c` | Added with CONTRACT-076 at `25a38767a3ce7a2c7af297cf541196e9cbc6ad4a`; updated at `8706814a9605d7325eef32a5df3d05696de00b62`. |
| `spec/core/nullability-operation-v7.schema.json` | `authored-authority-known` | `6f0d20390165d2da79f22a69b3fec0126512c9f870a49445a5c33e55d68ff2d9` | Added with CONTRACT-076 at `25a38767a3ce7a2c7af297cf541196e9cbc6ad4a`; updated at `8706814a9605d7325eef32a5df3d05696de00b62`. |
| `spec/core/cardinality-operation-v4.schema.json` | `authority-unresolved` | `c2562ad726b58306c18332512f2b5388ddc625abb7494c532794682492300d45` | Historical writer output only; current edit has no complete direct-authority or writer receipt. See the older operation-schema review. |
| `spec/core/facet-operation-v3.schema.json` | `authority-unresolved` | `74c1ca75e2bac44afd0010292b82741618e9cb031cc37159667fa4f4ff95fd9f` | Historical writer output only; current edit has no complete direct-authority or writer receipt. See the older operation-schema review. |
| `spec/core/key-operation-v2.schema.json` | `authority-unresolved` | `67c35f417d940d9d3ff8c4fe7ca57ea29d319a1da4310ea3f9d2437160e9095b` | Historical writer output only; current edit has no complete direct-authority or writer receipt. See the older operation-schema review. |
| `spec/core/kind-operation-v6.schema.json` | `authority-unresolved` | `e1de0aba1c3db6a09e85332a10441a0eec7a2dca0a4e4249fab67fcc491783b8` | Historical writer output only; current edit has no complete direct-authority or writer receipt. See the older operation-schema review. |
| `spec/core/nullability-operation-v5.schema.json` | `authority-unresolved` | `442cc69c8998da361b775251b2e8842cece0d700fb1fa59dad4bd3de03f13c92` | Historical writer output only; current edit has no complete direct-authority or writer receipt. See the older operation-schema review. |
| `spec/core/record-type-operation-v6.schema.json` | `authority-unresolved` | `2b40d2be0562794f918738d96ee8f974f7133f26ee8476583b944c9f676a255d` | Historical writer output only; current edit has no complete direct-authority or writer receipt. See the older operation-schema review. |

## Direct authority for the current inspection schemas

CONTRACT-076 states the current read-only inspection result versions as kind
8 and nullability 7. The contract and the corresponding schemas were introduced
in the same change, `25a38767a3ce7a2c7af297cf541196e9cbc6ad4a`; that commit's
schema SHA-256 values are respectively
`b0ea478865567f2ee6c3b060df5eda10723cb4bdeaa4ff26eb7e0bba6d7b063e` and
`18bc5717486dd78997ba8b52ff9a24a5fa50166decdf6fe3226443f499030b17`.
The change also added the scoped inspection behavior and its contract language.
This is direct authorship evidence for those exact versioned resources; the
ledger does not infer authorship from filename similarity or consumer use.

The same files were updated in `8706814a9605d7325eef32a5df3d05696de00b62`.
Their exact blob SHA-256 values there match the current bytes above. The commit
also changed CONTRACT-076 and the current core references. No executable
schema writer is claimed. The ledger pins the contract, current TypeScript
consumer/export modules, build/archive rules, this evidence file, and both
authored revision hashes. The SDK archive route remains
`not-installed-qualified`; this classification does not establish installed
resource bytes or runtime behavior.

## Explicit unresolved cases

The six unresolved resources all have current hashes pinned above. The
cardinality, facet, Key, kind v6, nullability v5 and Record Type v6 schemas
were created by the historical `scripts/core-relationship-versioned-schemas.ts`
writer at commit `887d67410b42ffc58d8f0853185b33a603320e19`. The isolated
historical replay recorded in the linked reviews reproduced its exact older
outputs. Commit `8706814a9605d7325eef32a5df3d05696de00b62` then changed these
resources, and the old writer was moved into the metamodel-authority history
archive. Current metamodel manifests do not list these operation schemas as
outputs. Historical reproduction, current contract semantics, compiler input
hashes, and public consumption do not prove who authored the current exact
bytes; the six ledger rows therefore stay unresolved.

The prior older-schema review treated kind v8 and nullability v7 as unresolved
because their introduction history alone was insufficient. This checkpoint
adds the direct CONTRACT-076 version statement and coupled contract/schema
authoring evidence, resolving those two rows only. The other conclusions from
that review remain unchanged. No ledger JSON or inventory regeneration is part
of this checkpoint.

## Focused verification

Run:

```sh
node --test --test-name-pattern='versioned core operation schemas pin direct authoring history' scripts/rust-migration/r8/gap-ledger.test.mjs
```

The regression pins both accepted current hashes and their two history blobs,
checks their governing contract and source closure, and keeps all six listed
unresolved resources unresolved at their current hashes. It does not qualify
archive contents, installed artifacts, Rust runtime parity, or package release.
