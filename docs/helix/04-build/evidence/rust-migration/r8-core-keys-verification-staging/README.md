---
ddx:
  id: umf.evidence.rust-migration.r8-core-keys-verification-staging
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-040
      kind: informed_by
    - id: TP-001
      kind: informed_by
    - id: umf.evidence.rust-migration.r5-core-keys-default-route
      kind: informed_by
    - id: umf.evidence.rust-migration.r7-core-key-staged-verification
      kind: references
---

# R8 Core Key verification staged-boundary packet

## Objective and current state

This packet defines the next integration boundary for `verifyCoreKeyOperation`:
preserve the TypeScript predecessor's receipt-before-current behavior through
an opaque Rust-owned stage, while carrying one invocation's host and Rust work
controls across both operands. It is a preparation for implementation and
review; it does not select the verifier into a default root.

The core one-use stage already exists. In
`crates/umf-core/src/core_keys.rs`, `checked_key_receipt` copies and validates
the receipt, recomputes its operation and compares the complete result.
`PreparedCoreKeyOperationVerification` retains the verified receipt;
`verify_current(self, ...)` compares the current value with the receipt target
(or source for read-only receipts) and moves out the retained receipt without
recomputing it. `crates/umf-core-wire/src/core_key_verification_binding.rs`
owns a retained Engine/Registry and binds stages to that runtime. Node N-API
and WASM expose corresponding `CoreKeyVerificationRuntime` and
`PreparedCoreKeyVerificationHandle` classes whose Rust `Option::take` makes
finish one-use. The JS core-keys facades use closure-private WeakMaps for
opaque, frozen, engine-bound tokens and consume a token on finish.

Those pieces cover semantic recomputation and forged, cross-engine and reused
stage refusal. They do not yet establish full public-host parity: the
checked-in predecessor has known source drift, null-receipt behavior is not
matched by the Rust receipt schema path, and current Node/WASM index helpers
construct a new control bridge and host-work counter at each stage. The older
R7 review covers bounded retained-runtime checks; the controls and TypeScript
admission gaps below remain open for this R8 integration.

## Governing predecessor behavior

`src/model/keys.ts::verifyCoreKeyOperation` performs these steps in order:

1. `copyJson(input)` admits a detached receipt without invoking accessors.
2. It reads the copied `receipt.version` and checks the receipt schema. For a
   `null` receipt, that ordinary JavaScript property read throws a host
   `TypeError`; `undefined` is refused earlier by `copyJson`.
3. It recomputes the operation from retained source, identity and request, then
   compares the full receipt. Any refusal stops before current is read.
4. Only after successful receipt verification does it `copyJson(current)` and
   compare against target (or source for inspection/lookup receipts).

The historical baseline is
[`r5-core-keys-default-route/frozen-typescript.json`](../r5-core-keys-default-route/frozen-typescript.json),
SHA-256 `3ee774e9d623c18f1d109cb9f6ce86b4c0957be24bd874c74fc6c375aa593323`.
Its ten host controls include malformed, null, primitive and valid receipts
paired with an accessor on `current`, and pin zero current getter calls when
receipt admission refuses. The 700,000-unit unknown qualifier is a retained
value check, not a measurement of cumulative max-work or cancellation. That
historical packet is not a current-source closure: its generated model,
validator and schema/resource hashes differ from the latest private archive.
Use the persisted current packet in
[`r8-core-keys-default-boundary/refreshed-predecessor-20261025.json`](../r8-core-keys-default-boundary/refreshed-predecessor-20261025.json)
for the current 25-source Core Keys cohort, while preserving the uncaptured
UUID fixture limitation documented in that packet's installed receipt.

The packet freezes a Bun TypeError message from one host. Node, Bun and
Chromium may format native TypeError messages differently. Cross-host
acceptance must compare each staged route with the same-host `./reference`
implementation, including error name, message and trace; it must not force
one host's engine-generated message onto another.

## Required stage protocol

The public operation remains synchronous and behaves as one logical call:

```text
start invocation controls and resource budget
  -> admit/copy receipt on host
  -> Rust prepare: decode, validate receipt schema, recompute, compare receipt
  -> return opaque handle only after successful prepare
  -> admit/copy current on host using the same controls and remaining budget
  -> Rust finish: compare current and consume retained receipt
  -> return verified receipt or refusal
```

Receipt failure MUST happen before reflection, getter invocation, copying,
encoding, or transport of `current`. Current failure after prepare MUST consume
the stage. Prepare failure MUST return no stage. Rust finish MUST reject a
forged or cross-runtime handle and MUST consume a valid handle exactly once,
including when current decode, current admission, stale comparison, control,
or result encoding fails. An opaque Rust-owned handle is required; a tagged JSON
`prepared` value is forgeable and cannot serve as the handoff.

