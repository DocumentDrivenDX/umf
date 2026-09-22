# UMF project documentation

**Current owner priority (2026-09-21):** TableSpec, PostgreSQL, Microsoft SQL Server,
Avro and Parquet schema ingestion, with shared core field metadata and a basic
scalar type field. This supersedes older next-step notes below. RDF/OWL/RDF/XML
work is deferred. See the current-priority section of the
[implementation plan](04-build/implementation-plan.md).

**Latest core scope amendment:** UMF-defined ideals and native-equivalence
graduation now have separate gates. The next ordered concepts are field,
nullability, cardinality, author-stated facets and key. See
[FEAT-005](01-frame/features/FEAT-005-core-ideals.md),
[CONTRACT-040](02-design/contracts/CONTRACT-040-core-ideals.md), and the
[ordered implementation plan](04-build/implementation-plan.md).
Experimental Field authoring and validation are implemented in core 0.2.0.
Field ideal admission and qualified five-system delivery have passed their
separate gate; no native equivalence is claimed. Nullability core implementation
has passed its core-task acceptance: experimental 0.3.0 validation, typed authoring,
migration/rollback, selection and versioned Field APIs are implemented.
TableSpec, PostgreSQL and SQL Server Nullability bindings have passed qualified
acceptance, including explicit scope/carrier metadata, strict/report projection
and both retained recovery directions. Native checks preserve distinctions
between stored availability, accepted write inputs and query-produced NULL.
All five prior Field bindings have fresh native/browser evidence and the Field
conformance gate passes. SQL Server's authored DDL also passes under opposing
session null-default settings. See the
[SQL Server acceptance record](../../fixtures/validation/sqlserver-nullability-acceptance-evidence.json).
Avro Nullability now has scoped underlying-value classification and retained
native recovery. Its authored projection and the Parquet binding remain. The
prior Field gate needs its required refresh after the new public API. The
experimental 0.3.0 concept has not passed
its five-system delivery gate. No native equivalence is claimed.
Cardinality, facets and key follow Nullability. See the
[Field conformance evidence](../../fixtures/validation/field-conformance.json).

Full Bun regression baseline (2026-09-21): 718 tests across 176 files, 64,038
assertions, zero failures. The [verification record](../../fixtures/validation/bun-full-suite.json)
includes source/log fingerprints and limits. This does not complete the remaining
integration and metadata-consumer requirements.

Recorded priority regression: 163 tests across 58 files, 7,566 assertions, zero
failures across TableSpec, PostgreSQL, SQL Server, Avro, Parquet and shared
core/consumer tests. The [priority verification record](../../fixtures/validation/priority-regression.json)
contains commands, logs, source fingerprints and scope limits. All 174 published
schemas and 32 extension packages pass their audits; typechecking and browser
build pass. This updates evidence for the priority systems, not the full-repository
baseline or every standalone native/browser oracle.

Core elements now expose `scalarType` families. The first TableSpec package supports
monolithic and split-bundle ingestion, copied column edits and native recovery with derived core
metadata; see [CONTRACT-030](02-design/contracts/CONTRACT-030-tablespec.md).
This does not complete the five-system ingestion and transformation work.
Avro imports also expose core field elements and copied native field metadata,
including qualified scalar mappings; see [CONTRACT-007](02-design/contracts/CONTRACT-007-avro.md).
PostgreSQL catalog captures now expose copied column metadata and core scalar
families based on native type identities; see [CONTRACT-015](02-design/contracts/CONTRACT-015-postgresql.md).
Raw PostgreSQL DDL also exposes copied declarations and qualified builtin syntax
families, explicitly separating declared columns from catalog expansion and resolution.
Edited PostgreSQL DDL now has native catalog and enforcement evidence across four
fresh PostgreSQL 17.4 databases, including dump reconstruction and browser WASM replay.
`selectCoreElements` provides shared metadata filtering and explicit core-reference
traversal while retaining full native source context; see
[CONTRACT-001](02-design/contracts/CONTRACT-001-core-envelope.md).
An authored TableSpec/service/DDD example now demonstrates all seven metadata
consumer classes, including executable row rename/validation and browser-rendered
graph/forms. It preserves unknown vocabulary and explicit enforcement limits; see
[CONTRACT-036](02-design/contracts/CONTRACT-036-orders-consumers.md).
Parquet schema ingestion exposes indexed core fields and qualified scalar families
with native annotations and repetition levels; see [CONTRACT-019](02-design/contracts/CONTRACT-019-parquet.md).
It also exposes embedded `ARROW:schema` separately, with native/browser evidence for
Arrow metadata recovery and detached schema edits. Large-list, duration and named-timezone
differences demonstrate why embedded and physical schemas must not be silently collapsed.
An explicit coordinated rename now updates structurally corresponding physical/embedded fields with
native schema/value and inverse-round-trip evidence. Uninterpreted metadata references
remain preserved and reported. Nested LIST/MAP traversal has native evidence; Map
role-label renames remain blocked after native normalization counterexamples.
The v3 SQL Server capture adds index/heap metadata with native filtered/disabled
uniqueness, ordered columnstore and partitioning evidence. It also reports per-index
loss in Avro projections. The package and capture queries are specified in
[CONTRACT-031](02-design/contracts/CONTRACT-031-sqlserver.md); broader catalog/DDL
coverage and cross-system transforms remain required.
An explicit-policy [catalog-to-DDL generator](02-design/contracts/CONTRACT-037-sqlserver-ddl.md)
now has native evidence for ten tables, with measured alias, persistence and physical
layout losses. It generates reviewable SQL; arbitrary T-SQL parsing and full database
reconstruction remain open.
Copied SQL Server metadata edits now also pass native generation, execution and
recapture checks for length, description, defaults, checks, index predicates and
nullability, with both UMF formats verified in Bun and Chromium.
SQL Server capture v2 adds copied key, foreign-key and check-constraint observations,
including ordering, actions, trust and disabled state; v1 availability remains explicit.
An initial [SQL Server→Avro schema projection](02-design/contracts/CONTRACT-032-sqlserver-avro.md)
now reports explicit losses and retains the source; it does not convert row values.
[TableSpec→Avro](02-design/contracts/CONTRACT-033-tablespec-avro.md) also supports
explicit field representations and contextual nullability, with native/browser evidence.
[Avro→TableSpec](02-design/contracts/CONTRACT-038-avro-tablespec.md) now supplies the
reverse schema projection, with named dependencies, explicit losses and independent
binary/value evidence for a basic carrier cycle. Complex and temporal row encoding
remains separate work.
[Composed projections](02-design/contracts/CONTRACT-039-tablespec-via-avro.md) now
carry PostgreSQL, SQL Server and Parquet through Avro into TableSpec while retaining
both stage results and every source-qualified loss. Native TableSpec models validate
four representative outputs; this is schema composition, not a row converter.
[PostgreSQL→Avro](02-design/contracts/CONTRACT-034-postgresql-avro.md) now covers
captured scalar columns with explicit decimal/temporal subsets and reported native
constraint losses. These projections do not implement source-row conversion.
[Parquet→Avro](02-design/contracts/CONTRACT-035-parquet-avro.md) handles nested
records, lists and explicit map-entry arrays, retaining native bytes and reporting
logical-type and range differences.

