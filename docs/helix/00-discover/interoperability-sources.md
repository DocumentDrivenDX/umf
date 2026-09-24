---
ddx:
  id: umf.interoperability-sources
  type: resource-summary
  activity: discover
  status: draft
  authoring:
    home: repo
  links: []
---

# Native Interoperability and Prior-Art Sources

## Source

Accessed 2026-09-20. These are living documentation pages, not pinned dependency
versions. Native fixtures and implementations must receive concrete revisions
and redistribution checks before use.

- [LinkML generators](https://linkml.io/linkml/generators/) and
  [feature dashboard](https://linkml.io/linkml/generators/dashboard.html), LinkML project.
- [LinkML documentation](https://linkml.io/linkml/), including its self-described metamodel.
- [JSON Schema Test Suite](https://github.com/json-schema-org/JSON-Schema-Test-Suite), JSON Schema organization.
- [Bowtie introduction](https://json-schema.org/blog/posts/bowtie-intro), JSON Schema project.
- [Protobuf descriptor API](https://protobuf.dev/reference/cpp/api-docs/google.protobuf.descriptor/) and
  [field presence guide](https://protobuf.dev/programming-guides/field_presence/), Google Protocol Buffers.
- [TypeSpec language overview](https://typespec.io/docs/language-basics/overview/), Microsoft TypeSpec.

## Summary

LinkML is a schema modeling language with a self-described metamodel and multiple
generators. JSON Schema's native suite evaluates validation behavior; Protobuf
provides descriptor APIs and documented presence semantics. These sources
ground candidate oracles and comparison work without establishing UMF's fidelity.

## Relevant Findings

- LinkML documents generators for schema, linked-data, programming-language,
  and database targets. Its feature dashboard is generated from compliance test
  results. UMF should compare measured feature fidelity rather than assume that
  versioned vocabularies provide a demonstrated advantage.
- The JSON Schema suite supplies schemas, data instances, and expected validity,
  organized by dialect. Optional tests need explicit applicability decisions.
  The suite is useful input to a round-trip harness; it does not itself test
  UMF or establish preservation of every non-validation semantic.
- Bowtie compares behavior across validator implementations. It may help examine
  disagreements; it is not proof of universal schema equivalence.
- Protobuf descriptors expose schema information and field-presence behavior.
  The presence guide distinguishes explicit and implicit presence. UMF's oracle
  must retain such distinctions and state which descriptor differences are ignored.
- TypeSpec's overview documents models, scalars, operations, interfaces,
  namespaces, and other language constructs. It does not establish that every
  UMF vocabulary can be represented without distortion. The owner's decision
  is to treat it as interchange pending evidence, not to declare it incapable.

## HELIX Usage

[Architecture](../02-design/architecture.md) uses these sources to identify
native tooling boundaries. [SPIKE-001](../02-design/spikes/SPIKE-001-jsonschema-protobuf.md)
turns those boundaries into experiments. [TP-001](../03-test/test-plan.md)
distinguishes validation vectors, descriptor comparisons, preservation checks,
and target projection outcomes.

## Authority Boundary

This is a focused source check, not a completed competitive analysis. It does
not verify the TableSpec baseline, Axon source, all Palantir capabilities, or
every candidate ecosystem. It does not select a language, library version,
license, or support subset. The design's testing proposals are UMF decisions,
not upstream guarantees. Source documentation and test behavior must be revisited
at the concrete revisions selected for implementation.

## Review Checklist

- [x] Primary sources and access date recorded.
- [x] Source facts separated from UMF design inferences.
- [x] No claim of completed implementation or universal equivalence.
- [ ] Pin fixture revisions, library versions, and redistribution terms before execution.


## TypeSpec implementation discovery (2026-09-20)

Pinned `@typespec/compiler` 1.16.0 supplies parser/AST navigation and native compilation
through a CompilerHost. The package has browser replacements for Node host/logging,
and its parser and compiler bundled successfully with Bun. The authored UMF memory
host then compiled a supplied multi-file model in actual Chromium. Standard-library
text, package metadata, license and per-file hashes are retained under
`spec/extensions/typespec/`. Internal standard decorator/intrinsic imports are pinned
to the package version; external JavaScript libraries remain unsupported.

The compiler distinguishes AST navigation from the semantic type graph and explicitly
warns that advanced AST APIs can change outside normal stability guarantees. Current
UMF source/syntax preservation therefore does not establish a portable complete type
graph. Native CLI checks use another host with the same compiler, not an independent
implementation. Project configuration, type-graph extraction, library registration,
upstream corpus and projections remain required follow-up work.

References: [compiler API](https://typespec.io/docs/standard-library/reference/js-api/functions/compile/),
[host-based emitter guidance](https://typespec.io/docs/extending-typespec/emitters-basics/),
[pinned package](https://www.npmjs.com/package/@typespec/compiler/v/1.16.0).

## Smithy implementation discovery (2026-09-20)

The [JSON AST specification](https://smithy.io/2.0/spec/json-ast.html) supplies a
native interchange representation alongside IDL. The model loader's pinned valid
fixtures expose inherited collection members: local member presence cannot be checked
without accounting for mixins. The 1.73.0 native assembler distinguishes structural
AST retention from assembled reference validity. CONTRACT-014 records this initial
profile and its remaining language/assembly/trait/projection requirements.

Smithy browser-runtime discovery tested native 1.73.0 via TeaVM 0.15.0. The direct
JS-module build fails on required Java runtime surfaces; SPIKE-002 retains the
reproducer and exact errors. [TeaVM's module API](https://teavm.org/docs/runtime/js-modules.html)
documents the export mechanism, but is not evidence that the Smithy assembler is
compatible. The source archive profile remains explicitly separate from a parser.

The subsequent patched Smithy/TeaVM experiment succeeds: narrow runtime compatibility
changes yield 144/144 existing JVM corpus agreement in Bun and Chromium. SPIKE-002
records source/artifact hashes, the character-buffer offset issue found during runtime
checks and the remaining explicit generic-superclass reflection gap. This supersedes
any inference that direct-build failure makes every JavaScript port infeasible.

### PostgreSQL parser implementation evidence (2026-09-20)

- [libpg-query-node](https://github.com/constructive-io/libpg-query-node): inspected the
  pinned @libpg-query/parser 17.6.10 package; observed PostgreSQL 170004 and working native
  parse/deparse through WASM. The separate libpg-query 18.1.5 package exposed parse but
  no public deparse API in its installed declarations; it is not a project dependency.
- [libpg_query](https://github.com/pganalyze/libpg_query): uses PostgreSQL parser sources;
  a parse tree is not catalog resolution or evidence that DDL executes successfully.
- [17-6.1.0 Protobuf vocabulary](https://github.com/pganalyze/libpg_query/blob/17-6.1.0/protobuf/pg_query.proto):
  candidate source for complete typed AST schema work, not yet verified as byte-identical
  to the packaged generated codec. Do not claim that generation step is complete.
- Pinned pglast 7.18 reports PostgreSQL 17.7 and independently reparses authored original/
  regenerated SQL. This is cross-wrapper evidence with explicitly different minor versions.


### Arrow upstream IPC integration gold files

[apache/arrow-testing](https://github.com/apache/arrow-testing/tree/9ff285c88565f0f6abc855918c6a342e70e4909c/data/arrow-ipc-stream/integration)
provides reference IPC files/streams and integration JSON produced by named Arrow
implementations/releases. UMF pins the complete subtree (182 binary / 91 JSON examples)
and preserves the license and hashes. Current execution finds three native-readable
historical footer-version differences; corpus inclusion does not imply every operation
supports every input. CONTRACT-016 records exact outcomes and remaining gaps.


### Spark DataType/StructType JSON

Spark v4.0.1 primary Python/JVM type and metadata sources are pinned under
native/spark/sources/ with hashes and redistribution notices. SPIKE-004 records actual
native parser differences over 49 authored inputs; Python and JVM acceptance are not
interchangeable. This supports exact-source preservation and explicit runtime/configuration
scope before declaring Spark extension compatibility.

Iceberg discovery now pins Apache Iceberg 1.11.0 at
6976e020b894f6a6777704df2b8c4458cb291ae9, with specification/license/notice hashes in
native/iceberg/sources/manifest.json. Appendix C defines schema JSON, field/component IDs,
defaults and primitive spellings; identifier fields do not enforce uniqueness. The
[official specification](https://iceberg.apache.org/spec/) and
[PyIceberg 0.11.0 release](https://iceberg.apache.org/blog/apache-iceberg-python-0.11.0-release/)
provide context; local pinned content is the reproducible authority for CONTRACT-020.
PyIceberg is a native oracle, not the authoritative interchange model: authored probes show
normalization, unknown-type rejection and permissiveness on some invalid source constraints.
Table metadata, physical evolution and upstream corpora remain discovery/implementation work.


## Additional LinkML implementation candidate

[LinkML-Scala](https://arxiv.org/abs/2607.22335) reports a JVM/JavaScript implementation covering
the metamodel, runtime and several generators, with a browser playground. Treat it as a candidate
independent browser backend/oracle for later LinkML closure and semantic work. Package versions,
licensing, feature coverage and agreement with the pinned Python corpus remain unevaluated;
this research lead adds no UMF support claim. Source discovered 2026-09-20.

### RDF source and runtime baseline

The [RDF 1.1 N-Quads Recommendation](https://www.w3.org/TR/n-quads/) defines a dataset syntax with
IRI, blank-node, literal and graph terms. The [official RDF test repository](https://github.com/w3c/rdf-tests)
provides separate versioned syntax corpora. UMF pins commit 369a90d1a60c021b746df2e411da0ff36258a758
and preserves the full RDF 1.1 N-Quads manifest: 53 positive and 34 negative cases with license/hashes.
[N3.js](https://github.com/rdfjs/N3.js/) provides a browser ESM distribution; UMF pins 2.7.12 and
explicitly rejects newer term kinds in this profile. This does not establish RDF 1.2 coverage.
RDFLib 7.6.0 is an independent development oracle with literal normalization disabled. It accepts
nine official negative cases, so corpus expectations take precedence over that parser's acceptance.
All positive datasets and authored schema metadata compare isomorphically; OWL, SHACL and storage
platform interpretation remain separate work rather than inferred from parsing their vocabulary IRIs.


[RDF 1.1 TriG](https://www.w3.org/TR/trig/) supports named graph blocks, including empty graphs
that cannot be represented by N-Quads alone. The same pinned W3C repository supplies all 357
TriG manifest cases; native/rdf/trig-sources/ records source hashes and expected N-Quads files.
Empty graph inventory is checked separately because those expected quad files cannot encode it.


### JSON-LD source and expansion baseline

The [JSON-LD 1.1 algorithms](https://www.w3.org/TR/json-ld11-api/) define expansion separately from
RDF conversion. [jsonld.js](https://github.com/digitalbazaar/jsonld.js/) supplies browser bundles,
custom document loaders and warning events; UMF pins 9.0.0 with its recorded expansion source patch and instantiates a fresh processor per
operation to isolate context caches. The [official API corpus](https://github.com/w3c/json-ld-api/tree/ffdb326121ea89b7b8280e76a5caea923834bcef)
is pinned at ffdb326121ea89b7b8280e76a5caea923834bcef, with 385 expansion cases. PyLD 2.0.4 with a documented integer/Decimal loader provides
independent exact-value comparisons. Both implementations have documented discrepancies, so official expected
results, source preservation and native outcomes are reported separately in CONTRACT-026.


The [flattening algorithm](https://www.w3.org/TR/json-ld11-api/#flattening-algorithm) collects node
properties and assigns blank identifiers. Its pinned manifest contains 58 cases; optional target
context invokes compaction. UMF runs that complete manifest and records independent PyLD differences
rather than treating processor agreement as authority. Exact-number and opaque JSON duplicate
handling require the documented util.js patch. No general RDF-equivalence claim follows from this.


The [compaction algorithm](https://www.w3.org/TR/json-ld11-api/#compaction-algorithm) applies a
supplied context to expanded data. The pinned compact manifest has 246 cases. The legacy-prefix
expectation tp001 differs from UMF's retained 1.0 interpretation and from t0038's expected use of
expanded term definitions as prefixes; this is recorded as an unresolved compatibility discrepancy.
The [1.0 IRI compaction algorithm](https://www.w3.org/TR/2014/REC-json-ld-api-20140116/#iri-compaction)
and [1.1 prefix rules](https://www.w3.org/TR/json-ld11-api/#iri-compaction) differ. Do not erase that
version distinction or report a clean conformance result from a corpus with an output mismatch.


[JSON-LD 1.1 Framing](https://www.w3.org/TR/json-ld11-framing/) defines selected graph views,
embedding, defaults and default-versus-merged graph behavior. Its
[separate official test repository](https://github.com/w3c/json-ld-framing/tree/3bf782ba9a40dd1b143435abe386d38df64f2b47)
is pinned with 92 cases and 271 resources in native/jsonld/framing-sources/. UMF records the t0010
source/frame IRI interpretation conflict and PyLD's t0069 rejection explicitly. Native comparisons
are evidence with documented differences, not unconditional conformance certification.


The [RDF-to-JSON-LD algorithm](https://www.w3.org/TR/json-ld11-api/#serialize-rdf-as-json-ld-algorithm)
provides explicit native-type and direction options. Its pinned 54-case manifest includes both
non-normative direction representations. UMF executes every case, adds exact-number/empty-graph
checks, and records PyLD's legacy-list, parser, datatype and compound-direction differences.
The retained source report is necessary because native scalar conversion can change RDF literal
datatypes and lexical spelling even when JSON values are usable by consumers.
