---
ddx:
  id: umf.evidence.rust-migration.r5-core-key-tuple-default-cutover-candidate
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
    - id: CONTRACT-080
      kind: informed_by
    - id: umf.evidence.rust-migration.r5-core-key-tuple
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-symbol-inventory
      kind: informed_by
---

# R5 candidate: Core Key tuple default-root cutover

## Recommendation and decision boundary

Prepare a four-export source-selection change for `encodeCoreKeyTuple`,
`verifyCoreKeyTuple`, `readCoreKeyTupleBytes`, and `prepareCoreKeyTuples` on the
Node and browser package roots. Do not select these routes yet. The current
implementation has an architectural mismatch: `createCoreModelEngine` eagerly
constructs `CoreKeyTupleRuntime` even while the v4 roots still export the
TypeScript tuple functions, but Rust encode/verify calls still use the generic
request route and rebuild Engine state per call. The staged receipt boundary
currently covers byte reading; default verify also needs a Rust-owned
receipt-first stage that refuses malformed receipt before observing `current`.

Separate public generic model construction from a clearly internal default-root
factory. Public `createCoreModelEngine` already exposes the tuple methods and
must keep its eager tuple runtime; changing it to lazy/per-call resource
admission would break its accepted CONTRACT-080 behavior. While tuple exports
remain TypeScript, the v4 roots should instead use an internal root factory
whose model object omits all four tuple methods and never constructs their
runtime. When a later reviewed cutover selects tuple exports, that root factory
can enable one eagerly retained tuple runtime in the same model/resource
snapshot. Every selected tuple method must execute against that retained
Engine/Registry with a fresh per-call Context; it must not dispatch through the
generic `executeRequestWire` path. This removes hidden tuple setup from
unselected roots without weakening the public generic factory contract.

The recorded 1.86-second tuple factory cost is not an added cutover cost in the
current source: current Node v4 root initialization already constructs that
runtime before it exports TypeScript tuple methods. The root-only factory should
reduce the unselected root's startup; public `createCoreModelEngine` keeps the
existing setup cost. A tuple-selected root will likewise admit resources at
setup. The project has no stated startup budget, so report the measured delta
and leave acceptance of selected-root latency to release review rather than
treating this number alone as a parity blocker.

### Startup measurements on the current source

These are diagnostic cold-process measurements, not installed-package or
cross-host performance evidence. `bun -e 'const t=performance.now(); await
import("./src/index-node-v4.ts"); console.log(performance.now()-t)'` measured
9,819.72 ms in this run; the root agent independently ran the same import at
10,377.99 ms. The matched explicit TypeScript oracle command importing
`./src/index.ts` measured 6,286.63 ms. The roughly 3.5–4.1 second difference
belongs to the whole v4 initialization cohort (selected Rust operations,
Python-client initialization and other root work); it does not isolate Key
tuple cost. A Bun import of `./src/index-browser-v4.ts` measured 5,811.79 ms,
but this is not real Chromium evidence and is not compared with the Node
reference number. The existing `dist/umf-node.js` and `dist/umf-browser.js`
were timestamped 2026-10-24 15:49, before the current v4 source snapshot, and
were excluded from these source-import measurements.

A same-process Node-binding microbenchmark imported the binding and resource
tree before starting each timer. On the same resource snapshot,
`createEngine(CORE_MODEL_RESOURCES)` took 15.92 ms while
`createCoreModelEngine(CORE_MODEL_RESOURCES)` took 2,704.03 ms. Direct
`new CoreKeyTupleRuntime(resourcesWire)` construction took 2,665.24 ms and
2,634.33 ms in two trials for the 649,508-character wire snapshot. This
isolates the current generic model factory's large setup component to tuple
runtime admission much more closely than comparing whole root imports. It is
one local sample cohort; the earlier controlled factory receipt measured 1.86
seconds and 401,221,260 charged work units, so exact latency is sensitive to
control and runtime conditions. Binding source hashes for this timing are
Node index `10d95d1e7e50d9d6a8d420b97e9d2e93449a712841c7dcc4dff91899616e1f6d`,
WASM index `0c8faa29194bf679852ebc444696e23d67ef2501e1aa713318b814f4dd8656f4`,
tuple wire runtime `623996c457b485f82b11065e2f369971bac4d18893b7de3d0da105e2b7dd40df`,
and Node/WASM root sources `c0b081a7d95e8e6c2aa7f731d8e92e573d1a451b377053433915b44556f98482` /
`fe49911fc9bfc032a20a3ceedb0b16655f24d195950ecfb242a6c6df4f0e58e2`.
The WASM source trace confirms the same unconditional construction, but no
source-fresh real Chromium cold-root timing has yet been captured.

