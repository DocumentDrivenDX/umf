---
ddx:
  id: umf.evidence.rust-migration.r8-read-json-value-production-interface-proposal-20261027
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
    - id: TP-001
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-011
      kind: references
    - id: umf.evidence.rust-migration.r8-read-json-value-falsy-expansion-20261027
      kind: informed_by
---

# Production binding proposal: Rust-owned readJsonValue

Status: final proposal for Sol review. This proposal changes no repository source and selects no default route. First implementation scope is the ordinary readJsonValue profile only, with private Rust sequencing and an opaque raw-host handle. Catalog mode remains on its current TypeScript-selected route until a separate scanner/host-access design passes review. N-API comes first; WASM and Chromium follow after ordinary-profile parity.

## Compatibility boundary

src/model/serialization.ts first evaluates text.length > LIMITS.maxTextLength (4,000,000 UTF-16 code units). For ordinary explicit JSON, it runs JSON.parse(text) inside a catch that maps any failure to UmfError('SYNTAX', 'Invalid JSON syntax'), then parses the same original value via YAML 1.2 core and applies duplicate-key, tagged-node, alias, number, path, depth and value checks. YAML mode skips JSON preflight.

The synchronous withCatalogResourceProfile scope raises the value limit from 100,000 to 1,000,000. In that profile, explicit JSON takes a distinct branch: scanJsonFrame performs raw indexed, length and slice reads, then returns the dynamically looked-up JSON.parse(text) result directly. Catalog mode remains TypeScript-selected; it is not routed through the first Rust binding. Its scanner read order, mutable global JSON.parse lookup and ordinary-object result shape need a separate frozen contract before any later route proposal.

CONTRACT-001 sets the 4,000,000 UTF-16-unit text limit, depth 128, ordinary 100,000 values and catalog 1,000,000 values; it requires JSON-compatible YAML 1.2, duplicate string-key rejection, exact numeric profile, no silent getter/coercion loss, and explicit UmfError outcomes. Preserve source semantics; do not silently round or discard unknown content.

## Proposed public-to-binding shape

The ordinary-profile facade calls one synchronous operation with a per-call opaque handle and capabilities. The initial interface does not accept a catalog profile. The source stays in the host as an original value; it is never stringified, copied into JSON, or UTF-8 encoded before Rust requests it.

    readJsonValueBound(
      invocation: InvocationHandle,
      rawSource: HostValueHandle,
      rawFormat: HostValueHandle | Missing,
      controls: ContextControls
    ) -> HostValueHandle | PublicError

HostValueHandle is an invocation-local integer/slot in a private table holding the exact JS value reference. The handle is opaque to Rust and cannot be forged across calls. N-API stores the table in per-call native state; WASM uses a per-invocation JS dispatcher/table, never a global handle registry. Every handle is scoped through finally cleanup; nested/reentrant calls receive separate invocation IDs and tables. Handles may refer to original input values, exact thrown values, and result-builder targets. Rust receives only numeric tokens and bounded primitive frames.

The private umf.host-json/1 capability protocol should use synchronous operations with explicit status/kind, UTF-16 unit counts, offsets and bounded chunks. No callback returns a whole arbitrary JS object graph, and no callback may silently coerce, normalize, replace a surrogate, truncate, reorder, or convert an exception to text.

## Required host operation order

Rust owns admission decisions and requests these JS operations at the matching semantic checkpoints:

1. Text-limit comparison. Ask the host to perform exactly rawSource.length > 4_000_000 using the original property access and ECMAScript relational conversion. Do not fetch length once into a Rust number and reuse it. A getter or Proxy can change values or throw. A small first length value does not bound a later ToPrimitive result: an object can report a small length and coerce to an arbitrarily large string. If true, return public UmfError code LIMIT, message Source text exceeds limit, with path equal to the predecessor default empty string. The check concerns the raw value's length property, not necessarily the eventual coerced string length. If access/coercion throws, preserve the exact thrown object through the escape channel.
2. Format selection. Preserve the TypeScript branch test format === 'json'; every other value, including missing, Symbol and objects, selects YAML without coercion. The Rust operation receives the resulting trusted enum only after that exact comparison.
3. Ordinary explicit-JSON preflight. Only for ordinary-profile JSON, evaluate the live JavaScript expression JSON.parse(rawSource) inside the same catch boundary as TS. Do not capture JSON.parse at module initialization or call a cached intrinsic: mutable global JSON.parse lookup and its getter/receiver behavior are observable. Preserve ToPrimitive/ToString hooks and their order. A caught failure maps to UmfError('SYNTAX', 'Invalid JSON syntax'); it is not rethrown. The exact throw identity remains relevant for failures outside this catch and for control failures that escape it.
4. Parser composition observation. Preserve the predecessor second length read at compose third-argument evaluation, before the parser generator body runs. Its value is passed as YAML's `endOffset` without coercion. It is not a new admission comparison or an eager text snapshot, but the callback read remains observable and may throw or mutate state.
5. Parser input. Pass the original raw handle into the private Rust sequencing layer. The YAML lexer does not coerce the source: primitive strings pass unchanged, falsy nonstrings produce an empty stream, and truthy nonstrings throw `TypeError`. Transfer accepted primitive strings as checked UTF-16 chunks. Keep the first length comparison, explicit-JSON `JSON.parse` coercion, compose length read and lexer source access as distinct ordered operations. Do not replace these with a single eager snapshot.
6. Rust parse and rebuild. Parse the UTF-16 units and construct ordinary-profile results with null-prototype records and ordinary arrays using host primitive builders. Preserve ordered members and __proto__ as data. Freeze exact call traces for stateful getters/Proxies.

This order is a candidate derived from the existing source and receipts, not yet a closed source-level proof. Sol should verify every path against the current TypeScript function and retained packet before implementation.

## UTF-16 transport and errors

Input chunks and output/error strings travel as Uint16Array/N-API UTF-16 frames, with declared total length, requested offset, returned length and invocation token checked before allocation or append. Four million is an admission ceiling in UTF-16 units; chunk size is only a frame bound. Preserve lone high/low surrogates in source, YAML/JSON keys, values, paths and messages. Never use lossy to_utf8().unwrap_or_default(); use the existing fallible Utf16::to_utf8 only when the exact value is well-formed, and otherwise transport UTF-16 units.

Represent initial ordinary-mode outcomes in Rust as one of: successful Value, UmfError { code, path: Utf16, message: Utf16 }, parser-admission TypeError descriptor, or HostThrow(token). A successful host-result token is reserved for a future catalog JSON.parse branch. The host dispatcher catches callback throws into an invocation-local exact-value slot and returns a primitive token; after Rust returns, the facade rethrows that same JS object for HostThrow. It maps UmfError to the public UmfError constructor with exact code/path/message, and constructs the predecessor-compatible TypeError only where the reference throws TypeError. Callback exceptions caught by TypeScript JSON preflight are intentionally converted to syntax UmfError instead. Do not compare only serialized JSON: verify error class identity, own fields, path (including its empty-string default), UTF-16 units and thrown sentinel identity.

Ordinary parser output uses arrays with the expected Array prototype and null-prototype records (Object.create(null)), including __proto__ as a data key. Catalog JSON output follows native JSON.parse shape (ordinary objects with Object.prototype, native array shape and parsed property order). Validate result prototypes, enumerable own keys, descriptors, key order where observable, array sparsity and values directly. The Value representation retains ordered object pairs, which can support deterministic reconstruction; do not sort keys.

## Shared Context and accounting

One ordinary Rust Context is created at the public facade boundary and passed through host text acquisition, parser scans, tree/value admission, output construction, and final UTF-16 transport. The ordinary value limit is 100,000. N-API and WASM use the same Rust Context contract and error vocabulary.

All Rust-owned scans, chunk copies, parsed values, UTF-16 copies, output writes and result frames charge/check the same counters before growth. Host JSON.parse is an opaque synchronous engine operation: the host cannot meter its internal work, impose a hard bound during it, or promise cancellation/deadline interruption while it runs. A Context checkpoint/reservation may run immediately before the callback, and a checkpoint may run after it returns, but neither is a hard bound on the callback. Moreover, the first length check can be small while ToPrimitive produces a huge string. Record this as a residual limitation; do not describe ordinary source admission as a hard bound or cancellation-safe. Freeze callback-precedence behavior and test control refusal immediately before/after preflight. Host control exceptions retain their intended public mapping. HardIsolated refuses before host callbacks, consistent with Context capabilities.

The host JSON.parse limitation is explicit in support claims. The shared Context covers Rust-owned work and its checkpoints, not hidden engine work. Do not emulate a fresh Context in the host wrapper or claim that cancellation interrupts an in-progress host callback.

