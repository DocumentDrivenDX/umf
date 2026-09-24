# DDD-to-PostgreSQL table-stage fixture

`case.json` contains one authored Order/Customer/Product model with a
DDD-identified OrderProduct association entity and a separate PostgreSQL 17.4 `umf.binding`
document. The binding declares all eight index kinds. `generated.sql` is the
table-stage candidate; all indexes remain residuals for the later full
generator. Relationship declarations await the named-Key and relationship
core gate.

`oracle.json` records execution in an isolated PostgreSQL 17.4 server, the
actual tables, LIST/default partition, columns and checked JSONB object carrier,
plus source fingerprints and residuals. `browser.json` records Chromium parity
and strict refusal. The portable operation also imports and exports its DDL
through `umf.postgresql` parse/deparse/codec. No data query, resolver or
relationship enforcement is claimed.
