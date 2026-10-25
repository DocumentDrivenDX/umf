---
ddx:
  id: umf.evidence.rust-migration.r5-json-schema-tree-operations
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-002
      kind: informed_by
---

# R5 JSON Schema tree operations

## `parseNativeJson` host and control qualification

The parser itself already has a frozen 11-case subset in the 22-case packet
below, core parser tests, and opt-in JSON Schema wire dispatch. The supplemental
[host-boundary predecessor](native-json-host-predecessor.json) freezes six
direct TypeScript calls on Bun 1.4.3 (packet SHA-256
`1b10a80b22782dcccb19cb392b37162fd35031d5d39753f4dcd07ff67d259355`). Its
capture harness is
[`native-json-host-predecessor.ts`](../../../../../../scripts/rust-migration/r5/native-json-host-predecessor.ts),
SHA-256 `9a91318109bc73e183ff824acd8f81ad5aa456617f2aca67fae8eb2c53c848e7`.
It records that direct non-string calls have JavaScript `TypeError`/syntax
outcomes, including a null-specific message. The typed public contract takes a
string; the opt-in Rust wire boundary receives tagged values and rejects a
non-string `source` as `REQUEST` before parser entry. This is a deliberate
boundary difference, not raw-host parity. The Rust operation is qualified only
for already-admitted tagged string values.

The focused wire test also confirms a host `RESOURCE_LIMIT` refusal interrupts
the controlled wire operation before parsing, while the native parser's
existing core tests cover syntax-before-duplicate precedence and text/depth/
value limits. Binding factory preflight and full Node/WASM host-control mapping
remain covered only by their separate wrapper tests; this supplement does not
requalify installed native/WASM artifacts, default exports, or browser behavior.

This opt-in Rust binding adds `parseNativeJson` and `editJsonSchemaNode` beside
the existing JSON Schema inspect, export, get, and walk operations. The parser
preserves exact number tokens and the native JSON tree representation. The
edit path parses pointer and replacement inputs before document validation,
keeps the input document unchanged, validates before committing, and only
allows edits when every present schema/resource is inside the currently
qualified validator profile. That profile accepts Draft 2020-12 object/boolean
schemas composed of `type`, `properties`, `$defs`, `required`, `minimum`,
`minLength`, recursively walked `prefixItems`, and valid Unicode member names
except `__proto__`, with the previously qualified `$schema`/`$id` forms.
Other semantics retain the
`UNSAFE_EDIT` refusal. Fixed embedded registry resources are constructed using
a separate setup Context; request document work remains under the caller
Context.

The frozen TypeScript predecessor is [predecessor.json](predecessor.json),
SHA-256 `7fa939527796db5b0c541378fa7c877c413d53ed4c88db8a24945e9b08dc8a57`.
Its capture harness is
`scripts/rust-migration/r5/json-schema-tree-operations-predecessor.ts`, SHA-256
`5ce2782432ebcfda5a1335803013d2f79580d757a7db333aab6e4c2b769323dc`. It has
22 cases and a 32-file source closure. The unchanged packet tests exact-number
and UTF-16 tree parsing, syntax and duplicate-key precedence, depth/text/value
limits, pointer/replacement/source-validation order, source immutability, and
escaped, astral, and array-pointer edits.

On the fresh Node addon, the unchanged 22-case packet matched 22 cases on Node
26.12.1 and Bun 1.4.3. The frozen predecessor bytes remain unchanged at SHA-256
`7fa939527796db5b0c541378fa7c877c413d53ed4c88db8a24945e9b08dc8a57`. The
previous six mismatches are now reconciled: `minimum` and `minLength` numeric
positions are editable when their native values satisfy the existing exact
number gate; `prefixItems` arrays are traversed as schema positions; valid
Unicode property names including escaped `/` and `~` and astral keys are
supported, while `__proto__` remains refused; and root booleans are accepted
while scalar roots retain the predecessor `INVALID_EDIT`/`JSON_SCHEMA_ROOT`
refusal. Invalid numeric targets now preserve the predecessor's single Ajv
`type` diagnostic envelope. The edit profile continues to refuse unknown
keywords/dialects, unsafe numbers, lone-surrogate names, and other semantics it
cannot validate.

