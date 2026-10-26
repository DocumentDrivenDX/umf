---
ddx:
  id: umf.evidence.rust-migration.r8-python-count-token
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: evidence_for
    - id: CONTRACT-079
      kind: informed_by
    - id: CONTRACT-081
      kind: informed_by
---

# Private Rust count-token predicate

This receipt covers a small decision still owned by Python in
`operation_values.py::result_frame`: after native count decoding,
`count['integerToken'].startswith('-')` refuses negative count values. The
frozen predecessor in `r6-operation-values/frozen-operation-values.py` uses
the same order and exact refusal text, `native count is negative`.

The new private profile `umf-operation-count-token/0.1.0` adds
`NativeTokenKind::NonnegativeInteger` and the PyO3 operation
`operation_count_token_nonnegative`. It reuses the existing integer-token
grammar and an ordinary Rust `Context` work charge, while ordinary
`NativeTokenKind::Integer` continues to accept negative tokens. The Python
opt-in `_count_token_nonnegative_rust` accepts only an exact built-in `str`,
checks the exact count-token profile before execution, requires an exact `bool`
response, and does not substitute a Python decision on missing/mismatched
capability or unexpected native failure. The public `result_frame` path does
not call this helper and remains unchanged.

CONTRACT-079 requires count results to be exact nonnegative integer text. Its
read profile separately assigns native visible-byte framing (including page
lookahead), authenticated cursor work, serialized result sizing, and lease
authority to the native/host route. CONTRACT-081 preserves the authenticated
host lease, module lifecycle lock, principal/scope and native policy boundary.
This predicate runs only after Python has obtained and decoded the count token;
it does not acquire database rows, enforce the full request budget, or replace
those native/host responsibilities. It does not authorize a public/default
cutover or qualify a DB route.

With Rust 1.90.0, the focused core test passed:

```text
cargo test --locked -p umf-core --lib \
  operation_values::tests::typed_native_token_grammar_is_exact_and_does_not_normalize \
  --target-dir /private/tmp/umf-count-token-target3
  1 passed
rustfmt --check crates/umf-core/src/operation_values.rs \
  bindings/core/python/src/lib.rs
  passed
```

The PyO3 extension built successfully with:

```text
cargo build --locked -p umf-core-python \
  --target-dir /private/tmp/umf-count-token-target3
```

Its SHA-256 is
`d77e40d867c990003c4c27c553f8ee87f21e3116a70185801164fdb3d041d089`.
Using a temporary package overlay and that extension, CPython 3.14.8 passed
the four focused tests:

```text
PYTHONPATH=/private/tmp/umf-count-token-overlay:python/umf_access/src:python/src \
  /opt/homebrew/bin/python3.14 -m unittest discover \
  -s python/umf_access/tests -p test_rust_count_token.py -v
  4 passed
```

The tests cover nonnegative and negative integer tokens (including `-0`),
ordinary integer-classifier compatibility, malformed integer refusal, decode
before sign decision, exact-string admission, unavailable/mismatched profile,
unexpected native failure propagation, and rejection of a non-boolean native
response. This is a temporary source overlay, not an installed-wheel replay.
No installed `umf-core`/`umf_access` cohort or database-backed read was tested.

Source SHA-256 values at this receipt are:

| File | SHA-256 |
| --- | --- |
| `crates/umf-core/src/operation_values.rs` | `b33de45f58e0e38506085b740370321a882a33fdc8a7f5659d6374e5b91b9e98` |
| `bindings/core/python/src/lib.rs` | `6ab25d749ed04c6237c09058ce44ffea0a3cbe63ce8ec9a083cc82397bf0da8a` |
| `python/src/umf/rust_operation_values.py` | `f9857722973e3bf2fb945c0debebfe2dc4c0d11a86679d512ae19fb2d48a5159` |
| `python/umf_access/src/umf_access/unified/operation_values.py` | `b4482f614aa1c3d7495250508073fc5b6ed2ea4d9dcc947577a8a8ba56055522` |
| `python/umf_access/tests/test_rust_count_token.py` | `dc4031b530cadbcab55a12e25a6b5286c11af520c469ccb293ba4e427bbb4c97` |
