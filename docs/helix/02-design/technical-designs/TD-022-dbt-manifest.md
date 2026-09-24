---
ddx:
  id: TD-022
  type: technical-design
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: US-022
      kind: informed_by
    - id: CONTRACT-022
      kind: informed_by
    - id: umf.architecture
      kind: informed_by
    - id: ADR-002
      kind: informed_by
---

# TD-022: dbt manifest interchange

## Approach and Components

Use shared NativeJson for authoritative content and vendor the pinned official v12 JSON Schema
for separate shape inspection. A disposable number view is never exported. Registry warnings
allow invalid/unknown source to be captured; representation additions block lossy native export.
All access and candidates copy inputs. No metadata is promoted into core.

## Validation and Integration

Generate a real manifest with an isolated, pinned dbt/DuckDB environment, synthetic seeds,
models and data tests. Native tools never enter the browser bundle. Compare Python JSON Schema
validation, source/description-edit equality and actual Chromium behavior. Fixture generation
has no remote database connection and disables anonymous usage reporting. Runtime snapshots and
source-schema hashes are retained for reproducibility.

## Risks and Next Work

A published manifest schema is not a compiler or dependency-graph verifier. Unknown fields,
future versions, format annotations and JS-number validation limits remain explicit. Next add
broader resource fixtures, native artifact parser evidence, graph-aware projections, additional
artifact families and source-project interchange.


AC4 preserves the first native fixture and adds a second project selected by --rich in the
fixture generator. The build outcome gate distinguishes six successes/five test passes from
two no-ops. Independent edit cases are selected by exact JSON pointers across resource kinds,
then compared as complete native dataclass outputs. The browser hashes its exports against
native-checked bytes to avoid passing large duplicate fixture strings into the harness. Existing
public APIs and schemas are unchanged; this increment expands evidence rather than inventing a
second representation. Remaining semantic execution and graph integrity limits still apply.


AC5 uses a copied exact tree and a disposable object view whose interpreted fields are strings,
arrays and dictionaries. Maps index IDs safely without using resource names as prototype keys.
Ambiguous targets stay unresolved. Explicit edges retain occurrence pointers; derived parent/
child sets compare relation membership while leaving source multiplicity intact. The oracle
uses dbt's internal map-building methods, not a second implementation of the TS algorithm.
Native source/report hashes bind evidence to public results. This increment does not infer
relationships from SQL/Jinja text or classify graph cycles as executable.


AC6 composes the checked AC5 graph with a breadth-first upstream selector. It indexes outgoing
edges once and tracks discovered depths, giving bounded traversal without recursion. The output
carries the entire copied source and source pointers; only the view is bounded. Boundary records
keep excluded edge occurrences, so consumers cannot mistake a small view for complete context.
The packet schema composes the core document schema with a complete selection report. Native
map builders plus NetworkX independently verify reachability/depth; UMF's node-budget policy is
separately identified rather than attributed to dbt. This contributes metadata selection toward
FR-41 but does not finish the seven required consumer demonstrators.


AC7 adds an independent generated-artifact package with exact metadata-version dispatch to two
pinned native schemas. It retains the NativeJson/copy/edit and representation-guard approach;
manifest graph APIs remain scoped to the manifest package. The native fixture generator uses a
fresh UUID-named local DuckDB file so build and docs-generation processes observe the same
relations without changing existing in-memory fixtures. Native artifact parsers compare source
and message/comment candidates. The observed DOUBLE versus declared decimal example is retained
as two distinct metadata statements. No native runtime dependency enters the browser library.


AC8 extends native artifact dispatch with sources v3 and retains the full unchanged source
schema. The fixture harness uses dbtRunner to capture both the actual emitted JSON and all
in-memory outcomes. Expected failure is asserted explicitly; it is not treated as a successful
run. A separate reconstruction exercises the native runtime-error union branch that the pinned
emitter omits. Complete JSON/native parser comparisons keep the two producer paths distinct.
The library adds no SQL execution or status inference; provider omissions remain visible evidence.


AC9 uses a separate failure-project and dbt-failure-fixtures.py collector. Native nonzero exit
is expected only when all eight resource outcomes match; logs and source bytes are retained.
The existing artifact round-trip/native oracle/browser matrix now includes the failed build
and a copied SQL-error message edit. failure.test.ts adds an independent failed-test message
candidate, source immutability, counts, empty skipped fields and manifest dependency checks.
Native output remains authoritative: UMF neither recomputes statuses nor reruns the build.
The existing run-results v6 schema covers these branches without new core vocabulary.


AC10 uses a distinct semantic.ts adapter and umf.dbt.semantic package. Version detection reads
DSI package components from project_configuration, without injecting the regular dbt metadata
envelope. The exact tree is authoritative. dbt-semantic-sources.py preserves Pydantic's raw
41-definition schema and derives nullable serialized field shapes from native field metadata
(67 explicit null branches); it asserts nested collection nullability assumptions. Browser schema
inspection neither reconstructs source nor executes Python validators. The native oracle records
43 raw-schema null failures, parser agreement, semantic-validator outcomes for three description
edits, and native unknown-field dropping. The collector runs an isolated dbt parse, avoiding
SQL/MetricFlow execution. Source hashes and separate derived-schema provenance qualify support.


AC11 adds --metrics to the isolated semantic fixture collector, selecting metrics-project and
separate cache/output directories. It does not replace the first semantic fixture. Candidate
pointers are located by exact native metric names, preserving source array order. Eleven
parameter replacements exercise all five metric types; source and edited exports are compared
as whole JSON values, then independently checked with JSON Schema, native Pydantic and native
SemanticManifestValidator. Explicit expected outcomes prevent shape-only acceptance from becoming
an execution claim. All edits use the existing copied-candidate public API. Native semantic
validation remains development evidence, separate from the browser's serialized-shape inspector.


AC12 adds a field-level independent oracle over all 143 reachable native model fields. It passes
copied boundary inputs to ModelField.validate and uses the native JSON encoder for accepted
outputs, retaining coercion and exception distinctions. Validators compile references into the
published schema rather than copying field shapes. Bun and Chromium match the Python JSON Schema
outcomes for 1,859 inputs and 690 serializations. Whole-model validators remain outside this audit;
existing full-manifest tests supply separate, scoped evidence.
