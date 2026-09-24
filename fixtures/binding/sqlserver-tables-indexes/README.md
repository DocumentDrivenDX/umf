# SQL Server table and index generation

`case.json` contains the logical DDD model, separate physical binding and
explicit type/partition policy. The generator emits `generated.sql` from those
authored inputs without reading a database catalog. The pinned SQL Server
2022 oracle executes that DDL and records three rowstore indexes. Hash,
document-path expression and clustering choices remain source-linked residuals.

The prior table catalog is used only for an optional consistency and native
recovery check. `catalog.json` captures the database after executing the
generated DDL; it is never treated as authored index intent. `browser.json`
records the catalog-free Bun/Chromium parity check.
