---
ddx:
  id: umf.evidence.rust-migration.r8-captured-graph-validator-interface
  type: execution-evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: ADR-006
      kind: informed_by
    - id: CONTRACT-067
      kind: informed_by
    - id: CONTRACT-068
      kind: informed_by
    - id: CONTRACT-071
      kind: implements
    - id: umf.evidence.rust-migration.r8-captured-declaration-rust-bridge
      kind: extends
    - id: umf.evidence.rust-migration.r8-captured-logical-render-rust
      kind: informed_by
---

# R8 captured-graph validator boundary

This note records a read-only characterization and proposed interface for
moving `umf_access.capture._validate_node` semantics into Rust. It does not
change `capture()`, the Rust logical renderer, or the catalog default. Python
still has to import the declaration, inspect annotations, construct the DSL
graph, and execute the declaration body for each capture variant.

## Governing behavior and current outcomes

`capture(function)` first checks the explicit query/command decorator and
reflects supported `Param[T]` annotations. `_invoke` then executes the Python
body, requires a `Terminal`, and calls `_validate_node`. It does this twice
for the full optional-presence set, then twice for every selected optional
variant, before determinism and variant-topology checks. Capture resets its
`ContextVar` in `finally`; failures therefore belong to the Python capture
stage, before the current Rust bridge can be invoked.

The current predecessor was exercised directly on CPython 3.13.16 with
Pydantic 2.14.1. A valid root-owned field comparison against a declared
`Param[int]` is accepted. The selected negative and crossed outcomes were:

| Case | Result |
| --- | --- |
| Foreign-owner `FieldRef` in a predicate | `TypeError: expression column belongs to another Record` |
| Foreign-owner field is visited before an undeclared parameter | Same `TypeError` above; graph traversal order wins |
| Undeclared parameter is visited before a foreign-owner field | `CaptureError`, code `CAPTURE_SIGNATURE`, message `CAPTURE_SIGNATURE: expression references an undeclared parameter` |
| Literal Key identity names another Record | `CaptureError`, code `CAPTURE_SIGNATURE`, message `CAPTURE_SIGNATURE: Key belongs to another Record` |
| Parameter Key identity names another Record | Same `Key belongs to another Record` refusal |
| Selected Record Key differs, with a foreign-owner predicate also present | `CaptureError`, code `CAPTURE_SIGNATURE`, message `CAPTURE_SIGNATURE: Key differs from selected Record Key`; terminal Key validation precedes expression traversal |
| Key parameter uses expected identity but wrong component tuple | `CaptureError`, code `CAPTURE_SIGNATURE`, message `CAPTURE_SIGNATURE: Key component parameters differ from declared carrier` |

The corresponding implementation order in `capture.py` is observable:

1. `_parameters` checks annotation form, supported carriers and generated Key
   identity.
2. `_invoke` runs the declaration and checks that the return value is a
   `Terminal`.
3. `_validate_node` checks terminal form and root `RecordRef`, grouping and
   scalar-selection restrictions, then gathers join owners in step order.
4. For `get`/`page`, terminal Key ownership and selected-Key identity are
   checked before `visit(node)` walks the expression graph.
5. `visit` walks children in tuple order. It checks FieldRef membership,
   search Record and parameter carrier, declared parameter names, Key
   components/identity, temporal-profile reuse and optional-filter placement.

That ordering matters to callers which rely on the first refusal. Foreign
expression columns currently raise `TypeError`; the listed signature/key
refusals raise `CaptureError` with a `.code` attribute and a prefixed `str()`
message. A port must retain both the order and the distinction in Python
exception mapping.

The probe was run in an ephemeral inline process. The outputs above are direct
`capture()` observations and are frozen in
[`frozen-predecessor.json`](frozen-predecessor.json). The outcome packet uses
standalone synthetic declarations; no generated `commerce` package was
imported. It freezes outcomes and exact errors, not raw DTOs; the R8
captured-declaration packets are the existing tagged-DTO precedent. Focused tests
were also attempted with cache writing disabled. `test_capture.py` and
`test_dsl_render.py` produced 41 passes and 13 passing subtests, with one test
blocked because the repository's generated `commerce` fixture was not on
`PYTHONPATH`. The separate `test_relationship_key_identity.py` could not be
collected for the same missing `commerce` module. These are environment limits,
not passing test claims for those generated-Key cases.

