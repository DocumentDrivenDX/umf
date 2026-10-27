---
ddx:
  id: umf.evidence.rust-migration.r8-security-protection-query-properties-binding
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
    - id: umf.evidence.rust-migration.r8-security-protection-query-properties
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-security-protection-parameters
      kind: informed_by
---

# R8 opt-in Rust security query-property candidate and bindings

This receipt covers the bounded core candidate in
`crates/umf-core/src/security_queries.rs` and tagged wire in
`crates/umf-core-wire/src/security_queries_binding.rs`. The profile is
`umf.security-queries/1`; the only operation is
`inspectProtectionQueryProperties`. The request is closed over `profile`,
`op`, `policy`, `catalog`, `closure`, and `use`. The source/domain/typed-parameter
stages compose the existing security candidate helpers.

The TypeScript owner is
`src/extensions/security/protection/queries.ts`. The governing boundary is
CONTRACT-062, section “Conditional property requirements and typed declaration
checks” (the `inspectProtectionQueryProperties` contract), not the separate
private stored-Field query source inspector. This receipt extends the bounded
candidate through explicit opt-in Node and browser/WASM factories; package-root
default routing and retirement of the TypeScript path remain out of scope.

The candidate exactly replays **19 of 22 operations** from the captured
[TypeScript predecessor packet](../r8-security-protection-query-properties/predecessor.json).
Replay compares every returned field, diagnostic order, and retained snapshot.
The candidate admits at most one authored range declaration, retaining its
source property as effective without comparing it to another range identity.
It refuses all required range properties and refuses a second authored range,
because equivalent exact Field/core literals can have distinct carrier text
and require qualified identity/deduplication. Three operations are excluded:
the canonical-numeric range identity case, the distinct-field range case, and
the unknown-range-Field refusal case; all require a range as a query property.
The Rust packet test asserts 19 exact replays and those three exclusions. A
separate focused wire test supplies two authored ranges with carrier texts
`10` and `1e1`, and confirms `refused`, both declarations retained in the full
`authoredProperties` snapshot, and `complete:false`, `authority:false`, with
`PROTECTION_QUERY_UNIMPLEMENTED`.

The supported comparison path covers the six atomic names (`equality`,
`order`, `length`, `format`, `nullity`, and `cardinality`), equality
implication, missing requirements, mode outcomes, and random-token
join/group refusal. One authored range may pass through as a retained effective
property, but range entailment or equivalence is not implemented. Required
range properties, multiple authored ranges, and prefix/suffix property objects
return `refused` with `PROTECTION_QUERY_UNIMPLEMENTED`. All results retain
`complete:false` and `authority:false`.

The two raw-host observations in the predecessor's separate
`host-observations.json` are deliberately outside JSON-tagged parity. The
TypeScript observations (`query.use-accessor-not-invoked` and
`query.use-proxy-own-keys-observed`) record host inspection of raw objects. The
Node and browser facade controls establish only that an enumerable accessor
is refused by the wire encoder without invoking its getter. The browser test
also records two Proxy `ownKeys` trap calls at the facade encoder boundary;
that observation does not claim parity with the TypeScript raw-object
operation. Closed request/profile controls refuse unknown wire members. The
wire path has no host callback dispatch for this operation. Each compared
property charges core work through `Context`; source and JSON admission use
the existing core limits. This does not claim a total heap/CPU bound, raw-host
semantic parity, query lineage, compiler admission, authorization, native
enforcement, or default-route selection.

The current fixture uses the core `0.10.0` security candidate profile. This
receipt does not resolve Core Evolution 0.8/0.10 drift.

Validation used Rust 1.90.0, wasm-bindgen 0.2.100, Node 26.12.1, Bun 1.4.3,
and HeadlessChrome 153.0.8010.12. Cargo builds were locked/offline:

```sh
rustfmt --edition 2021 --check crates/umf-core/src/security_queries.rs crates/umf-core-wire/src/security_queries_binding.rs
cargo check --locked --offline -p umf-core-wire
cargo test --locked --offline -p umf-core-wire security_queries_binding --lib
bun scripts/rust-migration/r8/security-protection-query-properties-predecessor.ts --check
cargo build --release --locked --offline -p umf-core-node
cp target/release/libumf_core_node.dylib bindings/core/node/umf_core_node.node
RUSTC=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin/rustc CARGO_TARGET_DIR=/private/tmp/umf-query-properties-wasm-target /Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin/cargo build --release --locked --offline -p umf-core-wasm --target wasm32-unknown-unknown
/private/tmp/umf-wasm-bindgen-0.2.100/bin/wasm-bindgen /private/tmp/umf-query-properties-wasm-target/wasm32-unknown-unknown/release/umf_core_wasm.wasm --target web --out-dir /private/tmp/umf-query-properties-wasm-pkg
node --test bindings/core/node/tests/security-query-properties.test.js
bun test ./bindings/core/node/tests/security-query-properties.test.js
bun scripts/rust-migration/r7/wasm-package-sources.ts --check
bun run typecheck
UMF_SECURITY_QUERY_PROPERTIES_WASM_PKG=/private/tmp/umf-query-properties-wasm-pkg bun scripts/rust-migration/r8/security-query-properties-binding-browser.mjs
```

