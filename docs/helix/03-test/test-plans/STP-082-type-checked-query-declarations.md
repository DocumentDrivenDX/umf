---
ddx:
  id: STP-082
  type: story-test-plan
  activity: test
  status: draft
  authoring:
    home: repo
  links:
    - id: US-082
      kind: informed_by
    - id: TD-082
      kind: informed_by
---

# STP-082: Declare queries that a type checker verifies

## Story Reference

**User Story:** [[US-082-type-checked-query-declarations]].
**Technical Design:** [[TD-082-type-checked-query-declarations]].
**Related Solution Design:** [[SD-029]]. **Project Test Plan:** [[test-plan]].

## Scope and Objective

Prove that the pinned pyright, mypy and ty accept correct declarations and reject
every error in the CONTRACT-071 typing table, that schema changes surface through
regeneration, that runtime guards stop misuse the checkers cannot see, and that
capture refuses declarations outside the contract. All tests and commands are
planned and **UNTESTED**. The spike under
`docs/helix/04-build/evidence/typed-persistence/dsl-typing-spike/` seeds the
corpora but is not acceptance evidence.

## Acceptance Criteria Test Mapping

| AC ID | Failing test to create | Asserted behavior | Required source citation |
| --- | --- | --- | --- |
| US-082-AC1 | `positive_corpus_type_checks` | Both checkers, at pinned versions and configuration, report zero diagnostics on `static/queries/positive/`, which uses every form listed in the AC. pyright's `reveal_type` on `Order.objects.select(Order.c.order_id, Order.c.amount).all()` names `list[tuple[str, Decimal]]` inside the terminal type. | `@covers US-082-AC1` |
| US-082-AC2 | `column_errors_rejected` | Each of `unknown_column.py`, `wrong_operand.py`, `wrong_param.py`, `foreign_column_filter.py`, `foreign_column_select.py`, `wrong_eq_operand.py` and `wrong_ne_operand.py` fails on both checkers with the rule and line recorded in `expected.json` (for example pyright `reportOperatorIssue` and mypy `operator` for a wrong operand). | `@covers US-082-AC2` |
| US-082-AC3 | `update_call_and_result_errors_rejected` | Each of `update_unknown_field.py`, `update_generated_field.py`, `update_immutable_field.py`, `update_wrong_type.py`, `call_wrong_keyword.py`, `call_missing_keyword.py`, `call_wrong_type.py`, `first_used_as_value.py`, `page_indexed.py` and `count_iterated.py` fails on both checkers with its recorded diagnostic. Call-site and result files import the generated `queries.py`, not a declaration. | `@covers US-082-AC3` |
| US-082-AC4 | `refactor_by_regeneration` | From `fixtures/access/commerce/`, generate variants with `memo` renamed, `amount` retyped and `memo` removed. Running both checkers on the unchanged `static/queries/refactor/` corpus reports every site listed in its expected file and no others. A variant that renames the authored ID but keeps the Python name with a `names` override reports nothing. Each manifest diff marks the changed symbols; each column docstring contains its source pointer. | `@covers US-082-AC4` |
| US-082-AC5 | `runtime_guards_and_no_strings` | `bool(pred)`, `a and b`, `not p` and `lo < Order.c.amount < hi` raise `TypeError`; evaluating `Order.c.amount > 1` or `Order.objects.filter(...)` outside capture raises `QueryOutsideCatalog`. An inventory of public callables in `umf_access` and the generated package finds no parameter typed `str` that names a column, lookup, ordering or query text. | `@covers US-082-AC5` |
| US-082-AC6 | `capture_refusals` | `umf-access catalog` refuses a parameter annotated `str` with `CAPTURE_SIGNATURE`, an unsupported form with `CAPTURE_UNSUPPORTED`, a body reading a mutable global changed between captures with `CAPTURE_NONDETERMINISTIC`, and five `if_present` filters with `VARIANT_LIMIT`; in each case the output directory is unchanged. | `@covers US-082-AC6` |
| US-082-AC7 | `aggregate_typing` | `avg_without_scale.py` and `sum_of_string.py` fail on both checkers with the rule and line in `expected.json`. In `static/queries/positive/`, a declaration grouping by `Order.c.status` and `Order.c.amount.bucket_width(Decimal("100"))` passes; pyright's `reveal_type` shows `Agg[Order, Decimal \| None]` and `Bucket[Order, Decimal]`, and the generated call site's rows reveal `tuple[str, Decimal, Decimal \| None]` on both checkers. | `@covers US-082-AC7` |
| US-082-AC8 | `join_typing` | `join_foreign_filter.py`, filtering an `Order`–`Customer` join that does not join `Carrier` on a `Carrier` column, fails on pyright, mypy and ty with its recorded diagnostic. In the positive corpus, the joined query reveals `Joined[Order, Customer, ...]`, and the generated call site types the selected `Customer` name as `str` and the left-joined `Carrier` name as `str \| None` on all three checkers. | `@covers US-082-AC8` |
| US-082-AC9 | `ty_rejects_typing_table` | ty, at its pinned version and configuration targeting Python 3.11, reports zero diagnostics on `static/queries/positive/` and exactly the expected rule and line for every negative file used by US-082-AC2, AC3, AC7 and AC8, including `update_unknown_field.py` and `update_wrong_type.py` against the generated keyword-only `update()`. | `@covers US-082-AC9` |

