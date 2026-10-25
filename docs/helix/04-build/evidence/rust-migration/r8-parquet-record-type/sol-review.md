---
ddx:
  id: umf.evidence.rust-migration.r8-parquet-record-type-sol-review
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.evidence.rust-migration.r8-parquet-record-type
      kind: informed_by
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-019
      kind: informed_by
    - id: TP-001
      kind: informed_by
---

# Independent Sol review: Parquet Record Type predecessor

Sol reviewed the TypeScript packet's source and fixture closure. The first
capture pinned the evolving migration plan and gap ledger, causing `--check`
to fail after a plan edit. The corrected packet pins executable code, schemas,
tests and fixture bytes; the moving governance documents remain linked as
context. Sol independently reran `--check`, the focused predecessor suite and
repository typecheck. The packet matches 6 classified, 12 blocked and 12
recovered outcomes; the suite passed 2/2 with 71 assertions and typecheck
passed. Runner SHA-256 is
`969c819f483a01abdfe04422ff9626b518f61e0e9e273fbb52868455652ffede`;
packet SHA-256 is
`62f60934a8c0b0fc12fd46f766c3ca6afa7b4821fd2b90969749eb5e26640b39`.

This freezes current TypeScript behavior for a bounded LIST struct subset and
refusals. It does not establish independent Parquet parser agreement or a
Rust route. A Rust implementation first needs an opt-in native byte capture,
schema index and LIST/MAP interpretation foundation. Its original bytes must
remain authoritative while the classifier interprets a selected index; the
core/kind/result schemas must be exact retained resources. No release or
default-route retirement follows from this packet.

## Opt-in Rust candidate review

Sol reviewed the subsequent `parquet_record_type_candidate` core and tagged
wire transport. The first cut copied schema paths and converted f64 indexes
without an exact target-width bound. The corrected cut builds parent indexes,
allocates only the selected path, charges source bytes and schema members to
the caller's work ledger, and admits only exact safe integer indexes. It
returns `complete: false` and retains the original byte sequence. The profile
is explicitly limited to interpreted LIST element structs; it does not cover
ordinary non-LIST struct members from the predecessor packet.

Sol independently reran the focused core tests (3/3) and tagged wire tests
(2/2) with Rust 1.90.0 offline. Source SHA-256: core
`7d68335323d2828b8daea065a2a120c93725de5a7606eb81c7e10f6601f9b6dc`,
wire `e2b674ed52b63d07e26868fa1bf5f8e25fecfc21ec9f5fd2088acc426ee355db`,
wire test `5b777826415803caf7d44806c2f7ac1ffec4b7aefa0eef5012ce26517a71efa7`.
The schema view is caller supplied, not decoded from Parquet bytes; no
classifier/recovery result, native-oracle parity, host binding or default
route is established. The newly embedded result schema requires Python sdist
source-closure inclusion before another artifact build.

## Retained-byte decoder and LIST candidate review

Sol reviewed the Compact Protocol decoder and the small composition layer that
feeds its schema view to the existing candidate. The decoder initially copied
binary payloads before charging work, accepted discarded high varint bits, and
used unchecked footer-length arithmetic. Those defects were corrected before
this review: it now charges before allocating each binary copy, checks varint
width and footer bounds, and retains any trailing footer bytes as an explicit
count. The composition layer likewise charges before copying the complete
Parquet source into `ParquetCapture`.

Rust 1.90.0 locked/offline tests independently passed 5/5 decoder cases and
3/3 composition cases. The three pinned LIST fixtures retain SHA-256 values
`d865757dae18e11d4e0f071356aa3d8cac7e4a3b63269932404d39dbf3c6f5a5`,
`6df1f25f59236fcd69c98d68f919fb05068c398196f3ca46010a9f87d625c246`,
and `2c018ed431f7ff0b1dcaab6782ae94050eb404c2043702a7f1c75278f3d5f144`.
Reviewed source SHA-256 values are decoder
`29dc15a025ff4acccbb52905ee470a3bd4bbb2205d26f8da27098c2fe6ae912c`
and composition layer
`bea8108c7f33a478bb4687f9137502d7763ae876a4c48f38a320b079a0578616`.

This evidence resolves the previously missing byte-to-schema input only for
plaintext PAR1 files under the stated size, node and depth caps. The result is
still a candidate over schema index 2, not a UMF Document classification
receipt. It does not verify Field author provenance, compare a current target,
recover bytes from a receipt, establish an independent Parquet-native oracle,
or select a Node/browser/Python route. The two executable gap rows remain open.

## UMF Document capture follow-up

The next opt-in layer accepts a copied current UMF Document, validates its
core envelope through caller-supplied Engine/Registry/Capabilities, and
extracts the exact lowercase-hex Parquet bytes from the pinned
`umf.parquet@0.1.0` source profile. It decodes the bounded schema and checks
the `parquet.fields` `schema:<index>` identity when that module is present.
Sol required copy-before-validation, refusal of duplicate modules/elements,
work charging before identity and byte-buffer allocation, and direct UTF-16
hex admission so a 2 MB temporary UTF-8 string is not allocated before the
capture cap. The corrected source passes 3/3 focused Rust 1.90.0
locked/offline tests independently, as well as the core check. Source SHA-256
at review is
`f62e12905fede342decb2b76b01de82ba9b5a3ae2d77c52ecfcc29e80e133267`.

The caller still supplies an Engine/Registry. The focused fixture uses
structural core validation and then the exact profile checks in this layer;
it does not prove an installed Parquet package registration, raw JavaScript
trap order, author provenance, target construction, receipt recomputation,
or byte recovery. The public Parquet Record Type exports remain unretired.

