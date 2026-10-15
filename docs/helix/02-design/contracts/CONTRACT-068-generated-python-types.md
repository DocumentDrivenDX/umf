---
ddx:
  id: CONTRACT-068
  type: contract
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-028
      kind: informed_by
    - id: CONTRACT-067
      kind: informed_by
    - id: CONTRACT-070
      kind: informed_by
---

# CONTRACT-068: Generated Python types and codecs

**Type:** generated library ABI. **Version:** proposed `umf-python-types/0.1`.

## Purpose

Define the Python types and codecs emitted by CONTRACT-067: record models, Key
DTOs, projections, typed field expressions for the query DSL, action input/output
and failure types, and the codecs that move values between Python and the
transport carriers of CONTRACT-072. All imports MUST be free of I/O.

## Scope and Boundaries

Generated modules are ordinary Python source. Pydantic validates instance values;
codecs own every conversion to and from authored Field IDs and transport carriers.
Generated code holds no connection, session, transaction, SQL text or execution
policy, and declares no SQLAlchemy or PySpark mappings. Native statements come
only from the CONTRACT-071 catalog; execution belongs to CONTRACT-072 targets.

## Normative Surface

### Generated modules

| Module | Exports |
| --- | --- |
| `models.py` | Row model `<Record>`, `<Record>Create`, `<Record>Patch`, named projection models |
| `keys.py` | `<Record>Key` DTOs with `KEY_IDENTITY` |
| `fields.py` | Typed field expressions attached as `<Record>.c` and the `<Record>.objects` query root |
| `codecs.py` | `encode_<Record>_create`, `encode_<Record>_patch`, `decode_<Record>`, projection and action codecs |
| `actions.py` | `<Action>` references, `<Action>Input`, `<Action>Output`, `<Action>Rejected`, and the generated `Actions` and `ReplayingActions` clients |
| `fields.py` | Also the `<Record>.s` search namespace and `<Record>Update` TypedDicts |
| `__init__.py` | Public models, keys, actions; `MISSING` re-exported from Pydantic |

### Model configuration

Every generated model uses Pydantic 2 with `strict=True`, `extra="forbid"`,
`frozen=True`, `revalidate_instances="always"` and `hide_input_in_errors=True`.
No field alias, `validation_alias` or `serialization_alias` is generated; Python
attribute names are the constructor parameter names that type checkers see.
Generated classes are marked `typing.final` and define `__init_subclass__` to
raise `TypeError`, so no subclass can restore hashing or bypass configuration.

Codec boundaries revalidate the complete value graph from raw attribute values
rather than trusting a previously constructed instance, `model_construct` or
`model_copy(update=...)`. Frozen models do not make nested lists or dicts
immutable; revalidation is what detects invalid nested state.

### Presence

Absence uses Pydantic's `MISSING` sentinel (stable since Pydantic 2.14). A field
whose CONTRACT-070 view admits `missing` is typed `T | MISSING` (or
`T | None | MISSING` when null is also admitted) with default `MISSING`; a field
admitting only null is typed `T | None` with no default; a required field is `T`
with no default. Patch fields are always `T | MISSING` (plus `None` when
`create.null` is true) with default `MISSING`. Generated fields are absent from
Create and Patch, immutable fields are absent from Patch, and either is rejected
as an extra where absent.

The profile's compatibility spike MUST show that `MISSING` behaves as specified
under strict validation and the pinned checkers. If it does not, the profile is
unqualified; ABI 0.1 has no alternative sentinel.

Codecs omit `MISSING` and keep explicit `None`. An empty Patch encodes `{}` and
is a no-op value, not a write instruction. Literal UMF defaults are never Python
defaults: Create and Patch values are pre-default inputs, and default execution
is an engine obligation recorded in the manifest.

### Value policy

| Core meaning | Python carrier and rule |
| --- | --- |
| Boolean | `bool`; integer and string substitutes refuse |
| Integer | `int`, excluding `bool`; bounds only from the authored Field's width facet, never from a target type |
| Exact decimal | `Decimal`; finite only; accept iff the coefficient is representable at the declared scale and precision without rounding (`1.2`, `1.20` and `1.200` are equal at scale 2 per CONTRACT-040); checked with `Decimal.as_tuple()`, never Pydantic `decimal_places` or ambient context; the carrier is not quantized |
| String | `str`; lone surrogates refuse (CONTRACT-049); length and allowed values checked without normalization |
| Binary | `bytes` |
| Date | `datetime.date`, excluding `datetime.datetime` instances |
| Timestamp, `temporal: instant` | aware `datetime`, any fixed offset, normalized to UTC by codecs; microsecond precision; finer precision refuses |
| Timestamp, `temporal: local` | naive `datetime`; a timezone is never attached |
| Arrays, maps | ordered `tuple`/`list` and `dict` with item/value carriers from CONTRACT-070 |
| Embedding vector | `Vector`: fixed-dimension tuple of finite float32 values, only for Fields referenced by a CONTRACT-074 vector index |
| Other floating point | not supported in 0.1; selecting such a Field refuses with `LOSS` |

Generated validators MUST agree with UMF's `validateCoreFieldValue` and
`validateCoreRecordValues` on a shared golden-vector corpus. Where they cannot,
the disposition is not `exact` and strict generation refuses.

### Keys

`<Record>Key` preserves declared component order. Its constant `KEY_IDENTITY` is
`{documentId, coreVersion, module, element, key}`, matching UMF's
`CoreKeyIdentity` plus document and core identity; it carries no build digest.
The manifest's input digest is exposed separately as `BUNDLE_INPUT_DIGEST`. Key
models set `__hash__ = None`; Python equality of DTOs is not UMF Key equality,
and no key-byte encoder is generated. Byte encodings remain the existing
CONTRACT-040 `umf-key-tuple-v1` codec owned by consumers.

