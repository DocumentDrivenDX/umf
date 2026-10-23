# R5 Rust JSON Schema inspection checkpoint

This is a bounded CONTRACT-002 Draft 2020-12 inspection slice in `umf-core`.
It adds document/payload inspection using the lossless native JSON tree and
the pinned Rust consumer metaschema/compiler profile. The inspector reports
unknown keywords, dialects, vocabularies and validator-limit constructs as
incomplete. It retains the native payload when interpretation is unavailable.
Successful Rust compilation also carries an explicit warning because it does
not establish Ajv 8.20 behavioral parity.

The source-exact predecessor capture is
[`../r5-json-schema/baseline.json`](../r5-json-schema/baseline.json). Four
focused inspector tests sample packaged resources and four expected vectors
from upstream `draft2020-12/type.json`. Independent Sol review repaired and
replayed control-provenance propagation, exact decimal/unsafe integer/negative
zero admission, and metaschema validation before reference compilation,
including an invalid `title` alongside an unresolved `$ref` in the same
resource. On the captured shared source, Rust 1.90.0 passed:

```text
cargo check -p umf-core --locked --quiet
cargo test -p umf-core --test r5_json_schema_adapter --test r5_json_schema_inspect --locked --quiet
12 adapter tests; 4 inspector tests; 0 failures
```

Frozen inspected source SHA-256 values: `schema.rs`
`bfd513e2c2076ed067d4e237dae06036b924639b9dd76711791259b6a8a9e116`,
`json_schema_inspect.rs`
`9a41bb8b5144bf670c83244d558d5b7c0924ca202f7031ad18429c54709f6fd6`,
and `r5_json_schema_inspect.rs`
`9bfdd61b930f52efde9ceb3eeb0e2cdffd4b8a26b6b2a058fd7a5fe472a34a55`.
The source now also exposes `inspect_payload_for_edit`, which suppresses only
the generic Rust/Ajv profile warning when an independent caller oracle is
provided. Concrete keyword, dialect, vocabulary, representation, numeric,
metaschema, compile and validator-limit diagnostics remain. Ordinary inspection
still emits the original profile warning; this helper does not qualify Ajv
parity or general edit support.
The independent reviewer also ran the provenance unit test and two external
adversarial reproducers under `--locked`; no P1/P2 remained in this scope.

The 46-file/384-case/1,301-vector upstream oracle, full resource/anchor
collision graph, exact Ajv errors/behavior, production edit semantics, wrappers, browser
qualification and R7 default cutover remain open. This receipt does not claim
general JSON Schema validity or support beyond the tested subset.