## Exact predecessor surface

The frozen TypeScript source is `src/model/key-tuple.ts` (source SHA-256
`3351dce5112b1d3a8178af6d19f92597cb6b558f7327f32f33ecf10f73959f46`). Its
public signatures are:

```ts
encodeCoreKeyTuple(
  input: unknown,
  identityInput: CoreKeyIdentity,
  valuesInput: CoreKeyTupleValue[],
  options?: { profile: 'umf-key-tuple-v1' | 'umf-key-tuple-v2' },
): CoreKeyTupleReceipt

verifyCoreKeyTuple(
  input: CoreKeyTupleReceipt,
  current: unknown,
): CoreKeyTupleReceipt

readCoreKeyTupleBytes(
  input: CoreKeyTupleReceipt,
  current: unknown,
): Uint8Array

prepareCoreKeyTuples(input: unknown): PreparedCoreKeyTuples
```

`PreparedCoreKeyTuples` is frozen and has exactly four enumerable own keys, in
order: `profile`, `source`, `encode`, `verify`. `profile` is
`umf.core.key-tuples.prepared/1`; `source` is an immutable copied snapshot;
`encode(identity, values)` uses v1; `verify(receipt)` accepts both profiles.
No public disposal property is part of the predecessor contract.

The frozen packet has 88 encoder cases and five receipt verification cases
(packet SHA-256
`1e0649ea8a723ce9f9836eceda2fd7cb83c6554bf5f01d908016baf0b69aefb5`). Rust
matches 87 in-profile encoders; the remaining unsafe JavaScript Number case is
separately pinned as out of Rust `Value` profile. The eager opt-in packet adds
4,000,000 raw output bytes, refuses 4,000,001, and tests receipt-before-current
for byte reading. This is opt-in qualification, not default-root or installed
SDK qualification.

## Routing and operation ownership

The v4 Node/browser entrypoints currently re-export the TypeScript tuple
declarations. A scoped startup split is implemented: the public generic model
factory remains eager and tuple-capable, while the v4 roots use an internal
factory with no tuple methods and no tuple runtime admission. This does not
select any tuple operation for Rust. The remaining proposed source-selection
edits, after the gates below, are:

1. Keep public Node/WASM `createCoreModelEngine` and
   `initializeCoreModelWasm` unchanged: they eagerly admit and expose the
   retained tuple runtime. Add internal `createCoreModelRootEngine` and
   `initializeCoreModelRootWasm` factories for the v4 roots. Their default
   shape omits all four tuple methods and skips `createNativeKeyTupleOperations`
   entirely; a future explicit root-only enablement may construct the runtime
   during setup. Reuse one already-admitted `fixedResources` snapshot whenever
   a root factory is tuple-enabled; do not re-read caller resources or
   clone/encode the five trees a second time.
2. Add direct methods to the retained runtime for stateless encode and staged
   verify, alongside existing prepare/byte-read. Stateless encode admits its
   ordered host inputs then calls core with the retained Engine/Registry. Verify
   first creates an opaque receipt stage from receipt only; only after that
   succeeds may the JS facade read/admit `current` and call the stage's
   `verifyCurrent`. Read uses the same stage and returns raw bytes. Every call
   creates a fresh Context and shares one host-control bridge across admission,
   semantics, and output.
3. The implemented root-only factory is called from
   `src/index-node-v4.ts` and `src/index-browser-v4.ts`; inherited tuple exports
   remain untouched. At the later selection gate, enable the retained runtime,
   add the `src/access/` adapter, and explicitly re-export those four adapter
   functions after `export * from './index'`. Keep `src/index.ts` and the
   explicit `./reference` TypeScript oracle unchanged.
4. Fail closed at selected-root setup if the retained tuple runtime/direct
   methods are missing. Do not silently fall back to generic request dispatch
   or per-source Engine construction for a selected default route.

The standalone `createCoreKeyTupleEngine` remains a dedicated opt-in factory
that admits resources once. Its current public behavior and the public generic
model factory's eager tuple behavior remain unchanged. The new root-only
factory is internal and its non-selected shape omits tuple methods rather than
leaving lazy/per-call fallbacks reachable. A selected root may enable the
retained runtime explicitly after direct methods and receipt staging are
implemented. The only retained Engine claim here is the tuple runtime's
immutable Engine/Registry, not reuse by every generic core-model operation.

