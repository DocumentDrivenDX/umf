---
ddx:
  id: CONTRACT-032
  type: contract
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: CONTRACT-031
      kind: informed_by
    - id: CONTRACT-007
      kind: informed_by
    - id: US-032
      kind: informed_by
---

# CONTRACT-032: SQL Server catalog to Avro record schema

## Captured constraint fidelity

V2 captures produce a separate source-pointer issue for every selected table key,
foreign key and check. These identify native constraint names and state which meanings
remain unenforced, including cross-record uniqueness, referential actions, SQL check
evaluation and trust/disabled/replication state. V1 or partially observed captures
produce CONSTRAINT_COVERAGE_UNAVAILABLE per missing section; missing observations
must not imply an unconstrained table. All observations remain exact in result.source.

The three-table v2 fixture reports ten individual constraint losses and survives
six target schema recoveries in Apache Avro 1.12.0 and fastavro 1.12.2. Both accept
orphan/check-violating rows and two identical consecutive records. Native enforcement
evidence is separately recorded by the SQL Server constraint oracle. Chromium compares
full results, source paths, recoveries and strict blocking. This is explicit loss
evidence, not an implementation of cross-system constraint execution.

## Projection contract

`projectSqlServerToAvro(source,policy)` selects a qualified captured table and explicit
column-to-field bindings. Policy specifies target document ID, Avro record name and
namespace, each field's name and representation (`value` or `sql-text`), and lossPolicy
(`strict` or `allow-reported-loss`). Unknown policy fields and invalid names reject.
Every result retains copied source, policy, issues and mappings. Successful results
also contain native Avro JSON and target UMF; target alone cannot reconstruct source.

Value mappings use canonical SQL Server type identity, not core-family names alone.
Boolean and integer carriers, float widths, decimal precision/scale, strings and
binary/fixed lengths map to Avro. Date and supported microsecond temporal types use
logical annotations. Higher precision temporal values require explicit sql-text
until a suitable value-domain policy is implemented. XML, sql_variant and unknown
representations are not silently converted by value. sql-text explicitly selects
an Avro string and reports native lexical, type-tag and validation loss; it is not
an instance encoder or a claim that arbitrary native values cast losslessly to text.

Nullable fields use a null union; every Avro writer field remains required and SQL
defaults are not Avro reader defaults. Database constraints, generated behavior,
aliases, collation, padding, code pages, length/range restrictions and capture limits
remain source-owned and are reported. Strict policy blocks whenever fidelity issues
exist. Unsupported value mappings block even under reported-loss policy. Modified
captures or unsupported source versions block until correspondence is re-established.

This operation projects schemas only. It does not execute SQL, convert row values,
or claim a lossless native SQL Server/Avro equivalence. Native tests qualify target
schema/value behavior separately from source catalog evidence.

## Mapping and evidence details

SQL tinyint/smallint/int use Avro int, with the narrower ranges reported; bigint uses
long. real and float use float and double, with non-finite over-acceptance reported.
decimal/numeric/money use logical decimal over bytes; precision is 1–38 and scale is
0–precision. Money bounds remain an additional reported constraint. Character data
uses strings; binary and rowversion use named fixed types, with rowversion width
required to be eight bytes. Variable binary data uses bytes with length limitations
reported. Date maps to logical date. time at scale ≤6 uses time-micros; datetime2 at
scale ≤6 uses local-timestamp-micros; datetimeoffset at scale ≤6 uses timestamp-micros
with original offset identity explicitly lost. SQL year ranges and scale restrictions
are not fully enforced by those targets. Higher precision and legacy datetime forms
block value mapping. Explicit sql-text is available with reported representation loss.

The result schema is spec/projections/sqlserver-avro.schema.json. The main fixture
selects all 30 columns of the natively captured sales.Types table, using explicit
text for high-precision temporal and otherwise unsupported types. It produces 32
fidelity issues. Apache Avro 1.12.0 and fastavro 1.12.2 agree on 349 encoded bytes and
decoded values through JSON and YAML UMF recovery, including exact bigint, 38-digit
decimal, Unicode, fixed bytes, date and nullable values. Bad fixed lengths reject.
Avro's acceptance of tinyint value 300 is retained as a counterexample to equivalence.

Chromium matches the complete projection, both recoveries and strict-policy blocking.
Separate authored metadata cases check six-digit temporal scale, excessive decimal
scale and invalid rowversion width. Those cases are projection-rule tests, not fresh
native SQL Server observations or complete temporal instance-conversion evidence.

Captured constraints produce per-pointer KEY_NOT_ENFORCED, FOREIGN_KEY_NOT_ENFORCED
and CHECK_NOT_ENFORCED diagnostics. Missing sections produce
CONSTRAINT_COVERAGE_UNAVAILABLE. V3 adds INDEX_NOT_REPRESENTED for every observed
index/heap of the selected table. Predicate, null/collation behavior, column ordering,
inclusion, partitioning, disabled state and physical options remain in source.
Older captures retain the general DATABASE_SEMANTICS capture-limit warning.

The v3 Items fixture projects four fields with three index losses; strict mode
blocks. Both UMF recoveries and Chromium regenerate the same result. Apache Avro
1.12.0 and fastavro 1.12.2 accept two records with an active duplicate filtered key
that the native SQL Server oracle rejects; both codecs recover the values and agree
on 22 bytes. This counterexample is recorded in index-projection-oracle.json under
fixtures/sqlserver. Run `.venv/bin/python scripts/sqlserver-index-projection-oracle.py`
after the index tests generate the projection fixture. No generic row converter is
implied.
