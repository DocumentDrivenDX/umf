---
ddx:
  id: TD-018
  type: technical-design
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: US-018
      kind: informed_by
    - id: CONTRACT-018
      kind: informed_by
    - id: SPIKE-005
      kind: informed_by
---

# TD-018: Exact Delta schema foundation

The adapter in src/adapters/delta/index.ts uses the shared bounded NativeJson parser,
core envelope and registry. scripts/delta-schema.ts generates the extension payload,
source grammar and package. The registry semantic hook checks known native structure
beyond payload shape and emits preservation/interpretation diagnostics. It does not
execute a Delta engine or claim feature-valid table metadata.

A temporary host JSON view checks shape and metadata keys only. Native export renders
the exact tree, so numbers outside binary64 precision never depend on that view. Tagged
representation additions block export. Access and edits copy source; candidate validation
runs before publication. Native parser defaulting and unknown-property loss are never
used to regenerate the authoritative source.

scripts/delta-umf.ts exercises 37 round trips/two known shape failures and a nested edit.
delta-umf-oracle.py independently compares deltalake outcomes against SPIKE-005 baselines.
delta-browser.ts bundles the public TypeScript API and checks the corpus in Chromium.
Python/Rust are development oracles only. Table protocol and metadata need their own
representation/validation surface before dependency-aware changes can be implemented.

## Independent table context

src/adapters/delta/table.ts registers umf.delta.table independently of schema JSON.
scripts/delta-table-schema.ts generates its payload and context grammar. Exact NativeJson
retains the supplied protocol/metadata pair and treats schemaString as authoritative text.
Embedded parsing supplies a copied semantic view and warnings, never normalized source.

Known shape validation rejects malformed context containers. Feature, configuration and
embedded-schema diagnostics leave interpretation incomplete. Context edits are generic
candidate changes; they neither repair dependencies nor produce transaction commits.
The native oracle writes exported protocol/metadata into temporary metadata-only logs,
opens them with delta-rs, and compares context. The browser script uses only compiled
TypeScript. Full snapshot/state reconciliation is deliberately not inferred from the pair.

column-mapping.ts traverses the exact embedded schema independently of host numeric
views. Path identity uses JSON-encoded arrays and column IDs use BigInt, preserving
source spelling and preventing unsafe-integer collisions. The table inspection hook
adds these warnings without changing export authority or generic candidate edit rules.

rename.ts selects actual schema fields through known types, uses the exact schema edit
API, then replaces embedded schemaString atomically in a copied table context. A separate
step updates top-level partition names. Candidate diagnostics reject collisions before
returning a result. Physical identifiers and native file actions are never regenerated.
Native verification applies the candidate only inside temporary authored tables and uses
DataFusion scan(), whose mapping behavior was independently checked in SPIKE-005.

The independent umf.delta.log package stores a delta-jsonl-source profile with authoritative
text. captureDeltaLog/exportDeltaLog preserve at most 1,000,000 UTF-16 code units, including
malformed input. inspectDeltaLog splits LF/CRLF lines, records UTF-16 start/end positions
(end excludes terminator), and parses up to 10,000 envelopes into exact NativeJson nodes.
Duplicate keys and invalid envelopes produce diagnostics; unknown actions remain opaque.
Blank lines are preserved and diagnosed. parsedAll describes nonblank envelope parsing,
not semantic validity; empty source is diagnosed, and complete is always false. The line
limit makes parsedAll false without truncating stored text. Unknown representation fields
survive UMF serialization but block native export. The inspection result has its own JSON
Schema. This text profile does not capture arbitrary non-UTF-8 byte streams.

Action inspection is layered on source capture through inspectDeltaActions. Its generated
known-field JSON Schema permits opaque future actions and properties. A temporary JS view
supplies shape checks only; an independent tree walk validates exact integer tokens and
signed bounds, and reports unknown fields. This prevents JS rounding from making overflow
or fractional native integer values look valid. commitInfo deliberately permits arbitrary
JSON. The result retains source and complete:false; cross-action state rules are a separate
future layer. See CONTRACT-018/US-018-AC10 for the exact accepted scope and exclusions.

AC11 introduces reconcileDeltaCommits for complete, explicitly versioned JSON histories
from zero. Version strings are canonical nonnegative signed-int64 values and input order
must be contiguous. Per-commit action checks precede application; ambiguous duplicate
keys and checkpoint-only actions block the entire result. Exact NativeJson actions and
all source documents are copied. File identity is the encoded path plus the protocol's
DV unique ID; removals and additions in one commit apply as sets, never line-order wins.
No tombstone expiry is inferred without a caller-supplied clock/retention policy. Unknown
actions remain in a deferred list and all sources remain authoritative. This layer derives
action state only, with complete:false and explicit feature/data/path-interpretation limits.

