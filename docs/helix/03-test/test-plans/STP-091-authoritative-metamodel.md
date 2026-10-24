---
ddx:
  id: STP-091
  type: story-test-plan
  activity: test
  status: draft
  authoring:
    home: repo
  links:
    - id: US-089
      kind: informed_by
    - id: TD-091
      kind: informed_by
    - id: CONTRACT-080
      kind: references
---

# STP-091: Authority, parity and legacy retirement verification

## Scope

Prove one authored current-core authority without silent semantic loss. The
project test plan and CONTRACT-001 through CONTRACT-011 retain native/browser
qualification boundaries. Test sources MUST cite exercised `@covers US-089-ACn`.

| Criterion | Required test evidence |
| --- | --- |
| AC19 | Clean generation without outputs; closed vocabulary and negative opcode/ref tests; model mutation changes schema and both runtimes; no reverse-schema authority |
| AC20 | Frozen independent current vectors; all structural and semantic rule families; ordered diagnostics, exact callbacks, prototype-safe values, exact numeric/UUID and unknown-content cases; TS/Python installed/browser parity |
| AC21 | Active adapter/classifier/package/schema-ref census; source collisions and preservation/refusal; meaningful regression and required scoped native oracles |
| AC22 | Complete retirement ledger; forbidden old imports/dispatch/exports/shims; current package inventory excludes inert history; all retained markers classified |
| AC23 | Actual Chromium desktop/mobile cold ontology/reference/catalog/local-file; collapsed defaults; Record keys and Field values; API journeys; YAML/JSON edits; Back/refresh/keyboard; no page errors or retired-host visits |
| AC24 | Independent clean fixed-point/reproducibility and no-write stale/missing/extra output check; full test inventory, type/declaration/schema/boundary/build/package/embedding/integrity checks |
| AC25 | Reviewed final diff and findings resolved; CI deployment; live source-manifest/critical byte/public signature checks and repeated browser journeys; docs qualify actual native evidence |

## Execution discipline

Sol freezes concrete test file names alongside compiler interfaces before parallel
implementation. Use disjoint shards while migrating, followed by the complete
required inventory. Never delete or skip meaningful tests to mask regressions;
historical-only assertions become inert dated evidence with explicit reasons.
Python's former incomplete profile is not a correctness oracle. Existing bugs
require explicit reviewed correction. Record commands, source hashes, outcomes,
failures/corrections, environment and qualified limits under
`04-build/evidence/metamodel-authority/`. Preserve pre-existing live evidence.


## R2 concrete allocation and executable proof

The existing AC19–AC25 remain the authority; R2 implements the compiler/core
portion, while unrelated native adapter cutovers and live publication retain
their separate slice gates. Test source cites the applicable `@covers US-089-ACn`.

