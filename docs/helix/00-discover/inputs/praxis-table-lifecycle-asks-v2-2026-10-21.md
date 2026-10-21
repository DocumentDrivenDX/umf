# Requirements from Praxis for UMF `umf.tables` (revision 2, against UMF 0.5.3 and Weft 0.4.49)

Date 2026-10-21. Supersedes the 2026-10-20 draft, which was written against `umf-v0.5.0`.
Audience: the UMF and Weft maintainers. Source: Praxis (Skadden/praxis-harness, pull request 178).

## 1. Where we are

Since 2026-10-18 upstream closed most of what we first asked for. We checked by running the wheels in
a scratch environment (sha256 equal to the release digests):

- LICENSE files present (UMF SDK 0.5.3, Weft 0.4.49); `umf_access` needs `pydantic>=2.13,<3`;
- the generated client has synchronous methods; the generator runs in Python (`umf_codegen`);
- `umf.tables` (0.1.0) emits `CREATE TABLE`, `ENABLE/FORCE ROW LEVEL SECURITY`, `REVOKE`,
  `CREATE POLICY` per person/batch role and command, and `GRANT`s; an add-a-field migration compiles.

That is the shape we wanted. Praxis therefore wants to adopt `umf.tables` and delete about 3,000
lines of its own emitter, planner and policy code. It cannot yet, for the reasons below. Each gap is
a requirement; the list is ordered by how much of our code each one blocks.

What Praxis keeps either way (platform specific, not asked of you): a plugin's own Postgres schema and
roles on Lakebase, a database role per person, which person's connection runs a request, audit.

## 2. Gaps in `umf.tables` that block adoption

Evidence: `spec/extensions/tables/schema.json` and `migration.schema.json` at `umf-v0.5.3`, and
`compile_table_deployment` / `compile_table_migration` run on UMF's lifecycle fixture.

### U1 (P1). Migration step kinds beyond "transactional DDL"

Today every step is `transaction: required` and the kinds are table, foreignKey, index, policy, grant.
We need: (a) a **non-transactional step** (concurrent index build) that resumes at the failed step;
(b) a **validate step** (`ADD CONSTRAINT ... NOT VALID` then `VALIDATE CONSTRAINT`, so adding a CHECK
or foreign key to a table with rows does not lock it); (c) an **author data step** (seed rows,
backfill a new NOT NULL column) that is explicit, reviewed, and cannot touch a scoped table without
saying so. Acceptance: a migration that adds a NOT NULL column with a backfill, a concurrent index,
and a CHECK with validation compiles to ordered steps carrying their transaction mode.

### U2 (P1). Changes to existing objects, with an explicit review marker

Today existing columns, constraints, policies and indexes cannot change ("append only"). We need
type change, NOT NULL tightening, column/constraint/index drop and rename, primary-key change, and
policy change, each **refused unless the author marks it reviewed** (a named marker in the migration),
with the destructive ones listed by name in the refusal. Acceptance: dropping a column is refused with
`destructive_change_unreviewed` and compiles when the marker is present.

### U3 (P1). A policy vocabulary that can say what we mean

Today a policy must name all four commands for both roles, and rule kinds are
allow/deny/owner/memberOf/memberOfRole/any/all/via. We need: a **per-role command subset** (the batch
role selects and inserts only; the person role has all four), and a rule for "the person is in a named
group" and an "open" read for a table everyone may read (a reference table). Our current
`row_scope` is the reference for what plugins author:

```yaml
row_scope:
  owner_column: owner
  commands: [select, insert, update, delete]
  via:
  - {table: project_member, person_column: member, key_column: project_key}
  batch: [select, insert]
```

Acceptance: this block maps to an `umf.tables` policy with owner + via and a batch role limited to two
commands, and the emitted `CREATE POLICY` statements keep `FORCE` on.

### U4 (P2). Comments and a simple CHECK form

`COMMENT ON TABLE/COLUMN` from the document's descriptions (we ship documented tables). Checks are an
expression tree today; please add the two common forms as first-class (value in an enumerated set,
number in a range) that emit plain `CHECK` constraints.

### U5 (P2). The apply side: ledger and digest checks as a library

You assign the ledger to the host; we want a reference **applier library** against a small host-supplied
interface (read applied rows, record a step, run a statement). Rules we enforce today and would like
shared: forward-only (no downgrade); each applied migration's file digest is recorded and an edited
applied file is refused; the chain of migrations plus snapshots is checked against the current
document (the chain's result must equal the document); the plan says `nativeQualified: false` until the
host approves, and the approval is recorded.

### U6 (P2). An optional containment profile

Praxis confines a plugin to its own schema: a migration may not name another schema, create roles or
schemas, change grants outside its own tables, change session settings, or use stored code (functions,
triggers, procedures). We check hand-edited migration SQL against that today. If you would rather own
this as an optional check profile for "untrusted author SQL", we can contribute it
(`packages/praxis-plugins-sdk/src/praxis_plugins_sdk/umf/containment.py`, `migration_check.py`).

## 3. Packaging and toolchain

### U7 (P2). A pure-Python path for the host

`umf_codegen` needs `mini-racer==0.14.1` (embedded V8). Praxis bakes a fixed dependency set into a
Databricks App; a V8 wheel in the host image is heavy. Please offer a pure-Python table compiler, or
tell us the wheels and platforms for mini-racer that you test.

### U8 (P2). Publish to a package index

GitHub release assets only today; we pin URLs and hashes. A PyPI release (or a documented mirror
procedure) for `umf-core`, `umf-access`, `umf-codegen`, `weft-sql` would let us use our normal
locking and vendoring.

### U9 (P3). Hohfeld on UMF 0.10

Hohfeld 0.4.5 reads UMF core 0.7.0 only; one ontology document cannot serve Hohfeld and Weft. We need
a Hohfeld release on 0.10 and a date. Until then plugin ontologies stay on 0.7.0.

## 4. What Praxis will do once U1 to U3 land

1. Make a UMF 0.10 record module the authoring format for plugin tables (our 11 example tables become
   records; the SDK reads them with `umf-core`).
2. Delete the SDK's reader, DDL emitter, planner and policy generator; keep containment (or hand U6
   upstream) and the host's applier until U5 exists.
3. Replace named SQL statements with the generated typed client over `WeftTableBinding` on a
   per-person connection.

Until then the Praxis implementation is isolated in one self-contained, stdlib-only package
(`packages/praxis-plugins-sdk/src/praxis_plugins_sdk/umf/`) with an `UPSTREAM.md` describing its
interface, invariants and tests. It is the behavior to reproduce, or a starting point if you prefer to
lift it.

## 5. Not verified

We ran `umf.tables` only on UMF's own fixture, not on our tables (it cannot read our documents), and
we have not run the generated client against a Praxis workload. We do not know your timeline for the
`umf.tables` "candidate" label to go.
