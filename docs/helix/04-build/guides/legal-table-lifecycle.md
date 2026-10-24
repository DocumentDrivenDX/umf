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

## Bootstrap and evolution profiles

Use the legacy `umf.table-migration/0.1` compiler profile for bootstrap and its
qualified additive-table path. Its historical plans retain their original exact
verification behavior. Do not rewrite stored plans when adopting the newer
evolution profile.

Existing-table evolution uses migration plan `umf.table-migration/0.2` and options
`umf.table-migration-options/0.2`. It requires an installed predecessor and an
unchanged table inventory. Initial publication, table additions/removals, and a
single plan that drops and appends columns are refused. Bootstrap first, then
evolve a stable existing-table inventory. This profile is a bounded PostgreSQL
subset, not a general schema migration engine.

Options carry explicit `backfills`, `concurrentIndexes`, `reviewedChanges`, and
`validations` arrays, including empty arrays. A selected backfill is a source-bound
parameter-free UPDATE limited to the new column while it is NULL. It is used for
new columns; existing NULL values cannot be filled by this profile. `validations`
selects newly added CHECK or foreign-key constraints for separate NOT VALID and
VALIDATE phases. New concurrent indexes can share a plan with backfills and other
phases. Seeds have their own ordered data phase and receipt; the finalizer does not
replay a completed seed phase.

The public TypeScript API `discoverTableMigrationChanges(previous, next)` accepts
verified deployment bundles; callers must verify both inputs with
`verifyTableDeployment`. The Python
`umf_codegen.discover_table_migration_changes(previous_bundle, next_bundle)` wrapper
recompiles and verifies both bundles before returning exact source-bound review
candidates. Candidates include `oldValue` and `newValue` for human review.
Copy only `id`, `kind`, `path`, `oldDigest`, and `newDigest` into an option's
`reviewedChanges`; never copy the explanatory values. Type changes also require an
explicit `conversion: "pg-cast-v1"` marker. The resulting plan digest binds its
complete source and approved markers. A marker cannot make an unsupported
operation executable.

The reviewed subset includes explicit column drop/rename, nullability tightening
and relaxation, policy changes, and replacement of supported CHECK, FK, index and
primary-key declarations. Drops disclose immediate irreversible physical value
purge; metadata history is not a data backup. The compiler checks typed dependent
commands, policies, inbound references, keys and indexes and refuses unresolved or
unschedulable dependencies. Column addition/drop compounds and other unsupported
combinations must be split into independently valid migrations.

Type conversion is limited to safe, capacity-checked PostgreSQL widening pairs:
`smallint` to `integer`, `integer` to `bigint`, and numeric widening that does not
reduce scale or integral capacity. The exact accepted source and target
representations are checked by the compiler, and PostgreSQL validates existing
values and target constraints. Narrowing, cross-family casts, rounding,
arbitrary expressions, unrelated default/generated/immutable/collation changes,
and hidden logical facet changes refuse even with a fresh review marker. Existing
column NULL backfill is outside this 0.2 profile. Online chunked rewrite,
retained-value retirement windows and automatic data rollback after purge remain
unsupported.

## Existing-column fill before requiredness

The successor options/plan 0.3 and execution profile 0.2 admit one existing
optional Field becoming required with a reviewed, bounded NULL-only fill. Select
the exact next-source, parameter-free, single-assignment typed UPDATE in
`backfills`, including `scopedRows: true`, and the exact tightening review marker.
The native fixture uses `column: {module: 'demo', element: 'summary'}` and
`operation: 'fill_summary'`; see the
[complete source-bound fixture](../../../../tests/lifecycle/g01-native-fixture.ts).

Identity, carrier/type, facets and future default must remain unchanged. The fill
uses an admitted non-null literal or qualified transaction clock, preserves
present values, and changes historical NULL cells only. A future default does
not fill history. The required phase holds native locks and commits fill,
NOT NULL and the phase receipt together. Constraint or bound failure rolls the
pair back; direct writers cannot cross an activation gap. Exact recovery observes
a committed pair without repeating its fill or clock.

This is a standalone maintenance operation: additional column/table/index,
validation, seed or other effects refuse before a runnable plan is returned.
Arbitrary per-row transforms and online reconciliation remain unsupported.
The [independent installed signoff](../evidence/schema-migration-design-review/g01-review.json)
qualifies the exact PostgreSQL/Python/package cohort and thirteen-case subset.
Durable approval and the closed installation-reference 0.3 metadata profile are
required. They do not authorize downgrading a persistent-approval installation
to an older profile for otherwise unsupported table-inventory changes.

## Python administration

Install the `umf-access`, `umf-codegen` and Weft wheels plus the selected Psycopg3
driver in the administrative environment. The compiler/verifier uses
mini-racer0.14.1; generated plugin code remains stdlib-only. A wheel version alone
does not qualify a source/wheel/runtime cohort.

`umf-table new --request request.json --output migration.json` compiles the
complete `{id,predecessor,previous,next,options?}` request. `previous` and `next`
are source-recompiled deployment bundles; `compile_table_deployment` creates them
with the trusted host's schema and role configuration. Use the public Python
discovery function above to author review markers, then compile the request.
`umf-table check --plan ... --current-bundle current.json` verifies ordered
predecessors and the final source. A trusted file manifest can bind original file
bytes; a rehashed plan alone does not provide host authority.

