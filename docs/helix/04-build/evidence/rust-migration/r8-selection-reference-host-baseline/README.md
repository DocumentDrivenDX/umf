---
ddx:
  id: umf.evidence.rust-migration.r8-selection-reference-host-baseline
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
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

# Core Element Selection reference host baseline

This packet freezes the TypeScript predecessor's current host behavior for
`selectCoreElements`. It does not implement or select a Rust default route and
does not qualify an installed Rust package. Node and Bun imported the explicit
TypeScript reference bundle at `dist/umf.js`; Chromium loaded a fresh
browser-target bundle built directly from `src/index.ts`. No V4 root or Rust
selection endpoint was used as the reference.

## Reproduction and pins

From the repository root, run:

```sh
node scripts/rust-migration/r8/selection-reference-host-baseline.mjs
UMF_BASELINE_HOST=bun bun scripts/rust-migration/r8/selection-reference-host-baseline.mjs
bun scripts/rust-migration/r8/selection-reference-host-browser.mjs
```

The Chromium run needs the cached Playwright browser and a loopback listener.
It used Chromium 153.0.8010.12. The host receipts record full outcomes and
runtime versions: [Node](node.json), [Bun](bun.json), and [Chromium](chromium.json).
The scripts stop on frozen-case, schema, query-order, getter, or Registry
identity mismatches.

| Input | SHA-256 |
| --- | --- |
| `src/model/selection.ts` | `db9ff795c112df42e5db2cd584c4ad14b876f76c10e4df591b13b4fe746c10f3` |
| `src/registry/registry.ts` | `3fa010311edc23c5dc74826eb7a74a8a19a9a4c41da3031bc66e6f741d1164c1` |
| `src/validation/document.ts` | `bb88c43790277f67269cea09af251b908e93ddd356a1a4aa8bc10c0cf135720a` |
| `src/index.ts` | `acfc8529b437fc6daa279a6586acb25644bae4c3c0b0fe15541d07eba20658da` |
| `dist/umf.js` (Node/Bun TypeScript reference) | `5cf8927e6dd9e95b49e870ddb2d662674613997fbddcc5564c8f5a28d7dd38df` |
| `spec/core/element-selection.schema.json` | `74b35be467972d71c4a3b80d056c2c691ca7cdc59fe90cb62e4f85bf2812a555` |
| `fixtures/validation/core-selection.json` | `f75ba587ed078e6f042b3ad584c4ad14b876f76c10e4df591b13b4fe746c10f3` |
| `scripts/rust-migration/r5/selection/frozen-typescript.json` | `2fb5429888f34d6bb2684553201f652a68424fc68125a457c6b5e01aeaa7817a` |
| `scripts/rust-migration/r5/selection/frozen-refusals.json` | `7abf69091dbf3f24f69ea468436f13fcb6b567317d95f0c70a938bbb1382e49b` |

The two frozen R5 packets supplied twelve exact comparisons (seven complete
successes and five refusal envelopes). All twelve matched on Node, Bun, and
Chromium. Node and Bun also validated all seven successful values against
`spec/core/element-selection.schema.json` with the core and semantic-reference
resources installed. The browser receipt independently reports all twelve
frozen comparisons equal. Node, Bun and Chromium agree on the captured
host-reflection and registration-order cases; the later spread probes record
one runtime-specific TypeError wording difference described below.

The explicit-reference harness also pins the exact 47-event Registry trace for
three built-in `registered(id, version)` checks interleaved with four extension
payload lookups: two at document scope and two at element scope. Each lookup
records the `get` receiver; each payload records manifest/scopes access,
`scopes.includes` receiver, structure access/call receiver, capability access,
both semantic getter reads, and semantic callback receiver/context. Node, Bun,
and Chromium each report `exactEvents: true` and seven total `Registry.get`
calls. The trace preserves the built-in constraint program's current order and
the TypeScript predecessor only; it does not qualify Rust provider behavior.

## Callback result and iterator materialization — 2026-10-26

The Node 26.12.1, Bun 1.4.3 (Node compatibility 26.3.0), and Chromium
153.0.8010.12 receipts now include a callback returning a custom iterable with
two diagnostics per invocation. `Symbol.iterator`, iterator `next`, each result
`done`, and each result `value` access are recorded in order. All three hosts
produce the same complete `sourceValidation` and `selection`: four warning
diagnostics retain their relative order and unknown nested `origin` fields,
followed by the existing core warnings; all three selected elements match.
The returned diagnostics are spread into the source validation result before
the full Selection is copied.

