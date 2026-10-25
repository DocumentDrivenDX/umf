---
ddx:
  id: umf.evidence.rust-migration.r8-arrow-base-resource-authority
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
    - id: CONTRACT-016
      kind: informed_by
---

# R8 Arrow base resource authority

This bounded set covers the `umf.arrow` envelope schema, its integration-schema
grammar, and the exported logical FlatBuffer model schema. CONTRACT-016
explicitly assigns `schema.json` and `integration-schema.json` to the Arrow
representation at lines 24–26 and the FlatBuffer model schema to the pinned
Arrow declarations at lines 148–150. `src/index.ts` exports each resource.

`scripts/arrow-schema.ts` produces `schema.json`, `integration-schema.json`
and the adjacent package manifest. The envelope schema directly imports the
`$defs.node` definition from `spec/extensions/postgresql/schema.json`; the
ledger pins that file and `src/model/types.ts` as inputs alongside the
generator. Both generated resources pass the script's new read-only `--check`
mode.

`scripts/arrow-flatbuffer-schema.ts` verifies every path and SHA-256 listed in
`spec/extensions/arrow/flatbuffers/manifest.json`, parses the five pinned
`.fbs` inputs, and emits the exported model schema. The ledger pins the
generator, `src/model/types.ts`, manifest, all five `.fbs` files, `LICENSE.txt`
and `NOTICE.txt`. The manifest identifies Arrow 21.0.0 commit
`ee4d09ebef61c663c1efbfa4c18e518a03b798be`; the generator check passed with
59 declarations, 85 fields and 64 enum/union members.

| Exported resource | Generator | SHA-256 |
| --- | --- | --- |
| `spec/extensions/arrow/schema.json` | `scripts/arrow-schema.ts` | `e0d111ebbb39277667ef3e7dace7f1dead9833e2f1e621db5b1354a603889677` |
| `spec/extensions/arrow/integration-schema.json` | `scripts/arrow-schema.ts` | `cc72700f960ab7d064860cae3d08198771aabc620326341a182e461b3a2f3af5` |
| `spec/extensions/arrow/flatbuffer-model.schema.json` | `scripts/arrow-flatbuffer-schema.ts` | `b860c6d94b854230339244b4786824c72f5b1455cc442c25fe67c6bdde47e67a` |

The focused ledger test verifies contract, generator, transitive-input,
public-export and package-build hashes; it also confirms the vendored file
hashes against their manifest. It invokes both generators in check mode and
asserts the exported resource bytes remain unchanged. SDK build source copies
`spec/` to `dist/spec/`, and the package archive validates the complete dist
asset set. These are source/build closure checks; installed archive bytes are
not qualified here.

Validation: `bun scripts/arrow-schema.ts --check` passed;
`bun scripts/arrow-flatbuffer-schema.ts --check` passed;
`node scripts/rust-migration/r8/gap-ledger.mjs --check` passed; focused R8
tests passed 12/12. Ledger SHA-256:
`6d0803d2d80392372e3863d39c2d9b4e585686934e55a2772e2fc4a9e7d9538d`.
Resource-authority counts are 14 generated-known, 13 authored-known, 109
candidate-generated and 62 unresolved aliases. The remaining Arrow-specific
unresolved resources stay open.
