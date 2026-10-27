---
ddx:
  id: umf.evidence.rust-migration.r8-cardinality-installed-current-20261027
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: evidence_for
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-040
      kind: informed_by
    - id: TP-001
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-installed-cardinality-compact-security-20261027
      kind: predecessor
---

# Current-source installed Core Cardinality route replay

This evidence packet records the 11-case all-Rust Cardinality packet on one
fixed-point private SDK archive and three installed runtime routes. The SDK
archive SHA-256 is
`e21ecb1c9808059dbdf1643e4b66bffc6fd7b8f1d40ac9cf6abbac8dfa61531c`; its
source closure is `cc4c492fb7dc54675d4c671011c9a463903526bfba1f62994adb96225daaabca`
with 3,574 inputs and zero generated-input transforms. The Rust manifest hash
is `7141833cd6bf3e81e6af9d71d2468b3b3ad2f69a3ca1b7e1da9b80fafe0526e1`, and
the package manifest hash is
`1bd5f6cc6db6a5e9ef0e395a19aa6504e8a9a130a2fcbd3faaf4effbac7bb23a`. The
archive contains 1,807 members. The private archive remains at
`/private/tmp/umf-cardinality-current-fixed/archive-output/umf-sdk.tgz` and is
not checked into the repository.

Node 26.12.1, Bun 1.4.3, and real Chromium 153.0.8010.12 each passed all three
operations: four inspect cases, four declare cases, and three verification
cases. Every default case made exactly one call to the instrumented native or
WASM `executeCoreCardinalityHostJson` export; every `@umf/core/reference` case
made zero. Receipts preserve the exact result, refusal envelope, and ordered
host trace. Chromium loaded the archive WASM member and made no external
requests. See [the cohort pin](cohort-darwin-arm64.json),
[archive member map](archive-members-darwin-arm64.json),
[Rust build manifest](rust-default-manifest.json),
[package archive manifest](archive-manifest.json), and the three host receipts
per operation under [`receipts/`](receipts/).

The focused negative-control suite passed 13/13 tests:

```sh
node --test \
  scripts/rust-migration/r8/core-cardinality-case-capture.test.mjs \
  scripts/rust-migration/r8/default-route-retirement-evidence.test.mjs
```

It checks exact all-Rust call counts and a zero-Rust reference route, invalid or
changed packet/case expectations, host trap traces, archive extraction
integrity, current fixed-point source closure, and fail-closed behavior for
historical archives missing current harness and packet pins. The installed
replay was run with:

```sh
node scripts/rust-migration/r8/core-cardinality-case-capture.mjs node \
  <installed-package-root> <sdk.tgz> <archive-sha256> darwin-arm64 \
  <source-closure-sha256> <output-directory>
bun scripts/rust-migration/r8/core-cardinality-case-capture.mjs bun \
  <installed-package-root> <sdk.tgz> <archive-sha256> darwin-arm64 \
  <source-closure-sha256> <output-directory>
node scripts/rust-migration/r8/core-cardinality-case-capture.mjs chromium \
  <installed-package-root> <sdk.tgz> <archive-sha256> darwin-arm64 \
  <source-closure-sha256> <output-directory>
```

The harness independently verifies archive bytes and extracted member hashes,
source closure equality, package conditions, actual native/WASM payloads, and
per-case outcomes/traces/call counts. The TypeScript default facade is a thin
binder; host admission runs through the Rust-owned `umf.host-json/1` bridge.
The packet's host-trap cases deliberately expect the Rust bridge to be called
once before the proxy refusal; they do not claim zero-call preflight. The
verification case preserves malformed-receipt-before-current trap order.

This is bounded private route evidence for Darwin arm64 only. It does not prove
Linux x86_64 behavior, complete CONTRACT-040 acceptance, the full five-binding
Cardinality admission/delivery gate, all SDK parity, or release qualification.
The current retirement validator requires additional CONTRACT acceptance
coverage and two matching platform cohorts; no ledger disposition changes or
retirement are claimed.
