---
ddx:
  id: umf.evidence.rust-migration.r8-capture-visit-field-join-tuple
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: ADR-006
      kind: informed_by
    - id: CONTRACT-071
      kind: informed_by
---

# R8 private captured-graph observation prefixes

This evidence records three private Rust-directed host-observation prefixes in
the capture migration: terminal/root/sequential-Join observation, the bounded
`FieldRef`/`Join`/tuple branch of `_validate_node.visit`, and an empty
SearchLeg prefix. They preserve
the observable order of the covered live reads and retain accessor exceptions.
Neither changes public `capture()` routing or establishes complete captured
graph validation. The installed capability identity is
`umf-access-capture-graph-observation/0.3.0`; this version requires the
FieldRef owner, terminal/Join, bounded visit, and empty SearchLeg prefix
operations.

## Bounded visit branch

The source predecessor is
`python/umf_access/src/umf_access/capture.py::_validate_node.visit`. For a
value admitted to this slice, Rust requests the Python branch probes in the
same order as the predecessor: `FieldRef`, `SearchLeg`, `Join`, `Node`, then
tuple. A `FieldRef` reads `module`, `element`, and `alias` in tuple-construction
order before owner comparison. A `Join` reads `ref` once and visits that value.
Tuples are iterated once and visited depth-first in yielded order. First
foreign-field refusal stops before later tuple children. A passive value that
matches none of those branches remains a no-op.

`Node` and SearchLegs with a bound value or nested legs are refused by this
slice. Other SearchLeg branches perform declaration, parameter, navigation,
aggregate, temporal, and other semantic checks before recursing. The private
observer does not report success for those shapes. Exact Python accessor
`PyErr` objects are retained and
re-raised; UTF-16 text conversion preserves lone-surrogate owner strings.
Missing structural-probe capability fails closed. A single ordinary Rust
`Context` is shared across all observations inside this route, with each host
operation charged once and a 64-level recursion guard.

The allowed owner tuples are explicit exact `(module, element, alias)` tuples
supplied by the private Python bridge. The route does not derive a full owner
set itself and does not combine its budget context with the separate terminal
prefix call.

## Terminal and Join prefix

The earlier terminal observer reads terminal structure in the predecessor's
pass order, then root and sequential Join owner identity. It preserves repeated
`relation.ref` and `relation.target` accessor reads, the `node.op` re-reads in
group/scalar checks, and iterator handles across `iter`/`next`. Its exact
read-order and identity cases are in
`python/umf_access/tests/test_capture_field_observation.py`.

## Evidence scope and exclusions

The implementation is confined to
`crates/umf-core/src/access_graph_host_observation.rs`,
`bindings/core/python/src/lib.rs`,
`python/umf_access/src/umf_access/rust_capture_observe.py`, and
`python/umf_access/tests/test_capture_field_observation.py`. It is private
opt-in infrastructure. Public `capture()` continues to select the Python
validator. The observer does not replace `_encode_capture`, serialize a DTO,
admit Node, general SearchLeg, or related-navigation semantics in the new visit route, or
reconcile the legacy 50,000-node, depth-64, and 8 MiB capture limits as one
end-to-end budget. No installed-wheel or package-release claim is made.

## Verification

The initial focused Rust core suite passed seven observer tests; the current
0.3.0 suite passes nine, including SearchLeg read order and foreign-record
short circuit:

```sh
PATH=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin:$PATH \
CARGO_TARGET_DIR=/private/tmp/umf-field-owner-observation-target \
cargo test --locked --offline -p umf-core --lib access_graph_host_observation
```

The PyO3 extension built successfully:

```sh
PATH=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin:$PATH \
CARGO_TARGET_DIR=/private/tmp/umf-field-owner-observation-target \
cargo build --locked --offline -p umf-core-python
```

With that built extension copied into the temporary overlay used by the test
command, the focused Python parity file passed 22 tests:

```sh
PYTHONPATH=/private/tmp/umf-field-owner-observation-overlay:python/umf_access/src \
python/.venv/bin/python -m pytest -q -p no:cacheprovider \
  python/umf_access/tests/test_capture_field_observation.py
```

These results qualify only the listed observer paths and fixtures. The module
does not claim whole-package parity, default-route behavior, or an installed
artifact cohort.

## Private bounded empty SearchLeg prefix (2026-10-26)

