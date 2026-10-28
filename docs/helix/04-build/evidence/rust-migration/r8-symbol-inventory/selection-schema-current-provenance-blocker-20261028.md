---
ddx:
  id: umf.evidence.rust-migration.r8-symbol-inventory.selection-schema-current-provenance-blocker-20261028
  type: execution-evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-symbol-inventory.current-unresolved-json-resource-authority-20261028
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-symbol-inventory.current-unresolved-json-resource-authority-source-pin-20261028
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-045
      kind: informed_by
    - id: CONTRACT-049
      kind: informed_by
    - id: CONTRACT-080
      kind: informed_by
---

# Current-source provenance blocker for three selection schemas

**Capture:** 2026-10-28, repository commit `80614a5877ea0b88f43c61b6653569ad24fa8f40`, with unrelated working-tree changes present. This note does not change generated resources or the R8 ledger.

## Finding

The historical three-stage generator chain is recoverable from Git history, but it does not reproduce the current resources from current tracked source. No exact current writer and complete current input closure were found. Keep all three ledger rows `authority-unresolved`.

| Resource | Historical writer and inputs | Replay result from recorded pre-change inputs | Current SHA-256 |
| --- | --- | --- | --- |
| `spec/core/key-selection.schema.json` | `scripts/core-key-versioned-schemas.ts` at `280d3449b`; reads `facet-selection.schema.json` and `key-document.schema.json` (also emits other operation schemas) | `1f7dd4aafe576d5d56e8632d954f33776ab25b462a46ab3eebe5c8f425c195a4`; current file differs | `c3aef95bdb7b0134b8d52076e2d82394f656fde41f0da092af54aa052d1747f3` |
| `spec/core/relationship-selection.schema.json` | `scripts/core-relationship-versioned-schemas.ts` at `887d67410`; reads `key-selection.schema.json` and `relationship-document.schema.json` (also emits other operation schemas) | `c9f1f537bb64326b0e8e622b29d51c5af9c9f8b9ae78f4cf3b46cd6a628c2287`; current file differs | `d8bf01dcad908e19a26ee9f83c3b1da5e092d0f6055b283cb54d6997c32a1e9c` |
| `spec/core/schema-properties-selection.schema.json` | `scripts/core-schema-properties-schema.py` at `436e975d5`; reads `relationship-document.schema.json` and `relationship-selection.schema.json` | `a91d735e8303ebc376a8119ccd8e10d9bd02b49343a9967e3061414d8a5daa8b`; current file differs | `893cf29692b0ba9c21037a90e0361b8adc19a2c3007cee84f22092276004f641` |

The three writer paths are absent at the captured current source. `package.json` has no task invoking them. `8706814a9` changed only the external `source` reference in each selection resource (`0.6.0`, `0.7.0`, and `0.8.0` respectively to `0.10.0`); it did not add these paths to the metamodel output declarations or generated manifest. The current metamodel manifest has no `sources`, `workspaceInputs`, or `outputs` entry for any of the three resources, as recorded in the linked current-source authority review.

Applying the obvious version-reference substitutions to the historical outputs would make a transformation script that reproduces the observed difference, but no current authored generator or governed declaration defines that transformation or its complete input closure. This would be a newly invented authority rule, so it is not treated as closure evidence.

CONTRACT-045 and CONTRACT-049 govern relationship and schema-property semantics. CONTRACT-080 authorizes only its listed metamodel outputs and six explicitly listed versioned operation resources; its resource clause says no other operation-resource path or unresolved alias is thereby authorized. None of these clauses establishes the exact bytes of the three resources. This note records a provenance blocker, not a semantic support or Rust-parity conclusion.

## Read-only reproduction

A temporary directory under `/tmp` was populated with the three historical writer snapshots and the `spec/core` inputs from `8706814a9^`. The chain was run in dependency order:

```sh
bun scripts/core-key-versioned-schemas.ts
bun scripts/core-relationship-versioned-schemas.ts
python3 scripts/core-schema-properties-schema.py
sha256sum spec/core/key-selection.schema.json spec/core/relationship-selection.schema.json spec/core/schema-properties-selection.schema.json
```

The resulting hashes are the replay values in the table, not the current values. The source checks were:

```sh
test ! -e scripts/core-key-versioned-schemas.ts
test ! -e scripts/core-relationship-versioned-schemas.ts
test ! -e scripts/core-schema-properties-schema.py
rg -n 'key-selection\.schema|relationship-selection\.schema|schema-properties-selection\.schema' scripts/metamodel spec/metamodel/generated/manifest.json
```

No current generator declarations were found. The focused ledger guard remains:

```sh
node --test --test-name-pattern='five unresolved JSON resource authority packet' scripts/rust-migration/r8/gap-ledger.test.mjs
```

Passing that guard confirms the three hashes and unresolved statuses remain pinned. It does not close authority. A future closure requires either a tracked deterministic current writer with complete versioned inputs and output hashes, or an explicit governed authored-resource decision; until then, preserve the current bytes and unresolved ledger status.
