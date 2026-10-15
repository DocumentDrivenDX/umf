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
    - id: FEAT-029
      kind: informed_by
    - id: FEAT-030
      kind: informed_by
    - id: CONTRACT-067
      kind: informed_by
---

# CONTRACT-068: Generated Python and backend access

**Type:** generated library. **Version:** proposed `umf-python-access/0.1`.

## Purpose

Define generated application types and backend mappings with explicit static,
validation and native-enforcement limits. All imports MUST be free of I/O.

## Scope and Boundaries

Generated modules are ordinary Python source, consumed without the compiler or
UMF document package. Pydantic validates selected instance values; SQLAlchemy
provides optional PostgreSQL mappings; PySpark supplies native Spark schemas.
No generated object owns a connection, session, pool, transaction or publication.
Application code MUST preserve consumer admission before privileged operations.

## Normative Surface

### Generated modules

| Module | Export / meaning |
| --- | --- |
| `models.py` | `<Record>Row`, `<Record>Create`, `<Record>Patch`, `<Key>Key`, named `<Projection>Row` Pydantic models |
| `presence.py` | `Unset` enum with sole member `TOKEN`; exported singleton `UNSET = Unset.TOKEN` |
| `codecs.py` | Trusted generated validation/conversion functions, no I/O |
| `admission.py` | Pure `check_<Record>_schema(observation) -> SchemaMatch` and named-projection equivalents for backend targets |
| `postgresql.py` | Optional `<Record>Entity`, `<Record>Table`, and `decode_<Record>(mapping, match) -> <Record>Row` |
| `spark.py` | Optional `schema_<Record>() -> StructType`, `decode_<Record>(mapping, match) -> <Record>Row` |
| `__init__.py` | Public models/presence only; backend modules require explicit import |

Generated record/key/projection names derive only through CONTRACT-067 naming.
Missing target bindings omit backend modules rather than inventing storage.
Profiles MUST document which model variants exist for each selected record.
Unsupported variants refuse when requested by that target profile.

### Python model semantics

All models use Pydantic 2 strict validation, forbidden extra instance fields,
validated defaults and explicit aliases to authored Field IDs. Unknown schema
metadata remains in `sources.json`; this does not authorize unknown row fields.
Instance extras may be retained only through a separately authored, typed map
Field. Generated classes are frozen; nested mutation is not assumed impossible.
Every codec boundary MUST revalidate the supplied value graph, including existing
model instances, rather than trusting previous construction or `model_construct`.

Row models describe the complete explicitly bound storage/result view. Core
nullability is ideal availability, not Python presence. CONTRACT-067 valueBindings
MUST choose omission/null carriers separately for row and input views; no core
label alone introduces `None` or UNSET. A row field permitting null but not
omission accepts explicit `None` and requires its key. Create omission is allowed
only by its explicit input-view binding. Database expressions and literal UMF
defaults are not Python defaults. Generated/read-only fields are omitted from Create/Patch and
rejected as extras. Patch models use `T | Unset` with default `UNSET`; `None` is
included only if the explicit input view permits null. An empty patch is a no-op value,
not a write instruction. Immutable key changes require a separately authored
operation and are excluded from the initial Patch subset. The compiler preserves
all literal default triggers (`missing`, `null`, `missing-or-null`) without
executing them. Encoded Create/Patch values are pre-default inputs, not validated
post-default stored rows. Default execution is an undischarged engine obligation;
its disposition MUST NOT claim client enforcement. Row decoding validates the
actual resulting stored view separately. No constructor/default factory inserts
an authored literal or fills a missing Key component.

`encode_<Record>_create(value)` and `encode_<Record>_patch(value)` return new
`dict[str, object]` values using authored IDs as keys. They revalidate and omit
UNSET, retain explicit None, and retain exact Python value carriers. Backend
transport encoding is separate. Wire payloads MUST NOT serialize the sentinel
as a string, null, ordinal or JSON object. Pydantic's generic `model_dump` is not
the persistence encoder; generated documentation and examples MUST use codecs.

The first profile supports finite local records, homogeneous arrays, string-keyed
maps and explicitly discriminated unions. Recursive Python models require a
qualified cycle profile; initial unsupported cycles refuse. Arbitrary native
JSON Schema keywords/DDD invariants MUST NOT be treated as Pydantic rules merely
because a similar keyword exists.

### Value policy

| Meaning | Python carrier and exact initial rule |
| --- | --- |
| Boolean | `bool`; integer/string substitutes refuse |
| Integer | `int`, excluding `bool`; apply authored/target width before binding |
| Exact decimal | `Decimal`; finite only; reject float input and any precision/scale change; check without ambient-context rounding |
| String | `str`; authored length/allowed values checked without Unicode/collation normalization |
| Binary | `bytes`; explicit wire encoding belongs to a locked codec |
| Date | `date` excluding `datetime`; calendar/range must match target profile |
| Instant | aware `datetime` only for explicitly selected microsecond UTC-instant subset; reject excess precision rather than truncate |
| Local timestamp | naive `datetime` only for explicitly authored local-time subset; never attach a timezone implicitly |
| Ordered arrays/maps | preserve order where meaningful, nested missing/null distinctions and item/value constraints |

