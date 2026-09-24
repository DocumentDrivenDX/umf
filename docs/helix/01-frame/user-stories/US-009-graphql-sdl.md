---
ddx:
  id: US-009
  type: user-stories
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-002
      kind: informed_by
---

# US-009: Preserve and edit native GraphQL schema declarations

As an API model author, I want SDL declarations and their exact original source
available through UMF so metadata consumers and transformations retain API meaning.

- **US-009-AC1:** Authored SDL with definitions, type/schema extensions, directives,
  defaults and descriptions survives JSON/YAML with exact original source and AST.
- **US-009-AC2:** Copied AST access and atomic edits preserve the original; edited
  native export reflects current defaults and reports source-layout differences.
- **US-009-AC3:** Invalid references, duplicate fields, invalid defaults/OneOf and
  executable documents fail. Unknown representation fields block native loss;
  incomplete external behavior prevents conservative edits.
- **US-009-AC4:** Custom scalar numeric literals above JavaScript integer precision
  remain exact AST strings, with unsupported coercion explicitly incomplete.
- **US-009-AC5:** GraphQL-core independently repeats query validation/introspection/
  coercion and edited-default execution, disclosing its shared implementation lineage.
- **US-009-AC6:** Real Chromium executes import, validation, export and AST edits.

CONTRACT-009 bounds this schema profile. Native schema preservation does not
implement custom scalars/directives, field resolvers, federation or remote services.

- **US-009-AC7:** The pinned upstream GitHub schema retains all 540 declarations and
  exact source through JSON/YAML; independent full introspection over 552 types is
  identical, with a changed-output-type negative control.
- **US-009-AC8:** All 48 extracted static grammar cases retain their expected syntax
  outcomes. Twenty-nine valid fragments round-trip only under explicit incomplete
  fragment mode; nineteen syntax errors fail. Standalone schema validity remains
  distinct. The six dynamic exclusions and one Python parser disagreement are recorded.

`tests/graphql/corpus.test.ts` and `scripts/graphql-corpus-oracle.py` provide this
additional evidence. Chromium also checks fragment preservation and incomplete status.
