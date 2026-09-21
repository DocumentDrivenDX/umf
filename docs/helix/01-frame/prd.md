---
ddx:
  id: umf.prd
  type: prd
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.product-vision
      kind: informed_by
    - id: umf.competitive-analysis
      kind: informed_by
kind: product
---

# UMF Product Requirements

## Summary

UMF provides a machine-readable metamodel and interchange layer for building
complex systems over heterogeneous data shapes that evolve or are only partly
understood. Tools must be able to inspect and manipulate that model, write
transforms, visualize data, generate pipelines and validators, and extract
metadata for dynamic forms, AI agents, and human explanation. Native semantics,
controlled translation, and visible interpretation limits make these uses reliable.

**Never silently lose meaning is the governing product requirement.**
Native round trips must preserve semantics within the integration's declared
support scope. Cross-system translations must provide useful mappings and an
explicit account of what the target cannot preserve or express.

The primary measures are semantic round-trip fidelity, observable translation
limitations, and evidence-backed compatibility claims. The companion
[Cross-Cutting Requirements](cross-cutting-requirements.md) applies across all
capabilities. Neither document selects an implementation architecture.

Source: the project owner's functional requirements and subsequent bootstrap
brief supplied on 2026-09-20. FR-1–FR-33 preserve the original requirement
numbers. Original item 34 appears under Non-Goals; FR-34–FR-38 are additions
from the later brief. FR-39–FR-41 record subsequent browser, DDD, and metamodel-consumer direction.
All requirements remain product obligations; this draft does
not assert that every ecosystem must ship in the first release.

## Problem and Goals

### Problem

Teams repeatedly build tools against data shapes they cannot completely know in
advance. Each tool may otherwise reconstruct structure and meaning from native
storage and compute models. Those ecosystems express overlapping concepts using
different semantics. Manual copies and conversions can lose constraints, identity,
relationships, or system-specific constructs without making that loss visible.
Teams then cannot establish whether converted models still mean the same
thing or can return safely to their source system. The frequency and cost of
this failure mode remain to be measured with users.

### Goals

**Current delivery priority (owner direction, 2026-09-21):** ingest TableSpec,
PostgreSQL, Microsoft SQL Server, Avro and Parquet schemas. These integrations must
expose usable shared field metadata, including a core scalar type field with a
defined basic vocabulary, while retaining native refinements and unknown content.
RDF/ontology integrations remain in the broader inventory but do not precede this
tabular ingestion work. Core promotion must make the metamodel useful to consumers;
preserving only opaque native envelopes is insufficient.

1. Users retain native meaning when moving supported schemas through UMF.
2. Users translate where mappings exist and can inspect every semantic limit.
3. Independent participants add semantic domains without redesigning the core.
4. Durable models retain multiple representations and evidence of their origin.
5. Consumers obtain useful, focused metadata and operate programmatically without
   reimplementing every native system's interpretation or pretending unknown shapes are understood.

### Success Metrics

These are proposed acceptance measures derived from the supplied success
criteria, not achieved results or a release schedule.

| Metric | Target | Measurement Method |
| --- | --- | --- |
| Native round-trip fidelity | 100% semantic equivalence on the declared supported corpus | Native-semantic round-trip comparisons, with corpus and support scope published |
| Silent semantic loss | 0 unreported mismatches in the evaluated translation corpus | Compare expected mismatches with output and fidelity diagnostics |
| Compatibility evidence | 100% of published support claims linked to executable evidence and versions | Audit the compatibility matrix against conformance and round-trip results |
| Extensibility demonstration | At least 1 additional ecosystem integrated without redesigning core or unrelated extensions | Compare model and extension changes and execute the new integration's conformance tests |
| Metadata consumer reuse | All 7 FR-41 consumer classes demonstrated from one model | Trace outputs to selected metadata, dependencies, provenance, and interpretation limits; repeat with an unfamiliar vocabulary |

### Non-Goals

UMF does not need to:

- Make every pair of systems losslessly interoperable.
- Replace native schema languages.
- Provide universal inference semantics.
- Reduce every concept to one canonical representation.
- Require every consumer to understand all extensions.
- Make source-specific metadata generic.
- Prescribe a universal runtime.
- Guarantee lexical round-trip fidelity unless an integration explicitly claims it.

