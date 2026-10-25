---
ddx:
  id: umf.evidence.rust-migration.r8-parquet-report-schema-authority.sol-review
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.evidence.rust-migration.r8-parquet-report-schema-authority
      kind: informed_by
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-019
      kind: informed_by
    - id: US-019
      kind: informed_by
---

# Independent Sol review: Parquet report-schema authority

Sol inspected the four direct generator outputs, the pages-to-levels-to-
physical-to-rows dependency chain, the values composition, transitive Parquet
inputs, the governing CONTRACT-019/US-019 clauses, public exports and package
source closure. Sol independently reran all four no-write generator checks.
The agent's checkpoint ledger check and focused suite passed 15/15 at ledger
SHA-256 `be7de0f065b86b1f136fa068ee8c9f60c5882f1601272a480f7feb58d6de1955`.

These checks establish source authority for four named generated resources.
They do not qualify installed archive bytes or executable Rust retirement.
The cohort is still moving; the final inventory and ledger must be recaptured
after concurrent source edits settle. At this checkpoint 99 aliases remain
candidate-generated and 62 remain unresolved.
