# DDD-to-PostgreSQL table and index stage

This stage uses `../ddd-postgresql-tables/case.json`: one logical
Order/Customer/Product/OrderProduct model and a separately versioned
PostgreSQL 17.4 binding. `generated.sql` adds verified index DDL to the
table-stage candidate. `oracle.json` records pinned PostgreSQL 17.4 execution,
while `browser.json` records Chromium parity. Unsupported access-method,
partitioned-uniqueness and clustering choices remain source-qualified
residuals; strict mode blocks those losses.

No relationship DDL is emitted yet. The full CONTRACT-043 generator must add
named-Key and stable-ID relationship layouts after the core and binding gates.