| AC | Concrete tests and assertions |
| --- | --- |
| AC19 | `crates/umf-metamodel/src/lib.rs` unit tests, `tests/metamodel/compiler-kernel.test.ts`, `tests/rust-core/compiler-parity.test.ts`: bootstrap with generated outputs absent; all authored shape/domain refs and operator declarations; reject duplicate/dangling identities and every unknown/malformed nested opcode, including untaken/empty branches; model mutations change schemas and both bound runtimes. |
| AC20 | `crates/umf-core/tests/{admission,literals,constraints,registry,schema,consumer_schema}.rs`, `crates/umf-core/src/serialization.rs` unit tests, `scripts/rust-core/{node,python,cli-core}-conformance.*`: frozen independently expected results plus current differential controls for every rule family; exact ordered diagnostics/code/path/message/severity/valid/complete; copies and immutable snapshots; original-context callbacks, failures and reentry. |
| AC20 | `tests/rust-core/{host-admission,engine-host-admission}.test.mjs`, `python/tests/test_rust_core.py`: actual lone UTF-16 surrogates and astral pairs in keys/values/source/callbacks; hostile JS descriptors/prototypes/symbols/sparse arrays without getters; Python custom containers; missing versus null, numeric binary64 limits/-0/overflow/underflow/exact-token spelling, UUID/128-bit and Unicode-scalar mechanics. |
| AC20 | `crates/umf-core/tests/registry.rs`, installed Python tests: consumer-supplied structural/semantic extensions; exact version/scope/resources, unknown keywords/dialects, dangling refs/no network, callback exceptions and original whole-document context, source/returned/registered-schema mutation isolation. Include existing Draft 7 `schema_validator` behavior. |
| AC20/AC24 | `crates/umf-core/src/serialization.rs` unit tests and `crates/umf-core/tests/python_serialization_predecessor.rs`: JSON/YAML duplicate decoded keys, non-string keys, aliases/tags/directives/documents, scalar spellings and exact read-write-read behavior; numeric/Unicode differences are failures unless explicitly reviewed. Regex corpus covers anchoring/lookarounds/Unicode and resource-risk inputs. |
| AC22/AC24 | `scripts/check-rust-boundaries.py` production graph controls: no core host APIs, platform entropy, JS fallback, schema/compiler reverse dependency or wrapper semantic kernels; retain source-exact legacy differential dispositions until their own cutover. R1 dependency exceptions cannot qualify production crates. |
| AC24 | `tests/rust-core/compiler-parity.test.ts`: truthful compiler closure and backend provenance; all eleven canonical outputs, second-generation exact bytes, untouched tree on check failures for stale/missing/extra outputs; pure native compiler run with empty PATH. Prior bytes remain immutable controls; only approved provenance/backend changes are normalized. |
| AC20/AC24 | `scripts/rust-core/full-conformance.ts`, `scripts/rust-core/browser-conformance.ts`: fresh installed `umf-core` wheel, Node addon under Node and Bun, native CLI and shipped WASM in real Chromium execute the same corpus; missing binaries/init refuse without fallbacks; browser blocks nonlocal requests; independent contexts yield identical results. |
| AC20/AC24 | `crates/umf-core/tests/resources.rs`: limits at/below/above actual 4M UTF-16/128-depth/100K-value and catalog 1M-value profiles; instruction/copy/enumeration/sort/arithmetic budgets; real mid-work cancellation; deadlines from injected clock; no partial success; independent and restored reentrant scopes. Hard-preemption claims require separate real worker termination tests. |
| AC25 | Independent final source/diff/evidence review; exact compiler/model/schema/program/policy/lock/binding/harness/build-hook hashes and artifact inventories; every failed control and intentional compatibility correction recorded under `04-build/evidence/rust-migration/r2/`. R2 does not claim live release/publication. |

Baseline capture must include current TS and Python outcomes separately; their
pre-existing disagreements are not silently resolved by selecting whichever
matches Rust. Frozen expected controls derive from CONTRACT-001/080 and reviewed
current corrections. The complete existing `tests/metamodel/`, Python core suite,
typechecks and authority/boundary/regeneration checks remain mandatory regression.
Generated output tests must mutate model/rules/policies rather than merely assert
that output files exist. Validation of generic programs/policies must also cover
mutation after a prior successful admission; mutable caller input cannot reuse a
private prepared-resource cache.

Executable commands are `cargo test --locked -p umf-core -p umf-core-wire -p umf-metamodel -p umf-cli`,
`bun test tests/rust-core tests/metamodel`, the existing Python core suite against
the installed candidate wheel, `bun scripts/rust-core/conformance.ts`,
`bun run check:metamodel`, `bun run check:core-authority`,
`bun run check:rust-boundaries` and `bun run typecheck`. Add these commands only
with real runnable implementations; a named command is not passing evidence.
Record command/environment/source identities and observed failures/results in the
R2 packet. No aggregate token meter or broad package/platform claim is inferred
from a successful local subset.


### R2 independent compatibility expansion

The exact main-53de049 Python/jsonschema 4.26.0 admission capture contains 9,282
valid/invalid schema constructions across the six declared dialects. The pinned
official JSON Schema Test Suite contributes 4,995 instance cases. Compare actual
installed constructor/validation outcomes; record predecessor deviations from
the external suite and review corrections explicitly. Native helpers alone do
not establish Python facade compatibility.

Python regex controls must span every grammar/flag family and versioned Unicode
classification/case/name behavior, including large quantifiers, invalid/deep
grammar, lookarounds, conditionals, backreferences, raw surrogate units and the
explicit-pair/astral-origin distinction. Preserve UTF-16 diagnostic codes and
identities in program operations and callbacks. Exercise actual 99,999-member
JSON/YAML maps, depth-128 empty containers and combined resource bundles so host
protocol overhead cannot narrow payload limits. CLI hard isolation must refuse
without reading stdin; invalid UTF-8 must reject without replacement.


