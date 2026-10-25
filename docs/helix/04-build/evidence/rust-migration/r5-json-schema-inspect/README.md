# R5 Rust JSON Schema inspection checkpoint

This is a bounded CONTRACT-002 Draft 2020-12 inspection slice in `umf-core`.
The original checkpoint below records its then-current blanket warning and
seven-test baseline. The successor checkpoint at the end records the narrower
profile qualification now supported by independent controls; it does not
qualify general Draft 2020-12 validation.
It adds document/payload inspection using the lossless native JSON tree and
the pinned Rust consumer metaschema/compiler profile. The inspector reports
unknown keywords, dialects, vocabularies and validator-limit constructs as
incomplete. It retains the native payload when interpretation is unavailable.
At this original checkpoint, successful Rust compilation also carried an
explicit warning because it did not establish Ajv 8.20 behavioral parity.

The source-exact predecessor capture is
[`../r5-json-schema/baseline.json`](../r5-json-schema/baseline.json). The
focused inspector suite samples packaged resources and four expected vectors
from upstream `draft2020-12/type.json`. Independent Sol review repaired and
replayed control-provenance propagation, exact decimal/unsafe integer/negative
zero admission, and metaschema validation before reference compilation,
including an invalid `title` alongside an unresolved `$ref` in the same
resource. The semantic callback now inspects every extension occurrence at
its actual element path. Frozen TypeScript expectations cover a tagged-null
root on a non-`schema` element, invalid relative base and resource URIs,
root/resource URI collision after representation warnings, and propagation of
a host control error spoofing `JSON_SCHEMA_URI`. Payload-selection operations
keep an empty registry, so an invalid extension on another element does not
alter the selected `schema`/`schema` operations. With a separate target
directory and Rust 1.90.0, the pinned offline checks passed:

```text
cargo check -p umf-core --locked --offline --quiet
cargo test -p umf-core --test r5_json_schema_adapter --test r5_json_schema_inspect --locked --offline --quiet
12 adapter tests; 7 inspector tests; 0 failures
```

The collision-order regression also checks unknown-dialect and unsafe-number
root resources keyed by the base URI: their warning remains before the
collision error, while import and export reject the document. This follows the
frozen TypeScript inspector's order, which checks collision before returning
for unknown dialect or numeric limits.

Source SHA-256 values for the inspected checkout: `schema.rs`
`a6957bbee794086753b751e76b0ccd62c688c1ebf622e71c2fe5a4f9e0a48d17`,
`json_schema_inspect.rs`
`e17b4d6e742c6dd5865d6b72192983a1a813bd15e6c5cb774b9fb792e0fb3e71`,
`json_schema_adapter.rs`
`70d9af13d7381d2256a75a9cb4854b540bd83fc44dbbd41507effbf0c66b86b7`,
and `r5_json_schema_inspect.rs`
`7b8acceb9c306cb8bd3e7eca180bf80b95e8f5885977996a2c09c06436de6e9b`.
The source now also exposes `inspect_payload_for_edit`, which suppresses only
the generic Rust/Ajv profile warning when an independent caller oracle is
provided. Concrete keyword, dialect, vocabulary, representation, numeric,
metaschema, compile and validator-limit diagnostics remain. Ordinary inspection
still emits the original profile warning; this helper does not qualify Ajv
parity or general edit support.
The independent reviewer also ran the provenance unit test and two external
adversarial reproducers under `--locked`; no P1/P2 remained in this scope.
The R4 sdist packaging follow-up is present in the live source and remains a
separate qualification item.

The 46-file/384-case/1,301-vector upstream oracle, full resource/anchor
collision graph, exact Ajv errors/behavior, production edit semantics, wrappers, browser
qualification and R7 default cutover remain open. This receipt does not claim
general JSON Schema validity or support beyond the tested subset.

## Successor: qualified validator profile and frozen host replay

The inspection classifier now removes the generic validator-limit warning
only for a closed, recursively checked grammar: boolean schemas; objects whose
keywords are `$schema` (the exact Draft 2020-12 URI), one safe relative `$id`
segment, `type` (`boolean`, `integer`, `number`, `object`, or `string`),
`properties`, `$defs`, and `required`. Property/definition/required names are
restricted to tested ASCII segments; duplicate keys are refused by native JSON
construction. Every nested schema is checked. `$ref`, `$anchor`, URI traversal
IDs, unknown keywords, and all other constructs remain outside the complete
profile. Construct-specific diagnostics retain their existing precedence and
the generic warning remains for otherwise-clean schemas outside the profile.
This is not a claim that arbitrary Draft 2020-12 schemas are accepted.

