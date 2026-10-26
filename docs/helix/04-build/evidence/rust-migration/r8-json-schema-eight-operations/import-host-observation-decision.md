---
ddx:
  id: umf.evidence.r8-json-schema-eight-operations.import-host-observation-decision
  type: execution-evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: CONTRACT-002
      kind: informed_by
    - id: umf.evidence.r8-json-schema-eight-operations
      kind: informed_by
    - id: umf.plan.rust-migration
      kind: informed_by
---

# R8 JSON Schema import host-observation decision

## Decision

Keep the TypeScript `importJsonSchema` implementation as the default route.
The production Rust interface is a staged host observation followed by an
owned-data request: JavaScript performs source-ordered property reads,
enumeration, source-observable native URL/coercion effects, and exception timing;
Rust owns URI/schema rules,
native JSON parsing and tree construction, document admission,
validation/diagnostics, resource identity, limits after admission, and the
returned UMF value. A stage may dispatch only
after its host action succeeds. Do not eagerly snapshot all options/resources
or perform a Rust refusal before a source-earlier TypeScript observation.

This decision does not grant parity for exotic JavaScript inputs. The existing
safe own-data-property wrapper is a valid opt-in profile, not an emulation of
source semantics. If exact host observation cannot be maintained by staged
callbacks, retain the TypeScript route for that input/API surface.

## Source-observable import stages

The order is derived from `src/adapters/json-schema/index.ts` and is normative
for compatibility work. “Exception” means the original host exception escapes
at that stage; Rust diagnostic mapping starts only after a stage has completed.

| Stage | Host action and observation | Exception/refusal timing | Rust receives / owns |
|---|---|---|---|
| 1 | Evaluate `options.baseUri` read #1 and call `ensureUri` on the result. | Getter exception first; then URI type/parse/fragment refusal. No resources or root parsing yet. | First URI text only after successful host observation/URI check; retain this distinct from later reads. |
| 2 | Evaluate `options.resources || {}` and call `Object.entries(resources)`, which snapshots all enumerable own string-key/value pairs. | `resources` getter follows read #1. Proxy `ownKeys`, descriptor and `get` traps or accessors can throw during `Object.entries`; getters for all included entries run before resource parsing begins. Symbols and non-enumerable keys are omitted. | Ordered `[uri, source]` values after reflection succeeds. JS performs reflection only; it does not parse sources. |
| 3 | For each snapshotted entry in order, evaluate `ensureUri(uri)` in JS, then send its source string to Rust to parse and return the stage result before processing the next entry. | URI refusal precedes that entry's parse. Parse/limit refusal for an entry precedes URI checking/parsing of later entries, though all `Object.entries` getter effects already occurred in stage 2. | Rust parses each resource source to the exact native JSON tree, retaining number lexemes, duplicate-key and structural checks. Rust returns success/failure before the next entry stage. |
| 4 | Evaluate `options.baseUri` read #2 into the payload's `baseUri` field. | Getter exception occurs after all resource stages and before root parsing. This read is not automatically equal to validated read #1. | Preserve read #1 (retrieval-URI validation) and read #2 (payload value) separately; validate the payload value under Rust-owned CONTRACT-002 rules. |
| 5 | Call `parseNativeJson(text)` for root and wait for Rust's stage result. | Root size/syntax/duplicate-key/structure refusal occurs after read #2 and every resource parse, but before reading `id`. | Rust parses root source and returns its owned tree or exact stage failure. |
| 6 | In document construction evaluate `options.id`, then evaluate `options.baseUri` read #3 for module namespace. | `id` getter can fail after all parsing; read #3 follows it and may return another value or throw. Preserve source order and the three distinct reads. | Rust receives id and namespace observations separately from the payload URI and initial URI. |
| 7 | Complete document assembly, then call `inspectJsonSchema(doc)`. | Semantic/representation diagnostics become the source `JSON_SCHEMA_INVALID` refusal after construction. No network lookup occurs. | Rust-owned document admission and bounded Draft 2020-12 interpretation; exact diagnostic order/message remains evidence-gated. |
| 8 | Return the document. | No further host reads. | Return copied/tagged UMF document; caller mutation must not mutate Rust-owned state. |

The observed direct-call getter trace for a Proxy-backed `options` object with
valid `{}` root was `baseUri, resources, baseUri, id, baseUri` in Bun. This is
one host/runtime observation, not a cross-runtime parity receipt; reproduce it
from direct TypeScript calls in each qualification host.

`parseNativeJson` in `src/model/native-json.ts` first reads `text.length` and
checks the text limit, then calls `JSON.parse(text)`, then parses the same input
with the YAML 1.2 core parser (`intAsBigInt`, unique keys, strict mode) and builds
the tagged tree while enforcing depth/value limits. Thus non-string values may
trigger a `length` getter, `JSON.parse` coercion (`Symbol.toPrimitive`,
`toString`, etc.), or host exception before Rust sees the input. Exact
`JSON.parse`/ToString behavior and exception identity are not yet qualified
against the Rust parser. The JS shim may perform only the unavoidable native
reflection/coercion/exception effects at their source stage; Rust must own
resource and root parsing, return each parse result before the next parse
stage, and must not fall back permanently to the TypeScript parser. Until Rust
can reproduce the required parser outcomes or the contract bounds accepted
inputs to strings with parity evidence, exact parser-edge compatibility is
unresolved and the default route stays TypeScript.

## Host/Rust interface

