---
ddx:
  id: CONTRACT-050
  type: contract
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-018
      kind: informed_by
---

# CONTRACT-050: Authored Delta table definition and DDL

**Type:** library/schema. **Version:** umf.delta.definition 0.1.0 experimental.

## Purpose

Generate reviewable Databricks Delta CREATE statements from UMF. Ashlar is the
initial consumer; the generator and vocabulary belong to UMF. Source schema
and physical choices MUST remain recoverable without interpreting unknown meaning.

## Scope and Boundaries

This profile defines fresh managed tables, not migrations or captured snapshots.
It MUST NOT fabricate native table UUIDs or protocol observations. No database
execution, relationship enforcement, native acceptance, source ACK, publication
readability or automatic maintenance policy is established by generation.

## Normative Surface

`defineDeltaTable(schemaText, definition, {id})` MUST retain the exact schema
through existing `umf.delta` 0.1.0, and place the authored definition in document
extension `umf.delta.definition` 0.1.0. Core envelope is 0.1.0. A definition has
`profile:"databricks-managed-delta/0.1"`, `name` (one to three identifier parts),
ordered `clusterBy` and `partitionBy` column arrays, and `properties` (string map).
All fields are required. Empty arrays/maps denote no explicit choice.

`generateDeltaDDL(document)` MUST return `sql`, copied `definition`, exact
`schemaJson` and a qualification. It MUST NOT modify the input or apply SQL.
Only one exact schema module/element is interpreted. Unknown document, module,
element, vocabulary declaration, schema, metadata or definition content MUST
remain serializable and MUST block DDL generation. Unknown versions MUST refuse.

The first emitter supports Delta atomic string, long, integer, short, byte,
float, double, boolean, binary, date and timestamp types. Required fields emit
NOT NULL; nullable fields omit it. Empty metadata is required. Canonical `decimal(p,s)` emits DECIMAL(p,s), with precision 1–38 and scale
0–precision; neither precision nor scale is defaulted or rounded. Noncanonical
spellings and unsupported bounds MUST refuse. TIMESTAMP_NTZ emits explicitly,
without inferring native timestampNtz protocol admission. Recursive STRUCT, ARRAY
and MAP are supported under the following preservation rules. STRUCT fields
retain order, quoted names and explicit nullability; case collisions, empty
structs and nonempty metadata refuse at every depth. ARRAY requires
containsNull:true; MAP requires explicit valueContainsNull:true and atomic keys.
False or absent collection nullability MUST refuse rather than default or relax.
Required STRUCT fields anywhere inside a collection MUST refuse because this
SQL profile cannot preserve their constraint. Unknown recursive content refuses.

Variant, defaults, identity, generated expressions and
column-mapping metadata require subsequent explicit interpretations.

Names MUST use ASCII letters/underscores followed by letters/digits/underscores;
the emitter MUST quote each identifier. Duplicate names ignoring case, missing
layout columns and duplicate layout columns MUST refuse. Complex layout columns
require a separately qualified profile and MUST refuse here. Liquid clustering and
partitioning MUST NOT coexist; at most four clustering columns are supported.

Properties supported here are `delta.dataSkippingStatsColumns` (existing
column names), `delta.targetFileSize` (positive decimal integer),
`delta.parquet.compression.codec` (explicit recognized codec),
`delta.deletedFileRetentionDuration` and `delta.logRetentionDuration` (positive
integral fixed-unit intervals). Values outside the safe literal subset MUST
refuse; arbitrary keys MUST refuse rather than disappear. Setting values are
authored intent, not native retention admission or performance guarantees.
No predictive optimization DISABLE statement is generated.

## Precedence and Compatibility

Exact Delta schema remains the column authority; definition extension owns
fresh-table layout intent. Captured `umf.delta.table` remains a separate native
context profile and MUST NOT be reconstructed from authored CREATE choices.
JSON/YAML recovery MUST preserve both profiles' source content. Unknown future
content does not authorize lossy export. This version has no report-loss mode.

## Error Semantics

Invalid envelope/definition structure raises `DELTA_DDL_INVALID`. Unsupported
meaning raises `DELTA_DDL_UNSUPPORTED`; existing Delta adapter preservation
errors remain possible. Recovery consists of retaining the original document
and supplying an explicit supported interpretation or later profile version.
Retrying an unchanged unsupported document MUST NOT silently produce SQL.

## Examples

```typescript
const document = defineDeltaTable(schemaJson, {
  profile: 'databricks-managed-delta/0.1', name: ['catalog','schema','items'],
  clusterBy: ['id'], partitionBy: [],
  properties: {'delta.targetFileSize':'67108864'}
}, {id: 'items'});
const proposal = generateDeltaDDL(document);
```

## Non-Normative Notes

The [Databricks CREATE reference](https://learn.microsoft.com/en-us/azure/databricks/sql/language-manual/sql-ref-syntax-ddl-create-table-using)
and [table properties reference](https://learn.microsoft.com/en-us/azure/databricks/tables/table-properties)
were inspected 2026-10-08. Syntax generation is not native execution evidence.
Tests cover retained JSON/YAML recovery, complete expected SQL and refusals;
browser and native evidence must identify their actual tested subsets.

Nested syntax is qualified against the [STRUCT reference](https://learn.microsoft.com/en-us/azure/databricks/sql/language-manual/data-types/struct-type) and [constraint limitations](https://learn.microsoft.com/en-us/azure/databricks/tables/constraints), inspected 2026-10-08. Native execution remains unverified.
