---
ddx:
  id: umf.evidence.rust-migration.r8-smithy-resource-authority
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
    - id: CONTRACT-014
      kind: informed_by
---

# R8 Smithy resource authority

This bounded review resolves seven unique package-root JSON resource aliases as
authored normative schemas. CONTRACT-014 is their authoring authority; the
schema files are package data, not generated output. `src/index.ts` exports all
seven. The current generated ledger pins each schema and the relevant contract,
adapter/export, and package-build sources. It records no exact output generator
for these paths.

CONTRACT-014 states that `schema.json` completely describes the Smithy payload
(lines 18–20), identifies the native structure schema (lines 31–39), assigns
`native-assembly.schema.json` and `assembly-result.schema.json` to the assembly
bridge/public result (lines 129–133), identifies the two selection schemas
(lines 207–212), and names the complete projection result schema (lines
249–254). The listed schemas are explicit JSON imports in `src/index.ts`.

| Authored resource | SHA-256 |
| --- | --- |
| `spec/extensions/smithy/schema.json` | `25de5fa028aeb9882415740a98c41be7b049b9a817b355abd21d2ddfeb34b942` |
| `spec/extensions/smithy/native-structure.schema.json` | `b6e931ca2f676c981b39fe7a318e8f1d1fb6e27ac00730773e711d17cda0ee25` |
| `spec/extensions/smithy/native-assembly.schema.json` | `b04f35c422ddf572deaba541cce701c179c5c68ea9e52e4aa23a3ba7b2f3c8b3` |
| `spec/extensions/smithy/assembly-result.schema.json` | `e5a55f24e854e25bec1c554af72f35f2d2fe8c1da26c9c0578cc6bdd77a9452d` |
| `spec/extensions/smithy/native-selection.schema.json` | `3309db13703066e0ca21a2ded143d51fc70213660e1f433ad56064a84124ea4d` |
| `spec/extensions/smithy/selection-result.schema.json` | `0507ce0583c463be8eb01230ef4f3217f7d15da79cb953b84e6a74eabac1789e` |
| `spec/projections/smithy-json-schema.schema.json` | `b9ef9811b9aa27dcdd03f637d88b24257f9658253e80f3976353e68888e02cbc` |

The SDK build copies `spec/` to `dist/spec/`; the package archive validates and
includes the complete `dist/` asset set. The focused gap-ledger test checks the
seven source hashes against the generated ledger, confirms contract/build
closure pins and per-resource archive paths, and checks those copy/archive
rules. This is source/build-closure evidence only. It does not qualify an
installed archive or release artifact.

The gap ledger is at SHA-256
`6d0803d2d80392372e3863d39c2d9b4e585686934e55a2772e2fc4a9e7d9538d`; its
resource-authority counts are 14 generated-known, 13 authored-known, 109
candidate-generated, and 62 unresolved aliases. Route multiplication means
the seven reviewed unique files appear as 21 route rows. The remaining 62
unresolved aliases and all candidate-generator authority questions remain open.

Validation: `node --test scripts/rust-migration/r8/gap-ledger.test.mjs` passed
8/8 tests. Regenerate and check the ledger with
`node scripts/rust-migration/r8/gap-ledger.mjs` and
`node scripts/rust-migration/r8/gap-ledger.mjs --check` after source changes.
