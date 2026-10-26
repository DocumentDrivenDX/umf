---
ddx:
  id: umf.evidence.rust-migration.r8-unmapped-pure-operation-wave
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.evidence.rust-migration.r8-symbol-inventory
      kind: informed_by
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-040
      kind: informed_by
    - id: CONTRACT-049
      kind: informed_by
    - id: umf.evidence.rust-migration.r5-schema-properties
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-schema-properties-installed
      kind: informed_by
---

# R8 bounded pure-operation wave while Selection remains open

## Decision

Use the four Core Schema Properties operations as the next installed default-route
qualification wave while Core Element Selection's caller-Registry seam is being
resolved. This is an evidence/qualification wave, not a new source-routing
change: both V4 roots already select these exports through the shared
`host-json/1` dispatcher. Do not use this packet to change ledger status or
claim retirement. The explicit `./reference` route remains the TypeScript
oracle.

The choice is bounded and low in external authority: these are deterministic
document/field operations, with no caller-supplied semantic callback,
filesystem, network, native format, or registry input. Ordinary JavaScript
accessors and Proxy traps remain caller-observable host behavior and are part
of the required parity cases. Rust owns their semantic implementation and the
single-call host-reflection schedule. They use the existing five-resource Core
Model set only. None of the 17 unresolved resource aliases / 11 unresolved
resource files in the current authority packet is in that set; in particular,
do not introduce `schema-properties-selection.schema.json` into this route.
Installed archive member hashes still need verification before this can be
treated as a qualified cohort.

## Pinned denominator and exact scope

The pre-Schema gap-ledger snapshot is SHA-256
`b569e0867e97b7e779692e0a7f7112579f3a125800490de8ce03a072c9621111`; its
historical counts are 922 unique executable names, 864 without accepted opt-in
Rust mapping, and 922 logical default-route retirement gaps. Those figures
describe that pre-Schema source cut, not a current post-Schema census. This
four-operation group is a subset of its 864 unmapped names. The snapshot
predates current V4 routing for this family: each operation has reference,
Node and browser rows, but the package-root rows point at the predecessor
source and say `bindingRouteStatus: unproven`. Use the exact row IDs below as
selectors for that historical snapshot; regenerate route provenance and
denominators at the next coordinated source capture.

| Public operation | `./reference` row | Node row | Browser row | Rust semantic owner | Predecessor source pin |
| --- | --- | --- | --- | --- | --- |
| `declareCoreSchemaProperties` | `package-reference-0207` | `package-root-node-2447` | `package-root-browser-1327` | `umf_core::schema_properties::declare_core_schema_properties` | `src/model/schema-properties.ts`, SHA-256 `2a7fb88a8a560f070c0f4ff7685b2e1be474082271e96ee7c8b85ab5ac6d905f` |
| `inspectCoreSchemaProperties` | `package-reference-0465` | `package-root-node-2705` | `package-root-browser-1585` | `umf_core::schema_properties::inspect_core_schema_properties` | same |
| `resolveCoreDefault` | `package-reference-0919` | `package-root-node-3159` | `package-root-browser-2039` | `umf_core::schema_properties` host dispatcher / existing `Engine` default-resolution body | same |
| `validateCoreFieldValue` | `package-reference-1038` | `package-root-node-3278` | `package-root-browser-2158` | `umf_core::schema_properties` host dispatcher / existing `Engine` field-validation body | same |

Maximum scope is four logical names and eight Node/browser default-root rows.
If the authority-bound ledger later accepts the Rust ownership mapping, the
unmapped count can fall from 864 to 860. If, after complete parity and explicit
retirement review, all four declarations are retired from both default roots,
the logical retirement-gap count can fall from 922 to 918. Neither change is
authorized here, and the `./reference` rows remain TypeScript.

## Existing implementation and evidence

Both roots explicitly select all four methods in `src/index-node-v4.ts` and
`src/index-browser-v4.ts` through `bindCoreSchemaPropertiesRust`. The shared
Rust host endpoint is `crates/umf-core/src/schema_properties_host_json.rs`;
the semantic body is in `crates/umf-core/src/schema_properties.rs`. There is
one Context per call and operation-owned staged reflection. The facade forwards
original input objects and adds no public controls or caller callback.

The exact trusted resources are `coreSchema`, `referenceSchema`,
`packageSchema`, `constraints`, and `domainPolicy`, declared by
`src/access/core-model-resources.ts`. Their source files and hashes in this
source cut are:

| Resource | SHA-256 |
| --- | --- |
| `spec/core/schema.json` | `bbb60943bf30c7faefcdbe3ebe54258b53e5f019f840d969d21eb2a83660c359` |
| `spec/core/semantic-type-reference.schema.json` | `e6290c1cde11d79bec1f11d4728061d94ef611649a848fea9973fc12f09df903` |
| `spec/core/extension-package.schema.json` | `f972449c3e8710bea1386dab7df1e4f642eb7563511aa46a4a28f1198d7eb545` |
| `spec/metamodel/generated/core-constraints.json` | `5449f91989e96d4d8a3efcebc28ab752471a4afe62a3aee478aa80ad7c75fdd8` |
| `spec/metamodel/generated/domain-policy.json` | `dd01ea067f74621efed01240ca842f4818d1f5d393bb7d2fc6547e4e2716fd78` |

