---
ddx:
  id: umf.evidence.rust-migration.r8-json-schema-parse-native-json-host
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
    - id: umf.evidence.rust-migration.r8-json-schema-eight-operations
      kind: informed_by
---

# R8 `parseNativeJson` wrong-type host boundary

This packet compares the direct TypeScript `parseNativeJson(text: string)`
implementation with freshly built opt-in Rust bindings for the nine bounded
wrong-type host fixtures already used by the R8 import observation. The new
Node and Chromium receipts pin their Rust addon/WASM, facades, source, fixture
and runner hashes, plus source revision and dirty working-tree status.

All nine candidate calls fail during wire admission before Rust parsing. For
objects with accessor properties, admission returns `AdmissionError` with
`ACCESSOR_PROPERTY` and invokes no getter. The source implementation instead
reads `length`, calls `JSON.parse(source)` (which applies JavaScript primitive
coercion), then calls the YAML parser with the original input. The captured
successful object coercions therefore produce `length → toString → length`
before `TypeError: source is not a string`; a throwing first length getter
escapes unchanged before coercion. Symbol primitives reach the source parser's
`JSON_SCHEMA_SYNTAX` mapping, while symbol coercion hooks execute before that
mapping. Node and WASM candidate admission instead returns `UNSUPPORTED_VALUE`,
`UNSUPPORTED_KEY`, or `ACCESSOR_PROPERTY` without the source effects. The
three fixtures labelled `resource` in the shared matrix are passed as the
standalone `parseNativeJson` argument here. They test the same argument
behavior, not resource-before-root ordering; that ordering belongs to the
separate `importJsonSchema` operation.

The exact per-host observations are in [Node](node.json) and [Chromium](browser.json).
The Node harness builds the native addon in an isolated target; the browser
harness builds fresh WASM and compares both implementations in the same
Chromium page. Both use the shared nine-case fixture set. The earlier direct
TypeScript-only observation is
[`import-host-nonstring-observation.json`](../r8-json-schema-eight-operations/import-host-nonstring-observation.json).

No correction is proposed for this boundary. CONTRACT-002 types
`parseNativeJson` input as text and specifies invalid JSON/duplicate-key
behavior, not coercion of arbitrary JavaScript objects. Fully preserving the
observed behavior for wrong-type objects would require a host callback protocol
that performs observable `length` reads and native string coercion in source
order, preserves thrown-object identity where it escapes, then re-enters the
correct parser stage. A blanket ToString or JSON wire normalization would alter
first-fault order and error mapping; extending only a small primitive allowlist
would leave the same host-object mismatch and would imply broader semantics
than tested. The Rust opt-in method therefore remains descriptor-safe and
string-input-only in practice. This does not claim runtime parity for
wrong-type JavaScript calls, installed package defaults, or the broader
`importJsonSchema` host-coercion bridge.

Reproduce the current-source Node and Chromium observations with:

```sh
bun scripts/rust-migration/r8/parse-native-json-host-node.mjs
bun scripts/rust-migration/r8/parse-native-json-host-browser.mjs
```

