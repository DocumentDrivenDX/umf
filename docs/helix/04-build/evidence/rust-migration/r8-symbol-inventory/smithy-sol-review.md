---
ddx:
  id: umf.evidence.rust-migration.r8-smithy-resource-authority.sol-review
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.evidence.rust-migration.r8-smithy-resource-authority
      kind: informed_by
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-014
      kind: informed_by
---

# Independent Sol review: Smithy resource authority

Sol inspected the seven exact schema paths, their CONTRACT-014 provenance,
and the ledger's authored-authority classification. The classification records
`generator: null`, hashes the authored files and contract/build closure, and
does not count a filename match as generator evidence. Sol independently ran
`gap-ledger.mjs --check` and the focused ledger suite (8/8). That Smithy-only
ledger checkpoint had SHA-256
`36ff5997f920ed2719803cec3c3b1ffed1eb0288a2bc86e9a7aada05e7a3f7dc`;
the later OpenAPI authority slice regenerated it.

This accepts source and build-closure authority for the seven named aliases.
It does not qualify installed archive bytes, prove the then-remaining 75 unresolved
resource authorities, or retire any executable route. The ledger requires
recapture after moving source edits settle.