UMF remains an interchange and semantic representation layer. Query execution,
storage services, workflow orchestration, application execution, and
general-purpose inference belong to consuming systems (NFR-50). No product
requirement has been silently moved to a deferred backlog.

## Users and Scope

### Primary Persona: Schema Integration Maintainer

**Role:** Engineer maintaining domain schemas across data, API, and knowledge
systems. **Goal:** Reuse models while knowing what each representation means.
**Pain:** Native constructs disappear or change during conversion, and manually
maintained copies diverge. This persona is inferred from the supplied direction;
interviews and the first ecosystem selection remain pending.

### Secondary Persona: Extension and Translator Author

**Role:** Engineer adding a schema ecosystem or vocabulary. **Goal:** Preserve
native meaning, declare support precisely, and verify compatibility independently.
**Pain:** A fixed common model cannot represent native constructs and forces
changes to unrelated integrations.

Scope includes the ten semantic families in FR-2. They define product breadth,
not a claim that every member, dialect, version, or feature is implemented.
For this document, full support means all semantics of an explicitly identified
native system/version; partial support names its subset and limitations. Import-only
and export-only integrations must not claim bidirectional round-trip support.

## Requirements

### Must Have (P0)

The owner supplied all 33 capabilities as requirements. They are grouped into
six mandatory product capabilities without demoting any to optional status:

| Capability | Functional Requirements |
| --- | --- |
| Semantic representation and core | FR-2, FR-3, FR-20, FR-21, FR-28, FR-35 |
| Extensions and partial participation | FR-4, FR-5, FR-22, FR-27, FR-31, FR-34, FR-40 |
| Native interchange and durable use | FR-1, FR-6, FR-26, FR-29, FR-30, FR-33, FR-36, FR-38, FR-39, FR-41 |
| Translation and fidelity | FR-7, FR-8, FR-9, FR-10, FR-24, FR-25 |
| Identity, composition, and evolution | FR-15, FR-16, FR-17, FR-18, FR-19 |
| Validation and compatibility evidence | FR-11, FR-12, FR-13, FR-14, FR-23, FR-32, FR-37 |

FR-8 governs tradeoffs across every group. This is a product baseline, not a
launch commitment. The bootstrap brief supplies an initial slice: extension
registration, unknown-content preservation, extension structural validation,
native JSON Schema and Protobuf import/export, semantic round-trip evidence,
and a JSON Schema-to-Protobuf projection with fidelity diagnostics. The first
spike investigates this slice; exact dialects and subsets must be declared before
implementation. Broader self-description and additional ecosystem support remain
product obligations beyond that slice, not first-milestone promises.

### Should Have (P1)

None assigned. No owner-supplied mandatory capability has been downgraded.

### Nice to Have (P2)

None assigned. Future conveniences must not weaken fidelity or support claims.

## Functional Requirements

### Subsystem: Semantic Representation and Core

- **FR-2 — Heterogeneous systems.** UMF must support structural, relational,
  serialization, API, graph, ontology, analytical/data-contract, operational
  domain, physical storage, and governance/policy schemas and metadata. It
  must not require a single shared semantic worldview.
  Core plus extensions must be able to represent the full superset of their
  competing storage and compute shapes, preserving native distinctions and
  disagreement. Support new implementations through extension without assuming
  all future shapes are known today. Full-superset representation is not a claim
  of complete implementation or universal cross-system equivalence.
- **FR-3 — Common semantic core.** UMF must define useful ideal concepts whose
  meanings are owned by UMF, even when native systems disagree. Ideal admission
  requires a written meaning, counterexamples, a down-projection to at least two
  of TableSpec, PostgreSQL, SQL Server, Avro and Parquet, and up-classification
  that retains unknown native detail in the extension. A projection may approximate
  or refuse the ideal; strict mode blocks loss and report mode describes it.
  Admission is not a native-equivalence claim. The ordered backlog is field,
  nullability, cardinality, author-stated facets and key; each requires mappings
  and both round-trip obligations across all five priority systems before its
  priority integration work is complete.
