---
ddx:
  id: TD-082
  type: technical-design
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: US-082
      kind: informed_by
    - id: SD-029
      kind: informed_by
---

# TD-082: Declare queries that a type checker verifies

**User Story:** [[US-082-type-checked-query-declarations]]. **Feature:** [[FEAT-029]].
**Solution Design:** [[SD-029]].

## Scope

The `umf_access` DSL classes, the generated `fields.py` (column namespaces, query
roots and `<Record>Update` TypedDicts), the static corpora, and capture inside
`umf-access catalog`. Compilation through Weft and execution are TD-083.
CONTRACT-068 and CONTRACT-071 are authoritative.

## Technical Approach

**Typing model.** The prototype in
`docs/helix/04-build/evidence/typed-persistence/dsl-typing-spike/dsl.py` is the
starting point, not code to copy. Its core choices are kept:

- `Column[O, T]` and `Predicate[O]` are generic and invariant in the owning
  Record `O`, so a `Predicate[Customer]` is not a `Predicate[Order]`.
- Comparison dunders on `Column` take `T | Param[T] | Column[Any, T]` and return
  `Predicate[O]`. `__eq__` and `__ne__` override `object` with a narrower
  parameter; a wrong operand makes the checker fall back to `object.__eq__`,
  which returns `bool`, and `filter(*preds: Predicate[O])` rejects the `bool`.
- `Param[T_co]` is covariant.
- `<Record>.c` is a `ClassVar` holding a `@final` columns class, so
  `Order.c.amount` is a `Column[Order, Decimal]` while `order.amount` stays a
  `Decimal`.
- `<Record>.objects` is a query root whose chaining methods return `Self`;
  `update(**values: Unpack[<Record>Update])` uses a generated `TypedDict` with
  only mutable, non-generated fields.
- `select` has positional-only overloads for one to eight columns.

Added beyond the spike, and unqualified until the corpora show them on both
checkers (CONTRACT-071 lists them): terminal objects typed `Page[R, K]` with
`items` and `next_after: Continuation[K] | None`, `R | None`, `int` and `bool`;
`group_by().count()`; `Related[O, K]` with `.has(key)`; `.include_keys` returning
rows typed `WithKeys[R, K]`; per-Record `.into()` overloads accepting only the
Record's declared projections; `if_present` overloads accepting only
`Param[T | MISSING]` (a `Param[T | None]` is rejected, since `None` means
`IS NULL`); the `Column.__eq__` override, which makes `Column` unhashable and
whose override diagnostic the runtime package suppresses internally; and a
runtime `__bool__` on `Predicate` that raises `TypeError`. Field expressions raise `QueryOutsideCatalog` unless a capture
context is active (a context variable set only by the catalog tool).

**Checker configuration.** The spike shows mypy 2.4.0 reports only 2 of the 9
`bad.py` errors with default settings, because it skips unannotated function
bodies (with `--check-untyped-defs` it reports all 9). The profile therefore
pins `check_untyped_defs = true` for mypy and records a complete pyright
configuration file, and the corpus runner fails if either configuration differs.
Whether stricter modes (`--strict`, pyright `strict`) are also qualified is a
profile decision tested with the same corpora. mypy also infers `Any` as the return type of
a declaration with no return annotation, so result-type misuse is tested at
generated `queries.py` call sites, whose signatures are explicit.

**Capture.** The catalog tool imports each configured module, finds `@query` and
`@command` functions, checks every parameter annotation resolves to `Param[T]`
with a supported carrier, then calls the function twice inside the capture
context with symbolic parameters. The resulting expression trees are serialized
canonically and compared; a difference refuses. `if_present` parameters are
expanded into presence variants; more than 16 refuses.

**Refactoring.** Generated column attributes carry docstrings citing the UMF
source pointer, so go-to-definition reaches the authored meaning. The test for
the refactoring flow regenerates a package from edited fixtures and reruns both
checkers on an unchanged corpus.

