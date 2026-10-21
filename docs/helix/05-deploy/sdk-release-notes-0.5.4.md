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
and `umf_codegen` 0.1.0a3. No Weft source change is included; the recorded native
cohort uses published Weft 0.4.49. Core semantic version 0.10.0 and the access
runtime identity `0.1.0.dev0` are unchanged. The original core 0.10.0 release assets
are reused; refreshed generated SDK headers record package provenance only.
These are candidate versions; publication and hosted CI acceptance are separate
from the local evidence below.

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

The [candidate evidence packet](../04-build/evidence/praxis-u123-adoption/README.md)
records 55 affected tests (282 assertions), 91 Chromium assertions with zero
external requests, and 139 SDK installation conformance checks. Installed native
receipts record 42 legal lifecycle checks, 10 owner+via checks, 21 mixed-phase
checks and an independent replay of the same 21 mixed checks. Reviewed-operation
shards A/B/C/D pass 28/27/40/33 checks: 128 assertions across 14 native cases and
two additional compiler refusal cases. Counts describe separate, partly
overlapping suites and are not a combined coverage total.

Wheel/source/RECORD correspondence and the actual published SDK 0.5.3 historical
initial/additive oracle are retained. The current compiler refuses newly
identified unreviewed legacy policy effects while preserving historical
verification/replay. Independent source/evidence review closes MIG-R01–R06 for
the recorded PostgreSQL 18 maintenance profile. This draft is not a posted-release,
hosted CI or managed-target receipt.

## Known Issues and Support

The tracked residual scope is recorded as MIG-G01 through MIG-G11 in the
[schema migration plan](../04-build/schema-migration-plan.md). PostgreSQL local
evidence does not establish managed-service privileges or consumer adoption.
Report the exact source bytes, plan digest, compiler and runtime versions,
expected predecessor and native host version with any issue.
