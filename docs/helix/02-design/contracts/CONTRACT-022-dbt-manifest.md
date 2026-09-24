---
ddx:
  id: CONTRACT-022
  type: contract
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: US-022
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: umf.architecture
      kind: informed_by
---

# CONTRACT-022: dbt manifest JSON preservation

**Type:** library/schema. **Version:** 0.1.0. **Status:** draft.

## Purpose and Scope

Preserve dbt manifest artifacts without equating dbt models with core entities or physical
tables. The initial native grammar is manifest v12, pinned from dbt-labs/schemas.getdbt.com
commit d63e174a73312504393e8e1c21c0ef560d474860 with license and byte hashes.

## Normative Surface

umf.dbt.manifest stores {profile:"dbt-manifest-json",root:NativeJson} on module manifest,
element manifest. Payload/package schemas are complete; the separate native-schema.json is
an unchanged copy of the authoritative v12 grammar. Root and metadata must be objects and
metadata.dbt_schema_version a string. Other content remains exact source.

importDbtManifest(text,{id}), exportDbtManifest(document), inspectDbtManifest(document),
getDbtManifestNode(document,pointer), proposeDbtManifestNodeEdit(document,pointer,text),
dbtManifestRegistry() and dbtManifestPackage provide preservation, validation and copied edits.
Only existing pointers may be edited. Candidate operations return a copied Document and registry
validation. Source native-grammar failures are warnings, not grounds for destroying an artifact.

## Precedence, Compatibility and Errors

Unknown native keys and future manifest versions are preserved. Unknown payload/tagged-tree
representation keys survive in UMF but block native export. DBT_MANIFEST_STRUCTURE errors
reject malformed basic roots; DBT_MANIFEST_NATIVE_SCHEMA warnings describe v12 shape failures.
DBT_MANIFEST_VERSION and DBT_MANIFEST_CONTEXT qualify unknown/incomplete interpretation.
DBT_MANIFEST_DOCUMENT/PAYLOAD/EXPORT/EDIT errors identify document, representation or pointer
failures. Core exact-JSON parsing and limits apply. Failed edits never mutate input.

The native schema check uses a disposable JS-number view, ignores format annotations, inserts
no defaults and never reconstructs source from that view. It does not prove exact-number
constraint behavior outside JS precision, graph integrity, compilation, Jinja/SQL execution,
warehouse compatibility or native runtime validity. Original numeric tokens remain authoritative.

## Evidence and Remaining Scope

The synthetic dbt Core 1.10.0 / dbt-duckdb 1.9.3 project is development-only and runs against a
local in-memory DuckDB database. Independent Python JSON Schema checks compare source and
edited artifact validity; browser checks repeat public operations. Corpus and artifact hashes
record the observed versions. No native dbt support claim extends beyond that evidence.
Other artifacts, versions, graph-aware edits and projections remain unfinished.


Observed evidence: one seed, one model and four data tests build successfully; the generated
manifest contains six nodes and 429 macros. Both UMF formats and description edits pass Python
JSON Schema checks and dbt Core's WritableManifest.from_dict/to_dict comparison. Bun tests
bind native schema/build inputs to hashes, and Chromium checks both formats, edits and future
version preservation. Runtime dependencies are pinned in native/dbt/oracle-requirements.txt;
regeneration instructions are in native/dbt/README.md. Up to 100 native shape diagnostics are
returned, with DBT_MANIFEST_DIAGNOSTICS_TRUNCATED marking larger failure sets.

