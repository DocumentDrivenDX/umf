---
ddx:
  id: US-006
  type: user-stories
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-004
      kind: informed_by
    - id: FEAT-003
      kind: informed_by
---

# US-006: Bind a domain model to a document schema

As a domain-model consumer, I want to choose a document representation explicitly
and see which domain rules it cannot enforce, so that embedding is not mistaken
for an aggregate transaction or identity constraint.

## Acceptance Criteria

- **US-006-AC1:** Explicit scalar, collection, openness and relationship bindings
  produce a JSON Schema document with concept mappings and full source retention.
  Target-only reimport contains no reconstructed DDD semantics.
- **US-006-AC2:** An independent native validator accepts/rejects expected document
  shapes, while a documented domain-rule violation remains accepted and disclosed.
- **US-006-AC3:** Missing/unused relationship bindings, ambiguous aggregate-local
  identity references, non-data roots and strict-loss policy block explicitly.
- **US-006-AC4:** Changing Customer embedding to identity reference changes target
  shape without changing the retained domain model or context-qualified identity.
- **US-006-AC5:** Actual Chromium executes the public projection and preservation
  checks with the same authored domain fixture.

## Evidence and Boundaries

`tests/projections/ddd-json-schema.test.ts` covers AC1–AC4;
`scripts/browser.ts` covers AC5. CONTRACT-006 defines all physical choices and
report semantics. This generates schema, not an instance converter, repository,
transaction engine or event transport. Later SQL/OpenAPI/Axon/Palantir projections
require separate bindings and native evidence.
