---
ddx:
  id: TD-055
  type: technical-design
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: US-055
      kind: informed_by
    - id: umf.architecture
      kind: references
    - id: CONTRACT-052
      kind: references
    - id: ADR-002
      kind: references
---

# TD-055: Source-qualified medical subpacks

## Scope

Implement US-055 under FR-45, CONTRACT-052 and the existing architecture. Preserve
medical 1.0.0 and add independently versioned carrier, epidemiology, imaging and
terminology packs. No new core/extension version is required.

## Technical Approach

Portable TypeScript uses the shared exact native JSON tree to project selected
FHIR R4, CDC aggregate and DICOM JSON fields. Every projection retains original
text. Monetary and numeric tokens remain strings; nested native fragments retain
exact JSON tokens. Source namespaces prevent accidental cross-corpus identity
merges. Reference edges preserve native spelling and resolve only known local keys.

Host-side deterministic generation reads checked-in source files without fetching.
It writes canonical TableSpec schemas, CSV rows, SHA-256 source manifests and
qualification metadata. Official HL7 and CDC examples are separate from UMF-authored
supplements. DICOM binaries are authored synthetic fixtures independently inspected
with pydicom; TCIA remains a source candidate with collection-specific rights.

## Component Changes

Portable projections live in `src/domain-packs/medical.ts`; the public index exports
them. `scripts/build-medical-subpacks.ts` generates four source packs, with a check
mode for stale output. Existing exporter and TableSpec ingestion remain shared.

## API/Interface Design

CONTRACT-052 owns the exact projection and terminology-binding surfaces. Original
resources remain the recovery authority; selected tables are views, not replacements.

## Data Model Changes

Carrier tables distinguish request, response, claim use, ordered lines, monetary
categories and workflow events. Population tables keep counts separate from adjusted
rates. Imaging tables keep native DICOM JSON and binary source identities. Terminology
tables keep exact system/release/code identity, never an inferred crosswalk.

## Integration Points

Existing local pack export feeds TableSpec typed ingestion and archives. Browser
consumers validate and serialize metadata and call the pure projection API.
Truss/Ashlar engine adoption remains separately qualified; no consumer code is changed.

## Security

No source metadata directs execution or downloads. Licensed sources are explicit
caller inputs; release checks precede lookup. Existing exporter checks rights,
checksums, traversal and symlinks. No real patient data or credentials are included.

## Performance

Fixtures are bounded small samples, not throughput benchmarks. Shared native JSON
limits apply. Binary sources stay outside core envelopes and portable projections.

## Testing

STP-055 maps criteria to numeric/reference/suppression/private-tag counterexamples,
regeneration, export, browser and TableSpec archive readback checks.

## Migration & Rollback

Clinical medical 1.0.0 remains readable and byte-stable. New packs have independent
1.0.0 identities. Removing them and their additive projection API rolls back this
slice; no persisted core migration or cross-repository port is required.

## Implementation Sequence

1. Record source revisions, rights and bounded selection; author synthetic gap cases.
2. Implement pure projections, deterministic schemas/rows and source manifests.
3. Run Bun, typechecks, schema audits, actual Chromium and TableSpec readback.
4. Record exact scope and residual gaps; commit source, tests and evidence together.

## Risks

Public examples may not agree financially or resolve references. Retain originals
and unresolved relationships. Public code availability does not grant unrestricted
terminology rights. Source-specific notices and local licensed bindings apply.

## Family integration and public sources

Follow CONTRACT-052 composition metadata and family export. The deterministic
builder adds fixed execution profiles and table-derived ontology schemas to
each subpack, then fingerprints component manifests from Medical's overview.
CMS native CSV excerpts get separate schemas and source lineage without FHIR
conversion or ICD crosswalks. A TCIA object gets a separate source namespace,
recursive metadata views and unchanged binary source. Source qualification is
checked in; regeneration and browser/catalog builds never download sources.

The explorer links family overviews, table/ontology counterparts and pinned
local original/row downloads. Site asset construction uses shared rights/hash
checks. Export preserves one directory per pack and preflights before writes.
Bun rejects stale or escaping members; Chromium exercises direct links, downloads,
search and mobile layout. Independent TableSpec and pydicom checks verify public
CSV cells, local-only joins, recursive DICOM metadata and exact archived originals.
