---
ddx:
  id: FEAT-003
  type: feature-specification
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.prd
      kind: informed_by
---

# FEAT-003: Explicit cross-system projection

**Priority:** P0. **PRD:** FR-7–FR-13, FR-37. **Subsystem:** Translation and fidelity.

## Problem and Outcome

Native schema preservation does not establish cross-system equivalence. Developers
need useful target schemas, explicit binding choices and a machine-readable account
of meaning absent from the target. Retain the full source separately so target-only
recovery cannot be mistaken for source recovery.

## Requirements

- PROJ-01: Require explicit physical choices such as target field numbers and
  numeric domain; do not infer semantic identity from shared names.
- PROJ-02: Report changed representation, unenforced constraints, retained-only
  annotations and unsupported constructs at source paths.
- PROJ-03: Block ambiguous unsupported shapes and strict-policy losses; compile
  emitted targets before claiming successful projection.
- PROJ-04: Compare independently authored native expectations and prove source
  recovery from retained UMF separately from target-only reimport.

## Initial Story and Boundaries

US-004 implements the first JSON Schema-to-Protobuf profile. CONTRACT-004 owns
its fields and classification semantics. FEAT-001/002 supply extension and native
interchange foundations. The initial implementation projects schemas, not arbitrary
instance data, and does not establish all-target support or justify core promotion.

## Success Criteria

Every expected mismatch in the authored corpus has a report entry; deleting a
required report entry fails the oracle. Native targets compile. Unknown source
content remains in retained UMF. Browser execution uses the same public operation.
