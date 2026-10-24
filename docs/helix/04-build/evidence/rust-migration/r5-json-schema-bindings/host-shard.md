---
ddx:
  id: umf.evidence.r5-json-schema-bindings.host-shard
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
---

# R5 JSON Schema host-binding implementation shard

This shard adds the opt-in `umf-r5-json-schema/0.1.0` operation dispatcher to
`umf-core-wire`, plus Node and WASM entrypoints and package wrappers for the
seven frozen predecessor operations: import, inspect, root/resource/bundle
export, node lookup and schema-position walk. Requests carry an explicit
ordered array of `{uri, source}` resources. The dispatcher uses one ordinary
Rust `Context` with the binding work hook across tagged decode, resource
admission, operation execution and tagged result encoding. It emits the
existing `umf.core-wire/1` result envelope.

The wrappers use descriptor-based reads for the import options and resource
map, then pass ordinary input trees through the tagged UTF-16 wire admission.
Accessor properties are refused without invoking their getters. JavaScript
Proxy traps cannot be detected or prevented by ECMAScript reflection and may
run during prototype, own-key or descriptor inspection. The wrapper also
rejects symbol and non-enumerable resource properties; the TypeScript
predecessor's `Object.entries` ignores those properties. This deliberate
host-admission restriction avoids silently reading caller properties outside
the declared string-key resource map and must remain part of the qualified
support boundary. Host work/deadline/cancellation controls use the existing
binding control bridge.

The binding wrapper follow-up charges the resource-key count immediately after
`Reflect.ownKeys` and before reading any resource descriptor. It charges each
URI before descriptor access and meters URI-keyed resource-map reconstruction
for both resource and bundle exports. The shared JSON Schema helper is now
generated from the Node source by the R7 WASM source-pair script, including its
`shared-sources.json` digest.

The focused Bun wrapper suite passes 11 tests / 37 assertions across Node and
WASM helper shapes. A 10,000-key Proxy case with a one-unit budget refuses
before any resource descriptor read; the export-map test verifies reconstruction
is charged. Error compatibility tests verify semantic failures use the public
`UmfError` name while the recognized control codes retain the `UmfCoreError`
class and code/message/path. `wasm-package-sources.ts --check` passes, and a
temporary appended-byte probe confirmed that it rejects drift in the generated
JSON Schema helper; the source was regenerated and the check passed again. Node
syntax checks pass for both package entrypoints and both shared helper copies.

The Python wrapper and native `umf json-schema` CLI now expose the same seven
operations through the exact `umf-r5-json-schema/0.1.0` profile. Python
preflights controls before resource traversal, accepts an exact built-in dict
for ordered URI/source pairs, and meters before each iterator advance and pair
copy. The prepared host charge and control callbacks continue through tagged
request/response handling. The CLI reads at most 32 MiB of stdin wire and
accepts `--max-work` and `--timeout-ms`; `--version` and `--capabilities` expose
the profile and seven-operation list. Neither host changes the default adapter.

Python returns exported native JSON numbers as immutable
`umf.rust_json_schema.ExactJsonNumber` values. The carrier retains the original
lexeme, supports identity-preserving copy/deepcopy, and exposes `to_json()`;
`dump_native_json()` emits these values as number tokens without quoting or
normalization. Python's standard `json.dumps` does not serialize the carrier as
a JSON number. This avoids CPython's integer-string digit cap and Decimal
exponent limits. The Python output carrier is not TypeScript `JSON.parse`
number-object parity, and a separate source-bound predecessor comparison is
still required.

Pinned Rust 1.90.0 `cargo test --locked --offline -p umf-cli --test
json_schema_cli` passes two integration tests covering a clean-PATH CLI,
profile mismatch, version/capabilities, and work/deadline refusal. `cargo check
--locked --offline -p umf-core-python` passes. A direct CPython 3.11.17 smoke
against the dev extension covers Python operations, ordered resource maps,
bundle export, controls, hostile-Mapping refusal, and exact 5,001-digit integer
plus 80-digit exponent tokens through root/resource/bundle export and
`dump_native_json`. The pytest regressions were added but could not be run in
this offline host because pytest and pydantic are not in its package cache.
This is local source execution only; it does not qualify an installed wheel,
hosted matrix, TypeScript parity, or release.

Python and CLI source hashes for this checkpoint:

```text
bindings/core/python/src/lib.rs             3403d337d5db016f4bb31a399df4bf5dbc11a39a2f9c8091be00d0a22f1c1712
python/src/umf/rust_json_schema.py          4a19abe936495417f9d9e8a5c3dc67a97298767efccd19a79115c6eccbd04449
python/tests/test_rust_json_schema.py       4767700be67c052825d934707cda932a6dee4bb9462e6d94b945a76e46bb8dc4
crates/umf-cli/src/main.rs                  825d9f47c748be4612b263577cd05409bdb544eb356538129a6783011cb90d3d
crates/umf-cli/tests/json_schema_cli.rs     7747b60d8c96eaf9c9539890afefc331be11febc38e2eddb85c2ab7eb3d51266
```

The public Node engine repro could not execute: the checked-in addon loaded from
`bindings/core/node/umf_core_node.node` has no `executeJsonSchemaWire` export
(`RUST_NODE_BINDING_MISSING`). Thus these are helper-level tests, not proof of
the native dispatch path. This shard remains implementation evidence only; it
does not establish predecessor parity, complete Draft 2020-12 interpretation,
upstream corpus results, independent native-oracle agreement, or installed
Node/Bun/Chromium behavior.

Source hashes for this binding receipt:

```text
bindings/core/node/src/json-schema.js       6ac508781f815114df2a816b632d9930a2eba414ecdf4d068d641a6fb87d3b73
bindings/core/wasm/src/json-schema.js       6ac508781f815114df2a816b632d9930a2eba414ecdf4d068d641a6fb87d3b73
bindings/core/node/index.js                74f337fd01cfa09ffb4276bb4d164ddc75f106a55d9c32a85894fd048bdbf17a
bindings/core/wasm/index.js                aa2063575f933af51954597bdeb0bd28e342b4dc30dddaa16c50c79cc4b916e5
bindings/core/node/index.d.ts              60a284d35559407b77de698d5352eeff19f66f0aeb5068e0bda3179eb769c45e
bindings/core/wasm/index.d.ts              ebfe451966f22b94f57de696e63e4e35cec84385b884b8c44f5e20e18c973d09
bindings/core/node/tests/json-schema-wrapper.test.js 1750ab9872ddb9fb1bcfe712aa8b490086a7387db6c5b9755c10147c24e691e2
scripts/rust-migration/r7/wasm-package-sources.ts 1327b5929546c8645c2228a6b02331395dccdcfdd845d176da72517d0465d360
bindings/core/wasm/src/shared-sources.json  f7b373e98e908c22cc0c06a627ecc3b9a0443f560d598b5842b168480d948742
```
