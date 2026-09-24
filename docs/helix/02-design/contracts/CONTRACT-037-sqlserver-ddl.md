---
ddx:
  id: CONTRACT-037
  type: contract
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: CONTRACT-031
      kind: informed_by
    - id: US-031
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
---

# CONTRACT-037: SQL Server catalog to reviewable DDL

`projectSqlServerToDdl(source,policy)` produces T-SQL for new ordinary tables from
the SQL Server 2022 catalog profile. The result retains the entire source, explicit
policy, source-addressable issues and ordered statements with source paths/kinds.
Successful results include nativeSource. Blocked results contain no statements or
partial SQL. Complete result/policy schema: spec/projections/sqlserver-ddl.schema.json.

Required policy choices are aliases:reject|base-type, physicalLayout:default-rowstore,
nativeExpressions:verbatim, sourceState:captured-only|allow-candidate and
lossPolicy:strict|allow-reported-loss. Strict mode blocks the incomplete capture;
reported-loss mode still blocks unsupported type identities, unresolved relations,
unavailable predicates, invalid ordinals and specialized indexes. Invalid policy,
identifiers, source/core disagreement and unsafe JSON numerics throw before any
output is returned. No SQL is executed by the browser library.

## Represented meaning

Canonical native type ID/name pairs determine builtin types; core scalarType is
insufficient. Character/binary lengths use the native byte count, including Unicode
width and MAX. Decimal precision/scale, float precision, temporal scale, nullability
and collation are rendered explicitly. Identity seed/increment stay exact strings;
default/computed expressions are copied verbatim. Column descriptions use escaped
extended-property literals. Identifiers use bracket escaping; collation names use
validated tokens because SQL Server does not accept that identifier quoting there.

All tables precede keys/indexes and relational constraints. PK/UQ ordering and
clustering, checks and foreign-key pairs/actions are emitted. Check/FK trust,
disabled and replication state remain distinct. Ordinary rowstore indexes preserve
key directions, INCLUDE, predicate, uniqueness and captured options; nonclustered
disabled state is emitted separately. Catalog fill_factor=0 denotes the default;
it is omitted rather than emitted as an invalid CREATE INDEX argument. A diagnostic
records the target-default dependency. Native expressions are unparsed SQL for
review: this API establishes neither their dependencies nor safe execution against
an arbitrary database. The generated source sets the required common SET options.

Syntax follows Microsoft's [ALTER TABLE](https://learn.microsoft.com/en-us/sql/t-sql/statements/alter-table-transact-sql?view=sql-server-ver16)
and [CREATE INDEX](https://learn.microsoft.com/en-us/sql/t-sql/statements/create-index-transact-sql?view=sql-server-ver16)
contracts, with execution evidence below.

## Explicit losses and unsupported cases

The catalog omits permissions, triggers, dependency definitions, some column flags,
bound defaults/rules and complete physical layout. Every result reports that limit.
Unknown native properties stay in source with diagnostics. Older profiles with
missing sections report unavailable observations rather than absence of constraints.
Unknown numeric metadata is not rounded during lowering.

Alias base-type lowering is opt-in and loses alias identity/bound behavior. Captured
system-generated constraint names become explicit names. Identity current counters
and replication flags, default constraint identities, computed persistence and XML
schema collections are not captured. Computed columns become non-persisted and XML
becomes untyped, with specific diagnostics. Column-scoped checks become table checks.

The required default-rowstore policy omits columnstore/hypothetical structures and
places ordinary indexes on default storage. Partition boundaries, compression,
filegroup placement and index IDs are not reconstructed. Generic physical-detail
diagnostics accompany index observations. Specialized XML/spatial/hash indexes,
disabled clustered indexes/keys, missing filtered predicates and unknown type/action
identities block where no supported lowering is defined. There is no arbitrary
T-SQL parser, complete database reconstruction or automatic deployment.

Candidate edits require allow-candidate and keep the modified-state diagnostic.
Three edited candidates now have fresh native execution and recapture evidence,
including both UMF formats and browser parity. This proves the tested edits below,
not arbitrary candidate validity or full reconstruction.

## Evidence

`bun test tests/sqlserver`: 18 tests / 382 assertions. DDL tests cover both UMF
formats, strict blocking without partial SQL, stale core metadata, aliases, unsafe
policies, identifiers, candidate edits and native-evidence fingerprints. Regenerate
the published schema with `bun scripts/sqlserver-ddl-schema.ts`.

`bun scripts/sqlserver-ddl-oracle.ts` creates source and generated databases on
SQL Server 2022 build 16.0.4295.3, pinned by image digest. Three authored schemas
cover ten tables and 56 columns. Captured columns match after declared alias
lowering; keys/checks/FKs match after system-name classification changes. Tests
compare ordinary index metadata after removing declared index-ID/placement/
partition-ordinal differences. Native behavior verifies exact identity
9007199254740993, defaults, computed values, alias values, rowversion width, cascade
actions, SQL NULL checks, untrusted enforcement, disabled checks, filtered uniqueness
and disabled unique indexes in source and generated databases.

The same evidence explicitly records computed persistence changing from true to
false, columnstore becoming a heap, and partition-scheme placement becoming default
filegroup placement. These are measured losses, not equivalence claims. Source and
generated DDL hashes and the capture-query hash are retained in ddl-oracle.json;
generated SQL is under fixtures/sqlserver/ddl/.

The oracle also applies six copied edits across three candidate databases: string
length and description, boolean default, check predicate, filtered-index predicate
and column nullability. Native recapture matches every edited path. Runtime probes
accept a 60-character string and produce the changed false default; reject qty=1
and accept qty=10 under the edited check; accept active=1 duplicate keys while
rejecting active=0 duplicates under the reversed filter; and accept a null region.
Original captures remain unchanged. Generation without allow-candidate blocks.
Unfamiliar example.future content survives in the retained candidate UMF source;
SQL Server does not interpret or recreate that vocabulary. Candidate SQL hashes,
captures and behavioral observations are nested in each ddl-oracle.json case.
The fresh captures themselves are re-ingested and recovered through both formats.

`bun scripts/sqlserver-ddl-browser.ts` with Chromium configured checks three stored
capture fixtures, six serialization recoveries, strict blocking and candidate edits,
plus six native-tested candidate recoveries and six fresh-capture recoveries,
without external requests or Node globals. Browser evidence is ddl-browser.json.
Type checking, all 169 schema and 32 package audits pass. This focused evidence
follows the 718-test full-suite baseline and does not replace that baseline with a
new whole-repository claim. The broader integration goal remains active.
