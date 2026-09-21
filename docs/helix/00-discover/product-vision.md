---
ddx:
  id: umf.product-vision
  type: product-vision
  activity: discover
  status: draft
  authoring:
    home: repo
  links: []
---

# UMF Product Vision

## Mission Statement

UMF gives builders of complex data systems a machine-readable metamodel for data whose shapes vary, evolve, or are only partly understood. Tools use that model to inspect, transform, explain, and generate useful representations while preserving native meaning across storage and compute systems.

## Positioning

For engineers building data platforms, application programming interfaces (APIs), and knowledge-based applications, UMF provides a programmatically accessible representation for schemas, contracts, models, ontologies, and physical data definitions. The same metadata supports transforms, visualization, pipeline and validator generation, dynamic forms, AI-agent context, and human understanding.

Hand-maintained copies and pairwise converters make each integration responsible for reconciling meaning. UMF makes semantic preservation and translation fidelity shared, testable capabilities while allowing each system to retain its own semantic model.

## Vision

A schema enters the ecosystem once and becomes usable by multiple tools without each reconstructing its meaning. As data becomes better understood or new storage and compute systems appear, the metamodel can grow without discarding earlier or unfamiliar semantics. Native representations coexist without being forced into one worldview.

The intended full superset spans core plus composable extensions: competing shapes and meanings remain expressible, including concepts absent from today's core. It is an extensibility obligation, not a claim that unknown future systems are already understood or implemented.

The product promise has two distinct parts:

- **Same-system round trip:** `S → UMF → S` preserves native meaning. Semantic equivalence is the quality bar; identical source formatting is a separate question.
- **Cross-system translation:** `S → UMF → T` maps concepts wherever valid equivalence exists, retains meaning the target cannot express, and explicitly reports approximation, incompatibility, and unsupported concepts. Retained information does not imply target support.

Universality comes through extensibility. A deliberately small core defines useful UMF ideals as well as concepts with demonstrated native equivalence. Versioned extension vocabularies preserve system-specific meaning and carry defined schemas, validation rules, translators, and fidelity guarantees. A consumer uses what it understands and preserves the rest.

Preserve native semantics first. UMF may define an ideal before any native system matches it: its meaning, counterexamples, qualified projections and retained native refinements must be explicit. Admitting an ideal does not replace a native concept. Only demonstrated bidirectional equivalence, with migration and rollback, can justify that separate replacement claim. The ordered next ideals are field, nullability, cardinality, author-stated facets and key.

**North Star:** Teams drive multiple tools from one durable model across their chosen systems, with every declared supported round trip backed by semantic evidence and every interpretation or translation limit visible.

## User Experience

A platform engineer combines a table schema, a service schema, and a domain model in UMF. A visualization tool reads relationships, a pipeline generator reads source/target bindings, and a validator generator reads understood constraints. A form builder extracts fields and labels; an AI agent and a human documentation tool obtain focused metadata with definitions, provenance, and interpretation limits.

The translation reports which concepts are preserved exactly, mapped equivalently, approximated, retained but not expressible in the target, incompatible, or unsupported. The engineer can inspect the limitations before adopting the output. Meaning that cannot be expressed in the graph remains available in the UMF asset for a return to the source ecosystem.

An unfamiliar extension remains intact while tools use the portions they understand. The engineer later adds support for a new storage shape and checks native round trips without reconstructing the whole model. Generated outputs do not imply enforcement of unknown constraints. This scenario describes intended behavior, not delivered integrations.

## Target Market

| Attribute | Description |
| --- | --- |
| Who | Data platform, API platform, and knowledge engineering teams building complex applications and metadata-driven tooling across multiple systems. The owner reports this need; wider audience validation remains pending. |
| Pain | Tools repeatedly reinterpret evolving, partly understood data shapes; separate definitions drift and hide semantic limits. |
| Current Solution | Separate native definitions, manual reconciliation, and pairwise importers or converters. These alternatives are a working hypothesis pending user research. |
| Why They Switch | They need to add representations while retaining native semantics and being able to inspect conversion limits. |

## Key Value Propositions

| Value Proposition | Customer Benefit |
| --- | --- |
| Native semantic fidelity | Teams can return to a source ecosystem without reconstructing lost meaning. |
| Accountable translation | Teams can distinguish usable equivalence from approximation and make informed adoption decisions. |
| Extensible vocabularies | New systems can participate without reducing their concepts to whatever the core already understands. |
| Durable schema assets | Structural, API, graph, ontology, and governance meanings can travel together as tools change. |
| Programmatic metadata reuse | Generators, visualizers, forms, agents and humans obtain the relevant meaning without rebuilding native interpretations independently. |

## Success Definition

These are proposed strategic measures, not achieved results. Review them over the first 12–24 months of product use; delivery dates and adoption targets remain to be agreed.

| Measure | Desired Outcome and Evidence |
| --- | --- |
| Native fidelity | Every declared supported integration passes executable semantic round-trip checks against real native schemas; a published compatibility matrix exposes scope and gaps. |
| Translation accountability | Every known unsupported, incompatible, approximated, or target-inexpressible concept in the evaluation corpus is identified in machine-readable diagnostics; zero silent losses in that corpus. |
| Reuse | Demonstrate transforms, visualization, pipeline and validator generation, forms, agent context, and human documentation consuming the same model; compare outputs and trace them to source metadata. |
| Extension independence | Demonstrate a new semantic vocabulary preserving its native concepts without changing core meaning; verify through extension validation and round-trip evidence. |

Passing a fixture corpus supports a bounded compatibility claim; it does not prove fidelity for every possible native schema. The support boundary and semantic equivalence criteria require further definition.

## Why Now

The founder reports a recurring need to build complex systems over data whose shapes are not fully understood in advance. Extracting the schema concept from TableSpec into a broader metamodel supports those tools while making preservation across semantic systems foundational.

This is the project trigger, not evidence of broad market demand. [Competitive research](competitive-analysis.md) documents existing approaches; TableSpec inspection, comparative execution, and audience validation remain pending. Initial interoperability and early domain-model work must establish fidelity before broader claims.

## Review Checklist

- [x] Mission identifies the user, problem, and approach.
- [x] Positioning names a concrete alternative and marks audience assumptions.
- [x] Vision separates native round trips from cross-system translation.
- [x] User experience gives a concrete intended workflow.
- [x] Success measures name observable outcomes and evidence.
- [x] Detailed capabilities and technology direction are retained in discovery notes.
- [ ] Validate the audience, alternatives, and switching trigger with prospective users.
- [ ] Research prior art and inspect tablespec before treating differentiation as established.
- [ ] Agree the measurement horizon, support boundaries, and semantic equivalence criteria.