The HELIX flow is declared in [`.helix.yml`](../../.helix.yml). Its artifact
root is `docs/helix/`. Templates and the methodology graph resolve from the
installed HELIX plugin; this scaffold was created using release 0.13.1.

| Activity | Purpose |
| --- | --- |
| [Discover](00-discover/README.md) | Research the problem and establish the product vision. |
| [Frame](01-frame/README.md) | Define requirements, features, stories, and concerns. |
| [Design](02-design/README.md) | Record architecture, decisions, and designs. |
| [Test](03-test/README.md) | Define verification and acceptance evidence. |
| [Build](04-build/README.md) | Document implementation guidance. |
| [Deploy](05-deploy/README.md) | Document rollout and operations. |
| [Iterate](06-iterate/README.md) | Review outcomes and plan improvements. |

The [product vision](00-discover/product-vision.md) describes UMF as a universal
schema interchange fabric. [Discovery input](00-discover/vision-input.md)
retains the owner's detailed direction for subsequent framing.

The [PRD](01-frame/prd.md) preserves the original 33 functional requirements
and adds five requirements from the bootstrap brief plus browser, DDD, and
programmatic-consumer requirements (FR-39–FR-41). The separate
[Cross-Cutting Requirements](01-frame/cross-cutting-requirements.md) preserves
all 50 constraints. [Concerns](01-frame/concerns.md) routes those constraints
into downstream work.

The [architecture](02-design/architecture.md), [bootstrap ADR](02-design/adr/ADR-001-bootstrap-representation.md),
[first spike](02-design/spikes/SPIKE-001-jsonschema-protobuf.md), and
[test plan](03-test/test-plan.md) develop the JSON Schema + Protobuf direction.
[Source notes](00-discover/interoperability-sources.md) ground the native testing
and LinkML comparison. Core and the JSON Schema native adapter are implemented
with scoped round-trip and independent native expected-vector evidence.

Implementation direction: TypeScript compiled to JavaScript, targeting browser
execution. [ADR-002](02-design/adr/ADR-002-bun-development-runtime.md) selects Bun
for development and testing. WASM is an option for adapters; high performance is not a primary
driver. See the architecture and test plan for runtime boundaries and browser checks.

The [competitive analysis](00-discover/competitive-analysis.md) covers Foundry,
OntoBricks, Stardog and related alternatives. The
[implementation plan](04-build/implementation-plan.md) sequences core schemas,
extension round trips, early DDD, metadata consumers and evidence-based promotion.

[CONTRACT-001](02-design/contracts/CONTRACT-001-core-envelope.md) defines the
experimental core envelope and package schema. Bun tests and actual Chromium
checks cover preservation, validation and conservative edits; scoped results are
recorded in the implementation plan.

[CONTRACT-002](02-design/contracts/CONTRACT-002-json-schema.md) defines the JSON Schema
adapter; [US-002](01-frame/user-stories/US-002-json-schema-round-trip.md) and
[TD-002](02-design/technical-designs/TD-002-json-schema-native.md) trace its checks.

[CONTRACT-003](02-design/contracts/CONTRACT-003-protobuf.md) defines the implemented
Protobuf descriptor foundation, with independent compiler comparisons over 22
source files. Optional WASM source import and 42 native behavior checks now pass;
edited-source emission/reimport also passes. Edition 2024 source operations and
broader native conformance remain unsupported.

[CONTRACT-004](02-design/contracts/CONTRACT-004-json-schema-protobuf-projection.md)
defines the implemented directed projection, with explicit losses and separate
source/target recovery evidence. See [US-004](01-frame/user-stories/US-004-json-schema-protobuf-projection.md)
and [TD-004](02-design/technical-designs/TD-004-json-schema-protobuf-projection.md).

[CONTRACT-005](02-design/contracts/CONTRACT-005-ddd-profile.md) now defines the
implemented DDD semantic profile, with model consistency, preservation and browser
evidence. [US-005](01-frame/user-stories/US-005-ddd-profile.md) and
[TD-005](02-design/technical-designs/TD-005-ddd-profile.md) trace its scope.

[CONTRACT-006](02-design/contracts/CONTRACT-006-ddd-document-projection.md) defines
the implemented DDD-to-document binding with independent shape checks and explicit
domain-enforcement gaps.

[CONTRACT-007](02-design/contracts/CONTRACT-007-avro.md) defines the initial Avro
schema JSON adapter, with exact-token retention, browser edits and independent
Apache Avro/fastavro binary checks. The authored corpus is not full conformance.

Next: expand GraphQL corpus and projection coverage, then the remaining ecosystem/consumer work. Broader
Protobuf language conformance remains open. TableSpec and Axon access remains
unresolved for their specific compatibility claims.


[CONTRACT-008](02-design/contracts/CONTRACT-008-avro-document-projection.md) defines
Avro-to-document schema projection with explicit encodings, source retention and
native-vs-target discrepancy checks. Nineteen official standalone schemas project;
the unresolved dependency case remains blocked unless supplied as a bundle.


[CONTRACT-009](02-design/contracts/CONTRACT-009-graphql-sdl.md) defines the initial
GraphQL SDL adapter: a complete 38-definition AST schema, exact original-source
retention, atomic edits, runtime validation and scoped Chromium/GraphQL-core checks.
Custom scalar/directive execution remains external and explicitly incomplete.

GraphQL now includes a pinned upstream schema and grammar corpus. Explicit fragment
mode preserves SDL components while reporting their missing composition context;
full-schema mode retains semantic validation. Independent-runtime introspection and
parser profile differences are recorded in the fixture evidence.


[CONTRACT-010](02-design/contracts/CONTRACT-010-graphql-input-projection.md) defines
GraphQL input-to-JSON-Schema projection with explicit default/coercion gaps and
independent mapped-instance evidence. Output types and custom scalar contracts
remain separate work.