Fresh installed-package replays passed 22/22 on Node 26.12.1 and Bun 1.4.3;
their receipts were
`/private/tmp/umf-r5-json-schema-tree-node/node-replay-final.json` and
`/private/tmp/umf-r5-json-schema-tree-node/bun-replay-final.json` (each has zero
mismatches and pins the frozen packet hash). A fresh extracted WASM package also
passed 22/22 in real HeadlessChrome 153.0.8010.12, with no Node globals; receipt:
`/private/tmp/umf-r5-json-schema-tree-wasm/tree-browser-replay-fixed.json`. The
first browser receipt serialized the in-page result object through Playwright's
evaluation bridge, which omitted the own `__proto__` key in its transported
receipt despite the in-page JSON comparison passing. The corrected harness now
returns `JSON.stringify(actual)` across that bridge, checks `Object.hasOwn` on
the expected and actual values in Chromium, and verifies exact per-case JSON
equality before writing the receipt. The fixed receipt records
`prototypeOwnPropertyRetained: true`, `expectedPrototypeOwnPropertyPresent:
true`, and `prototypeCaseExactMatch: true`; its parsed `actual` also contains
the own `__proto__` member. The replay used fresh `wasm-bindgen 0.2.100` output,
whose generated WASM SHA-256 is
`251edfc989c64bc28a5a1480a53a8fc56a4839d9f5ad46083907370b2573a691`. These are
source-bound checkpoints for this bounded predecessor packet, not a claim of
complete Draft 2020-12 validator parity or default route selection.

A separate, intentionally narrow historical edit profile is frozen in
[qualified-edit-subset.json](qualified-edit-subset.json), SHA-256
`283b2503bafed573ebc30a64dcda12d7114888b2b1622c9e57d92d865e7089ce`. It
qualifies a `type` edit under `properties` with `complete:true`, exact emitted
source bytes, and input-source immutability; a `minimum` refusal with the exact
`UNSAFE_EDIT` envelope; and a scalar root replacement with the predecessor's
`INVALID_EDIT`/`JSON_SCHEMA_ROOT` URI diagnostic after source validation. Node
and Bun both passed all 3 cases; receipts are
[qualified-edit-node.json](qualified-edit-node.json), SHA-256
`0f567dcb198a6eda698331c0dc239df25bb519b5889bd9d13d729622f26dfa94`, and
[qualified-edit-bun.json](qualified-edit-bun.json), SHA-256
`e03caa67de3a77cfe4bc40014cf9fa7c1d3a19ad7af7c02fd8d0dcb219e31c11`.
Those three-case receipts belong to the earlier source cohort. In particular,
their `minimum` `UNSAFE_EDIT` refusal is superseded by the current qualified
numeric profile and must not be replayed as a current-source expectation.
The third case pins root-scalar validation order: on a profile-supported
source, replacing the root with a scalar yields the predecessor
`INVALID_EDIT` containing the URI-specific `JSON_SCHEMA_ROOT` diagnostic.
The clean extracted WASM/Chromium replay harness is
`scripts/rust-migration/r5/json-schema-qualified-edit-browser.mjs`, SHA-256
`5d798dd67e4422be1be4af94df3ac6eee04c121dfe91babc90db305a21d3e300`. It
passed 3/3 in HeadlessChrome 153.0.8010.12 against the clean package at
`/private/tmp/umf-r5-json-schema-tree-wasm/package`; the durable receipt is
[qualified-edit-chromium.json](qualified-edit-chromium.json), SHA-256
`162d8eb2b37319aea1d0f078220d56b4ec0e060f57a39dfdc7d6c5dc239d1461`. It records the
WASM/glue hashes and exact Rust/wasm-bindgen build inputs. The Node/Bun receipts
now also record their installed package root, package/addon/facade hashes,
Cargo build command, and source hashes. The stale ignored addon in
`bindings/core/node` is not the tested artifact. Node/Bun resolve the bare
package name from the clean install at
`/private/tmp/umf-r5-json-schema-tree-node/install/node_modules/@umf/core-rust-native`.
The browser receipt pins `crates/umf-core/src/dataset_values.rs` at
`92c2121a1968303c67a822e14b013a94aa65320bd0074d43f1b5ba6d7a0f1917`; this
identifies the concurrent core source captured by the WASM artifact.

