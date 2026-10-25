---
ddx:
  id: umf.evidence.rust-migration.r5-record-members-inspection-wasm-retained
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: umf.evidence.rust-migration.r5-record-members-inspection
      kind: informed_by
    - id: CONTRACT-040
      kind: informed_by
    - id: TP-001
      kind: informed_by
---

# Retained WASM Core Record Members checkpoint

`createCoreRecordMembersEngine(module, resources, options)` adds an explicit,
opt-in WASM inspector over `CoreRecordMembersInspectionRuntime`. It owns one
immutable runtime built from the exact five Engine resources, including its
Engine, empty Registry, and compiled result schema. Each inspection uses a new
Context and fresh per-call controls. `setupControls` applies only to resource
admission and runtime construction. The inspector does not install extension
callbacks. `dispose()` releases the retained runtime, is idempotent, and later
inspection calls fail with `CORE_RECORD_MEMBERS_DISPOSED`.

The host facade encodes source before identity, then calls the WASM runtime
with separate wire arguments. The Rust binding decodes them in the same order
and invokes the retained runtime. The factory returns only
`inspectCoreRecordMembers` and `dispose`; existing model and default-root
factories remain unchanged.

## Evidence

The generated optimized WASM package was rebuilt from the frozen core/core-wire
checkpoint at HEAD `23bf095b768b6e391da1967339cd559e22ff2eff`, using Rust 1.90.0
and wasm-bindgen 0.2.100. The wrapper suite passed **4/4**. The retained browser
runner copied the current WASM JavaScript wrapper sources, loaded the package
in real Chromium 153.0.8010.12, and compared all 11 outcomes against
[`frozen-typescript.json`](frozen-typescript.json). Chromium 153.0.8010.12
matched every outcome, observed Node globals absent, confirmed calls after
dispose are refused, and verified the Node factory's plain-resource boundary:
inherited resource properties are refused and null-prototype resource records
are accepted. The machine-readable receipt pins the current WASM facade,
operation binding, Rust source closure (including the compiled Avro modules),
five resource inputs, Chromium runner, generated package, and compiled WASM.
See [`wasm-retained.json`](wasm-retained.json).

The focused wrapper tests cover source-before-identity admission, exact
five-resource setup refusal, separation of setup and per-call controls, the
two-method public surface, idempotent disposal, refusal after disposal, and
plain-object resource admission.

Reproduce from the repository root:

```sh
PATH=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin:/private/tmp/umf-wasm-bindgen-0.2.100/bin:/opt/homebrew/bin:/usr/bin:/bin \
CARGO_TARGET_DIR=/private/tmp/umf-record-members-combined-target \
CARGO_BUILD_JOBS=2 CARGO_INCREMENTAL=0 CARGO_NET_OFFLINE=true \
  cargo build --locked --offline --release --target wasm32-unknown-unknown \
  --manifest-path bindings/core/wasm/Cargo.toml
/private/tmp/umf-wasm-bindgen-0.2.100/bin/wasm-bindgen --target web \
  --out-dir /private/tmp/umf-record-members-combined-pkg \
  --out-name umf_core_wasm \
  /private/tmp/umf-record-members-combined-target/wasm32-unknown-unknown/release/umf_core_wasm.wasm
bun test ./bindings/core/wasm/tests/record-members-retained.test.js
UMF_RECORD_MEMBERS_WASM_PKG=/private/tmp/umf-record-members-combined-pkg \
  node bindings/core/wasm/tests/record-members-retained-browser.mjs
```

## Source and artifact pins

| Input | SHA-256 |
| --- | --- |
| `bindings/core/wasm/index.js` | `8b683a1e55eeb30a98f913231c804937aade76954721ea7ef80435f769583ae1` |
| `bindings/core/wasm/index.d.ts` | `cdca35226c19bba1c00b90c2e3e90f462240939fe72933f504259b51de685da3` |
| `bindings/core/wasm/src/lib.rs` | `6139d02e75a6374e8636734a22b181a7b49cfb6390d220f00589a9d96d18626b` |
| `bindings/core/wasm/src/record_members_inspection.rs` | `a0644756994f7e0df63a690eb5a60a6dd740a991bdcb527aa05a91cf7c363581` |
| `crates/umf-core-wire/src/record_members_inspection_binding.rs` | `d21ea16006c7065e07dcaa3647437614a680c53321d8135083fa6d43345a6184` |
| `crates/umf-core/src/record_members_inspection.rs` | `9fb2c030e50f7557c7b5d7427615d09f8dda438467efee5c89f185b5d8410a9e` |
| `crates/umf-core/src/lib.rs` | `36a02d32628634e8e6ae7d3652cf96b52f012ba268a83ea9eb92ddaf2a6476b0` |
| `crates/umf-core/src/avro_document.rs` | `d61092202ac0e826e63c8fd36cb25ebb2185e6861e97f31713c4a8049e496ad4` |
| `crates/umf-core/src/avro_fields.rs` | `b78ace9d77f74ae1f0bbdc9e8ce852bf3fad20079aea02f200808ea89bc6985c` |
| `crates/umf-core/src/avro_record_type_candidate.rs` | `ee044513f4ee7b9e57afac899c6731807346fa6a9e13b5312119a422051f3d55` |
| `crates/umf-core/src/avro_semantics.rs` | `02ddc5c245e59b80273ba2865a5099846d3d471967a6d6c61ca71720ab55ed8c` |
| `crates/umf-core-wire/src/lib.rs` | `9aef9ca86edddae332156269783eea74077f162be4e200234870d0fa062d8cc9` |
| frozen TypeScript packet | `d7b8a9438a4a3f58b88255d8ae5b8acbb972dec02a2293d72499faadd6c8980e` |
| generated wasm-bindgen JS | `483750f9ac11622a3afeccb57803fb4d6d71d4fa98bdd703dac10e93cf743bcc` |
| compiled input WASM | `8ea7fff4227976f14240f1faa74377b5d3d62ade687632b83fd2365b6f56d22e` |
| generated WASM binary | `0d983dc7f253ff0ca35bcba2927a503a515bc91552d6e367a2c4d1d296f9a582` |

The machine receipt also pins all five resource files and the focused test and
runner. The combined optimized build included the Avro core modules; their
source hashes and the shared core/wire declarations are recorded under
`build.sourceClosureSha256`, and the compiled wasm input is separately pinned.
This establishes only the opt-in retained WASM path for the frozen
11-case source packet. It does not establish Node, Python, CLI, default-root,
installed-package, release, extension-callback, or broader source/compiler
closure qualification.
