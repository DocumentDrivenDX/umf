---
ddx:
  id: CONTRACT-071
  type: contract
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-029
      kind: informed_by
    - id: ADR-004
      kind: informed_by
    - id: CONTRACT-067
      kind: informed_by
    - id: CONTRACT-068
      kind: informed_by
    - id: CONTRACT-902
      kind: informed_by
---

# CONTRACT-071: Precompiled query and command catalog

**Type:** Python DSL, build tool and catalog file. **Version:** proposed
`umf-access-catalog/0.1`.

## Purpose

Let developers write reads and bulk commands in a typed, Django/Entity Framework
style DSL over the generated models, and compile every one of them at build time
through Weft into a catalog of native statements per target. At runtime only
catalog entries execute and caller values reach the database only as bound,
validated parameters. No SQL is generated from runtime input.

## Scope and Boundaries

This is stage two of the build. It consumes a CONTRACT-067 package and developer
query modules, and calls Weft's Python binding as a build-time compiler. Weft owns
SQL dialects, lowering, backend bindings, parameter carriers and result decoders;
this contract never constructs native SQL itself. Execution belongs to
CONTRACT-072. Single-entity writes go through generated action clients
(CONTRACT-068), not this catalog. Ad-hoc runtime queries are out of scope for 0.1.

## Normative Surface

### Declaring queries and commands

Developers declare queries in ordinary Python modules using decorators from the
`umf_access` runtime package:

```python
from pydantic import MISSING
from umf_access import query, command, Param, if_present
from shop.models import Order, Customer, OrderSummary
from shop.keys import CustomerKey, OrderKey
from shop.actions import DeactivateCustomer

@query
def customer_orders(customer: Param[CustomerKey], status: Param[str | MISSING],
                    after: Param[OrderKey | None]):
    return (Order.objects
            .filter(Order.c.customer.has(customer),
                    if_present(status, lambda s: Order.c.status == s))
            .into(OrderSummary)
            .page(size=50, after=after))

@command(action=DeactivateCustomer)
def deactivate_stale(cutoff: Param[int]):
    return Customer.objects.filter(Customer.c.last_seen < cutoff).update(active=False)
```

A decorated function's parameters MUST all be annotated `Param[T]`, where `T` is
a CONTRACT-068 carrier, Key DTO, or either combined with `None` or `MISSING`. Its
body MUST be a pure expression over generated field expressions, query roots,
parameters and literals, ending in a terminal. Capture calls it once with symbolic
parameters; any I/O, randomness or dependence on mutable global state is outside
the contract, and the tool captures twice and refuses differing results with
`CAPTURE_NONDETERMINISTIC`.

### Conventions

The system is schema-first. Every column, relationship and search index is a
generated, typed attribute; there are no string column references, keyword lookup
strings (`amount__gt`), string ordering specs (`"-placed_at"`) or query-text
methods anywhere in the DSL. Hosts that need free-form SQL use their platform's
own tools outside this SDK.

Names follow the expression-first libraries Python data developers already use,
in PEP 8 snake case:

| Concept | This DSL | SQLAlchemy 2.0 | Django | PySpark | Polars | Ibis |
| --- | --- | --- | --- | --- | --- | --- |
| Column | `Order.c.amount` | `Order.amount`, `table.c.amount` | `"amount"`, `F("amount")` | `F.col("amount")` | `pl.col("amount")` | `t.amount` |
| Filter | `.filter(*preds)`; `.where` alias | `.where()`; `.filter()` alias | `.filter(**lookups)` | `.filter()` / `.where()` | `.filter()` | `.filter()` |
| Combine | varargs AND; `&`, `|`, `~` | `and_`, `or_`, `&`, `|` | `Q() & Q()` | `&`, `|`, `~` | `&`, `|`, `~` | `&`, `|`, `~` |
| Null test | `.is_null()`, `.is_not_null()` | `.is_(None)` | `__isnull` | `.isNull()` | `.is_null()` | `.isnull()` |
| Membership | `.is_in(p)` | `.in_()` | `__in` | `.isin()` | `.is_in()` | `.isin()` |
| Range | `.between(lo, hi)` | `.between()` | `__range` | `.between()` | `.is_between()` | `.between()` |
| Projection | `.select(*cols)` (typed tuple), `.into(Model)` | `select(*cols)` | `.values()`, `.only()` | `.select()` | `.select()` | `.select()` |
| Ordering | `.order_by(col.asc()/.desc())` | `.order_by(col.desc())` | `.order_by("-x")` | `.orderBy(col.desc())` | `.sort()` | `.order_by()` |
| Limit and pages | `.limit(n)`, `.page(size, after)` | `.limit()` | slicing | `.limit()` | `.head()`, `.limit()` | `.limit()` |
| Grouped counts | `.group_by(*cols).count()` | `group_by` + `func.count` | `.values().annotate()` | `.groupBy().count()` | `.group_by().len()` | `.group_by().count()` |
| Terminals | `.all()`, `.first()`, `.one()`, `.get(key)`, `.count()`, `.exists()`, `.page()` | `.all()`, `.first()`, `.one()` | `.first()`, `.get()`, `.count()`, `.exists()` | `.collect()`, `.first()`, `.count()` | `.collect()` | `.execute()` |
| Bulk update | `.update(**typed)` | `update().values()` | `.update(**kw)` | n/a | n/a | n/a |

