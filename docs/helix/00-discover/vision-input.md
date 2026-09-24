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
