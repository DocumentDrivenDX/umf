---
ddx:
  id: umf.evidence.rust-migration.r8-selection-registry-provider-design
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.evidence.rust-migration.r8-selection-reference-host-baseline
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-post-schema-properties-next-route-decision
      kind: informed_by
    - id: umf.evidence.rust-migration.r5-selection
      kind: informed_by
    - id: umf.evidence.rust-migration.r5-selection-binding
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-040
      kind: informed_by
---

# Core Selection lazy Registry provider seam

This read-only design addendum traces the smallest Rust-side change needed to
preserve the TypeScript Registry lookup schedule for a future raw-host
selection route. It makes no source change, does not select the route, and
does not claim the provider is implemented or qualified. The associated
[reference baseline](README.md) establishes that source admission precedes
semantic callbacks, malformed query touches no Registry member, callback
results are observable in source order, and a thrown Registry Proxy lookup
value must escape by identity.

## Concrete lookup graph

The selection call currently receives a concrete `&Registry` and
`&mut dyn Capabilities`:

1. [`selection::select_core_elements`](../../../../../../crates/umf-core/src/selection.rs)
   copies source then query, parses the query, and calls
   `Engine::validate_document(&source, registry, capabilities, ctx)`.
2. [`Engine::validate_document`](../../../../../../crates/umf-core/src/engine.rs)
   copies the already admitted source for validation, then
   `validate_admitted_document` runs core structural checks. A structural
   refusal returns before constraint evaluation and therefore before any
   registration lookup.
3. `validate_admitted_document` calls
   `constraints::execute_constraints_admitted_observed` with the same concrete
   Registry and Capabilities.
4. [`constraints::extension_errors`](../../../../../../crates/umf-core/src/constraints.rs)
   iterates extension payload entries in source object order, resolves the
   vocabulary version, then calls `registry.get(id, version)` at the point of
   that payload. It subsequently checks kind occurrence and scope, validates
   the payload against the registration schema, and finally calls
   `Capabilities::validate_extension_with_context` for semantic registrations.
   These steps interleave one registration lookup and callback per payload;
   eager registration preload would move observable Registry traps ahead of
   this schedule.
5. The same `constraints::eval` also implements the `registered(id, version)`
   operation at `constraints.rs` near line 1948, by calling
   `reg.get(...).is_some()`. The Registry seam must cover this demand site as
   well; the constraint language may ask it before, between, or after
   extension payload diagnostics.

The concrete lookup is [`Registry::get`](../../../../../../crates/umf-core/src/registry.rs)
near line 539. It returns `Option<&Registration>`. `Registration` is
`Clone + Debug` and exposes `manifest()`, `schema()`, `token()`, `scopes()`,
`semantic()`, `id()` and `version()`. The public `Registry` owns its existing
`Vec<Registration>` and existing `register_extension`, `get` and `entries`
APIs. Those APIs should remain source-compatible.

The provider therefore has to flow through the recursive interpreter path:
`Engine::validate_document` → `validate_admitted_document` →
`execute_constraints_admitted_observed` → `exec` → `eval` and
`extension_errors`. It must also be available to `selection::select_core_elements`
without changing the existing public tagged/static call. These are the
specific Rust files for a later implementation:

| File | Narrow later change |
| --- | --- |
| `crates/umf-core/src/registry.rs` | Define an internal registration lookup abstraction and a static adapter over `Registry::get`; leave `Registry` methods intact. |
| `crates/umf-core/src/constraints.rs` | Thread the lookup abstraction through `eval`, `exec`, `extension_errors`, and the admitted constraint entrypoints; invoke it exactly where the two existing `registry.get` calls occur. |
| `crates/umf-core/src/engine.rs` | Add internal lookup-aware document validation/constraint entrypoints; keep current public methods as static-Registry wrappers. |
| `crates/umf-core/src/selection.rs` | Add an internal lookup-aware selection helper and keep `select_core_elements(..., &Registry, ...)` as the unchanged static wrapper. |
| `crates/umf-core/src/host_json.rs` | If adopted, add invocation-local Registry and semantic callback protocol requests to the existing host reflection boundary, preserving its captured exception mechanism. |
| `crates/umf-core-wire/src/lib.rs` | Keep tagged `model/selectCoreElements` routed through the static adapter; add a separate host-input operation only for the approved default route. |
| `bindings/core/node/src/host-json.js`, `bindings/core/node/src/host_json.rs` | Implement the lazy event with Node's existing `hasThrown`/`thrown` identity propagation. |
| `bindings/core/wasm/src/host-json.js`, `bindings/core/wasm/src/host_json.rs` | Implement the same event and thrown-value behavior for synchronous wasm-bindgen calls. |
| `src/access/rust-core-selection-default.ts`, `src/index-node-v4.ts`, `src/index-browser-v4.ts` | Later facade/root work only after provider review and tests; this addendum does not authorize those edits. |

## Minimal provider shape

