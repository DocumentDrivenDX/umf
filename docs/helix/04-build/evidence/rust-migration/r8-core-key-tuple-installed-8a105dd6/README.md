---
ddx:
  id: umf.evidence.rust-migration.r8-core-key-tuple-installed-8a105dd6
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-040
      kind: informed_by
    - id: umf.evidence.rust-migration.r5-core-key-tuple
      kind: extends
---

# Historical installed Core Key tuple route probe

The [raw replay receipt](replay.json) records an exact-package probe against
`.cache/sdk-distribution/cohorts/8a105dd6/umf-sdk.tgz`, SHA-256
`01b15705bb1fcdc30814de4740cda352a23d5bc28dece3a60da9ffddf680504d`, with
source closure
`8a105dd69a5e42001250cd5e6063ed8c2721e844408389b8f5d5b561abedcdf7`. This is
now a historical cohort because later source replay changed. It is not a
source-current or release qualification.

Node 26.12.1, Bun 1.4.3, and real Chromium 153.0.8010.12 matched all 88
encoder packet outcomes and five verifier outcomes, including the unsafe host
Number input, against the frozen predecessor and the package's `./reference`
route. Prepared-source mutation, successful prepared encode/verify, malformed
receipt before current access, and accessor non-invocation passed. Chromium
loaded the package WASM. These results characterize the package-root API, not
a Rust tuple route.

Native and WASM call instrumentation found no Core Key tuple Rust dispatch:
Node and Bun recorded zero `CoreKeyTupleRuntime` calls. Chromium recorded no
tuple-specific WASM exports; the observed WASM calls were generic engine setup
and other runtime initializers. The package root exposes tuple functions, but
the tested root calls do not establish that those functions route through the
Rust tuple implementation.

The byte boundary probe found a host difference. A 100,001-byte tuple
round-trip succeeds in Node and Bun. At 4,000,000 bytes, Node throws
`Maximum call stack size exceeded` during result validation; Bun returns
`KEY_TUPLE_RESULT` for the `bytesHex` schema pattern. At 4,000,001 bytes, both
refuse with `LIMIT` at `/values`. Chromium passed the frozen packet and
instrumented WASM loading; its 4 MB encoder probe also throws
`Maximum call stack size exceeded`.

This evidence therefore does not support default selection or a complete
installed Rust-route parity claim. The live source and rebuilt archive must be
replayed after the package-route and large-result boundary are resolved.
