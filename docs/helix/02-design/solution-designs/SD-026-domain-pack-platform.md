---
ddx:
  id: SD-026
  type: solution-design
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-009
      kind: informed_by
    - id: CONTRACT-052
      kind: informed_by
    - id: umf.architecture
      kind: informed_by
---

# SD-026: Domain packs for tables and ontologies

## Scope and Authority

FR-45 and FEAT-009 govern portable schemas and declarative tooling references.
Legal and medical are delivered baselines. This slice builds the other fourteen
packs: commerce, supply-chain, cybersecurity, manufacturing, payments, education,
transit, real-estate, energy, HR, MarTech, construction, ecology and archaeology.
Preserve existing feature/story identities and their desired outcomes. Ontology
schemas are UMF-owned content. Truss/Ashlar own graph storage and execution;
TableSpec owns tabular datasets and engine ingestion. UMF must not disclaim
ontology schema authoring merely because a consumer stores it as a graph.

## Approach

Each new pack supplies independently authored domain tables, typed relationships,
a UMF ontology document and a bounded fabricated scenario corpus. The ontology
uses core records/properties/keys/relationships where their meanings apply; native
OWL/SHACL artifacts use the existing adapters when needed. Neither property-graph
schemas nor relational foreign keys assert OWL entailment. Target declarations
separate tabular and graph artifacts and make unsupported execution explicit.
No new universal business ontology or mandatory DDD vocabulary is introduced.

Reuse CONTRACT-052 1.0.0. Add a separately versioned execution profile for
capabilities, scenarios, source inclusion and fixture expansion; unknown profile
versions refuse execution. Structural extension admission alone is insufficient.
Preserve opaque unknown content. Fixed medical fixtures remain fixed; do not
synthesize absent official records. New synthetic fixtures are clearly labeled,
with pinned local bytes and no claim of population or scientific realism.

The first scaling mode replicates independent, reviewed scenario components
with deterministic namespaced identities and remapped foreign keys. It preserves
scenario values and ground truth, not prevalence, network realism or free-form
clinical simulation. Small/demo/large declare component counts and measured row
counts. Templates, generator version, seed and configuration identify a replay.
A trusted TableSpec implementation uses the existing ImportedDataset/GeneratedDataset
spool, validation, archive and SQL sinks; no independent CSV writer/loader runtime.
A graph projection emits typed objects and edges from the same source identities,
retaining assertions, unresolved references, source literals and scenario labels.
Graph output is portable data, not evidence that Truss/Ashlar ingestion executed.

## Domain Semantics

Every pack includes its conceptual inventory and a concrete query with independent
expected identities/values and a negative control. Amounts and measurements retain
exact decimal representation; missing/censored/unknown remain distinguishable.
Time literals preserve precision and source conventions. Identity crosswalks and
attributable assertions are records rather than guessed identity merges.
Ecology preserves method/unit/effort, censoring, taxonomy and directed reach links.
Archaeology preserves contexts, samples, analyses, uncertain dating, conflicting
interpretations and evidence assets. Synthetic media assets demonstrate integrity
and association; public Madaba Plains records remain reference-only until selected
item-level evidence is pinned. Existing source summaries state this boundary.

## Shared Tool Changes

1. Enforce local identity closure, unique schema IDs, source bindings, references,
   and required consumer capabilities. Validate canonical metadata in explorer.
2. Permit mixed schema targets in packs: tabular ingestion selects explicitly
   declared TableSpec artifacts, graph tooling selects core UMF ontology artifacts.
3. Reuse medical checksum/source bundling; compare included artifacts as bytes.
   Bound media size and ensure realpath containment for all local artifacts.
4. Add trusted scenario-component expansion to TableSpec and a portable graph
   export using existing UMF schema identities; arbitrary supplied code never runs.
5. Generalize explorer discovery/rendering: all packs, ontology record/property/
   relationship navigation, target labels, qualification and downloads. No per-pack UI.
6. Execute small corpora for every pack, replay/scale checks, typed ZIP readback,
   local engine ingestion, graph schema/reference checks and browser navigation.

## Implementation Sequence and Evidence

Astra ultra reviews this plan before build. Resolve its material findings in
contracts, TDs and STPs. Implement shared profile and tests first, then author
packs in bounded groups. Domain schemas and fixtures need domain-specific assertions,
not merely identical CRUD structures. Run focused tests while developing, then
all-pack tests, type checks, canonical audits and Chromium explorer checks. Publish
scoped evidence and catalog membership. Broader repository failures are reported
separately; no full conformance, live warehouse, ontology reasoning or graph-storage
claim is inferred from metadata or browser admission. Review final changes again.

## Risks and Open Decisions

A component-replay scale is deliberately limited and must be labeled in explorer
and README. A native standard reference is a mapping candidate, not implemented
native conformance. Independent negative scenarios retain source facts and attach
expected discrepancies instead of violating unavoidable structural foreign keys.
Graph target binding must follow existing Truss/Ashlar semantics; avoid a parallel
ontology DSL. Source/media inclusion is opt-in with integrity and rights metadata.
No remote services, credentials or production dataset mutation are required.

## Astra Review Corrections

Initial Astra ultra findings require CONTRACT-053 before implementation. Graph
fixtures use owner-qualified types/fields, exact key tuples, pinned schema bytes
and explicit candidate status. Ashlar/Truss intake acceptance is not delivered by
UMF structural validation; downstream runtime support is unclaimed. Per-story
coverage matrices must distinguish component-count replay from unexercised
independent time/topology/density axes. Each conceptual item and semantic distinction
gets an authored schema/fixture/assertion mapping; generic CRUD checks alone fail
this gate. Archaeology media, uncertain dating and specialist analyses have separate
checks. Medical source inclusion is reused rather than rebuilt.

## Completed First-Release Review

Astra ultra reviewed the plan and implementation. Corrections bind graph companions
to generated archives and complete ontology semantics, pin admitted source/schema
bytes through atomic publication, restore every bounded positive scenario, reify
logical journal/source/evidence identities, and validate per-component semantics.
Final narrow review verifies transit date identity, same-event ecological effort,
last-touch attribution and fixed medical external provenance, with no remaining
material finding in that scope. The first-release evidence is
[domain-pack-catalog.md](../../04-build/evidence/domain-pack-catalog.md). Broader
feature acceptance remains qualified by the explicit AC5/AC7 boundaries.
