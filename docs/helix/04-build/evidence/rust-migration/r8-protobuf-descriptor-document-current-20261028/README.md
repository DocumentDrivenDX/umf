---
ddx:
  id: umf.evidence.rust-migration.r8-protobuf-descriptor-document-current-20261028
  type: execution-evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: evidence_for
    - id: CONTRACT-003
      kind: informed_by
---

# Protobuf descriptor/document current-source installed cohort

The [Darwin arm64 receipt](darwin-arm64-sdk-receipt.json) (SHA-256 `cc3eb3bd661d3e55ca26efa6bc67a5ab9d3372e56db807aa855b76b865e08cfd`) records an offline installed `@umf/core` 0.5.6 replay from the private fixed-point archive SHA-256 `af745902a6817a6812caa545d1c6e6c3befaa41e1c56781f570010d3131bdc4e`. Its source closure SHA-256 is `31e8f424b6501f5872b576b29f89d92c4eac0424f64159360d5d3fd2c89542e3` over 3,727 inputs with zero transforms. The archive is retained at `/private/tmp/umf-r8-reviewed-cut/umf-sdk.tgz` and is not a published package.

Node 26.12.1, Bun 1.4.3, and real Chromium 153.0.8010.12 each passed 18 frozen descriptor/document operation vectors and 14 bounded descriptor-reader cases on the default and `./reference` routes. Node and Bun recorded 39 native calls on the default route and zero on `./reference`. Chromium loaded WASM once, made no external requests, and had no page errors or Node globals.

The declared bounded subset does not cover general non-byte host inputs or exact malformed-wire diagnostic wording. This receipt does not include runtime missing/corrupt WASM refusal, complete public parity, Linux qualification, declaration retirement, or release publication.
