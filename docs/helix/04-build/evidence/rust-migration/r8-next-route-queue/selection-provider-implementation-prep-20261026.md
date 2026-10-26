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

This file began as a read-only implementation proposal during a coordinated
source freeze. That freeze has since been lifted for the reviewed scoped
implementation work; the decisions below define interface and parity gates,
not an authorization for default-route selection. The prior
[Registry addendum](../r8-selection-reference-host-baseline/registry-provider-design-20261026.md#addendum-caller-owned-registration-behavior-2026-10-26)
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

## Sol interface direction after the interleaved Registry baseline

The later [reference baseline](../r8-selection-reference-host-baseline/README.md)
pins an exact 47-event trace: three `registered` demand sites precede four
document/element payload lookups, with seven `Registry.get` calls and no
memoization. The Node, Bun and Chromium references agree. This still says
nothing about Rust route parity.

The production direction is a crate-private, invocation-local provider with
lazy lookup at those same Rust evaluation sites. The static implementation
borrows the existing `Registration`; the host implementation retains an
opaque handle to each caller-owned JavaScript registration. It must not
convert a host registration to Rust `Registration`, enumerate it early, or
change the public `Registry` API. The Rust state machine will own scope,
structure, capability, semantic and diagnostic branching. Node and WASM host
dispatchers will expose only ordered property-get, call-with-receiver,
truthiness/nullish and iteration operations on opaque handles. This keeps
UMF's executable decision logic in Rust while preserving caller getter,
Proxy, callback, receiver and thrown-value behavior. A single host-side
`evaluate_registration` composite is rejected for this port because it would
leave those UMF branches in JavaScript.

The host adapter must materialize fresh predecessor-compatible payload and
document copies from Rust-owned values at the exact predecessor stages: arrays
retain the native array prototype and objects use null prototypes. Retain
unknown callback diagnostic fields and iteration order. The semantic result
spread catches the callback invocation and each iterator operation's first
throw for one `String(error)` conversion; a failure in that conversion, and
every Registry, structure, or `structure.errors` failure, propagates by exact
identity through the shared thrown slot. An omitted Registry gets a
fresh empty host Registry for each call; an explicit argument follows the
TypeScript default-parameter rules. The ordinary no-`kindRuntime` path and
the `kindRuntime.validateDocument` branch remain distinct. The latter is not
eligible for the selected Rust route until separately specified and tested.

This is a reviewed interface choice, not an implementation or release claim.
The following closed primitive event/reply schema is the implementation
foundation. It extends the private `umf.host-json/1` dispatcher; it does not add
a wire operation or default route.

### Opaque callback primitive protocol

`get-opaque-property` has request fields `receiver`, `key`, and `semanticCatch`. The receiver
uses the `invoke-opaque` receiver encoding below, so primitive property reads
retain JavaScript boxing while null and undefined reads throw natively. `key`
is either `{kind: "string", units: u16[]}` or `{kind: "iterator-symbol"}`.
It performs one ordinary `receiver[key]` read with the original receiver. When
`semanticCatch` is false, a throw uses the exact-identity `host-exception` slot.
When true, the catch covers only that property access, stringifies the first
thrown value exactly once, and returns `semantic-throw` with a StringRef; if
stringification throws, that new thrown value uses the identity slot. Rust must
set this only for the semantic result iterable's `Symbol.iterator`, iterator
`next`, `done`, and `value` operations. Registry, structure, lookup, and
`structure.errors` reads use false. Its ordinary success reply is
`{kind: "opaque-value", value: V}`. `V` is one of `{kind: "undefined"}`,
`{kind: "null"}`, `{kind: "boolean", value: bool}`,
`{kind: "number", bits: 16-hex IEEE-754 bits}`,
`{kind: "string", token: u64, units: usize}`, or
`{kind: "opaque", handle: u64, opaqueType: "object"|"function"|"symbol"}`, or
`{kind: "bigint", handle: u64, isZero: bool}`. Opaque handles refer to
objects, functions or symbols; `opaqueType` is an inert `typeof` distinction,
and missing or unknown values are protocol errors.
bigint handles preserve identity and carry the zero bit needed for JavaScript
truthiness (`0n` is falsy). Neither handle kind claims JSON compatibility or
callability. `undefined`, `null`, all number bit patterns and UTF-16 string
units remain distinct. No coercion is performed.

`invoke-opaque` has fields `function`, `receiver`, `args`, and
`semanticCatch`. A receiver/argument is `{kind: "undefined"}`,
`{kind: "opaque", handle: u64}`, or `{kind: "json", value: TaggedJson}`;
`TaggedJson` is the existing `umf.core-wire/1` tagged Value tree. Primitive
values are rehydrated directly, preserving UTF-16 units and IEEE-754 bits,
including NaN, infinities, and negative zero, without admission or coercion.
Arrays and objects are materialized as fresh predecessor-compatible callback
copies: arrays retain the native array prototype and objects use null
prototypes. Arguments are an ordered array. The dispatcher uses
`Reflect.apply(function, receiver, args)` once.
With `semanticCatch: false`, a throw sets the existing invocation `thrown`
slot and returns the ordinary `host-exception` marker. With
`semanticCatch: true`, the catch is scoped only to that invocation: it runs
`String(error)` exactly once and replies
`{kind: "semantic-throw", message: StringRef}`. If string conversion throws,
that new thrown value enters the existing exact-identity slot. Success replies
`{kind: "invocation", value: V}` with the same `V` representation above.

`string-concat` carries a UTF-16 `prefix` and one `value` using the same
receiver/argument encoding. The prefix is reconstructed as a JavaScript string
and the dispatcher performs exactly `prefix + value`; because the left operand
is a string this invokes native ToPrimitive with hint `default`, followed by
native string conversion. A successful reply is the existing
`opaque-value`/StringRef form. Throws use the ordinary exact-identity host
exception slot. Rust charges one host operation and the returned UTF-16 units
before reading the result string. Native coercion work inside JavaScript cannot
be metered by this primitive, so this does not establish resource parity. The
primitive is intended for `at + error.instancePath`; it does not implement the
enclosing structure diagnostic flow.

The JS dispatcher does not implement truthiness, nullish tests, callback
branching, or iteration. Rust evaluates truthiness/nullish from `V` (object,
function and symbol handles are truthy; bigint carries its zero bit); it drives
iterator use by reading `Symbol.iterator`, invoking it with its receiver,
reading `next`, invoking it, and reading `done` and `value` in predecessor
order. Semantic-result iteration requests semantic catch for each primitive
get/invoke; other iteration requests do not. Every event remains synchronous.
No unknown callback value is flattened or converted to a diagnostic by this
foundation. How arbitrary callback diagnostic objects enter the
existing Rust result model under one `Context` remains unresolved and blocks
the provider implementation/default route until separately designed.

The core iterable helper uses deferred `HostOpaqueValue` carriers: it must
finish the semantic spread before invoking `copy_host_json` for yielded
objects, because the TypeScript `copyJson` occurs after all callback/iterator
effects. The current core `Validation`/`Diagnostic` types cannot retain
unknown diagnostic members. The predecessor drains each semantic iterable,
then `emit` reads `.severity` on its yielded diagnostics before the next
payload callback. Once callbacks finish, `validateDocument` reads severity
again in order through `.some`, short-circuiting at the first error; only then
does final Selection copy reflect diagnostic descriptors. Provider integration
must preserve those stages and timing with deferred opaque carriers, ordered
severity reads, and a result model that preserves unknown fields. No final
Selection result is implemented here.

The path-aware copy helper now accepts an enclosing path and base depth, but
whole-result value/depth accounting remains an integration gate. Diagnostics
from multiple callbacks share one output array, while this private helper
currently indexes each batch from zero; the caller must provide a global index
offset or materialize the concatenated deferred array once. `string-concat`
provides the native ToPrimitive/string-conversion primitive for
`structure.errors`, and the private `collect_structure_errors` helper stages
the preceding `instancePath` get, concatenation, and following `message` get.
The helper treats nullish `errors` as an empty list; otherwise it drives
`Symbol.iterator`, `next`, `done`, and `value` with ordinary uncaught host
operations. Messages remain opaque for the later diagnostic emitter. Host
throws stop immediately and use the existing exact-identity slot. Missing or
noncallable iterator methods, primitive iterator results, and other native
iterator TypeError cases return an explicit unresolved outcome; the helper
does not manufacture their messages. Scripted tests cover successful order and
coercion, nullish cases, unresolved iteration, and stop-on-throw. This remains
helper-only qualification and does not establish provider or end-to-end
structure-diagnostic parity.
The helper uses the live `Context`, charging each property/invoke event and
iterator step, along with primitive receiver, prefix, and result UTF-16 units.
It cannot meter user code executed inside native ToPrimitive or iterator
operations, so this is not a resource-equivalence claim.

Loop-body abrupt completions now issue a private `close-opaque-iterator`
host primitive only for `HOST_JSON_CALLBACK` from the `instancePath` read,
string concatenation/ToPrimitive, or `message` read. The dispatcher performs
`GetMethod(iterator, "return")` and calls it with the iterator as receiver;
with the original throw pending, return getter/call errors and non-object return
results are suppressed so the first thrown identity remains authoritative.
Iterator acquisition, `next`, `done`, and `value` failures do not request close.
The focused scripted core test and Node/WASM event-codec tests pass. The fake
addon probe passes on the Node adapter under Bun 1.4.3 and real Chromium
153.0.8010.12 for return-getter throw, return-call throw, primitive return, and
malformed close-handle controls, each preserving the original body throw. This
qualifies the cleanup primitive only: host-side user code remains unmetered,
resource accounting is not equivalent, and no Selection/default route is wired
or proven.

This materialization issue is observable: successful Selection includes
`sourceValidation` verbatim, while refusal construction stringifies the
diagnostics. Before provider/default-route work, prove parity for semantic
diagnostics with unknown own fields and order, plus a returned iterable whose
`Symbol.iterator`, `next`, `done`, and `value` getters/calls have observable
effects. Include a negative control where a value cannot be faithfully copied;
do not silently normalize it into the fixed Rust `Diagnostic` shape.
The bounded nullish/non-callable semantic-spread branch now has a private
`materialize-spread-failure` host event. Rust supplies either the already-read
nullish value or the already-read non-callable `Symbol.iterator` method; the
dispatcher evaluates `out.push(...entry.semantics())` to obtain that host's
native TypeError text, then applies `String(error)` once. The event does not
repeat caller property reads and sends a thrown `String(error)` value through
the existing exact-identity channel. Frozen TypeScript receipts and the
fake-addon probe agree for undefined, null, and non-callable iterator methods
in Node 26.12.1, Bun 1.4.3, and Chromium 153.0.8010.12. Node and Chromium
distinguish undefined (`cannot read property undefined`) from null (`cannot
read property null`); Bun uses its same nullish-spread message for both. All
three use `Spread syntax requires ...iterable[Symbol.iterator] to be a
function` for the non-callable method. The regenerated reference receipts are
`r8-selection-reference-host-baseline/{node,bun,chromium}.json`; the focused
primitive probe reports both spread-message and single-getter-read assertions
passing on all three hosts. Core scripted-host, Node codec, and WASM codec
tests each pass.

This event only supplies the native refusal text for those bounded input
shapes. Other malformed iterable stages remain unresolved, and it does not
construct or expose the final `UmfError` through a Selection route. Callback
diagnostic materialization, resource charging, and default-route parity remain
integration gates; no Selection/default route is wired or proven.

The focused fake-addon probe passed in Bun 1.4.3 against both the Node host
module and the bundled WASM host module in real Chromium (unsandboxed
Playwright). All ten reported flags passed in both hosts: getter/call receiver
and order, BigInt zero distinctions, semantic callback/getter catching and
one-time stringification, stringification-throw identity, malformed-handle
rejection, native null-property access, string-concat default hint and BigInt
conversion, ordinary `valueOf` then `toString` fallback order, coercion-throw
identity, and Symbol TypeError. This was the earlier bounded host-dispatch
checkpoint. The later [20-assertion primitive packet](../r8-selection-host-primitive-dispatch/README.md)
passes independently in Node 26.12.1, Bun 1.4.3 and real Chromium
153.0.8010.12. It additionally covers ordered mixed static/opaque diagnostic
serialization, live `JSON.stringify`, deferred inherited Error-message reads,
IteratorClose preserving the first body throw through return-getter/call
faults, and the bounded native spread-failure messages above. It still does not
exercise a Selection route, complete callback-result
materialization, or Rust Selection parity. Rust `host_json` tests and
Node/WASM codec tests remain separate code-level checks for this foundation.

This protocol is an internal foundation only. It does not implement a Registry
provider, change the TypeScript API, or authorize a default route.
