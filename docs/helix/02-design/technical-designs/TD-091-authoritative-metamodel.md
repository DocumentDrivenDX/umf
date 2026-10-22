---
ddx:
  id: TD-091
  type: technical-design
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: US-089
      kind: informed_by
    - id: SD-032
      kind: informed_by
    - id: ADR-005
      kind: references
    - id: CONTRACT-080
      kind: references
    - id: umf.architecture
      kind: references
---

# TD-091: Metamodel compiler and current-core cutover

## Scope and approach

Implement CONTRACT-080 as an authority cutover, superseding TD-089's bootstrap
projection boundary. `scripts/metamodel/` owns independent loading, closed
vocabulary checking, normalized structural/rule representation and deterministic
emitters. Runtime modules MUST NOT import compiler or filesystem APIs.
`src/generated/core-model.ts` is the public data/type boundary; generic semantic
execution lives in `src/validation/constraint-kernel.ts`. Python consumes the
same generated constraint/domain resources and generated model shapes.

The compiler emits JSON Schema for structural constraints and an ordered program
for semantic constraints. Preserve per-object rule order, exact registry source
contexts, safe hostile property names and exact literal semantics. Generated
standalone validation runs in Bun and browser without dynamic code generation.
Presence, nullable values and unknown labels remain distinct declarations.

## Migration and removal

Freeze current behavior before replacement; compare valid/invalid vectors with
both runtimes. Move scalar/wrapper mappings, eligibility, known-property tables
and core rule decisions into the model. Retain only generic runtime mechanics.
Migrate native producers, current classification and operation schema refs with
source-preserving collision checks. Retarget package core references while
retaining independent native/extension/receipt versions.

Remove old layered document validation, downgrade recursion, transition-only
APIs, duplicate Python shapes/rules, historical browser validators and resource
snapshots after consumers move. Archive dated evidence without runtime imports.
One Schemas host owns all three modes; renderer capabilities belong in its
qualified reusable release, replacing host shims. Architecture checks enforce
compiler/runtime/Python/browser boundaries and generated authority direction.

## Verification and deployment

STP-091 supplies acceptance checks. The ordered work packages, file retirement
ledger, ownership, risks and continuation live in
[the implementation plan](../../04-build/metamodel-authority-plan.md).
No historical native evidence is automatically renewed. Publish only after
independent review and complete required gates; use existing CI build signing,
then verify actual live bytes, claims and browser journeys.


## R2 shared Rust implementation

CONTRACT-080's production freeze governs this implementation. R2 is the complete
current core/compiler operation family; R1's bounded schemas, errors, generator
block and JSON transport are not implementation substitutes. R3/R4 generators
and Python codegen removal, R5 adapters and R7 default-JS cutover remain separate.

| Module owner | Files | Boundary and result |
| --- | --- | --- |
| Luna A: foundation and compiler | `crates/umf-core/src/{value,error,context,serialization,schema,document}.rs`; core module declarations; `crates/umf-metamodel/**`; `crates/umf-cli/**`; workspace manifests/lock | Own exact representation/admission and generic structural evaluator, independently parsed compiler, portable resource/type emission, CLI I/O. No generated-core dependency during bootstrap. |
| Luna B: semantic engine | `crates/umf-core/src/{literal,literal_policy,constraint_language,constraints,registry,engine}.rs` | Own exact mechanisms, complete closed policy/program admission, ordered interpretation, immutable registry and resource snapshots. May import foundation's public API; no host runtime, named core-rule callbacks or independent rule tables. |
| Luna C: bindings and qualification | `bindings/core/{python,node,wasm}/**`; `python/src/umf/**` compatibility glue; Python build metadata/hooks; `scripts/rust-core/**`; `tests/rust-core/**`; `python/tests/test_rust_core.py` | Own host admission/callback/loading glue, installed `umf-core` candidate and Node/Bun packages, distributed browser WASM and shared differential/frozen-vector harness. No semantic evaluator in wrappers. |
| Root integration | `scripts/metamodel/{build,structural}.ts`; boundary/CI/package commands; generated canonical outputs; governed execution evidence | Replace model compilation with Rust results, retain only explicit pinned Ajv build backend, finalize manifest and check full inventory. Coordinate generated-file writes and no-write controls. |

A first commits compiling `Value`/`Utf16`, errors, context, ResourceSet and schema
interface stubs. Stubs MUST return explicit unimplemented errors and never passing
validation. B and C then implement against those public types; A owns shared
Cargo/lib wiring, and others request dependency/export changes. B's compiler
program/policy checks are reusable from A; A's schema gate is reused by B's
registry. Tests use the shared API rather than accessing another module's private
representation. Integration is dependency-ordered even when source work overlaps.

Production resources are owned admitted snapshots. Authored definitions and
program/domain policy remain the only model-rule authority. The compiler emits
current schemas, data and host types; a pinned Ajv build backend may generate the
legacy standalone artifact in the Bun assembler. Native Rust compile commands
operate without Node/Bun/Python. Do not package the TypeScript compiler/kernel as
an executable fallback. Provenance changes are intentional and truthful; fixed
point compares the new source cohort with itself, while predecessor parity checks
schema/rule/type meaning and freezes only explicitly approved byte differences.

