---
ddx:
  id: umf.cross-cutting-requirements
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.prd
      kind: informed_by
---

# UMF Cross-Cutting Requirements

## Purpose and Authority

These constraints apply across UMF core, extensions, translators, validators,
tooling, and implementations. They complement the functional requirements in
the [Product Requirements](prd.md) without selecting implementation mechanisms.
This is a project-specific requirements companion, not a new HELIX library type.

Source: the project owner's cross-cutting requirements supplied on 2026-09-20.
`NFR-n` preserves the original numbering, including requirements that constrain
observable behavior rather than performance alone. “Must” is mandatory; “should”
expresses a stated expectation. Neither is silently downgraded to a release
priority. The verification sketches below propose ways to assess these claims;
they are not evidence that an implementation already satisfies them.

**Never silently lose meaning governs every operation.** Explicit normalization
or removal authorizes the specified change; it does not authorize undisclosed
collateral loss. Preservation of uninterpreted content does not establish that
an operation requiring its semantics is safe.

## Compatibility and Preservation

### NFR-1 — Backward compatibility

Existing valid artifacts should remain valid across compatible UMF releases.
Breaking changes must be explicit, versioned, and mechanically detectable.
Where practical, migrations should be deterministic.

### NFR-2 — Forward compatibility

Consumers must tolerate newer constructs they do not understand when those
constructs are not required for the operation. Unknown extensions and unknown
extension fields must be preservable without interpretation.

### NFR-3 — Lossless preservation

A tool must not destroy information merely because it does not understand it.
Parse-edit-write workflows must preserve uninterpreted semantics unless the
user explicitly requests normalization or removal.

### NFR-4 — Determinism

Validation, normalization, transformation, comparison, and export must be
deterministic for the same inputs, versions, and configuration. Equivalent
inputs must not produce meaningfully different outputs because of process
order, environment, timing, or implementation accident.

### NFR-5 — Canonical semantic identity

Concept identities must remain stable independently of file location,
serialization ordering, formatting, implementation language, and tool-specific
object identity. This supports references, comparison, caching, provenance,
and schema evolution.

### NFR-6 — Stable reference semantics

References must remain resolvable across modular schemas, packages, versions,
and extension vocabularies. Resolution rules must be explicit and deterministic.
Ambiguous references must fail rather than resolve heuristically.

## Extension and Version Boundaries

### NFR-7 — Extensibility without core modification

A new ecosystem must be addable without changing unrelated semantics. Introducing
a new extension should not require core evolution.

### NFR-8 — Extension isolation

One extension must not silently reinterpret another's semantics. Interactions
must be explicitly defined, and conflicting semantics must be diagnosable.

### NFR-9 — Namespacing

Extension concepts, identifiers, and semantics must be globally distinguishable.
UMF must avoid naming collisions between independent ecosystems.

### NFR-10 — Version-aware semantics

A construct's meaning must be evaluated in its declared version. A processor
must not silently apply incompatible semantics from an older or newer vocabulary.

## Portability and Processing Scale

### NFR-11 — Offline operability

Validation and translation should not fundamentally require network access.
External references may exist, but supported schemas should be packageable for
deterministic offline processing. Network availability must not be part of UMF semantics.

### NFR-12 — Portability

Artifacts must not depend on a particular operating system, CPU architecture,
database, cloud, programming language, or vendor runtime. Portable meaning is
a primary requirement.

### NFR-13 — Implementation neutrality

The specification must define behavior and semantics without mandating one
implementation architecture. Independent implementations should be possible.

### NFR-14 — Multiple implementation languages

Core functionality must be implementable in multiple languages. The specification
must not depend on constructs specific to a host language, including Python,
Java, Rust, or TypeScript.

### NFR-15 — Bounded implementation complexity

Supporting UMF must not require implementing every known extension. A minimal
conforming implementation must be possible. Implementations should be able to
support core plus selected extensions and translators without the full ecosystem.

### NFR-16 — Streaming and partial processing

Large collections must not require loading an entire universe of metadata into
memory where semantics do not require it. Implementations should support
incremental processing of modular artifacts and collections.

### NFR-17 — Scale independence

The model must remain usable for a single schema, hundreds of related schemas,
large enterprise catalogs, and generated corpora. Conceptual behavior must not
change merely because a model becomes large.

### NFR-18 — Performance transparency

UMF must not hide pathological processing requirements. Global resolution,
graph traversal, inference, and expensive semantic analysis must be distinguishable
from simple local validation.

### NFR-19 — No mandatory global inference

Basic processing must not require a universal reasoning engine. Extensions may
define inference semantics; consumers that do not implement them must still be
able to preserve those extensions faithfully.