A Key with a `date` or `timestamp` component refuses in 0.1 (CONTRACT-070
`ACCESS_CONFLICT`), because CONTRACT-040 leaves temporal key equality unspecified
and requires it to block.

### Field expressions

`<Record>.c.<field>` is a `Column[<Record>, T]` (the `c` namespace is a `ClassVar`
on the row model). Its comparison operators accept `T`, a covariant `Param[T]` or
another `Column[Any, T]` and return `Predicate[<Record>]`, so a type checker
rejects wrong operand types and predicates over another Record. Because `Column`
overrides `__eq__`, it is unhashable; the narrower `__eq__` signature is an
intentional override whose checker diagnostic the `umf_access` runtime package
suppresses internally, so generated and developer code see none. Relationship
attributes are `Related[<Record>, TargetKey]`. `<Record>.s.<index>` exposes
CONTRACT-074 search indexes. `<Record>.objects` is a query root whose chaining
methods return `Self`; `<Record>Update` is a generated `TypedDict` of mutable
fields used to type bulk `.update(**values)`. The query root of each Record
declares `.into()` as generated overloads that accept only that Record's declared
projection models (CONTRACT-067 `projections`), so a projection of another Record
fails type checking. CONTRACT-071 defines the full
surface and typing rules. Field expressions and
query roots build declarative query descriptions only; evaluating them outside a
CONTRACT-071 capture raises `QueryOutsideCatalog`. They never produce SQL.

### Actions

For each selected CONTRACT-900 action:

- `<Action>` is an immutable `ActionRef` constant naming the action's module and
  ID and its input and output types. It is what `@command(action=...)` and
  executors receive.
- `<Action>Input` has one field per parameter. Value parameters use their Field
  carrier; optional parameters are `T | MISSING`. Entity parameters are typed as
  the target Record's Key DTO.
- `<Action>Output` has one field per declared output; graph-write recipes have no
  business outputs and return the runtime's typed receipt instead.
- `<Action>Rejected` is an exception carrying `code` typed as a `Literal` union of
  the action's failure codes and `retryable: bool` from the declaration.
- The generated `Actions` class takes a CONTRACT-072 `ActionExecutor` and has one
  method per action, `def <action>(self, input: <Action>Input) ->
  Committed[<Action>Output]` (`Committed[None]` for recipes without business
  outputs), with no idempotency key.
- The generated `ReplayingActions` class takes a CONTRACT-072
  `ReplayingActionExecutor` and has one method per action, `def <action>(self,
  input: <Action>Input, *, idempotency_key: str) -> Committed[<Action>Output]`,
  with the key required. It delegates to `invoke_keyed`. Raw-table targets do not
  implement `ReplayingActionExecutor`, so type checking rejects them here.
- Both constructors check their executor against the runtime-checkable protocol
  and raise `TypeError` if it does not implement it, so a mis-wired executor
  refuses before any call.
- Client methods map CONTRACT-072 outcomes: `Committed` returns the output and
  receipt; `Replayed` returns or raises the original result; `Rejected` raises
  `<Action>Rejected`; `Denied` raises `ActionDenied`; `Conflict(retained)` raises
  `ActionConflict`; `Indeterminate` raises `ActionIndeterminate`. `ActionRefused`
  and `ActionFailed` raised by the executor propagate unchanged. Each method
  validates and encodes the input and delegates to the executor. It never
  constructs SQL.

### Codecs and errors

`encode_*` functions return new `dict[str, object]` keyed by authored Field IDs,
carrying CONTRACT-072 transport carriers. `decode_*` functions accept the ordered
column inventory and row values produced by a CONTRACT-072 target, reject
duplicate or missing columns before building any mapping, and revalidate.
Validation and conversion raise `ValueError` subclasses whose messages name the
field and rule without input values. Pydantic's `.errors()` includes input unless
called with `include_input=False`; generated code and documentation MUST NOT log
it. Pydantic's generic `model_dump` and `model_validate_json` are not persistence
or admission boundaries.

## Precedence and Compatibility

Core contracts and CONTRACT-070 own meaning; Python carriers never weaken authored
constraints. Source, value and installed-target compatibility are evaluated
separately on regeneration (CONTRACT-067).

## Error Semantics

| Error | Raised when |
| --- | --- |
| `ValueError` (including Pydantic `ValidationError`) | An instance value violates its carrier or view |
| `QueryOutsideCatalog` | A field expression or query root is evaluated outside capture |
| `<Action>Rejected` | The target reports an admitted business rejection with a declared code |
| `TypeError` | An `Actions` or `ReplayingActions` client is constructed with an executor that does not implement the required protocol |

Native transport, authorization and transaction exceptions belong to CONTRACT-072
and are never translated into empty results or success.

## Examples

With the CONTRACT-070 `Order` view: `OrderPatch()` encodes `{}`;
`OrderPatch(memo=None)` encodes `{"memo": None}`; `OrderPatch(amount=None)`
refuses. `OrderCreate(order_id="o-1", amount=Decimal("125.5"))` is valid for
`numeric(12,2)`; `Decimal("1.234")` refuses rather than rounding.
`Order.c.amount > "5"` fails type checking; comparing `Order.c.amount` with a
`Param[Decimal]` passes.

## Validation Checklist

- [ ] `MISSING`, strictness, revalidation and nested-mutation counterexamples pass on the pinned profile.
- [ ] Static positive/negative corpus passes on each pinned checker.
- [ ] Golden-vector agreement with UMF core validators.
- [ ] `ReplayingActions` over an `ActionExecutor`, and `.into()` with another Record's projection, fail type checking on each pinned checker.