## Rust input available today

The opt-in Python bridge in
[`rust_catalog_render.py`](../../../../../../python/umf_access/src/umf_access/rust_catalog_render.py)
currently calls `capture()` first and serializes each `CapturedVariant` using
the tagged DTO encoder. A v0.2 render request is the closed envelope
`{binding, ownerBound, profile, variant}`; `variant` is the tagged
`umf_access.capture.CapturedVariant` containing `node`, `parameters`, and
`presence`. The nested graph carries tagged `Node`, `RecordRef`, `FieldRef`,
`CapturedParameter`, `KeyLiteral`, and supported carriers.

Rust's `access_logical_render_full.rs` already admits that closed tagged shape,
checks DTO object member sets, resolves render-time owner aliases, and refuses
some renderer-specific owner mismatches. This is not yet a Rust equivalent of
`_validate_node`: `full_render` does not consume the `parameters` member's
carrier/key declarations as a validation map, does not walk the entire graph
with Python's admission order, and its render-time missing-owner refusal is
`CAPTURE_UNSUPPORTED`, whereas Python's direct capture owner refusal is a
`TypeError`. The current bridge cannot expose that difference because Python
validation runs before Rust.

## Proposed opt-in interface

Add a separate Rust validation entry point over the existing frozen
`CapturedVariant` DTO rather than expanding `render_logical_variant`'s scope.
The conceptual request is:

```json
{
  "profile": "umf-access-captured-graph-validation/0.1.0",
  "variant": {"$type": "umf_access.capture.CapturedVariant", "fields": {"node": "…", "parameters": "…", "presence": "…"}}
}
```

The result should be a closed response that distinguishes acceptance from a
Python-compatible refusal category, while keeping the exact code and rule
text:

```json
{"profile":"umf-access-captured-graph-validation/0.1.0","outcome":"accepted"}
{"profile":"umf-access-captured-graph-validation/0.1.0","outcome":"refused","kind":"type-error","code":"","rule":"expression column belongs to another Record"}
{"profile":"umf-access-captured-graph-validation/0.1.0","outcome":"refused","kind":"capture-error","code":"CAPTURE_SIGNATURE","rule":"expression references an undeclared parameter"}
```

The Python facade would map `type-error` to `TypeError(rule)` and
`capture-error` to `CaptureError(code, rule)`. The engine should validate each
invoked graph at the current `_invoke` point, not only after the entire
declaration is captured; this preserves the first failing presence variant and
the existing body/terminal/determinism order. Python remains authoritative for
imports, annotation reflection, Pydantic classes, body execution, and public
exception ergonomics. Rust owns the closed graph's shared ownership, parameter
and Key consistency semantics. The Rust renderer may then consume only a graph
that passed this validator, but renderer qualification remains separate.

The candidate Rust API is a new `umf_core::access_graph_validate` module with
`validate_captured_variant(input: &PythonConsumerValue, ctx: &mut Context)` and
a dedicated refusal carrying `kind`, `code`, and `rule`. Export that module
from `crates/umf-core/src/full_modules.rs`; add a Python binding and module
registration beside the existing logical-render functions in
`bindings/core/python/src/lib.rs`. The Python bridge should expose a private
validator adapter and an internal capture seam in `capture.py` so existing
`capture()` keeps `_validate_node`, while the opt-in Rust capture calls Rust at
the same `_invoke` point. This preserves the first failing presence variant
and keeps ordinary catalog builds Python-selected pending review. The bridge
can reuse `CapturedVariant` and `_encode_capture`; validation should have its
own profile rather than changing v0.2 rendering.

