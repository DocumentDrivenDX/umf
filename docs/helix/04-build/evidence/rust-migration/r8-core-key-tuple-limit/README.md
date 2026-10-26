---
ddx:
  id: umf.evidence.rust-migration.r8-core-key-tuple-limit
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: umf.evidence.rust-migration.r5-core-key-tuple
      kind: informed_by
    - id: CONTRACT-040
      kind: informed_by
    - id: ADR-006
      kind: informed_by
---

# R8 Core Key tuple byte response limit

## Finding

The earlier tagged-wire byte-read route materialized bytes as a JSON value
array. Its 100,000-value transport ceiling was narrower than CONTRACT-040's
4,000,000-byte tuple limit. The current opt-in Core Key tuple runtime uses a
receipt-first staged Rust byte read and returns a typed array directly through
the Node and WASM wrappers. The generic tagged-array fallback remains available
for bindings without the direct capability, so this evidence qualifies the
direct opt-in route only.

No binding edit was needed for this bounded issue: the current Node and WASM
factories already select the direct staged read when present. This evidence
does not select the four default tuple exports, qualify a published SDK, or
close any R8 retirement gap.

## Evidence

The fresh Chromium 156 replay used a WASM binary built from the current
worktree with Rust 1.90.0 and wasm-bindgen 0.2.100. The public opt-in WASM
factory completed 87 in-profile encoder comparisons and five verifier
comparisons. Its raw byte reads succeeded at 100,001 and 4,000,000 bytes;
an input requiring 4,000,001 encoded bytes was refused by the core encoder at
`/values` before a receipt or output existed. The replay also checked
receipt-before-current admission, cumulative work controls, one-shot stage
consumption, and output-copy charging. The full captured result and hashes are
in [chromium.json](chromium.json).

The focused Bun 1.4.3 Node/WASM wrapper and retained-runtime tests passed 14
tests with 195 assertions. They include direct staged reads across the
tagged-array ceiling and the 4 MB boundary, plus a wrapper regression check
that forces large byte reads through the native path. See [node-bun.json](node-bun.json).

The broader tuple factory test file was also tried with the repository's
prebuilt addon: six of its seven tests passed, while the unrelated resource
setup-budget expectation failed. That outcome is excluded from the focused
byte-limit pass and remains a separate current-addon qualification question.

## Scope

This closes the response-array mismatch for the recorded opt-in Node/WASM
direct-byte route at this source and browser cohort. Inputs such as source,
receipt, and current document remain subject to the ordinary 100,000-value
admission profile. Python exposure, the four default package-root selections,
installed SDK integration, broader resource parity, and retirement review
remain open.
