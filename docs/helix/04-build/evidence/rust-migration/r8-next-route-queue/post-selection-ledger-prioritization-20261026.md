---
ddx:
  id: umf.evidence.rust-migration.r8-post-selection-ledger-prioritization
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.evidence.rust-migration.r8-symbol-inventory
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-selection-reference-host-baseline
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-next-route-queue
      kind: informed_by
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: ADR-006
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-040
      kind: informed_by
    - id: CONTRACT-041
      kind: informed_by
    - id: CONTRACT-049
      kind: informed_by
    - id: CONTRACT-056
      kind: informed_by
---

# R8 post-Selection route prioritization

This read-only packet groups a pinned R8 ledger snapshot by executable semantic
family and package-root reachability. Schema Properties and later production
edits changed the live source after that ledger was generated; its route
provenance and V4-selected count must be regenerated before current-source
qualification. It recommends qualification and port
batches after the active Core Selection work; it changes no ledger disposition,
source route, declaration, or release claim.

## Pinned denominator and reachability

The pinned inventory is `inventory.json` SHA-256
`47d46f3a3fe2dd5c621d3c05a11590db2567b98f7e172f120d92554489d84cec`; the
`gap-ledger.json` snapshot is SHA-256
`b569e0867e97b7e779692e0a7f7112579f3a125800490de8ce03a072c9621111`. The
ledger input points at that inventory SHA. Its counted rows are:

| Measure | Count | Interpretation |
| --- | ---: | --- |
| Unique executable export names | 922 | Logical names in the explicit `./reference` runtime census and each default package root. |
| Executable declarations per default root | 922 | At this pinned ledger snapshot, 37 declarations are directly selected by each V4 root; 885 are inherited from the shared TypeScript root. Schema Properties' later selection is absent from these route counts. |
| Executable default-route retirement gaps | 922 | Each logical name remains open until complete parity and retirement review; Rust source selection and private installed receipts do not retire it. |
| Executable names with accepted opt-in Rust mappings | 58 | Ownership evidence is narrower than default-root selection and does not reduce the 922 gap denominator. |
| Executable names without accepted Rust mapping | 864 | Ledger classification only; it includes no judgment that a Rust implementation is desirable. |
| Inert JSON/resource exports per root | 198 | Resource aliases are counted separately from executable operations and are not port batches. |
| Three-root inventory rows | 3,360 | 1,120 runtime declarations each for `./reference`, Node root and browser root. |

Type-only exports do not execute at runtime and are not part of the 922-name
denominator. JSON/schema/resource exports are counted as inert rows, not
semantic operations. The explicit `./reference` remains TypeScript. A default
root that inherits a declaration from `src/index.ts` is reachable without a
V4 edit; direct V4 selections are already reachable through their bindings,
but still need the same source-cohort, host, and retirement evidence.

The ledger's largest unmapped executable families are adapter imports and
inspections (387 names across 105 files), core ideals (254 across 78 files),
extensions (106 across 39 files), and projections (52 across 35 files). The
largest individual owner families include Delta adapters (111), Arrow (87),
Parquet (84), PostgreSQL (84), dbt (78), Iceberg (63), Actions extensions (63),
and Binding extensions (63). These are useful inventory partitions, not
single port batches: each mixes operation semantics, native-format rules,
resource custody, and filesystem/callback boundaries. Combining them would
hide multiple source authorities and native-oracle subsets behind one count.

## Ordered post-Selection batches

### 1. Close currently selected Core inspection routes — three names

After Selection, first recertify the three existing inspector operations as one
small host-boundary cohort:

| Public operation | Rust owner | Source pin |
| --- | --- | --- |
| `inspectCoreScalarType` | `umf_core::scalar_type_inspection::inspect_core_scalar_type` | `src/model/scalar-type.ts` SHA-256 `252f09a39470484e29f408df7467fab8ed21407d6f64ebde1fbad5cbc051fef3` |
| `inspectCoreRecordMembers` | `umf_core::record_members_inspection::inspect_core_record_members` | `src/model/record-members.ts` SHA-256 `9e46fb9eacf24aa3428f38f688edd2e7a1a64d21d8c0a051171475d51f147bbc` |
| `inspectCoreReferenceLinks` | `umf_core::reference_links_inspection::inspect_core_reference_links` | `src/model/reference-links.ts` SHA-256 `e7e3c104741d3202941973fdec14d6a25af8406dd909dbac7b60cea8e7c27853` |

The V4 roots already select these operations through
`src/access/rust-core-inspectors-default.ts`. Their frozen R5 inspector
predecessor and installed Core Inspector evidence are the existing starting
packet: [`r5-core-inspectors-default`](../r5-core-inspectors-default/README.md) plus
[`r8-core-inspectors-installed`](../r8-core-inspectors-installed/README.md).
The next cohort must use a common fixed-point archive and include raw host
admission for accessor, hidden, symbol, Proxy and native-looking error inputs;
the earlier pre-provenance receipts cannot qualify current source. Maximum
logical retirement scope is three names, six Node/browser route rows.