- **FR-20 — Simultaneous representations.** The same logical concept must be
  able to carry compatible common, relational, API, graph, ontology, and
  governance representations together without one replacing another.
- **FR-21 — Explicit native semantics.** Concepts without a safe common
  abstraction must remain explicitly source-specific. UMF must not require
  premature normalization; shared semantics apply only where correspondence is valid.
- **FR-28 — Equivalence graduation.** Replacing a native concept with a core
  concept is a separate claim from FR-3 ideal admission. It requires documented
  preconditions and counterexamples, independent mappings in both directions
  without material semantic change, migration and rollback for older artifacts,
  and zero native/unknown-content regressions. A core label alone never deletes
  an extension payload. Any removal requires an explicitly authorized, versioned
  migration after the equivalence gate; preservation remains the default.
- **FR-35 — Self-description.** UMF must eventually be able to represent its
  own metamodel and vocabularies, exercising the same extension and composition
  mechanisms as external schemas. Bootstrap validation may remain authoritative
  while self-description is introduced; this is beyond the first slice.

### Subsystem: Extensions and Partial Participation

- **FR-4 — First-class extensions.** UMF must support independently defined,
  versioned semantic extensions that define meaning absent from core. Multiple
  extensions and source-system or domain semantics must coexist in one artifact.
- **FR-5 — Unknown semantics.** A processor must be able to read, operate on
  understood semantics, and rewrite an artifact while retaining uninterpreted
  extension content intact. Unknown extensions must not silently disappear.
- **FR-22 — Partial understanding.** Consumers must be able to use understood
  portions without understanding every extension and identify which portions
  they do and do not understand.
- **FR-27 — Extension independence.** An extension must be definable and evolve
  within explicit compatibility rules without changes to unrelated extensions;
  a new domain must not require redesigning the entire core.
- **FR-31 — Third-party translators.** Third parties must be able to add native
  systems without redesigning those systems around UMF. Translators must be able
  to introduce native semantics and participate in valid common semantics.
- **FR-34 — Extension registration and evidence.** Extensions must make their
  identifier, namespace, version, structural schema, semantic rules, validator,
  capabilities, applicable import/export directions, and round-trip fixtures
  discoverable. Registration must distinguish understood semantics from
  preservation-only participation and must not imply both directions exist.
- **FR-40 — Domain-driven design vocabulary.** UMF must preserve domain-driven
  design (DDD) meaning through an independently versioned extension, introduced
  early after the first native fidelity slice. Represent bounded contexts,
  entities, value objects, identities, aggregate roots and boundaries, domain
  services, repositories, domain events, invariants, context maps,
  anti-corruption layers, and ubiquitous-language terms. Keep same-named concepts
  in different contexts distinct and make partial/directional mappings explicit.
  DDD intent must survive independently of storage, API, and execution choices;
  target bindings must not redefine source meaning. Candidate common concepts
  graduate only under FR-28's evidence and compatibility requirements.

### Subsystem: Native Interchange and Durable Use

- **FR-1 — Preserve native meaning.** UMF must represent the full semantics of
  every system it claims to support, including constructs with no equivalent
  elsewhere. For supported system S, `S → UMF → S` must be semantically lossless.
  A partial integration must qualify its claim with its exact subset (FR-26).
- **FR-6 — Import and export.** Every supported native integration must define
  its interchange relationship with UMF, including import of native schemas,
  export of representable semantics, and compatibility scope. Available directions
  must be explicit under FR-26.
- **FR-26 — Honest bidirectionality.** A bidirectional integration must import
  and export. Import-only, export-only, and partial integrations are valid only
  when their direction and supported subset are explicit.
- **FR-29 — Human and machine use.** Artifacts must support human review,
  machine generation and transformation, source control, automated validation,
  continuous integration and delivery, and tooling integration. Meaning must
  not depend on incidental presentation details.
- **FR-30 — Tool-neutral interchange.** UMF must not require a particular
  runtime, database, language, cloud, or vendor. Represented meaning must remain
  independent of the producing tool.
- **FR-33 — Durable artifacts.** UMF must be usable as an authoritative
  interchange representation beyond a single conversion, retaining enough
  information for future consumers, translators, and extensions to recover
  native semantics.
