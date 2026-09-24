---
ddx:
  id: TD-005
  type: technical-design
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.architecture
      kind: informed_by
    - id: CONTRACT-005
      kind: informed_by
    - id: US-005
      kind: informed_by
---

# TD-005: DDD semantic extension

## Approach

Register one versioned vocabulary with payload variants by attachment scope.
Keep context-qualified references in domain declarations; inspect the whole
copied document for aggregate ownership and context scope. CONTRACT-005 defines
all semantic rules. No physical binding or native type promotion is inferred.

## Components and Validation

`src/extensions/ddd/index.ts` implements registration, semantic diagnostics, copied
access and atomic edits. The complete package and payload schema live under
`spec/extensions/ddd/`. The authored fixture uses three separate contexts and all
concept families. Tests apply explicit model contradictions and verify rejection;
unknown properties and opaque expressions remain preserved but incomplete.

DDD reference arrays exposed Ajv equality code that invokes object methods on
null-prototype data. The shared schema factory now implements JSON-only equality
for uniqueItems, const and enum. A separate core regression includes method-like
data keys and reordered reference keys, and the full conformance suite checks
that the fix does not regress native adapters. Equality never calls valueOf or
uses prototypes to interpret data.

## Limits and Next Step

All invariant languages are opaque, so their presence blocks conservative editing.
No domain-instance evaluator or external DDD importer exists. The next projection
must make physical choices explicit and retain source separately from a structural
JSON Schema target. Value-type reuse and entity ownership must remain distinct.