The smallest general seam is a fallible lookup abstraction at the exact
existing lookup sites. It must support the static Registry without copying
registrations and a host provider that retains an opaque caller-owned
registration after a lazy callback. A conceptual Rust shape for review is:

```rust
pub(crate) enum RegistrationRef<'a> {
    Borrowed(&'a Registration),
    Host(HostHandle),
}

pub(crate) trait RegistryLookup {
    fn lookup<'a>(
        &'a mut self,
        id: &Utf16,
        version: &Utf16,
        ctx: &mut Context<'_>,
    ) -> Result<Option<RegistrationRef<'a>>, EngineError>;
}
```

`RegistryLookup for Registry` returns `Borrowed(self.get(id, version))`, so the
existing route pays no registration clone cost and preserves all public APIs.
The host implementation performs one synchronous host callback only when
`lookup` is reached and retains a handle to the returned JS object in the
invocation. The constraints interpreter must dispatch the `Host` variant to
the staged caller-owned structure/semantics protocol described below. Do not
cache a host lookup across payload occurrences: the current kernel calls it
for every matching extension payload.

The shape above is an interface proposal, not a final signature. The provider
may need a separate typed error to distinguish a protocol failure from a
caller-thrown host value, but it must not expose a new public error type. A
simple internal `EngineError` marker is sufficient only because the existing
host-json wrapper keeps thrown values in the invocation-local JS closure and,
after the Rust call returns, rethrows the exact original value when
`hasThrown` is set. On both Node and WASM, the Registry lookup event must use
that same mechanism. Do not convert a Registry Proxy/getter trap into a UMF
diagnostic or read `.name`, `.message`, `.code`, or `.path` from the thrown
value.

The trait needs a mutable receiver because Node/WASM providers dispatch a
callback and update per-call handle state. This changes recursive internal
function parameters from `&Registry` to the provider abstraction. Public
functions such as `Engine::validate_document`, `Engine::run_core_constraints`,
`constraints::run_core_constraints`, and
`selection::select_core_elements` remain available unchanged and construct a
static adapter internally. The host-input entrypoint alone calls an internal
lookup-aware function.

## Lookup versus semantic callback fault rules

The two host interactions have deliberately different error treatment:

| Stage | TypeScript behavior | Required Rust/host behavior |
| --- | --- | --- |
| `Registry.get(id, version)` lookup or Proxy trap | A thrown value escapes selection unchanged. | Provider callback uses the host-json thrown-value slot; Rust stops and returns a marker, wrapper rethrows the saved original host value by identity. |
| Structure validator reports errors | Validation diagnostics are appended in the function's error order and semantic callback does not run. | The host route calls the caller-owned `entry.structure(payload)`, then returns its ordered errors for Rust to place into the existing diagnostics. The static Rust Registry retains core-owned schema validation. |
| Semantic callback returns diagnostics | Returned diagnostics append at that payload's location in order. | The static path keeps its `Capabilities` token callback. The host path invokes the original caller-owned function on the opaque registration at this exact stage and returns its ordered diagnostics for Rust placement. |
| Semantic callback throws an ordinary error | `constraint-kernel.ts` catches it and uses `String(error)` to create the configured `failure` diagnostic. | Do not treat it like a Registry lookup trap. Convert the callback throw to the same diagnostic. If `String(error)` itself throws, preserve that new thrown value using the host-json thrown slot, matching JavaScript catch behavior. |

The current host-json bridge already has a single synchronous dispatcher
closure per call, opaque object handles assigned without reflection, and a
`hasThrown`/`thrown` slot. Primitive reflection events catch a host exception,
return a protocol marker to Rust, then rethrow the exact original value after
the addon/WASM endpoint returns. A Registry provider event can reuse this
pattern, but ordinary semantic callback throws must be caught and converted
at the callback stage rather than falling through to the shared top-level
`hasThrown` slot.

For the raw-host route, `Registry.get` may return a custom registration with
arbitrary getters and validator functions. Keep that object opaque and let the
same synchronous host dispatcher execute its caller-owned methods at the
predecessor's stages. Node and WASM must share the protocol event contract;
Rust remains responsible for the surrounding traversal, work accounting and
diagnostic placement in one Context. If either binding cannot preserve that
stage order and thrown identity, stop before default selection.

## Focused tests required before root routing

Add tests in the existing Rust and Node/WASM host-json test layers. Suggested
targets are `crates/umf-core/tests/r5_selection.rs`,
`crates/umf-core/tests/constraints_registry_lookup.rs` (new),
`crates/umf-core-wire/tests/r5_selection_host_json.rs` (new), and a focused
TypeScript test under `tests/rust-migration/` for the default facade once it
exists. Required tests:

1. Static adapter parity: existing `Registry::get`, `registered(...)`,
   document validation, and all R5 selection success/refusal vectors remain
   byte-for-byte unchanged; static lookups do not clone or reorder entries.
2. Lookup event order: malformed query performs no host event; invalid source
   shape performs no lookup; unknown or undeclared extension payloads perform
   no lookup; two payloads produce two `get` events in payload insertion
   order; `registered(...)` occurs at its exact program position relative to
   extension callbacks.
