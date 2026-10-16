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
| `codecs.py` | Typed `encode_<Record>_create`, `encode_<Record>_patch`, `decode_<Record>`, projection and action codec functions, each a thin call into `umf_access` with the Record's generated metadata |
| `actions.py` | `<Action>` references, `<Action>Input`, `<Action>Output`, `<Action>Rejected`, and the generated `Actions` and `ReplayingActions` clients |
| `fields.py` | Also the `<Record>.s` search namespace and per-Record query roots with typed `update()` signatures |
| `__init__.py` | Public models, keys, actions; `MISSING` re-exported from Pydantic |

### Model configuration

Every generated model uses Pydantic 2 with `strict=True`, `extra="forbid"`,
`frozen=True`, `revalidate_instances="always"` and `hide_input_in_errors=True`.
No field alias, `validation_alias` or `serialization_alias` is generated; Python
attribute names are the constructor parameter names that type checkers see.
Generated classes are marked `typing.final`; their shared runtime base enforces the generated final-model metadata with a runtime subclass guard, so no subclass can restore hashing or bypass configuration. Generated classes contain no custom raise/validation branches.

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

The metadata-driven runtime validators MUST agree with UMF's `validateCoreFieldValue` and
`validateCoreRecordValues` on a shared golden-vector corpus for the value domains
those APIs define. Dates and timestamps instead use the explicitly selected
[CONTRACT-075 typed-access temporal profile](CONTRACT-075-access-temporal-profile.md):
date Fields select `date`, and timestamp Fields select the authored CONTRACT-070
`instant` or `local` kind. Python carriers are serialized losslessly to the
profile's tokens for oracle comparison; instant carriers normalize to UTC before
serialization. This profile does not change generic core temporal evaluation or
permit temporal Key components. Where validators cannot agree with the selected
oracle, the disposition is not `exact` and strict generation refuses.

### Keys

`<Record>Key` aliases the exact `RecordView.selectedKey` DTO. Each additionally referenced Key gets a distinct `<Record><KeyId>Key` DTO and identity; generation refuses a reference whose Key cannot be represented, rather than coercing alternate Keys. Each DTO preserves declared component order. Its constant `KEY_IDENTITY` is
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
another `Column[<Record>, T]` of the same owner and return `Predicate[<Record>]`, so a type checker
rejects wrong operand types and predicates over another Record. Because `Column`
overrides `__eq__`, it is unhashable; the narrower `__eq__` signature is an
intentional override whose checker diagnostic the `umf_access` runtime package
suppresses internally, so generated and developer code see none. Relationship
attributes are `Related[<Record>, TargetKey]`. `<Record>.s.<index>` exposes
CONTRACT-074 search indexes. `<Record>.objects` is a query root whose chaining
methods return `Self`; each Record's query root declares bulk `.update()` with one
explicit keyword-only parameter per mutable field, typed `T | MISSING` (plus
`None` when the field admits null) with default `MISSING`. Explicit parameters,
not `**values: Unpack[TypedDict]`, because ty does not reject unknown keys in
unpacked TypedDict keyword arguments. The query root of each Record
declares `.into()` as generated overloads that accept only that Record's declared
projection models (CONTRACT-067 `projections`), so a projection of another Record
fails type checking. CONTRACT-071 defines the full
surface and typing rules. Field expressions and
query roots build declarative query descriptions only; evaluating them outside a
CONTRACT-071 capture raises `QueryOutsideCatalog`. They never produce SQL.

### Actions

For each selected CONTRACT-900 action:

- `<Action>` is an immutable `ActionRef` constant with its input/output types and
  `source:{documentId,coreVersion,module,action,documentSha256,actionPointer,
  invocation:{id,version}}`. The digest is of the exact retained UTF-8 document
  source; the pointer identifies the original action declaration. Complete source
  context, not a same-named action, is its compilation identity. It is what
  `@command(action=...)` and executors receive. It is not an issued action revision,
  role grant, seal or authorization capability.
- `<Action>Input` has one field per parameter. Value parameters use their Field
  carrier; optional parameters are `T | MISSING`. Entity parameters are typed as
  the exact parameter-declared Key DTO, not an inferred primary Key.
- `<Action>Output` has one field per declared output; graph-write recipes have no
  business outputs and return the runtime's typed receipt instead.