- **FR-36 — Existing artifact continuity.** Existing TableSpec UMF artifacts
  must remain valid or have explicit deterministic migrations that preserve
  their declared meaning. The baseline must be established by inspecting the
  existing schemas and fixtures, not invented from the new design.
- **FR-38 — Independent ecosystem participation.** LinkML and TypeSpec must
  be treated as candidate bidirectional interchanges with declared fidelity
  scope. Neither is required as UMF's defining metamodel. TableSpec and Axon
  must be able to act as independent producers/consumers; a Palantir integration
  must preserve exposed native semantics within its declared version and scope.
- **FR-39 — Browser execution.** Users must be able to validate and transform
  supplied schemas with core and supported extensions in a browser without a
  mandatory transformation server. Browser and command-line processing must
  preserve the same meaning and report the same semantic limitations for the
  same declared inputs. Target support remains version/subset-qualified.
- **FR-41 — Programmatic metamodel and consumer metadata.** Tools must be able
  to traverse, select, compose, and safely edit understood model content and
  extract relevant metadata without parsing human documentation or depending
  on physical storage. This must support authored transforms, visualization,
  pipeline and validator generation, dynamic forms, AI-agent context, and human
  explanation. Selected metadata must retain the identities, context, references,
  provenance, constraints, and interpretation limits needed for its declared use.
  Distinguish declared, inferred, unknown, and unsupported meaning; do not invent
  semantics when shapes are incomplete. New vocabularies must coexist with earlier
  consumers without losing uninterpreted content. Generated consumer artifacts
  must expose unsupported semantics rather than imply validation or enforcement.

### Subsystem: Translation and Fidelity

- **FR-7 — Cross-system translation.** UMF must enable `S → UMF → T` where
  meaningful mappings exist, distinguishing equivalence, approximation, meaning
  retained in UMF but not expressible in T, incompatibility, and lack of support.
  Translation must not imply universal target expressibility.
- **FR-8 — Never silently lose meaning.** Every semantic loss, approximation,
  incompatibility, or unsupported construct encountered during translation must
  be observable. Consumers must be able to determine what survives; meaningful
  source semantics must not be silently dropped.
- **FR-9 — Fidelity reports.** Every translation must be capable of producing
  a human-understandable and machine-consumable report identifying concepts
  preserved, mapped equivalently, approximated, not expressible, incompatible,
  or unsupported at useful granularity. Optional report presentation does not
  waive FR-8's mandatory observability.
- **FR-10 — Capability declarations.** Integrations and transforms must declare
  understood and emittable semantics precisely enough to establish full, partial,
  or impossible translation before or during execution. Broad ecosystem labels
  must not conceal subset support.
- **FR-24 — Provenance.** UMF must identify semantic origins, associate imported
  concepts with native constructs, and relate transformed targets to sources
  where practical for diagnostics, auditing, debugging, and fidelity evaluation.
- **FR-25 — Deterministic transformation.** The same source model, configuration,
  and supported semantic versions must produce semantically equivalent results.
  Transforms must not rely on hidden or ambient semantics that cannot be
  represented or declared.

### Subsystem: Identity, Composition, and Evolution

- **FR-15 — Identity and references.** UMF must support stable identity for
  schemas, elements, types, fields/properties, relationships, and extension-defined
  elements. Required intra-schema and cross-schema references and their identity
  semantics must survive native round trips.
- **FR-16 — Composition.** Models must compose through reuse, references,
  namespaces, modularity, and independently versioned components without
  flattening everything into a monolithic artifact.
- **FR-17 — Versioning.** UMF must support versioning of itself, core semantics,
  extensions, schemas/models, and integrations. Consumers must be able to determine
  semantic versions present; evolution must not silently reinterpret content.
- **FR-18 — Schema evolution.** UMF must represent and compare additions,
  removals, type, constraint, identity, relationship, and extension-specific
  changes, enabling integrations to apply native compatibility rules.
- **FR-19 — Semantic comparison.** Comparison must distinguish textual and
  representational differences from equivalent or materially different semantics
  for round-trip validation and schema evolution.