## Validation and Diagnostic Integrity

### NFR-20 — Clear validation boundaries

Implementations must distinguish syntax, structure, reference, semantic,
extension, and target-compatibility validity. These must not collapse into a
single opaque “invalid schema” result.

### NFR-21 — Precise diagnostics

Errors and warnings must identify the affected schema element, semantic rule,
responsible extension, severity, and attempted operation. Diagnostics should
be machine-readable. Core-only failures must identify their core responsibility
rather than fabricate an extension owner.

### NFR-22 — Explicit strictness

Implementations must make strict, permissive, and best-effort operation modes
clear. Best-effort transformations must not masquerade as lossless operations.

### NFR-23 — No silent coercion

Processors must not silently alter meaning to fit a target. Type widening or
narrowing, nullability changes, constraint removal, identity changes, union
collapse, and relationship flattening must be explicit and diagnosable.

### NFR-24 — Semantic comparison over textual comparison

Compatibility, evolution, and round-trip testing must evaluate semantic meaning
where native semantics permit. Formatting and serialization must not dominate
correctness.

### NFR-25 — Preserve native escape hatches

UMF must preserve arbitrary vendor extensions, annotations, options, custom
keywords, and metadata allowed by a supported native system. Support includes
the system's extensibility mechanism, not just its standard vocabulary.

## Reproducibility and Review

### NFR-26 — Reproducibility

A transformation must be reproducible from source artifacts, UMF versions,
extension versions, translator versions, and configuration. Results must not
depend on undeclared local state.

### NFR-27 — Provenance retention

Generated or transformed constructs should retain enough provenance to identify
their origin where feasible. A consumer should be able to establish why a
construct exists and which native construct produced it.

### NFR-28 — Diffability

Artifacts must support meaningful source-control review. Changes to unrelated
semantic regions should not cause widespread representational churn.
Canonicalization should minimize meaningless diffs.

### NFR-29 — Mergeability

Independent changes to unrelated elements should be reasonably mergeable.
Representation should avoid unnecessary positional or ordering dependencies.

### NFR-30 — Human inspectability

Generated artifacts should remain understandable for debugging and review.
Critical semantics must not be hidden exclusively in opaque encoded blobs.

### NFR-31 — Machine fidelity over human elegance

When readability conflicts with lossless preservation, semantic fidelity wins.
An awkward native extension representation is preferable to a readable but
lossy abstraction.

## Security and Resource Boundaries

### NFR-32 — Security

Processing must not imply execution of embedded code. Schemas and extensions
should be treated as untrusted input. Validation, translation, and inspection
must not require arbitrary code execution supplied by the artifact.

### NFR-33 — Resource safety

Malicious or pathological schemas must not trivially cause uncontrolled recursion,
unbounded expansion, reference-based denial of service, excessive memory use,
or arbitrary network traversal. Implementations must be able to impose limits.

### NFR-34 — No hidden authority

Artifacts must explicitly identify authoritative semantics. Tool defaults must
not silently override declared artifact or extension semantics.

## Composability and Conformance

### NFR-35 — Tool composability

Different tools must be able to perform import, validation, enrichment,
comparison, transformation, and export in one pipeline without owning its
entire lifecycle.

### NFR-36 — Programmatic accessibility

All meaningful operations and diagnostics must be accessible programmatically.
No essential capability should exist only through an interactive user interface.

### NFR-37 — Automation friendliness

UMF must work in source control, continuous integration and delivery, code
generation, schema registries, build systems, data pipelines, and agent-driven
workflows. Deterministic transforms must not require interactive intervention.

### NFR-38 — Testability

Every extension or translator semantic claim should be expressible as an
executable test. Conformance testing must be straightforward in the architecture,
rather than exceptional.

### NFR-39 — Specification authority

Reference implementation behavior must not become normative merely because
one implementation exhibits it. Normative behavior belongs in the specification
and conformance suite.

### NFR-40 — Graceful partial support

Implementations must be able to distinguish what they understand, preserve,
cannot interpret, and cannot safely operate on. Partial support must be explicit
rather than all-or-nothing.

## Core Evolution and Ecosystem Durability

### NFR-41 — Stable evolution of core

Core should evolve conservatively. New core semantics must demonstrate clear
cross-system value and must not force unrelated extensions to migrate unnecessarily.
FR-3 ideal admission and FR-28 native-equivalence graduation have separate gates;
defining an ideal does not require equal native meanings or permit removal of refinements.

### NFR-42 — Semantic orthogonality

