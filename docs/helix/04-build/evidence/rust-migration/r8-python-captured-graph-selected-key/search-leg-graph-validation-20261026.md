---
ddx:
  id: umf.evidence.rust-migration.r8-python-captured-graph-search-leg
  type: execution-evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-captured-graph-validator-interface
      kind: extends
    - id: umf.evidence.rust-migration.r8-python-captured-graph-selected-key
      kind: extends
---

# R8 opt-in captured-graph validation slices

This evidence adds `search_top` to the private captured-graph validator profile
and recursively validates tagged `SearchLeg` DTOs. It also accepts exact
`first`, `one`, `count`, `exists`, and `group_count` terminal shapes, rejects
omitted optional predicates nested under boolean operators, and detects one
parameter reused against incompatible temporal profiles. The public Python
`capture()` route remains Python-selected. The implementation is limited to
the Rust validator, focused tests, and this note.

Python's `_validate_node` checks each search leg in this order: compare the
leg's record module and element with the selected root; require a bound `Node`
whose operation is `param`; find its declared parameter; compare its carrier
with the leg kind (`vector` requires `Vector`, all other current kinds require
`str`); then visit the value and nested legs in order. Rust follows that
refusal precedence and recursively visits nested legs. Foreign search records
return `SEARCH_DECLARATION / foreign search Record`; non-parameter values
return `SEARCH_DECLARATION / search requires bound parameters`; missing or
wrong carriers return `CAPTURE_SIGNATURE / search parameter carrier differs
from selected leg`.

The focused Python test ran against CPython 3.13.16 and a freshly built Rust
extension. Genuine Python declarations cover accepted keyword search and
nested hybrid keyword/vector search with string parameters, plus
`Param[Vector]` with `VectorIndex.near_vector`. Their captured DTOs are passed
through the opt-in capture bridge and match Python capture. The Vector carrier
is encoded exactly as `{"$typing":"builtins.tuple","args":[{"$typeRef":"builtins.float"},{"$ellipsis":true}]}`.
Negative controls compare Python's actual refusal against direct Rust
validation of DTOs derived from valid captures and minimally mutated to make a
foreign record, non-parameter value, or vector/string carrier mismatch. The
Python `capture()` outcomes are checked separately as the predecessor oracle.

The private encoder now represents the exact builtins `Ellipsis` singleton as
`{"$ellipsis":true}`. Rust accepts Vector only when the complete carrier
shape is the exact `tuple[float, ...]` form above; lookalike or extended carrier
objects do not match. Live parity now reaches that branch with a genuine
`Param[Vector]` declaration, and negative controls still cover a vector/string
mismatch and refusal precedence.

The optional-filter placement slice added here matches Python's check: Python
searches an `and`/`or`/`not` expression recursively for an `omitted` node and
returns `CAPTURE_UNSUPPORTED / optional filters must be top-level filter
arguments` before visiting its children. Rust now performs the same recursive
Node/tuple check at that point. A real optional declaration with a top-level
`if_present` predicate is accepted by both capture routes. A genuine nested
optional predicate is refused by both with the same code and message. A Rust
unit control places an undeclared parameter after the omitted child and
confirms the omitted-filter refusal wins.

Temporal profile tracking follows Python's comparison visit order. For a
comparison whose left operand is a column with `temporal: instant` or
`temporal: local`, each right-side `param` records that profile. Reusing the
same parameter against the other profile returns
`CAPTURE_UNSUPPORTED / parameter spans incompatible temporal profiles` before
visiting the current comparison's children. Live Python parity accepts reuse
within one profile and compares the exact refusal for instant/local reuse. A
Rust control puts a later undeclared parameter after the conflicting use and
confirms temporal incompatibility wins first.

