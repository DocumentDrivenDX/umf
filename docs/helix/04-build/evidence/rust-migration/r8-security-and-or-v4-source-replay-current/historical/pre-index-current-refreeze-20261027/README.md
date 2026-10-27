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

# Security And/Or V4 current-source replay

The unchanged [68-case predecessor packet](predecessor.json) was freshly replayed
against current source after adding the opt-in Rust `readJsonValue` primitive
binding and `src/access/read-json-value-ordinary.ts` facade. The replay itself is
scoped to `securityAnd` and `securityOr` truth-fold and raw-admission cases; it
does not exercise the new access facade. Node v26.12.1, Bun 1.4.3, and real
Chromium 153.0.8010.12 each match every expected result, refusal, and reflection
trace. Each default route makes 30 valid Rust/WASM calls and zero refusal calls;
the reference route makes zero Rust calls. Chromium loads the built WASM without
Node globals.

The current receipts use the shared Compact verifier source build at
`/private/tmp/umf-r8-compact-v4-action-identity-20261027a`. Its immutable
manifest SHA-256 is
`9d70a420cc76a308bd42d3984993bc616919e718f3073bceb332822625b363cc`; its
source-closure SHA-256 is
`d0d54682e6bc91b1eaa31d55d2b425b0bfbe706b6e2fe3be966422cccd2cc264`. The build
manifest pins `bindings/core/node/src/read_json_value.rs` at
`e9b62271d474490e09c85736137cb8975cebcd6283217a871c4c2f6c39f1595f`, the
Node binding `src/lib.rs` at
`0c2876b03d1366c29343240e8a905a63e6063df45f7a81c74148a2ae1df095fd`, and
`src/access/read-json-value-ordinary.ts` at
`e1af34e745dec592851ff8eb88964a4bc8417f1f3d5fa96aacf0e327d6ffffd4`.
The built Node addon SHA-256 is
`080f647ff8eb37a5182b916c0be10b78561e1f60aad9837323cfa5a9b53d8aad`; the
WASM SHA-256 is
`111007da675e270f072044dff0e7e39e6d5013bca2aca71af91fd22e177fad8a`. Each
host replay verifies every manifest-listed source file and all six pinned
artifacts before execution. The replay's 22-file security source closure
SHA-256 is `7bac03c3e6a6595d490c5a8c3c35db0569d78ca2a260ccdb8a2966fc0f5dd1ef`.

To reproduce the current shared-build replay, run:

```sh
node scripts/rust-migration/r8/security-and-or-v4-source-replay.mjs --host node /private/tmp/umf-r8-compact-v4-action-identity-20261027a docs/helix/04-build/evidence/rust-migration/r8-security-and-or-v4-source-replay-current/predecessor.json /tmp/security-node.json
bun scripts/rust-migration/r8/security-and-or-v4-source-replay.mjs --host bun /private/tmp/umf-r8-compact-v4-action-identity-20261027a docs/helix/04-build/evidence/rust-migration/r8-security-and-or-v4-source-replay-current/predecessor.json /tmp/security-bun.json
bun scripts/rust-migration/r8/security-and-or-v4-source-replay.mjs --browser /private/tmp/umf-r8-compact-v4-action-identity-20261027a docs/helix/04-build/evidence/rust-migration/r8-security-and-or-v4-source-replay-current/predecessor.json /tmp/security-chromium.json
```

The shared build manifest is available at
[the Compact source evidence](../r8-compact-dataset-verify-source/build-manifest.json).
The immediately prior shared-build receipts (manifest `4b3207...`) remain under
[`diagnostic/shared-build-e2982f354e62-20261027/`](diagnostic/shared-build-e2982f354e62-20261027/). The earlier separate-build captures remain under
[`diagnostic/separate-build-64b283f570e0-20261027/`](diagnostic/separate-build-64b283f570e0-20261027/);
they passed behavior replay but did not satisfy the ledger’s shared-build binding.
The browser command needs permission to bind its temporary loopback server in
restricted execution environments.

Current receipts are [Node](node.json), [Bun](bun.json), and
[Chromium](chromium.json). Before refreshing them, the exact prior current
receipts were copied to
[`historical/pre-read-json-value-binding-20261027/`](historical/pre-read-json-value-binding-20261027/).
The earlier semantic-types and typed-build captures remain in place. Current receipt SHA-256 values are Node `233afcca1a32ac7998b6534fa44d9a0fa8535557c735da0667df1aeb8ab3a2a0`,
Bun `0b587a0d3b91b8ffd2b2fe0316efa85baf92db8b5ee92cd828241a6bf55a3b0e`, and Chromium `803168aae55f992e7e179ba3a4fa7ca51b1e79035526098ec302765eefc24d71`.
`SHA256SUMS` pins every file in this directory, including the historical receipts.

This remains a bounded source replay, not an installed archive or release
qualification. The separate [installed replay on the ef9f20c8 archive](../r8-security-and-or-installed-ef9f20c8/README.md)
records installed behavior. Neither replay establishes complete security
semantics acceptance or retires a default-route gap.