The Node package condition resolves through `dist/umf-node.js`; browser/import/
default resolves through `dist/umf-browser.js`. Both need to select the same
four functions. Python has no corresponding public tuple API in the current
Python source or R8 public-export inventory. The project has not yet decided
whether Python needs one for these exports; keep that declared host-scope
question open. Do not invent a Python API or call the existing action-fixture
tuple bytes a parity route. Keep Python's `test_action_fixture_vectors.py` as a
neighboring regression; any Python tuple API requires its own contract and
source-selection scope.

## Scoped factory split implementation checkpoint

The startup-only split is implemented without selecting tuple defaults. The
public generic Node/WASM model factories still create and expose all four tuple
methods through eager runtime admission. The v4 Node and browser roots use
internal root factories that omit those methods and skip tuple runtime
construction; their inherited TypeScript exports remain active. Focused tests
assert both shapes and the public factory's eager constructor call. The WASM
factory test also covers initialization through the new root initializer.

Validation on the split source cohort: `bun run typecheck` passed; the
WASM-source mirror checker passed with 14 shared files current; and
`bun test ./bindings/core/node/tests/core-key-tuple-factory.test.js
./bindings/core/wasm/tests/core-model-root-factory.test.js` passed five tests
and 33 assertions. The fresh standalone WASM release package passed the
existing R7 Node, Bun and Chromium qualification (Edge 156.0.4314.42); the
dedicated browser factory replay also passed, confirming root tuple methods are
omitted, public model tuple methods remain present, and Node globals are absent.
The R7 full replay is package-level runtime evidence, not the dedicated root
factory control; the latter was separately run against the extracted tarball.

Pinned split source and artifact hashes for that browser run:

| Item | SHA-256 |
| --- | --- |
| Node binding index at focused Node/Bun tests | `ccd727c5e635e48c2cc62151cd811f9bc00eb1ef5de9185b5a4f698255813fde` |
| WASM binding index copied into package | `2736f87888ff6b33521310256543c4d8498d8df6550f28a998ba81c060e6eac7` |
| Current WASM index after other additive shared-index work | `3a6c47723be2cf96579b69a61d2d89405bb68816edf1504851a403674e45c81b` |
| Node v4 root entry | `e15fdf25af964928aa430ab07488b41a9ea6970dc2999ec8ca216adfd063d0cd` |
| Browser v4 root entry | `ff268b2d65cbc0ef86a84813b6741d72d8275736f7ff90bb55d9d078c805f373` |
| WASM package tarball | `b9b08a22d0107975f9936e2215a865b96318be5e150430dccbbd24d07e3d54f4` |
| WASM binary | `ad581820746a68a8d16198dfa90d5d927f4d3df499dfeda1688738f120d95aa8` |
| Dedicated browser harness | `d6b9af903b9d218b89e5eef7600ef810677cbd40f8666cfd7bfad9b9347e1df0` |

The package and browser hashes pin an earlier isolated index snapshot than the
current WASM index hash because another bounded adapter was added to the shared
index while qualification ran. The root-factory implementation and tests were
included in that package. Re-run integrated package/browser qualification
after all shared index edits freeze; this checkpoint does not claim that the
current combined index cohort has been replayed. The focused tests, typecheck,
and mirror check were run on the source snapshot before the later shared-index
addition. No SDK-installed or retirement claim follows from this factory
split. Machine-readable runtime, archive and browser receipts are in
`factory-split-browser-receipt.json` in this evidence directory.

| Export | TypeScript predecessor | Rust owner/binding boundary | Current blocker or evidence gap |
| --- | --- | --- | --- |
| `encodeCoreKeyTuple` | `src/model/key-tuple.ts:97` | `umf_core::core_key_tuple::encode_core_key_tuple`; retained model runtime | R8 accepts the core operation; root route remains TS. Requires exact host admission order and integrated installed replay. |
| `verifyCoreKeyTuple` | `src/model/key-tuple.ts:142` | `verify_core_key_tuple` plus a new receipt-first prepared stage | Must validate/recompute receipt before touching `current`; a generic tagged request that decodes both arguments first is not equivalent. |
| `readCoreKeyTupleBytes` | `src/model/key-tuple.ts:150` | staged `prepare_byte_read(receipt)` then `read_bytes(current)` | R8 does not yet map this public declaration to an accepted operation. Preserve 4M raw-byte limit without the generic 100K tagged-array response ceiling. |
| `prepareCoreKeyTuples` | `src/model/key-tuple.ts:164` | `CoreKeyTupleRuntime::prepare(source)` and retained Rust prepared object | R8 does not yet map this declaration. Preserve one-time validation, frozen wrapper own-key shape and snapshot semantics. |

