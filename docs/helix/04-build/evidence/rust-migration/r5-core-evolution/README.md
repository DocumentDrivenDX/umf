# R5 core evolution: bounded core checkpoint

The initial checkpoint added an opt-in Rust implementation of current TypeScript core evolution behavior. This successor adds tagged wire dispatch and thin Node/WASM wrappers. These routes remain opt-in; the package root still routes the evolution exports through TypeScript. This evidence does not retire or qualify the default route.

The admitted predecessor is the current core `0.10.0` source profile. The receipt keeps the compatibility spelling `core-0.8-absent-string-additions/0.1`. This is a recorded divergence from `docs/helix/02-design/contracts/CONTRACT-058-core-evolution.md`, which names a `0.8.0` precondition. A separate unrelated legal fixture also uses the identifier `CONTRACT-058`; the duplicate-ID governance ambiguity remains open. Neither divergence is resolved by this checkpoint.

The implementation covers inspection and retained-operation verification for the absent-string-field-addition profile. It preserves unknown source content in the result and classifies it as unsupported; a known breaking type mutation remains breaking in the presence of unknown residue. Duplicate object keys fail closed. Input value, serialized-byte, semantic-work, and Context meter/cancellation limits are enforced before the associated traversal or receipt emission. Verification recomputes from independent before/after/policy inputs and validates the closed result schema.

## Frozen predecessor and focused verification

`frozen-typescript-0.10.json` freezes seven exact current-TypeScript cases: unchanged input, accepted absent-string addition, known type change, unknown retained content, required-field addition, cross-module operation, and a shared-field two-record case. The final case records the predecessor's `CORE_DATASET_SOURCE` refusal. The packet was captured before Rust implementation and has SHA-256 `672213c111d51899c0a537faae22ead1e39921538810abc30401aed4d815b3e0`.

Focused offline Rust verification passed 8/8 tests with Rust 1.90.0, including the 4,096-member host-meter pre-scan refusal:

```sh
CARGO_TARGET_DIR=/private/tmp/umf-r5-evolution-target \
CARGO_BUILD_JOBS=2 CARGO_INCREMENTAL=0 \
cargo test --locked --offline -p umf-core --test r5_core_evolution
```

The core tests cover the frozen outcomes, policy/source refusal, unknown preservation and mutation classification, duplicate-key rejection and large-object metering, aggregate value/serialized-byte limits, Context meter refusal, and verification against independent inputs including forged receipt rejection.

## Tagged wire and installed binding checkpoint

The private tagged operation route now exposes `model/inspectCoreEvolution` and `model/verifyCoreEvolution`. Node and WASM wrappers expose synchronous operations after engine initialization. The wrappers pass errors through unchanged. The Node archive is a clean local pack of the private `@umf/core-rust-native` candidate package; it is an opt-in qualification artifact, not a published package. Its retained build-source manifest SHA-256 is `ca222064ec2274aebf8978614a4108dc426b42ab449fea692d5129fd99e799d7`, and the Node/Bun receipts hash the exact files extracted from that archive.

The Rust tagged-wire suite passed 3/3 tests in 56.43 seconds on the final live wire source (`d3c9f4f3be036a1645106d9c0f8eec954d703554e091475468421eb57f791a2e`). It covers all seven frozen inspection envelopes/refusals, successful verification against independent inputs, forged receipt refusal, and host-meter refusal. The Node archive was replayed by package-name import from an extracted install root under Node 26.12.1 and Bun 1.4.3; both runs passed all seven frozen cases, valid/forged receipt checks, and zero-work, cancellation, and deadline controls. The archive SHA-256 is `1e0ff05e13159bd6412c25ccdecec77d4657943ed047bdc75627942dcd680d4d`; the packed addon SHA-256 is `bc50d7534d78cbbfaafefe2c4af38e2d2df0bd4cf34586dfe1eae87e1b2f679a`. The native build's wire source pin is `c1edc00d89d1837248e1eeb758b9631917d61e1e383f568ec9d259c51c87c45a`. The Node and Bun receipts derive `nativeArtifactSha256` from the addon extracted from this archive; ignored live build outputs are not used for the packed artifact hash. The Node wrapper unit test passed 2/2, and the generated Node-to-WASM wrapper mirror check passed.

