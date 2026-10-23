# R5 JSON Schema inspector resource and metering follow-up

This additive receipt records a bounded resource/metering change in the Rust
Draft 2020-12 inspector. It does not update or replace the earlier inspector
receipt, the immutable upstream corpus captures, or any semantic expectations.

`inspect_payload_profile` now runs the adapter walk for the root once, then
uses the existing resource-specific traversal for each packaged resource.
Resource scanning borrows URI/tree pairs rather than building a cloned list.
Known resource counts, URI lengths, native string lengths, container/key
counts, URI resolution inputs, and JSON pointer output sizes are charged before
the related reserve, clone, conversion, or growth. Resource traversal, numeric
scanning, conversion, and path construction continue to propagate host-meter
and cancellation failures.

Focused regression coverage verifies that native conversion presents string
and array allocation estimates to the meter before conversion, JSON pointer
construction charges its escaped output size before copying, and cancellation
is returned as a control failure during an inspection with packaged resources.

On Rust 1.90.0 the following focused tests passed:

```text
PATH=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin:$PATH \
CARGO_TARGET_DIR=/private/tmp/umf-r5-json-schema-target \
cargo test -p umf-core --lib json_schema_inspect::tests --locked --quiet
3 passed; 0 failed

PATH=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin:$PATH \
CARGO_TARGET_DIR=/private/tmp/umf-r5-json-schema-target \
cargo test -p umf-core --test r5_json_schema_inspect --locked --quiet
5 passed; 0 failed
```

`rustfmt --check` and `git diff --check` passed for the two changed Rust files.
Compiler output contained warnings in unrelated concurrently added Avro and
Protobuf files; no inspector warning or test failure was reported.

Source SHA-256:

```text
crates/umf-core/src/json_schema_inspect.rs
63d313ea9d006d7aba72de12766ceff2341f04b72424b239f27df9451d05b8cd
crates/umf-core/tests/r5_json_schema_inspect.rs
b7c23446f4cc3b3355515eeeb3231caba1760c4c3b91128a2830a11f92f37e9c
```

This evidence establishes only the focused Rust metering/control regression
checks above. It makes no claim about full upstream corpus parity, validator
semantics, browser behavior, or production resource isolation.