[CONTRACT-011](02-design/contracts/CONTRACT-011-openapi.md) defines the initial
OpenAPI JSON/YAML adapter, with exact native/source preservation and bounded 3.1/3.2
object validation. Shared exact-JSON representation now lives in core; API semantics
and embedded dialect interpretation remain extension-owned.

OpenAPI now includes pinned official 2.0/3.0 validation and all 46 Learn OpenAPI
example files. Thirty-eight full descriptions round-trip and pass native checks;
eight referenced fragments remain explicitly outside standalone import.
OpenAPI resource bundles now preserve the eight official referenced fragments with
explicit URI identity. Native/pointer/edit evidence remains distinct from general
schema scope and contextual reference validation.
Known OpenAPI embedded schema syntax now receives dialect-aware meta-validation,
with explicit unknown-dialect boundaries. This extends structural evidence without
claiming instance evaluation or general reference/scope resolution.


Typed OpenAPI Reference Object chains now resolve seven caller-declared roles across
explicitly supplied files, retaining target origin and effective annotations. Cycles,
missing resources and unsupported identity scope fail explicitly. Nested references,
Schema Object scope and runtime semantics remain open.


OpenAPI Schema Objects can now be extracted with exact native values, dialect
provenance, source location and the complete owning source/resource bundle. Extracted
text remains a contextual fragment; standalone validator generation is still pending.


Known-dialect OpenAPI schema scope now supports static reference lookup through nested
IDs, anchors, retrieval aliases and OpenAPI 3.2 document identity. Standalone schema
resources require explicit classification; unknown dialects and conflicting identities
fail explicitly. Dynamic-reference evaluation and validator projection remain pending.


[CONTRACT-012](02-design/contracts/CONTRACT-012-openapi-json-schema.md) defines the
OpenAPI static-schema projection to Draft 2020-12, with explicit identity/API/annotation
losses, copied source context and independently checked authored/upstream instances.
Dynamic scope, legacy schema conversion and HTTP-direction projections remain open.


Dynamic OpenAPI schema references can now select targets from an explicit evaluation
resource stack, with ordinary anchors and pointers retaining static behavior. The API
checks context boundaries but does not construct an instance evaluation path; dynamic
validator projection remains unfinished.


[CONTRACT-013](02-design/contracts/CONTRACT-013-typespec.md) adds the first TypeSpec 1.16.0 source-bundle package: exact multi-file
round trips, syntax navigation, candidate source edits and native compilation in Bun
and Chromium. Semantic type-graph representation, external libraries/configuration
and cross-system projections remain open.


TypeSpec now exposes selected compiled semantic graphs for metadata consumers, with
recursive references, inheritance, operations, tagged defaults and exact numeric text.
Snapshots retain source and explicit omissions; IDs are local to each snapshot and
full semantic-graph interchange remains unfinished.


TypeSpec evidence now includes the complete pinned upstream sample subtree: 51 source
files and 31 entrypoints. Two compile with the current standard library, 28 expose
missing-library/context errors, and one intentionally invalid editor sample is rejected.
All outcomes are recorded; broader library support remains required.


Explicit pinned HTTP/REST/OpenAPI/Streams selections raise TypeSpec corpus compilation
from 2 to 20 of 31 entrypoints. Library versions survive round trips and appear in
compiler reports; missing libraries, custom code, configuration and emitters remain
explicit follow-up work.


The expanded TypeSpec library set now compiles 29/31 pinned upstream entrypoints,
including GraphQL with its published library feature configuration. The remaining
cases are unregistered custom JavaScript and deliberately invalid syntax. Project
configuration, custom-module registration and emitter projections remain open.


TypeSpec now provides explicit native JSON Schema emission in Bun and Chromium, with
source retained and an explicit integer wire policy. The three-file official sample
matches native filesystem output; seven independent validator cases check target
behavior. This does not yet establish a loss-audited TypeSpec projection.

The pinned TypeSpec JSON Schema emitter has demonstrated numeric losses: unsafe
literal rounding and missing int64/uint64 constraints. Emission results disclose these
risks, retain exact source, and remain incomplete. Independent boundary regressions
record the mismatches; generated output is not a faithful source validator by default.

An explicit native-emission projection now materializes TypeSpec output as a UMF JSON
Schema document with its emitted reference resources. Strict mode blocks unreviewed
semantics; allow-reported-loss exposes a target with source and risk report retained.
The operation remains incomplete and makes no source-domain equivalence claim.

Smithy now has a native JSON AST extension with exact numeric tokens, candidate edits
and browser checks. All 63 pinned upstream JSON fixtures round-trip; the JVM agrees
on 64 original/re-exported model comparisons including an authored case. Two upstream
fixtures require missing context. IDL, full assembly and projections remain open.

Smithy dependency bundles now preserve each supplied model and support targeted
candidate edits. Single-file export blocks when it would omit dependencies. Two
upstream models assemble with explicitly authored context; native checks also reject
missing references and conflicting definitions. Browser-native assembly remains open.

Smithy now preserves exact supplied IDL/JSON source bundles and candidate edits. All
80 pinned IDL fixtures have matching JVM outcomes after round trip; browser checks
cover archival behavior only. Direct TeaVM compilation failed on Java runtime gaps
(SPIKE-002), so browser parsing/assembly remains required work.

The patched Smithy JavaScript runtime now builds experimentally with
`bun run build:smithy-experiment`. All 144 existing JVM corpus cases agree in Bun and
Chromium, including canonical model hashes. It is not yet integrated into the public
API; worker isolation and remaining reflection/custom-validator coverage stay open.

Smithy assembly is now available through `assembleSmithyDocument` with an explicitly
supplied pinned JavaScript backend. It retains source, exact assembled model JSON and
native diagnostics, including locations. The result remains qualified by port limits
and native mixin normalization; worker isolation and broader coverage remain open.

Smithy now also offers an explicit module-worker backend with per-call isolation,
cancellation and deadlines. Chromium verifies native assembly and responsive-page
termination. This completes the worker follow-up above; broader runtime coverage and
cross-system projections remain open.

Smithy negative coverage now includes every one of the 182 pinned upstream invalid-loader
model files. JVM and public JavaScript results agree after exact source round trip,
including one explicitly recorded native exception. Chromium runtime comparisons now
cover 326 cases. Custom-validator/reflection coverage and projections remain open.

Smithy now exposes native shape-set selector queries for metadata consumers, retaining
source and assembly reports. All 90 upstream selector vectors match JVM and Chromium;
complete schemas describe the public and bridge results. Query worker execution,
variable-environment output and cross-system projections remain open.

Smithy selector queries now support workers, cancellation and per-stage deadlines.
Cancelled/expired selection retains source and assembly evidence without a shape set.
Variable-environment results, custom starting contexts and projections remain open.

