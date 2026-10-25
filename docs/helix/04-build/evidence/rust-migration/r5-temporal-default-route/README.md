---
ddx:
  id: umf.evidence.rust-migration.r5-temporal-default-route
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-065
      kind: informed_by
    - id: CONTRACT-066
      kind: informed_by
    - id: TP-001
      kind: informed_by
---

# R5 temporal default-route qualification checkpoint

This checkpoint tests the four explicit temporal exports selected by the
Node/Bun and browser root entrypoints: `parseGregorianDate`,
`truncateGregorianDate`, `parseRfc3339ExactInstant`, and
`sameRfc3339ExactInstant`. It records route parity only; it does not claim a
release-fixed-point SDK or complete R8 acceptance.

The Node differential is `scripts/rust-migration/r5/temporal-default-route-node.ts`.
Against the source-built Node root bundle it passed on Bun 1.4.3 and Node
v26.12.1. It compares returned values and exact built-in error class/message
with the TypeScript predecessors, covering malformed text, ten raw non-string
host values (including boxed strings, proxies and a revoked proxy), date-before-
unit and left-before-right precedence, and hostile second operands. Both runs
reported `exactClassMessageAndRawHostParity` and `leftFirstRefusalParity`.

Replay commands from the repository root:

```sh
UMF_TEMPORAL_DEFAULT_NODE=/private/tmp/umf-rust-default-temporal/umf-node.js bun scripts/rust-migration/r5/temporal-default-route-node.ts
UMF_TEMPORAL_DEFAULT_NODE=/private/tmp/umf-rust-default-temporal/umf-node.js node scripts/rust-migration/r5/temporal-default-route-node.ts
UMF_TEMPORAL_DEFAULT_BROWSER=/private/tmp/umf-rust-default-temporal bun scripts/rust-migration/r5/temporal-default-route-browser.ts
cargo test -p umf-core-wire --test gregorian_date_wire --test rfc3339_exact_instant_wire --offline
bun node_modules/typescript/bin/tsc --noEmit
```

The real browser replay is
`scripts/rust-migration/r5/temporal-default-route-browser.ts`. Chromium
153.0.8010.12 passed 17 assertions, including exact error class/messages,
hostile second operands, successful parse/truncation/equality cases, unknown
offset retention, and absence of `process` and `Buffer` globals. The browser
runner requires local-server access to serve the generated WASM bundle.

The Rust tagged-wire suites passed with
`cargo test -p umf-core-wire --test gregorian_date_wire --test rfc3339_exact_instant_wire --offline`
(10 tests). The main TypeScript check passed with
`bun node_modules/typescript/bin/tsc --noEmit`. A full tools-project typecheck
also passed after the concurrent Delta runner correction.

The private source builder was run as
`PATH=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin:/private/tmp/umf-wasm-bindgen-0.2.100/bin:$PATH UMF_RUST_DEFAULT_BUILD_ONLY=1 UMF_RUST_DEFAULT_DIST=/private/tmp/umf-rust-default-temporal bun scripts/package-sdk-rust-default.ts`.
Its source-input stability check passed and it wrote only to
`/private/tmp/umf-rust-default-temporal`. The manifest explicitly reports
`releaseStatus=private-r7-default-route-qualification-source-drift-not-publishable`
and `sourceTransformStatus=derived-private-snapshot-not-release-fixed-point`
with 11 generator-derived inputs. The captured source tree hash is
`6c6b38652bbb2d8093de7d8e2b59a3419e59e154e7e4885a5fab488b4afd7f12`; the
derived build tree hash is
`27af9a660d2911e0311e0dfcf848bc8da9db498e852ee816a7fa4a153d7b8b79`.
This privately built package is suitable for these route tests only.

Artifact SHA-256 values:

- `umf-node.js`: `0251b9cab09ef82f45b0c40ee3043a2c3be5f3791974ca71fc46ea7380e5715d`
- `umf-browser.js`: `3074429cea64f9b8dfbfaafa476e3035355d27f0a41120105ab45be7c8cd46c3`
- `umf_core_node.node`: `b5adbf7c3281efaa4986e70e9995a953b0c24de4d35d5d39c942bf8eb8e0802f`
- `umf_core_wasm_bg.wasm`: `2090ad0cde42aab4a69cb3015b028af36d4c724c7a3ce434c241cd3db3354d45`

Source SHA-256 values for the temporal implementation and route tests:

- `crates/umf-core/src/gregorian_date.rs`: `22a5a9fb302063d292277024ecbbd66915f4cfcc83f61af71c4655077f124ea2`
- `crates/umf-core-wire/src/gregorian_date_binding.rs`: `7fff1d781594ab55a23bcb69c28e31e20073348bdc4c3c4333097195bf418315`
- `crates/umf-core-wire/tests/gregorian_date_wire.rs`: `42af49638e02a19c4fe2191844f7688a9f9bd8c7b9ea3168cf3ff3624c646fe8`
- `bindings/core/node/src/lib.rs`: `d5d5a4aaf867961149a7d227ca7e68eaee6b462f0b46389f3f657dc65e4a90c0`
- `bindings/core/wasm/src/lib.rs`: `aa4fcf76e168a6b48bf630fd53496920a9a831a13de9fe1a4c571735046d4401`
- `scripts/rust-migration/r5/temporal-default-route-node.ts`: `fdc9ae9b17e3bb90cab28713d68a8b018560f77528c469e34057f5faad024d9b`
- `scripts/rust-migration/r5/temporal-default-route-browser.ts`: `ab29fe45e3d4b457c59a94e3605e4e8663f74166679905a939959aed40b8b99a`

Sol review of default export selection and the complete R8 release cohort remains
open. Python packaged CLI behavior, the supported six-cohort Python pair, the
two-cohort SDK release evidence, global fixed-point inventory, and publication
are outside this checkpoint.
