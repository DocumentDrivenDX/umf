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

# Security And/Or V4 source replay after Semantic Types V4 root edit

The unchanged [68-case predecessor packet](predecessor.json) was replayed
against `/private/tmp/compact-v4-build-fixedpoint-20261027c` in Node v26.12.1,
Bun 1.4.3, and real Chromium 153.0.8010.12. [Node](node.json), [Bun](bun.json),
and [Chromium](chromium.json) receipts each match every result, refusal and
reflection trace. Each default route makes 30 valid Rust/WASM calls and zero
preflight-refusal calls; the reference route makes zero Rust calls. Chromium
loads the bound WASM binary without Node globals.

Before each replay, the runner verifies the immutable compact build manifest,
all manifest-listed source hashes, and the exact Node addon, WASM, glue,
reference, Node, and browser artifact hashes. Each receipt records the same
manifest SHA-256 `4d25c856fdac60bd5e0ae9c0bf7ac9afeda235251c13c05f313e3c6da96e5f3e`
and build source-closure SHA-256
`2f83e19ace175ceb538d0b7aba94926a41a868c3af4ad87d52d73a996b88fd31`.
The security replay's 22-file source closure SHA-256 is
`7bac03c3e6a6595d490c5a8c3c35db0569d78ca2a260ccdb8a2966fc0f5dd1ef`.

To reproduce with a new immutable build, choose a private output directory that
does not already contain a build manifest, then run the shared compact source
builder through this harness before the host replays:

```sh
bun scripts/rust-migration/r8/security-and-or-v4-source-replay.mjs --build /private/tmp/security-and-or-v4-build
node scripts/rust-migration/r8/security-and-or-v4-source-replay.mjs --host node /private/tmp/security-and-or-v4-build docs/helix/04-build/evidence/rust-migration/r8-security-and-or-v4-source-replay-current/predecessor.json /tmp/security-node.json
bun scripts/rust-migration/r8/security-and-or-v4-source-replay.mjs --host bun /private/tmp/security-and-or-v4-build docs/helix/04-build/evidence/rust-migration/r8-security-and-or-v4-source-replay-current/predecessor.json /tmp/security-bun.json
bun scripts/rust-migration/r8/security-and-or-v4-source-replay.mjs --browser /private/tmp/security-and-or-v4-build docs/helix/04-build/evidence/rust-migration/r8-security-and-or-v4-source-replay-current/predecessor.json /tmp/security-chromium.json
```

The `--build` mode delegates to the same manifest-producing compact build
workflow used for this capture. The manifest is immutable; use a fresh output
directory for each build.

The receipt file SHA-256 values are Node
`a7b4bf778f0988dff437c70e63f143413c8894e91ee714d5d8534b839ca5d6da`, Bun
`3a2cae257de7c2db76a46baaf5bccbbb9d8b11a58bb8c48942e476b51df14eb5`, and
Chromium `f730348bfce6e1250d6229ee6e026984ab31ab2d41ab344fafe5c496f9fed0c1`.
Historical pre-refresh receipts are retained as `node-prior-semantic-types-v4.json`,
`bun-prior-semantic-types-v4.json`, and `chromium-prior-semantic-types-v4.json`.
The transformed typed-build capture is also retained under the `*-semantic-types-v4-typed-86b54d.json` names; its build predates the fixed-point action identity generator output.
The build's Node addon SHA-256 is
`dedfaf986ba5d0d645563c5813bf12867178453beea89a0fa0729697d95fb026`; its
WASM SHA-256 is
`111007da675e270f072044dff0e7e39e6d5013bca2aca71af91fd22e177fad8a`.

This source replay is bounded to `securityAnd` and `securityOr` truth-fold and raw
admission cases. The separate [installed replay on the ef9f20c8 archive](../r8-security-and-or-installed-ef9f20c8/README.md)
records installed behavior. Neither replay establishes complete security
semantics acceptance or retires a default-route gap.
