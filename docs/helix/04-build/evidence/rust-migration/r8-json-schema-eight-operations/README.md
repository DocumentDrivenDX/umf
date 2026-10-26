---
ddx:
  id: umf.evidence.r8-json-schema-eight-operations
  type: execution-evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: CONTRACT-002
      kind: informed_by
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: umf.evidence.r5-json-schema-bindings.predecessor
      kind: informed_by
    - id: umf.evidence.r5-json-schema-tree-operations.predecessor
      kind: informed_by
---

# R8 JSON Schema eight-operation opt-in packet

## Current TypeScript boundary audit and route decision

The supplemental [boundary predecessor](boundary-predecessor.json) freezes 24
current TypeScript observations on Bun 1.4.3 (SHA-256
`afe87bd0cb2ea9b48cbf04c6888a620ac746c133a00b98f08356615776557a38`). Its
capture harness is
[`json-schema-root-boundary-predecessor.ts`](../../../../../../scripts/rust-migration/r5/json-schema-root-boundary-predecessor.ts),
SHA-256 `6f1f17d9daf28ab14efa6a7b5f527395b0364065dae8313c3754f746d5d4b654`.
It pins source files and includes one representative case for each of the eight
exports, direct import refusal order, accessor/proxy traces, the fact that the
TypeScript API ignores a third-argument work-control object, raw pointer/document
inputs, and validator-profile examples. Accessor/proxy outcomes themselves are
the recorded trace oracle; input metadata makes no separate expected-trace
claim. Together
with the historical 41-case packet this gives broader review coverage; it does
not refresh the older installed-artifact hashes or receipts in this folder.

The route decision for the eight root exports is to keep the TypeScript route.
The Rust implementation remains an explicit opt-in tagged/profile engine. The
operation decisions are:

| Export | Rust ownership and existing evidence | Cutover blocker / decision |
| --- | --- | --- |
| `importJsonSchema` | Rust adapter and wire dispatch exist; the historical 41-case cohort exercises imports. | TypeScript reads option getters and `Object.entries` invokes resource accessors/proxy traps in the frozen trace. The binding instead performs safe data-property admission and host work preflight. The source API has no control parameter. Keep TypeScript default. |
| `inspectJsonSchema` | Rust inspection and wire dispatch exist; bounded-profile vectors and the 41-case cohort exist. The Rust profile now admits boolean `additionalProperties: true` recursively when every other keyword stays inside the qualified grammar. | `false` and schema-valued `additionalProperties` remain outside the Rust profile. Other profile and host-boundary gaps remain. Keep TypeScript default. |
| `exportJsonSchema` | Rust export exists and is covered by the bounded export cases. | `exportable()` re-inspects semantics; profile gaps can change refusal/diagnostics. Only profile-qualified schemas can be considered for opt-in use. Keep TypeScript default. |
| `exportJsonSchemaResources` | Rust resource export exists; Node/WASM factories reconstruct URI maps with null prototypes and metered copies. | Same semantic/profile limitation as export, plus host result projection and resource-key order need a fresh installed replay. Keep TypeScript default. |
| `exportJsonSchemaBundle` | Rust bundle dispatch exists; the predecessor bundle packet covers source copy and diagnostic order. | It embeds inspection diagnostics, so incomplete-profile results differ from TypeScript; source API has no caller controls. Keep TypeScript default. |
| `getJsonSchemaNode` | Rust node lookup and tagged clone exist; valid string pointers and copied outputs are in the historical packet. | Raw numeric pointer is a JavaScript `TypeError`; Rust wire rejects it as `REQUEST`. Keep TypeScript default until the host boundary is deliberately reconciled. |
| `walkJsonSchema` | Rust traversal exists and the historical packet covers positions and output isolation. | Exact current-source order, copy charging, and raw document reflection have not been refreshed against the installed candidate; it shares the host and schema-boundary gaps. Keep TypeScript default. |
| `editJsonSchemaNode` | Rust edit is atomic and bounded by its profile; the current 11 edit cases are in the integrated historical packet. | Source parser/pointer/type and schema validation ordering must remain exact; edits outside the accepted profile refuse. Host raw values and control ordering differ. Keep TypeScript default. |

