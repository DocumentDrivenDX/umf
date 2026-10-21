# Requirements from Praxis for UMF and Weft: tables, migrations, row-level security, a sync client

Status: proposal from the Praxis Plugins work (Skadden/praxis-harness, pull request 178). Date 2026-10-20.
Audience: the UMF and Weft maintainers. Praxis is a consumer of UMF 0.10 (`umf_access`, `umf-core`) and
Weft (`weft-sql`) and wants to stop carrying code that belongs in them.

## 1. Why this document exists

Praxis lets Skadden staff write plugins that own tables. Today Praxis carries about 4,500 lines of its
own table machinery (a document reader, a DDL emitter, forward-only migrations and their checks,
row-level-security policy generation, a paged read layer) because UMF and Weft emit typed reads and
actions only. We confirmed (UMF `umf-v0.5.0`, Weft `v0.4.44`, 2026-10-18):

- the generator (`generatePythonClient`) and `umf_access` produce typed async reads and actions; they
  emit no DDL, migrations, policies or grants (typed-persistence-design.md assigns "migrations" to the host);
- Weft compiles reads and actions to SQL and does not execute DDL; it refuses non-empty extension content;
- `umf_access` pins `pydantic==2.14.1` exactly and is async only.

We want to remove our copies and consume yours. This document says what we need from UMF/Weft for that,
in priority order, with acceptance criteria. Items 1 to 4 are the ones that let us delete code.

## 2. What Praxis keeps (not asked of you)

Praxis-specific, stays in the host: giving a plugin its own Postgres schema and roles on Lakebase
(containment), provisioning a Postgres role per person, which person's connection runs a request,
audit, approval of plugins. We only need UMF/Weft to give us correct SQL text and checks; we run it.

## 3. Requirements

Priority: P1 blocks deleting our code, P2 removes friction, P3 is welcome.

### R1 (P1). A table vocabulary in UMF core 0.10 documents

A plugin's tables are authored as UMF 0.10 record modules, not a Praxis-specific format.
Needed content per table: name and description; typed columns (VARCHAR with length, TEXT, INTEGER,
DATE, TIMESTAMP, BOOLEAN, UUID; nullable; default expression); primary key; indexes (named, column
list, unique); foreign keys (outgoing relationship with source and target columns); check constraints
(enumerated set, numeric range); and a per-table description for documentation.

Acceptance: our eleven example tables (`plugins/example/src/praxis_example/tables/*.yaml` in the
Praxis repository) round-trip through the UMF document model with no extension content, and the typed
client generated from them matches the table shapes.

### R2 (P1). DDL generation from that document

An emitter (Weft or a UMF host tool) that turns a table document into PostgreSQL 18 DDL (also
Lakebase): `CREATE TABLE` with constraints and defaults, `CREATE INDEX` (including `UNIQUE` and
concurrent builds where a migration step asks), foreign keys, comments. Output is deterministic text.
Identifiers are quoted and bounded (63 bytes); names longer than that are an error, not truncated.
Target is PostgreSQL 18 only (no support for older versions needed).

Acceptance: for each example table the emitted DDL applies to PostgreSQL 18 and `umf_access` reads and
writes through it; the output is byte-stable across runs.

### R3 (P1). Forward-only migrations with checks

Given a previous and a current table document (or a stored snapshot of the previous one), generate the
next migration: new tables, added columns (with a backfill step when the column is non-null and the
table may have rows), added indexes, checks and foreign keys; and REFUSE destructive or unsafe changes
unless the author reviews them explicitly (dropped column or table, type narrowing, widened row
scope). Rules we enforce today and want upstream:

- migrations are forward-only (no downgrade);
- each applied migration's file digest is recorded, an edited applied file is refused;
- a snapshot of the document is stored per migration; a migration chain is checked against the current
  document (the chain's result must equal the document);
- a data step (INSERT/UPDATE of seed or backfill rows) is explicit, reviewed, and cannot touch a
  scoped table without saying so;
- a step may be marked non-transactional (concurrent index build) and resumes at the failed step;
- no stored code in the database: no functions, triggers, procedures, views with logic.

Acceptance: `new`, `check` and `apply` entry points (library and CLI) with these refusals as named
reasons; the example's four migrations regenerate identically from its documents.

### R4 (P1). Row-level security policy generation and a first-class policy vocabulary

Weft refuses extension content, so Praxis cannot carry policy beside a document. Please give UMF a
first-class, small policy vocabulary (or admit a declared extension that Weft passes through to a
policy emitter). What we need to express, per table:

```yaml
policy:                       # our row_scope today
  owner_column: owner         # the person's database role name; own rows
  commands: [select, insert, update, delete]
  via:                        # also visible/changeable to people listed in another table
  - table: project_member
    person_column: member     # that table's person column
    key_column: project_key   # joins to this table's column of the same meaning
  batch: [select, insert]     # a separate grant for a run with no person (a service role)
```

And an emitter that produces, deterministically: `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` and
`FORCE ROW LEVEL SECURITY`, one `CREATE POLICY` per command for the person role (own rows OR via-rows,
using `current_user` / `pg_has_role`), a separate policy for the batch role limited to the listed
commands, and the matching `GRANT`s. Constraints: no stored code (policies are SQL expressions only),
`FORCE` is always on (an owner role must not bypass), a table with no policy is explicitly reviewed as
unscoped.

Acceptance: from the example's `task` table the emitter yields policies under which two database
roles see only their own tasks (and a followed project's tasks), and the batch role sees all rows but
can only select and insert. A migration check refuses a migration file that omits the RLS its snapshot
calls for.

### R5 (P1). A synchronous client (or a documented sync wrapper)

Praxis hosts run plugin work in worker processes and scheduled jobs, in sync and async contexts, over
psycopg 3. `umf_access` is async only. Needed: a sync entry point with the same typed surface
(`Model.objects...get/first/page/all`, `Actions`), or a documented wrapper that does not start an event
loop per call. Acceptance: a plain function can read a page and call an action with no `asyncio`.

### R6 (P1). A connection per call, not a global pool

The person is the database role: each request runs on a connection that belongs to that person (a pool
per person, or `SET ROLE`), so row-level security decides what they see. The Weft binding must accept
a connection (or a factory called per request) and optional session parameters, and must not own a
global pool. Acceptance: two requests as two roles through the same `WeftTableBinding` see different
rows with no code in the plugin that filters.

### R7 (P2). Paging and named statements that match what plugins need

Keyset paging with a stable order and an opaque cursor (already in `page(size, after)`: please confirm
it is a keyset, not offset), a cap on page size and row count, idempotent upsert (`ON CONFLICT`) as an
action option, and counts of affected rows in the action receipt. Parameters bound only, never
interpolated; a NULL parameter is a typed NULL, not an empty string.

### R8 (P2). Loosen the dependency pins

`umf_access` pins `pydantic==2.14.1` and `typing-extensions==4.16.0`. Praxis bakes a fixed dependency
set for plugins and locks pydantic 2.13.5 today. Please publish with ranges (for example
`pydantic>=2.13,<3`), or tell us the supported matrix.

### R9 (P2). Distribution

Publish `umf-core`, `umf_access` and `weft-sql` to a package index (PyPI, or a mirror we can use), not
only as GitHub release assets, with checksums. Add a LICENSE file to the UMF repository (we are told
MIT or Apache-2.0: the repository has none at `umf-v0.5.0`) and the same classifier in each wheel's
metadata. Until then we pin the GitHub asset URLs with sha256.

### R10 (P2). Generator toolchain and a Python entry point

`generatePythonClient` needs Bun and `umf-sdk.tgz`. Plugin authors write Python and ship wheels with
only the standard library plus what the platform bakes in, and generated code is not committed. Needed:
a pinned way to run the generator at build time (and its `check` mode in CI to fail on drift), and a
Python entry point so an author does not need Bun on a laptop.

### R11 (P3). Hohfeld alignment

Hohfeld 0.4.5 reads UMF core 0.7.0 only; Weft accepts 0.8 and 0.10. One ontology document cannot serve
both today. Tell us the plan and the date for Hohfeld on UMF 0.10, and what to use meanwhile.

## 4. Non-goals

Execution of DDL against a live database by UMF/Weft; platform-specific role provisioning; migrating
data; support for PostgreSQL older than 18; a UI.

## 5. Compatibility and rollout we propose

1. UMF/Weft ship R1 to R4 as a library with a stable interface (documented types in, SQL text and check
   results out) and tests; Praxis points its plugin SDK at it and deletes its copies (the Praxis code
   is being reduced to one self-contained module with an `UPSTREAM.md` so it can be lifted into your
   repositories as the starting point, if you prefer).
2. R5 and R6 land in `umf_access` so the host stops needing its own table port.
3. R8 to R10 are packaging; R11 is a coordination item with the Hohfeld owner.

## 6. What we have not verified

We have read the release tags and assets (`umf-v0.5.0`, Weft `v0.4.44`) and run none of the generated
code against a Praxis workload. Whether UMF intends to own DDL/policy emission, and whether
`page(size, after)` is a keyset, are questions for you; we did not find answers in the repositories.

## 7. Contact and test material

Praxis repository (Skadden/praxis-harness, pull request 178): `plugins/example` is the worked example
with eleven tables, four migrations, a row-scoped `task` table, and tests; the SDK's current table
machinery is `packages/praxis-plugins-sdk/src/praxis_plugins_sdk/umf/` (the behavior to reproduce).
