# Key ideal admission and five-system delivery

Key passes ideal admission under CONTRACT-040 and qualified delivery across the
five priority systems. These are separate results; native equivalence remains
unclaimed. Core 0.6.0 defines named author identity independently of native
indexes, and every projection retains native representations and unknown content.

## Evidence and scope

The admission witnesses are PostgreSQL 17.4 and SQL Server 2022 16.0.4295.3.
Their nonempty generated primary/alternate constraints reject duplicate tuples
and null components in the qualified stored-value profiles. The gate finds 14
PostgreSQL and 16 SQL Server projections with exact equality on representable
values. This does not remove residuals for stable author identity, native domain
limits, input conversion, session requirements or enforcement scope.

All five bindings have independently qualified delivery. TableSpec uses commit
`647e8e566ad78b864282ec65c0b0b2237aa63084`; Avro uses Apache 1.12.0 and
fastavro 1.12.2; Parquet uses PyArrow 21.0.0 with the pinned parquet-format
commit. Those three systems retain explicit collection-identity residuals and
do not claim uniqueness enforcement. Chromium 148 checks accompany every binding.

| System | Authored cases | Projected | Ideal recoveries | Native cases | Native recoveries |
| --- | ---: | ---: | ---: | ---: | ---: |
| tablespec | 28 | 12 | 24 | 28 | 56 |
| postgresql | 20 | 17 | 34 | 1 | 2 |
| sqlserver | 26 | 19 | 38 | 3 | 6 |
| avro | 20 | 16 | 32 | 28 | 56 |
| parquet | 24 | 21 | 42 | 29 | 58 |

The matrix covers 118 authored cases, 85 emitted targets, 170 ideal recoveries
and 178 native recoveries through JSON/YAML. Twenty shared conflict checks reject
changed key IDs, reordered tuples under a stable ID, absent membership and
cross-record ownership. Renames, list reordering, primary omission, alternates
and per-key residuals are exercised by the authored matrices. Native observations
retain unknown author intent and never create authored keys.

Fresh native reimports feed ideal recovery for TableSpec, PostgreSQL, Avro and
Parquet. SQL Server retains explicit DDL text for authored recovery and uses
independent discovery, encoding and generated-table catalogs for classification;
it does not claim a general DDL parser. PostgreSQL classification uses its
independent discovery catalog and supplement; generated DDL has separate native
insertion and constraint-catalog controls. TableSpec generated schemas and Avro/
Parquet generated files also pass native-only classification and exact recovery.

SQL Server filtered/disabled unique indexes and incompatible string/binary
padding remain counterexamples. Avro boolean-null coercion, Parquet integer-input
truncation and float narrowing remain qualified losses. The non-UTF-8 Parquet
metadata case blocks interpretation and still recovers original bytes. Exact
source recovery does not imply that a native data rewrite preserves physical
encoding, or that a retained receipt authenticates its source.

## Validation

`bun scripts/core-ideals/key-conformance.ts` passes and writes the
[gate record](../../../../fixtures/validation/key-conformance.json).
`bun test ./tests/core-ideals/key-conformance.test.ts ./tests/core-ideals/key-evidence.test.ts`
passes three tests / 27 Bun assertions plus the internal conformance assertions.
The four core Key test files pass 20 tests / 950 assertions. Typechecking and the
306-schema / 53-package audits pass.

The [refresh record](../../../../fixtures/validation/key-gate-refresh-evidence.json)
records 22 successful build, native and browser commands. The evidence verifier
requires 21 binding proofs, checks their versions, command outcomes, browser
coverage, duplicate/null controls and source fingerprints, and rejects missing,
stale, unsafe, incompatible or falsified evidence. Earlier acceptance records
retain historical scope; this gate does not relabel them as fresh executions.

This closes the Key admission/delivery task, not the overall UMF implementation
goal. Relationship and other governed requirements remain separate work.
