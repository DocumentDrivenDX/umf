---
ddx:
  id: SPIKE-003
  type: tech-spike
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.architecture
      kind: informed_by
    - id: FEAT-002
      kind: informed_by
---

# SPIKE-003: Arrow native schema fidelity

## Objective

Determine whether the pinned Arrow JavaScript schema decoder and IPC writer can serve
as the complete semantic representation for a browser UMF extension. This spike supplies
native evidence before defining that extension's lossless representation; it is not the
extension implementation or completion of Arrow support.

## Approach

The TypeScript probe pins apache-arrow 21.2.0 and PyArrow 21.0.0. It builds 52 authored
integration-JSON schema cases, decodes native JavaScript schema objects, writes schema-only
IPC streams, reads them back, and describes known native fields/type parameters plus
metadata. The descriptor uses the pinned native JSONTypeAssembler while explicitly
retaining schema and field metadata. Internal decoder APIs are version-pinned experiments,
not a stable public dependency contract.

Cases include signed/unsigned integers at four widths, float widths, decimals at four
widths, date/time/timestamp/duration units, interval units, binary/string variants, list
variants, fixed sizes, structs, unions, dictionary IDs and extension/Unicode metadata.
The matrix also probes unsupported view/run-end families and duplicate metadata keys.
The original schema matrix does not include maps, real record batches, dictionary values
or upstream corpora. The later IPC corpus below adds authored data evidence.

## Findings

- 47 cases preserve the compared integration descriptor through JavaScript decoding and
  native IPC re-read. This checks the selected descriptor fields, not unknown FlatBuffer
  content or every native semantic invariant.
- Struct changes the integration spelling `struct` to `struct_`. This is a reported alias
  normalization, not evidence that the logical type changed.
- Duplicate metadata keys collapse in the JavaScript Map conversion. Original ordered
  metadata entries must remain authoritative; the native object is not a lossless source.
- The integration decoder rejects listview, largelistview and runendencoded. The eventual
  extension cannot define its vocabulary merely as the JavaScript decoder's supported set.
- The native JSON writer omits schema and field metadata. A directly executed writer probe
  confirms this; use of that output as a canonical UMF schema would silently lose meaning.
- PyArrow reads all 49 emitted schema-only streams, verifies observed metadata and native
  schema equality on re-emission. On JavaScript reimport, 48 descriptors match. The large
  dictionary ID changes from 9007199254740991 to 0. The dictionary value/index types and
  ordered flag remain, but ID preservation across connected IPC messages is not proven.
- All 52 cases produce the same observed results in Chromium 148.0.7778.0 with no process
  or Buffer global. Typechecking passes. These initial observations predate the public schema adapter;
  CONTRACT-016 records its subsequent implementation.

## Reproduction and evidence

Run `bun scripts/arrow-capabilities.ts`, then
`.venv/bin/python scripts/arrow-schema-oracle.py`,
`bun scripts/arrow-schema-reimport.ts`, and `bun scripts/arrow-boundaries.ts`.
Browser reproduction uses `UMF_CHROMIUM_PATH=/home/erik/.local/bin/chromium bun scripts/arrow-browser-probe.ts`.
The Python dependency is pinned in scripts/oracle-requirements.txt. Native package source
hashes are in native/arrow/runtime-manifest.json. Fixtures, source descriptors, IPC bytes
and result reports are under fixtures/arrow/. Capability/reimport scripts fail if the
pinned observed baseline changes; such changes require review, not automatic acceptance.

## Implementation decision and remaining work

Native JavaScript schema objects are useful validation/projection targets but cannot be
UMF's sole source of truth. Define the complete Arrow schema vocabulary from the pinned
format/FlatBuffer specification, preserve unknown fields and ordered metadata, and retain
wire IDs independently of native library normalization. Guard each native conversion by
comparing explicit supported semantics and reporting or blocking changes.

Next work includes the Arrow extension package and JSON Schemas, exact native schema
import/export/edit APIs, FlatBuffer/IPC unknown-content handling, integer ID bounds,
unsupported type families, map/nested/dictionary corpora, independent type-parameter
validation, record-batch evidence and cross-system projections. Do not lift timestamps,
decimals, dictionaries or nullability into core merely because another extension uses
similar names. This spike resolves feasibility/limitations, not the full Arrow goal.

## Sources

[Arrow columnar format](https://arrow.apache.org/docs/format/Columnar.html) identifies
Schema.fbs as the authoritative type description and distinguishes logical types from
physical layouts. [Arrow JavaScript documentation](https://arrow.apache.org/js/current/)
provides the native implementation entry point. The format documentation was served as
format 1.5 / docs 25.0.1, while the tested libraries are specifically JavaScript 21.2.0 and
PyArrow 21.0.0; no latest-release or universal format-support claim follows.


## Native IPC import experiment

The authored corpus in `fixtures/arrow/ipc-inputs/` contains 18 PyArrow 21.0.0
file/stream fixtures: nine type families, each with two batches and six rows.
Values exercise int64 extremes, nulls, Unicode dictionary values, empty/nested lists,
nullable structs, maps, dense union codes, list views and run-end encoding. Both schema
and field metadata are present. These are synthetic fixtures, not an upstream corpus.

Arrow JS 21.2.0 reads and rewrites 12 fixtures. PyArrow independently compares the
complete re-emitted tables, including metadata, and all 12 are equal. The six listview,
largelistview and runendencoded inputs fail with explicit unsupported-type errors.
Chromium 148.0.7778.0 agrees on all 18 descriptors, batch/row counts and rejection
messages without host globals. Browser output bytes have not independently undergone
the Python table comparison; the checked rewritten bytes are from Bun.

The separate boundary probe rejects empty input, truncated schema metadata and a
truncated second batch body. It accepts the fixture without an EOS marker, and accepts
both trailing garbage and a second concatenated stream while exposing only the first
six rows. Absence of EOS is not by itself a malformed-stream claim. Reader success
therefore does not prove that every supplied byte has been interpreted. An import
must retain original bytes, distinguish schema observations from authoritative source,
and explicitly account for framing/consumption before claiming complete validation.
A decoded schema or a native table rewrite alone cannot implement lossless IPC import.

Reproduce with `.venv/bin/python scripts/arrow-ipc-inputs.py`,
`bun scripts/arrow-ipc-inputs.ts`,
`.venv/bin/python scripts/arrow-ipc-inputs.py --verify`, and
`bun scripts/arrow-ipc-boundaries.ts`. Run the browser comparison with
`UMF_CHROMIUM_PATH=/home/erik/.local/bin/chromium bun scripts/arrow-ipc-browser.ts`.
Outcome baselines fail on changes; hashes identify each generated source fixture.
The native stages are included in the conformance runner. This evidence does not
implement the public IPC archive package, validate unknown FlatBuffer fields, or
establish data support for arbitrary Arrow schemas.