This is the smallest high-leverage follow-up because it closes one coherent
Rust-bound inspection surface already selected in both default roots, with
shared binding and fixtures. It depends on current archive qualification and
error-envelope review; no new schema authority or native-format oracle is
needed. It does not expand the explicit reference route.

### 2. Reconcile Core Relationships and Core Keys installed cohorts — nine names

These are not new Rust ports; they are the next efficient aggregate evidence
batch because their semantic owners and package-root bindings are already
selected, and their operations have narrow frozen packets. The operations are:

- Core Relationships: `inspectCoreRelationships`, `lookupCoreRelationship`,
  `declareCoreRelationship`, `verifyCoreRelationshipOperation`.
- Core Keys: `inspectCoreKeys`, `lookupCoreKey`, `declareCoreRecordMembers`,
  `declareCoreKey`, `verifyCoreKeyOperation`.

Rust owners are `umf_core::core_relationships` and `umf_core::core_keys`;
source pins are `src/model/relationships.ts` SHA-256
`66b15764cb80059de8e98adb9741b9314a1966674f22ef4f114306e679d5e547` and
`src/model/keys.ts` SHA-256
`e2bbe702d3165b2f7fafcbb641700933cdae49a2120accb19087d44f4071817b`. Their
R5 family packets and R8 installed receipts are
[`r5-core-relationships`](../r5-core-relationships/README.md),
[`r8-core-relationships-default-boundary`](../r8-core-relationships-default-boundary/README.md),
[`r5-core-keys`](../r5-core-keys/README.md), and
[`r8-core-keys-default-boundary`](../r8-core-keys-default-boundary/README.md).

A single fixed-point archive must contain both current operation families.
Keep their exact per-operation ordering, unknown-content retention and host
fault controls. Reconcile relationship/keys receipts with all other families
before making aggregate installed-route claims. Maximum potential scope is
nine logical names, eighteen Node/browser route rows; current private evidence
is not retirement. Grouping these makes sense for archive capture and evidence
review, not for merging their Rust semantics into one owner.

### 3. Core Record Type — two names, only after schema authority is resolved

The executable family is `declareCoreRecordType` and
`verifyCoreRecordTypeDeclaration`, owned by `umf_core::core_record_type`.
`src/model/record-type.ts` is pinned at SHA-256
`ad5c465d49d676625296ca354c0297b6d49aa60c59b61eb031757fa81053b5ba`. The
existing opt-in Rust candidate, retained Node/WASM evidence and frozen
predecessor live under [`r5-core-record-type`](../r5-core-record-type/README.md).
The governing semantic contract is CONTRACT-040.

Do not route this batch yet. The Rust path uses
`spec/core/record-type-operation-v6.schema.json`, but the ledger keeps that
resource `authority-unresolved`: history reproduces the current bytes without
establishing the authority for the later envelope and version-reference edits.
The [authority follow-up](../r8-symbol-inventory/record-type-operation-v6-authority-followup-20261026.md)
requires an artifact that directly authorizes those fields, or a retained
writer with governed inputs. Resolve that dependency first, then replay
receipt-before-current admission and source-current installed Node/Bun/WASM.
Potential scope is two names, four Node/browser rows.

## Why the larger families wait

Do not make one “adapter port” out of the 387 adapter gaps. JSON Schema alone
contains 36 executable names, including imports/exports, package/registry
objects, edit helpers and inspection; those are distinct operations and
resource/I/O authorities. PostgreSQL has 84 names with catalog, source capture,
SQL parse/export and edit behaviors. Arrow, Parquet, Delta, Protobuf and other
adapters likewise need contract-specific subsets and native oracles. The R8
inventory already has resource-authority packets; use one adapter contract and
native-oracle subset per future batch.

Core ideals contribute 254 names, but their repeated Avro/Parquet/PostgreSQL/
SQL Server/TableSpec patterns each have different loss reports and inverse
recovery guarantees. Extensions contribute 106 unmapped names and include
registries, callback capabilities, I/O, and domain meaning. Projections add 52
operations with backend-specific reversibility and loss. These are later
waves after a source-authority and host-boundary packet identifies one exact
contract subset; raw export volume is not an implementation priority by itself.

## Decision and limits

Recommended sequence: (1) finish Selection's lazy Registry interface review;
(2) current-source installed qualification of Core Inspectors; (3) common
fixed-point replay and evidence reconciliation for Relationships and Keys;
(4) resolve Record Type v6 schema authority before any default routing. Keep
Schema Properties' four-operation host route as a separate active slice until
its own current archive is qualified. The list is a prioritization proposal,
not authorization to change a source route or ledger disposition. No source,
generated resource, package root, inventory or ledger file was edited for this
packet.
