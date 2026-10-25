---
ddx:
  id: umf.evidence.rust-migration.r8-openapi-resource-authority.sol-review
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.evidence.rust-migration.r8-openapi-resource-authority
      kind: informed_by
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-011
      kind: informed_by
    - id: CONTRACT-012
      kind: informed_by
---

# Independent Sol review: OpenAPI resource authority

Sol inspected the six exact exported result-schema paths and their governing
CONTRACT-011/012 references. The ledger records authored authority and no
exact generator for these paths, with source, contract, export and package
closure hashes. Sol independently reran the check-only ledger generation and
the focused suite (9/9). The ledger SHA-256 at this checkpoint is
`9c735baebc1fef593f92d1bc1c683ef56b97fade686d932d38c9491ecadc7d43`.

This accepts source/build authority for the six named aliases only. Installed
archive bytes, the other 69 unresolved authorities, 112 candidate generators,
and executable-route retirement remain open.