Smithy now has an explicit native JSON Schema emission projection. The 52-root comparison
matches JVM output/failures; ten unusable results remain blocked and retained as evidence.
Target-instance tests expose native representation differences. This is a named converter
profile with reported loss, not complete cross-system equivalence or finished Smithy support.

An explicit Smithy root-definition profile now resolves recursive-root output while
retaining the original native schema. Its expanded 55-root comparison yields 47 usable
targets and eight blocked native conversion failures. Naming/configuration/semantic
coverage and the remaining extension families are still unfinished.

Smithy projection now accepts an explicit service context, honoring declared renames and
rejecting roots outside that service. The 40-case JVM matrix and independent target
vectors preserve different same-named concepts across namespaces. This is native context
support, not a new core equivalence rule or complete automatic conflict resolution.

PostgreSQL has begun its extension cycle (US-015 / CONTRACT-015 / TD-015): original SQL,
editable native parse trees, guarded native regeneration and browser WASM execution.
Authored samples round-trip under a separate native parser. Engine versions are explicit;
the typed AST schema now covers the pinned descriptor, with codec field/wire checks.
Catalog execution, upstream SQL corpus coverage and projections remain unfinished.
The optional runtime bypasses the pinned wrapper’s Boolean conversion defect with typed
message construction. All 416 pinned upstream deparser cases have native and independent
wrapper round-trip evidence; this does not establish catalog or database execution.

The PostgreSQL cycle now also has live PostgreSQL 17.4 reconstruction evidence: authored
DDL, regenerated DDL and schema dumps passed through UMF produce matching bounded catalog
snapshots, with 24 behavior checks across three databases. The disposable Docker oracle
runs via `bun run test:postgresql-catalog`. General catalog interchange and projections
remain unfinished; the public adapter still reports incomplete server validation.

`umf.postgresql.catalog` now packages the observed catalog profile, its query provenance
and original reconstruction SQL with complete profile schemas. Browser APIs offer copied
metadata lookup and explicit edit-state tracking. Modified captures cannot return stale SQL
through the reconstruction accessor, including after native reimport. Full native catalog
coverage, synthesis and migration remain unfinished.

Catalog snapshot v2 now adds typed observations for user triggers, standalone composites,
ranges/multiranges and collations, with backward compatibility for v1 captures. Expanded
live reconstruction evidence includes sequences and materialized views: 24 DDL statements
and 36 behavior probes pass. Full catalog coverage and cross-system semantics remain open.

Catalog snapshot v3 adds native dependency observations and browser lookup by catalog,
object type and identity. All 105 fixture edges survive live reconstruction; 42 native
behavior probes pass. V1/v2 remain readable, with missing dependency coverage reported
explicitly. Complete lineage, migrations and cross-system projections remain open.

PostgreSQL now has an explicit-encoding read-row projection to JSON Schema and matching
SELECT generation. It retains the source and reports omitted/native semantics; strict
policy blocks output. Live row checks cover exact large-number text and bounded integers
across reconstructed databases. This does not provide INSERT validation or migration plans.

The PostgreSQL live row matrix now covers every implemented encoding, including boolean
and SQL/JSON null distinctions: 15 rows validate and 33 invalid variants reject across
three reconstructed databases. Broader native mappings and other extension families remain
part of the active implementation goal.

Arrow's implementation cycle has begun with [SPIKE-003](02-design/spikes/SPIKE-003-arrow-schema-fidelity.md).
The native Bun/browser/PyArrow probes identify metadata loss, unsupported decoder types
and dictionary-ID reassignment that the extension must handle explicitly. A public Arrow
adapter and complete extension schemas are still required.

Arrow now has a public integration-schema JSON adapter (US-016 / CONTRACT-016 / TD-016).
It retains exact tokens, ordered/duplicate metadata and unknown types, with typed grammar
and candidate edits. Native IPC conversion and full Arrow semantics remain unfinished;
the native feasibility probe remains separate from public schema preservation.

Arrow now exports a guarded schema-only IPC stream through an explicit optional backend.
Native decode/re-read comparisons permit only documented defaults and aliases; known
losses block output. Forty-eight authored schema cases and an edit have independent
PyArrow evidence. Arbitrary binary import and data/dictionary handling remain open.


Arrow IPC source capture now preserves bounded original bytes independently of native
decoder support. The separate umf.arrow.ipc package and optional schema observations
are described in CONTRACT-016; all 18 authored file/stream fixtures round-trip through
public JSON/YAML APIs in Bun and Chromium. Full semantic IPC import remains open.


Arrow evidence now includes the complete pinned upstream IPC integration subtree: 182
binary captures and 91 schema examples round-trip in Bun and Chromium; 179 dataset
renames pass independent PyArrow comparison. Three historical footer-version differences
remain explicit transform blockers. CONTRACT-016 and the corpus reports qualify scope.


[SPIKE-004](02-design/spikes/SPIKE-004-spark-schema-fidelity.md) starts Spark schema
interchange research. Native Python/JVM probes expose property loss, configuration
differences and mutable collation inputs. The Spark extension package and browser APIs
remain the next implementation work; the spike alone is not a support claim.


[CONTRACT-017](02-design/contracts/CONTRACT-017-spark.md) now defines the implemented
Spark schema JSON foundation. Forty-seven authored sources round-trip, two malformed
known shapes reject, and native Python/JVM plus Chromium checks preserve their scoped
outcomes. Unknown properties, exact numbers and UDT declarations remain source data;
full Spark semantic, upstream and projection work remains open.

[SPIKE-005](02-design/spikes/SPIKE-005-delta-schema-protocol.md) grounds the next Delta
extension in pinned schema/parser and native table-log evidence. It identifies source
normalization and protocol-context requirements; implementation remains pending.

[CONTRACT-018](02-design/contracts/CONTRACT-018-delta.md) and
[US-018](01-frame/user-stories/US-018-delta-schema.md) now define the implemented Delta
schema preservation profile. Native and browser evidence is scoped to schema JSON;
table metadata/protocol support and dependent transforms remain unfinished.

[Parquet source preservation](02-design/contracts/CONTRACT-019-parquet.md) now provides a
bounded exact binary capture package and qualified footer-region inspection. Complete
metadata/type schemas, decoding and transforms remain in US-019; decoder experiments
and Delta checkpoint support do not yet establish general Parquet interoperability.

[CONTRACT-020](02-design/contracts/CONTRACT-020-iceberg.md) begins the Iceberg extension:
standalone schema JSON, field/component identity, identifier checks and copied candidate edits.
PyIceberg/browser evidence covers authored round trips and a nested rename; table metadata,
partition/sort specs, upstream corpora and physical evolution remain unfinished.

