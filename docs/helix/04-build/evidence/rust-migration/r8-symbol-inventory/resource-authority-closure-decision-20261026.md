---
ddx:
  id: umf.evidence.rust-migration.r8-symbol-inventory.resource-authority-closure-decision
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.evidence.rust-migration.r8-symbol-inventory
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-symbol-inventory.versioned-core-operation-resource-authority
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-symbol-inventory.older-core-operation-schema-authority
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-symbol-inventory.remaining-schema-authority-review
      kind: informed_by
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-040
      kind: informed_by
    - id: CONTRACT-076
      kind: informed_by
    - id: CONTRACT-080
      kind: informed_by
    - id: ADR-005
      kind: informed_by
---

# R8 resource-authority closure decision packet

## Decision requested

Review the evidence boundary for the 17 unresolved resource alias identities (51 route-specific ledger rows) in the
current R8 ledger. The largest coherent cluster is 12 aliases referencing six
versioned Core operation schemas. Their historical writer outputs can be
independently reproduced, but current resource authority cannot be established
from the available contracts or generator inputs without inventing who
authorized the later edits. Recommendation: recognize the historical writer
provenance as a closed fact only; keep all 17 aliases and 11 unique resource
files at `authority-unresolved` until direct current authoring authority or a
complete current writer/input closure is supplied. This packet does not change
the ledger.

## Cohort pins and denominator

The condition-aware inventory is `inventory.json`, SHA-256
`47d46f3a3fe2dd5c621d3c05a11590db2567b98f7e172f120d92554489d84cec`; the
ledger is `gap-ledger.json`, SHA-256
`b569e0867e97b7e779692e0a7f7112579f3a125800490de8ce03a072c9621111`. There
are 198 distinct resource aliases in the resource authority census: 44
generated-authority-known, 49 authored-authority-known, 88 candidate-generated
and 17 authority-unresolved. The 17 unresolved aliases map to 11 unique
resource files because several versioned operation schemas expose both a
legacy name and a version-suffixed alias. Resource alias count is not unique
file count and neither count is an executable port count.

## Largest cluster: six versioned Core operation schemas

The six current files below account for 12 of the 17 unresolved alias identities (36 route-specific rows).
All current byte hashes are pinned in the ledger. Historical commit
`887d67410b42ffc58d8f0853185b33a603320e19` contains the one-off
`scripts/core-relationship-versioned-schemas.ts` writer; isolated replays in
[older operation-schema authority](older-core-operation-schema-authority.md)
and [versioned Core operation authority](versioned-core-operation-resource-authority.md)
reproduce historical outputs for the writer-covered schemas. Commit
`8706814a9605d7325eef32a5df3d05696de00b62` later changes the current schema
bytes. Current `scripts/metamodel/build.ts` and
`spec/metamodel/generated/manifest.json` do not declare these paths as outputs.

| Current resource | Exact alias names and route-row IDs | Current SHA-256 | Evidence and remaining gap |
| --- | --- | --- | --- |
| `spec/core/cardinality-operation-v4.schema.json` | `coreCardinalityOperationSchema`: `package-reference-0128`, `package-root-browser-1248`, `package-root-node-2368`; `coreCardinalityOperationV4Schema`: `package-reference-0129`, `package-root-browser-1249`, `package-root-node-2369` | `c2562ad726b58306c18332512f2b5388ddc625abb7494c532794682492300d45` | Historical versioned-schema writer provenance; no complete current writer input/output receipt or clause naming current resource. |
| `spec/core/facet-operation-v3.schema.json` | `coreFacetOperationSchema`: `package-reference-0137`, `package-root-browser-1257`, `package-root-node-2377`; `coreFacetOperationV3Schema`: `package-reference-0138`, `package-root-browser-1258`, `package-root-node-2378` | `74c1ca75e2bac44afd0010292b82741618e9cb031cc37159667fa4f4ff95fd9f` | Historical writer provenance; current exact authority/input closure missing. |
| `spec/core/key-operation-v2.schema.json` | `coreKeyOperationSchema`: `package-reference-0142`, `package-root-browser-1262`, `package-root-node-2382`; `coreKeyOperationV2Schema`: `package-reference-0143`, `package-root-browser-1263`, `package-root-node-2383` | `67c35f417d940d9d3ff8c4fe7ca57ea29d319a1da4310ea3f9d2437160e9095b` | Historical writer provenance; current exact authority/input closure missing. |
| `spec/core/kind-operation-v6.schema.json` | `coreKindOperationSchema`: `package-reference-0147`, `package-root-browser-1267`, `package-root-node-2387`; `coreKindOperationV6Schema`: `package-reference-0148`, `package-root-browser-1268`, `package-root-node-2388` | `e1de0aba1c3db6a09e85332a10441a0eec7a2dca0a4e4249fab67fcc491783b8` | Historical writer output is known. CONTRACT-076 directly authorizes kind operation v8, not this v6 schema or its later edits. |
| `spec/core/nullability-operation-v5.schema.json` | `coreNullabilityOperationSchema`: `package-reference-0150`, `package-root-browser-1270`, `package-root-node-2390`; `coreNullabilityOperationV5Schema`: `package-reference-0151`, `package-root-browser-1271`, `package-root-node-2391` | `442cc69c8998da361b775251b2e8842cece0d700fb1fa59dad4bd3de03f13c92` | Historical writer output is known. CONTRACT-076 directly authorizes nullability operation v7, not this v5 schema or its later edits. |
| `spec/core/record-type-operation-v6.schema.json` | `coreRecordTypeOperationSchema`: `package-reference-0154`, `package-root-browser-1274`, `package-root-node-2394`; `coreRecordTypeOperationV6Schema`: `package-reference-0155`, `package-root-browser-1275`, `package-root-node-2395` | `2b40d2be0562794f918738d96ee8f974f7133f26ee8476583b944c9f676a255d` | Historical writer output and later three-field delta are reproduced; CONTRACT-040 does not name the current v6 resource or authorize those edits. See [Record Type follow-up](record-type-operation-v6-authority-followup-20261026.md). |

