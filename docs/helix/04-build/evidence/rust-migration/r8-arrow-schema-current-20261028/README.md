---
ddx:
  id: umf.evidence.rust-migration.r8-arrow-schema-current-20261028
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

# Arrow schema current-source installed cohort

The [Darwin arm64 receipt](darwin-arm64-sdk-receipt.json) (SHA-256 `8746eb05100d01e9c84be1d5f2ba3317981c4793f5a96e9ff8e4ffdca4e47217`) records a dependency-resolved offline installation of private `@umf/core` 0.5.6 from fixed-point archive SHA-256 `af745902a6817a6812caa545d1c6e6c3befaa41e1c56781f570010d3131bdc4e`. Its live source closure SHA-256 is `31e8f424b6501f5872b576b29f89d92c4eac0424f64159360d5d3fd2c89542e3` over 3,727 inputs with zero transforms. The archive is retained at `/private/tmp/umf-r8-reviewed-cut/umf-sdk.tgz` and is not a published package.

The five Arrow schema JSON operations in CONTRACT-016 passed the 52-schema, 260-operation predecessor corpus and focused import/edit/error cases on installed default and `./reference` entries in Node 26.12.1, Bun 1.4.3, and real Chromium 153.0.8010.12. The browser used packaged WASM without Node globals. Missing/corrupt native and WASM assets refused; the reference route remained available. The receipt checks archive assets, npm lock identity, package resolution, and the current source closure.

This covers Arrow schema JSON operations only. It does not cover Arrow IPC decoding, native Arrow data, Python, CLI, Linux SDK behavior, declaration retirement, or release publication.