[CONTRACT-021](02-design/contracts/CONTRACT-021-iceberg-table.md) adds Iceberg table metadata
preservation and known v1–v3 shapes. Native/parser-export differences are recorded separately;
reference consistency, dependent evolution and physical table access remain incomplete.


[CONTRACT-022](02-design/contracts/CONTRACT-022-dbt-manifest.md) adds dbt manifest v12
preservation with a pinned authoritative schema, native-generated fixture, description edits
and independent parser/browser evidence. Other dbt artifacts, resource coverage and graph-aware
transforms remain unfinished. Earlier Iceberg and ecosystem gaps remain in the active plan.


The dbt semantic manifest now has a separate umf.dbt.semantic package, scoped to DSI 0.8.5.
Its derived serialized schema records a native Pydantic nullability discrepancy; native and
browser evidence covers exact preservation and three description edits. Additional metric types,
semantic transforms and successor MetricFlow interfaces remain open (CONTRACT-022 AC10).


[CONTRACT-023](02-design/contracts/CONTRACT-023-odcs.md) introduces ODCS JSON/YAML interchange
with pinned native schemas and all 42 release examples. Three native-schema disagreements are
preserved explicitly; reference interpretation, quality/SLA enforcement and projections remain open.


[CONTRACT-024](02-design/contracts/CONTRACT-024-linkml.md) adds LinkML source preservation with
the pinned complete metamodel JSON Schema. Native annotation rejection and normalization/schema
disagreement remain explicit; imports, induced models, instance validation and generators are open.

[CONTRACT-025](02-design/contracts/CONTRACT-025-rdf.md) begins RDF interchange with a complete
RDF 1.1 N-Quads/Turtle term model, full official corpora, independent dataset/edit comparisons and
browser evidence. Other syntaxes, OWL/SHACL execution and semantic projections remain unfinished.


US-025-AC6 adds RDF 1.1 TriG with explicit empty named-graph inventory. The complete pinned W3C
corpus has 357 cases (242 positive/115 negative), plus one authored shared-blank empty-graph case.
Bun/native/browser checks cover 486 source recoveries, 216 literal edits, two empty-IRI renames
and four blocked N-Quads projections. RDFLib verifies all graph inventories and 143 official
quad sets; eleven original-source differences and 48 accepted negatives remain explicit.
See CONTRACT-025, tests/rdf/trig.test.ts and fixtures/rdf/trig/ for scoped evidence. Remaining
RDF syntaxes, ontology/shape execution, canonicalization and cross-system projections stay open.


US-025-AC7 adds explicit RDF dataset composition with graph union by name and disjoint blanks
per input occurrence. The report retains complete sources, blank-node maps and quad provenance;
unknown RDF encodings block atomically. All 516 positive baseline datasets merge with an authored
empty/shared-blank dataset, yielding 1,032 native and Chromium comparisons across both UMF formats.
Bun additionally checks identical source ids/scopes, duplicate occurrences, source metadata and
blocked report shape. See CONTRACT-025, tests/rdf/merge.test.ts and fixtures/rdf/merge/. Shared-blank
composition, canonicalization, OWL/SHACL execution and broader platform projections remain open.


US-026 / CONTRACT-026 / TD-026 add umf.jsonld source/context preservation and explicit expansion
proposals. The pinned 385-case official expansion manifest yields 276 matching candidates and 109
negative rejections. Every source survives both UMF
formats. PyLD 2.0.4 agrees with 270 candidate outputs using the integer/Decimal loader; all six native disagreements are recorded against official expected output, which UMF matches. Tests also cover exact numbers, unknown representation,
loss policy, copied edits and per-operation @import context isolation. Native/browser evidence lives
in fixtures/jsonld/expansion; reproduction is in native/jsonld/README.md. Processor gaps, standalone compaction,
framing, HTTP/HTML behavior and RDF conversion remain required work.


US-026-AC5 fixes scoped @nest expansion with a pinned, reproducible jsonld.js dependency patch.
Official tc037/tc038 now pass; seven authored cases verify recursive/remote contexts, sibling
isolation, protected overrides, invalid nested values, opaque JSON and an edited nested value.
The 385-case official corpus and Chromium checks remain gates. Patch provenance is recorded in
fixtures/jsonld/patch-results.json. AC6 closes the legacy gaps; AC7 adds exact numeric expansion.


US-026-AC6 restores version-specific JSON-LD 1.0 term and prefix behavior with a pinned context
processor patch. Official t0026/t0038/t0071 now pass. Eight authored inputs exercise 15 paired-mode
outcomes, including 1.1 rejections, opaque JSON, null prefixes and copied edits. The full 385-case
corpus produces 276 correct candidates and 109 negative blocks. Fresh isolated
installation verifies all three patched source files. The complete browser matrix remains a gate.


US-026-AC7 carries exact numeric tokens through JSON-LD expansion using immutable internal boxed
numbers and a pinned clone/scalar patch. All 276 official positives now match exact expected
values; all 109 negatives are blocked. Nine authored cases cover large integers, precise decimals,
negative zero, overflow/underflow exponents, language/type coercion, invalid numeric positions and
an exact edit. PyLD with an integer/Decimal loader and Chromium verify the results. The comparator
now rejects rounded values and preserves language-looking strings inside opaque JSON literals.
Other JSON-LD algorithms and general semantic/physical projections remain required work.


US-026-AC8 adds flattening with optional target-context compaction. All 58 official cases have
expected outcomes (57 candidates/one block), with discrepancies against PyLD recorded. Fourteen
authored cases cover precision, duplicate values, graph structure, contexts, losses and edits.
Bun and Chromium pass, including 144 source recoveries and 138 candidate/edit exports; the complete
385-case expansion regression also passes. See native/jsonld/README.md and fixtures/jsonld/flatten/.
Standalone compaction, framing, retrieval, RDF projection and the wider UMF goal remain unfinished.


US-026-AC9 implements standalone JSON-LD compaction with required target context and explicit
compactArrays/compactToRelative options, plus a complete report schema. All 246 pinned cases run:
229 candidates and 17 expected negative blocks. Strict exact-value/order comparisons match 228
positive outputs; tp001 remains an explicit legacy-prefix discrepancy. Its 1.0 processing mode
expects expanded term definitions not to form prefixes, while t0038 expects such prefixes. UMF
retains the earlier 1.0 prefix interpretation, without claiming full compaction conformance.
PyLD rejects t0112/tm023 and differs on t0038/t0111/t0113/tc028/tp001. All differences are recorded.

