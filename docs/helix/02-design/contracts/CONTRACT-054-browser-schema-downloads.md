---
ddx:
  id: CONTRACT-054
  type: contract
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: CONTRACT-053
      kind: informed_by
    - id: CONTRACT-050
      kind: informed_by
---

# Browser schema downloads

Owner requested broad integration downloads on 2026-10-08. The consumer
profile `umf-browser-scalar-export-1` produces schema scaffolds, not certified
bindings or native equivalence. Supported inputs are TableSpec 1.0 scalar
tables and core record members with resolved scalar, single-valued fields and
explicit required/absent-allowed nullability. Unsupported columns block the
entire export. Identifiers are quoted for SQL; grammar-bound targets reject
unsupported names. Whole-source scope is explicit, including on field pages.

The nine generated targets and mappings are documented in the microsite README.
Unknown decimal precision and timestamp interpretation stay text. Signed 64-bit
integer and double carriers are declared policies, not inferred source bounds.
Core absent-allowed maps to nullable/optional and reports the absence/null
semantic difference. Keys, relationships, constraints, defaults, formats and
extension semantics are not enforced. Every generated bundle contains the
exact source, generated file, profile and limitations. Users review these before
downloading. Outputs never execute. OpenAPI has no invented operations.

Native recovery uses existing adapter exporters and their representation checks;
captured binary bytes are recovery evidence, not native acceptance. Failed
native exports expose error files. Source companions retain other vocabularies
and dependencies; external dependencies are not fetched. Arrow/Parquet recovery
does not imply general schema generation. Runtime acceptance of generated DDL,
custom scalar implementations, and migration policies remain unknown and
outside this bounded browser profile.
