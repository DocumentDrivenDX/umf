---
ddx:
  id: CONTRACT-038
  type: contract
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: CONTRACT-007
      kind: informed_by
    - id: CONTRACT-030
      kind: informed_by
    - id: CONTRACT-033
      kind: informed_by
    - id: US-030
      kind: informed_by
---

# CONTRACT-038: Avro record to TableSpec projection

`projectAvroToTableSpec(source,policy)` lowers selected root-record fields to a
TableSpec 1.0 table. Policy declares target document ID, table name, every selected
field's target name/representation and strict or reported-loss behavior. Result
includes full source, policy, source paths, column mappings, nullability and issues.
Successful results include native TableSpec JSON and target UMF. The complete
policy/result schema is spec/projections/avro-tablespec.schema.json.

The source Avro bundle remains authoritative, including exact metadata, defaults,
aliases, nested/recursive schemas and named dependencies. Export preflight rejects
stale derived core fields. Native interpretation limits, unsafe numeric metadata
and unknown encodings block lowering without a target. Core scalarType alone does
not determine the mapping. Table/column names follow the pinned native TableSpec
name constraints; duplicate target names reject.

## Field representations

| Explicit representation | Accepted source | Target and qualification |
| --- | --- | --- |
| string | string or enum | TEXT; enum symbols/default/name not enforced |
| integer32 | int | INTEGER; pinned Spark helper width, not universal execution equivalence |
| float32 | float or double | FLOAT; double narrowing is explicitly reported |
| boolean | boolean | BOOLEAN; execution/coercion remain outside schema projection |
| decimal | bytes/fixed with valid decimal annotation | DECIMAL with precision 1–38 and explicit scale; value encoding separate |
| date | int/date | DATE; epoch conversion and conflicting native helper representations reported |
| timestamp | long/timestamp-millis, -micros or -nanos | TIMESTAMP; units/range/timezone execution not enforced |
| local-timestamp | long/local-timestamp-millis, -micros or -nanos | DATETIME; local-time intent remains in source |
| hex-text | bytes or fixed | TEXT; caller-owned hexadecimal encoding, no width/alphabet enforcement |
| json-text | any validated field shape | TEXT for non-null Avro JSON; tags, names and exact values need an encoder |

Non-text representations require one resolved non-null branch. A null branch
sets nullable:true, without copying union order or identity. Multi-branch unions
require json-text. Null stays null, not a text value containing `null`. This does
not turn writer-field presence into a TableSpec default or execution guarantee.
Reader defaults are never copied as target defaults. Named definitions resolve in
their Avro namespace/dependency environment before eligible scalar lowering.

Decimal scale defaults to zero only because that is the declared Avro rule; fixed
capacity is checked. The selected target precision limit of 38 is an implementation
profile, not the maximum of every TableSpec backend. See the
[Avro 1.12.0 specification](https://avro.apache.org/docs/1.12.0/specification/).
Unconsumed logical annotations receive a separate carrier-only diagnostic.

Only an absent scale defaults to zero. Explicit null, booleans, strings, arrays and
objects are rejected for decimal lowering. Temporal annotations must be exact
strings; arrays that coerce to a known spelling and spellings with trailing line
terminators do not acquire temporal meaning. Target table/column identifiers require
an absolute end match, in both runtime checks and the published policy schema.

The same absolute-end guard applies to Avro target names/namespaces in the TableSpec,
PostgreSQL, SQL Server and Parquet projections, and to Parquet schema-index overrides.
This closes JavaScript `$` matching before a final line terminator. It does not
restrict arbitrary source names retained in UMF; incompatible target names need an
explicit valid binding. CONTRACT-039 validates these downstream policies even when
an earlier stage blocks.

## Fidelity and evidence

All outputs report that this operation does not encode rows or execute TableSpec
pipelines. Text encodings, numeric rounding/overflow, temporal conversion, native
constraints, Avro framing and schema resolution need separate implementations.
Omitted fields, reader defaults, enum values, union identity and numeric narrowing
are explicit losses. Strict mode blocks those losses; reported-loss mode still
blocks unsupported mappings. There is no claim of arbitrary Avro/TableSpec equality.

The existing recursive Order fixture exercises 13 fields, including enum/fixed,
arrays/maps, recursion, decimal, timestamp, bytes and primitive carriers. Additional
fixtures cover a named fixed-decimal dependency, DATE/local/instant timestamp types
and absent Avro decimal scale. A five-field carrier fixture goes Avro → TableSpec →
Avro with an equal recovered native schema; two representative rows produce equal
bytes/values in Apache Avro 1.12.0 and fastavro 1.12.2 before and after the cycle.
Both codecs independently show binary64 1.0000000000000002 becoming binary32 1.0.
That counterexample prevents treating the common float family as width equivalence.

The pinned TableSpec Pydantic model accepts all generated schemas and six native
recoveries. Native Spark helper observations agree on the five basic carrier fields.
These are schema/helper checks, not TableSpec row or pipeline execution. The Apache
Avro oracle warns that it ignores local-timestamp-micros; that limitation is recorded
in tablespec-oracle.json rather than treated as interpreted temporal equivalence.

Reproduce with:

- `bun scripts/avro-tablespec-schema.ts`
- `bun test tests/avro/tablespec-projection.test.ts tests/tablespec/avro-projection.test.ts`
- `.venv/bin/python scripts/avro-tablespec-oracle.py`
- `scripts/avro-tablespec-target-oracle.py` under the TableSpec Python environment
- `bun scripts/avro-tablespec-browser.ts` with Chromium configured

Validation: 5 focused tests / 81 assertions; type checking; 170 schema and 32
package audits; browser build and Chromium 148. Browser evidence covers four sources,
eight recoveries, named dependencies, strict policy and reverse projection, without
external requests or Node globals. Evidence lives in fixtures/avro/tablespec-*.json.
This focused result follows the 718-test full-suite baseline; the full goal remains
active, including broader cross-system mappings and value encoders.

Boundary regression evidence: tests/consumers/projection-boundaries.test.ts checks
four line terminators against all affected runtime and schema guards, missing versus
malformed scale, exact temporal annotation types and source isolation. Chromium's
projection-boundaries-browser.ts confirms 40 name rejections and five blocked logical
bindings. avro-decimal-boundary-oracle.py records 14 native parser/value probes:
missing and explicit zero agree, but both Python Avro engines accept boolean false
as a scale. UMF rejects that non-integer JSON annotation rather than relying on host
boolean/integer coercion. Results are in fixtures/validation/projection-boundaries*.json
and fixtures/avro/decimal-boundary-oracle.json. The affected positive/negative projection
suites pass 18 tests / 618 assertions; type checking, 171 schema / 32 package audits
and the browser build pass. This remains focused regression evidence, not a fresh
whole-repository test result.