Deliberate choices:

- `filter` is canonical because Django, PySpark, Polars and Ibis share it;
  `where` is an exact alias for SQLAlchemy and Spark SQL users.
- `when` is reserved for a future CASE expression, matching PySpark and Polars.
  Optional filters use `if_present(param, lambda value: predicate)`.
- `c` follows SQLAlchemy Core's `table.c`. A separate namespace is required
  because Pydantic row-model attributes are instance values to type checkers;
  `Order.c.amount` is a `Column[Order, Decimal]`, while `order.amount` is a
  `Decimal`.
- Builders are immutable and every chaining method returns `Self`, as in
  SQLAlchemy, Polars and Ibis. Declarations are not lazily executed querysets;
  they run only through the generated catalog functions.
- Predicates raise `TypeError` from `__bool__`, so `and`, `or`, `not` and chained
  comparisons (`a < x < b`) fail loudly, as in SQLAlchemy, pandas and Polars.
- Pandas-style boolean masks and `query()` strings are not offered.

### Typing rules

Static checking is the first gate after generation; the DSL is designed so that a
pinned type checker (pyright and mypy, both without plugins) rejects these errors
before any build or run. Profiles MUST pin mypy's `check_untyped_defs` (or
`strict`), because mypy otherwise skips unannotated function bodies, and MUST run
pyright in the environment where the pinned dependencies are installed. The
[DSL typing spike](../../04-build/evidence/typed-persistence/dsl-typing-spike/README.md)
records both checkers rejecting every row below:

| Error | How it is rejected |
| --- | --- |
| Unknown or misspelled column | `Order.c.ammount` is an unknown attribute |
| Wrong operand type | `Column[Order, Decimal] > "10"` has no matching operator overload |
| Wrong parameter type | `Column[Order, datetime] >= Param[str]` has no matching overload |
| Column from another record | `Column` and `Predicate` are generic over the owning Record; `Order.objects.filter(Customer.c.name == x)` is a `Predicate[Customer]` where `Predicate[Order]` is required |
| Wrong `==` / `!=` operand | Python falls back to `object.__eq__` returning `bool`; the enclosing `filter` rejects `bool` |
| Unknown, generated or immutable update field, or wrong value type | `.update(**values: Unpack[<Record>Update])` with a generated `TypedDict` of mutable fields |
| Wrong query arguments at call sites | Generated catalog functions have exact keyword signatures and return types |
| Wrong result use | Generated catalog functions declare exact return types: `.all()` gives `list[R]`, `.first()` gives `R | None`, `.select(a, b)` gives `tuple[A, B]` rows, `.page()` gives `Page[R, K]`. Inside declaration modules pyright infers these; mypy infers `Any` for unannotated declarations, so call sites, not declarations, carry this guarantee |
| Projection of another Record | `.into()` on each Record's query root is a set of generated overloads accepting only that Record's declared projection models |
| `None` passed as "absent" to an optional filter | `if_present` accepts only `Param[T | MISSING]`; a no-`MISSING` parameter selects an invalid-filter marker that the enclosing `filter` rejects |

`Param` is covariant, so a `Param[str]` is accepted where a nullable string column
is compared. `.select` overloads cover up to eight columns; wider projections use
a declared projection model with `.into`.

Result and helper types:

- `Page[R, K]` carries `items: tuple[R, ...]` and `next_after: Continuation[K] |
  None`, where `K` is the Record's Key DTO. `Continuation[K]` records the target
  identity digest (CONTRACT-072); passing it to a target with a different identity
  raises `StaleContinuation`.
- `.include_keys(rel, limit=n)` changes the row type from `R` to `WithKeys[R, K]`,
  with `row: R` and `keys: RelatedKeys[K]`, where `RelatedKeys[K]` has
  `items: tuple[K, ...]` and `truncated: bool` (true when more than `n` related
  keys exist). Like `.select` and `.into`, it returns a new query type rather than
  `Self`.
