# SQL Server catalog evidence

`catalog.sql` produces the bounded capture described by CONTRACT-031. Run it with
metadata visibility appropriate to the database being documented; missing permission
can hide objects. UMF does not connect to the server from its browser library.

`bun scripts/sqlserver-oracle.ts` starts a uniquely named, network-isolated Developer
edition container from a pinned SQL Server 2022 image digest. It creates two disposable
databases, applies the authored fixtures/sqlserver/schema.sql to both, compares
catalogs, verifies UMF JSON/YAML recovery, and exercises identity, computed-column and
rowversion behavior. The script removes only its own container in finally. On this
ARM host the x86 image runs under Docker's installed emulation.

The oracle writes fixtures/sqlserver/catalog.json, column-metadata.json and oracle.json.
Run `bun test tests/sqlserver` and `bun scripts/sqlserver-browser.ts` afterward.
Set UMF_CHROMIUM_PATH when the Playwright-managed browser is unavailable.

The query includes no indexes, foreign keys, checks, grants, triggers, history tables'
execution behavior or complete database DDL. Those remain required extension work;
the observed columns are not a complete reconstruction model. Candidate edits never
execute SQL or imply that the originating server has changed.
