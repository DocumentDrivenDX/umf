---
ddx:
  id: TD-020
  type: technical-design
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: US-020
      kind: informed_by
    - id: CONTRACT-020
      kind: informed_by
    - id: umf.architecture
      kind: informed_by
    - id: ADR-002
      kind: informed_by
---

# TD-020: Iceberg schema preservation

**Story:** US-020. **Feature:** FEAT-002. **Architecture:** umf.architecture.

## Scope and Technical Approach

Realize AC1–3 through the shared exact-JSON model and a dedicated Iceberg registry validator.
Use the pinned native specification for shape/identity rules and PyIceberg for independent
parsing/re-emission evidence. Native Pydantic models normalize defaults and discard unknown
content, so they are test oracles rather than the authoritative representation.

## Component and Data Changes

spec/extensions/iceberg contains generated source grammar, payload schema and package metadata.
src/adapters/iceberg imports exact tokens, validates known shapes, tracks global field IDs and
required-struct ancestry, and offers copied pointer edits. It checks only exactly representable
int32 identity values; large default values stay in NativeJson tokens. A JSON-derived view is
used for known shape/identity checks, never to reconstruct defaults or native output.

Unknown extension representation fields follow existing conservative export rules. Unknown
native fields/types remain data with interpretation warnings. No existing core meaning changes;
Iceberg identifier semantics remain extension-owned. No data migration is required.

## Interfaces and Integration

CONTRACT-020 owns exact fields, APIs, errors and compatibility. Registry integration uses the
existing envelope and validation mechanisms. PyIceberg 0.11.0 is development-only; TypeScript,
Bun and browser builds use no new runtime dependency. A missing native oracle fails conformance
rather than silently substituting UMF's own interpretation.

## Security and Performance

Inputs inherit core bounded text/depth/value counts. No expression evaluation, remote loading,
user class deserialization or data-file reads occur. Pointer access and edits copy JSON data;
unknown representation content blocks export. This profile makes no throughput guarantee.

## Testing

scripts/iceberg-fixtures.py records authored inputs and independent native observations;
iceberg-roundtrip.ts exercises both UMF formats and a nested edit; iceberg-oracle.py compares
native results before/after. Tests cover source/unknown retention, IDs, nullability ancestry,
copy isolation and atomic failure. iceberg-browser.ts repeats the corpus and edit in Chromium.
Future upstream/native evolution tests must extend evidence before support claims expand.

## Migration, Sequence and Risks

The package is additive and experimental. Its stored source can be exported through the same
pinned adapter; unknown representation upgrades block downgrade rather than lose content.
Implement schema preservation first, then upstream corpora/table context, dependency-aware
edits, partition/sort specs and cross-system transforms. Those later steps remain incomplete.
Native library permissiveness, version-specific defaults and geospatial/future semantics are
explicit risks; the contract separates preservation, consistency and native acceptance.

AC4 keeps full pinned upstream resources and extracts only exact-node schema fragments by
source pointer. Manifest byte hashes guard source integrity; separate canonical hashes report
seven distinct schemas across 21 occurrences without removing their enclosing contexts. The
corpus driver emits both UMF-format exports and candidate first-field renames. Java's
SchemaParser and Python's Schema independently compare native re-emissions; Java additionally
checks that only the expected name changes in its normalized schema. The malformed missing-type
case records the Java/Python disagreement. No adapter relaxation or native default insertion
follows from a permissive parser. Native Java classes/dependencies build under .cache and are
never included in the browser package.
