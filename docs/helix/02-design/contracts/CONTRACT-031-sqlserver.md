---
ddx:
  id: CONTRACT-031
  type: contract
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: CONTRACT-001
      kind: informed_by
    - id: US-031
      kind: informed_by
---

# CONTRACT-031: SQL Server catalog ingestion

The initial `umf.sqlserver` 0.1.0 package targets a bounded SQL Server 2022 catalog
capture. Its payload stores an exact NativeJson root with profile
sqlserver-catalog-v1. The capture includes source version, query, candidate state
and ordered table/column observations. Unknown native and encoding content remains
serializable; unknown encoding blocks native export. Complete:false always qualifies
the view: captured metadata is permission-limited and is not full server semantics.

The supplied query reads sys.tables, sys.columns and sys.types, with identity,
computed/default expressions and column descriptions. Explicit canonical system
type identity determines scalar families; aliases retain their declared identities
and use the captured underlying system family. CLR, structured and unknown types
remain unclassified. SQL Server timestamp/rowversion is binary, never temporal.
Native max_length is bytes (including -1 for MAX); it is not a portable character
limit. Defaults and identity values remain native meanings, not writer optionality.

Core elements expose column names, descriptions and qualified scalar families.
Native column access returns complete copies. Export rejects disagreement with
materialized core fields. Candidate edits operate on a copy and mark state modified;
they never imply that SQL Server or any original DDL archive was updated. Removing
or reassociating attached field metadata must reject explicitly.

Declared integer capture fields are checked from exact NativeJson numeric tokens
before JavaScript numeric interpretation. They must be safe interoperable integers;
rounded fractions, underflow, values outside the safe integer range and negative
zero reject with `SQLSERVER_INTEGER`. Mathematically exact integer spellings such
as `104.00e0` remain accepted. This is an explicit runtime profile restriction in
addition to the mathematical integer constraints of the capture JSON Schema.
The check follows declared properties and array items across capture versions;
unknown native metadata remains exact and is not coerced into this integer profile.
Identity seeds/increments remain native strings.

`tests/sqlserver/integer-tokens.test.ts` covers import and copied edits across six
column integer fields, source immutability and exact/unknown JSON/YAML recovery.
Chromium repeats 48 rejection cases and four recoveries. The independent Python
Decimal check in `scripts/sqlserver-integer-tokens-oracle.py` verifies token values;
it is not a new live SQL Server validation or execution claim.

## Constraint capture profile v2

The extension envelope remains sqlserver-catalog-v1; its native root can now declare
sqlserver-catalog-v2. Native v2 requires keys, foreign_keys and checks arrays on every
table, including explicit empty arrays. V1 remains readable without those sections.
`getSqlServerConstraintMetadata` returns complete:false, qualified table identities,
source paths, per-section availability and copied exact NativeJson observations.
Missing sections are distinct from empty results; neither establishes permission-
independent database completeness. The complete view schema is
spec/extensions/sqlserver/constraint-metadata.schema.json.

Keys retain PK/UQ kind, ordered columns, descending flags, index type, disabled state,
ignore-duplicate-key setting and system naming. Foreign keys retain ordered source/
target column pairs, qualified referenced table, delete/update actions, disabled state,
trust and replication flags. Check constraints retain SQL definition, column/table
scope, disabled/trust/replication flags and database-collation dependency. Definitions
and target names may be unavailable under metadata visibility rules. Unknown native
content survives exactly. Unknown kinds/actions warn; duplicate names or column
ordinals reject ambiguous observations. This does not validate SQL expressions or
resolve every referenced object.

native/sqlserver/catalog-v2.sql is generated from catalog.sql plus constraints.sql.
The native oracle executes named constraint fixtures in two disposable databases and
compares captures; arbitrary source DDL regeneration is not implemented. The runtime
distinguishes enabled-but-untrusted constraints from disabled constraints, and preserves
SQL CHECK's null behavior without translating it into a generic boolean validator.
Copied candidate edits retain the existing modified-state qualification.