`observe_empty_search_leg` covers the predecessor branch for a SearchLeg
whose value is `None` and whose legs iterator is empty. Rust requests the
SearchLeg class probe, then reads `record` twice while evaluating
`(value.record.module, value.record.element)`, followed by root record
`module`/`element`, `value`, and `legs`. `kind` is not read when value is
`None`. A foreign record refuses before value/legs reads. A
non-None value or a yielded nested leg is refused; parameter, carrier, nested
leg, and hybrid semantics remain outside this prefix. PyO3 preserves original
accessor and iterator exceptions. A bumped 0.3.0 capability check requires the
new entry point before the opt-in helper runs. Focused Python coverage passes
40 tests against a fresh temporary extension build, including an untouched
raising `kind` getter for empty values, a faulting `value` getter, and a second
stateful `record` getter that rethrows its original exception.

## Private exact `.all()` empty-steps callback (2026-10-26)

`observe_all_empty_capture_profile()` adds a private integrated callback for
the exact base `Node("all", (RecordRef, ()))` shape. It checks native profile
0.3.0 before touching the graph, admits exact base objects and exact owner
text, then delegates the admitted terminal/root checks to the native terminal
observer. That operation uses one Rust `Context`; there is no Python
`_validate_node` call and no retry after native refusal. Subclasses,
nonempty steps, other terminals, and malformed owner text are outside this
private profile.

The public `capture()` route remains unchanged. A focused test confirms a
no-parameter query still executes its body four times. This callback is not
ready for public selection: its admission check is Python-owned, the legacy
DTO encoder has a separate node/depth/UTF-8 budget, and there is no shared
end-to-end capture-plus-encoding Context or installed-wheel default-route
replay.

The focused Python observer suite passes 40 tests against the fresh temporary
overlay built with the 0.3.0 PyO3 capability:

```sh
PYTHONPATH=/private/tmp/umf-field-owner-observation-overlay:python/umf_access/src \
python/.venv/bin/python -m pytest -q -p no:cacheprovider \
  python/umf_access/tests/test_capture_field_observation.py
```

This result qualifies only the private exact-profile callback and its focused
fixtures; it does not qualify public routing or package installation.

## Capture/DTO budget and first-fault reconciliation (2026-10-26)

