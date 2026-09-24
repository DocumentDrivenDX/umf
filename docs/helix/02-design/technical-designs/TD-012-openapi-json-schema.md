---
ddx:
  id: TD-012
  type: technical-design
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.architecture
      kind: informed_by
    - id: CONTRACT-012
      kind: informed_by
    - id: US-012
      kind: informed_by
---

# TD-012: Project static OpenAPI schema constraints

Use the extension's schema index to identify every schema position, then allocate
one target definition per reached location. Traverse native exact JSON trees; replace
nested schema positions with references to generated definitions and resolve native
static references through the identity index. Allocate names before walking to terminate
schema cycles. JSON Schema reference evaluation carries child annotations used by
unevaluated constraints, so tests include those interactions.

Strip resource identifiers after rewriting static references and report the identity
change. Reject dynamic scope, which cannot be rewritten using static lookup. Preserve
ordinary literal JSON without numeric host conversion. Block unknown assertion keywords;
report OpenAPI annotations and API runtime meaning omitted from generic validation.
Import the produced target through the JSON Schema adapter and expose its diagnostics.

The independent oracle compares source and target instance constraints before and after
UMF target round trip. Negative controls remove required fidelity reports. Upstream
samples exercise real component references, arrays and enums. Browser evidence uses the
bundled public API. No new domain semantics are promoted into core by this conversion.
