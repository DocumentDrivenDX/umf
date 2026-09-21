---
ddx:
  id: FEAT-002
  type: feature-specification
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.prd
      kind: informed_by
---

# FEAT-002: Native schema interchange

**Priority:** P0. **Subsystem:** Native fidelity. **PRD:** FR-1/5/6/12/37/39/41.

## Problem and Outcome

Developers need to inspect and modify schemas programmatically without flattening
native meaning. Import a native schema into an editable extension representation,
retain native scope and unknown content, and export with explicit limitations.
JSON Schema is the first implementation; subsequent languages require their own
contracts and independent evidence.

## Requirements

- NAT-01: Preserve every native value in the declared representation, including
  numeric domains outside JavaScript's exact range and uninterpreted content.
- NAT-02: Retain resource identities and reference scope without implicit fetches.
- NAT-03: Expose copied metadata and atomic edits governed by interpretation status.
- NAT-04: Verify native expected behavior independently before and after round trip.
  Publish versions, subsets and validator failures rather than a universal claim.

## Stories and Dependencies

[US-002](../user-stories/US-002-json-schema-round-trip.md) covers Draft 2020-12.
FEAT-001 provides versioned extension participation; CONTRACT-002 defines the first
native surface. NFR preservation, diagnostics and browser constraints apply.

## Success and Boundaries

All declared corpus schemas survive and every case has independent expected-vector
evidence. Unknown content remains accessible with incomplete interpretation.
Cross-system lowering, other dialects, generators and promotion into core remain
separate work. Structural similarity alone cannot justify promotion.

[US-019](../user-stories/US-019-parquet.md) begins the Parquet extension with authoritative
binary sources. Complete metadata/type models and transformations remain pending; exact
source capture alone does not satisfy NAT-03 or establish full native interchange.

[US-020](../user-stories/US-020-iceberg-schema.md) adds standalone Iceberg schema preservation,
field-identity checks and copied edits. Native/browser evidence is bounded; full table context,
upstream corpora and cross-system transformations remain separate acceptance work.

[US-021](../user-stories/US-021-iceberg-table.md) adds surrounding Iceberg table metadata,
exact counters and copied candidates, with full reference/evolution semantics still pending.


[US-022](../user-stories/US-022-dbt-manifest.md) starts the dbt cycle with native manifest
preservation, independent artifact/parser evidence and copied description edits. Source-project
interchange, other artifacts and graph-aware transformations remain separate required work.


[US-023](../user-stories/US-023-odcs.md) adds ODCS contract preservation, copied metadata edits
and qualified native/browser corpus evidence. Quality/SLA execution and physical projections
remain required semantic work beyond the source-contract package.


[US-024](../user-stories/US-024-linkml.md) introduces LinkML source interchange with explicit
metamodel selection and qualified native normalization/rejection evidence. Induced-model,
instance-validation and generator/projection semantics remain required work.

[US-025](../user-stories/US-025-rdf.md) starts RDF dataset interchange with N-Quads, scoped blank
nodes, lexical literals and copied quad edits. OWL/SHACL execution and other RDF syntaxes remain
separate semantics and required follow-up work.


[US-026](../user-stories/US-026-jsonld.md) adds exact JSON-LD source/context preservation and
explicit expansion proposals, with pinned official, native and browser evidence. Other JSON-LD
algorithms and the documented processor gaps remain required implementation work.

[US-028](../user-stories/US-028-shacl.md) adds SHACL shapes-graph interchange and path
interpretation. Target/constraint execution, official report comparison and consumer
projections remain required; source preservation alone does not satisfy the full story.

[US-029](../user-stories/US-029-owl.md) inventories OWL graph interchange, structural
axioms, serializations, profiles, reasoning and consumer projections. Initial evidence
covers Turtle graph recovery and declared headers only; the full story remains open.
