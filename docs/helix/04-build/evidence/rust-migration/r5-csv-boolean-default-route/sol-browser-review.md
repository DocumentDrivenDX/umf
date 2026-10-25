---
ddx:
  id: umf.evidence.rust-migration.r5-csv-boolean-default-route.sol-browser-review
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.evidence.rust-migration.r5-csv-boolean-default-route
      kind: informed_by
    - id: CONTRACT-053
      kind: informed_by
    - id: umf.plan.rust-migration
      kind: informed_by
---

# Sol browser review of CSV Boolean lexical routes

I independently reran the v4 browser route in Chromium 153.0.8010.12
against its isolated WASM package. All four frozen token receipts matched,
verification recomputation passed, malformed receipt refusal read no expected
source getter, and Node globals were absent. The independent receipt SHA-256
`d4b9a9b23728eb8e83f57f0e06ec3a3fd47575e6c5e22ad2d72177d390879123`
is byte-identical to the recorded `chromium-smoke.json`. This accepts only
the captured source-route and package artifact; installed SDK routing and
TypeScript retirement are still open.
