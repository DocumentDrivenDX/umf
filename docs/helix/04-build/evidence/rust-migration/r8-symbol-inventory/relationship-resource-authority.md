---
ddx:
  id: umf.evidence.rust-migration.r8-symbol-inventory.relationship-resource-authority
  type: execution-evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-041
      kind: informed_by
    - id: CONTRACT-019
      kind: informed_by
    - id: CONTRACT-076
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-symbol-inventory
      kind: informed_by
---

# R8 relationship JSON resource authority checkpoint

## Scope and finding

This checkpoint traces the unresolved relationship JSON resources in the
condition-aware R8 inventory. Four resources have direct Git authorship pins;
one remains unresolved because the available record shows a historical
one-off schema composition but does not provide a current reproducible writer
and source closure.

| Resource | Authority result | First authored revision | Current refresh |
| --- | --- | --- | --- |
| `spec/core/relationship-metadata-selection-v2.schema.json` | Directly authored, versioned schema | `25a38767a3ce7a2c7af297cf541196e9cbc6ad4a`; blob SHA-256 `991f845a1b8a7517c1ad6a43826b31cb83ae03d597b8cbc8b7dcea8e933c29b8` | `8706814a9`; blob SHA-256 `e1586b2164f8f1c06dabdf7505861ab7c39c5cef0a267a3033a8d95aa479f720` |
| `spec/core/relationship-operation-v3.schema.json` | Directly authored, versioned schema | `25a38767a3ce7a2c7af297cf541196e9cbc6ad4a`; blob SHA-256 `58c3d8a0ba0a0261ef3954f2952df62830c28b2570f523e11eab612206e67603` | `8706814a9`; blob SHA-256 `42a3a7ad1e3ef7ac80ef5044948aad12847de22aaf63367e6264bfcb2434bda7` |
| `spec/core/relationship-extras.schema.json` | Directly authored schema | `997c1a16a9b52e62252b5ce4e4bc3d4f3b7b7cb9`; blob SHA-256 `8976c2c707c5616922bebf085f65d6d029ca7ed685c90cad5613dbd87ecb226c` | `8706814a9`; blob SHA-256 `fad9ec7ad8b33cc631647a30e1061a926307c702e9a5c18ba7cdf8dff94510e6` |
| `spec/core/relationship-parquet-projection.schema.json` | Directly authored schema | `f69d1a7c7b7d62d4f2924217b813f8b58b07ecef`; blob SHA-256 `ef753a57872076791c435ec2612efb3ce7259ed719baa2a2b28d7a6494c223ec` | `8706814a9`; blob SHA-256 `01c2c812a06130abddb4ec78d8760537f18cff2eb6bfd96f09b87b748dd9192b` |
| `spec/core/relationship-selection.schema.json` | Authority unresolved | The `887d67410` change added it through `scripts/core-relationship-versioned-schemas.ts`, which composed the Key selection schema and relationship document definitions. The one-off writer is absent from current source and its historical input closure was not frozen as a reproducible authority packet. | The `8706814a9` refresh changed the current schema reference; no current exact writer/input relation is established. |

The relationship metadata-selection and operation schemas were introduced with
CONTRACT-076's UUID work after CONTRACT-041 established the relationship
semantics. The extras schema was added with its GraphQL/RDF/LinkML carrier
qualification under CONTRACT-041, US-045 and TD-045. The Parquet projection
schema was added with the qualified Parquet relationship carriers under
CONTRACT-041 and CONTRACT-019. The Git commit-to-blob pins establish exact
authored source revisions; they do not claim native equivalence or release
qualification.

The four direct-authorship entries are now in the R8 ledger authority map and
the focused regression test checks their schema IDs, governing artifacts,
source/package closure and historical blob hashes. The test also asserts that
`relationship-selection.schema.json` remains `authority-unresolved`. The
live ledger counts 41 authored-known resource files and 30 unresolved;
these four files account for five exported aliases. Sol regenerated the
metamodel and recaptured the shared inventory and ledger after integration;
their SHA-256 values are
`1d7589b8bad71a50f1fdcebcc50bfa897af25d7dbd2cdfbdf452f6a5ae8aa3c2`
and `12485a87eb3aba1a6ca8f52aa1b4c196445b89d4b325af18da9ab6320b99368f`.

Sol independently read all eight added and refreshed blobs with
`git show <commit>:<path>`, verified that their SHA-256 values match the table,
and confirmed each first revision with `git log --diff-filter=A`. This review
does not infer a current generator from those historical revisions.

## Source and artifact limits

The source closure includes each governing contract or design artifact, the
runtime module and test that consume the schema, `src/index.ts`, and SDK build
and archive rules. The current schema bytes and exact Git history blobs are
pinned. Current SDK archive bytes remain unqualified, the TypeScript resource
routes remain in place, and no declaration retirement or release claim follows
from these provenance findings.

Focused verification:

```sh
node --test --test-name-pattern='versioned core operation schemas pin direct authoring history' scripts/rust-migration/r8/gap-ledger.test.mjs
```
