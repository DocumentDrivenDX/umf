---
ddx:
  id: US-018
  type: user-stories
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-002
      kind: informed_by
---

# US-018: Preserve and edit Delta schema JSON

**Feature:** FEAT-002. **PRD:** FR-1/5/6/12/39/41. **Priority:** P0.

As a metadata consumer, I need Delta schemas and their column metadata available in
Bun and browsers without native normalization or assumptions about table features.

- **US-018-AC1:** Exact schema tokens and unknown native content survive UMF JSON/YAML.
  Required known field/array shape failures reject; missing map valueContainsNull remains
  absent. Native parsing outcomes/re-emissions are unchanged by UMF round trips.
- **US-018-AC2:** Exact metadata integers, nested values, opaque expressions and unknown
  types are retained without execution. Unknown representation fields survive UMF and
  block native export. Protocol validity and duplicate-name checks remain qualified.
- **US-018-AC3:** Copied pointer access and atomic edits leave source untouched. Invalid
  known shape rejects the candidate. Native parsing confirms an authored nested edit;
  Chromium exercises public APIs without host globals.

Table metadata/protocol profiles, feature checks, dependency-aware edits, upstream
corpora and cross-system transforms remain required Delta work beyond this slice.

- **US-018-AC4:** A separately identified table-context profile preserves a supplied
  metadata/protocol pair, embedded schema spelling, exact numbers, unknown native keys
  and feature declarations through both UMF formats. Diagnostics identify known feature
  list/version and partition inconsistencies without discarding source.
- **US-018-AC5:** Context access/edits copy source and validate known shape. Native
  metadata-only tables reopen exported contexts with matching schema, configuration,
  partitions and protocol/features. Browser checks cover round trips, edits and future
  feature preservation. Generic edits do not imply safe table evolution.

- **US-018-AC6:** Active column-mapping contexts receive exact integer ID, physical-path,
  maximum-ID and protocol/feature diagnostics. Checks traverse nested structs, arrays and
  maps without equating dotted names with path separators. Source is preserved, and
  historical uniqueness/monotonicity and actual Parquet field IDs remain unverified.

- **US-018-AC7:** Mapped-field rename preserves physical names, field IDs and maximum ID,
  updates direct top-level partition references, and blocks logical collisions, invalid
  mapping context, known expression dependencies and unsupported feature/provider context.
  Explicit uninterpreted-reference policy and incomplete external-state diagnostics are
  required. Native mapped reads verify records before/after top-level, partition and
  nested renames in name/id modes without rewriting Parquet; Chromium matches candidates.

- **US-018-AC8:** Pin upstream transaction-log JSON with hashes/provenance, extract every
  available schema and unambiguous same-commit metadata/protocol pair, preserve supported
  shapes through JSON/YAML, and retain explicit known rejections. Native before/after
  observations and browser results must agree. Do not infer a snapshot from missing logs,
  checkpoints or data files.

- **US-018-AC9:** Capture complete bounded Delta JSON-lines source as text, preserving
  whitespace, terminators, exact numeric spelling, unknown actions and malformed lines
  through UMF JSON/YAML. Inspection reports UTF-16 source locations and explicit parse
  failures without discarding source. Limits preserve captured but uninspected content.
  Browser exports match upstream source hashes. Envelope parsing never claims action
  semantics, valid commits or reconciled snapshots.

- **US-018-AC10:** Describe all ten named Delta action envelopes and their known fields
  in JSON Schema. Diagnose malformed known shapes and exact signed integer overflow
  without rounding or changing captured source. Preserve arbitrary commitInfo JSON,
  unknown actions and unknown fields. Independent structural and browser checks must
  agree on pinned upstream input; shape acceptance must not imply feature or transaction
  validity, embedded-content interpretation or reconciled state.

- **US-018-AC11:** Reconcile an explicitly supplied, contiguous sequence of ordinary
  JSON commits starting at version zero into copied protocol/metadata, active file actions,
  unexpired-by-policy tombstones, application transactions and domain metadata. Preserve
  every source commit and uninterpreted action. Reject gaps, ambiguous within-commit
  duplicates and checkpoint actions instead of returning partial state as a snapshot.
  Latest transaction occurrence wins even when its application version decreases.
  Native metadata/file observations must agree on representative histories. Action-state
  reconciliation does not establish data-reader support, transaction validity or safe writes.