These carriers do not preserve all native lexical distinctions. If decimal
spelling, RFC3339 source offset/text, nanoseconds, infinity, NaN, native domain or
collation equality matters, the profile MUST retain an explicit qualified carrier
or refuse. CONTRACT-065 exact-instant text is not automatically Python datetime.
Pydantic strictness differs between JSON and Python inputs; the initial public
boundary is Python-value validation plus explicit codecs. Generic
`model_validate_json` MUST NOT be advertised as equivalent admission.

Key models preserve ordered members. Their generated constant
`KEY_IDENTITY` is an immutable mapping
`{documentId,coreVersion,module,record,keyId,inputDigest}`; `inputDigest` is the
complete bundle input digest from CONTRACT-067. Key models and identity are DTOs
only in 0.1: no native key-byte encoder, UMF equality/hash API or Truss key
transport is generated. Key models MUST disable hashing (`__hash__ = None`);
ordinary inherited DTO equality is not persisted UMF Key equality and engines
MUST NOT use it as such. Python tuple/string hashing MUST NOT replace
UMF equality/encoding. Truss continues using its existing qualified UMF key
encoder; adoption requires original UMF golden-vector agreement and byte-for-byte
retention. Generating a new encoder would require its own exact CONTRACT-049
API/UMFK1 format qualification before adoption. Optional `NewType` aliases improve
static nominal distinctions only and MUST NOT be described as runtime identity
validation. No key instance proves database uniqueness or referential integrity.

### Passive backend schema admission

An observation is the closed object `{contract,target,profileId,resource,schema,
configuration}`. `contract` is `umf-schema-observation/0.1`; `target` and
`profileId` equal the compiled target/profile; `resource` is the exactly bound
qualified table name or generated projection name; `configuration` is the exact
profile's required observation key/value map. Missing/extra fields or config keys
refuse. The function compares the complete observed schema against compiled
expectations and returns an immutable `SchemaMatch` bound to input digest,
resource and projection. Mismatch raises ValueError, never returns a partial match.

Spark `schema` is the exact portable JSON result of the pinned native
`StructType.jsonValue()` for the materialized transport projection; arrays retain
field order and all metadata. PostgreSQL `schema` is an ordered array of closed
`{name,typeNamespace,typeName,typeModifier,nullable,collation,defaultSql}` column
records. Names are exact strings, typeModifier is the native signed integer,
nullable is boolean, collation is null or `{schema,name}`, and defaultSql is null
or native `pg_get_expr` text. Unknown/unqualified native types refuse. Profile
native witnesses must prove expected descriptor construction, including typmods.
This column-shape check does not verify keys, indexes, constraints, privileges,
table identity or current retention; those remain explicit native/adoption gates.

The host obtains observations through its original trusted runtime path and
rechecks them as its protocol requires. A pure comparison cannot authenticate an
observation, prove it was current, or confer authorization. `SchemaMatch` is a
validation witness, not a capability. Row decoders require the matching witness
and revalidate values; forged/mismatched resources/projections refuse. A matching
column shape at zero rows remains checkable. Do not expose unchecked decoder
overloads that imply native-schema admission. Decoder mappings use the compiled
explicit selected-column inventory before conversion to authored Field keys;
duplicate native column names MUST be rejected from ordered schema metadata
before converting rows into mappings. No mapping-only API can detect duplicates
already discarded by its caller. Named-projection decoders follow the same
signature and reject a full-row or different projection's witness.

### PostgreSQL target

Use SQLAlchemy 2 `Mapped[T]`/`mapped_column` with exact explicit SQL types,
schema/table/column names and stable source mapping. SQLAlchemy inference MUST
NOT choose native width, precision, default or equality. Unsupported native types
receive no executable mapping. Tables lacking a qualified ORM identity use Core
declarations; the generator MUST NOT choose a subset of columns as a fake key.
Native NULL uniqueness, collation, composite FK ordering/actions and deferrability
remain target-qualified properties. Associations with fields require an explicit
association carrier; no inferred many-to-many shortcut may discard those fields.

Relationship mappings, when explicitly requested and qualified, use `lazy="raise"`
and no save/delete cascade or orphan deletion. DTO extraction uses explicit selected
columns and codecs; no implicit attribute walking or ORM lazy I/O. SQLAlchemy
constructor acceptance is not Pydantic validation. All emitted DDL is a reviewable
proposal through existing UMF PostgreSQL generation; installation is separate.

