---
ddx:
  id: umf.evidence.rust-migration.r6-reviewed-parameters-implementation
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.evidence.rust-migration.r6-reviewed-parameters
      kind: informed_by
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-071
      kind: informed_by
    - id: CONTRACT-079
      kind: informed_by
---

# R6 scanner implementation checks

The first R6 implementation slice ports only `_parameter_positions` for exact
builtin strings. Python retains the frozen scanner for `str` subclasses. Rust
returns ordinal digit text, and Python performs `int(digits) - 1` before
requesting another event. E-prefix classification is requested from the active
CPython runtime. The PyO3 constructor copies code points directly with
`PyUnicode_GetLength` / `PyUnicode_ReadChar` into a fallibly reserved `Vec<u32>`;
the adapter does not allocate a second Python list. The Rust scanner owns that
immutable vector, validates it once at construction, and resumes from its
cursor without accepting replacement input on later events. Ordinal digit
strings are also fallibly reserved and allocation failure maps to Python
`MemoryError`. Lone surrogates and explicit surrogate pairs remain individual
code points. Sealed compiler
transport still bypasses `_parameter_positions` through the existing
`ReviewedSQL.build` branch.

## Local verification

On CPython 3.11.17 and 3.14.8, the source-only Gate 0 packet test passed 4/4
and the host event-protocol test passed 8/8. The packet captures reproduce
byte-for-byte with `capture.py` and preserve the original Gate 0 source hash.
The protocol test covers Python host Unicode replies, subclass fallback,
direct `ReadBuildError` construction and exception fields, integer digit-limit
ordering, malformed native events, empty digit payload refusal, binding
`MemoryError` propagation, and explicit refusal when the public bridge lacks
the required profile/capability.

The `umf_access` boundary checker passes with 0 violations. `reviewed.py`
imports the narrow public `umf.rust_reviewed_parameters` bridge, which defers
missing-capability handling to the existing explicit `ReadBuildError` guard;
the bridge does not introduce a semantic fallback. The allowlist also names
the existing public `rust_outcome_values` import explicitly.

With `CARGO_INCREMENTAL=0` and two Cargo jobs:

```text
cargo test -p umf-core reviewed_parameters --lib       7 passed
cargo test -p umf-core-python --lib                     linked and passed (0 tests)
cargo check -p umf-core-python                          passed
cargo build -p umf-core-python                          passed
```

The default Rust test suite contains no PyO3-linked allocation assertion,
because the standalone Rust test harness cannot link CPython symbols on this
host. The host adapter suite verifies that a binding-originated `MemoryError`
passes through without alteration. A real allocator failure is not forced in
the extension replay, so Rust allocation-failure-to-`PyMemoryError` behavior is
code-reviewed but not independently induced at runtime. The built extension
replay below is the binding-level runtime evidence.

The built extension was loaded directly from a temporary target directory and
tested through the Python adapter. All 18 independent scanner cases passed on
both CPython 3.11.17 and 3.14.8, including the versioned U+1C89 Unicode
classification, lone-surrogate and explicit-surrogate-pair spans, and both
huge-ordinal exception-order probes. The active digit limit produced Python's
`ValueError` before a later lexical refusal; an earlier unterminated quote
refused before the later huge ordinal. With the digit limit disabled, the
4,301-digit ordinal succeeded as an arbitrary-precision Python integer.

The full `umf_access` reviewed DB-API test module was not run in this local
environment because the Python environment has no installed `pydantic` and
network access was unavailable to populate an isolated environment. Therefore
the existing sealed-transport regression was preserved by leaving its call
path unchanged, but it is not claimed as freshly executed implementation
evidence. This evidence also does not qualify installed wheels, resource-failure
parity, or a native Weft/PostgreSQL consumer.
