---
ddx:
  id: umf.evidence.rust-migration.r8-symbol-inventory.current-unresolved-json-resource-authority-source-pin-20261028
  type: execution-evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-symbol-inventory
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-symbol-inventory.current-unresolved-json-resource-authority-20261028
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-symbol-inventory.remaining-schema-authority-review
      kind: informed_by
    - id: CONTRACT-019
      kind: informed_by
    - id: CONTRACT-042
      kind: informed_by
    - id: CONTRACT-045
      kind: informed_by
    - id: CONTRACT-049
      kind: informed_by
    - id: TD-044
      kind: informed_by
    - id: TD-045
      kind: informed_by
    - id: TD-046
      kind: informed_by
---

# R8 five unresolved JSON resource source pin — 2026-10-28

This packet adds a deterministic current-source regression guard for the five
resources in [the authority review](current-unresolved-json-resource-authority-20261028.md).
The detailed historical commits, governing-artifact search, and current
consumer/test references remain in that review. The captured current SHA-256
values are:

| Resource | Captured SHA-256 |
| --- | --- |
| `spec/core/key-selection.schema.json` | `c3aef95bdb7b0134b8d52076e2d82394f656fde41f0da092af54aa052d1747f3` |
| `spec/core/relationship-selection.schema.json` | `d8bf01dcad908e19a26ee9f83c3b1da5e092d0f6055b283cb54d6997c32a1e9c` |
| `spec/core/schema-properties-selection.schema.json` | `893cf29692b0ba9c21037a90e0361b8adc19a2c3007cee84f22092276004f641` |
| `spec/core/parquet-relationship-classification.schema.json` | `c89561ab5f492c1242b7d425bcba063b82c13296931f12566414c535360478ca` |
| `spec/projections/sqlserver-physical-binding.schema.json` | `a746543f0a16b325d6eb77f5708cf98a97706f8cc69094819b32f17a74f39562` |

The focused test checks these digests against working-tree bytes and the
current package-root-node ledger, requires each authority to remain
`authority-unresolved`, and checks that the metamodel generated manifest has no
source, workspace-input, or output entry for any path. A changed digest fails
the test and requires renewed investigation before refreshing this packet.
The manifest check bounds only the metamodel build; the absence of another
writer has not been proven. Historical writers, semantic contracts, and
current consumers explain provenance or usage but do not establish byte
authority. No resource authority is promoted and no declaration retirement is
claimed.

Run from the repository root:

```sh
node --test --test-name-pattern='five unresolved JSON resource authority packet' scripts/rust-migration/r8/gap-ledger.test.mjs
```

This source-authority guard does not qualify schema behavior, SDK archive
bytes, installed routes, Rust parity, or release readiness.
