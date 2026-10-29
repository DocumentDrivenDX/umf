---
ddx:
  id: umf.evidence.rust-migration.r9-avro-cardinality-classification.plan
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: ADR-006
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-007
      kind: informed_by
    - id: CONTRACT-040
      kind: informed_by
---

# R9 Avro Cardinality Classification: bounded implementation plan

**Base:** committed source `4dc0d1daeaecd86ba9286e6cf93d7d5d041cee2d`; core 0.10.0; Avro structural profile 1.12.0; classification binding 1.0.0. This is an opt-in Rust candidate, not default-route retirement or installed-release evidence.

## Authority and current behavior

ADR-006 requires one Rust semantic owner shared by the Rust CLI, Node/Bun, Python and browser WASM; bindings own host admission/presentation. CONTRACT-040 establishes `one|array|map|unspecified`, present-non-null interpretation, retained native payload, explicit residuals, strict/report behavior and no native meaning replacement. The current TS exports are the behavior authority: `src/core-ideals/cardinality-avro.ts`, `avro-cardinality-type.ts`, `spec/core/avro-cardinality-classification.schema.json`, and `spec/extensions/avro-cardinality/package.json`. Existing `avro_document` import/export/get_node and `avro_fields` metadata are the production native archive authority. `cardinality.rs` alone is not Avro structural classification.

## Planned implementation sequence

1. Add a bounded core module that validates request/source/receipt, preserves ordered source/dependencies, resolves type syntax only, builds recursive logical identities and copied target fields, derives scalar family using shared Avro rules, reports strict/report residuals, verifies by recomputation and recovers retained source strings.
2. Add a versioned tagged-wire dispatch operation and reuse cooperative Context/resource accounting. Parse only the known result/request schemas via `include_str!`, not source JSON documents through serde.
3. Add thin Node/Bun, WASM, Python, and CLI profile routes that pass the same tagged Value to Rust. Keep the route explicitly opt-in.
4. Freeze full ordered envelopes from the TypeScript API before Rust parity replay; exercise success graphs, losses, malformed inputs and receipts, and exact archive recovery on CLI, Bun/Node and real Chromium. Record unavailable Python/WASM evidence explicitly.
5. Add only the three exact Rust owner mappings after parity evidence; retain explicit reference routing and list unproven contract coverage.

## Known unknowns

No named CONTRACT-001–011 section specifically governs this Avro cardinality operation; no inferred requirement is added on that basis. CONTRACT-040 is the upstream core-ideal contract. Native Avro compiler equivalence, broad Avro conformance, default retirement, installed release, other core versions and untested host/package routes are outside this slice.
