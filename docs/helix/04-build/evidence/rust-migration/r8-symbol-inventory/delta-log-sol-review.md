---
ddx:
  id: umf.evidence.rust-migration.r8-delta-log-resource-authority.sol-review
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.evidence.rust-migration.r8-delta-log-resource-authority
      kind: informed_by
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-018
      kind: informed_by
---

# Independent Sol review: Delta report-schema authority

Sol inspected the four exact output resources, their direct public exports,
generator inputs, transitive Delta and Parquet schema inputs, and source/build
package closure. Sol independently ran each generator's read-only `--check`,
the current ledger check, and the focused R8 suite (13/13). The ledger SHA-256
at this checkpoint is
`2507187db4b57294e0856cf7f8ee48d12337b2bd1fed87439f58c52f162a559b`.

The four named schemas now have generated source authority. The ledger still
has 105 candidate-generated and 62 unresolved resource aliases. Installed
archive bytes and executable retirement have not been qualified, and the
moving source cohort requires a final fixed-point recapture.
