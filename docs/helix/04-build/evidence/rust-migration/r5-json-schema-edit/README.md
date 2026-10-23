# R5 Rust JSON Schema atomic edit checkpoint

This bounded CONTRACT-002 slice adds `json_schema_adapter::edit_node` to the
Rust core. It parses a replacement as lossless native JSON, resolves an existing
RFC 6901 root pointer, and makes the change within `edit_extension`'s copied
transaction. The source document remains unchanged on success or failure;
supplied resources and untouched native nodes retain their content.

The exact TypeScript predecessor success, invalid candidate and missing-pointer
outcomes were frozen before implementation. The Rust path requires complete
source and candidate adapter preflight even if a supplied capability callback
is permissive: unknown tagged representation fields anywhere, unknown native
keywords, dialects, vocabularies, unsafe numeric tokens, known validator limits,
and metaschema/compile failures refuse editing. Control errors propagate as
operation errors. The edit-only inspector helper omits only the generic warning
that Rust/Ajv parity is unqualified; a separately trusted semantic oracle still
must approve the candidate. The ordinary public inspector keeps that warning.

Focused Rust 1.90.0 checks on the captured source:

```text
cargo check -p umf-core --locked --quiet
cargo test -p umf-core --test r5_json_schema_adapter --test r5_json_schema_edit --test r5_json_schema_inspect --locked --quiet
12 adapter tests; 6 edit tests; 4 inspector tests; 0 failures
```

Independent Sol review replayed 24 tests including two external probes:
an unknown keyword introduced by a candidate returns `INVALID_EDIT` with an
unchanged source, and an unrelated registered extension whose payload also
has a Draft 2020-12 dialect still reaches its own callback. The reviewer
checked UTF-16 extension-path dispatch, source/candidate guards, callback
provenance, unknown-content refusal and resource preservation; no P1/P2
remained in this bounded mechanical slice.

Frozen SHA-256: `json_schema_adapter.rs`
`dae4b5fcf504f12acb7c5236ac23ef60b78c81fc5739e4412219bacbd822956e`,
`json_schema_inspect.rs`
`9a41bb8b5144bf670c83244d558d5b7c0924ca202f7031ad18429c54709f6fd6`,
`r5_json_schema_edit.rs`
`8262e7b11631489bd6b925188a592b5cc24fcc3e06863c2a524dd3b221279bd6`.

The test uses a deliberately narrow trusted `Capabilities` fixture to establish
the transaction mechanics. Full Ajv 8.20 behavior, the upstream 46-file corpus,
production validator equivalence, host/browser bindings and default cutover
remain open. This receipt does not qualify general JSON Schema editing.
