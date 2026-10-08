# Product direction supplied by the founder

Source: the project owner's UMF vision supplied on 2026-09-20. This note
preserves framing inputs that sit below the concise [product vision](product-vision.md).
It is source material for subsequent artifacts, not an approved requirements
document or evidence of implemented capabilities.

## Origin and scope

Extract the schema concept from tablespec and broaden it to schemas, contracts,
models, ontologies, APIs, and physical data definitions. The tablespec source
and implementation brief have not yet been inspected.

The product category is **schema interchange fabric**. External messaging
centers on interchange, fidelity, and extensibility. “Universal schema
language” misstates the intended relationship to native systems.

## Candidate ecosystems and vocabularies

The supplied examples include SQL DDL, Protobuf, JSON Schema, OpenAPI,
GraphQL, dbt, Spark, OWL/SHACL, data contracts, application types, graph
schemas, and operational ontologies. These are candidate integration areas,
not a committed support list.

Candidate versioned extension vocabularies include relational, graph,
protobuf, openapi, owl, shacl, authority, lineage, quality, palantir, axon,
and databricks. Exact products, versions, dialects, and vocabulary boundaries
remain to be resolved during research and framing; “Axon” in particular
needs an unambiguous product reference.

Extensions carry semantics with schemas, validation rules, translators, and
fidelity guarantees. They are more than arbitrary metadata. Common concepts
enter the core through demonstrated equivalence rather than speculative
generalization. A document may carry common structural, relational, API,
governance, ontology, and target-specific information simultaneously.

## Eventual product surface

- A specification defining core semantics and the extension mechanism.
- A stable canonical programmatic model.
- Structural and semantic validators.
- An extension software development kit.
- Importers and exporters connecting native systems with UMF.
- Transformations within UMF and conversions across systems.
- Machine-readable fidelity diagnostics.
- A compatibility matrix backed by executable evidence.
- A command-line interface and libraries for build systems, data platforms,
  development environments, and applications.

The supplied initial serialization direction is human-readable YAML,
validated structurally through JSON Schema. Serialization represents UMF;
it does not define its semantic identity. This direction does not imply
that structural validation alone establishes semantic correctness.

## Boundaries to carry into requirements

UMF serves as an interchange layer. It does not replace SQL, Protobuf,
native API definition languages, or ontology systems. A data catalog,
ontology engine, or code generator can consume or produce UMF without
becoming the product itself.

Native round trips must preserve meaning. Cross-system conversions must
distinguish exact preservation, equivalent mapping, approximation,
preservation outside target expressibility, incompatibility, and lack of
support. A retained source concept must never be presented as implemented
target semantics.

Real native schemas and executable semantic round-trip tests are the
quality bar for integrations and the foundation for translation tests.

## Decisions still needed

- First users and the first native ecosystem to support.
- The tablespec repository or source material to inspect.
- Native semantic equivalence criteria, including version and dialect scope.
- Preservation expectations after edits and when a consumer cannot interpret
  an extension.
- How retained information accompanies target output so a return trip remains
  possible without claiming the target itself expresses that information.
- Extension ownership, version compatibility, and fidelity claim boundaries.

This note preserves the original vision input. Subsequent requirements and
bootstrap direction are now captured in the [PRD](../01-frame/prd.md),
[cross-cutting requirements](../01-frame/cross-cutting-requirements.md),
[concerns](../01-frame/concerns.md), and [architecture](../02-design/architecture.md).
A focused source check exists; broader research and TableSpec inspection remain pending.

## Subsequent owner direction: implementation and DDD

Source: the project owner's subsequent instructions on 2026-09-20.

Define the core JSON Schema, then iterate over each proposed extension system:
define its package and JSON Schema, identify representative native examples,
implement round trips and robust sample transforms, and record test evidence.
Promote concepts into core when extensions demonstrate identical semantics.
Completion requires core and extension schemas plus implemented, tested
integrations across the declared inventory. The first spike is only the start;
versions, subsets, and exclusions still qualify every support claim.

The implementation must run in a browser through JavaScript or WebAssembly
(WASM). TypeScript is preferred for simplicity; high performance is not a primary
driver. Bun is the owner's selected default runtime for development and testing.
These choices concern implementation, not the language-neutral meaning of UMF.

Domain-driven design (DDD) should be an early semantic vocabulary, provisionally
`umf.ddd`: `DDD model → UMF core + DDD extension → target projections`. DDD does
not define UMF's universal worldview or execution architecture.

Entity, value type/value object, identity, relationships/references, invariants/
constraints, and namespace/module are candidates for shared concepts. Their
names alone do not justify core promotion. Bounded context, aggregate root and
boundary, domain service, repository, domain event, context map, anti-corruption
layer, and ubiquitous-language terms belong in the DDD vocabulary.

Owner-supplied illustrative notation, not an approved UMF document contract:

