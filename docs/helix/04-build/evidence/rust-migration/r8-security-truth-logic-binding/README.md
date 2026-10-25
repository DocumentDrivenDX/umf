---
ddx:
  id: umf.evidence.rust-migration.r8-security-truth-logic-binding
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: ADR-006
      kind: informed_by
    - id: CONTRACT-062
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-security-truth-logic
      kind: extends
---

# R8 security truth/composition opt-in bindings

## Scope

This receipt qualifies an additive, opt-in `createSecurityLogicEngine` factory
for the four `CONTRACT-062` operations `securityNot`, `securityAnd`,
`securityOr`, and `composeSecurityRules`. It uses the shared Rust core through
the `umf.security-logic/1.0.0` profile and the existing tagged
`umf.core-wire/1` transport. The Node and WASM package roots expose the factory;
their existing TypeScript defaults are unchanged.

The public wire request requires exactly `profile`, `op`, and `args`. The
profile must match exactly. `args` is closed per operation: NOT accepts only
`value`; AND/OR accept only `values`; composition accepts `rules` and optional
`protectedFields`. Unknown, missing, duplicate, or wrong-profile members fail
with `REQUEST` before dispatch. Rust tests cover top-level unknown/missing
members, wrong profile, and unknown argument members. The existing internal
`securityRefIdentity` wire operation remains admitted with its single `ref`
argument; this new public factory does not expose it.

Composition consumes caller-supplied rule effects and truth values. It does
not evaluate or select policies, admit facts, authenticate identities,
authorize queries, or perform native enforcement. It covers the previously
frozen admitted-value subset, including constant string/boolean disclosures.
This receipt does not qualify disclosure codecs, source/policy semantics,
installed package archives, or default-route retirement.

## Verification

The frozen predecessor fixtures are
[`frozen-typescript.json`](../r8-security-truth-logic/frozen-typescript.json)
and [`compose-cases.json`](../r8-security-truth-logic/compose-cases.json).
Their pins are source `src/extensions/security/logic.ts` SHA-256
`df5857cf39f924552a8082f87d911b81725cce0cf1fda4375daeeb07dd48c8c8`, test
`tests/security/logic.test.ts` SHA-256
`042523ea973e7d4fb8a43047c2e3e20ca754d562a8ce167afdc136e08c3ef8b2`, and
CONTRACT-062 SHA-256
`1183e2ea8ba55fade4007554905b7175d7796e867a67814f511e9cd3ee514800`.

The locked/offline focused Rust command was:

```sh
RUSTC=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin/rustc \
CARGO_TARGET_DIR=/private/tmp/umf-security-logic-target \
/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin/cargo test \
  --locked --offline -p umf-core-wire \
  --test security_logic_wire --test security_ref_identity_wire
```

It passed 8/8 tests: 5 truth/composition wire tests and 3 reference identity
tests. The frozen truth tables, all three selected refusal vectors, and 22
composition cases are replayed. The additional request-admission test proves
unknown top-level/profile/argument members fail closed.

The Node integration used this Rust 1.90.0 release build:

```sh
RUSTC=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin/rustc \
CARGO_TARGET_DIR=/private/tmp/umf-security-node-target CARGO_BUILD_JOBS=2 \
CARGO_INCREMENTAL=0 \
/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin/cargo build \
  --locked --offline --release -p umf-core-node
node --test bindings/core/node/tests/security-logic.test.js
```

Node v26.12.1 passed 4/4. The rebuilt addon was temporarily installed for the
test and the pre-existing ignored addon was restored afterward. Bun v1.4.3
passed the same 4/4 tests with the fresh addon in a temporary package tree:

```sh
bun test /private/tmp/luna-security-node-package/bindings/core/node/tests/security-logic.test.js
```

That temporary tree copied the checked-in Node package sources, linked the
frozen `docs/helix`, `src`, and `tests` inputs, and used the fresh addon at
`/private/tmp/luna-security-node-package/bindings/core/node/umf_core_node.node`.
Neither test qualifies the checked-in binary or a published archive.

For Chromium, the release `wasm32-unknown-unknown` target was built with
Rust 1.90.0 using
`RUSTC=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin/rustc CARGO_TARGET_DIR=/private/tmp/luna-security-wasm-target /Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin/cargo build --release --locked --offline -p umf-core-wasm --target wasm32-unknown-unknown`, then processed with wasm-bindgen-cli 0.2.100:

```sh
/private/tmp/umf-wasm-tools/bin/wasm-bindgen \
  /private/tmp/luna-security-wasm-target/wasm32-unknown-unknown/release/umf_core_wasm.wasm \
  --target no-modules --out-dir /private/tmp/luna-security-wasm-nomod \
  --out-name umf_core_wasm
node /private/tmp/luna-security-wasm-browser-nomod.mjs
```

The public WASM index factory was
bundled for the temporary no-server harness; the generated no-modules glue and
bundle were adapted only in `/private/tmp` to inject from `about:blank` and
initialize the already-built module bytes. Playwright replay passed in Chrome
153.0.8010.12: 3 NOT cases, all 9 AND and 9 OR cells, 3 refusals, and 22
composition cases matched the fixtures. The run also checked work metering, zero-work-limit refusal,
cancellation, absence of Node globals, accessor non-invocation, and the
observed proxy behavior below. This is source-level browser evidence, not an
installed WASM package/archive qualification.

The host preflight refuses an accessor without invoking its getter. A Proxy
cannot be reliably identified before reflective inspection: its `ownKeys`
trap ran and its thrown error surfaced. Callers must not treat hostile Proxy
objects as admitted input; proxy trap behavior is not claimed to match the
TypeScript predecessor. The tested work controls are `meter`, `maxWork`, and
`isCancelled`; deadline and host-control callback failure cases are not covered
by this receipt.

## Source pins

SHA-256 pins for the changed source closure at this receipt:

| File | SHA-256 |
| --- | --- |
| `bindings/core/node/index.js` | `327519a2cfbd5560c88a1b993fdfcac01e07c01250f9c2fddd8a26d8e2c49a6f` |
| `bindings/core/node/index.d.ts` | `d0106215f7aea52a75170b674234d2f7e052a54d4f02008c6daf422d81136907` |
| `bindings/core/node/package.json` | `2c62a501b97f7dd862710f7c8733a73adda9e838ad00136a80a6ef6043a128b0` |
| `bindings/core/node/src/lib.rs` | `042a2929e02a10d1b2718c98d8e4196afdaa3a41117f000706423de71c9767c7` |
| `bindings/core/node/src/security-logic.js` | `eb8aa9eaab7fc8b29223ef0002c983f1599555fe8bcc2ff5e47041f93abb36af` |
| `bindings/core/node/tests/security-logic.test.js` | `79da3007aa8b1dfead5bf1dd5d626a76d3480e1cc321fd7a1a0112d4c5eef870` |
| `bindings/core/wasm/index.js` | `8deeb18c0f50e803bb732ac795a622056a7e60f25fcd9c9733f4bfe57d938ba6` |
| `bindings/core/wasm/index.d.ts` | `175befeaa807fdc0b9e38895aedf8a80334d15ac3ebc5827bd8549923c3310b0` |
| `bindings/core/wasm/src/lib.rs` | `33bc75aafa72d4869e5ab6fa54ce93835d3234ee89c780d3a7bd8b0734786235` |
| `bindings/core/wasm/src/security-logic.js` | `eb8aa9eaab7fc8b29223ef0002c983f1599555fe8bcc2ff5e47041f93abb36af` |
| `bindings/core/wasm/src/shared-sources.json` | `dc48ba732850e124156c728c8956f366f5be82e34b4a4fb43748eb819cf25c91` |
| `crates/umf-core-wire/src/security_logic_binding.rs` | `ba54e08c367698a6ff79420402d145b9f9d126b77c6004ade51076073ff5e4c3` |
| `crates/umf-core-wire/tests/security_logic_wire.rs` | `f8926039c37bdfe27ca3d70a69799e5837e958ef091bc22dde02ba338ab366f7` |
| `crates/umf-core-wire/tests/security_ref_identity_wire.rs` | `2b8cb4e4f072fc5aa44551192d032ee0b957978befa44f79b566f40d46665bac` |
| `scripts/rust-migration/r7/wasm-package-sources.ts` | `6557c1eb238bea25d37e2b225af3abbc7d6171ae9b5eb392faf9a5b470242ea1` |

The WASM source-map command `bun scripts/rust-migration/r7/wasm-package-sources.ts --check`
reported all 16 generated/source entries current. The Node addon and generated
WASM module were built into temporary directories; their binaries are not
source pins or installed-artifact claims.
