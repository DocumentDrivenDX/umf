---
ddx:
  id: CONTRACT-030
  type: contract
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: CONTRACT-001
      kind: informed_by
    - id: US-030
      kind: informed_by
---

# CONTRACT-030: TableSpec table schema ingestion

`umf.tablespec` 0.1.0 defines a document-scoped native payload containing profile
`tablespec-table-1`, exact NativeJson `root`, `originalSource` and `originalFormat`
(json/yaml). Its complete encoding schema and package are under spec/extensions/tablespec.
The pinned model-generated schema is retained separately as native-model.schema.json;
runtime Pydantic validation/coercion is not reproduced by payload validation.

`importTableSpec(text,{id,format})` consumes a monolithic version 1.0 table with a
table_name and columns array. Each column requires name/data_type strings and names
must be unique. Source metadata and unknown values remain exact. A table module
exposes one element per column (ID column:index), name, optional description and
the core scalar family mapping defined in CONTRACT-001. Namespace records the native
table name. It does not interpret EMBEDDING as a scalar or flatten native nullability.

`getTableSpecColumn(document,index)` returns a copied complete native column tree.
`getTableSpecTable(document)` returns a copied complete native table view, using the
existing NativeJson encoding for exact numeric tokens and unknown metadata. Neither
accessor normalizes native values or certifies native semantic validity. For split
input the table view contains the merged ordered columns and sibling derivations;
shadowed inline columns and opaque sidecars remain in the source archive and are
recovered with `exportTableSpecBundle`. The accessor is not a flattened export.
Mutating a returned tree cannot modify the document. The Avro projection uses this
accessor for its table-level loss reports.
`inspectTableSpec` validates core and the registered payload; complete remains false
because native semantic validators, coercion, conditions and pipelines are not executed.
`exportTableSpec` returns the exact original source when unchanged; changed native
trees render JSON, which is also valid YAML. Unknown payload/tree encoding fields
block native export while remaining serializable in UMF. Unknown native fields do
not block source recovery. Derived core metadata must agree with native columns or
export rejects; an unsynchronized core edit cannot silently disappear.

`editTableSpecColumn(document,index,changes)` merges explicitly supplied native fields
on a copy, retains unspecified native fields and unrelated core/extension content,
and recomputes name, description and scalar family. It rejects pre-existing metadata
disagreement, duplicate names, malformed columns and unknown source encoding. Changing
to an unclassified native type removes the previous scalar family. It does not certify
native semantic validity; precision/scale and other rules still require native checks.
Both edit APIs require a plain JSON mapping. They reject arrays, custom prototypes,
symbol or hidden fields and accessors before merging; getters are never invoked.
Ordinary native keys such as `__proto__` remain data and are copied safely.

`editTableSpecTable(document,changes)` merges explicit table metadata on a copy and
synchronizes the core module namespace when table_name changes. It retains existing
column elements, attached metadata and the original source archive. Replacing columns
through this operation is rejected: column ordering and identity require separate
operations. Version, native shape, stale-core and unknown-encoding guards still apply.
The operation does not discover or automatically rewrite references. Callers may use
it after copied column edits to explicitly repair primary_key or context_column; each
intermediate document remains an incompletely validated candidate.

`importTableSpecBundle(files,{id})` accepts an explicit map of normalized relative
paths to text, including table.yaml and at least one columns/*.yaml. It preserves
every supplied file under optional payload `splitFiles`. Its root is a table/column
metadata view, not the native loader's migrated/validated model. Columns follow
Python Unicode code-point filename order. Sibling derivation overrides inline
derivation in this view, matching the native loader. Duplicate names and malformed
column wrappers fail explicitly. Auxiliary files remain uninterpreted and recoverable.

`exportTableSpecBundle` returns the original file strings when unchanged. Copied
column edits rewrite only affected column files as JSON-compatible YAML, retaining
unknown sibling fields and any shadowed inline derivation. File names remain stable
when column names change. Table metadata edits rewrite only table.yaml; a table-only
edit leaves every column/sidecar file byte-identical. Any original inline columns in
table.yaml are shadowed by the separate column files and remain preserved as shadowed
content, rather than being overwritten by the merged view. Column insertion/deletion
without explicit file mapping is rejected. `exportTableSpec` rejects split input: flattening the
metadata view would omit loader migrations and sidecar meaning. File enumeration is
the caller's responsibility; the browser library performs no filesystem access.
The `.yaml` suffix must end the filename exactly, matching the native pathlib glob.
A trailing line terminator makes that file an opaque sidecar; a line terminator
within the basename does not prevent matching. All supplied files remain recoverable.
`tests/tablespec/boundaries.test.ts`, its Chromium replay and the independent Python
glob check in `scripts/tablespec-boundaries-oracle.py` exercise these boundaries.

The current adapter does not execute Pydantic rules or translate data values.
Explicit schema projections are governed by CONTRACT-033, CONTRACT-038 and CONTRACT-039;
broader TableSpec fixtures, value conversion and native pipeline execution remain required.
Column-index IDs are local to this captured ordering, not durable identity across
schema evolution. Original source remains in the payload; users must retain the UMF
document when exporting native content to preserve unrelated core/extension metadata.

Native evidence now covers explicit table-name, description, primary-key and context-column
edits following two column renames. The pinned Pydantic model and split loader accept four
recovered repaired schemas and reject both unrepaired candidates because the old primary
key references a missing column. Four further recovered opaque-field cases preserve a
native rejection: the model forbids unknown table-level fields even though UMF retains
them exactly. Native rejection is not treated as preservation failure or silent permission
to delete the unfamiliar content.

`tests/tablespec/table-edits.test.ts` and `scripts/tablespec-table-edits-oracle.py` bind
this evidence to the source fixture and captured native model/loader fingerprints.
Run the oracle with `/home/erik/Projects/tablespec/.venv/bin/python`; results are in
fixtures/tablespec/table-edits-oracle.json. The existing TableSpec Chromium script
replays four table-edit examples and eight recoveries, alongside earlier monolithic
and split checks. Native coercion/validation is still not executed by the browser library,
and arbitrary name references, sidecar migrations and pipelines remain uninterpreted.

The source at commit 647e8e566ad78b864282ec65c0b0b2237aa63084 accepts boolean,
contextual-map and absent nullability. Its checked-in JSON Schema omits booleans;
the actual model-generated schema and native probes record the distinction. We do
not replace source input with Pydantic's normalized output or discard extra content
that Pydantic may ignore.
