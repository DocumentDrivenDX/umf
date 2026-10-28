---
ddx:
  id: umf.evidence.rust-migration.r8-json-schema-edit-current-reference
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-002
      kind: informed_by
---

# R8 JSON Schema edit current-reference replay

[`current-reference.json`](current-reference.json) records the current
TypeScript behavior for the exact eleven frozen `editJsonSchemaNode` cases in
the R5 tree-operations packet. The reproducible checker is
[`json-schema-edit-current-reference.mjs`](../../../../../../scripts/rust-migration/r8/json-schema-edit-current-reference.mjs).
Run `bun scripts/rust-migration/r8/json-schema-edit-current-reference.mjs
--check` to verify the receipt or add `--write` to refresh it after reviewing
source changes.

This receipt pins the packet and computes its TypeScript input closure from
`src/model/native-json.ts` and `src/adapters/json-schema/index.ts` using the
repository `tsconfig.json` module-resolution settings. The receipt includes all
resolved local files plus `package.json` and `bun.lock` hashes. Seven resolved
local inputs differ from the historical baseline closure, and the package
manifest hash also differs; `bun.lock` is unchanged. The old installed artifact
replay is therefore source-drifted. This replay independently confirms the
current TypeScript reference outcomes against the frozen eleven case
expectations; it does not run a Rust candidate and makes no installed Node,
Bun, WASM, Chromium, or default-route parity claim.