The frozen predecessor is
[`r5-schema-properties/frozen-typescript.json`](../r5-schema-properties/frozen-typescript.json),
SHA-256 `2427c2eb140226a93ac32e25d49a1f60a91582758c620d238dcdd9aaf8506e4a`.
It has the inspection/declaration outcomes; separate frozen R5 field-value
and default vectors carry 50 and 24 cases. The R5 evidence records source-level
Rust/Node/Bun and opt-in WASM/Chromium comparisons, but those are not installed
V4-root proof. The current installed replay definition in
[`r8-schema-properties-installed`](../r8-schema-properties-installed/README.md)
requires an archive and source-closure pin and exercises the 4 operations,
their frozen packets, crossed host operands, callback identity, and returned
copy behavior. The rust-migration plan records the fresh-addon Node and
Chromium source-build host-boundary results; no installed fixed-point receipt
is asserted by this decision.

## Host ordering, controls, and blockers

The candidate has no arbitrary Registry callback, so it avoids Selection's
lazy lookup/interleaved callback seam. It still has meaningful caller-visible
host ordering. Preserve these cases and compare complete results or exact
refusal envelopes, including error class, code, message, path and getter/trap
counts:

- declaration patch admission before source and identity;
- inspection source before identity;
- field validation field then value then source, with host-admission faults
  retaining the predecessor's `Validation` diagnostic conversion;
- default resolution state/field preflight before source, then identity-value
  refusal and semantic lookup;
- accessor, non-enumerable, symbol, custom-prototype, cyclic/deep, invalid
  number and Proxy inputs; callback/trap-thrown values retain identity;
- unknown unrelated content preservation, no input mutation, and isolated
  returned copies;
- all existing work/meter and cancellation controls without new public API.

The [current Schema Properties installed receipt](../r8-schema-properties-installed/receipt-current-7144ad5a.json)
now passes on one fixed-point archive in installed Node, Bun and real
Chromium/WASM with 1,788 verified members and zero generated transforms. It
includes 72 fixed-output and 11 host-native thrown cases, crossed admission,
callback identity and copy isolation. Chromium requested the WASM member and
had no Node globals. This updates the qualification outcome of the earlier
decision; the pinned pre-Schema denominator and source-cut hashes above remain
historical. Re-check the ledger census after source changes. Do not infer
release support or declaration retirement from this bounded installed route.

## Exact source cut and authority

Source cut fingerprints for review (not a fixed-point archive claim):

| Input | SHA-256 |
| --- | --- |
| `docs/helix/04-build/rust-migration-plan.md` | `11eb23a75b13e35520620a8fc60ac725e92eadb874654969d1e8909d086126ad` |
| Pre-Schema `docs/helix/04-build/evidence/rust-migration/r8-symbol-inventory/gap-ledger.json` | `b569e0867e97b7e779692e0a7f7112579f3a125800490de8ce03a072c9621111` |
| `crates/umf-core/src/schema_properties.rs` | `c22ee2e62d1e150cf4fbca58a9f55e2d0ae6270ebe94879e88c0957569708691` |
| `crates/umf-core/src/schema_properties_host_json.rs` | `62337c99c22b5e2e6322deae761008f2504fc0ca3c11fa3ce1ef86d8a6628257` |
| `src/index-node-v4.ts` | `332dc347e3395c5492fc8ddd1a6215db29a5143d8dab0938f49131b404eadff9` |
| `src/index-browser-v4.ts` | `905f978e6960ec68a5d633aa51dcc700e9a60cd317daa55ceafce2b9854bd1ba` |

This recommendation selects a qualification priority only. It does not modify
source, generated files, the inventory or ledger, and it does not establish
Rust ownership acceptance, installed parity, declaration retirement, or a
release claim.

## Additional bounded candidates after the Schema replay

Two already-default-selected pure families also pass the requested screen for
a subsequent current-archive replay. They need no caller Registry or semantic
callback, have an existing Node/WASM implementation, and their known resources
are not among the unresolved authority rows. Both have historical R8 installed
receipts, so this is a requalification queue only: earlier installed artifacts
cannot substitute for replay against the source-current archive built after
Schema and the concurrent source changes settle.

### Core inspectors — three operations

