# Facet ideal admission and five-system delivery

Facets now pass the separate ideal-admission and qualified five-system delivery gate. Native equivalence remains unclaimed; native payloads and unknown extension content remain attached. Key is the next ordered concept.

The gate composes authored projection with native classification for TableSpec,
PostgreSQL, SQL Server, Avro and Parquet. Strict mode blocks loss; report mode
retains explicit residuals. Recovery uses retained provenance and does not imply
that a target alone can reconstruct author intent.

| System | Authored cases | Projected | Ideal recoveries | Native recoveries | Useful exact nonempty mappings |
| --- | ---: | ---: | ---: | ---: | ---: |
| tablespec | 540 | 331 | 662 | 1236 | 104 |
| postgresql | 232 | 145 | 290 | 494 | 48 |
| sqlserver | 238 | 145 | 290 | 474 | 44 |
| avro | 576 | 397 | 794 | 1102 | 40 |
| parquet | 216 | 177 | 354 | 574 | 100 |

The matrix covers 1802 authored cases, 1195
projected targets, 2390 ideal recoveries and
3880 native recoveries through JSON/YAML receipts.
Useful nonempty exact mappings exist in 5 systems;
facetless controls are excluded from that admission count. Other emitted targets
retain residuals, including additional native constraints and conversion behavior.

`bun test tests/core-ideals/facets-conformance.test.ts` passed (1 test,
42 assertions). `bun scripts/core-ideals/facets-conformance.ts` independently
completed the gate. Typechecking and the 277-schema / 47-package audit passed.
See [gate output](../../../../fixtures/validation/facets-conformance.json),
[test log](../../../../fixtures/validation/facets-conformance-tests.log) and
[command log](../../../../fixtures/validation/facets-conformance-command.log).

The gate verifies retained native/browser fingerprints; this is evidence
consistency checking, not a fresh native-engine execution. The binding acceptance
records identify the native runs: TableSpec commit
647e8e566ad78b864282ec65c0b0b2237aa63084, PostgreSQL 17.4, SQL Server
16.0.4295.3, Apache Avro 1.12.0 / fastavro 1.12.2 and PyArrow 21.0.0.
Chromium evidence is version 148. The additional Avro exact-input workflow passed
18 cases (9 report projections, 9 strict blocks), with no external requests and
both recovery directions. Its emitted targets match the independently tested
native corpus. Binary64 1.0000000000000002 narrowing to binary32 1.0 remains an
explicit loss in every system's exact-input cases.

## Limits and retained failures

SQL composition uses independently captured engine catalogs matched to emitted
DDL; it does not claim arbitrary live discovery or DDL recovery. PostgreSQL
serialization uses complete selected-relation captures and their CHECK supplement.
The full aggregate catalog is separately recovered in memory; its oversized
receipt explicitly refuses serialization under existing resource limits
(2 JSON/YAML refusals).
SQL Server composition similarly uses complete selected-table views.

The initial Avro gate run failed because its baseline matrix omitted exact-input
float cases. The retained [failure log](../../../../fixtures/validation/facets-conformance-missing-avro-exact-input.log)
records that gap; the expanded matrix and separate Chromium check address it.
No production semantics or resource limits were weakened to make the gate pass.
Qualified scalar profiles do not establish general value conversion, encoding
identity, default execution, native replacement or composition of all earlier
native availability/container operations.

## Documentation revalidation

The standalone gate output captures the acceptance fingerprints before this status
publication. The [documentation revalidation ledger](../../../../fixtures/validation/facets-documentation-revalidation.json) records only these subsequent
document changes and dependent acceptance fingerprints, preserving previous
hashes and runtime results. It does not report new native executions. The final
[facet gate acceptance record](../../../../fixtures/validation/facets-gate-acceptance-evidence.json) links that historical execution with the current
documentation and evidence-consistency checks.