3. Callback sequence: structure failure suppresses semantics; successful
   structure invokes semantics once per payload; returned diagnostics preserve
   order; a semantic throw becomes a `failure` diagnostic; Registry lookup
   throw escapes by strict identity; a thrown `String(error)` conversion also
   escapes by strict identity.
4. Host adversarial cases: Registry `get` accessor and Proxy get trap are not
   observed until source structural admission; each callback receives copied
   payload/document and exact path/scope; a later payload lookup trap occurs
   after earlier callback effects, as in TypeScript; no callback/lookup is
   repeated or skipped by Rust caching.
5. Cross-host: the same cases pass the Node addon and browser WASM endpoint;
   Bun package-root evaluation uses its Node binding and must agree. Preserve
   the full R5 controls/resource limits as separate route-level evidence, not
   new TypeScript parameters.

Do not route package-root `selectCoreElements` until Sol reviews the proposed
trait signature, dynamic registration admission, and the different lookup vs
semantic callback exception paths above. The static API remains untouched by
this proposal.

## Addendum: caller-owned registration behavior (2026-10-26)

The initial proposal above to return a manifest/schema to Rust and recompile
`manifest.schema` is insufficient for the host route. The TypeScript
`constraint-kernel.ts` consumes the object returned by `Registry.get` directly.
`Registry.get` is an ordinary overridable method, and a Proxy can return a
custom registration whose `structure` function and accessor behavior are
observable. Recompiling only its schema would skip these behaviors and could
change both results and thrown-value identity. This addendum supersedes the
“return the registration's JSON schema/metadata to Rust” recommendation above
for the raw-host route.

The static Rust `Registry` path can continue using core-owned `Registration`
and schema validation: its registrations are internal values and its public
`get`, `register_extension`, and `entries` methods need not change. A new
raw-host route must instead preserve the live TypeScript registration protocol
at each existing demand point. The minimal safe split is a tagged provider:
the static adapter yields a Rust registration reference; the host adapter
retains an opaque, invocation-local JS registration handle and delegates the
caller-owned registration stage back to the existing synchronous host
dispatcher. It must not serialize or reconstruct arbitrary registrations.

For the extension-payload path, preserve this order exactly:

1. Call `Registry.get(id, version)` at the point `extension_errors` currently
   looks up the payload. The constraint evaluator's separate
   `registered(id, version)` operation remains a distinct earlier/later lookup
   at its existing `eval` site. Do not preload, memoize, or enumerate entries.
2. Read `entry.manifest`, then `manifest.scopes`, then `scopes.includes(scope)`
   and call `includes` with its original receiver. These reads and the call can
   invoke getters or Proxy traps.
3. Read `entry.structure` and call it directly as `entry.structure(payload)`.
   If it returns false, read `entry.structure.errors ?? []` and visit each
   diagnostic in order, reading its `instancePath` and `message`. Do not read
   `.errors` on a successful result. A false result prevents capabilities and
   semantics access.
4. On structural success, read `entry.manifest.capabilities.validation`, then
   read `entry.semantics`; call a truthy semantic callback with the same
   payload/context the TypeScript kernel supplies. Append its returned
   diagnostics in order.
5. A throw from Registry lookup, any registration getter/trap, scope check,
   structure getter/call, or structure error access escapes with the exact
   thrown value. These stages are outside the semantic callback catch.
   Semantic callback throws are caught and converted using `String(error)` to
   the configured failure diagnostic. If `String(error)` itself throws, that
   new thrown value escapes unchanged.

The route should keep one Rust `Context` for selection, constraints, and output,
but context sharing does not authorize moving registration reads across
semantic stages. A private host protocol can expose narrowly staged operations
for lookup/presence and per-payload registration evaluation. The latter should
execute the complete JS access/callback sequence above so getters, custom
functions, and `this` receivers remain ordinary JavaScript behavior. Host
exceptions from stages that propagate must use the existing invocation-local
`hasThrown`/`thrown` slot; semantic callback exceptions are first stringified
and converted at the semantic stage, with a failure of stringification using
that same thrown slot. Node and WASM must use the same protocol.

The refreshed TypeScript reference harness freezes custom-registration
controls in Node, Bun, and Chromium 153.0.8010.12. It covers ordered
`Registry.get` calls and manifest/scopes/capabilities/structure/semantics
access, false-structure diagnostic capture and semantic suppression, strict
identity for thrown manifest/scopes/includes/structure/errors/capabilities/
semantics values, semantic-throw conversion, and a throwing `String(error)`.
Each host still matches all 12 frozen R5 comparisons. These are reference
observations only; they do not qualify a Rust route.

Before route authorization, add exact harness assertions for the number and
relative order of lookups when constraints contain `registered(...)` alongside
multiple extension payloads; freeze operation context and each emitted
diagnostic field; and repeat the custom-registration matrix against the
source-current Node/WASM Rust endpoint in Node, Bun, and Chromium. Static Rust
Registry tests should separately prove schema validation and callback parity
remain unchanged.