The clean extracted WASM package, built by the compact-dataset cohort from the frozen evolution dispatch, was replayed in Headless Chromium 153.0.8010.12. It passed the same seven inspection cases, current and forged verifier checks, and zero-work, cancellation, and deadline controls. Its package archive SHA-256 is `c3385834bf4c8b479b4760e5e151fc8779ff374ac2f96a85be77ad622337069b`; the WASM binary SHA-256 is `638d8db7fa9a6e86f9d0d01d0159d75b3932ac2d4866509e48c05eafd89f9494`. The browser receipt records exact package asset and resource hashes. The independently retained WASM source receipt at `r5-dataset-values-compact/chromium.json` (SHA-256 `6fa8ba8cb9aec16417544afb7cf93d85951044639735895bc2a0d42392a7a6a5`) confirms the same Rust wire hash and records source-closure SHA-256 `8352dd785230478bf0af6fc5e55ace1d49719da518aa0681bdec98be5e5248ad`. SDK cardinality work has since changed the live shared wire source, so these receipts apply to their captured artifacts.

Receipts and package inventory are preserved as `node-binding-replay.json`, `bun-binding-replay.json`, `chromium-binding-replay.json`, and `node-package-pack.json` alongside this README. The browser harness and Node replay harness are source files under `scripts/rust-migration/r5/`.

## Lookup metering follow-up

Every production `get` and mutable member lookup now charges the containing object's full member count before starting its linear scan. This is a conservative upper bound on comparisons for both present and absent names; early matches may therefore be overcharged, while repeated lookups each pay their own bound. Charges go through the existing semantic-work admission and `Context` meter/cancellation/deadline path before traversal. Rust Vec indexing (`get`/`get_mut` on arrays) is not an object-member scan and is bounded by the already preflighted array/value limits. The focused wide-object test injects 4,096 extra root members and confirms a host meter can stop on the scan charge before source validation traverses them. The frozen seven-case 0.10 outcomes still pass.

This closes the identified uncharged linear-scan gap for production object lookups, but does not itself establish complete TypeScript predecessor ordering when multiple controls are simultaneously exhausted. The new adversarial case proves the scan charge is observable and can be refused before scan; it is not a frozen predecessor receipt for every combination of value/byte/work limits, cancellation, deadline and host meter. Those combined controls, CONTRACT-058's version divergence, and default-route integration remain open gates. This opt-in checkpoint does not claim full-family or default-route parity.

## Control-order audit

The frozen predecessor exposes a `ValueWork` budget and `bounded()` checks for 100,000 values and 4,000,000 serialized bytes. It does not expose the Rust `Context` meter, cancellation, deadline, or depth controls, so a combined host-control ordering has no TypeScript predecessor observation to compare. In TypeScript, `bounded(value)` first recursively counts and charges each value, checks the 100,000-value ceiling, then walks serialized bytes; recursive depth has no explicit 128-level refusal in this path. Receipt admission repeats that sequence before receipt-schema work. These are source observations, not an executed combined-control fixture.

Rust's current order is explicit in `preflight_one`: for each visited value it checks the aggregate 100,000-value ceiling, checks depth greater than 128, charges semantic work (thereby invoking configured meter/cancellation/deadline hooks), then adds serialized-byte cost. Inputs are processed policy, before, after; verification processes receipt, before, after, policy, then recomputes. The completed result is preflighted before compiled receipt-schema validation. The current Rust focused suite passes 8/8, including its dedicated wide-object metering test; the existing Node and Chromium receipts exercise zero-work, cancellation, and deadline individually, but their source pins predate the metered-lookup source and they do not exercise combined controls. No source-level discrepancy justifies changing Rust's fail-closed ordering; neither the frozen TypeScript packet nor the installed receipts establish combined predecessor parity. A future parity claim needs a frozen TypeScript control packet where the predecessor has an observable counterpart, plus rebuilt Node/browser artifacts for Rust-only host controls.

Audit source hashes: TypeScript `src/model/evolution.ts` `f4833f850c30257421dd92c286539ea93c35114fca2b749452cee5d1feeb7e24`; `src/model/internal/value-context.ts` `5511ae376a5208d2d90f44d162384104dec9e4274f72bc9d1030a150278cede7`; Rust `crates/umf-core/src/core_evolution.rs` `bad9698bd1bf2a1fec23bc452150ceba27070bd6672b3498e55b07aca3e2db4b`; `crates/umf-core/src/context.rs` `293a58a1efd6cd006014203363f5b856a0a017116f09567da4076454feb2ac2d`; focused test `crates/umf-core/tests/r5_core_evolution.rs` `efbc6d4139d64c6cafd043d57e1233de9025b380fa072cc0820c7dbb1ba43978`; frozen predecessor packet `672213c111d51899c0a537faae22ead1e39921538810abc30401aed4d815b3e0`.