### Subsystem: Validation and Compatibility Evidence

- **FR-11 — Testable conformance.** UMF must define testable artifact and
  extension validity, importer/exporter/translator conformance, and the basis
  for full or partial native integration support claims.
- **FR-12 — Native round-trip testing.** Integrations must be testable using
  real native schemas through `S → UMF → S`, evaluating equivalence according
  to S's semantics rather than textual equality alone.
- **FR-13 — Cross-system testing.** UMF must support systematic tests of
  `S → UMF → T` and, where useful, `S → UMF → T → UMF`, identifying semantic
  survival and loss rather than assuming reversibility.
- **FR-14 — Real-world corpora.** Validation must support existing ecosystem
  examples, conformance suites, public specifications, and representative
  production-style schemas. Toy examples alone cannot demonstrate compatibility.
- **FR-23 — Layered validation.** UMF must validate artifact structure, core
  consistency, extension consistency, reference integrity, cross-element
  invariants, and integration requirements. Structural validity must not imply
  semantic validity.
- **FR-32 — Observable compatibility.** UMF must support a compatibility matrix
  derived from actual conformance and round-trip tests, exposing supported
  features and fidelity by integration. Claims must be evidence-based.
- **FR-37 — Initial fidelity demonstration.** The first vertical slice must
  demonstrate JSON Schema and Protobuf native round trips on meaningful upstream
  and representative native corpora, plus JSON Schema-to-Protobuf translation
  with an explicit fidelity report. Exclusions must remain visible and must not
  be reported as full-format conformance.

## Acceptance Test Sketches

These sketches establish observable outcomes for all 33 requirements. They
are not completed tests or substitutes for downstream feature and story coverage.

