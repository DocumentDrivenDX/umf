---
ddx:
  id: umf.evidence.rust-migration.r8-arrow-base-resource-authority.sol-review
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.evidence.rust-migration.r8-arrow-base-resource-authority
      kind: informed_by
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-016
      kind: informed_by
---

# Independent Sol review: Arrow base resource authority

Sol inspected the schema generator's PostgreSQL `$defs.node` dependency and
the FlatBuffer generator's manifest and listed vendored definitions, license
and notice. The authority ledger hashes these transitive inputs as well as
CONTRACT-016, exports and package paths. Sol independently ran both generator
read-only checks, the current ledger check, and its focused suite (12/12).
The current ledger SHA-256 is
`6d0803d2d80392372e3863d39c2d9b4e585686934e55a2772e2fc4a9e7d9538d`.

This accepts generated source authority for the three named Arrow base
resources. Installed archive bytes, 62 unresolved authorities and 109
candidate-generated authorities remain open; no executable route is retired.
