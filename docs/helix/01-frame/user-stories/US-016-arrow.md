---
ddx:
  id: US-016
  type: user-stories
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-002
      kind: informed_by
---

# US-016: Preserve and edit Arrow schemas

**Feature:** FEAT-002. **PRD:** FR-1/5/6/12/37/39/41. **Priority:** P0.

As a schema author, I want Arrow schema metadata available to browser metadata tools
without erasing native type parameters, field order, dictionary identities or unknown
content, so native interchange can be qualified against actual backend behavior.

- **US-016-AC1:** Every authored integration-schema case survives UMF JSON/YAML and
  native schema JSON export without dropping fields, parameters or metadata entries.
  Browser execution makes the same scoped claim, including decoder-unsupported types.
- **US-016-AC2:** Unknown fields/types, duplicate metadata and exact numeric tokens stay
  in the authoritative schema. Candidate edits do not mutate the original. Unknown
  UMF representation data cannot silently disappear through native JSON export.
- **US-016-AC3:** Known malformed type parameters, child layouts and nonintegral/out-of-
  range dictionary IDs reject. Exact integer checks cannot rely on rounded JS numbers.
  Inspection remains incomplete for IPC/data validity and extension-type interpretation.

- **US-016-AC4:** Schema-only native IPC export requires an explicit pinned backend,
  compares native decode/re-read semantics to the preserved schema, and rejects unknown
  content, duplicate metadata, unsafe host IDs and changed semantics. Known aliases and
  defaults may normalize only under a documented rule. Browser and independent native
  readers verify the successful subset and an edited schema.

- **US-016-AC5:** Exact IPC byte capture survives UMF JSON/YAML and original-byte export
  even when native types are unsupported, input is invalid, or trailing bytes are ignored
  by a decoder. Native schema observations retain copied source and remain incomplete;
  they cannot replace it or mutate it. Unknown capture representation fields survive UMF
  but block byte export. Browser and Bun verify the authored file/stream corpus.

This starts the public Arrow extension. Full FlatBuffer/IPC coverage, native export
conversion guards, upstream schemas, record batches, dictionary data and cross-system
projections remain required. SPIKE-003 supplies the native-library constraints.


- **US-016-AC6:** The logical FlatBuffer metadata package describes every declaration
  and field in pinned Schema/Message/File/Tensor/SparseTensor definitions. Generated
  inventories must agree with the independent native compiler. Exact int64 bounds,
  required fields, tagged unions, duplicate metadata and unknown table properties
  round-trip without claiming binary codec or native semantic validity.


- **US-016-AC7:** Decode real raw metadata buffers for every declared root into the
  logical model, retaining original bytes and physical field presence. Native compiler
  decoding must independently agree, including unsupported-native-JS types, duplicate
  metadata and exact int64 values. Unknown table slots produce diagnostics; unknown
  enum/union values and malformed buffers retain source without a partial model. Browser
  behavior must agree. Full IPC framing and semantic validity stay separate claims.


- **US-016-AC8:** Encode known logical metadata roots with an explicit pinned backend;
  verify the emitted bytes decode to the same values and physical field presence.
  Reject unknown properties and source wire-omission markers. Candidate edits must
  validate atomically, preserve the original, and propagate into independently decoded
  native output. Exact int64, duplicate metadata, explicit defaults and browser parity
  are required; metadata encoding does not imply automatic dataset-body migration.


- **US-016-AC9:** Inspect file/stream framing with exact metadata/body offsets, decoded
  metadata, footer location and retained source. Compare native reader boundaries for
  modern and legacy prefixes. Optional stream EOS, trailing bytes, concatenated streams,
  truncated segments and corrupt footer lengths/magic must have distinct outcomes.
  Boundary accounting must not claim footer consistency, dictionary or array validity.


- **US-016-AC10:** Compare file footer schema/version/custom metadata and dictionary/
  record-batch block declarations with embedded-stream observations. Detect mismatched
  schema copies, missing/duplicate blocks and incorrect offsets/lengths even when framing
  succeeds. Distinguish recommended block-order agreement from errors. Unknown metadata
  or incomplete framing must leave comparison unverified; array/dictionary semantics
  remain separate from matched footer declarations.


- **US-016-AC11:** Rename a positional schema field in a complete IPC file/stream,
  preserving record/dictionary messages byte-for-byte and updating schema/footer copies
  and block offsets. Retain original and candidate UMF envelopes. Require explicit
  preservation/reporting of uninterpreted name references. Native readers must observe
  the new name with unchanged data/other metadata; browser outputs must agree. Reject
  trailing/unknown wire content, inconsistent footers and invalid paths conservatively.


- **US-016-AC12:** Exercise the entire pinned upstream IPC integration subtree, retaining
  every case and its provenance. Verify binary/schema JSON round trips and native-read
  transformation behavior in Bun and Chromium. Preserve and report native-readable
  historical discrepancies rather than excluding cases or normalizing source silently.
  Fuzz corpora and ecosystems outside the selected subtree remain distinct coverage.
