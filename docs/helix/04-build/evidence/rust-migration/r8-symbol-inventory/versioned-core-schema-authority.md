---
ddx:
  id: umf.evidence.rust-migration.r8-symbol-inventory.versioned-core-schema-authority
  type: execution-evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-040
      kind: informed_by
    - id: CONTRACT-076
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-symbol-inventory
      kind: informed_by
---

# R8 versioned core schema authority checkpoint

## Scope and finding

This checkpoint resolves direct authored provenance for five versioned core
resources that are otherwise consumed as inert schema data:

| Resource | Versioned `$id` | Governing contract | Exact authoring history |
| --- | --- | --- | --- |
| `spec/core/bit128-selection.schema.json` | `urn:umf:core:bit128-selection:1.0.0` | CONTRACT-076 | Added in `25a38767a3ce7a2c7af297cf541196e9cbc6ad4a`; refreshed in `8706814a9`. |
| `spec/core/cardinality-operation-v6.schema.json` | `urn:umf:core:cardinality-operation:6.0.0` | CONTRACT-040, CONTRACT-076 | Added in `25a38767a3ce7a2c7af297cf541196e9cbc6ad4a`; refreshed in `8706814a9`. |
| `spec/core/facet-operation-v5.schema.json` | `urn:umf:core:facet-operation:5.0.0` | CONTRACT-040, CONTRACT-076 | Added in `25a38767a3ce7a2c7af297cf541196e9cbc6ad4a`; refreshed in `8706814a9`. |
| `spec/core/key-operation-v4.schema.json` | `urn:umf:core:key-operation:4.0.0` | CONTRACT-040, CONTRACT-076 | Added in `25a38767a3ce7a2c7af297cf541196e9cbc6ad4a`; refreshed in `8706814a9`. |
| `spec/core/key-tuple-operation-v4.schema.json` | `urn:umf:core:key-tuple-operation:4.0.0` | CONTRACT-040, CONTRACT-076 | Added in `25a38767a3ce7a2c7af297cf541196e9cbc6ad4a`; refreshed in `8706814a9`. |

The add commit introduced the exact versioned files in the same change as the
CONTRACT-076 128-bit/UUID implementation and its CONTRACT-040 updates. The
`8706814a9` commit is titled “Generate current UMF definitions from the
authoritative metamodel” and changed these same files to reference the current
core version. Each exact `commit:path` blob SHA-256 was verified during this
review and is pinned as evidence in the explicit ledger entries; normal ledger
generation does not query Git history. The ledger generator records both
revisions and their SHA-256 values, marks these rows
`authored-authority-known`, and pins current contracts, source consumers,
package build/archive rules, and current schema hashes. The shared ledger file
is intentionally not regenerated in this tranche.

These are directly authored schemas. No executable writer for their exact
bytes was found, so this checkpoint does not classify them as generated. The
older `cardinality-operation-v4`, `facet-operation-v3`, and
`key-operation-v2` resources remain `authority-unresolved`; similar names or
their later version history do not promote them. Other versioned resource
families were not evaluated here.

## Source and artifact limits

The ledger source closure covers the governing contracts, the exact source
modules that consume or export each resource, `src/index.ts`, and the SDK build
and archive rules. Current source bytes and the two authored Git revisions are
hash-pinned. The operation schemas continue to be copied as package data; the
build rule does not transform them. This does not prove that an installed
archive contains the same bytes. Every SDK archive route remains
`not-installed-qualified`; default TypeScript/data routes remain in place,
declarations are not retired, and no release or runtime semantic claim follows
from author provenance.

Focused verification is
`node --test --test-name-pattern='versioned core operation schemas pin direct authoring history' scripts/rust-migration/r8/gap-ledger.test.mjs`.
The test checks the exact resource IDs, fixed historical blob hash pins,
contract/source closure, archive-byte qualification status, and that the older
versions remain unresolved. It does not require those Git objects to exist.
Shared inventory and ledger regeneration is intentionally left to the R8 owner
after this source freeze.