Before the Rust implementation, extend the packet with raw tagged DTOs captured
from accepted cases and test-only synthetic mutations for refused graphs.
Focused Rust tests should validate the accepted DTO and use explicitly marked
synthetic mutations to cover semantic refusals and crossed pairs. Focused
Python tests should compare direct capture outcomes to the packet and compare
the opt-in path's exception type, `.code`, and exact string. Existing Rust renderer tests remain
separate: render-time support does not prove capture validation. Review
`Context` node/depth/text admission against Python's current validator; any
bridge limit is narrower than predecessor behavior until parity or a contract
version resolves it.

### Proposed file sequence and open decisions

1. Extend the current outcome packet with raw tagged DTOs from accepted cases
   and optional variants before Rust changes. Its current JSON freezes exact
   outcomes but intentionally does not include accepted DTO bytes.
2. Add `crates/umf-core/src/access_graph_validate.rs`, export it from
   `crates/umf-core/src/full_modules.rs`, and add focused tests in a new
   `crates/umf-core/tests/` file. The Rust entry point consumes the tagged
   variant and `CapturedParameter` list, validates owner/join membership,
   parameter references/carriers and terminal Key identity, and returns an
   ordered refusal rather than rendering text.
3. Add a PyO3 function and registration in
   `bindings/core/python/src/lib.rs`; use a private adapter in
   `python/umf_access/src/umf_access/rust_catalog_render.py` to translate the
   structured result to the predecessor exception category.
4. Add a private capture seam in
   `python/umf_access/src/umf_access/capture.py` so `_invoke` accepts a
   validator function. Public `capture()` continues to pass `_validate_node`;
   an explicitly selected comparison route supplies the Rust adapter at that
   same call site. Do not switch the default before the full corpus and
   resource profile pass.

`CONTRACT-071` defines broad `CAPTURE_SIGNATURE` and `CAPTURE_UNSUPPORTED`
categories but does not state the observed `TypeError` class or this internal
first-error order. Treat these as predecessor compatibility requirements for
this slice unless the owner decides to amend the contract. A second open
decision is Python subclass behavior: `_validate_node` uses `isinstance` for
`FieldRef`, `Join`, `Node`, and related forms, while the current Rust DTO parser
admits exact tagged type names. One accepted `FieldRef` subclass DTO is now
captured, but no subclass refusal or overridden-accessor vector has been
captured. Finally, generic Rust `Context` admission may reject graphs before
semantic validation; it must not be reported as `_validate_node` parity because
the Python validator itself has no matching node/depth budget.

## Predecessor coverage and remaining gaps

The v1/v2/v3 packets now freeze the clauses listed in the preceding section,
including the required owner/parameter order, Key identity, get/page order,
optional variants, and representative raw accepted DTOs. The direct outcomes
include Python exception class, `.code` where present, and exact `str(error)`.
Remaining before a validator implementation can claim broad graph parity are
the rest of the accepted/refused graph grammar, including related-navigation
and search subgraph traversal beyond the three SearchLeg admission probes,
additional Join chains/aliases, get/page variants beyond the crossed owner
case, and full capture-body/determinism/variant topology ordering. The raw DTO
set is representative rather than exhaustive. Python `isinstance` subclass
behavior and Rust Context resource-limit precedence remain separately open as
described above.

For Rust differential tests, construct inputs through the captured DSL
objects and freeze them before the port. Any test-only bypass used to obtain an
invalid graph must be separately labeled synthetic; it cannot replace direct
Python predecessor error observations. Do not switch `capture()` or catalog
defaults until exact error-order and accepted-graph parity is demonstrated,
including the complete captured graph grammar and optional variants. This
proposal does not establish Weft compilation, catalog output, installed Python
package behavior, or full Rust ownership of the `umf_access` package.

## Source pins and limits

### Opt-in v0.1 implementation checkpoint