## LIST Record classifier and byte-recovery composition review

Sol reviewed the opt-in `classify_parquet_record` against its TypeScript
predecessor and the retained byte-capture boundary. The first cut copied
captured bytes/schema before charging, converted an unbounded `usize` index
to JSON number, and let some blocked receipts bypass exact result-schema
validation. Those defects were corrected. The classifier now validates every
classified or blocked receipt against the embedded result schema and admits
only the interpreted LIST struct subset. Recovery validates the same schema,
recomputes the receipt with caller-owned Engine/Registry/capabilities/Context,
compares the complete receipt and current target, and returns the retained
bytes. Sol formatted both modules and retained explicit resource limits.

An independent Rust 1.90.0 locked/offline `cargo test -p umf-core --lib record_`
run passed 27/27 adjacent Record tests, including three classifier and three
recovery tests. The classifier source SHA-256 is
`191cec65bd2de2410124799d2165de9d3fbf97bf6daf5c669c535700e9577d48`.
The recovery source was subsequently adjusted to refuse an index exceeding
the target `usize` width before conversion; Sol reran its three focused tests
successfully. The final recovery source SHA-256 is
`72e69a0f97ad8f0de25f51b69d739e641b48e900d9d48e167bdbe7e851967068`.
`git diff --check` passed.

The returned mapping fragments are a bounded decoded schema view, not the
TypeScript adapter's complete `nativeField` values, and non-LIST layouts from
the frozen predecessor remain unsupported. The tests assert successful
status, target validation, schema-valid receipts and exact recovered bytes;
they are not byte-for-byte TypeScript receipt comparisons or independent
native-reader evidence. No public binding or default route is selected, and
neither Parquet Record Type export is retired.

## LIST Record Type classifier and recovery review

The opt-in Rust classifier composes the reviewed retained-byte Record
classifier, verifies the selected `parquet.fields` identity and optional
author receipts, and appends Field and Record Type mappings. Sol found and
corrected a first cut that dropped inherited authors, duplicated the Record
mapping and used an unrelated fragment. The final mapping list preserves the
generic Record mappings once and uses the selected decoded schema element.
The reference path reflects the current reference count, and cloned request
text and authors are charged to the caller's Context. The recovery operation
validates the complete result schema, recomputes and compares the receipt,
checks the current target, and returns exact captured bytes.

An independent Rust 1.90.0 locked/offline `cargo test -p umf-core --lib
record_type` passed 23/23 adjacent tests. The no-default-features core check,
core-wire check, rustfmt check and `git diff --check` passed. Reviewed source
SHA-256 values are classifier
`34f2ccfd6ea05444242620312f92a1f269886c7feb6aaaa1cfb325a94a286e30`
and recovery
`6239752a176dfbad2985f39c59fba72071274b3bb8a96eed0ee53895e2b0a142`.

The frozen TypeScript predecessor was regenerated after only the generated
core schema and Rust `lib.rs` source pins changed. Its 6 classified, 12
blocked and 12 recovery outcomes are byte-for-byte unchanged; `--check`
passes. Packet SHA-256 is
`0d7d9ffbcffa78eb177cffcb9e20c42e4c33823ee92414f535ba566ae55dad18`.
The Rust slice supports only the pinned LIST struct-member subset and its
decoded fragment view. Complete TypeScript receipt and native-reader parity,
Node/Bun and Chromium bindings, installed route, and default retirement
remain open.

## Original native fragment and final-source review — 2026-10-25

The later decoder retains original Thrift `SchemaElement.converted_type`
field 6 as a numeric value, and the opt-in Record Type classifier emits its
frozen decimal-string spelling in blocked mapping fragments. Sol reviewed
the separation between raw transport metadata and semantic annotation:
LIST/MAP admission remains unchanged, the original bytes remain captured,
and no modern `logicalType` interpretation is inferred. A first full-array
comparison found an extra derived `annotation` label on the selected wrapper;
the corrected opt-in fragment omits that label and matches every object in
the 12 frozen blocked mapping arrays. The generic Record classifier retains
its earlier annotation field behavior.

The agent's locked/offline Parquet filter passed 30/30; Sol independently ran
the combined final-source `record_type` filter 28/28 and the versioned
core-wire binding filter 4/4. Scoped rustfmt with import reordering disabled,
TypeScript predecessor tests 4/4 with 176 assertions, metamodel fixed-point,
resource-mirror checks, R8 inventory/ledger checks and `git diff --check`
passed. The frozen Parquet predecessor still reports 6 classified, 12 blocked
and 12 recovered outcomes; its final SHA-256 is
`dd1c939de24d02abec0e1cf2a9ed75eb6cb3e029655036805578fc850b4689ee`.

The independent [native oracle](parquet-native-oracle.json) checks 18/18
selected requests against PyArrow 21.0.0 over five pinned files and records
Apache Thrift 0.22.0's raw SchemaElement fields beside the complete ordered
predecessor mappings. It establishes bounded native layout facts, not full
Rust receipt parity or support outside the interpreted LIST struct subset.
Omitted `authors` and an explicit empty array now remain distinct through
the Rust request and recovery receipt. Raw JavaScript admission, installed
host routes and default retirement remain open.

The final-source [versioned tagged-wire host receipt](../r8-avro-record-type/wire-binding.md)
also covers Parquet classify and exact byte recovery through a fresh Node
addon on Node/Bun and generated WASM in real Chromium. Sol independently
replayed Node and Chromium and checked their artifact hashes. That is bounded
transport evidence only; raw host admission and default package routing remain
unqualified.