Aggregate and bucket validation now follows `scalar_fields` and then
`_validate_node` checks in their existing order. Malformed scalar shapes refuse
as `unknown scalar expression`; accepted aggregate operations are `sum`, `min`,
`max`, `avg`, `count`, `count_distinct`, and `approx_count_distinct`; temporal
aggregate fields refuse before average-scale checks; average scale must be an
exact integer in 0..1000. `count` with no field remains accepted. Bucket
validation covers the closed `FieldRef` + width shape only, matching
`scalar_fields`; width validity is already enforced by the public DSL builder
and is not broadened here. Live capture parity accepts sum, average, and bucket
projections. Hand-built terminal nodes exercise malformed shape, unknown
aggregate operation, temporal aggregate precedence, and average-scale refusal
against both Python and Rust.

The read-terminal slice admits the predecessor's closed two-argument shapes
`(RecordRef, steps)` for `first`, `one`, `count`, `exists`, and `group_count`.
Live declarations exercise each terminal, including a grouped count with a
bounded group limit. Scalar aggregate/bucket projection with `count` is refused
before visiting the malformed aggregate, matching Python's
`scalar aggregate/bucket projection does not admit this terminal` precedence.
Unknown terminal operations return Python's `unsupported terminal form`
refusal.

`update` now admits the exact three-argument terminal `(RecordRef, steps,
assignments)`, where assignments is a nonempty tuple of two-item tuples holding
`FieldRef` and `Node`. A genuine command declaration with generated mutable
field metadata validates in both routes. Mutation values are traversed in
Python order: field ownership is checked before a later undeclared parameter,
and parameter membership is checked for a well-owned assignment. The bridge
maps the existing Rust type-error refusal for foreign fields to Python
`TypeError`. The private validator cannot reconstruct source-generated mutable
field metadata or check assignment value/field type compatibility; those remain
the DSL/generator's responsibility. It validates graph shape and ownership, not
action authority or mutation execution semantics.

The bridge normally receives DTOs produced by Python constructors and
`navigation_parts`. The Rust validator admits exact known DTO tags; custom
`SearchLeg` subclasses with additional state are refused as
`CAPTURE_DTO_INVALID`, rather than flattened into a base DTO. This slice does
not claim general Python subclass parity or admission of arbitrary hand-built
DTOs.

The next private seam keeps signature/type-hint introspection, callable
invocation under `CaptureContext`, canonical JSON serialization, and final
`ActionRef` resolution in Python. Each `_invoke` still validates its graph
before the next invocation. Rust receives each pair's complete canonical bytes,
used-optional names, normalized parameter order, presence set, and closed Node
terminal operation; the per-invocation graph validator has already checked the
closed Node DTO before this pair is submitted. Rust decides pair determinism,
the initial optional-variant schedule, per-variant topology consistency, and
query-versus-command terminal authority.
The initial discovery pair checks the four-used-optional limit before schedule
generation. The schedule retains declaration order and the empty presence
variant. For each scheduled pair, topology refusal precedes terminal-kind
refusal. This is partial capture ownership: public `capture()` remains
Python-selected, and this private route does not transfer Python introspection,
call execution, or action identity semantics to Rust.

The Rust orchestrator compares the original Python `json.dumps` output through
`PyText` codepoints, including isolated surrogate codepoints; it does not
round-trip canonical text through Rust UTF-8. Python serialization errors still
occur before the Rust pair call. After pair determinism, Rust checks used-name
membership and uniqueness, applies the optional-count limit, generates
combinations in declaration order, compares scheduled topology, and only then
checks the first terminal operation against query/command kind. The bridge sends
only `terminalOp` for that final check, so terminal DTO parsing cannot preempt
pair nondeterminism. A focused Rust control covers equal and unequal lone
surrogate canonical strings.

Live side-effect controls compare public Python capture and the private route:
nondeterminism refuses after exactly two callable invocations, topology change
after four, and a command returning a read terminal after four. A separate
control isolates Rust pair precedence from the earlier graph-DTO gate and
confirms differing canonical bytes refuse before terminal-shape admission.
Further controls confirm declaration-order subset scheduling despite reverse
use order, the five-used-optional limit refuses after only the initial two
calls, and a command with changing optional topology receives the topology
refusal before read/write authority.
That private route remains limited to the closed graph DTO subset: a custom
Node subclass or a value outside `_encode_capture` can still be refused by the
per-invocation validator before pair comparison, even when Python's general
validator could traverse it. This slice does not claim arbitrary subclass or
unbounded DTO parity.

