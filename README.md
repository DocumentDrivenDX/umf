# UMF

UMF is a machine-readable metamodel and schema interchange fabric for complex
systems built over evolving, partly understood data shapes. Reuse metadata for
transforms, visualization, generators, forms, AI context, and human documentation
while preserving native meaning and making translation limits explicit.

The experimental TypeScript core provides a versioned document envelope,
extension registration, JSON/YAML preservation, validation and conservative edits.
The JSON Schema Draft 2020-12 extension adds native round trips, exact numeric
preservation, explicit resources and typed edits. Bun, independent native oracles
and actual Chromium checks provide scoped evidence. Broader extensions and
consumer generators remain to implement. The Protobuf extension preserves native
descriptor fields and unknown options; an optional WASM worker imports source
bundles and emits edited source with a recompilation check.
Edition 2024 source operations and broader conformance remain unsupported.

Development: `bun install --frozen-lockfile`, `bun run typecheck`, `bun test`,
and `bun run build`. Run browser checks with `bun run test:browser` after installing
Playwright Chromium, or set `UMF_CHROMIUM_PATH` to an installed Chromium executable.

See [project documentation](docs/helix/README.md) for the activity structure
and the next step.

For native conformance, create a Python environment with `uv venv .venv`, then
`uv pip install --python .venv/bin/python -r scripts/oracle-requirements.txt`.
Run `bun run test:conformance`; `UMF_PYTHON_PATH` can select another prepared Python.
Bun remains the development runtime; Python is an independent native test oracle.
Spark hashing probes additionally require `JAVA_HOME` pointing to a compatible JDK
(verified with OpenJDK 21.0.2); the installed Java 27 cannot initialize Spark 4.0.1
UTF8String. This is a development-only oracle dependency.
See [fixture evidence](fixtures/json-schema/README.md) for exact coverage and limits.

Protobuf tests require `protoc` 36.2 on PATH. See [descriptor evidence](fixtures/protobuf/README.md).

Build the optional Protobuf WASM compiler with `bun run build:protobuf` (Go 1.27.1).
Browser checks also build and exercise this worker. The main ESM library remains
TypeScript; see [ADR-003](docs/helix/02-design/adr/ADR-003-protobuf-wasm-compiler.md).
Python native behavior tests require the pinned protobuf package in the oracle
requirements file. Original source archives are distinct from edited descriptors.

The first directed JSON Schema-to-Protobuf projection requires explicit field tags
and an integer domain, compiles its target and reports unenforced source meaning.
It retains the original UMF separately; it does not convert arbitrary instance data.
See [projection evidence](fixtures/projections/README.md).

The DDD extension adds context-qualified identities, aggregates, value equality,
events, services, repositories, terminology and partial context mappings. Opaque
invariants remain preserved and explicitly unenforced. See [DDD profile evidence](fixtures/ddd/README.md).

DDD-to-document projection now requires explicit embedding/identity and value-encoding
bindings. Generated JSON Schema validates shape while reporting unexpressed domain
rules; retained source remains separate from target-only recovery.

The initial Avro schema JSON adapter preserves exact native tokens, recursive types,
defaults, aliases and custom metadata. Browser interpretation uses avsc 5.7.9;
logical types and unsupported precision remain explicit limitations. Independent
Apache Avro/fastavro checks cover the authored corpus. See
[Avro evidence](fixtures/avro/README.md); broader Avro coverage remains open.

Avro named-schema dependencies can be supplied explicitly in declaration order.
Bundle export preserves each artifact, and dependency edits revalidate the complete
name environment. Root-only export refuses to discard dependencies.

Avro-to-JSON-Schema projection requires explicit long, byte and union encodings.
It reports branch identity, native resolution, logical-type and numeric gaps while
retaining the source separately. This is schema projection, not an arbitrary Avro
instance converter; see [the projection contract](docs/helix/02-design/contracts/CONTRACT-008-avro-document-projection.md).

The GraphQL SDL extension preserves native AST declarations and original source,
including comments, directives, defaults and extensions. Atomic edits emit current
SDL with explicit layout reporting. Custom scalar/directive execution remains
external. See [GraphQL evidence](fixtures/graphql/README.md).

GraphQL also supports explicit syntax-only SDL fragments, marked incomplete until
composed with a schema context. Upstream coverage includes the GitHub benchmark
schema and 48 pinned parser cases, with profile differences recorded.

