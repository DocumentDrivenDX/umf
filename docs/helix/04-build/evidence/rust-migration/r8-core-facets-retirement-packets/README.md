---
ddx:
  id: umf.evidence.rust-migration.r8-core-facets-retirement-packets
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-040
      kind: informed_by
    - id: umf.evidence.rust-migration.r5-core-facets
      kind: informed_by
---

# R8 Core Facets default-route packet prerequisite

The exact `/4` packet profile specifies the four Core Facets operations against
the R5 TypeScript, meaning, regression, and exact-error inputs, plus the
immutable `expanded-cases.json` fixture. That fixture freezes the TypeScript
outcomes for missing and inapplicable facets, partial meaning with unknown
groups/units, string and binary lengths, decimal precision/scale and safe-
integer edges, JSON/YAML-saved receipt verification, cross-document refusal,
and a successful representable historical projection. The packet builder reads
these outcomes; it does not infer expected Rust behavior from a Rust run. The profile
records returned envelopes and exact refusals, ordered host observation traces,
case-level Rust dispatch counts and operation order, and zero Rust calls on the
TypeScript reference route. Its operation inventory is `inspectCoreFacets`,
`declareCoreFacets`, `verifyCoreFacetDeclaration`, and
`historicalCoreFacetPatch` under CONTRACT-040.

The packet files and reproducible builder are in
[`scripts/rust-migration/r8/facets-retirement-packets/`](../../../../../../scripts/rust-migration/r8/facets-retirement-packets/).
Run the focused gate with:

```sh
node scripts/rust-migration/r8/facets-retirement-packets/build-packets.mjs --check
node --test scripts/rust-migration/r8/default-route-retirement-evidence.test.mjs
```

The `/4` manifest profile requires exactly the ordered four-operation inventory
and two archive cohorts. A passing profile returns bounded evidence only; it
does not change any default-route disposition or qualify a release. The expected
host traces and Rust operation tags still require a fresh dependency-resolved
replay before they count as observed evidence. The saved JSON/YAML cases freeze
the recovered receipt values; the host replay must exercise the serialization
round trips to establish those cases. Both archive cohorts and independent
acceptance remain separate prerequisites.