These are native storage constraints, not automatic DDD entity identities or aggregate
boundaries. Author-defined core keys are permitted under FR-3/CONTRACT-040; native
null handling, enforcement, equality and composite ordering constrain their bindings.
Only a claim that core replaces native constraints requires FR-28 equivalence.
The capture follows Microsoft's [key constraint catalog](https://learn.microsoft.com/en-us/sql/relational-databases/system-catalog-views/sys-key-constraints-transact-sql?view=sql-server-ver16)
and [check constraint catalog](https://learn.microsoft.com/en-us/sql/relational-databases/system-catalog-views/sys-check-constraints-transact-sql?view=sql-server-ver16).

This capture is not full catalog interchange or a general T-SQL parser.
Broader constraints/indexes, DDL ingestion and reconstruction, native value behavior
and cross-system transformations remain required work. Every support claim must
cite the actual native/browser evidence and its version.

References: Microsoft's [sys.types](https://learn.microsoft.com/en-us/sql/relational-databases/system-catalog-views/sys-types-transact-sql?view=sql-server-ver16),
[sys.columns](https://learn.microsoft.com/en-us/sql/relational-databases/system-catalog-views/sys-columns-transact-sql?view=sql-server-ver16)
and [rowversion](https://learn.microsoft.com/en-us/sql/t-sql/data-types/rowversion-transact-sql?view=sql-server-ver17)
contracts.

## Public API and schemas

`importSqlServerCatalog(text,{id})` preserves native JSON tokens and materializes
the sqlserver.columns module. `getSqlServerColumnMetadata` returns copied entries
with a native JSON Pointer, qualified table identity, core element and full native
column tree. Core IDs use source pointers, not durable SQL Server object identities.
Duplicate qualified tables, column names or column IDs reject as ambiguous captures.
`inspectSqlServer` validates the payload and bounded capture and reports incomplete
semantics. `exportSqlServerCatalog` recovers native JSON without rounding exact tokens.
`proposeSqlServerCatalogEdit(document,path,json)` replaces an existing native node on
a copy, sets modified state and refreshes the core fields. It does not generate DDL.

The complete JSON Schemas for the native capture, extension encoding and column
metadata result are under spec/extensions/sqlserver; package.json registers the
document-scoped vocabulary. Other server versions remain recoverable with explicit
version warnings. Alias classification requires a recognized canonical base type
name and system_type_id pair; an arbitrary familiar-looking alias name is insufficient.

Native evidence currently covers SQL Server 2022 build 16.0.4295.3, pinned by image
digest in scripts/sqlserver-oracle.ts. Two authored databases produce matching captures
for 32 columns. Native behavior confirms identity 9007199254740993 without rounding,
computed-column updates and eight-byte changing rowversions. This is replay of authored
DDL, not generation of equivalent DDL from arbitrary UMF edits. The fixtures retain
the actual server observations separately from expected scalar classifications.

## Index capture profile v3

Native sqlserver-catalog-v3 requires indexes plus v2 constraint arrays on every
table. Older profiles can omit indexes; missing observations differ from an empty
array. The extension envelope remains sqlserver-catalog-v1. Regenerate schemas
and the query chain with `bun scripts/sqlserver-schema.ts`.

native/sqlserver/catalog-v3.sql adds sys.indexes, sys.index_columns and data spaces.
It preserves heap rows, native IDs/names/type identities, uniqueness and constraint
ownership, disabled/hypothetical state, filter presence and nullable predicate,
fill/padding/locking/duplicate-key options, compression delay, sequential-key option
and data-space identity. Columns retain index-column IDs, nullable names,
key/partition/columnstore-order ordinals, descending and included flags. The LEFT
JOIN preserves RID column_id=0 if observed. Native ordering is not domain identity
or a promise of returned row order.

`getSqlServerIndexMetadata` returns complete:false, qualified tables, source paths,
availability and copied exact NativeJson rows. The complete result schema is
spec/extensions/sqlserver/index-metadata.schema.json. Duplicate index IDs/names,
index-column IDs or positive ordering ordinals reject ambiguity; zero non-key
ordinals may repeat. Unknown type identities warn and remain recoverable. Missing
filter predicates and specialized XML/spatial/hash details remain uninterpreted.
Copied candidate edits retain modified-state qualification.

Metadata remains permission-limited. Implicit clustering columns, partition
boundaries, partition compression, specialized index payloads, statistics and full
physical layout are not reconstructed. Columnstore inclusion differs from rowstore
INCLUDE; an unavailable predicate does not mean unfiltered. See Microsoft's
[index catalog](https://learn.microsoft.com/en-us/sql/relational-databases/system-catalog-views/sys-indexes-transact-sql?view=sql-server-ver16)
and [index-column catalog](https://learn.microsoft.com/en-us/sql/relational-databases/system-catalog-views/sys-index-columns-transact-sql?view=sql-server-ver16).

SQL Server 2022 build 16.0.4295.3 evidence covers five tables and nine heap/index
observations: PK, filtered uniqueness, covering and disabled indexes, heap, ordered
clustered columnstore and partitioned clustered index. Two authored databases yield
identical captures; an empty database yields no tables. Native inserts/updates show
filtered duplicate rejection, duplicates/nulls outside the filter, disabled-unique
duplicate acceptance, columnstore duplicate rows and three populated partitions.
This replays authored DDL, not generated reconstruction.

`bun test tests/sqlserver` passes 13 tests / 223 assertions. Chromium 148 verifies
both UMF recoveries, metadata parity, copied edits, exact unknown numeric content
and two Avro projections with three per-index losses. Reproduce with
`bun scripts/sqlserver-indexes-oracle.ts` and
`bun scripts/sqlserver-indexes-browser.ts` with Chromium configured. Evidence is in
fixtures/sqlserver/indexes-{catalog,empty,oracle,browser}.json and index-metadata.json.
Broader native reconstruction remains open.

CONTRACT-037 now provides explicit-policy catalog-to-DDL lowering for new ordinary
tables, with source retention, detailed losses and generated-schema native evidence.
This is separate from exact capture export and does not supply a general T-SQL parser
or complete physical reconstruction.