The first implementation checkpoint is intentionally narrower than the
proposed graph validator. `access_graph_validate::validate_captured_variant`
accepts the frozen `CapturedVariant` envelope and owns one v3-demonstrated
semantic clauses: traversal-order refusal when a `param` or `key_param` names
no declared captured parameter, and exact `key_param` component/identity tuple
consistency with the declared carrier, and root/join owner membership for
well-shaped `all` terminals. The owner prepass checks each join source before
expression traversal; a foreign `FieldRef` then returns the predecessor's
`TypeError: expression column belongs to another Record` in depth-first
order. The latter Key check returns the frozen
`CAPTURE_SIGNATURE: Key component parameters differ from declared carrier`
rule only after declared-name membership succeeds. An ordinary `param` still
checks membership only. Sixteen focused Rust tests pass, including both Key
tuple mismatches, undeclared-name precedence, owner and joined-owner
acceptance, foreign-owner and join-source refusals, child-order crossings,
alias identity, an ordinary Param carrier control, and unknown concrete-tag
refusal. The PyO3 operation and
`capture_with_rust_graph_validator` seam are opt-in; public `capture()` still
selects `_validate_node` exactly as before. Focused Rust unit tests cover a
declared parameter acceptance and exact `CAPTURE_SIGNATURE` refusal. The
Rust test was run with the pinned 1.90 toolchain using `cargo test --locked -p
umf-core --lib access_graph_validate`; the target directory was isolated under
`/private/tmp/umf-access-graph-target`. The PyO3 package also passed
`cargo check --locked -p umf-core-python` against the same target directory.

This checkpoint does not yet implement `get`/`page` selected-Key preflight,
SearchLeg validation, related-navigation,
terminal/group/scalar clauses, temporal checks, or the resource-limit/error-
order relationship between Python and Rust `Context`. It admits only known
v3 tagged DTO types in the traversed graph; an unrecognized concrete subclass
tag is explicitly refused as `CAPTURE_DTO_INVALID`, rather than treated as a
base class. The encoder keeps the concrete subclass tag and extra fields in
the serialized DTO, but this checkpoint does not classify such subclasses or
claim their base-kind semantics are validated. `get` and `page` terminals
currently fail closed as `CAPTURE_DTO_INVALID` before expression traversal;
the v3 `selected-key-valid-param` case is outside this opt-in profile. The
opt-in adapter is not a replacement for the default capture
validator and has not been qualified against the full v3 packet. Python's
focused existing `test_capture.py` suite remains green (17 tests and 3
subtests) with the default route. Two focused seam tests pass with a mocked
extension response; they verify opt-in dispatch and refusal translation, not
the installed PyO3 execution. No full v3 graph parity or subclass-sidecar
claim is made.

### Accepted tagged DTO and optional-variant supplement

The additive direct-capture packet [`frozen-predecessor-v2.json`](frozen-predecessor-v2.json)
freezes raw tagged DTO bytes for an accepted root-owned `FieldRef`/`Param[int]`
predicate and both variants of an optional `Param[int | MISSING]` predicate.
The absent variant contains an `omitted` node and empty `presence`; the present
variant contains the parameter comparison and `presence: ["value"]`. This
records the complete `CapturedVariant` envelope (`node`, `parameters`, and
`presence`) for these representative accepted shapes. It does not establish
the full graph grammar or joined-owner parity.

The expanded direct-capture packet [`frozen-predecessor-v3.json`](frozen-predecessor-v3.json)
adds 27 named outcomes, with exact exception class, code where present, and
full `str(error)`. It records root and joined-owner acceptance, foreign owner
refusal, both owner/undeclared-parameter child-order permutations, ordinary
wrong-carrier acceptance, undeclared parameters, join-source absence,
SearchLeg owner/carrier/declaration checks, valid/foreign/wrong-selected Key
identities, Key parameter component and identity mismatch, get/page key-before-
expression order, terminal/group/scalar-selection refusals, incompatible
temporal parameter profiles, and optional top-level absent/present versus
nested omission refusal. Six accepted tagged-DTO groups are included: root
FieldRef, joined-owner FieldRef, ordinary wrong-carrier Param, selected Key
literal, selected Key parameter, and both optional variants. The packet was
captured directly with CPython 3.13.16 / Pydantic 2.14.1 and pins the relevant
Python source files. Its SHA-256 is
`912d75af61249f122faaae5a88d890808537dfb718e61d03d5a0305724489cab`.
The preserved probe is [`capture-predecessor-v3.py`](capture-predecessor-v3.py),
SHA-256 `aa20c6aa459e19bb5945e787c057479c31db30e6d2c4a638fa362add16318c31`; from the repository root it replays with:

