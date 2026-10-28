---
ddx:
  id: umf.evidence.rust-migration.r8-sdk-stream-snapshot-darwin-20261028
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: evidence_for
    - id: ADR-006
      kind: informed_by
    - id: TP-001
      kind: informed_by
---

# Private Darwin SDK source-snapshot and installed replay

The canonical Rust-default SDK builder copied its pinned source files through
byte streams and completed with a fixed-point source tree SHA-256 of
`ec2c6b92fcd75419613d95722a2d6e985b32f94bbc2d081285b32fd3c24f1c30`
and zero source transforms. This was a live worktree cut after the Parquet
relationship observation, Protobuf descriptor host-admission, and snapshot
copy changes, but before the later TargetPin and Core Evolution edits. The
builder's first attempt correctly refused an output when a Parquet test source
changed during compilation; the stable-source retry passed.

The strict package verifier accepted the private Darwin arm64 archive at
`/private/tmp/umf-rust-sdk-current2-archive/umf-sdk.tgz`, SHA-256
`abf9ac58a5d05bffedcd6869e0d435ecbe3f87f14d9b0949ee02ebb19931a946`.
It contains 1,814 members and 1,807 distribution assets. The package
[receipt](package-receipt.json) and [manifest](manifest.json) are retained here;
the manifest hash is
`0a3af92e67721214b8d6e7aa7004d9f4ef0f90a51c7437599862b711087218d1`.
The archive itself remains private and was not published.

The canonical [installed replay](installed-test-receipt.json) passed on
Node 26.12.1, Bun 1.4.3, and real Chromium 153.0.8010.12. It checked the
package-root conditions and three route-tamper refusals, the 31-case R3
generator corpus, 27 JavaScript numeric cases, 66 Cardinality cases, 19
Facets cases, 14 Keys cases, eleven Bit128 functions, 19 Compact Dataset
fixtures, and installed `securityAndOr` parity with 68 cases and 30 valid Rust
calls per host. Missing or corrupt native and WASM assets refused. The
[security receipt](security-and-or-installed-receipt.json) is retained with
the overall installed receipt. All installed checks used the same archive
hash and source closure.

This is bounded private Darwin arm64 evidence for the tested package cut. It
does not qualify the later worktree source edits, Linux, all public exports,
the unresolved resource authorities, a complete Rust port, or a release.
