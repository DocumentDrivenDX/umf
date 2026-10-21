---
ddx:
  id: umf.sdk-release-notes-0.5.4
  type: release-notes
  activity: deploy
  status: draft
  authoring:
    home: repo
  links:
    - id: CONTRACT-081
      kind: informed_by
    - id: SD-007
      kind: informed_by
    - id: umf.plan.schema-migrations
      kind: informed_by
---

# UMF SDK 0.5.4

## Release Scope

Candidate distribution versions are `@umf/core` 0.5.4, `umf_access` 0.1.0.dev6,
and `umf_codegen` 0.1.0a3. The Weft compiler version is unchanged. Core semantic
version 0.10 and the access runtime identity `0.1.0.dev0` are unchanged. These
version assignments describe this draft only; release qualification depends on
the final integrated source, embedded assets, installed wheels and acceptance
evidence.

## Audience and Channels

The TypeScript SDK exposes portable migration review-candidate discovery. Python
administrators can use the embedded `umf_codegen` API and `umf-table` CLI. Native
PostgreSQL mutation remains an explicit `umf_access` host operation. This draft
does not qualify managed Praxis/Lakebase or another storage backend.

## Highlights

- Versioned `umf.table-migration/0.2` plans add bounded existing-table evolution
  with durable mixed execution phases. Legacy 0.1 bootstrap/additive support and
  exact historical verification/replay remain. New effects require admission
  through the current public compiler, including explicit policy-change review.
- Reviewed source-bound changes cover selected column, nullability, policy,
  CHECK/FK, index and primary-key changes. `discoverTableMigrationChanges` and
  `discover_table_migration_changes` return candidates with source values for
  explanation; callers submit only marker identity, kind, path and old/new
  digests, plus an explicit conversion choice where required.
- Explicit `backfills`, `concurrentIndexes`, `validations` and `reviewedChanges`
  options describe separately authorized effects. The public mixed runner and
  CLI own native locks, progress, validation and publication boundaries.

## Bounded Support and Required Actions

The 0.2 profile requires an installed predecessor and stable table inventory.
It refuses initial deployment in that profile, table additions/removals and
combined column drop/append. Existing-column NULL fill, arbitrary row transforms,
general default changes, narrowing and cross-family casts are unsupported. Safe
type changes are limited to the finite PostgreSQL widening subset documented in
the [lifecycle guide](../04-build/guides/legal-table-lifecycle.md). Drops disclose
immediate irreversible stored-value purge; migration history is not a data
backup. Review markers do not authorize semantics the compiler cannot safely
lower.

Use the legacy 0.1 bootstrap/additive-table route where it is qualified, then
compile a separate 0.2 evolution from the installed source. Retain original
source, plan files, approvals, exact file digests, predecessor head and host
cohort. Do not re-ID or rehash a historical plan to obtain new execution
authority.

## Migration or Rollback Guidance

Compilation is inert. Apply only through the host's supported API or
`umf-table apply`, with an explicitly selected connection, approved plan digest
and expected predecessor. The host owns credentials, durable history, progress,
recovery, native catalog/data checks and publication. UMF owns source comparison,
marker binding and refusal; Weft lowers selected typed data operations.
Irreversible purge cannot be rolled back from metadata history alone.

## Validation

This draft is not a release receipt. Final source/browser parity, portable
compiler and verifier checks, installed generator correspondence, native
PostgreSQL lifecycle tests and historical 0.1 compatibility evidence must be
reported against the frozen integrated artifacts before promotion. No test
counts or managed-target qualification are asserted here.

## Known Issues and Support

The tracked residual scope is recorded as MIG-G01 through MIG-G11 in the
[schema migration plan](../04-build/schema-migration-plan.md). PostgreSQL local
evidence does not establish managed-service privileges or consumer adoption.
Report the exact source bytes, plan digest, compiler and runtime versions,
expected predecessor and native host version with any issue.