Twelve authored cases add nine candidates and three blocks, exact language-neutral numbers,
aliased ordered lists, opaque JSON, array and relative-IRI options, explicit remote contexts,
source expandContext applied once, empty custom indexes and copied edits. PyLD differs on the
absolute-IRI option and empty custom index, and accepts the loss case UMF explicitly rejects.
Chromium repeats 258 cases: 238 candidates, 20 blocks, 516 source recoveries, 476 candidate exports
and two edited exports, with no external requests and Node globals absent. Evidence lives under
fixtures/jsonld/compaction; native/jsonld/README.md records reproduction. The compact.js patch
expands custom index IRIs, selects the actual compacted property using its value, retains empty
index keys and honors compactArrays for remaining index values and map entries. Fresh installation
now checks four patched files. Framing, HTTP/HTML loading, RDF projection, the legacy discrepancy
and the wider extension/consumer goal remain unfinished.


US-026-AC10 adds framing proposals, full report schema and a separately pinned official framing
corpus (w3c/json-ld-framing commit 3bf782ba9a40dd1b143435abe386d38df64f2b47, 271 resources/92 cases).
Eighty-eight candidates match strict expected JSON, all three negatives block, and positive t0010
also blocks because the source uses literal dcterms:creator without defining that prefix while
its frame assigns the prefix a different IRI meaning. The retained source is authoritative; this
legacy corpus disagreement remains explicit. PyLD accepts 87 official sources and rejects five,
including t0010 and positive t0069; every comparable candidate agrees with its output.

Twelve authored cases yield ten candidates/two blocks, 20 exports and two edited exports. They
exercise exact numeric frame matching/defaults, source precision, explicit selection, default versus
merged graphs, cycles as references, requireAll, explicit remote contexts, missing resources,
loss rejection, ordered lists and opaque JSON. PyLD matches nine authored candidates and the edit;
it ignores frameDefault in the authored graph case and accepts the source warning UMF rejects.
Chromium repeats 104 cases: 98 candidates/six blocks, 208 unchanged source recoveries, 196 candidate
exports and two edits, no external requests and Node globals absent. Evidence is under
fixtures/jsonld/framing; native/jsonld/README.md records reproduction.

The pinned jsonld.js patch honors frameDefault; frame.js uses exact value equality for numeric
pattern matching. Fresh installation covers six patched files. Framing is a selected view, not an
assertion of lossless semantic round trip: sources, frame and resource bundles remain archived and
reports disclose selection, defaults, embedding and graph merging. HTTP/HTML retrieval, RDF
projection, the documented legacy disagreements and the wider extension/consumer goal remain open.


US-026-AC11 supersedes the framing counts above. Framing now validates flags and identifier/type
patterns before subject matching, including nested and aliased frames on empty input. Expansion
checks raw flag types before nulls can disappear; preflight checks expanded cardinality and mode
rules before building the node map. Nonstandard @link and 1.1 @first/@last are rejected. Data inside
@default and @value is not interpreted as framing instructions.

The official corpus now yields 86 exact expected candidates and six blocks. In addition to the
three negative cases and the known t0010 collision, positive tg005/tg008 contain @omitDefault:
"true" strings where the syntax requires booleans. These are explicit compatibility discrepancies;
UMF does not silently coerce them. PyLD accepts those two cases, rejects t0069 and otherwise agrees
with comparable candidate outputs. The authored set grows to 26 cases: 13 candidates/13 blocks,
26 exports plus two edited exports. Eleven new invalid frames are accepted by PyLD but rejected
by UMF. Controls retain legacy 1.0 behavior and keyword-looking JSON literal/default data. PyLD
rejects the @json value-pattern control and still ignores frameDefault; these disagreements remain
recorded. Blocked reports retain exact source and NativeJson frame and expose no partial candidate.
Current Chromium baseline: 118 cases, 99 candidates/19 blocks, 236 source recoveries, 198 candidate
exports and two edits; no external requests, Node globals absent. See fixtures/jsonld/framing.


US-026-AC12 connects RDF datasets to JSON-LD through a complete projection report schema. It
preserves source archives, unknown-encoding blocks, empty graphs, exact JSON/numeric values and
selected native-type loss policies. The full pinned fromRDF corpus passes: 52 expected candidates
and two negative blocks, 108 exact source recoveries and 104 candidate exports. PyLD rejects
t0027/t0028 and differs on t0008/tdi11/tdi12; no discrepancy is counted as native agreement.

Eighteen authored cases cover exact native numbers, lexical preservation, non-finite typed values,
RDF JSON in 1.0/1.1, empty graph inventory, direction with native types, malformed JSON, comments,
compound lists/shared nodes/invalid direction/extra-property loss, malformed direction datatypes and a copied edit. Twelve
candidates/six blocks produce 24 exports and two edited exports. Unmodified PyLD agrees on typed
lexical values, opaque datatypes and shared compound nodes; precision, direction, mode and empty-inventory differences
are retained in fixtures/jsonld/from-rdf/authored/oracle-results.json. N-Quads cannot transmit empty
graph inventory, so that oracle case explicitly compares the nonempty subset only.

The collector now retains 2,545 JSON-LD API JSON-LD/N-Quads resources (same source pin). Fresh
installation checks seven patched processor files. The browser matrix covers all 72 official and
authored cases: 64 candidates/eight blocks, 144 source recoveries and 130 candidate/edit exports, no
external requests or Node globals. Reproduction is in native/jsonld/README.md. JSON-LD-to-RDF,
HTTP/HTML retrieval, ontology/platform semantics and the wider extension/consumer goal remain open.


US-026-AC13 adds a JSON-LD-to-RDF proposal/report schema and standard RDF dataset candidate.
Full source/context archives remain in the report; JSON/YAML candidate recovery and copied edits
are verified. Explicit losses cover index annotations, empty graph inventory, omitted direction
and blank predicates. Unsafe exact-number conversion, double rounding/overflow, missing resources
and unknown encoding fields block atomically. Compound direction remains a required implementation gap.

The complete pinned toRDF manifest has 467 cases: 361 positives (including 16 syntax-only cases)
and 106 negatives. UMF emits 354 candidates and blocks 113; all negative cases block. Seven
positives remain blocked: tdi11/tdi12 (compound direction), tjs12/trt01 (exact numeric conversion),
tli12/tli14 (invalid RDF terms/list handling), twf05 (language validation). RDFLib 7.6.0 with literal
normalization disabled verifies 334 expected datasets by quad-role graph isomorphism. te111/te112
emit an extra triple whose property IRI contains multiple fragment separators; this is a known
conformance gap. t0118/te075 require generalized RDF with blank predicates, outside the current
RDF representation; their standard-RDF candidates disclose omitted predicates and are not counted
as equivalent. Syntax-only tests have no expected dataset and are counted separately.

