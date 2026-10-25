---
ddx:
  id: umf.evidence.rust-migration.r8-inventory-shapes
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.evidence.rust-migration.r8-symbol-inventory
      kind: informed_by
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: ADR-006
      kind: informed_by
    - id: TP-001
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-002
      kind: informed_by
    - id: CONTRACT-003
      kind: informed_by
    - id: CONTRACT-004
      kind: informed_by
    - id: CONTRACT-005
      kind: informed_by
    - id: CONTRACT-006
      kind: informed_by
    - id: CONTRACT-007
      kind: informed_by
    - id: CONTRACT-008
      kind: informed_by
    - id: CONTRACT-009
      kind: informed_by
    - id: CONTRACT-010
      kind: informed_by
    - id: CONTRACT-011
      kind: informed_by
---

# R8 declaration-shape supplement

The R8 export inventory now records deterministic syntax classifications per exact
route row. `declarationShape` classifies the declaration node; `initializerShape`
classifies a variable initializer only. These labels describe source syntax, not
runtime behavior, native support, or Rust coverage. Every `migrationDisposition`
is `unreviewed`: no row-level retirement review was supportable from source shape
or route selection alone.

The current inventory contains 3,375 route-specific declarations over 506 source
files. Its declaration shapes are 2,203 function declarations, 507 variable
declarations, 56 binding elements, 15 class declarations and 594 JSON resources.
Initializer shapes are 2,868 not applicable, 245 other expressions, 211 literals,
39 arrow functions, 6 call expressions and 6 identifiers. All 3,375 rows remain
unreviewed for migration disposition.

The recaptured inventory now records 29 source-selected Rust exports on each of
the default Node and browser roots: the prior 24 selections plus three core
inspectors and two CSV Boolean lexical operations. The ledger includes exact Rust
owners, wire operation names, binding wrapper files, bounded evidence references,
and current source hashes for those five additions. These source selections do not
establish installed binding routes; `bindingRoutesProven` remains zero.

The condition-aware ledger remains at 922 logical executable retirement gaps,
with 1,120 public names, 922 executable names and 198 inert JSON aliases. The
shape fields and five source selections do not alter declaration identity or the
legacy denominator. Current hashes and machine counts are recorded in
[receipt](receipt.json).

Focused Bun tests exercise declaration and initializer categories, uninitialized
variables, function declarations, AST-based rejection of comment/string false
positives, and the unreviewed disposition. The ledger tests cover exact mappings
for the five new route selections and reject a source-path substitution. TypeScript
typecheck and both inventory and ledger `--check` commands pass against the
captured outputs. This supplement does not qualify runtime parity, retire a
declaration, or establish installed package behavior.