CONTRACT-040, TD-040 and TD-041 state semantic obligations for Core ideals;
CONTRACT-076 establishes direct authorship for its current kind-v8 and
nullability-v7 inspection schemas. CONTRACT-080 and ADR-005 define the
metamodel output boundary. None of these artifacts, as currently written,
asserts that the six older paths are generated by the current metamodel or
normatively authorizes their present bytes. The exact historic output replay
proves a past generation event. It cannot supply the later author's authority.

The largest safe closure here is therefore **historical provenance only** for
the six-resource cluster. It is suitable for a provenance subrecord if Sol
wants one, but not for promoting current `resourceOwnership.authority.status`.
Do not infer the status from version progression, current consumers, matching
Rust schemas, or current contract semantics.

## Remaining five aliases and unique resources

These five unresolved alias identities (15 route-specific rows) have weaker source evidence and should remain open as separate
cases:

| Ledger row | Export alias | Resource and current SHA-256 | Current evidence gap |
| --- | --- | --- | --- |
| `package-reference-0145`, `package-root-browser-1265`, `package-root-node-2385` | `coreKeySelectionSchema` | `spec/core/key-selection.schema.json` — `c3aef95bdb7b0134b8d52076e2d82394f656fde41f0da092af54aa052d1747f3` | Historical writer and TD-044 use explain older construction; no current writer/input closure or exact-resource authority. |
| `package-reference-0159`, `package-root-browser-1279`, `package-root-node-2399` | `coreRelationshipSelectionSchema` | `spec/core/relationship-selection.schema.json` — `d8bf01dcad908e19a26ee9f83c3b1da5e092d0f6055b283cb54d6997c32a1e9c` | Historical composition is documented; CONTRACT-045/TD-045 do not establish current composite bytes and the writer is absent. |
| `package-reference-0162`, `package-root-browser-1282`, `package-root-node-2402` | `coreSchemaPropertiesSelectionSchema` | `spec/core/schema-properties-selection.schema.json` — `893cf29692b0ba9c21037a90e0361b8adc19a2c3007cee84f22092276004f641` | Archived Python construction is provenance, not a current writer; CONTRACT-049 does not name the exact resource. |
| `package-reference-0615`, `package-root-browser-1735`, `package-root-node-2855` | `parquetRelationshipClassificationSchema` | `spec/core/parquet-relationship-classification.schema.json` — `c89561ab5f492c1242b7d425bcba063b82c13296931f12566414c535360478ca` | Historical generator cohort receipt exists, but it identifies no exact writer and no complete current source closure. CONTRACT-019 does not name the schema. |
| `package-reference-0992`, `package-root-browser-2112`, `package-root-node-3232` | `sqlserverPhysicalBindingSchema` | `spec/projections/sqlserver-physical-binding.schema.json` — `a746543f0a16b325d6eb77f5708cf98a97706f8cc69094819b32f17a74f39562` | CONTRACT-042/TD-046 govern behavior but not this exact file; no current writer or input closure. |

The [remaining schema authority review](remaining-schema-authority-review.md)
contains commit identities and historic byte comparisons for the final five.
Those checks establish provenance and use, not authorship of the current
schema contents.

## What would close authority without semantic inference

For any of the 11 unique resources, accept one of these evidence forms before
changing its ledger row:

1. A governing contract/design revision that directly identifies the exact
   canonical resource path and the intended current schema version/envelope;
   or
2. A retained deterministic writer with pinned, complete inputs and an
   executable output receipt matching the current resource SHA-256.

A historical writer replay can establish the historical output only. A
current consumer, test, compiler source list, identical Rust constant, Git
blob, or hand-inspected field list cannot fill the missing author decision.
For the six-operation cluster, the specific missing link is the authority and
source closure for the changes made in `8706814a9605d7325eef32a5df3d05696de00b62`.
Until found, keep all 17 alias identities (51 route-specific rows) unresolved and all 11 resources open.