Validation completed:

- `rustfmt --edition 2024 --check crates/umf-core/src/access_graph_validate.rs`
- `CARGO_TARGET_DIR=/private/tmp/umf-searchleg-target CARGO_NET_OFFLINE=true cargo test -p umf-core --lib access_graph_validate::tests:: --locked --offline` — 35 passed, including the orchestration surrogate-codepoint unit.
- `CARGO_TARGET_DIR=/private/tmp/umf-searchleg-target CARGO_NET_OFFLINE=true cargo build -p umf-core-python --locked --offline` — succeeded.
- `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=/private/tmp:python/umf_access/src:python/src python/.venv/bin/python -m pytest -q -p no:cacheprovider python/umf_access/tests/test_capture_rust_graph_validator.py` — 11 passed against the rebuilt extension.
- The pytest case asserts the emitted Ellipsis carrier has exactly the closed tagged shape above.
- `ruff check --select I` passes for the Python bridge and focused test file. The repository's broader Ruff check reports pre-existing violations in this test file, including deferred-loop captures and line-length findings.

## Private live keyword-leaf observer — 2026-10-26

The private Python host-observation bridge now admits one additional leaf:
exact base `SearchLeg(kind="keyword")`, an exact base `Node("param",
(declared_name,))`, a pre-resolved declared string-carrier decision, and empty
legs. The observer uses one native `Context` and preserves original Python
exceptions from attribute access, item access, iteration, and exact-string
conversion. It remains a separately invoked private observer; public
`capture()` and the Rust graph-validator capture helper are unchanged.

For this leaf, Rust observes FieldRef then SearchLeg, reads `record` twice
(module then element), reads the root module and element, and returns the
foreign-owner refusal before value/kind/legs reads. The value path follows the
predecessor's separate `value` reads for the non-None condition, `.op`,
`.args[0]`, and recursive visit. It reads `kind` after the parameter name and
before carrier comparison, then performs the recursive Node operation reads
and child iteration before reading and iterating `legs`. Recursive operation
reads must continue to return `param`; changing results refuse within this
bounded profile. This does not claim parity for changing operation getters,
other kinds, nonempty legs, subclasses, other parameter carriers, or arbitrary
SearchLeg graphs. The private helper receives the resolved `CapturedParameter`
from signature processing; this observer does not introspect a Python
signature.

Fresh Rust extension build on Rust 1.90.0 and focused CPython 3.13.16 tests
pass. For the accepted keyword leaf, the test captures a live `_validate_node`
predecessor trace and compares the observer's getter sequence with its SearchLeg
suffix. The four new tests also pin exact thrown-exception identity, refusal
before later reads, and one-item termination on nonempty legs. The full
`test_capture_rust_graph_validator.py` file passes 21 tests; Rust's existing
`access_graph_host_observation` unit slice passes 9 tests.
These checks establish this local private observer subset only; they do not
change the broader graph-validator or package support claims above.

## Shared-session exact `.all()`/empty-steps candidate — 2026-10-26

The private exact-base `.all()` with empty steps candidate now has a PyO3
`CaptureResourceSession`. Python admission reads charge its work counter in
predecessor order; the Rust terminal/owner observer seeds its `Context` from
that counter, uses the same remaining-work meter, and returns the updated
count; Python DTO node encoding charges the same session afterward. The
candidate helper composes those three stages for this exact shape. Its
resource counter is unbounded by default, matching `Context::ordinary()`'s
lack of a generic work ceiling. Explicit caps (including the two-work negative
control) are caller-supplied test controls, not predecessor acceptance limits
or claims about the public `capture()` route. This establishes a shared
accounting primitive, not complete predecessor resource parity. DTO node,
depth, and byte ceilings remain separate checks.

