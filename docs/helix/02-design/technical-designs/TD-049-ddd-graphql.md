---
ddx:
  id: TD-049
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
    - id: US-049
      kind: informed_by
    - id: CONTRACT-044
      kind: informed_by
    - id: TD-045
      kind: informed_by
---

# TD-049: Generate GraphQL SDL from authored DDD and relationships

## Scope

Implement [[US-049]] under CONTRACT-044 using the existing GraphQL adapter.
The architecture is the parent design. Generated SDL does not define runtime
resolvers or client execution.

## Technical Approach

Validate/copy the logical model, select entities, resolve exact relationship
endpoints, then build a deterministic SDL AST from explicit naming/scalar and
schema-root policy. Apply Field, Nullability and Cardinality mappings before
printing. Generate inverse fields only when declared. Reconcile each unsupported
source obligation into a source-linked residual before permitting output.
Import SDL in schema mode and compare independent GraphQL.js and GraphQL-core
checks. Preserve original native SDL archive for the reverse recovery gate.
The scalar-field stage uses an explicit policy reference from each selected
DDD field to one core Field element. It validates scalar and container
agreement, takes outer non-null from the core Nullability ideal and array-item
non-null from an explicit itemType Field. It never treats a DDD cardinality
label as an authored core Field assertion. Missing or conflicting pairings
block the ideal-backed profile; the existing DDD-only profile remains
separately qualified.

## Component Changes

- `src/projections/ddd-graphql/`: source selection, name collision validation,
  SDL AST construction, strict/report reconciliation and source mappings
  (US-049-AC1–5/9).
- `src/adapters/graphql/` integration: schema-mode import and native retention
  without inferring association intent from object fields (AC6–8).
- `tests/projections/`, `fixtures/projections/ddd-graphql/`, `scripts/`:
  checked-in SDL/report, two-engine oracle and Chromium evidence (AC1–10).

## API/Interface Design

CONTRACT-044 owns the operation/result and root policy, CONTRACT-041 owns
relationship meaning, CONTRACT-009 owns native SDL behavior. This TD does not
introduce a resolver or a second GraphQL source-of-truth.

## Data Model Changes

No physical binding is needed. The generated SDL and report are versioned
artifacts; source DDD and core assertions remain in the retained document.

## Integration Points

The existing GraphQL adapter validates the candidate in schema mode;
GraphQL.js and GraphQL-core compare scoped AST/schema outcomes. A complete
schema root is required. No network service or executable GraphQL operation
is generated.

## Security and Performance

Validate GraphQL names before printing and bound source/output size. Reject
unknown semantics affecting output; retain them for read/write. Portable code
has no Node/Bun globals and runs in Chromium. No throughput claim.

## Testing

Map US-049-AC1–10 to cited tests. Cover inverse/no-inverse, scalar/nullability
and list wrappers, self and undirected relationships, heterogeneous endpoints,
missing root, aggregate/invariant residuals, strict/report, both retained
recoveries, two GraphQL oracles and browser parity.

The relationship-independent entity stage has a checked-in Order, Customer,
Product and OrderProduct corpus under `fixtures/projections/ddd-graphql-entities/`.
It emits complete SDL with an explicit synthetic root and reports that root's
missing execution meaning, DDD identity, scalar coercion, optionality and
many-cardinality differences. `umf.graphql` schema mode, GraphQL.js,
GraphQL-core 3.2.12 and Chromium validate the bounded result. Relationship
fields and inverses remain in the full dependent generator.

The core-ideal scalar stage uses
`fixtures/projections/ddd-graphql-core-fields/`. Its UMF 0.5.0 Order,
Customer, Product and OrderProduct corpus pairs each selected DDD scalar
field with an exact core Field. Required, absent-allowed and unspecified
availability produce qualified SDL wrappers; an array item Field supplies
`[String!]` for Product tags. Conflicting or stale pairings block. The checked
SDL passes the schema-mode adapter, GraphQL.js 17.0.2, GraphQL-core 3.2.12 and
Chromium; source-linked residuals retain facets, identity, DDD many semantics
and nullable/absent distinctions. Relationship fields and inverses still await
TD-045 and do not follow from this evidence.

## Migration & Rollback

Retain original logical model, report and any native SDL archive across policy
versions. Older readers preserve unknown generated metadata without inventing
relationship intent.

## Implementation Sequence

1. Complete CONTRACT-044 and TD-045 prerequisites; author the fixture corpus.
2. Implement AST builder and residual gate with tests.
3. Run adapter, both engines and Chromium; publish qualified evidence.

## Risks

SDL fields can be computed, and a valid AST can fail complete schema
validation. Require explicit root policy and schema-mode oracle acceptance.

### Complete experimental 0.7.0 projection

`projectDddToGraphql` implements the complete schema-only profile. Its policy
extends the existing core-ideal entity policy with explicit one-to-one
`endpoints` Record/entity pairs and exact `(module,id)` relationship selections.
Each selection names its forward field and, only for an authored inverse, its
inverse field. All declared relationships must be selected; unresolved or
unselected endpoints block atomically. The internal entity builder reads the
original 0.7.0 document without removing Keys, relationships or extensions.
It is not exported from the public package.

A heterogeneous output requires an explicit, unique `forwardUnion` or
`inverseUnion`; the generated union contains all mapped object types. Unknown
relationship qualifiers block, and unused or colliding naming policy refuses.
Undirected assertions require `orientation: source-to-target`; this is a
reported display approximation. Singular `1..1` uses a non-null output field;
optional singular is nullable. Higher maxima use nullable lists with nullable
items. These wrappers never certify stored participation, list length,
referential integrity, target-Key resolution, lifecycle or inverse consistency.
A separately selected association Record retains its own object fields;
endpoint-row correspondence and association identity remain residuals.

The complete policy/result schema is `spec/projections/ddd-graphql.schema.json`;
public result creation and receipt verification validate it before publication.
The full report retains source versions, complete logical content and policy,
source-to-SDL mappings, residuals and native archive. Verification recomputes
all outputs. Recovery accepts a fresh schema-mode import with an independent
archive ID, checks all remaining native content, and restores the retained
logical source. Target-only SDL does not infer DDD or relationship intent.
Migration/rollback composes through the existing 0.6→0.7 transition receipt;
original unknown member collisions and later authored assertions both survive.

Eight cases cover the independent shared graph target, self links, inverse and
no-inverse, required/optional singular, bounded/list participation, undirected
orientation, heterogeneous unions and a reified association. The independent
GraphQL-core oracle and Chromium evidence are recorded under
`fixtures/projections/ddd-graphql/`. The shared graph output matches the earlier
hand-authored expected SDL after AST formatting normalization. The qualified
profile remains schema generation only: no resolvers or query execution.