### Admission and error order

The default host wrapper must preserve the exact predecessor order, not merely
the final `CORE_KEY_RECEIPT` code:

- Copy the receipt with descriptor-based JSON admission first. Do not invoke a
  receipt accessor or `toJSON`.
- Preserve the predecessor's null boundary. Rust's current schema refusal for
  `Value::Null` does not reproduce the TypeScript `receipt.version` TypeError.
  Add a narrow host compatibility step after safe copying and before Rust
  prepare, or retain a TypeScript route for null, then compare against the
  same-host reference. Do not read properties from the original receipt.
- On every other receipt error, stop before inspecting `current`; the frozen
  current getter count remains zero.
- Only after a live opaque handle exists, safely copy and encode current.
  Do not call finish with a prepared receipt JSON object.
- Preserve TypeScript diagnostic code/message/path for `CORE_KEY_RECEIPT` and
  `CORE_KEY_STALE`; keep transport/control errors classified as controls.

The smallest safe default-route proposal is to leave the public signature and
error taxonomy unchanged and let `bindCoreKeysRust` orchestrate the stage.
Keep prepare/finish tokens closure-private to that orchestration unless the
existing candidate engine API is deliberately supported as a public staged
API. The binding declaration currently exposes prepare/finish methods; decide
whether they are internal implementation hooks or supported methods before
relying on their lifetime contract.

### One-use lifetime and bounds

The current inner Rust handle consumes itself via `Option::take`; the JS
WeakMap deletes its token before invoking finish. Preserve this rule in all
layers. A failure while copying current must not permit a second finish or
retain an unreachable native handle indefinitely. Either add an explicit
discard path used in `finally`, or keep the stage token private and prove the
native wrapper releases its handle deterministically on failed finish and
garbage collection.

If prepare/finish remains callable independently, cap outstanding stages per
runtime and define discard/expiry behavior. CONTRACT-040 specifies receipt
meaning, not stage retention, so unbounded retained receipts or an invented
timeout are not authorized by the contract. Prefer a synchronous internal
verify call when public staged methods are not required.

### Work, cancellation and resource limits

Node's `createNativeCoreKeyVerificationOperations` in
`bindings/core/node/index.js` and its WASM counterpart in
`bindings/core/wasm/index.js` currently create a fresh control bridge and
`admissionWork` closure in both `prepare` and `finish`. Unlike the staged Core
Record Type wrapper, Core Key does not currently return `{handle, bridge,
work}` from prepare. This resets JS-side `maxWork` accounting between receipt
and current, even though the Rust stage retains `TransportUsage`.

For one logical verifier invocation:

- Keep one control dispatcher and one host-work counter from before receipt
  copying through current-result encoding. `maxWork`, meter calls, deadline,
  cancellation and control-failure provenance must span the complete pair.
- Seed/capture Rust `TransportUsage` across prepare and finish as the existing
  Rust handle does. Do not charge receipt recomputation a second time.
- Preserve per-value structural bounds (`maxDepth: 128`,
  `maxValues: 100_000`) on each host operand, plus the transport/context limits;
  distinguish these per-operand caps from cumulative work.
- Precharge before decoding/copying large values and before response encoding;
  refusal is atomic and returns no partial receipt.
- Test cancellation and deadline both during receipt recomputation and while
  admitting/comparing current. A failure in either stage remains a control
  refusal, never `CORE_KEY_RECEIPT` or `CORE_KEY_STALE`.

Do not count the frozen 700,000-unit retained-value case as proof of these
controls. It establishes only that this captured unknown payload is retained
through the selected receipt operation.

### Semantic and extension limits

Preparation must preserve the complete receipt, source, request, target,
unknown extension properties and UTF-16 content exactly. Rust may compare
canonical object meaning but must return the retained receipt without a second
copy or normalization. Verification establishes consistency only; it does not
authenticate a declaration, prove author provenance, select native key
semantics, or prove database uniqueness.

The current `CoreKeyVerificationRuntime` uses `NoExtensionCapabilities`.
Operations whose source validation requires an extension callback are outside
that runtime's demonstrated scope. Do not silently broaden or discard this
boundary; either preserve the TypeScript route for such inputs or add an
explicit, separately qualified callback capability.

## Exact implementation map