The Rust controls execute `CompiledSchema::validate` against positive and
negative instances and pin the independent native oracle to
`jsonschema=0.29.1` Draft 2020-12. The independent JavaScript oracle is Ajv
8.20.0 Draft 2020-12. Covered cases include nested/local shapes, required
properties and ordered diagnostic paths, relative `$id` resource registration,
boolean schemas, numeric/integer boundaries (including negative zero, a
fraction, and exact large-number tokens), and outside-profile refusal. The
frozen TypeScript predecessor is unchanged:
`predecessor.json` SHA-256
`06d1772cd53dd7d7660e9bd6e665cf4bb51a7c7439396dbd7f8e6dd8e91e1ee8`.

The source-bound installed replay passed all 30 frozen cases on Node 26.12.1
and Bun 1.4.3 from the extracted native package archive, and all 30 in real
HeadlessChrome 153.0.8010.12 from the extracted WASM package. Five resource,
cancellation, deadline, and first/late meter-failure controls passed on Node,
Bun, and Chromium. The narrow bundle diagnostic projection preserves frozen
`[code,path,severity,message]` key order without changing global diagnostic
serialization. Rust inspector tests pass 13/13; the pinned Ajv profile script
passes. Browser artifact SHA-256 is
`cafa2a0fdd9c138b2645fc2f197980c66e77ffa8a650487a7f60bf408b7d88dc`. The
native package tarball SHA-256 is
`01b8f33f5020d8396b7150f74cb7df8a5d191841a85a9c26fd4407252d965e6d`; its
extracted addon SHA-256 is
`a3e57b90ca4b15c2c0d3e5aee6d5a93533a546caaf2d0ebc903cdcfe254e6a0d`.
Node replay receipt:
`/private/tmp/umf-r5-json-schema-qual-target/node-extracted-node-replay.json`;
Bun receipt:
`/private/tmp/umf-r5-json-schema-qual-target/bun-extracted-node-replay.json`;
Chromium receipts:
`/private/tmp/umf-r5-json-schema-qual-browser-local.json` and
`/private/tmp/umf-r5-json-schema-qual-browser-replay.json.controls.json`.
The native archive contains the expected package metadata, declarations,
entrypoints, `src/` closure, and addon (12 archive members including tar's
package directory entry).

Key reviewed source SHA-256 values at this checkpoint:

| Source | SHA-256 |
| --- | --- |
| `crates/umf-core/src/json_schema_inspect.rs` | `73a73f0133a547d105237fead6e0e65a03b658efc581c94ccc128754e0f2a5f9` |
| `crates/umf-core/tests/r5_json_schema_inspect.rs` | `f3559de5b0750f93a3437d6a77bd15938cf4c830d819fdb31e5051b4506c354f` |
| `crates/umf-core/Cargo.toml` | `1ce0955b1d1ba4930324ac6c2f754af17cf0f6c2bc64c87630397dbeb8418142` |
| `Cargo.lock` | `d74d138ee00f217cd0b77840d0f0262384c8e3930ed736382fd2b62ef7905fc3` |
| Node/WASM `src/json-schema.js` (identical) | `8bd803fef729c8145f087d6eac97ffb374e8d6057c0b18c72e4a2d0bb120b813` |
| Node wrapper regression tests | `b4c0088b1714f37eea9fc5c0ea626edeb4021519ada9f43865c00b3897ade929` |
| Ajv qualification script | `dadf59ac4210a6f7abcfe03dc7f50c4a46c5570ff2fe1b4045f5263b1070e43b` |

This is a bounded candidate qualification, not a default-route change. The
package root remains on the TypeScript implementation. Full Draft 2020-12
corpus parity, `$ref`/anchor and URI scope semantics, unsupported vocabulary
behavior, broader production edit semantics, and SDK default cutover remain
open. The build used the shared moving worktree rather than a retained
immutable source snapshot, so the hashes above identify the reviewed files but
do not claim a frozen all-repository source cohort; unrelated Rust modules
continued to change during this R5 work.