```sh
PYTHONPATH=python/umf_access/src python/.venv/bin/python \
  docs/helix/04-build/evidence/rust-migration/r8-captured-graph-validator-interface/capture-predecessor-v3.py
```

The observed stdout is byte-identical to the frozen v3 packet on the pinned
runtime.

The packet labels three manually constructed raw-`Node` graphs as synthetic:
Key component mismatch, Key parameter identity mismatch, and the page crossed
Key/expression case. They invoke direct `capture()` but do not claim those
malformed graphs are constructible through the public DSL API. The ordinary
parameter mismatch is a useful boundary: `capture()` accepts a `Param[str]`
compared with an integer Field because `_validate_node` checks declaration
membership, not general Field/carrier compatibility. SearchLeg does check a
selected carrier; an undeclared SearchLeg parameter and a declared parameter
with the wrong carrier share the same message because the predecessor combines
those conditions.

The same direct predecessor probe establishes that a Python `FieldRef`
subclass is accepted by `_validate_node` (`isinstance` behavior) and encoded
with its concrete tag `__main__.DerivedField`, including its additional
`extra` field. The currently described Rust parser accepts the canonical
`umf_access.dsl._nodes.FieldRef` tag; therefore the subclass DTO is a concrete
unsafe input for the proposed exact-tag Rust validator unless a compatibility
policy is chosen. Silently retagging it would discard subclass identity and
could conceal overridden behavior. The Rust route should explicitly reject
with a reviewed compatibility outcome or support this extensibility; the
Python default must remain unchanged until resolved.

A non-dataclass duck-shaped `FakeField` is refused during `capture()`'s
determinism canonicalization with `TypeError: Object of type FakeField is not
JSON serializable`, before `_encode_capture` runs. This is not evidence that
the DTO encoder itself accepts or rejects that value. The packet records the
runtime as CPython 3.13.16 / Pydantic 2.14.1. Its SHA-256 is
`1ca20b81957fe85bfebba3a06775ba711d15750559e9dfd9a51d039162e94375`.

### Subclass compatibility interface decision (design only)

The narrowest route that preserves the current DTO and keeps graph validation
in Rust is a private PyO3 bridge envelope with two coordinated parts: the
unchanged concrete tagged DTO (including subclass-only fields), and trusted
per-node base-kind metadata. The PyO3/Rust binding owns this compatibility
classification and invokes Python `isinstance(value, FieldRef)` only as a
host type predicate on each freshly captured live object while it is
converting the graph. Do not add a Python semantic-classifier helper. The
binding forwards the classification as private sidecar metadata with the
closed DTO; Rust consumes the base kind for semantic dispatch, validates the
serialized base fields, and retains the concrete type tag and extension
fields as opaque payload. It must not rewrite the concrete `$type` tag or drop
extras. The metadata is trusted only on a private in-process bridge function
whose input is constructed directly from a freshly captured graph; the public
JSON/dict render API must never accept user-asserted base-kind metadata.
Ownership, parameter, Key, and ordered graph-rule validation remain Rust
behavior. This is a narrow host type predicate, not a second Python graph
validator.

A plain retagging DTO is unsafe: it erases the observed concrete tag and may
erase subclass members or behavior. The PyO3 `isinstance` predicate does not
establish compatibility for subclasses that override attribute access or
mutate observable state; direct predecessor probes must cover those cases
before claiming the subclass cohort. This bridge approach still uses live
Python objects solely to classify the already captured node types; all graph
traversal rules remain in the Rust core over the preserved DTO.

