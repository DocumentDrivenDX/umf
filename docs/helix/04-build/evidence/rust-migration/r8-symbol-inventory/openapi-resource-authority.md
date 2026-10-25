---
ddx:
  id: umf.evidence.rust-migration.r8-openapi-resource-authority
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
    - id: CONTRACT-011
      kind: informed_by
    - id: CONTRACT-012
      kind: informed_by
---

# R8 OpenAPI result-schema authority

This bounded family resolves six unique exported OpenAPI result schemas as
authored normative contract schemas. CONTRACT-011 directly identifies the
reference, extraction, schema-index, schema-reference and dynamic-reference
schemas as complete operation result contracts. CONTRACT-012 identifies the
OpenAPI-to-JSON-Schema projection result schema. No exact output generator is
recorded for these paths. The R8 ledger pins each source, governing contract,
public export and package build closure.

| Authored resource | Governing contract | SHA-256 |
| --- | --- | --- |
| `spec/extensions/openapi/reference-result.schema.json` | CONTRACT-011 | `ac158e1067c967987c5a6d83f7f893a825c6aae8c9395d9b5b0b7ef543f91dd5` |
| `spec/extensions/openapi/schema-extraction.schema.json` | CONTRACT-011 | `8dead87f20c71f1b272f0432cc6c784c0cdabc36a9301086d775c6e9c75ec780` |
| `spec/extensions/openapi/schema-index.schema.json` | CONTRACT-011 | `e662bdaaf7110ce3e1115a641b281abba5af23c499477dffb75f96450da3656b` |
| `spec/extensions/openapi/schema-reference.schema.json` | CONTRACT-011 | `c3f676ff83942f70660103557bf58d4f0770aa18b7b3a720c5194b533fbfeabf` |
| `spec/extensions/openapi/dynamic-reference.schema.json` | CONTRACT-011 | `a35970481117c904b833393a1754c8c8809d1a5b37c7b3da023d53e5a0a72b89` |
| `spec/projections/openapi-json-schema.schema.json` | CONTRACT-012 | `62fb50abfba6cccdc65698834caec4acd88b129595d52cca7ae10925521bee97` |

The focused R8 test requires every schema to have an authored authority entry,
match its source SHA-256, link the expected governing contract, appear in
`src/index.ts`, and map to its `dist/spec/` package path. It checks the SDK
build's `spec/` copy and the archive's complete `dist/` asset enumeration.
These are source/build-closure checks; no installed SDK artifact was produced
or qualified.

Validation: `node scripts/rust-migration/r8/gap-ledger.mjs --check` passed;
`node --test scripts/rust-migration/r8/gap-ledger.test.mjs` passed 9/9 tests.
The ledger SHA-256 is
`6d0803d2d80392372e3863d39c2d9b4e585686934e55a2772e2fc4a9e7d9538d`. Current
resource-authority counts are 14 generated-known, 13 authored-known, 109
candidate-generated, and 62 unresolved aliases. The remaining unresolved and
candidate authorities stay open.