- `if_present(p, f)` accepts only parameters whose declared union includes
  `MISSING`. Ordered overloads give a parameter without `MISSING` an
  `InvalidOptionalFilter` result, rejected by the enclosing `filter`; the runtime
  keeps any required overlap diagnostic suppression internal. Capture also
  rejects a parameter whose declaration excludes `MISSING`. `None` is a value,
  meaning `IS NULL` where the column admits null; it never means "absent".
- `Column` overrides `__eq__`, which makes it unhashable. The narrower `__eq__`
  signature is an intentional override; the `umf_access` runtime package
  suppresses the checker's override diagnostic internally, so developer code sees
  none.

Not yet covered by the typing spike, and therefore unqualified until the B-TP-001
compatibility spike or the US-082 corpora show them on both pinned checkers:
`if_present` with `MISSING`, `group_by().count()`, `RankedQuery` and `Scored`,
`include_keys`, `Page[R, K]`, and the per-Record `.into()` overloads.

Refactoring is driven from the schema. Renaming, retyping or removing a Field in
UMF (or changing its Python name through CONTRACT-067 `names`) and regenerating
makes the type checker report every affected query declaration and call site; the
manifest diff classifies each change as source-compatible, value-compatible or
breaking. A `names` override keeps a Python name stable when an authored ID
changes, and an authored ID stable when a Python name is improved. Generated
column attributes carry docstrings citing their UMF source pointer, so editor
go-to-definition reaches the authored meaning.

The remaining gates, in order, are the catalog build (forms Weft cannot compile
for every selected target, unbounded reads, invalid ordering), target `verify()`
before first use (CONTRACT-072) and codec validation of every bound value.

### DSL surface in 0.1

The 0.1 surface is the form set UMF requested from Weft in
[the Weft requirements](../../04-build/weft-requirements-typed-access.md)
(tranche A), and its meaning follows that document's shared semantics S1 to S10:
SQL three-valued logic, explicit null placement, binary string order, exact
numeric and instant comparison, and a complete-Key tiebreak on every ordering.
Generated types expose every form below. Each catalog target either compiles a
form or refuses it at build time with `WEFT_BLOCKED`, naming the missing Weft
requirement; a type-checked declaration may therefore still refuse on a target
whose backend has not yet delivered that requirement.

| DSL | Meaning | Weft requirement |
| --- | --- | --- |
| `M.objects.filter(*preds)`, `.where(...)` | Conjunction of predicates | existing |
| `==`, `!=`, `<`, `<=`, `>`, `>=`, `.between(a, b)` | Comparisons (S4, S9) | WR-A1 (`==`, `>` exist today) |
| `.is_null()`, `.is_not_null()`, `.is_missing()`, `.is_present()` | Null and missing tests (S3); missing tests only on property stores | WR-A2 |
| `&`, `|`, `~`, `and_`, `or_`, `not_` | Boolean structure with three-valued logic (S2) | WR-A3 |
| `.is_in(p)`, `.not_in(p)` | Membership with a list parameter (S8) | WR-A4 |
| `.order_by(col.asc()/.desc(), ...)`, `.nulls_first()`, `.nulls_last()` | Ordering with explicit null placement (S5, S6) | WR-A5 |
| `.limit(n)`, `.all()`, `.first()`, `.one()` | Bounded lists, `n` ≤ 1,000 | WR-A5 |
| `.page(size=n, after=c)` | Keyset page in the declared ordering (S7) | existing for ascending Key order; WR-A6 otherwise |
| `.get(key)` | Single entity by Key | existing |
| `.count()`, `.exists()`, `.group_by(*cols).count()` | Exact counts and existence over any predicate | existing for equality filters; WR-A7 otherwise |
| Date, instant and local timestamp parameters and comparisons | Temporal filters (S4) | WR-A8 |
| `.related(M.c.rel)`, `M.c.rel.has(key)`, `.include_keys(M.c.rel, limit=n)` | Relationship navigation | existing |
| `.select(*cols)`, `.into(P)` | Typed tuple or declared projection | existing |
| `if_present(p, f)` | Optional filter applied only when `p` is not `MISSING` | variant expansion (no Weft change) |
| `.filter(...).update(**values)` | Bulk update through the named action, including `None` for nullable Fields | existing for string/boolean equality; WR-A9, WR-I5 otherwise |
| `.search(...)` | Ranked search (CONTRACT-074) | tranche C |