## Source pins

The first two SHA-256 values pin the current lookup-metering test. The
remaining values preserve the earlier R5 binding/artifact cohort and are
historical; they do not identify a current integrated Node/WASM build after
this Rust source change.

| File | SHA-256 |
| --- | --- |
| `crates/umf-core/src/core_evolution.rs` (metered lookup follow-up) | `bad9698bd1bf2a1fec23bc452150ceba27070bd6672b3498e55b07aca3e2db4b` |
| `crates/umf-core/tests/r5_core_evolution.rs` (metered lookup follow-up) | `efbc6d4139d64c6cafd043d57e1233de9025b380fa072cc0820c7dbb1ba43978` |
| `crates/umf-core/src/lib.rs` | `6d44ea55b02d8f2aba662e2dcfe9c488ab18207a2f88d3474e5f04e71efb29e0` |
| `crates/umf-core-wire/src/lib.rs` (Node/WASM artifact cohort) | `c1edc00d89d1837248e1eeb758b9631917d61e1e383f568ec9d259c51c87c45a` |
| `crates/umf-core-wire/tests/r5_core_evolution_wire.rs` | `6e84f564d22ef19fbb0c0c25cc5c4b5f9adc0acbb53e866b7bb530a86ba23e05` |
| `bindings/core/node/src/core-evolution.js` and WASM mirror | `d72a448cc854c9483a6a3456f770a33a1d67d35aa04075ce674ee5ea61ff7967` |
| Node package entry and types | `86eb1a09d7f28a6dac2a2ced9a6d26e7171fd10057074a92616e0b6ef28aede5`; `66d22341727e8988b7a6bf509e39fc5ee59485e5f03945c14c364117313862ca` |
| WASM package entry and types | `a11e46eff5044d7f604a34a782d319aa4ad1e0e0435f36cbd93f3606514a6dce`; `4c32fcdcc0fb288b6648850b63588eeb23fb1a56b42528e437cc68707eb4fa93` |
| Node replay and Chromium harnesses | `87dc20c4ea5e60052bcb34818fd89f5772503329250196f755eb304fc85d0809`; `00624fe4b54a6611da35b6a7b0e3cd20ff42717ea91b020c8f21cf4a326537ad` |
| Node wrapper test | `51493022954ca8e8feecbe21d3500656f60089ec3e0985c22d87c2276b2ab509` |
| Node/WASM source-pair checker and manifest | `eeb2cd4a63579082d1663a3d08bcaac646bc9ed33d19e3eb36ab2f9790a152e2`; `2fe2c4cfe87695eb6b2d0ff480ebe2e784a88323f41db4fa77125fc13fe3f3b3` |
| `src/model/evolution.ts` | `f4833f850c30257421dd92c286539ea93c35114fca2b749452cee5d1feeb7e24` |
| `spec/core/evolution-operation.schema.json` | `62c6deddd6973f61cc96fc2b2e6c8201cf1b89161ddce7d8454264a60433400e` |
| `spec/core/dataset-value-operation.schema.json` | `217cc3c05e10cec1bb4e93cca1205c039f596e95080cba075823a9b8b351013d` |
| `spec/core/key-tuple-operation-v4.schema.json` | `fe7d93da41ac331696686bd32fb0be8ca62b7a5638b95b975034195d66dff2cc` |
| `spec/core/schema.json` | `b7842c143e24c8a039c7d79be4503b8f5feb21391b800b5ccec19ccd530bb525` |
| `spec/domain-packs/commerce/ontology.json` | `c2ffba1673f7e66797639a3797fe3e15e6f385ec72105ea838916efeafab6f9e` |
| `frozen-typescript-0.10.json` | `672213c111d51899c0a537faae22ead1e39921538810abc30401aed4d815b3e0` |

The receipt schema is embedded directly; the two operation schemas are added to the engine's schema-resource set for closed-result validation. Engine resources are sourced from the broader generated core metamodel, so the listed `spec/core/schema.json` and commerce ontology hashes are provenance inputs rather than a claim that they enumerate the complete engine resource closure.

This checkpoint remains incomplete. The CONTRACT-058 version divergence, full predecessor control-order parity, and default-route integration remain open gates. The focused wire and installed host evidence does not establish whole-family R5 parity.
