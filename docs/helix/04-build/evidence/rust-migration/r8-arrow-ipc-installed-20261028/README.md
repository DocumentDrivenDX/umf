---
ddx:
  id: umf.evidence.rust-migration.r8-arrow-ipc-installed-20261028
  type: execution-evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: evidence_for
    - id: CONTRACT-016
      kind: informed_by
---

# Arrow IPC current-source installed SDK gate

The [Darwin arm64 receipt](darwin-arm64-sdk-receipt.json) records an offline installation of the private `@umf/core` 0.5.6 archive with all 1,820 archive members and 229 npm lock entries checked. Its SHA-256 is `a9292b9d43317b85461738ea96efabcf0b8a01fc6ab81395aa6381770602d065`. The archive SHA-256 is `af745902a6817a6812caa545d1c6e6c3befaa41e1c56781f570010d3131bdc4e`; the fixed-point live source closure SHA-256 is `31e8f424b6501f5872b576b29f89d92c4eac0424f64159360d5d3fd2c89542e3` over 3,727 inputs, with zero source transforms. The private archive is retained at `/private/tmp/umf-r8-reviewed-cut/umf-sdk.tgz` and is not a published package.

Node 26.12.1 and Bun 1.4.3 resolved the installed default and `./reference` entries and passed the frozen 23-case capture, inspect, and export packet (84 operations per route, including mutations and resource limit). Real Chromium 153.0.8010.12 passed 69 frozen operations with the packaged browser entry and adjacent WASM. Missing and corrupt native and WASM assets refused; the browser made no external requests and had no page errors or Node globals. The gate checked the live source closure again before writing the receipt.

The closure check also verifies the pinned external `@libpg-query` WASM input both before and after replay; a drift negative control is in the focused gate tests. This qualifies only `captureArrowIpc`, `inspectArrowIpcCapture`, and `exportArrowIpcCapture` in the stated installed local cohort. It does not qualify Arrow IPC decoding, other public operations, Linux SDK behavior, default-route retirement, or release publication.
