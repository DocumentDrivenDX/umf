---
ddx:
  id: umf.evidence.rust-migration.r8-arrow-ipc-resource-authority.sol-review
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.evidence.rust-migration.r8-arrow-ipc-resource-authority
      kind: informed_by
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-016
      kind: informed_by
---

# Independent Sol review: Arrow IPC resource authority

Sol inspected the three exact result-schema writer outputs and the
CONTRACT-016 mapping. Each `--check` path compares the current file to the
rendered bytes before any write branch. Sol independently ran all three
read-only checks and the focused ledger suite, which later passed 12/12 after
the Arrow base slice was added. An intermediate ledger check failed because
concurrent source edits made its capture stale; the later current check passed
at ledger SHA-256
`6d0803d2d80392372e3863d39c2d9b4e585686934e55a2772e2fc4a9e7d9538d`.
The earlier IPC-only ledger hash in the sibling receipt is a historical
checkpoint, not the current ledger.

This accepts generated source authority and package-path closure for the
three named schemas. It does not qualify installed archive bytes or any
executable retirement.