`Context::ordinary()` currently admits a maximum nesting depth of 128 and
100,000 tree values (`crates/umf-core/src/context.rs`); `python_value::from_python`
charges those limits before the Rust semantic validator runs. `_validate_node`
has no corresponding depth/value ceiling. Consequently an oversized graph
could receive a resource `LIMIT` before the Python predecessor's semantic
TypeError/CaptureError. Required parity tests must put a semantic violation at
the traversal position that Python would visit first, then replicate it both
within limits and with a crossing-fault graph beyond each bridge limit. The
latter must be recorded as a reviewed resource-profile difference unless a
predecessor limit is added to contract or the bridge changes admission order.
No current evidence establishes that the proposed validator can claim
unbounded predecessor parity.

Minimum future tests: (1) canonical `FieldRef` accepted with canonical tag;
(2) subclass with inherited values and an extra dataclass field accepted,
retaining concrete tag/extra in the DTO; (3) subclass instance with foreign
owner refused as `TypeError` in the same order as the base class; (4) subclass
overriding a relevant field accessor, tested for direct-capture stability and
either supported or explicitly refused by the bridge; (5) a user-supplied
dict containing forged base-kind metadata rejected by the public entry point;
(6) the same undeclared-param/foreign-owner crossed-fault permutations below
and above Rust admission depth/value limits, with exception type, code, exact
message, and first-rule ordering asserted. These are design requirements,
not tests run by this read-only supplement. The accessor and admission-limit
gaps are blockers to selecting this route as Python's default until their
compatibility or explicit contract treatment is reviewed.

The local focused Python runtime was CPython 3.13.16 / Pydantic 2.14.1.

| Source | SHA-256 |
| --- | --- |
| `python/umf_access/src/umf_access/capture.py` | `492f68954ca66f3fbd15eb008f7e1d6fa690829d9c31e3ec3d85ecb09a7e67a6` |
| `python/umf_access/src/umf_access/dsl/_nodes.py` | `2791cb533f42521ca6f807eb51230a2b1fc72f1e046ebd3877df36550d4953e5` |
| `python/umf_access/src/umf_access/dsl/_expressions.py` | `3620e652e4bf1b8af6a3668e50b07ab2ecadb3449df731cd8b1c79a88ece9e64` |
| `python/umf_access/src/umf_access/dsl/_query.py` | `ee819f9db981c99075096c797c2686cbd320ae0abe4b4f2a2c10d42ee13da7e7` |
| `crates/umf-core/src/access_logical_render_full.rs` | `eef86aab02cc7ce68bc3f3cce156c18ff5726ce8441ecb7da9a6ca7c9a15122f` |
| `crates/umf-core/src/access_logical_render.rs` | `cd915d3178926037dd11094a302ad0073ecff827b54585f5fd5f0142f063ba73` |

These pins are a characterization snapshot, not a coordinated source archive.
No source, generated resource, Rust build, or package artifact was changed or
qualified by this task.

### Source-built Key-parameter replay (2026-10-26)

`replay_key_param_validator.py` builds no code itself; it replays a separately
built PyO3 extension in a temporary Python package overlay and writes the
hash-pinned result to [`key-param-validator-receipt.json`](key-param-validator-receipt.json).
The recorded extension was built from the current worktree with Rust 1.90.0
using:

```sh
CARGO_TARGET_DIR=/private/tmp/umf-r8-graph-key-target \
RUSTC=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin/rustc \
/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin/cargo \
  build --locked -p umf-core-python
python/.venv/bin/python \
  docs/helix/04-build/evidence/rust-migration/r8-captured-graph-validator-interface/replay_key_param_validator.py \
  --extension /private/tmp/umf-r8-graph-key-target/debug/lib_rust_core.dylib
```

The receipt pins the validator module, module export, PyO3 binding, Python
adapter, Python core shim, v3 packet, and extension binary. The source-tree
extension at `python/src/umf/_rust_core.abi3.so` is stale and does not expose
the validator; the replay loads the freshly built extension from a temporary
package overlay. It is current-source binding evidence, not installed-wheel
or release-package qualification.