The boundary packet shows three refusal-order cases: invalid base URI beats
invalid root JSON; invalid resource URI beats invalid root JSON; invalid
resource JSON beats invalid root JSON. It also shows direct TypeScript
accessors execute and proxies receive `get`/`ownKeys`/descriptor traps, whereas
the opt-in wrappers intentionally perform preflight and descriptor-safe
admission before Rust dispatch. That is not an equivalent default boundary.
The packet's raw cases are direct calls to exported source functions; the
existing wrapper suite and five-case host-control receipts are separate
candidate evidence, not predecessor parity evidence.

Profile examples are explicit: a schema with root and nested
`additionalProperties:true` is `valid:true, complete:true, diagnostics:[]` in
the current TypeScript `inspectJsonSchema` implementation. Rust now admits that
boolean-true keyword in its existing recursively checked profile; it still
rejects `additionalProperties:false` and schema-valued forms from that profile.
The fixed instance vectors were checked with Ajv 8.20.0
(`Ajv2020({allErrors:true, validateFormats:false})`) and the pinned Rust
`jsonschema` 0.29.1 oracle: an otherwise valid object with extra properties
passes, while a value with an invalid declared property fails. The corresponding
Rust inspector returns no diagnostics for the nested true case and retains
`JSON_SCHEMA_VALIDATOR_LIMIT` for false, schema-valued, and nested false cases.
This is evidence only for the boolean-true keyword inside the preexisting
profile (`$schema`, safe relative `$id`, scalar `type`, safe unique `required`,
`properties`, `$defs`, `minimum`, `minLength`, and `prefixItems`); it does not
qualify other Draft 2020-12 constructs or change the default TypeScript route.
`$dynamicRef`, `unevaluatedProperties`, and unknown keywords retain source
meaning and remain incomplete in TypeScript. The candidate's narrower
recursive profile must not be expanded by assuming that all schemas accepted
by Ajv are fully supported.

No Node/WASM binding or package-root route was changed for this audit. A root
route remains blocked until current-source installed Node and Chromium replays
cover the eight names plus raw-host/control boundaries, and the Rust profile
delta has a governing compatibility disposition. `parseNativeJson` and
`jsonSchemaRegistry` remain separately owned/excluded exports.

This packet qualifies two Rust-backed opt-in engine entrypoints for
`importJsonSchema`, `inspectJsonSchema`, `exportJsonSchema`,
`exportJsonSchemaResources`, `exportJsonSchemaBundle`, `getJsonSchemaNode`,
`walkJsonSchema`, and `editJsonSchemaNode`. The TypeScript default routes remain
unchanged. The legacy stateless factory remains available; the additive
`createPreparedJsonSchemaEngine` retains immutable admitted resources and
compiled schemas. This is host behavior evidence for the captured cohorts, not
a release or full Draft 2020-12 claim.

The predecessor comparison composes the frozen 30-case seven-operation packet
and the 11 `editJsonSchemaNode` cases from the frozen 22-case tree-operation
packet. It excludes that packet's 11 `parseNativeJson` cases. Both input packet
hashes, exact IDs, host-order controls, and historical differences are recorded
in [predecessor-manifest.json](predecessor-manifest.json).

## Prepared runtime captured cohort

Each host matched all 41 exact predecessor outcomes: 30 façade cases and 11
edit cases. The result breakdown was 26 returned outcomes and 15 refusals, with
zero mismatches on each host. Host-control results are separate from those
predecessor counts: all five control probes matched on Node, Bun with the
native addon, Bun with WASM, and Chromium with WASM. Chromium also reported
clean browser globals (`process` and `Buffer` absent).

