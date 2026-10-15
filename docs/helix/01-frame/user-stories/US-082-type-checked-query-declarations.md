---
ddx:
  id: US-082
  type: user-stories
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-029
      kind: informed_by
---

# US-082: Declare queries that a type checker verifies

**Feature:** [[FEAT-029]]. **Feature Requirements:** QC-01, QC-02.
**PRD Requirements:** FR-53. **Priority:** P0 within the proposal.

## Story

**As an** Application Developer,
**I want** to declare reads and bulk commands in Python using generated, typed column attributes instead of strings,
**So that** pyright and mypy catch wrong columns, types, records and arguments as I write, and renaming a field in the schema shows me every query I need to fix.

## Context

CONTRACT-071 defines an expression-first DSL in the style of SQLAlchemy, Django,
PySpark, Polars and Ibis. Every column (`Order.c.amount`), relationship and
search index is a generated attribute; there are no string column references,
lookup strings or ordering strings. Predicates and column types are generic over
the owning Record, so a type checker can reject a column from the wrong Record.

Static checking is the first of four gates. The others are the catalog build
(US-083), target verification and value validation. This story covers the first
gate and capture, the step that turns a decorated function into a declaration.

The design-time spike at
`docs/helix/04-build/evidence/typed-persistence/dsl-typing-spike/` reproduced the
CONTRACT-071 typing error table (`bad.py`, E1–E9) on pyright 1.1.414 and mypy
2.4.0 with Pydantic 2.14.1. It also showed two limits that this story must handle:
mypy does not check a function with no annotations unless `check_untyped_defs`
is enabled, and mypy infers `Any` as the return type of a declaration without a
return annotation. Result-type checks under mypy therefore rely on the generated
`queries.py` signatures, and the profile must pin the checker configuration.

## Walkthrough

1. The developer writes a `@query` function in a module listed in the catalog
   configuration, annotating every parameter as `Param[T]`.
2. Their editor and CI run the pinned pyright and mypy; a misspelled column, a
   string compared with a `Decimal` column or a `Customer` predicate inside an
   `Order` query fails there.
3. The catalog build captures the declaration with symbolic parameters and
   writes a typed function into `queries.py`; call sites are checked against it.
4. Later, a maintainer renames a Field in UMF and regenerates. The checkers now
   report every declaration and call site that used the old name, and the
   manifest diff marks the change breaking.

## Acceptance Criteria

- [ ] **US-082-AC1** — Given the positive query corpus (filters with `filter` and `where`, `&`, `|`, `~`, `if_present`, null, membership and range predicates, `select` of up to eight columns, `into`, `page`, relationship `has` and a typed bulk `update`), when the pinned pyright and mypy check it with the profile configuration, then both report no errors and pyright infers `select(a, b).all()` as rows of `tuple[A, B]`.
- [ ] **US-082-AC2** — Given one negative file for each column-level row of the CONTRACT-071 typing table (unknown or misspelled column, wrong operand type, wrong parameter type, column from another Record in `filter` and in `select`, wrong `==` or `!=` operand), when both pinned checkers run, then each file fails on both checkers with its expected diagnostic at its expected line.
- [ ] **US-082-AC3** — Given negative files for an unknown, generated or immutable field in `.update(...)`, a wrong update value type, a wrong, missing or extra keyword at a generated `queries.py` call site, and misuse of a terminal result (using `.first()` as non-optional, indexing a `Page`, treating `.count()` as a list), when both pinned checkers run, then each file fails on both checkers with its expected diagnostic.
- [ ] **US-082-AC4** — Given a passing corpus and a regenerated package after a Field rename, a Field retype and a Field removal in UMF, when both pinned checkers run on the unchanged corpus, then every affected declaration and call site is reported, a `names` override that keeps the old Python name makes the rename corpus pass unchanged, the manifest diff marks each change, and each generated column attribute's docstring cites its UMF source pointer.
- [ ] **US-082-AC5** — Given DSL values at runtime, when a predicate is used with `and`, `or`, `not` or a chained comparison, or a field expression or query root is evaluated outside capture, then `__bool__` raises `TypeError` and evaluation raises `QueryOutsideCatalog`; and the public `umf_access` and generated surfaces expose no method that accepts a column name, lookup string, ordering string or query text.
- [ ] **US-082-AC6** — Given declarations that type-check but break capture rules (a parameter not annotated `Param[T]` with a supported carrier, an unsupported DSL form, a body that reads mutable global state or randomness, and five optional filters producing 32 variants), when the catalog tool captures them, then it refuses with `CAPTURE_SIGNATURE`, `CAPTURE_UNSUPPORTED`, `CAPTURE_NONDETERMINISTIC` and `VARIANT_LIMIT` respectively and writes no catalog.

## Edge Cases

- `Param` is covariant, so `Param[str]` is accepted against a nullable string
  column; `Param[str | None]` is not accepted against a non-null one.
- Projections wider than eight columns need a declared projection model with
  `.into`; a ninth positional column fails type checking.
- `where` is an exact alias of `filter`; `when` is reserved and absent.
- A nondeterministic body that happens to capture identically twice is outside
  the contract; the tool can only detect differing captures.
- Errors after regeneration are expected and are the point of the refactoring
  flow; the build must not suppress them.

## Test Scenarios

| Scenario | AC ID | Input / State | Expected Result |
| --- | --- | --- | --- |
| positive_corpus_type_checks | US-082-AC1 | Positive corpus on pinned pyright and mypy | Zero errors; inferred tuple row type |
| column_errors_rejected | US-082-AC2 | One file per column-level typing-table row | Expected diagnostic per file on both checkers |
| update_call_and_result_errors_rejected | US-082-AC3 | Bad update fields and values; bad call-site arguments; misused results | Expected diagnostic per file on both checkers |
| refactor_by_regeneration | US-082-AC4 | Rename, retype, removal; rename with `names` override | All affected sites reported; override passes; manifest diff and docstrings |
| runtime_guards_and_no_strings | US-082-AC5 | `and`/`or`/`not`, chained comparison, evaluation outside capture; public-surface inventory | `TypeError`; `QueryOutsideCatalog`; no string-accepting API |
| capture_refusals | US-082-AC6 | Bad annotation, unsupported form, nondeterminism, 32 variants | Named refusal codes; no catalog written |

## Dependencies

US-080 and US-081 (generated package and types); CONTRACT-068 field expressions;
CONTRACT-071 DSL, typing rules and capture; pinned pyright and mypy with the
profile's configuration (ADR-004). Feature requirements QC-01, QC-02; PRD FR-53.
TD-082 owns implementation detail; STP-082 owns the test mapping.

## Out of Scope

Weft compilation, target verification and execution (US-083), search forms
beyond their static types (US-084), type-checker plugins, checkers other than the
pinned pyright and mypy, and ad-hoc runtime queries.
