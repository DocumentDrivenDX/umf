# Native relationship-shaped observations

These sources are native counterexamples, not authored UMF relationships.
`avro-value-and-id.avsc` has a nested record value beside a scalar
`customer_id`; `parquet-value-and-id.parquet` carries the analogous nested
group and scalar column. Neither carrier names a target Key, participation
bounds, lifecycle, inverse navigation or referential enforcement.

`avro-parquet-oracle.json` records avsc 5.7.9 and PyArrow 21.0.0 validation,
source hashes and JSON/YAML recovery. `avro-parquet-browser.json` records
Chromium 148 recovery through the UMF adapters. The empty Parquet file checks
schema metadata only; no row query or data-enforcement claim is made. These
observations do not count as the authored down-projections required for FR-3
admission or as five-system relationship delivery.
