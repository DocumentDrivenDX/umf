---
ddx:
  id: umf.evidence.rust-migration.r8-symbol-inventory.delta-profile-schema-authority
  type: execution-evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-018
      kind: informed_by
    - id: US-018
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-symbol-inventory
      kind: informed_by
---

# R8 Delta profile schema authority checkpoint

## Scope and exact writers

`CONTRACT-018` directly names `spec/extensions/delta/datatype-schema.json` as
the description of the known recursive source shapes and opaque future types.
`US-018-AC1` governs exact schema tokens, unknown content, known-shape failures,
and omission of absent map nullability. The separate table-context section of
the contract identifies the source context/package schemas under
`spec/extensions/delta-table/`; `US-018-AC4` governs preservation of the
explicit metadata/protocol pair and its future content. This establishes the
two versioned source resources' generated authority, not complete Delta table
or protocol support.

| Authority | Exact writer | Source output | Companion outputs |
| --- | --- | --- | --- |
| Delta recursive datatype grammar | `scripts/delta-schema.ts` | `spec/extensions/delta/datatype-schema.json` (`urn:umf:delta:schema-json:0.1.0`, SHA-256 `c445153a9b434c66ddb8ee2d9a723b5c57d652375e3b751f15663ab31304807f`) | `spec/extensions/delta/schema.json`, `spec/extensions/delta/package.json` |
| Delta table-context grammar | `scripts/delta-table-schema.ts` | `spec/extensions/delta-table/context-schema.json` (`urn:umf:delta:table-context:0.1.0`, SHA-256 `d59f573eb78d87b04d35a943305abb5392e47b00489762656e2406406e5c1156`) | `spec/extensions/delta-table/schema.json`, `spec/extensions/delta-table/package.json` |

Both writers import `CURRENT_CORE_VERSION` from `src/model/types.ts` and read
`spec/core/native-json.schema.json` to embed the common NativeJson node grammar
in their package payload. The ledger pins those files, the writer, contract and
story, exports, source consumers and focused tests, plus the build/archive
source closure. It remains history-independent; the present evidence does not
claim the earliest authoring revision of these schemas.

The focused test executes each Bun writer in an isolated temporary tree after
copying the required source inputs, then byte-compares all three emitted files
with the checked-in outputs. This is full-output source-generation evidence;
it does not mutate checked-in files and does not establish installed archive
bytes.

## Consumers and limits

`src/index.ts` re-exports both schema resources. The schema-profile consumer is
`src/adapters/delta/index.ts` and its focused suite is
`tests/delta/schema.test.ts`; the table-context consumer is
`src/adapters/delta/table.ts` and its suite is `tests/delta/table.test.ts`.
Build rules copy source specs into `dist/spec`, and the Python SDK archive
includes built `dist` files. No installed archive replay is included, so both
resources remain `not-installed-qualified`.

This checkpoint establishes only current source writer/input/output and
contract/story authority. It does not claim transaction-log reconciliation,
table read/write compatibility, client feature support, safe table evolution,
native equivalence, or Rust runtime support.