Cross-cutting concepts should remain separable where possible. Identity,
authority, storage, quality, lineage, and security should not become inseparable
merely because one source system combines them.

### NFR-43 — No privileged ecosystems

No external system should become UMF's hidden canonical worldview. Every
supported native ecosystem is a peer at the interchange boundary.

### NFR-44 — Preserve disagreement

When extensions model the same concept differently, UMF must retain both
representations. It must not fabricate equivalence to create a cleaner unified model.

### NFR-45 — Observable normalization

Promotion of native semantics into shared core semantics must be visible and
reproducible. Consumers must distinguish imported native, normalized common,
derived, and generated target semantics. Author-defined ideals and classified native
observations must also remain distinguishable; FR-3 admission does not silently
normalize native meaning or satisfy FR-28 equivalence graduation.

### NFR-46 — Minimal mandatory core

The minimum conforming implementation should remain small enough for realistic
third-party adoption. Universality must not require implementing an enormous
platform before participating.

### NFR-47 — Specification before optimization

Optimizations must preserve defined semantics. Caching, indexing, lazy resolution,
normalization, and compilation strategies must not change observable meaning.

### NFR-48 — Ecosystem independence

Artifacts must remain usable if a project, vendor, translator, or implementation
disappears. Interchange semantics should outlast individual tools.

### NFR-49 — Licensing and adoption

The specification, schemas, conformance tests, and extension mechanism must be
usable by third-party and commercial implementations without dependence on a
proprietary runtime. Independent implementation should be possible. This
requirement does not select or assert an existing license.

### NFR-50 — Architectural boundary

UMF must remain an interchange and semantic representation layer, resisting
unrelated responsibilities such as query execution, storage services, workflow
orchestration, application runtime, and general-purpose inference. Those belong
in consuming systems such as TableSpec or Axon, whose identities remain to be
confirmed. Describing storage or inference semantics does not require executing
the storage or inference system.

The scope test is: does the capability describe or transform meaning, or execute
the business system? The latter generally belongs outside UMF.

## Verification Sketches

Each row names observable evidence for one constraint. Quantitative budgets
remain open where the owner supplied no latency, memory, scale, or complexity
threshold; the document does not invent them.

