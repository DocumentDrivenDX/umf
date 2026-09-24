# Optional PostgreSQL parser runtime

`bun run build:postgresql` bundles @libpg-query/parser 17.6.10 and copies its WASM into
`dist/postgresql/`. The engine reports PostgreSQL 17.4 (`170004`). Serve runtime.js and
make libpg-query.wasm available relative to the hosting page, as required by the upstream
loader. Import the module explicitly and pass its `backend` to UMF's PostgreSQL APIs.
The default core bundle does not include the runtime. No SQL is executed.

`bun scripts/postgresql-oracle.ts` writes inputs and artifact hashes;
`.venv/bin/python scripts/postgresql-oracle.py` compares them using pinned pglast 7.18
(PostgreSQL 17.7). These minor versions differ and evidence is scoped accordingly.
The Protobuf export guard prevents unknown AST fields from disappearing during encoding.
Original SQL is retained separately from regenerated SQL and candidate AST edits.
