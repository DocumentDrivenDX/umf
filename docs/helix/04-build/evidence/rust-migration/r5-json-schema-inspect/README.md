# R5 Rust JSON Schema inspection checkpoint

This is a bounded CONTRACT-002 Draft 2020-12 inspection slice in `umf-core`.
It adds document/payload inspection using the lossless native JSON tree and
the pinned Rust consumer metaschema/compiler profile. The inspector reports
unknown keywords, dialects, vocabularies and validator-limit constructs as
incomplete. It retains the native payload when interpretation is unavailable.
Successful Rust compilation also carries an explicit warning because it does
not establish Ajv 8.20 behavioral parity.

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