Generated modules expose mappings, never factories for sessions/engines or generic
`save`/`delete` methods. Hosts select autoflush, transaction ownership, isolation,
locks and retries. No driver-wire encoder is generated in 0.1: PostgreSQL bindings
hand exact Python codec values to the locked SQLAlchemy type/driver path, which
requires independent native transport qualification. Truss's direct-driver path
retains its existing exact transport codecs; a generic dict of Python values
cannot replace them without a separately qualified adapter.
Truss's protected subset uses Core declarations and existing
driver boundaries by default; adding a SQLAlchemy Session there requires separate
proof of identical execution/flush/custody behavior under CONTRACT-069.

### Spark / Delta / Unity Catalog target

Spark schemas explicitly preserve StructField nullability/metadata, ArrayType
`containsNull` and MapType `valueContainsNull`; nullable map keys refuse. Decimal
precision/scale and timestamp kind/configuration are explicit. No inferred schema,
silent cast, `mergeSchema`, session-timezone change or ANSI-setting change occurs.
Native metadata not interpretable for the selected operation blocks execution.
Raw PySpark TimestampType materialization MUST NOT be decoded as an aware instant:
the pinned Spark implementation can produce naive process-local datetimes. The
initial instant profile requires explicit signed epoch-microsecond text from the
host's qualified native projection, converts using integer arithmetic, and
refuses raw naive datetime, out-of-range values or extra precision. Host SQL/session
behavior and text transport require native witnesses. TimestampNTZ remains the
explicit local-naive subset; attaching UTC to a raw timestamp is forbidden.
Existing UMF Spark and Delta generators remain native schema/DDL authorities.

Only complete rows and finite named projections have generated result classes.
`decode_<Record>` accepts an already materialized mapping and matching
`SchemaMatch`, then revalidates it.
It MUST NOT evaluate a DataFrame. Arbitrary PySpark/SQL expressions are untyped
until host analysis verifies a declared projection's exact column/type inventory;
an empty result still requires that schema check. Static Python checking covers
model attributes and generated signatures, not arbitrary Spark expression meaning.
Weft remains the owner of logical SQL lowering; this generator adds no query DSL.

No collection or iteration helper is emitted in 0.1. Hosts own row/byte bounds,
lazy execution, cancellation and schema checks before decoding individual rows.
A decoded sample establishes only those rows, not dataset-wide constraints.
Batch-wide/relational validation and concurrent writers require engine/native
enforcement protocols. Catalog PK/FK/unique declarations MUST be marked
informational unless an independently qualified enforcement mechanism is selected.
No `RELY` optimization declaration is generated in the initial profile.

Fully qualified catalog/schema/table naming requires explicit binding. Native
table identity is separate from its name. Generated read/write declarations do
not establish caller authorization, installed policy, retained snapshots or
multi-table atomic publication. Append/overwrite/MERGE execution is host-owned.

## Precedence and Compatibility

CONTRACT-067 owns compilation and retention. Existing native semantics override
convenient Python representations. No Python annotation may weaken authored
constraints. Source compatibility, instance/wire compatibility and installed
database compatibility MUST be evaluated separately on regeneration. Direct edits
to generated files are detected and never overwritten silently.

## Error Semantics

Validation/conversion raises `ValueError` (including Pydantic validation errors)
before emitting transport values. Messages MUST identify field location and rule,
without raw field values; generated validation must disable input-value rendering
and documentation must prohibit logging full exception internals containing input.
Native transport/policy/transaction exceptions remain host-owned and MUST NOT
be translated into empty results or successful writes. No codec retries occur.

## Examples

For a nullable mutable `memo`, `OrderPatch()` encodes `{}`, while
`OrderPatch(memo=None)` encodes `{"memo": None}`. For a nonnullable amount,
`OrderPatch(amount=None)` refuses. Decimal `125.50` stays Decimal through the
Python codec; transport conversion requires its separately qualified binding.

## External Sources

Mechanisms checked against primary documentation; living pages are not release
pins or implementation evidence:

- [Pydantic models](https://docs.pydantic.dev/latest/concepts/models/) and [strict mode](https://docs.pydantic.dev/latest/concepts/strict_mode/).
- [SQLAlchemy 2 typed declarations](https://docs.sqlalchemy.org/en/20/orm/declarative_tables.html) and [Session behavior](https://docs.sqlalchemy.org/en/20/orm/session_basics.html).
- [PostgreSQL 17 timestamp precision](https://www.postgresql.org/docs/17/datatype-datetime.html).
- [Spark 4.0.1 types](https://spark.apache.org/docs/4.0.1/sql-ref-datatypes.html).
- [Pinned Spark 4.0.1 Python timestamp conversion](https://raw.githubusercontent.com/apache/spark/v4.0.1/python/pyspark/sql/types.py).
- [Databricks constraint enforcement](https://docs.databricks.com/aws/en/tables/constraints).

## Validation Checklist

- [ ] Sentinel, strict Python-value, mutation and exact-codec counterexamples pass.
- [ ] Static positive/negative examples and native mapping probes pass.
- [ ] Local Spark, Delta and managed Unity Catalog claims have separate evidence.