| Public operation | `./reference` row | Node row | Browser row | Rust owner | Frozen predecessor |
| --- | --- | --- | --- | --- | --- |
| `inspectCoreRecordMembers` | `package-reference-0461` | `package-root-node-2701` | `package-root-browser-1581` | `umf_core::record_members_inspection::inspect_core_record_members` | [`r5-core-inspectors-default/frozen-predecessors.json`](../r5-core-inspectors-default/frozen-predecessors.json), SHA-256 `9563378b9fb00b213f76d6c0d09ac0c8278c0fb829c719b566b019971a0f3a7a`; 9 cases |
| `inspectCoreReferenceLinks` | `package-reference-0462` | `package-root-node-2702` | `package-root-browser-1582` | `umf_core::reference_links_inspection::inspect_core_reference_links` | same; 9 cases |
| `inspectCoreScalarType` | `package-reference-0464` | `package-root-node-2704` | `package-root-browser-1584` | `umf_core::scalar_type_inspection::inspect_core_scalar_type` | same; 8 cases |

The predecessor sources are `src/model/record-members.ts` (SHA-256
`9e46fb9eacf24aa3428f38f688edd2e7a1a64d21d8c0a051171475d51f147bbc`),
`src/model/reference-links.ts` (`e7e3c104741d3202941973fdec14d6a25af8406dd909dbac7b60cea8e7c27853`),
and `src/model/scalar-type.ts` (`252f09a39470484e29f408df7467fab8ed21407d6f64ebde1fbad5cbc051fef3`).
The V4 roots already select them through the default inspector binder. Their
Rust path consumes the established five Core Model resources and has no
unresolved resource authority dependency. CONTRACT-001 and CONTRACT-040 govern
the exact 0.10.0 read-only metadata outputs; the predecessor controls unknown
labels/qualifiers, missing versus empty values, order, warning paths and
malformed source/identity refusals.

An installed R8 receipt records 26/26 frozen comparisons plus package-host
controls for a private `.5.6` archive, but the capture predates the later
admission-error provenance repair. Keep it as history. A current replay needs
the fixed-point archive and exact raw-host proof in
[`r8-core-inspectors-installed`](../r8-core-inspectors-installed/README.md),
including native-looking caller Proxy exceptions and accessor/hidden/symbol
envelopes. Maximum conditional impact is three logical gaps, six default-root
rows.

### CSV Boolean lexical operations — two operations

| Public operation | `./reference` row | Node row | Browser row | Rust owner | Frozen predecessor |
| --- | --- | --- | --- | --- | --- |
| `validateCsvBooleanLexical` | `package-reference-1041` | `package-root-node-3281` | `package-root-browser-2161` | `umf_core::csv_boolean_lexical::validate_csv_boolean_lexical` | [`r5-csv-boolean-lexical/pre-binding-freeze.json`](../r5-csv-boolean-lexical/pre-binding-freeze.json), SHA-256 `ec71d63a847bb935725cc32d911ac861f347c7aebbd864dd5091d754ffa74e4e`; 14 installed replay cases |
| `verifyCsvBooleanLexical` | `package-reference-1069` | `package-root-node-3309` | `package-root-browser-2189` | `umf_core::csv_boolean_lexical::verify_csv_boolean_lexical` | same |

The predecessor source is `src/model/csv-boolean-lexical.ts`, SHA-256
`45d2516eca6f64e30b380e96853e28c7b7861f4aa2a9edd761ffdbf8d5639f4b`.
CONTRACT-053 directly authored the operation schema resource
`spec/core/csv-boolean-lexical-operation.schema.json`; the resource authority
packet classifies it as authored-known, not unresolved. The operations are
deterministic lexical validation and receipt verification. Verification has a
meaningful receipt-before-expected-input access order, so retain those exact
getter-free checks, token/receipt byte limits, unknown-selected semantics,
surrogate handling, Proxy traps and complete error envelopes. There is no
caller Registry or semantic callback.

The 2025-10-25 R8 installed receipt covers 14 frozen cases and 18 additional
adversarial cases on Node, Bun and Chromium with zero mismatches, but its
captured source closure is no longer live; it cannot qualify the post-Schema
archive. Re-run that frozen and adversarial harness against the same
source-current archive used for the inspector cohort, verifying packaged
operation-schema bytes and Node addon failure controls. Maximum conditional
impact is two logical gaps, four default-root rows.

Together these two candidate cohorts cover five logical names and ten
Node/browser rows. If the current census continues to classify all five as
unmapped and later accepts their Rust mapping, the historical 864 count would
decrease by five; if retirement is separately approved after current archive
parity, the historical 922 gap count would decrease by five. Both effects are
conditional, and the pre-Schema ledger must be recaptured first.

No additional unselected Rust-owned family is recommended in this packet.
Facets and Cardinality have familiar pure operations, but their predecessor
operation-schema versions are included in the unresolved resource-authority
cohort; they fail the resource-authority filter. Selection fails the
no-callback condition. Other apparent parsers either lack a Node/WASM package
binding or have raw-host distinctions outside their tagged-wire predecessor,
so they need a new host boundary review before being offered as this bounded
wave.
