---
ddx:
  id: CONTRACT-033
  type: contract
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: CONTRACT-030
      kind: informed_by
    - id: CONTRACT-007
      kind: informed_by
    - id: US-030
      kind: informed_by
---

# CONTRACT-033: TableSpec to Avro schema projection

`projectTableSpecToAvro(source,policy)` transforms explicitly selected columns into
an Avro record. Every field binding declares its target name, representation and
nullability (`source` or an explicit boolean). A named context resolves contextual
source nullability; missing context, missing keys or non-boolean native values do
not imply a default. Explicit overrides are reported. Strict policy blocks fidelity
issues; reported-loss policy does not authorize unsupported mappings.

Representations are string, int32/int64, float32/float64, boolean, decimal, date,
timestamp-micros/local-timestamp-micros, and embedding-float32. Numeric representations
must match the native family. Decimal requires explicit native precision/scale;
there is no invented DecimalType default. Embeddings require explicit item nullability
and native positive dimension; Avro does not enforce vector length. String is an
explicit textual representation for other native types, with conversion loss reported.
All operations are schema-only and preserve the source UMF, including split files.

Selected decimal precision/scale and embedding dimensions are checked against their
exact source numeric tokens before interpretation. Fractions that round to integers,
underflow, unsafe integer magnitudes and negative zero produce a blocking
`TABLESPEC_AVRO_UNSUPPORTED` issue at the qualifier path. Exact integer decimal or
exponent spellings remain usable. This is a projection boundary, not a new native
TableSpec validation claim. Unknown numeric metadata remains exact in the source.

The pinned native TableSpec helpers disagree on DATE: map_to_pyspark_type returns
StringType(), while map_to_pyspark_type_obj returns DateType(). Target representation
must therefore be a caller choice. Temporal precision, timezone/session behavior,
format parsing, numeric widths and nullable vector elements remain qualified binding
decisions rather than silent core equivalence claims.

Results retain source, policy, issues and native column-index mappings; successful
results contain target UMF and native Avro schema. Native validations, transformations,
pipeline behavior, constraints and unhandled metadata remain in source and are reported.
No instance encoder, data coercion or complete TableSpec execution is implied.

## Evidence and limits

The result JSON Schema is spec/projections/tablespec-avro.schema.json. Decimal
precision is currently bounded to 1–1000 by this projection; this is an implementation
limit, not a claim about every TableSpec execution engine. Scale must be explicit
and between zero and precision. Unknown metadata and refinements not represented by
the selected type produce source-retained fidelity issues.

The authored fixture exercises 12 fields and all representations; the captured
provider fixture exercises four fields with MD context. A split-bundle case retains
opaque files. Pinned native Pydantic models agree on source metadata before/after
projection, and native helper probes confirm the DATE disagreement, 32-bit integer/
float mapping and nullable float-array helper. Target Avro evidence uses Apache
Avro 1.12.0 and fastavro 1.12.2 through both UMF formats. Their local-timestamp APIs
differ: Apache returns an integer for the unrecognized annotation, while fastavro
returns a local datetime. The oracle explicitly normalizes only that declared field
to exact epoch microseconds; warnings and return types remain in the report.

The target accepts a one-element vector despite native dimension three, confirming
the reported dimension loss. The explicit int64 binding admits values beyond the
pinned Spark INTEGER width. These are counterexamples to implicit native equivalence,
not evidence of a completed source-value converter. Chromium compares full projection
results, four schema recoveries and strict-policy blocking.

CONTRACT-038 now supplies the reverse Avro-to-TableSpec projection. A deliberately
scoped five-field carrier cycle has equal native schema and independent binary/value
evidence. Decimal, temporal, complex-value and floating-width differences remain
reported; the reverse direction does not establish general semantic equivalence.

Table-level members also receive individual source paths: `primary_key` reports
`PRIMARY_KEY_NOT_ENFORCED`, and `context_column` reports
`CONTEXT_DISPATCH_NOT_ENFORCED`. Selecting a policy context does not implement
per-row context dispatch. Other table members, including unknown metadata, report
`NATIVE_TABLE_METADATA`; record naming remains an explicit policy choice. JSON
Pointer escaping applies to native member names. Table edits and split recovery
retain these reports and exact unknown numeric content.

`tests/tablespec/avro-table-loss.test.ts` covers both input layouts, edited table
metadata, omitted context columns, strict blocking and JSON/YAML recovery. Chromium
compares their complete results. Apache Avro and fastavro independently accept
repeated target key values without a context discriminator; this demonstrates the
target's missing constraints, not a TableSpec instance-validation implementation.
