---
ddx:
  id: umf.plan.rust-migration
  type: implementation-plan
  activity: build
  authoring:
    home: repo
  links:
    - id: umf.prd
      kind: informed_by
    - id: umf.cross-cutting-requirements
      kind: informed_by
    - id: umf.architecture
      kind: informed_by
    - id: ADR-006
      kind: informed_by
    - id: ADR-004
      kind: references
    - id: ADR-005
      kind: references
    - id: CONTRACT-080
      kind: references
    - id: TP-001
      kind: informed_by
    - id: umf.implementation-plan
      kind: references
---

# Shared Rust implementation and V8 removal plan

## Scope

Move UMF-owned shared executable semantics to Rust. Deliver one Rust engine as a
native CLI, Python bindings, Node/Bun bindings and browser WASM. First remove V8
from the complete Python generator operation surface; then finish the broader
single-source migration. Neither milestone implies new native semantic support.
The owner authorizes R0–R2 in this worktree, with Sol planning/review and Luna
implementation in parallel. R2 includes resolving production interfaces/resources,
implementation, tests, review, main integration and the PR creation and merge. R3–R8
and package publication remain separate actions.

Governing artifacts: [ADR-006](../02-design/adr/ADR-006-shared-rust-implementation.md),
[PRD](../01-frame/prd.md), [cross-cutting requirements](../01-frame/cross-cutting-requirements.md),
[architecture](../02-design/architecture.md), [TP-001](../03-test/test-plan.md),
CONTRACT-001 through CONTRACT-011 (fidelity and native boundaries), ADR-004
(stdlib generated access), ADR-005 / CONTRACT-080 / TD-091 / STP-091 (metamodel
authority), CONTRACT-067 through CONTRACT-075 (existing compiler/access boundaries),
CONTRACT-079 (unified access), and CONTRACT-081 (table lifecycle). Before porting a family, read its current
contract, design, tests and execution record, including amendments. Older
implementation-plan evidence remains scoped to the artifacts it actually tested.

### R2 current status

R2 implementation and qualification are complete for the production core and
metamodel compiler. The six hosted Ubuntu/macOS × CPython 3.11.17/3.12.15/3.13.16
cohorts pass at reviewed source `06b108a03cb86c1786afead2ced7d32af55a7f14`,
closure `2896e4e122cad5e2fde4b4ef04789fddfddb350e8fb054c3a5bc57ed2c83c1cd`.
The [CI receipt index](evidence/rust-migration/r2/ci-production-qualification/index.json)
preserves job/artifact identities, original receipt labels, hashes and support scope.
The local installed-artifact receipt at `475b5d3d6b722ab73a17f77410eddb91ce45e056`
remains a separate historical qualification. Both original and offline sdist-rebuilt
Python wheels, packed Node/Bun, empty-PATH Rust CLI and actual Chromium
default/feature WASM pass with zero mismatches. Native workspace: 214 tests;
compiler: 67 tests / 478 assertions and eleven-output fixed-point/no-write controls.