## Staged acceptance matrix

- Gate A — source semantics freeze: hash current TS source, dependencies/limits (jsonValueLimit, scanJsonFrame, YAML parser options, errors), runtime/toolchain and transitive closure. Capture Node/Bun reference/default rows including traces, full UTF-16 outcome frames, exact errors and output shapes. Include coercion hooks (Symbol.toPrimitive, toString, valueOf), throws, NaN/±0/0n, null/undefined/Symbol, stateful length and Proxy mutation.
- Gate B — protocol core/fake hosts: test token scope, nested and reentrant calls, invalid/stale handles, chunk offset/count/length corruption, cleanup on every exit, no eager whole-string allocation, exact lone-surrogate input/output/path/error transport, ordered members, null-prototype records and ordinary arrays. Test limits at 3,999,999 / 4,000,000 / 4,000,001 UTF-16 units where raw strings provide those lengths, depth 128/129, ordinary 100,000/100,001 values, numeric boundaries, duplicate keys, YAML tags/aliases and malformed input. Separately prove that a small raw length followed by huge coercion is not falsely claimed as hard-bounded.
- Gate C — N-API Node and Bun: rebuild fresh addon from pinned source; replay every Gate A/B case in Node and Bun. Require exact result, class/code/path/message/identity, observable trace, output shape/prototype, and zero unexplained mismatch. Add cancellation, deadline, meter refusal, callback failure, max buffer and reentrancy controls. Assert all failures leave no partial result or token leak.
- Gate D — WASM and actual browser, after ordinary Node/Bun parity: compile the production Rust method and generated wasm-bindgen web target from the same source. Replay the ordinary packet in Node/Bun WASM and real Chromium; verify unit-array handling of lone surrogates, exact errors, no Node globals, one Rust call per successful case, correct browser public facade route and per-call Context. Existing 11-case browser prototype is historical scoped evidence only and does not cover this expanded interface.
- Gate E — production facade: integrate ordinary mode only behind an opt-in entry; verify TypeScript public type signatures, exported UmfError constructor identity, default/reference route instrumentation, default-format semantics, no eager TypeScript copyJson, and complete transitive imports/resources. Keep TypeScript default selected through review.
- Gate F — separate catalog design and replay: freeze the scanner's raw indexed/length/slice reads, dynamic JSON.parse lookup, exact precedence and native result shape; keep it TypeScript-selected until that design independently passes Node/Bun and real-browser review. Do not imply ordinary binding qualification covers catalog mode.
- Gate G — independent installed replay: create a zero-transform fixed-point SDK archive after source closure is complete; bind archive members to exact Rust/addon/WASM/harness inputs; install/replay qualified Node, Bun and browser cases plus full SDK suite. Record versions, hashes, support subset and route calls. Only then consider ledger disposition/default route separately; this proposal does not authorize either.

## Known findings to close before source selection

The 39-case falsy expansion is clean on Node/Bun for its tested temporary N-API candidate, but it is not the production interface. Sol's recorded unresolved findings remain explicit: isolated-surrogate error-path loss through to_utf8().unwrap_or_default(); JSON-hash receipts do not validate object shape/prototypes; throwing length/coercion exception identity is not covered by the improved candidate; host JSON preflight is unmetered and outside the shared Context ledger; and the transitive source closure is partial. Also open are exact facade class identity, direct shape/error identity matrices, catalog scanner semantics and output shape, broader general inputs, controls at host callback boundaries, actual WASM/browser requalification, installed SDK qualification and source selection.

## Governing inputs consulted

- .helix.yml and docs/helix/04-build/rust-migration-plan.md (R8 source and binding gates).
- docs/helix/02-design/contracts/CONTRACT-001-core-envelope.md (serialization profile, limits, errors and preservation boundary); CONTRACT-011's JSON/YAML source-retention constraints are adjacent native-source behavior but do not expand this operation's claim.
- src/model/serialization.ts, src/model/json.ts, src/model/internal/scan-json-frame.ts, src/model/errors.ts and crates/umf-core/src/{serialization.rs,context.rs,value.rs}.
- Evidence packets r8-read-json-value-raw-host-prototype, r8-read-json-value-expanded-oracle-20261027, r8-read-json-value-improved-raw-host-20261027, and r8-read-json-value-falsy-expansion-20261027.
