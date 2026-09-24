---
ddx:
  id: CONTRACT-034
  type: contract
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: CONTRACT-015
      kind: informed_by
    - id: CONTRACT-007
      kind: informed_by
    - id: US-015
      kind: informed_by
---

# CONTRACT-034: PostgreSQL catalog to Avro schema projection

`projectPostgresqlToAvro(source,policy)` selects an ordinary or partitioned table
from a PostgreSQL 17.4 catalog capture and binds named source columns to Avro fields.
Each binding chooses value, finite-decimal, avro-temporal or sql-text representation.
Results retain the complete source UMF, policy, source pointers and fidelity issues.
Successful results also contain target UMF and native Avro JSON. The complete result
schema is spec/projections/postgresql-avro.schema.json. This is schema transformation;
it neither reads production data nor implements a PostgreSQL row encoder.

Unrestricted value mapping covers recognized boolean, integer, float, text and bytea
identities. Smallint range, native float behavior, text length, collation, padding
and NUL restrictions remain reported native refinements. Column notNull determines
the target null union. SQL defaults do not become Avro reader defaults. All database
constraints and execution semantics remain in the preserved source.

Finite-decimal requires constrained numeric with precision 1–1000 and signed scale
between -1000 and 1000. The native typmod is decoded and checked for reserved bits.
Target scale is max(0,s), precision is max(p,s,p-s). Negative scale and scale greater
than precision widen the target domain; rounding and quantization are not enforced.
Native NaN is explicitly excluded by this binding. Unconstrained numeric is blocked
unless the caller chooses text. No arbitrary decimal precision is invented.

Avro-temporal maps date, time, timestamp and timestamptz to the corresponding date,
time-micros, local-timestamp-micros and timestamp-micros annotations. It explicitly
excludes native infinities, time 24:00 and values outside target carrier/library
ranges. A future value encoder must perform epoch conversion and reject excluded
values. Timetz requires text until an offset-preserving representation is implemented.
Arrays, domains, JSON, UUID and other unclassified identities also require explicit
text or future native mappings. Text requires caller-owned formatting/session policy;
it does not imply that parsing or constraints are preserved by Avro string.

Strict policy blocks fidelity issues. Reported-loss policy permits the explicitly
selected restricted domains but never an unavailable mapping. Modified captures,
unverified versions, unknown representation encodings, stale derived core fields,
duplicate relations/columns and invalid bindings cannot produce a target.

## Evidence and limits

The captured scalar_types table exercises 20 columns and 24 fidelity issues.
PostgreSQL 17.4 native probes independently verify typmod encoding, negative-scale
rounding, fractional-only numeric, numeric NaN/infinity, temporal infinity and 24:00.
Authored cases test precision/scale boundaries, malformed modifiers, missing metadata
and unsupported mappings. These are not claims of full PostgreSQL conformance.

Apache Avro 1.12.0 and fastavro 1.12.2 agree on 177 encoded bytes and qualified sample
values through both UMF formats. Local timestamps return different Python types;
only that declared field is normalized to exact epoch microseconds, with warnings
retained. Target acceptance of smallint 40000 and NUL text demonstrates reported
constraint gaps. Chromium matches the full result, both recoveries and strict
blocking with no external requests or Node globals.

The rules follow PostgreSQL 17's [numeric documentation](https://www.postgresql.org/docs/17/datatype-numeric.html),
[temporal documentation](https://www.postgresql.org/docs/17/datatype-datetime.html)
and [native numeric typmod implementation](https://github.com/postgres/postgres/blob/REL_17_STABLE/src/backend/utils/adt/numeric.c).
Shared core scalar families remain qualified classifications; none of these native
refinements is promoted to an unqualified core field by this projection.
