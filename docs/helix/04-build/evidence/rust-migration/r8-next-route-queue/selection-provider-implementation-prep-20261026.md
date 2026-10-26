---
ddx:
  id: umf.evidence.rust-migration.r8-selection-provider-implementation-prep
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.evidence.rust-migration.r8-selection-registry-provider-design
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-selection-reference-host-baseline
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-post-selection-ledger-prioritization
      kind: informed_by
    - id: umf.evidence.rust-migration.r5-selection
      kind: informed_by
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-040
      kind: informed_by
---

# Core Selection provider implementation preparation

This is a read-only file-level implementation proposal for a raw-host Rust
Core Selection route. It does not authorize source edits while the coordinated
source freeze remains active. The prior [Registry addendum](../r8-selection-reference-host-baseline/registry-provider-design-20261026.md#addendum-caller-owned-registration-behavior-2026-10-26)
corrects the original schema-recompilation proposal: a JS `Registry.get` may
return an arbitrary registration whose getters and structure function are
part of the predecessor behavior.

## Confirmed call signatures and seams

- `Registry::get(&self, id: &Utf16, version: &Utf16) -> Option<&Registration>`
  is public in `crates/umf-core/src/registry.rs`; `Registry` stores
  `Vec<Registration>`. `Registration` owns its manifest/schema and exposes
  `scopes()`, `schema()`, `semantic()` and `token()`. Do not change those
  public APIs.
- `Capabilities::validate_extension_with_context(&mut self, token: u64,
  payload: &Value, context: &SemanticContext, ctx: &mut Context) ->
  Result<Vec<Diagnostic>, CapabilityError>` is in
  `crates/umf-core/src/engine.rs`. `CapabilityError::Host(Utf16)` already
  represents a semantic callback failure that becomes the configured failure
  diagnostic. `CapabilityError::Engine` remains an operation refusal.
- `constraints::eval`, `exec`, `extension_errors`, and
  `execute_constraints_admitted_observed` in
  `crates/umf-core/src/constraints.rs` all receive a concrete
  `&Registry`. There are two observable lookup sites: the `registered` query
  operator (`reg.get(...).is_some()`) in `eval`, and the per-extension-payload
  lookup in `extension_errors`. Both must become provider calls at those exact
  program/payload positions; do not preload or cache.
- `Engine::validate_document(&self, value, registry, capabilities, ctx)` and
  private `validate_admitted_document` in `engine.rs` own the structural gate.
  `validate_admitted_document` does not execute constraints after a structural
  refusal. Internal provider-aware siblings can be added while existing public
  static methods wrap a `Registry` provider.
- `selection::select_core_elements(input, query_input, engine, registry,
  capabilities, ctx)` in `crates/umf-core/src/selection.rs` owns the tagged
  copied-value operation. A separate raw-host dispatcher must first call
  `copy_host_json` on source then query, validate the query, then pass admitted
  values into a provider-aware selection helper. The JS default parameter is
  `registry = new Registry()` in `src/model/selection.ts`; default-root wiring
  must preserve this behavior when the third argument is omitted.
- `HostJsonEvent` and `HostJsonReflection` in
  `crates/umf-core/src/host_json.rs` currently cover primitive reflection and
  `copy_host_json`; `HostJsonReply` is a closed typed reply. The Node/WASM
  wrappers implement the same synchronous protocol. Node's `NodeHostJson` in
  `bindings/core/node/src/host_json.rs` stores `Env`, dispatcher and string
  lengths; `reflect` serializes each event and synchronously calls the JS
  dispatcher. The dispatcher in `bindings/core/node/src/host-json.js`
  maintains invocation-local maps and a `hasThrown`/`thrown` slot; after the
  addon returns, it rethrows the exact saved value. WASM has the parallel
  `host_json.rs` plus `host-json.js` wrapper. The shared host-input patterns
  are `schema_properties_host_json.rs` and the four-operation wrappers in both
  bindings; copy their lifecycle and five-resource initialization, not their
  operation-specific stage order.

## Required implementation sequence after source freeze

1. **Freeze the TS behavior and controls.** Keep the explicit-reference
   `selection-reference-host-baseline` as the oracle. Add exact event assertions
   for a `registered(id, version)` constraint interleaved with multiple
   extension payloads. Cover lookup method receiver, falsy and truthy custom
   returns, all manifest/scope/structure/capability/semantics accessors,
   structure-false diagnostics, semantic results, callback throw conversion,
   throwing `String(error)`, and strict identity for every escaping host throw.
   Preserve the twelve R5 frozen selection comparisons and current raw source /
   query reflection order.
2. **Add internal Registry provider abstraction.** In `registry.rs`, define a
   crate-private provider boundary with a static adapter over `Registry::get`;
   do not alter the public Registry surface. Carry provider access through
   `constraints::eval`, `exec`, `extension_errors`, and the admitted constraint
   entrypoint, then through internal Engine validation methods. Keep the
   current tagged `select_core_elements` and validation APIs as static-adapter
   wrappers. Add Rust tests proving unchanged static behavior and exact lazy
   ordering for `registered` and extension payload lookups.
3. **Resolve the host registration representation before coding callbacks.**
   Node/WASM values cannot be returned as Rust `Registration`: doing so would
   erase custom `structure` functions and getter/proxy behavior. The leading
   candidate is an invocation-local opaque registration handle returned from
   a lazy `Registry.get` event. A found handle remains host-owned until the
   payload stage; the static provider instead returns `&Registration`. No
   operation may inspect or enumerate registry members before a lookup.
4. **Add a Rust-owned host Selection dispatcher.** A new private module under
   `crates/umf-core/src/` should own source-then-query admission, query
   validation, source validation, selection and output encoding under one
   `Context`. Keep the five trusted resources exactly:
   `coreSchema`, `referenceSchema`, `packageSchema`, `constraints`, and
   `domainPolicy`. Add the wire operation in `crates/umf-core-wire/src/lib.rs`
   without replacing tagged `model/selectCoreElements`; only an explicit
   default V4 facade may call the host-input operation.
5. **Extend the common host protocol in both binding families.** Add the
   smallest closed events/replies to `umf-core/src/host_json.rs` and the
   equivalent serialization/parser branches in Node and WASM `host_json.rs`.
   Add JS dispatcher handlers in both `host-json.js` files. Lookup and
   registration property/structure failures must enter `hasThrown`/`thrown`
   and escape by strict identity. A semantic callback throw must be caught at
   the callback stage, converted by the predecessor's `String(error)` rule,
   and returned as a failure diagnostic; if string conversion throws, save and
   rethrow that new exact value through the shared slot.
6. **Implement and test the V4 default boundary.** Add
   `src/access/rust-core-selection-default.ts`, inject the explicit five
   resources from `CORE_MODEL_RESOURCES`, and explicitly select the operation
   in `src/index-node-v4.ts` and `src/index-browser-v4.ts`. Update the strict
   per-file import allowlist only for this exact facade and add negative
   controls. Keep the public signature `(input, queryInput, registry?)`; do
   not add controls or fallback behavior.
7. **Gate by host and fixed point.** Run focused Rust static/provider tests,
   wire scripted-host tests, Node addon tests, WASM browser tests, package-root
   Node and Bun tests, and real Chromium against explicit `./reference`.
   Require exact complete results/refusals, traces and thrown identity. Produce
   receipts only from a fixed-point archive with a matching live source closure;
   private archive evidence does not alter the ledger by itself.

## Choices for Sol review before step 2

1. **Provider contract:** choose between a generic lookup trait returning
   `Borrowed(&Registration)` or `HostHandle`, and a narrower provider that
   exposes separate `registered()` and `extension_stage()` methods. The former
   resembles the existing Registry API but complicates lifetimes and static
   versus dynamic registration semantics. The latter makes host callbacks
   explicit at both existing sites but risks moving core validation behavior
   into the host adapter. The preferred direction is the narrow provider API
   with a Rust static implementation and host-specific staged operations.
2. **Where to run caller-owned structure logic:** a JS composite operation
   preserves exact property/function behavior and receiver identity, but moves
   scope/structure/capability branching into the host. Separate scope,
   structure, capability and semantics events retain more Rust control, but
   create more protocol states and can read entry fields at the wrong point.
   Select one and write a state machine with exact read order before changing
   `constraints.rs`.
3. **Callback value transport:** Rust currently stores JSON `Value`, while
   TypeScript calls structure and semantics with fresh `copyJson` values and
   later spreads returned diagnostic arrays. Decide how Rust-owned payload and
   document copies become fresh ordinary JS values, how returned diagnostics
   cross back without losing unknown fields or changing accessor/iterator
   behavior, and how these conversions charge the same `Context` limits.
4. **Kind-runtime conditional:** the mismatch is confirmed for ordinary
   Selection. `src/validation/document.ts` delegates to
   `registry.kindRuntime.validateDocument` only when `kindRuntime` is present.
   Otherwise `constraint-kernel.ts` uses the `external()` path, which performs
   `Registry.get`, scope, structure, capability and semantics checks without a
   `kinds::occurrence` call. Rust `constraints::extension_errors` currently
   invokes `kinds::occurrence` unconditionally before scope/schema checks.
   Therefore the raw-host provider for an ordinary Registry must skip Rust kind
   occurrence. A Registry carrying `kindRuntime` is a distinct conditional
   behavior: it needs an explicit host dispatch and parity design for
   `kindRuntime.validateDocument`; it cannot be selected by the normal raw-host
   route until that branch is specified and tested. Do not merge the two
   branches or infer kind validation from package registration metadata.
5. **Error boundary:** the shared host dispatcher normally captures every
   thrown value. The host implementation must distinguish propagation stages
   from semantic callback failures without reading properties from thrown
   values. Confirm that `String(error)` conversion is performed exactly once,
   and only for semantic callback throws.
6. **Absent Registry and static path:** define whether an omitted third
   argument receives a fresh host-side empty `Registry` or is represented by
   a provider with no registrations. This must preserve the JS default
   parameter while keeping tagged Rust/static callers unchanged.

The existing host-shape baseline already reports that arbitrary registration
property access is observable and that structure false produces source
validation diagnostics. Its Node/Bun/Chromium receipts are TypeScript
predecessor evidence only. No Rust behavior is qualified by this packet.
