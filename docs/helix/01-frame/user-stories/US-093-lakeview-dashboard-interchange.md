---
ddx:
  id: US-093
  type: user-stories
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-034
      kind: informed_by
    - id: US-077
      kind: informed_by
---

# US-093: Lakeview kinds, core data shapes and original-byte recovery

As a metadata consumer, I want a Lakeview dashboard to expose its declared data
shapes through ordinary UMF Records and Fields while retaining its untouched
original file, so I can inspect it generically without losing native meaning.

## Acceptance Criteria

- **US-093-AC1:** Each committed original `.lvdash.json` is reconstructed byte for
  byte directly and after UMF JSON/YAML serialization. Assertions compare exported
  bytes against bytes read from the original file, without normalization.
- **US-093-AC2:** Generic kind discovery resolves the exact Lakeview dashboard
  identity and attachment scopes. Core selection traverses dataset/query Records
  and their declared Fields using qualified references. The native document has
  no parallel field dictionary or implicit `umf.dashboard` projection.
- **US-093-AC3:** Opaque SQL, undeclared types, native numeric tokens, unknown
  content and representation/interpretation gaps remain preserved and explicit.
  No complete row schema, execution, rendering or native acceptance is inferred.
- **US-093-AC4:** Wrong kinds/scopes, contradictory native/core declarations,
  missing members/references, unknown representation and unqualified edits cannot
  silently return archived bytes. Invalid UTF-8 and duplicate decoded JSON keys
  refuse. Limits abort without a partial result; source content cannot activate
  executable validators.

## Evidence and Limits

Tests use the PR42 marketing-campaign original and two committed synthetic files
for BOM/CRLF, lexical escapes, exact/overflowing numeric tokens, hostile keys and
empty/absent collections. Real Chromium and native Rust qualify the same bounded
operation family. No private-file or live Databricks claim is made. CONTRACT-082
0.2 governs this successor; PR42's neutral projection is explicitly legacy-only.