Authority: [dbt's schema registry](https://schemas.getdbt.com/) and the
[pinned manifest v12 source](https://github.com/dbt-labs/schemas.getdbt.com/blob/d63e174a73312504393e8e1c21c0ef560d474860/dbt/manifest/v12.json).
The unchanged schema supplies full v12 artifact shapes; it does not imply that the small native
fixture exercises every shape or semantic rule.


## Expanded resource corpus (US-022-AC4)

The second synthetic project is in native/dbt/rich-project; captured inputs and evidence live
in fixtures/dbt/rich. The original minimal project remains unchanged. The richer native build
contains three models, a snapshot, analysis, seed, hook, four data tests, source, exposure,
metric, group, semantic model, saved query and unit test, plus 430 macros. Each top-level v12
resource collection is populated, including custom docs, selectors and disabled models. This
coverage does not mean every alternative shape/configuration in those collections is exercised.

The native build reports six successes, five test passes and two no-ops. The signed-adjustment
unit test executes against synthetic inputs. The exposure and saved query are explicitly no-ops;
MetricFlow query execution is not covered. A local day-grain time spine satisfies the pinned
runtime's semantic-model prerequisite. All database work uses the in-memory DuckDB profile.

Thirteen independent edits cover model, snapshot, analysis, source, exposure, metric, group,
semantic-model, saved-query, unit-test and macro descriptions, a docs block and a disabled-model
description. Twenty-six exports pass Python JSON Schema and native WritableManifest comparison,
with only the requested value changed. Bun re-derives candidates and checks native output hashes;
Chromium repeats both source formats and all 26 edited outputs. Project inputs and build artifacts
are hash-bound in provenance.json. Broader configuration variants, graph-aware edits, other
manifest versions and artifact families remain unfinished.

No core promotion follows from this corpus. A dbt semantic entity describes grain/join roles;
that evidence does not equate it with DDD entity identity. A dbt model may materialize as a view,
table or other target, so its resource kind is not a portable physical-table declaration.


## Dependency inspection (US-022-AC5)

`inspectDbtManifestGraph(document)` returns the complete report shape in
`spec/extensions/dbt-manifest/graph-schema.json`: status checked/blocked, complete:false,
nodes, edges and diagnostics. Nodes contain the manifest dictionary ID, collection and exact
source pointer. Edges point from dependent to dependency and retain kind resource/macro,
occurrence pointer and whether an active target of the expected kind resolves. These are
manifest references, not an execution schedule or inferred SQL lineage.

The v12 resource collections are nodes, sources, exposures, metrics, semantic_models,
saved_queries and unit_tests. Macros, docs and groups are also indexed for active identity;
docs/group dependency-looking unknown fields are not interpreted. Dictionary keys must match
unique_id and active identities must be unique. Dependencies are read only from the known
resource/macro depends_on.nodes and depends_on.macros lists. Targets must resolve uniquely in
the appropriate collection kind. Disabled alternatives remain source and cannot silently serve
as active targets. Unknown versions block interpretation while preservation remains available.

Parent_map and child_map are checked as redundant resource relations derived from depends_on;
missing/extra entries and disagreements produce DBT_MANIFEST_GRAPH errors. Relation comparison
ignores duplicate multiplicity, while each explicit edge occurrence remains in the output.
The source arrays are never rewritten or deduplicated. Malformed resource/dependency shapes
produce diagnostics; this report does not replace native shape validation. Every report is
incomplete and carries existing preservation diagnostics plus DBT_MANIFEST_GRAPH_INCOMPLETE.
The report's checked status does not establish SQL/Jinja inference, group semantics, disabled
alternative selection, legal cycles, complete lineage, compilation or execution.

Native dbt Core 1.10.0 Manifest.build_parent_and_child_maps and build_macro_child_map agree
with both source fixtures. The minimal fixture has 436 indexed resources, 5 resource edges and
551 macro edges; the rich fixture has 450 resources, 13 resource edges and 551 macro edges.
Native equality is scoped to these fixtures; the native macro builder covers nodes/macros.
Bun checks exact input/report hashes, mutation isolation and negative/reference cases. Chromium
compares both reports through JSON/YAML and rejects stale redundant maps. No core graph semantics
are promoted by this native-specific dependency view.


## Dependency context selection (US-022-AC6)

`selectDbtManifestDependencies(document, {roots, includeMacros?, maxDepth?, maxNodes?})` returns
`{source, selection}` as defined completely in selection-schema.json. The source is a full deep
copy of the input core Document; the bounded selection never deletes native content. The packet
schema references urn:umf:core:0.1.0 for this source. Consumers must register that core schema
when validating packets and retain native registry validation separately.

Roots contain 1–64 nonempty IDs, each at most 4096 characters; repeated roots collapse in first
occurrence order. Defaults are includeMacros=false, maxDepth=16 and maxNodes=256. Depth is an
integer 0–128; node limit is 1–10000. Invalid options raise DBT_SELECTION_OPTIONS. Unknown roots,
a limit smaller than the distinct root set or an AC5-blocked graph return a blocked selection
with the original source and diagnostics. Unknown native versions remain preserved in source.

Traversal follows explicit upstream edges breadth-first, preserving root/source edge order.
Each node includes its original collection/pointer and minimum discovered depth. Each selected
edge keeps the AC5 occurrence and kind. Nodes are visited once, so recursion terminates while
repeated edges remain visible. Macro traversal is explicit; excluded macro edges, depth limits
and node limits produce boundary records containing the original edge and reason. Relation
cycle legality remains unchecked. A selected result may have boundaries and always reports
complete:false; its status does not mean all dependencies or execution context were selected.

The selection includes existing graph diagnostics and DBT_SELECTION_CONTEXT. It is a metadata
view for callers to extract resource content by the retained pointers, not a dbt CLI selector,
compiled execution plan or standalone runnable manifest. SQL/Jinja inference, indirect test
selection, resource activation and warehouse execution are outside this API. Full source
retention preserves unknown attributes and context beyond the bounded view.

Five fixtures cover the five-node saved-query/metric/semantic-model/model/seed chain, a depth
boundary, a node boundary, resource-only data-test context and macro-inclusive context. Native
dbt maps plus NetworkX 3.6.1 verify reachable sets and shortest depths for four cases. The
node-limit case separately verifies the explicitly requested root-only policy and omitted edge;
no native dbt node-budget semantics are claimed. Bun validates packet schemas/source recovery,
limits and recursive duplicate edges. Chromium repeats all five selections in both formats.


## Run results and catalogs (US-022-AC7)

The separate umf.dbt.artifact 0.1.0 package carries {profile:"dbt-artifact-json",root:NativeJson}
on module artifact, element artifact. Payload/package schemas and unchanged run-results-v6 and
catalog-v1 native schemas are in spec/extensions/dbt-artifact. Native schemas share the pinned
schema-repository commit and byte/license provenance of the manifest grammar. Both families are
published in the [dbt schema registry](https://schemas.getdbt.com/).

importDbtArtifact(text,{id}), exportDbtArtifact(document), inspectDbtArtifact(document),
getDbtArtifactNode(document,pointer), proposeDbtArtifactNodeEdit(document,pointer,text),
dbtArtifactRegistry() and dbtArtifactPackage mirror the preservation API with artifact-specific
module/profile/extension IDs. Root metadata.dbt_schema_version must be a string. Known grammar
selection is exact: https://schemas.getdbt.com/dbt/run-results/v6.json or
https://schemas.getdbt.com/dbt/catalog/v1.json. Other versions/families remain preserved without
interpretation. This does not replace the manifest package or grant its graph APIs to artifacts.

DBT_ARTIFACT_STRUCTURE/DOCUMENT/PAYLOAD/EDIT/EXPORT errors and
DBT_ARTIFACT_NATIVE_SCHEMA/VERSION/CONTEXT/REPRESENTATION warnings follow the same preservation
rules as the manifest profile. Native shape failures are warnings; unknown representation
content blocks native export. The first 100 shape diagnostics are retained with an explicit
DBT_ARTIFACT_DIAGNOSTICS_TRUNCATED warning when necessary. Formats and numbers beyond JS precision
remain qualified; source tokens are authoritative. No automatic artifact correlation occurs.

A fresh generated local DuckDB database is built with the minimal synthetic project, then
`dbt docs generate` captures two catalog nodes. Its run results contain six successful/passing
build outcomes. The rich project's separately captured results add no-op outcomes. Three
artifacts round-trip through both UMF formats and have native RunResultsArtifact/CatalogArtifact
and independent JSON Schema comparisons. The run-results class lives in dbt's Python v5 module
but explicitly declares schema_version("run-results",6); the artifact's declared v6 governs.

Candidate edits change only a run message or catalog column comment. They do not rewrite actual
execution history, status, row counts, timings, column types or warehouse state. The source remains
unchanged, and edited artifacts are synthetic reviewable candidates. Both parser normalization and
complete raw JSON value equality are checked. Browser checks repeat all three sources and edits.

The catalog observes total_amount as DOUBLE while the corresponding manifest declares
 decimal(18,2). Both are retained; the declaration is not an enforced model contract in this
fixture. No equivalence, automatic correction or contract violation is inferred. This is evidence
for keeping declared model metadata separate from observed physical metadata. Freshness/source
artifacts, semantic manifests, additional versions, cross-artifact joins and broader native
configurations remain unfinished.


## Source freshness artifacts (US-022-AC8)

umf.dbt.artifact additionally recognizes exactly
https://schemas.getdbt.com/dbt/sources/v3.json, using the unchanged pinned sources-v3-schema.json.
The existing payload and public artifact APIs apply without a new representation or implicit
status normalization. Pass, warn, stale error and runtime error remain distinct, as do adapter
responses and freshness results. No automatic freshness classification is performed by UMF.

The native project uses local custom SQL timestamp queries for recent (five minutes), stale
(two hours) and expired (four hours) results, with one-/three-hour warning/error thresholds.
A deliberately missing SQL function supplies a runtime error. These queries use in-memory
DuckDB and do not assert freshness of physical source tables. Native CLI/runner warnings and
errors are retained in command.log rather than suppressed or reclassified.

Observed dbt Core 1.10.0 behavior requires two separate captures: sources.json emitted by dbt
contains the three timed outcomes, while the failed query is a PartialSourceFreshnessResult
omitted by FreshnessExecutionResultArtifact.from_result's SourceFreshnessResult filter. The
runner still reports four outcomes and success=false. runner-results.json is a separately labeled
native reconstruction using process_freshness_result on every in-memory result; it is not the
emitted artifact and never replaces it. Provenance records the omitted ID and both outcome sets.
Missing emitted results must not be interpreted as success, nor may an artifact alone establish
complete run outcomes.

Both captures validate against the pinned schema and native FreshnessExecutionResultArtifact
parser. Four format round trips and four diagnostic-only candidates preserve all other JSON
values and native normalized content. The candidate edits affect adapter-message/error text,
not status, age, criteria or execution state. Native tests also preserve adapter _message=OK
alongside a stale-error freshness result: SQL query success and freshness policy satisfaction
are separate meanings. Bun and Chromium evidence is under fixtures/dbt/freshness.

Additional freshness configurations, physical source-column checks, semantic-manifest interchange,
other artifact versions, cross-artifact reconciliation and broader execution semantics remain
unfinished. No core status/error concept is promoted from these superficially similar fields.


## Failing build outcomes (US-022-AC9)

The run-results v6 profile preserves native success, error, skipped, pass, fail and warn
states independently of adapter-response messages and failure counts. A message edit remains
a candidate artifact and cannot establish a changed run status, retry or warehouse state.
Missing/null fields and empty timing arrays remain distinct from successful execution.

The isolated native/dbt/failure-project emits eight rows under dbt Core 1.10.0 and DuckDB
1.5.5: two successful models, one missing-function SQL error, a failed/warning/passing test,
and two skipped downstream models. One depends on the broken model; the other depends on
a successfully built model whose data test fails. The passing test has zero failures, the
warning and failed tests each have one failure, and both retain adapter response OK.
Skipped rows retain null failures/message and empty timing/adapter responses. UMF does not
infer execution from those values or derive arbitrary scheduling rules from this example.

fixtures/dbt/failure retains the exact emitted results, manifest, native command log and
hash-bound provenance. The collector asserts exit code 1 and all expected outcomes. Shared
artifact evidence now has four artifacts, eight native/parser/schema format comparisons and
eight message/comment edit comparisons. The browser repeats those comparisons. Bun additionally
checks failure counts, explicit manifest dependencies and candidate-edit immutability. The
captured manifest supplies fixture context; no public cross-artifact correlation API is implied.
Fail-fast, cancellation, retry, incremental execution, other versions and broader transformations
remain required coverage beyond this example. No new core concept is promoted.


## Semantic manifest (US-022-AC10)

umf.dbt.semantic 0.1.0 is a separate package because dbt's semantic manifest has no
metadata.dbt_schema_version envelope. It stores {profile:"dbt-semantic-json",root:NativeJson}
on module semantic, element semantic. importDbtSemanticManifest(text,{id}),
exportDbtSemanticManifest(document), inspectDbtSemanticManifest(document),
getDbtSemanticManifestNode(document,pointer), proposeDbtSemanticManifestNodeEdit(document,pointer,text),
dbtSemanticManifestRegistry() and dbtSemanticManifestPackage follow the copied-source contract.
Roots must be objects; unknown/missing versions remain preserved and uninterpreted. Interpretation
requires project_configuration.dsi_package_version string components 0, 8, 5. Package schemas
fully describe the payload; the separate native-schema.json describes derived serialized shapes.
DBT_SEMANTIC_MANIFEST_STRUCTURE/DOCUMENT/PAYLOAD/EXPORT/EDIT failures and
DBT_SEMANTIC_MANIFEST_VERSION/CONTEXT/NATIVE_SCHEMA/REPRESENTATION/DIAGNOSTICS_TRUNCATED
qualifiers mirror the existing artifact boundaries. Shape mismatches are warnings; representation
additions block native export. Exact numeric source tokens remain authoritative.

Schema authority is the pinned dbt-semantic-interfaces 0.8.5 PydanticSemanticManifest model.
Its raw schema has 41 definitions but rejects 43 null values in the emitted fixture even though
its native parser accepts them. native/dbt/semantic-sources retains that raw schema. The derived
Draft 2020-12 schema adds an anyOf null branch to each of 67 fields whose native ModelField has
allow_none=true. All other generated field shapes remain unchanged. Nullable unconstrained Any
map values already admit null; the generator asserts there are no other nullable nested collection
members in this pinned model. Derivation, source-file hashes, runtime versions and license are
recorded separately. The schema describes serialized values; it does not implement Pydantic
coercion, defaults, custom parsers or native cross-resource semantic rules.

The isolated native parse of rich-project emits semantic models, primary/foreign entities, a
sum measure, a simple metric, time-spine configuration and a saved query. Three independent
model/metric/saved-query description edits yield six native/parser and semantic-validator
comparisons. Raw JSON equality and the derived schema are checked separately. Chromium repeats
six format round trips and edits; Bun covers schema hashes, native null discrepancies, unknown
versions and fields, invalid shapes and representation loss guards. The native Pydantic parser
drops unknown root and model fields; UMF preserves them rather than exporting a normalized native
model. Source, logs, project and runtime inputs are hash-bound under fixtures/dbt/semantic.

This is not complete metric-type, join, semantic validation or query-execution coverage. Browser
inspection only checks serialized shapes. No DSI entity is promoted to core: analytical grain/join
roles do not establish equivalence to DDD identity. Newer DSI and MetricFlow interface versions,
semantic transforms, source configuration and cross-system projections remain required work.
Upstream now marks this package deprecated and names metricflow-semantic-interfaces as its
successor; the 0.8.5 evidence does not imply successor compatibility.
Source: [upstream interface repository](https://github.com/dbt-labs/dbt-semantic-interfaces),
checked 2026-09-20, and installed source hashes in semantic-sources/provenance.json.


## Native metric types and parameter candidates (US-022-AC11)

The second semantic project, native/dbt/metrics-project, supplies seven metric definitions
covering all five members of the pinned native MetricType enum: simple, ratio, derived,
cumulative and conversion. The native oracle compares the observed type set to the runtime enum;
this is type-branch coverage, not exhaustive metric configurations or execution conformance.
The project includes sum/count/count-distinct measures, ratio inputs, derived aliases and a
prior-period offset, rolling and grain-to-date cumulative forms, conversion measures/entity/window,
and a saved query listing all seven metrics. dbt parse produces the authoritative source artifact.

Eleven independent existing-pointer candidates are exported through both UMF formats. Six
pass native semantic validation: sum-to-average measure aggregation, ratio numerator alias,
derived offset count, rolling-window count, cumulative period aggregation and conversion
calculation mode. These edits intentionally change declared meaning; no query result, analytic
equivalence or safe deployment is asserted. Source input and all fields outside the requested
pointer remain unchanged. Redundant native input_measures remain untouched; no candidate changes
the referenced measure set and no automatic dependency recomputation is claimed.

Three candidates pass serialized-shape checks and native parsing but fail native semantic rules:
setting both a cumulative window and grain-to-date, a missing derived input metric and a missing
conversion entity. Unknown aggregation and null metrics fail both shape validation and native
parsing. Invalid native candidates remain exportable source evidence with warnings. Every public
inspection remains complete=false; shape acceptance cannot establish native semantic validity.
The oracle records actual errors for the five rejected cases. Chromium checks source recovery,
22 candidate exports, matching shape outcomes, incomplete validation and source immutability;
it does not run the Python semantic validator.

Evidence is under fixtures/dbt/semantic-metrics with hash-bound project/manifest/log/runtime
inputs, two source-format checks and 22 native candidate comparisons. Broader configurations,
SQL planning/execution, semantic reference-changing transforms, successor interface versions,
cross-system projections and remaining consumer requirements stay open. No core promotion follows.


## Serialized field boundary audit (US-022-AC12)

The native field oracle enumerates every field on every reachable Pydantic model in the pinned
semantic manifest: 143 fields, each receiving 13 authored JSON boundary values (1,859 vectors).
It invokes native ModelField.validate with the owning class, then independently serializes
accepted values using Pydantic's JSON encoder. All 690 accepted serializations satisfy the derived
field schemas in Python, Bun and Chromium. This audit exercises every field schema and referenced
definition, but does not exhaust arbitrary values or model/root validators.

Native parsing accepts 427 inputs whose original JSON does not satisfy the serialized shape;
normalization/coercion is distinct from source preservation. The native field calls also raise
128 exceptions (AttributeError or ParsingException), recorded separately from ordinary returned
validation errors. UMF neither applies those coercions nor emulates the exceptions. The exception
observations concern direct field-parser calls, not a claim about every top-level parser entrypoint.
No raw-input/native-parser equivalence follows from the serialized schema.

fixtures/dbt/semantic-fields/results.json binds the evidence to the published schema hash and
retains inputs, native acceptance, exceptions, serialized values and both shape outcomes. Bun
and Chromium repeat the 1,859 input checks plus 690 serialized checks. This extends field-level
schema evidence without claiming complete documents, all semantic rules or MetricFlow execution.