Spread failures happen inside the semantic callback `try`. A returned iterable
whose `value` getter throws becomes a `VALIDATOR_FAILURE` diagnostic with message
`[object Object]`, then the same exact `CORE_SELECTION_SOURCE` refusal string on
all three hosts; the sentinel does not escape by identity. Returning a member
with an unknown BigInt field instead completes validation and then fails the
final Selection copy with `NON_JSON` at
`/sourceValidation/diagnostics/0/unknown` on all three hosts.

Returning `undefined`, `null`, a number, a plain object, or an object with a
non-callable `Symbol.iterator` is not treated uniformly.
All become `VALIDATOR_FAILURE` entries and a `CORE_SELECTION_SOURCE` refusal.
Node 26.12.1 and Chromium 153 report
`TypeError: entry.semantics(...) is not iterable (cannot read property undefined)`
for `undefined`, and the same text ending in `null` for `null`; Bun 1.4.3 reports
`TypeError: Spread syntax requires ...iterable not be null or undefined`.
All three report
`TypeError: Spread syntax requires ...iterable[Symbol.iterator] to be a function`
for numbers, plain objects, and a non-callable iterator method. Receipts retain the complete refusal strings,
including both affected extension paths and the other source warnings.

For structure-false results, `structure.errors` is read at that stage and its
custom iterable is visited in order; two errors create two ordered
`EXTENSION_STRUCTURE` diagnostics and the same full `CORE_SELECTION_SOURCE`
refusal string across hosts. Throws from the `errors` getter and from iterator
`Symbol.iterator`, `next` getter/call, result `done`, or result `value` getters
escape with the exact sentinel identity on Node, Bun and Chromium. This boundary
differs from semantic-result iteration, which is inside the callback catch.
The three receipts compare byte-for-byte for these success, refusal, event and
identity observations apart from their host/runtime metadata.

These observations constrain a Rust host protocol: preserve an opaque callback
result until JavaScript spread materialization can produce its exact host error,
preserve unknown fields in successful diagnostics, and distinguish structure
error iteration faults from semantic callback/result-iteration failures. They
remain TypeScript reference evidence only and make no Rust-route claim.

## Invalid-source refusal serialization — 2026-10-26

Additional Node 26.12.1, Bun 1.4.3, and Chromium 153.0.8010.12 probes pin the
`CORE_SELECTION_SOURCE` message stage. A semantic callback replacing global
`JSON.stringify` is observed by later refusal serialization: the live function
is called with `JSON` as receiver and the full mixed diagnostics array
(callback entries followed by core warnings). The replacement also intercepts
other later library stringify calls, so receipts separately record the array
invocation. This establishes that refusal serialization consults the live
global function rather than a module-captured intrinsic.

When a callback installs `Object.prototype.toJSON`, serialization invokes it
first on the diagnostics array with key `""`, then on each ordinary diagnostic
object in array order with keys `"0"` through `"3"`. This includes callback
diagnostics and static `UNKNOWN_CORE_FIELD` and `UNKNOWN_SCALAR_TYPE` entries.
Static diagnostics therefore need ordinary-object prototypes in any host-created
mixed array.

For a callback diagnostic Proxy, refusal serialization reads `toJSON`, obtains
own keys, reads every descriptor, then reads values in own-key order (`code`,
`path`, `message`, `severity`, `unknown`). A severity getter throw at this stage
escapes with exact thrown-object identity. Node, Bun, and Chromium agree on the
traces and refusal strings. The descriptor-copy protocol does not invoke these
getters, so it cannot implement this refusal branch by itself.

## Observed host and callback matrix