- `Committed[<Action>Output]` also carries `created` and `changed`: tuples of the
  generated Key DTOs of the Records in the action's write frame.
- Every client method takes a keyword-only `timeout: timedelta | None = None`
  and raises `ActionTimedOut` only when positive original native/engine evidence establishes deadline expiry with no commit
  (CONTRACT-072 Timeouts).
- Each client method has a companion `<action>.validate(input, *, timeout=None) ->
  ValidationResult` (CONTRACT-072) that checks the input against the target
  without changing anything.
- `<Action>Rejected` is an exception carrying `code` typed as a `Literal` union of
  the action's failure codes plus reserved `ENTITY_MISSING`, and `retryable: bool` from the original classified result. Protocol refusals retain their separate exception types.
- The generated `Actions` class takes a CONTRACT-072 `ActionExecutor` and has one
  callable endpoint per action, `__call__(input: <Action>Input, *, timeout: timedelta | None = None) ->
  <Action>Committed` (output `None` for recipes without business
  outputs), with no idempotency key.
- The generated `ReplayingActions` class takes a CONTRACT-072
  `ReplayingActionExecutor` and has one method per action, `def <action>(self,
  input: <Action>Input, *, idempotency_key: str, timeout: timedelta | None = None) -> <Action>Committed`,
  with the key required. It delegates to `invoke_keyed`. Raw-table targets do not
  implement `ReplayingActionExecutor`, so type checking rejects them here.
- Both constructors check their executor against the runtime-checkable protocol
  and raise `TypeError` if it does not implement it, so a mis-wired executor
  refuses before any call.
- Client methods map CONTRACT-072 outcomes: `Committed` returns the output and
  receipt; `Replayed` returns or raises the original result; `Rejected` raises
  `<Action>Rejected`; `Denied` raises `ActionDenied`; `Conflict(retained)` raises
  `ActionConflict`; `TimedOut` raises `ActionTimedOut`; `Indeterminate` raises `ActionIndeterminate`. Every engine
  projection/exception retains CONTRACT-072's complete `original` result, safe
  code and original source/revision/recovery context. `ActionRefused`
  and `ActionFailed` raised by the executor propagate unchanged. Each method
  validates and encodes the input and delegates to the executor. It never
  constructs SQL.

Each named action endpoint is a generated typed descriptor exposing `__call__` and `validate`; the method signatures above describe its call surface. Sync/async overloads follow CONTRACT-072 and every timeout defaults to the target's required deadline. Static/runtime conformance must exercise both endpoint operations; the typing spike does not qualify them.

### Codecs and errors

Generated code is a thin typed layer: classes, signatures and inert metadata
tables (Field IDs, carriers, presence, facets, Key order, action markers).
Validation and conversion logic lives in the `umf_access` runtime and is driven by
that metadata, so a runtime fix within the pinned runtime ABI reaches every
generated package without regeneration. Generated code contains no hand-coded
validation branches beyond Pydantic field declarations.

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
refuses. `OrderCreate(order_id="o-1", amount=Decimal("125.5"), placed_at=datetime(2026, 10, 15, tzinfo=timezone.utc))` is valid for
`numeric(12,2)`; `Decimal("1.234")` refuses rather than rounding.
`Order.c.amount > "5"` fails type checking; comparing `Order.c.amount` with a
`Param[Decimal]` passes.

## Validation Checklist

- [ ] `MISSING`, strictness, revalidation and nested-mutation counterexamples pass on the pinned profile.
- [ ] Static positive/negative corpus passes on each pinned checker.
- [ ] Golden-vector agreement with UMF core validators.
- [ ] `ReplayingActions` over an `ActionExecutor`, and `.into()` with another Record's projection, fail type checking on each pinned checker.

### Action-specific committed result typing

Each selected action emits `<Action>Committed`, an immutable typed result view over `Committed[<Action>Output]`, with read-only `created` and `changed` properties narrowed to tuples of that action's exact possible Key DTO union (empty tuple type when none). The generated endpoint returns that named result rather than erasing it to generic Committed; recipes without output use output None. The shared runtime factory builds the view from the complete original result/metadata; generated source adds annotations, not conversion logic. The original net change inventory also retains deletion and link/unlink identities; the two convenient Key tuples never replace it. All three checkers must validate covariance/read-only narrowing and reveal exact tuple types under US-085-AC9 before this ABI qualifies.