`include` of full related rows is expressed as two catalog queries (keys, then
`get` or `has`). Each optional filter doubles the variant count; a query may
expand to at most 16 variants, each compiled separately. Adding a form to the
DSL after 0.1 requires a matching Weft requirement first.

### Build tool

`umf-access catalog` takes an explicit configuration `{package, modules,
targets, weft:{distribution,version}, umf:{documents}}`:

- `modules` is an explicit ordered list of importable query modules; no package
  scanning or entry-point discovery.
- `targets` is an ordered list of `{id, backendId, backendVersion,
  targetProfile, bindingSource, platform, security, roleMappings,
  administrativeSingleTenant}`. `platform` names the CONTRACT-072 target kind and
  its pinned versions. `security` names the pinned `umf.security` policy and
  ontology source that Weft's compiler (0.5) requires; it is part of the request
  identity and its digest. `roleMappings` is an exact map from each action role ID
  to one native role or group name, used by CONTRACT-073; it may be empty when no
  selected action has role authorization. `administrativeSingleTenant` is a
  boolean, valid only for `spark-delta` targets, that declares the target
  single-tenant administrative for CONTRACT-073 authorization; it defaults to
  false. `sessionPrincipal` is `human` or `service` and declares what the host's
  connections for this target authenticate as (per-user connections or a service
  account); it governs CONTRACT-073 attribution. None of these is inferred, and the
  SDK never creates or inspects connections to check them.
- Compilation renders each captured query to canonical Weft SQL text using the
  authored module `namespace`, Record `name` and member Field `name`, as required
  by Weft's logical name resolver. Generated metadata retains those names
  separately from exact module/element/Field identities and Python `names`
  overrides. Missing or ambiguous logical names refuse; IDs and Python names
  MUST NOT be substituted. Compilation submits that text
  with the pinned UMF documents, the target binding and the target's `security`
  source to the pinned Weft version, and records Weft's response. A blocked response for any variant on any target
  fails the build with Weft's diagnostics retained.
- Commands compile through Weft's mutation compiler against the named action's
  CONTRACT-902 plan-model preparation, using witness parameter values of the
  correct carriers. The catalog records the lowered statement template and its
  structural digest (Weft output with parameter values removed).

Actions are compiled too. For every raw-table target (CONTRACT-073), the tool
compiles each action selected in the stage-one package through Weft's action
lowering into a catalog entry of kind `action`. Engine targets (CONTRACT-069) get
no action entries; their adapters execute actions through the engine.

Stage two owns exactly three reserved paths inside the stage-one package:
`<package>/queries.py`, `<package>/_umf/catalog.json` and
`<package>/_umf/catalog-manifest.json`. CONTRACT-067 reserves these paths and its
writer and drift check ignore them. The catalog manifest records an inventory of
the stage-two files and the stage-one `inputDigest` the catalog was built
against; if the checked-in stage-one manifest has a different digest the catalog
is stale and `umf-access catalog --check` fails with `CATALOG_STALE`. Stage two
uses the same hand-edit refusal and staging rules as CONTRACT-067.
`umf-access catalog --check` recompiles and fails on any byte difference.

### Catalog entries

`catalog.json` holds, per declaration (query, command or action) and target, `{name, kind, targetId, weft:{version,
backendId, backendVersion, targetProfile, bindingSha256}, umfPins, variants}`.
Each variant is `{presence, logicalSql, request, artifact, parameters:{name,
carrier}[], outputs, obligations, structuralDigest}`:

- `presence` lists which optional parameters are present.
- `logicalSql` is the canonical Weft logical SQL text submitted for the variant.
- `request` is the full Weft request identity: `{interface, dialect, readProfile,
  securityDigest}`, where `securityDigest` is the digest of the target's
  `security` source.
- `artifact` is the backend-specific execution artifact. For raw-table targets it
  is `{kind:"native-sql", sql}`, the native statement text. For Truss it is Weft's
  page artifact, `{kind:"truss-page", ...}` as Weft emits it, whose page size and
  continuation are arguments of Truss's read API rather than a SQL `LIMIT`.
- `outputs` is Weft's ordered result descriptor list with decoders, and
  `obligations` are Weft's host obligations, retained verbatim.

Action entries (`kind:"action"`, raw-table targets only) have no variants. An
executable action entry is `{name, kind, targetId, weft, umfPins, action:{module,
id}, logicalRequest, program, parameters, outputs, preconditions, roleChecks,
receipt, tables, obligations, structuralDigest}`:

- `program` is the ordered list of native statements Weft lowered (one statement,
  or one atomic block on Unity Catalog), each with its parameter bindings.
