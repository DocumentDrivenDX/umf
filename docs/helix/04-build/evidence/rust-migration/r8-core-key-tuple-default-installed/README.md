---
ddx:
  id: umf.evidence.rust-migration.r8-core-key-tuple-default-installed
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
---

# R8 Core Key Tuple default route: installed Darwin checkpoint

The [installed SDK receipt](darwin-arm64-sdk-receipt.json) exercises the
default `readCoreKeyTupleBytes` and `prepareCoreKeyTuples` exports on Node
26.12.1, Bun 1.4.3, and real Chromium 153.0.8010.12. It verifies each
member of a fixed-point archive and pins the frozen TypeScript predecessor.
Ordinary frozen bytes, prepared encode/verify results, malformed-receipt
precedence, source copy and freeze, and public error branding match the
explicit `./reference` route. Chromium loads the packaged WASM asset; missing
native and WASM assets refuse execution. The checked archive SHA-256 is
`996dd7c991ccc068bfbf58e21709d01e3babf238e4ef23ca01cf6f7f63cce9ed`;
its source closure is
`8227af60468cb93bc6f495aaccee14876f4698204ccfb26f2ee6629e2fac836c`,
with zero source transforms. The receipt SHA-256 is
`ee923d4550e9c78bc817bf5fc92b39b43c49a080ceb6074391032b55543262a2`
and the harness SHA-256 is
`78b14413e0fe3b5b098ec4eaff6ff1e0860212e0bad1e63ca8d6964f5dbff5c2`.

An independently constructed four-million-byte receipt produces the exact
expected bytes through the selected Rust reader on all three hosts. The
reference receipt regex exceeds host runtime limits at this size, so this
boundary is an independent encoding check, not a reference-parity claim. The
reference encoder refuses a 4,000,001-byte tuple with `LIMIT`. Node's direct
native calls were counted; Bun's native loader does not expose the same
instrumentation, and its missing-native refusal is checked separately.

This is a bounded private Darwin arm64 route packet. It does not retire either
declaration or qualify Linux, the complete Key Tuple surface, or a release.
