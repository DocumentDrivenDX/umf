# SQL Server physical table binding fixture

`case.json` supplies one authored DDD model, a separate `umf.binding` 0.1.0
document and an explicit SQL Server 2022 type/partition policy. `generated.sql`
is the report-mode candidate. `catalog.json` retains the exact native capture.
`oracle.json` records execution in an isolated SQL Server 2022 image,
catalog-v2 structural adapter recovery plus exact retained source text, table/column and
partition observations, residuals and source fingerprints. `browser.json`
records Chromium parity and strict-mode refusal.

The generated `nvarchar(max)` column is checked with `ISJSON(..., OBJECT)`, but
the declared embedded path and value type are not enforced. The report also
retains DDD identity and SQL scalar-domain/NULL differences. Relationship and
index DDL are separate slices; this corpus does not claim their completion.
The captured SQL Server JSON escapes a slash in its query name. The adapter
normalizes that escape on export, so `catalog.json` and the optional projection
receipt retain the exact native bytes; adapter export alone is structurally
equal JSON, not byte-equal text.
