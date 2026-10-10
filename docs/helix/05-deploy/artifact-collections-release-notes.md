---
ddx:
  id: umf.release.artifact-collections-1.0.0
  authoring:
    home: repo
  links:
    - id: CONTRACT-061
      kind: implements
    - id: umf.evidence.artifact-collections
      kind: evidenced_by
---

# Artifact collections 1.0.0

Domain packs now declare source artifact collections beside their tables and
ontology. The explorer groups them under Artifacts with Documents, Imaging and
Other views, shows source rights/fixity/provenance, and links metadata and derived
schemas. Navigation fetches no corpus bytes. Downloads require verified local
assets and redistribution rights; reference-only objects retain their declarations.

Updated packs: legal 1.2.0; legal-appellate and public-company-intelligence 1.1.0;
court/SEC loader demos 1.1.0; all five medical family packs 1.2.0. Old bookmarks
resolve to current views. Native bytes and loader/preservation versions remain
unchanged. New pack metadata needs fresh loader state.

DICOM originals remain separate from JSON/attribute projections. SEC retained
JSON consists of scoped projections; full API responses remain reference-only,
and narrative originals remain unavailable. No pixel/PACS/Databricks qualification
is added. Unknown annotations remain preserved; unsupported collection versions
refuse interpreted admission. Python validates structure; TypeScript additionally
validates source/schema references.

umf-core 0.8.2 distributes updated canonical schema resources in its wheel and
sdist. The feature release distributes schema, contract and browser ESM alongside
source available at the release tag. Generated ZIP datasets are not distributed.

Validation: 86 domain tests, 43 installed-wheel Python tests, deterministic
builder checks, TypeScript typecheck/build and real Chromium navigation.
