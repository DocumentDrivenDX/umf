---
ddx:
  id: CONTRACT-082
  type: contract
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.architecture
      kind: informed_by
    - id: CONTRACT-018
      kind: informed_by
    - id: CONTRACT-055
      kind: informed_by
    - id: US-093
      kind: informed_by
    - id: CONTRACT-906
      kind: informed_by
---

# CONTRACT-082: Lakeview dashboard interchange

**Version:** `umf.lakeview` 0.2.0, core 0.10.0, kind catalog profile 1.0.0.
**Type:** native adapter/library and portable extension package.

## Purpose

Expose a native dashboard composition and explicitly declared data shapes to
UMF consumers while reconstructing an untouched original UTF-8 file exactly.
A dashboard is an extension-defined composition, never a core shape kind.

## Scope and Boundaries

The qualified input subset is observed JSON `.lvdash.json` objects with optional
datasets and pages arrays, page layout arrays and explicit query/column names.
The committed corpus defines evidence, not a published Databricks schema.
Rendering, query execution, cross-BI equivalence, native acceptance and edited
native rewrites remain unverified. The adapter performs no network or code loading.

## Normative Surface

The complete payload schema is `spec/extensions/lakeview/schema.json`, identical
to the manifest's embedded schema. `kindCatalog` declares these identities:

| Scope | Kind | Meaning and core reuse |
| --- | --- | --- |
| document | dashboard | Original text, retained root fragment/order and UMF title |
| module | data | Native dataset identity container |
| module | page | Retained page fragment/order and layout composition |
| element | dataset | Core Record of explicitly named native columns, including calculations; partial native declarations only |
| element | layout-item | Retained native widget/layout item with references to query-result Records |
| element | query-result | Core Record of explicitly named widget-query outputs; an exact dataset reference only if unambiguous |
| element | field | Core Field with source pointer and declared-column/query-output role |

`Element.members` holds ordered qualified Field identities. `Element.references`
holds the corresponding core graph edges with role `lakeview-declaration`.
Dataset/query Records MUST NOT imply a physical table, row grain, complete SQL
schema or evaluation context. Scalar type, nullability and cardinality remain
unspecified; native declarations/expressions remain attached in retained source.
There is no second field dictionary. Duplicate names do not collapse identities.
Module and element IDs use native names where available, suffix collisions and
allocate generated Record/Field identities independently of display names.

Import returns `{document, issues}`. Issues have source JSON Pointers, code,
classification `unsupported`, detail and `retainedInSource: true`. They identify
partial schema declarations, opaque query semantics, unresolved/ambiguous dataset
names, unnamed outputs and unverified native semantics. These are interpretation
limits, not a claim of complete cross-system projection coverage.

The root `originalText` MUST retain the complete original source. Native fragments
use the bounded lossless tagged JSON tree; number tokens never pass through host
numbers. The parser rejects duplicate decoded keys and invalid JSON. Byte APIs
accept strict UTF-8, preserving an optional BOM. Other encodings are outside scope.

The payload schema checks native fragment root structure. The explicitly
registered Rust validator checks complete nested fragment/source consistency;
ordinary structural admission alone does not certify those native semantics.
Without that capability, generic tooling must retain incomplete validation.

Export MUST rebuild the expected representation from the original source and
compare it against current Records, Fields, references, native fragments, member
orders and wrapper content. It MUST refuse divergence with
`LAKEVIEW_EDIT_UNSUPPORTED`; returning an old archive after a Field/native edit is
forbidden. UMF document ID, title and a uniform namespace are authoring options,
not native rewrites. Object storage order is compared by exact UTF-16 keys because
JavaScript reorders integer-like keys; arrays and explicit member-order arrays
remain ordered. Original text preserves all lexical native order.

## API and Explicit Capabilities

Initialize a shared native/WASM runtime, then use:

- `importLakeviewDashboard(text, {id, title?, namespace?}, runtime)`;
- `importLakeviewDashboardBytes(bytes, options, runtime)`;
- `exportLakeviewDashboard(document, runtime)` and byte-output equivalent;
- `lakeviewRegistry(runtime)` and `inspectLakeview(document, runtime)`.

The registry explicitly selects `{kinds:true, nativeValidator:'lakeview/0.2.0'}`.
This built-in validator is a trusted caller capability, not a manifest field.
Unknown validators, wrong package identities and simultaneous host callbacks
MUST refuse. Native consistency runs once at the root; other attachments receive
ordinary payload and generic kind checks. No host callback serializes the full
source per Field. Generic discovery still reports source validation and coverage.

Private shared wire operations are `lakeview-import`, `lakeview-export` and
`lakeview-diagnostics`; native CLI and language/WASM bindings use the same Rust
implementation. No TypeScript retention or core-shape derivation fallback exists.

## Precedence and Compatibility

This revision supersedes PR42's 0.1 compact-token export and default
`umf.dashboard` field model. Existing core 0.10.0 packages and dashboard profile
0.1.0 are unchanged. `projectLakeviewToLegacyDashboard` explicitly exposes the
PR42 projection helper as a compatibility view; its field dictionary and narrower
projection semantics are not part of the 0.2 native document. Shared concepts may
be promoted to a future generic dashboard extension after independent systems
provide evidence. This contract adds no dashboard semantics to core.

## Error Semantics

Generic kind errors come from CONTRACT-906. `LAKEVIEW_NATIVE` rejects malformed
native container shapes; `LAKEVIEW_OPTIONS` rejects import options;
`SOURCE_ENCODING` rejects malformed source text, and strict byte decoding rejects
invalid UTF-8. `LAKEVIEW_SOURCE` requires original text and
`LAKEVIEW_EDIT_UNSUPPORTED` rejects unqualified native/core divergence.
`LAKEVIEW_CONTEXT_UNVERIFIED` remains a completeness warning even for an exact
byte recovery. Resource/cancellation failures abort without partial success.
Malformed archived source is `LAKEVIEW_SOURCE_INVALID` at `originalText` during
semantic inspection; direct import/export retains the underlying source error.

## Examples and Verification

`fixtures/lakeview/marketing-campaign.lvdash.json` is the PR42 input. The lexical
and empty-section fixtures exercise preservation edges. Tests MUST compare output
bytes directly to these original files, including both UMF serialization paths.
Rust, Node/Bun and real Chromium checks establish only their recorded subset;
Databricks acceptance and edited-source operations need separate qualification.
