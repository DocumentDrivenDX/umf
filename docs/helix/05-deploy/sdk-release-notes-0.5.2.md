---
ddx:
  id: umf.sdk-release-notes-0.5.2
  type: release-notes
  activity: deploy
  status: draft
  authoring:
    home: repo
  links:
    - id: CONTRACT-079
      kind: informed_by
    - id: CONTRACT-081
      kind: informed_by
---

# UMF SDK 0.5.2

## Release Scope

SDK 0.5.2, `umf_access` 0.1.0.dev4 and `umf_codegen` 0.1.0a1 pair with
Weft 0.4.48. Core Python 0.10.0 retains its previously published immutable
wheel. Publication is pending final stack packaging checks.

## Audience and Channels

Embedders receive the SDK archive and Python wheels as separate release assets.
Generated application packages retain their standard-library-only runtime;
native PostgreSQL execution uses the separately installed host and compiler.

## Highlights

- A native binding prepares one shared schema and its indexes for reads and
  writes. Calls supply values without repeating whole-schema admission,
  serialization, copying or hashing.
- Eligible independent insert batches use one native mutation statement.
  A final installed-package check inserted 1,000 objects in one statement and
  verified results, replay, rollback and policy behavior.
- Source-declared typed queries use the same generated methods and binding as
  ordinary operations. Embedders do not select an alternate preparation path.
- Native lifecycle support includes declared tables, policies, seeds and
  forward migration within current UMF 0.10 installations.

## Changes and Fixes

Fixed query result admission accepts unrefined nullable NUMERIC result types
without inventing precision or scale. Identity column mappings preserve native
primary-key grouping semantics; renamed columns use logical projections.
PostgreSQL `LEFT` is included in the supported function set. Query inputs keep
their authored domain restrictions. Finite float results preserve binary64 bits.

Preparation indexes source elements, column names, relationships and commands
once. Batch eligibility computes dependency components once rather than
traversing the module for every table. The [operation cost contract](../02-design/contracts/CONTRACT-081-table-lifecycle.md)
records preparation costs and SQL counts for reads, writes, replay and outcome
observation. Principal and transaction state remain current per invocation.

## Breaking Changes and Required Actions

Install the matching host/compiler cohort and regenerate application packages
before adopting typed query declarations. Author explicit output names and DTO
Fields. Outputs cannot assert refinements or required values the compiler cannot
establish. Queries over renamed column projections must supply complete GROUP BY
expressions; PostgreSQL cannot infer base-table key dependencies through them.

Only UMF 0.10.0 source is admitted. Older formats and installation upgrade paths
are unsupported. Historical revisions inside a live installation remain intact.
Backend/codec protocol identifiers are independently versioned.

## Migration or Rollback Guidance

Keep the source, generated package, host and compiler cohort together. Retain
prior release assets for rollback; do not mix installation references, source
digests, cursors or outcome receipts between deployments. An operator applies
approved lifecycle migrations; ordinary calls do not alter the schema.

## Validation

Functional qualification is local macOS ARM64 with PostgreSQL 18.6. All 80 actual
embedder query declarations passed 483 comparisons with their original native
SQL across three principals, including exact decimal values, binary float bits,
nulls and caller-session restoration. All 483 leases were returned. The separate
sample passed 15 checks across seven methods/eight operations with 19 leases
returned. Four final prepared-batch cases passed 58 assertions with 19 leases
returned, including the 1,000-object single-statement case.

The affected TypeScript table tests passed 57 tests/418 assertions; prepared-host
controls passed 18 tests and the Python boundary check reported zero violations
across 81 modules. The installed Python sweep ran 467 tests and exposed stale
fixture/setup failures; all recorded failures were repaired and their affected
selectors passed in 116-, 11- and 10-test runs. The full sweep was not repeated.
Unavailable typing tools remain recorded skips. Other operating systems receive
packaging checks, without a claim of native functional qualification.

## Known Issues and Support

The query profile is bounded: 1 MiB source SQL, up to 1,600 declared outputs,
1..1,000 rows and an 8 MiB result frame. Its function and scalar-codec subsets
remain explicit; no general SQL executor or time-only result-codec support is
claimed. Query grouping and formatting inherit the scoped PostgreSQL timezone
and locale unless the source requests normalization.

The private consumer's host-owned external reference table remains outside the
provided plugin source. These results qualify the declared methods and queries,
not complete application/UI integration or external reference ownership.
No live Spark or Databricks execution is established by this release's macOS
PostgreSQL checks. Report unsupported declarations with their exact source and
compiler version through the repository issue tracker.
