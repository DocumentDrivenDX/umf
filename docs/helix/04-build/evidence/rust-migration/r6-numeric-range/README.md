---
ddx:
  id: umf.evidence.rust-migration.r6-numeric-range
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
    - id: CONTRACT-049
      kind: informed_by
    - id: CONTRACT-068
      kind: informed_by
    - id: CONTRACT-070
      kind: informed_by
    - id: CONTRACT-072
      kind: informed_by
---

# R6 exact numeric range comparison

This slice ports exact integer and finite `Decimal` range comparisons to Rust.
The separately versioned bridge capability is `umf-access-range/0.1.0`; the
existing `umf-access-values/0.1.0` capability remains distinct. Python retains
carrier admission, bound validation order, `Decimal.as_tuple()` extraction,
inclusivity truthiness, error translation, and return of the original input
object. When at least one bound is supplied, comparison fails closed if the
range capability is absent or has an unexpected version. With no bounds, the
predecessor's original-object identity return needs no comparison.

Integer comparison is arbitrary precision. Decimal comparison validates the
tuple representation, treats signed zero as mathematical zero, compares signs,
and compares coefficient digits with virtual trailing zeros. The comparator
does not expand powers of ten, convert through float, or narrow integer
metadata. Every supplied bound is admitted before value comparison; minimum is
compared before maximum, retaining the predecessor's short-circuit and error
order. Inclusivity flags are truth-tested only for equality at their
corresponding endpoint.

`frozen-predecessor.json` records the source hashes and 23 representative
outcomes captured before implementation. The focused tests replay those cases,
check object identity, compare integer intervals against an independent Python
integer oracle (including 4096-bit values), and compare Decimal spellings
against an independent `Fraction` oracle. They also exercise validation and
truthiness order, capability mismatch, and malformed raw bridge arguments.

Validation on 2026-10-23:

- `cargo test --offline --locked -p umf-core access_values::tests`: 4 passed,
  including exact range edge cases and malformed Decimal tuples.
- `cargo build` with the configured Rust toolchain and target directory:
  passed.
- Installed wheel replay under CPython 3.11.17 with Pydantic 2.14.1:
  `test_rust_numeric_range.py` (6 passed), `test_values_red.py` (6 passed),
  `test_rust_exact_values.py` (4 passed), and `test_golden_vectors.py`
  (1 passed; 69 non-temporal core oracle vectors).
- `rustfmt --edition 2021 --check crates/umf-core/src/access_values.rs`:
  passed. Workspace-wide `cargo fmt --all -- --check` remains blocked by
  formatting differences in other concurrently modified files; the Python
  binding file also reports existing unrelated formatting differences.
- Core wheel `umf_core-0.11.0-cp311-abi3-macosx_11_0_arm64.whl`, SHA-256:
  `7134570f00326f247065ecbc1014ff659454ee9c7497c503481a9f4ce4e87c6b`
- Access wheel `umf_access-0.1.0.dev6-py3-none-any.whl`, SHA-256:
  `7a33757dba96890740cfcee19fa78a1c08a30ece2cc44c47281bd90e5a24180b`

The frozen predecessor source hash for `values.py` is
`165e7c28f173a25d050e90205706990e189997d419111792612131c253e9fbef`.
Implementation source hashes at evidence authoring time:

- `crates/umf-core/src/access_values.rs`:
  `62a52fd6a5c75169722a119f8011152aae9b11a38d8c6e0019c4116dea63c6c9`
- `bindings/core/python/src/lib.rs`:
  `8cb3e47f76f45f0ef56b97baf8ac4eab7e3a37ce3fcd0ee42b380b465fb3f0c4`
- `python/src/umf/rust_values.py`:
  `304276af65008f7435fd6bd21505750f762874828f67bff97179ebe67b55a1c7`
- `python/umf_access/src/umf_access/values.py`:
  `2abd59670aa788c45408fc35ca92629a2049dad465d1d2f6e0af20fab1e15dc6`

The installed golden-vector check uses the core helper API, not an actual
generated numeric codec path. No generated consumer or PostgreSQL, Weft, or
other native consumer qualification was reached. Those behaviors remain open.
The built wheels are local CPython 3.11/macOS arm64 artifacts; other Python
versions and platforms are unqualified. These hashes identify the tested
artifacts, not a complete immutable source closure while other R5/R6 files in
the shared worktree are changing.

Independent Sol review reproduced both wheel hashes and every installed core
and access package member, the four Rust tests and all 17 focused installed
tests. An additional 20,000 randomized Decimal pair comparisons matched
independent Python Decimal ordering; huge raw positive and negative exponents,
malformed tuples, stale capability and original-object identity passed. The
review found no P1/P2 in this bounded slice. It did not qualify a generated
client, native consumer, other platform or hard resource control.

The bridge has no host work meter, deadline, cancellation callback, or
configured hard payload bound. Converting a Python integer allocates storage
proportional to its bit length, Decimal tuple digits are copied, and comparison
work is proportional to coefficient digit count. The exponent is compared as
metadata and never causes power expansion. This preserves the predecessor's
unbounded numeric domain but does not establish a resource ceiling.
