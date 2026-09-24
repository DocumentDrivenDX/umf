---
ddx:
  id: TD-046
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
    - id: US-046
      kind: informed_by
    - id: CONTRACT-042
      kind: informed_by
    - id: TD-045
      kind: informed_by
---

# TD-046: Implement independent physical bindings

## Scope

Implement [[US-046]] under CONTRACT-042. The architecture is the parent design;
DDD and core relationship documents remain storage independent.

## Technical Approach

Register `umf.binding` as a document-scoped extension in a separate UMF
document. Require an explicitly supplied logical document and exact ID/version
match. Validate per-element, field and relationship choices without mutating
the model. Resolve a nested DDD field by its exact owner ID and DDD field key,
without pretending it is a standalone core Field. Use copied source/result
objects and target-qualified residuals.
Start with PostgreSQL/SQL Server projection needs; add Delta/Iceberg/Parquet
profiles only with their versioned evidence.

## Component Changes

- `spec/extensions/binding/{package.json,schema.json}` and package audit:
  structural publication after CONTRACT-042 (US-046-AC1–3/9).
- `src/extensions/binding/` and registry exports: typed reading, semantic
  validation, exact source pairing, copied inspection and migration/rollback
  (AC1–3/9/10).
- `tests/binding/`, `fixtures/binding/`, browser/native scripts: two bindings
  of one graph, unsupported target choices, source recovery (AC4–8/10).

## API/Interface Design

CONTRACT-042 owns the exact payload, target qualifiers and result rules;
CONTRACT-001 owns extension registration and unknown retention. This design
adds no physical member to the logical core or DDD profile.

## Data Model Changes

The binding package version changes independently of the model. A model edit
that invalidates an exact reference makes the binding stale until explicitly
repaired. No implicit name-based reassociation occurs.

## Integration Points

The projection modules consume a validated binding plus copied logical model;
they never fetch an external document. Sibling PostgreSQL and Delta bindings
can coexist. Missing native engines are evidence gaps, not silent passes.

## Security and Performance

Bound all arrays, paths and copied sources by core limits. Interpret no
artifact-supplied expressions, perform no network lookup or host filesystem
access in portable code. Reuse Bun scripts and real Chromium harness.

## Testing

Map US-046-AC1–10 to cited tests. Check two-target isolation, stale IDs,
unknown fields, strict/report, both retained recoveries, migration/rollback,
browser parity and per-target versions/subsets. Ensure consumer capability
selection does not inspect logical field properties for index claims.

The SQL Server 2022 table slice under this design has a bounded
`ordinary-tables-json-text-partition-scheme` target profile. Its fixture
executes generated DDL in an isolated server, recaptures catalog v2 through
`umf.sqlserver`, and compares Bun with Chromium. It emits tables and a checked
JSON object carrier; it reports SQL scalar-domain narrowing, DDD identity,
optional NULL, and embedded path non-enforcement. Relationship storage remains
behind TD-045 and the full SQL Server binding bead. Evidence is in
`fixtures/binding/sqlserver-tables/{case.json,generated.sql,oracle.json,browser.json}`.

## Migration & Rollback

Retain original binding payload and exact model identity in a receipt. Rollback
keeps unsupported new choices as residuals while recovering the old document.

## Implementation Sequence

1. Publish schema/package and registry tests.
2. Implement semantic pairing and copied inspection.
3. Add target-profile reports and native/browser tests.

## Risks

Loose name matching would attach a binding to the wrong logical element;
exact IDs and stale-version blocks prevent it.
