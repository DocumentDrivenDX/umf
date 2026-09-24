---
ddx:
  id: US-032
  type: user-stories
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: US-031
      kind: informed_by
    - id: US-007
      kind: informed_by
---

# US-032: SQL Server to Avro schema projection

As a pipeline author I need SQL Server column observations projected into Avro
schemas with explicit field bindings and representation choices, retaining native
source meaning and reporting every unsupported or unenforced aspect.

- AC1: Complete result JSON Schema, source retention, deterministic mappings and
  strict/reporting loss policies; unknown policies fail.
- AC2: Representative numeric, textual, binary, temporal, alias and generated fields
  preserve appropriate value families and refinements or report/block mismatches.
- AC3: Native Avro schema and value probes, both UMF formats and real-browser parity.
- AC4: Invalid bindings, precision limits, unresolved source versions/edits and
  unsupported native types cannot produce an apparently successful projection.
- AC5: Native source/target instance conversion and broader schema semantics remain
  explicit follow-up work, never implied by a schema-only transform.