The three Rust test cases pass, including 19 exact packet replays, three
recorded exclusions, the multiple-authored-range refusal/snapshot assertion,
closed-shape refusal and host-control cancellation. Fresh Rust 1.90.0 Node and
WASM builds both replay the same 19 supported packet operations; three
required-range operations return `refused`. The focused Node test passes under
Node and Bun, and the fresh WASM bridge passes in HeadlessChrome 153. Accessor
and missing/corrupt ABI controls pass in both hosts. The
workspace-wide `cargo fmt --check` reports existing formatting differences in
unrelated Rust files, so formatting was checked directly on the two new Rust
files.

The query-specific work meter charges once per accepted atomic property. The
composed parameter helper retains its existing literal-work accounting;
this receipt does not establish the TypeScript helper's shared 100,000-unit
ledger across both phases. Ordinary core JSON value/depth/text limits and the
host-control callback remain in force. Behavior at shared-ledger exhaustion is
outside the replayed subset.

Source pins at this receipt:

| File | SHA-256 |
| --- | --- |
| `crates/umf-core/src/security_queries.rs` | `d13b4f4221daa01ec4c503491e45e11a9ca6a7bffb33d1d3e8a69ec47a058e17` |
| `crates/umf-core/src/full_modules.rs` | `85f14b19862c4b0fa9e60d0c6b481cad8a8a5c6f862638c4b1790a0f9a9561d6` |
| `crates/umf-core-wire/src/security_queries_binding.rs` | `2dc53dabd1e4bdeff84373728b819a982368aeadb1e43d821760d598904ea172` |
| `crates/umf-core-wire/src/lib.rs` | `fb1d0a56acb5c38fa79d0a90b3183a07e47502c454e10b1aa0c010fc194803ab` |

Binding and browser replay source pins at this receipt:

| File | SHA-256 |
| --- | --- |
| `bindings/core/node/src/security-query-properties.js` (also mirrored to WASM) | `a89de04fd1376135831220f5896ceb2e076466fce9013783756d10a68ac27020` |
| `bindings/core/node/tests/security-query-properties.test.js` | `a0e840cb414162352d567868319688da430453f5ced737b8440036f8b3582802` |
| `scripts/rust-migration/r8/security-query-properties-binding-browser.mjs` | `be2db582db8e2f7a1e3252fac582c35b0d32fe5f1d5b8e9f2ec9d0d4f984d6b4` |
| `bindings/core/wasm/src/shared-sources.json` | `268758b88c1b8f301699fe60bc5437e7611f90d7e17d365beeeb7b471539a0ef` |
| `bindings/core/node/package.json` | `602ddc85435f81ba1c79cfcbff0ed9aed1ad2edb887d7acc8cd9f75bcec75cea` |
| `bindings/core/node/src/lib.rs` | `708d60825a01ae6a6d75cbd572f21a0cbfeb72f5d8344cb35a99cdf1aeb234d6` |
| `bindings/core/wasm/src/lib.rs` | `afa03b6c59baa06bb2b27daff732f0de5658fb483b60385ad3ada1bb008eec32` |
| `bindings/core/node/index.js` | `1a6a089677eba2b5cded37ace60d29c48d3617f4be22701b11491c25dd246ef5` |
| `bindings/core/wasm/index.js` | `7931960b5b6f7f802ec73e47aba5a5cdd8aafb5c5509748031e055cb1f48f2c5` |
| `bindings/core/node/index.d.ts` | `312da402fff92c1fb3423209e9361d4f6c96c07ad52d03d8437d2c55b68fdcd8` |
| `bindings/core/wasm/index.d.ts` | `e4464b35d07a3d9609e8ff2fefafd77e48d2b0702e8df836a531c4dad0cc14c1` |

Fresh runtime artifacts for the successful replay were Node addon
`c309f0f4c5434908b44cd9a97dc85803c42de8c4f06de7c79cc6e3443750237b`, WASM
glue `ea57d12a681ac63b7ccd6109c217afab539044bbd57488fdac0edf7d94ec9329`, and
WASM binary `11b50459e874f44041c7da30ceb55d3a2aae22b077cc98d06484279a2c3d6758`.
