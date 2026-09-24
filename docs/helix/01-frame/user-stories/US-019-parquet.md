---
ddx:
  id: US-019
  type: user-stories
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-002
      kind: informed_by
---

# US-019: Preserve and inspect Parquet sources

**Feature:** FEAT-002. **PRD:** FR-1/5/6/12/37/39/41. **Priority:** P0.

As a schema-tool author, I need Parquet schema and physical source information available
in a browser without losing native metadata, exact values or unknown format extensions.
This story starts the planned Parquet extension; source capture does not complete it.

- **US-019-AC1:** Capture bounded arbitrary bytes, including invalid native files, through
  an extension with a complete payload JSON Schema. JSON/YAML preserve bytes exactly.
  Inputs/outputs are copied. Unknown representation fields survive UMF but block native
  export rather than being silently dropped.
- **US-019-AC2:** Inspect PAR1/PARE framing and footer-region bounds with explicit errors.
  Source is retained. Located framing must not imply valid Thrift, data pages, encryption,
  signatures or column schemas. Plaintext-footer magic does not prove plaintext columns.
- **US-019-AC3:** Native schemas/values and footer bounds agree before/after source round
  trip on the pinned checkpoint corpus and precision-boundary fixtures. Chromium repeats
  exact hashes and framing without Node globals.
- **US-019-AC4 (pending):** Define complete understood Parquet metadata/type/value schemas,
  implement bounded decoding with opaque source retention, qualify logical types/codecs,
  and provide programmatic access plus robust native transforms. Preserve decimal scale,
  timestamp units, repetition and unknown fields independently of physical lowering.

Checkpoint consumers (US-018) may depend on this package. Broader Parquet support,
metadata editing/re-encoding and cross-system projections remain required subsequent work.

- **US-019-AC5:** Decode a bounded plaintext footer region into an exact Compact Protocol
  tree with a complete result/tree JSON Schema. Retain field order, repeated/unknown IDs,
  arbitrary binary values, map entry order/duplicates, integer widths and IEEE-754 bits.
  Unknown wire types, malformed input and resource limits must block interpretation while
  preserving source. Compare every field independently with Apache Thrift and repeat in
  Chromium. Wire decoding does not establish Parquet IDL/schema validity.

- **US-019-AC6:** Pin the Parquet IDL and derive complete schemas/descriptors for every
  declaration using an independent Thrift compiler. Expose a named FileMetaData view
  that preserves exact integers, raw binary/double bits, absent defaults and future fields.
  Retain unknown enum codes and report them. Block ambiguous/mistyped known fields while
  retaining wire/source. Compare named metadata with an independently generated native
  reader and repeat in Chromium. IDL shape checks do not imply logical/data validity.

- **US-019-AC7:** Derive a physical schema tree from preorder SchemaElements, with exact
  component paths, stable schema indexes/leaf ordinals and definition/repetition levels.
  Check known physical/repetition types, feasible child counts, fixed-width lengths,
  row-group column order/path/type links and row-count totals. Preserve inconsistent
  sources and omit derived trees on structural failure. Report unavailable encrypted
  column metadata and legacy root repetition explicitly. Native column-level observations
  and browser results must agree; logical annotation and data-page validity remain separate.

- **US-019-AC8:** Check implemented scalar logical/physical compatibility, exact decimal
  capacity/scale, integer bit widths, fixed-width UUID/FLOAT16/INTERVAL and temporal units.
  Preserve modern annotation meaning, legacy metadata and explicit UTC/local distinction.
  Report conflicting/missing legacy annotations; derive legacy defaults only in a separate
  view. Label unimplemented/future rules as uninterpreted. Compare native acceptance and
  browser outcomes without claiming stored-value or complete nested-layout validation.

- **US-019-AC9:** Expose LIST/MAP reading interpretations with source schema indexes,
  element/value nullability, two-/three-level list layouts and positional map fields.
  Apply pinned legacy tuple/list and MAP_KEY_VALUE rules without renaming source fields.
  Preserve key-only maps and describe last-value duplicate-key semantics without claiming
  to inspect stored keys. Reject invalid container structures while retaining source and
  metadata. Qualify native-reader differences explicitly and repeat in a browser.

- **US-019-AC10:** Encode exact Compact Protocol value trees with bounded output and
  checked widths, types and representation fields. Add guarded file-level key/value
  metadata appends without changing data/page/index bytes or existing metadata values.
  Preserve the original UMF document alongside the output; refuse replacement, unknown
  native metadata, encryption and unparsed footer trailers. Verify re-encoded wire values
  independently and compare native schemas, rows and column metadata after transforms.
  Repeat in Chromium and preserve absent versus empty metadata values explicitly.

- **US-019-AC11:** Rename a native non-root schema field by stable schema index, updating
  every affected descendant column path across row groups. Preserve field IDs, annotations,
  data/page/index bytes and unrelated metadata. Reject collisions, unsupported annotations,
  ambiguous names, unknown/crypto metadata, footer trailers, external column references and
  key/value metadata requiring its own schema rewrite policy. Reject names that change
  legacy LIST/MAP interpretation. Verify nested schemas and values with a native reader,
  including page checksums, and repeat the transform in Chromium.

- **US-019-AC12 (experimental evidence; public decoder pending):** Preserve exact decimal
  values inside nested containers, ordered map entries including duplicate/non-string keys,
  native field names that conflict with JavaScript objects, and temporal unit/UTC-local
  meaning. Compare page versions and dictionary/plain encodings independently. Define the
  value-view JSON Schema. Do not expose the trial as a public bounded decoder until resource
  limits, malformed pages, codec coverage and unsupported scalar policies are verified.

