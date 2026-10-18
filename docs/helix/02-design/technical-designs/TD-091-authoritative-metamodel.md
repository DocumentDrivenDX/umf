---
ddx:
  id: TD-091
  type: technical-design
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: US-089
      kind: informed_by
    - id: SD-032
      kind: informed_by
    - id: ADR-005
      kind: references
    - id: CONTRACT-080
      kind: references
    - id: umf.architecture
      kind: references
---

# TD-091: Metamodel compiler and current-core cutover

## Scope and approach

Implement CONTRACT-080 as an authority cutover, superseding TD-089's bootstrap
projection boundary. `scripts/metamodel/` owns independent loading, closed
vocabulary checking, normalized structural/rule representation and deterministic
emitters. Runtime modules MUST NOT import compiler or filesystem APIs.
`src/generated/core-model.ts` is the public data/type boundary; generic semantic
execution lives in `src/validation/constraint-kernel.ts`. Python consumes the
same generated constraint/domain resources and generated model shapes.

The compiler emits JSON Schema for structural constraints and an ordered program
for semantic constraints. Preserve per-object rule order, exact registry source
contexts, safe hostile property names and exact literal semantics. Generated
standalone validation runs in Bun and browser without dynamic code generation.
Presence, nullable values and unknown labels remain distinct declarations.

## Migration and removal

Freeze current behavior before replacement; compare valid/invalid vectors with
both runtimes. Move scalar/wrapper mappings, eligibility, known-property tables
and core rule decisions into the model. Retain only generic runtime mechanics.
Migrate native producers, current classification and operation schema refs with
source-preserving collision checks. Retarget package core references while
retaining independent native/extension/receipt versions.

Remove old layered document validation, downgrade recursion, transition-only
APIs, duplicate Python shapes/rules, historical browser validators and resource
snapshots after consumers move. Archive dated evidence without runtime imports.
One Schemas host owns all three modes; renderer capabilities belong in its
qualified reusable release, replacing host shims. Architecture checks enforce
compiler/runtime/Python/browser boundaries and generated authority direction.

## Verification and deployment

STP-091 supplies acceptance checks. The ordered work packages, file retirement
ledger, ownership, risks and continuation live in
[the implementation plan](../../04-build/metamodel-authority-plan.md).
No historical native evidence is automatically renewed. Publish only after
independent review and complete required gates; use existing CI build signing,
then verify actual live bytes, claims and browser journeys.