## Host admission and resource controls

The predecessor `copyJson` at `src/model/json.ts` admits own data properties,
rejects accessors without invoking them, and pins prototype, symbol, sparse
array, cycle, depth, value-count and text limits. The required stage order is:

- **Encode:** copy source, identity, and values in that order; perform the
  predecessor's identity and source checks; only then copy/validate options.
  Crossed malformed inputs must return the exact predecessor error
  code/message/path without invoking accessor properties.
- **Verify:** copy and schema-check receipt, perform exact recomputation, then
  admit/compare `current`. Add a Rust-owned staged handle for verify, reusable
  by both Node NAPI and WASM, so receipt failure cannot be reordered by host
  transport decoding. For a valid receipt, preserve the predecessor's refusal
  when `current` itself contains a getter/proxy trap.
- **Read:** retain the existing receipt-first stage; only after it succeeds
  access/admit `current`, then return a native `Uint8Array` with the established
  4,000,000-byte ceiling. Test 100,001, 4,000,000 and 4,000,001 bytes against
  the TypeScript oracle. Keep decode, semantic work, raw allocation and output
  under one fresh per-call Context and host-control ledger.
- **Prepare:** copy and validate source once at preparation. Return a frozen JS
  wrapper with exactly `profile,source,encode,verify` enumerable own keys in
  predecessor order. The wrapper privately retains one NAPI/wasm-bindgen Rust
  instance; Rust owns copied source/diagnostics and shared immutable engine
  resources. Each method call gets a fresh Context. GC/drop owns the default
  lifetime; no global handle table, public cap or enumerable `close()`.
- **Factory:** public generic/standalone tuple factories retain their existing
  eager tuple admission with separate setup control, zero-touch accessor
  refusal, mutation snapshot control and setup work limit. The internal
  default-root factory omits tuple methods and does no tuple-runtime admission
  while the TypeScript exports remain selected. Never defer selected tuple
  resource construction until the first tuple call. No selected route silently
  substitutes an empty extension capability; absent validators must refuse
  unsupported extension semantics.

Ordinary tagged transport caps arrays at 100,000 values while the tuple core
allows 4,000,000 raw bytes. The direct byte method must remain the narrow
exception that returns raw bytes; do not raise the shared transport limit or
change ordinary Context limits globally. Receipt `bytesHex` text is twice the
raw byte count, so test the 4M boundary through the tuple-specific aggregate
text scope and verify the 4,000,001 refusal. Keep all host copies and byte
allocation metered/cancellable.

## Decisive parity and release gates

Before default selection, recapture a combined frozen packet from the exact
current TypeScript predecessor and compare Node, Bun, and real Chromium/WASM
against it. The packet must cover all 88 encoder and five verification cases,
both profiles, full receipts and error triples, and the separately pinned
out-of-profile host Number. Add direct route-specific controls for:

- malformed receipt crossed with a throwing/getter `current` (getter untouched
  and predecessor receipt refusal wins), valid receipt with accessor `current`,
  forged/stale receipt, and byte-read ordering;
- encode source/identity/values/options accessors in crossed-invalid cases,
  getter non-invocation, copy isolation and exact refusal path;
- prepare source getter refusal, mutation snapshot, wrapper freeze and own-key
  order, validation-once behavior, foreign-source prepared verification;
- 100,001 / 4,000,000 / 4,000,001 raw byte boundaries; setup zero-touch,
  resource snapshot, setup maxWork refusal; per-call cancellation, deadline,
  meter refusal and reset/recovery;
- unsupported/unknown extension package with no registered validator, proving
  explicit refusal rather than silent success.