| Probe | Node and Bun observation | Chromium observation | Consequence for a Rust host route |
| --- | --- | --- | --- |
| Source Proxy then query Proxy | Source `getPrototypeOf`, `ownKeys`, and own-property descriptors occur before any query reflection. | Same ordered trace. | Rust must request reflection in source-then-query order; a JS pre-copy of both operands is observably different. |
| Malformed query with Registry Proxy | Exact `CORE_SELECTION_QUERY` refusal; Registry trap count is zero. | Same. | Do not enumerate or inspect Registry before query shape admission. |
| Invalid source with semantic Registry registration | Exact `CORE_SELECTION_SOURCE` refusal; semantic callback count is zero. | Same. | Complete structural source admission before extension callback execution. |
| Registry lookup error | A Proxy that throws a sentinel from its `get` trap for `get` propagates that exact object by identity. | Same. | Registry lookup must be delayed to the predecessor lookup stage and preserve caller-thrown host identity. |
| Semantic callback result | Fixture callback runs twice in source order; returned warning diagnostics remain in the full selection result. | Same call count/order. | Callback behavior is caller input, not a sixth trusted resource; keep its values and order intact. |
| Semantic callback throw | Two callback throws are caught and converted to source-validation failure `CORE_SELECTION_SOURCE`, with callback failures represented as diagnostics. | Same. | This differs from a Registry method trap: callback throws are diagnostic data, while reflection traps preserve thrown identity. |
| Accessor | `NON_JSON` at `/modules/0/elements/0/name`; getter invocation count is zero. | Same. | Admission inspects descriptors and must never execute getters. |
| Hidden member / symbol / custom prototype | Exact `NON_JSON` envelopes: hidden `/modules/0/elements/0/hidden`; symbol `/modules/0/elements/0`; custom prototype at root path `""`. | Same category and outcomes. | Preserve the copy adapter's descriptor, symbol, and prototype checks and exact refusal paths. |
| Cycle / non-finite number | `CYCLE` at `/extensions/future/loop`; `NUMBER` at `/extensions/future/nonFinite`. | Same. | Unknown extension content is still host-admitted even when its internal links are not selection traversal edges. |
| Lone-surrogate identity | Selection succeeds and retains the UTF-16 identity. | Selection succeeds. | Do not normalize identity through scalar UTF-8 strings. |
| No matches with invalid source | Invalid source still refuses with `CORE_SELECTION_SOURCE`; no-match is not an admission bypass. | Same. | Source validation precedes matching and result construction. |
| Result isolation / unknown content / repeated edges / cycles | The frozen result retains unknown scalar/reference/extension annotations, repeated annotated edges and transitive cycle termination. Mutating returned copies does not mutate caller input. | Frozen selection cases and copy mutation probes pass. | Rust output must include the complete copied source/query context and preserve unknown content. |
| Work/cancel/deadline controls | Public signature has `(source, query, registry?)`; no public work, cancellation, or deadline controls exist. | Same signature. | Do not add public controls. Existing R5 opt-in control tests are not evidence that package-root behavior exposes those controls. |

## Interface recommendation for Sol review

Keep the public synchronous signature and explicitly select the operation in
both V4 roots only after interface review. Reuse the Core Model's exact five
trusted resources: `coreSchema`, `referenceSchema`, `packageSchema`,
`constraints`, and `domainPolicy`. Registry is a per-call caller object, not
another root resource. Use one invocation-local Rust `Context` for source and
query admission, semantic work, and result encoding; no new public control or
result schema is warranted.

The raw host route should be one private Rust-owned
`model/selectCoreElementsHostJson` dispatcher over the existing
`umf.host-json/1` reflection protocol, implemented for Node and WASM. Its stage
order is source copy, query copy, exact query validation, full source
validation, then stable-order selection/traversal and result copy. The existing
tagged `model/selectCoreElements` path starts too late to establish those raw
host stages. The five trusted resources should be constructed before input
reflection, following the accepted Schema Properties design; the Registry
must remain opaque until the TypeScript predecessor would first consult it.

The Registry seam needs an explicit Rust-side design before implementation.
The current Rust `selection::select_core_elements` accepts a concrete Rust
`Registry` plus `Capabilities`; the TypeScript predecessor accepts the live
`Registry`, performs `Registry.get(id, version)` lazily while visiting
extension payloads, runs each registration's structural validator, and then
calls optional semantics. Eagerly calling `registrations()` or serializing
packages before source validation changes observable ordering. The smallest
candidate is a lazy per-call host callback bridge invoked by the Rust
validation stage when it reaches a concrete extension lookup: defer
`Registry.get`, preserve a thrown method/proxy error by identity, return the
registration's JSON schema/metadata to Rust for structural validation, and
invoke the semantic callback only at its existing stage. Callback-returned
diagnostics must retain order; semantic callback throws must become the same
failure diagnostic as TypeScript. This likely requires a narrow dynamic
registration/provider seam around Rust `Registry`/`Capabilities`; the current
concrete Registry API does not itself prove that lazy behavior. If Node and
WASM cannot share the same synchronous callback contract, stop rather than
flatten callbacks or silently omit them.

