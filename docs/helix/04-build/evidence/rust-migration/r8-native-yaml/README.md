---
ddx:
  id: umf.evidence.rust-migration.r8-native-yaml
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

# R8 native YAML Rust candidate evidence

This evidence freezes a direct replay of the current TypeScript predecessor at
`src/model/native-json.ts` and compares the Rust candidate through the opt-in
`parseNativeYaml(source)` operation on the existing Node and WASM
`createJsonSchemaEngine` facades. It does not select a package route, replace
the TypeScript default, or establish broad YAML parity.

The candidate is limited to the predecessor's default YAML 1.2 core behavior
within the 24 frozen default-profile cases in `predecessor.json`. The accepted
profile includes case variants `true`, `True`, `TRUE` and the equivalent false
forms, while `yes`, `no`, `on`, and `off` remain strings. YAML 1.2 dates remain
strings. The cases also cover numeric canonicalization, duplicate string keys,
unused anchors, aliases, explicit tags, malformed input, document counts, and
UTF-16 host input. Unused anchors are accepted; alias use and explicit value
tags are rejected. A separate opt-in options slice covers YAML 1.1 boolean
words, `dateOnly: "string"`, the `pyyaml` y/n boolean lexicon, and
invalid-version precedence. It does not broaden the default YAML 1.2 claim.

The direct predecessor packet contains 30 cases (15 returns, 15 throws) and
has SHA-256 `d33e5b667ca89490f4e60612f78ad5713608e0c4b64668df1b32658b2f9066af`.
The Rust wire test compares all 24 default-profile cases, including complete
returned tree values and error codes. Node and headless Chromium each replayed
the same 24 cases: 12 returns and 12 throws, with all error codes matching.
Both bindings also preserved a lone UTF-16 surrogate in a source string.
Chromium additionally verified the WASM facade loads without `process` or
`Buffer` globals. The edge probes ran under Node v26.3.0, separately from
the main Node v26.12.1 receipt.

The initial Node and Chromium receipts found exact error wording differences
in two syntax cases:

- `duplicate-after-bad-syntax`: the predecessor reports both a duplicate-key
  diagnostic and the following syntax error; Rust reports the syntax error
  alone. The error code matches.
- `malformed-sequence`: both report the same source location and caret, but
  the predecessor's parser wording differs from Rust's. The error code matches.

At the subsequent Rust source checkpoint, the focused wire test now compares
every error message in the 24-case default-profile corpus and passes 24/24
trees, codes, and messages. A second Rust wire test also matches the frozen
unknown-alias code/message and tagged-alias code/message/caret. The source
change has not been rebuilt and replayed in an installed Node or Chromium
package, so the older host receipts above still describe their pinned build
and do not qualify the new diagnostics on either host. The two original
differences and the two alias differences remain visible in those receipts
instead of being rewritten as current-host passes.

The diagnostic normalization is scoped to `read_native_yaml_tree`.
The adjacent `readJsonValue` path shares the scanner but retains its own
diagnostic profile; the full Rust serialization module passed 25/25 tests
after the scope correction.

The eight direct TypeScript option outcomes are frozen in
`options-predecessor.json` (SHA-256
`4fc638136df1f1864a48e090b479a54549255c4142253f510af22d9e14e9f3b5`). The
Rust wire test compares each complete tree or error code/message, including
invalid-version precedence over malformed source for string, null, and number
versions. The Node/WASM wrapper test
also confirms that the YAML 1.1 option reaches the wire request. This bounded
slice does not establish general YAML 1.1 support: numeric resolution beyond
the default subset, timestamps other than explicit refusal, arbitrary parser
options, complex keys, and comprehensive syntax-diagnostic aggregation remain
outside the supported claim. The focused Rust wire test and default-profile
YAML wire test pass with the pinned Rust 1.90 toolchain.

Reproduction inputs and receipts are beside this file. Node was v26.12.1,
Bun was 1.4.3, rustc was 1.90.0, and the WASM replay used headless Chromium
153.0.8010.12 with
Playwright 1.63.0. Receipts identify the tested addon/WASM hashes and frozen
packet hash. `node-replay.json` records exact message mismatches; the Chromium
receipt records the same mismatches. `edge-probes.json` records direct
predecessor and Rust Node-binding results for additional number, tag, and
alias checks. The numeric probes `1e999`, `+0x10`, `-0x10`, `01`, `.inf`, and
`-0e0` matched. Two alias diagnostics differed: an unknown alias is
`NATIVE_YAML_NODE` in TypeScript but a syntax error in Rust, and a tagged alias
is a syntax error in both with different parser text and caret span. Alias
acceptance is unsupported in either implementation; unsupported-form error
precedence is not fully equivalent.

From the repository root, reproduce the frozen packet and focused Rust test
with `bun docs/helix/04-build/evidence/rust-migration/r8-native-yaml/predecessor.mjs`
and `cargo test --locked --offline -p umf-core-wire --lib opt_in_native_yaml_matches_frozen`.
Reproduce the option packet with `bun docs/helix/04-build/evidence/rust-migration/r8-native-yaml/options-predecessor.mjs`;
the focused options check is `cargo test --locked --offline -p umf-core-wire --lib opt_in_native_yaml_matches_frozen_option_profiles_and_precedence`.
Reproduce the Node wrapper route checks with
`bun test ./bindings/core/node/tests/json-schema-wrapper.test.js`. The Node
and Chromium replay scripts require the built package directories described
in the corresponding receipt; their source and runtime arguments are in
`node-replay.mjs` and `browser-replay.mjs`. Their recorded build inputs were
the Node package at `/private/tmp/umf-r8-native-yaml-node-package` and WASM
package at `/private/tmp/umf-r8-native-yaml-wasm-package`. The edge probe can
be repeated with
`UMF_R8_NATIVE_YAML_NODE_PACKAGE_ROOT=/path/to/node-package bun docs/helix/04-build/evidence/rust-migration/r8-native-yaml/edge-probes.mjs`.

The focused Rust tests are
`opt_in_native_yaml_matches_frozen_typescript_12_trees_and_error_codes` and
`opt_in_native_yaml_matches_frozen_alias_edge_diagnostics` in
`crates/umf-core-wire/src/lib.rs`; the wrapper route test is
`bindings/core/node/tests/json-schema-wrapper.test.js`.
