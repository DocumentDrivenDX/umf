---
ddx:
  id: CONTRACT-061
  authoring:
    home: repo
  links:
    - id: CONTRACT-052
      kind: informed_by
    - id: umf.plan.artifact-collections
      kind: references
---

# Artifact collections 1.0.0

## Purpose and Scope

Optional `artifact_collections` on a domain pack describes source resources
and their relationship to schemas. Original versus derived meaning MUST remain explicit in source provenance and collection descriptions; a collection never upgrades a derivative to an original. It is distinct from UMF envelope Document,
tabular rows, storage objects and live source services such as PACS. No retrieval,
rendering of source bytes, execution, redistribution or corpus-completeness claim.

## Normative Surface

At most 64 collections; each MUST have version `1.0.0`, pack-local unique `id`
(letter followed by letters/digits/underscore/hyphen), nonempty `title`, authored
`view: documents|imaging|other`, nonempty `semantic_kinds` and a required `source_ids` array (empty only with an inventory reference).
Views are navigation hints, not mutually exclusive semantic types. Semantic
kinds are open nonempty strings; media types are independent optional strings.
Each reference list is unique, bounded to 10,000 and contains nonempty strings.
A collection MUST have a source or `loader_inventory_source_id`; inventory-only
collections describe selections, not acquired objects. Source and inventory IDs
MUST resolve to pack sources. Optional `metadata_schema_ids` MUST resolve to
TableSpec schemas; `ontology_schema_ids` MUST resolve to UMF schemas;
`derived_schema_ids` MUST resolve to any declared schemas. Collections MAY
share sources and schemas. Optional description, media_types, identity/grouping
objects are metadata; identity/grouping require description and MAY list fields.
Those fields are assertions, not verified keys. Unknown annotations MUST survive.

## Compatibility and Errors

Existing packs are unchanged when this optional field is absent. Unsupported
versions, malformed lists, duplicate IDs/references and unresolved/wrong-format
references refuse TypeScript pack inspection. Python schema resources perform
structural validation only. Pack metadata changes require fresh loader state.

## Browser and Source Safety

Collections appear under Artifacts with authored Documents/Imaging/Other views.
Source rights, format, hash, provenance, reference and availability remain visible.
Downloads MUST join source IDs to the build's verified asset registry; missing,
remote-only and unavailable sources MUST NOT acquire invented download links.
Navigation MUST NOT fetch original bytes. Source declarations govern over labels.
Derived schemas remain distinct and linked; grouping does not establish a full
DICOM study. Existing pack/schema bookmarks MUST retain aliases after bumps.

## Evidence and Release

See the artifact-collections plan and execution evidence. New schema resources,
source tools, browser and Python wheel/sdist are released; generated ZIPs stay
consumer-local. Live PACS, pixel decoding and Databricks remain unqualified.
