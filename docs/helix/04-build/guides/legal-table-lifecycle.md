# Legal domain table lifecycle candidate

The generated [fixture](../../../../fixtures/table-lifecycle/legal/initial.json)
uses the existing fabricated legal pack: clients, timekeepers, matters and
matter teams. [Projection decisions](../../../../fixtures/table-lifecycle/legal/projection.json)
retain source paths, original metadata and explicit capacity/security choices.
This is a development scenario, not legal advice or a complete ethical-wall policy.
Regenerate/check with `bun scripts/generate-legal-lifecycle.ts [--check]`.

Matter access requires a visible assigned team row. Ordinary people can read only
their own memberships and cannot add themselves to a matter. Billing reads require
the trusted `billing_admin` alias. Client metadata is explicitly open for reads;
batch may read and insert matters but cannot update/delete them. All tables retain
FORCE RLS. Person identity, role provisioning and schema creation remain host-owned.

The second schema adds a required review state, a positive-ID CHECK and the
original client FK. Its exact scoped backfill is an original zero-parameter
bounded typed UPDATE. Weft compiles that UPDATE; UMF generates only the surrounding
DDL. The column starts nullable without its server default, then the reviewed
backfill runs before DEFAULT/NOT NULL and native correspondence. The literal
default keeps immutable historical seed rows usable for a fresh installation of
the final source. Any bound/constraint failure rolls back data, DDL, policy and
ledger together. Seed execution is explicit; importing metadata executes nothing.

The third schema appends two concurrent indexes. This is deliberately an
index-only migration: mixed backfill/concurrent/NOT VALID plans are revision2
next-release work. Duplicate synthetic matter titles initially make its unique
index fail. The runner retains the successful prefix, refuses automatic repair,
and accepts explicit repair only after checking the original failed index shape.
The immutable ledger advances only after every phase and the final source verify.

## Python administration

Install the qualified `umf-access`, `umf-codegen` and Weft wheels plus the selected
Psycopg3 driver in the administrative environment. The compiler/verifier uses
mini-racer0.14.1; this is not a pure-Python execution environment. Generated plugin
code remains stdlib-only. All source/profile/wheel versions require their own
installed evidence; a wheel version alone does not describe a complete cohort.

`umf-table new --request request.json --output migration.json` takes the existing
compiler request `{id,predecessor,previous,next,options?}`. `previous` and `next`
are source-recompiled deployment bundles; use `compile_table_deployment` from
`umf_codegen` to build them with the trusted host's schema/role configuration.
`options` uses `umf.table-migration-options/0.1`, with explicit `backfills` and
`concurrentIndexes` arrays as shown in the generated fixture files. New refuses
to overwrite an existing file. `python -m umf_access.lifecycle.cli` is equivalent.

`umf-table check --plan 001.json --plan 002.json --current-bundle current.json`
verifies ordered predecessors and the final source snapshot. Add `--manifest`
with a trusted JSON mapping of each filename to its SHA256 to verify original file
bytes too. A rehashed plan is not authority: verification recompiles complete
source and refuses substituted SQL. An edited file with an unchanged applied
plan also refuses on replay because the CLI records its original byte digest.
The library's optional `file_digest` is supplied by the trusted file-reading host;
older entries without byte digests retain canonical-plan verification only.

`umf-table apply --plan migration.json --dsn 'service=plugin_install' --approved-digest DIGEST --expected-head PRIOR_ENTRY_DIGEST --person-role ALICE --person-role BOB`
opens only that explicitly supplied session. Use `initial` for the initial expected
head. The host must already have provisioned the private schema, separate NOLOGIN
install owner and audiences. Approval must match the complete plan digest. Normal
library application requires a caller-owned transaction; the CLI commits its own
explicit transaction and never reports success before it commits.

Concurrent plans use a separate idle-autocommit runner. Its session lock spans
all phases. It durably revokes person/batch access to the fixed lifecycle metadata
head before the first index build; lifecycle data calls remain blocked after a
failure or an in-progress return. Verification grants exist only in a rolled-back
savepoint. Final head access and ledger publication commit together. Resume the
same approved plan and expected predecessor. `--repair-invalid` explicitly allows
removal/rebuild of an exact source-selected failed index; it cannot authorize an
unrelated drop. Direct SQL outside lifecycle clients remains the host's custody.
The fixed administrative metadata view is separate from author-supplied stored SQL.

Descriptions generate deployment bundle0.2 comments. Legacy bundle0.1 recovery
retains its original comment-free generation, including description-bearing old
sources; a new migration can explicitly install their comments. Unsupported
existing-object/destructive transformations still refuse, even if a caller
approves a digest. See [revision2 sequencing](../../01-frame/praxis-lifecycle-roadmap.md#next-release-requirements--praxis-revision2-2026-10-21).

## Validation

`tests/lifecycle/migration.test.ts` checks source/schema/SQL custody and refusals.
`tests/lifecycle/test_cli.py` checks offline CLI and history semantics.
`tests/lifecycle/native.py --dsn SERVICE_DSN --report REPORT` provisions disposable
synthetic schemas and roles on PostgreSQL18 and cleans them up. It verifies actual
membership isolation, generated sync page/action/replay, file/history checks,
backfill rollback, constraints, index recovery/fence and comment drift. Run only
on an explicitly selected development database with authority to create its
isolated roles/schemas. It establishes no private Praxis or Lakebase acceptance.