Implement the structural evaluator over owned values, with deterministic indexed
or ordered lookup rather than the R1 entropy-dependent jsonschema stack. Enforce
all existing core/registry/consumer schema dialect and keyword behavior before
claiming compatibility. Reuse schema-neutral grammar/canonical equality, not
handwritten current Field/Record/property rules. Preserve regex syntax, UTF-16
behavior and diagnostic order against the frozen current corpus. The production
core dependency closure must exclude platform entropy and host APIs; the R1-only
exception does not apply to `umf-core`.

The initial YAML candidate is `saphyr-parser`'s YAML 1.2 event/span API, allowing
explicit tag/alias/directive/key checks before constructing values. The regex
candidate is `regress` with its UTF-16/UCS-2 interfaces; its lack of a linear-time
guarantee is a resource risk, not permission to change patterns or acceptance.
Candidate documentation establishes mechanism only: [parser source](https://github.com/saphyr-rs/saphyr-parser)
and [regex source](https://github.com/ridiculousfish/regress). Pin versions only
after native/WASM execution and source/dependency review. Preserve lexical scalar
spelling for exact numeric admission. YAML lone-surrogate handling and formatting,
ECMAScript number formatting, regex catastrophic backtracking and cross-host
structural error order require measured controls; a failed candidate remains an
open implementation gate instead of authorizing an undocumented refusal.

JSON pretty serialization and compiler output bytes preserve contracted values,
ordering, escaping and number formatting. YAML serialization must recover the
same admitted content and numeric meaning; CONTRACT-001 does not promise comments
or layout. Any output-byte change consumed by a receipt/hash must be reviewed and
versioned at that consuming boundary rather than silently reusing its identity.

Keep public operations synchronous after native module load or explicit browser
initialization. Python retains Pydantic shapes and typed exceptions/results as
presentation over Rust execution. JS rejects getters/prototypes/hidden/symbol/sparse
properties without invocation; Python admits only its existing plain-container
profile or controlled public model conversion. Copies, original source callback
context and exception text/ordering must survive bindings. Reentrant calls own
separate budgets and data. Callback execution is trusted, not sandboxed.

The minimum locally executed candidate cohort is Darwin arm64, CPython 3.11,
Node/Bun and real Chromium using pinned R1-proved mechanisms, with fresh source
qualification. It is not a platform-compatibility claim: existing Python >=3.11
and consumer typing commitments remain gates for supported distribution targets.
Linux/macOS CI coverage must be reconciled with current installed `umf-core`
obligations; other Python versions, libc/CPU/Windows/PyPy/free-threaded support
remain explicitly unqualified until executed. No publication is part of R2.

Cost and performance are unknown. Measure a representative exact-admission plus
one complete constraint/literal family before extrapolating the remaining work;
record available token/elapsed metrics and metering limits. No representative
family can close R2 by itself. The complete test/program/policy/compiler/binding
surface and unresolved failures remain visible until all R2 acceptance passes.


Initial binding tool pins retain Rust 1.90.0, PyO3 0.23.5, napi 2.16.17 with
napi8/napi-derive 2.16.13, and wasm-bindgen 0.2.100/js-sys 0.3.77 from the executed
R1 cohort. Python's candidate uses `abi3-py311` so the candidate wheel does not
silently change `requires-python >=3.11` into a CPython-3.11-only distribution;
this stable-ABI mechanism must be executed on the installed Python versions and
hosted Linux before support is claimed. A dependency upgrade required by actual
compatibility is reviewed/pinned with fresh evidence. Do not bypass an unsupported
interpreter check or infer free-threaded/PyPy support. The source-build and wheel
inventories include all resources, licenses, build scripts and runtime loading
inputs; installed tests run outside the checkout with no executable fallback.


### R2 expanded compatibility findings

Sol's review separated Python regex semantics from strict keyword admission. The
selected implementation is a Rust-owned Python pattern parser and heap-based
matcher over code points, with explicitly versioned CPython Unicode/grammar data;
ECMAScript Unicode matching remains a distinct profile. Grammar, classes, flags,
backreferences, conditionals, lookarounds and raw-surrogate behavior require frozen
independent CPython controls. The Python boundary's astral-scalar versus explicit
surrogate-pair distinction is unresolved and must be reviewed before qualification.

Consumer metaschema admission uses pinned third-party metaschema data and the same
generic Rust evaluator. It must match the six dialects and the predecessor's
local-reference guard, rather than adding another handwritten keyword-policy
table in a host wrapper. Native registry compatibility obtains the current core
version from its supplied package resource, and Python registrations pass their
explicit consumer regex/profile choice.

The source closure includes embedded schema/Unicode data and their licenses as
well as Rust modules and Cargo inputs. Cache and output provenance hash exact
bytes; a clean build cannot depend on undeclared temporary data or an existing
mutable executable. Installed qualification includes the wheel rebuilt offline
from its sdist and npm-packed addons outside the checkout. No final support claim
is established by the implementation decisions alone.


The production YAML mechanism is the reviewed saphyr-parser 0.1.0 vendor patch
in `crates/umf-core/vendor/saphyr-parser`, governed by
R2-SOL-YAML-PARSER-PROFILE-001. Default and Python adapters share one event/parser
kernel with explicit immutable scanner profiles. The Python profile models native
line-break classification separately from marker advancement; preprocessing NEL
into spaces or newlines cannot preserve the native contextual behavior. Scalar
key admission retains resolver identity before value flattening. The vendor sits
inside the existing recursive compiler/source-build closure, including hidden
license files; it is not an additional runtime or wrapper implementation.
