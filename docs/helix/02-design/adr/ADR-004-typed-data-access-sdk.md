---
ddx:
  id: ADR-004
  type: adr
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.prd
      kind: informed_by
    - id: FEAT-028
      kind: informed_by
    - id: FEAT-029
      kind: informed_by
    - id: FEAT-030
      kind: informed_by
    - id: FEAT-031
      kind: informed_by
---

# ADR-004: Schema-first typed data access SDK over UMF and Weft

## Problem

Python applications need typed, refactor-safe access to data described by UMF:
models, queries, search and mutations, against raw Postgres, Lakebase and Unity
Catalog/Spark tables as well as Truss ontologies and Ashlar publications. They
must not hand-maintain types or SQL, must not run SQL built from customer input,
and must not bypass Truss's or Ashlar's protected execution paths.

## Decision

Build a schema-first data access SDK in three layers:

1. **Generated types (CONTRACT-067/068/070).** A portable TypeScript generator in
   UMF emits Pydantic models, Key DTOs, typed column and search-index
   expressions, and typed action clients from UMF documents and the `umf.access`
   extension.
2. **Precompiled catalog (CONTRACT-071/074).** Developers declare queries,
   searches and bulk commands in an expression-first Python DSL. A build step
   captures them and compiles each through Weft for every selected target into a
   checked-in catalog. At runtime only catalog entries execute, with validated
   values bound as parameters.
3. **Runtime targets (CONTRACT-072/073/069).** A hand-written `umf_access`
   runtime defines target protocols. Raw-table targets run catalog statements on
   the host's native SQL connection under the native SQL action profile; Truss
   and Ashlar implement the same protocols over their own protected paths.

Writes go only through UMF actions (CONTRACT-900) or catalog bulk commands.

## Why We Chose This

### Over a conventional ORM (SQLAlchemy ORM, Django, SQLModel)

Change tracking, identity maps, lazy loading and `save()` would bypass Truss's
protected mutations and do not exist on Spark. A single entity class also merges
row, create and patch presence rules that UMF keeps distinct. The DSL borrows the
naming of these libraries, not their execution model.

### Over runtime query building (SQLAlchemy Core, Polars or Ibis expressions executed directly)

Runtime building would generate SQL from whatever code paths run in production.
Precompiling every declaration through Weft at build time catches unsupported
forms before deployment, keeps customer input in bound parameters, and lets the
catalog be reviewed. Apex static SOQL and Scala Quill show the same trade-off.

### Over string-based query languages (Django lookups, pandas `query`, Polars `col("x")`)

String references defeat type checking and schema-driven refactoring. Every
column, relationship and index is a generated typed attribute instead.

### Over generating SQL in UMF

Weft already owns logical SQL lowering for Truss and Ashlar. Adding raw-table
backends to Weft keeps one lowering implementation per target.

### Over generating SQLAlchemy or PySpark mappings

Those mappings are write paths in their own right and duplicate Weft's physical
bindings. Generated code holds no table handles.

## Consequences

**Good:**

- One schema drives types, queries, search and actions.
- Errors move left in order: static type checking, catalog build, target
  verification, value validation.
- No runtime SQL from input.
- Truss and Ashlar keep their protocols.

**Trade-offs:**

- Two build stages (TypeScript generation, then Python capture and Weft
  compilation).
- The DSL can express only what Weft can lower for every selected target.
- Bulk commands still call Weft at runtime to instantiate plans until Weft offers
  plan templates.
- A new Python distribution, `umf_access`, is maintained in UMF.

**Dependencies:**

- **Weft:** query-form extensions, raw-table backends for Postgres, Lakebase and
  Spark/Unity Catalog, action and search lowering, and plan templates, requested in
  [the Weft requirements](../../04-build/weft-requirements-typed-access.md). Weft is
  the only SQL lowering; UMF builds no interim lowering and proceeds in parallel.
- **Truss:** a public action admission path.
- **Ashlar:** resolver-pinned read execution for adapters.

**Drift signals:**

- String column references.
- Runtime SQL assembly.
- Generated table handles or sessions.
- Latest-table Ashlar reads.
- Actions bypassing Truss admission.
- Unsupported semantics disappearing from manifests.

## Concern Impact

Retains ADR-002 for the TypeScript generator. Python is a target language plus
the `umf_access` runtime distribution; this ADR selects that distribution and its
optional extras. Exact dependency pins (Pydantic 2.14 or later, pinned pyright and
mypy, drivers and platform versions) are recorded per profile and target.