```yaml
namespace: sales
definitions:
  Order:
    kind: entity
    identity: order_id
    extensions:
      ddd:
        aggregate_root: true
        bounded_context: sales
        aggregate_members:
          - OrderLine
          - ShippingAddress
  Money:
    kind: value
    extensions:
      ddd:
        value_object: true
```

The omitted member definitions and identity field must be supplied in an
executable fixture. The short `ddd` alias and field names remain illustrative
until a versioned extension contract defines them.

An Order aggregate may project to SQL `orders` and `order_lines` tables, a
document, an Axon subgraph, OpenAPI commands and data transfer objects (DTOs),
or a Palantir Object Type with Actions. These are possible target mappings,
not semantic identities or implemented capabilities. Never assume entity equals
graph node, aggregate equals table, or repository equals API endpoint.

Keep `sales.Customer`, `support.Customer`, and `billing.AccountHolder` distinct.
Explicit context mappings may be partial, directional, or non-invertible; similar
names and structure do not establish equivalence. A bounded context may use a
module/namespace as its carrier while retaining DDD meaning in the extension.

DDD describes domain meaning; core and extensions represent it portably;
bindings describe physical representation; Axon, TableSpec, and other consumers
execute it. Axon can consume DDD semantics without owning their definition.
An early DDD slice should exercise entities, value objects, aggregates, bounded
contexts, domain events, invariants, and context mappings independently of storage.

## Owner clarification: why the metamodel exists

Source: the owner's subsequent 2026-09-20 rationale. Teams routinely need to
build complex systems over data whose shapes may not yet be fully understood.
They need to write transforms, visualize data, generate pipelines and validators,
and extract metadata for dynamic forms, AI-agent context, and human understanding.
These workflows require a machine-readable metamodel with easy programmatic
interaction and interoperability across varied storage implementations, including
ones that do not yet exist.

The metamodel should carry the full superset of competing storage and compute
shapes. In UMF, that means core plus composable semantic vocabularies that retain
native meanings, conflict, and unknown content, not a lowest-common-denominator
type system or an assertion of support for every future implementation. Consumers
must distinguish what is understood, inferred, preserved-only, or unsupported.
The [vision](product-vision.md) and PRD FR-2/FR-41 carry this rationale into
product direction and testable requirements.

## Owner direction: shared schema, ingestion and backend queries

Source: the project owner's 2026-10-04 ecosystem request.

Define schemas in UMF and convert them between source systems using UMF tools.
Use those schemas to define mutable property graphs with Truss, pipelines with
TableSpec, and immutable property graphs with Ashlar. Starting from simple
relationships in an external system, an engineer should be able to write an
importer using TableSpec that loads ordinary Delta tables, Truss, or Ashlar,
then generate queries over each backend from the shared UMF schema.

This is a requested consumer workflow. UMF retains responsibility for schema
meaning and interchange; consumers own data movement, storage, and execution.
The request adds Truss and Ashlar as explicit consumers without removing the
existing Axon direction or requiring DDD semantics for a property graph.
Query generation also needs an authored question and a target binding: a schema
alone does not identify which question to answer.

“Immutable property graph” is owner direction for Ashlar. Its exact update,
revision, deletion and retention behavior requires framing in Ashlar. Delta
storage does not by itself establish immutable graph publication. Likewise,
native foreign keys do not automatically establish authored graph intent.

The [ecosystem inventory](current-state-inventory-ecosystem.md) records the
2026-10-04 source inspection. The complete workflow has no execution evidence.
The source system, dataset, target versions and deployment environment remain
unselected; use synthetic data until a real source and governance are supplied.

### Owner clarification: TableSpec becomes UMF-native first

Source: the owner's subsequent 2026-10-04 instruction. Once UMF is finalized,
port TableSpec to be UMF-native. This is the first integration goal; graph
sinks and portable backend queries follow it.

The proposed interpretation of “finalized” is an explicitly versioned,
conformance-backed UMF consumer contract sufficient for TableSpec, with stable
public operations and migration rules. It is not yet a release decision and
does not claim every candidate ecosystem is finished. The owner may require
a broader finalization gate; that remains an open question.

UMF-native means UMF documents are TableSpec's authoritative schema input and
persisted schema representation. TableSpec reads shared schema semantics from
UMF and keeps pipeline-specific meanings in independently versioned TableSpec
extensions. Its legacy table model may remain a migration/compatibility surface,
but must not become a second authoritative schema definition. Python remains
a viable implementation language; a native port does not imply a language rewrite.

First map the complete TableSpec schema and compiler-consumed metadata to UMF
core, existing vocabularies, or explicit TableSpec extension semantics. This
includes source declarations, ingest casts and update policy, stage-specific
nullability, keys, relationships, derivations, survivorship, validation suites,
quality checks, outputs, provenance, and split-format sidecars. Retaining opaque
source alone cannot satisfy native execution. Concepts that affect an operation
must be understood or cause an explicit refusal.