| Requirement | Verification Sketch |
| --- | --- |
| NFR-1 | Validate old artifacts against compatible releases; detect declared breaking changes mechanically and repeat supported migrations. |
| NFR-2 | Rewrite newer unknown fields during an operation independent of them; verify preservation and tolerance. |
| NFR-3 | Edit a known element and compare untouched unknown content; separately exercise explicitly authorized removal. |
| NFR-4 | Repeat each listed operation with equivalent input and varied order, environment, and timing; compare semantic outcomes. |
| NFR-5 | Relocate, reorder, reformat, and load in different tools; verify stable concept identities. |
| NFR-6 | Resolve modular, versioned references repeatedly; ambiguous candidates must fail rather than select a guess. |
| NFR-7 | Add a native vocabulary without changing unrelated semantics or requiring a core revision. |
| NFR-8 | Combine conflicting vocabularies; require visible conflicts and declared interaction semantics. |
| NFR-9 | Combine identically named concepts from independent vocabularies; verify distinct identities. |
| NFR-10 | Evaluate identical construct names under incompatible declared versions; reject silent substitution. |
| NFR-11 | Process a self-contained package with the network unavailable; compare meaning and outcomes with online execution. |
| NFR-12 | Exchange artifacts across independently supported platforms; verify equivalent meaning. |
| NFR-13 | Review normative clauses for architecture dependence and exercise independent implementations. |
| NFR-14 | Implement core examples in different host languages without importing another language's object model. |
| NFR-15 | Run a declared minimal implementation with only selected vocabularies and translators installed. |
| NFR-16 | Process independent modules incrementally; measure required loading against semantic dependency scope. |
| NFR-17 | Exercise single-schema, hundreds-of-schema, catalog, and generated workloads; compare semantic behavior across scale. |
| NFR-18 | Inspect operation classifications and measured dependency behavior for local versus global work. |
| NFR-19 | Disable inference capabilities; basic operations and preservation of inference vocabularies must remain possible. |
| NFR-20 | Use failures at all six validity layers and verify distinguishable diagnoses. |
| NFR-21 | Trigger errors and warnings; inspect element, rule, owner, severity, operation, and machine-readable access. |
| NFR-22 | Exercise each declared strictness mode against a lossy conversion; reported fidelity must match actual behavior. |
| NFR-23 | Exercise each listed coercion; verify explicit, attributable diagnostics instead of silent conversion. |
| NFR-24 | Compare formatting-only differences and true native semantic changes; correctness must distinguish them. |
| NFR-25 | Round-trip arbitrary native extension points alongside standard constructs. |
| NFR-26 | Replay a transform from its declared artifacts, versions, and configuration in a fresh environment. |
| NFR-27 | Trace generated and transformed elements to available native sources and transformation origins. |
| NFR-28 | Edit one semantic region and inspect source-control changes for unrelated churn. |
| NFR-29 | Merge independent edits to unrelated elements and check preservation and semantic consistency. |
| NFR-30 | Inspect representative generated artifacts; critical meaning must be accessible beyond opaque payloads. |
| NFR-31 | Compare a readable lossy mapping with a faithful native representation; retain the faithful semantics. |
| NFR-32 | Process artifacts containing code-like input without executing artifact-supplied code. |
| NFR-33 | Test cyclic references, expansion, oversized input, and network traversal against explicit processing limits. |
| NFR-34 | Supply tool defaults conflicting with artifact authority; verify no silent override. |
| NFR-35 | Compose operations from independent tools; verify semantic continuity across each boundary. |
| NFR-36 | Invoke meaningful operations and obtain diagnostics without an interactive interface. |
| NFR-37 | Run deterministic workflows unattended in an automation environment. |
| NFR-38 | Map semantic claims to executable positive and negative cases; identify claims lacking a test. |
| NFR-39 | Introduce reference-implementation behavior absent from the spec; do not treat it as normative conformance. |
| NFR-40 | Exercise understood, preserved-only, uninterpretable, and unsafe-operation cases with explicit outcomes. |
| NFR-41 | Evaluate a core promotion's cross-system evidence and migration impact on unrelated extensions. |
| NFR-42 | Compose identity, authority, storage, quality, lineage, and security independently where semantics permit. |
| NFR-43 | Review mappings across dissimilar ecosystems for assumptions that privilege one native worldview. |
| NFR-44 | Retain conflicting representations without reporting fabricated equivalence. |
| NFR-45 | Repeat normalization and distinguish imported, normalized, derived, and generated origins. |
| NFR-46 | Assess a minimal conforming implementation against an agreed adoption/complexity budget. |
| NFR-47 | Compare optimized and unoptimized executions against the same normative semantic cases. |
| NFR-48 | Recover documented artifact meaning with an independent consumer after the original tool is unavailable. |
| NFR-49 | Check distribution terms for independent third-party and commercial implementation without a proprietary runtime. |
| NFR-50 | Review proposed capabilities for representation/transformation versus business-system execution. |

## Interpretation Boundaries and Open Decisions

- **Unknown content after edits:** NFR-2 allows tolerance when unknown semantics
  are unnecessary for the operation; NFR-40 requires an explicit inability to
  act safely otherwise. Retaining bytes alone cannot justify semantic-safety claims.
  Specification maintainers must define dependency-sensitive operation behavior.
- **References and offline work:** NFR-6 requires deterministic resolution;
  NFR-11 permits packaged dependencies. Missing or ambiguous inputs must not
  invite hidden network guesses. Maintainers must define resolution and
  completeness criteria in contracts.
- **Native identity versus portable identity:** NFR-5 does not authorize erasing
  source location or ordering when it has native meaning. Integration authors
  must define preservation and identity mappings for those cases.
- **Inspectable fidelity:** NFR-30 forbids hiding critical semantics exclusively
  in opaque blobs; NFR-31 accepts awkward faithful representations. Neither
  authorizes replacing semantic support with opaque source storage alone.
- **Conflicting representations:** NFR-8 and NFR-44 require retaining and
  diagnosing disagreement. They do not require a target to execute contradictory
  semantics or authorize a consumer to fabricate an equivalence.
- **Limits and determinism:** NFR-33 allows explicit processing limits. Hitting
  a limit must not masquerade as successful complete validation or translation.
  Maintainers must define reproducible limit outcomes and configuration scope.
- **Measurement budgets:** Product and implementation owners must agree corpus
  sizes, memory/latency budgets, acceptable diff churn, and minimal-implementation
  scope before making quantitative scale or performance claims.
- **Licensing:** The project owner must select distribution terms consistent
  with NFR-49; no license is chosen by this document.

## Review Status

All 50 supplied constraints retain their numbered identities. The requirements
are captured as a draft with verification sketches. Runtime and architecture
direction now live in the architecture and ADR-002; this document preserves
implementation-neutral constraints. Exact serialization contracts and licensing
remain unresolved. Feature/story allocation,
formal conformance rules, security test cases, and executable evidence remain
downstream work. [Project Concerns](concerns.md) carries these constraints into
that work without duplicating their normative text.
