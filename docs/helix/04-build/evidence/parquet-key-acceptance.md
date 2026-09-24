# Parquet Key binding acceptance

The Parquet task under [TD-044](../../02-design/technical-designs/TD-044-core-key.md)
and [CONTRACT-040](../../02-design/contracts/CONTRACT-040-core-ideals.md) passes
qualified binding acceptance with **PyArrow 21.0.0** and the retained parquet-format
commit `219e3f12a62f9476e830c21e26d030d231f7c017`. This covers Parquet's portions
of [US-044](../../01-frame/user-stories/US-044-core-key.md) AC2–6, AC11 and AC13.
The separate Key ideal-admission/all-five gate remains open. This is not native
collection uniqueness or native equivalence.

## Native observations and original bytes

`classifyParquetKeys` observes physical groups and leaves, their schema indexes,
paths, definition/repetition levels and native fragments. Field IDs identify native
schema fields; sorting metadata, statistics and key-like custom metadata never
become authored keys. Enforcement is not expressible and author intent stays unknown.
Repeated leaves do not become singular scalar key components.

Every original byte remains in the capture, including pages, encodings, unknown
metadata and embedded Arrow schema content. Report mode retains observations and
explicit residuals; strict mode blocks unmet identity/enforcement obligations.
Recovery recomputes the receipt and compares the current target before returning
the original bytes. Forged identity, changed bytes and conflicting observations
refuse. Verification establishes consistency, not source authentication or full
page/value validation.

The native discovery has eight files and 25 rows. Duplicate complete rows and
candidate-key values survive. PyArrow accepts unsorted data with declared sorting
metadata. Nullable and repeated values retain their distinct roles. Binary64
narrowing and fractional integer truncation remain counterexamples. A required-null
write refuses as an independent control.

One file contains non-UTF-8 footer metadata accepted by PyArrow. The current UMF
IDL mapper refuses interpretation, so classification blocks without observations.
The original capture still recovers exactly through JSON and YAML. This is a stated
interpretation boundary, not normalized or discarded metadata.

## Authored projection and ideal recovery

`projectKeysToParquet` consumes core 0.6.0 explicit Record membership and verified
named-key declarations. Each owned Field has an explicit native name, scalar
carrier and optional physical field ID. The current projection profile requires
required singular scalar Fields; other shapes need separate explicit bindings.
It emits an empty native schema file, not a row writer.

The file supports primitive and annotated integer carriers, fixed binary and all
four decimal physical forms: INT32, INT64, BYTE_ARRAY and FIXED_LEN_BYTE_ARRAY.
Carrier validation, duplicate native names/IDs, incompatible scalar families and
invalid names block atomically. Native field IDs remain separate from stable core
key IDs. Verified key renames/list reorder preserve intent; altered tuples,
missing/cross-record membership and stale authors refuse.

Each primary and alternate key has a separate source residual retaining ID, name,
ordered components and primary intent. Native field order does not encode a key.
Unknown key/member/facet qualifiers and the complete ideal remain retained. Strict
mode emits no candidate because collection identity cannot be expressed. Report
mode emits the schema with explicit losses. Recovery recomputes the projection and
checks its complete target, including original bytes, before restoring the ideal.
Native-only reimport cannot reconstruct authored keys.

## Independent native and browser evidence

Twenty-four authored cases yield 21 native schemas and three explicit blocks.
PyArrow independently reads each emitted empty file and checks field names, IDs,
physical/logical types and requiredness. Twenty-one write/read cases using those
recovered Arrow schemas preserve repeated records and repeated candidate-key values.
Twenty-one required-null controls refuse. Twelve integer-input cases truncate 1.5
to 1, and short fixed-binary input refuses. Fixed lower bounds, conversion behavior,
facet obligations and unknown meanings remain residuals.

Those value tests may rewrite physical encodings; they do not claim byte identity
between the original schema file and PyArrow's populated output. Exact byte recovery
is checked separately against the original emitted file.

Chromium agrees on seven successful native classifications and one interpretation
block: fourteen verified native recoveries, two blocked-source recoveries, eight
strict blocks and seven forged-identity refusals. Authored browser checks cover all
24 cases with 42 ideal recoveries and 42 altered-receipt refusals. Both harnesses
prohibit external requests and require no Bun/Node globals.

The [acceptance record](../../../../fixtures/validation/key-parquet-acceptance-evidence.json)
records current source fingerprints and the scoped regression: 253 tests across
64 files, 18,469 assertions and zero failures. The
[command record](../../../../fixtures/validation/key-parquet-compatibility-command.json)
selects all Parquet-named tests and core tests explicitly. Typechecking, the public
browser build and 306-schema / 53-package audits pass. Historical all-system gates
retain their own execution scope; this is not a full repository regression.

Run `bun scripts/core-ideals/key-parquet-oracle.ts` for discovery and generated-file
checks. Run `key-parquet-browser.ts` and `key-parquet-projection-browser.ts` under
`scripts/core-ideals/` with `UMF_CHROMIUM_PATH` pointing to installed Chromium.