Focused checks on the captured source state:

- `cargo test --locked --offline -p umf-core-wire --test r5_json_schema_wire`:
  7/7 passed.
- `bun test ./bindings/core/node/tests/json-schema-wrapper.test.js`: 15/15
  passed.
- Node 26.12.1, Bun 1.4.3, and HeadlessChrome 153.0.8010.12 installed-package
  replay: 22/22 predecessor cases, zero mismatches.
- `cargo test --locked --offline -p umf-core --test r5_json_schema_edit`:
  7/7 passed, including the expanded profile, source immutability, unsafe-number,
  and prototype-property controls.
- `bun run typecheck` passed after the concurrent dataset freezer fix.

The clean Node addon used by the 22-case replay has SHA-256
`35143d9db08395dc1d233e3d8cb0131626d822a406e9142a3cb12e6145ea5f51`; its
installed `index.js` has SHA-256
`9e1686249cc8e54f940d829a63ae0b22d8716cd509ed5a216485f2db7ad0adcd`.
Runtime source pins for this build are:

| Source | SHA-256 |
| --- | --- |
| `crates/umf-core/src/serialization.rs` | `7217563b6b269d74071780f4c72c5facd9a874e4bae10ecee1c58cc888bc01cb` |
| `crates/umf-core/src/json_schema_adapter.rs` | `237654adf10c0d58e0c0a61905e92cdb4010f6262ef154bcd7f0dc512219c4e2` |
| `crates/umf-core/src/json_schema_inspect.rs` | `089d5b5a27d5605a75f7e960cf6f9e172625112ec900fefd38dbbd07a2dae04a` |
| `crates/umf-core-wire/src/lib.rs` | `6bd20e308cec0ecb33b45727153a133580b49e3ace93887c798672a2cf1462f1` |
| `bindings/core/node/src/json-schema.js` and `bindings/core/wasm/src/json-schema.js` | `2011ad790b0baa28a73c4aa9712283fbeb8c8350547eae17c1920b3e94814cf2` |

The browser/WASM receipt records the captured Dataset source hash along with
the JSON Schema sources; it is a source-bound checkpoint and does not certify
the moving workspace as a whole. This work only closes the frozen tree-operation
packet. Registry callbacks, full Draft 2020-12 validator parity, and package
default route selection remain open.

Hashes for this bounded checkpoint:

| Source or receipt | SHA-256 |
| --- | --- |
| `crates/umf-core/src/json_schema_inspect.rs` | `089d5b5a27d5605a75f7e960cf6f9e172625112ec900fefd38dbbd07a2dae04a` |
| `crates/umf-core/src/json_schema_adapter.rs` | `237654adf10c0d58e0c0a61905e92cdb4010f6262ef154bcd7f0dc512219c4e2` |
| `crates/umf-core/tests/r5_json_schema_edit.rs` | `de20ff806587ae8d784fac9fdb52b8026a0ad378da86a55c8bdde2a62e9348a7` |
| Node/Bun replay harness | `3ca6ea71ee08fabda170c9a3a34eefcee1d49fdf442d8d9ed00b2d3d85a48c36` |
| Chromium replay harness | `66dcc746ec3d6b738b55bec1163ef707b0abc216bfa5db803ee7edef3e821b2a` |
| Node replay receipt | `0d45946c334d88f860ef77cb0d96a0c73c64316ac7ecb785067868bb7f3f16bd` |
| Bun replay receipt | `28bca37fecfe670bdc9ff7f0e73f96d5b92bd7682631a4a60b67b493dc9be9d5` |
| Chromium replay receipt | `24a54047d7b13b826eb5f169400c17f9fd0a0abb69240bd7c341d90fa29cc22b` |
| Fresh WASM binary | `251edfc989c64bc28a5a1480a53a8fc56a4839d9f5ad46083907370b2573a691` |

The Node and Bun receipts and browser receipt are retained in the temporary
paths above; this table pins them without adding generated replay payloads to
the source tree. The frozen predecessor packet hash is listed above.
