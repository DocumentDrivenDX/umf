---
ddx:
  id: umf.evidence.rust-migration.r8-symbol-inventory.three-generic-selection-resource-authority-20261028
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
      kind: extends
    - id: umf.evidence.rust-migration.r8-symbol-inventory.remaining-schema-authority-review
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: TD-044
      kind: informed_by
    - id: TD-045
      kind: informed_by
    - id: CONTRACT-049
      kind: informed_by
---

# Three generic selection resource authority follow-up

**Capture:** 2026-10-28, checkout `de2597f020f96ebc4772fe6d9d53242ceae25453`.

## Finding

The three resources remain `authority-unresolved`. History explains the
original construction and the 2026-10-18 metamodel-reference refresh, but no
current writer, complete current input closure, or governing artifact naming
each exact current result was found. No resource-authority check was added:
pinning hashes would detect edits, but would not prove who owns the meaning or
how the current bytes are computed.

| Resource and current SHA-256 | History and exact evidence | Current use and boundary |
| --- | --- | --- |
| `spec/core/key-selection.schema.json` — `c3aef95bdb7b0134b8d52076e2d82394f656fde41f0da092af54aa052d1747f3` | Added by `scripts/core-key-versioned-schemas.ts` at `280d3449b`; the historical script constructed it from `facet-selection.schema.json` and `key-document.schema.json`. At `8706814a9`, the only diff for this resource changes the source `$ref` from core 0.6.0 to 0.10.0. The historical script is absent from the current checkout. | Still exported as `coreKeySelectionSchema` from `src/index-v4-default.ts` and `src/model/selection-schemas.ts`. It is not the schema used by current `selectCoreElements`; that operation uses generated `spec/core/element-selection.schema.json`. The R8 ledger tests require this row to remain unresolved, but do not define its behavior. |
| `spec/core/relationship-selection.schema.json` — `d8bf01dcad908e19a26ee9f83c3b1da5e092d0f6055b283cb54d6997c32a1e9c` | Added by `scripts/core-relationship-versioned-schemas.ts` at `887d67410`; it composed the prior Key selection schema with `relationship-document.schema.json`. At `8706814a9`, the only diff changes the source `$ref` from core 0.7.0 to 0.10.0. The historical script is absent from the current checkout. | Still exported as `coreRelationshipSelectionSchema`. Current `selectCoreRelationships` validates against the separately named `relationship-metadata-selection-v2.schema.json`; that operation and schema do not prove authority for this generic element-selection resource. The R8 ledger tests keep it unresolved. |
| `spec/core/schema-properties-selection.schema.json` — `893cf29692b0ba9c21037a90e0361b8adc19a2c3007cee84f22092276004f641` | Added at `436e975d5` by `scripts/core-schema-properties-schema.py`, whose archived source snapshot builds from `relationship-selection.schema.json` and `relationship-document.schema.json`. At `8706814a9`, the only diff changes the source `$ref` from core 0.8.0 to 0.10.0. The writer is absent from the current checkout; only its historical snapshot remains. | Still exported as `coreSchemaPropertiesSelectionSchema`. Current schema-property operations use their own operation/result shapes; this generic `core-elements` selection schema is not their result schema. The R8 ledger tests keep it unresolved. |

The checked-in resource digests above match the current files. The generated
metamodel manifest contains no source, workspace-input, or output entry for
these paths. The current `scripts/core-selection-schema.ts` deterministically
builds `spec/core/element-selection.schema.json` from `spec/core/schema.json`;
it does not write any of the three resources. Current selection tests compile
that generated `element-selection.schema.json` and compare it with that
generator. They do not validate the three older resources as current operation
schemas.

The three resources remain public exports, so their current consumer reliance
is unknown. The evidence does not establish whether they are intentionally
retained versioned schemas, compatibility aliases, or stale exports. It also
does not establish whether their current post-refresh bytes are contractually
authored or generated from a declared source. Their historical writer inputs
are provenance only; they are not a current reproducible closure.

## Proposed decision and bounded next step

Keep all three authority rows unresolved and preserve the current resource
bytes while the owner decides whether these public exports remain supported.
Then take one of two evidence-backed paths: document an exact authored owner
and supported result/version, or restore a deterministic writer with explicit
inputs and tests that reproduce each current byte. If the resources are
retired or redirected to `element-selection.schema.json`, record the public
compatibility decision and migration separately before changing exports or
bytes. Do not classify them as metamodel-generated from the 2026-10-18 `$ref`
refresh alone.

## Scope and limits

This packet covers these three JSON resources only. It does not change their
bytes, the generated inventory or R8 ledger, Rust behavior, implementation
plan, or package exports. The recorded checks are source/history inspection
and existing ledger assertions; no schema behavior or installed package
qualification is claimed.
