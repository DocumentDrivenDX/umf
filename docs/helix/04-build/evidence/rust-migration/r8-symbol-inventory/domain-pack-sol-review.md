---
ddx:
  id: umf.evidence.rust-migration.r8-domain-pack-resource-authority.sol-review
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.evidence.rust-migration.r8-domain-pack-resource-authority
      kind: informed_by
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-052
      kind: informed_by
---

# Independent Sol review: domain-pack resource authority

Sol inspected the four exact domain-pack/dataset-source schema and package
paths, their two schema builders, and `scripts/domain-pack-schema.ts` as the
output generator. The ledger hashes those inputs, CONTRACT-052, the public
export, and package build closure. Sol independently reran the generator's
read-only `--check`, the ledger's `--check`, and its focused tests (10/10).
The resulting ledger SHA-256 is
`c0e14ff6f93f17a09e0fca92cb7629e191bccdf9bcd9e4bd6884e2746d8a25a8`.

This accepts generated source authority for the four named aliases, not
installed archive bytes. Sixty-five resource aliases remain unresolved and
112 have only candidate generator evidence; no executable route is retired.
