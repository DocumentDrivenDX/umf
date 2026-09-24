---
ddx:
  id: TD-047
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
    - id: US-047
      kind: informed_by
    - id: CONTRACT-042
      kind: informed_by
    - id: TD-046
      kind: informed_by
---

# TD-047: Implement indexes as physical binding capabilities

## Scope

Implement [[US-047]] under CONTRACT-042 after the binding package exists.
The architecture is the parent design. No logical Field index member is added.

## Technical Approach

Validate ordered column/path targets against the exact paired logical and
binding documents. Keep predicate language/version/expression opaque and
source-linked. Model target capabilities as qualified projection outcomes;
only a target-checked index can be called supported. PostgreSQL catalog
indexes remain native observations under CONTRACT-015.

## Component Changes

- `spec/extensions/binding/schema.json` and `src/extensions/binding/`:
  index validation, uniqueness consistency, target resolution and copied
  capability inspection (US-047-AC1/2/9/10).
- `src/projections/` target profile modules: emit or residualize each kind,
  preserving strict/report atomicity (AC3–8).
- `tests/binding/`, `fixtures/binding/` and target oracle scripts: all kinds,
  path expressions, filtered uniqueness, unsupported targets and recoveries.

## API/Interface Design

CONTRACT-042 owns index fields and physical-only rule. CONTRACT-015 governs
catalog observations; CONTRACT-040 governs key identity separately. A physical
unique index does not create an authored core key.

## Data Model Changes

Index declarations live only in the separate binding payload. Migration and
rollback retain original declaration order, target paths and unknown fields.

## Integration Points

PostgreSQL native oracle checks parsed DDL and resulting index definitions;
SQL Server checks rowstore/filter behavior. Delta/Iceberg/Parquet outputs are
versioned analogues or residuals. A target-specific expression parser is not
bundled into core.

## Security and Performance

Reject unsafe expression interpolation even in report mode. Do not evaluate
predicates or claim a query plan. Bounds and browser portability follow
TD-046. Hohfeld timings remain rationale, not a performance target.

## Testing

Map US-047-AC1–10 to cited tests. Include all PostgreSQL kinds, clustering
residual, SQL Server filtered/disabled counterexamples, strict/report pairs,
both recoveries, invalid target paths, copied binding isolation and Chromium.

The relationship-independent SQL Server composition stage combines the
TD-046 table candidate with supported rowstore indexes against an explicitly
retained catalog capture. It checks indexed columns against the generated
table plan and observed types before returning DDL. The pinned SQL Server
2022 oracle accepts two tables and three indexes (btree, unique and filtered);
hash, document-path expression and clustering remain residuals. Native catalog
recovery, strict blocking and Chromium parity are recorded under
`fixtures/binding/sqlserver-tables-indexes/`. This stage still requires
catalog evidence and does not cover relationship storage.

## Migration & Rollback

Rollback restores original physical choices and retains new unknown kinds as
explicit residuals. Logical model and native archive are unchanged.

## Implementation Sequence

1. Extend binding schema/validator after CONTRACT-042.
2. Add target capability projections and independent native checks.
3. Publish version/subset matrix and browser parity evidence.

## Risks

PostgreSQL expression/partial/unique syntax is not a single access method;
native verification and separate residuals prevent an overbroad exact claim.
