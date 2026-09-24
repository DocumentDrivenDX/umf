---
ddx:
  id: US-012
  type: user-stories
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-003
      kind: informed_by
---

# US-012: Derive JSON instance validators from OpenAPI schemas

As an integration author, I want a selected API schema's JSON constraints available
in a portable validator, with API behavior and semantic losses explicitly reported.

- **US-012-AC1:** Static references, recursion, external enums, conditional requirements
  and unevaluated-property constraints retain instance acceptance after projection and
  UMF target round trip. Literal examples remain literal; source context is retained.
- **US-012-AC2:** Strict policy blocks losses; unknown assertions and dynamic scope
  block even when reported loss is allowed. Missing annotation/API/identity reports
  fail the independent evidence audit.
- **US-012-AC3:** All six schema components from the pinned official Tic Tac Toe
  example project and agree on twelve positive/negative native instance cases.
- **US-012-AC4:** Chromium runs the public projection and preserves target constraints
  and source while reporting omitted API execution behavior.

Legacy OpenAPI schema conversion, dynamic evaluation, request/response direction and
HTTP serialization remain required follow-up work, not implied by this slice.
