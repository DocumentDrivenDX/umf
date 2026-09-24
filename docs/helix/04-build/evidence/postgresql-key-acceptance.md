# PostgreSQL Key binding acceptance

The PostgreSQL task under [TD-044](../../02-design/technical-designs/TD-044-core-key.md)
and [CONTRACT-040](../../02-design/contracts/CONTRACT-040-core-ideals.md) passes
qualified binding acceptance for PostgreSQL 17.4. This covers PostgreSQL's portions
of [US-044](../../01-frame/user-stories/US-044-core-key.md) AC2–6, AC11 and AC13.
SQL Server, Avro, Parquet and the separate Key admission/delivery gate remain open.
This does not establish native equivalence.

## Classification and native recovery

`classifyPostgresqlKeys` correlates supplemental index observations with a retained
catalog capture using the pinned PostgreSQL parser. It exposes each index's ordered
Field references, scope, native enforcement and comparator classification separately
from authored intent. It creates no core keys. INCLUDE columns do not become key
components; expression indexes do not become ordinary column identities.

The classification distinguishes immediate non-null uniqueness from partial,
inherited, deferred, nullable, unavailable and unknown enforcement. Comparator
agreement is limited to qualified native representable values. Padding is
incompatible; unqualified numeric, domain and collation refinements remain unknown.
The supplement and catalog are not authenticated or proven to share a transaction
snapshot. Correlation checks their overlapping assertions, not their origin.

Report receipts retain both original native texts, including unknown supplemental
members and exact numeric tokens. JSON/YAML storage and `recoverPostgresqlKeySource`
recover them exactly. Strict mode blocks the unexpressed author-intent and domain
obligations. Contradictory captures, unsupported profiles, forged receipts and stale
targets cannot claim recovery.

## Authored projection and ideal recovery

`projectKeysToPostgresql` consumes experimental core 0.6.0 Record membership and a
verified declaration for each named key. Explicit bindings map stable key IDs to
native constraint names and owned Fields to columns. Key-list order changes and
verified renames preserve identity; changed component order, ownership or meaning
invalidates retained authorship. Each key has a distinct mapping and residual.

For a newly created ordinary table, projection emits at most one primary key and
separate unconditional alternate UNIQUE constraints, all NOT DEFERRABLE, with
NOT NULL key columns. Text uses deterministic C collation. Qualified length and
integer-width facets use CHECK constraints. Decimal keys use unqualified numeric
plus finite bounds and a scale check, avoiding typmod rounding before validation.
Invalid identifiers, system-column names, conflicting carriers and keys exceeding 32
columns block before an invalid candidate escapes.

The native constraints express the known assertions. Unknown qualifiers on a
selected key, component, membership or facet make that key's equality **unknown**;
they cannot inherit the exact comparator label of a known carrier. Unrelated keys
retain their own qualified outcomes. Unknown content remains in the source residual.

Native constraint names do not replace stable UMF IDs, names or author intent.
Report mode retains those obligations and all unprojected metadata; strict mode
blocks their loss. `recoverKeysPostgresqlIdeal` recomputes the receipt and checks
the current native representation before restoring the complete authored source.
Verification establishes consistency, not authentication.

## Native limits and counterexamples

The generated-DDL oracle uses the pinned PostgreSQL 17.4 image with UTF8 in an
isolated disposable container. Twenty projection cases produce seventeen native
tables and three explicit blocks. **137 insertion probes** check actual duplicate
and NULL refusal, independent positive controls, decimal non-rounding, finite
bounds, unsigned width, Unicode distinctions, and character/byte length.

Native B-tree tuple limits can reject values that fit a column. Text cannot store
NUL. Integer input conversion can change an incoming SQL value before constraints
run. Probes exercise these limits, which remain residuals rather than exact-input
claims. The projection does not guarantee descendant-relation coverage, future DDL
or deployed database state.

The separate discovery oracle retains forty native probes, a deferred-constraint
probe and seventeen captured indexes. It demonstrates partial-index duplicates,
nullable and NULLS NOT DISTINCT behavior, deferred duplicates, inherited rows,
blank-padding and nondeterministic collation, numeric rounding, expression keys,
and INCLUDE-column behavior. These remain counterexamples, not equivalence evidence.

## Verification

The [acceptance record](../../../../fixtures/validation/key-postgresql-acceptance-evidence.json)
records **260 tests / 8,972 assertions across 57 files**, with zero failures,
and source fingerprints. The
[compatibility command](../../../../fixtures/validation/key-postgresql-compatibility-command.json)
selects all PostgreSQL-named tests and core tests explicitly, covering earlier ideals,
catalog/DDL edits, native preservation, projections and metadata consumers.
Historical all-system gates retain their original scope; this is not a full
repository or five-system refresh.

Chromium agrees with Bun on seventeen native index observations and twenty authored
projection cases, including the three unknown-qualifier cases. It verifies 34 ideal
and 34 native SQL recoveries through JSON/YAML, plus both captured native archives,
strict blocks and 38 forged/stale refusals. Host globals and external browser
requests are absent. The catalog-inspection/correlation browser suite also passes.
Typechecking, the public browser/WASM build and the 297-schema / 50-package audit pass.

Reproduce the native checks with `bun scripts/core-ideals/key-postgresql-oracle.ts`;
run `bun scripts/core-ideals/key-postgresql-browser.ts` with `UMF_CHROMIUM_PATH`
pointing to the installed Chromium executable. The acceptance record lists the
remaining commands and their scope.