| Host | Result | Receipt |
| --- | --- | --- |
| Node 26.12.1, native addon | 41/41 outcomes | [prepared Node receipt](receipts/prepared-node.json) |
| Bun 1.4.3, native addon | 41/41 outcomes | [prepared Bun native receipt](receipts/prepared-bun-native.json) |
| Bun 1.4.3, WASM | 41/41 outcomes | [prepared Bun WASM receipt](receipts/prepared-bun-wasm.json) |
| Chromium 153.0.8010.12, WASM | 41/41 outcomes; 5/5 operation controls; 4 setup controls | [prepared Chromium receipt](receipts/prepared-chromium-final.json) |

The same source/artifact cohort also passed the legacy stateless Node replay at
41/41 ([receipt](receipts/stateless-node-final.json)). Every replay returned
26 outcomes and refused 15, with zero exact predecessor mismatches. The
prepared browser setup controls record a one-time resource setup meter total
of 411,247,661 units over 10,383,634 callbacks. Setup `resourceControls` with
`maxWork: 0` refuses before any callback; setup callback failure maps to
`METER_FAILURE`; operation `controls` remain separate, so `controls.maxWork: 0`
allows factory construction and refuses at the first operation.

The earlier 30-case cohort recorded five differences: `import.invalid-native-schema`
(diagnostic wording/details), `inspect.success` (incomplete result),
`export.bundle` (validator-limit diagnostic),
`inspect-unknown-keyword-and-exact-unsafe-number` (numeric diagnostic wording),
and `copy-isolation-get-bundle-walk` (incomplete bundle in copy snapshot).
The inspector repair removed the two wording differences; the later 27/30
cohort retained the three validator-limit differences. They remain visible as
historical results in the manifest and their prior exact behavior is not
treated as a compatibility waiver.

In the current 41-case cohort, those three frozen cases now match exactly. The
source change is the narrow `validator_profile_positions` check in
`json_schema_inspect.rs`: schemas inside that explicitly limited syntax subset
can report `complete: true` after successful compilation. A passing frozen
fixture does not certify arbitrary Draft 2020-12 schemas. As a counterexample,
`{"type":"object","additionalProperties":true}` compiles but remains
`valid: true`, `complete: false`, with `JSON_SCHEMA_VALIDATOR_LIMIT`. The
focused regression `additional_properties_stays_incomplete_outside_recursive_profile`
passes in `r5_json_schema_inspect.rs`.

The profile accepts slash and Unicode property names: `a/b`, `é`, and `😀`.
Ajv 8.20.0 instance validation confirms they are ordinary property names and
reports `/a~1b`, `/é`, and `/😀` for corresponding invalid values. The Rust
profile/compiler test compares valid and invalid instances against its pinned
native JSON Schema oracle; the expanded Ajv fixture is
`scripts/rust-migration/r5/json-schema-validator-profile/verify-ajv.mjs`.
The affected Rust target passes 16 tests. `__proto__` remains excluded from
this qualified name subset, and `additionalProperties: true` remains an
explicit incomplete-profile counterexample. These cases do not widen the claim
to general Draft 2020-12 support.

## Source and artifact identity

The prepared cohort uses Node and WASM wrapper hashes `6797f17c3a5be5efdb1445319a26143ae44a8d1f7fb52c8a09fee60def05fd84` and `9f359f487555f43ef5284ffd58741872514ea7f701bf071096ed6756d674c8dc`.
Its native addon hash is `87e9327d452f17c25bb4860587f2c38a831098f6565ed0720e7242fa3bc48e18`; generated WASM JavaScript and binary hashes are `0c95324f4c9379e3a1f0639c6b710b81c1203df24e9443419d7169805f919435` and `fa6e7c83df227957abfe8859a6a6eabeef1842ac145c6b1baf94639045f96881`. The receipts pin these artifacts, replay scripts, the Rust JSON Schema owner, prepared wire entrypoint, and predecessor fixture packets. Builds used Rust 1.90.0, locked offline dependencies, isolated `/private/tmp` target directories, and `wasm-bindgen` 0.2.100. Chromium loaded the generated WASM package through the replay’s temporary loopback server.

The shared indexes were subsequently extended for the separate Protobuf export
cohort. These receipts pin immutable Node/WASM package snapshots from before
that extension; they do not describe the later-mutated workspace index files.

## Performance and boundary