- **US-018-AC12:** Exercise every version prefix from the pinned upstream ordinary
  commit files. Verify source hashes, preserve all sources, and record missing-history
  or malformed-action blocks. Compare accepted native log-state observations against
  UMF-reconciled output independently; distinguish native rejections from successful
  observations. Browser states and diagnostics must match Bun. Do not claim original
  dataset reads when data/checkpoint files are unavailable.

- **US-018-AC13:** Recover action state from an explicitly versioned V2 JSON checkpoint
  with embedded file actions, then apply contiguous later commits without requiring
  earlier JSON history. Require matching checkpoint metadata and V2 protocol features;
  reject forbidden checkpoint actions, malformed/ambiguous state and unresolved sidecars.
  Preserve checkpoint source independently of later commits. Native checkpoint recovery
  and lowered-state observations, plus browser results, must agree. Parquet/sidecar and
  multipart support remain explicit pending work.

- **US-018-AC14:** Pin upstream Parquet checkpoint/sidecar bytes and last-checkpoint
  metadata with provenance/hashes. Compare browser-compatible decoding against typed
  native values, including exact int64, timestamp units and decimal precision/scale.
  Record default decoder losses and demonstrate fixes on independent boundary fixtures
  before integrating decoded actions into recovery. Decoder experiments do not establish
  binary UMF round trips, complete Parquet support or checkpoint recovery by themselves.

- **US-018-AC15:** Project representable Parquet checkpoint/sidecar rows into exact
  Delta JSON actions while retaining authoritative bytes. Require one populated action
  per row; record every known optional null field normalized to absence. Preserve
  unknown null fields and exact integers. Block duplicate JSON keys, unsupported scalar
  conversions and malformed known action shapes without returning partial actions.
  Compare native rows independently and repeat in Bun and Chromium. Projection alone
  must not imply checkpoint-state validity or resolve missing sidecars.

- **US-018-AC16:** Recover V2 JSON checkpoint state using explicitly supplied Parquet
  sidecars. Bind exact reference strings and declared byte sizes; reject missing, duplicate
  or unused bindings, mixed embedded/sidecar file actions and non-file sidecar actions.
  Retain original checkpoint, commits, sidecars, null-omission records and derived-line
  origins. Native recovery without earlier history and browser states must agree. Typed
  statistics that cannot yet project must still block without partial state. Do not infer
  filesystem placement, URI alias equivalence, classic/multipart support or safe writes.

- **US-018-AC17:** Represent annotated scalar values inside add.stats_parsed and
  add.partitionValues_parsed using explicit JSON conversions. Preserve exact decimal
  tokens, finite floats including negative zero, proleptic Gregorian dates and timestamp
  unit/UTC-local distinctions. Record each conversion's row, pointer, typed input and
  JSON output, including sidecar origins during recovery. Native and browser evidence
  must cover submicrosecond negative epochs. Reject unannotated INT96, nonfinite numbers
  and out-of-profile dates rather than guessing or rounding.

- **US-018-AC18:** Recover from one explicitly supplied Parquet checkpoint with declared
  V1 or V2 spec, optionally supplying V2 sidecars. V1 must reject checkpointMetadata and
  sidecar actions; V2 retains its matching marker and protocol rules. Preserve original
  bytes, derived action projection, typed-conversion evidence, recovery origins and later
  commits. Native scans without earlier history and browser results must agree for both
  specs. Exercise every pinned single-file checkpoint and distinguish unsupported native
  reader features from UMF action-state results. Multipart assembly remains separate.

- **US-018-AC19:** Assemble a complete explicit multipart Parquet checkpoint set with
  matching version, canonical names, unique part ordinals and declared part count. Enforce
  Spark-style hash clustering and reject V2-checkpoint feature use. Preserve each source,
  per-part projections and combined-line origins; duplicate actions must not silently merge.
  Native recovery without earlier history, independent hash vectors and browser outcomes
  must agree. Do not infer atomicity or common-writer provenance from a complete part set.