- `preconditions` maps each Weft-declared precondition marker (for example a
  declared SQLSTATE or result column) to the action's failure code; `roleChecks`
  names the marker for a failed role check. The runtime maps only these recorded
  markers and never parses error text.
- `receipt` names how the receipt is captured (for example
  `pg_current_xact_id()` before COMMIT).
- `tables` lists every table the program touches, for `verify()` and review.

An action the target cannot run is recorded as a non-executable entry `{name,
kind, targetId, refusal:{code, diagnostics}}`, so the runtime raises
`ActionRefused` with the build-time reason instead of `NotCompiledForTarget`.

`queries.py` exposes one typed function per declaration:

```python
def customer_orders(target: ReadTarget, *, customer: CustomerKey,
                    status: str | MISSING = MISSING,
                    after: Continuation[OrderKey] | None
                    ) -> Page[OrderSummary, OrderKey]: ...
def deactivate_stale(target: BulkTarget[P], *, cutoff: int) -> P: ...
```

A `Param[K | None]` page cursor in a declaration becomes a `Continuation[K] |
None` argument of the generated function; the runtime checks the continuation's
identity digest and binds its complete ordered continuation values, including
the Key, under shared semantics S7. Bulk functions return the plan type of their
target (CONTRACT-072 `AtomicBulkPlan` or `ManifestBulkPlan`).

### Runtime rules

- Only catalog entries execute. The runtime selects the variant from parameter
  presence, validates every argument with CONTRACT-068 codecs, and binds it as a
  native parameter. Values are never interpolated into SQL text.
- A continuation passed as `after` MUST carry the current target's identity
  digest; otherwise the call raises `StaleContinuation` before any statement.
- The target's identity MUST match the entry's `weft`, binding and platform pins
  under the CONTRACT-072 matching rule (exact fields, platform versions in their
  pinned sets); otherwise `NotCompiledForTarget`.
- Host obligations recorded by Weft (session settings, search path, isolation,
  decoding rules) MUST be enforced by the CONTRACT-072 target before execution.
- Bulk commands return a `BulkPlan`. Because Weft's mutation plans embed
  constant values, the target instantiates the plan by calling the pinned Weft
  compiler with the catalog's SQL template and the validated parameter values,
  then MUST verify that the lowered selection's structural digest equals the
  catalog's. A mismatch refuses with `PLAN_DRIFT`. This is the only runtime use of
  Weft; a Weft plan-template capability that binds values without recompilation
  is the intended replacement.

### Bounds

At most 1,000 declarations per package, 16 variants per declaration, 64
parameters per declaration and Weft's own statement and plan bounds.

## Precedence and Compatibility

Weft's dialect, profiles and backend contracts govern what compiles and how
results decode; UMF action contracts govern bulk commands. Regenerating the
catalog against a different Weft, backend, binding or UMF pin is a new catalog;
entries never upgrade themselves. Adding a DSL form requires the corresponding
Weft capability first.

## Error Semantics

| Code | Condition |
| --- | --- |
| `CAPTURE_SIGNATURE` | A parameter is not annotated `Param[T]` with a supported carrier |
| `CAPTURE_UNSUPPORTED` | The body uses a DSL form not available in 0.1 |
| `CAPTURE_NONDETERMINISTIC` | Two captures differ |
| `WEFT_BLOCKED` | Weft refused a variant on a target (diagnostics retained) |
| `VARIANT_LIMIT` | More than 16 variants |
| `OUTPUT_CHANGED` | Checked-in catalog differs from its manifest |
| `NotCompiledForTarget` | Runtime target does not match any entry pin |
| `PLAN_DRIFT` | Runtime plan instantiation changed statement structure |
| `CATALOG_STALE` | The catalog was built against a different stage-one package |
| `StaleContinuation` | Runtime continuation produced by a target with a different identity digest |

## Examples

`customer_orders` compiles two variants (with and without `status`) for each
target. Calling it with a `status` value of `"x' OR 1=1"` binds that string as a
parameter; it can only fail to match. Calling it against a target compiled for
Truss runtime binding 0.4 when the target reports 0.5 raises
`NotCompiledForTarget`.

## Validation Checklist

- [ ] Capture determinism, signature and unsupported-form refusals have fixtures.
- [ ] Every DSL row has a positive and a Weft-blocked negative case per target.
- [ ] Runtime refuses unpinned targets, plan drift and stale continuations; no runtime path accepts SQL text.
- [ ] Every variant records logical SQL, the full Weft request identity and its execution artifact.