## Executable Proof

Planned commands (not implemented), run in the isolated profile environment:

```sh
python -m pytest python/umf_access/tests/test_static_corpus.py -k queries
python -m pytest python/umf_access/tests/test_refactor_regeneration.py python/umf_access/tests/test_dsl_runtime.py python/umf_access/tests/test_capture.py
```

The static runner invokes `pyright`, `mypy` and `ty` with the committed configuration
in `tests/compilation/python/static/checker-config/` and fails if the installed
versions differ from the profile pins. A negative case passes only when its
expected rule and line are reported; an import or configuration error fails it.
`test_refactor_regeneration.py` calls the US-080 generator through the host tool.

Record results under `docs/helix/04-build/evidence/typed-persistence/` with
checker versions, configuration files, commands, statuses and full diagnostics.

## Data and Setup

- The generated commerce package from `fixtures/access/commerce/`, with a
  `Customer`–`Order` relationship for `has` and joins, an optional to-one
  `Order`–`Carrier` relationship for left joins, and a generated `queries.py`.
- `tests/compilation/python/static/queries/{positive,negative,refactor}/` with
  one case per file and an `expected.json` per directory.
- Fixture variants for rename, retype, removal and rename-with-override.
- Capture fixtures: modules that each break one capture rule.

## Edge Cases and Failure Modes

Covariant `Param` against a nullable column (positive), `Param[str | None]`
against a non-null column (negative), a ninth `select` column (negative), `when`
absent from the surface, and the default-mypy limitation (the runner must refuse
to run without `check_untyped_defs`).

## Build Handoff

Commit checker configuration and corpora with expected diagnostics before
implementing the DSL; they must fail first for missing modules and then for the
right reasons. Each AC needs a real assertion with its `@covers` tag. Done only
when both checkers produce exactly the expected diagnostics and all runtime and
capture tests pass, with evidence recorded.

US-082-AC6 also asserts three runtime bindings (MISSING/null/non-null): only omission removes the filter; equality to null yields UNKNOWN, while explicit is_null() selects nulls. Count only presence variants. Retain exact trusted module source and build-tool pins; no sandbox claim.

Join typing criteria additionally reject self/repeated/ambiguous Record paths and foreign RHS comparisons hidden under an otherwise valid owning predicate. Positive owner-set cases exercise one through four distinct to-one joins; optional-side projections must be nullable on all three checkers and match left-missing native rows.
