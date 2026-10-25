---
ddx:
  id: umf.evidence.rust-migration.r5-core-inspectors-default.sol-browser-review
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.evidence.rust-migration.r5-core-inspectors-default
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: umf.plan.rust-migration
      kind: informed_by
---

# Sol browser review of the three core inspectors

I independently reran the isolated WASM package in Chromium
153.0.8010.12. All 26 frozen scalar, record-member and reference outcomes
matched. The meter reported 10,580,023 callbacks and 413,938,630 work units;
zero work refused with `RESOURCE_LIMIT`, unknown and repeated reference roles
retained their order, and Node globals were absent. The replay regenerated
`chromium.json` byte-for-byte at SHA-256
`6e9e85723b34763334c0955ddaaa61fd37ce47238b47d298fb584d36dff60335`.
This accepts only the pinned browser source-route and isolated WASM packet.
Default installed SDK routing, broader host mutation and retirement remain
open.
