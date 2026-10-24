---
ddx:
  id: CONTRACT-082
  type: contract
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: CONTRACT-064
      kind: informed_by
---

# CONTRACT-082: Spark Delta 4 DDL realization

**Type:** library/schema. **Version:** `umf.delta.spark-realization/0.1.0`.
**Status:** draft.

## Purpose

Define a target-qualified local Spark Delta 4 realization of the existing
authored Delta definition without changing its vocabulary, schema, or managed
Databricks DDL proposal.

## Scope and Boundaries

- In scope: a pure, versioned realization API for the existing
  `umf.delta.definition` 0.1.0 profile and `umf.delta` 0.1.0 schema.
- Out of scope: Spark/Delta execution, table creation, UC admission, native
  acceptance, source acknowledgement, and any inference about managed profile
  behavior.
- UMF owns the source-preserving interpretation and target-qualified SQL/config
  proposal. Callers own execution and runtime qualification.

## Normative Surface

`realizeSparkDelta4DDL(document, target)` MUST accept only current-core 0.10.0 documents
with the exact supported Delta schema and the existing
`databricks-managed-delta/0.1` authored definition. It MUST validate by the
existing Delta-definition contract before applying any local projection, MUST
NOT mutate the input, and MUST NOT change `generateDeltaDDL` output or any input
vocabulary/schema bytes. `target` MUST be
`{kind:"relation",relation:string[],location:string}` or
`{kind:"delta-path",path:string}`. A relation has one to three strict UMF
identifiers. A path is a normalized absolute POSIX path: no control characters,
empty interior components, dot segments or trailing slash. A path is a typed
value, never SQL text. The relation branch quotes relation components and
escapes backslashes and apostrophes in its location as Spark regular string
literal content. The Delta-path branch quotes the full path as a Spark
backtick-delimited Delta path relation, doubling embedded backticks while
preserving the exact path value.

The result MUST have shape
`{targetProfile,realizationProfile,target,sql,definition,schemaJson,sourceSha256,schemaSha256,writerSettings,dispositions,qualification}`. For a relation binding, `target` MUST be
`{profile:"spark-delta4/0.1",kind:"relation",relation,location,identitySha256}`.
For a path binding, it MUST be
`{profile:"spark-delta4/0.1",kind:"delta-path",path,identitySha256}`. In each
case the identity hash is SHA-256 over canonical JSON of the other target
fields. The relation branch emits the supplied relation and `LOCATION`; the
Delta-path branch emits `CREATE TABLE delta.<quoted-path>` and MUST NOT emit a
metastore relation or `LOCATION` clause. Both target kinds MUST refuse unknown
or crossed fields.
It MUST identify
`targetProfile: "spark-delta4/0.1"` and
`realizationProfile: "umf.delta.spark-realization/0.1.0"`; include a copied
source definition, exact schema JSON, SHA-256 over canonical source JSON and
SHA-256 over exact schema JSON UTF-8 bytes, required Spark writer settings, a
complete ordered disposition of every authored layout/property choice, and a
qualification. Unknown document,
definition, schema, layout, property, version, or meaning MUST refuse rather
than be omitted.

| Authored meaning | Local realization |
| --- | --- |
| `clusterBy` | Preserve ordered columns as Delta `CLUSTER BY` SQL and report disposition `sql`. |
| `partitionBy` | Preserve ordered columns as `PARTITIONED BY` SQL and report disposition `sql`. |
| `delta.dataSkippingStatsColumns` | Preserve the authored value as Delta table property SQL and report disposition `sql`. |
| `delta.parquet.compression.codec: zstd` | Omit the managed-only table property from local SQL; return required writer setting `spark.sql.parquet.compression.codec=zstd` and report disposition `writer-setting`. Other codecs MUST refuse until separately mapped. |
| `delta.targetFileSize` | Preserve the exact value in a disposition `unrealized-performance-hint`; it MUST NOT be represented as a local maximum, guaranteed file size, or applied setting. |
| `delta.deletedFileRetentionDuration`, `delta.logRetentionDuration` | Preserve exact authored values as table property SQL and report disposition `sql`. |
| Empty arrays/maps | Report an explicit `none-authored` disposition for each empty layout/property collection. |

The SQL MUST target exactly the selected local binding. The returned `definition` MUST remain the unmodified authored
definition; local target binding MUST NOT be written back into it.

Each disposition MUST have `{sourcePointer,authoredValue,outcome,explanation}`;
`outcome` is `sql`, `writer-setting`, `unrealized-performance-hint`, or
`none-authored`. Empty layout/property collections MUST still produce a
disposition. Order is `clusterBy`, `partitionBy`, then properties sorted by
source key. The result MUST identify this as a
local Delta 4 proposal, not a managed Databricks realization. It MUST NOT
claim execution, cluster/statistics effectiveness, or target-size realization.

## Precedence and Compatibility

This API is additive and versioned independently from
`umf.delta.definition` 0.1.0 and core 0.10.0. It MUST leave those versions and
source bytes unchanged. `generateDeltaDDL` remains the managed Databricks
proposal with byte-identical behavior. Unsupported or unknown input MUST
continue to round-trip through UMF but cannot receive a Spark Delta 4 proposal.

## Error Semantics

Errors from validating the original document retain CONTRACT-064 semantics.
Invalid target bindings and unsupported local meaning raise
`DELTA_DDL_UNSUPPORTED` with a reason naming the refused target field or source
pointer. Retaining the original document and selecting a later explicit
realization profile is the recovery path; retrying identical input MUST NOT
weaken refusal.

## Examples

```typescript
const managed = defineDeltaTable(schemaJson, definition, {id: 'items'});
const local = realizeSparkDelta4DDL(managed, {
  kind: 'delta-path',
  path: '/tmp/delta/items'
});
// Or select an explicit relation when the caller owns that metastore binding:
const registeredLocal = realizeSparkDelta4DDL(managed, {
  kind: 'relation',
  relation: ['local_catalog','local_schema','items'],
  location: '/tmp/delta/items'
});
// local.targetProfile === 'spark-delta4/0.1'
// local.writerSettings = [{key:'spark.sql.parquet.compression.codec',value:'zstd'}]
// local targetFileSize disposition is explicitly unrealized.
```

## Non-Normative Notes

The implementation and tests qualify proposal generation only. They do not
establish local Spark/Delta execution. In particular, `delta.targetFileSize`
is retained as authored intent and disclosed as an unrealized local
performance hint.
