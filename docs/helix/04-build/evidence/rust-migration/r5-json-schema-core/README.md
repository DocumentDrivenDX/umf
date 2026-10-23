# R5 Rust JSON Schema core preservation slice

This receipt describes a bounded implementation of CONTRACT-002 payload
admission, native tree retention, schema-position traversal, copied pointer
reads, and root/resource/source-bundle export in `umf-core`. It does not compile
schemas, interpret keywords, resolve references, edit trees, or claim Ajv,
registry, browser, or host parity.

The adapter retains exact native number lexemes through `NativeJsonTree`. Its
walk follows the Draft 2020-12 schema-bearing positions represented by the
implemented keyword set, including `$defs`, `definitions`, and `contentSchema`;
annotations and value keywords such as `default` and `enum`, plus unknown
keywords, remain opaque. Export delegates to the native tree renderer, which
refuses native output when tagged representation fields are unknown.

Focused tests are in `crates/umf-core/tests/r5_json_schema_adapter.rs`. The
configured Rust 1.90.0 toolchain passed:

```text
CARGO_TARGET_DIR=/private/tmp/umf-r5-json-schema-core-target cargo test -p umf-core --test r5_json_schema_adapter --locked
12 passed; 0 failed
```

The adversarial controls cover extras-preserving copied get/walk subtrees and
unknown payload-envelope field retention, metered extra admission, resource
and depth limits, cancellation on empty export and resource admission, the Draft 2020-12
schema-position set (`dependentSchemas` included and `additionalItems` opaque),
unpaired UTF-16 property paths, WHATWG URL admission cases (`http://` and bad
hosts rejected; `urn:y` accepted), uninterpreted `$id` retention (including
relative and malformed values), duplicate `$id` preservation, duplicate
retrieval-key refusal, full UMF envelope validation and exact version checks,
URI metering before conversion, and export's final newline/text limit.
All root/resource/bundle export paths scan the full admitted payload and refuse
unknown representation fields with `JSON_SCHEMA_EXPORT`, even when the unknown
field is outside the requested export surface.
Document extraction first validates the complete envelope against the current
core schemas and constraints, then requires the exact `schema` module/element
identity and `umf.json-schema` 0.1.0 declaration.

The Rust `url` 2.5.7 implementation supplies WHATWG retrieval-URI parsing.
Source URI spelling remains in the payload. Schema-native `$id` semantics are
not interpreted by this preservation slice. Embedded core-schema source length
is admitted before allocating its UTF-16 parser buffer. This is focused
implementation evidence, not full adapter or native-semantic qualification.

Source snapshot (SHA-256): `json_schema_adapter.rs`
`750b0d64a5a5bf53b9fb087f0e537757b8a4f9aa5e6c96ca0b470d7bd61fc6d2`;
`r5_json_schema_adapter.rs`
`4376544e4080dc2d927500255f3aecccf8475fb182f1dd743154e6148dc68c7c`;
`Cargo.toml` `47ca8061ebc78dbef8fc1a0e5bb650271b667aa078355ea270515c84a62083ba`;
`Cargo.lock` `c8be14dac58efda28cc6cea31cf90f3995e42ac95916551f6e9f80d586cc3aa2`;
and `lib.rs` module declaration
`65dfaa86442b93e9698dd33a737c7bae666c770320a4eb9dfa3225955d34f20b`. The
native tree clone predicate and parser are owned by the parallel native JSON
slice; its source is not hashed here while that slice is under repair.

Open gates include source-exact predecessor differential replay, independent
native JSON Schema oracle vectors, compiler/validator parity, edit operations, browser/WASM delivery, and
installed host parity. The shared native JSON parser's earlier deep-recursion
finding was subsequently repaired and independently approved in the separate
[native JSON receipt](../r5-native-json/README.md). The current implementation
is a preservation/traversal checkpoint only.