| Layer | Current owner | Required integration |
|---|---|---|
| Predecessor | `src/model/keys.ts` | Preserve receipt-copy, version/schema, recomputation, receipt compare, then current-copy order. |
| Public host adapter | `src/access/rust-keys-default.ts` | Keep the operation signature; safe-copy receipt, invoke prepare, only then safe-copy current and finish. Add null host-error compatibility and deterministic cleanup for current admission failure. |
| Rust semantics | `crates/umf-core/src/core_keys.rs` | Retain one receipt after full recomputation; finish compares current and moves receipt without recomputation/copy. Add or extend regression tests only where current behavior lacks proof. |
| Rust owner | `crates/umf-core-wire/src/core_key_verification_binding.rs` | Keep exact five-resource engine, unforgeable engine-bound stage and Rust `TransportUsage` across both methods; test one-use, cross-engine, forged and dropped stages. |
| Tagged adapter | `crates/umf-core-wire/src/lib.rs` | Keep `prepareCoreKeyVerification` as a differential/diagnostic operation only; never accept its serialized result as finish authority. Retain existing full stateless verify for parity tests. |
| Node runtime | `bindings/core/node/src/core_key_verification.rs`, `bindings/core/node/src/core-keys.js`, `bindings/core/node/index.js` | Preserve native one-use handle; carry one bridge/work closure across both host operands; consume before finish admission and map Rust/control errors distinctly. |
| Browser runtime | `bindings/core/wasm/src/core_key_verification.rs`, `bindings/core/wasm/src/core-keys.js`, `bindings/core/wasm/index.js` | Match Node behavior with the native WASM handle and the same invocation-wide control accounting. |
| API declarations | `bindings/core/node/index.d.ts`, `bindings/core/wasm/index.d.ts` | Resolve whether prepare/finish are internal or supported API; if retained, document opaque token bounds and discard/lifetime behavior. |
| Default roots | `src/index-node-v4.ts`, `src/index-browser-v4.ts` | No route change until parity and installed archive gates pass; then change both conditions together. Keep `./reference` TypeScript for the comparison. |

## Smallest safe implementation and test sequence

1. Refresh the TypeScript predecessor only in evidence files after the current
   source cohort is stable. Freeze exact receipts and refusal traces for
   success, altered/malformed/unknown receipt, null, undefined, primitive,
   invalid source, stale current, current accessor, receipt accessor, UTF-16
   unknown qualifier, and copy isolation. Capture Node, Bun and real Chromium
   same-host results; keep host-specific TypeError messages distinct.
2. Extend Rust unit and `umf-core-wire` runtime tests for all four receipt
   operation kinds, exact receipt tamper detection, unknown-property retention,
   `CORE_KEY_STALE`, no second recomputation, 700,000-unit retention, one-use,
   cross-engine/forged handles, current-decode failure consumption, and
   cumulative `TransportUsage`/host-control failure across stages.
3. Update the Node/WASM native wrappers to retain the control bridge/work
   closure in the stage object, bound or hide outstanding handles, and release
   a stage on every finish failure. Add one shared wrapper test matrix for both
   factories: receipt-before-current getter order, null reference parity,
   current admission failure consumes the handle, maxWork boundary, cancellation,
   deadline, meter exception provenance, and per-operand structural-limit
   refusals.
4. Test the public TypeScript adapter and candidate engine in Bun and Node;
   compare complete outcomes with each runtime's `./reference` implementation.
   Exercise raw getters/proxies and verify that no getter runs before its
   predecessor-equivalent refusal. Test a real Chromium WASM package with
   `process`/`Buffer` absent and no network access.
5. Build one fixed-point private SDK archive and replay the exact packet from
   installed package roots in Node, Bun and Chromium. Verify archive digest,
   member hashes and source closure before replay. Only then consider selecting
   `verifyCoreKeyOperation` in both default V4 roots and recapturing the R8
   inventory/ledger. A private replay is not retirement approval or release.

## Open decisions and explicit non-claims

- Confirm whether the candidate engine's `prepareCoreKeyVerification` and
  `finishCoreKeyVerification` methods are supported public API. If yes, set a
  bounded outstanding-stage policy and define explicit discard semantics; if
  no, hide them behind the synchronous verifier.
- Decide how the default facade reproduces `null` receipt TypeError in each
  host while preserving descriptor-safe copying. The safe comparison is to
  same-runtime TypeScript, not one frozen runtime's message on every host.
- Confirm whether callback-dependent extension validation is unsupported for
  this verifier route or needs a separately designed callback-capable runtime.
- This packet does not qualify a default route, support `verifyCoreKeyOperation`
  in a package root, change any ledger row, close any retirement gap, or claim
  release readiness.
