---
ddx:
  id: US-017
  type: user-stories
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-002
      kind: informed_by
---

# US-017: Preserve and edit Spark schema JSON

**Feature:** FEAT-002. **PRD:** FR-1/5/6/12/39/41. **Priority:** P0.

As a schema author, I want Spark DataType/StructType metadata available to browser
consumers without losing exact numeric metadata, unknown properties, field ordering,
collation declarations or runtime-specific meanings.

- **US-017-AC1:** Struct, array, map and atomic schema sources survive native JSON and
  UMF JSON/YAML round trips. Missing required array/map nullability properties fail
  known shape validation. Field nullable/metadata defaults remain absent unless supplied.
- **US-017-AC2:** Exact numeric tokens, unknown properties/types, duplicate names and
  UDT declarations remain authoritative data. No class import or executable-content
  deserialization occurs. Unknown UMF representation fields survive UMF but block native
  export. Native-engine validity remains explicitly incomplete.
- **US-017-AC3:** Pointer access returns copies. Candidate edits are atomic and preserve
  source, validate known shapes, and report uninterpreted metadata/name dependencies.
  Both pinned native runtimes must observe an authored nested type edit.
- **US-017-AC4:** Both Spark/PySpark 4.0.1 native outcomes remain equivalent before/after
  round trip, including rejected cases. Browser evidence covers the public corpus and
  edits without host globals. Python success cannot imply JVM/configuration validity.

- **US-017-AC5:** Field rename selects actual fields by position and rewrites only
  their resolvable field-local collation paths through array/map types. Child structs
  retain independent maps. Unresolved paths and empty collated names block; other
  metadata remains exact with explicit reference uncertainty. Native Python/JVM and
  browser checks verify authored successful cases and loss-prevention guards.

Upstream corpus, full engine-semantic validation, DDL/Connect/catalog interchange,
data coercion, UDT execution and cross-system transforms remain separate required work.

- **US-017-AC6:** Spark-to-Arrow schema projection takes explicit timestamp, large-type,
  duplicate-name and loss policies. It retains the exact source, reports target-only
  losses, and blocks unknown type/property and UDT lowering. Strict mode blocks any
  reported semantic loss or representation change. Browser outputs must match the
  native reference matrix, and encoded targets must pass independent native reads and
  both timestamp-recovery modes. This does not claim data conversion.

- **US-017-AC7:** Arrow-to-Spark schema projection preserves the source independently of
  target recovery, requires timestamp and variant interpretation choices, reports lost
  physical metadata and widened nested nullability, and blocks unsupported/unknown
  shapes. Both timestamp choices must match native reference recoveries in Bun/browser;
  resulting schemas must reparse identically in native Python and JVM Spark.
