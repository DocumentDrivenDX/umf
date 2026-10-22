---
ddx:
  id: umf.plan.artifact-collections
  authoring:
    home: repo
  links:
    - id: CONTRACT-052
      kind: references
    - id: CONTRACT-060
      kind: references
---

# Artifact collections implementation and release plan

Add optional versioned `artifact_collections` metadata to domain packs. Artifacts
represent source resources, with original-versus-derived meaning retained in source provenance; Tables represent structured projections;
Ontology represents concepts/relationships. Semantic kind, media type and byte
encoding remain distinct. Documents and Imaging are authored browser views,
not exhaustive/disjoint artifact types. PACS remains a source/service boundary.
UMF schema-envelope Document remains distinct from source artifacts.

Each collection declares id, title, version 1.0.0, view documents/imaging/other,
semantic_kinds, source_ids, description, optional media_types,
metadata_schema_ids, derived_schema_ids, ontology_schema_ids and an optional
loader_inventory_source_id. Optional identity/grouping descriptions and fields
are metadata assertions, never automatically verified corpus keys. References
must resolve within the pack. Duplicate collection/source/schema references
refuse. Metadata schemas must be tablespec; ontology schemas must be UMF.
Unknown extension annotations remain preserved. No remote fetch, source-byte
parsing, model processing, storage execution or redistribution is authorized.
Existing packs without collections retain their behavior.

Author collections for court/SEC demos, appellate, public-company, mixed legal
and medical imaging packs. Originals, licenses, original source checksums and
projection losses remain authoritative; JSON API snapshots are explicitly
structured-data artifacts, not falsely labeled narrative filings. Collection
metadata must not claim unavailable files exist or that a partial series is a
complete study. Update deterministic builders and medical family hash closure.
Source-only Supreme Court tools remain a consumer, not a fake schema pack.

Browser: add Artifacts alongside Tables and Ontology, collection routes and
search, authored Documents/Imaging/Other views, rights/fixity/provenance summaries,
source references and metadata/projection/ontology navigation. Reference-only or
unavailable artifacts have no download link. Collection inspection never loads
corpus bytes automatically. Existing schema and pack links remain valid.

Tests: schema/profile admission and malformed references, competing/unknown
annotations, actual pack declarations and deterministic builder checks; real
Chromium navigation/search and source-link safety across court and imaging.
Review the plan with Astra ultra before implementation and final diffs/evidence
before release. Publish schema resources, Python package containing those resources,
source tools and microsite; no generated ZIP release assets. Record exact versions
and qualified evidence. Live PACS, pixel decoding and Databricks remain unclaimed.

Release versions: affected legal/appellate/company/demo pack manifests receive
minor versions; all medical family members advance together to 1.2.0 so component
versions and checksum closure remain coherent. Native source byte hashes and
core envelope versions stay unchanged. Python 0.8.2 packages the additive schema
resources, with structural validation only; TypeScript pack inspection additionally
checks reference integrity. Corpus revisions remain distinct from pack revisions.