A 251-byte nested schema fixture measured over 20 synchronous iterations on
Bun 1.4.3. TypeScript import/inspect/export took 15.32/13.33/4.47 ms per call.
The legacy Rust stateless route took 918.13/882.07/870.02 ms per call. The
prepared route paid 594.45 ms once for factory setup and then took
14.56/16.22/13.90 ms per import/inspect/export call. This is a diagnostic
sample, not a stable benchmark. Default selection remains held: prepared
factory setup is substantial and moving fixed resource/schema compilation to
setup changes operation `maxWork`/meter sequences. For example, bundle output
at `maxWork: 10000` refuses after 1,436 callbacks / 9,936 units on the prepared
route, versus 264 / 2,330 on the stateless route. The separate prepared
`resourceControls` setup budget is opt-in and requires a governed compatibility
decision before default cutover.

The prepared control-staircase receipt is stored as
[`prepared-control-staircase-final.json.gz`](receipts/prepared-control-staircase-final.json.gz)
because its exact per-callback meter traces expand to 154,450,452 bytes of
JSON. Gzip reduces the tracked artifact to 6,196,526 bytes without changing
the receipt: the predecessor manifest pins both hashes and byte lengths. Verify
the compressed and uncompressed digests with:

```sh
node scripts/rust-migration/r5/json-schema-eight-operations/read-control-staircase-receipt.mjs \
  docs/helix/04-build/evidence/rust-migration/r8-json-schema-eight-operations/predecessor-manifest.json \
  receipts/prepared-control-staircase-final.json.gz
```

Add an optional output path to restore the exact original JSON. The reader
verifies both digests and sizes before renaming its temporary output into place.

The controls exercise initial work refusal, cancellation and deadline
preflight, first meter-hook failure, late bundle-output meter failure, setup
work limits, and setup/operation callback separation. They do not qualify all
host mutation, cancellation timing, or resource-size behavior. The adapter
remains opt-in; complete support outside the recorded narrow profile and
default-route budget compatibility are unresolved.

## Non-string pointer wrapper correction

The Node and WASM operation façades now evaluate the source expression
`pointer.startsWith('/')` for non-string pointers to `getJsonSchemaNode` and
`editJsonSchemaNode`. Numeric, null, undefined, and a plain object therefore
produce the runtime's native `TypeError`; 16 wrapper probes compare the wrapper
message with the same expression and assert zero dispatches. A method-bearing
object also preserves its `startsWith` call and proceeds to the existing
opt-in dispatch if that call returns. For `edit`, the pointer expression
precedes host preflight, matching the source operation's
pointer-before-document/replacement order. For `get`, host preflight still
precedes the pointer expression. The TypeScript source validates the document
before checking the pointer, while the Rust wire decoder requires the pointer
before decoding the document; malformed-document plus non-string-pointer
precedence therefore remains unresolved. This correction does not qualify a
default route, general exotic-object parity, schema-profile expansion, or Draft
2020-12 parity.

## Direct TypeScript import host-observation subset

