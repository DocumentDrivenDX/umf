---
ddx:
  id: umf.evidence.r5-select-core-elements-predecessor-20261027
  type: test-evidence
  activity: build
  status: current
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: validates
    - id: CONTRACT-001
      kind: validates
---

# R5 `selectCoreElements` TypeScript predecessor capture

This packet freezes a bounded current-TypeScript predecessor cohort for planning
the Rust binding boundary. It is not a Rust parity result, a default-route
decision, or a release qualification.

The reproducible capture is
[`select-core-elements-capture.ts`](../../../../../../scripts/rust-migration/r5/select-core-elements-capture.ts)
with shared scenarios in
[`select-core-elements-cases.ts`](../../../../../../scripts/rust-migration/r5/select-core-elements-cases.ts).
Run from the repository root:

```sh
UMF_CHROMIUM_PATH="/Users/erik/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing" \
  bun scripts/rust-migration/r5/select-core-elements-capture.ts
```

The runner directly executes the shared scenarios in Bun, bundles the same
scenario module for Node, and serves a browser-target bundle to Playwright's
real Chromium. It captures exact results and checks Node/Bun/Chromium equality.
The browser request interceptor permits only the local fixture server; the
receipt records zero external requests.

The capture passed on macOS arm64 with Bun 1.4.3, Node v26.3.0 and Chromium
153.0.8010.12. Receipt data, including the exact executable path, source file
SHA-256 values, generated bundle SHA-256 values, runtime versions and full
per-runtime results, is in [`results.json`](results.json). Git HEAD was
`8b7497de3295fe5b0cb274009fc55135ce3dc67e`; source hashes are authoritative
for the captured selection/validation cohort because the shared worktree had
other uncommitted files. The refreshed result receipt has SHA-256
`1e5183eb7463d0ee8cedb0409b7892cf97ca1bc8eeb280a2145f43e97f0e56ed`; all ten
listed source-file hashes and the capture-script hash were independently
recomputed against the worktree after metamodel regeneration, with no mismatch.

The cases record successful ordered selection, distinct module identity,
transitive cycle termination, repeated boundary edges, unknown scalar and
extension diagnostics, unknown reference annotations, full Registry callback
scope/path order, accessor rejection without invoking the getter, Proxy
access-order traps, caller-thrown object identity at the host-input boundary,
cycle refusal, and rejection of extra query keys that resemble work/cancel
controls. The Rust binding gate is to match the result and diagnostic order,
callback order and paths, refusal behavior, and thrown-value behavior on this
source-pinned cohort before claiming host parity.

This capture does not exhaust query validation, document limits, every schema
case, callback failure conversion, or the full existing selection test suite.
`selectCoreElements` exposes no public cancellation or work-budget parameter;
the `signal`/`budget` probe is a query-shape refusal, not a cancellation test.
Contract-level bounds and broader resource behavior still need separate
qualification. Registry callback exceptions are converted to diagnostics by
the TypeScript validator, so original thrown-object identity is only preserved
for exceptions thrown during input property access, as captured here.
