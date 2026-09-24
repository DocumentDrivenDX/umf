---
ddx:
  id: US-010
  type: user-stories
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-003
      kind: informed_by
---

# US-010: Produce explicit document shapes from GraphQL inputs

As an integration author, I want input-document validation derived from GraphQL
without confusing validation with GraphQL's defaulting and coercion behavior.

- **US-010-AC1:** Selected input types project required/nullable fields, defaults,
  recursive references, enums, lists and OneOf accurately within the selected
  binding; source retention and target-only recovery are separate checks.
- **US-010-AC2:** Unknown bindings, fragments, output/missing types and reached
  custom scalars block. Strict policy rejects remaining losses.
- **US-010-AC3:** Independent GraphQL input coercion and JSON Schema validation
  compare acceptance and coerced values; removing default/list/ID loss reports fails.
- **US-010-AC4:** Chromium executes the public projection and verifies target
  validity and reported default semantics.
- **US-010-AC5:** AddCommentInput, CreateIssueInput and CreateProjectInput from the
  pinned GitHub fixture project and pass independent positive/negative instance checks.

Other input types, custom scalar mappings and output/operation projections remain
separate coverage work under the overall objective.
