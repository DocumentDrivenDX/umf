---
ddx:
  id: umf.evidence.rust-migration.r8-security-and-or-v4-source-replay-current
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
    - id: umf.evidence.rust-migration.r8-security-and-or-v4-source-replay
      kind: extends
---

# Security And/Or V4 source replay after Record Values and Semantic Types selection

The unchanged [68-case predecessor packet](predecessor.json) was replayed
against a fresh private V4 source build in Node 26.12.1, Bun 1.4.3, and real
Chromium 153.0.8010.12. [Node](node.json), [Bun](bun.json), and
[Chromium](chromium.json) receipts each match every result, refusal and
reflection trace. Each default route makes 30 valid Rust/WASM calls and zero
preflight-refusal calls; the reference route makes zero Rust calls. Chromium
loads the fresh WASM binary without Node globals.

All three receipts pin the same 20-file source closure SHA-256
`7874c4c84fbb2d757731ec0afaef269b418f21001118e5f786b8fb8ded5dbb13`.
The Node addon SHA-256 is
`ebf382fbe9a02dfed868bcaa593fdb1389291dbbbb8a8dc46a2e916a0387dd64`;
the WASM SHA-256 is
`cdc53f9cfb35856b1715b00d360be866978bc799c5e46034225dc96892114a14`.
The build used Rust/Cargo 1.90.0, wasm-bindgen 0.2.100, and Bun 1.4.3 via
`security-and-or-v4-source-replay.mjs --build` into the ignored private
`.cache/sdk-distribution/security-and-or-current` directory.

This source replay refreshes the ledger's strict V4 closure after the new
bindings. It is bounded to `securityAnd` and `securityOr` truth-fold and raw
admission cases. It is neither an installed SDK archive nor complete security
semantics acceptance, and it retires no default-route gap.