Python source-path controls include distinct astral versus explicit-surrogate-pair
property names in validation and diagnostics, registry structural failures,
callback paths equal to the internal marker spelling, and schema `$id` URIs with
marker-looking path segments. Only trusted schema-origin pointer segments may be
decoded; arbitrary callback/URI text must round-trip unchanged. These controls do
not widen schema-source numeric admission beyond the predecessor safe envelope.


Python serialization qualification includes 372 initial observations, 60 recursive
ordering observations, 852 lexical scalar observations and 588 character-profile
observations, plus 522 source-context observations, across CPython 3.11/3.12/3.13
and ruamel 0.18.15/0.19.1. Original
fixtures remain immutable. The installed comparator must enforce the exact
fixture/selector/case-hash guard for R2-SOL-CORRECTION-002 (writer NEL preservation),
while raw source NEL retains native reader behavior. Compare actual Python value
types, mapping order and code points, not merely successful parsing.


The additional YAML edge, break-context and directive corpora bring frozen
serialization observations to 5,226 across the six native profiles, including
48 reserved-directive tail observations. The retained
TypeScript operator reference contributes 6,271 ordinary successful cases plus
2,619 source-guided edge cases, including 805 recorded exception observations.
`crates/umf-core/tests/runtime_operators_predecessor.rs` must compare all exact
successful diagnostics and the reviewed coercion-refusal mapping. No generic
EngineError may stand in for the expected semantic refusal. A separate 1,548-case
native ECMAScript numeric-coercion oracle checks string grammar, whitespace,
subnormal/overflow and radix rounding. Python-origin companions independently
check transformed diagnostic fields and mixed trusted-path/literal composition;
JavaScript string tests alone cannot establish Python code-point preservation.


Python consumer arithmetic qualification adds 648 broad numeric cases and 1,938
edge cases, independently frozen against jsonschema 4.26.0. Cover all six dialects,
int/float schema-divisor origin, arbitrary integers, NaN/infinities, subnormals,
overflow/underflow, bounds, multipleOf/divisibleBy, integer type, const/enum/not.
Preserve validity versus instance-error status. The reviewed Rust error mapping
uses `PYTHON_SCHEMA_ARITHMETIC`; the frozen Python exception class/message remains
provenance, not a promise of native exception identity. These controls do not
widen schema-source admission. Compare both fixtures through the installed wheel
and the native evaluator, without normalizing unexpected failures to invalidity.

Source archives must contain the pinned Rust source/build closure and licenses,
including hidden vendored license files, while excluding generated native addons,
WASM packages, target directories, bytecode, environments and VCS data. Inspect
actual sdist members and rebuild its wheel offline with no discoverable JavaScript
runtime or toolchain. Generated native/WASM artifacts belong to hashed host
receipts and must not affect compiler source provenance.


Replay ordered schema keyword and combinator controls through all three Python
methods (`is_valid`, `validate`, `iter_errors`), including diagnostic prefixes and
terminal arithmetic errors. Check both keyword orders, allOf/anyOf/oneOf/not/if,
contains and nested property/item traversal; do not mask arithmetic exceptions
behind an earlier internal branch failure. The independent predecessor oracle
and reviewed error mapping remain immutable. First-error execution must avoid
unneeded work, while operational resource failures still propagate.

The actual Chromium conformance-feature build must exercise production Context
work totals above u32::MAX, identical native/wasm callback chunks and a meter
refusal before subsequent chunks. Native tests also deny a >u32 decimal parse
estimate before BigInt allocation. Default production WASM remains separately
qualified without the test-only probe exports.


Enforce R2-SOL-CORRECTION-003 with the exact reviewed correction and target hashes.
The 36-case/108-method insertion-order target is separate from immutable native
seed evidence. Cover reversed input order, two invalid extras, declared/pattern
exclusions and false-schema aggregates. The exception permits no blanket
normalization of unexpected validator outcomes or diagnostic order.


