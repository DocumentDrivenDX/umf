---
ddx:
  id: umf.evidence.rust-migration.r8-security-and-or-v4-source-replay
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
    - id: umf.evidence.rust-migration.r8-security-truth-logic
      kind: extends
---

# R8 V4 `securityAnd` / `securityOr` source replay

## Scope

This source-level replay compares the private V4 default root with the
TypeScript `./reference` root for 68 frozen inputs covering `securityAnd` and
`securityOr`: all binary truth pairs, unary and 64-item bounds, empty and
65-item bounds, invalid truth tokens, non-array values, JSON-copy failures,
accessors and Proxy reflection traps. Every frozen predecessor outcome records
error name, constructor, code, message, path, and reflection trace. The source
pins and case outcomes are in [`predecessor.json`](predecessor.json).

Node 26.12.1, Bun 1.4.3, and real Chromium 153.0.8010.12 each match all 68
predecessor outcomes. The default route invoked the fresh Rust operation 30
times for valid values and zero times for preflight refusals in each host.
Chromium requested the fresh WASM binary and confirmed `process` and `Buffer`
were absent. Receipts: [`node.json`](node.json), [`bun.json`](bun.json), and
[`chromium.json`](chromium.json).

The source pin is the 20-file security/V4 route cohort recorded in every host
receipt, with SHA-256 closure digest
`8b7867778dc4b8829ba8b7f19dbc9fcb9ef4f1f9062c62317cee1ef9dbc3126b`. It
includes the current V4 facade source and test, Rust adapter, predecessor
implementation, Rust operation and wire dispatch, bindings, contract, and
replay harness. The private direct build lives at
`/private/tmp/umf-r8-security-and-or-current/dist`; the Node addon SHA-256 is
`5a07d418a6773b6b6d8f80648a91a03f6eaab056a19437c7bfea885331e7d8f5`, and the
WASM SHA-256 is
`cdc53f9cfb35856b1715b00d360be866978bc799c5e46034225dc96892114a14`.
`security-and-or-v4-source-replay.mjs --build` records the exact pinned Rust
1.90.0, Cargo 1.90.0, wasm-bindgen 0.2.100 and Bun 1.4.3 build procedure.

## Limits

This is a local source-level host replay, not a package archive or installed
SDK qualification; it does not establish full source-closure fixed-point
provenance. It covers only the valid truth fold and the predecessor's raw
admission boundary for `securityAnd` and `securityOr`. `composeSecurityRules`,
policy evaluation, and security authorization remain out of scope. Controls,
`maxWork`, and meter parity are not asserted: native transport and Rust copy
work add charges beyond the TypeScript predecessor. No retirement or release
claim is made.
