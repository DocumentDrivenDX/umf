---
ddx:
  id: umf.evidence.rust-migration.r5-field-value-binding
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: umf.evidence.rust-migration.r5-field-value
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-049
      kind: informed_by
---

# R5 opt-in core Field-value binding

The tagged request operation model/validateCoreFieldValue now calls the public
Rust Engine::validate_core_field_value_public operation. The opt-in
createCoreModelEngine factory exposes validateCoreFieldValue(source, field,
value) in Node/Bun and WASM. The default createEngine remains unchanged. The
Node and browser wrappers convert Rust TYPE_ERROR results into host TypeError
instances while retaining the frozen message text. Source, identity and
literal carriers remain tagged UTF-16-preserving JSON values; object-member
order is retained through host admission and Rust copying. The operation keeps
the existing shared work, cancellation and deadline bridge.

Node 26.12.1 and Bun 1.4.3 both matched all 50 frozen predecessor cases in the
[R5 core Field-value checkpoint](../r5-field-value/README.md), including all
11 exact TypeError name/message observations. The harness verifies each is an
actual native JavaScript TypeError. The cohort includes validation order and
malformed JSON string carriers. A metered invocation accounted 27,593,112
units, and an already-cancelled invocation returned CANCELLED.
createEngine(resources) does not expose this method.

Chromium 153.0.8010.12 ran the staged, generated wasm-bindgen 0.2.100 web
artifact through initializeCoreModelWasm and matched the same 50 cases. The
11 TypeError outcomes were browser-native TypeError instances; cancellation
returned CANCELLED; host work accounting reported 27,593,133 units; and
process and Buffer were absent. The harness copied wrapper sources and the
built WASM package into a temporary host directory and served them over
loopback. This qualifies the tested browser binding cohort; it does not claim
standalone package self-containment.

The focused cargo test --locked -p umf-core --test r5_field_value passed 2
tests. cargo test --locked -p umf-core-wire passed 8 tests, including the
retained 139 request vectors. cargo build --locked -p umf-core-node and
cargo build --locked --release --target wasm32-unknown-unknown -p umf-core-wasm
passed. bun run typecheck and git diff --check passed.

## Captured source and artifact cohort

The retained TypeScript source hashes are recorded in the R5 core Field-value
checkpoint. This binding capture used the following current source and fixture
hashes:

| Source | SHA-256 |
| --- | --- |
| crates/umf-core-wire/src/lib.rs | 676959f2c2cf23979339b5b3b152e5e693ea039867d4245f350b8fe6e1fcbc31 |
| crates/umf-core/src/engine.rs | 6c9c8d1046c7f4513794f5875d57319f12c4bddecf6f278271f5e2fb6d654dfa |
| crates/umf-core/src/literal.rs | f6c9df27270ed982245de222ca68a3b8558b421768670851820b321e8c42f48c |
| bindings/core/node/index.js | 30cab525d91348a67ae6106d16126789ff8cdb5ab1bcc7679e842361bbe08757 |
| bindings/core/wasm/index.js | 0a7db66b5bd2c73480b238872de5635ecc02d33a9bff122d28b7c0671f64d99e |
| bindings/core/node/src/wire.js | 31c0bda130717d6e6438674bc7ba80977f916eb29e8ee1e9604e2ed219b56f33 |
| Node and WASM src/core-model.js wrappers | ccca6616cfc15301128dd68657a0fa644326ceea771ce06cd271db5ee081e828 |
| Node declarations | d26c08f65784030ebb50edeb338ca1fa2d00769a7f983b6ab0aae7a833039726 |
| WASM declarations | 1a32f9169fb762a46dbd77b3a146f7ceb0b25d2b057486b8b882ac6bc023b5cc |
| Frozen TypeScript carrier cohort | c5b0d980a561ffd751c411e9f9745f6b091d34cf337214910debfe352ef6d014 |
| Node/Bun parity harness | a55bada6da0a4d960b29fda65b54c855ee9190bd949d3496b35fbc43acef47e4 |
| Chromium harness | ccbbe7a1b9d494b6c127e10d17aa2708212214823f961ee086376da38cc07ab7 |

Built artifacts:

| Artifact | SHA-256 |
| --- | --- |
| Node addon, debug profile (libumf_core_node.dylib) | f9bbe61532b05df5a3d3a89126cebc6fb4cbb9fbdcb099f1074f1c4f71bb7e01 |
| Generated browser WASM (umf_core_wasm_bg.wasm) | 5a519516b050cdb884dbfd0e255fd4224776ec355efeda3aa6c66deadbe1fbda |
| Generated browser JS glue (umf_core_wasm.js) | a00065eab3b8d3db1ecd09da9ff3ed7b79e777dabf923eb0840818789cfff9d5 |

The Node/Bun runner is
[field-value-binding-parity.mjs](../../../../../../scripts/rust-migration/r5/field-value-binding-parity.mjs);
the browser runner is
[field-value-binding-browser.ts](../../../../../../scripts/rust-migration/r5/field-value-binding-browser.ts).
Build outputs were staged under /private/tmp/umf-r5-field-target and
/private/tmp/umf-r5-field-value-wasm. Reproduce with the repository's pinned
Rust 1.90.0 toolchain, wasm-bindgen 0.2.100, Node 26.12.1, Bun 1.4.3, and
Playwright Chromium 153.0.8010.12; see the scripts for staged package paths.

The support claim remains limited to this 50-case JSON-carrier cohort and the
opt-in binding. Arbitrary JavaScript object carrier behavior, standalone WASM
package self-containment, Python/CLI exposure, and R7 default cutover remain
open. No native adapter or wider literal-family support is claimed.
