---
ddx:
  id: R7-SDK-SOURCE-DEFAULT-ROUTE-SOL-REVIEW-20261024
  type: evidence
  activity: build
  status: captured
  authoring:
    home: repo
  links:
    - id: R7-SDK-SOURCE-DEFAULT-ROUTE-LOCAL-20261024
      kind: informed_by
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: ADR-006
      kind: informed_by
---

# Sol review: private source SDK generator route

I independently inspected the canonical packer, source-build manifest and
archive. The archive SHA-256 is
`1fc91d66f756edcc8fd39fe3180b684beb8381f16f986807cb9b5fb257ea0dee`;
its 1,779 unique file members include 1,772 assets whose bytes match the
build manifest hashes. The packaged `package.json` is `private: true`, and the
source transform status is fixed-point with zero generated-input changes. The
build manifest SHA-256 is
`19a8be279630086b3def5fe29d3b5697c5f8e6be3335ffc9330b40787aa09585`;
the archive sidecar manifest SHA-256 is
`8c69a4d04e5c47cbd22691a4092c11a826e97d85fd802f414aff8d65cfe29a53`.

I reran `python3 scripts/test-sdk-package.py` (9/9), `bun run typecheck`,
and the Python source V8 boundary check (655 modules, zero V8 debt). I then
independently reran the exact installed replay script, SHA-256
`315cef9cac3216aff9fd38baaae39cf77052ad2d611a9bc82983b2b3e1542563`,
against that archive. Node 26.12.1, Bun 1.4.3 and Chromium 153.0.8010.12
passed 31 frozen generator cases, synchronous root/reference comparison,
1,120 export names, resource controls and missing/corrupt native/WASM asset
refusals. My replay receipt is SHA-256
`81ddde902916443bbc88a106e518d7a78eb5e9cfc8775644965b43eb2aa10598`;
it differs from the agent's retained receipt only in run-local port and elapsed
time. I also checked the source inventory's Node/browser/reference export
names and current package condition targets.

No P1/P2 remains in this bounded, captured local generator-route review.
The private archive is not a complete Rust port or publishable release. Its
source closure is a captured cohort; subsequent core and default-route edits
require a fresh build and installed replay before current-tree integration.
The other 921 root algorithms per default condition, hosted platform matrix,
Python release pair and full R8 retirement gates remain open.
