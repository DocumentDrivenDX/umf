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