The AC12 upstream harness groups only direct, 20-digit ordinary commit files and exercises
every available prefix. It verifies manifest hashes before capture. Native originals are
loaded from raw files independently of UMF, then compared to lowered action states in
separate directories. Browser checks hash the complete exact-node state and compare all
blocking diagnostics. This evidence includes absent-history errors and native rejection
parity; it does not change the fail-closed known-shape policy for superseded malformed
metadata or add checkpoint support.

AC13 shares the existing replay engine between zero-based histories and an explicit V2
JSON checkpoint seed. Seed validation precedes application; subsequent versions use the
original checkpoint offset with exact BigInt comparisons. Public results separate the
checkpoint source from later commit sources and remap diagnostic locations accordingly.
Checkpoint metadata remains authoritative in the preserved source, while only reconciled
table actions seed state. Unresolved sidecars block before any state is returned. Checkpoint
remove keys use full logical-file identity so distinct DV tombstones may coexist. No
synthetic history or missing file actions are inferred.

AC14 evaluates hyparquet 1.31.1 as a development-only checkpoint decoder. Typed timestamp
callbacks and physical-decimal BigInt reconstruction avoid demonstrated default conversion
loss. It remains outside src/public exports until binary envelopes, resource bounds,
logical-type coverage and sidecar/checkpoint assembly have explicit contracts and tests.
SPIKE-005 records the pinned native corpus and the remaining unsupported cases.

AC15 uses the public local TypeScript Parquet typed decoder, not the AC14 development
experiment. The Delta bridge converts representable typed rows to NativeJson and validates
them through the existing action inspector. It checks field names with own-property lookup,
uses null-prototype maps, rejects duplicate keys and escapes omission pointers. Known optional
null omission is an explicit derived-view normalization; the original binary remains the
recovery authority. Unsupported typed statistics block the whole projection. This increment
prepares sidecar action inputs but does not modify reconciliation or fetch referenced files.

AC16 resolves explicit sidecar bindings into a separate derived V2 JSON checkpoint, then invokes
the existing replay engine. The wrapper retains original sources and line/row origins instead
of replacing authoritative checkpoint references. It enforces exact string identity, declared
byte lengths, sidecar-only file actions and no mixed embedded files before replay. Per-file
projection failures stop recovery; full derived inputs may be retained for protocol validation
failures. Corpus evidence distinguishes supplied-but-uninterpretable upstream statistics from
missing sidecars. The implementation performs no storage I/O and adds no browser dependencies.

AC17 adds a small annotated-scalar converter at the checkpoint action boundary. Decimal and
floating carriers produce NativeJson numeric tokens; timestamp splitting uses BigInt quotient
and remainder with negative-remainder correction. Only bounded whole calendar days pass through
Date, where the millisecond integer is exactly representable; subsecond values never pass through
floating-point dates. The converter records typed inputs and outputs and is gated by escaped
paths under the two checkpoint-only add fields. Sidecar recovery forwards conversion records
with source indexes. No INT96 timestamp meaning is inferred from its physical carrier alone.

AC18 splits checkpoint replay's mode into false, v1 and v2. Ordinary commit semantics remain
unchanged. V2 marker/feature checks run only in v2 mode; V1 forbids marker/sidecar actions before
state application. A new Parquet wrapper composes exact action projection and checkpoint
recovery, retaining both reports so no binary provenance or typed scalar evidence disappears.
Its explicit spec argument avoids inferring protocol rules from a filename. The upstream harness
selects a spec from available parsed marker evidence solely to build explicit test inputs;
unsupported projections remain blocked. Source filename discovery and multipart assembly are
outside this API. Browser execution uses the existing local TypeScript decoder and replay engine.

AC19 projects each explicitly named multipart source independently, retaining all source and
conversion evidence. A canonical-name index orders combined actions without changing caller
part order. Whole-set clustering validation precedes V1 replay; repeated actions reach the
existing duplicate check instead of being coalesced. Origins are published with the derived
recovery report. A small local string-hash implementation matches Spark's legacy signed-tail
algorithm, rather than assuming standard Murmur3 implementations are interchangeable.

Primary source references for the hash implementation are Apache Spark v4.0.1
[Murmur3_x86_32.java](https://github.com/apache/spark/blob/v4.0.1/common/unsafe/src/main/java/org/apache/spark/unsafe/hash/Murmur3_x86_32.java)
and [Catalyst hash expressions](https://github.com/apache/spark/blob/v4.0.1/sql/catalyst/src/main/scala/org/apache/spark/sql/catalyst/expressions/hash.scala).
The pinned Delta PROTOCOL.md multipart section requires Spark-style clustering and forbids
multipart checkpoints when v2Checkpoint is enabled. JVM-generated vectors provide independent
runtime evidence; the native gateway and Java 21 requirement remain development-only.