The port's proposed acceptance gate is: migrate monolithic and split legacy
fixtures with recovery/rollback; author a schema directly in UMF; compile and run
the selected existing pipeline corpus from it; compare canonical rows, generated
artifacts and validation outcomes; preserve unknown content; exercise exact values,
null/absence and failure behavior. A transitional internal compiler view is
acceptable if derived from UMF and verified to retain the required meaning.
Python/TypeScript semantic parity and package/version consumption need a recorded
design before choosing a Python implementation, generated models or a host bridge.

### Proposed sequence after the native port

This sequence is a proposal for subsequent framing/design, not an approved
implementation contract. The native-port finalization gate must reconcile the
existing US-050 prerequisites rather than silently abandoning that work.

1. Frame one shared consumer scenario: Customer → Order → Product through
   property-bearing OrderLine associations. Keep source keys, stable model IDs,
   canonical data identities and physical names separate. Retain source and
   unknown metadata. Pin the schema revision and every interpreted vocabulary.
2. Define explicit mappings from TableSpec's UMF-native pipeline inputs to ordinary
   Delta tables, Truss's accepted generic PostgreSQL catalog layout, and Ashlar's proposed warehouse
   graph profile. Specify scalar encoding, absent/null behavior, edge identity,
   parallel edges, validation and enforcement per target. Reuse existing UMF
   relationships and bindings; introduce consumer extensions only for missing
   meanings. An adapter receipt must account for every selected construct.
3. Prove the TableSpec → ordinary Delta path first. Compile reviewable ingestion
   and query artifacts, execute valid and invalid synthetic cases on a pinned
   native target, and retain the source model and mapping diagnostics. Local
   DuckDB or Spark simulation cannot establish Databricks compatibility.
4. Frame and implement the Truss ingestion API and Ashlar publication contract
   in their own repositories. Replayed input must have defined identity and
   duplicate behavior. Truss writes need transactional semantics; Ashlar reads
   need a named, consistent published revision and explicit retention policy.
5. Define a small shared query representation: typed starts, parameterized
   filters, directed fixed-depth traversal and projected fields. Compile it
   against each binding. Specify bag/set behavior and ordering, preserve exact
   values, and refuse unsupported predicates or paths explicitly. Keep native
   execution and credentials outside UMF's browser library.
6. Demonstrate one importer definition and one question against the three
   targets: “Which products did customer C1 order?” Compare canonical result
   identities, values and multiplicities at an explicitly matched data revision.
   Distinguish running the same query on each backend from federating a single
   query across them; federation is not selected for this first proof.

The acceptance corpus should include an isolated customer, multiple orders for
one product, parallel associations with different quantities, a missing endpoint,
duplicate source identity, explicit null versus absence, an exact decimal, an
unknown property, and an interrupted/replayed import. Query result comparisons
must account for multiplicity rather than hiding differences with `DISTINCT`.

### Placement for the next governed changes

UMF framing should make the native TableSpec consumer requirement explicit and preserve
FEAT-006's existing exclusion of query execution. A new consumer query contract
can govern generation without making UMF a database runtime. Read CONTRACT-001
through CONTRACT-011 and current implementation evidence before extending code.
First select the TableSpec finalization gate and author the native-port feature,
semantic coverage matrix, migration contract and acceptance plan. Truss must frame requirements around its accepted ADR-001/ADR-002 before
implementation. Ashlar must reconcile immutable publication with PRD Q2/Q3/Q7
and its existing schema/query milestone. TableSpec needs tracked native-port and
later sink work under its DDx Beads process before runtime changes.

## Owner direction: shared JavaScript numeric adapter (2026-10-07)

The owner requests shared JavaScript number/bigint admission and conversion for
Truss, Ashlar and TableSpec, using existing integer/decimal token carriers.
Preserve exact decimal spelling, require explicit lossless number conversion,
validate supplied declared ranges and serialize through existing JSON-safe
carriers. JavaScript representations do not become language-independent schema
types. Database transport/storage codecs stay in Truss/Weft; the shared adapter
must remain browser-compatible and add no runtime dependencies.

FR-8/39/41, FEAT-005 IDEAL-08, US-054, CONTRACT-049, TD-054 and STP-054 carry
the governed requirement and checks. Numeric admission does not imply consumer
adoption, new core ideal admission, native database equivalence or float semantics.

### Owner direction: official Python support (2026-10-07)

The owner approves a Python package in DocumentDrivenDX/umf containing shared
Pydantic models and reusable schema validation, extension registration and
serialization. Canonical JSON Schemas remain owned by UMF. TableSpec owns its
extension models, schemas and execution policy in its own repository; those
must not be moved into UMF core. Python and JavaScript share versioned structural
contracts and conformance cases. TableSpec consumes the official Python package
and derives its compiler view from shared documents, retaining legacy I/O for
explicit compatibility and migration. Unknown content survives; execution of
uninterpreted relevant semantics refuses. Package publication requires a concrete
release decision and must not be inferred from a format version.