GraphQL input-to-JSON-Schema projection preserves input shape and reports differences
in defaults, list coercion and ID normalization. It requires an explicit input type
and binding policy; output types and unknown custom scalar contracts block.

OpenAPI JSON/YAML preservation now retains operations, schemas, extensions and exact
numeric tokens with original source. Pinned 2.0/3.0/3.1/3.2 schema checks are explicitly
incomplete for embedded dialects, references and runtime semantics. Candidate edits
return their validation limits. See [OpenAPI evidence](fixtures/openapi/README.md).

OpenAPI coverage now includes all 46 pinned official example files: 38 complete
descriptions round-trip and validate, while eight referenced fragments remain
separate. Legacy 2.0/3.0 validation also runs in the browser; reference composition
and runtime semantics remain unfinished.

OpenAPI resource bundles now retain explicitly supplied fragments by document URI.
Copied pointer lookup and candidate edits operate without file/network discovery;
root-only export refuses to drop resources. General schema scope and reference
validation remain separate from this literal document-pointer lookup.

Known OpenAPI 3.1/3.2 embedded schema keyword syntax is now checked with dialect-aware
boundaries. Unknown dialects remain preserved with warnings; examples and defaults
are not mistaken for schemas. Instance and contextual reference validation remain open.


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


OpenAPI schema-only projection now produces standalone Draft 2020-12 constraints
from indexed static schemas, including recursive and external references. Fidelity
reports retain API/annotation/identity gaps; strict policy, dynamic scope, unknown
assertions and unavailable target compilation block projection.


Dynamic OpenAPI schema references can now select targets from an explicit evaluation
resource stack, with ordinary anchors and pointers retaining static behavior. The API
checks context boundaries but does not construct an instance evaluation path; dynamic
validator projection remains unfinished.


CONTRACT-013 adds the first TypeSpec 1.16.0 source-bundle package: exact multi-file
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

The experimental Iceberg schema adapter (`umf.iceberg`) preserves exact schema JSON and
unknown native content, checks known identity constraints, and supports copied pointer edits.
Its PyIceberg 0.11.0/browser evidence is scoped to authored standalone schemas. Table metadata,
partition/sort specs, format-version/default semantics and physical evolution remain pending;
see CONTRACT-020 in docs/helix/02-design/contracts/.

Iceberg's upstream schema oracle additionally uses Maven and Apache Iceberg Java 1.11.0;
`bun scripts/iceberg-java-oracle.ts` builds development artifacts under `.cache/iceberg-java`.
`JAVA_HOME` selects its runtime (verified with Java 21.0.2). No JVM dependency is included in
UMF's browser output. Upstream table/view resources currently provide schema-fragment evidence.


The experimental RDF package now covers RDF 1.1 N-Quads, Turtle and TriG with pinned official
corpora and browser/native evidence. TriG retains empty named graphs and blocks lossy N-Quads
or Turtle export. Dataset merge proposals retain source documents and quad provenance, with
explicit graph-union and disjoint-blank policies. OWL reasoning, SHACL validation and other RDF
syntaxes remain separate work;
see [the RDF contract](docs/helix/02-design/contracts/CONTRACT-025-rdf.md).


The experimental JSON-LD package preserves exact source/context JSON and offers expansion, flattening, compaction and framing with
explicit loss reporting or rejection. It uses only supplied contexts, preserves exact numeric values through expansion and reports
remaining processor limits. Flattening includes optional target-context compaction. The official corpora, PyLD and Chromium qualify support; legacy compaction/framing discrepancies and malformed official string-boolean frames are documented;
see [the JSON-LD contract](docs/helix/02-design/contracts/CONTRACT-026-jsonld.md).

RDF-to-JSON-LD projection retains the source dataset in its report, preserves empty named graphs
and offers explicit native-type/direction conversion. All 54 pinned fromRDF cases have expected
outcomes; native discrepancies and exact-number policy are recorded in CONTRACT-026.


Generalized JSON-LD datasets use `umf.generalized-rdf` to retain blank predicates and local
blank identity. Select `produceGeneralizedRdf: true` on a JSON-LD-to-RDF proposal; use the
generalized JSON export API for its candidate. See [evidence and limits](native/generalized-rdf/README.md).