The original three-argument terminal observer remains available with its
original context and error translation. The session-aware entrypoint is
separately named; only refusal by its explicit session meter maps to `ValueError`
with the candidate resource-limit message. Other graph budget failures retain
the original translation.
The tests pin wrong-session refusal before graph reads, a caller exception's
identity at the first `.op` read, exhaustion before the `args` read after one
`.op` read at an explicit two-work test cap, and shared accounting through DTO
encoding. No public route selects this candidate, and broader operation,
variant-schedule, or byte-budget parity is not established.

With Rust 1.90.0, the offline `umf-core-python` build succeeded. On CPython
3.13.16 with the resulting extension loaded from `/private/tmp/umf`, the
combined `test_capture_field_observation.py` and
`test_capture_rust_graph_validator.py` suite passed **69/69**. Ruff import
checks, Python AST parsing, and `git diff --check` passed. `rustfmt --check`
reported only pre-existing import-order differences at unrelated locations in
`bindings/core/python/src/lib.rs` and `bindings/core/python/src/related_keys.rs`;
no diff was applied from that formatter run.

Build output included existing unrelated Rust/PyO3 warnings. No Cargo lockfile
was intentionally edited by this slice; the shared worktree contains other
concurrent changes, so the parent task owns reconciliation of unrelated
working-tree state.

## DTO-free exact empty-`.all()` validator — 2026-10-26

A separate private PyO3 operation now validates the exact built-in
`Node("all", (RecordRef, ()))` shape without constructing the tagged graph
DTO. It returns only `accepted` after checking the closed profile and running
the predecessor's ordered header, root-owner, and recursive visit-tail reads
under one `CaptureResourceSession`. Raw admission requires exact built-in
classes, exact tuples, and exact string instance-dictionary keys before keyed
lookups. It also checks the original built-in instance-dictionary descriptors
before using `object.__getattribute__`. Anything outside this profile returns
`outside-profile` before graph reads and continues through the unchanged
private DTO validator.

Admission compares the metaclass by pointer identity with `builtins.type`, and
the instance-dictionary descriptor type by pointer identity with
`types.GetSetDescriptorType`. It does not trust displayed type names; a custom
metaclass named `type` is rejected before its class-attribute getter can run.

The opt-in wrapper calls this operation only when `_validate_node`'s current
bound `Node` and `RecordRef` globals are available and the parameter collection
is an exact empty tuple. That preserves the predecessor's earlier
`parameter_map` `.name` reads for nonempty parameters and prevents monkeypatched
DSL module exports from changing the admitted classes. Public `capture()` is
unchanged. The profile does not claim general graph validation, complete
resource-limit parity, or support for subclasses and nonempty operation
variants.

The current-source extension built offline with Rust 1.90.0 in the isolated
`/private/tmp/umf-capture-all-empty-target` target directory. Using its copied
overlay (rather than the stale `/private/tmp/umf` addon), the focused
`test_capture_rust_graph_validator.py` and `test_capture_field_observation.py`
suite passed **81/81** on CPython 3.13.16. Ruff still reports the pre-existing
`BLE001` broad exception warning in `rust_capture_observe.py`; the added test
imports were sorted, and `git diff --check` passes.

The parent review then ran the wider seven-file CPython overlay cohort against
the same current-source addon: **109 passed, 3 subtests passed** in 1.62s. The
exact command was:

```sh
PYTHONDONTWRITEBYTECODE=1 DYLD_LIBRARY_PATH=/private/tmp/umf-capture-all-empty-overlay/umf PYTHONPATH=/private/tmp/umf-capture-all-empty-overlay:python/umf_access/src:python/src python/.venv/bin/python -m pytest -p no:cacheprovider -q python/umf_access/tests/test_capture.py python/umf_access/tests/test_capture_resource_budget.py python/umf_access/tests/test_capture_field_observation.py python/umf_access/tests/test_capture_rust_graph_validator.py python/umf_access/tests/test_captured_declaration_predecessor.py python/umf_access/tests/test_captured_logical_render_predecessor.py python/umf_access/tests/test_captured_logical_render_positive.py
```

SHA-256 pins for the extension and changed implementation sources used by this
cohort:

| Artifact | SHA-256 |
| --- | --- |
| Isolated overlay `_rust_core.abi3.so` | `86e3c76c4a1e81b599bac2e6dd8ea6fa585d250ca66cdd33e9a9b001527b62d3` |
| `bindings/core/python/src/lib.rs` | `73fe399cca75f9148b3270974dbf3935eb7dc5288fa588a435b39ff4ae9a7c67` |
| `python/umf_access/src/umf_access/rust_capture_observe.py` | `d4a5b4eb71a60d1e3ee98a14d55d6765123b53038d1dd5aa24cf7436fd38ad06` |
| `python/umf_access/src/umf_access/rust_catalog_render.py` | `ed085d8605e2f7c61247af1866c0bd24dfa7929edd673a1c7cf12b42d515c9fa` |
| `python/umf_access/tests/test_capture_rust_graph_validator.py` | `99eaa1feda3daf4779deee2972a3c1a9819c5aa13a175e669cab80a9c1eaecb1` |

## Exact empty-step terminal extension — 2026-10-26

The private validator profile advanced to
`umf-access-capture-exact-empty-terminal/0.2.0`. Its accepted operation set is
now exactly `all`, `first`, `one`, `count`, and `exists`, each represented by
an exact built-in `Node(op, (RecordRef, ()))` with exact built-in `RecordRef`,
tuple arguments, and empty steps. The predecessor performs no operation-
specific validation between its common root/owner pass and `visit(node)` for
these terminals; the only terminal-specific tail preflight is for `get` and
`page`, which are excluded. The shared visit tail reads and charges the same
ordered terminal header and its two children. Focused tests call Python
`_validate_node` for every added form and prove the opt-in route avoids DTO
encoding for each.

All other operations and shapes return `outside-profile` before graph reads and
continue through the original private DTO validator. The wrapper remains
limited to an exact empty parameter tuple, preserving `_validate_node`'s
parameter-map `.name` reads otherwise. Public `capture()` is unchanged. The
extension was rebuilt offline with Rust 1.90.0 into the separate
`/private/tmp/umf-capture-extended-target`; the isolated overlay addon was
refreshed from that build. Focused validator plus field-observation tests pass
**85/85**. The seven-file CPython overlay cohort passes **113 passed, 3
subtests passed** in 1.92s. The refreshed overlay root was
`/private/tmp/umf-capture-all-empty-overlay/umf` (the
`/private/tmp/umf-capture-extended-overlay` path was not used). The exact
seven-file replay command was:

```sh
PYTHONDONTWRITEBYTECODE=1 DYLD_LIBRARY_PATH=/private/tmp/umf-capture-all-empty-overlay/umf PYTHONPATH=/private/tmp/umf-capture-all-empty-overlay:python/umf_access/src:python/src python/.venv/bin/python -m pytest -p no:cacheprovider -q python/umf_access/tests/test_capture.py python/umf_access/tests/test_capture_resource_budget.py python/umf_access/tests/test_capture_field_observation.py python/umf_access/tests/test_capture_rust_graph_validator.py python/umf_access/tests/test_captured_declaration_predecessor.py python/umf_access/tests/test_captured_logical_render_predecessor.py python/umf_access/tests/test_captured_logical_render_positive.py
```

The cohort and addon/source pins are:

| Artifact | SHA-256 |
| --- | --- |
| Isolated overlay `_rust_core.abi3.so` | `384f63ba50c735ce429aa88c1c5c8ba7b41990201de53fe1d5cf7ad45f1d2ec3` |
| `bindings/core/python/src/lib.rs` | `acdc379c362f70e3b25ddf0870c6468a926e20aaa456846aa267b135e9816440` |
| `python/umf_access/src/umf_access/rust_capture_observe.py` | `b07de9d3d865c8ed768fe3a267eaae41e8f1c3933919848cf8dd4f190d7bc181` |
| `python/umf_access/src/umf_access/rust_catalog_render.py` | `52eafe2445e504ea8995a7c8f9112a55676c48e0075577084f9d209f1da021ce` |
| `python/umf_access/tests/test_capture_rust_graph_validator.py` | `f9b942acddb6c7990029f5a1a3c95067e32bc45a470192c71a509ab319480014` |
