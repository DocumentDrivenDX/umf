---
ddx:
  id: TD-048
  type: technical-design
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.architecture
      kind: informed_by
    - id: FEAT-006
      kind: informed_by
    - id: US-048
      kind: informed_by
    - id: CONTRACT-043
      kind: informed_by
    - id: TD-045
      kind: informed_by
    - id: TD-046
      kind: informed_by
    - id: TD-047
      kind: informed_by
---

# TD-048: Generate PostgreSQL DDL from authored DDD and binding

## Scope

Implement [[US-048]] under CONTRACT-043 using CONTRACT-005, 041 and 042.
The architecture is the parent design. The generator emits reviewable DDL;
it does not deploy or run application queries.

## Technical Approach

Validate and copy both supplied documents, resolve all exact references,
then build a target-neutral statement plan with source paths and residuals.
Resolve table/column names and types under the explicit policy before SQL
rendering. Topologically emit tables, deferred cyclic FKs, junction/adjacency
tables and indexes. Reject unsafe SQL fragments before any candidate is
published. Import emitted SQL through the existing PostgreSQL adapter and
retain its archive; check the same statements with the isolated PostgreSQL 17
oracle. Treat adapter agreement and native acceptance as separate evidence.

## Component Changes

- `src/projections/ddd-postgresql/`: copied input validation, policy/identifier
  resolution, statement planning, strict/report residual reconciliation and
  deterministic rendering (US-048-AC1–4/8).
- `src/adapters/postgresql/` integration: existing parser/deparser/codec
  verification and target UMF recovery; do not weaken native guards (AC5–7).
- `tests/projections/`, `fixtures/projections/ddd-postgresql/`,
  `scripts/`: authored order/customer/product plus reified association corpus,
  checked-in DDL/reports and pinned oracle/browser evidence (AC1–10).

## API/Interface Design

CONTRACT-043 owns the public operation, policy and result. CONTRACT-015 owns
the native adapter's archive, and CONTRACT-042 owns storage/index meaning.
This TD only wires those interfaces. Every generated statement retains exact
logical and binding source paths.

## Data Model Changes

No logical schema changes beyond TD-045. The binding package is independent.
Output DDL and report are immutable artifacts with source/version fingerprints.
No database schema migration occurs in UMF; native test databases are isolated.

## Integration Points

The PostgreSQL adapter checks syntax and round-trip behavior; the native
PostgreSQL 17 harness checks target acceptance and catalog structure. A missing
engine yields unverified evidence, not a successful claim. Browser validation
uses a portable parser backend where already supported.

## Security and Performance

Quote identifiers, prohibit unchecked expression interpolation, cap output
size and reject malformed policies atomically. No live service access or query
execution from the browser library. No performance promise follows from index
generation; the consumer's query observation remains rationale.

## Testing

Map US-048-AC1–10 to cited tests. Include all storage/index kinds, partitions,
FK/junction/edge layouts, cyclic dependencies, heterogeneous losses,
aggregate/invariant residuals, strict/report pairs, both retained recoveries,
PostgreSQL 17 catalog oracle and Chromium parity. Fingerprint fixtures and
native engine version.

The relationship-independent table stage uses
`fixtures/projections/ddd-postgresql-tables/` for an Order, Customer, Product
and DDD-identified OrderProduct authoring corpus. Its binding declares all eight index
kinds, which remain source-qualified residuals in this stage. Generated table
DDL passes `umf.postgresql` parse/deparse/codec, executes in isolated PostgreSQL
17.4 and matches Chromium. JSONB path semantics, DDD identity, scalar-domain
limits and optional-to-NULL choice are reported; this evidence does not close
the full DDD-to-PostgreSQL generator.

The next relationship-independent stage composes those tables with the physical
index binding (`projectDddTablesAndIndexesToPostgresql`). Its qualified-table
lookup preserves the earlier unqualified index profile. The corpus emits four
indexes accepted by isolated PostgreSQL 17.4: btree, hash, JSONB-path
expression and partial. GIN/GiST on text have no verified default operator
class, the partitioned unique index omits the partition key, and clustering
has no index carrier; all four remain source-qualified residuals. The combined
DDL passes `umf.postgresql` parse/deparse/codec and Chromium parity, with the
native catalog and reports pinned under
`fixtures/projections/ddd-postgresql-tables-indexes/`. Strict mode returns no
candidate. Relationship storage and key constraints remain outside this stage.

## Migration & Rollback

Version generator policy and reports. Rollback retains authored logical and
binding documents and native archive; it never drops an unexpressed assertion.

## Implementation Sequence

1. Complete TD-045–047 prerequisites and target policy fixtures.
2. Implement validation/planning/rendering with failing tests.
3. Verify through adapter, native PostgreSQL and browser; publish evidence.

## Risks

Partitioned unique constraints, cyclic FKs and JSONB path expressions can
parse yet fail at native catalog creation. The isolated native oracle is a
required gate, with failures reported rather than rewritten away.
