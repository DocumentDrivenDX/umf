# DDD-to-PostgreSQL table-stage fixture

`case.json` contains one authored Order/Customer/Product model with a
DDD-identified OrderProduct association entity and a separate PostgreSQL 17.4
`umf.binding` document. The binding declares all eight index kinds.
The authored DDD entity payloads match the core-backed GraphQL fixture at
`../ddd-graphql-core-fields/case.json`; `Product.tags` is an ordered DDD-many
value bound to the PostgreSQL `products.payload` JSONB path, with its path and
item semantics reported as residuals.
`generated.sql` is the table-stage candidate; all indexes are residuals at
that stage. The subsequent table-plus-index candidate, browser result and
PostgreSQL oracle are under `../ddd-postgresql-tables-indexes/`. Four index
kinds have verified DDL there, and the others remain explicit residuals.
Relationship declarations await the named-Key and relationship core gate.

`oracle.json` records execution in an isolated PostgreSQL 17.4 server, the
actual tables, LIST/default partition, columns and checked JSONB object carrier,
plus source fingerprints and residuals. `browser.json` records Chromium parity
and strict refusal. The portable operation also imports and exports its DDL
through `umf.postgresql` parse/deparse/codec. No data query, resolver or
relationship enforcement is claimed.