`if_present` uses ordered overloads: a parameter without `MISSING` returns an
invalid-filter marker rejected by the enclosing `filter`, while a declared
`T | MISSING` (including nullable `T`) returns a predicate. The runtime confines
any deliberate overload-overlap suppression to its own declaration; generated
and developer code require none. Capture checks the declaration independently.

## Component Changes

Planned new paths:

- `python/umf_access/src/umf_access/dsl/` — `Column`, `Predicate`, `Param`, `Related`, `Query`, terminals, `if_present`, decorators.
- `python/umf_access/src/umf_access/capture.py` — capture context, signature checks, determinism check, variant expansion.
- `src/compilation/targets/python/index.ts` — `fields.py` emission (columns classes, query roots, Update TypedDicts, docstrings).
- `tests/compilation/python/static/queries/{positive,negative,refactor}/` with `expected.json`.
- `tests/compilation/python/static/checker-config/` — pinned `pyrightconfig.json` and `mypy.ini`.

## API/Interface Design

| Surface | Contract | Use |
| --- | --- | --- |
| Field expressions, query roots, Update TypedDicts | CONTRACT-068 | Generated typed attributes |
| DSL forms, typing rules, capture, refusals | CONTRACT-071 | Developer-facing declaration surface |
| `names` overrides and manifest diff | CONTRACT-067 | Refactoring flow |

## Data Model Changes

None. Capture produces an in-memory expression tree consumed by TD-083.

## Integration Points

Depends on the generated package (US-080/081). Capture output is the input to
Weft compilation in TD-083. The checkers run as pinned tools in the profile
environment; no plugin is installed.

## Security

Capture imports only modules listed explicitly in configuration, never scans
packages or entry points. Capture runs developer code at build time, so the
catalog tool runs only in the build environment, never at application runtime.
The public surface has no string-to-column path, which removes a class of
injection through column or ordering names.

## Testing

| AC ID | Planned test | Design assertion | Location |
| --- | --- | --- | --- |
| US-082-AC1 | `positive_corpus_type_checks` | Zero diagnostics on both checkers; pyright `reveal_type` for tuple rows | `python/umf_access/tests/test_static_corpus.py`, `tests/compilation/python/static/queries/positive/` |
| US-082-AC2 | `column_errors_rejected` | Expected rule and line per file on both checkers, covering spike cases E1–E4, E7, E8 | `tests/compilation/python/static/queries/negative/` |
| US-082-AC3 | `update_call_and_result_errors_rejected` | Expected diagnostics for spike cases E5, E6 and generated call-site and result misuse | `tests/compilation/python/static/queries/negative/` |
| US-082-AC4 | `refactor_by_regeneration` | Regenerated packages make the unchanged corpus fail at every affected site; override variant passes; docstrings cite pointers | `python/umf_access/tests/test_refactor_regeneration.py` |
| US-082-AC5 | `runtime_guards_and_no_strings` | `TypeError` from `__bool__`; `QueryOutsideCatalog`; public-surface inventory finds no string-accepting column, lookup, ordering or query-text API | `python/umf_access/tests/test_dsl_runtime.py` |
| US-082-AC6 | `capture_refusals` | Each capture error code; no files written | `python/umf_access/tests/test_capture.py` |

STP-082 is the authoritative mapping. All tests are planned and UNTESTED; the
spike is design evidence only.

## Migration & Rollback

The DSL ships in `umf_access`. Removing or changing a DSL form changes typed
signatures and is a new runtime ABI. Consumers roll back by pinning the previous
runtime and regenerating.

## Implementation Sequence

1. Port the spike's typing model into `umf_access.dsl` and add terminals and relationships.
2. Commit pinned checker configuration and the positive and negative corpora.
3. Emit `fields.py` from the generator.
4. Implement capture and its refusals; then the refactoring test.

## Risks

| Risk | Mitigation |
| --- | --- |
| A checker release changes inference for overloaded dunders | Exact checker pins per profile; corpus rerun before any pin change |
| mypy's `Any` return hides result misuse inside declarations | Result checks rely on generated call-site signatures; documented as a known limit |
| Developers disable `check_untyped_defs` locally | CI runs the corpus with the pinned configuration and fails on a mismatch |