| Requirement | Scenario and Input | Expected Outcome |
| --- | --- | --- |
| FR-1 | Round-trip a real native schema containing unique native constructs | Native semantic equivalence; all supported constructs survive |
| FR-2 | Represent examples from each of the ten declared families | Each retains family-specific meaning without forced shared interpretation |
| FR-3 | Define an ideal, exercise at least two priority down-projections and native up-classification | Meaning/counterexamples are written; loss is blocked or reported; native refinements survive; all-five completion is tracked separately |
| FR-4 | Combine two independently versioned vocabularies absent from core | Both coexist and retain distinct semantics |
| FR-5 | Edit a known field in an artifact with an unknown extension and unknown fields | Uninterpreted content remains intact after rewrite |
| FR-6 | Import and export samples within an integration's declared scope | Available directions work; exported content is representable in the target |
| FR-7 | Translate a fixture spanning equivalent, approximate, and unmappable constructs | Useful mappings and explicit distinctions for all limitations |
| FR-8 | Introduce known semantic losses into a translation corpus | Every loss is observable; no silent drops |
| FR-9 | Translate examples covering all six fidelity categories | Human and machine reports identify affected concepts and outcomes |
| FR-10 | Request fully supported, partially supported, and impossible conversions | Declarations and execution evidence distinguish each case accurately |
| FR-11 | Run positive and negative artifact, extension, and integration cases | Conformance outcomes follow explicit criteria for each participant class |
| FR-12 | Reformat a native schema without changing its meaning, then round-trip | Semantic comparison passes despite textual differences |
| FR-13 | Translate across systems and reimport a target with expressibility limits | Tests identify precisely which source semantics survive |
| FR-14 | Evaluate native ecosystem examples and representative production-style models | Evidence includes real complexity and provenance, beyond toy fixtures |
| FR-15 | Round-trip identities and references across schemas and extension elements | Identity and reference meaning remain intact |
| FR-16 | Compose independently versioned modules sharing names in separate namespaces | Reuse and references work without mandatory flattening |
| FR-17 | Read artifacts and integrations using different semantic versions | Versions are determinable; incompatible meaning is not silently substituted |
| FR-18 | Compare models with each listed change category | Changes are identified and evaluated by native compatibility rules |
| FR-19 | Compare formatting-only, representation-only, equivalent, and changed models | Results distinguish all four cases |
| FR-20 | Attach multiple compatible representations to one logical entity | Representations coexist without destructive replacement |
| FR-21 | Import a construct without a safe common abstraction | Its native meaning remains explicit and unnormalized |
| FR-22 | Process a model with one understood and one unknown vocabulary | Known portions are usable; understanding limits are identifiable |
| FR-23 | Submit structurally valid fixtures with broken references and semantic invariants | Validation exposes the appropriate failures without claiming semantic validity |
| FR-24 | Import and transform a model with traceable native origins | Consumers can relate constructs to sources wherever the mapping permits |
| FR-25 | Repeat a transform with identical declared inputs, versions, and configuration | Outputs are semantically equivalent without undeclared state dependence |
| FR-26 | Inspect import-only, export-only, bidirectional, and subset integrations | Direction and subset claims match demonstrated capability |
| FR-27 | Add and evolve one extension alongside an unrelated extension | Unrelated semantics remain unchanged within defined compatibility rules |
| FR-28 | Evaluate a separate native-replacement claim with independent both-way mappings | No material semantic change, migration/rollback and unknown-content recovery; ideal admission alone cannot pass |
| FR-29 | Review, generate, transform, version-control, and validate an artifact | Both human and automated workflows work independently of presentation |
| FR-30 | Exchange an artifact between independent tools | Meaning remains recoverable without the producing tool |
| FR-31 | Have a third-party author add a native ecosystem translator | Native and common concepts participate without redesigning the source system |
| FR-32 | Generate a support matrix from known passing and failing compatibility cases | Claims identify versions, tested features, fidelity, and evidence gaps |
| FR-33 | Reopen a retained artifact after the original conversion ends | A later consumer can recover its native meaning from the durable representation |
| FR-34 | Register a versioned extension and inspect its validation and interchange declarations | Identity, rules, scope, available directions, and evidence are discoverable without executing artifact-supplied code |
| FR-35 | Represent a versioned UMF vocabulary in UMF and compare against the bootstrap definition | Meaning and validation expectations agree; differences are explicit |
| FR-36 | Validate or migrate the inspected TableSpec baseline | Existing meaning survives; migrations reproduce deterministically |
| FR-37 | Run the two native corpora and the cross-system projection | Native fidelity passes within scope; every known projection mismatch is reported |
| FR-38 | Exercise independently scoped interchanges and consumer workflows | Ecosystems retain native meaning without becoming UMF's mandatory worldview |
| FR-39 | Run supplied schemas through native round trips and projections in a browser and CLI | Equivalent semantic outputs and diagnostics without a transformation server |
| FR-40 | Round-trip a sales aggregate and two distinct Customer contexts; project under explicit target mappings | Identity, aggregate boundaries, events, invariants, terminology, and context distinctions survive; unsupported target semantics are reported without asserting target enforcement |
| FR-41 | Use one mixed table/service/DDD model to derive a transform, visualization, pipeline and validator, form metadata, agent context and human documentation; add an unfamiliar vocabulary | Consumers use selected metadata with context and provenance; edits propagate safely; unknown semantics survive and limits remain explicit; no consumer claims unsupported enforcement |

## Technical Context

The bootstrap brief selects YAML-first, JSON-compatible documents and JSON
Schema as the starting structural validator. These are recorded in
[ADR-001](../02-design/adr/ADR-001-bootstrap-representation.md). The
[architecture](../02-design/architecture.md) places semantic validation beyond
that structural boundary. The owner's subsequent 2026-09-20 direction requires
browser execution through JavaScript or WebAssembly (WASM), with TypeScript
preferred for implementation simplicity. High performance is not a primary
driver. The architecture records this implementation direction; UMF semantics
remain independent of the host language under NFR-12–NFR-14.
Bun is the default development/test runtime under
[ADR-002](../02-design/adr/ADR-002-bun-development-runtime.md); actual-browser
verification remains mandatory. Exact tooling versions await the scaffold.

## Constraints, Assumptions, Dependencies

### Constraints

All applicable [NFR-1–NFR-50](cross-cutting-requirements.md) constrain these
capabilities. A more readable or convenient representation cannot excuse lost
meaning. Partial support must be explicit; ecosystem breadth does not imply
full support for unspecified versions or dialects.

### Assumptions