Unmodified PyLD 2.0.4 accepts 360 cases. Twelve acceptance differences and five RDFLib-confirmed
output differences remain explicit in fixtures/jsonld/to-rdf. PyLD normalization additionally
miscompares several escaped literals; RDFLib comparisons distinguish those parser differences
from dataset changes. Neither oracle is treated as universal authority.

Sixteen authored cases verify literals, ordered lists, opaque JSON, native source recovery,
report/reject policies, direction, numeric guards and copied edits: seven candidates/nine blocks.
Chromium 148 matches all 483 official/authored outcomes, 966 source recoveries, 722 candidate
exports and two edits, without external requests or Node globals. tli14 has different TypeError
wording between engines; the same blocked status and diagnostic codes are required and both
messages are archived. Bun's two conversion tests pass with 4,112 assertions; type checking and
the browser ESM/declaration build pass. Full JSON-LD conformance, remaining extensions and the
seven metadata consumers remain open. No concepts were promoted to core in this increment.


US-026-AC14 implements compound-literal direction emission. The processor reuses its blank-node
issuer and places rdf:value, rdf:direction and optional lowercase rdf:language in the reference's
graph. Both official direction cases now match their expected RDF datasets under RDFLib graph
isomorphism. PyLD 2.0.4 emits a plain literal instead, dropping direction; these two output
comparisons are explicit native discrepancies, not native agreement.

The full 467-case toRDF baseline now has 356 candidates/111 blocks, including all 106 expected
negative blocks. Five positive blocks remain (tjs12, tli12, tli14, trt01, twf05). There are 336
verified official dataset matches, 16 accepted syntax-only cases, two differing datasets and two
generalized-RDF comparisons outside the current representation. No remaining gap was reclassified
as supported. Twenty authored cases include twelve candidates/eight blocks; five compound cases
exercise plain/language values, lists, named graphs and distinct directions. Reverse conversion
through both UMF formats must reproduce their expected JSON-LD values.


AC14 verification passed: eight scoped tests, 5,014 assertions, eight-file fresh patch installation,
type checking and the browser ESM/declaration build. Chromium ran all 487 official/authored cases:
368 candidates/119 blocks, 974 exact source recoveries, 736 candidate exports, two copied edits
and ten reverse conversions through JSON/YAML. External requests were zero and Node globals
absent. The existing tli14 engine-specific exception wording remains recorded with matching
status and diagnostic codes. The next JSON-LD conversion gaps are exact-number/JCS policy,
invalid-term handling and generalized RDF; wider extension and metadata-consumer work remains open.


US-026-AC15 closes the observed invalid-term conversion gaps. Generic IRI and BCP47 syntax
validation emits explicit loss events; reject policy blocks omissions. Graph/subject/property
checks precede auxiliary triple generation, and null list-first objects are omitted without
removing list-rest structure. Dedicated boundary tests cover Unicode/private-use placement,
percent escapes, authorities, IPv6/IPvFuture, grandfathered tags and duplicate language subtags.

The full toRDF corpus now has 359 candidates/108 blocks: all 106 negatives block and only tjs12
and trt01 remain positive blocks (numeric conversion). RDFLib verifies 341 official expected
datasets, with zero differing comparable outputs; 16 accepted syntax tests have no expected
output, and t0118/te075 still require generalized RDF outside the representation. Nine native
output differences remain, while PyLD emits non-parseable RDF for tli12/twf05 and rejects tli14.
These outcomes are recorded without treating oracle behavior as conformance authority.

The authored set now has 28 cases, 19 candidates/nine blocks. New controls cover malformed
subjects/graphs with lists (no orphan triples), invalid list values, datatype IRIs, duplicate
language extensions, paired omission/rejection and valid IPv6/Unicode/private language forms.


AC15 verification passed: ten scoped tests with 5,154 assertions, fresh eight-file processor patch
installation, type checking and browser ESM/declaration build. Chromium matches all 495 official
and authored cases: 378 candidates/117 blocks, 990 source recoveries, 756 candidate exports, two
copied edits and ten reverse conversions. Diagnostic messages now agree across engines, including
the repaired tli14 case. External requests are zero and Node globals absent. Numeric/JCS policy,
generalized RDF, the recorded Unicode-IRI compatibility gap and the wider UMF goal remain open.


US-026-AC16 resolves the Unicode-IRI omission recorded after AC15. Four authored Unicode cases
cover U+00A0/U+2003/U+2028/U+3000 across contexts, graph names, subjects, predicates, objects and
datatypes; an ASCII-space control still rejects. Expansion, flattening and compaction retain the
same datasets. Framing retains the selected terms while intentionally projecting into its merged
default-graph view. Both UMF formats recover sources and RDF candidates and reverse to the expected
JSON-LD values. The original probe remains historical evidence; current resolution is recorded in
fixtures/jsonld/to-rdf/unicode-iri-resolution.json and regenerated by the authored-case script.

PyLD 2.0.4 rejects all four Unicode context mappings. RDFLib 7.6.0's raw N-Quads parser also rejects
the Unicode spaces because of its whitespace predicate. After equivalent Unicode escaping of the
four characters in N-Quads syntax, RDFLib confirms all eight expected dataset comparisons without
literal normalization. Raw rejections and escaped comparisons are recorded separately in
fixtures/jsonld/to-rdf/unicode-iri-oracle-results.json; no raw-native agreement is claimed.

The browser matrix passes all 500 official/authored cases: 382 candidates/118 blocks, 1,000 exact
source recoveries, 764 candidate exports, two edits, 18 reverse conversions and 16 additional
Unicode processing/projection checks. Diagnostic messages agree with Bun; external requests are
zero and Node globals absent. The shared JSON-LD suite's conversion, expansion, flattening,
compaction, framing and numeric regressions pass. A legacy sample-count assertion accidentally
changed with the patch-file count was corrected and rerun; the larger authored matrix now uses
an explicit 30-second timeout and passes its rerun. Type checking and the browser ESM/declaration
build pass. Fresh installation reproduces nine patched files. Numeric/JCS conversion, generalized
RDF and the wider extension/metadata-consumer goal remain open; no core promotion occurred.


US-026-AC17 adds explicit strict/binary64 numeric policy to RDF proposals and report schemas.
Strict is the default. Binary64 mode reports changed numeric values, signed-zero removal,
underflow and RDF integer/double formatting losses at expanded-value pointers. Reject policy
blocks these losses; non-finite JSON overflow blocks under either numeric policy. Exact source
and context values remain in the report. Typed strings, including xsd:double strings, retain their
lexical values. Small exponent-form JSON numbers correctly select RDF double representation.

