---
ddx:
  id: umf.evidence.rust-migration.r8-outcome-effect-frame
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: TP-001
      kind: informed_by
    - id: CONTRACT-079
      kind: informed_by
    - id: umf.evidence.rust-migration.r6-outcome-values
      kind: informed_by
---

# R8 authenticated outcome effect-frame admission

This opt-in slice ports only the post-authentication response/effect-frame
shape check from `outcome_from_record` in
`python/umf_access/src/umf_access/unified/outcome_values.py`. The predecessor
first checks the stored row carrier and digest grammar/cap, computes and
compares the HMAC signature, parses the payload through
`unified.operation_values.loads`, and checks invocation/scope/metadata equality.
Only after those stages does it check `responseDigest`, effect-list shape and
length, then visit each effect in order to check its exact `integerToken` and
declared row bound. The native operation reports either `admitted`, invalid
receipt shape, or count/bound mismatch; Python maps those to the predecessor's
two exact `SessionError` messages.

The native helper is private and opt-in. It is not called by
`outcome_from_record` or the public default path. Python retains canonical JSON,
payload parsing, HMAC key derivation, constant-time authentication, metadata and
authority equality, and error ordering before this helper. CONTRACT-079's
durable slot, RLS, authenticated receipt and no-reexecution requirements remain
host/native transaction responsibilities; this helper proves no database or
transaction behavior.

The explicit input profile admits exact built-in JSON values only: no dict/list
subclasses, repeated/cyclic containers, non-string object keys, non-finite
floats, lone surrogates or integers outside signed/unsigned 64-bit range.
`items` and `max_rows` must be exact nonnegative Python ints within signed
64-bit range (booleans are refused). These restrictions make JSON serialization
and serde parsing deterministic. In particular, the low-level Rust text parser
is called only with text emitted by `json.dumps` from an exact Python dict, so
duplicate JSON object names cannot be introduced through this bridge; no claim
is made for direct arbitrary-text semantics. The public predecessor remains
unchanged for all inputs, and the opt-in raises a profile refusal for inputs
outside this subset rather than falling back to Python.

The Rust core unit `effect_frame_admission_preserves_post_authentication_shape_order`
passes. The focused Python suite
`python/umf_access/tests/test_rust_outcome_effect_frame.py` passes 4/4 on
CPython 3.14.8 against a freshly built PyO3 extension. It covers predecessor
admission/refusal parity, first-stage error mapping, exact-input refusals,
unsupported profile behavior, and direct low-level duplicate-member refusal.
The build used Rust 1.90.0 on Darwin arm64; the loaded temporary extension SHA-256
was `dc4d0e0224570a3e73c2c31c8fbc61e5b88c6d203d16144fe5d1863229cc9f69`.
The extension was loaded through a temporary source overlay, not an installed
wheel. No switch of the default route or database qualification is claimed.

Source identities at this capture are:

| Source | SHA-256 |
| --- | --- |
| `crates/umf-core/src/outcome_values.rs` | `3c1f74c04c1d119aa14e956b1b586b93e9ced491d67f0aaf6960b93dd9368e1d` |
| `bindings/core/python/src/lib.rs` | `342c7a597f6f67457a2f6a38f7ed4dd4a59c13b1c69f21a8eab33fdd3f82d29a` |
| `python/src/umf/rust_outcome_values.py` | `f69832869a7c962aef553dc484290968798cd82c93bc16ce40ec117febd3ac6f` |
| `python/umf_access/src/umf_access/unified/outcome_values.py` | `360c6eb0a6c516dbd140abacd3e723d43ae90ba007135ea5ce2b672909027d24` |
| `python/umf_access/tests/test_rust_outcome_effect_frame.py` | `584d31f39ba67e13e1156630f45455a4add0f57df2d876f5643998ca805f4edb` |