`umf-table apply` preserves the recorded v0.1/v0.2 runner routes. For v0.3
plans, first record a durable host approval, then apply using that exact receipt:

```sh
umf-table approve --plan migration.json --dsn "$ADMIN_DSN" \
  --expected-head "$PRIOR_ENTRY_DIGEST" --installation-id legal-prod-east \
  --target-profile local-postgresql18 --qualification-profile pg18-maintenance-v1 \
  --evidence-digest "$QUALIFICATION_EVIDENCE_SHA256" --decision approved

umf-table apply --plan migration.json --dsn "$ADMIN_DSN" \
  --expected-head "$PRIOR_ENTRY_DIGEST" --approval-id "$HOST_RECEIPT_ID" \
  --installation-id legal-prod-east --target-profile local-postgresql18 \
  --qualification-profile pg18-maintenance-v1 \
  --evidence-digest "$QUALIFICATION_EVIDENCE_SHA256"
```

The approval command connects with the trusted administrative credential and
sets the configured installation owner role. PostgreSQL records the authenticated
`session_user` and decision time; the host's stable `installation-id`, target
profile, original plan-file SHA-256, plan/source digest, predecessor head and
ordered phase hashes are included in the binding. The selected qualification
profile and its evidence digest are also bound. Treat the receipt ID as a
host-issued reference, not source metadata. `--approved-digest` remains only the
legacy plan-digest gate; it cannot create or substitute for a v0.3 receipt, and
`nativeQualified: false` stays false.

The apply command recomputes the binding from the current database identity,
exact plan bytes, predecessor, profile and phase list, then requires the stored
receipt ID to match that binding before effects. A missing receipt reports
`approval-receipt-required`. The adapter owns the idle-autocommit connection,
locks, whole-phase transactions, durable progress, head fence and publication.
It reports success only after durable finalization and observes uncertain commits
before continuing. Import, check and compile commands perform no database effects.

For phased migration profiles, admission durably records the initial READY
receipt and fences ordinary clients before running the first required phase.
A known phase failure rolls back that phase's data, DDL and completion receipt;
the initial READY receipt and fence remain. Keep the exact plan bytes, approval,
predecessor and installation bindings for authenticated recovery. An absent
progress relation before admission, a READY receipt after a failed phase and
absence after successful final publication are distinct states. Final publication
advances history and removes the transient progress relation; a phase error alone
does not authorize reopening ordinary writes.

UMF owns source comparison, review candidates, plan binding and refusal. Weft owns
lowering declared typed data operations such as the scoped backfill. The native
host owns credentials, connection selection, durable locking/progress/history,
approval, PostgreSQL catalog/data checks, recovery and publication. PostgreSQL
evidence does not qualify managed Praxis/Lakebase or another storage backend.

The fixed administrative metadata view is separate from author-supplied stored
SQL. Direct SQL outside the lifecycle clients remains under host custody.

## Canonical domain authoring

Use the existing core forms for documented table domains; no table-specific
shorthand is needed. Put human-readable text in the record or Field `description`.
Deployment emits escaped `COMMENT ON TABLE` and `COMMENT ON COLUMN` statements,
and catalog verification compares the resulting comments with the authored
source. Removing a previously present description in a successor clears the
native comment.

For a finite string domain, use a nonempty `allowedValues` array of typed scalar
literals on the Field. For a bounded numeric value, use typed `facets.range`
`min`/`max` literals and the explicit `minInclusive`/`maxInclusive` flags where
the default inclusive bounds are not intended. These declarations become
deterministic PostgreSQL `CHECK` constraints and the same generated Python model
validates the corresponding enum/range. A nullable Field remains nullable:
ordinary SQL `NULL` satisfies these membership and range checks, while present
values outside the declared set or interval fail. Keep type precision and scale
consistent with the native numeric declaration. Unsupported or unknown domain
facets should produce a located refusal rather than be silently ignored.

The synthetic `legalDomainAuthoringSource()` fixture layers these declarations
on a clone of the legal source. It deliberately exercises quoted text, a
backslash and a newline in comments, a nullable enum, and an exclusive numeric
upper bound without changing bootstrap or history fixtures.

## Validation and remaining limits

The migration implementation plan tracks residuals MIG-G01 through MIG-G11 in
[`schema-migration-plan.md`](../schema-migration-plan.md). Those entries include
existing-column NULL fills outside the selected 0.3 pair, arbitrary row transforms, general defaults, narrowing,
retirement/restore, online chunked rewrites, cross-document work, non-PostgreSQL
backends, managed-consumer qualification, v0.2 inventory/bootstrap and combined
column drop/append. They are explicit scope limits, not implied support.

The [U1–U3 evidence packet](../evidence/praxis-u123-adoption/README.md) records the
exact installed candidate wheels, source correspondence, portable/browser checks,
mixed-phase recovery, all four reviewed-operation shards and owner+via native
authorization. MIG-R01–R06 are closed for this recorded PostgreSQL 18 maintenance
profile. These results do not establish managed production acceptance.
Run native tests only on an explicitly selected development database with
authority to create isolated roles and schemas.
