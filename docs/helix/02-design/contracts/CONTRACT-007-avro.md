---
ddx:
  id: CONTRACT-007
  type: contract
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.architecture
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: US-007
      kind: informed_by
---

# CONTRACT-007: Avro schema JSON preservation

## Native schema syntax description

`spec/extensions/avro/native-schema.schema.json`, exported as `avroNativeSchema`,
describes native JSON schema syntax separately from the UMF payload. It covers
primitive/named references, records and errors, fields, enums, fixed, arrays, maps
and unions. It permits native metadata, checks name grammar, enum symbol uniqueness,
field order values, immediate union nesting and duplicate primitive/array/map
branches. String references named `array` or `map` remain references; they do not
automatically denote container branches. Aliases may contain previously invalid names.
The source is the [Avro 1.12.0 specification](https://avro.apache.org/docs/1.12.0/specification/).

This is a structural description, not complete native validation. Reference
resolution, duplicate declarations/field names, enum-default membership, typed
defaults, logical annotations and exact number tokens require additional checks.
Empty unions/enums and zero-size fixed forms are not excluded by this syntax layer.
Unknown or invalid logical annotations remain available for native fallback.
Ingestion does not gate preservation on this optional syntax schema. Protocols,
IDL and container formats are outside its scope.

The generator is `scripts/avro-native-schema.ts`. Evidence covers 62 syntax cases,
including all 20 pinned upstream schemas, 88 JSON/YAML/browser recoveries and 176
independent Apache Avro/fastavro parser-recovery comparisons. Native outcomes can
differ: unresolved names pass syntax but fail standalone parsing; invalid typed
defaults and malformed declarations expose parser differences. These observations
remain recorded in `fixtures/avro/native-schema-oracle.json`, not normalized into
a claim of complete validation or universal parser agreement.

The `umf.avro` 0.1.0 extension preserves schema JSON targeting Avro 1.12.0.
Its complete representation schema is `spec/extensions/avro/schema.json`, embedded
in the extension package. This describes the lossless representation, not a claim
that every represented schema is semantically valid Avro.

## Representation and Operations

An element payload contains `version: "1.12.0"`, a tagged JSON `root` and optional
ordered `dependencies`, each carrying a unique `id` and tagged native `root`. Object
members, array order, string contents and exact numeric tokens survive import,
UMF JSON/YAML serialization and export. Whitespace and JSON string escape spelling
are not retained. Recursive named references remain native names; union order,
record field order, aliases, defaults, documentation, custom metadata and logical
type attributes remain source-owned. Parsing canonical form is not sufficient
as a retention oracle because it removes metadata.

Public operations import/export schema JSON, inspect diagnostics, return copied
native nodes and atomically replace existing nodes. Conservative editing requires
complete interpretation both before and after the change. Native custom metadata,
logical types, unsupported numeric precision and validator failures produce explicit
incomplete interpretation. Unknown representation fields block native export because
they have no native destination. Bundles include the full source UMF alongside the
native schema; native-only output cannot recover unrelated UMF extensions.

### Explicit candidate edits

`proposeAvroNodeEdit(document,path,replacementJson,dependencyId?)` returns a copied
report with status:candidate, original source, proposed document, edit path and exact
replacement tree, and current validation diagnostics. Its complete JSON Schema is
spec/extensions/avro/node-edit-proposal.schema.json. Paths identify existing native
nodes; an empty path replaces the selected root. Dependency IDs select their native
root rather than the primary schema. Replacement subtrees are explicit author edits;
the retained source records all prior content.

Unlike `editAvroNode`, this operation permits incomplete interpretation, including
logical types, unfamiliar native metadata and exact defaults beyond host integer
precision. A candidate is not a validity, compatibility or migration certificate,
even if its structural validation passes. Unresolved types retain compiler diagnostics.
Conservative editing retains its existing before/after completeness requirement.

Candidate edits reject malformed UMF/payload structure, stale derived fields, missing
paths and unknown tagged-representation content. They synchronize core field metadata
on a copy and reuse the conservative guard against removing or renaming a field with
attached metadata. Unknown unrelated UMF extensions and native sibling content survive.
The final report is copied and subject to common structural limits. Native exports
still require retaining the source document to recover unrelated UMF semantics.

Five authored candidates cover decimal scale, instant-to-local annotation, unknown
annotation spelling, an exact int64 reader default and a named fixed-decimal dependency.
Both native engines decode/re-encode original and edited schemas and compare JSON/YAML
recoveries. The same unscaled decimal bytes decode as 12.34 before a scale edit and
1.234 afterward: byte equality is explicitly not semantic equality. Reader resolution
changes a missing count from zero to 9223372036854775807 without JavaScript rounding.
Apache/fastavro local-timestamp behavior remains separately recorded. No automatic row
migration or compatibility decision is implemented.

Reproduce with `bun test tests/avro/candidate-edit.test.ts`,
`.venv/bin/python scripts/avro-candidate-edit-oracle.py`, and the metadata Chromium
script. Native results in fixtures/avro/candidate-edits-oracle.json fingerprint the
input fixture and contain ten source/candidate comparisons and twenty candidate
recovery observations. Chromium checks five proposals and ten candidate recoveries.

## Validation Profile

The structural package validator checks the tagged tree. Root scalars other than
strings are rejected. avsc 5.7.9 interprets its supported schema subset in browser
JavaScript. Compiler errors are reported as `AVRO_VALIDATOR_LIMIT`, not silently
accepted as full interpretation and not universally treated as invalid Avro 1.12.
For example, newer union-default rules exceed that validator's profile. Exact long
defaults outside safe JavaScript integers are retained but not host-interpreted.
Logical types are retained and marked incomplete even when their carrier compiles.
A structurally valid document with warnings is not a semantic-validity certificate.

Defaults describe reader resolution, not permission to omit writer fields. The
native oracle checks this distinction explicitly. No field number, default,
identity or requiredness is promoted into core by this adapter. Scalar families
are derived as described below; logical refinements remain native.

## Evidence and Remaining Work

Authored fixtures and tests cover recursive records, enum/fixed, arrays/maps,
primitive carriers, logical decimal/timestamp, defaults, aliases and metadata.
Apache Avro 1.12.0 and fastavro 1.12.2 independently check binary equivalence,
decoding, reader evolution and invalid values. Their disagreement about writing
an out-of-range int is recorded, not averaged into a conformance claim.
Chromium executes the public import, validation, export and edit path.

A pinned Apache release-1.12.0 corpus includes every `.avsc` file under the shared
schema, Java Avro test-resource and Java compiler test-resource directories: 20
files, all retained. Independent Apache/fastavro parsing accepts 19 standalone;
ApplicationEvent requires external DocumentInfo and remains incomplete. Nineteen
Apache-generated instance probes retain identical bytes and values. Twelve schemas
are completely interpreted by the current browser profile; eight have diagnostics.
These are scoped fixture checks, not exhaustive language conformance.

Broader corpus and semantic validation, Avro IDL,
protocol/RPC, object-container metadata and cross-system transforms remain open.
The authoritative language reference is the
[Avro 1.12.0 specification](https://avro.apache.org/docs/1.12.0/specification/).


## Explicit Named-Schema Dependencies

Import accepts ordered `{id, schema}` dependencies. Each definition enters a fresh
per-document native name registry before the next dependency and root. IDs identify
source artifacts, not Avro names; native namespace/name declarations govern name
resolution. No files or URLs are read implicitly. Forward dependencies must be
ordered by the caller; failed resolution, duplicate names or compiler limitations
remain explicit incomplete interpretation. Duplicate artifact IDs are errors.

Root-only export rejects a nonempty dependency list. Bundle export returns root
schema JSON plus the ordered dependency artifacts and full source UMF. Importing
that bundle restores the same declarations without flattening or rewriting native
names. `getAvroNode` and `editAvroNode` accept an optional dependency ID; all edits
validate the complete dependency environment before returning a new document.
Renaming a depended-on record without updating references fails conservative edit.
Unknown dependency representation fields block export just like root fields.

The pinned ApplicationEvent/DocumentInfo pair completes browser interpretation
when imported together. Apache and fastavro independently encode/decode the original
and exported bundle and enforce a string-to-bytes dependency edit. The standalone
corpus report remains unchanged: it intentionally tests absence of dependencies.

## Core field metadata

Imports now materialize an `avro.fields` module. Its ordered core elements expose
native record-field names, optional doc descriptions and scalarType where understood.
`getAvroFieldMetadata` returns copied entries with dependency ID (when applicable),
native JSON Pointer, enclosing full record name, derived core element and complete
exact native field tree. The complete result schema is field-metadata.schema.json
under spec/extensions/avro. Element IDs encode `[dependencyId-or-null,pointer]`;
these are source locations, not durable field identity across schema evolution.
Nested record definitions and ordered dependencies are traversed without expanding
recursive references. Names resolve with native namespaces; aliases are not additional
declarations. Conflicting declarations cannot resolve to a guessed scalar family.

Primitive int/long share integer; float/double share float; bytes/fixed share binary;
enum symbols and strings share string. Valid carrier/logical combinations expose
date, time, timestamp or decimal families, including local timestamps. Decimal
precision/scale and fixed capacity are checked before classifying; fixed sizes above
4096 bytes remain unclassified by this metadata helper. UUID, duration, unknown or
invalid logical types remain unclassified. They are not treated as their carriers.
Unions expose a family only when all non-null branches have the same known family.
This does not remove null branches, branch identity or order, imply optional writer
fields, or certify semantic validity. Null-only and mixed-family unions, records,
arrays and maps do not acquire a scalar family. Native refinements remain authoritative.
These mappings follow the linked Avro 1.12 specification; invalid logical types may
be accepted as carriers by native implementations without gaining a core classification.

Native export rejects disagreement between the materialized module and derived fields.
Conservative native edits synchronize this module on a copy, preserve unrelated
metadata on unchanged field identities, and reject removal or reassociation that
would lose attached metadata. Older documents without the module still export;
the metadata accessor derives their view without mutating them. General semantic
validation retains its existing incomplete profile for logical types.

Evidence includes 26 field-shape cases, nested/recursive/dependency paths, edits,
JSON/YAML recovery and a real Chromium run. Apache Avro 1.12.0 separately confirms
native schema recovery and records its invalid-logical-type warnings. Native parsing
is not proof that a scalar family enforces every native constraint.

Decimal scalar derivation checks exact precision, scale and fixed-size tokens.
Rounded fractions, underflow, unsafe integer magnitudes and negative zero cannot
justify a decimal family; the native schema still imports and round-trips without
losing those tokens. Exact integer decimal/exponent spellings remain classified.
Named references and nullable unions inherit the same qualified result. Explicit
candidate edits recompute these fields without certifying native validity.

`tests/avro/integer-metadata.test.ts` covers 15 numeric cases, named references,
nullable unions, copied candidates and 30 UMF recoveries. Chromium repeats them.
`scripts/avro-integer-metadata-oracle.py` independently checks exact Decimal values
and preserves Apache Avro/fastavro parsing outcomes and warnings across 60 native
recoveries. Native parser acceptance may involve its own numeric rounding and is
not evidence of exact qualifier equivalence.

Temporal classification requires an exact logical-type string and the long carrier.
An absolute-end match prevents trailing LF, CR, U+2028 and U+2029 from gaining
timestamp meaning. Spaces, NUL, array annotations and wrong carriers also remain
unclassified. Source annotations and unfamiliar field metadata survive unchanged;
the absence of a core family does not remove their native carrier schema.

The 54-case temporal matrix covers all six instant/local millis/micros/nanos names,
their valid forms and eight nonmatching variants per name. Bun verifies derived and
materialized metadata plus both UMF recoveries. Chromium verifies 108 recoveries,
alongside the earlier 26-field matrix. Conservative logical-type editing remains
blocked by the existing incomplete-semantics guard. Explicit candidate edits use
the separately qualified proposal operation described above.

Apache Avro 1.12.0 and fastavro 1.12.2 supply 108 independent observations and 216
recovery comparisons in fixtures/avro/temporal-metadata-oracle.json. Both preserve
integer carrier behavior for altered string spellings and wrong carriers. Apache
rejects six array annotations; fastavro accepts them as carriers. Apache interprets
valid instant millis/micros as datetime but leaves local timestamps as integers;
fastavro interprets local millis/micros too. Both leave nanos as integers. These
differences are recorded, not counted as complete temporal support. Successful probes
decode/re-encode one binary value exactly; full temporal ranges remain unverified.

Reproduce with `bun test tests/avro/temporal-metadata.test.ts`,
`.venv/bin/python scripts/avro-temporal-metadata-oracle.py`, and
`UMF_CHROMIUM_PATH=/home/erik/.local/bin/chromium bun scripts/avro-metadata-browser.ts`.
The native report fingerprints its generated input fixture. These checks implement
the exact logical-name/carrier distinction in the linked Avro 1.12 specification;
they do not promote temporal units or timezone semantics into core.