- **US-019-AC13:** Inspect bounded page headers and column byte ranges before value
  decoding. Check dictionary placement, page-type headers, counts, V2 level lengths,
  declared totals and aggregate budgets. Refuse unsupported/unknown/crypto headers and
  external columns, preserving source on failure. Compare native header observations and
  malformed-input outcomes in Bun/Chromium. Explicitly distinguish declared bounds from
  verified decompression, levels, values and checksums; page inspection alone must not
  authorize an unbounded decoder.

- **US-019-AC14:** Decode bounded physical page bodies for explicitly supported codecs,
  verifying actual decompressed sizes and present CRC32 values. Preserve V2 uncompressed
  level prefixes. Check Snappy literals/back-references and output sizes before allocation
  or copying. Unsupported codecs and malformed bodies block without exposing partial output.
  Compare exact native decompression, valid encoding variants and malformed cases; keep
  value/level/dictionary interpretation separate.

- **US-019-AC15:** Provide a bounded internal RLE/bit-packed hybrid decoder for subsequent
  level/dictionary integration. Check widths, requested counts, run lengths, buffer ranges
  and optional value-domain bounds before expansion. Preserve final bit-packed padding
  separately. Compare native dictionary-page reads and browser outcomes; do not infer
  complete level/value decoding until page-prefix and Dremel integration is implemented.

- **US-019-AC16:** Decode V1 RLE/hybrid and V2 definition/repetition regions using schema
  maxima and bounded page counts. Locate the physical-value suffix, retain final padding,
  check row boundaries and reconcile V2 null/row counts and row-group row starts. Preserve
  source and omit partial output on failure. Compare independent level arrays and authored
  native-readable nullable/repeated layouts; defer physical values and cross-column assembly.

- **US-019-AC17:** Decode bounded PLAIN carriers and PLAIN/RLE dictionary pages, preserving
  signed integer widths, exact floating/INT96 bits and arbitrary binary values. Apply decoded
  level non-null counts, check dictionary indexes and separately cap expanded value size.
  Reject unsupported encodings, malformed lengths and budget overruns without partial output.
  Compare independent corpus values and native physical boundary fixtures before row assembly.

- **US-019-AC18:** Assemble physical row records by stable schema index using bounded
  values and definition/repetition streams. Preserve null versus empty repeated groups,
  native field names and duplicate map-entry order. Require columns to agree on shared
  group presence/cardinality and reject invalid continuations or unused values. Apply a
  separate node budget, preserving source and exposing no partial rows on failure. Verify
  native row values before applying logical LIST/MAP and scalar projections.

- **US-019-AC19:** Project bounded physical rows through authoritative scalar annotations
  and LIST/MAP reading rules. Preserve physical scalars, ordered map entries, duplicate keys,
  field identities, null/empty distinctions and UTC/local temporal meaning. Validate supported
  value constraints without normalizing JSON text or floating payloads. Retain unsupported
  known meanings as opaque physical values with diagnostics. Compare native typed scalars,
  malformed values and browser outcomes; qualify any native projection differences.

- **US-019-AC20:** Offer an explicit repair transform for legacy column metadata that
  omits dictionary_page_offset and points data_page_offset at its dictionary page. Retain
  original bytes; record old/new offsets and preserve every byte before the footer. Require
  the dictionary to be followed by a valid data page within the same bounded chunk, then
  validate the complete candidate's pages and values. Refuse unknown/crypto/trailing footer
  content, nonmatching layouts and damaged payloads. Independent native metadata/value and
  browser checks must agree. Ordinary decoding must not silently apply this correction.

- **US-019-AC21:** Project inspected schemas to Avro with complete source-byte retention,
  native index/path mappings and explicit fidelity issues. Cover nested records, legacy
  and current LIST/MAP layouts, null/empty distinctions, integer width/signedness,
  decimals and temporal precision. Map representation must preserve non-string keys
  and duplicate entries. Block unknown schema meaning rather than falling back silently.
  Verify native source observations, target schema/value behavior and real-browser
  recovery; distinguish authored oracle conversions from a general library row encoder.
  Report embedded Arrow duration, timezone and list refinements independently of
  physical mappings, block uninterpreted embedded declarations, and preserve those
  losses through composed projections. Equal target schemas/bytes must not imply
  equivalent source meanings.

- **US-019-AC22:** Expose embedded `ARROW:schema` as a separate native schema observation
  while preserving the entire Parquet source. Distinguish absence, decoded metadata and
  blocked interpretation; reject ambiguous or malformed entries. Preserve Arrow custom
  metadata and verify recovered/re-encoded schemas with a native reader and Chromium.
  Demonstrate Arrow distinctions lost by physical-only reading. Do not infer agreement
  with Parquet columns or enable coordinated file edits without separate evidence.

- **US-019-AC23:** Provide an explicit coordinated rename for structurally corresponding
  physical Parquet and embedded Arrow fields, including interpreted LIST/MAP wrappers.
  Report distinct native paths and restore distinct labels during inverse edits.
  Preserve data-page bytes,
  unrelated metadata and full original source; require a preserve-and-report policy
  for uninterpreted name references. Reject ambiguity, unsupported layouts and partial
  outputs. Verify renamed schemas, metadata, values and inverse recovery using native
  Arrow/Thrift and Chromium, without claiming general schema correspondence.