The proposed personas represent actual integration needs; this awaits research.
Useful cross-system correspondences exist but must be established per mapping.
No budget, schedule, or first-release ecosystem commitment has been supplied.

### Dependencies

The product vision provides direction. Native ecosystem specifications,
version-specific equivalence criteria, and usable real-world corpora are needed
to substantiate support. TableSpec and Axon are intended consumer examples from
the owner; their exact repositories, products, and integration needs remain to
be inspected.

## Risks

| Risk | Probability | Impact | Mitigation |
| --- | --- | --- | --- |
| Subset evidence is mistaken for full native support | Unassessed | Invalid fidelity claims | Name system, version, subset, and corpus limits in capability declarations and the matrix |
| Retained source content is mistaken for target expressibility | Unassessed | Consumers rely on nonexistent target behavior | Distinguish preserved source meaning from emitted target meaning in reports |
| A clean abstraction erases native distinctions | Unassessed | Broken round trips | Keep source semantics explicit until equivalence is demonstrated |
| Unknown extension content survives but becomes inconsistent after edits | Unassessed | False claims of semantic safety | Define operation-specific dependency and partial-understanding rules before permitting such claims |
| Broad product scope becomes an implied launch promise | Unassessed | Unbounded delivery scope | Select and publish the first release's ecosystems and support boundaries separately |

## Open Questions

- Which initial consumer output profiles and reference-selection rules make
  metadata slices sufficient for forms, agents, visualizers, generators and
  humans? Owner: model/consumer authors; blocks exact FR-41 contracts, not the
  requirement to support these workflows.
- What versioned DDD profile and external tool formats establish the initial
  FR-40 oracle? Owner: extension authors; blocks tool-specific support claims.

- Which JSON Schema dialects and Protobuf language versions/subsets enter the
  first slice? Owner: product owner and adapter authors; blocks the exact
  support manifest. The two initial ecosystems are now selected.
- What establishes semantic equivalence for each native system? Owner:
  integration authors with native-domain reviewers; blocks conformance criteria.
- How should operations handle unknown content dependent on edited known content?
  Owner: specification maintainers; blocks safe edit behavior and fidelity claims.
- What preservation accompanies target output, and what can be recovered from
  the target alone? Owner: specification and integration authors; blocks export contracts.
- Which public and production-style corpora can be redistributed? Owner:
  maintainers and rights holders; blocks reproducible published test evidence.
- TableSpec's local source and examples are available at `/home/erik/Projects/tablespec`
  and pinned in `native/tablespec/sources.json`. Its runtime/schema consistency and
  compatibility behavior require native checks. Axon's exact integration interface
  still requires identification; it is outside the current five-system priority.
- Which first-slice capabilities are production release commitments rather than
  spike findings? Owner: product owner; blocks release commitments. All 41
  requirements remain product obligations until explicitly changed.

## Success Criteria

1. A nontrivial native schema round-trips with no semantic loss.
2. One artifact carries multiple systems' semantics without destroying any.
3. Cross-system translation produces useful output and explicit semantic mismatch reporting.
4. Adding a schema ecosystem does not require redesigning the entire UMF model.
5. Proven core evolution makes shared concepts easier to translate while preserving compatibility.
6. Executable evidence backs compatibility claims.
7. UMF serves practical consumer workflows such as TableSpec and Axon rather
   than becoming an isolated schema format; exact consumer scenarios await identification.
8. One programmatically accessible model drives all seven FR-41 consumer classes,
   including with partial understanding and a newly added vocabulary.

## Review Checklist

- [x] Original requirements 1–33 retain stable IDs and each belongs to one subsystem.
- [x] Bootstrap additions FR-34–FR-38 have stable IDs and acceptance sketches.
- [x] Original item 34 is preserved as explicit non-goals.
- [x] Every functional requirement has an acceptance sketch.
- [x] Native fidelity, partial support, and target expressibility remain distinct.
- [x] Implementation choices are excluded.
- [ ] Confirm release priorities and consumer scenarios.
- [ ] Derive feature specs and user stories with traceable acceptance criteria.
- [ ] Define native equivalence rules and execute conformance tests.
- [ ] Obtain product review; this document remains a draft.
