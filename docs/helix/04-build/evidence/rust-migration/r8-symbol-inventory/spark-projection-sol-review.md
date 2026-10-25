---
ddx:
  id: umf.evidence.rust-migration.r8-spark-projection-resource-authority.sol-review
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.evidence.rust-migration.r8-spark-projection-resource-authority
      kind: informed_by
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-017
      kind: informed_by
    - id: US-017
      kind: informed_by
---

# Independent Sol review: Spark projection resource authority

Sol inspected both deterministic writers, the reverse writer's exact forward
schema input, US-017-AC6/AC7 pins, public exports and package source closure.
Sol independently reran both no-write generator checks. The focused R8 suite
passed 14/14 at the agent's ledger checkpoint, SHA-256
`1bf0389856c5b5db235ac093a836d75b6266a795e77155d811e5198d584536d3`.
The current ledger check became stale after a concurrent wire source edit; it
must pass again at the next coordinated fixed-point recapture.

This accepts source authority for two generated schemas, not installed bytes
or executable Rust retirement. At the checkpoint 103 resource aliases remain
candidate-generated and 62 remain unresolved.
