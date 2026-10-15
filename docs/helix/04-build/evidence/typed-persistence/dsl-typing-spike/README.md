# DSL typing spike (design-time evidence)

A throwaway prototype of the CONTRACT-071 query DSL surface and CONTRACT-068
generated models, used to check that pinned type checkers reject the CONTRACT-071
typing error table without plugins. It is not the `umf_access` implementation.

Recorded 2026-10-15 with Python 3.14.7, pydantic 2.14.1, pyright 1.1.414 and
mypy 2.4.0, in a scratch virtual environment outside this repository.

| File | Purpose |
| --- | --- |
| `dsl.py` | Minimal `Column`, `Param`, `Predicate`, `Query` and `if_present` |
| `shop/models.py` | Hand-written stand-in for generated `Order`, `OrderPatch`, `Customer` |
| `good.py` | Valid declarations; must type-check cleanly |
| `bad.py`, `e9.py` | One deliberate error per line; each must be rejected |
| `pyright.txt`, `mypy.txt` | Captured checker output |

Commands (run from this directory, with the scratch environment's binaries):

```sh
pyright --pythonpath <venv>/bin/python --pythonversion 3.12 dsl.py good.py bad.py e9.py
mypy --python-version 3.12 --check-untyped-defs dsl.py good.py bad.py e9.py
```

Results: both checkers report 12 errors, all in `bad.py` and `e9.py`, and none in
`dsl.py` or `good.py`. Each deliberate error is rejected by both checkers:

| Line | Error | Rejected by |
| --- | --- | --- |
| bad.py:6 | `Column[Order, Decimal] > "10"` | both (operator) |
| bad.py:7 | `Column[Order, Decimal] == "10"` | both (bool passed to `filter`) |
| bad.py:8 | `Customer` column in an `Order` query | both (`Predicate[Customer]` vs `Predicate[Order]`) |
| bad.py:9 | misspelled column | both (unknown attribute) |
| bad.py:10 | `update(amount="10")` | both (TypedDict value type) |
| bad.py:11 | `update(placed_at=...)` on immutable field | both (unknown keyword) |
| bad.py:12 | `Column[Order, datetime] >= Param[str]` | both (operator) |
| bad.py:13 | `select(Customer.c.name)` on `Order` | both (owner type) |
| bad.py:14, e9.py:3 | `OrderPatch(ammount=...)` | both (unknown keyword) |
| e9.py:4 | `Order(amount=1.5, placed_at=None)` | both (two argument types) |

Findings that shape the contracts:

- `Param` must be covariant, or comparing a nullable column with `Param[str]`
  falls back to `object.__eq__`.
- Chaining methods must return `Self`, or Record-specific methods such as
  `update` are lost after `filter`.
- `==` and `!=` with a wrong operand type fall back to `object.__eq__`; the error
  surfaces at the enclosing `filter`, not at the operator.
- mypy skips bodies of unannotated functions unless `check_untyped_defs` (or
  `--strict`) is set, and does not infer return types of unannotated functions.
  Profiles MUST pin that setting; generated catalog functions carry explicit
  signatures, so call sites are fully typed under both checkers.
- pyright must be run against the environment where Pydantic is installed;
  otherwise models resolve to unknown types and constructor errors are missed.
- Runtime checks on pydantic 2.14.1: `MISSING` is omitted from `model_dump`
  under `strict=True`; strict mode refuses float, string and bool for
  `Decimal`, and `datetime` for `date`; `frozen` refuses assignment; `ClassVar`
  attributes `c` and `objects` do not appear in the JSON schema.

Not yet covered by this spike (CONTRACT-071 forms that remain unqualified until a
later spike or the US-082 corpora exercise them on both pinned checkers):

- `if_present` with `Param[T | MISSING]`, including rejection of `Param[T | None]`.
- `group_by(...).count()`.
- `RankedQuery` and `Scored` (search result types).
- `include_keys` and its `WithKeys[R, K]` row type.
- `Page[R, K]` with `Continuation[K]`.
- Per-Record `.into()` overloads that accept only declared projection models.