The baseline confirms that malformed query validation precedes Registry
reflection, and that source is copied before query. It does not yet freeze every
crossed Proxy trap at each internal `validateDocument` stage, every built-in
Registry profile, or R8 default-root behavior. Rust route work must add crossed
cases for query reflection faults, source structural refusals before
`Registry.get`, multiple extension payload callback order, callback-returned
diagnostics, callback-thrown diagnostics, Registry method trap identity,
output-copy failure/no partial result, depth/value limits, and the full R5
control packet on each supported host. Public TypeScript exposes no
cancellation/deadline setting; any internal Rust work policy needs separate
evidence and must not change the public signature.

This is a proposed seam, not a route authorization or semantic qualification.
Sol review should confirm that the Rust dynamic Registry/Capabilities bridge
can preserve both lookup and callback schedules in Node and WASM before any
shared binding or root edit begins.

### Caller-owned Registry registration probes

The reference harness also tests arbitrary registration objects returned by an
overridden `Registry.get`: manifest/scopes/capabilities/structure/semantics
property order, false-structure diagnostics, thrown-value identity at each
non-semantic stage, semantic throw conversion, and failure of `String(error)`.
Node, Bun, and Chromium each pass these probes and retain all 12 frozen R5
comparisons. See the [Registry provider design addendum](registry-provider-design-20261026.md#addendum-caller-owned-registration-behavior-2026-10-26)
for the host protocol implications. This is TypeScript reference evidence only;
it does not qualify a Rust implementation.

## Callback diagnostic and structure-error reads — 2026-10-26

The extended Node 26.12.1, Bun 1.4.3, and Chromium 153.0.8010.12 probes
agree on callback diagnostic read timing. The fixture invokes semantic callbacks
for both document and element extension payloads, each returning two diagnostics
from an observable iterable. For each payload, the iterator fully completes,
then the constraint program's `emit` validation reads each yielded diagnostic's
`severity`. The next payload callback follows. After all callbacks have
completed, `validateDocument` computes `valid` with
`diagnostics.some(d => d.severity === 'error')`, reading severity again in
source order. For all-warning results, every severity is read a second time
before Selection construction/traversal, and the final Selection `copyJson`
then copies each diagnostic's enumerable data properties. Unknown JSON
properties survive. The probe observes final descriptor enumeration after the
validity check; Selection traversal lies between those phases in
`selectCoreElements`' source order.

With an error diagnostic, all callback invocations and per-emit checks still
finish first. The final `.some` stops at the first error (so later diagnostic
severities are not read in that phase). Selection then refuses with
`CORE_SELECTION_SOURCE`; refusal `JSON.stringify` enumerates all diagnostics
and reads their severities and other fields, including entries after the
short-circuit point. This JSON serialization is a separate observable read
phase. The full traces match across all three hosts.

For `structure.errors`, all hosts read each error's `instancePath` before its
`message`. The path is formed by JavaScript string concatenation: an object
`instancePath` receives `Symbol.toPrimitive` with hint `default`, and its
returned string is appended to the extension path. Its `toString` is not used
when `Symbol.toPrimitive` succeeds. The `message` value is read but is not
coerced: a string is retained as the diagnostic message, while an object
message reaches the constraint diagnostic validity check and causes
`CONSTRAINT_DIAGNOSTIC` (`Malformed diagnostic`); its `toString` and `toJSON`
are not called. Getter throws from `instancePath` or `message`, and a throw
from `instancePath` coercion, trigger `IteratorClose`: each host reads the
iterator's `return` getter and calls the returned method before propagating the
exact original body-throw object. If `return` itself throws or returns a
primitive, the original body throw still wins. This ordering is now asserted by
the Node, Bun, and Chromium harnesses and recorded in their receipts. All three
receipts agree on traces, refusal text, and identity outcomes. This remains
TypeScript reference evidence only; it makes no Rust route claim.
