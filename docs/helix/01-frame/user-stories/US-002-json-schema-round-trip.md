---
ddx:
  id: US-002
  type: user-stories
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-002
      kind: informed_by
---

# US-002: Edit and round-trip JSON Schema

As a schema-tool author, I want a programmatically accessible native schema in UMF,
so that I can reuse metadata and make validated changes without losing meaning.

## Context and Walkthrough

Import a Draft 2020-12 root with explicit retrieval URI and resources; inspect
understanding diagnostics; traverse schema positions or read native nodes; edit a
fully understood node; export the native bundle and retain its UMF source.
CONTRACT-002 owns field and error definitions.

## Acceptance Criteria

- **US-002-AC1:** Native values, annotations and exact number lexemes survive
  UMF JSON/YAML round trips; valid typed edits change output without changing source.
- **US-002-AC2:** Explicit reference resources and retrieval URIs survive separately;
  missing dependencies report incomplete interpretation without network retrieval.
- **US-002-AC3:** Metadata traversal follows native schema positions and escaped
  JSON pointers; data inside annotations is not mistaken for a subschema.
- **US-002-AC4:** Invalid inputs and unsafe edits fail explicitly; unknown native
  meaning survives, while representation fields without a native destination block export.
- **US-002-AC5:** Every required Draft 2020-12 upstream case at the pinned revision
  preserves its native tree and passes original expected vectors before and after
  round trip in at least one independent native oracle; all oracle failures remain recorded.
- **US-002-AC6:** The built browser library executes native round-trip, edit and
  exact-number preservation checks in actual Chromium without host globals.

## Evidence and Boundaries

AC1–AC4: `tests/json-schema/native.test.ts`. AC5: `tests/json-schema/upstream.test.ts`,
`scripts/jsonschema-oracle.py` and versioned fixture reports. AC6: `scripts/browser.ts`.
The authored Order sample tests nested definitions, references and a bound edit.
Upstream optional/proposal cases are outside the executed scope. Expected-vector
coverage does not establish complete browser validation for every preserved schema.

## Dependencies

CONTRACT-001/002, ADR-002, TP-001. Protobuf, cross-system projection and broader
consumer generators remain separate stories; this story cannot complete the goal.