The [integration record](evidence/rust-migration/r2/integration.md) gives exact
source/artifact hashes, host versions, support subsets, sizes, benchmark and review
evidence. Independent Sol implementation and delivery reviews are retained there.
[PR43](https://github.com/DocumentDrivenDX/umf/pull/43) is the delivery record; all
required repository checks and reviewed merge remain the landing gate. Evidence
follow-ups must preserve the qualified source closure and must not relabel earlier
receipts as execution of a later commit. Earlier checkpoint notes below describe
states at capture and do not override final qualification.
Main is integrated through `53de049136c7e41b482d1a73665d031cd5fbaec6` (PR41);
refresh and incorporate later main work before merging. R3 is next after delivery.

CI also qualified the inventory repairs: exclude generated Python environments,
require a supported parser and refuse unparseable authored source. The 47 symbols
previously omitted by Python3.9 are restored; all authored and Rust source records
remain covered. Provision Rustfmt before package builds, and request plain Cargo
output when parsing dependency trees. These changes retain the exact R1 exception
and production host-dependency refusals; the Linux forced-color control and
hosted boundary gate pass.

The production boundary is a shared Rust core and metamodel compiler, a native
CLI, Python abi3 extension, Node/Bun native addon and browser WASM loader. Python
core execution uses Rust. The default TypeScript SDK remains its retained R7
reference, and `umf-codegen` still uses MiniRacer for seven operations until R3/R4.
Cooperative resource controls and trusted callbacks are explicit host capabilities;
HardIsolated refuses before work. Runtime text fields are metered without a private
4M ceiling; actual source/serialized text retains that ceiling. Ordinary trees and
independently admitted catalog resources retain their separate budgets.

Review expanded the original shared 139-vector gate with independent retained
runtime, Python consumer, six-dialect schema, regex and serializer corpora. Exact
scope, hashes and approved corrections belong to the R2 evidence directory.
Future slices must baseline their complete current operation surface and qualify
public raw-value entry points as well as installed wrappers. Late review also
requires trusted internal terminal provenance (host errors cannot be classified
by text), reached local-reference phase/order controls, and evaluator depth
qualification on ordinary native thread and actual WASM stacks. Annotation
collection is versioned: declared-key/item marking and validity predicates must
follow the native collector phase, with correction-001
[amendment](evidence/rust-migration/r2/approved-python-schema-2019-ap-correction.json)
explicitly selecting the same-defect 2019 additional-property rule. Native
fixtures remain immutable; exact target selection belongs in the evidence gate.

### Historical starting inventory (R0)

The initial R0 inspection found no first-party Cargo manifest outside fixtures/evidence.
The table records that starting point; the R2 production crates and expanded
seven-operation generator debt are recorded below and in the live R2 inventory.

| Surface | Current implementation / evidence | Migration obligation |
| --- | --- | --- |
| `python/umf_codegen` | `mini-racer==0.14.1`; `_embedded.py` loads `_assets/generator.js.gz` and verifies its manifest/V8 version | Replace all five dispatch operations: generation, deployment compilation/verification, migration compilation/verification; preserve generate/check writer behavior |
| `scripts/codegen/entry.ts`, `scripts/build-codegen.ts` | Bundles `src/access`, `src/table-deployment`, `src/table-migration` and transitive imports | Census the actual dependency closure; deleting only the generation entry leaves embedded behavior behind |
| `python/src/umf` | Pydantic shapes, jsonschema, ruamel.yaml, generated resources, Python constraint/literal kernels; no declared V8 dependency | Keep public Python ergonomics; replace shared semantic execution with Rust, remove duplicate kernels after parity |
| `python/umf_access` | Python DSL, catalog/build, codecs, native driver integrations and unified binding/runtime; no declared V8 dependency | Classify each module into shared algorithm, generated client, host glue, compatibility surface or inert evidence; move shared algorithms, retain explicit host integration |
| `src/{model,validation,registry,core-ideals,extensions}` | TypeScript engine, generated model data, supplied trusted callbacks | Rust core and explicit trusted capability boundary |
| `src/{access,compilation,table-deployment,table-migration,domain-packs}` | Portable generation, admission, IR, emission, hashing, planning and pack tooling | Rust-owned portable algorithms and Rust CLI; preserve Weft SQL ownership |
| `src/{adapters,projections}` | Broad native profiles, browser WASM integrations and JS dependency behavior | Per-family port and independent native replay; no generic parser substitution claim |
| `scripts/metamodel`, generated reference consumers | Authored metamodel compilation, deterministic generated artifacts and static/browser consumers | Rust model compiler; same inert authority; UI stays host code, shared model/reference computation moves |

Historical [Python generator evidence](evidence/praxis-p1/python-codegen.json)
records 16 original cases, writer/integrity controls and hosted Linux/macOS checks.
It explicitly qualifies a historical client-generator cohort, not the successor
deployment compiler. Re-run current operation coverage; do not promote those
results to Rust evidence. [Metamodel cutover](metamodel-authority-plan.md) and
[unified Python access](evidence/unified-python-access.md) are current integration
inputs. Reconcile their actual source state at R0 rather than replay retired core
versions as supported APIs. Historical fixtures remain usable as inert controls.

## Shared constraints

1. Preserve every unknown extension, native token, absence/null distinction,
   qualified identity and original source archive. Never gain semantic completeness
   just because a new implementation accepts a value. Keep strict/report residuals,
   unsafe-edit guards, exact version selection and copied-result isolation.
2. ADR-005 remains authority: one authored metamodel, deterministic derived schemas,
   shapes, constraints and domain policy. Rust adds no separate core rule tables.
   Replace the compiler and interpreters without changing their authority direction.
3. Separate ordinary envelope numeric admission from exact NativeJson tokens and
   typed integer/decimal/UUID/128-bit carriers. Do not route through binary64 or
   generic host-object serialization before exact admission. Preserve canonical
   bytes, hash preimages, array/member order and diagnostic ordering where contracted.
4. Match contracted text units and Unicode behavior. Rust UTF-8 strings, JavaScript
   UTF-16 strings and Python strings differ; test supplementary characters and lone
   surrogates. A naive Rust String/JSON conversion must not replace lossless code-unit
   transport. Choose an explicit lossless representation or version a documented
   refusal only through a reviewed contract change. Preserve YAML duplicate-key,
   alias/tag, scalar-profile and numeric-token rules; YAML library choice is a spike.
5. Registries accept separately installed trusted validators and explicit resources.
   Documents cannot load code or fetch references. Callback dispatch, exceptions,
   reentrancy and exact original source context must survive bindings. Expose missing
   capabilities as incomplete/refusal, never success by skipping validation.
6. The Rust library owns no ambient filesystem, network, process, clock or database
   state. CLI and host capabilities provide I/O. Weft owns SQL semantics; Truss,
   Ashlar and TableSpec retain their execution/storage/authorization responsibilities.
7. Python wheel and CLI execution require no JavaScript engine or subprocess.
   Generated Python clients remain stdlib-only and import neither the Rust extension
   nor `umf_codegen`. Boundary glue can remain Python/TS; semantic forks cannot.
8. Each claimed native/version/browser subset requires fresh execution against the
   migrated source. Retain expected refusals, disagreements, unimplemented profiles
   and temporal HELD qualification. Rust does not expand acceptance by itself.

## Implementation slices

| Slice | Area / governing authority | Depends on | Reviewable result and validation gate |
| --- | --- | --- | --- |
| R0 | Baseline and boundary map; ADR-006, architecture, TP-001 | None | Machine-readable public operation/export/dependency census across TS/Python, generated CLI commands and active tool algorithms; classify every module and upstream dependency. Freeze current positive/negative vectors, all five codegen operations, exact bytes/hashes and native evidence identities. Establish proposed boundary checker before semantic ports. |
| R1 | Representation and binding spike; CONTRACT-001/080, ADR-004/006 | R0 | Minimal Rust native/Python/Node/Bun/browser vertical slice: lossless source-code-unit transport, current generated-schema structural model admission and a dynamically emitted Key-class block compared byte-for-byte with the current TypeScript generator. Semantic validation remains incomplete; full package generation remains R3. Freeze the experimental request/capability protocol and per-slice test allocations. Exercise unknowns, Unicode, numerics, callback errors, cancellation and installed packages. Select/pin tools, supported platforms and ABI; record rejected options. No broad rewrite until this passes. |
| R2 | Core model/compiler/kernel; ADR-005, CONTRACT-080, TD-091, STP-091 | R1 | Rust metamodel compiler, structural admission, exact literal/constraint kernels, serialization, registry, copying and diagnostics. Self-validation and byte-identical regeneration; frozen vectors, rule mutations and Rust/Python/Node/Bun/Chromium parity. Installed `umf-core` compatibility, including consumer-supplied extensions. |
| R3 | Generators and portable plans; CONTRACT-067/068/079/081 | R2 | Rust current access/API-description generator, compiler IR/emission/bundle hashing and deployment/migration compiler/verifier closure. All seven currently embedded operations match frozen outputs/refusals (the original five plus PR41 change discovery and row-scope normalization); unchanged generated clients type-check under pinned mypy/pyright/ty and run table/ontology calls. Writer fault/path/drift/atomicity checks pass. |
| R4 | V8-free Python and native CLI cutover; ADR-006, TP-001 | R3 | Installed native wheels for `umf-core` and `umf-codegen`, preserving names/public functions and CLI generate/check behavior; Rust CLI exposes qualified portable operations and verifiers. Remove MiniRacer, embedded JS payload/runtime loading, obsolete V8 package/build paths and transitive engine dependencies. Fresh offline runtime tests with JS runtimes unavailable; inspect wheel dependency and binary closure. Milestone A below. |
| R5 | Remaining shared operations; CONTRACT-001–011 and each current family contract/test plan | R2; R4 before broad cutover | Port model operations, core ideals, extensions/actions/security, domain-pack algorithms, adapters and projections in bounded dependency order. For each family: fixtures, loss reports, unknown guards, both recovery directions, independent native oracles, browser/native/wrapper parity and removal of old semantic implementation. Each family is separately reviewable; unresolved families stay visible in the census. |
| R6 | Python access and consumer bridges; ADR-004, CONTRACT-067–075/079, current consumer contracts | R3; relevant R5 families | Move remaining UMF-owned shared request/codec/planner/checking algorithms into Rust. Thin Python drivers/session/async/transport glue retains host ownership; generated client stays stdlib-only. Replay genuine installed native PostgreSQL/Weft/Truss/Ashlar/TableSpec integrations for changed paths, including cancellation, transactions, authorization and exact results. Preserve unrelated held/unsupported scopes. |
| R7 | Default JS/browser and tooling retirement; ADR-005/006, CONTRACT-077/080 | R5, R6 | Node and Bun default to the qualified Rust binding; browser defaults to same Rust engine in WASM. Port remaining shared metamodel/reference/pack/build computation, keep UI and test harness glue. Complete export/module/dependency retirement census, no shipped fallback engine, no duplicated semantic kernels. Consumer and browser journeys pass with packaged artifacts. |
| R8 | Integrated qualification and release preparation; TP-001 | R4–R7 | Full regression and required native corpus from one captured source cohort, clean builds, installed wheels/npm/CLI/WASM, current docs/reference/examples/notices and independent review. Produce release artifacts and hashes; actual publication/deployment requires separate authorization. Milestone B below. |

The migration command `bun run check:rust-boundaries` is implemented and wired
locally, in pre-commit and CI. R2 extends it for production crate/binding ownership
and successor generated provenance; it complements `check:access-boundaries`,
`check:core-authority` and `check:unified-client-boundaries`. The R0/R1 captures
remain historical source-bound evidence; new R2 captures identify their own inputs.

It checks the Cargo dependency graph and cross-language imports, core-to-host
cycles/private access, forbidden JS engines/subprocess fallbacks, generated
provenance and obsolete kernel imports. Include allowed and forbidden import
controls. Existing violations need individual dispositions; blanket exclusions of
all Python, adapters or fixtures cannot close the census. Semantic review still
checks for rule duplication, unsafe conversions and consumer authority bypass.

R5 ordering: representation-only adapters and their dependencies first; JSON
Schema validation before its projections; Protobuf descriptor/source boundaries
before JSON Schema-to-Protobuf; Avro before its projections; GraphQL before input
projection; OpenAPI after schema/resource resolution. Then proceed through the
remaining adapter graph. R0 must enumerate every exported operation, including
unexported algorithms reached by active scripts; these examples do not limit scope.

## Validation plan

Use three independent comparisons: contract-derived frozen expected vectors,
old/new differential results, and native oracles. Differential equality alone can
preserve an old bug. Classify every mismatch as a Rust defect, an intentional
versioned correction, or an unresolved dependency/capability; never regenerate
expected results to hide it. New interpretation beyond the old profile requires
its own qualification and support statement.

- Native Rust unit/integration tests and WASM-target compilation; retain Bun
  regression and strict TypeScript checks for wrappers/clients/UI. Real Chromium
  executes the distributed WASM artifact without host globals or external requests.
- Core tests cover invalid structure before semantics, unknown fields/opcodes,
  empty/untaken program branches, original-source callbacks, duplicate keys,
  safe integer boundaries, exact decimal tokens, negative zero, non-finite values,
  UUID/128-bit, Unicode/code-unit limits, hostile JS getters/prototypes and
  Python custom containers. Validate before host conversions can erase evidence.
- Preserve error codes, paths, ordered diagnostics, `valid`/`complete`, residuals,
  source recovery and returned copy behavior. Freeze canonicalization, generated
  file bytes and receipt/digest preimages. Version any intentional byte change and
  replay downstream verifiers instead of silently reusing old receipt identities.
- Exercise installed packages, sdist-to-wheel builds, missing/incorrect native
  binary diagnostics, no-install-time downloads and offline runtime operation.
  A wheel install from a prepared wheelhouse must not need a Rust toolchain;
  source builds may require a pinned Rust build toolchain, never a JS engine.
- Preserve current API names, Pydantic-compatible surfaces where still supported,
  typing/stubs, generator CLI exit codes, non-writing check mode, writer recovery,
  deadlines, capacity errors and no partial successful output. Memory safety alone
  does not replace MiniRacer's hard deadline/memory isolation. Prove deterministic
  work budgets plus cooperative cancellation; use a bounded Rust worker process
  where hard termination is needed. No unsafe thread termination.
- Native qualification follows each current family contract. Include both
  native→UMF→native and ideal→native→ideal where applicable, without giving a
  target-only reimport hidden source metadata. Rust-backed engines and JS WASM
  builds must not serve as their own independent native oracle.
- Capture exact Rust/tool/dependency/runtime/OS/architecture versions and source
  hashes. Measure artifact size, cold start, throughput, peak memory and per-call
  binding overhead on the same workload. Budgets remain unknown until R0/R1;
  do not promise performance or a universal platform matrix in advance.

### Milestone A: Python packages have no V8 requirement

All active Python package imports, public operations and CLI entrypoints work
without a JS engine, including all seven current `umf_codegen` dispatch operations
(the original five plus change discovery and row-scope normalization). New
wheels contain neither MiniRacer nor embedded generator JS; dependency/binary
inspection and clean installed execution confirm that. Generated clients remain
stdlib-only. Rust CLI runs its qualified operations on a machine/container without
Python, Node or Bun. R4 may finish before the adapter migration; it does not
establish that all of UMF is single-sourced in Rust.

### Milestone B: shared executable semantics are Rust-owned

Every active algorithm in the R0 census has a Rust owner, generated-data owner or
explicit thin host boundary. No active TS/Python semantic implementation or JS
engine fallback remains. The native CLI, Python, Node, Bun and real browser expose
their declared qualified operation matrix from the same Rust source/model cohort.
All retained differences are explicit host capabilities, rather than undeclared
loss of an existing operation. Every required migration slice and regression gate
passes; consumer execution qualifications remain separate and truthful.

## R0/R1 scope refinements

Sol's initial review requires actual current implementation controls. The R1
structural validator consumes generated `spec/core/schema.json` with external
retrieval disabled. It compares structural acceptance, not exact native-library
diagnostics or complete core semantics. The generated-result proof is the current
Python generator's Key-class block for a bounded required-scalar Key; model-specific
names/types/order must change the output correctly. It is not a port of the full
package generator, deployment compiler or migration verifier.

Raw source transport and interpreted source are distinct. A `sourceUnits` array
retains exact UTF-16 code units, including lone surrogates and duplicate-key text,
without interpreting them. Structural/generation requests must establish
source/model correspondence and refuse unsupported input rather than silently
normalize it. Native/host string admission, trusted callbacks entering Rust,
callback failures/reentrancy and host-polled cancellation are explicit spike gates.
Injected cancellation-at-step controls do not establish external interruptibility.

## Risks and rollbacks

| Risk | Response and gate | Rollback |
| --- | --- | --- |
| JS-centric libraries have no proven Rust equivalent | R0 dependency dispositions and R1 feasibility probes; specifically Ajv/yaml, GraphQL.js, avsc, TypeSpec, N3, patched jsonld, SHACL, Arrow and native/WASM parsers. Preserve dialect, regex, URI, rounding and patch-specific behavior. R5 cannot close with an omitted family. | Keep that family on the prior qualified distribution until a replacement passes; do not claim Milestone B. |
| Pure Rust CLI conflicts with upstream compiler dependencies | Qualify the default CLI engine without language runtimes. Inventory optional compiler capabilities such as Go-based Protobuf WASM and JS TypeSpec. A Rust host of a non-Rust compiler is an explicit external capability, not proof of a fully Rust implementation. Replace required JS paths; unresolved complete compiler parity is a named blocker. | Retain prior version as a separate historical tool; no hidden JS launch or “complete native CLI” claim. |
| New parser or numeric model changes acceptance/hash meaning | Frozen lexical/semantic vectors, independent parser/oracle checks and exact preimages before cutover. Host admission rejects unsafe conversion. | Revert the family/package release together with matching data/resources; never rewrite user documents automatically. |
| Callback, async or driver behavior crosses ownership | Capability APIs and driver/thread affinity; cancellation/commit/rollback/reentrancy tests in R1/R6. Rust core cannot authenticate callers or touch engine storage. | Revert the complete bridge cohort; preserve durable state and original receipt formats. |
| ABI/platform/load behavior breaks installed users | R1 selects a real wheel/npm/CLI target matrix from consumer needs. PyO3 limited-ABI choice, free-threaded builds, PyPy, Linux libc and Windows are explicit qualifications. | Keep prior package pins available; unsupported native targets fail clearly with no JS fallback. |
| Browser loading alters synchronous APIs or safety limits | Test WASM initialization, workers/bundlers, byte/code-unit transport and hard budget enforcement. Freeze explicit initialization or an API version change before rollout. | Revert the JS/WASM release cohort; keep one engine owner per published version. |
| Port deletes source evidence or licenses | Separate inert historical archives from distribution inputs; regenerate dependency notices and license inventory. | Restore immutable evidence; no renaming old results as Rust qualification. |

Initial candidate tooling references, checked against official documentation on
2026-10-21 (the executed R1 versions are recorded below):
[PyO3 distribution](https://pyo3.rs/v0.29.3/building-and-distribution.html) and
[maturin bindings](https://www.maturin.rs/bindings.html) for Python;
[napi-rs compatibility](https://napi.rs/docs/more/support-compatibility) for native
Node/Bun; [wasm-bindgen string transport](https://wasm-bindgen.github.io/wasm-bindgen/reference/types/string.html)
for browser bindings. These document mechanisms, not UMF qualification. In
particular, upstream napi-rs Bun testing does not establish blocking Bun support;
UMF must test it independently. UTF-8/UTF-16 conversion needs explicit treatment.
R1 pins come from its executed lockfiles and artifact receipt, not inferred
compatibility with a different documentation release.

## Execution contract

Execute R0–R8 only after implementation authorization, in dependency order, through
their gates. Scope includes ordinary debugging and relevant canonical documentation;
publication, production deployment, external messages and consumer-repository
semantic changes are separately authorized. One plan is sufficient; no tracker is selected. For R0–R2 the owner selects
Sol for planning/review and Luna agents for implementation, using parallel work
where file ownership and dependencies permit it.

Comparable token/throughput evidence is unavailable; total migration cost and
elapsed time are unknown. The owner authorizes R0/R1 as a measured probe. Retain the provisional
50,000-total-token accounting ceiling for that probe, including review and
verification across the collaborating agents. This is a proposed accounting limit,
not a runtime-enforced budget. Record available usage at the existing slice
checkpoints; if metering is unavailable say so. Estimate the remainder from that
probe before undertaking R2–R8; do not silently increase a spending limit or weaken
gates. No dates, speedup or package-size promises are made.

## Continuation evidence

R0/R1 executed in the managed `rust-binding-spike` worktree on
`codex/rust-binding-spike`. Sol planned and independently reviewed the slices;
Luna agents implemented the census/boundary gate, Rust engine/bindings and installed
package/browser harness in parallel. At that checkpoint R2–R8 remained unexecuted. Aggregate runtime
agent-token metering was unavailable; neither an enforced ceiling nor a measured
whole-migration cost is claimed.

The [R0 packet](evidence/rust-migration/r0/README.md) contains 556 source modules,
2,831 first-party code/script files (230 active scripts), 9,471 algorithm symbols,
244 dispositioned JavaScript packages and 11 Python direct declarations with three
candidate resolver snapshots. No activation root or source-module disposition is
unresolved. The final inventory/boundary command passes with zero findings, eight
boundary controls and four census controls. The original five bridge operations have
73 captured vectors: 46 accepted and 27 refused. The source-built bundle matches
the checked-in compressed payload. This is Bun execution of that exact payload,
not a new MiniRacer/native-runtime qualification. Python resolver snapshots retain
selected transitive versions and artifact hashes; they do not create project locks
or establish installed production-package support.

The [R1 packet](evidence/rust-migration/r1/README.md) and its
[hash-bound receipt](evidence/rust-migration/r1/measurements.json) record the native
CLI, offline-installed CPython wheel, offline-installed npm addon under Node/Bun,
and real Chromium WASM cohort. Five Rust regression tests and the five-frontend
cohort pass. Chromium records zero external requests, three independent contexts
with identical generated output/validity, and readable missing-Crypto refusal
before invoking the loader. Actual unpaired UTF-16 code units survive raw transport
and callbacks; interpreted JSON refuses them explicitly. Callback success,
exception, reentry and cooperative cancellation exercise actual Rust capabilities.

Executed tools: Rust/Cargo 1.90.0, PyO3 0.23.5, maturin 1.9.6, napi-rs 2.16.17
(`napi8` build feature), wasm-bindgen 0.2.100, CPython 3.11.17, Node 26.12.0,
Bun 1.4.3 and Chromium 153.0.8010.12 on Darwin arm64. Runtime-reported N-API
support is not an additional tested ABI matrix. The wheel is CPython-3.11-specific;
abi3/free-threaded/PyPy and other OS/architecture cohorts remain open.

Sol's actionable findings were corrected: successful Python callbacks reaching
budgeted operations; structural admission before generation; exact supported
name behavior and conservative refusal of unsupported names; dependency-version
merging and proper Python TOML parsing. Package replay now checks an exact four-file
npm archive and cannot nest a prior tarball. The receipt measures actual artifact
sizes, cold start and sample throughput/RSS; measurements primarily cover
`source-roundtrip` and are not a forecast for the full UMF engine.

### Binding decisions and remaining migration work

- Native Python/Node bindings and browser WASM are feasible for this bounded
  cohort. Rust operations are shared; wrappers handle loading, typed source-unit
  transport, callbacks and clocks. The production packages still use their
  existing implementations, including MiniRacer in `umf-codegen`.
- The WASM schema validator requires platform entropy through the exact
  `jsonschema 0.29.1 → ahash 0.8.12 → getrandom 0.3.4 → wasm-bindgen 0.2.100`
  chain. Sol accepted a target-, path-, feature- and source-hash-pinned R1 exception
  with browser Crypto preflight. It preserves randomized hashing and all other
  host-import prohibitions. Native and browser dependency claims remain separate;
  this is not unconditional host-free WASM or approval of that R2 dependency choice.
- Structural schema validation deliberately reports `complete:false`; it does
  not implement the authored semantic constraint program or native adapters.
  Generation covers a decorated Key-class block for the documented narrow Record
  subset. Unsupported/unknown selected meanings and ambiguous normalization refuse.
  The complete client/deployment/migration operations remain R3/R4 work.
- Work budgets, host-polled cancellation and supplied clocks are proven. Hard
  memory ceilings, preemption of an active parser/validator, async cancellation
  and worker isolation remain required production design/qualification work.
  Trusted callback execution itself is not sandboxed.
- Before R2 implementation, freeze the production Rust compiler/kernel and exact
  admission/callback/resource contracts, decide the validator/entropy boundary,
  select the required wheel/npm/CLI/browser target matrix, and estimate R2 from a
  measured representative port. R1 has no comparable full-port token estimate.
  Retain schema/diagnostic/hash/native evidence requirements unchanged.

R0/R1 closeout is complete for the qualified scope: final inventory/boundary
freshness passes, source/artifact hashes match, and Sol's implementation findings
and final capture requests are resolved. The existing access-boundary gate also
passes (nine TypeScript files and 81 Python modules, zero violations). No complete
production/native compatibility corpus was replayed for this experimental slice.
Neither Milestone A nor Milestone B is complete.
R2 is now authorized. Sol reviewed and completed its production interface/resource
freeze in CONTRACT-080/TD-091/STP-091 before the parallel implementation began. The working branch is kept
current with main at integration checkpoints; preserve other agents' work and
replay affected tests when the source cohort changes. No production package
publication is authorized by this slice.

## Exit criteria

Plan readiness requires coherent authority, bounded ordered slices, explicit
open decisions and attached validation. It does not require pretending that an
unrun spike established feasibility. R1 must freeze exact binding interfaces and
platforms, and R0 must produce the complete operation/dependency matrix before
broader execution is ready.

Implementation completion requires Milestones A and B, passing R0–R8 gates,
closed retirement census, fresh source-bound native/browser/installed evidence,
updated consumer-facing documentation and review. Release publication and native
claims outside the tested matrix remain separate. No incomplete adapter or
consumer gate is closed by the language migration.

## R2 execution and continuation

The owner selects the same worktree and an active runtime goal through tested,
reviewed integration and PR/merge. R0/R1 was checkpointed before merging current
main; append-only requirement/test/plan conflicts preserved both workstreams.
Sol owns production interface/resource decisions and independent review. Luna
preparation is read-only until that freeze; implementation then uses three
disjoint shards for foundation/compiler, literal/program/registry, and production
bindings/installed conformance. Root owns integration, plan/evidence reconciliation
and Git/PR operations.

No additional R2 token ceiling was specified. The R0/R1 provisional accounting
limit does not describe R2. Comparable full-port usage is unavailable; use the
active goal's available metering at implementation checkpoints and retain honest
limits on agent-wide accounting. Estimate remaining work from actual port/test
results; no calendar, performance or monetary promise is made.

The production freeze and implementation are complete. Rust owns nine portable
compiler outputs; the Bun assembler adds the pinned Ajv standalone backend and
final manifest, eleven total. The synchronous TypeScript build APIs delegate to
native Rust. Cooperative limits, closed private wire, explicit immutable resources
and trusted host callback tokens are qualified; HardIsolated refuses before work.
Production core/compiler closures have no R1 entropy exception.

The [production-host receipt](evidence/rust-migration/r2/production-host-qualification.json)
binds 439 files to the clean `7c2842dd6` source and records every installed host
and both wheel paths. Its archive audit covers 443 members and a verified offline
rebuild without JavaScript. Independent native/predecessor and mutation controls,
source-bound compilation, actual browser probes and boundary checks supply the
remaining R2 evidence. Final independent Sol review approves that implementation
and local qualification. PR CI/merge govern delivery; no publication or later
family cutover is implied.

The following dated checkpoints retain implementation history. Current source,
qualification and support claims are defined by the status above and the final
integration record.

### R2 review checkpoint — 2026-10-21

Sol has not approved R2. Its second review found YAML surrogate and numeric
profile defects, unmetered runtime copies, dialect-sensitive schema behavior,
UTF-16 regex admission, wrapper overhead consuming semantic limits, callback
text narrowing, and incomplete installed-host/CI qualification. These are closure
requirements, not deferred migration slices. Compiler/YAML corrections now pass
49 Rust tests and 26 compiler/parity tests (209 assertions); remaining runtime
and binding fixes require a coherent rebuild and fresh independent review.

The compiler bridge now builds in its own target directory, retains an immutable
private executable with a checked digest, and attests the source closure before
and after the complete Rust/Ajv generation pass. Direct copied strings retain the
predecessor's unrestricted aggregate text size, with work charged before copies;
the 4M UTF-16 limit applies to source/serialized output. Transport limits must
account for protocol overhead separately and preserve valid depth-128 payloads.
A bounded iterative transport parser is required; serde recursion protection is
not disabled. Production binding capabilities must exercise cooperative metering,
mid-work cancellation, injected deadlines and reentry in installed artifacts.

The current upstream V8 bridge exposes seven operations. R3/R4 must independently
baseline and port the two PR41 additions as well as the historical five; R2 does
not remove MiniRacer from umf-codegen. Python consumer schema compatibility must
cover the predecessor's six declared dialects, with native versions and tested
keywords recorded explicitly. Completion still requires the entire R2 row, clean
installed wheel/sdist/npm/CLI/WASM evidence, Sol approval, and reviewed PR/merge.


### Native Python profile and final integration checkpoint

R2 now implements the Python consumer carrier and source/value serialization
profile inside the shared Rust evaluator/parser/writer. The native boundary
corpus expanded beyond the shared 139 cases: schema construction has 9,282
decisions across six dialects, instance validation has 4,995 pinned official
cases, and regex has 70,542 independently reviewed outcomes across three Python
profiles. Installed CPython 3.11 checks currently pass 197 public tests and all
schema/core comparisons. These intermediate results do not replace the final
committed-source artifact receipt or overall Sol review.

Native serializer review required exact Python code-point identity, safe-source
int/float identity, ruamel lexical scalar grammar and YAML character admission.
JSON read/write and YAML read preserve insertion order; YAML write recursively
sorts mappings by Python code-point lexical order. Frozen native observations
now total 1,872 (372 initial + 60 ordering + 852 scalar + 588 character), without
changing prior expectations. R2-SOL-CORRECTION-002 explicitly fixes the old YAML
writer's silent NEL loss by escaping U+0085; native raw-source normalization
remains unchanged. The existing schema annotation correction remains separately
guarded as R2-SOL-CORRECTION-001.

The retained TypeScript core suite passes 239 tests in 38 isolated processes
(9,682 assertions). Production Rust, compiler fixed point, metamodel browser,
TypeScript configurations and boundary controls passed at the latest integration
checkpoint. Sol still requires complete generic constraint behavior for typed
diagnostics, final Python character-profile verification, a committed source
checkpoint, fresh installed multi-host qualification and independent final
review. Main remains at PR41 after refresh. R3/R4 still own all seven V8 bridge
operations; no package publication or broad native adapter requalification is
claimed by R2.


The subsequent source-context corpus adds 522 native observations (2,394 total
serializer observations). It exposed ruamel's distinct scanner line-break and
reader-column behavior for NEL/LS/PS and implicit timestamp key identity. Sol
approved R2-SOL-YAML-PARSER-PROFILE-001 before implementation: a narrow source-pinned
saphyr-parser 0.1.0 vendor patch with immutable default/Python scan profiles, shared
by all native/WASM targets. The vendor lives under the existing attested core
closure, retains upstream identity/licenses and is included in offline sdists.
Source rewriting and blanket block-scalar rejection were rejected as incompatible.
The final gate also adds combined-resource CLI/WASM transport and missing-loader
controls, and native model/program/policy mutation tests. These remain closure
work until actual execution and independent review pass.


### Interpreter and direct Rust API lessons

The frozen retained-TypeScript operator comparison now includes 6,271 ordinary
cases and 2,619 edge cases, including 805 expected coercion refusals. Review found
that preserving only model-specific vectors was insufficient: generic Missing,
Map/container, numeric coercion, own `length`, and object-construction origins
are observable interpreter behavior. R2-SOL-RUNTIME-OBJECT-PROVENANCE-001 retains
private copied-versus-expression object origins without changing Value or wire
formats. The stable Rust coercion-error mapping is qualified separately from
JavaScript exception class/message identity. Native numeric coercion contributes
1,548 additional independent boundary observations.

Python serialization now has 5,226 frozen observations across its six native
profiles, including 48 reserved-directive tail controls. Shared scanner bulk-read
and buffered-input paths must implement the selected profile consistently; a
passing string-input path alone is insufficient. The vendor manifest disables
automatic upstream development-harness discovery while retaining its five
self-contained library unit tests; the workspace suite has executed successfully.

Direct Rust callers also need admission guarantees. Public raw-Value subsystem
entry points admit each input tree with the caller Context; crate-private
already-admitted paths preserve earlier engine admission and avoid charging
private wrappers against payload limits. Optional literal policies are validated
eagerly even if a program never calls a literal operator. Removing an unused
contextless resource snapshot helper prevents an unmetered public copy path.
Apply the same public/private boundary discipline to R3 families. These findings
are being closed before the final committed-source installed-host receipt and
overall Sol approval; intermediate passing checkpoints are not R2 completion.


### R2 compatibility and resource lessons for later slices

A matching validity corpus does not establish API compatibility. Python consumer
review additionally checks native integer/float origin, nonfinite arithmetic,
keyword order, first-error evaluation, deferred iterator exceptions, nested
sibling traversal and annotation work at its actual evaluation phase. Future
ports must baseline public methods and traversal behavior, not only a final
boolean or flattened diagnostic list. Keep independent predecessor fixtures
immutable and record approved target corrections separately.

Resource admission must precede raw evaluator allocations as well as normalized
engine output: snapshots, annotation/state copies, dynamic key comparisons,
error parameters and typed host projection all participate. Use separate
already-admitted internal helpers without imposing private text caps or charging
transport wrappers against payload budgets. Wide work totals/estimates and host
notification chunks must behave consistently on native and wasm32; actual
Chromium probes qualify that boundary. These cooperative controls do not imply
hard process isolation.

Native hash-set traversal is not a reproducible ordering contract. The reviewed
Python additional-properties correction chooses owned object insertion order for
that explicitly identified unordered branch, with seed evidence and exact target
controls. Other diagnostic and exception ordering remains an independent gate.
This lesson applies to R3's newly expanded seven-operation surface: freeze the
current full behavior and decide nondeterministic cases before implementing them.


Python resource identity needs its native codepoint representation throughout
resolution. A diagnostic UTF-16 projection can collapse an explicit surrogate
pair and an astral scalar, while replacement of invalid scalars loses accepted
resource identifiers. The private Rust URI representation therefore owns exact
u32 codepoints and applies existing ASCII URI structure operations directly;
immutable schema-node locators bind references and anchors. Diagnostic text never
feeds lookup. Legacy embedded IDs remain active except where a same-object
reference suppresses them, and trailing empty fragments remain valid. The frozen
scope, identity and named-anchor companions guard these boundaries across the
three qualified CPython profiles, including their absence of optional URI-format
validators. R3 must preserve this distinction wherever source text becomes an
identity key.


The first representative R2 native benchmark is source-bound to `2c8781dbe`: a
500-call complete-validation batch achieves 34.429 calls/s, with 2,703 constraint
steps per call; admission copying achieves 40,409.484 calls/s. Fresh-process wall
time including parsing and Engine setup is 154.972 ms for one validation; peak
RSS is 10,223,616 bytes (10,485,760 bytes for the batch process). Treat these as a
single local macOS arm64 workload, without cross-host or speedup extrapolation.
The [benchmark receipt](evidence/rust-migration/r2/native-admission-validation-benchmark.json)
records toolchain, source/resource hashes, limits, work totals and timing scopes.
Retained codegen assets require a provenance refresh after canonical generation;
this checkpoint proves their decompressed JavaScript changes only the compiler
SHA and keeps all seven MiniRacer operations visible for R3/R4.


Before a final all-host run, execute every installed comparator end to end in a
retained environment. Exact fixture hashes alone cannot validate a comparison
harness. Native receipts can use different lossless spellings for None or schema
paths; establish a typed comparison representation, preserve numeric-string keys
and raw codepoints, and keep qualified exception messages. Verify receipt fields
against their actual owners and retain malformed-input/identity controls. This
checkpoint's standalone original/rebuilt wheels pass all serializer, schema and
public tests after comparison-only repairs; frozen native expectations stay
immutable.
