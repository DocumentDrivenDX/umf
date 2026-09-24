---
ddx:
  id: CONTRACT-015
  type: contract
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: CONTRACT-001
      kind: informed_by
    - id: US-015
      kind: informed_by
---

# CONTRACT-015: PostgreSQL SQL, parse trees and catalog captures

## Core column metadata from catalog captures

Catalog imports now materialize `postgresql.columns` core elements with names,
comments as descriptions, and optional scalarType. `getPostgresqlColumnMetadata`
returns copied entries containing native source pointer, qualified relation and kind,
core element and complete exact native column. Its complete result schema is
spec/extensions/postgresql-catalog/column-metadata.schema.json. Pointer-based element
IDs identify capture locations, not durable database column identities.

The capture query adds optional `nativeType` with pg_type namespace/name/kind/category,
declared array dimensions and raw type modifier. Older captures remain valid, but
formatted type names alone do not yield core families. Classification requires a
recognized pg_catalog base type with no declared dimensions and no array category.
bool maps to boolean; int2/int4/int8 to integer; numeric to decimal; float4/float8 to
float; text/varchar/bpchar to string; bytea to binary; date to date; time/timetz to
time; timestamp/timestamptz to timestamp. Native widths, precision/scale, length,
collation, timezone, constraints, nullability and other fields remain in the capture.
Domains, enums, ranges, arrays, composites, UUID, JSON and unrecognized types remain
unclassified; neither their spelling nor category alone establishes a core family.

Export rejects stale materialized metadata. Candidate edits synchronize it on a
copy while retaining the existing modified-capture warning and stale-reconstruction
guard. Removing or changing column/relation identity with attached metadata requires
explicit reassociation. Older UMF documents without the materialized module still
export, and the accessor derives metadata without mutating them. This is a catalog
observation API, not a SQL syntax resolver or proof of correspondence to a live server.