The v3 `selected-key-valid-param` DTO is rooted at `get`, which is outside the
current Rust profile because selected-Key preflight is not yet ported. For the
bounded Key-component/identity comparison only, the script retains its
`RecordRef` and `key_param` node and synthetically adapts the root to
`all(RecordRef, (key_param,))`. That raw DTO adaptation is explicitly not a
predecessor `get` or `page` parity result. The synthetic accepted `all` DTO and
two synthetic component/identity mutations are compared against the exact v3
refusal code and message. Rust returns the expected
`CAPTURE_SIGNATURE: Key component parameters differ from declared carrier`,
and the Python adapter raises the same `CaptureError` envelope. An unadapted
`get` DTO is explicitly recorded as outside-profile `CAPTURE_DTO_INVALID`;
`page` is not replayed. Public `capture()` remains Python-selected and is not
qualified or changed by this receipt.

## Trusted subclass DTO admission — 2026-10-26

The private encoder now maps real subclasses of the known graph classes to
canonical base tags and serializes the fields declared by that trusted base.
The admitted bases are `Node`, `FieldRef`, `RecordRef`, `SearchLeg`, `Join`,
`RequiredNavigation`, `OptionalNavigation`, and `ManyNavigation`. Navigation
classes are resolved before their `Join` ancestor so the closed navigation
family and source/target roots required by Rust survive encoding. Membership
comes from the concrete type's actual MRO, read through `type.__getattribute__`;
caller-controlled module/qualname strings do not establish admission.

When a concrete type inherits multiple unrelated trusted bases, encoding
refuses with `TypeError: captured graph class inherits unrelated trusted
bases` instead of selecting one tag and dropping the other meaning. A
dataclass that spoofs a trusted module and class name is also refused. The
focused control covers both refusal boundaries alongside real subclasses of
Node, FieldRef, RecordRef, RequiredJoin, and SearchLeg.

Sol's CPython 3.11 temporary native-extension overlay rerun passes 31 focused
tests plus three subtests across the graph-validator, capture, and predecessor
suites. This confirms the exercised opt-in DTO cases only. Python still owns
public `capture()`, constructor behavior, arbitrary subclass accessor effects,
full graph ownership, and installed-package qualification; no public/default
route changed.

## Two-hop aliased Join control — 2026-10-26

A focused Rust control and live Python comparison now cover a second Join whose
source is the aliased target of the first. Both accept the valid two-hop graph.
When the second Join drops that alias and a later filter also refers to a
foreign record, both refuse first with `CAPTURE_UNSUPPORTED: join source is
absent`. Sol independently reran 36 focused Rust graph-validator tests and 13
Python graph-validator tests with a native extension overlay on CPython 3.11.
This extends opt-in ordering evidence only; public `capture()` still uses its
Python validator.

## Live selected-Key `get` and `page` parity — 2026-10-26

The existing private Rust validator already runs selected-Key preflight for
`get` and `page` after join-owner closure and before expression traversal. A
new live Python control now compares that Rust seam directly with Python's
`_validate_node` on genuine captured `get`/`page` declarations. Both accept
valid Key parameters. Crossed graphs with a later foreign-field expression
first refuse the wrong selected Key: both paths return the same
`CAPTURE_SIGNATURE` code and exact message for a different selected Key or a
Key belonging to another Record. A genuine Key-literal operand also exercises
the selected-Key mismatch path. The test asserts the accepted private capture
result equals the Python capture result.

Sol independently reran 36 focused `umf-core` graph-validator tests with Rust
1.90.0 and the capture plus private-validator suites with a freshly built PyO3
extension overlay on CPython 3.13.16: 31 tests and three subtests passed.
This is source-tree opt-in parity for the exercised shapes. Arbitrary subclass
accessor behavior, wider capture admission and resource-limit parity,
installed-wheel qualification, and public `capture()` selection remain open.