Use explicit stage messages, not one eager `importJsonSchema` DTO. Each request
contains a stage identifier and only values successfully observed by earlier
stages. Rust returns a parse result before the next resource/root parse stage.
The JS shim performs source-ordered native reflection and coercion only; it
does not parse JSON or perform schema/document admission. The host must throw
the original exception object within the same call stack when possible; a
serialized error string cannot recreate identity, prototype, stack, or
user-defined fields. Rust must not request later-stage observations until the
current stage is accepted.

Rust owns URI/schema/document validation once host-observable operations have
completed, including exact numeric-tree retention, resource collision checks,
schema diagnostics, and the UMF result. The interface must keep first validated
`baseUri` distinct from the later `namespace` observation. The safe profile may
instead require plain objects and enumerable data properties, but it must be
named/documented as a distinct opt-in profile and cannot claim source parity.
The present `ensureUri` calls use the host's `URL` constructor and `includes`
method; their coercion, exception and parsing order must be captured in the
wrapper while Rust independently enforces the accepted URI rule. Any mismatch
between the host URL result and Rust URI validation is a cutover blocker, not
permission to leave a second schema policy in JavaScript.

### Values that cannot be serialized as host behavior

JSON/tagged wire can carry primitive values, ordered entry snapshots, native
JSON trees, and explicit outcomes. It cannot carry or reproduce getter/setter
execution, Proxy traps (`get`, `ownKeys`, `getOwnPropertyDescriptor`), the
timing/count/order of those effects, symbols, non-enumerable properties,
prototypes, callable values, object identity/aliasing, thrown-object identity,
or arbitrary exceptions with custom prototypes/accessors. `Object.entries`
effects and any required native `ToString` effect must therefore stay in
JavaScript. Rust can consume the resulting data, but cannot infer or replay
effects from a serialized snapshot. Parser semantics remain Rust-owned; this
does not authorize a lasting TS parsing fallback.

## Node/WASM parity contract

The Node addon and WASM/browser binding share stage names, field meaning,
ordered entry semantics, refusal precedence, and Rust-owned outcomes. Node may
use N-API and WASM may use explicit JS callbacks, but both must run each host
observation in JavaScript and enter the same Rust stage operation. Callback
exceptions must stop the stage immediately; no subsequent observation or Rust
dispatch may occur. Error envelopes preserve `name`, code/path when generated
by UMF, and message as far as the public API contract permits. Native exceptions
remain native host exceptions where source parity is claimed. Callback failures
must not be converted into schema diagnostics.

The accepted eight-operation evidence is bounded: prepared Node 26.12.1, Bun
1.4.3 native/WASM, and Chromium 153.0.8010.12 match 41/41 frozen outcomes, and
five operation-control probes match per host. It does not establish raw import
observation parity. Earlier 27/30 results document three exact profile
differences; later matching fixtures do not waive the narrow validator profile.
Rust's recursive `additionalProperties: true` profile is not general Draft
2020-12 support. Performance and budget evidence also remains material: prepared
setup moves substantial work outside operation budgets and changes meter
sequences. Keep TypeScript default.

## Required refusal-order and parity tests

Before any route work, add source-bound cases that run unchanged against TS,
Node, Bun native, Bun WASM, and real Chromium WASM and compare ordered events,
thrown behavior, returned document, and dispatch count:

- Invalid base URI versus a root parse failure: URI refusal first; resources and
  root are untouched.
- Base URI getter throws: exact throw before resources getter, enumeration,
  root parse, or dispatch.
- Resources getter throws after valid base URI: exact throw before root parse.
- Resource `ownKeys`/descriptor/get trap throws: exact `Object.entries` timing;
  no root parse or Rust dispatch.
- First resource invalid URI plus invalid source: URI refusal first.
- First resource valid URI but invalid source plus a later invalid URI: first
  resource parse refusal first.
- Invalid resource JSON plus invalid root JSON: resource parse refusal first.
- All resources valid plus invalid root JSON: root refusal before reading `id`.
- `baseUri` read #2 throws after all resource parsing but before root parse; read
  #2 differs from read #1 and remains the payload URI.
- `id` getter throws after successful root parse; `baseUri` read #3 throws after
  `id`; each of the three reads returns a distinct value in a success case.
- Sparse, symbol-keyed, non-enumerable, accessor, null-prototype and Proxy
  resource inputs, recording which source operations observe or omit each.
- Rust/schema validation failure after successful host stages; verify no
  re-reading options, no mutation of source inputs, and identical diagnostic
  ordering across Node and WASM.
- Host callback failure at each stage and control refusal at each boundary;
  prove later-stage callbacks and Rust dispatch did not run.
- `text.length` getter, JSON.parse coercion hooks, Symbol input, and custom
  throwing `toString`/`Symbol.toPrimitive`; pin current TS outcomes, then record
  Rust parser parity or an explicit accepted-input boundary. No permanent TS
  parser fallback is permitted.

The trace oracle must be generated by direct calls to the current TypeScript
source, not by predicting proxy/accessor traces from input shape. Include both
successful and throwing effect logs. Existing 24-case boundary and 41-case
operation packets are supporting evidence, not substitutes for this stage
matrix.

## Stop gates

Do not change a default route until (1) the staged contract is implemented for
both bindings; (2) all refusal-order/effect traces match current TypeScript in
installed Node/Bun and actual Chromium; (3) semantic/profile differences are
resolved by CONTRACT-002 authority or remain excluded from routing; (4) all
eight operations are requalified together with raw host/control boundaries;
(5) result-copy and exact-number preservation pass; and (6) setup and per-call
work budgets, cancellation/deadline/meter exceptions, and performance are
accepted for the intended default call pattern. Sol's interface review is a
pre-implementation gate; this draft records the proposed decision only.
