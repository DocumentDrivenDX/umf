---
ddx:
  id: umf.evidence.rust-migration.r8-inventory-shapes.sol-review
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.evidence.rust-migration.r8-inventory-shapes
      kind: reviews
    - id: umf.plan.rust-migration
      kind: informed_by
---

# Sol review of declaration shapes and current source selections

I reviewed the AST-based declaration labels and the five additional default
source-selection mappings. Syntax shape is recorded separately from migration
disposition; all 3,375 route-specific rows remain `unreviewed` for retirement.
The mapping names exact Rust owners, wire operations, Node/WASM binders, source
and bounded evidence hashes for the CSV Boolean pair and three core inspectors.
It reports 29 selected names per default route without promoting any to an
installed binding qualification or removing any of the 922 logical gaps.

I independently ran the inventory and ledger check-only generators, seven
ledger tests, two shape tests (21 assertions), and TypeScript type checking.
The first review found two stale descriptions that omitted the new five; they
were corrected before this note. The sibling receipt pins the generated hashes
for this moving-source capture. No P1/P2 remains in this inventory classification
slice. Source changes after the capture require regeneration; these counts and
hashes do not qualify a complete SDK or retire executable TypeScript paths.
