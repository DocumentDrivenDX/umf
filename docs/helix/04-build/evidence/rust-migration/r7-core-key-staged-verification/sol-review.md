---
ddx:
  id: umf.evidence.rust-migration.r7-core-key-staged-verification-sol-review
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.evidence.rust-migration.r7-core-key-staged-verification
      kind: informed_by
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-040
      kind: informed_by
    - id: TP-001
      kind: informed_by
---

# Independent Sol review: staged Core Key verification

Sol inspected the Rust stage, the closed five-resource runtime, the Node and
WASM binding classes, and the facade's closure-private handle map. Stage 1
validates and recomputes the receipt before the facade encodes `current`.
Stage 2 consumes the Rust-owned handle, admits current and moves out the
already validated receipt. The owner identity is checked in Rust and the
facade rejects forged, reused and other-engine handles before calling the
native finish method. The generic wire does not expose a JSON finish method.

Sol independently reran the fresh private Node package binding test: 4 passed,
13 assertions. The private WASM package also passed a real Chromium
153.0.8010.12 replay: successful receipt equality, cross-engine refusal and
one-use refusal. Sol verified the replay harness SHA-256
`92230c92454d569d23000544cfe126e959730ef6413a07196fcf93adbceb3aa3`,
WASM SHA-256
`9cf1db065a450394ad916c94a267b5954a7d4adb90dbd792d76debaec1a15218`
and generated JS SHA-256
`e70109ed5dd5c9cc37a9d7f5adf7a1f073de3edc4b9a1bacd1662928026494e5`.
The browser replay required local-only HTTP binding after a sandboxed server
startup returned `EADDRINUSE`. `git diff --check` passed.

Sol added and ran a separate Node/WASM facade regression for one-use behavior
when native finish fails: the first failure propagates and a second attempt
refuses the consumed handle. The shared wrapper suite now passes 6/6; with the
separate WASM factory suite, the focused wrapper/factory total is 9/9.

This review accepts the opt-in staged handle on the pinned Darwin-arm64 Node
build and Chromium/WASM cohort. It does not qualify extension callbacks,
other platforms, installed SDK archives, the default package/root route or
Core Key retirement. The wider R7 and R8 gates remain open.