The official toRDF matrix now selects binary64/report explicitly: 361 candidates and 106 expected
negative blocks. All 343 comparable expected datasets match RDFLib's term-isomorphism check;
16 syntax-only positives have no expected output. The two generalized-RDF expectations remain
outside the current representation and are not counted as equivalent. The numeric policy change
does not establish full JSON-LD conformance or close the remaining extension scope.

Forty-eight authored cases yield 34 candidates/14 blocks. Numeric controls cover paired policy
rejection, copied exact-token edits, underflow, overflow, negative zero, small doubles, typed
strings, large integer formatting and opaque JSON canonicalization. PyLD 2.0.4 rejects three
typed-string controls and differs on four expected numeric lexical results, reflecting its Python
integer/float behavior. These outcomes are recorded in fixtures/jsonld/to-rdf/numeric-oracle-results.json;
no mismatch is counted as agreement. The official native comparison also retains trt01's datatype
difference in addition to the previously documented discrepancies.


AC17 verification passed: twelve scoped regression tests (5,523 assertions) and three focused
numeric tests (49 assertions), type checking, browser ESM/declaration build and nine-file fresh
patch reproduction. Chromium ran all 515 official/authored cases: 395 candidates/120 blocks,
1,030 exact source recoveries, 790 candidate exports, four copied edits (including rounded numeric
edits), 18 reverse conversions and 16 Unicode processing checks. Diagnostics agree with Bun,
external requests are zero and Node globals absent. Generalized RDF, other JSON-LD compatibility
work and the wider extension/metadata-consumer goal remain open. No concepts were promoted to core.


US-027 adds umf.generalized-rdf with complete wrapper and native quad-array schemas, exact
NativeJson source, local blank scope, copied quad access and atomic edits. Unknown native shapes
remain recoverable but block interpretation; unknown encoding fields block native export without
preventing core JSON/YAML recovery. The RDF 1.1 package remains strict. JSON-LD projection now
records produceGeneralizedRdf and selects this package when true; the reverse proposal retains
full source and exact RDF JSON values under explicit processing mode.

Both pinned generalized cases match their expected datasets, including shared blank identities
across predicate and subject roles. Reverse/reprojection equivalence also passes after fixing the
processor's dropped blank-predicate marker. PyLD agrees for te075 but emits ten quads for t0118's
nine-quad expectation; native/expected outputs and the discrepancy are archived. The standard-RDF
matrix still reports its intentional omissions for these inputs; the generalized branch has its
own positive evidence and must not be confused with standard N-Quads equivalence.

CONTRACT-027, TD-027 and US-027 govern the new package. Reproduction and parser qualifications are
in native/generalized-rdf/README.md. This implements the JSON-LD generalized subset, not every
possible generalized RDF term position, empty graph inventory or entailment. No independent domain
semantic equivalence has been established for a new promotion into core.


US-027 verification: the scoped regression run passed ten tests with 5,412 assertions. The expanded
package run passed three tests with 81 assertions, including exact RDF JSON in both processing
modes and unknown-source blocking. Chromium passed both official generalized cases with four
source recoveries, four candidate exports, four reverse projections, four reprojections, four
copied edits, two exact JSON-literal checks and unknown-data/encoding guards. External requests
were zero and Node globals absent. Type checking, browser ESM/declaration build and fresh
nine-file processor patch reproduction passed. Wider JSON-LD compatibility, ontology/platform
extensions and metadata-consumer deliverables remain open; the overall goal is not complete.


[US-028](01-frame/user-stories/US-028-shacl.md),
[CONTRACT-028](02-design/contracts/CONTRACT-028-shacl.md), and
[TD-028](02-design/technical-designs/TD-028-shacl.md) introduce SHACL 1.0 graph interchange
and all seven property-path operators. Evidence covers 52 independent authored path
comparisons, 104 browser evaluations, and 300 native graph comparisons over 150 official
Turtle test resources. Constraint execution and official validation-report comparisons
remain required work; graph recovery does not establish SHACL conformance.


SHACL Core target selection is now implemented: 60 independent native comparisons and
120 Chromium selections pass across the seven official target files and an authored
scope/hierarchy matrix. Constraint execution and validation-report comparison remain open.


SHACL's experimental constraint engine executes all 98 official Core cases and matches
all expected conformance booleans. Qualified report comparisons and PySHACL differences
are recorded; 196 browser evaluations pass. The API always reports `complete: false`:
source-anchored report identity, messages/details, malformed shapes and broader datatype
semantics remain required. The unsafe integer comparison found outside the official corpus is now corrected by
UMF exact integer/decimal validators; mixed float/double promotion remains blocked.


The SHACL `umf-exact-decimal-1` profile covers six ordering constraints and integer/decimal
datatype checks. Seventy-five authored cases pass; 150 browser evaluations preserve sources
and reports through JSON/YAML. Four independent PySHACL datatype discrepancies remain
explicit. Full SHACL report fidelity and the broader extension/consumer goal remain open.


SHACL numeric profile 2 now supports mixed float/double promotion, direct binary32
rounding, NaN/infinity ordering and binary datatype lexical checks. The new 160-case
matrix passes, with independent C conversion evidence and 320 browser evaluations.
The older mixed-promotion limitation is resolved; full report fidelity and other
remaining semantic/extension work keep the overall goal active.


SHACL experimental validation now records `umf-string-1`: 106 authored Unicode,
lexical-length and language-range cases, with six explicit PySHACL disagreements.
Chromium passed both recovery formats for this corpus and the 98 official Core
cases. See [the SHACL contract](02-design/contracts/CONTRACT-028-shacl.md) for scope
and remaining gaps; this does not establish complete SHACL support.

OWL interchange has begun under [US-029](01-frame/user-stories/US-029-owl.md) and
[CONTRACT-029](02-design/contracts/CONTRACT-029-owl.md): Turtle graph preservation,
ontology headers and copied edits have native RDFLib and Chromium evidence. This
is not complete OWL support; structural axioms, other syntaxes, profiles, reasoning
and projections remain in scope.

[SPIKE-006](02-design/spikes/SPIKE-006-rdfxml-browser-fidelity.md) evaluates RDF/XML
parsing against 166 pinned W3C cases plus authored boundaries. Chromium parity is
established, but document-finalization and XML-literal fidelity defects prevent
claiming a public RDF/XML adapter. The spike records the experimental correction,
remaining discrepancies and required integration work.
