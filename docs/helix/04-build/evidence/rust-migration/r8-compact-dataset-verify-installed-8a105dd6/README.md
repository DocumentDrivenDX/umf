---
ddx:
  id: umf.evidence.rust-migration.r8-compact-dataset-verify-installed-8a105dd6
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-056
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-compact-dataset-verify-source
      kind: extends
---

# Fixed-point installed Compact Dataset verifier replay

The [raw installed receipt](installed-replay.json), SHA-256
`aa9cd0b1720e93ea36f9f024f2d31e9575b3cc332671aab198049a1b1b53d72a`,
passes the five frozen verifier cases on the private macOS arm64 SDK archive
SHA-256 `01b15705bb1fcdc30814de4740cda352a23d5bc28dece3a60da9ffddf680504d`.
The archive's live/source closure is
`8a105dd69a5e42001250cd5e6063ed8c2721e844408389b8f5d5b561abedcdf7`,
with zero generated-source transforms and 1,805 archive members. Nine archive
integrity tests pass. Its source manifest pins the exact replay harness and all
six frozen packet files; the replay checked those pins against current bytes
and required explicit archive and closure hashes before reporting
`qualified-pass`.

Node 26.12.1, Bun 1.4.3, and real Chromium 153.0.8010.12 match every frozen
result/refusal and host-admission control. Every `./reference` case makes zero
Rust/WASM calls; every default case makes exactly two native or WASM calls.
Installed package-root identities, WASM loading, no Node globals, no external
browser requests, malformed-receipt short circuit, current-before-expected
access, and caller Proxy error identity are checked.

This qualifies only the listed private installed subset on macOS arm64. It
does not prove all Dataset semantics, Linux x64 behavior, any declaration
retirement, or release readiness. The full installed SDK suite and hosted
release matrix are separate gates.