Add a factory-split regression that observes the native runtime constructor:
public generic and standalone tuple factories still construct one eagerly;
root-only unselected Node/WASM factories construct zero and omit all four tuple
properties. A selected root later constructs exactly one; all tuple methods
share that instance; repeated selected calls do not invoke generic
`executeRequestWire`; and the same resource snapshot is admitted once. Pin
setup controls and fresh per-call Context reset on all branches. Benchmark
three comparable cases: generic public v4 model factory (eager tuple runtime),
root-only v4 factory (tuple omitted), and explicit TypeScript reference import.
Measure WASM initialization and first browser-root import separately in real
Chromium; do not substitute Bun's browser-source import for browser evidence.
Record runtime versions, cold/warm method, artifact hashes and repeated
samples. The current 1.86-second factory sample and 401M charged work units
are a local bound for public/selected eager setup, not a measured root-only
delta.

Run focused Rust core/wire and Node/WASM binding suites, TypeScript typecheck,
WASM mirrored-source check, and the repository's check-only generated-resource,
inventory and gap-ledger fixed point. Then build the private SDK archive from
that immutable source cohort, install it in fresh Node and Bun processes, and
run the browser replay from that archive's fresh WASM package in real
Chromium. Record source, native addon, WASM binary/generated JS, archive,
replay harness and receipt hashes; a direct worktree import does not pass this
gate. The prior eager tuple evidence recorded a 1.86-second setup and 401M
charged work units for its cited resources; add root-import latency and memory
measurements to the final receipt. Repeat the supported installed architecture
jobs and the R8 release matrix as required by the package lane. No claim of
installed SDK qualification or retirement follows from the earlier opt-in
receipts.

## R8 disposition

The current gap ledger is pinned by inventory SHA-256
`e7596f3ce390e7e5bcc971b79074e312daf72e6ca1dd400384d4fb920b298239` and ledger
SHA-256 `066ec4386bfee2d685c1677250dd55f7e047916ec50d1d71e00772b51aff07dd`.
It has eight current executable rows for this cohort:

| Node row | Browser row | Export | Current ledger state |
| --- | --- | --- | --- |
| `package-root-node-2500` | `package-root-browser-1380` | encode | Accepted Rust core operation evidence; inherited TypeScript remains default; binding route unproven; zero retired. |
| `package-root-node-3303` | `package-root-browser-2183` | verify | Accepted Rust core operation evidence; inherited TypeScript remains default; binding route unproven; staged receipt-first host path still required. |
| `package-root-node-3034` | `package-root-browser-1914` | read | Exact accepted Rust operation map and retirement disposition unresolved. |
| `package-root-node-2905` | `package-root-browser-1785` | prepare | Exact accepted Rust operation map and retirement disposition unresolved. |

After the gates pass, regenerate rather than hand-edit the inventory and
ledger. Their cohort-specific binding-route evidence and dispositions must
name the selected entrypoints and accepted Rust owner for all four operations.
An independent R8 review decides whether the eight route rows can be retired;
this candidate itself changes neither their denominator nor status.

## Source and evidence basis

- Predecessor: `src/model/key-tuple.ts`,
  `1e0649ea8a723ce9f9836eceda2fd7cb83c6554bf5f01d908016baf0b69aefb5` packet.
- Eager opt-in implementation and receipts: `README.md`,
  `node-bun-installed-replay.json`, and `sol-binding-review.md` in this
  directory. Their evidence qualifies opt-in behavior only.
- Root entrypoints: `src/index-node-v4.ts`, `src/index-browser-v4.ts`,
  `src/index.ts`; package conditions in `package.json`. The v4 Node/browser
  entries now call internal root-only factories; `src/index.ts` remains the
  explicit TypeScript oracle.
- Factory trace: Node and WASM `createEngineInternal` conditionally attach
  `createNativeKeyTupleOperations` according to `includeKeyTuple`. Public
  `createCoreModelEngine` and `initializeCoreModelWasm` retain the default
  `includeKeyTuple=true`; the internal v4 root factories pass false. See
  `bindings/core/node/index.js` and `bindings/core/wasm/index.js` at the
  `createCoreModelRootEngine` / `createCoreModelRootEngine` definitions and the
  conditional operation attachment. No default tuple route is selected.
- Runtime and stages: `crates/umf-core-wire/src/core_key_tuple_binding.rs`,
  `crates/umf-core/src/core_key_tuple.rs`, and Node/WASM retained binding
  sources. Verify staging remains an explicit implementation gate.
- Python public source inventory: `python/src/umf/`, `python/umf_access/src/`
  and the R8 public-export inventory contain no matching four-operation API.
  Whether to add a Python tuple API remains an explicit host-scope question;
  Python release qualification is a distribution gate, not proof of Key tuple
  API parity.
