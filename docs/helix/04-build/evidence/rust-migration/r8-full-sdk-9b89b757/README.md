---
ddx:
  id: umf.evidence.rust-migration.r8-full-sdk-9b89b757
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-062
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-full-sdk-ef9f20c8
      kind: references
---

# Installed SDK replay on 9b89b757

The [installed test receipt](installed-test-receipt.json), SHA-256
`2caadeca9fa4e0128e9ed7750a32cb830af87047325e3c256a822908cba79fb1`, records
`passed` for the private macOS arm64 SDK archive SHA-256
`c250b82bd689abdd85c6c3a5296892408cf8fdd590f36c6eecd753460f7e7706`. Its
source closure and captured-live closure both hash to
`9b89b757176d03f518af3aa1a97f446e672d791a3f85629df490a6da07c085bf`; the build
reported zero source transforms. Archive preflight independently verified
1,806 payload-member hashes across 1,807 tar members and 3,549 source inputs.
The package manifest SHA-256 is
`56cbb88dbd59484473ef6fb9306c892dee0055e82bc45bb693af65011fa6eb6e`.

The installed replay completed in 1,147,791 ms using Node 26.12.1, Bun 1.4.3,
and Chromium 153.0.8010.12. It passed 31 R3 cases; 27 JavaScript numeric and
six boundary cases; 66 Core Cardinality cases; 19 facets, 14 keys, 11 Bits128,
and 19 Compact Dataset cases. It also passed the 68-case installed Security
And/Or packet, with 30 valid native calls in each Node and Bun and 30 valid WASM
calls in Chromium. The receipts record three route-tampering refusals, missing
and corrupt native-addon refusal in Node and Bun, and missing and corrupt WASM
refusal in Chromium. All 1,800 packaged assets and 1,807 archive members matched
the installed cohort.

The replay is one private macOS arm64 cohort. The package remains private and
nonpublishable. The R8 ledger still has 922 open logical default-route gaps and
zero retired; this packet makes no release or cross-platform claim. No macOS CI
was run and nothing was pushed. The archive itself is retained at
`/private/tmp/umf-r8-installed-20261027/retry-fixed/archive/umf-sdk.tgz` for this
local session.

The harness includes three focused bind-collision classifier checks. The exact
Bun collision object had message `Failed to start server. Is port 47595 in use?`,
syscall `listen`, errno `0`, and code `EADDRINUSE`; the predicate now checks the
structured code/errno and retains a message fallback. A separate local loopback
and Chromium smoke passed before the full replay.

Supporting records:

- [Archive manifest](archive-manifest.json) pins the complete package-member inventory and private release state.
- [Package receipt](package-receipt.json) records the archive and manifest digests.
- [Preflight receipt](preflight.json), [member hashes](member-hashes.json), and [live source closure](live-source.json) retain independent archive and source verification.
- [Security And/Or receipt](security-and-or-installed-receipt.json) preserves its scoped installed packet evidence.
