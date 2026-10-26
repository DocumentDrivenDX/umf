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

Build output included existing unrelated Rust/PyO3 warnings. No Cargo lockfile
was intentionally edited by this slice; the shared worktree contains other
concurrent changes, so the parent task owns reconciliation of unrelated
working-tree state.