Compare native error keyword, rule value, subject value and display paths with
independent typed metadata/subject fixtures. Include referenced rules, explicit
surrogate pairs, int/float source identity, boolean schemas, contains bounds,
implicit Draft 3 required fields, propertyNames and nested false-schema descents.
Verify physical subject paths/overrides separately from display paths and retain
shared snapshot ownership rather than deep-copying root objects per error.


Apply the exact supplemental subject-phase receipt to the 13 combined-capture
error rows: 11 constructor refusals and two admitted Draft 3 schemas with runtime
boolean-reference failures. Assert construction and evaluation independently for
all three public methods, with the reviewed `PYTHON_SCHEMA_EVALUATION` code/reason.
Do not force early rejection merely to match the historical `schemaError` label.


R2 reached-reference controls freeze 363 admitted schemas / 1,089 method
observations across CPython 3.11.17, 3.12.15 and 3.13.16. Check missing local
targets, non-schema targets, reference families, ordered iterator prefixes and
first-error/predicate short-circuits. Preserve the native construction phase.
Host capability errors with colliding semantic error text, and host-returned
previously marked kernel errors, must remain outer errors. Evaluate recursive
core and typed Python schemas at depth 128 on an explicit 2 MiB native thread;
refuse depth 129 with LIMIT. Repeat the supported-depth control in actual WASM.


R2 annotation-mechanism companions distinguish mark-only key/item collection
from required validity predicates: 140 cases / 393 method observations across
five dialects, and 28 cases / 81 observations for legacy 2019-09. The additional
37-case / 108-method native/target pair reviews only correction-001's same-defect
AP annotation amendment with eight named changed rows. Preserve the original
predecessor files and enforce exact decision/hash/selector guards. Qualify the
legacy boolean-items runtime terminal separately from constructor refusal.


R2 installed qualification must replay all 4,995 frozen official outcomes after
source-origin binding changes. Supplement the Draft 2019-09 recursive-reference
cases with native controls for nested recognized resource IDs, opaque annotation
IDs, direct subresource descent versus reference lookup, anchored and unanchored
history barriers, and the predecessor's canonical local-root behavior. Do not
turn an evaluator mismatch into a broader correction or normalize an unrelated
reference failure.


The frozen recursive-resource-scope companion has 89 cases: 85 admitted schemas
with 255 method observations and four construction refusals. Complete records
match CPython 3.11.17, 3.12.15 and 3.13.16. Six legacy sibling-ID/reference rows
remain runtime unresolved-pointer terminals (18 methods), distinct from the four
constructor refusals. This packet contributes 255 method observations; metadata/path records are
counted separately. Exact
[design](../../04-build/evidence/rust-migration/r2/sol-python-recursive-resource-scope-design.json)
and [clarification](../../04-build/evidence/rust-migration/r2/sol-python-recursive-resource-scope-clarification.json)
receipts govern the scope and phase guards; no native outcome is rewritten.


The additive resource-identity companion contains 114 admitted cases / 342
method observations, matching across the same three Python profiles. It covers
reached opaque-content references, active legacy IDs, trailing empty fragments,
and distinct surrogate/pair/scalar/U+FFFD/private-marker identities. Its profile
records class format-checker use, absent optional URI/IRI modules and absent
registered URI checkers. A further named-anchor companion adds 24 admitted cases / 72 method
observations for lossless anchor lookup and recursive-reference context. The
combined installed gate now has 7,671 method observations and 263 separately
counted metadata/path records. Predecessor files remain immutable; these
companions introduce no semantic correction.

The private resource representation owns exact native u32 codepoints. Verify
that diagnostic UTF-16 projection never feeds URI identity, anchor lookup or
resource selection. Resource locator, path, URI, history and snapshot allocations
and comparisons require Context admission before work. Re-run all retained
2 MiB depth/stack controls after changes to resolver state or evaluator frames;
focused semantic packets alone do not qualify stack behavior.


The independently reproduced URI/dialect companion adds 24 public cases / 72
method observations and 140 direct native URI-join operations. It covers native
empty-reference, trailing-slash, query, fragment, authority, scheme, relative and
dot-segment behavior, including raw codepoint bases. It also distinguishes
`definitions` and `$defs` resource boundaries across six drafts using the pinned
referencing child catalog. Complete predecessor records match all three qualified
Python profiles. The public methods enter the installed gate; direct URI
operations remain internal Rust tests. No native expectation is rewritten.