[`import-host-observation.ts`](../../../../../../scripts/rust-migration/r8/import-host-observation.ts)
calls the current `importJsonSchema` source directly and captures nine bounded
stage 1–6 cases: successful getter ordering through document construction,
invalid URI precedence, original getter-exception identity, resources getter
and `ownKeys` failures, resource parse precedence, and the source's observed
`toString` call before YAML reports a non-string root. The observed Bun 1.4.3
receipt is [here](import-host-observation.json). The same source was bundled
with Bun and run under Node 26.12.1; its receipt is
[here](import-host-observation-node.json). Both pin the same
`src/adapters/json-schema/index.ts` SHA-256 and record outcomes/events rather
than predicted traces. Real Chromium 153.0.8010.12 ran the same nine calls
from a browser-targeted bundle served over loopback; its separate receipt is
[here](import-host-observation-chromium.json). All three cohorts have identical
case traces and outcomes, including the root `toString` event immediately
before `TypeError("source is not a string")`. The final two cases show that
three absolute `baseUri` reads remain distinct (payload URI is read #2 while
module namespace is read #3) and that root parse failure after read #2 prevents
both `id` and read #3. Chromium also recorded zero page errors, zero external
requests and exactly one successful (200) served-bundle request. Every runner
asserts its negative controls before writing its receipt.

Run the Bun cohort from the repository root with:

```sh
bun scripts/rust-migration/r8/import-host-observation.ts
```

For Node, bundle that entrypoint with the repository's Bun 1.4.3 toolchain
(`bun build scripts/rust-migration/r8/import-host-observation.ts --target=node
--outfile=/tmp/r8-import-host-observation.mjs`), then run the generated module
with Node and pass an output path. Run the browser cohort from the repository
root with `bun scripts/rust-migration/r8/import-host-observation-chromium.ts`.
This is a partial oracle only: it does not cover all refusal boundaries,
descriptor/get traps, symbols/non-enumerable properties, general parser
coercion hooks, or the required staged-binding dispatch counts. The source hash covers only the
`index.ts` entry module, not transitive imports. It adds no Rust binding
evidence and does not support route changes; the default remains TypeScript.

The [staged string-input parity matrix](import-host-parity-matrix.json) now runs
18 source-bound cases against direct TypeScript, a fresh Node 26 native addon,
and fresh WASM in real Chromium 153.0.8010.12. Host-effect traces, Node/WASM
stage sequences, and exact outcomes match in all 18 cases. A focused Rust
correction preserves the source's three ordered Ajv details for the bounded
unsupported string `type` case; the core staged-import regression passes 8/8.
The full required matrix,
control-failure injection at every stage boundary, non-string parser effects,
installed-package parity, and route gates remain open.

Reproduce the macOS arm64 matrix from the repository root with pinned Rust
1.90, the current source, Node 26.12.1, Bun 1.4.3 and Chromium 153:

```sh
CARGO_TARGET_DIR=/private/tmp/umf-r8-json-stage-node-cargo RUSTC=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin/rustc /Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin/cargo build --locked --offline --release --manifest-path bindings/core/node/Cargo.toml
cp /private/tmp/umf-r8-json-stage-node-cargo/release/libumf_core_node.dylib /private/tmp/umf-core-node-r8-fresh.node
UMF_IMPORT_MATRIX_PROFILE=typescript bun scripts/rust-migration/r8/json-schema-import-stage-matrix-runner.mjs /private/tmp/umf-import-matrix-ts.json
UMF_IMPORT_MATRIX_PROFILE=node-native UMF_NODE_ADDON_PATH=/private/tmp/umf-core-node-r8-fresh.node node scripts/rust-migration/r8/json-schema-import-stage-matrix-runner.mjs /private/tmp/umf-import-matrix-node.json
bun scripts/rust-migration/r8/json-schema-staged-wasm-browser.mjs
node scripts/rust-migration/r8/json-schema-import-stage-matrix-receipt.mjs
```

The browser runner builds WASM offline and writes both its focused six-case
receipt and the 18-case browser profile. The matrix receipt compares the three
profiles and pins their source, runner and artifact hashes. Its direct adapter
hash covers the entry module only; this evidence does not establish transitive
source closure or general Draft 2020-12 parity.

The [non-string host observation](import-host-nonstring-decision.md) adds nine
direct-source root/resource cases with identical traces and outcomes in Bun,
Node, and real Chromium. These cases expose repeated `length` reads and
`JSON.parse` coercion before a later YAML parser TypeError for some objects.
The existing private staged method remains string-only. A separate
[bounded host-coercion bridge decision](import-host-nonstring-bridge-decision.md)
records an additive private method that admits only two effective source
texts. Its 29-case [Node/Bun matrix](import-host-nonstring-boundary-matrix.json)
and fresh [Chromium/WASM receipt](import-host-nonstring-chromium-bridge.json)
match direct TypeScript effects and outcomes for all 20 admitted cases per
host. Nine cases fail closed as explicit profile exclusions. Rust retains JSON
parsing; the host observes the source's coercion and later type refusal. This
does not qualify arbitrary non-string inputs or alter the TypeScript default
route.