This section records the initial failed audit; the later
[native args-before-owner correction](#native-args-before-owner-correction-2026-10-26)
supersedes its candidate trace and current-status conclusions.

The current callback now passes one `CaptureResourceSession` through Python
profile admission, Rust terminal observation and DTO encoding. This shares a
work counter only. The ceilings remain separate: Rust `Context::ordinary()`
allows 100,000 values, depth 128 and 4,000,000 text units; the Python DTO
encoder independently allows 50,000 visited values, depth 64 and 8 MiB each
for encoded text and final DTO output. The callback seeds the shared session
with `u64::MAX`, so it does not reconcile those profile limits. The Python
predecessor `_validate_node` has no matching DTO ceiling. A DTO-only limit can
therefore reject a graph accepted by public `capture()`, and a finite shared
work budget can refuse before a predecessor accessor would be read.

A same-host CPython 3.13.16 trace against the exact empty `.all()` graph also
shows the callback is not yet a predecessor-order substitute. `_validate_node`
reads `Node.op`, `Node.args` four times, root owner `module/element/alias`, six
more `Node.op` values, then `Node.args` once. The candidate admission reads
`op`, `args`, owner text, and then native observation reads `op`, `args` three
times and owner text again. These schedules differ in both count and fault
position. The focused regression pins both sequences and prevents treating
the shared counter as sufficient first-fault parity. Exact base-type checks do
not eliminate class-level `__getattribute__` behavior on Python objects.

The first divergence is after the shared initial `Node.op` and `Node.args`
reads: the predecessor reads `Node.args` again, while candidate admission
reads `RecordRef.module`. The regression asserts this first differing event.

Fresh `umf-core-python` was built with Rust 1.90.0 into
`/private/tmp/umf-capture-budget-target`; its extension was loaded through a
temporary overlay with current Python source. The focused file passed 46/46
under CPython 3.13.16 on Darwin arm64. This is local same-host source evidence
only. Public routing remains unjustified until Rust owns the ordered profile
admission without extra Python reads and the bridge either preserves the
predecessor's no-limit behavior or the public support contract explicitly
qualifies a narrower resource profile. Installed-wheel qualification remains
open.

The source base is commit `1377fcfa8d083cb6a88315f0525f5cf552149a76`; the
working-tree inputs and built extension are pinned here:

| Input | SHA-256 |
|---|---|
| `python/umf_access/src/umf_access/capture.py` | `712d2e2cb96e3c53bc6f3dd3efb26768d6b3f22d5edb6d2c5d897a2e1cdaa19f` |
| `python/umf_access/src/umf_access/rust_capture_observe.py` | `1ffd812d3c3c5648fdbf97d3e18386608b65ef320495da01c74da48065e4e29e` |
| `python/umf_access/src/umf_access/rust_catalog_render.py` | `370abb8078e13845a3d67e43493181a2630c4416a287bc9fdfc1352bc9129716` |
| `python/umf_access/tests/test_capture_field_observation.py` | `0a9b3b4f4614fb2e8b2ccf88b7d11574501635bfc9658f65c90a3c0c6eec157b` |
| `crates/umf-core/src/access_graph_host_observation.rs` | `fde0a1214cd0c96acac24b597c790cc7916365358bb021b804a4babafff67f56` |
| `bindings/core/python/src/lib.rs` | `095600d725e468ffaa4cfad13b9bade97a1adc2cbbeda83d705208f5a8ab4a71` |
| temporary `_rust_core.abi3.so` | `861581781aa7aff972985595ac69b72411fdbbd15931be431ee49cb3c5a92d0d` |

## Native args-before-owner correction (2026-10-26)

The first-fault regression exposed two related scheduling defects: Python
profile admission read `RecordRef.module` before Rust's remaining predecessor
`Node.args` reads, and the Rust terminal observer reused the `args` access
used by the RecordRef `isinstance` check instead of re-reading it for
`record = node.args[0]`. The private callback now checks exact Node identity
without invoking a Python attribute accessor, then lets Rust own all graph
reads. The native observer performs four distinct `Node.args` reads before
the root owner's `module/element/alias`, matching the predecessor's observed
prefix. It reports whether the observed steps were empty, the root was an
exact `RecordRef`, and the steps container was an exact tuple; the callback
admits only the exact empty-steps profile.

The pinned regression compares that complete prefix on the same CPython host
and injects competing faults at the fourth `Node.args` read and root-owner
`module` read; both paths rethrow the original `Node.args` exception and never
touch the owner. It also records that the observer stops after owner/Join
admission, while the predecessor continues into `visit(node)` with six
further `Node.op` reads and one `Node.args` read. This fixes the `Node.args`
versus owner first-fault divergence; it does not qualify full `_validate_node` parity or public
selection. Existing Python DTO encoding still has separate 50,000-node,
depth-64 and 8-MiB text/output ceilings, while Python `capture()` has no DTO
encoder. Those limits should not be imposed by a public capture route that
returns Python objects; a Rust-owned public route must avoid that encoder or
separately qualify any changed support boundary. Rust Context's own limits and
the remaining visitor semantics still block cutover.

The observer capability is now
`umf-access-capture-graph-observation/0.5.0`. A fresh Rust 1.90.0 build and
the focused CPython 3.13.16 Darwin arm64 file pass 47/47. Public `capture()`
remains Python-selected; no installed-wheel or release claim is made.
The broader focused capture set also passes 93 tests and three subtests,
including the existing public capture, Rust DTO validator and predecessor
replay files. The focused Rust observer unit suite passes 10/10.

Reproduce with the temporary extension overlay:

```sh
PATH=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin:$PATH \
CARGO_TARGET_DIR=/private/tmp/umf-capture-budget-target \
cargo build --locked --offline -p umf-core-python
cp /private/tmp/umf-capture-budget-target/debug/lib_rust_core.dylib \
  /private/tmp/umf-capture-budget-overlay/umf/_rust_core.abi3.so
DYLD_LIBRARY_PATH=/private/tmp/umf-capture-budget-overlay/umf \
PYTHONPATH=/private/tmp/umf-capture-budget-overlay:python/umf_access/src \
python/.venv/bin/python -m pytest -q -p no:cacheprovider \
  python/umf_access/tests/test_capture.py \
  python/umf_access/tests/test_capture_field_observation.py \
  python/umf_access/tests/test_capture_rust_graph_validator.py \
  python/umf_access/tests/test_captured_declaration_predecessor.py \
  python/umf_access/tests/test_captured_logical_render_positive.py \
  python/umf_access/tests/test_captured_logical_render_predecessor.py
```

Current implementation pins (superseding the earlier audit's changed files):

| Input | SHA-256 |
|---|---|
| `python/umf_access/src/umf_access/rust_capture_observe.py` | `51457d436b5183ecfed4382e8046b85464cdd227dda2734ff2d9fc66b54b5864` |
| `python/umf_access/tests/test_capture_field_observation.py` | `d82589b7ad97437298d11b8ce8d92984669b88591af6c546137b8868b8b75bea` |
| `crates/umf-core/src/access_graph_host_observation.rs` | `49d2e0b28482c83e9575a560a09156202d052831f367fb564931e3be306aa021` |
| `bindings/core/python/src/lib.rs` | `07a6003e98417a35c8756bc53918c4417172bad74742528f94dba81ec6d44d2e` |
| temporary `_rust_core.abi3.so` | `d263405ef4ec30870ea338a253a1f23754beb743730142859b933a93ba0766b9` |