The mapping uses PostgreSQL 17's documented
[pg_type](https://www.postgresql.org/docs/17/catalog-pg-type.html) and
[pg_attribute](https://www.postgresql.org/docs/17/catalog-pg-attribute.html) identities.
The captured 17.4 server fixture covers 20 representative type declarations, including
a custom domain named text. Raw SQL ingestion remains source/AST preservation;
the declaration inventory below provides qualified syntax metadata. General catalog-
independent type resolution and final-schema reconstruction remain unfinished.

## DDL declaration inventory

`getPostgresqlDdlDeclarations(document)` returns copied observations from the current
raw parse tree: CREATE TABLE, CREATE FOREIGN TABLE, nested CREATE SCHEMA table
declarations and ColumnDef-bearing ALTER TABLE commands. Each declaration retains its
native statement, relation, source pointer, top-level statement index, enclosing named
schema context and explicit column declarations. Other statements remain in unhandled
with their exact native nodes. The API returns complete:false and never applies DDL
operations to construct a final catalog. The complete result schema is
spec/extensions/postgresql/ddl-declarations.schema.json.

Columns expose core Element names and optional scalarType, with typeResolution either
builtin-syntax or unresolved. Only recognized explicitly qualified or parser-normalized
pg_catalog type names yield scalar families. Unqualified text, user domains, arrays,
SETOF/%TYPE references, type-OID observations and unknown type fields remain unresolved.
Native modifiers, defaults, constraints and source positions remain in nativeColumn.
The classification describes declared syntax, not catalog validity or value constraints.

LIKE, inheritance, typed/partition tables and ALTER effects set requiresCatalogExpansion.
Unqualified relation names remain unqualified; enclosing schema context is separate
from the native relation. Source paths identify this parse tree, not durable database
identities. Copied node edits are reflected on the next accessor call; the original
source archive retains its existing pre-edit meaning. Invalid known AST fields or
unrecognized parser/representation versions block observation.

The authored native fixture demonstrates the boundary: eight explicitly declared
orders columns become ten after LIKE and ALTER. PostgreSQL 17.4 resolves a separate
unqualified text probe to sales.text under the selected search_path. Original and
regenerated DDL produce matching 14-column catalog observations. Chromium executes the
pinned WASM parser, compares five declarations/13 column observations, both SQL/UMF
recoveries and a copied edit. Foreign-table extraction has parser evidence only;
arbitrary FDW execution and server prerequisites are not verified by this accessor.

**Type:** library/schema. **Version:** 0.1.0 bootstrap. **Status:** draft.

## Purpose and scope

`umf.postgresql` retains a raw PostgreSQL parse tree and original SQL string. It does
not equate tables with entities or DDD aggregates. The complete representation schema
is `spec/extensions/postgresql/schema.json`, embedded in the extension package. It uses
core NativeJson to retain the entire native tree, including unknown content. The separate `native-ast.schema.json` describes all 272 messages and 71 enums
in the pinned native Protobuf descriptor, with optional proto3 fields and union checks.
It allows unknown fields for preservation and limits integer fields to exact JS values. Source and tree may intentionally differ after a candidate edit.

## Normative surface

`importPostgresqlSql(source, backend, {id})` parses supplied SQL using an explicit trusted
backend and creates an element payload with `profile: postgresql-raw-parse-tree`, `source`
and `root`. NUL bytes and over-limit text are rejected. Backend identity is pinned to
`@libpg-query/parser@17.6.10`; its observed engine version is PostgreSQL 17.4 (`170004`).
These are distinct version identifiers. Unexpected tree versions remain uninterpreted
and cannot be exported through this backend. Identity is an integration assertion, not
cryptographic attestation; artifact hashes are retained in the runtime manifest.

`getPostgresqlSource` returns the original source archive, including comments and layout.
It is explicitly not regenerated SQL after an edit. `getPostgresqlNode(document, pointer)`
returns a copied native node. `proposePostgresqlNodeEdit(document, pointer, nativeJsonText)`
replaces an existing node in a new document and returns incomplete inspection. The source
archive remains unchanged; SQL execution or referential correctness is not certified.

`exportPostgresqlSql(document, backend)` regenerates SQL from the current tree. It rejects
unknown representation fields/version and host-number conversions that alter exact native
numeric tokens. It then compares the complete AST against the native Protobuf codec's
round trip before deparsing: any omitted or changed field blocks export. Regenerated SQL
is parsed again and compared with the supplied AST, excluding only `location`,
`stmt_location` and `stmt_len`. All other changes block export. Formatting and comments
are not carried by regenerated SQL; the source archive retains them. Offsets remain in
UMF but are not meaningful regenerated-text coordinates after edits.

The backend supplies parse, deparse and codec-round-trip functions. The optional
`native/postgresql/runtime.ts` implements them using the pinned WASM package. Core does
not automatically load this runtime. Errors propagate rather than yielding partial SQL.
Unknown native content stays in UMF; no fallback silently emits the stale source text.

## Boundaries and evidence

Raw syntax validity is separate from catalog resolution, dependency ordering, privileges,
DDL execution, database state, migration validity, PL/pgSQL-body validation and instance
validation. `inspectPostgresql` always reports this incomplete status. No SQL is executed
by these APIs. The current evidence covers authored schema samples and native AST edits;
complete upstream coverage, catalog contracts and projections remain.

The WASM package uses a generated Protobuf bridge. Its optional dependency postinstall
only prints dependency-version warnings and was not needed or enabled for execution.
The package claims are verified by runtime behavior, not inferred from its npm version.
A separate pglast 7.18 oracle embeds PostgreSQL 17.7, so the tested minor versions differ.
It compares its own original/regenerated ASTs; it is not a claim of universal version
interchangeability or an independent SQL grammar implementation.

`validatePostgresqlAst(tree)` checks the plain native JSON vocabulary without loading WASM
or deleting unknown fields. Its `complete` result is always false. Export also applies
this check after codec fidelity validation. It does not assert that every descriptor
message is reachable from SQL parsing, or that a structurally valid AST is valid SQL.

The packaged Boolean message converter drops `boolval`. The optional runtime now
constructs nested typed messages using the schema and creates Boolean messages directly,
bypassing that defective converter without mutating the codec globally. A raw uncorrected
backend still fails the loss check for affected trees. True/false round trips and a Boolean
edit pass. Explicit false field presence must match native parser output: native false
uses an empty Boolean message. Export does not erase presence differences implicitly.

The full pinned upstream deparser corpus (416 cases / 420 statements) now round-trips
through UMF JSON/YAML and native SQL. A separate pglast 7.18 / PostgreSQL 17.7 oracle
confirms original/regenerated AST equality excluding source coordinates. This is one
upstream deparser suite, not all PostgreSQL regression SQL or database behavior.

Database-backed conformance now covers the authored fixtures in a disposable PostgreSQL
17.4 container: direct DDL, UMF-regenerated DDL and pg_dump schema SQL passed through UMF
into separate databases. The bounded catalog query compares namespaces, relations,
columns, constraints, indexes, policies, sequence definitions, domains/enums, functions,
owners, ACLs and comments. Eight behavior probes run in each database. These observations
do not turn `inspectPostgresql` into a catalog validator; its incomplete result remains.

The development oracle, `bun run test:postgresql-catalog`, requires Docker. It pins the
image digest, exposes no ports, disables container networking, uses temporary storage
and removes its own container on exit. It executes only repository-authored fixtures and
dumps from that disposable source. The public/browser adapter never connects to a server.

A general catalog extension schema and extraction API remain open. The evidence query
is deliberately not advertised as that vocabulary: it excludes physical identifiers,
cluster objects, data/sequence state, many native object families and untested metadata.
The pg_dump path currently tests plain PostgreSQL 17.4 schema-only output; psql commands
in newer dumps and other archive formats need separate handling with explicit fidelity.

## Versioned observed catalog capture

`umf.postgresql.catalog` 0.1.0 is a separate semantic extension for the observed
PostgreSQL 17 catalog profile. `spec/extensions/postgresql-catalog/schema.json` describes
its entire tagged representation; `capture.schema.json` describes all known native
capture fields and nested metadata. This profile matches the tested evidence query,
not all PostgreSQL system catalogs. Native SQL expressions, ACLs, types and sequence
bounds retain their original string representation. No catalog object is automatically
promoted to a core entity, value object or relationship.

`importPostgresqlCatalogCapture(text,{id})` accepts the versioned native JSON capture.
It contains state (captured/modified), serverVersion, query, snapshot and reconstruction
(format, toolVersion, sql). Exact NativeJson preserves unknown fields and number tokens.
Known fields are validated with the native schema using a temporary host view; that view
is never serialized as the captured value. Unsupported profile/version shapes fail import.
Before constructing that host view, schema-declared integer fields are checked from
their exact tokens. They must be safe interoperable integers: rounded fractions,
underflow, unsafe magnitudes and negative zero reject with
`POSTGRESQL_CATALOG_INTEGER`. This runtime restriction supplements the mathematical
integer constraints of the capture schema. Exact exponent spellings remain valid;
unknown native numeric metadata stays uninterpreted and recoverable. The check
follows local definition references and nullable branches in the owned capture
schema. A fractional native type dimension cannot round to zero and falsely qualify
a field for core scalar classification.

`tests/postgresql/integer-tokens.test.ts` exercises imports and candidate edits at
server version, column position, type dimensions and modifier paths. Chromium
repeats 32 rejections and four exact/unknown recoveries. The shared independent
Decimal oracle accepts `fixtures/postgresql/integer-tokens.json` as its argument;
its evidence concerns exact token values, not live server validation.
`inspectPostgresqlCatalog` always reports incomplete interpretation and reports unknown
capture fields. Other PostgreSQL 17 minor versions receive an explicit untested-version
warning; live evidence covers 17.4. Captured state is caller-supplied provenance, not server attestation.
The API does not execute the query or prove that metadata and SQL correspond.

`exportPostgresqlCatalogCapture(document)` returns `{state,json,complete:false}` for
the whole native capture. Unknown tagged/representation fields block this native export
so they cannot disappear. UMF serialization continues to preserve them. State is included
in the native JSON as well as the representation, and validation requires agreement.

`getPostgresqlCatalogNode(document,pointer)` returns a copied NativeJson node.
`findPostgresqlCatalogRelation(document,{schema,name})` returns the complete copied
observation, including unknown fields, or undefined; duplicate matches throw. Qualified
names stay distinct. Neither lookup interprets ACL strings or native expression semantics.

`proposePostgresqlCatalogEdit(document,pointer,text)` replaces an existing node in a new
document, validates the candidate and forces both states to modified. The original is
unchanged. `getPostgresqlCatalogReconstruction` returns the original SQL archive only
for captured state, with explicit incomplete/original-archive provenance. Modified state
rejects this accessor, including after native export/reimport; callers can still inspect
the archived SQL as a raw node. No API silently synchronizes edited metadata with SQL.

Both raw-AST and catalog candidate edits reject unknown representation content before
replacement. This includes extra tagged-node properties on the selected node, its
ancestors, unrelated nodes and the catalog state marker that edits automatically
replace. A root replacement cannot make unfamiliar encoding content disappear.
The original document remains unchanged and both UMF formats still recover it.
Unknown native members remain preserved and do not trigger this encoding guard;
they retain their existing interpretation/export limitations.

`tests/postgresql/edit-preservation.test.ts` covers 21 blocked root, leaf and disjoint
replacements across payload/root/leaf/state locations, source immutability and 14
unknown-content recoveries. `scripts/postgresql-column-browser.ts` reproduces these
checks in Chromium alongside the existing column metadata and valid edit checks.
Evidence is in fixtures/postgresql/edit-preservation.json and column-browser.json.
This is an authoring preservation boundary, not native server reconstruction of edits.

The live oracle now creates this capture from the temporary source database, round-trips
it through both UMF formats, retrieves its original archive and reconstructs the target
through the SQL adapter. Matching catalogs and behavior remain scoped to the authored
fixtures. Additional catalog object families, general extraction/rebuild, schema evolution,
psql/archive formats, migrations and projections remain open.

## Edited DDL execution evidence (US-015-AC12)

The raw-AST candidate path now has fresh PostgreSQL 17.4 execution evidence beyond
syntax regeneration. Six explicit replacements alter a numeric type and default,
a varchar column's length/nullability, a check expression, a Unicode comment and
a partial-index predicate. Independently authored expected.sql supplies the native
target expectation. The original SQL archive and unknown UMF vocabulary remain in
the candidate; the adapter does not rewrite the archive to imply it is current SQL.

A pinned, disposable, network-isolated database run creates source, expected,
candidate and restored databases. Candidate SQL is exported through the existing
Protobuf/deparse/reparse preservation guards. Its pg_dump archive also passes UMF
recovery and SQL regeneration before restoration. Captured expected/candidate/restored
catalogs agree under the bounded snapshot query; the source catalog is different.

Thirty-two native observations verify exact first identity `9007199254740993`, changed
decimal default and precision, longer/nullable labels, the raised check threshold,
partial unique-index inclusion/exclusion, and the Unicode column comment. Expected
rejections check SQLSTATE, rather than treating any error as agreement. Fresh captures
recover through JSON/YAML and expose the expected core scalar families and description.
The original/candidate distinction remains explicit; these are new schema creation
tests, not in-place data migrations or general catalog-edit-to-DDL synchronization.

Reproduce with `bun scripts/postgresql-ddl-edits.ts`,
`bun scripts/postgresql-ddl-edits-oracle.ts`,
`bun test tests/postgresql/ddl-edits.test.ts`, `bun run build:postgresql`, and
`UMF_CHROMIUM_PATH=/home/erik/.local/bin/chromium bun scripts/postgresql-ddl-edits-browser.ts`.
The fixtures/postgresql/edits directory contains source/expected/candidate SQL, exact
replacement paths, original/candidate documents, four fresh captures and fingerprinted
native results. Chromium replays all six edits with the pinned WASM parser, matches two
SQL recoveries and eight fresh-capture recoveries, without external requests or Node globals.

## Catalog snapshot profile v2

Capture-envelope v1 now accepts snapshot profiles evidence-17-v1 and evidence-17-v2.
The v1 fixture and its original query remain intact. V2 adds four required top-level
sections (nullable arrays when no objects exist): triggers, compositeTypes, rangeTypes
and collations. The schema describes every captured field. Absence of a section fails
v2 validation; it cannot masquerade as an observed empty collection. Existing v1
captures remain valid and round-trip without being relabeled as v2.

User triggers retain relation identity, enabled mode, native definition, function
signature, deferrability and comments. Standalone composite types retain ordered named
attributes and native types/collations. Ranges retain subtype, multirange identity,
operator class, collation and canonical/difference function references. Collations retain
provider, determinism, encoding, locale/ctype/collate, rules and provider version. These
are native declarations, not inferred portable meanings or execution guarantees.

The expanded fixture also exercises a standalone bigint sequence above JavaScript's
exact-integer range and a materialized view with a unique index. Existing relation and
sequence fields represent their tested definitions. Data/population state, full dependency
graphs, internal constraint triggers, aggregates, casts/operators, text-search objects,
foreign-data infrastructure, replication and other catalog families remain outside this
profile. The schema-only reconstruction path does not claim to back up those data states.

## Native dependency observations in snapshot v3

Snapshot evidence-17-v3 requires `dependencies` in addition to v2's object sections.
Each edge contains dependent/referenced endpoints (catalog, type, schema, name, identity)
and the native one-character dependency kind. The query uses pg_identify_object to
replace unstable OID addresses with server-described identities. It retains duplicate
edges and distinct dependency kinds; it does not collapse them to one generic reference.
V1/v2 fixtures remain readable without a dependency section.

`queryPostgresqlCatalogDependencies(document,filter?)` returns available, complete:false,
state and copied NativeJson edges. A filter selects dependent or referenced endpoints by
all three of catalog/type/identity. Identical identity strings alone do not identify the
same native object. Missing dependency coverage returns available:false; an observed graph
with no matches returns available:true and an empty array. Unknown edge fields/kinds stay
native data and are not promoted to core relationship semantics.

Coverage is the pg_depend rows whose dependent objects are in the query's explicit
relation/type/function/constraint/default/user-trigger/rewrite/collation/policy inventory.
References may point outside that inventory. Built-in pinned dependencies may not have
pg_depend rows; cluster-shared dependencies, runtime/dynamic SQL dependencies and excluded
object families are not captured. It is not complete lineage or a migration/topological
execution plan. Cycles and native normal/automatic/internal/partition semantics must not
be reduced to an unqualified DAG.

## PostgreSQL read-row projection to JSON Schema

`projectPostgresqlRowToJsonSchema(source,policy)` returns a source-preserving report with
status, complete:false, policy, issues and per-column mappings. The report and policy are
described by spec/projections/postgresql-row-json-schema.schema.json. Projected results
also contain a target UMF JSON Schema document, native schema text and a SELECT query.
Blocked results contain none of those executable/target outputs.

The policy requires target id/schemaId, a qualified relation, selected column encodings
and strict or allow-reported-loss. Missing/ambiguous columns and unsupported encodings
block. Modified catalog metadata and untested minor versions also block query generation.
Unknown policy fields and NUL identifiers fail validation. Captured state does not attest
that the database still matches; callers must independently verify the execution target.

Encodings are explicit: sql-text uses the native ::text representation; json-boolean
accepts a captured boolean column; json-int32 accepts smallint/integer with their native
bounds; json-value accepts json/jsonb and reports SQL NULL/JSON null collapse, duplicate
key limits and client numeric precision risks. Bigint is not implicitly mapped to a host
number. Native text remains an unconstrained JSON string because native/domain/format
semantics are not generically portable. Nullable scalar columns admit JSON null. Every
selected property is required because these are complete read rows, including null values.

The generated query quotes identifiers and JSON key literals, constructs typed JSON values
and aggregates the selected fields in each row independently. It does not execute SQL,
filter rows, insert defaults or provide ordering across rows. Omitted columns are named
in the report. Database constraints, policies, triggers, privileges, generated expressions
and state remain native; strict mode blocks because those semantics are not reproduced.
Allow-reported-loss requires caller acceptance and never claims full equivalence.

Live evidence covers selected orders, order_lines and row_encodings fields across all
three reconstructed databases. Exact bigint/decimal text and embedded JSON numeric tokens are checked with a
separate Python parser/validator. Client code using ordinary JSON.parse still cannot assume
that embedded JSON numbers retain precision. The live matrix now covers all four
encodings, including true/false, nullable booleans, both smallint bounds, SQL NULL and
JSON null. A NOT NULL jsonb column can hold JSON null; json-value therefore does not
incorrectly prohibit that value. This ambiguity remains reported rather than silently
treated as SQL nullability equivalence.
