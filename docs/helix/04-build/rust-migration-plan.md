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
The owner authorizes the complete R0–R8 port in this worktree, including
integration, testing, independent review, current-main reconciliation, PR/merge
and UMF package release. Sol owns planning/review and Luna implementation under
the existing allocation; reviewers must not approve their own changes. The
2026-10-23 continuation extends the earlier R0–R3 authorization. Historical
source-bound checkpoints retain their captured scope. Publication follows the
final release gates; consumer-repository semantic changes, external messages and
production deployment remain separately authorized.

Governing artifacts: [ADR-006](../02-design/adr/ADR-006-shared-rust-implementation.md),
[PRD](../01-frame/prd.md), [cross-cutting requirements](../01-frame/cross-cutting-requirements.md),
[architecture](../02-design/architecture.md), [TP-001](../03-test/test-plan.md),
CONTRACT-001 through CONTRACT-011 (fidelity and native boundaries), ADR-004
(stdlib generated access), ADR-005 / CONTRACT-080 / TD-091 / STP-091 (metamodel
authority), CONTRACT-067 through CONTRACT-075 (existing compiler/access boundaries),
CONTRACT-079 (unified access), and CONTRACT-081 (table lifecycle). Before porting a family, read its current
contract, design, tests and execution record, including amendments. Older
implementation-plan evidence remains scoped to the artifacts it actually tested.

### Completion status — 2026-10-28

The Rust port is incomplete. R0–R3 have their recorded reviewed and merged
checkpoints. R4 removed V8 from the authored Python production source boundary,
but its coordinated wheel/sdist release matrix is still a nonpublishing
candidate and needs a final source-coherent hosted receipt. R5 has growing
bounded opt-in Rust families and host bindings; it has not retired the broader
TypeScript engine. R6 consumer bridges, R7 default package build qualification
and complete tooling retirement, and R8 final integrated qualification remain
open. The source `package.json` selects the Rust V4 Node/browser entries for
synchronous `generatePythonClient` and retains TypeScript under `./reference`.
The prior fixed-point private SDK archives qualify only their captured subsets
and hosts. The current condition-aware ledger records 3,381 route-specific
declarations across 509 source files, 71 source-selected Rust declarations per
V4 default root, 920 logical executable default-route gaps, zero retired,
89 accepted opt-in Rust mappings, and 831 unmapped executable names. The inventory
records 2,543 Rust-candidate declarations, 216 host declarations, and 210 V4
entry declarations across both defaults. Four exact immutable
generated-data aliases are classified separately across 12 route rows. Three root-only SEC/Protobuf Rust
candidate exports account for the difference from the reference route; they
remain opt-in and add no retirement. The historical five-schema default-route
packet was verified for its captured private Darwin arm64 Node/Bun/Chromium
installed-route scope; it has source drift against this checkout and needs a
new current-source packet. Its receipt SHA-256 is
`1c192d0246a85c8c12de39b37b40e119026b692dade2db249e5aace2c689b19a`. The
current inventory SHA-256 is
`6031c1622a657c20fdbff9226bc2524968a622577c0f68bf4115d126d84401cc` and the
condition-aware ledger SHA-256 is
`d468cca284b9d709d397fe72832929ca48a88c9144b75681d28e4e6170e98692`. Linux,
complete production SDK parity, the full port, and release remain unqualified.
The ledger's `executable` label is a broad public-runtime category: independent
AST review of the 1,120-name reference root found 750 function declarations,
167 variable declarations, five class declarations and 198 JSON resource
exports. The [exact four-export vocabulary classification](evidence/rust-migration/r8-symbol-inventory/immutable-generated-vocabulary-20261028/README.md)
removes only frozen generated-data aliases from the executable denominator;
the version-gated function and behavior-bearing classes remain executable.
Other constants, aliases and structured public values still need individual
compatibility and authority review. Keep all 920 remaining executable names
in the retirement denominator until an evidence-backed per-row semantic,
host and data disposition is reviewed; do not subtract a category by naming
heuristic.
Draft [PR #61](https://github.com/DocumentDrivenDX/umf/pull/61) remains open;
no complete-port merge, tag or release has been cut from this worktree. The active goal remains all R4–R8
gates, independent review, current-main integration and a tested release.

After the earlier 2026-10-24 inventory snapshot, the default Node/browser
source entries selected two bounded CSV Boolean lexical operations and three
bounded core inspectors. Their frozen Bun and real-Chromium source-route
replays pass and are included in the newer inventory above. A prior private SDK archive stopped at a
harness count assertion that included a Key `getterCalls` metadata field; the
harness now excludes it, and a fresh source-coherent archive and installed
Node/Bun/Chromium replay are still required. Cardinality, facets and Core Keys
default binders still run TypeScript `copyJson` admission before Rust and thus
remain executable-retirement work despite their source-selected operations.
The earlier Core Key Tuple hold identified a tagged-byte ceiling below the
4,000,000-byte predecessor bound and a prepared route that revalidated rather
than retaining Rust diagnostics. A direct native/WASM byte and prepared-object
interface now source-selects both operations; its bounded installed Darwin
packet is recorded below. Complete retirement remains open.
The separate `verifyCoreKeyOperation` default route is still held: the generic
wire admits both receipt and current before Rust can reject a malformed
receipt, while its existing staged wrapper reruns full verification and the
current binder uses TypeScript JSON admission. Its frozen receipt-before-current
getter order and single recomputation require a Rust-owned staged verification
handle plus a reviewed host admission translation before source selection.

### R3 current status

R3 implementation, independent source review and local installed-artifact
qualification are complete. The [final validation index](evidence/rust-migration/r3/final-validation.json)
and [coherent host receipt](evidence/rust-migration/r3/production-host-qualification.json)
identify source closure `8dc238d2a285a25dc94941f8120b0bef22745a5ef1b815d74487e8a2e3ece03d`.
All 615 retained compiler cases in 102 packets match in six host cohorts: packed
Node 26.12.1, Bun 1.4.3, empty-PATH Rust CLI, real Chromium 153.0.8010.12 default
WASM, installed CPython 3.11.17 wheel and an offline wheel rebuilt from its
extracted sdist. The conformance-feature WASM separately passes the retained core
and 70,542 Python regex outcomes; it is not a second compiler corpus replay.
Rust 1.90.0 workspace testing passes 330 tests across 56 suites. Type checking,
resource/import boundaries, source inventory and metamodel fixed-point checks
pass. The [native consumer record](evidence/rust-migration/r3/final-native-consumer-checks.json)
chains exact final Rust-generated client bytes to positive/negative
mypy/pyright/ty results and three installed-runtime creation/codec scenarios.
Existing PostgreSQL 18.6/Weft observations remain scoped to their original exact
bytes, versions and subsets.

The complete source reread and repaired admission/data-flow census supersede the
earlier client approval; [final exact-source review](evidence/rust-migration/r3/sol-final-client-source-gates-review/final-source-review-renewal.json)
closes all 60 direct source failure sites and the native query family. Frozen
expectations were never refreshed to match Rust. Earlier checkpoints below
retain their captured scope and do not override this final qualification.

Production interfaces receive nine explicit immutable trusted resources and one
live per-operation Context. Stage-one IR stays private; full results, refusal
order, unknown-source content and generated bytes/hashes remain the boundary.
Source limits and aggregate result limits are separate. Unicode normalization
uses the retained Bun/Unicode tables, and repeated scans/copies reserve work
before growth. The narrow reviewed Env sharing repair preserves binding and Map
semantics while making the large migration fixture feasible; its timed result
remains a separately labeled checkpoint.

Required PR CI covers Ubuntu/macOS and CPython 3.11.17/3.12.15/3.13.16 with the
pinned toolchain. The pull request will record its checked head, current-main integration and
merge identity. Default TypeScript and Python generator cutover,
removal of MiniRacer, the higher-level native CLI cutover and package publication
remain R4 or later work; this change does not expand native semantic support.

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
[PR43](https://github.com/DocumentDrivenDX/umf/pull/43) is merged at
`f323a2dec16132c00eb1bc75c65c416f94804c26`. Required checks and independent
delivery review passed; reviewed head `bb1be4e69` and merged main have the same
tree `d2d96589c3191ba7c506350a307f345e993106ba`. Evidence
follow-ups must preserve the qualified source closure and must not relabel earlier
receipts as execution of a later commit. Earlier checkpoint notes below describe
states at capture and do not override final qualification.
The R3 starting worktree is current with that merged main. Root verified all
439 attested source blobs against main and the recorded closure above; this
integration check does not relabel earlier execution receipts. Refresh and
incorporate later main work before the R3 merge.

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
7. Python wheel and CLI execution require no JavaScript engine or external
   language-runtime fallback. The R4 Python codegen host may start only the
   `umf/_bin/umf` Rust executable from its exact pinned installed `umf-core`
   wheel. This is a scoped host capability, not a second semantic
   implementation: it must enforce the operation deadline, qualified Rust
   allocation boundary and termination/reaping, and cannot launch Node/Bun/V8
   or a replacement compiler. The standalone Rust CLI requires neither Python
   nor JS. The Python parent's transport admission and response decoding have
   separate bounded-input, deadline and memory-amplification qualifications.
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
| R8 | Integrated qualification and release preparation; TP-001 | R4–R7 | Full regression and required native corpus from one captured source cohort, clean builds, installed wheels/npm/CLI/WASM, current docs/reference/examples/notices and independent review. Produce reviewed release artifacts and hashes, then publish the authorized UMF release after its gates pass; production deployment remains separate. Milestone B below. |

The migration command `bun run check:rust-boundaries` is implemented and wired
locally, in pre-commit and CI. R2 extends it for production crate/binding ownership
and successor generated provenance; it complements `check:access-boundaries`,
`check:core-authority` and `check:unified-client-boundaries`. The R0/R1 captures
remain historical source-bound evidence; new R2 captures identify their own inputs.
During R5–R7 implementation the command validates a newly computed live census
without rewriting the immutable R4 census or boundary receipt. A new committed
source-bound census is still required at the final integration checkpoint.

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
Before the Rust port of CONTRACT-001 `selectCoreElements`, use the bounded
[TypeScript predecessor capture](evidence/rust-migration/r5-select-core-elements-predecessor-20261027/README.md)
as the Node/Bun/real-Chromium host-behavior gate. It freezes selected results,
Registry callback paths/order, host access/refusal behavior, cycles, and unknown
annotations; callback failures, full resource controls, and the full selection
test corpus still require separate qualification.

## R4–R8 continuation gates — 2026-10-23

These are required future gates, not completion evidence. Root owns integration
and release identity. Each slice supplies source-bound tests and independent
review before integration. Earlier receipts remain immutable historical evidence.

### Successor census before broad cutover

Capture current main in a new inventory without rewriting R0's historical census.
R0's five bridge entries do not describe R3's seven-operation surface. Enumerate
every public export, CLI command and algorithm reached by active scripts,
including additions since R0. Each row records source hash, activation path,
governing contract/test plan, Rust or generated-data owner, allowed thin host
boundary, dependent families, frozen controls, required host/native gates and
retirement of the old implementation. Reuse R3 coverage only by exact source
closure. No blanket Python/adapter/script exclusions close active rows. Broad
cutover and Milestone B require zero unresolved active rows.

### R4 distribution, resources and isolation

Compose `umf.rust_codegen.CodegenEngine` behind preserved `umf_codegen` public
functions, `GenerationError`, CLI and writer. Lazy initialization is permitted;
the operation deadline includes initialization and resource preparation. Preserve
admission, request limits, failure ordering, non-writing checks and atomicity.
Remove MiniRacer, embedded generator JS and obsolete payload build hooks from new
distributions; retain inert historical evidence.

Use the same nine explicit immutable trusted resources qualified in R3: core
schema, reference schema, package schema, constraints, domain policy, tables,
actions and both binding packages. Package them in wheel and sdist. A release
manifest binds each resource name to its SHA-256; release evidence binds the
model/source cohort. Documents and working-directory files cannot substitute
resources. The repository `spec/` source is canonical, and the core CLI and
codegen-wheel copies prove byte-identical derivation from it.

The native successor is `umf-core` 0.11.0, a fresh artifact distinct from published
pure 0.10.0. Pin the codegen dependency to this exact native cohort. Preserve the
legacy core identifier only within its existing meaning; add a separately checked
`codegen_protocol_version` for the R3/R4 operation/resource wire contract. The
release manifest records the expected protocol, nine resource hashes and native
artifact/source closure. A version string or method-presence test alone does not
prove protocol compatibility. Reject stale/missing binaries or mismatched resources
explicitly without fallback. The proposed codegen successor is 0.2.0; access
versions and registry channels remain open until their release gates.

Cooperative deadline polling alone does not preserve the old V8 hard execution
timeout and 512 MiB hard heap bound. The additive API explicitly refuses
`hard-isolated`. The R4 Python boundary therefore starts the exact installed
Rust CLI in a child process and enforces one monotonic deadline across admission,
capability check, execution and decode. It kills/reaps the child on timeout,
bounds request/response pipes and maps refusal, allocator capacity and unexpected
failure separately. The CLI's counting global allocator enforces 512 MiB of live
Rust-requested allocation bytes from process startup once codegen dispatch begins;
this does not bound process RSS, libc/allocator overhead, stack or the Python
parent. The parent preflights a 32 MiB compact JSON request before serialization
and caps wire output at 64 MiB, with deadline polling during value traversal.
Qualification must measure and record Python response decode amplification and
the remaining bounded parsing intervals. Neither bound is described as equivalent
to the former V8 heap limit. An unavailable profile must fail explicitly or
obtain a reviewed versioned contract change before claiming parity.

R4 closes after all seven public operations and CLI/verifiers pass in clean
installed wheels and an offline extracted-sdist rebuild with JS unavailable.
Inspect dependencies/binary closure; generated clients remain stdlib-only.
This establishes Milestone A, not the entire port.

The [R4 installed-artifact checkpoint](evidence/rust-migration/r4/README.md)
records all seven Python codegen operations through the bundled Rust CLI on
macOS arm64 CPython 3.11.17, with exact offline-built wheel hashes, installed
probe receipts, 206 core Python tests, resource/dependency inventories and a
measured Python JSON-decode amplification sample. Independent Sol review found
no P1/P2 in this bounded historical packaging checkpoint. Its successor census
contains 571 source modules and 136 unresolved rows. R5/R6 work began after
the checkpoint, so the packet deliberately does not bind the current moving
source tree to those earlier wheels. A clean rebuild, exact source/artifact
qualification and the broader hosted matrix remain required before R4 can be
counted as a final release-cohort or portable Milestone A gate.

After merging main at `7832e4e7`, the
[post-main local artifact supplement](evidence/rust-migration/r4/post-main-local-artifact-qualification.md)
replayed the historical 0.11.0/0.2.0 wheels on macOS arm64 CPython 3.11 and
3.14. The seven codegen operation probes and installed unit tests passed with
JavaScript runtimes unavailable; native Mach-O load commands and isolated imports
show no build-target dylib dependency. This is runtime evidence for the earlier
wheel hashes, not a source-to-wheel qualification of the merged branch. Core
document validation on Python 3.14 explicitly refused its unavailable regex
profile. A fresh offline extracted-sdist rebuild was blocked locally by the
missing pinned Hatchling backend. The hosted matrix, binary closure gate and
one frozen release-cohort rebuild remain open.

The R4 [binary-closure gate](../../../scripts/rust-migration/r4/check_binary_closure.py)
now inspects installed ELF and Mach-O load dependencies, follows bundled Mach-O
libraries, and refuses external or unresolved loads. Its hosted workflow builds
both wheels from extracted sdists with Cargo offline, removes the build target
before isolated CLI/Python smoke checks, and records source and artifact hashes.
Sixteen adversarial parser/closure tests pass on local Python 3.11 and 3.14;
independent Sol rereview found no P1/P2 in the gate. Those local checks include
the historical wheel, not a current-source rebuilt wheel. The four-platform/
interpreter hosted matrix and exact source-to-artifact release proof remain open.

At the 2026-10-24 moving-tree integration check,
`sync_codegen_resources.py --check` exposed five stale Python codegen copies of
current canonical core resources plus a stale manifest pin. The deterministic
`--write` sync refreshed the nine-resource mirror and `_release.py` to manifest
SHA-256 `7e2ceba9f5a75c80a314bf6010848fa65f5a739059f11e89ec9eeb6cae6d9aaa`;
the follow-up `--check` passes. This aligns current source files only. Fresh
installed wheels, offline sdist rebuilds and hosted release qualifications
must use the new resource cohort.

### R5–R7 dependency order and retirement

The live successor census captured at the R4 checkpoint remains the source of
active-family obligations. Its 136 unresolved module rows are open work, not a
retirement waiver; that figure counts unresolved *ownership classifications*,
not the total number of active TypeScript/Python semantic modules awaiting
implementation. Rows assigned to R5, R6 or R7 remain unported until their
operation-level Rust evidence and retirement dispositions close. Refresh the
census at integration checkpoints, and preserve each prior capture as evidence
of the source cohort it measured. For shared R3
modules, map individual exported operations to their Rust owners; membership in
the R3 manifest alone cannot retire a wider TypeScript API.

The first bounded R5 shards are Gregorian-date and RFC3339 exact-instant kernels
with opt-in Node/Bun and browser WASM bindings, followed by the JavaScript numeric
adapter. Gregorian/RFC3339 use CONTRACT-065/066, retained TypeScript fixtures,
independent Python calendar/instant oracle rows and real-host parity. Sol's
independent temporal review found no P1/P2 in this opt-in subset; default API
switch, Python exposure and TypeScript retirement remain open. Numeric uses
CONTRACT-049, its five current public operations, `src/adapters/javascript-numeric.ts`,
`tests/core/javascript-numeric.test.ts`, a separately frozen Python exact-number
oracle, and Node/Bun plus real-browser WASM gates. Its Rust module and bindings
are implemented for an opt-in profile. The
[R5 numeric checkpoint](evidence/rust-migration/r5-javascript-numeric/README.md)
records 27 independent Python-oracle vectors through Node/Bun and real Chromium
WASM, exact context refusal checks, and bounded work tests. After corrections
for trailing-zero BigInts, unknown context admission and arithmetic formatting
work, independent Sol review found no remaining P1/P2 in the stated five-operation
slice. Its current TypeScript API remains the default; downstream float codecs,
Python integration and the precise R7 wrapper/retirement gate remain open.

The next parallel R5 model shard is core cardinality inspection and authoring
from `src/model/cardinality.ts`, governed by CONTRACT-001 and the versioned
cardinality operation schemas. It keeps known, missing, inapplicable and unknown
distinct, preserves opaque nested extension content and receipts, and checks
set/clear/keep plus stale or forged declarations. Contract-derived frozen
vectors and an independent Draft 2020-12 schema validator provide meaning
controls; there is no external native cardinality oracle because this is an
authored core property. The retained TypeScript implementation stays active
until Rust, Node/Bun and real-browser wrappers pass exact-source parity and
independent review. Native target classifiers remain separate R5 families.
The [bounded cardinality Rust core checkpoint](evidence/rust-migration/r5-cardinality/README.md)
has complete TypeScript/Rust envelope differential and independent Ajv validation
for its recorded cohort. Later cross-slice inspection reopened receipt
nested-document admission and module/element surrogate identity checks. Those
are corrected with full-schema receipt admission and raw UTF-16 identity;
a second Sol final review reproduced both differentials and found no P1/P2
after 12 focused tests and the full `umf-core` suite.
Node/Bun and real-browser bindings, default cutover, and native cardinality
classifiers remain open.

The R5 core-model opt-in binding should route cardinality, kind and nullability
through the existing tagged `executeRequestWire` transport as `model/*`
operations. That transport retains isolated UTF-16 units in values, keys and
identities; direct native UTF-8 string arguments would lose accepted source
meaning. For this original opt-in transport, one ordinary `Context` covered
admission, trusted resource and registry construction, model operation, result
validation and verification with existing host cancellation/deadline/work
controls. The production retained-Engine interface is resolved below from
CONTRACT-080: admit immutable resources at factory setup and use a fresh
cumulative operation `Context` for every invocation. Node/Bun and real
Chromium WASM need identical complete-envelope fixtures and resource/refusal
gates before the opt-in binding is counted. This does not authorize R7 default
SDK cutover or removal of the retained TypeScript implementations.
The [opt-in model binding checkpoint](evidence/rust-migration/r5-model-bindings/README.md)
now passes the frozen Node/Bun/real Chromium envelope and Ajv gates for all
nine cardinality, kind and nullability operations. The first independent Sol
review found host resource conversion before work/cancel/deadline preflight;
the Node and WASM factories now meter five resources independently, check
controls before touching resource objects, and account host request/response
conversion. A reopened Sol review reproduced those controls, exact artifact
hashes and parity and found no remaining P1/P2 in the bounded opt-in cohort.
The bounded [R5 core element selection binding](evidence/rust-migration/r5-selection-binding/README.md)
now routes `model/selectCoreElements` over the tagged wire in opt-in Node/Bun and
WASM core-model wrappers. Frozen TypeScript success/refusal envelopes, raw
surrogate identities, unknown content, resource preflight, controls, actual
Ajv outputs and Chromium 153 parity pass. Native classifiers and default R7
cutover remain open.

The next bounded core-ideal cluster is Element kind followed by Field
nullability (`src/model/field-kind.ts` and `src/model/nullability.ts`), six
inspect/declare/verify operations under CONTRACT-001/040. Freeze complete
predecessor success and refusal envelopes before implementation. Use the
current versioned kind (8/6) and nullability (7/5) operation schemas and the
same explicit, metered Rust engine resources. Preserve identity admission,
ordered diagnostics, unknown text and extension content, authored provenance,
tamper/stale refusal and host cancellation. An independent Draft 2020-12
validator must consume actual Rust receipts, not constructed expectations.
Node/Bun and real Chromium WASM compare complete envelopes; the current
TypeScript defaults remain until a separately reviewed R7 cutover. No external
native-system equivalence is claimed for these authored ideals.
The [kind/nullability Rust core checkpoint](evidence/rust-migration/r5-kind-nullability/README.md)
passes six focused tests, complete frozen success/refusal envelopes and
independent Ajv 2020 validation of 11 actual Rust outputs with four rejected
nested-document controls. A separate Sol final review found no P1/P2 after
correction of UTF-16 identities, unknown labels, malformed receipt admission
and metering. Node/Bun and browser bindings, native classifiers and default
cutover remain open.

The bounded R5 `selectCoreElements` Rust core slice from
`src/model/selection.ts` is recorded in the
[selection checkpoint](evidence/rust-migration/r5-selection/README.md). It
matches frozen TypeScript success and refusal envelopes, validates the full
source and caller registry before selection, and passes focused graph-oracle
and Ajv checks on actual Rust outputs. Independent Sol review corrections
normalized malformed-query refusals, preserved the predecessor's precise
descendant path for copy limits, charged long UTF-16 keys before path allocation,
and brought the current schema/generator into fixed-point closure with cardinality
filtering. Final Sol rereview reproduced ten focused tests, Ajv, graph-oracle and
frozen-refusal checks with no P1/P2. The implementation remains scoped to the
Rust core function. The separate
[selection-binding checkpoint](evidence/rust-migration/r5-selection-binding/README.md)
routes `model/selectCoreElements` over `executeRequestWire` and matches eight
success and five refusal envelopes on Node, Bun and real Chromium. After a
registry preflight correction, independent Sol review reproduced zero-touch
cancelled-registry controls, a 128-entry metered cancellation, actual-output
Ajv and four negative mutations with no remaining P1/P2. This is an opt-in
binding; R7 default cutover and TypeScript retirement remain open. Keep
`editExtension` separate because its callback
transaction and completeness semantics require another capability decision.
Closing selection does not retire the wider model, registry, schema or adapter
modules; R7 default cutover remains separate.

The separate R5 core slice adds a Rust `edit_extension` transaction in
`crates/umf-core`. It validates the complete source with the caller's engine,
immutable registry and capabilities before target lookup, works on an owned
candidate, passes one isolated payload copy to the trusted updater, and admits
the full candidate before returning it. Source invalidity/incompleteness,
missing instances, invalid candidates and host control failures retain separate
error paths. The current Rust core cohort has focused valid, refusal, updater
trace, lone-surrogate identity, frozen TypeScript envelopes and actual-output
Ajv checks in
[`r5-edit-extension`](evidence/rust-migration/r5-edit-extension/README.md).
Sol's reopened review found diagnostic UTF-16 copies occurred before context
metering, then found count-proportional diagnostic-vector reservation before
the first charge. `validation_value` now meters the diagnostic count before
reserving slots, then precharges each diagnostic's text and fixed projection
allowance before copying. The 65,537-unit text and 50,000-diagnostic low-work
refusal regressions pass. Focused and full core, Ajv, callback-trace,
TypeScript typecheck and formatting gates pass after these repairs. Final Sol
rereview found no remaining P1/P2 in the bounded native transaction.
Wrapper/browser qualification remains open;
live-registry mutation and reentrant callback behavior are outside this bounded
immutable-registry profile.

The production `editExtension` binding must use an operation-scoped live host
interface. The TypeScript predecessor validates the original with fresh
`Registry.get` lookups during each pass, then copies the original source *after*
initial validation; a semantic callback can mutate that source or register a
package that changes later lookups in the same pass. The Rust execution host
therefore needs owned, stable registration handles returned per lookup, a
post-validation original-source copy checkpoint, and separate callback/updater
exception channels. It must release registry borrows before invoking callbacks
and give nested invocations separate control and exception frames. The existing
immutable transaction remains a qualified core subset, not public API parity.
Freeze predecessor side-effect, error, source-mutation, nested-call, UTF-16 and
control traces before implementation; then prove immutable callers unchanged,
live mutation in a native host harness, packaged Node/Bun and real Chromium
parity, and installed Python source-carrier and exception behavior. Preserve the
same outer work/deadline context across both validation passes and every host
boundary. Synchronous user callbacks remain cooperative under that context.
The source-bound [live predecessor trace](evidence/rust-migration/r5-edit-extension/README.md#live-typescript-predecessor-traces)
now freezes same-pass registration visibility, the retained incompleteness
warning, post-validation original-source mutation, detached copies, nested edit
invocation and initial semantic/updater exception separation. Sol rereview
reproduced the 31-file closure and trace twice with no remaining P1/P2 in this
bounded evidence. Candidate-pass exception behavior and the Rust live-host
binding remain open.

The next independent pure-codec R5 candidate is the `umf-128/1` bits128 and
UUID operation family in `src/model/bit128.ts` and `src/model/uuid.ts`, governed
by CONTRACT-076 and SD-005. Port the eleven exact parse, byte, comparison,
word and integer conversion operations as a host-independent Rust module before
using them in Field, key or native-carrier ports. Freeze complete predecessor
success/refusal results, including signed boundaries, negative zero, exponent
limits, malformed snapshot members and copied byte views. Use the existing
Python big-integer/UUID oracle and independent generated vectors, then qualify
tagged Node/Bun and real-browser WASM admission separately; JavaScript
prototype/accessor/symbol checks belong at the wrapper boundary. A portable
codec result does not establish native UUID ordering, enforcement or the five
adapter recovery gates.

The [bounded pure-codec checkpoint](evidence/rust-migration/r5-bit128/README.md)
now implements all eleven `umf-128/1` operations in `umf-core`. Its focused
tests pass 387 independent Python vectors and twelve exact Bun predecessor edge
outcomes, including repaired snapshot-shape and malformed-token diagnostic
precedence. Independent Sol rereview found no remaining P1/P2 in the reviewed
pure `Value` core; Node/Bun typed-array and snapshot admission, real-browser
WASM, Python exposure, default cutover and native UUID consumers are separate
open gates.

The opt-in [R5 bit128 binding checkpoint](evidence/rust-migration/r5-bit128-binding/README.md)
now exposes those eleven operations through the Rust-backed Node/Bun wrapper and
a staged browser WASM path. After final fixed-width pre-allocation repair,
independent Sol review replayed 298 host-carrier cases with zero mismatches or
getter reads, 389 oracle vectors in Node and Chromium, Bun's 4 tests and 5,540
assertions, resource controls and typecheck; no P1/P2 remained in this bounded
scope. Python exposure, standalone distributed WASM package self-containment,
default cutover, Field/key consumers and native UUID semantics remain open.

The [bounded core Field-value checkpoint](evidence/rust-migration/r5-field-value/README.md)
implements the public `validateCoreFieldValue` decision in `umf-core` for a
50-case frozen JSON-carrier cohort. It preserves raw UTF-16 qualifier paths,
exact numeric and binary comparisons, TypeError observations and validation
order. Independent Ajv and Python controls passed, and Sol's final rereview
found no remaining P1/P2 after ECMAScript coercion and pre-allocation metering
repairs. The current TypeScript public API remains active. At this core-only
checkpoint, Node/Bun, real-browser WASM, Python, CLI, arbitrary JavaScript
object carriers and native consumers were separate qualification gates; their
wrappers must map Rust `TYPE_ERROR` to host TypeError.

The opt-in [R5 Field-value binding checkpoint](evidence/rust-migration/r5-field-value-binding/README.md)
now maps the Rust `TYPE_ERROR` to a real host `TypeError` and matches all 50
frozen JSON-carrier cases in Node 26, Bun 1.4 and actual Chromium 153 with
the built WASM. Independent Sol review repeated the 11 TypeError outcomes,
metering, cancellation and deadline controls, and found no P1/P2 in this
bounded binding. The TypeScript default remains active; arbitrary JavaScript
objects, Python/CLI exposure, standalone WASM package closure, R7 cutover and
native consumers remain open.

The bounded [R5 schema-default checkpoint](evidence/rust-migration/r5-schema-defaults/README.md)
ports `resolveCoreDefault` through the Rust engine, tagged wire and opt-in Node
model wrapper. Twenty-four frozen predecessor cases compare complete success
values or exact refusal code/path/message, including source-before-identity
validation and module-before-element lookup. The Node wrapper restores the
predecessor's input/result object alias when no default applies. Local focused
core, wire, TypeScript and rebuilt-addon tests passed; Sol's independent final
source review found no remaining P1/P2 after UTF-16 copy and diagnostic-metering
repairs. The default TypeScript API, Python/CLI, browser/WASM and installed
package qualification remain open.

The next shared R5 foundation is an exact native JSON tree with preserved
number lexemes, UTF-16 string/key units, duplicate-key refusal and tagged
representation unknown-field retention. Its Rust parser, copied reads and
renderer must have separate parse/copy resource admission and refuse native
rendering when unknown representation fields would be lost. After independent
review, the first dependent adapter shard is CONTRACT-002 JSON Schema 0.1.0:
freeze all current import, inspect, root/resource/bundle export, get, walk and
atomic-edit outcomes; port payload/URI admission, schema-position traversal,
unknown-content diagnostics and copied native export before interpretation.
Interpretation must match the declared Ajv 8.20.0 Draft 2020-12 profile or
remain explicitly incomplete; the existing Rust schema evaluator is not by
itself proof of adapter equivalence. Preserve the required upstream 46-file,
384-case, 1,301-vector independent oracle profile and exact URI, resource
collision, numeric and diagnostic ordering. CLI, installed Python, packed
Node/Bun and distributed Chromium bindings are separate gates, followed by R7
default cutover. JSON Schema projections and OpenAPI remain dependent work.

The bounded [R5 native JSON checkpoint](evidence/rust-migration/r5-native-json/README.md)
now has a Rust lossless tree, copied-subtree admission, exact number lexemes,
UTF-16 keys and strings, and unknown tagged-field retention/refusal. Independent
Sol review replayed deep nesting, syntax/duplicate/limit precedence and
million-unit pre-allocation controls; focused Rust tests pass 11/11 with no
remaining P1/P2 in this core slice. Duplicate-key diagnostic message text is
not yet exact predecessor parity, and no adapter or host binding is qualified
by this tree alone.

The first [R5 JSON Schema preservation checkpoint](evidence/rust-migration/r5-json-schema-core/README.md)
uses that tree for payload/document admission, URI resources, exact copied get,
Draft 2020-12 schema-position walk and loss-aware native exports. Independent
Sol review found no remaining P1/P2 in the focused 12-case Rust slice after
repairing UTF-16 paths, representation extras, export scope and resource
metering. Interpretation/inspection, atomic edits, the full upstream oracle
profile and CLI/Python/Node/Bun/Chromium bindings remain open.

The bounded [R5 JSON Schema inspector checkpoint](evidence/rust-migration/r5-json-schema-inspect/README.md)
adds Draft 2020-12 metadata/resource inspection through the pinned Rust
compiler, with explicit incomplete diagnostics for unqualified interpretation.
Independent Sol replay passed the focused 12 adapter and four inspector tests,
control provenance, exact-number refusal and metaschema-before-reference
ordering after repair. Full Ajv 8.20 behavior, the upstream 46-file oracle,
atomic edits and host/browser bindings remain open; this checkpoint does not
qualify general JSON Schema validity.

The successor [qualified validator profile](evidence/rust-migration/r5-json-schema-inspect/README.md)
closes one deliberately small Draft 2020-12 grammar containing boolean schemas,
scalar type, required, properties, definitions, and restricted relative IDs.
Independent [Sol review](evidence/rust-migration/r5-json-schema-inspect/sol-review.md)
verified the source and artifact hashes, reran the 13-test Rust suite and
installed Node 30-case replay, and checked the Bun and real Chromium 30-case
and five-control receipts. This is an opt-in bounded qualification; general
references, anchors, URI semantics, the full corpus, edit semantics and R7
default routing remain open.

The [R5 JSON Schema atomic-edit checkpoint](evidence/rust-migration/r5-json-schema-edit/README.md)
adds a copied Rust transaction for existing native root pointers. Mandatory
source and candidate guards refuse unknown representation, keyword, dialect,
vocabulary and numeric meaning even with a permissive callback; a separate
trusted semantic oracle remains required. Independent Sol replay passed 12
adapter, six edit and four inspector tests plus two adversarial probes after
repairing source/candidate guards and exact extension dispatch. Full Ajv
semantics, the upstream corpus and production host/browser exposure remain
open, so this does not qualify general JSON Schema editing.

The [R5 upstream-oracle harness](evidence/rust-migration/r5-json-schema/upstream-oracle-harness.md)
now pins the Draft 2020-12 46-file, 384-case, 1,301-vector corpus and runs the
Ajv 8.20 predecessor comparison with explicit Rust capture, adapter-preservation
and per-vector accounting. Its Ajv-only run reproduces 30 baseline disagreements
across 24 cases, seven compile failures and eight evaluation errors across four
cases. At that Ajv-only checkpoint every Rust outcome was marked not run, and
no native parity result was claimed.

The first full [source-frozen Rust corpus capture](evidence/rust-migration/r5-json-schema/full-corpus-capture-2026-10-23.md)
subsequently ran all 46 files, 384 cases and 1,301 vectors. Rust executed
1,265 vectors; 15 compile refusals blocked 35, one executed vector errored,
and 14 Rust outcomes disagreed with upstream expectations. The adapter
preservation capture reported zero failures, but it does not exercise every
public transaction or binding. The archived raw and comparison reports bind an
unchanged 87-file source closure and exact hashes. These results are triage
evidence, not qualification. Sol review found that the first acceptance-gate
prototype can admit fabricated report shapes and waive adapter semantic drift
through Ajv baseline exclusions; it also needs per-vector Rust/Ajv attribution.
At the first capture, the gate was unusable for a passing claim pending those
P2 repairs and independent review. Static reference/URI resolution, dynamic scope,
unevaluated annotations and number handling remain distinct repair clusters.

The additive [v3 source-bound corpus packet](evidence/rust-migration/r5-json-schema/full-corpus-capture-v3-2026-10-23.md)
retains per-vector Rust, original Ajv and exported-schema outcomes and archives
the comparison and raw capture for replay. Its acceptance gate now independently
checks the pinned corpus's 160-file manifest closure, the exact 87-file runner
source inventory and current hashes, raw-capture digest, case/vector accounting,
Rust/upstream correctness even where Ajv is unavailable, and original/exported
Ajv parity. Sol reproduced and closed two false-pass paths in the gate and found
no remaining P1/P2 in this bounded review; seven synthetic tests and both
TypeScript typechecks pass. The v3 source cohort still fails semantically: 15
Rust schema refusals block 35 vectors, one vector errors, and 14 Rust results
disagree with upstream. After subsequent core edits, replay against the moving
checkout correctly stops at source-provenance verification. A new frozen-source
capture is required after the static-reference repairs; v3 remains immutable
failure evidence and does not qualify general Draft 2020-12 support.

The bounded [static-reference follow-up](evidence/rust-migration/r5-json-schema/static-reference-resolution-followup-2026-10-23.md)
now carries Draft 2020-12 retrieval/base scope through nested schema positions,
applies an external resource root's relative `$id` once, resolves directory
references with trailing-slash semantics, and traverses `then`/`else` schema
positions. The upstream harness supplies the pinned official metaschemas as
explicit Rust resources while preserving its original Ajv and adapter resource
set. Legacy dialects retain their prior relative joiner and recognize absolute
IDs. Sol found and closed two P2 scope/legacy regressions; the final focused
Rust tests pass seven static-reference, five Python recursive-resource-scope
and three Python reference-path cases. The separate
[inspector metering follow-up](evidence/rust-migration/r5-json-schema-inspect/resource-metering-followup-2026-10-23.md)
walks the root once and precharges key, URI, path, container and native-value
copies. Its three unit and five integration tests pass. Sol found no remaining
P1/P2 in these bounded source deltas. The successor
[v4 source-bound capture](evidence/rust-migration/r5-json-schema/full-corpus-capture-v4-2026-10-23.md)
closed the unchanged 46-file, 384-case, 1,301-vector corpus and current 87-file
source inventory. Static resolution reduced compile refusals from 15 to five
and blocked vectors from 35 to 13; Rust executed 1,283 vectors. The hardened
gate still rejects five compile-failure cases, five runtime errors and 14
Rust/upstream semantic disagreements. It found no source-provenance or adapter
preservation failure; original/exported Ajv parity remained zero mismatches
among 1,273 compared vectors. Independent Sol review replayed the gate and
verified the raw hashes and counts with no P1/P2 false claim. Remaining static
references and anchors precede dynamic scope, annotation and numeric repairs.
Neither focused result nor v4 activates the default adapter or qualifies
general Draft 2020-12 support.

The additive [v5 source-bound reference packet](evidence/rust-migration/r5-json-schema/static-reference-resolution-v5-2026-10-23.md)
closes the targeted `ref.json:20,30,31`, `refRemote.json:5` and `anchor.json:3`
vectors under an unchanged 89-file capture closure. Compared with v4, compile
refusals fall from five to three, uncompiled vectors from 13 to nine, runtime
errors from five to one and Rust/upstream disagreements from 14 to 12. The
acceptance gate still rejects dynamic-reference, vocabulary, annotation and
numeric differences. Independent Sol review verified its report/raw hashes and
counts but found a P2 scope bug: an exact-URI shortcut can mistake a direct
nested repeated relative `$id` for a resolver-selected resource. Keep v5 as
immutable failing evidence; fix resource-entry identity and recapture before
crediting the static-reference slice or moving to dynamic-scope qualification.

The additive [v6 source-bound reference packet](evidence/rust-migration/r5-json-schema/static-reference-resolution-v6-2026-10-23.md)
fixes that resource-entry identity bug and passes 16 focused Rust controls. Its
89-file source closure was identical before and after the full pinned capture;
independent Sol review verified every closure hash, raw/report digest and case
count with no new P1/P2 finding. The five targeted static-reference cases match
upstream. The full corpus result remains the same as v5: 1,291 executed of
1,301 vectors, nine uncompiled, one runtime error and 12 Rust/upstream boolean
disagreements. Acceptance still fails solely on semantic/support issues. Next
repair the ten dynamic-reference vectors and two unevaluated-annotation vectors,
then the separate number and vocabulary refusal/error clusters, and recapture
under a fresh source closure. Neither v6 nor the focused suite qualifies broad
Draft 2020-12 support or default cutover.

The additive [v12 Draft 2020-12 source-bound receipt](evidence/rust-migration/r5-json-schema/draft2020-completion-v12-2026-10-23.md)
records a pre/post-identical 91-file closure and full pinned 46-file, 384-case,
1,301-vector capture. Rust executed all vectors with no compile/runtime errors
or upstream-expected disagreements; the reviewed acceptance gate accepted the
report with 35 explicit Ajv/profile exclusions. Final `schema.rs` hash
`a6957bbee794086753b751e76b0ccd62c688c1ebf622e71c2fe5a4f9e0a48d17`
passed 207 offline core library tests and independent Sol metered-lookup review
without P1/P2. This closes the pinned Rust core evaluator corpus, not the full
JSON Schema adapter, bindings, browser path or default cutover.

The next JSON Schema delivery boundary is an opt-in
`umf-r5-json-schema/0.1.0` host engine for import, inspect, root/resource/bundle
export, node lookup and schema-position walk. Sol's interface review selects
one closed dispatcher in `umf-core-wire` and a single tagged UTF-16 transport
reused by Node/Bun, WASM, Python and the CLI. Import accepts explicitly ordered
retrieval-URI/source pairs; caller schema resources cannot replace the five
pinned core validation resources. Admission and control preflight precede host
object traversal, with one context spanning decode, operation and encode.
Freeze the TypeScript predecessor's seven-operation success/refusal envelopes,
then qualify packed Node/Bun, installed wheels, a clean native CLI and packaged
real-Chromium WASM with exact resources, diagnostics, copy isolation and
controls. `parseNativeJson` is a separate public operation gate.
`editJsonSchemaNode` and `jsonSchemaRegistry` require the live callback/registry
interface and remain separate; this opt-in engine does not retire them or switch
the default adapter. The bounded
[Rust operation façade](evidence/rust-migration/r5-json-schema-operations/README.md)
now composes the seven operations and passes 12 adapter, seven inspector and 17
operation tests. Sol's final source review closed the semantic-callback,
URI-diagnostic and root/resource-collision ordering findings without a remaining
P1/P2 in that scope. The shared wire dispatcher passes two focused tests; the
[opt-in host shard](evidence/rust-migration/r5-json-schema-bindings/host-shard.md)
passes 11 Bun wrapper controls and the generated WASM source check. Python and
CLI source review passes for the seven-operation profile, with direct CPython
extension and clean-PATH CLI checks; installed Python wheels remain open. The
[pre-repair real-host receipt](evidence/rust-migration/r5-json-schema-bindings/real-hosts.md)
replayed the frozen 30 cases on Node and Bun native addons plus fresh packaged
WASM on Bun and Chromium. Each path matched 25/30 exact outcomes and passed
five public-engine work/cancellation/deadline/meter controls. Two mismatches
are diagnostic wording; three contain the same conservative `complete: false`
validator warning. The receipt binds the pre-repair inspector and artifact
hashes. The [reviewed successor replay](evidence/rust-migration/r5-json-schema-bindings/successor-real-hosts-35bf199d.md)
rebuilds the diagnostic-repaired source and matches 27/30 frozen cases with
5/5 controls on each of the same four host paths. Its three remaining
differences all carry the intentionally conservative `complete: false`
validator warning. Each receipt binds its own source and artifact cohort;
future source changes need fresh host replay. Frozen predecessor
error paths were not captured and remain unqualified. The reviewed
[native-complete proposal](evidence/rust-migration/r5-json-schema/native-complete-subset-proposal-2026-10-23.md)
narrows a future `complete: true` profile and its independent-oracle gates; it
records no implementation claim. No default adapter switch or TypeScript
retirement is credited.

The next bounded CONTRACT-003 Protobuf shard is only the binary descriptor
codec, `readDescriptorSet` and `writeDescriptorSet`; source compilation,
emission, inspection and JSON Schema projection remain separate. The
[93-operation predecessor packet](evidence/rust-migration/r5-protobuf-descriptor-codec/README.md)
pins Buf 2.15.0, Bun 1.4.3, protoc 36.2, source and fixture hashes, and the
installed Buf package closure before Rust implementation. A separate offline
Python protobuf 7.36.2 replay passed all 42 authored native behavior checks
before and after the TypeScript round trip and detected both deliberate default
and presence mutations; its report matched the checked-in oracle byte-for-byte.
The Rust interface
uses portable `Value`/`Context`, a generated descriptor metadata table, and
4,000,000-byte binary input/output limits. It must preserve unknown wire
values and ordered entries, exact field presence, and the reached descriptor
graph. Three predecessor behaviors conflict with CONTRACT-003: export rejects
a valid 4 MB unknown field after hex expansion, an eleven-byte unknown varint
is accepted despite malformed native wire, and a closed-enum unknown value
with overlong encoding is normalized rather than retained byte-exactly. These
are explicit normative corrections, not parity targets. Buf exposes 34 runtime
descriptor message types while the historical predecessor schema had 30 `$defs`
including a generic unknown definition. The five-message schema gap recorded by
that immutable packet has since closed; the [additive schema-graph evidence](evidence/rust-migration/r5-protobuf-descriptor-codec/README.md#descriptor-schema-graph-closure)
records exact pinned-runtime type and field closure without rewriting the
predecessor hashes. The first independent Sol source review
found exponential nested writes, a UTF-16 predicate compile error, and
packed-enum, required-field, wire metadata, writer-order and test gaps. Luna
repaired these against Buf and Python protobuf observations; subsequent Sol
source review found no open P1/P2 in the bounded codec. The portable core
compiled and its 11 focused descriptor tests passed at an intermediate source
checkpoint. An opt-in Python binding and replay harness reconstruct all 93
frozen operations and verify their input packet before import; Sol's final
harness review found no open P1/P2. The installed `umf-core` 0.11.0 wheel now
replays all 93 operations on CPython 3.11.17/Darwin arm64: 32 exact matches,
seven contract-directed divergences, and 54 contract-expected rejections, with
zero generic mismatches and zero unreplayable cases. The five initial nested
depth mismatches were false positives caused by missing `inputBytes` in the
harness summary and are corrected; all both-error cases were reviewed against
CONTRACT-003. The compact receipt is
[`installed-wheel-replay-summary.json`](evidence/rust-migration/r5-protobuf-descriptor-codec/installed-wheel-replay-summary.json).
Node/Bun/Chromium binding replay and broader native qualification remain open;
this single wheel cohort does not establish
complete binary codec parity.

The additive [R5 Protobuf descriptor inspector checkpoint](evidence/rust-migration/r5-protobuf-descriptor-codec/README.md)
freezes ten current TypeScript `inspectProtobuf` observations and 41 source
inputs separately from the immutable 93-operation binary-codec packet. The
portable Rust inspector reads the pinned Document payload and source-archive
shape, validates descriptor representation through the codec, reports ordered
unknown-wire findings and bounded file-name registry warnings, and always
marks compiler verification incomplete. Its eight focused tests pass, including
a late host-meter rejection that independent Sol review found could previously
be converted into a warning. The control error now propagates unchanged; file
and archive duplicate checks use metered hash lookups. Two added UTF-16
regressions retain lone-surrogate code units in diagnostic paths, including
payload, source-archive and descriptor-field keys; independent Sol review of
that repair found no P1/P2. Native source compilation/emission and complete
dependency-registry interpretation remain open. The current TypeScript schema's
complete pinned message graph is qualified separately by the additive
schema-graph evidence.

The opt-in [inspector binding evidence](evidence/rust-migration/r5-protobuf-inspect-bindings/README.md)
now qualifies two frozen inspector observations, UTF-16 diagnostic paths,
cooperative resource controls and a meter failure injected inside the Rust
hook on Node 26.12.1, Bun 1.4.3 and real Chromium 153.0.8010.12. Bun's
focused suite passes three tests and 21 assertions; source and artifact hashes
are recorded for the native addon and WASM module. Independent Sol review
reproduced the real-runtime results and found no remaining P1/P2 after the
meter-failure injection and browser-receipt hash repairs. This is an opt-in
inspector subset, not binary codec or source-compiler parity.

The opt-in [Protobuf inspector wire/CLI checkpoint](evidence/rust-migration/r5-protobuf-inspect-cli/README.md)
exposes one `protobuf.descriptor.inspect` operation under profile
`umf-r5-protobuf-inspect/0.1.0`, using one cooperative Context for tagged decode,
inspection and encode. Its Rust-only CLI runs with an empty `PATH` and a 32 MiB
stdin bound. Ten focused wire/CLI tests pass with default and no-default
features, including late inspection/encode host-control failure and oversized
stdin refusal; independent Sol review found no P1/P2. The opt-in
[CPython binding packet](evidence/rust-migration/r5-protobuf-inspect-python/README.md)
replays all ten frozen inspector observations from the same installed abi3 wheel
on CPython 3.11.17 and 3.12.15, with a real lone-surrogate
diagnostic path, and resource, cancellation, deadline and meter failures injected
inside the Rust hook after Python admission. Malformed-document and unknown-wire
controls also pass. Exact wheel and extension hashes are recorded in its receipt;
the source closure is recorded in the adjacent hash manifest. Independent Sol
review reproduced both interpreter replays and found no P1/P2 in this bounded
Python binding.

This is one local macOS arm64 cohort. Complete dependency-registry
interpretation, broader Protobuf semantics and binding parity outside the
inspector subset, native compiler validation and default cutover remain open.

The [opt-in Protobuf document slice](evidence/rust-migration/r5-protobuf-document/README.md)
now imports descriptor bytes into a UMF document, exports descriptor bytes,
returns a copied descriptor tree, and bundles bytes with a copied source and
ordered diagnostics. It validates the core envelope before payload operations
and refuses unknown representation content that native export would discard.
Its focused document suite passes 5/5 and the existing descriptor codec suite
passes 11/11. Independent Sol review found and closed a P2 gap where the first
version accepted invalid core IDs and malformed envelopes, then found no
remaining P1/P2 in the bounded corrected slice. This is a Rust-core operation
only; bindings, browser parity, source compilation and default cutover remain
open.

The next Protobuf slice is source-import prepare/finish. Freeze
the current `src/adapters/protobuf/{index,source}.ts` success/refusal envelopes,
unknown payload/archive guards, 4 MB binary and source-text bounds, copy
isolation and ordered diagnostics before changing the default. Rust owns
request admission, immutable source-archive snapshot, descriptor handling and
final document inspection; a trusted installed compiler remains an explicit
host capability receiving a separate copy. One outer work/deadline context
must cover both sides of that callback, and unavailable or noninterruptible
compiler profiles must refuse their unsupported control claims. Later slices
cover callback editing and source emission with independent protoc, Buf and
Python protobuf replays. Sol's read-only interface review identified this
dependency order; the Go compiler/emitter, Edition 2024 and complete registry
semantics remain named external blockers rather than pure-Rust claims.

The [opt-in Protobuf source-import checkpoint](evidence/rust-migration/r5-protobuf-source/README.md)
implements that prepare/compile/finish boundary with a private finalization
step and explicit trusted cooperative compiler capability. A frozen TypeScript
success/refusal packet is reproducible byte-for-byte. Independent Sol rereview
closed three P2 differences in serialized request length, copy/refusal order,
and UTF-16 compiler identity; it found no remaining P1/P2 in this bounded
slice. Pinned offline Rust tests pass 8/8 source, 5/5 document and 9/9
inspector cases. The immutable TypeScript capture compiler is a stub, and the
existing TypeScript native-oracle test reached its assertions but failed while
writing its fixture report in this worktree. An additive
[real protoc callback run](evidence/rust-migration/r5-protobuf-source/README.md#additive-real-native-compiler-callback-run--2026-10-23)
now passes on the pinned local protoc 36.2 binary: full Python
`FileDescriptorSet` message equality, all 42 Python protobuf behavior checks,
source refusals and child-control cleanup are recorded. This one-host result is
pending independent Sol review; broader compiler qualification, bindings,
source emission, Edition 2024 and default cutover remain open.

The [opt-in Protobuf source-export checkpoint](evidence/rust-migration/r5-protobuf-source-export/README.md)
adds a Rust `prepare_source_export`/`finish_source_export` boundary around an
explicit trusted host emitter. A frozen TypeScript packet includes callback
mutation: descriptor bytes are prepared before emission, while returned
source and inspection reflect the document after callback completion. The
focused offline Rust suite passes 5/5; independent Sol review reproduced the
packet byte-for-byte and found no P1/P2 in the bounded core boundary. No
native emitter ran. Printer semantics, source layout, bindings, browser
delivery, Edition 2024 and default cutover remain open.

The next bounded Avro field-metadata shard has a frozen
[100-case predecessor and independent native packet](evidence/rust-migration/r5-avro-fields/README.md).
It pins Bun 1.4.3, avsc 5.7.9, Apache Avro 1.12.0 and fastavro 1.12.2,
including 20 upstream `.avsc` schemas and exact numeric/temporal controls.
Independent Sol replay matched all 100 predecessor outputs and errors, but
found that the packet's 48 hashed sources omit transitive executable files
and installed YAML. An additive 298-file executable closure now binds those
inputs without rewriting the historical packet; its executable-only check
passes and explicitly reports subsequent plan-document drift. The portable
Rust `deriveAvroFields` kernel and its refreshed 12 focused tests pass. The
capacity, escaping and repeated-lookup controls have Sol source review with no
open P1/P2. An opt-in `umf-core` 0.11.0 wheel on CPython 3.11.17/Darwin arm64
passes 110 Python binding tests, including all 100 frozen cases and 294 field
observations, exact ordered trees, and resource/error controls. Sol's binding
delta review found no remaining P1/P2 after the clock and test-expectation
repairs. Fresh native adapter replay, full Avro import/export, datum behavior,
projections and default host cutover remain separate R5 work. The opt-in
Node/Bun and WASM binding now passes the frozen
100-case/294-field replay in Node 26.12.1, Bun 1.4.3 and real Chromium
153.0.8010.12, with
UTF-16 and exact-number carriers, unknown-content/order preservation, copy
isolation, and resource/cancellation/deadline/error controls. The
[binding evidence](evidence/rust-migration/r5-avro-fields/README.md#opt-in-nodebun-and-wasm-binding-evidence--2026-10-23)
records the Rust 1.90.0 Darwin arm64 addon and WASM hashes. This remains a
metadata-only opt-in profile; default adapter cutover and full Avro support are
not qualified. Independent Sol review found and closed a WASM TypeScript
declaration mismatch; the corrected nested metadata type has a consumer
typecheck fixture. Root independently reran the real Chromium 100-case replay.
The recorded source/artifact hashes are selected fingerprints, while an
exhaustive transitive Rust build closure remains a final-release gate.

The additive [full Avro adapter predecessor packet](evidence/rust-migration/r5-avro-full-predecessor/README.md)
freezes current TypeScript import, export, inspect, node-read, edit-proposal and
bundle behavior before a wider Rust port. It records dependency order,
source-owned unknown metadata and exact number tokens, unknown tagged-tree
refusal, detached copies, guard precedence and JSON/YAML serialization.
The pinned `avsc` 5.7.9 accepts its representative schema; a fresh Apache
Avro 1.12.0 Python or Java replay was unavailable in this environment. The
packet is a migration baseline, not Rust parity or full Avro qualification.
Datum behavior, protocol/IDL/container support, control surfaces and default
cutover remain open. Independent Sol review found and closed three P2 capture
gaps: full proposal source/document preservation, an actual exact-int64
adapter round trip, and an unknown-representation export case independent of
the dependency guard. Sol rereview found no remaining P1/P2 in the corrected
predecessor packet; its 11 selected source hashes match the current adapter.

The [opt-in Avro document core](evidence/rust-migration/r5-avro-document-core/README.md)
adds lossless document carriage and bounded edits in Rust. Eight focused Rust
tests and a newline-ceiling control pass; independent Sol rereview closed the
LF metering and quadratic duplicate-ID findings with no remaining P1/P2. This
does not implement `avsc` semantic interpretation, datum operations, native
oracle parity, wrappers or default adapter activation.

The next [opt-in Avro structural inspection slice](evidence/rust-migration/r5-avro-semantic-inspection/README.md)
resolves caller-ordered named declarations, references, fields, arrays, maps and
unions while retaining the original document tree. It always reports the
profile as incomplete; defaults, logical types, datum codecs and full Avro
validation remain outside this slice. Focused Rust tests pass 8/8 and the
document integration target passes 9/9. Fresh Apache Avro 1.12.0 and
fastavro 1.12.2 parser observations were independently reproduced on authored
and exact Rust-exported schema inputs. Independent Sol rereview closed the
native negative-probe provenance and pre-allocation metering defects, with no
remaining P1/P2 in this bounded inspector. Wrapper/browser parity, wider
native conformance and default cutover remain open.

The bounded [R5 Iceberg schema checkpoint](evidence/rust-migration/r5-iceberg-schema/README.md)
ports standalone Iceberg 1.11 schema JSON preservation, inspection, pointer
reads and copied edits, without table metadata or default execution. Its Rust
focused suite passes eight tests, including 35 authored and 21 upstream frozen
schema replays, additive unknown-content controls, exact signed-int32 IDs,
oversized type parameters, and copy isolation. Two rounds of independent Sol
review found and closed exponent allocation/overflow, type-parameter, diagnostic
order and quadratic zero-normalization defects. The subsequent P2 sibling-name
metering and rejected-schema diagnostic defects are repaired. The bounded
production interface is five versioned operations—import, export, inspect,
getNode and proposeNodeEdit—using UTF-16 text and lossless tagged/core-wire
values under one caller-owned Context. Its source-level wire and CLI suites pass
three tests each, including a replay of all 56 frozen imports, a clean native
CLI route, and the versioned capability declaration. Sol independently found no
remaining P1/P2 in the reviewed Rust core, wire and CLI sources. These focused
tests preserve complete diagnostic order and the predecessor's
validation/pointer/replacement refusal order. The opt-in Node/Bun binding
passes all 35 authored predecessor cases and 265 assertions; real Chromium
WASM passes the same 26 successes/nine refusals plus UTF-16, metering and
resource controls. Sol found no remaining P1/P2 in those bindings after a
source-to-artifact hash correction and fresh WASM rebuild. An isolated
CPython 3.12.15 / PyIceberg 0.11.0 oracle rerun matched the retained output
bytes for 52 JSON/YAML round trips, 21 native-accepted schemas and a rename
check. A fresh Temurin 21.0.13+9 / Maven 3.9.16 run of the pinned Java oracle
also reproduced all 21 upstream result entries from the retained Java 21.0.2
output; its separately bound 44-JAR closure and runtime-version-only output
drift are in the Iceberg evidence receipt. These are bounded authored and
upstream native subset checks, not direct Rust/native equivalence. The
installed opt-in Python binding now passes all 35 authored and 21 upstream
frozen cases through a rebuilt CPython 3.11 wheel, with five-operation results,
UTF-16, copy, resource, cancellation, deadline and callback-failure controls.
The final combined wheel (SHA-256
`02b6b8fe766993c615902b2a7b90e75505657fc6f74fe0a4d3adccf7146c8335`)
passes a normal `umf` package import and the full no-shim replay on both
CPython 3.11.17 and 3.12.15. Independent Sol reran both installed profiles
and verified the wheel/source/resource cohort with no P1/P2 in this bounded
binding. The earlier 3.11 namespace-shim result remains historical only.
Table context, evolution, broader adapter semantics and default cutover remain
open.

The first bounded R6 shard is the CONTRACT-075 temporal carrier/token behavior
in `python/umf_access/src/umf_access/values.py`, with CONTRACT-068/072 host
boundaries. It depends on the qualified Rust date/instant subset, preserves
Python datetime carrier admission as thin host glue, and requires installed
wheel tests, independent datetime oracle rows and codec consumer replay before
delegating shared token semantics. It does not confer authentication, transaction
or storage authority on Rust. Separate Sol review must close this shard before
its Python implementation can be retired.

The [R6 temporal carrier checkpoint](evidence/rust-migration/r6-temporal/README.md)
now records the bounded Rust-owned token implementation and installed macOS
arm64 CPython 3.11 wheels. After an independent review found a raw-binding
microsecond-range defect, the native boundary was corrected and rebuilt; the
second Sol review found no remaining P1/P2 in this slice. The installed temporal
and codec/native suites pass 10 tests, with additional Python datetime-oracle
and raw-binding refusal-order evidence. This retires only the Python token
calculation in the stated profile. The broader access test discovery still has
23 generated-package/optional-dependency setup errors, and the moving worktree
has no complete source-to-wheel release closure. Other R6 access algorithms,
native integrations, platform/interpreter matrix and R8 gates remain open.
The later public `umf.rust_temporal` bridge removes a cross-package private
import; its rebuilt installed wheels passed those 10 focused tests and 59 P1
runtime compatibility cases. A separate Sol review found no P1/P2 in the
bounded bridge follow-up. Access CI now builds the pinned native core wheel
alongside each access wheel before installed-package replay.

The next R6 slice is exact integer-width and Decimal precision/scale admission
from `umf_access.values`, governed by CONTRACT-068/070/072. These operations
consume already resolved facets and do not depend on the remaining R5 native
classifiers or on JavaScript numeric interpretation. Freeze predecessor outcomes
before changing either function. Python retains exact carrier admission,
`Decimal.as_tuple()` extraction, original-object return and error translation;
the versioned public `umf.rust_values` bridge delegates width and
coefficient/exponent decisions to Rust. The interface must preserve
arbitrary Python integer metadata without narrowing, avoid constructing powers
of ten for large exponents, and fail closed on absent or mismatched capability.
Independent Python integer/rational oracles, newly built installed core/access
wheels, generated numeric codecs and reached native PostgreSQL/Weft consumers
are required before counting the broader access behavior. The
[bounded R6 exact-values checkpoint](evidence/rust-migration/r6-exact-values/README.md)
records 14 focused installed-wheel tests and two Rust unit tests. Independent
Sol review reproduced both wheel hashes, replayed all 14 tests from a clean
installation, and found no P1/P2 correctness issue; 10,000 independent integer
interval cases, malformed raw inputs, arbitrary-size integer metadata, and
huge-exponent negative-zero identity also passed. The earlier failure in two
reused environments was stale installation state, not a wheel defect. Generated
numeric codec and native consumer qualification remain open. A separate local
installed-wheel replay passed 17 runtime codec, codec boundary, golden-vector
and Delta projection tests, but it did not reach a native engine or generated
client installation. The raw binding
accounts work but has no host meter, cancellation,
deadline or hard budget, so it makes no resource ceiling claim. Other
`values.py` algorithms remain open.

The bounded R6 exact numeric range admission in
`umf_access.values.validate_range` now delegates comparisons to Rust.
CONTRACT-049/068/070/072 govern resolved range facets and Python host
ownership. Predecessor source and complete endpoint, bound-carrier,
inclusivity-truthiness, ordering, zero, trailing-zero and huge-exponent outcomes
were frozen before editing. Rust compares integer and finite Decimal values exactly
through a separately versioned public bridge, while Python keeps carrier and
bound admission, `Decimal.as_tuple()` extraction, error translation and
original-object return. This does not include `validate_allowed`, length,
vectors or the wider codec/driver surface. Independent integer/Fraction
oracles, malformed raw controls and clean installed wheel replay passed in the
[numeric range checkpoint](evidence/rust-migration/r6-numeric-range/README.md).
Independent Sol review reproduced the wheel hashes, 17 focused installed tests
and 20,000 independent Decimal comparisons and found no P1/P2. Actual generated
numeric codec paths and reached native PostgreSQL/Weft checks remain open.
The current raw numeric bridge still lacks a hard host work/deadline/cancel
contract; its work accounting cannot be represented as a resource ceiling.

The bounded [R6 Python string admission checkpoint](evidence/rust-migration/r6-string/README.md)
moves the Unicode-scalar decision for exact built-in `str` to a versioned Rust
core/PyO3 bridge. The binding streams CPython code points without a UTF-8
conversion or whole-string copy, so lone surrogates remain observable. Python
retains the initial carrier check, original-object return, and the predecessor's
iteration, short-circuit and exception behavior for `str` subclasses. The
frozen 18-case CPython predecessor packet, focused Rust meter/cancellation
tests, an installed CPython 3.11 wheel and 19 focused access/projection tests
pass; an independent Sol review also checked all 1,114,112 CPython code points
through the raw installed binding and found no P1/P2. The recorded wheel is a
historical source cohort because concurrent R5 schema edits followed its build.
The raw bridge has no host work ceiling, deadline or cancellation callback;
final-cohort wheel rebuild, other Python platforms and live native consumers
remain open.

The bounded R6 binary32 slice delegates per-scalar IEEE float32 classification
from `validate_vector` and `validate_float32` to Rust through public
`umf.rust_values` capability `umf-access-float32/0.1.0`. Python retains exact
tuple/dimension/carrier admission, error translation and original-object return.
The [float32 checkpoint](evidence/rust-migration/r6-exact-values/README.md)
records frozen predecessor behavior, installed macOS arm64 CPython 3.11 wheel
hashes, independent Fraction-oracle outcomes and local codec/projection checks.
Independent Sol review replayed 100,000 seeded binary64 values and 34 signed
overflow-midpoint neighbors with no P1/P2. Vector work/deadline/cancellation
limits, generated vector clients and reached native consumers remain open.

The next bounded R6 shard moves `validate_length` and `validate_allowed` scalar
decisions from `umf_access.values` to Rust under public
`umf-access-constraints/0.1.0`. Python retains exact carrier admission, `len`,
ordered iteration, original-object identity, and candidate-side custom equality
with its truth conversion and exceptions. Rust handles exact integer length
bounds and generated scalar equality for bool, int, Unicode-scalar str, bytes,
and finite Decimal. Predecessor controls include supplementary/combining
Unicode lengths, exotic bound comparison traces, allowed generators, custom
candidate equality, NaN, signaling NaN, huge integers, and exception identity;
an independent Fraction oracle covers finite Decimal equality. The
[constraints checkpoint](evidence/rust-migration/r6-constraints/README.md)
records installed macOS arm64 CPython 3.11 wheel hashes, 31 focused installed
tests across constraint/range/value/codec/golden suites, two Rust tests and raw
binding refusal controls. An independent Sol review found that a surrogate
candidate string needed the Python equality path even when the input string was
scalar-valid; the guard now checks both operands and the rebuilt installed
regression passes. Reopened Sol review verified 42 installed tests and both
wheel hashes with no remaining P1/P2. The bridge exposes no
host meter, cancellation, deadline or hard resource ceiling. Generated validation
order received a local codec check; native PostgreSQL/Weft/Truss/Ashlar/TableSpec
consumers and generated client installation remain open, as do other access algorithms, platform
cohorts and the broader R6 port.

The [R6 stream page-size checkpoint](evidence/rust-migration/r6-stream-page-size/README.md)
ports the `pages.py` maximum-value admission decision through Rust while retaining
Python's live mapping lookup, comparison, truth conversion and exception identity.
After repair of repeated-lookup, short-circuit and truth-conversion drift, an
independent Sol rereview matched all 10 adversarial predecessor traces. Fresh
macOS arm64 CPython 3.11 installed wheels passed 21 stream/lifecycle tests and
two focused Rust tests; the reviewed core and access wheel SHA-256 values are
`290c05813b260790e66db950fb7045e800b7cbb611790ddd90d3676201a80bf5`
and `d84d55473517b0ddfde01d2e1f5b4629dd101b300253a49449316a01804198e6`.
Sol found no remaining P1/P2 in this bounded slice. Native PostgreSQL/Weft
consumer qualification and broader resource ceilings remain open.

The bounded [R6 operation-values checkpoint](evidence/rust-migration/r6-operation-values/README.md)
moves canonical operation JSON, SHA-256 digest, bounded frame encoding,
duplicate-key admission and authenticated page-cursor decisions to Rust for
exact built-in Python JSON-like carriers. Independent Sol replay passed three
Rust and 21 focused CPython 3.14 tests, including signed noncanonical cursor
order, arbitrary-precision frame limits, the 16,384-character cursor boundary,
escaped duplicate keys and reserved-key retention. It found no remaining P1/P2
in that scope after repair. Canonical/digest host input materialization,
installed-wheel replay, native consumers and the remaining request/result
algorithms are open R6 gates; no whole-package parity follows from this slice.

The next bounded `key_literal` decision in the same
[R6 operation-values evidence](evidence/rust-migration/r6-operation-values/README.md)
routes exact built-in string carrier selection and absent-key refusal through
Rust. The Python wrapper retains custom carrier comparisons and returns the
original value object; a surrogate-preserving PyO3 bridge keeps malformed
Unicode carrier text from changing pass-through behavior. Independent Sol
rereview reproduced lone-surrogate, `None` precedence, identity and custom
exception controls against a fresh native extension with no remaining P1/P2
in this operation. `native_arguments` remains Python-owned because arbitrary
mapping lookup, hash/equality and index behavior cannot be eagerly projected
without changing observable order. The source-tree check is not an
installed-wheel or complete R6 qualification.

The next [R6 typed-token source slice](evidence/rust-migration/r6-operation-values/README.md)
routes exact built-in integer, decimal, UUID and bits128 result-token decisions
through Rust while Python preserves lookup, Unicode error order, token identity
and Decimal `InvalidOperation` context flags. A source-only Sol review found no
remaining P1/P2 after exponent and flag repairs. A fresh Darwin arm64 Rust 1.90.0
CPython abi3 core wheel and access wheel now pass five focused Rust tests and
19 installed Python tests on CPython 3.12.15 with ordinary package imports.
The same wheels pass the 19 focused tests on CPython 3.11.17 with ordinary
`umf` and `umf_access` imports after installing Pydantic 2.14.1 and its
dependencies from an existing offline cache into the temporary test
environment. `unittest` discovery ran the focused suite because pytest was
not installed in that interpreter. Source hashes stayed unchanged through
both wheel builds and replays, with wheel hashes in the
[additive receipt](evidence/rust-migration/r6-operation-values/typed-token-wheel-replay-2026-10-23.json).
Independent Sol replay confirmed the wheel hashes and 19 focused outcomes on
both interpreters with no P1/P2 in this installed-wheel scope.
The in-package result-frame path was exercised with supplied native rows, not
a database-backed consumer. Native PostgreSQL, Weft, Truss, Ashlar and
TableSpec consumers, broader `value_from_native` carriers and remaining access
algorithms remain open; this does not close `value_from_native` or R6.

The next [R6 native-result carrier slice](evidence/rust-migration/r6-operation-values/README.md#date-timestamp-and-float-carrier-follow-up--2026-10-23)
moves built-in date, timestamp-shape, finite decimal-float and binary64-hex
admission into Rust. Python retains mapping access, Unicode failure order,
conditional encoding lookup, binary64 `repr` and the final timestamp parse;
CPython 3.11 and 3.14 differ on hour-24 timestamps. Sol independently rebuilt
the binding and reproduced six Rust tests, 21 focused Python tests and all 43
frozen cases on both interpreters. A fixed-seed 12,000-case float comparator
and its two receipts replay byte-for-byte after an evidence correction; Sol
found no remaining P1/P2 in this bounded source-tree cohort. Installed-wheel
replay, native consumers, host deadline/meter controls and the rest of
`value_from_native` remain open.

The bounded [R6 related-Key payload parser](evidence/rust-migration/r6-related-key-payload/README.md)
has an iterative Rust core and an opt-in PyO3/Python facade. Its frozen
parser-applicable matrix covers 106 observations; the full facade replay matches
112 frozen outcomes across CPython 3.11.17 and 3.14.8. An initial wrapper
refactor changed the default decoder's recursion refusal; the original direct
`json.loads` call frame was restored and independently probed. Sol found
additional custom-recursion-limit divergence in the opt-in parser. The
112-outcome facade replay passes again on both interpreters. A corrected
direct-call 20-control matrix, which does not interpose a Python wrapper or
profiler on production outcomes, finds 12 one-container-late Rust parser
refusals on CPython 3.11.17; all 20 direct outcomes match on CPython 3.14.8.
Wrapper and profiler entry counts perturb near-limit behavior and are retained
only as historical diagnostics. Experimental fixed-guard changes were reverted
because they overcorrected; custom-limit parity remains an explicit gate, with
no default cutover pending independent review of the corrected matrix.
Installed generated-client and native PostgreSQL/Weft qualification, broad
resource behavior and default cutover remain open.

An additive [direct-call recursion repair](evidence/rust-migration/r6-related-key-payload/README.md#cpython-311-recursion-repair--2026-10-23)
accounts for the active `json.loads` frame once at the first container on
CPython 3.11, leaving the 3.14 profile unchanged. The same 20 frozen direct
controls now have zero mismatches on each interpreter, and the 112-outcome
facade replay remains exact. Independent Sol review reproduced the old 12/20
3.11 failure and the repaired 0/20 result, and proved the authored regression
fails against the old extension. This closes that bounded recursion mismatch;
the generated commerce fixture remains stale, so full package, native consumer,
hard resource and default-cutover gates remain open.

The next candidate is the authenticated table-outcome receipt family in
`umf_access.unified.outcome_values`. Its HMAC preimages, principal/slot custody,
stored-record verification and occupied-slot refusal require a frozen Python
predecessor trace and a separately reviewed Rust/PyO3 interface before any
production cutover. A [CPython 3.11/3.14 predecessor packet](evidence/rust-migration/r6-outcome-values/README.md)
now captures exact canonical bytes, HMAC stages, payload and key limits,
first-refusal order, and source-level occupied-slot sequencing. Sol cleared a
narrow Rust HMAC/slot/fixed-byte-compare shard while retaining Python receipt
objects, equality, type checks and transaction sequencing. Its parity mode and
extension-identity supplement are corrected for new reports; historical
reports remain executable-unbound. A fake writer proves occupied forged and
authenticated-but-mismatched receipts refuse before effects or insertion, and
the focused CPython 3.11 installed environment passes six existing outcome
tests plus two short-circuit tests. Sol's next interface review identified an
unbounded HMAC preimage copy and missing native capability handshake. The
opt-in primitive now streams the preimage into HMAC and declares a versioned
native capability; Sol found no remaining P1/P2 in that bounded source delta.
The final combined CPython 3.11 abi3 0.11.0 wheel, SHA-256
`02b6b8fe766993c615902b2a7b90e75505657fc6f74fe0a4d3adccf7146c8335`,
is installed under CPython 3.11.17 and 3.12.15; both load the same extension
and pass the frozen 17-case receipt/8-slot replay. That replay runs the frozen
Python predecessor using the installed operation-values dependency; it does
not substitute Rust into receipt construction or verification. Separate
CPython 3.11 bridge and occupied-slot tests pass 6/6, Rust primitive tests
pass 4/4, and identity controls pass 6/6. Independent Sol review verified the
wheel, source/resource closure and both installed profiles without P1/P2.
Native PostgreSQL/Weft consumer qualification and default outcome cutover
remain open. Native database transaction authority stays with the Python driver.

The bounded [CPython 3.14 regex profile](evidence/rust-migration/r6-python314-regex/README.md)
adds versioned Unicode 16 tables and character names, `\\z`, and the 3.14
empty-input `\\B` behavior without changing the prior 3.11–3.13 table rows.
An independent Sol review replayed the 412-row CPython oracle and 15 focused
Rust tests with no P1/P2. The source-tree PyO3 smoke also passed six CPython
3.14 assertions. Installed wheels, other platforms and broader regex behavior
remain unqualified; R6 is open.

1. Close shared lossless native JSON/code units, exact literal/temporal/copying,
   URI/resources, registry and schema-validation substrates. Preserve R2/R3
   ownership and authored metamodel authority.
2. Port model selection/edit/ideal operations and required extension validators,
   then native representation, interpretation and projections in family slices.
   Read each current contract/design/test plan and execution amendments first.
   JSON Schema precedes dependent projections; Protobuf descriptor/source precedes
   JSON Schema-to-Protobuf; Avro precedes its projections; GraphQL precedes input
   projection; OpenAPI follows schema/resource scope. Dependencies govern order.
3. Close every remaining active family in the successor census, including
   Arrow/Parquet/Delta/Iceberg, PostgreSQL/SQL Server/Spark, RDF/JSON-LD/SHACL/OWL,
   generalized RDF, TypeSpec/Smithy/LinkML/ODCS/dbt/TableSpec, extensions/actions/
   security/tables, domain packs and projections. Difficult upstream compilers
   are named blockers, not permission to omit an existing operation.
4. R6 moves UMF-owned access request/codec/planner/checking semantics after their
   R5 prerequisites. Python retains connection/session/async/transport glue;
   consumers retain authentication, transactions and storage execution. Replay
   changed genuine installed PostgreSQL/Weft/Truss/Ashlar/TableSpec paths, exact
   results, cancellation, commit uncertainty and authorization.
5. R7 switches packaged Node/Bun and actual browser WASM defaults after their
   families qualify. Port reached metamodel/reference/pack/build computation;
   retain UI/orchestration/test harness glue. Remove old active semantic modules,
   imports and dependencies only after replacement review. No shipped fallback
   engine or duplicated handwritten semantic kernel may remain.

The [R7 clean compiler bootstrap checkpoint](evidence/rust-migration/r7-metamodel-bootstrap/README.md)
now builds the source-bound metamodel CLI without codegen's generated resources,
while preserving the default codegen CLI. The isolated generated-output-free
fixture, seven authored resource hashes, fixed point, typecheck and focused CLI
tests pass after regeneration and independent review. Reached reference/pack
computation and default-client retirement remain open.

The [R7 standalone WASM package checkpoint](evidence/rust-migration/r7-wasm-package/README.md)
copies the three shared JavaScript carrier helpers deterministically into the
package and rejects stale copies before packing. An independently repacked and
freshly extracted 10-file tarball passed Node 26.12.1, Bun 1.4.3 and Chromium
153.0.8010.12 checks: core copy/JSON, 389 bit128 vectors, 50 Field-value cases
including 11 native `TypeError` outcomes, cancellation, metering and absence of
browser Node globals. The reviewer used the captured WASM binary rather than an
independent Rust rebuild. This qualifies only the tested opt-in package cohort;
complete export-surface qualification, default-client cutover and publication
remain R7/R8 work.

The [R7 tooling inventory](evidence/rust-migration/r7-tooling-inventory/README.md)
hash-binds the 31 historical metamodel, reference and schema-browser roots to
their current sources and classifies their Rust kernels, generated data, host
orchestration and UI responsibilities. Its first proposed native CLI slice is
reference self-model admission with source-manifest provenance and graph checks.
The inventory does not establish a fresh recursively closed R7 census or retire
any active operation. Independent review, implementation and default activation
remain open.

The first R7 self-model admission source slice now has a Rust metamodel API
and bounded native CLI route with a frozen authored source, manifest, catalog
and graph. It uses `parse_model` without invoking `compile_model` and does not
activate the Bun reference consumer. Independent Sol source review found and
closed malformed null-container/member parity, native/WASM work-accounting and
intermediate-text limits, including an exact `elements:null` diagnostic. The
frozen Bun controls pass 8 tests/38 assertions and the 31-root inventory check
passes. The focused Rust reference suite passes 16 tests, including a
four-million-plus-unit preowned field label and late cancellation; the native
CLI catalog test passes both normally and with `--no-default-features`. The
metamodel check passed once after intermediate output regeneration on 2026-10-23.
An additional reviewed bounded source delta raises the focused Rust suite to
18 tests with supported malformed-value/refusal controls, and an installed
CLI passes the frozen catalog with its child `PATH` empty. The Bun predecessor
still passes eight tests/38 assertions. Sol found no remaining P1/P2 in this
delta. The source-cohort metamodel outputs were regenerated after the
2026-10-23 `origin/main` merge and again after Rust core commit `61fceefd0`;
the latter fixed-point check passes. The [refreshed R7 tooling inventory](evidence/rust-migration/r7-tooling-inventory/README.md)
binds its first-port and activation hashes to that cohort, including manifest
SHA-256 `8adcdceec1380a0ede08fc86756e6a1fa23505626197c5e6f83bfd5e4fc0d912`.
Consumer parity and default activation remain open, so the source slice is not
yet a full R7 qualification. Later core edits require a new fixed-point check
and inventory refresh.

The 2026-10-23 integration checkpoint has not closed R5–R8. The
[bounded Avro inspection wire](evidence/rust-migration/r5-avro-semantic-inspection-wire/README.md)
now has opt-in Rust wire, CLI, Python and Node/Bun entry
points; every result remains `complete: false`, and default Avro import/export,
datum behavior, logical types and edit semantics remain active predecessor
work. A frozen `6cd866f6ecb2ebdc879140d2192a393f3092fa79` source snapshot
built a macOS arm64 Python wheel and source archive, plus a native Node addon.
The packed Node addon loaded under both Node and Bun, and its focused Avro
inspector test passed 3/3 after correcting the test to use the supported
`controls.meter` callback. A clean pip install passed exact wheel/RECORD
verification for all 56 installed files, including the native extension and
CLI, and the installed Avro inspector passed 5/5 focused tests. An uninterrupted
offline extracted-sdist rebuild then passed the pinned source guard over 650
inputs and produced a macOS arm64 wheel. Its 0.11.0 metadata, tag and 47
non-native package payloads matched the direct wheel; native extension and CLI
binary hashes differed, so this is not a reproducible-native-binary claim. The
direct and rebuilt wheel SHA-256 values are
`f1c5bb225b6aa107e74557f3c1914a862283eed5c68c168e5998c28100adfe9a` and
`f766a30943ef762dd300dca0d8d4e796850a06ef146f6e71d0faa390512a0b6d`.
The earlier interrupted verifier compared against a source snapshot whose
Node test was corrected after archive creation; restoration and the successful
rerun resolved that test-harness mutation. An earlier installed Python run
completed 412 tests and failed three; one obsolete fake-Cargo expectation was
corrected and its focused rerun passed. Commit `7eadbfa06` routes no-controls
Iceberg and JSON Schema wrapper calls directly to the native wire entry point,
with explicit host controls retaining their callback path. Focused mixed-cohort
replay/control runs passed 4/4 and 2/2; Sol found no P1/P2 in that wrapper
slice. A full Python run using the verified `6cd866f6e` wheel plus only those
two wrapper overlays completed 416 passed and four failed in 699 seconds.
All four failures compared installed resource/source digests or compiler
fingerprints against a newer worktree cohort; no adapter `METER_FAILURE`
appeared in that run. The original intermittent meter failure remains
unclassified, and a fresh single-cohort installed run is required. The frozen R5 JSON
Schema installed replay matched 27/30 cases; the remaining three are
conservative `JSON_SCHEMA_VALIDATOR_LIMIT`/incomplete outcomes, not parity.

R6 outcome-crypto ownership moved to the existing Rust HMAC/SHA/constant-time
comparison seam, with Python retaining receipt canonicalization, validation
order and buffer admission. The related-Key default now selects Rust for exact
string payloads on CPython 3.11 and 3.14 after metadata and profile admission;
CPython 3.12/3.13 retain `json.loads`. The older `6cd866f6e` native wheel
changed 12/20 CPython 3.11 direct recursion thresholds, so it is not evidence
for this default. An exact-current-source native overlay with binding source
SHA-256 `d5f99acccc49c8d2f4bf89b94c4673ad3af3585cfbd223b9e490f03738a56114`
and extension SHA-256 `9908b33f12b89ea2e58bfc209322799cea3e7590eac12f7ce3064ad8a9a23787`
matched 56/56 frozen observations and 20/20 unprofiled direct controls on
each of CPython 3.11.17 and 3.14.8. Independent Sol review found no P1/P2
in this bounded source/default slice. Installed access-wheel controls,
generated consumer reads and native PostgreSQL/Weft read/page/stream behavior
remain open; R6 is not qualified as a whole.

R7 metamodel regeneration after the Avro source edit exposed a stale output
manifest. Independent review then found that the source-bound compiler cache's
external resource list omitted production adapter `include_str!` inputs,
including generated resources. Commit `60ceca8c9` isolates those adapters
behind default features and builds the compiler-only CLI with no default
features. A cold copied-source check deleted generated outputs and adapter
resources, then built the compiler-only CLI, ran metamodel output admission
and retained the scoped Avro inspector CLI test; it exited successfully.
This closes that compiler resource cycle for the pre-main-merge cohort, but
does not yet establish a new generated-output fixed point. Commit `b39054b5a`
switches only the authored reference self-model build consumer to the
source-bound Rust CLI for parsing, provenance and graph admission while Bun
retains source custody and output staging. Its exact string-ID authored subset
passed 10 focused Bun tests with 46 assertions and five no-default CLI tests,
including actual CLI diagnostic mapping, a rehashed fixture and staged output
bytes. Sol found no remaining P1/P2 in that bounded activation. General
dynamic/non-string reference behavior, the reference/browser journeys and
other default consumers remain separate R7 gates. The public TypeScript barrel
still exports active predecessor semantics, so R7 default cutover and the R8
zero-owner, installed-host, browser, CI and release gates remain open. Recheck
feature isolation and fixed point after the extension-kind main merge.

The 2026-10-24 current-main integration commit `108a0ba3a` incorporates the
extension-defined-kind work at `f5f4b7dbef12a757bc0bba6ae2f581998fe50dba`.
An earlier whole-workspace run exposed a 2 MiB `allOf` helper-stack overflow;
the repaired helper passed its focused stack suite and a subsequent
`cargo test --locked --offline --workspace` run exited successfully, including
the 139-vector core-wire dispatcher and Iceberg corpus. That run compiled the
source immediately before the later Avro wire and dynamic-anchor cache edits,
so it is an integration checkpoint rather than final-source qualification.
The ordinary workspace run intentionally ignores the report-dependent R5 JSON
Schema full-corpus test; its upstream-oracle wrapper runs that test with
`--ignored` and a fresh report. The 139-vector dispatcher took 621.70 seconds
on this source/toolchain cohort, materially longer than historical R2 runs.
Independent analysis identified repeated dynamic-anchor resource walks as a
likely cost amplified by the larger current-main schema. A reviewed
resource-local cache passed seven focused Draft 2020-12 tests, including
dynamic references, warm-cache host-callback reentry and
cold/warm work refusals. The same 139-vector test on the corrected source
passed in 472.23 seconds with all fresh `Engine::new` calls retained, versus
621.70 seconds before the cache. This is a debug-test improvement on this
machine, not a release-mode latency claim; final-source workspace and hosted
qualification remain open.

After the opt-in binding projection and action evaluator repairs, an integrated
`cargo check --locked --offline --workspace` and then
`cargo test --locked --offline --workspace` both exited successfully on Rust
1.90.0. The latter passed the 139-vector core-wire dispatcher in 473.14
seconds, Iceberg wire in 205.79 seconds, the nine binding projection tests and
the focused action evaluator within the workspace. This checkpoint precedes
the planned canonical-numeric, binding-inspector and staged-codegen Rust edits;
it is not the frozen final-release cohort. The report-dependent JSON Schema
upstream corpus and trusted-protoc test remain separate ignored tests requiring
their exact local or hosted prerequisites.

R5 now has an opt-in Avro candidate-edit core, versioned report and Rust
wire/CLI route. The candidate source/dependency edit preserves authored order
and unknown content, admits both source and candidate, and reports native
inspection separately. The [candidate wire packet](evidence/rust-migration/r5-avro-candidate-wire/README.md)
passed four wire tests across 16 frozen cases, three CLI tests, and focused
no-default-feature compiler checks. Opt-in Python and Node/Bun bindings pass
focused native tests. An official `umf-core` 0.11.0 wheel with its declared
dependencies passed normal installed-package imports and three candidate-edit
tests on both CPython 3.11.17 and 3.14.8; Sol verified wheel RECORD and installed
bytes. That wheel predates the latest metamodel/resource pins, so the release
artifact must be rebuilt and replayed. Default Avro routing, native-oracle
comparison, browser binding and broader adapter parity remain open.

The R5 binding-family [index projection Gate0](evidence/rust-migration/r5-binding-index-projection/README.md)
freezes complete `projectBindingIndexes` strict/report outputs and exact
refusals from five target profiles and boundary variants. Its 200 pinned inputs
include the transitive import/resource closure; 13 Bun tests pass with 323
assertions, and independent Sol review found no remaining P1/P2 in this
predecessor packet. The approved next slice is an opt-in generic Rust
projection. The TypeScript default and downstream native target effects remain
open. The first Rust candidate passed five frozen fixture tests but independent
review found incomplete source admission, Delta version normalization, and
discarded diagnostic-control errors. These are blocking corrections before the
candidate can be qualified.
The repaired opt-in projection now uses prepared immutable core/binding
validators and a fresh context per call; nine focused Rust tests pass in 3.46
seconds, including malformed input, exact Delta spelling, late meter failure
and same-resource recovery. Sol found no remaining P1/P2 in that bounded
source cohort. A separate [binding inspector Gate0](evidence/rust-migration/r5-binding-inspect/README.md)
freezes full `Validation` reports and admission precedence for 0.1/0.2/0.3;
four Bun tests pass with 168 assertions and Sol approved only an opt-in 0.1/0.2
generic inspector next. The 0.3 profile and current consumers remain separate.
The first opt-in Rust inspector passed its three-test focused frozen
differential, but independent Sol review reproduced four P2 gaps outside those
captures: logical nonfinite-number admission preceding binding validation,
the second conditional-schema error for column plus `documentColumn`,
last-assignment field lookup after duplicate identities, and ECMAScript
enumeration order for numeric unknown keys. The implementation is under
correction; its passing frozen subset does not qualify inspector parity or
consumer cutover.
The first repair matched all four repros, but Sol's rereview found two
combined admission edges: numeric unknown-key order within the raw Rust
`Value` tree, and a trusted host-control error with code `NUMBER` being
misclassified as a data diagnostic. A private ordered admission copier and
control-origin guard corrected those edges. A global change to shared `copy_json`
would require a separate caller census and wider regression; this bounded
inspector repair does not establish that broader property.
The second repair passed independent Sol rereview at inspector source SHA-256
`88acb5fc08cfb602ff5d844b7620ee8b70c8835efb69ed32b425466c93ef5372`.
The six additive TS controls, four focused Rust tests, both original and
combined-edge repros, nested numeric key order, duplicate/depth/value limits,
host-control provenance, metering and recovery showed no remaining P1/P2 in
the bounded opt-in 0.1/0.2 profile. The successor 29-file receipt SHA-256 is
`8c057792fc09a3cc11bbd06bbedef9b803f6880258c35f437dad4c84c5f3c26d`.
Its historical manifest remains unchanged; installed binding hosts, 0.3
carrier semantics, default consumer routing and final release cohort are open.

The R5 action-rule [predecessor packet](evidence/rust-migration/r5-actions/evaluate-action-rule/README.md)
freezes 49 cases from the current TypeScript evaluator. An opt-in Rust
evaluator matched 46 exact outcomes; accessor-bearing JavaScript state and two
multi-megabyte arithmetic boundaries remain open. Independent review found
control-error remapping, input refusal-order differences, collapsed literal
diagnostics, and unmetered arithmetic result work. Those issues were repaired,
as was a later falsy-`outputs` parity mismatch; Sol found no remaining P1/P2
in the bounded 46-case source cohort.
The original Gate0 source pins remain historical while concurrent metamodel
and package edits move the tree; current-cohort qualification requires a new
source-bound capture.
The first corrections passed focused Rust and interim current-source differential
checks. At that checkpoint the two four-million-digit cases still required
canonical-digit arithmetic preserving the complete admitted decimal
exponent/scale grammar and refusal order, with metered normalization,
carry/borrow, output construction and live cancellation.
The canonical-digit Rust completion now passes both previously open four-million-
digit result-boundary cases and all 92 supplemental numeric controls. At reviewed
`literal.rs` SHA-256 `7e0451f79987f35418d280c50cb3b46fbd16a1913384658f6e06745aaca1b286`
and action evaluator SHA-256 `87b64d9c597eeb4a722aa47c5e54dfdb66dcc4981ee1c1183f60ec02f90781b9`,
Sol independently ran 12 action and 16 core literal Rust tests and the two Bun
numeric capture/receipt tests; no P1/P2 remained in this bounded numeric slice.
Accessor-bearing JavaScript state, complete action support, bindings/default
routing and a frozen final-source release cohort remain open. Historical Gate0
and prior current-review closure hashes were not rewritten to match this later
source; their behavioral captures still pass but their live-source closure
checks cannot qualify the later cohort.

R6 has an opt-in Rust reviewed-parameter scanner through PyO3 for exact Python
strings; the Python host retains digit parsing and exception order. Source
tests pass on CPython 3.11 and 3.14. The [DB-API transport packet](evidence/rust-migration/r6-dbapi-transport/README.md)
and focused source tests cover reviewed positions, refusal order, percent
escaping and sealed/legacy routing. A current-source abi3 wheel-derived native
overlay matched all 13 frozen transport cases under CPython 3.11.17 and 3.14.8;
Sol verified its wheel/extension/source hashes and found no P1/P2 in that
bounded evidence. The harness supplies an artificial `umf` package and extracts
access functions from source, so this is not a full installed-package claim.
Native database/driver, Weft-backed build and installed access-wheel
qualification remain open.

R7 has a structural-comparison core, wire, Node/Bun and WASM wrapper.
The [candidate evidence](evidence/rust-migration/r7-schema-comparison/README.md)
includes frozen predecessor, focused Rust/wrapper tests, built Node/Bun addon
and extracted WASM package execution in Node, Bun and real Chromium. The
schema-browser default build now compiles pinned Rust WASM offline, ships its
asset, and awaits initialization before exposing the existing synchronous
comparison API; there is no production TypeScript comparison fallback. Its
packed/offline-installed package passed 30 real Chromium checks, including
missing/corrupt asset import refusal. Two clean builds produced byte-identical
release, asset, provenance and checksum manifests. Sol found no remaining
P1/P2 in the default cutover after the provenance collector was expanded to
the complete current local Cargo source and literal resource closure. The
extracted WASM package also passed the eight frozen cases and
work/depth/cancellation, first-refusal, recovery and missing/invalid-asset
matrix in Node 26.12.1, Bun 1.4.3 and Chromium 153.0.8010.12. This is the
schema-browser comparison default cutover only; later Rust source edits require
a rebuilt artifact and renewed provenance/authority checks, and broader R7
consumer and release qualification remain open. R8 authority-bound census
controls pass 17 Python unit tests, but the active successor census is not
zero-owner and final release gates remain open. A provisional live census
before the browser default edits found 594 semantic modules, 329 active
scripts and 137 unresolved ownership rows. A later moving-tree capture found
599 modules, 332 active scripts and 244 locked JavaScript packages but refused
its stale metamodel digest; it is not a qualified successor census. Of the
earlier 137 rows, 102 were reachable
active TypeScript entries; many overlap partial Rust implementations and need
symbol-level reconciliation rather than wholesale reimplementation. Three
active rows are types-only. Thirty-five unrooted rows need activation/intent
review before they are counted as default executable work. Regenerate and pin the
metamodel/resource source closure after the current edits, then rerun all
affected boundaries, installed hosts and independent review on one frozen
cohort before claiming R5–R8 completion.
The census checker permits read-only stale-cohort difference diagnostics but
cannot return success for matching stale bytes or overwrite the canonical
census under stale authority. Its 35 inventory/boundary unit tests pass, and
Sol found no remaining P1/P2 in that guard. This is diagnostic machinery, not
the zero-owner release result.

A read-only decomposition of the historical R4 census identifies 418 reachable
TypeScript rows assigned to R5, R5/R7 or R7, with 4,109 declared public exports
and 2,151 statically reachable algorithm symbols. The rows span 142 adapter,
94 core-ideal, 73 extension, 41 model, 40 projection, 14 validation, nine
domain-pack, two generated, two registry and one root-barrel modules. These are
historical module/symbol counts, not 4,109 independently unported operations:
type exports, forwarding barrels, host boundaries, already ported subsets and
inactive entry points need symbol-level dispositions. Conversely, a module-level
Rust owner does not close all its exported operations. Before R8, record each
reachable executable export's Rust owner or justified host role, its default
route and predecessor retirement evidence, then regenerate the exact-source
census. Passing the Rust workspace tests cannot substitute for this gate.

A first [R8 symbol-level export map](evidence/rust-migration/r8-symbol-inventory/README.md)
now records eight source package routes, including the executable
`./loader-contract` subpath, and 1,135 route-specific runtime declarations
across 504 source files after the V4 opt-in route was added. A review of the
first capture found it omitted 198
public JSON resource exports from `spec/`; the corrected map includes them.
All 1,135 still lack exact operation/resource authority and retirement
dispositions; 922 default root declarations remain sourced from TypeScript and
198 default root JSON resources come from `spec/`. Coarse path-family owner labels and zero unassigned labels are
navigation aids, not a zero-owner result. Active scripts, CLI/Python APIs,
transitive helpers, installed archive routing and contract-specific Rust mapping
still require the broader authority-bound R8 census. Sol independently
reproduced the earlier corrected six-route `--check`, verified its route/build
correspondence and 87 direct root JSON re-exports, and found no P1/P2 false
closure in that bounded inventory. Sol subsequently reviewed the two V4
opt-in routes and refreshed the eight-route capture after the V4 source
repair; its `--check` passes at the pinned inventory hash. That review still
leaves all 1,135 exact retirement dispositions unresolved. Future type-only
aliases, ambient declarations, erased
const enums and changed condition targets need additional negative controls
or renewed review before the inventory can serve as final release authority.

Within the 922 still-TypeScript default-root runtime declarations, the largest
source families are adapters (391), core ideals (254), extensions (112), model
(85), projections (52), and domain packs (14); the remaining 14 are scattered
across smaller source families. These are declaration counts, not distinct
operations or estimated port effort. The family split makes adapter and ideal
coverage an explicit R5/R8 release dependency instead of treating the growing
opt-in core slices as a completed default route.

The [authority-bound gap ledger](evidence/rust-migration/r8-symbol-inventory/README.md#authority-bound-gap-ledger)
now gives every package-root declaration an explicit row and groups it by
source/API family. Of 1,120 rows, 922 are executable TypeScript declarations
and 198 are inert JSON resources. Thirty-two declarations map to reviewed,
bounded opt-in Rust core operations; some now have separately qualified host
bindings, but none has default-route retirement. The other 890 executable rows
lack an accepted-operation disposition. A
separate 26-row JSON Schema/Protobuf supplement records exact owners and
scoped opt-in evidence without promoting candidate rows to parity or changing
default routing. All 922 executable declarations retain a TypeScript
default-route gap. The
census separately lists all 42 package scripts and 45 direct source-file
entrypoints, hashes 1,518 script sources while leaving non-entrypoint
reachability unresolved, and records eight CLI dispatch modes with feature
gates, recursive Python API surfaces and 14 hashed tracked Python package
assets. Ignored or untracked native binaries are excluded because clean
checkouts cannot reproduce them. It justifies no thin host boundary from
path/name alone. Resource authority,
installed routes, CLI detail and Python submodule/API status remain open. The
deterministic interim generator and focused test are under
`scripts/rust-migration/r8/gap-ledger.mjs` and `gap-ledger.test.mjs`.

The next resource pass resolves those 198 JSON aliases to 189 distinct
`spec/` files and records separate authoring, generator, package-route and
installed-qualification fields. Four aliases have metamodel-manifest authority;
112 have a candidate literal writer path whose input/write relationship is
unproved; 82 have no identified generator authority. The current production
SDK copy route is only a build rule, not a fresh installed artifact receipt.
Sol reviewed the status schema and an unresolved Arrow example without
promoting candidates to accepted authority. The fixed nine-resource Python
action-runtime manifest and its digest pin were refreshed from canonical
`spec/`; a single helper now checks the explicit name/source pairs before
wheel or sdist work. Sol found and closed two review gaps: a self-referential
manifest check and the source-archive checker's dependency on a literal Hatch
resource list. The final checker rejects missing, extra, substituted and
symlinked inputs; local source tests pass 45/45 and the actual Python source
archive inventory returns 736 files. The moving source tree still needs a
fresh gap-ledger capture, built-wheel/sdist byte checks and platform receipts.

A narrow exact-operation supplement now covers the 26 package-root JSON Schema
and Protobuf exports (13 each). Its generated rows separate 3
`accepted-opt-in-subset`, 13 `candidate-core`, 2 `partial-host-boundary`, 3
`unported`, and 5 `data-or-constant` dispositions, each with source/evidence
hashes and predecessor/native/host gates. The JSON Schema evidence remains
27/30 against its frozen predecessor with three known validator-limit
mismatches; the mapping does not imply full adapter parity. Protobuf
descriptor codec evidence is distinct from document operations, and source
compiler/emitter callbacks remain host-owned. All 922 executable root exports
continue using the TypeScript default, and zero exports are retired. Row-level
owner/evidence review and the final frozen all-source cohort remain open.
Sol independently reran the generated ledger check and 3/3 focused tests,
verified all 26 source/evidence hash closures and their unique status totals,
and checked representative Rust owner functions and literal core-wire dispatch
strings. That accepts the bounded inventory supplement; individual operation
parity, installed route and retirement decisions remain pending.

A later [source-pinned JSON Schema inspector replay](evidence/rust-migration/r5-json-schema-inspect/validator-limit-successor.md)
matches the unchanged 30-case predecessor and five controls in extracted Node,
Bun-native, Bun-WASM and Chromium candidates. The prior 27/30 result remains
historical evidence for its earlier source cohort. This qualifies only the
captured opt-in read-only profile. A separate [JSON Schema tree-operation
checkpoint](evidence/rust-migration/r5-json-schema-tree-operations/README.md)
now freezes parser/edit behavior: the full 22-case predecessor matches 16/22,
while duplicate/syntax/depth/value parser controls match; six edit outcomes
remain outside the strict Rust validator profile. A qualified type/properties
edit subset, including root-scalar `INVALID_EDIT` diagnostic order, passes
3/3 on Node 26, Bun 1.4.3, and HeadlessChrome 153 against recorded native and
WASM artifacts. The subset receipt pins the exact package/addon, glue, source,
and build hashes. This does not qualify general editing or change default
routing. Registry callback ownership, full Draft 2020-12 behavior, and release
qualification remain open.

A later opt-in tree-operation source cohort expands the deliberately bounded
edit profile to safe `minimum`, `minLength`, recursively checked `prefixItems`
and valid Unicode member names except `__proto__`. The unchanged frozen
22-case parser/edit packet now matches 22/22 in fresh Node, Bun and Chromium
artifacts. The earlier 16/22 result and three-case `minimum` refusal remain
historical source-cohort evidence. Independent [Sol review](evidence/rust-migration/r5-json-schema-tree-operations/sol-review.md)
reran seven focused Rust tests and required a corrected Chromium receipt after
Playwright's object transport omitted an own `__proto__` member from the first
receipt. The fixed in-browser assertion and JSON-text receipt preserve it.
Complete Draft 2020-12 parity, default routing and retirement remain open.

The independent R5–R8 gap review identified the next bounded core queue after
the schema-property and staged host-read candidates: CONTRACT-053 CSV Boolean
lexical validate/verify; read-only scalar, record-member and reference-link
inspectors; core facet inspect/declare/verify; core key/member authoring; and
key-tuple encode/verify/read/prepared operations. Each needs a frozen predecessor
packet, opt-in Rust route, independent source review, then its installed-host and
default-package gate. This queue reduces actual model gaps but is not the full
port: relationships, selection, semantic types, record/dataset/compact values,
evolution, action/security/table extension operations and broad adapter/native
ideal/projection families still need symbol-level disposition and qualification.

The opt-in core facet checkpoint is recorded at
[its evidence packet](evidence/rust-migration/r5-core-facets/README.md). The
review repair preserves merged length bounds and unknown qualifiers, validates
the complete historical bounds schema before version refusal, and retains lone
UTF-16 identity and qualifier units. Receipt schema/recomputation checks also
precede admission of the current document. Six focused Rust tests, seven
TypeScript predecessor tests, the full Python sdist test file, and a fresh
extracted-sdist offline core check pass. Independent Sol re-review replayed the
malformed and forged receipt ordering, earlier meaning/UTF-16 repairs and
resource-meter refusals, and found no remaining P1/P2 in this bounded core
slice. At that core-only checkpoint, tagged wire and Node/Bun/browser WASM were
unqualified; the subsequent binding checkpoint below covers those opt-in
routes. Production packages, exhaustive allocation-failure qualification and
default routing remain unqualified.

The subsequent bounded binding checkpoint is now recorded in the same
[facet evidence packet](evidence/rust-migration/r5-core-facets/README.md).
The four tagged operations match their frozen TypeScript predecessor cases in
an installed local Node package under Node 26.12.1 and Bun 1.4.3, and in rebuilt
WASM under Chromium 153.0.8010.12 and Edge 155.0.4283.62. Receipts pin the
installed tarball, addon/WASM assets, source cohort and predecessor packets;
all four hosts prove zero-work refusal. This extends the older native-only
checkpoint without changing default package routing. Independent Sol review
verified the exact source/packet/host-receipt pins and reran six Rust core tests,
one tagged-wire test, seven TypeScript tests (110 assertions), packed Node/Bun
and real Chromium/Edge replays without P1/P2 in this bounded slice. Armed host
cancellation and zero-work refusal pass. Mid-kernel cancellation, Python
exposure, maximum-size/allocation-failure boundaries and default cutover remain
open.

The core Key/Record-member authoring module now has a bounded opt-in Rust
checkpoint at [its evidence packet](evidence/rust-migration/r5-core-keys/README.md):
16 frozen TypeScript operation cases and 19 outcomes, complete envelope/refusal
comparison, six focused Rust tests, and eight Bun predecessor tests (99
assertions). Independent Sol review found and drove closure of three P2
failure-order defects in duplicate requests, lookup identity, and receipt
validation; a final malformed-key plus invalid-source vector makes the lookup
ordering check mutation-sensitive. Sol verified the final source/packet hashes
and 25-file closure with no remaining P1/P2 in this core slice. A follow-on
opt-in binding adds five tagged Rust wire operations and Node/Bun and WASM
facades. Independent Sol review reran six core tests, two frozen wire tests and
two facade tests; a clean installed Node replay passed 17 cases, and actual
receipts passed Draft 2020-12 validation. The wire tests cover immediate
resource and cancellation refusals. The installed replay proves JSON-data
equality after normalizing decoded null-prototype objects; installed Bun,
real-browser WASM, Python exposure, default routing and broader interruption
remain open. This is not an R5 or R8 completion claim.

The [opt-in core Key tuple checkpoint](evidence/rust-migration/r5-core-key-tuple/README.md)
now covers encode, verify, byte-read and prepared-source methods. Its frozen
packet compares 87 Rust-representable encoder cases and five verification cases
against the current TypeScript predecessor, including signed exponent, invalid
numeric grammar, UTF-16 and control-meter boundaries. Independent Sol review
drove repairs to control provenance, exponent precedence, shared literal
isolation and pre-normalization charging, then replayed the corrected packet and
found no remaining P1/P2 in this bounded core slice. A successor tagged-wire
route and private installed Node/Bun package now pass 87/87 Rust-representable
encoder cases, five receipt verifiers, one byte extraction, prepared-source
isolation, and resource/cancellation/meter controls on their captured source
cohort. Independent [Sol binding review](evidence/rust-migration/r5-core-key-tuple/sol-binding-review.md)
checked the archive/addon hashes and wrapper suite. The one unsafe JavaScript Number case is a separately recorded Rust
transport boundary with a path difference; it is not exact parity. The current
shared wire has since advanced beyond that installed cohort. Python, real
browser WASM, refreshed source-coherent artifacts, default routing and full
source-distribution qualification remain open.

A later moving-source Key tuple binding retains the prepared Rust value in
target-native Node and WASM objects and returns byte reads directly as raw
bytes. A focused real Chromium 153 replay covers a 100,001-unit retained source,
100,001- and 4,000,000-byte success boundaries, 4,000,001-byte refusal,
object shape and host controls. The captured receipt also demonstrates an
unresolved ordering difference: malformed receipt plus accessor-backed current
returns `ACCESSOR_PROPERTY` where the TypeScript predecessor returns
`KEY_TUPLE_RECEIPT`. The direct route stays opt-in pending a staged admission
repair, full frozen packet replay on both targets, and installed-source
qualification. Its evidence and exact hashes are in the linked checkpoint;
the earlier private Node/Bun archive does not qualify this newer binding.

The [opt-in core relationship checkpoint](evidence/rust-migration/r5-core-relationships/README.md)
now covers inspect, stable-ID lookup, authoring and retained-operation
verification for core 0.10.0. Its frozen predecessor packet has 17 operation
cases plus receipt, copy-isolation and structural-limit controls; four focused
Rust tests and the six-test Bun predecessor baseline pass. Independent Sol
review found an aggregate-result LIMIT path/message mismatch and confirmed its
repair against the 60,000-value boundary: both sides now refuse at
`/target/unknownPayload/39504` with the same code and message, without changing
the caller's source. The review also verified metered receipt comparison and
found no remaining P1/P2 in this bounded core slice. Core-wire, Node/Bun,
browser WASM, installed/default routing and native relationship qualification
remain open.

The [opt-in core relationship selection checkpoint](evidence/rust-migration/r5-core-relationship-selection/README.md)
ports authored metadata selection and navigation for core 0.10.0. Its
source-bound TypeScript packet includes ordered endpoints, unknown qualifiers,
UTF-16 identities and an assembled-result structural limit. Independent Sol
review found unmetered filter, Key, Record and navigation scans; the repaired
core charges ordered property comparisons and filter extraction through the
invocation `Context`. Six focused Rust tests and the four-test Bun predecessor
baseline pass, including early/late work and cancellation probes. The final
core source passed independent rereview without P1/P2 in this bounded
operation. Wire, Python, Node/Bun, WASM/browser, installed assets and default
routing remain open; this checkpoint does not qualify native relationship
enforcement.

The first read-only scalar-type inspector candidate now has an opt-in Rust
core/wire route, a frozen eight-case TypeScript packet, focused Rust tests, and
fresh Node/Bun addon differential evidence at
[its bounded checkpoint](evidence/rust-migration/r5-scalar-type-inspection/README.md).
Independent Sol review verified the exact Rust/test/frozen packet hashes,
replayed two isolated Rust tests and all eight Bun-addon/predecessor outcomes,
and found no P1/P2 within the recorded packet scope. The existing local addon
binary was not independently rebuilt in that replay. Rebuilt browser WASM,
installed-package parity, host proxy/resource boundaries, result-schema
failure-branch equivalence and default routing remain open. The result-schema
branch is a known P2 outside the packet claim: Rust returns its first error,
while the predecessor serializes the complete Ajv array. Its
eleven recognized labels match the current generated core vocabulary; this
does not imply the rest of the scalar/model family has moved to Rust.
The next read-only record-members inspector now has a nine-case frozen
predecessor packet, opt-in Rust core/wire and WASM method, focused Rust replay
and real Chromium 153 equality across all nine cases, recorded in its
[checkpoint](evidence/rust-migration/r5-record-members-inspection/README.md).
The packet distinguishes absent from explicitly empty membership and retains
unknown qualifier warnings as partial/uninterpreted paths. Its Node/Bun
differential was interrupted under concurrent build resource pressure. Sol
independently verified the four source/packet/receipt hashes and 22 resource
pins, replayed all nine predecessor outcomes and the isolated Rust test, and
found no P1/P2 inside the packet scope. The browser receipt pins WASM and
packet bytes but not Rust/glue source, toolchain or command; independent
current-source/browser rebuild correspondence, installed artifacts,
result-schema error presentation and default routing remain open. This is a
bounded inspector, not the full
record/member authoring family.
An opt-in reference-links inspector now has a nine-case frozen predecessor
packet, Rust core/wire, Node-API and real Chromium 153 WASM equality at its
[checkpoint](evidence/rust-migration/r5-reference-links-inspection/README.md).
It retains ordered duplicate links, opaque qualifiers and scoped unknown-field
warning paths without promoting a bare role to type authority. Independent Sol
review verified the nine-case semantic packet and identified a P2 resource gap:
per-link target lookup and warning filtering repeatedly scan whole collections
without charging or checking the invocation Context. A charged index and
per-occurrence work checks, with a cancellation/budget replay, are required
before accepting bounded core work. A successor now charges its repeated
target and warning scans to the shared Context; its implementer-run direct
meter test, nine-case Rust wire replay, Bun 1.4.3 Node-API replay and Chromium
153 WASM replay pass. Updated candidate receipts pin source, glue, toolchain
and binaries. Independent Sol review replayed both focused Rust tests, the
nine-case predecessor and pinned Node addon, and found no remaining P1/P2 in
this bounded metering repair. The Chromium receipt is historical after
concurrent WASM wrapper/binary edits; current-source browser correspondence
needs a final integrated rebuild. Exact
installed routing, result-schema failure presentation and default retirement
remain open; this does not close record-type assertions or the broader
reference family.
CONTRACT-053's CSV wording was reconciled to the published request schema and
live current-schema helper's core 0.10.0 admission; its independent historical
graph schema-selection profile remains core 0.8.0. Freeze 0.8.0, 0.9.0,
0.10.0 and unknown-version observations before implementing the Rust operation.

The next core-model dependency cluster is CONTRACT-049's four public schema-
property operations. Rust already exposes `validateCoreFieldValue` and
`resolveCoreDefault` through the opt-in model wire; `inspectCoreSchemaProperties`
and `declareCoreSchemaProperties` still execute in TypeScript. Freeze their
complete source/identity/patch and refusal behavior before porting them, then
replay the original source against the Rust result with unknown qualifiers,
copy isolation, resource controls and JSON/YAML round-trip preservation.
CONTRACT-049 declaration returns a validated Document directly; it has no
persistent declaration receipt or inverse conversion. Only after
that shared Field-value boundary is qualified should the narrower
CONTRACT-053 CSV Boolean lexical conversion and receipt verification be ported.
The retained CONTRACT-049 predecessor suites pass 58 tests with 439 assertions;
the CSV predecessor suite passes eight tests with 91 assertions.
Those suites are baselines, not Rust-port evidence. Both CSV operations must keep
source context unverified, exact four-token grammar and independent original
source/request receipt recomputation. Sol approved the existing CSV profile and
receipt `1.0.0` over current core `0.10.0` after the narrow CONTRACT-053
correction; the historical graph `0.8.0` remains separate.
`verifyCsvBooleanLexical` admits and budgets the supplied receipt before reading
the independently supplied expected
source/request. Freeze crossed malformed-receipt versus getter/cyclic/oversized
expected-input cases, including zero expected-source getter reads. A single eager
JavaScript request snapshot would change that precedence; the binding needs a
reviewed staged host-read boundary with one live Rust context before any default
switch. Rust's existing `measure_json` counts serialized UTF-16 units, not the
contract's UTF-8 bytes; use a bounded exact UTF-8 traversal including lone
surrogate escaping. An immutable predecessor packet and opt-in Rust core slice
now exist at [the initial CSV Boolean evidence packet](evidence/rust-migration/r5-csv-boolean-lexical/README.md):
the predecessor retains eight passing tests/91 assertions, the Rust core passes
two focused operation tests and UTF-8 boundary controls, and the default-feature
core wire checks offline. Independent Sol source review found that its first
source archive lacks a generated constraints resource for standalone replay;
preserve that failed replay and add a newly hashed complete successor archive.
The first independent source review confirmed a P1 control-
failure remapping during receipt admission and two P2 differences: semantic
receipt-source validation before expected inputs and missing complete-receipt
copy limits. Exact predecessor-crossed repairs and a complete source archive
were added: the repaired core passes four focused operation tests and its exact
UTF-8 unit test, the default core wire checks offline, and an extracted
successor predecessor closure passes all eight tests/91 assertions. Sol
independently rereviewed source SHA-256
`b62bfd182a7a6c6a2e1209ae6d3c5dc25fc11303bb04aaf00d56e64b83741348`
and the successor receipt with no remaining P1/P2 in this bounded Rust core
slice. The review reproduced the control failures, unknown-content and
duplicate-ID structural admission, final depth and aggregate value limits,
and eight predecessor tests/91 assertions from the extracted successor archive.
Node, Bun, Python, browser and staged host-read
parity remain unqualified; default routing and public export retirement require
their own installed-host and package gates.
An initial frozen CONTRACT-049 predecessor packet at
`evidence/rust-migration/r5-schema-properties/frozen-typescript.json` (SHA-256
`2427c2eb140226a93ac32e25d49a1f60a91582758c620d238dcdd9aaf8506e4a`)
records inspect/declare results and errors from unchanged TypeScript source
SHA-256 `2a7fb88a8a560f070c0f4ff7685b2e1be474082271e96ee7c8b85ab5ac6d905f`.
It includes patch-before-invalid-source refusal and unknown facet group controls.
The first capture SHA `853292803b6c262e40f0e4136707fbd71cbf872ca2783c876519717eb12894e5`
preceded an explicit input block needed to replay the same unchanged predecessor;
the final packet was not refreshed to match Rust. The opt-in Rust wire passed
three focused tests; packed Node/Bun and real Chromium 153 WASM matched the
captured operations/refusals, JSON/YAML round-trips and control cases. Sol's
independent source review then found mismatches in source-versus-identity refusal
order, slash-bearing unknown-key paths, declaration validation detail, and
eager host admission of source before a malformed patch. They are being repaired
and must pass fresh addon/WASM adversarial parity before this slice is reviewed
complete. The three original Rust core defects were repaired; four focused Rust
wire tests and a fresh-addon Bun parity harness pass. Independent Sol rereview
closed those three but found a further P2: invalid or missing identity scope
with nonempty members must report the first unknown identity key before the
generic explicit-identity refusal. That Rust core repair and its successor
evidence are complete. Five focused Rust wire tests pass. A fresh Darwin arm64
Node addon matches the unchanged TypeScript predecessor across 5 operation
groups, 12 refusal comparisons, JSON/YAML round-trips, metering and cancellation.
Current source hashes: `schema_properties.rs`
`01e44cbbe6df0b81d931796dccb2d1330e5637234c11179216c81e95f7ba6407`, wire tests
`ef2af909e77c7ac4663787882a4392ca44e68f4c99f35b4858833235c5d32292`, parity
harness `f2983f3c531aaf1d86527db8aaa2fadfd999a3e06a6c7b0db9ab94b6fe10bf60`,
and fresh addon `f23bc001f16b882ad6e6b99dc7432011024416360a53d13829c85ef20a1eeaaa`.
The unchanged TypeScript predecessor remains
`2a7fb88a8a560f070c0f4ff7685b2e1be474082271e96ee7c8b85ab5ac6d905f`; the
immutable frozen capture remains
`2427c2eb140226a93ac32e25d49a1f60a91582758c620d238dcdd9aaf8506e4a`.
Independent Sol rereview reproduced the five Rust wire cases and twelve
fresh-addon refusal comparisons at those hashes and found no remaining P1/P2
in the bounded opt-in Rust core.
The host admission-order P2 remains open; no JavaScript semantic unknown-key
shortcut was retained. Wider patch matrices, installed package/default routing
and R8 gates remain open.

The schema-property patch-before-source and CSV receipt-before-expected-input
cases expose the same R7 boundary requirement: Rust must request host values at
the predecessor's semantic checkpoints, with one live operation context and
original host-control failures preserved. A wrapper that duplicates unknown-key
or receipt-schema validation in JavaScript can be an opt-in experiment, but it
does not satisfy the Rust ownership/default-retirement gate. Sol's reviewed
design is a private synchronous `umf.host-json/1` reflection protocol: Rust
owns guarded JSON traversal, limits, number admission, paths and operation
checkpoints; one invocation-local JavaScript dispatcher retains opaque values,
descriptor snapshots and exact thrown values while performing primitive
reflection. Its first opt-in route is `declareCoreSchemaProperties`: copy and
admit patch before reading source, copy source before identity, then validate
source and locate identity in Rust. CSV verification follows after a separate
Gate0 and receipt-before-expected-input parity gate. Repeated `Array.isArray`,
descriptor snapshot order, JavaScript array-length coercion, one live Rust
context, reentrancy and raw callback exception identity are explicit gates.
No default route changes until fresh Node/Bun/real-browser and installed-package
evidence qualifies the endpoint.
An initial opt-in Rust `host_json` traversal shard and five fake-host tests now
exist, along with a five-case Bun predecessor reflection Gate0. Neither is a
binding or declaration route. Independent Sol source review found a P1 in
eager descriptor-vector expansion before resource checks, plus P2 differences
in exact refusal messages, predecessor-facing string metering and array-index
placement under live proxy mutation. A token/count/one-descriptor-at-a-time
revision closes the eager Rust-vector allocation, matches the ordinary messages
and avoids silent array compaction, but Sol's second review found new early
descriptor-count and 4M text refusals, a fallible release checkpoint before
final live array inspection, and wrong precedence for ordinary sparse arrays.
Large root strings and callback framing still lack a bounded transport design.
A further core revision removes the early descriptor and 4M text admissions,
makes token cleanup non-observable, and restores ordinary sparse-array refusal
precedence. Ten focused fake-host tests pass. Sol independently rereviewed
`host_json.rs` SHA-256 `b137345f23385d45c9dc5c204ec12c79df95e3e5d0dc746c56b77350a7153f0a`
and closed the four prior P2 findings without finding a new P2 in that isolated
core. This is fake-host control evidence, not browser equivalence. At that
reviewed source, whole UTF-16 keys, values and roots still crossed the host
trait in one owned allocation. The next revision must use invocation-local immutable string tokens and fixed-size
chunk reads with exact length/offset checks, preserve lone surrogates, and pass
the original key token for array-index checks. A chunk size is a frame bound,
not an admission limit; accepted output can still grow with input. That core
revision is now staged at `host_json.rs` SHA-256
`8e6b59c2cd8bbb4330e99736330f65efe3acf3493ff9a1581e67351675f44600`:
all twelve focused fake-host tests pass, including multi-chunk root, oversized
key/value, malformed framing and hidden accessor controls. Sol independently
reproduced those twelve plus temporary UTF-16 boundary, lone-surrogate, empty,
oversized-reply, wrong-offset/kind and immediate-host-error controls, finding
no P1/P2 in the pinned fake-host protocol. Its
[bounded receipt](evidence/rust-migration/r8-model-host-input/host-json-core-prototype.md)
does not qualify a real Node/WASM adapter, invocation token store, callback
exception transport or browser behavior. Adapter enforcement of immutable
tokens, bounded reply allocation and infallible cleanup, followed by independent
binding review, remains an integration gate. The Gate0 also
needs a complete source/resource closure and Node/browser evidence.
The first [opt-in Node/Bun adapter prototype](evidence/rust-migration/r8-model-host-input/node-adapter-prototype.md)
now uses that protocol for staged `declareCoreSchemaProperties`. Its current
repair cohort fixes event-aware boolean classification and checks callback
frame length before N-API string conversion. A fresh isolated addon passes
19 focused cases in Node 26.12.1 and Bun 1.4.3, including crossed patch/source
order, raw thrown-object identity, scalar roots and a 20,000-unit string.
Sol accepted those exact 19-case binary/source pins as a bounded prototype,
then found a P1 in a later dispatcher revision: a mutated typed-array length
getter silently zeroed numeric result fields. The successor fixes numeric
decode to eight fixed bytes; fresh Node/Bun runs pass a 20-case packet at
dispatcher SHA-256 `ab99a6c9455ae42972816d9bd22ab9ce21bdfa096eb4e059ce362a1c72d2f162`.
A later source-traversal control exposed another output-parity fault: a Proxy
could mutate inherited `toJSON` methods before the dispatcher serialized its
reply. The current opt-in successor uses null-prototype transport records and
arrays; its implementer-run Node 26.12.1/Bun 1.4.3 packet passes 21 cases at
dispatcher SHA-256 `3122df6c4ec0211edd164dac63d7041e4fba40c971ff7ef113696f686586b636`.
Independent Sol review verified the current dispatcher/harness/addon pins and
replayed all 21 cases in Node and Bun with no new P1/P2 in this focused
prototype. The addon was hash-checked rather than independently rebuilt.
Controls are explicitly refused on this opt-in method; cumulative transport
accounting, complete predecessor/resource closure, dynamic sparse snapshot
equivalence, WASM/Chromium, installed package and independent adapter review
remain open. The existing default model method is unchanged.

An R7 [`generatePythonClient` V2 Rust candidate](evidence/rust-migration/r7-codegen-candidate-v2/README.md)
uses an explicit opt-in subpath
and asynchronous initialization that returns a synchronous generator in Node
and Chromium. Packed-host tests cover the 31 R3 cases and cancellation/recovery.
The snapshot boundary differs from the legacy API on getter/proxy reads and
crossed invalid-package/accessor errors, so default cutover requires a reviewed
host-read protocol or versioned contract change. The packed payload now
includes the existing `./loader-contract` export; Node/Bun, TypeScript and
Chromium V2 evidence and the final source hashes passed independent rereview
with no remaining P1/P2 in this bounded opt-in slice. The packed test supplied
local Ajv/YAML dependencies by symlink and is not a clean registry install.
Sol's production-interface review found that exact legacy compatibility
requires synchronous Rust-driven host reads at the original checkpoints:
initial package admission, source `text`/`format`, later digest `text`, record
selection, conditional native `format`, action selection, and file/path/archive
construction. The JavaScript host must retain the original request, preserve
getter/proxy/coercion order, and rethrow original callback exceptions. An eager
snapshot cannot satisfy those crossed-error and changing-getter cases. A
separate [host-read Gate0](evidence/rust-migration/r7-codegen-host-read-gate0/README.md)
freezes changing getter/proxy/coercion traces and raw exception identity across
Bun, Node and real Chromium, including four source-text reads and the
conditional `_table_runtime.py` package read before `source.json`. Its 218
bundle inputs and external capture inputs are pinned; 46 host assertions pass,
and Sol found no remaining P1/P2 for using the packet to guide staged
implementation. An opt-in [V3 staged Rust host-read candidate](evidence/rust-migration/r7-codegen-host-read-v3/README.md)
now passes the 46-case deep Gate0 candidate/predecessor equality in Bun 1.4.3,
Node 26.12.1 and an extracted-package Playwright run on Edge 155.0.4283.62,
plus the 31-case R3 Node corpus and resource/cancellation controls. Its evidence
pins a 26-input source closure and packed artifact hashes. Independent Sol
source review found three P2 parity gaps: a record getter before legacy-action
and identity refusals, rejection of a later unpaired-UTF-16 package path, and
loss of meter/cancel failure provenance during host-response decoding. Repairs
and a [source-pinned successor replay](evidence/rust-migration/r7-codegen-host-read-v3/repairs-p2/README.md)
now pass the 46-case Gate0, 31 R3 requests and three new adversarials in Bun
1.4.3, packed Node 26.12.1 and extracted-package Edge 155. Independent Sol
rereview verified the exact receipt, archive, bundle and source hashes and
reproduced all three new adversarials in pinned Node with no remaining P1 in
those repairs. Its bounded full 46+31 Node replay did not finish, so the
receipt's complete replay remains Luna-executed, while the independent review
qualifies the three focused controls only. An additional adversarial
selection with an unpaired-UTF-16 module ID is now reproduced outside Gate0:
the TypeScript predecessor reaches `Selected Record not found` at that ID,
while the earlier V3 revision refused early at `/records` during UTF-8
conversion. A further [UTF-16 and cumulative transport successor](evidence/rust-migration/r7-codegen-host-read-v3/utf16-cumulative-transport/README.md)
repairs record/action selection and carries work/constraint counters across
host-response decodes. A packed Node 26.12.1 and Edge 155 replay passes the
46 Gate0 observations, 31 R3 requests, both surrogate selections and an
integrated two-response meter-failure/recovery probe. Its archive and runtime
bits are pinned, but concurrent core-wire edits prevent claiming a complete
frozen build-time source closure; independent review of this successor and
one final source-cohort rebuild remain required before default routing. That
review identified an additional current-source mismatch: the WASM host-read
binding still contains a 32 MiB response admission cap, whereas the tested
packed WASM and the successor receipt describe no cap. The source limit must
be removed and a fresh browser artifact replayed before accepting the
source-to-binary cohort.
Chrome-channel qualification,
dependency-clean installed SDK export/default routing and retirement remain
open; V2 and V3 stay opt-in.
The earlier V3 host dispatcher constructed a complete tagged response string
that Node/WASM copied into Rust before decode. A proposed fixed 32 MiB response
ceiling was rejected because runtime selection/text responses have no matching
predecessor total-byte limit. Sol's parity-safe production direction is
invocation-local response tokens with bounded UTF-16/array frames, exact
offset/count validation and fallible incremental accumulation; frame bounds
must not become total semantic admission limits. Any new transport meter debit
needs its own ordered-control parity proof. Hard total-memory isolation for
otherwise unbounded accepted text belongs in a worker/process boundary. This
pre-copy/aggregate-resource gate motivated the successor transport.

The [V3 ASCII-frame successor](evidence/rust-migration/r7-codegen-host-read-v3/hex-ascii-transport/README.md)
now uses call-scoped descriptors and bounded UTF-16 frames encoded as primitive
ASCII strings. Fresh packed Node v26.12.1, Bun 1.4.3 and Edge 155 matched 46
Gate 0 observations and 31 R3 requests; Edge also passed live `Uint16Array`
poisoning with no external requests. Independent Sol review verified the
receipt-pinned source/artifact identities and found no remaining P1/P2 in this
bounded opt-in transport scope. The reviewer could not rerun Rust tests during
a concurrent unrelated core edit; the seven passing Rust frame tests remain
implementer evidence until a coherent integrated rebuild. Dense selected-array
enumeration/snapshot still precedes Rust precharge; binding-level mutation-
sensitive `TransportUsage` carry and final one-cohort rebuild/replay remain open.
These gates, synchronous production loading and installed default routing block
R7 activation.

The production default direction is the explicitly versioned V4 cooperative
host-read profile now specified in CONTRACT-079, with a scoped CONTRACT-080
exception. It caps raw record positions at 10,000, raw action positions at
1,000 and cumulative selected identity text at 4,000,000 UTF-16 units before
deduplication, using `RESOURCE_LIMIT` / `V4 host-read resource limit exceeded`
at `/records` or `/actions`. It captures one array length and traverses indexed
positions rather than invoking caller `map`/iterator behavior; this is an
intentional versioned difference, including the 10,001-duplicate case. Preserve
the Rust-driven checkpoint order, frozen selected strings, original thrown
value, call-scoped counters and <=8,192-unit ASCII frames. CONTRACT-067's
separate selected/reached limits are not authority for these raw caps. Freeze
crossed sparse, duplicate, getter/mutation, surrogate, exception and control
traces before implementation; then qualify synchronous installed Node/Bun and
browser loading and complete archive asset closure. Arbitrary getters/proxies
remain cooperative host work; V4 makes no hard memory or deadline-isolation
claim. Independent Sol planning review selected this profile. The codegen wire
boundary now carries one ordinary Rust `Context` through tagged
transport admission, catalog construction, generation, error conversion and
output encoding for both ordinary dispatch and host-read V3/V4. Scoped transport
and catalog allowances restore ordinary limits while preserving cumulative
counters and host controls. Focused counter, restoration, control-hook and wire
route tests are recorded in the [V4 evidence](evidence/rust-migration/r7-codegen-host-read-v4/README.md#unified-codegen-context-follow-up--2026-10-24).
This closes that implementation blocker for the tested source cohort only;
source-cohort replay/review and default activation remain open. The neighboring
generic non-codegen request path still uses a separate operation Context and
is outside this focused change.

An [integrated V4 checkpoint](evidence/rust-migration/r7-codegen-host-read-v4/README.md#integrated-candidate-checkpoint--2026-10-24)
rebuilt the native addon and release WASM after that Context change. The
repository-tarball V4 route passed Node, Edge 155, Chromium 153 and a clean
package extraction; packed V3 Node and Edge each replayed the 46-case host-read
Gate 0 and 31 R3 cases. The same rebuilt bindings passed the opt-in R5 Record
value cases in Node, Bun, Edge and Chromium. The evidence pins archive and asset
hashes and confirms temporary generated assets were restored. Concurrent R5
module edits prevent treating these binaries as a frozen all-source cohort.
Independent review, final-cohort rebuild, release SDK archive routing, Chrome
release-channel qualification and default activation therefore remain open.

Sol's R7 production-interface decision preserves synchronous
`generatePythonClient(request)` after the ESM import resolves. Separate
Node/Bun NAPI and browser WASM root entries will initialize at module load;
missing or incompatible assets reject the import, with no TypeScript generator
fallback. The first native packaging cohorts are the existing CI-supported
macOS arm64 and Linux x86_64 hosts. Archives must identify their platform and
fail clearly on other native targets; this is a selected initial distribution
matrix, not a universal Node/Bun claim. Nine repository-owned resources remain
in the trusted package closure, with the reviewed V4 position and UTF-16 text
limits. The opt-in entrypoint sources and preview archive are now built without
changing the default route; their evidence and review are recorded below.

The [opt-in root-entry preparation](evidence/rust-migration/r7-codegen-host-read-v4/README.md#production-root-entry-preparation--2026-10-24)
now has separate Node/Bun and browser sources that await Rust V4
initialization at module import and expose the existing synchronous generator
call. Sol independently reviewed the export/type and failure path and reran
the focused Bun parity and host-read controls; Node/Bun and Chromium smoke
checks passed against the earlier integrated addon/WASM pair. The package
root remains TypeScript. A clean source-bound macOS arm64 preview archive now
passes extracted-package Node 26, Bun 1.4.3 and Chromium 153 checks, including
missing-native and corrupt-WASM refusals. Sol independently reproduced the
installed matrix and all 489 manifest asset hashes in the 491-member archive.
The Linux x86_64 CI job is defined but unrun; frozen all-source replay, exact
retirement mapping and production default cutover remain open. This preview
receipt cannot qualify the moving source worktree or the published SDK.
Sol subsequently replayed all 31 frozen R3 cases independently in Node, Bun
and Chromium from the immutable preview archive and verified the complete
2,147-input snapshot digest and 489-asset/491-member archive manifest. The
snapshot used existing build-tool dependencies and remains a preview; the
moving worktree and installed production route still need a final frozen
cohort and qualified CI matrix.

A newer [private SDK Rust default-route archive](evidence/rust-migration/r7-sdk-default-route/README.md)
uses a fresh 3,226-input source snapshot and routes the installed package root
to synchronous Rust V4 code generation. The clean macOS arm64 archive passes
all 31 frozen generator cases, root export-name comparison, resource controls
and native/WASM missing-or-corrupt refusals in Node 26.12.1, Bun 1.4.3 and
real Chromium 153.0.8010.12. Independent [Sol review](evidence/rust-migration/r7-sdk-default-route/sol-review.md)
recomputed all retained source hashes, all 1,771 archive asset hashes and the
exact 1,777-member archive inventory. The captured live and derived build
source trees differ in 11 generated inputs; the manifest marks the archive
private and nonpublishable. The repository root still selects TypeScript at
this checkpoint. Metamodel fixed point, source-root activation, hosted platform
cohorts, broader export retirement and R8 release gates remain open.

For the first production SDK route, preserve the existing synchronous
`generatePythonClient` call after module import. The current async V3 factory
is an opt-in loading interface, not a substitute for that export. Build
platform-specific Node/Bun and browser entries that initialize their native
addon or WASM before exposing the synchronous call; the browser package's
existing top-level-await loading pattern is a candidate, subject to a clean
installed Chrome/Chromium and bundler check. Missing, corrupt or incompatible
assets must fail at loading rather than invoke the predecessor implementation.
If this cannot be made portable, require an explicitly reviewed versioned
loading-contract change before default routing; never silently turn the
existing call into a Promise. The exact export, reached helpers, nine trusted
resources, ABI and predecessor retirement need an authority-bound ledger row
and independent review before that one-family cutover.

The public root package manifest is not the shipped SDK manifest.
`scripts/build.ts` still builds the TypeScript `src/index.ts` as the development
default `dist/umf.js`. The previous `scripts/package-sdk.py` release path
filtered root-level bundles to `umf.js`, its map and `loader-contract.js`; it
does not establish a Rust default route. The new private
`scripts/package-sdk-rust-default.ts` path builds a fresh source-snapshot Rust
addon and browser WASM, then synthesizes an archive whose package root selects
the V4 synchronous Rust generator. This archive is a bounded candidate until
the extracted installed manifest and assets, unsymlinked dependency install,
original host-read/exception controls, Node/Bun and real-browser routes, and
missing/corrupt-asset refusals pass on one captured source cohort. Only then
may the one-family archive cutover be reviewed; the other TypeScript root
exports and the broad R7 retirement gate remain open.

Each family retains immutable predecessor outcomes, contract controls, independent
version-pinned native oracles, required recovery directions, unknown-content/edit
refusals, explicit losses, copy isolation and ordered failures. Qualify the declared
CLI/Python/Node/Bun/Chromium operation matrix. Missing host capability cannot silently
remove an existing operation. Preserve Edition 2024 limitations, temporal HELD and
all other unqualified native subsets unless independently qualified.

### R8 outcome and release checklist

- [ ] Successor census has zero unresolved active rows; each has Rust ownership,
      generated inert-data ownership or a justified thin host boundary.
- [ ] The shipped `./reference` condition and development package entrypoints
      contain no surviving TypeScript semantic implementation. Preserve frozen
      predecessor fixtures outside the production artifact; route every
      supported runtime operation through Rust or record an explicit,
      reviewed compatibility removal before calling the port complete.
- [ ] Independent reviews name exact source hashes and reviewers who did not
      implement reviewed changes; required corrections are closed.
- [ ] One frozen source/model cohort passes boundary/authority checks, metamodel
      fixed point, regression, typing and affected native integration tests.
- [ ] Clean CLI runs without Python/JS; packed Node/Bun, distributed Chromium
      WASM, installed wheels and offline extracted-sdist rebuilds pass their
      complete declared matrix on the qualified hosted platforms.
- [ ] API/CLI signatures, generated bytes/hash preimages, failure order, unknown
      retention, valid/complete/loss reports and isolation have retained evidence
      or explicit reviewed versioned changes.
- [ ] Consumer docs/reference/examples, notices, package metadata and release
      hashes describe exact versions/subsets/limits. Historical receipts are
      never relabeled as execution of successor sources.
- [ ] Root records package versions, ABI/protocol dependencies, channels,
      artifacts/hashes and rollback pins. Current-main/required CI and independent
      delivery review pass against the release cohort.
- [ ] Publish authorized reviewed UMF artifacts and verify actual registry/index
      artifacts and clean installs against hashes. Distinguish prepared artifacts,
      publication and consumer adoption.

The existing-release `.github/workflows/pypi.yml` dispatcher invokes a
default-branch publisher for an immutable, published core-bearing release. That
publisher verifies the tag's source commit, checksum manifest and Core package
bytes, then publishes only the qualified `umf-core` 0.10.2 version. Both its
automatic dispatcher and manual preparation path refuse the 0.11.0 Rust-port
candidate; fifteen focused publisher tests pass. It is not the Rust port's coordinated
pair publisher. R8's six-cohort `umf-core`/`umf-codegen` workflow remains a
nonpublishing qualification gate. A Rust-port candidate cannot bypass it; a
separately reviewed publisher must consume the aggregate receipt from that same
workflow run. The existing source-bound access workflow exercises both
installed distributions, but a passing PR check is not a publication receipt.
Main now records verified public-PyPI publication and a clean consumer install
for `umf-core==0.10.0` from SDK tag `umf-v0.5.4` in
[the Core-only publication evidence](../05-deploy/evidence/pypi-0.10.0/README.md).
It also records automatic OIDC publication, exact archive-byte verification,
and a clean Linux consumer install for `umf-core==0.10.2` from tag
`python-v0.10.2` in [the later Core-only receipt](../05-deploy/evidence/pypi-0.10.2/README.md).
Neither receipt covers `umf-codegen`, the proposed Rust-port versions,
the six hosted pair cohorts, or end-to-end consumer adoption.
The latest [published UMF SDK tag](https://github.com/DocumentDrivenDX/umf/releases/tag/umf-v0.5.6)
observed before this work is `umf-v0.5.6`;
the moving worktree still declares `@umf/core` 0.5.6 with `private: true`.
Select a new SDK tag/version after default routing and compatibility review,
and keep its channel distinct from the proposed Python core 0.11.0 and codegen
0.2.0 distributions. The existing tag is not a release of this Rust port.
The Python distribution version `umf-core` 0.11.0 is a packaging/API version;
this migration does not reserve a new semantic envelope revision. Current Rust
core validators continue to require the `umf: "0.10.0"` document profile.
Any future envelope revision requires its own governed design and qualification.

R8 coordinated Python release validation is now a separate, non-publishing
workflow at `.github/workflows/python-coordinated-release.yml`. Its six-job
matrix matches the plan's required Ubuntu/macOS × CPython 3.11.17/3.12.15/3.13.16
cohorts (Linux x86_64, macOS arm64). It builds the `umf-core` 0.11.0 and
`umf-codegen` 0.2.0 wheel/sdist pair, checks the core wheel payload
and offline extracted-sdist rebuild with `tools/verify_python_artifacts.py`,
then installs the exact pair and exercises the installed codegen API/CLI. Its
second verifier rebuilds the codegen sdist offline and records SHA-256 values,
source revision, runner cohort and the core verifier receipt. A dependent
aggregate job downloads only artifacts from that workflow run and requires all
six exact cohorts, one source revision/run, current source pins, matching host
and wheel platforms, receipt-linked artifact hashes, and identical source,
resource and sdist-input closures. It emits a non-publishing aggregate receipt;
no coordinated Rust-port publication job consumes it yet. The separate
existing-release Core publisher does not consume this candidate matrix and
cannot bypass the six-cohort gate. Sol independently reran the aggregate
negative and positive tests (23/23 passed).
The [local release-pair preparation gate](evidence/rust-migration/r8-python-release-preparation/README.md)
reruns that aggregate verifier against downloaded cohort artifacts, then emits
a deterministic non-publishing manifest pinned to one run/source revision and
all five distinct release files: two platform Core wheels, one Core sdist,
and the codegen wheel and sdist. Ten focused synthetic-fixture tests pass,
including byte drift, missing cohort/wheel, mixed run/revision, wrong version,
and extra aggregate claims. This is local custody preparation; it neither
proves hosted provenance nor enables publication.
The same six-cohort workflow now adds a [nonpublishing same-run custody gate](evidence/rust-migration/r8-release-pair-readiness/README.md#same-run-custody-gate)
after the aggregate verifier. It binds the exact Core/codegen pair, source
revision, workflow run, first attempt, workflow identity and aggregate bytes;
reruns fail closed. Sol ran the local matrix, preparation and custody tests
(34/34 plus five fixture subtests) and the coordinated-workflow tests (5/5).
No hosted qualification has run for this new gate. The separate `umf-access`
0.1.0.dev7 distribution is outside this pair and remains a release blocker.
Hosted execution of all six jobs, Windows, macOS x86_64, a reviewed coordinated
publisher, registry artifact verification, rollback, and consumer adoption
remain open. See the source-bound R8 release evidence directory for current
source and test hashes.

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

Every active algorithm in the live successor census, including operations added
after R0, has a Rust owner, generated-data owner or explicit thin host boundary.
No active TS/Python semantic implementation or JS
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
UMF package release is authorized by the 2026-10-23 continuation; production
deployment, external messages and consumer-repository semantic changes remain
separately authorized. One plan is sufficient; no tracker is selected. For R0–R2 the owner selects
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

The separate [`umf_access` installed-artifact gate](evidence/rust-migration/r8-umf-access-installed-qualification/README.md)
builds a dev7 wheel with the pinned 0.11.0 core dependency and records cohort
receipts without changing the pair custody manifest. It is scoped to installed
package identity, dependency versions and selected imports/exports; public
capture and broader access semantics remain unqualified. The checked-in
compatibility profile still says dev0, so the manual-only gate currently
records a blocked receipt with a nonzero result for source metadata at dev7.
Do not update that historical profile by
relabeling it; first regenerate and validate its full fields against a clean
installed dev7 wheel.
Its CPython 3.14.8 Linux/macOS cohorts also differ from the pair's CPython
3.11.17–3.13.16 matrix and Pydantic 2.11.9 environment. The evidence remains
separate until a shared exact host/dependency/source cohort is established.
Eleven local verifier controls now exercise the explicit profile blocker, a
synthetic installed artifact pass, and digest, import-origin and dependency
metadata/archive-safety negatives. They validate the gate logic only; hosted receipt evidence
and the actual dev7 profile replay remain open.

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
updated consumer-facing documentation, independent review and the authorized
release. Native claims outside the tested matrix remain separate. No incomplete adapter or
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

## R3 execution and continuation

The owner authorizes the existing `rust-binding-spike` worktree for R3 through
tested, independently reviewed integration, PR and merge, keeping current with
main. The starting main is `f323a2dec`. Sol owns planning and independent review;
Luna owns the substantial implementation in parallel; root owns integration,
boundary wiring, evidence reconciliation and Git operations. R4–R8 and publication
remain separate. The catalog bound for this update is the installed HELIX
`workflows/graph.yml`, using its implementation-plan template, prompt and
`artifact-signal` voice. Frontmatter and historical evidence remain intact.

### Acceptance surface and sequence

R3 ports both current generator families. CONTRACT-067/068, TD-080/081 and
STP-080/081 govern the stage-one typed-access generator, private resolved IR,
Python emission, source maps, dispositions, obligations and bundle identity.
CONTRACT-079 and SD-033 govern the separate stdlib-only unified client and API
description. CONTRACT-081, TD-085 and STP-085 govern deployment, migration,
reviewed changes and row-scope admission, including their later amendments.
Existing source is the differential reference; historical core versions in the
original prose do not authorize replacing the current input-version checks.

| Step | Owner and files | Dependency and required evidence |
| --- | --- | --- |
| R3-A | Luna inventory/lifecycle owner: shared crate/engine/common scaffold; separate Luna harness owner: R3 fixtures/receipts; root: `scripts/check-rust-boundaries.py` plus its controls/CI integration | Before semantic porting, adopt the codegen crate in the existing host/import boundary checker and capture the complete current public export/dependency closure and frozen success/refusal corpus. Include the seven bridge operations and separate stage-one generator/diff surface; retain exact current sources, dependency versions and bundle bytes. |
| R3-B | Luna generator shard: new `crates/umf-codegen/src/{generation,access,actions}/` and corresponding Rust tests | Consume A's shared admission/identity scaffold; port reached core/access/action inspectors, private IR and both emitters. Port all reached semantics; retained TypeScript execution is prohibited in Rust. Stage-one private IR remains private. |
| R3-C | Luna inventory/lifecycle shard: new `crates/umf-codegen/src/{deployment,tables,migration,row_scope}/`, tables inspection and corresponding Rust tests | Starts against the shared signatures below; owns tables inspection consumed by both lanes. Port deployment and migration compilation/verification, discovery and complete row-scope lifecycle admission. |
| R3-D | Root or assigned binding owner: Cargo workspace, `crates/umf-core-wire`, existing native/Python/Node/WASM bindings and `crates/umf-cli`; host qualification harnesses | Add qualification entry points once B/C work. Reuse production binding transport and controls; do not change R2 core ownership or default TS engine. Run installed native and actual Chromium comparisons. |
| R3-E | Sol review; root plan/evidence and delivery | Review raw Rust entry points and installed host paths, then fix/review affected material. Capture one coherent source cohort, current-main regression, PR checks and merge. |

Only the named shard owns edits within its directories. Luna inventory/lifecycle
owns `lib.rs`, crate scaffold, `common` and engine/resource construction. Luna inventory/lifecycle owns the shared Cargo manifests/lockfile under root coordination.
Root coordinates wire dispatch and wrappers; shard owners propose integration changes
to shared files. Lifecycle owns tables
inspection; generator owns other reached inspectors. Each lane requests shared
additions from the owning lane; no duplicate algorithm or circular module
dependency is permitted. The row above allocates work; root selects actual available agents. Unrelated
R2 corrections require a concrete failing R3 control and separate review.

The seven retained embedded operations are `__umf_codegen`,
`__umf_table_deploy`, `__umf_table_verify`, `__umf_table_migrate`,
`__umf_table_migration_verify`, `__umf_table_migration_changes` and
`__umf_row_scope`. Freeze their complete success/error envelopes, default error
codes, messages and optional paths. Also qualify direct library request admission,
copies and returned values; bridge equality alone does not cover public APIs.
Generation must preserve file paths, complete bytes/hashes, API description,
source archive/digest, warnings/refusals, names and exact Key/member ordering.

### Implementation interface and resource freeze

Sol approves the following implementation allocation against existing contracts.
These private Rust interfaces add no public semantic profile or accepted input.
Use R2 `Value`, `Utf16`, `Context` and `EngineError`; no ambient filesystem,
network, process, clock, database or JavaScript engine enters the crate.

`CodegenEngine` holds immutable explicit `CodegenResources`, built from trusted
inert resources without filesystem reads. Its public methods are
`generate_python_client`, `generate_access_package`, `diff_access_packages`,
`compile_table_deployment`, `verify_table_deployment`,
`compile_table_migration`, `verify_table_migration`,
`discover_table_migration_changes` and `normalize_row_scope`. Methods take raw
`&Value` inputs plus `&mut Context<'_>` and return `Result<Value, EngineError>`.
Stage-one generation takes request and trusted profile as separate Value inputs;
diff/discovery take previous and next as separate Value inputs. Other methods
take the single existing request/bundle/plan value. Module functions may take
`&CodegenResources` explicitly instead of an engine receiver. Typed private
functions may wrap these interfaces. Exact wrapper dispatch names are recorded
in the operation census before host integration.

Sol approves compiler-owned static generated Python runtime templates as
crate-local `.py` assets under `crates/umf-codegen/src/generation/`, embedded with
`include_str!` at compilation. ADR-006 permits generated client boundary code;
these templates supply that output without runtime I/O or JavaScript. They are
versioned compiler inputs covered by the source/artifact closure and exact
generated-file comparisons. They are not caller-selected executable templates.
The captured `python_runtime.py` is 47,376 bytes with SHA-256
`88ba4d3380bf43d4fe8fed501b887545e31e331f6afc42071e0b7c0cbd7f9746`;
`table_runtime.py` is 11,144 bytes with SHA-256
`763ea886cf34411311e63190ff8386d278174cdfc315d1d2298d7aa8326b959b`.
These are initial frozen inputs, not permission to change generated behavior.
A caller-variable `CodegenTemplates` surface is unnecessary and would require
explicit contract/provenance binding before acceptance. Trusted core/extension
schemas remain explicit immutable `CodegenResources`; output templates do not
become additional schema authority.

Shared private utilities expose `admit_json(value, ctx) -> Result<Value,
EngineError>`, `read_document(text: &Utf16, format, ctx)`,
`canonical_json(value, ctx) -> Result<Vec<u8>, EngineError>`,
`sha256_text(text: &Utf16, maximum_utf8_bytes, ctx)` and
`hash_canonical(value, ctx)`. All take explicit invocation context; immutable
metamodel/extension resources come from trusted construction, never document
imports. Scaffold owner freezes the typed admitted-document return; each
inspector owner freezes its result structures for the other lane. Neither lane
reimplements the other's validation. Already-admitted internal helpers are crate-private and cannot
bypass public admission. Separate independently admitted source/resource trees
retain their contracted budgets.

Preserve UTF-16 code units until the contracted interpretation/identity boundary.
JCS (RFC 8785 JSON canonicalization) rejects lone surrogates and nonfinite
numbers, sorts property names by UTF-16 code units and uses ECMAScript number
spelling, including negative-zero normalization. Source digests cover exact UTF-8
source bytes and retain whitespace. JSON insertion order, semantic array order
and diagnostic order remain distinct from canonical key order. Generic Rust
`String`, ordered-map or serializer defaults are not compatibility evidence.
Meter before copies, allocations, sorting, hash input and emission; poll controls
inside potentially large loops. Preserve trusted internal terminal provenance:
host callback errors cannot become budget/deadline errors by matching text.

| Family | Existing capacity rules to preserve |
| --- | --- |
| Stage one | 32 sources with per-document admission, 10,000 selected/reached elements, 1,000 actions, 100,000 dispositions, 1,000 files and 32 MiB aggregate output; no truncation |
| Unified generation | Current document admission and complete source/output bounds; Python host additionally limits source to 16 MiB and serialized request to 32 MiB. Baseline actual public controls separately from host controls. |
| Deployment | 4,000,000 UTF-8 source bytes, 8,192 steps, 1,000,000 UTF-8 bytes per statement, 16,000,000-byte canonical body and ordinary structural limits |
| Migration | Independently verified source bundles, exact ID/predecessor rules, 24,000,000-byte canonical body and existing option/phase inventories |
| Shared execution | R2 cooperative caller controls, wide work accounting and explicit cancellation/deadline capabilities; `HardIsolated` refuses before work |

Do not apply the ordinary 4M source/serialized-text ceiling to an aggregate
package permitted to reach 32 MiB. Preserve current source parsing limits even
when the existing hash or Python ingress permits larger text; relaxing aggregate
output admission does not relax source admission. Transport wrapper overhead must not consume
payload limits; transport still has a separately bounded parser/encoder. No hard
memory isolation or preemptive termination claim follows from cooperative work
controls. Production Python's V8 deadline/memory behavior remains in place until
R4 resolves its native cutover; R3's additive qualification interfaces identify
their cooperative profile explicitly.

Row-scope normalization preserves original source and `sourceToOutput` mappings,
host-bound owner/via/group identities, denied commands and open-read guards.
The bridge's trusted admission copies the lifecycle document, replaces the exact
selected table policy, runs lifecycle inspection and compiles deployment. A
normalizer that omits this final admission is incomplete. Verifiers must recompile
retained original sources/configuration and compare the complete object; a
self-consistently rehashed altered bundle/plan must still refuse.

### Verification and review gates

1. Freeze complete predecessor outputs/refusals before implementation; hash
   immutable expectations and separate any approved correction record. Extend
   R0's historical five-operation corpus for all seven current operations and
   the distinct stage-one family. Census reached inspectors, runtime templates,
   policy/DDL/options/phases and current public exports, not just entry files.
2. Compare native Rust, retained TypeScript and independent contract controls for
   exact output bytes/digests, Unicode/number/name boundaries, unknown relevant
   refusals versus unselected retention, requiredness/defaults, all current
   scalar/semantic-type metadata, actions and lifecycle operations. Include
   tampered/rehash/reordered migration and deployment plans and discovery inputs.
3. Run the existing generated-client pinned mypy/pyright/ty positive and negative
   corpus against unchanged generated packages, with exact dependencies; run
   genuine table and ontology binding calls. Keep stage-one Pydantic/runtime
   dependencies distinct from the unified client's stdlib-only requirement.
   Changed SQL/plans require current native PostgreSQL/Weft qualification for
   their declared subset; byte parity alone cannot expand native support.
4. Replay existing writer controls through Rust-produced file inventories:
   drift, unsafe paths/symlinks, no-write check, process-local ownership, reserved
   stage-two files, failure at both renames, restoration and unresolved recovery.
   Writers remain host glue. No filesystem API enters portable Rust.
5. Exercise public raw-value APIs and installed Python/Node/Bun/CLI plus actual
   Chromium WASM, including mid-work cancellation/deadline/meter refusals,
   capacity boundaries, output-copy isolation, wrapper overhead, missing native
   artifacts and offline execution. R3 qualification is additive; removing
   MiniRacer, embedded payloads or production fallback paths belongs to R4.
6. Pass `check:rust-boundaries`, access/core-authority/unified-client boundaries,
   Rust workspace tests, applicable Bun/TypeScript regression and required PR CI.
   Record exact source/resource/artifact hashes, host/tool versions, platform
   subsets and independent review disposition before delivery completion.

### Open evidence and readiness

Implementation readiness is approved for the allocation above. Scaffold and
read-only preparation may start immediately. The acceptance surface, immutable
relevant predecessor capture and adopted boundary scaffold precede semantic
ports; root verifies that R3-A gate before the dependent implementation. R3 is not yet
implemented or qualified. Required open evidence is the complete current closure
inventory, expanded frozen corpus, representative port resource measurements,
all-host artifacts, native consumer replay and independent final review. Unknown
nondeterministic predecessor outcomes must be identified and resolved explicitly
before freezing a replacement ordering. A formerly accepted path cannot be
stubbed as unsupported to close R3.

No comparable complete-generator token estimate or agent-wide metering is
available. Root records available runtime usage at A, integrated parity and final
review checkpoints; no measured total or enforced spending cap is claimed here.
Existing R0/R1 accounting is historical. Preserve recoverable source/evidence and
remaining work at any runtime budget stop without weakening required gates.

Primary risks are an underestimated reached-inspector closure, accidental
canonicalization changes, unmetered aggregate allocation and a parity harness
that hides transport differences. Address them with the census, independent hash
controls, allocation/control probes and end-to-end installed comparator replay.
Rollback is additive: retain current production entry points and immutable
predecessor fixtures until their separate cutover. Preserve temporal HELD and
all existing native/backend limitations.

### R3-A preparation checkpoint

The additive `umf-codegen` scaffold compiles with the pinned Rust1.90.0 toolchain.
The existing boundary command now checks its host and WASM dependency closures
and source capability imports; thirteen rule tests include codegen graph coverage
and an actual forbidden filesystem-import fixture. The full boundary scaffold
run passes eight package/target graphs and nine controls with zero findings.
The current predecessor passes196 tests/3,076 assertions across thirteen focused
generator, deployment, migration, row-scope, stage-one census/diff and writer files.
[Captured preparation evidence](evidence/rust-migration/r3/predecessor/checkpoint.json)
is predecessor/scaffold evidence, not Rust semantic or installed-host qualification.
The initial immutable capture now contains129 seven-operation cases and17 stage-one
generation vectors plus two package diffs, including admitted IR, emitter output
and97 generated files. Root independently replays all148 complete results with
receipt integrity checks; the separately captured predecessor source closure has320
files. The semantic implementation gate is released. Capacity, wrapper, consumer
and broader independent controls remain required qualification work. Main refresh
finds no new commits beyond the R3 starting main at this checkpoint.


### R3 binding and independent-review checkpoint (2026-10-22)

The additive `codegen/` production wire dispatch now reaches all seven bridge
operations and the separate stage-one generator/diff APIs. Node/Bun expose
`createCodegenEngine`; WASM exposes `createCodegenEngine` and
`initializeCodegenWasm`; the installed Python wheel exposes
`umf.rust_codegen.CodegenEngine`. Callers supply the five core resources plus
tables/actions package manifests and both binding package manifests (nine
independently admitted resources). Templates and the tables operation schema
are compile-time resources; the Python sdist explicitly carries the latter.
Artifact data cannot install callbacks. Control-origin failures remain operation
errors outside semantic outcomes. Stage-one errors retain `pointer`; bridge
errors retain their existing optional `path` presentation. Production cutover
and MiniRacer removal remain R4.

Incremental comparisons now match all 129 immutable bridge cases through
the native Rust driver, Node, installed CPython 3.11 wheel, pure Rust CLI
transport and actual Chromium WASM. Chromium also exercises budget, cancellation,
deadline, meter-failure and unavailable HardIsolated controls. The actual Rust
Node binding's `native_demo` and `domain_demo` files pass unchanged positive
and exact-site negative checks under mypy 2.4.0, pyright 1.1.414 and ty 0.0.88.
These changing-source diagnostic runs are not a final coherent build cohort,
nor evidence for unfinished supplemental migration or stage-one paths.

Sol's shared/lifecycle rereview remains **request changes**: six additional
immutable controls in `evidence/rust-migration/r3/sol-shared-lifecycle-rereview/`
matched zero before repair. Outstanding findings concern complete operation
domain admission, exact semantic pass order, per-module diagnostic limits,
inner-loop/copy metering and extension interpretation. Constructor host copying
is being included in cooperative controls as well. The Luna owner is repairing
these findings; fixture equality alone cannot close source-complete review.
The migration owner continues the v0.2/reviewed-profile supplement, and the
generation owner continues complete stage-one IR/emission/bundle parity.
A fresh main fetch still resolves to the R2 landing `f323a2d`.


The migration continuation now matches the complete 26-case immutable v0.2/
reviewed-profile supplement (14 compilation, 10 verification, two discovery),
and all 62 frozen migration/discovery/row-scope cases. A native checkpoint
executed Rust-produced initial and mixed/backfill plans on isolated PostgreSQL
18.6 with Weft 0.4.48; both apply paths succeeded and the resulting rows retained
`restricted` as expected. This is the specific tested migration subset, with
full source/fixture/version receipts retained by the migration owner. It does
not expand unrelated held consumer support. The temporary native server was
stopped after verification. A public raw-entry regression now checks all nine
operations with semantic-looking host error codes; it exposed and drove fixes
for row-scope/migration refusal catches that lost control provenance.

The production host qualification gate now includes R3's complete frozen bridge
and stage-one results, migration supplement, and both independent Sol control
sets across the installed Python wheel and sdist-built wheel, packed Node/Bun,
Rust CLI and real Chromium WASM. Its source closure includes the codegen crate
and all transitive compile-time resources; the gate will refuse changing-source
cohorts. CI type verification now materializes and hashes Rust-produced native
client files before running the unchanged pinned checker corpus. These gates
are wired but are not declared passed while stage-one work remains incomplete.

The live inventory/boundary outputs move to `evidence/rust-migration/r3/`;
R0/R2 captures remain historical. Original capture-time tooling is archived
losslessly in `r3/capture-source-types/` before type-only tooling corrections;
immutable corpus bytes, original receipts and source manifests are unchanged.
The current TypeScript/tools type check passes. Host constructor copying now
uses independent catalog limits and cooperative work checks; Node/WASM
constructor and raw-carrier controls pass, and the installed Python wheel
passed four constructor/carrier/control-origin regressions before the final
cohort rebuild.

### R3 runtime and control coverage checkpoint (2026-10-22)

The additional stage-one runtime corpus freezes six complete predecessor results
from the existing creation/codec scenarios, including generic containers and
alternate keys (`r3/stage-runtime-review/frozen.json`, SHA-256
`12af8c72ca72534104534e2a6946bad97d523d6024366032e4047223aecbc021`).
The first installed runtime attempt exposed a Rust refusal of the engine-only
success case; this is an open implementation defect, not an approved difference.
The existing end-to-end harness now accepts an additive Rust Node provider and
retains the same host writer and installed Python creation/codec assertions.
Its default production CLI path is unchanged. The frozen corpus joins the
existing automatic multi-host replay gate.

Node controls now additionally interrupt measured work at 75% of an observed
successful client, deployment and migration operation. Meter failure,
cancellation and deadline cases all stop before the measured total; independent
returned objects remain isolated across calls. The same late-control checks
have been added to actual Chromium qualification and await its final rebuild.
Constructor admission and raw Rust provenance controls remain separate checks.

Migration and row-scope implementation moved to Sol after repeated Luna
source-completeness claims failed independent review. This uses the owner's
explicit exception for unsuccessful Luna delivery. A separate Sol reviewer
must review the resulting implementation before integration. No R3 completion
or final source-cohort claim is made by this checkpoint. Main was refreshed and
remains at `f323a2dec`.

The completed migration/row-scope source handoff and fresh native proof are
retained in `r3/sol-implementation-closure/README.md`. The new source-driven
controls cover typed defaults/backfills, malformed and UTF-16 precedence, raw
host-context truthiness, and late host failures. PostgreSQL 18.6 / Weft 0.4.48
committed the initial 84-step and mixed 10-step plans and updated both fixture
rows. This proof uses the existing Python lifecycle verifier; it does not claim
an R4 verifier cutover. A fresh Sol reviewer now independently checks those
sources, shared helpers and bindings. Generation and action closure remain open.

The current Rust workspace checkpoint passes. Node compiler controls now pass
8 tests, including missing-artifact refusal and an exact 100,000-value request
whose independent transport/catalog wrappers do not reduce that budget; one
additional request value triggers the ordinary limit. Installed Python compiler
controls pass 6 tests, including late controls, isolated output and native-engine
absence. These checkpoints precede the final installed artifact rebuild. Existing
access regression checks pass 67 tests / 417 assertions; authority and access
boundaries pass. The metamodel's compiler provenance must be regenerated after
all source edits, then verified at a fixed point before final qualification.

### R3 expanded review and aggregate-capacity evidence

The installed Python creation/codec replay now passes all three existing
scenarios using Rust Node output and the installed source-verified runtime.
The added aggregate-capacity corpus retains complete predecessor results in
`r3/stage-capacity-review/frozen.json.gz` (compressed SHA-256
`7df7d9e4eb9dfe53d607cd9b16dd701e434c2007aa7e14b81e50feaeffde544d`).
A long, valid Python field name produces a 15,068,749-byte candidate; a larger
name produces the existing 32 MiB aggregate refusal. Both compare exactly in
incremental Rust replay. This confirms aggregate output does not inherit the
ordinary source-text ceiling; it does not expand source parsing or runtime
identifier-performance claims. These compressed controls join the all-host gate.

Fresh Sol review found additional omissions in the original Luna shared port:
multi-hop SQL alias depth, configuration error precedence, malformed lifecycle
admission, UTF-16 diagnostic paths, and table callback/diagnostic ordering across
modules. Complete immutable predecessor cases are retained in the `sol-final-*`
review directories. Root corrected alias/configuration and UTF-16 path issues;
Sol took over the remaining shared table, row-scope and policy-metering fixes.
That reviewer consequently cannot approve those patches. The independent action
implementer will review the shared/binding patches, while the shared implementer
can independently review actions and generation. Completion still requires
hash-scoped review of code each reviewer did not implement, followed by the final
coherent installed-artifact and current-main checks.


### R3 binding registry and admission closure checkpoint

Source review requires the complete reached binding inspector, including its
extension schemas and logical correspondence checks. The production resource
bag therefore now explicitly includes `bindingPackage` (`umf.binding` 0.1.0)
and `stableBindingPackage` (`umf.binding` 0.2.0), alongside the five core resources
and tables/actions packages. The Node/Bun, WASM, Python and wire constructors use
the same nine independent resources. Binding schemas are compiled from these
supplied manifests; document content cannot replace trusted compiler resources.
The full binding port and final installed-host qualification remain open.

A new immutable target-admission corpus retains sixteen complete predecessor
results (`r3/target-admission-review/frozen.json`, SHA-256
`7dbcdb7120288c32a704bf8edbd90b623cb362bc7d41eb0d43dcf8ff7d6832fa`).
The first native comparison matches fifteen; the float refusal exposes a
remaining diagnostic ordering mismatch. The new target admission helper ports
naming, projection reachability, dependency-key and relevance decisions and is
under separate Sol review. The source/candidate aggregate limits are being
checked separately: a larger aggregate archive must not increase the original
per-source text ceiling or reset cooperative counters. These are open closure
checks, not approved behavioral differences. Main remains at `f323a2dec` after
the latest fetch.


The target naming/relevance corpus now compares exactly (16/16). Fresh
independent review adds a dependency whose unknown `keysExtra` annotation must
not invalidate the separate `keys` meaning; the key qualifier check now uses
the exact warning code and path boundary. Its complete result also exposed a
remaining dependency-key disposition/obligation issue in the parent admission
port. That source-level repair remains open alongside full binding inspection.
The target helper additionally precharges source-name and pointer copies and
polls repeated name/reference scans; focused naming and late-control tests pass.

The rebuilt nine-resource Node binding passes all eight host controls. Python
wrapper review found cached resources were serialized before a proportional
per-call charge. A cached serialization bound is now charged before JSON
serialization, with a separately metered bound for the remaining envelope.
Two focused tests prove ASCII expansion is covered and a rejecting meter stops
before serialization starts. Fresh installed wheel/sdist qualification remains
required; these focused checks alone make no installed-artifact claim.

### R3 final resource and schema review checkpoint

Independent review identified two production boundaries beyond ordinary result
parity. Unified-client action admission uses the supplied standalone action schema
and retains the predecessor compiler's branch-error ordering, separately from the
full package inspector. `CompiledSchema::validate_codegen_errors` adds that
opt-in presentation; the default R2 evaluator remains unchanged. Focused controls
cover failed `oneOf` branches, first-success annotations, custom equality keyword
ordering, raw UTF-16 additional-property names, `contains` annotations and late
host failure provenance. This additive compiler mode is qualified through the
R3 supplied resources and controls; it is not a new blanket Ajv compatibility
claim.

The resource audit also replaced the shallow-reference recursive collection
walk with an iterative walk, and meters opaque unified-client metadata copies,
binding callback scans and migration catalog/review scans through the same live
operation context. Exact source-output replays remain necessary after these
repairs. Sol independently reviews each author's affected source; final source
freeze and installed-artifact qualification are still pending at this checkpoint.

### R3 large-catalog feasibility exception

A retained predecessor control compiles a 258-column catalog and 256-step reviewed
migration. The source TypeScript request completed in 45.27 seconds; an incremental
native release run remained CPU-active beyond seven minutes. A read-only sample
locates the amplification in the existing R2 constraint evaluator's `clone_env`,
which deeply copies immutable environment roots for every local scope. This is a
concrete R3 production and qualification input, not permission for a broader
interpreter rewrite. The case and expected full plan remain immutable.

Sol approves a narrow implementation exception: store environment values behind
`Rc<Runtime>` and copy handles when cloning environments. Environment slots remain
local and replace handles on rebinding. `eval` variable reads and `runtime_copy`
continue to produce the existing owned snapshots; mutable Map identity, including
nested Maps, keeps its deliberate existing sharing. No new runtime value variant,
mutation path or reference cycle is introduced. Charge copied slots, names and
handles before allocation through the same live context; preserve instruction
counts and terminal origin. Luna implements this bounded optimization, followed
by independent Sol review, isolation/shadowing/Map/Python-origin/UTF-16 controls,
late interruptions, the existing R2 suite and a fresh exact large-plan replay.
The earlier timing is a diagnostic observation, not a final benchmark claim.

The implemented Env exception passed five focused controls and the complete core
suite, followed by independent Sol approval at constraint source
`c86221388090a9990914209584b794b2f73aae0514d16f5edeb56daeb0ed05a9`. A fresh release CLI then
matched the full retained large plan in14.22 seconds. The
[checkpoint receipt](evidence/rust-migration/r3/sol-final-resource-review/optimized-migration-checkpoint.json)
pins its binary and complete actual result. This is scoped incremental evidence;
final installed-host qualification remains required and retains the large case.

### R3 complete sequential admission review

The final source pass found branches not exercised by the original baseline:
ordered profile shape checks, raw UTF-16 request type/identity handling before
source parsing, handler write-frame Key derivation, dependency Record/Key
identities, and six inspector shape/phase/raw-profile boundaries. Independent Sol
reviewers captured immutable predecessor controls before repair; a green earlier
fixture cohort did not override these findings. The complete finite inspector
checklist is retained in
`sol-generation-final-independent-review/inspector-final-findings.json`.

Luna owns the complete initial request/profile and action-Key admission repairs
in the parent generator, and separately owns the inspector's reached scan/copy
closure and six behavioral corrections. The completed emitter/search metering
and raw identity repair is undergoing a complete independent target-text review.
Root retains integration; final formatting, source hashes, metamodel fixed point
and installed-host qualification wait for these owners and reviewers to freeze.
No baseline or new predecessor expectation is refreshed to match Rust.

### R3 complete admission audit and host checkpoint — 2026-10-22

The first coherent installed-host checkpoint passed 582 retained compiler cases
in 94 packets across six compiler host cohorts: packed Node/Bun, empty-PATH
Rust CLI, actual Chromium default WASM, the installed CPython wheel and an offline
wheel rebuilt from the extracted sdist. The separate feature WASM run qualifies
retained core/schema/regex controls; it does not replay a second compiler corpus. Its immutable receipt is
[the pre-client-admission qualification](evidence/rust-migration/r3/before-final-client-admission-qualification.json),
with source closure `85e815888b53eeba89db1fa1aa5f9d18c3c24c1647629d8f7a742171897f38c7`.
The [scope record](evidence/rust-migration/r3/before-final-client-admission-scope.json)
explicitly excludes the additional client findings discovered during the final
source reread; this is a historical checkpoint, not R3 completion.

That reread superseded the earlier client source approval. A complete census of
all 60 direct TypeScript failure sites identified missing package keyword,
derived action symbol, precondition enum, native parameter/result and selected
relationship admission checks, plus validation-order and diagnostic-path
mismatches. A valid native query also exposed a wrapper/reference mismatch:
query outputs resolve `output.field` before validating `output.name`. The
[client census and frozen controls](evidence/rust-migration/r3/sol-final-client-source-gates-review/source-failure-site-census.json)
retain the source behavior before repair. Luna owns the bounded implementation;
Sol independently reviews the complete source phases and data flow. Frozen
expectations remain unchanged.

A green differential corpus is necessary and does not establish that every
source branch was ported. The exit gate also requires a complete source census,
including valid query shapes, raw UTF-16 predicates, first-refusal precedence and
all generated-name reservations. After the repair, regenerate provenance and
inventory, renew exact-source review, and rerun the coherent installed-host gate
with every newly frozen packet before CI and merge. Default cutover and MiniRacer
removal remain R4.


Post-qualification Ruff amendment: PR45 adds only standard-library import cleanup
in `python/src/umf/rust_codegen.py` and test cleanup in
`python/tests/test_rust_codegen.py`. The [supplemental review](evidence/rust-migration/r3/sol-delivery-review/post-qualification-ruff-review.json)
records exact before/after hashes and independent non-import AST equality. The
615-case six-cohort receipt above remains immutable evidence for its original
source hashes. Affected tests pass 8/8, the temporary installed Python suite passes 206/206,
and pinned Ruff 0.17.1 passes. The complete hosted qualification gate remains
required against the successor checked PR head; the temporary environment check
is not a fresh wheel build.


Hosted clean-build amendment: the metamodel source-bound CLI census now includes
the transitive `umf-codegen` crate and its authored operation schema. Generated
outputs and the retained V8 payload were regenerated for the expanded compiler
provenance; independent whole-bundle comparison finds only five repeated source
hash tokens changed. The [supplemental build review](evidence/rust-migration/r3/sol-delivery-review/hosted-build-source-closure-review.json)
records exact file and bundle identities. The original full qualification receipt
remains scoped to its captured sources. Complete hosted qualification is required
against the successor PR head before merge.

### R5 opt-in core Record values checkpoint — 2026-10-24

The bounded [Rust core Record value slice](evidence/rust-migration/r5-record-values/README.md)
ports `validateCoreRecordValues` against its live TypeScript predecessor. Its
source-bound packet freezes live operation 2.0.0/core 0.10.0 behavior, including
copy/preservation, unknown source content, selected Field validation, diagnostics
and thrown-error order. Sol's independent review then identified refusal-order,
unknown-member, warning-order, UTF-16, and resource-boundary gaps. The Rust port
now includes the crossed refusal/result vectors, uses UTF-16 keyed indexes and
paths, and matches the 15,000-duplicate structural limit location. A second Sol
review then found three remaining edge mismatches; the frozen packet now also
covers null/array and missing identities, raw slash/tilde qualifier paths, and
output-copy depth failure. The Bun verifier replays the frozen predecessor cases
plus both resource controls. CONTRACT-049's older 1.0.0/core 0.8.0 passage
remains historical context; this slice follows the current source/API. This is
opt-in core evidence only. It does not qualify bindings, default/package
behavior, browser execution, dataset/native enforcement or adapter support; the
corrected source passed final independent Sol re-review without P1/P2 in the
bounded logical Record-values scope. The reviewer verified source
`02636eef58b8f31355f4c798bae0dbec77682397f9fb0ab8ae50614aa52d9b42`,
packet `50d52bab545eae6566e8da6064c4fbec6d8880c89b4a32c9f2c5c614d4a3b5a9`
and test `921ae36a2fa72acb9e6da7532628dc066fff8bed1c58eaccb7ceb73547c4db22`;
the focused Rust test, four Bun tests (27 assertions), 24 frozen cases and both
resource controls passed. The separate binding/default/installed-host gates
remain open.

The subsequent opt-in `validateCoreRecordValues` tagged-wire binding is now
implemented in the local Node/Bun and browser WASM packages. Its
[binding packet](evidence/rust-migration/r5-record-values/README.md) pins the
accepted core, tagged-wire and wrapper sources, a packed native addon, and a
rebuilt release WASM artifact. Four frozen success/refusal cases and copy
isolation pass in Node 26.12.1, Bun 1.4.3, Chromium 153.0.8010.12 and Edge
155.0.4283.62; browser zero-work refusal also passes. This is a bounded
implementation and host checkpoint. Python exposure, default routing,
native row enforcement and broader resource qualification remain open.

Independent Sol binding review found no P1/P2 in that opt-in scope. It replayed
the focused core and tagged-wire Rust tests, wrappers, all 24 frozen results
and refusals in a packed Node install, and the four-case packed Node/Bun checks.
The reviewer verified the earlier Chromium/Edge receipts and exact WASM/glue
hashes, but its own browser launch was denied by the macOS sandbox; it did not
claim a new browser pass. Concurrent codegen Context work has since changed
the shared `crates/umf-core-wire/src/lib.rs` source beyond the binding receipts.
Rebuild and replay the final shared wire/addon/WASM cohort before integrated
qualification or default routing.

The opt-in Rust `validateCoreDatasetValues` and `verifyCoreDatasetValues`
[predecessor packet](evidence/rust-migration/r5-dataset-values/README.md)
now covers complete commerce, mutation-sensitive Key and relationship outcomes,
wrong-version validation order, nested host controls and full-receipt verify
recomputation. Sol independently reviewed the repair, reran the focused Rust
suite (9/9) and the live Bun dataset suite (8/8, 86 assertions); no P1/P2
remains in this bounded full-receipt cohort. This is not complete dataset
parity: broader relationship/key/verify adversarial cases, final assembled-copy
boundary reachability, bindings, native enforcement and installed-host
qualification remain open.

Compact validate/verify requires shared Record/Field/Key semantic evaluator
bodies over one frozen source context and a composable invocation-local work
ledger; it cannot call the full repeated-source operation and strip the result.
CONTRACT-056's historical core 0.8.0 sentence has been reconciled to the live
core 0.10.0 request schema and TypeScript implementation, without authorizing
implicit conversion. The [opt-in compact core packet](evidence/rust-migration/r5-dataset-values-compact/README.md)
now passes 15 frozen complete envelopes and the 349/350 production work-ledger
boundary; 349 records match all 59 TypeScript categories at 998,489 units.
Independent [Sol review](evidence/rust-migration/r5-dataset-values-compact/sol-review.md)
verified the source/packet hashes, exact threshold map, three iterative
depth/control unit tests, and the direct public API depth case. The agent's
final serial suite passed 4/4. This accepts only the bounded Rust core slice:
phase-internal first-stop equivalence, regex/resource graphs, native bindings,
installed hosts, default routing, and R5 completion remain open.

### R5 opt-in core semantic-type operations checkpoint — 2026-10-24

The bounded [semantic-type operation packet](evidence/rust-migration/r5-core-semantic-types/README.md)
freezes the live TypeScript `inspect`, `get`, `declare`, and `verify` operations
for core 0.10.0 / operation 2.0.0. Rust replays the complete inspection and
declaration envelopes, exact identity and request refusal order, unknown
qualifier edit guard, schema-first malformed receipt refusal, and recomputed
receipt consistency. Independent Sol review found and corrected a verifier
error conversion: a valid receipt whose recomputation fails now propagates
`SEMANTIC_TYPE_UNKNOWN` and nested control failures. The 13-source packet
closure matches, the final focused Rust suite passes 2/2, and the repository
typecheck passes. No P1/P2 remains in these four opt-in core operations.
Older-core `legacy` inspection is a live TypeScript/CONTRACT-078 gap, so the
0.9.0 cases qualify refusal only. Registry lookup, value validation, extension
APIs, bindings, maximum-budget allocation boundaries, default routing and
installed-host qualification remain open. This is not full semantic-type or
R5 completion.

The next bounded [data-only semantic registry slice](evidence/rust-migration/r5-semantic-type-registry/README.md)
adds caller-owned Rust `register`/`lookup` for exact vocabulary/version/term
triples. It copies definitions, rejects unknown registration qualifiers and
duplicates, retains unknown lookup qualifiers without interpreting them, and
uses the caller's `Context` for copy, index comparison and control work.
Sol independently reviewed the final source and five-source TypeScript packet;
the final focused Rust suite passes 4/4 with no P1/P2 in this data-only scope.
The next bounded [semantic value-check slice](evidence/rust-migration/r5-semantic-value/README.md)
adds opt-in `registry.check`, `validate_semantic_type_value` and
`validate_core_semantic_type_value` with an invocation-scoped trusted validator
trait. The 21-source TypeScript freeze covers ordered checks, status precedence,
copy isolation, malformed/failed validators, absent declarations and validation
precedence. Sol independently reproduced the final focused Rust 10/10 replay,
checked the freeze closure and corrected two large UTF-16 callback-result
metering gaps before acceptance. The validator is cooperative and receives the
same mutable `Context`; this does not promise preemption of a non-cooperative
callback. Host work transport, Node/Bun/browser/Python bindings,
CONTRACT-078 transition/source reconciliation, default routes and retirement
remain open.

The opt-in [retained extension-accessor slice](evidence/rust-migration/r5-semantic-type-accessors/README.md)
adds copied `getSemanticTypes`, copy-on-write `setSemanticTypes`, and the
prototype's semantic warning validation against the current
`umf.semantic-types` 0.1.0 package. Sol independently checked the 25-source
transitive TypeScript freeze, reran the focused Rust tests (4/4), and found no
P1/P2 in the bounded accessor behavior. Generic extension-registry API shape,
archived transition operations, host bindings and default routes remain open.

The subsequent [six-operation semantic binding packet](evidence/rust-migration/r5-semantic-types-bindings/README.md)
qualifies those opt-in core and extension operations in a clean installed
Node/Bun package and real Chromium WASM. Sol reran the installed package by
name under Node 26.12.1 and Bun 1.4.3, the Chromium 153 browser replay, the
six wrapper tests, and all 16 receipt source hashes. The initial Node evidence
script's `Bun.version` exit error was corrected before acceptance. This packet
does not include Python, trusted validator callbacks, the generic semantic
registry, the frozen runtime-invalid `vocabularies: null` native error, default
SDK routing or release qualification. Its installed replay reads frozen
resources from this repository, so a self-contained release resource closure
is still needed.

The [opt-in Node/Bun trusted-validator binding packet](evidence/rust-migration/r5-semantic-value-node/README.md)
adds caller-owned registry admission, lookup, exact value checks and aggregate
core semantic-type checks through the Rust engine. A clean installed npm
tarball passes Node 26.12.1 and Bun 1.4.3; focused Rust, Bun and TypeScript
tests and typecheck pass at the receipt's exact source hashes. Independent
[Sol review](evidence/rust-migration/r5-semantic-value-node/sol-review.md)
closed callback work charging on throws and duplicate host-bridge copying,
then reopened a callback-error provenance issue. The Node dispatcher now
distinguishes caller-thrown engine-like codes from private report-work and
frame-limit signals; source and clean installed Node/Bun spoof controls pass.
Sol then rebuilt the shared-wire/native addon from the settled source, packed
it, and independently reran the 9/9 source suite and installed Node/Bun
package-name and spoof controls. The refreshed receipt pins that accepted
opt-in Node/Bun cohort. Ordering preflights use a
separate control-free Context, aggregate document validation runs twice, and
each final operation replays registry entries; large-registry resource parity
is unqualified. Browser callback bindings, generic transition APIs, default
routing and retirement remain open.

The additive [Python trusted-validator binding packet](evidence/rust-migration/r5-semantic-value-python/README.md)
now has independent [Sol review](evidence/rust-migration/r5-semantic-value-python/sol-review.md)
and a clean installed CPython 3.11.17 abi3 wheel replay (5/5 focused tests).
The review repaired a forged private control-exception route: only the exact
sticky `report_work` fault can become a terminal host-control response;
caller-raised resource-shaped exceptions become semantic unknowns. The wheel,
native member, source and predecessor hashes are pinned in its receipt. This
accepts the opt-in Python callback facade for that host and source cohort,
while cooperative-only callbacks, registry-replay scaling, default routing,
additional platforms and full family retirement remain unqualified.

### R8 integrated retirement and release checkpoint — 2026-10-24

The latest [source-pinned private SDK
checkpoint](evidence/rust-migration/r8-integrated-private-sdk/README.md) reached
a fixed point and passed installed Node v26.12.1, Bun 1.4.3 and real Chromium
153.0.8010.12 replay, package verifier 9/9, and Python extracted-sdist
closure 12/12. [Sol's independent review](evidence/rust-migration/r8-integrated-private-sdk/sol-review.md)
limits that acceptance to the 29 Rust-selected default operations and their
named packet cases. It is private and nonpublishable. The recaptured inventory
still reports 893 inherited TypeScript executable declarations per default
root and 922 logical retirement gaps; hosted Python six-cohort qualification,
remaining resource authority, full regression, and publication are open.

The next parallel R8 waves are bounded by the current dependency graph. Delta
continues with JSONL log capture/export/inspection, then action inspection and
commit/checkpoint reconciliation before Parquet-backed checkpoint recovery;
source and ordered diagnostics remain the authority until separate native
reader/writer evidence exists. Resource authority continues with the three
CONTRACT-016 Arrow IPC result schemas and their exact single-output writers,
then transitive Arrow base inputs. Security disclosure starts with shared
literal admission and transport behavior, then V2 protection-source/domain/
parameter resolution; legacy policy/ontology interpretation remains a distinct
dependency before its three codec exports. These waves create opt-in owners and
evidence, not automatic default-route retirement.

An [eleven-case Core relationship host-boundary
packet](evidence/rust-migration/r8-core-relationships-default-boundary/README.md)
now freezes source/identity/request/receipt/current refusal order and raw
reflection traces before a default cutover. Its read-only replay passes. The
four operations still use TypeScript at the production root; the opt-in Rust
binding needs exact host-boundary comparison and a source-pinned installed
Node/Bun/Chromium replay before it can replace that route.

The [condition-aware symbol inventory](evidence/rust-migration/r8-symbol-inventory/README.md)
is the current release denominator, subject to deliberate recapture after the
active source edits. It identifies 922 unique executable root exports and 198
JSON resource aliases. The Node and browser roots each source-select 24 Rust
declarations and inherit 898 TypeScript executable declarations; the explicit
`./reference` route retains the predecessor. No executable row has passed the
combined source-cohort, installed-host and retirement gate. An opt-in Rust core
mapping or a private archive replay does not close a default-route row.

The resource audit has independently reviewed seven authored Smithy schemas
against CONTRACT-014 and six OpenAPI result schemas against CONTRACT-011/012,
with explicit source/build closure in their [Smithy
receipt](evidence/rust-migration/r8-symbol-inventory/smithy-resource-authority.md)
and [OpenAPI receipt](evidence/rust-migration/r8-symbol-inventory/openapi-resource-authority.md).
Their separate [Smithy](evidence/rust-migration/r8-symbol-inventory/smithy-sol-review.md)
and [OpenAPI](evidence/rust-migration/r8-symbol-inventory/openapi-sol-review.md)
Sol reviews leave 69 resource authorities unresolved and 112
candidate-generated aliases requiring generator proof. Installed archive bytes
remain unqualified.

A subsequent [domain-pack/dataset-source authority
receipt](evidence/rust-migration/r8-symbol-inventory/domain-pack-resource-authority.md)
and [Sol review](evidence/rust-migration/r8-symbol-inventory/domain-pack-sol-review.md)
prove the generator and source/build closure for four more JSON resources.
The ledger now reports eight generated-known, thirteen authored-known, 112
candidate-generated and 65 unresolved unique aliases. Installed package bytes
and executable retirement are unchanged.

The later [Arrow IPC](evidence/rust-migration/r8-symbol-inventory/arrow-ipc-resource-authority.md)
and [Arrow base](evidence/rust-migration/r8-symbol-inventory/arrow-base-resource-authority.md)
authority slices proved six more generated schemas, including the base
generator's transitive PostgreSQL and FlatBuffer inputs. Separate
[IPC](evidence/rust-migration/r8-symbol-inventory/arrow-ipc-sol-review.md) and
[base](evidence/rust-migration/r8-symbol-inventory/arrow-base-sol-review.md)
Sol reviews independently passed the read-only writers and current ledger
suite (12/12). The current count is fourteen generated-known, thirteen
authored-known, 109 candidate-generated and 62 unresolved; installed bytes
and executable retirement remain open.

The subsequent [Delta report-schema authority
receipt](evidence/rust-migration/r8-symbol-inventory/delta-log-resource-authority.md)
and [Sol review](evidence/rust-migration/r8-symbol-inventory/delta-log-sol-review.md)
pin four more generated outputs with direct exports and transitive Delta and
Parquet inputs. The four read-only generator checks, current ledger check and
focused suite (13/13) pass. This moving-source checkpoint reports eighteen
generated-known, thirteen authored-known, 105 candidate-generated and 62
unresolved aliases. Installed bytes and executable retirement remain open.

The [Spark forward/reverse projection
receipt](evidence/rust-migration/r8-symbol-inventory/spark-projection-resource-authority.md)
and [Sol review](evidence/rust-migration/r8-symbol-inventory/spark-projection-sol-review.md)
pin two additional generated schemas, including the reverse writer's exact
forward-schema input. Both read-only writer checks pass; the focused ledger
suite passed 14/14 at its checkpoint. Counts move to twenty generated-known,
thirteen authored-known, 103 candidate-generated and 62 unresolved aliases.
Concurrent wire edits made the ledger check stale afterward; a coordinated
recapture is still required.

The [Parquet report-schema
receipt](evidence/rust-migration/r8-symbol-inventory/parquet-report-schema-authority.md)
and [Sol review](evidence/rust-migration/r8-symbol-inventory/parquet-report-sol-review.md)
pin four more generated resources, their direct and transitive input chain,
public exports, and build closure. All four no-write generator checks passed;
the focused ledger suite passed 15/15 at its moving-source checkpoint. Counts
became twenty-four generated-known, thirteen authored-known, 99
candidate-generated and 62 unresolved aliases. Final recapture and installed
bytes remain open.

A later moving-source inventory captures 29 Rust-selected and 893 inherited
TypeScript executable declarations in each default root, with the same 922
logical retirement gaps. This supersedes the 24/898 route-selection count
above for source inspection only. Its exact hashes must be regenerated after
the active bindings settle. The ten-route inventory has 3,375 route-specific
rows, all marked `migrationDisposition: unreviewed`; source selection alone
does not close their Rust owner, installed route or retirement decisions.
[Eight kind/nullability host controls](evidence/rust-migration/r5-kind-nullability-default-route/README.md)
now prove that the generic eager tagged boundary changes source and request error identity,
reads identity getters before source admission, and admits `current` before a
malformed receipt can be refused. All six kind/nullability default selections
remain held pending a staged Rust-owned host boundary and browser/installed
parity. [Cardinality's crossed host-admission review](evidence/rust-migration/r5-cardinality-default-route/README.md)
found divergent paths for accessor/hidden fields, cycles and out-of-profile
numbers at the generic tagged boundary. That boundary retains its opt-in
`AdmissionError` contract; the selected cardinality route keeps its existing
TypeScript copying sequence until a distinct Rust-driven host-admission
interface passes those controls.

The staged kind/nullability host-input route has since passed six operation
outcomes and eight predecessor-order controls in Node/Bun, plus a fresh real
Chromium WASM replay. Its factory snapshots explicit resources and preserves
callback exception identity. Its first binding admitted resource
snapshot/transport/catalog separately from source, identity, receipt, current
and output. The exact opt-in scope is recorded in the linked evidence.
Independent Sol reran its Node/Bun parity packet and six focused Rust tests;
source-frozen installed qualification and a reviewed resource-accounting
boundary are still required for default selection.

A later opt-in revision charges resource snapshot, transport, catalog and
operation work to one per-call control ledger and has direct-source Node and
fresh Chromium receipts. Preliminary independent timing on the moving
worktree for one representative
`inspectCoreElementKind` source found the TypeScript predecessor at 6.28 ms,
the Rust factory at 27.46 ms, and the current Rust route at 3172.42 ms and
3181.48 ms for two unmetered calls on this local host. Rebuilding the resource
Engine per call creates a material latency regression. Retain this revision as
opt-in while a reusable immutable resource Engine and reviewed accounting
boundary are designed; the direct-source receipt is not a packed release
qualification. These timings are one local workload, not a source-frozen or
cross-host performance claim; repeat them on the final isolated artifact.
CONTRACT-080's R2 production interface already resolves the accounting
boundary: `Engine::new(ResourceSet)` admits and privately owns immutable
resources at factory setup; a fresh operation `Context` cumulatively charges
its source/identity/request/receipt/current/semantic/output work. Resource
construction is not repeated per method call, and private transport overhead
does not consume an independently admitted payload budget. The next
kind/nullability binding revision must implement that retained Engine boundary,
prove factory failure/snapshot isolation and per-call reset, and benchmark
its final installed artifact before source selection.

The moving retained-Engine candidate now separates factory resource admission
from per-call work. Sol review caught a factory-order error where resource
reflection preceded a zero-work/cancellation preflight, and an uncharged clone
of decoded resource trees before `Engine::new`. Both have been corrected in the
source candidate; fresh native/browser controls, a repeated-call benchmark and
installed-artifact review are still required before default selection. The
full Dataset-values host-input candidate uses the same factory/operation split.
Its nine focused Rust tests and fresh isolated Node/Bun and Chromium 153
replays pass all eight frozen host-order controls, successful validate/verify
parity, copy isolation, and zero-touch setup refusal. Sol independently reran
the Node/Bun packet and accepted this bounded opt-in result in the
[host-admission review](evidence/rust-migration/r5-dataset-values-host-admission/sol-review.md).
Integrated packed-package and default-route qualification remain open.

The retained kind/nullability opt-in route subsequently passed six semantic
cases and ten host-order/control cases in Node/Bun, plus six operations and nine
controls in fresh Chromium. Sol independently reran the combined-index Bun
packet. A repeated local three-call sample measured 285.84 ms for Rust
operations after 2825.25 ms factory setup, versus 5.32 ms for TypeScript
operations. This roughly 54-fold operation latency on the representative
fixture is a default-selection blocker; targeted profiling and optimization
must preserve the staged host order and zero-touch factory refusals. Final
packed-package source-cohort qualification remains open.

The first schema-cache optimization reduced local call time to roughly
25–28 ms, but Sol review found that its process-global cache made factory
setup work depend on prior unrelated factories. The corrected revision owns
compiled schemas per retained runtime; two successive factories now report
identical charged setup work and below-budget refusal in Node and Chromium.
[Sol's follow-up review](evidence/rust-migration/r5-kind-nullability-default-route/sol-review.md)
accepts the bounded opt-in route. A fresh local three-call sample remains
81.65 ms for Rust after 3.17 seconds of setup versus 5.20 ms for TypeScript,
so default selection stays held for performance and installed-package review.

The full Key tuple Chromium packet exposed a target-width portability defect:
the frozen MAX_SAFE decimal precision/scale case succeeds in 64-bit Node but
was initially refused on wasm32 by a `usize` conversion; a subsequent
saturation-only repair still encoded the scale through 32-bit `usize` and
changed the receipt bytes. Exact 64-bit wire semantics and all related
precision/width casts now pass a fresh bounded Node/Bun/real-Chromium replay:
87 in-profile encoders, five verifiers, 4,000,000 raw output bytes, and staged
receipt-before-current controls. The [independent Sol follow-up review](evidence/rust-migration/r5-core-key-tuple/sol-binding-review.md)
accepts that opt-in packet but holds default selection because its resource
runtime still initializes lazily inside the first operation. CONTRACT-080
requires resource admission at factory setup; a retained eager-runtime revision
and integrated installed replay are the next gates. The wasm32 defect also
adds an R8 cross-target integer-width audit for other Rust operations that
turn semantic integers into `usize` before encoding or comparing meanings.

The eager Key tuple revision now admits immutable resources at factory setup
and passes fresh isolated Node 26.12.1, Bun 1.4.3 and Chromium 153 packets:
87 exact in-profile encoders, one separately pinned host-number refusal, five
verifiers, large byte boundaries, receipt-before-current order and setup
controls. [Sol's eager factory review](evidence/rust-migration/r5-core-key-tuple/sol-binding-review.md)
independently checked artifact timing/hashes and a focused installed Node
smoke. It accepts the bounded opt-in revision; default routing still awaits a
source-frozen integrated installed package, broader resource bounds and R8
retirement review. The sampled factory cost was 1.86 seconds and 401,221,260
charged work units on the cited resource set.

The v4 Node and browser roots now use internal model factories that omit
the unselected Key tuple runtime and its methods; public generic and
standalone tuple factories remain eager. [Sol's scoped split review](evidence/rust-migration/r5-core-key-tuple/sol-binding-review.md)
accepts the factory shape after five focused tests, typecheck, and a captured
Node/Bun/Edge Chromium WASM package replay. One local cold Bun root import
fell from roughly 10.4 seconds to 6.7 seconds, a diagnostic sample. The
package captured a pre-Protobuf shared index and the Node test used an older
addon, so current combined-source installed qualification, direct tuple
root selection, and retirement remain open.

The next [six-operation semantic-reference candidate](evidence/rust-migration/r8-semantic-reference-parity-candidate/README.md)
now has an opt-in retained-Engine Python binding for core inspection/read/
declaration/verification and interim extension get/set. Staged Rust entrypoints
preserve declaration types-first, verifier receipt-first, and setter
profile/target-before-annotation admission. [Sol's independent Python review](evidence/rust-migration/r8-semantic-reference-python/sol-review.md)
replayed six focused checks from a fresh isolated CPython 3.14 arm64 wheel and
accepts only that bounded scope. The ordinary Hatchling build, declared hosted
wheel/sdist matrix, full frozen 16+16 parity, default Node/browser source
selection and the known `vocabularies: null` TypeError mismatch remain open.
Sol's expanded installed-wheel replay matched all 15 core cases representable
through the Python call signature. Of 15 accessor cases, 12 matched exactly,
one preserved the expected annotation without a separate diagnostics replay,
and two differed: JavaScript `undefined` versus Python `None`, and the
`vocabularies: null` native TypeError versus Rust profile error. The separate
diagnostic-order case was not exercised through these wrappers. This does not
close the full frozen packet or hosted-platform gate.

Sol selected the [R8 adapter operation wave](evidence/rust-migration/r8-adapter-operation-wave-map/README.md)
as the next bounded investigation: eight JSON Schema exports and nine
Protobuf descriptor/document/source exports, or 34 Node/browser root
declarations. The two standards retain separate contracts and evidence.
First compose a current-source, all-eight JSON Schema opt-in packet from the
existing seven-operation and tree/edit predecessors; then compose descriptor
read/write/import/get/export/bundle/inspect evidence separately from explicit
compiler-callback source operations. Existing Rust owners and historical
receipts establish candidates, not default-root retirement. Route changes
require exact host admission/control parity, one installed Node/Bun/Chromium
source cohort and row-level review. The Protobuf source compiler remains an
explicit host capability and may not be silently replaced or dropped.

The descriptor/document subcohort now has a seven-operation opt-in Node/WASM
binding over raw owned descriptor bytes. [Sol's packet review](evidence/rust-migration/r8-protobuf-descriptor-document/sol-review.md)
independently reran five final Bun binding tests and accepted the focused
unknown-wire, copy, 4 MB and host-order controls for the cited artifacts.
The public predecessor's `UmfError` class is still returned as
`UmfCoreError` by this opt-in route, and the full frozen descriptor/native
packet has not been replayed through the binding. Default selection, compiler
callbacks, installed SDK and R8 retirement remain held. An additive
[`umf protobuf descriptor read`](evidence/rust-migration/r8-protobuf-descriptor-read-cli/README.md)
pure Rust CLI command now reads bounded raw descriptor bytes and advertises
only that operation. Its 46-test CLI suite, three frozen wire-vector hashes
and release-binary `PATH`-empty smoke run have [Sol review](evidence/rust-migration/r8-protobuf-descriptor-read-cli/sol-review.md).
It does not qualify source compilation or other CLI operations.

The [opt-in Protobuf source-import host packet](evidence/rust-migration/r8-protobuf-source-import-host/README.md)
now exposes the explicit caller-supplied compiler callback through Node and
browser WASM. [Sol independently reran](evidence/rust-migration/r8-protobuf-source-import-host/sol-review.md)
10 Bun tests (27 assertions) and the final Chromium host-order/diagnostic
case against source-bound artifacts. Controls are boundary-only across an
ordinary asynchronous callback, and the supported callback-result subset is
recorded explicitly. The separate [opt-in source-export host packet](evidence/rust-migration/r8-protobuf-source-export-host/README.md)
now stages the document/payload reads and emitter callback from Rust. [Sol
independently reran](evidence/rust-migration/r8-protobuf-source-export-host/sol-review.md)
the 14-case Node/Bun predecessor differential and fresh Chromium WASM replay,
plus focused Rust tests. The packet retains a named replaced-`Array.prototype.find`
host gap, takes roughly 177 seconds for its nine-test Node suite, and does not
establish the default SDK route. Neither source operation is selected by the
default SDK.

The JSON Schema eight-operation packet reports 41 exact frozen cases and five controls on
each of four host paths. The escaped/Unicode property-name regression was
corrected against Ajv 8.20.0 and the Rust native oracle; the affected Rust
target passes 16/16. [Sol independently replayed the captured Node packet](evidence/rust-migration/r8-json-schema-eight-operations/sol-review.md)
at 41/41 and accepts only this opt-in source cohort. Its sampled operation
latency still blocks default selection; retained immutable resource
compilation, per-call controls and installed routing need separate review.

The retained [prepared JSON Schema runtime](evidence/rust-migration/r8-json-schema-eight-operations/README.md)
now pays resource/schema setup once and passed the same 41-case predecessor
packet on Node, Bun native, Bun WASM and real Chromium. [Sol independently
replayed all four paths](evidence/rust-migration/r8-json-schema-eight-operations/sol-review.md)
from frozen packages and verified their artifact hashes. The 251-byte sample
fell from roughly 0.9 seconds per stateless Rust operation to 14–16 ms per
prepared operation after a 594 ms setup. Default selection remains held because
constructor-time resource admission changes the per-call `maxWork` and meter
sequence; a `maxWork: 10000` bundle control demonstrates the difference. The
prepared entrypoint is an opt-in compatibility profile, not retirement of the
eight TypeScript root exports.

The next integration order is: finish raw-host admission and binding evidence
for the bounded core families; freeze one repository source cohort and regenerate
metamodel, action identity and Python resource mirrors to a check-only fixed
point; recapture the inventory and gap ledger; build the private SDK archive and
run its installed Node/Bun/Chromium replay plus the hosted macOS arm64/Linux
x86_64 archive jobs.

The [R8 archive replay preparation](evidence/rust-migration/r8-sdk-default-package-replay-prep/README.md)
now checks the extracted package condition map for Node, browser and the
explicit `./reference` rollback route, exercises three tampered-route refusals,
and records the archive hash. Sol reviewed the guard against the current
`package.json` and builder route map and reran `bun run typecheck`. The historical
R7 archive is deliberately rejected because its extracted manifest lacks
`./reference`; it produced no new host receipt. A fresh fixed-point archive
and installed replay remain required before any source-selected route retires.

The [compact Dataset evidence](evidence/rust-migration/r5-dataset-values-compact-default-cutover/README.md)
currently qualifies selected validation vectors, while compact verification
remains TypeScript-root pending host-order and browser resource evidence. The
[full Dataset tagged-wire packet](evidence/rust-migration/r5-dataset-values-wire-bindings/README.md)
now passes seven frozen validation cases, four verification cases and host
cancellation through the opt-in Node/WASM operation wrappers. Its longest
four-case verifier run took 281.72 seconds; raw-host visitation order, one
cumulative admission ledger, installed hosts and default routing remain open.
The [Record value host packet](evidence/rust-migration/r5-record-values/README.md)
qualifies an opt-in Node/Bun/Chromium raw-host subset, not default routing or
the browser count-limit boundary. Full Dataset values now have the separate
host-admission packet above; their default-root selection and installed package
qualification remain open. The 128-bit and UUID family has an opt-in Rust binding for its
eleven public functions, including typed-array and descriptor-aware host
admission. Its [frozen predecessor packet](evidence/rust-migration/r5-bit128-default-route/README.md)
and [default-route adapter](evidence/rust-migration/r5-bit128-default-adapter/README.md)
now pass focused Bun parity and oracle checks; `BIT128_PROFILE` remains inert
data. The eleven functions are source-selected in the Node and browser root
entrypoints, and a direct Bun import of the Node source route passed. They
remain retirement gaps until a clean installed Node/Bun/Chromium archive replay
passes with exact source hashes, including Node `Buffer` and browser WASM
initialization.
The next shared-semantic family is semantic-type registry and value checking:
its [15-export predecessor packet](evidence/rust-migration/r5-semantic-types-default-root/README.md)
is frozen for a bounded registry/value subset, and opt-in Rust core plus a
bounded six-operation Node binding already exist. Browser callback transport
has a scoped opt-in replay; installed default routing and the remaining public
extension surface still need qualification before retirement.

The [current-source semantic binding follow-up](evidence/rust-migration/r5-semantic-types-bindings/current-source-replay-2026-10-24.md)
now passes a clean-installed Node replay of the six opt-in operations and two
fresh Chromium 153 WASM replays, including callback transport (14 direct,
10 registration and five aggregate cases). [Sol independently reran the host
packets](evidence/rust-migration/r5-semantic-types-bindings/sol-current-source-review.md)
and checked the package/addon/browser-harness hashes. The six operations still
need a current-source installed default SDK route, the broader registry
surface, and resolution of the frozen `vocabularies: null` error difference;
the TypeScript root declarations remain retirement gaps.

The reviewed next-wave order after that browser transport is CSV Boolean
lexical validate/verify (two root operations), the scalar/record-member/reference
inspectors (three operations), then Core Key tuple encode/verify/read/prepare
(four operations). Existing Rust cores and focused predecessors make these
bounded candidates, but each still needs source-selected Node/browser routing,
current-cohort installed replay and a separate retirement decision. CSV
verification currently uses staged contexts, the inspectors need an installed
SDK cohort, and the tuple browser route has a narrower response limit than
the core ceiling. Those limitations must be resolved or explicitly versioned
before claiming parity. This sequence does not change the 922-gap release
denominator by itself.

The [CSV Boolean](evidence/rust-migration/r5-csv-boolean-default-route/README.md)
and [three-inspector](evidence/rust-migration/r5-core-inspectors-default/README.md)
source routes now have fresh Chromium 153 isolated-WASM replays. [Sol reran the
CSV packet](evidence/rust-migration/r5-csv-boolean-default-route/sol-browser-review.md)
with all four receipts and receipt-first expected-source ordering, and [Sol
reran the inspector packet](evidence/rust-migration/r5-core-inspectors-default/sol-browser-review.md)
at 26/26 frozen outcomes with work and reference-order controls. These are
captured source-route artifacts; a clean integrated SDK archive, broader
resource/adversarial host behavior and explicit retirement review are still
required for those five logical exports.

The [JavaScript numeric host-order follow-up](evidence/rust-migration/r5-javascript-numeric/README.md)
keeps all five numeric adapter exports opt-in. Its 27-vector oracle replay
passes, but two crossed invalid-scalar/accessor-context probes produce
`JAVASCRIPT_NUMERIC` in the predecessor before context access and `NON_JSON`
in the current Rust wrapper. The Rust route also rebuilds the resource Engine
per operation. Resolve staged scalar/context ordering and immutable resource
admission with one public-call work ledger, then rerun installed Node/Bun and
browser evidence before any default selection.

The retained [numeric stage revision](evidence/rust-migration/r5-javascript-numeric/README.md)
now passes those crossed host-order controls through an opaque Rust-owned,
single-use stage and a retained Engine. [Sol independently replayed](evidence/rust-migration/r5-javascript-numeric/sol-retained-stage-review.md)
the 27-vector Node/Bun differential and Edge WASM packet from the frozen
artifacts, including malformed-carrier precedence, invalid Field before
lossy conversion, direct forgery refusal and cumulative per-call controls.
Factory setup has a separate explicit resource ledger. This qualifies only
the opt-in subset; the five TypeScript root exports, installed SDK route and
Python distribution still require their own retirement evidence.

The `parseNativeJson` opt-in tagged string parser has a six-case direct
TypeScript raw-host [supplement](evidence/rust-migration/r5-json-schema-tree-operations/native-json-host-predecessor.json)
and [Sol review](evidence/rust-migration/r5-json-schema-tree-operations/sol-review.md).
Direct wrong-type JavaScript calls and tagged-wire admission differ, so the
existing 22-case installed JSON Schema parser receipt does not authorize a
default-root route for the helper or the eight JSON Schema operations.
The separate [eight-operation boundary audit](evidence/rust-migration/r8-json-schema-eight-operations/README.md)
freezes 24 current TypeScript host, export and validator cases. It keeps all eight
default exports on TypeScript: `additionalProperties: true` is complete in the
predecessor but incomplete in the pinned Rust profile, and raw option/resource
accessors, proxy traps, wrong-type errors and caller controls are observably
different at the host boundary. Those are explicit compatibility and profile
decisions, not evidence for silently routing the default exports to Rust.

The [R8 security truth and composition slice](evidence/rust-migration/r8-security-truth-logic/README.md)
adds Rust ownership for `securityNot`, `securityAnd`, `securityOr`, and
`composeSecurityRules` over admitted tagged Values and already evaluated rules.
[Sol independently replayed](evidence/rust-migration/r8-security-truth-logic/sol-review.md)
the truth and 22-case composition predecessors, existing security suite, and
four focused Rust wire tests. This is four of 43 security-family executable
exports and has no installed host route; raw JavaScript accessors/proxies,
policy/fact selection and native enforcement remain outside the accepted
subset. The 922 default-route retirement gaps are unchanged.

A subsequent [independent Sol review](evidence/rust-migration/r8-security-truth-logic/sol-review.md)
accepted `securityRefIdentity` as a fifth bounded opt-in tagged-value
operation after an unmetered component clone was corrected and the eight-case
predecessor plus three Rust wire tests passed. An internal expression-tree
helper also passed five Bun first-fault bound cases and four Rust core tests;
it stops at the first fault, whereas the TypeScript inspector can collect
multiple sibling diagnostics. Neither addition implements policy/ontology
interpretation, a default binding route or security authorization.

The subsequent [25-case disclosure codec audit](evidence/rust-migration/r8-security-truth-logic/README.md)
and [Sol review](evidence/rust-migration/r8-security-truth-logic/sol-review.md)
keep all six legacy/V2 disclosure validation and codec exports on TypeScript.
Their success paths require policy/ontology/Field or protection/catalog/domain
interpretation and literal-budget checks before JSON/YAML transport. A
parser-only Rust port would change acceptance. The existing truth and identity
subsets do not satisfy those dependencies.

The shared [security literal foundation](evidence/rust-migration/r8-security-literal/README.md)
now exposes the Rust Engine's first-diagnostic `checkSchemaLiteral` behavior
for an already admitted source, Field and JSON literal. [Sol independently
replayed](evidence/rust-migration/r8-security-literal/sol-review.md) all eleven
current Bun predecessor cases and two Rust integration tests. This does not
resolve either legacy policy/ontology interpretation or V2 protection-source,
domain and parameter authority, nor the JSON/YAML and raw-host codec boundary.
All six disclosure codec exports remain on TypeScript.

The [opt-in literal wire
primitive](evidence/rust-migration/r8-security-literal/README.md) exposes the
same caller-selected Rust admission stage with explicit core resources. [Sol
independently reviewed](evidence/rust-migration/r8-security-literal/sol-review.md)
the eleven-case exact tagged replay and three focused wire tests. This does
not select policy/catalog/domain meaning, implement batch disclosure or JSON/
YAML codecs, or retire any of the six TypeScript exports.

The subsequent [14-case V2 protection resolution
packet](evidence/rust-migration/r8-security-protection-resolution/README.md)
and [Sol review](evidence/rust-migration/r8-security-protection-resolution/sol-review.md)
pin policy/catalog/domain ordering and unknown-member retention. The internal
Rust candidate preserves tagged policy, catalog and closure snapshots and
always refuses authority; its focused test passes. It does not reproduce the
TypeScript resolver's schema, pin, reference, Field or domain outcomes, and it
does not close either resolver or any disclosure default route.

The [Delta Spark hash slice](evidence/rust-migration/r8-delta-spark-hash/README.md)
adds one exact scalar operation with a bounded opt-in JSON wire entry. [Sol
independently reviewed](evidence/rust-migration/r8-delta-spark-hash/sol-review.md)
the 26-case Spark 4.0.1 fixture authority and reran two core plus two wire
tests. The eight Delta schema/table exact-tree operations now have reviewed
core-only candidates. A current TypeScript predecessor packet and focused Rust
suites cover 37 exact schema corpus round trips, two structural rejects, five
ordered schema-warning families, eight table numeric boundary outcomes,
pointer/replacement error order and immutable edits. [Sol's review](evidence/rust-migration/r8-delta-spark-hash/sol-review.md)
records independent schema 4/4, table 2/2, numeric grammar 2/2, TypeScript
packet and typecheck passes; Python source-distribution closure passes 12/12.
The numeric shape projections fail closed on future grammar rules. A subsequent
[nine-case table-context warning receipt](evidence/rust-migration/r8-delta-spark-hash/delta-table-warning-predecessor.json)
has independent read-only TypeScript verification and Rust schema 4/4 plus
table 3/3 test passes; its ordered code/path/message/severity matches those
exact cases. Warning coverage beyond those inputs and exact structural error
messages remain open. An
opt-in tagged [wire slice](evidence/rust-migration/r8-delta-spark-hash/delta-wire.json)
now dispatches all eight operations; Sol independently reran its three tests
for round trip, edit, error order, closed dispatch and control refusal. Host
bindings and installed route evidence remain open. Native Delta reader/writer
support, default route and family-level completion remain unclaimed.

The same opt-in wire now includes schema/table inspection, ten operations in
all. [Sol independently reviewed](evidence/rust-migration/r8-delta-spark-hash/sol-review.md)
the four-test wire differential for five schema and three table warning inputs;
the Rust table core differential covers all nine frozen table inputs. These
ordered diagnostics match their current TypeScript cases, while wider context
parity and native Delta/log validity remain open.

The following [Delta JSONL source
slice](evidence/rust-migration/r8-delta-spark-hash/README.md) adds Rust
capture/export/inspection and an opt-in tagged wire. [Sol reviewed](evidence/rust-migration/r8-delta-spark-hash/sol-review.md)
the five-case predecessor, two core tests and three wire tests for exact
source, UTF-16 line offsets, native JSON tokens and ordered diagnostics.
Action inspection, commit/checkpoint reconciliation, native log validity,
Node/Bun/browser binding and default retirement remain open.

The explicit Gregorian civil-date core has an [opt-in tagged-wire
candidate](evidence/rust-migration/r5-gregorian-date-wire/README.md) for parse
and truncate. Its 50-case current Bun predecessor, three core tests and five
wire tests have [independent Sol review](evidence/rust-migration/r5-gregorian-date-wire/sol-review.md).
It preserves tested date results and refusal classes but not all RangeError
messages or raw JavaScript host behavior. Node/browser binding and default
retirement remain open; no generic UMF `date` receives calendar semantics.

The separate explicit [Access temporal token
parser](evidence/rust-migration/r5-access-temporal/README.md) now has a Rust
core and opt-in tagged wire for date, local and known-offset instant values.
Its 56-case current Bun predecessor includes 48 tagged cases compared by
exact result/error message in Rust and eight raw-host observations. [Sol
review](evidence/rust-migration/r5-access-temporal/sol-review.md) independently
replayed the packet and passed six core plus three wire tests. This does not
replace Python carrier admission or select a temporal interpretation for an
unqualified core scalar; host bindings and default retirement remain open.

The explicit [RFC3339 exact-instant tagged-wire
candidate](evidence/rust-migration/r5-rfc3339-exact-instant-wire/README.md)
adds parse and equality operations backed by the existing Rust core kernel.
[Sol's independent review](evidence/rust-migration/r5-rfc3339-exact-instant-wire/sol-review.md)
reran the four Rust wire tests and five Bun adapter tests against a packet with
12 tagged and four excluded raw-host cases. A subsequent diagnostic refinement
passed five Rust core and five wire tests with exact tagged TypeScript messages,
first-fault order, and the 1,048,576/1,048,577 UTF-16-unit boundary. Raw-host
parity, Node/Bun/browser binding, default selection, and retirement remain open.

The direct retained [Core Key tuple runtime receipt](evidence/rust-migration/r5-core-key-tuple/direct-runtime-receipt.json)
now covers 87 frozen in-profile encoders, five verifiers, receipt-first staged
verification and byte reads, cumulative host work, one-shot stage consumption,
the 4 MB boundary, and a fresh Edge 156 WASM replay. [Sol independently
replayed the Node/Bun test pair](evidence/rust-migration/r5-core-key-tuple/sol-binding-review.md)
(7 tests, 153 assertions) and accepts the direct opt-in runtime for that
captured source/artifact cohort. The public opt-in factory still routes some
operations through generic wire dispatch; its direct-runtime promotion,
default-root selection and installed package replay remain open.

The public opt-in factory has now been promoted to the direct retained
runtime. Its [source-bound receipt](evidence/rust-migration/r5-core-key-tuple/direct-factory-route-receipt.json)
and [independent Sol review](evidence/rust-migration/r5-core-key-tuple/sol-binding-review.md)
cover 87 frozen encoders, five verifiers, per-argument transport limits,
source/identity/value/options order, receipt-first verification, cumulative
work, and large byte/output-copy limits in Bun and a fresh Edge WASM replay.
Sol independently reran the isolated Bun packet (11 tests, 273 assertions)
and the recorded browser harness after verifying all 15 receipt source and
artifact hashes. This accepts only the captured opt-in factory; the four
default tuple exports still inherit TypeScript and await one combined-source
installed SDK route, broader parity and retirement review.

An earlier shared Rust source and generated metamodel/action/Python resource
mirror cohort reached a local check-only fixed point. `bun run typecheck`,
`check:rust-boundaries`, and `check:core-authority` pass; the production
boundary census reports zero V8 debt. The authority checker now registers the
19 historical R5 refusal controls by exact source text, and its focused tests
still reject an unregistered retired-core marker. Inventory and ledger
check-only recaptures passed for that cohort. Active binding edits require a
new source-frozen regeneration, census and installed host replay before the
successor cohort may advance to release gates.

The next fixed-point local SDK snapshot had source-tree SHA-256
`d3de6880d8d004a841a4671bb7c1727b99c225af008c2fe782317709f20baedf`
and private archive SHA-256
`f59fb58427849761c7295bfa7f8b24e64a807889f136cb47398504073a2b7244`.
The installed route/tamper guards and the 31-case codegen plus frozen
cardinality, facets, Keys, Bit128 and compact Dataset comparisons completed on
Node 26.12.1 and Bun 1.4.3, but the aggregate gate failed before browser replay:
the harness expected 65 cardinality outcomes while its frozen packet and both
hosts produced 66. The assertion is corrected in moving source; that archive
is not a passing installed receipt, and a new source-pinned build/replay is
required. The same run exposed repeated per-call schema compilation (Node
stage about eight minutes including source-package smoke, Bun aggregate about
13 minutes from start), so retained-resource performance and budget semantics
are qualified separately. An [opt-in retained codegen handle](evidence/rust-migration/r7/retained-codegen-handle/README.md)
compiles explicit resources once and uses fresh per-call controls. [Sol
review](evidence/rust-migration/r7/retained-codegen-handle/sol-review.md)
independently passed the Rust 2/2 context suite, Node 10/10 host-admission
suite, generated Node-target WASM and real Chromium browser-target replays with
frozen output parity and later meter/cancel/deadline/disposal checks. This does
not change the default stateless factory or establish installed SDK
performance. A measured Node/Chromium differential prevents a transparent
promotion: stateless calls charge 952,618,338 work units and reject a shared
484,209,895-unit budget that the retained call (15,801,452 units after a
937,053,874-unit setup) accepts. Invalid resources also fail at first call
versus constructor. The default remains stateless pending a separately
versioned behavior decision; the [Sol review](evidence/rust-migration/r7/retained-codegen-handle/sol-review.md)
records the exact comparison. The refreshed R8 inventory still records 922
logical executable retirement gaps, with 29 Rust-selected operations per
default root and 893 inherited TypeScript implementations. New Delta and
security opt-in source edits after this snapshot require another recapture.

Milestone A is also open at its distribution gate. The Python production
source no longer relies on V8, but the
[coordinated release matrix](evidence/rust-migration/r8-python-coordinated-release/README.md)
has not produced the six hosted wheel/sdist pair receipts. The existing-release
publisher handles only exact-tag Core releases; a coordinated publisher for
this Rust pair remains unqualified, and the SDK archive is private. Do not merge or tag
this as a complete Rust port, or publish the Python pair, until the R8 checklist
above and its actual hosted/consumer evidence pass on one reviewed source
cohort. A release must name the remaining versioned platform/subset limits and
pin rollback artifacts; historical private receipts cannot be promoted to
release evidence.

The next reviewed R8 Delta slice has an [opt-in action-shape and ordinary
reconciliation receipt](evidence/rust-migration/r8-delta-spark-hash/README.md)
and [independent Sol review](evidence/rust-migration/r8-delta-spark-hash/sol-review.md).
Six frozen action inputs and five reconciliation inputs pass their tagged
wire differentials; neither operation is selected by the default host roots.
The five-case reconciliation implementation does not yet cover add/remove
conflicts, cross-commit replacement order, checkpoints or broad numeric
diagnostics. The [V2 protection source candidate](evidence/rust-migration/r8-security-protection-resolution/README.md)
now passes ten tagged source-stage cases from a 16-case predecessor packet.
[Sol's review](evidence/rust-migration/r8-security-protection-resolution/sol-review.md)
found and closed a cross-input diagnostic bug; domain-stage and raw-host
cases, interpretation and authority remain open.

The next [V2 domain-stage candidate](evidence/rust-migration/r8-security-protection-resolution/README.md)
passes all five tagged domain cases from that packet. [Sol's review](evidence/rust-migration/r8-security-protection-resolution/sol-review.md)
replayed the Rust core and wire suites after shared-source stabilization. It
retains the closure and exact Field occurrences but remains data-only:
`complete:false`, `authority:false`, one raw-host case outside tagged JSON,
and no default route or policy/literal interpretation. The
[Delta mapped-field rename candidate](evidence/rust-migration/r8-delta-spark-hash/README.md)
passes nine current-TypeScript cases and one malformed-UTF-16 pointer refusal
under its opt-in wire. [Sol's review](evidence/rust-migration/r8-delta-spark-hash/sol-review.md)
closed a meaning-loss bug before accepting this bounded proposal; native
transactions, historical state and default host routing remain open.

The four explicit Gregorian/RFC3339 temporal operations are selected by the
moving Node/Bun and browser V4 root entries. A [source-bound private archive
checkpoint](evidence/rust-migration/r5-temporal-default-route/README.md)
passed exact error/raw-host and left-first comparisons on Bun 1.4.3 and
Node 26.12.1, plus 17 real Chromium 153 checks. Its manifest reports eleven
generator-derived inputs and `source-drift-not-publishable`; it is not a
release-fixed-point cohort. Sol independently verified the package artifact
hashes and reran the installed Node/Bun/Chromium comparisons in the
[independent review](evidence/rust-migration/r5-temporal-default-route/sol-review.md). Current
parallel Delta edits require a fresh Rust wire and fixed-point replay before
any complete default-route or release claim. The executable retirement census,
including `./reference`, remains open.

The V2 security source and domain candidates now retain isolated UTF-16 units
in diagnostic paths and messages; [Sol's follow-up review](evidence/rust-migration/r8-security-protection-resolution/sol-review.md)
reran the tagged packet and focused core/wire cases. The
[Delta reconciliation packet](evidence/rust-migration/r8-delta-spark-hash/README.md)
has expanded from five to eight cases and now covers ordered map replacement
and selected add/remove conflicts; [Sol's review](evidence/rust-migration/r8-delta-spark-hash/sol-review.md)
accepts only those ordinary-action histories. Checkpoints, broader
deletion-vector transitions and native transaction validity remain open.

The four Core relationship operations are selected by the moving Node/Bun and
browser V4 roots. The [eleven-case installed replay](evidence/rust-migration/r8-core-relationships-default-boundary/README.md)
matches the current TypeScript raw-host outcome and operand-reflection order
on Bun 1.4.3, Node 26.12.1 and Chromium 153.0.8010.12. Node used a
Node-target-bundled test harness against the installed package. The browser
had no Node globals. [Sol independently replayed and reviewed this
candidate](evidence/rust-migration/r8-core-relationships-default-boundary/sol-review.md).
The package manifest records eleven generator-derived inputs, so this is a
private nonpublishable checkpoint; `./reference` and the executable retirement
census remain TypeScript gaps.

The [regenerated relationship package](evidence/rust-migration/r8-core-relationships-default-boundary/README.md#regenerated-fixed-point-candidate)
now has identical live/captured source hashes and zero generated transforms.
[Sol's fixed-point review](evidence/rust-migration/r8-core-relationships-default-boundary/sol-review.md)
independently reran all eleven installed cases on Bun, Node and Chromium. The
manifest still marks this package private/nonpublishable; R8 retirement and
hosted release gates remain open.

### R7/R8 continuation checkpoint — 2026-10-25

The [staged Core Key verification candidate](evidence/rust-migration/r7-core-key-staged-verification/README.md)
resolves the receipt-first production interface for an opt-in Node/WASM
binding. Rust owns a one-use, engine-bound handle: receipt admission and
recomputation happen before current admission, and finish moves the retained
receipt without copying it again. The runtime admits exactly five explicit
resources. [Sol's independent review](evidence/rust-migration/r7-core-key-staged-verification/sol-review.md)
passed the fresh private Node package's four binding tests and a real Chromium
153 staged-handle replay. Extension semantic callbacks, installed archives,
other hosts and default-root selection remain outside that evidence.

The [current R8 inventory](evidence/rust-migration/r8-symbol-inventory/README.md)
now derives V4 direct exports from TypeScript-checker-resolved declarations.
Node and browser roots each select 37 Rust names, including four temporal and
four relationship operations omitted by the earlier static 29-name list.
The latest ledger records 922 logical executable retirement gaps, 52 accepted
opt-in Rust mappings, 870 unmatched executable names, and zero binding routes
proven for this combined source cohort. Its `./reference` route remains
TypeScript. The [independent review](evidence/rust-migration/r8-symbol-inventory/sol-review.md)
also pins direct writer authority for six Field/Cardinality projection
schemas and a subsequent [two-output Parquet metadata writer](evidence/rust-migration/r8-symbol-inventory/parquet-metadata-resource-authority.md). Resource authority
stands at 32 generated-known, 19 authored-known, 91 candidate-generated and
56 unresolved resource aliases. The four frozen model
vocabulary aliases and the executable `scalarTypesForVersion` gate have
separate [dispositions](evidence/rust-migration/r8-symbol-inventory/model-vocabulary-export-dispositions.md);
none is retired. This coordinated recapture pins inventory SHA-256
`2fa3e288ea62bf75d7e08baa79c081db50afae8ef153ded8ed1ba1c31f5d5ba9`
and ledger SHA-256
`971a6e327e55fa81cde44e2b7f0c5e3f3d8a8fdf2b35c8527088ecab3ac08ab4`;
both generator `--check` modes, the full R8 ledger suite (27/27), metamodel
and resource checks, TypeScript typecheck, the 693-module Rust boundary gate,
and Python sdist/artifact custody tests (16/16) pass. Subsequent source edits
require another recapture.

For sequencing, the explicit `./reference` executable rows at this capture
concentrate in `src/core-ideals` (254), `src/model` (85), and
`src/projections` (52), followed by adapter and extension families. These are
row counts, not estimated Rust functions or a claim that similarly named
operations share semantics. Port and retire each source/route only after its
contract, resource, host-boundary and installed-package checks pass.
The [AST classification of 167 variable rows](evidence/rust-migration/r8-symbol-inventory/package-reference-variable-analysis.md)
finds no additional inert generated-data alias to retire: four frozen
vocabulary arrays and `CURRENT_CORE_VERSION` have generated value provenance,
while `scalarTypesForVersion` is an authored executable gate. Authored package
descriptors and other static values still need separate source authority and
consumer-route decisions.

The [Delta reconciliation candidate](evidence/rust-migration/r8-delta-spark-hash/README.md)
now covers eight ordinary histories with exact report parity and an explicit
malformed-UTF-16 refusal in its nine-case packet. The
[security protection parameter candidate](evidence/rust-migration/r8-security-protection-parameters/README.md)
has reviewed source/domain/catalog bounds and eight tagged exact predecessor
outcomes. Both remain opt-in and bounded; neither qualifies native Delta
transaction validity, security authorization or default-root selection.

The subsequent [ordinary DV transition packet](evidence/rust-migration/r8-delta-spark-hash/sol-review.md#ordinary-deletion-vector-transition-packet--2026-10-25)
expands the Delta candidate to twelve exact ordinary histories plus one
malformed-UTF-16 source-preserving refusal. Sol independently replayed the
frozen wire differential. The Rust implementation required no change; DV
bytes, feature consistency, checkpoints and native transaction validity remain
unqualified.

The [security reference-function slice](evidence/rust-migration/r8-security-protection-functions/README.md)
now covers `mask/constant`, `mask/null-out`, `mask/partial`,
`mask/fixed-length-redact`, and `generalize/prefix-only` in opt-in Rust
core/wire. Its [independent review](evidence/rust-migration/r8-security-protection-functions/sol-review.md)
replayed 25 exact tagged cases from 29 frozen predecessor outcomes and closed
Field-shape, diagnostic-order and host-budget labeling defects. Two
malformed-schema cases and two raw-host accessor cases remain outside exact
tagged parity. No authorization, native custody, default route or installed
archive is qualified.

Next, complete the remaining security functions and adapter ownership slices,
resolve every executable retirement and resource-authority row, and replay a
single source-fixed package across Node/Bun, real browser, Rust CLI and Python.
Then regenerate and verify metamodel/resource provenance, run the Rust boundary
gate and coordinated six-cohort hosted Python wheel/sdist matrix, review the
installed archives, reconcile current main, and only then create/merge the
complete-port PR and cut the paired release. The R8 gate remains open.
The current source-bound metamodel build and `--check` pass after a deliberate
regeneration; subsequent source changes require another check before release.

For the next Core model wave, Sol fixes the production interfaces before Rust
edits. `declareCoreRecordType` and `verifyCoreRecordTypeDeclaration` retain
their public v6 receipts. Verification must expose Rust receipt
admission/recomputation and later current comparison as distinct phases, so a
host can preserve receipt-first admission; a tagged opt-in wire accepting both
values cannot prove raw-host order. Its engine takes exactly `coreSchema`,
`referenceSchema`, `packageSchema`, `constraints` and `domainPolicy`, while the
kind/record-type v6 operation schemas compile from pinned repository sources.
`inspectCoreRecordMembers` keeps the public 0.3.0 report, full source copy and
missing-versus-explicit-empty meaning. Its production Node/WASM interface
should retain a pinned five-resource engine and compiled result schema, with
fresh per-call controls. The current request-embedded tagged wire is only a
bounded test adapter; no performance, callback or default-route claim follows.

Sol's next Record Type production interface decision is a retained Rust
runtime owning the exact five-resource Engine/Registry and a compiled v6
receipt schema. It must return a Rust-owned, engine-bound, one-use preparation
handle after receipt admission/recomputation, then admit and compare the
current document only on finish. Node and WASM wrappers must preserve that
order for raw getters, reject forged/cross-engine/reused handles, and consume a
handle even if finish admission fails. The logical public verification call
must carry cumulative work/deadline/cancellation accounting across both stages;
two independently reset budgets would not preserve the predecessor bound.
The generic tagged wire remains a differential adapter and may not substitute
for this host interface. The [bounded candidate and Sol review](evidence/rust-migration/r5-core-record-type/sol-review.md)
cover three declaration/verification pairs and eight tagged refusals; raw
getter order, retained schema lifecycle and installed hosts remain open.

The [Record members Sol review](evidence/rust-migration/r5-record-members-inspection/sol-review.md)
replays all eleven frozen core/wire cases, including UTF-16 qualifier paths and
caller identity ordering. Fresh isolated Node 26.12.1, Bun 1.4.3 and Chromium
153.0.8010.12 packages each replay all eleven outcomes, with independent Sol
replay; the historical Chromium receipt covers nine cases only. These receipts
pin a scoped source slice and do not qualify the installed default SDK; the
later retained Node/WASM receipts qualify a bounded Engine/Registry lifecycle
separately. The [Python sdist resource-closure review](evidence/rust-migration/r8-python-sdist-rust-resource-closure.md)
adds unconditional Rust `include_str!` compiler inputs to the source archive;
the focused sdist suite passes 12/12. After the generated fixed point, an
actual Hatch `umf_core` 0.11.0 source archive built and its extracted 872-file
inventory matched the checkout byte-for-byte at that source checkpoint.
Offline `cargo check --locked -p umf-cli` passed from that extraction on macOS
arm64. Subsequent source edits require a new archive and the coordinated
hosted wheel/sdist matrix remains a separate gate.
Neither v6 operation schema has an identified exact authoring authority, so
the R8 resource ledger leaves them unresolved.

The retained Core Record Type interface now has an exact-five-resource Rust
runtime with one compiled receipt schema, an engine-bound one-use stage, and
cumulative receipt/current accounting. The [independent Sol review](evidence/rust-migration/r5-core-record-type/sol-review.md)
records 4/4 runtime units, 2/2 tagged wire tests, 8/8 focused Node facade
tests, and frozen private Node/Bun replays. The opt-in WASM wrapper passed 5/5
and a real Chromium replay; Sol independently reran its combined binary after
the direct Rust finish guard. Neither host result retires a
default route. The next parallel slice gives Record Members a retained
Engine/Registry and compiled result schema with direct Node/WASM factories.
The Rust retained runtime now passes 3/3 units, and a combined WASM package
replays all eleven frozen cases in real Chromium. A combined private Node addon
replays all eleven cases on Node and Bun, and the focused facade suite passes
5/5. Its earlier generic-wire receipts alone did not prove that lifecycle.
The generated metamodel, resource mirrors, symbol inventory and R8 ledger have
been refreshed and checked. The ledger still records 922 logical executable
default-route gaps, 870 without an accepted Rust operation mapping, and only
37 Rust-selected direct exports per Node/browser root. This remains a private
source cohort, not an installed SDK or release qualification.

The [Python/CLI route audit](evidence/rust-migration/r8-python-cli-closure/README.md)
confirms that `umf-codegen`'s seven semantic operations source-route through
the pinned Rust CLI without V8, while its Python process/file writer and the
broader `umf-core`/`umf_access` public surfaces still have Python behavior.
The default Node/Bun/browser SDK also still inherits TypeScript executable
exports. The six-cohort Python wheel/sdist pair receipts and same-run
aggregate have not been produced for this moving source, and the current
default SDK workflow is deliberately private/nonpublishing. Those are release
and full-retirement gates, not evidence that V8 remains in the codegen route.

The current Python source/build audit finds no executable V8 or JavaScript
runtime dependency in the default `umf-core`, `umf-codegen`, or `umf_access`
package paths. `umf-codegen` invokes the native Rust CLI/extension; its Python
subprocess code manages that native process. This is source-route evidence,
not a current published-artifact or full Rust-port claim. The stage-two
`umf_access` catalog/compiler algorithms remain Python-owned and require a
separate CONTRACT-067/070/071/072 migration and installed-cohort evidence.

The [next core-ideals inventory](evidence/rust-migration/r8-core-ideals-next-wave/README.md)
selects the two Avro Record Type exports as a coherent next candidate. Its
[frozen TypeScript predecessor](evidence/rust-migration/r8-avro-record-type/README.md)
and [independent review](evidence/rust-migration/r8-avro-record-type/sol-review.md)
capture 10 classified, 24 blocked and 20 JSON/YAML recovery outcomes, with
author, tamper, ambiguity, raw-host and 100,001-value controls. The Rust
production interface should retain exact core, kind-operation-v6 and
Avro-record-type result-schema resources, expose classify and recover with
caller-owned controls, and recompute receipt provenance before current-target
comparison. A tagged adapter is differential evidence only; raw host order,
Node/Bun, Chromium and installed routes require separate checks. Neither Avro
export has an accepted Rust operation mapping yet.

The first [Avro Rust foundation](evidence/rust-migration/r8-avro-record-type/README.md#rust-candidate-foundation-2026-10-25)
adds only an opt-in, caller-controlled native record-resolution candidate and
tagged test transport. [Sol's review](evidence/rust-migration/r8-avro-record-type/sol-review.md#rust-resolution-foundation-follow-up)
required a schema-position-only search so a record-shaped extension annotation
cannot be mistaken for a native declaration. The focused Rust core test,
core-wire check and Python source-archive closure test pass. Neither
`classifyAvroRecordType` nor `recoverAvroRecordTypeBundle` is implemented in
Rust; the 922-gap ledger count does not decrease. Its declared schemas are
not yet compiled into a retained runtime, and Node/browser binding work waits
for real classification and recovery semantics.

The [bounded Avro Field classifier](evidence/r8-avro-field-classifier/README.md)
now checks retained archives and author provenance for declared record/error
membership under the exact request/result schema. [Sol's review](evidence/r8-avro-field-classifier/sol-review.md)
independently passed three integration cases, the author-receipt unit and a
no-default-features core check after correcting selected-field and feature-gate
defects. The opt-in [bundle recovery follow-up](evidence/r8-avro-field-classifier/README.md#scoped-classified-bundle-recovery-follow-up)
now recomputes and compares classified receipts and current targets; Sol
independently passed four focused Rust cases, including exact native root and
dependency text retention. Full predecessor replay, retained production
runtime and host routes remain open. The
next [Avro Record Type discovery dependency](evidence/rust-migration/r8-avro-record-type/README.md)
resolves the selected native record and its ordered direct `avro.fields`
identities, with five focused Rust tests passing and explicit ambiguity and
unsupported refusals. It still does not classify a Record or Record Type,
reconcile author receipts, or recover a bundle. None of these opt-in operations
reduces the default-route ledger count.
The [declaration inventory](evidence/rust-migration/r8-avro-record-type/README.md#rust-declaration-inventory-foundation-2026-10-25)
adds the ordered dependency-before-root `avroRecords` schema-position walk
with retained native subtrees; three focused Rust tests and an independent
[Sol review](evidence/rust-migration/r8-avro-record-type/sol-review.md#declaration-inventory-follow-up)
pass. It is an input to Avro Record classification, not that operation.

The later [Parquet Record Type predecessor](evidence/rust-migration/r8-parquet-record-type/README.md)
and [Sol review](evidence/rust-migration/r8-parquet-record-type/sol-review.md)
freeze 6 classified, 12 blocked and 12 recovery outcomes after removing
evolving plan/ledger files from executable source pins. Its two exports have
no Rust mapping; a Parquet byte-capture and schema/container interpretation
foundation was required before attempting the classifier.

The subsequent opt-in Parquet foundation decodes a bounded plaintext PAR1
footer into the narrow schema view and resolves pinned LIST struct elements
while retaining the exact source bytes. Focused Rust tests pass 5/5 for the
decoder and 3/3 for the composition layer; [Sol's review](evidence/rust-migration/r8-parquet-record-type/sol-review.md#retained-byte-decoder-and-list-candidate-review)
records the resource-order repairs and fixture pins. UMF Document
capture now passes three focused Rust cases for the pinned profile, byte
retention and schema identity, with resource and ambiguity repairs recorded
in the [follow-up review](evidence/rust-migration/r8-parquet-record-type/sol-review.md#umf-document-capture-follow-up).
Classification, author provenance, receipt recovery, native-oracle comparison
and default host routes remain open, so neither Parquet export is retired.
The [JSON number packet](evidence/rust-migration/r8-json-number-predecessor/README.md)
has an opt-in Rust core and tagged wire operation with all 18 frozen cases
passing. The wire represents the TypeScript `void` result as tagged null and
cannot carry the JavaScript exception name. Default routing and retirement
remain open. Sol held the attempted default-route selection after the host
probe showed that JavaScript calls `Number(token)` before its later string
coercion, while the tagged Rust transport accepts only materialized UTF-16
text. Both native and WASM addons also lack an exported operation. The
production interface must either preserve that raw host conversion order or
explicitly narrow the runtime contract, then pass installed Node/Bun and real
Chromium evidence before retirement.

Opt-in Avro and Parquet Record classifiers and their recomputing recovery
operations now compose the reviewed discovery/capture foundations. The Avro
classifier accumulates field and author conflicts into a schema-validated
receipt even when a requested module collides; recovery compares the complete
receipt and current target before returning the exact retained root/dependency
texts. The Parquet classifier admits only the LIST struct subset proven by its
retained interpreter; recovery compares provenance and current target before
returning the original bytes. After Sol resource-order fixes and formatting,
the combined Rust `record_` library filter passed 27/27 focused cases. These
are still opt-in core operations: full TypeScript receipt parity, broader
Parquet layouts and native fragments, host bindings, installed Node/Bun and
Chromium evidence, and default-route retirement remain open. Their two direct
result schemas are in the Python sdist compiler-input inventory, with 12/12
focused closure tests passing.

The next opt-in Record Type composition is now implemented in Rust for the
bounded Avro direct/qualified record-field and Parquet LIST struct-member
subsets, with recomputing recovery operations for exact retained Avro source
text and Parquet bytes. Sol's first independent test exposed a missing Avro
target Field kind; review then corrected the Field-versus-declaration
dependency mapping, Parquet inherited author handling and mapping
duplication, and caller-budget accounting. After those changes, the Rust
1.90.0 locked/offline `record_type` filter passed 23/23; no-default-features
core, core-wire and formatting checks passed. The frozen TypeScript packets
were refreshed for generated core-schema and Rust module-registration source
pins only; their Avro 10/24/20 and Parquet 6/12/12 classified/blocked/recovery
outcomes did not change. At that checkpoint the Rust Avro candidate refused
nonempty author lists; the Parquet candidate retained only its interpreted LIST subset
and decoded schema fragments. Full receipt parity, native oracles, raw host
semantics, Node/Bun/Chromium bindings, installed SDK evidence and default
retirement remain open. The current R8 gap denominator is unchanged by these
opt-in modules.

The refreshed 10-condition inventory SHA-256 is
`99f396e7b853c5eafd3658de56624e97dbb1d6cc0866cfcf0fd83e0aedadd9d2`
and the 922-gap ledger SHA-256 is
`ec6395e1549f5ff5f0a636733d1122078171540d4b6d96271e775e198d06b28b`;
both `--check` modes pass. Python source-distribution closure passes 12/12,
but the six hosted cohorts and same-run aggregate remain unrun for this
source.

The subsequent Record Type integration gate now has a versioned, opt-in Rust
wire profile, `umf.record-type-binding/1.0.0`, over full structured source,
request, receipt and current-target values. It rejects malformed or duplicate
request fields, retains caller resource control, initializes the pinned core
and adapter resources, and returns recovered Parquet bytes without loss. The
public Node and WASM facades expose only this tagged profile. Fresh final-source
native addon and WASM builds passed bounded Bun and Node facade replay and
real Chromium replay, including classify/recover, malformed-request and host
limit controls; the [wire-binding receipt](evidence/rust-migration/r8-avro-record-type/wire-binding.md)
pins their source and artifact hashes. The final Rust wire filter passed 4/4,
and no-default-features core and core-wire checks passed. This profile does
not establish raw JavaScript admission order or select a default SDK route.

The current Avro classifier accepts verified selected-Field and direct
Record-member author receipts and preserves conflicting or duplicate selected
authors as ordered blocked mappings with exact residuals and diagnostics in
the frozen cases. Stale and forged selected-Field receipts refuse before
classification. The Parquet classifier distinguishes omitted `authors` from
an explicit empty array and preserves original `SchemaElement.converted_type`
field 6 in the frozen blocked native fragments. The 12 blocked Parquet mapping
arrays match the complete ordered TypeScript packet. This remains a bounded
direct/qualified Avro record-field and LIST struct-member Parquet subset;
unrelated authors, generic blocked Record-classifier composition, unions,
containers, other Parquet layouts, modern `logicalType`, raw host wrappers and
default routing remain explicit gaps. No full-support claim follows from the
tagged binding.

The final-source [Avro native oracle](evidence/rust-migration/r8-avro-record-type/avro-native-oracle.json)
uses Apache Avro 1.12.0 and fastavro 1.12.2 to check 15/15 selected strict
native record positions. The [Parquet native oracle](evidence/rust-migration/r8-parquet-record-type/parquet-native-oracle.json)
uses PyArrow 21.0.0 and Apache Thrift 0.22.0 to check 18/18 requests across
five pinned files, including original SchemaElement fields and the complete
ordered predecessor mappings. These independently establish bounded native
schema facts against the frozen TypeScript selections; they do not establish
Rust target/receipt parity, broad format support, or default host behavior.
The final predecessor packet SHA-256 values are
`335537275bb992cbae9ecc0130a0df9510d6106431a25eeccd2de37b38bdc0bc`
for Avro and
`dd1c939de24d02abec0e1cf2a9ed75eb6cb3e029655036805578fc850b4689ee`
for Parquet. Their behavior stayed fixed across the generated-source repins:
Avro 10 classified/24 blocked/20 recovered, Parquet 6/12/12.

The active R8 tranche is the eight JSON Schema adapter exports:
`importJsonSchema`, `inspectJsonSchema`, `exportJsonSchema`,
`exportJsonSchemaResources`, `exportJsonSchemaBundle`, `getJsonSchemaNode`,
`walkJsonSchema`, and `editJsonSchemaNode`. The existing
[41-case opt-in packet](evidence/rust-migration/r8-json-schema-eight-operations/README.md)
and [24-case raw boundary audit](evidence/rust-migration/r8-json-schema-eight-operations/boundary-predecessor.json)
are the starting evidence. Sol's disposition keeps both V4 default roots on
TypeScript until raw getter/proxy and refusal order, wrong-type pointer
errors, prepared-versus-stateless work controls and a current installed
Node/Bun/Chromium cohort are reconciled per export. Work on that bounded
profile can proceed independently of Record Type; no route promotion follows
from the older 41-case receipt alone.

The first bounded profile difference has been resolved in opt-in Rust:
`additionalProperties: true` is now admitted recursively only when every
other schema keyword remains in the previously qualified grammar. Boolean
`false` and schema-valued forms remain incomplete. Sol reviewed the exact
change and independently reran the locked/offline focused Rust suite (18/18),
which includes Rust `jsonschema` 0.29.1 vectors. The R8 packet also records
matching current TypeScript inspection and Ajv 8.20.0 outcomes for a nested
valid/invalid pair. This closes one profile mismatch, not raw host parity,
default-route retirement or the installed release gate.

The [R6 catalog custody projection](evidence/rust-migration/r6-catalog-custody/README.md)
now has an explicit opt-in Rust/PyO3 profile. It matches 14 frozen Python
predecessor inputs for ordered native binding references and refusals; Sol
independently reran three Rust units and twelve Python custody tests against
the rebuilt extension. The direct bridge admits exact built-in dictionary
targets and bounded JSON-shaped values, preserves Python bool/integer/float
equality for related bindings, and compares wide objects in `O(n log n)`.
Filesystem custody, Python reflection, Weft compilation, publication and the
default catalog route remain Python-owned; this does not close the stage-two
catalog compiler row or qualify the six Python release cohorts.

The [R8 native JSON parser audit](evidence/rust-migration/r8-native-json-parser/README.md)
found the existing opt-in Rust `parseNativeJson` wire operation in Node and
WASM. Fresh Node, Bun and real Chromium replays matched the complete frozen
22-case tree packet, including its 11 parser cases; raw wrong-type JavaScript
host behavior still differs from tagged-string admission. The ledger now maps
that exact opt-in operation, raising accepted mappings from 51 to 52 without
retiring the TypeScript default export. The [versioned core schema authority
review](evidence/rust-migration/r8-symbol-inventory/versioned-core-schema-authority.md)
pins direct authorship for five current resources, with historical blob hashes
and installed-archive limits; older versions remain unresolved.

The legacy unified-client boundary check scans every `src/access/*.ts` file,
including newer Rust host adapters alongside the portable Python client
generator, and flags their exact imports. Sol removed the three
`Function.call.bind` hooks in the V4 host-read adapter using captured
`Reflect.apply` and intrinsic methods; the focused 10-case host-read suite
and typecheck pass. The boundary checker now keeps its full directory scan
and universal dynamic-import, forbidden host-hook, and Python-template checks.
Its previous global import allowance has been replaced with exact per-file
lists for the current portable generator and Rust facade/resource files; a
new file fails until reviewed and listed. Sol independently reran the checker
and five negative-control tests: an unapproved import in an existing facade,
an unapproved re-export, an unlisted new file, dynamic import plus a `process`
host hook, and an unapproved `import()` type all fail. The checker and focused
tests pass. The user explicitly approved the strict per-file policy after an
earlier scan-scope reduction was rejected by automatic approval review because
it could hide forbidden imports; this in-place repair preserves that coverage.
It does not establish that the
default Rust facade routes are behaviorally qualified or release-ready.

At the earlier settled source checkpoint, the metamodel, action/codegen
resource mirrors, WASM source map, symbol inventory, R8 ledger, typecheck,
Rust boundary gate and Python sdist closure checks pass. Fresh local
`umf-core` 0.11.0 and `umf-codegen` 0.2.0 wheels and sdists built with pinned
build tools on macOS arm64/Python 3.13.16. Twine passed all four; the core
artifact verifier rebuilt the core sdist wheel offline, and the pair verifier
rebuilt the codegen sdist wheel byte-identically, installed both direct wheels,
and passed import, generation and CLI smokes. The
[local pair receipts](evidence/rust-migration/r8-release-pair-readiness/README.md)
pin the artifacts and their source-bound limitations. They are not hosted
revision/run-bound receipts. Subsequent Rust and Python source edits have
superseded that source checkpoint; a fresh pair is required. The
six hosted cohorts, same-run aggregate, publisher and complete default-route
retirement remain open.

The next opt-in [stage-one source membership join](evidence/rust-migration/r6-catalog-source-join/README.md)
now runs in Rust after Python has established the stage-one path, manifest
entry, source-file digest and parsed JSON value. Its eight frozen predecessor
cases retain duplicate-ID refusal, tolerated non-object entries, source-text
equality and the empty-binding short circuit. Sol independently replayed 15
Python tests against the newly built CPython 3.11 abi3 wheel and four focused
Rust tests. This moves one pure post-filesystem check; `catalog.py` still owns
the default stage-two compiler, filesystem custody, Python reflection and
Weft interactions.

The [JSON/YAML value serialization audit](evidence/rust-migration/r8-json-value-serialization/README.md)
freezes 24 direct TypeScript cases for `readJsonValue` and `writeJsonValue`.
The existing Rust generic wire supports explicit JSON and YAML, but its
Node/WASM aliases default to JSON while the public TypeScript functions
default to YAML. YAML refusal codes, messages and public error classes also
differ. Sol independently verified the predecessor packet and three focused
Rust wire tests. Both exports remain unmapped; the next interface step is a
versioned YAML-default facade with packet-driven error and admission parity,
followed by installed Node/Bun/browser replay before any default selection.

The [PostgreSQL schema authority review](evidence/rust-migration/r8-symbol-inventory/postgresql-schema-authority.md)
now identifies three CONTRACT-015-authored representation/capture schemas
and the exact descriptor-driven writer for the native-AST schema. The focused
ledger test and `scripts/postgresql-schema.ts --check` passed independently;
the latter checked 272 messages, 71 enums, 1,665 fields and 4,560 field wire
vectors. The full R8 ledger suite passed 28/28 in the delegated tranche.
These four source-authority rows await the next coordinated ledger recapture;
installed archive bytes and default-route retirement are still unqualified.

The [TypeSpec schema authority review](evidence/rust-migration/r8-symbol-inventory/typespec-schema-authority.md)
similarly classifies five exact CONTRACT-013 result/projection schemas as
authored resources. The nearby TypeSpec bundle writers produce different
outputs and are not credited as generators for these five files. Sol checked
the contract's named schemas and independently reran the focused ledger test;
the delegated full suite passed 29/29. These source-authority rows also await
the coordinated ledger recapture and installed archive qualification.

The Core Evolution export audit found that `inspectCoreEvolution` and
`verifyCoreEvolution` already have bounded opt-in Rust core, tagged wire and
prior Node/Bun/Chromium evidence, but [R5's open resource-boundary
review](evidence/rust-migration/r5-core-evolution/README.md) required
metering repeated object-member scans. Rust now charges the containing
object's full member count before each scan, and Sol independently reran the
eight focused core tests, including a 4,096-member host-meter refusal.
Combined control-order work remains open. CONTRACT-083 now specifies only
core 0.10.0 input; the `core-0.8` profile token remains a compatibility
spelling. Its two remaining
schema exports are checker-resolved aliases to authored JSON resources, with
caller-visible mutable module identity; returning fresh Rust values would
change that interface. They need an explicit resource/route disposition rather
than two redundant Rust operations. All four remain default-route gaps until
that review and current installed-source qualification are complete.

The [three cross-format projection result schemas](evidence/rust-migration/r8-symbol-inventory/projection-schema-authority.md)
named by CONTRACT-004, CONTRACT-008 and CONTRACT-010 now have authored
source authority, exact consumer/test and SDK copy-rule closure. No exact
writer was found for these checked-in schema bytes. Sol independently reran
their focused ledger regression; the delegated full suite passed 30/30.
Installed archive bytes and the next coordinated ledger snapshot remain open.

The [DDD, Bit128 and PostgreSQL projection-schema authority review](evidence/rust-migration/r8-symbol-inventory/domain-projection-schema-authority.md)
pins three further contract-named authored resources with distinct consumer
relationships. Bit128 imports its schema at runtime; DDD and PostgreSQL
validate through package exports and tests. No exact schema writer was found.
Sol independently reran the focused ledger regression. The next coordinated
resource snapshot and installed archive-byte qualification remain open.

The [exact JSON-number binding packet](evidence/rust-migration/r8-json-number-predecessor/README.md)
now has a reviewed accepted opt-in mapping from `assertExactJsonNumber` to
`umf_core::json_number::assert_exact_json_number`. Frozen string-input outcomes
replay 18/18 in Node, Bun and real Chromium against freshly built addon/WASM
artifacts. The wrapper preserves error name, code and message but does not
provide `instanceof UmfError` identity; raw object coercion and TypeScript's
unbounded resource behavior remain outside this profile. Both package-root
defaults still use TypeScript, and the ledger records no retirement or proven
current default binding route for this operation. Sol's focused mapping test
passed; a coordinated inventory/ledger recapture and installed-package
qualification are next.

The [full and compact dataset-value operation schemas](evidence/rust-migration/r8-symbol-inventory/dataset-value-schema-authority.md)
now have contract-attested authored authority with independently verified
historical blob pins and current consumer/package source closure. The two
resource rows move from unresolved to authored-known in the next ledger
recapture; their SDK archive bytes remain unqualified. No operation is retired
by this resource classification.

The [catalog compiler boundary audit](evidence/rust-migration/r8-catalog-compiler-boundary/README.md)
separates the existing opt-in Rust source-custody/join stage from trusted Python
module capture, Pydantic reflection, Weft lowering, and filesystem
publication. There is no larger inert Rust input yet. The next meaningful
port requires a versioned captured-declaration JSON form and frozen outcomes
from actual declarations before pre-Weft logical lowering can be evaluated.
Sol reran the scoped source-join tests against an installed local core wheel
with the correct import path: 9 tests and 8 subtests passed. This does not
qualify the catalog compiler, a coordinated Python release pair, or default
route retirement.

The [Delta checkpoint and native JSON resource review](evidence/rust-migration/r8-symbol-inventory/delta-checkpoint-and-native-json-authority.md)
pins one exact generated schema writer and three composition inputs, and one
directly contract-attested authored JSON-tree schema. Sol verified the cited
historical blobs and the isolated writer-byte comparison; the focused tests
passed 4/4. That checkpoint established 34 generated-known, 36
authored-known, and 37 unresolved resource sources; later authority reviews
supersede those counts below. Installed SDK archive
bytes and executable retirement remain unqualified.

The [relationship-selection opt-in binding](evidence/rust-migration/r8-core-relationship-selection-binding/README.md)
now routes `model/selectCoreRelationships` through the Rust core, tagged wire,
and public Node/WASM `createCoreModelEngine` facades. Sol independently replayed
the 16-case predecessor through Node, Bun and real Chromium: zero mismatches
in each host. Error code/message/path parity is scoped; JavaScript error class
identity, arbitrary Registry callbacks and default package selection remain
unqualified. A reviewed accepted mapping records this operation without
retiring the TypeScript default.

The coordinated [R8 inventory and ledger recapture](evidence/rust-migration/r8-symbol-inventory/README.md)
is current at inventory SHA-256
`03b684d7e58c6df7997d70021f9a34c9fef196432b53d024ada96d78b79052a4`
and ledger SHA-256
`0b62c22af96cebdee3f96f26a50f2f90fcea7e08ce7572fa5c13065a8ff9eb69`.
It records 922 logical executable default-route gaps, 54 accepted opt-in Rust
operations, 868 unmapped executable names, and zero proven current-cohort
default binding routes. Resource authority is 39 generated-known, 36
authored-known, 88 candidate-generated and 35 unresolved files. The
metamodel fixed point, mirrors, inventory/ledger `--check`, 37/37 ledger tests,
typecheck, WASM source map, Rust-boundary gate, Python sdist/artifact custody
(16/16), and diff check pass. Current publishable SDK/Python installed cohorts,
default-route retirement review, and release gates remain open; a complete
Rust-port PR, merge and release cannot yet be claimed.

The [captured-declaration predecessor packet](evidence/rust-migration/r8-captured-declarations/README.md)
now freezes three trusted Python DSL captures and one refusal as versioned
tagged JSON, ending before Weft or catalog output. Sol caught and corrected
an encoder omission of nullable aliases; container identity is now tagged too.
The packet `--check` and 19 focused/capture tests pass. This supplies a small
predecessor boundary for a future Rust DTO but does not establish native
parity, generated-package capture, or default catalog routing.

The [PostgreSQL Key-catalog schema authority review](evidence/rust-migration/r8-symbol-inventory/postgresql-key-catalog-schema-authority.md)
pins one exact self-contained writer for three versioned schemas under the
bounded CONTRACT-015 / US-015-AC6 catalog profile. Sol verified the historical
blob hashes and the isolated three-output byte comparison. The focused test
passes; the coordinated ledger capture moved these three files from
candidate-generated to generated-known. No installed SDK archive bytes or
Rust runtime behavior are inferred from this source authority.

The [pre-Weft logical-render probe](evidence/rust-migration/r8-captured-logical-render/README.md)
shows that the first four captured variants all refuse before producing a
logical request: their authored Record namespace/name and field logical names
are absent. Sol independently reran the frozen refusal packet and focused
tests. Deriving names from physical module/element identities would add meaning
not present in the declaration. The [positive successor packet](evidence/rust-migration/r8-captured-logical-render-positive/README.md)
authors those names and freezes four live capture-to-logical-request outputs at
SHA-256 `08ea0f4a70292be9b363c3d0c554708d212af3442673bf41be96c086bcc811e4`.
Sol independently reran its packet check and focused test. This supplies a
bounded positive Rust input/output target before Weft; Rust parity, Weft
acceptance, backend SQL, and installed-wheel qualification remain open.

The [Delta profile schema authority review](evidence/rust-migration/r8-symbol-inventory/delta-profile-schema-authority.md)
pins exact writers and contract clauses for the recursive datatype and table
context schemas. Sol checked that each isolated writer reproduces all three of
its checked-in outputs byte-for-byte. The ledger recapture classifies these two
resources as generated-known, leaving 35 authority-unresolved files; their
installed SDK archive bytes remain unqualified. The refreshed ledger check and
37/37 focused tests pass. The access boundary checker now also applies its
exact per-file import policy to static re-exports, with a negative control;
Sol independently reran its four focused controls and full-directory check.

The [opt-in Rust logical-render slice](evidence/rust-migration/r8-captured-logical-render-rust/README.md)
now accepts only the versioned tagged `CapturedVariant` cohort and emits
pre-Weft logical request text through a public Python core bridge. It matches
all four authored-name outputs and four missing-identity refusals, with exact
shape, profile, unsupported-step, and resource admission. Sol independently
reviewed the Record-before-Key/step refusal order and reran the new native
packet together with existing catalog custody/source-join tests: 16 tests and
16 subtests passed using a fresh local extension. The default catalog builder
continues to use Python capture and rendering; Weft/backend compilation,
installed-wheel qualification, and default-route retirement remain open. The
Python access boundary now names the two opt-in catalog facades and permits
only their public `umf.rust_access_catalog` bridge. Its full 28-test boundary
suite and 95-module source scan pass; private `_rust` reach-through still
refuses.

The [security truth/composition binding](evidence/rust-migration/r8-security-truth-logic-binding/README.md)
adds an opt-in public Node/WASM factory for the four previously frozen
CONTRACT-062 operations. Strict tagged-wire admission rejects unknown,
missing, duplicate, and wrong-profile request members before Rust dispatch.
Sol reviewed the public path and focused receipts: Rust wire 8/8, Node 4/4,
Bun 4/4, and real Chromium 153 truth/refusal/composition replay (9 truth rows,
3 refusals, 22 composition cases). The browser harness bundles the public
wrapper but uses temporary no-modules glue; the receipt does not qualify an
installed archive, policy selection, backend authorization, arbitrary Proxy
behavior, or a default-route switch. The coordinated inventory is now SHA-256
`f517fd3e58950f1feffe2bfdf0d13bb3ab08cea607b17a1ad79bccfb42f95201`
and ledger SHA-256
`f7081e0f94ff93a3e2a54e8e85f37e46ebea6016963beab3d0977c4446960408`.
The ledger has 58 accepted opt-in mappings and 864 unmapped executable names;
all 922 logical default-route retirement gaps and zero proven current-cohort
default binding routes remain. Its 38 focused tests pass.

The installed SDK Bit128 replay passed 11 frozen functions through Node
26.12.1, Bun 1.4.3, and Chromium 153 in a private archive, including
`UmfError` identity and missing/corrupt native-module refusal. The archive
SHA-256 is
`6bae9840193c6fd3c110029a7550ff60785e2dcdefb66717f00ea2ca11c518ee`.
Its fixed-point source cohort differs from current HEAD in four pinned inputs
and from the worktree in another fifteen. This receipt qualifies that archive
only; it cannot retire `parseBits128` in the current default route or serve as
the release artifact. A fresh integrated-source build and exact route review
are required.

The [opt-in live capture bridge](evidence/rust-migration/r8-captured-declaration-rust-bridge/README.md)
now accepts an explicitly supplied Python declaration, uses the existing
Python `capture()` authority, encodes each captured variant in the frozen
tagged DTO, and invokes the Rust pre-Weft renderer. Capture, encoding, and
Rust-render refusals have separate stages; unrepresentable extension values
refuse without coercion. A fresh local ABI3 extension passed four focused Rust
tests and fourteen Python tests with eleven packet subcases. The bridge bounds
encoding traversal and UTF-8/DTO bytes. Default `compile_catalog()`, Weft,
backend output, installed release qualification, and retirement remain open.

The [JSON-compatible value serialization profile](evidence/rust-migration/r8-json-value-serialization/README.md)
now gives opt-in Node/WASM `readJsonValue` and `writeJsonValue` the TypeScript
YAML default while preserving generic Rust and wrapper `readValue`/`writeValue`
behavior. The refreshed 24-case predecessor packet is source-current after six
generated closure hash changes; its case inputs/outcomes are unchanged. Fresh
Node, Bun, WASM and real Chromium replays each match 22/24 with zero
unexpected mismatches. Duplicate YAML keys and multiple documents still have
different parser codes and source-location messages, which the current native
event representation cannot translate faithfully. Neither export is accepted
as a full Rust mapping or retired from TypeScript defaults. The coordinated
inventory SHA-256 is
`0ed368b556c3abbb4dd7534ed18ec68fef9738da0124fca2612293a371e0a56c`
and ledger SHA-256 is
`5f55f338943c1a9bfb082a668d4fa6342d97787dafd3e7a99a14e66e6bdf32df`;
all 922 logical default-route gaps remain.

The next integrated checkpoint repairs the two YAML diagnostics through
source-offset-preserving Rust parsing and keeps the Node/WASM public format
fallback aligned with TypeScript. The recaptured
[24-case serialization packet](evidence/rust-migration/r8-json-value-serialization/README.md)
is SHA-256
`3b720b959a934e9e0aad6f86a80d7dc9bc995a21a302f32448a73a39d599678e`;
fresh Node/Bun native, Node/Bun WASM, and Chromium WASM replays each match
24/24. The Bun native replay temporarily loaded the fresh dylib in place of
the stale ignored checkout addon; installed package qualification is still
required. Host error identity, proxy reflection order, and broader YAML
writer behavior remain open. The bounded Avro Record Type classifier also
matches the ordered mapping arrays of 30 frozen strict/report cases, including
blocked generic Field mappings; full result, recovery, host, and installed
parity remain open. The
[relationship resource review](evidence/rust-migration/r8-symbol-inventory/relationship-resource-authority.md)
establishes direct authorship for four files and leaves the composite
relationship-selection schema unresolved. Current inventory SHA-256 is
`1d7589b8bad71a50f1fdcebcc50bfa897af25d7dbd2cdfbdf452f6a5ae8aa3c2`;
ledger SHA-256 is
`12485a87eb3aba1a6ca8f52aa1b4c196445b89d4b325af18da9ab6320b99368f`.
Its resource classification is 39 generated-known, 41 authored-known, 88
candidate-generated, and 30 unresolved files. The 58 accepted opt-in
mappings, 864 unmapped names, 922 default-route retirement gaps, and zero
proven current-cohort default binding routes are unchanged. Do not promote
these slices to a default route or release until their host and installed
qualification and the remaining R8 closure are complete.

The next R8 source-bound checkpoint extends the opt-in JSON-value YAML writer
over a selected scalar corpus and makes Node/WASM host admission match live
TypeScript refusal code/message/path and proxy reflection order in the
ordinary 100,000-value profile. The [serialization packet](evidence/rust-migration/r8-json-value-serialization/README.md)
is now SHA-256
`76314beae043f3cb9136509bcacdb0d4d3b1920468d7b5d021ad1f1e07f0c60f`;
fresh Node/Bun native and Node/Bun/Chromium WASM replays each match 24/24.
The Rust serialization suite passed 21/21, and the binding plus relocated
live-oracle tests passed 13/13. The strict boundary gate passed across 702
modules with zero V8 debt and zero findings. The bounded Avro Record Type
classifier now matches full results for three selected strict cases, two
recoveries, and the preserved 30-case exact ordered-mapping matrix. Full
Avro result and host parity remain open.

The [resource authority reviews](evidence/rust-migration/r8-symbol-inventory/README.md)
pin one additional authored CSV Boolean schema and four more exact generated
writers, including isolated full-output and negative-control checks. The
coordinated inventory SHA-256 is
`426057d73541807b4226181f56b49aeae4c845412faf0c9c48eef819a26f9447`;
ledger SHA-256 is
`ab924386439ee3de1abf76f8f91bea66cae8df9882002f7bb40370210800b289`.
Its 41 tests pass. Resource authority is now 43 generated-known, 42
authored-known, 88 candidate-generated and 25 unresolved. The 58 accepted
opt-in operations, 864 unmapped executable names, 922 logical retirement
gaps and zero ledger-proven current-cohort binding routes are unchanged.

The [CSV Boolean installed-route receipt](evidence/rust-migration/r8-csv-boolean-default-route/README.md)
adds a fixed-point private SDK archive, SHA-256
`3d2c6b3b154ff3ffc45d63919eee4572b491f242bea3976289c34f9cb63ceffc`,
with the same 3,426-file source closure before and after packaging. All 14
frozen lexical validate/verify cases pass from the installed default roots in
Node 26.12.1, Bun 1.4.3 and Chromium 153; missing/corrupt native addon
controls refuse. A selected live-reference prototype and error-identity
comparison also passes in Node. This evidence supports an explicit review of
those two default-route retirement rows; it does not itself retire them or
qualify the entire SDK release. The remaining R8 order is to review those
rows, extend installed qualification to the next bounded inspectors and Key
tuple operations, resolve the other executable/resource dispositions, then
run a publishable integrated cohort before PR, merge and release.

The [independent CSV retirement review](evidence/rust-migration/r8-csv-boolean-default-route/retirement-review.md)
found that an installed request accessor returns `AdmissionError` at
`/csvRequest` from the Rust default but `UmfError/NON_JSON` at `/profile`
from the TypeScript reference. Both lexical declaration rows remain open.
The CSV facade now has a bounded, descriptor-only correction for one
unambiguous accessor or hidden property, and source-level Node/Bun tests
pass for selected source/request paths and receipt-first verification. The
private archive predates this change; current-source installed Node/Bun and
real-browser parity, competing-invalid-input order, and proxy behavior are
still required before reconsidering retirement.

The [installed core-inspector receipt](evidence/rust-migration/r8-core-inspectors-installed/README.md)
reuses the same fixed-point private 0.5.6 archive and passes 26 frozen
predecessor cases across three source-selected inspectors in Node 26.12.1,
Bun 1.4.3, and Chromium 153. Selected Node/Bun result and error shapes match
the explicit TypeScript reference; missing/corrupt native-addon package
copies refuse at import. This is prior-archive route evidence, not
current-cohort retirement or release qualification. Sol independently
replayed the harness. The [Core Key tuple response-limit review](evidence/rust-migration/r8-core-key-tuple-limit/README.md)
also shows that the opt-in direct Node/WASM byte read already handles
100,001 and 4,000,000 bytes without the tagged-array ceiling. Its default
package roots and installed SDK are still unqualified.

The [older operation-schema review](evidence/rust-migration/r8-symbol-inventory/core-operation-schema-authority.md)
and [follow-up](evidence/rust-migration/r8-symbol-inventory/older-core-operation-schema-authority.md)
reproduced historical version writers but found no writer for the current
bytes, so eight older operation resources remain unresolved. The
[selection-schema review](evidence/rust-migration/r8-symbol-inventory/core-selection-schema-authority.md)
established direct CONTRACT-078 authorship only for the unchanged
`semantic-types-selection.schema.json`; the three composite selections
remain unresolved. The [projection and Parquet review](evidence/rust-migration/r8-symbol-inventory/projection-parquet-sqlserver-resource-authority.md)
also pins three directly authored DDD/SQL Server schemas and the Parquet IDL
writer with historical output equivalence; its fresh `thriftpy2==0.5.3`
compiler reproduction remains unavailable and is qualified in the ledger.
The 198 exported resource aliases across 189 files now classify as 44
generated-known, 46 authored-known, 88 candidate-generated and 20 unresolved.
The ledger's 43 tests pass. Its 922
logical retirement gaps and zero proven current-cohort binding routes remain
unchanged.

The metamodel and both Python resource mirrors have been refreshed against
the settled source cohort; the strict boundary check passes across 702
modules with zero V8 debt and zero findings. The [Python package audit](evidence/rust-migration/r8-python-v8-closure-audit/README.md)
finds no source-level Node, Bun or V8 dependency under the three Python
packages, while Python still owns public models and substantial host/API
behavior. The full installed wheel and sdist matrix remains open. The coordinated
inventory SHA-256 is
`2939e6f766ce346cef109bdfa672a8e31c36c42704f62ce64328880bc80de9ca`;
the matching ledger SHA-256 is
`6446eef26ea664be200319215f3e13f3128a28f888b63dbdc3a3853b58bc8085`.
The expanded [Avro matrix follow-up](evidence/rust-migration/r8-avro-record-type/full-matrix-parity.md)
passes complete results for all 30 frozen strict/report cases and exact
recovery for ten classified cases in Rust and through a fresh addon under
Bun's Node-API host. Node's own full matrix, Chromium/WASM, other controls,
and the installed default route remain open.

The [private Python installed follow-up](evidence/rust-migration/r8-python-v8-closure-audit/installed-replay-20261025.md)
resolved the local Hatchling backend gap and built all three sdist/wheel
artifacts offline from one captured source cohort. The core extracted-sdist
verifier and non-publishing core/codegen pair verifier passed on macOS arm64
CPython 3.11.17; an isolated three-wheel probe generated seven client files
with Node, Bun, Cargo and rustc absent from PATH, and wheel member lists had
no JS/WASM assets. This is one private host subset, not the required six-cohort
release matrix or full Python API closure. A deeper metamodel clean-source
test exposed a separate compiler bootstrap regression: `umf-cli
--no-default-features` now compiles unrelated core modules whose `include_str!`
inputs include generated spec outputs omitted from the clean authored-source
fixture. `check:metamodel` passes in the full checkout, but the clean-source
generation test fails; isolated bootstrap feature work is required before
R8 can close.

### R8 integrated-source continuation — 2026-10-25

The [metamodel bootstrap repair](evidence/rust-migration/r8-metamodel-source-bootstrap/README.md)
uses a dedicated compiler-only Rust CLI and one shared tagged-wire codec.
The strengthened clean authored-source test passes after source-manifest
regeneration, as do the full metamodel/self-model suite (71 tests, 518
assertions), the normal CLI compile, feature-union/all-features checks,
metamodel `--check`, and both Python resource-mirror checks. The strict Rust
boundary gate passes across 702 source modules with zero V8 debt or findings.
This closes the local clean-source bootstrap regression; release platform
qualification remains separate.

The [Avro Record Type full-matrix follow-up](evidence/rust-migration/r8-avro-record-type/full-matrix-parity.md)
now has 30 complete receipt comparisons and ten exact recoveries in Rust,
Bun's Node-API host, Node 26.12.1, and Chromium 153/WASM. These are fresh
source-bound host replays, not an installed default-route retirement. The
[current CSV Boolean installed replay](evidence/rust-migration/r8-csv-boolean-default-route/README.md)
passes 14 frozen cases in Node/Bun/Chromium from a private archive, but its
18-case adversarial comparison found symbol-key, competing-member and proxy
trap differences in all three hosts. A shared wire admission correction has
source-level Node/Bun/browser evidence; a new integrated-source installed
archive and independent retirement review are still required. Both CSV
Boolean retirement rows remain open.

The [R8 resource ledger](evidence/rust-migration/r8-symbol-inventory/README.md)
now pins 49 authored-known, 44 generated-known, 88 candidate-generated and
17 unresolved exported resource aliases across 189 unique files. Three new
direct-authorship findings concern the semantic-types operation, Kind 8 and
Nullability 7 schemas. The refreshed inventory SHA-256 is
`47d46f3a3fe2dd5c621d3c05a11590db2567b98f7e172f120d92554489d84cec`
and ledger SHA-256 is
`75ff82583c884d4351883e5644e83b320e693f8359e62ad0f1bfebc167495e77`;
43/43 ledger tests pass. No additional executable route is retired: 58
accepted opt-in mappings, 864 unmapped executable names, 922 logical
default-route retirement gaps and zero proven current-cohort default binding
routes remain. Next, finish the CSV installed counterexample replay and
route review, then qualify other selected default families and the six-host
Python release matrix before a complete-port PR, merge and release.

### R8 private installed-route and Python closure checkpoint — 2026-10-25

The final 3,431-file fixed-point private SDK archive (SHA-256
`bdd14aa62e09df465d784bb7889c4d7ddfc79c61f8186acf6eb2423ce35e8b3b`)
passes the [CSV Boolean installed replay](evidence/rust-migration/r8-csv-boolean-default-route/retirement-review.md):
14 frozen cases and 18 adversarial host-object cases agree with the explicit
TypeScript reference in Node 26.12.1, Bun 1.4.3, and Chromium 153. Sol
independently reproduced the 18-case receipt byte for byte. The
[three Core inspectors](evidence/rust-migration/r8-core-inspectors-installed/current-source-replay-20261025.md)
pass 26 frozen installed cases on the same archive and hosts, but selected
accessor, hidden-member, and symbol-key error envelopes differ in Node/Bun.
The ledger now records five bounded current private installed binding routes,
with all 922 logical default-route retirement gaps still open. The explicit
`./reference` route remains TypeScript; neither the private archive nor this
bounded comparison qualifies the complete SDK.

The [current-source Python closure](evidence/rust-migration/r8-python-v8-closure-audit/current-source-installed-20261025.md)
built all three sdists and wheels offline from one 2,146-file capture, rebuilt
each extracted sdist, and passed isolated core/codegen generation and all four
CLI help checks on macOS arm64 CPython 3.11 with Node, Bun, Cargo and rustc
absent from `PATH`. Its complete capture included all eight access `build`
package files; the earlier missing-module failure was a private capture-tool
error, with no packaging change needed. The six hosted Python cohorts,
full Python API closure, and coordinated publication remain open.

The [remaining resource-authority review](evidence/rust-migration/r8-symbol-inventory/remaining-schema-authority-review.md)
keeps five current schema files unresolved. The refreshed inventory SHA-256
is `47d46f3a3fe2dd5c621d3c05a11590db2567b98f7e172f120d92554489d84cec`;
the ledger SHA-256 is
`035ce31bd7f69a2834f6434322a1a8115207b11289aeb6ca20b09ddd4f91671e`.
The next production slice is to correct inspector host-error admission, then
rebuild and replay a fresh archive. Separately, wrapper suites must load a
source-current addon instead of the ignored stale checkout binary. After
those route corrections, continue resolving the 864 unmapped executable
names and remaining resource authority, then run the complete hosted
CLI/SDK/Python release gates before PR, merge and publication.

The complete Node wrapper suite subsequently passed against the source-current
addon extracted from that fixed-point SDK archive: 132 tests, zero failures,
892 assertions across 21 files on Node 26.12.1. The test shell restored the
checkout's ignored addon afterward, verified at SHA-256
`3a87eaccfae4f3dec3d2baae45befbe4138f2d8feb5b5659a047b54d757e784b`.
The two earlier broad-suite failures belonged to that stale binary, as a
private baseline replay and fresh-addon focused checks corroborated. This
removes a local wrapper-test ambiguity; it does not close the installed
default-route or release-platform gates.

### R8 staged Core Key verifier and current-source archive — 2026-10-26

The fifth Core Key operation, `verifyCoreKeyOperation`, now has a staged Rust
host route in Node and WASM. Its prepared receipt stage is consumed by finish
or explicitly discarded when host admission of the current document fails.
The public adapter preserves the reference's first-error order, copied-carrier
behavior and exact native null-receipt TypeError; only errors identified as
native binding errors are translated. The complete Node wrapper suite passed
against a source-current addon (138 tests, zero failures, 914 assertions across
21 files). The full locked/offline Rust workspace suite subsequently finished
with zero failures on this pre-Schema-Properties source snapshot; later Rust
changes require their own focused and integrated reruns.

A private fixed-point SDK archive (SHA-256
`41430112228490b6daea64a98349b9cf1a56551ca2d196cbb01be5b7bdf8ea28`)
pins 3,431 source inputs to closure
`59300c59ae4ff69b4cbbd75b86e3fb221303b8b0af2b53e5c60c00b6e335333d`,
with zero private generated transforms and 1,788 archive members. The
[installed Core Key verifier replay](evidence/rust-migration/r8-core-keys-default-boundary/final-key-null-verification-installed-20261026.json)
passed frozen and same-host `./reference` comparisons in Node 26.12.1,
Bun 1.4.3 and Chromium 153/WASM, including receipt-before-current admission,
copy isolation, exact malformed-refusal behavior, and cleanup observable on a
subsequent call. This is bounded private-route evidence, not retirement of the
TypeScript `./reference` path or release qualification. The previous archive's
Core Cardinality, Core Facets, CSV Boolean, Core Inspectors and Compact Dataset
receipts are historical relative to this closure; rerun each against a common
current archive before promoting an aggregate installed-route claim.
The [Compact Dataset validate-only replay](evidence/rust-migration/r8-compact-dataset-installed/receipt-current-59300c59.json)
subsequently passed the same archive in Node, Bun and Chromium: all 17 frozen
outcomes, copy and proxy identity, structural/work limits, and the 349/350
boundary agree with the explicit reference. The separate compact verification
operation remains unqualified, and this receipt becomes historical when later
production source changes its captured closure.

The [aggregate evidence gate](evidence/rust-migration/r8-installed-route-evidence/README.md)
now requires matching archive/closure claims and explicit current-source
status on Node, Bun and Chromium receipts for its five bounded families. It
rehashes live source inputs; its archive member map is a pinned attestation,
not an independent archive read. The deterministic gap ledger was regenerated
for current source provenance without changing its denominator: 58 accepted
opt-in mappings, 864 unmapped executable names and 922 logical retirement gaps.
The [Schema Properties interface decision](evidence/rust-migration/r8-next-route-queue/schema-properties-interface-decision-20261025.md)
sets the next four-operation production boundary: one synchronous Rust-owned
host-reflection dispatcher in Node and WASM, five trusted root resources,
one Context per operation, and the frozen operand admission order. Its eight
crossed-input probes are a TypeScript predecessor baseline only. After that
route, continue the remaining default-route inventory and the hosted Python
six-cohort matrix before a complete-port PR, merge or release.

The [Python runtime and semantic-ownership audit](evidence/rust-migration/r8-python-runtime-dependency-audit/README.md)
found no executable JS/V8/Node/Bun path in the three production Python
package roots; their sole production subprocess launches the bundled Rust
`umf` CLI. This is narrower than complete Rust ownership: `umf_access` still
contains Python-owned query DSL/rendering, catalog, read/search admission,
migration lifecycle and driver orchestration. Each rule needs an explicit
shared-semantic versus host-I/O disposition and parity evidence. The local
CPython 3.11 packaging follow-up passed 24/24 receipt-verifier tests and
Twine checks through a compatible overlay, but its artifacts were disqualified
by concurrent source changes; the six hosted cohorts remain open.

The [post-Schema route decision](evidence/rust-migration/r8-next-route-queue/post-schema-properties-next-route-decision-20261026.md)
places `selectCoreElements` next because its Rust owner and Node/WASM opt-in
route already exist. Caller `Registry` callbacks and raw host-admission order
remain production interface blockers. A separate
[Record Type authority follow-up](evidence/rust-migration/r8-symbol-inventory/record-type-operation-v6-authority-followup-20261026.md)
reproduced the v6 schema's historical bytes but found no governing contract or
retained current writer for three later edits; its resource authority remains
unresolved. The Compact Dataset verifier now uses a cumulative, fail-fast
`ValueWork` ledger across receipt admission, source validation, recomputation
and comparison. Focused 267/268 and 349/350 boundary cases and the full
Compact wire replay pass; the broader workspace run is still in progress.
This is a separate Rust slice without default selection yet.

The Schema Properties source route now implements inspect, declare, field
validation and default resolution through the synchronous Rust host-reflection
dispatcher on Node and WASM. The focused Rust field/default vectors (4), JSON
Schema integration vectors (17), boundary checker (5) and TypeScript typecheck
pass; the Node addon and WASM release builds pass. A fresh-addon Node replay
passes four host tests covering all four operations, exact accessor refusals,
eight crossed input cases and eleven callback identity stages (27 assertions).
An additional fresh-addon regression matched the reference for hidden,
symbol-keyed, cyclic and over-depth source inputs and verified returned-copy
isolation (7 assertions).
The checkout's ignored addon was restored after the replay. Real Chromium
against the fresh WASM package also matches the four operations, eight crossed
cases and eleven callback identity stages without Node globals. The
[Schema Properties installed packet](evidence/rust-migration/r8-schema-properties-installed/README.md)
now pins a fixed-point private SDK archive, source closure and 1,788 verified
members. Its Node 26.12.1, Bun 1.4.3 and Chromium 153.0.8010.12 replays pass
72 fixed-output outcomes, 11 host-native thrown outcomes, eight crossed
admission cases, eleven callback-identity stages and copy isolation for the
four source-selected operations. The first installed replay had 11 genuine
malformed string-carrier `TypeError` mismatches; the Rust host JSON bridge now
asks each JavaScript host to perform the count on an admitted copy, and the
current receipt verifies parity. This is bounded private installed-route
qualification, not declaration retirement or release readiness.

The [Selection reference host baseline](evidence/rust-migration/r8-selection-reference-host-baseline/README.md)
now records twelve frozen TypeScript outcomes on Node 26.12.1, Bun 1.4.3 and
Chromium 153, plus raw source/query and Registry observations. Registry lookup
occurs lazily inside source validation, interleaved with semantic callbacks;
an eager registration snapshot would change observable error and callback
order. Sol accepts a lazy per-call provider as the next interface-design
direction, conditional on an exact Rust `Registry`/`Capabilities` signature
review and Node/WASM callback identity evidence. Selection remains unselected.

The [Python semantic-ownership decision](evidence/rust-migration/r8-python-access-semantic-ownership-decision.md)
classifies remaining DSL, catalog, search, runtime codec, unified operation and
table lifecycle rules separately from trusted Python declaration invocation,
filesystem, driver, session and database I/O. The
[renderer v0.2 interface decision](evidence/rust-migration/r8-python-renderer-v02-interface-decision.md)
keeps a broader Rust logical-render profile opt-in; its focused Rust tests pass
8/8, but joins, related navigation, malformed-order and Python bridge limits
remain unqualified. A post-invocation captured-graph validator now has a
private Python seam and covers declared parameter-name membership, exact
Key-parameter component/identity tuple consistency, and root/join owner
membership for well-shaped `all` terminals. Its
direct frozen packet contains 27 CPython cases, including accepted tagged DTOs
and synthetic graph mutations; focused Rust and Python seam tests pass. Key
`get`/`page` selected-Key identity, SearchLeg and the remaining graph rules
still belong to the Python default until ordered parity is proven. The opt-in
Rust validator refuses `get`/`page` as outside its current profile.

The [Selection provider implementation preparation](evidence/rust-migration/r8-next-route-queue/selection-provider-implementation-prep-20261026.md)
now identifies both lazy `Registry.get` demand sites and the distinct
`registry.kindRuntime.validateDocument` branch. Ordinary TypeScript Selection
does not run Rust's kind-occurrence check. The host route must preserve that
branch distinction, caller-owned registration accessors and callbacks, and
thrown-value identity before default selection. The
[captured-graph validator packet](evidence/rust-migration/r8-captured-graph-validator-interface/README.md)
pins nine direct Python outcomes plus accepted tagged DTO and optional-variant
examples. A `FieldRef` subclass is accepted and retains its concrete type and
extra content under Python capture. The current opt-in Rust DTO adapter now
uses trusted MRO-derived base tags and base fields for the exercised graph
families; see the subtype addendum below. The Rust validator and Python
capture remain opt-in, and public capture is still Python-selected.

The [resource-authority closure review](evidence/rust-migration/r8-symbol-inventory/resource-authority-closure-decision-20261026.md)
keeps 17 aliases (51 route rows, 11 files) unresolved: six versioned Core
operation schemas have reproducible historical writer outputs, but no proven
authority for later current-byte edits. The
[post-Schema pure-operation queue](evidence/rust-migration/r8-next-route-queue/unmapped-pure-operation-wave-20261026.md)
placed the four already selected Schema Properties operations through a
fixed-point installed replay, which has now passed. Recertification of three
Core Inspector and two CSV Boolean routes on that same archive passed in Node,
Bun and Chromium. The [Inspector receipt](evidence/rust-migration/r8-core-inspectors-installed/current-source-replay-7144ad5a-20261026.json)
matches all 26 frozen cases, observes browser WASM, and passes native-addon
failure controls. The [CSV Boolean receipt](evidence/rust-migration/r8-csv-boolean-default-route/installed-replay-7144ad5a-20261026.json)
matches all 14 predecessor cases per host, observes browser WASM, and passes
four native-addon failure controls. Both use the same fixed-point archive and
source closure as Schema Properties. The remaining aggregate families are
also replayed on that archive: [Relationships](evidence/rust-migration/r8-core-relationships-default-boundary/core-relationships-installed-node-20261026.json)
matched eleven frozen cases with exact outcome/admission order in Node, Bun
and Chromium; [Bit128/UUID](evidence/rust-migration/r8-bit128-installed/r8-bit128-aggregate-20261026.json)
matched its eleven-operation packet and forged-error controls; [Core Keys](evidence/rust-migration/r8-core-keys-default-boundary/current-archive-installed-7144ad5a-20261026.json)
matched four selected operations and the installed `./reference` route in all
three hosts. Core Keys verification remains TypeScript and its current minimal
replay excludes the older 700,000-unit retained-value and general resource
controls. These five family replays are bounded raw evidence; the separate
aggregate gate still needs hash-bound normalized host receipts before its
24-operation route count may be claimed.

The subsequent opt-in Python graph-validator owner/Key changes altered a
Rust source input in that archive closure. All five same-archive installed
receipts above therefore document the preceding source cut; they are not
current-source aggregate qualification for the present worktree. A new
fixed-point archive and complete rerun are required after this source cut
settles. The aggregate gate also found that the Bit128 Node/Bun raw receipts
did not pin the loaded native addon, so a process-bound wrapper must record
that hash without weakening the five-family evidence rule.
These are bounded qualification steps, not a complete-port or retirement
claim. The current ledger still records 922 logical retirement gaps and 864
unmapped executable names before any Schema mapping update. The captured-graph
validator remains a private opt-in Python seam for declared-name membership,
Key parameter consistency and bounded `all`-terminal ownership; the public
Python capture path and broader graph semantics are unchanged.

### R8 current fixed-point installed-route gate — 2026-10-26

The [new R8 installed-route evidence](evidence/rust-migration/r8-installed-route-evidence/README.md)
rebuilds the SDK from the later graph-validator source cut with zero generated
transforms. The packaged archive SHA-256 is
`b2f816d7f7bd3b57df1ecea536ceece4396a3625b2a641eb0991d135037de892`,
and its 3,435-input live source closure is
`0e6de413298318b0e8bcb03cac522872452b8c1e548f18a26f226d28967ce5c0`.
An independent archive preflight checked all 1,788 members and the current
source tree. Fresh Node 26.12.1, Bun 1.4.3 and Chromium 153 replays pass for
CSV Boolean, Core Inspectors, Core Relationships, Bit128/UUID and four Core
Keys operations. The Bit128 Node/Bun wrapper also observed the exact
archive-adjacent native addon in each process. The separate Schema Properties
replay passes its four selected routes, including the 11 host-specific
`TypeError` envelopes, on this archive; it is outside the five-family aggregate.

The aggregate gate reopens hash-pinned host receipts, cross-checks archive
members and current source, and accepts **24 bounded installed routes**. Its
own scope is evidence-only: the archive byte reopening belongs to the
separate preflight. The regenerated ledger retains **922 logical retirement
gaps, 864 executable names without an accepted Rust mapping, and 17 unresolved
resource aliases**. The 24 routes establish neither full semantic parity nor
declaration retirement. Core Key verification, facets, cardinality and compact
dataset operations remain outside this aggregate; the `./reference` route and
Python public capture also remain separate.

The local coordinated-Python release-verifier tests pass 75/75 on each of
CPython 3.11.17, 3.12.15 and 3.13.16 on Darwin 27 arm64. This checks the
release verifier, including synthetic six-receipt inputs; no actual wheel or
sdist cohort has been built or accepted for this source cut. Hosted macOS 15
and Linux x86_64 artifacts, transitive runtime closure, full regression,
complete default-route ownership, PR, merge and release remain required.

The four Schema Properties declarations now have exact accepted Rust owner
mappings for the two V4 roots and a [separate current-source route gate](evidence/rust-migration/r8-schema-properties-installed/route-gate-current-b2f816d7.json).
The authority ledger therefore reports **62 accepted opt-in Rust mappings and
860 unmapped executable names**, while retaining the five-family aggregate's
24 proven routes and all 922 retirement gaps. The separate Schema gate passes
four bounded operations and records `completeParity: false` and
`releaseQualified: false`; its result is deliberately not folded into the
five-family aggregate. Fresh [Facets](evidence/rust-migration/r8-core-facets-installed/README.md)
and [Cardinality](evidence/rust-migration/r8-core-cardinality-installed/README.md)
raw installed replays also pass on the same archive across Node, Bun and
Chromium. Their separate [Facets](evidence/rust-migration/r8-core-facets-installed/route-gate-current-b2f816d7.json)
and [Cardinality](evidence/rust-migration/r8-core-cardinality-installed/route-gate-current-b2f816d7.json)
hash-pinned route gates now pass and recompute the live source closure. The
Cardinality receipt records Chromium WASM and external-request controls; the
Facets receipt lacks those two controls. Both gates depend on the separately
verified archive preflight, remain outside the five-family aggregate, and
retain `completeParity: false` and `releaseQualified: false`. Resource-authority
closure is still required before ledger upgrade; the 17 unresolved aliases
remain unresolved.

### R8 captured-graph and compact Dataset continuation — 2026-10-26

The three-family follow-up review confirms that no current resource-authority
claim can be promoted for the 17 aliases across 11 files from the available
writer and contract evidence. Historical output hashes and current file hashes
do not identify who authorized the later edits. The authority ledger stays
unchanged.

The [compact Dataset installed replay](evidence/rust-migration/r8-compact-dataset-installed/README.md)
has no passing receipt for the `b2f816d7` archive. A sandboxed loopback attempt
failed; an escalated attempt produced no stage output and was interrupted, so
the stall stage and host outcomes remain unknown. The harness now has bounded
stage diagnostics, but requires a new fixed-point archive and fresh Node, Bun,
and Chromium replay before any route qualification. Compact verification
remains outside that selected-route probe.

For the 17 unresolved resource aliases, the next authority design should
extend the closed `umf.metamodel.shape` vocabulary with explicit versioned
operation-resource roots and output bindings, then compile the current Facets
and Cardinality schemas from declared semantics. This fits CONTRACT-080's
generated-resource direction better than declaring unexplained exceptions.
`minProperties` and resource-level `$schema`/`$id`/`title`/`$defs` output need
an explicit compiler design; exact preservation of today's resource bytes
requires an ordering rule and byte-for-byte tests. Until that design and its
contract revision pass review, the aliases remain `authority-unresolved`.

The next opt-in Python access slice adds Rust post-invocation `get`/`page`
selected-Key graph checks in `access_graph_validate.rs`, with the public Python
capture route unchanged. It must preserve Python's group/scalar check, join
owner, selected-Key, then expression-visit refusal order. The source edit makes
the previous `0e6de413` fixed-point receipts historical; all current-source
installed gates must be rebuilt and rerun after this slice is tested. No
retirement count, release-platform qualification, or release status changes
here.

That [selected-Key slice](evidence/rust-migration/r8-python-captured-graph-selected-key/README.md)
now passes 20/20 focused Rust tests. A freshly built native Python extension
passes 8/8 opt-in comparisons with public capture on CPython 3.13.16, Darwin
27 arm64, including exact `get`/`page` refusal precedence. This paragraph
records that earlier selected-Key checkpoint; later private graph slices below
add related navigation, search legs, read terminals and `update`. The bridge
translates the known foreign-field TypeError. A later private orchestration
slice moves pair determinism, optional-variant scheduling, topology consistency
and query/command terminal authority into Rust while Python still inspects
signatures, invokes declarations, validates each graph, serializes canonical
bytes and binds command actions. Sol independently reran 35/35 focused Rust
checks and 11/11 live Python parity checks; the existing capture and predecessor
suites passed 30 tests plus three subtests, and full Ruff checks passed on the
changed Python files. General subclass admission, full Python capture
ownership, installed-wheel parity and the public capture switch remain open.

At the 2026-10-26 prior-archive checkpoint, the fixed-point SDK archive was
`c1ecf9cea81c3767e281820a93294b85a45ab052862a9fcd8b0b493057302263`,
with [separate current-source preflight](evidence/rust-migration/r8-installed-route-evidence/current-61cbaf0a/preflight.json)
for source closure
`61cbaf0ae7a0359e9ae49d2aa4c436727f2122e4174d84999efb20f42d2c3b01`:
3,435 live inputs, zero generated transforms, and 1,788 verified archive
payload members. It remains a private, nonpublishable qualification build.
The [compact Dataset receipt](evidence/rust-migration/r8-compact-dataset-installed/current-archive-61cbaf0a.json)
passes its 17 frozen validation cases and bounded host controls in Node
26.12.1, Bun 1.4.3, and real Chromium 153.0.8010.12 on this archive. It does
not exercise `verifyCoreDatasetValuesCompact`, retire a declaration, or
qualify a public release. The other installed route families were then
replayed and gated on this exact archive, as recorded below.

The five-family [prior-cohort aggregate](evidence/rust-migration/r8-installed-route-evidence/current-61cbaf0a/aggregate.json)
passed its fail-closed gate for 24 bounded installed operations. Raw
Node/Bun/Chromium receipts are bound to the exact archive and source closure;
the Bit128 Node/Bun wrapper also observed the loaded archive-adjacent native
addon in each process. The gate separately reopens every hash-pinned raw
receipt and recomputes all 3,435 live source inputs. Its archive byte claim
depends on the separately passing preflight; the aggregate does not reopen
the archive itself. Core Keys current replay omits the historical 700,000-unit
retained-value control. Schema Properties, Facets and Cardinality replays
remain separate bounded gates, and the 922 logical retirement gaps remain
open. The previous `0e6de413` aggregate and ledger are historical; the ledger
was regenerated after the current gate-script changes settled. The ledger at
this checkpoint recorded 922 logical retirement gaps, 860 executable names without an
accepted Rust mapping, 62 accepted opt-in mappings, 24 aggregate-proven
bounded routes, and 17 unresolved resource aliases. No declaration was
retired by the replay.

At that checkpoint, separate [Schema Properties](evidence/rust-migration/r8-installed-route-evidence/schema-properties-route-gate-current-61cbaf0a.json),
[Core Facets](evidence/rust-migration/r8-installed-route-evidence/core-facets-route-gate-current-61cbaf0a.json),
and [Core Cardinality](evidence/rust-migration/r8-installed-route-evidence/core-cardinality-route-gate-current-61cbaf0a.json)
gates now pass on the same fixed-point archive and independently recompute its
current source closure. Their focused gate suites pass 15/15. Each retains
`completeParity: false` and `releaseQualified: false`; Facets also retains
unresolved resource authority and no Chromium WASM/external-request claim.
Cardinality records Chromium WASM loading and zero external requests. These
separate gates do not expand the five-family aggregate or retire declarations.

The [Selection provider interface direction](evidence/rust-migration/r8-next-route-queue/selection-provider-implementation-prep-20261026.md)
now favors Rust-owned staged decisions over a JavaScript composite evaluator.
The explicit TypeScript reference baseline pins seven lazy Registry lookups in
an exact 47-event interleaving across Node, Bun and Chromium. The production
host provider and a complete Node/WASM opaque-handle Selection path are not yet
implemented; receiver, callback, error-identity and `kindRuntime` behavior
remain release gates. Later paragraphs record the narrower primitive protocol
foundation and its current limits.

Checkpoint `bf8bf6031` preserves the `c1ecf9ce` installed-route cohort.
Whitespace normalization of a Rust source input after the replay, followed by
the ongoing captured-graph/Selection provider source edits, moved the live
tree away from source closure `61cbaf0a`. Those aggregate and separate gates
were historical evidence for that tested cut, not qualification for the moving
tree. A fresh fixed-point archive and host replay was required after source
changes settled; the new cohort below records that replay.

### R8 five-family current-source archive replay — 2026-10-26

The [current cohort record](evidence/rust-migration/r8-installed-route-evidence/current-a2552db0/README.md)
documents a fixed-point archive built from commit
`a2552db04c3553ce852f017eaee029f4574b323a` with Rust 1.90.0 and
`wasm-bindgen` 0.2.100. Its archive SHA-256 is
`6adacc2f019d6cf73c856c9002ba75fb1d33ca22cb56182e63806296983661e`; its exact
source closure is
`6a6bef1345e9f90e0d26dd8841ed27ba2ca6f3db8e6dfd330fb78dd9f42cb14c` across
3,439 inputs with zero generated transforms. Independent preflight verified
1,788 of 1,788 package payload members. Fresh Node 26.12.1, Bun 1.4.3 and
Chromium 153.0.8010.12 receipts pass for CSV Boolean (2), Core Inspectors (3),
Core Relationships (4), Bit128/UUID (11), and Core Keys (4): 24 bounded
operations. The fail-closed aggregate recomputes the current source closure and
reopens pinned receipts; archive bytes are verified by the separate preflight.
The current [ledger](evidence/rust-migration/r8-symbol-inventory/gap-ledger.json)
records 922 logical retirement gaps, 860 executable names without an accepted
Rust mapping, 62 accepted opt-in mappings, 24 aggregate-proven bounded routes,
and 9 unresolved resource aliases. The Core Keys replay omits the historical
700,000-unit retained-value control. Other route families, complete parity,
declaration retirement, and release qualification remain outside this evidence.

The next private captured-graph slice accepts forward and inverse generated
Join/Many `related` expressions using the original relationship and full
serialized `RecordRef` equality. Its 27 focused Rust tests and three Python
seam tests, including four live navigation variants, pass with a temporary
extension. Python constructors and `navigation_parts` still own relationship
metadata and alias preconditions; arbitrary synthetic DTOs, broader subclass
accessor behavior, installed-wheel qualification and public `capture()`
selection remain open. A following private SearchLeg slice admits `search_top` keyword,
vector and nested hybrid legs. A genuine `Param[Vector]` crosses the DTO
boundary with an explicit Ellipsis tag. Foreign Record, unbound parameter and
carrier mismatch refusals retain Python's ordering. Subsequent private checks
preserve Python's optional-filter placement and incompatible temporal-parameter
profile refusals. A further private aggregate/bucket slice follows Python's
scalar shape, operation, temporal-field and bounded average-scale checks;
bucket width remains the public DSL builder's responsibility. The private
read-terminal profile now covers exact `first`, `one`, `count`, `exists`, and
`group_count` shapes, retaining Python's preflight refusal order. The private
`update` terminal check now admits the exact
`(RecordRef, steps, assignments)` shape and traverses assignment ownership
before later parameter checks, matching a genuine generated `@command`
declaration and refusal controls. It cannot reconstruct generated mutable-field
metadata or check assignment value/field type compatibility from the DTO.
The private capture-orchestration follow-up passed 35 focused Rust tests and
11 live Python parity tests after Sol's independent rerun. Public `capture()`,
command authority, mutation execution, subclass behavior and installed-wheel
qualification remain open.

The [captured-graph subtype DTO addendum](evidence/rust-migration/r8-captured-graph-validator-interface/README.md#trusted-subclass-dto-admission--2026-10-26)
now admits real Python subclasses of the known graph bases through actual MRO
membership and canonical base tags/fields. Navigation bases are resolved
before their `Join` ancestor so Rust retains the required/optional/many
navigation family and selected roots. Class-name spoofing and ambiguous
multiple-inheritance across unrelated trusted bases are explicit DTO-boundary
refusals. Sol's CPython 3.11 live-overlay rerun passes 31 focused tests plus
three subtests across graph validation, capture and predecessor suites. This
qualifies only the exercised opt-in DTO admission cases; public `capture()`
remains Python-selected, while arbitrary subclass accessor behavior, broader
capture parity, default selection and installed-package qualification remain
open.

The [two-hop aliased Join control](evidence/rust-migration/r8-captured-graph-validator-interface/README.md#two-hop-aliased-join-control--2026-10-26)
now pins acceptance of an aliased second-Join source and the earlier
`join source is absent` refusal before a later foreign-field fault. Sol reran
36 focused Rust tests and 13 live Python graph-validator tests on CPython 3.11;
public capture selection remains unchanged.

Selection now has a crate-private lazy `RegistrationProvider` static adapter
through constraints, admitted Engine validation and Selection. Focused
provider tests cover repeated lookup and error stopping; the structural gate
test and ten R5 Selection tests pass. Opaque host handles remain reserved and
are explicitly refused at extension execution. The explicit TypeScript
callback-result reference matrix now covers Node, Bun and Chromium: custom
iterables retain ordered unknown diagnostic fields; semantic iterator faults
become validator-failure diagnostics; structure-errors iterator faults escape
by identity. The expanded 69-case matrix pins a first diagnostic severity
read after each payload's iterable is drained, a second pass after all
callbacks, and final descriptor copying only after Selection traversal.
Structure-error path concatenation invokes JavaScript `Symbol.toPrimitive`
with a default hint; path/coercion/message throws escape by identity.
Returning `undefined` from semantics yields different native
TypeError text in Bun than in Node/Chromium. The primitive opaque get/invoke
protocol compiles for Node and WASM and passes focused Rust and a Bun Node-host
fake-addon probe. Sol independently reran the matching fake-addon dispatch in
Node, Bun and real Chromium; it now passes 18 bounded assertions in each,
including native string-left concatenation, ordered mixed diagnostic
serialization, live `JSON.stringify`, delayed native Error-message access,
and IteratorClose on structure-error loop-body throws with original thrown
identity. The separate reference baseline also passes 69 cases, 12 frozen
comparisons and seven schema checks in all three hosts. This is dispatcher
evidence only; JavaScript's internal coercion and stringify work are not metered
by the current Rust Context, so resource parity remains open. A private
Rust iterable helper retains yielded callback
values as opaque handles until an explicit later copy; its focused tests pass.
An internal diagnostic helper now retains opaque callback values while
checking the predecessor's `emit` field order and the later short-circuiting
severity pass; its focused tests pass. Private host events stage invalid-source
diagnostic stringification and an opaque native Error carrier without reading
an inherited `.message` getter early. Sol independently reran 23 focused core
host tests, seven Node and five WASM binding tests. Final `UmfError`
construction/exposure, complete Selection materialization and native
noniterable spread errors remained unresolved at that checkpoint. The protocol does not select the route. The host
provider lookup seam now accepts the live Rust Context at each lazy demand
site; a future host provider must charge work through it. No host Selection
route, `kindRuntime` behavior, default-root switch or retirement
claim follows from this static seam. Sol's full `umf-core --lib` regression
run on this source packet passed 424/424 tests.

The [Selection diagnostic-materialization stage](evidence/rust-migration/r8-selection-diagnostic-materialization/README.md)
now keeps ordered static diagnostics and a reserved opaque callback-diagnostic
representation behind a crate-private materializer. The static Selection path
preserves Engine's existing `Validation.valid`, including structural
invalidity that may be reported with warning severity, and retains the
existing completeness, diagnostic order, refusal envelope and successful
`sourceValidation` shape. The focused materializer tests pass 5/5 and the R5
Selection frozen suite passes 10/10. This is a static refactor plus an internal
staged value model only: callback diagnostics are still refused by the static
conversion, final UmfError construction/exposure remains open, and no host
Selection route, `kindRuntime` behavior, default-root switch, host parity or
retirement claim is established.

The [versioned operation-resource interface](evidence/rust-migration/r8-symbol-inventory/operation-resource-root-interface-decision-20261026.md)
now gives the Facets v3 and Cardinality v4 JSON Schemas closed, authored
metamodel output bindings under amended CONTRACT-080 and vocabulary 1.1.0.
The Rust compiler emits both documents in declaration order, with explicit
local and core-schema link targets, a resource-only conditional fragment, and
manifest provenance. Sol independently reran the metamodel crate tests (25
unit and 5 integration tests); both generated operation schemas retain their
frozen exact bytes and SHA-256 values. The generated-output fixed-point check
passed again after the Selection host protocol and Python capture DTO commits.
The previous ledger's 17 unresolved resource aliases were historical; the
current source recapture below records 13. Neither ledger closes the 922
logical default-route retirement gaps.

The [bounded native spread-failure continuation](evidence/rust-migration/r8-next-route-queue/selection-provider-implementation-prep-20261026.md)
now lets Rust request host-native TypeError text for `undefined`, `null`, and
an already-read non-callable `Symbol.iterator` method. The dispatcher reuses
the predecessor's spread expression without repeating the caller's getter;
`String(error)` runs once and thrown identity is preserved. Sol independently
reran the focused core, Node and WASM codec tests and the
[20-assertion fake-addon probe](evidence/rust-migration/r8-selection-host-primitive-dispatch/README.md)
in Node 26.12.1, Bun 1.4.3 and Chromium 153.0.8010.12. The rerun frozen
TypeScript reference records 71 captured cases, 12 frozen comparisons and
seven schema checks on Node and Bun, with matching Chromium host outcomes;
its receipts match each host's native message for those three inputs.
Malformed iterable stages outside this subset, complete host Selection,
`kindRuntime`, final `UmfError` exposure, native-work metering and the default
route remain open.

The [current R8 inventory and ledger recapture](evidence/rust-migration/r8-symbol-inventory/README.md#r8-typescript-public-runtime-export-map)
now checks against 3,375 route-specific declarations and 1,120 declarations
in each of the Node, browser and reference roots. The V4 entries expose 42
direct declarations each. A narrow declaration-shape normalization for
`verifyCoreKeyOperation` restores route multiplicity. Source tracing now
classifies its staged Rust Core Key verifier as selected in both default roots;
the prior private Node/Bun/Chromium archive receipt is source-pinned and does
not qualify the current worktree. The ledger records 84 source-selected Rust
declarations across those roots and still records **922 logical
executable retirement gaps**, **62 accepted opt-in Rust mappings**, **860
unmapped executable names**, and resource authority counts of 52
generated-known, 49 authored-known, 88 candidate-generated and **9
unresolved**. The regenerated metamodel, inventory and ledger fixed-point
checks pass. The ledger test suite passes 43/45; two source-bound installed
archive tests correctly reject the changed Node host source. The five-family
24-operation private archive and Node/Bun/Chromium receipts must be rebuilt on
a frozen source cut before installed-route qualification can be renewed.

Kind v6 and Nullability v5 now join Facets v3 and Cardinality v4 as exact
current-byte Rust metamodel outputs under CONTRACT-080 vocabulary 1.2.0. The
compiler and generated-output checks pass; this authority starts at the
current bytes and does not reconstruct the two older schemas' edits. The
resource ledger therefore moves four aliases to generated-known authority
without changing the 922 executable retirement gaps.

The [extension identifier data receipt](evidence/rust-migration/r8-extension-id-data/README.md)
identifies 63 direct string-literal `_EXTENSION` exports whose values each
match an authored package ID. A zero-transform private SDK build and Node
26.12.1, Bun 1.4.3 and Chromium 153.0.8010.12 captures show exact values on
the default and reference routes. This is an evidence-only static-data
candidate: no export, route or Rust owner changes, and no retirement gap is
removed. The receipt preserves all package matches for repeated IDs and
excludes generated vocabulary, profile constants and executable factories.

The [private Selection host route](evidence/rust-migration/r8-selection-private-host-route/README.md)
now admits host-owned source then query and consults `Registry.get` lazily at
Rust's existing lookup sites. The private host provider now evaluates
`manifest.scopes.includes`, invokes `structure` with the caller's receiver,
and reads false-result error entries in predecessor order. It preserves
host-thrown identity. Semantic callbacks and nonempty structure-diagnostic
materialization still stop at explicit boundaries. Sol reran the ten frozen R5
Selection tests and seven Bun-driven Node-addon tests;
an independent Node 26.12.1 probe matched the frozen JSON value and preserved
lookup-throw identity. That probe also found a null-prototype decoded result
where the TypeScript reference returns ordinary objects, so full JS shape
parity remains open. The WASM target compiles, but this new Selection export
has no real Chromium runtime receipt yet.
No public/default route or retirement claim follows from this checkpoint.

The [mixed-diagnostic interface receipt](evidence/rust-migration/r8-selection-private-host-route/mixed-diagnostic-interface-decision-20261026.md)
now covers an invocation-local typed carrier from constraint `emit` through
private Engine and Selection validation. Invalid-source structure messages
remain host string tokens until one aggregate Node host `JSON.stringify`, and
nonstring messages refuse at `emit`. Focused Bun-driven binding tests pass 10/10,
the Node private probe passes, frozen R5 Selection passes 10/10, and the WASM
target compiles. Successful host-warning results, semantic callbacks, real
Chromium Selection runtime, result object prototype and default selection are
still open. No sentinel or eager message copy is accepted.

The strict unified-client checker continues to scan every `src/access` source
with exact per-file import allowances. The Record Type facade also restricts
its predecessor declaration modules to type-only imports and re-exports.
Negative controls reject borrowed file grants, new imports, predecessor value
imports and re-exports, and host hooks; the checker and nine boundary tests
pass. This policy guard does not select a Rust route or reduce retirement gaps.

The [Key v2 and Record Type v6 authority receipt](evidence/rust-migration/r8-symbol-inventory/key-record-type-generated-authority-20261026.md)
records the narrow CONTRACT-080 vocabulary 1.3.0 amendment. Both schemas are
closed metamodel outputs with their previous bytes and hashes unchanged. The
compiler uses Key-specific fixed ordering, omits Record Type's empty `$defs`,
and admits only its declared Kind v6 `$defs/declaration` target. The focused
compiler and frozen-byte tests pass, and source-bound generation now reaches a
fixed point without treating generated Cardinality v4 as a compiler input. The
clean-source metamodel and self-model suite passes 71 tests, and the installed
editable Python action-runtime resource suite passes 34. The subsequent ledger
recapture moved their four aliases from unresolved to generated-known;
executable retirement and release status did not change.

The [live selected-Key parity control](evidence/rust-migration/r8-captured-graph-validator-interface/README.md#live-selected-key-get-and-page-parity--2026-10-26)
confirms that the existing private Rust captured-graph validator accepts
genuine `get` and `page` declarations and matches Python's exact selected-Key
refusal before a later foreign-expression fault. A fresh PyO3 extension replay
passes 31 capture/validator tests plus three subtests on CPython 3.13.16; 36
focused Rust graph-validator tests pass. This closes the earlier bounded
selected-Key preflight evidence gap, but public Python capture selection,
arbitrary subclass accessors, wider graph admission and installed-wheel
qualification remain open.

The private captured-graph DTO bridge fails closed for accessor-bearing
trusted subclasses or extra dataclass fields. It runs Python's live validator
before that boundary refusal so an earlier semantic fault retains its order;
public `capture()` remains Python-selected. For bridge-only DTO depth, value,
and byte limits, it now also runs the live validator before surfacing the
resource refusal. The focused CPython 3.13.16 replay passes 17 tests, including
an accepted oversized graph and two semantic-first oversized graphs. Wider
graph admission, installed-wheel qualification, and default capture selection
remain open.

The [fixed-point private SDK archive](evidence/rust-migration/r8-installed-route-evidence/current-6f4f21c1/aggregate.json)
was captured from 3,440 source inputs with zero generated transforms and
1,789 verified archive payload members. Its separate five-family aggregate
passes 24 selected operations in Node, Bun and real Chromium: CSV Boolean,
Core Inspectors, Core Relationships, Bit128/UUID and Core Keys. The
[Record Type installed sidecar](evidence/rust-migration/r8-installed-route-evidence/r8-record-type-installed/record-type-installed.json)
uses the same archive and passes three frozen declaration/verification pairs
plus malformed-receipt-before-current ordering in those hosts. It is separate
from the 24-operation gate. The archive is a private fixed-point cohort,
not a release artifact; later JSON Schema wrapper edits make its source
closure historical for the current worktree. No retirement follows from either
receipt.

The condition-aware [R8 ledger](evidence/rust-migration/r8-symbol-inventory/gap-ledger.json)
now recognizes the Node/browser Record Type bindings with their exact Rust
owners and separate installed receipt. Key v2 and Record Type v6 have generated
schema authority. This cohort records 64 accepted executable Rust mappings,
858 executable names without such a mapping, 88 source-selected route rows,
and all 922 logical default-route retirement gaps still open. Historical
archive gates stay source-pinned; counts must be recaptured after subsequent
source changes before making a current-source claim. The full ledger suite
passes 46/46, including explicit stale-cohort rejection and negative resource
authority controls.

The [Python V8 closure audit](evidence/rust-migration/r8-python-v8-closure-audit/README.md)
continues to support a source-level V8-free `umf-codegen` route through the
bundled Rust CLI, with one installed macOS arm64 CPython 3.11 wheel cohort
replayed without Node or Bun. That host/platform scope does not qualify the
complete Python API or release. The next bounded Python parity gate is a
branch-by-branch census of `capture._validate_node` against the private Rust
captured-graph validator, followed by one closed DTO/refusal class and an
installed extension replay. Trusted Python introspection, declaration-body
execution and database/session orchestration remain the host responsibilities
defined by CONTRACT-071 and CONTRACT-072.

The next JSON Schema boundary step retains the TypeScript default route. A
[bounded wrapper correction](evidence/rust-migration/r8-json-schema-eight-operations/README.md#non-string-pointer-wrapper-correction)
now preserves runtime-native non-string pointer errors before Rust dispatch in
the opt-in Node and WASM facades; focused tests pass 19 cases and 135
assertions. `getJsonSchemaNode` still differs on malformed-document versus
non-string-pointer refusal precedence, and raw `importJsonSchema` getter/Proxy
traces and refusal order remain unresolved. The
[production cutover interface draft](evidence/rust-migration/r8-json-schema-eight-operations/import-host-observation-decision.md)
specifies a literal host-observation bridge for JavaScript reflection and exception timing,
with Rust retaining schema and document semantics. It needs a governed
interface, frozen trace tests and Node/Bun/Chromium evidence before any default
route selection; preserving the TypeScript semantic route permanently would
not complete the shared-engine goal.

### R8 staged JSON Schema import and Python resource continuation — 2026-10-26

The direct TypeScript `importJsonSchema` host-observation capture now records
nine source-bound cases in Bun 1.4.3, Node 26.12.1, and real Chromium
153.0.8010.12. All three hosts have identical canonical case arrays for this
capture. The cases cover the three distinct `baseUri` reads, resource
enumeration/getter and Proxy effects, original thrown-object identity, and
refusal order through root parsing. The capture hashes the direct adapter
source, not its transitive closure; it is an observation baseline, not a
binding-parity or default-route claim.

The private Rust `JsonSchemaImportSession` now accepts short-lived per-stage
contexts and owns the first validated URI, ordered resources, payload URI,
parsed root, ID, and namespace observations. It refuses out-of-order calls and
closes after stage failures. The private tagged-wire session owns cumulative
transport work across calls and preserves UTF-16 units; a future binding must
reattach cancellation and deadline controls on every call. The focused core
session suite passes 8/8 and the focused wire suite passes 4/4 with Rust 1.90.
The full `cargo test -p umf-core --locked --offline --quiet` Rust 1.90 run
passed after the focused diagnostic correction, including all 433 core unit
tests and the integration suites. Explicitly ignored external-oracle tests
remain outside this run. This result predates the separate private Cardinality
host-admission edit, which requires its own current-source rerun. The run
includes existing JSON Schema adapter, edit, inspection, and operation suites.
The existing JSON Schema wire regression suite passes 8/8. The private Node
facade now passes eight focused Bun controls against a fresh native addon,
including the control-error envelope, plus an independent Node 26.12.1
success/syntax-refusal probe.
The [private WASM browser receipt](evidence/rust-migration/r8-json-schema-eight-operations/staged-import-browser.json)
passes six focused cases in Chromium 153.0.8010.12 against freshly built
Rust 1.90/WASM and wasm-bindgen 0.2.100 glue. It confirms host getter order,
three distinct URI reads, original thrown-object identity, and resource/root
parse stage stops, with zero page errors. The subsequent
[18-case staged matrix](evidence/rust-migration/r8-json-schema-eight-operations/import-host-parity-matrix.json)
matches direct TypeScript host effects and outcomes across fresh Node 26 native
and real Chromium WASM builds; Node/WASM stage sequences also match. A bounded
Rust diagnostic correction now preserves the three ordered Ajv details for an
unsupported string `type`. Non-string coercion, full stage/control coverage,
installed-package parity and default-route admission remain open.
The TypeScript default route and all 922 retirement gaps
remain unchanged. String-only opt-in handling does not qualify the direct
source API's non-string coercion and parser edges.
The [nine-case direct-source non-string observation](evidence/rust-migration/r8-json-schema-eight-operations/import-host-nonstring-observation.json)
matches across Bun 1.4.3, Node 26.12.1 and real Chromium 153.0.8010.12.
It captures length getter and `JSON.parse` coercion order, thrown identities,
repeated length access and the native YAML parser TypeError. These are
predecessor observations, not private-binding parity; the staged method
remains string-only.
The additive [private host-coercion bridge](evidence/rust-migration/r8-json-schema-eight-operations/import-host-nonstring-bridge-decision.md)
now admits a finite two-text profile while leaving that string-only method
and the default TypeScript route unchanged. Direct source and fresh Rust-backed
Node 26, Bun 1.4.3 and Chromium 153/WASM runs match host effects and exact
outcomes for 20/20 admitted cases on each host; nine further cases are
explicitly excluded by the profile. This advances the host protocol, but
general non-string input and default-route parity remain open.

The authored `umf-codegen` resource sync gate exposed five stale canonical
resource copies and its manifest/release pin. Running the existing sync writer
and checker refreshed those bytes without changing the proposed `0.2.0`
package version or Rust protocol. The resource gate and CPython 3.13.16
codegen source tests pass (21/21); fresh `umf-core` and `umf-codegen` wheels and
sdists build from the refreshed isolated source snapshot. After obtaining and
hashing the exact macOS arm64 CPython 3.13 `pydantic-core==2.33.2` wheel, a
[clean installed smoke](evidence/rust-migration/r8-python-v8-closure-audit/cpython-3.13-installed-smoke-20261026.md)
passes on CPython 3.13.16 with Node, Bun, Cargo, and rustc absent from `PATH`.
It covers core read/validate/write, one codegen generation fixture, compiler
dispatch/refusal, and CLI help. The subsequent
[successful verifier follow-up](evidence/rust-migration/r8-python-v8-closure-audit/cpython-3.13-successful-verifiers-20261026.md)
passes installed `verify_table_deployment` for an 18-step bundle and
`compile_table_migration` plus `verify_table_migration` for a 13-step plan
under the same V8-free CPython 3.13 runtime constraint. The wheel pair came
from the recorded post-resource-sync source snapshot, not an exact current
worktree capture. Broader Python API coverage, source-cleanliness proof and
the release matrix remain open; these local receipts are not a release claim.

The R8 ledger now accepts three additional exact opt-in mappings: the existing
`inspectCoreRecordMembers` Rust core/wire/Node/WASM operation, plus
`readJsonValue` and `writeJsonValue` under their bounded serialization profile.
Record Members retains its 11-case frozen/host receipts, and the serialization
packet has a source-pinned 24-case Node/Bun native and WASM cohort with an
earlier Chromium receipt. The current ledger has 67 accepted opt-in Rust
operations, 855 executable names without an accepted mapping, and **all 922
default-route retirement gaps** still open. The `./reference` route remains
TypeScript. Current installed-package parity and the broader serialization
YAML/Proxy surface are not established by these mapping additions.

The [private Selection Chromium receipt](evidence/rust-migration/r8-selection-private-host-route/chromium.json)
now runs the source-frozen seven-query cohort against fresh Rust 1.90 WASM in
Chromium 153.0.8010.12. It matches the frozen JSON values and Registry thrown
object identity. A direct TypeScript source check established that Selection's
final `copyJson` gives the root and nested objects null prototypes; the
earlier ordinary-prototype interpretation was wrong. The private projection
now preserves the observed null prototypes, arrays, and an own `__proto__`
data key without prototype pollution. A synthetic warning-policy case matches
six ordered direct TypeScript `sourceValidation` diagnostics in Bun and the
same cross-host baseline in Chromium; the checked-in policy remains an error
policy. Node 26 and Bun focused probes pass. Semantic callbacks, complete
event/resource-control parity, installed package qualification and
public/default Selection remain open.

### R8 source-closure and private host-admission checkpoint — 2026-10-26

The exact per-file unified-client import policy remains in force across every
`src/access` source. Its checker and nine negative/control tests pass. The
Node binding package now includes its statically imported helper modules in
the package file allowlist; `check:rust-node-package-closure` independently
checks the `npm pack` member set and all 30 relative static import edges, with
missing-member and side-effect-import negative controls. The WASM helper is a
generated package-local source twin. This closes a package-closure defect for
the private JSON Schema bridge, not general import parity.

The [private Core Cardinality host route](evidence/rust-migration/r8-cardinality-private-host-route/chromium.json)
now lets Rust order opaque host reflection and semantic work through one
invocation context for inspect, declare, and verify. The existing tagged route
retains its early identity refusal. The private route rejects operation and
resource controls it cannot honor, and its ordinary-Context profile keeps
custom Registry/capability behavior out of scope. Focused Rust Cardinality
tests pass 18/18; focused Node binding tests pass 5/5. A fresh Rust 1.90/WASM
and wasm-bindgen 0.2.100 run in Chromium 153.0.8010.12 matches the frozen
semantic cases, confirms request-before-source and receipt-before-current
ordering, preserves a thrown host identity, and reports no page errors. The
receipt was refreshed against the current generated resources and all 20
repository-source hashes in it were rechecked. Default Cardinality routing,
full control semantics, and installed-package qualification remain open.

`build:metamodel` refreshed compiler-provenance fields in generated outputs;
there was no schema-body change. The five codegen resource mirrors and their
manifest pin now match the canonical generated resources. The fixed-point
`check:metamodel`, `check:rust-boundaries`, `check:rust-node-package-closure`,
`typecheck`, and `test:metamodel` gates pass. `test:metamodel` includes 61 tests
and 484 assertions plus real Chromium 153 browser profiles with zero page
errors. The Rust boundary check reports zero V8 dependency findings. The
private JSON Schema non-string Chromium bridge was also rebuilt after this
resource sync: its 20 admitted cases match direct current TypeScript effects
and exact outcomes, with nine explicit exclusions and zero page errors. Its
eight source-path hashes and the boundary matrix's nine local artifact hashes
were rechecked against this tree.

The first isolated SDK package attempt exposed a stale generated
`src/extensions/actions/plan-identity.ts` producer hash; the builder correctly
marked that private snapshot non-fixed-point and refused package publication.
Refreshing the generated hash to the current source bytes made the identity
`--check`, metamodel fixed-point, typecheck and Rust boundary gates pass again.
The [fresh installed Core Facets cohort](evidence/rust-migration/r8-core-facets-installed/current-facets-20261026/README.md)
then passed independent archive preflight and installed Node 26.12.1, Bun
1.4.3 and Chromium 153.0.8010.12 replay against one zero-transform,
3,450-input source closure (`5804c9072e5fa85a8c50b362ae4e4f1039a1b5f91ff44b740d2eea489a8fa78f`).
The archive SHA-256 is
`63c72d374aff9181837ef2286dd732e52626286c9b9b199a5c12b9f3b9c331d5`;
all 1,789 member hashes were verified. Four bounded Facets operations,
six historical cases, ten exact refusals, host admission order, proxy trap
order and caller-thrown object identity match the same-host TypeScript
reference. Chromium requested WASM with no Node globals or external requests.
This does not qualify public resource controls, other routes, complete
TypeScript retirement or a release.

The complete current-source Rust 1.90 `cargo test -p umf-core --locked
--offline --quiet` run now passes: 434/434 core unit tests and every executed
integration group. External-oracle tests explicitly ignored by the default
command remain outside this result. This run includes the private Cardinality
host-admission edit;
the subsequent action-plan identity refresh changes only generated TypeScript
provenance. The refreshed R8 ledger has 67 accepted opt-in Rust mappings,
855 executable names without an accepted mapping, 44 directly Rust-selected
executable declarations in each Node/browser root and **all 922 logical
default-route retirement gaps** still open. The ledger's source and script
closure was regenerated after the package/checker changes; its fixed-point
check and all 47 ledger tests pass. Next implementation work
should address the public Python captured-graph routing seam. A read-only
branch census found no defensible missing Rust validator branch for ordinary
closed DTOs: `capture()` still injects `_validate_node`, whereas the native
validator is private opt-in. `umf_access` already depends on `umf-core`, but
the public route must check the installed extension operation and exact
`umf-access-captured-graph-validation/0.1.0` profile before executing a
declaration body. Missing or mismatched capability must fail explicitly rather
than invoke Python validation. The opt-in bridge currently falls back to
`_validate_node` for accessor-bearing subclasses and its stricter DTO budgets;
these are real public-route blockers. Preserve their observed semantics with a
Rust-directed host observation protocol or make a separately reviewed contract
and versioned support-boundary decision before any default switch. A focused
installed-wheel matrix must cover crossed-fault order, exception class and
message, subclass accessors, limit boundaries, and a sentinel proving the
default path no longer calls `_validate_node`. The 922 default-route retirement
gaps and release qualification remain open.

For the Node/browser default route, `selectCoreElements` is the next bounded
candidate with an existing Rust core, wire operation and opt-in bindings. It
cannot be selected yet: the predecessor takes a caller `Registry`, copies
source before query, validates the full source even for empty matches, and
invokes semantic callbacks at constraint traversal points. The opt-in wrapper
instead accepts an extension array and indexes callbacks before Rust sees the
request. Freeze and compare callback order, diagnostics, thrown-value string
conversion and raw host admission in Node, Bun and Chromium, then use a
single staged Rust invocation with one cumulative context before changing V4
exports. This is one logical export and does not by itself retire the 922-gap
ledger.

The preservation-first implementation choice is a Rust-directed observation
protocol. Python retains opaque live graph handles and exposes field/sequence
reads only when the Rust validator asks in its existing traversal order; it
must rethrow an original accessor `PyErr` without string conversion or
reconstruction. The first private proof covers `FieldRef` owner reads,
including early crossed-fault short circuit and repeated stateful getter
visits. It does not authorize default `capture()` selection: Node, RecordRef,
join, search, navigation and other graph families need the same ordered host
behavior, and the current bridge's 50,000-node/depth-64/8-MiB limits must be
reconciled with Rust's ordinary Context limits. Do not add a Python semantic
fallback to bypass resource refusal. A later installed-wheel replay must pin
the exact `umf-core` wheel profile carried by `umf_access`'s runtime version
requirement before cutover.

### R8 private observation and release continuation — 2026-10-26

The [Selection host trace](evidence/rust-migration/r8-selection-host-trace/README.md)
compares 13 bounded cases in Node 26.12.1, Bun 1.4.3 and real Chromium
153.0.8010.12. Each host has 2 exact value/error, 9 output-shape and 5
host-trace matches. The receipt pins the selected live inputs against an
earlier fixed-point distribution; Chromium uses manifest-pinned WASM with
separately pinned older glue. It is a diagnostic for callback, admission and
`kindRuntime` work, not current integrated or installed-package qualification.

The private Rust-directed Python capture observer now covers FieldRef owner
reads, a terminal/root/Join prefix, and the ordered FieldRef/Join/tuple visit
branch through opaque PyO3 handles. Focused tests exercise repeated
`node.args` and relation getters, grouped-query pass order, iterator effects,
UTF-16 owner text, foreign-field short circuit and original accessor exception
identity. The committed 0.2.0 observer profile passed 23 focused Python tests
and seven Rust core tests; the older 0.1.0 capability fails before graph
observation. A separate structural field observer passed six Rust core tests
but is not wired to PyO3; it cannot replace the ordered semantic branches of
`_validate_node.visit`. Public `capture()` still calls `_validate_node`. A
cutover audit limits the first candidate to exact base `.all()` with an empty
steps tuple and no parameters. A [private exact-profile callback](evidence/rust-migration/r8-capture-visit-field-join-tuple/README.md#private-exact-all-empty-steps-callback-2026-10-26)
now admits that shape, preflights the 0.2.0 capability before graph reads,
and delegates its terminal/root checks to one native Context. Its focused
Python observer suite passed 32/32. The callback remains outside public
`capture()` because Python owns profile admission and the later DTO encoder
uses a separate budget. A reconciled capture/encoder budget and installed-wheel
replay remain gates before public selection. General SearchLeg and Node,
navigation, aggregate, parameter and temporal semantics remain outside the
private visitor. No Python fallback may hide an unadmitted graph or resource
limit.

The next bounded observer capability,
`umf-access-capture-graph-observation/0.3.0`, adds a private SearchLeg prefix
for legs with `value is None` and no yielded nested legs. Rust preserves the
record identity comparison with two separate `record` getter calls, then reads
`value` and `legs`; it leaves `kind` untouched when value is `None`. Foreign
record refusal precedes value/legs reads, and PyO3 retains original
accessor/iterator exceptions. Fixtures cover an untouched raising `kind`
getter, a faulting `value` getter, and a second stateful `record` getter that
rethrows its original exception. Nine focused core tests and 40 focused Python
tests pass against a fresh temporary extension. Bound-value parameter/carrier
checks, nested/hybrid legs, public routing, encoder-budget reconciliation, and
installed-wheel qualification remain open.

The [private keyword SearchLeg leaf observer](evidence/rust-migration/r8-python-captured-graph-selected-key/search-leg-graph-validation-20261026.md#private-live-keyword-leaf-observer--2026-10-26)
now covers one resolved `Param[str]` bound value with an exact base
`Node("param", (name,))` and empty legs. It preserves the predecessor's
separate live `value` reads, seven recursive `op` reads, and host exception
identity; a direct `_validate_node` trace supplies the accepted-case oracle.
Fresh extension tests pass 21/21 in the focused captured-graph file. This
observer remains private and refuses changing recursive operation getters,
nonempty or nested legs, other carriers, and subclass graphs. It does not
reconcile Python capture and DTO-encoder budgets or qualify public routing.

The follow-on [private vector SearchLeg observer](evidence/rust-migration/r8-python-captured-graph-selected-key/vector-search-graph-validation-20261026.md)
adds the resolved `Param[Vector]` carrier beside the existing `Param[str]`
case. It preserves the same live-read schedule through the kind-dependent
carrier check and the four later reads of the bound value; unsupported kinds
remain refused. The Rust observer unit suite passes 10/10 and the PyO3
extension builds. Sol independently ran the focused captured-graph Python
file against a fresh extension: 24/24 tests pass, including same-host
read-order, wrong-carrier and exception-identity cases. The 0.4.0 observer
remains private; public routing,
the installed wheel, encoder-budget reconciliation and broader search support
remain unqualified.

The [all-empty capture first-fault audit](evidence/rust-migration/r8-capture-visit-field-join-tuple/README.md#capture-dto-budget-and-first-fault-reconciliation-2026-10-26)
blocks a public Rust cutover: the predecessor's third host read is `Node.args`,
while the candidate reads `RecordRef.module`. A fresh Rust 1.90.0 PyO3 build
and CPython 3.13.16 focused suite pass 46/46, including the pinned divergent
trace. The shared work session does not reconcile the Rust Context's 100,000-
value/depth-128/4M-text limits with Python DTO encoding's 50,000-value/
depth-64/8-MiB ceilings or the predecessor's lack of those DTO limits. Public
`capture()` remains on Python until ordered admission and first-fault/resource
behavior are resolved.

The [follow-on args-before-owner correction](evidence/rust-migration/r8-capture-visit-field-join-tuple/README.md#native-args-before-owner-correction-2026-10-26)
removes Python graph-field admission reads and restores the predecessor's four
distinct `Node.args` accesses before root-owner fields in the private
empty-steps candidate. A same-host pinned regression confirms that prefix. The
observer still stops before the predecessor's recursive `visit(node)` reads,
so it is not full validator parity and public `capture()` remains
Python-selected. DTO encoding ceilings remain separate from public capture's
Python-object result; a public Rust route must not introduce encoder-only
refusals without a reviewed support-boundary change. Rust Context limits,
broader visitor behavior and installed-wheel qualification remain open. The
fresh CPython run passes the focused capture group at 93 tests plus three
subtests; the dedicated observer file passes 47/47. This remains source-level
evidence, not installed-wheel qualification.

The [empty-all recursive visitor tail](evidence/rust-migration/r8-capture-visit-field-join-tuple/README.md#native-args-before-owner-correction-2026-10-26)
now extends that private exact-profile observer through six live `Node.op`
branch reads and the final `Node.args` iteration. Same-host regression pins
the full stable-graph trace equal to `_validate_node` and verifies that a
seventh `Node.op` fault wins over a competing final-args fault with exception
identity preserved. The dedicated observer file passes 48/48 and the broader
focused capture group passes 94 tests plus three subtests against a fresh
extension overlay. This does not qualify state-changing getters, other graph
shapes or full validator parity. Python DTO limits remain 50,000 values,
depth 64 and 8 MiB text/output, separate from Rust Context limits and absent
from public Python-object capture; public route remains unchanged. Installed-
wheel and public cutover qualification remain open.

The separate [read-frame gate](evidence/rust-migration/r8-python-read-frame-core/README.md)
now has a private PyO3 bridge. Rust asks for host `len`/index/iteration reads
in predecessor order and owns post-host shape and post-decode cardinality
decisions; original Python row/iterator errors pass through unchanged. The
focused core tests passed 5/5, and a fresh extension passed seven focused
CPython tests. Public `result_frame` is still Python-selected: Python acquires
rows, decodes scalars, builds response objects, and enforces the existing
bounded-size rule. The predicate has no shared Context charge, and its
caller-supplied row count/bound is not sufficient for public routing or
release qualification.

The [Truss component predicate](evidence/rust-migration/r8-truss-component-profile/README.md)
and [authenticated outcome effect-frame gate](evidence/rust-migration/r8-outcome-effect-frame/README.md)
are also private opt-ins. The former has 14 focused closed-component parity
cases but no generated-Key integration run in this checkout. The latter has
five focused CPython 3.14.8 tests after a capability-handshake correction;
authentication, metadata equality, transaction custody and public routing
remain Python/host-owned. These slices add bounded Rust rules without changing
the last fixed-point ledger's 922 logical default-route retirement gaps.

Release preparation must consume one immutable source revision and the
complete reviewed qualification matrix. The existing coordinated Python
workflow builds and aggregates core/codegen artifacts without publishing;
it does not include `umf_access`. The SDK root remains `private: true`, the
Node/WASM binding packages remain private, and the legacy PyPI workflow fails
closed. Before publication, qualify the complete default routes and exact
installed packages, then add tag/release-bound GitHub Actions publishers with
same-run artifact hashes and trusted publishing where configured. Registry
uploads must execute in Actions; local builds and probes are qualification
only. Verify the published registry/index bytes and clean installs before
claiming the release.

`umf_access` has a separate manual installed-wheel gate because its dev7 runtime
requires Pydantic 2.13+ while the coordinated core/codegen six-cohort profile
uses Pydantic 2.11.9. A local CPython 3.14.8 macOS arm64 run built and installed
the exact dev7 access and core 0.11.0 wheels from clean source archive
`76aebded3`, with pinned dependency wheels, and passed package metadata, core
wheel digest/inventory, dependency pins, imports and required exports. Its
separate candidate profile and exact local receipt are recorded in
[R8 access installed-artifact evidence](evidence/rust-migration/r8-umf-access-installed-qualification/README.md).
The historical dev0 profile remains unchanged. The candidate does not qualify
hosted cohorts, public capture, broader access semantics, native drivers, or
release eligibility; the workflow remains manual until hosted receipts are
reviewed.

### R8 private callback and retained-runtime checkpoint — 2026-10-26

The [private Selection semantic callback route](evidence/rust-migration/r8-selection-callback-trace/README.md)
now carries caller-owned diagnostics through Rust constraint evaluation as
opaque handles. It checks diagnostic fields at the `emit` boundary, reads
severity again in the later validity pass, and materializes unknown fields
only when Selection needs the result or refusal. Fifteen pinned callback cases
matched the same-host TypeScript predecessor in Node, Bun and real Chromium,
including outcome and recorded host order; Chromium reported zero page errors.
The Node binding suite passed 13 focused tests and the Rust runtime diagnostic
suite passed 15. This is a private subset: arbitrary host iterables and
`Registry.kindRuntime` behavior remain outside the route. It does not change
either V4 default export or the 922-gap retirement count.

The [spread-failure extension](evidence/rust-migration/r8-selection-spread-boundary/README.md)
adds three private callback cases: an `undefined` result, a non-callable
`Symbol.iterator`, and a throwing iterator getter with observable
`String(error)` conversion. Three more cases cover iterator `next`, `done`
and `value` throws and the absent iterator-close effect. Existing Rust-stage
host branches cover these cases; a new Rust regression pins the no-close
semantics. Final source-bound Node, Bun and Chromium replays match the same-host
TypeScript predecessor on all 21 outcomes and host-event traces, with zero
drift across 28 source pins per receipt. The focused Bun binding suite passes
14/14. General iterator step/close behavior beyond these exact cases,
general spread behavior, `kindRuntime`, full resource accounting, and default
V4 routing remain unqualified.

The [private opaque return carrier](evidence/rust-migration/r8-selection-opaque-return-carrier/README.md)
adds a Rust-directed host invocation that can return an object or function by
its invocation-local handle, with strict live-handle validation and identity
preservation in Node and WASM. Its focused Rust tests, 17-case Bun binding
suite, 21-case Node/Bun predecessor comparisons and 21-case Chromium replay
pass. Final receipts pin 28 current source inputs per host with zero drift
after metamodel/resource/inventory regeneration. This is
the result-transport primitive needed by a future `Registry.kindRuntime`
route; it does not implement the complete delegation sequence, qualify full
`kindRuntime` parity, change V4 default routing, or retire any of the 922
default-route gaps.

The [extension-kind runtime disposition](evidence/rust-migration/r8-explicit-runtime-extension-kinds/README.md)
records why `inspectExtensionKinds` remains caller-runtime-selected. CONTRACT-907
requires explicit `new Registry(runtime)` and an unavailable-capability refusal
even for an empty registry; the V4 root's initialized engine cannot be
silently substituted. The existing facade delegates all inspection semantics
to the caller's Rust-backed runtime, but this does not qualify as a package-root
default-route retirement.

The [Core Evolution candidate](evidence/rust-migration/r8-core-evolution-candidate/README.md)
adds an opt-in binding over existing Rust inspect/verify operations. Its
frozen seven-case packet, current/forged receipt checks, adapter error
controls and expanded same-host preservation matrix passed four Bun tests with
24 assertions against a fresh Node addon. The Rust Core Evolution suite passed
10/10, including exact aggregate input preflight edges at 100,000 values and
4,000,000 bytes; typecheck passed. Neither V4 root selects it. Before a default
cutover, prove CONTRACT-083 retained-output and exact work limits plus the
crossed-control matrix, and refresh package-level Node/Bun/Chromium and
installed-package provenance. These
private results do not alter the last fixed-point 67/855/922 ledger counts.

The strict unified-client checker now lists the private Core Evolution file
with only its audited imports; its predecessor declaration imports are
type-only. The full directory scan and eleven focused boundary tests pass in
the current worktree (`bun run check:unified-client-boundaries`,
`bun test tests/unified-client-boundaries.test.ts`, and `bun run typecheck`).
Adding a facade still requires its own exact entry and cannot inherit another
file's grants. This boundary change does not select the candidate by default.

The [private count-token predicate](evidence/rust-migration/r8-python-count-token/README.md)
adds a Rust `NonnegativeInteger` token decision behind an exact PyO3 profile.
It preserves decode-before-sign order for the narrow count token and refuses
`-0` while ordinary integer classification still accepts signed tokens.
One focused Rust test, a fresh PyO3 build and four CPython overlay tests pass.
The public `result_frame` does not call the predicate; its row acquisition,
shared budget, authenticated cursor and installed-wheel/database matrix remain
open, so this is no default-route retirement.

The [private Python logical-render v0.2 bridge](evidence/rust-migration/r8-python-logical-render-v02-bridge/README.md)
now exposes the existing full Rust renderer through an exact-profile PyO3
envelope. The live-object helper preflights the installed capability before
captured-object encoding; missing or mismatched profiles fail closed. Sol
independently reran 22 focused Python tests with 15 subtests against the fresh
extension. The accepted packet covers direct, equality-filter and
optional-filter requests. Separate Python encoder/output budgets and the
native Context do not establish the predecessor's resource first-fault order.
Related, mutation, joins, group/search, Weft and installed-release replay
remain open; Python's public renderer and catalog defaults stay selected.

The [direct `securityNot` cutover comparison](evidence/rust-migration/r8-security-not-default-cutover/README.md)
matched the three valid T/F/U inputs but only 3 of 14 same-host cases in
both Node 26.12.1 and Bun 1.4.3. Invalid inputs change `UmfError` to
`UmfCoreError`; accessor and Proxy cases also change host effects during
generic wire admission. This raw-host finding remains valid for the unguarded
factory. The guarded route now preserves the predecessor's scalar admission,
and a fresh Chromium comparison confirms 3/14 raw versus 14/14 guarded parity.
V4 package-root and installed archive checks are recorded in the direct-binding
evidence below; the installed archive is provisional and not release eligible.

The [guarded private `securityNot` adapter](evidence/rust-migration/r8-security-not-admission-adapter/README.md)
now preflights only the three exact scalar truth tokens and delegates valid
NOT decisions to Rust. Direct Node and Bun comparisons match all 14 outcomes
and host-effect traces, with Rust work/cancellation controls retained for
valid tokens. The V4 Node and browser roots now select this adapter around the
direct scalar binding; `src/index.ts` and internal TypeScript callers retain
the predecessor. The adapter remains internal rather than a new public export.

The [direct scalar `securityNot` binding](evidence/rust-migration/r8-security-not-direct-binding/README.md)
replaces the generic tagged-JSON call for valid inputs through the V4 root
factory. A strict host guard preserves the predecessor's invalid-input error
and callback order; Rust owns valid T/F/U decisions and charges one work unit.
Node and Bun each match all 14 frozen outcome/host-effect cases. Local median calls fell to
169 ns and 185 ns, respectively, from approximately 10 µs through the generic
wire, though both remain materially slower than the tiny TypeScript function.
The measured guarded-route overhead over the raw direct binding is small
(approximately 4.5 ns/call in the Node sample and 1.0 ns/call in Bun) and is
accepted to preserve the predecessor's admission contract. Fresh Chromium
source parity and freshly built V4 Node/Bun root comparisons each cover all 14
cases. A private installed archive replay also passes 14 cases in Node, Bun and
Chromium with WASM loaded and Node globals absent. The first archive was
source-drifted because the private snapshot generator changed eleven stale
outputs. After regenerating and checking those outputs, the fixed-point private
archive from commit `dc746ad53` (SHA-256
`8b1d5ad2e57fa33487752b0116211b7628df201359cbd2a13a75912e0e08e60e`)
reported zero transforms and equal live/packaged source closure hashes. Its
installed replay again passed all 14 cases in each host. The result is
source-pinned to that committed cohort and is not a release or full-security
qualification; subsequent edits require a fresh archive replay.
The override is limited to the `securityNot` export at V4 roots: `src/index.ts`,
internal TypeScript imports, AND/OR/composition, and broader security logic are
unchanged. The R8 inventory/ledger recapture records the guarded Node and
browser bindings with the TypeScript `./reference` route intact. Its ledger
receipt predates the fixed-point archive above and needs recapture; all 922
logical default-route retirement gaps remain open. Neither receipt establishes
release readiness or complete security migration.

The [raw-host JSON-number packet](evidence/rust-migration/r8-json-number-predecessor/README.md#r8-raw-host-default-route-gate--blocked)
now records ten untyped JavaScript values. Fresh Node, Bun and real Chromium
each find ten candidate mismatches: Rust's string-only admission runs before
the predecessor's `Number` and later string coercions, losing host effect and
exception identity. Node and Bun also show a 4,000,001-character zero token
accepted by TypeScript but refused by Rust's 4,000,000-unit Context cap.
Sol independently reran the frozen predecessor check, focused test and
Node/Bun candidate probes, and caught a source-hash drift that was corrected
and rechecked. The default export remains TypeScript-selected; its resource
and host boundary need a reviewed decision before cutover.

The [Core Kind + Nullability six-operation candidate](evidence/rust-migration/r8-core-kind-nullability-candidate/README.md)
has accepted Rust owners for six logical executable names and twelve Node/
browser route rows, but no V4 selection. The focused Rust test passed 6/6;
frozen Node replay passed eleven successes and thirteen refusals. Existing
Bun source parity and a historically built Chromium artifact remain scoped to
their recorded source cohorts. The V4 model facade currently dispatches
stateless wire requests, while the staged Kind/Nullability path owns a second
retained Engine and prepared schemas. A per-runtime shared dispatcher must
unify them without changing host-read or resource order. A second eager
factory and process-global cache are rejected. Local warm calls measured
about 22.4 times TypeScript in Node and 34.1 times in Bun, so the performance
gate also remains open. Fresh current-source Node/WASM builds, installed
packages and source-coherent browser qualification precede any retirement.

The [private caller `kindRuntime.validateDocument` delegation stage](evidence/rust-migration/r8-selection-kind-runtime-delegation/README.md)
extends the opaque object/function return carrier through a Rust-directed
host sequence. The Rust event test and 20/20 focused Bun binding tests pass;
Node/Bun and real Chromium 153 compare the same-host TypeScript getter/call
trace, method receivers, source/registration/result identity, thrown-value
identity, and explicit refusal for a falsy runtime. This remains a private
delegation primitive: arbitrary callback result/iterable handling, static
validation behavior, resource-accounting parity and installed-package
qualification remain open. Neither V4 default root changes, and no default
route gap is retired.

The [private Selection result continuation](evidence/rust-migration/r8-selection-kind-runtime-result-continuation/README.md)
preserves `kindRuntime.validateDocument` return values across the Rust-directed
host sequence, including undefined, special IEEE-754 numbers, and invocation-
local object, function, symbol and bigint identities. Five focused Rust tests,
22 Bun binding tests, twelve same-host Node result comparisons, and a fresh
Chromium 153 WASM replay pass at the recorded source pins. The null second-
runtime read has the same TypeError class and access trace but different
generated text in Node. Arbitrary diagnostics, static validation, resource
parity and installed-package qualification remain open. Both V4 defaults stay
on their predecessor route.

The [private Selection consumer-stage `.valid` cut](evidence/rust-migration/r8-selection-kind-runtime-result-continuation/README.md#consumer-stage-boundary-decision)
now invokes the caller `kindRuntime.validateDocument` at the Selection
validation branch, reads only its result's `.valid` property, and stops before
either diagnostics formatting or successful result copying. Sol reran the
focused Rust test, 24 Bun binding tests (215 assertions), Node 26 same-host
trace, and a fresh Chromium 153 WASM replay. The five observable host events
match TypeScript through `.valid`; the final outcomes intentionally differ
(`HOST_JSON_UNSUPPORTED` at the private Rust boundary versus the predecessor's
later behavior). Arbitrary callback diagnostics, static validation, resource
parity and installed-package/default-route qualification remain open.

The [Protobuf descriptor write CLI](evidence/rust-migration/r8-protobuf-descriptor-write-cli/README.md)
adds one opt-in pure Rust operation, `protobuf.descriptor.write`, that emits
raw `FileDescriptorSet` bytes. The local Rust 1.90.0 CLI suite passes 51/51,
including a byte-for-byte R5 TypeScript predecessor vector and unknown-field
preservation. Its 32 MiB stdin and 4 MB output bounds are explicit; stdin
read and preflight decode are outside the cooperative work/deadline meter.
This does not select a Node/Bun, browser, Python or V4 default route and does
not qualify Protobuf source operations.

The [Protobuf document export CLI](evidence/rust-migration/r8-protobuf-document-export-cli/README.md)
adds a second opt-in pure Rust binary-output route for exactly
`protobuf.document.export`. A direct frozen TypeScript import/export vector
matches 83,233 descriptor bytes by SHA-256. Sol independently reran the full
offline Rust CLI suite with 54 passing tests, including the three focused
export tests. The route caps stdin at 32 MiB and binary output at 4 MB; stdin
read and preflight decode remain outside cooperative work/deadline metering.
No package default or binding route selects this CLI operation.

The [`umf_access` local installed-artifact gate](evidence/rust-migration/r8-umf-access-installed-qualification/README.md)
now compares every access package wheel member with the selected clean Git
source checkout, binds the verifier and profile to that revision, and rejects
source symlinks. Its new public `capture()` semantic harness rejects a cohort
mismatch and compares four scoped declarations with a pinned source predecessor
only after the installed wheel identity gate passes. The earlier dev7 receipt
predates this source-to-wheel closure check and is historical. The fresh
clean-source CPython 3.14.8 macOS arm64 artifact receipt passes at `f82845498`;
the dependent semantic receipt matches four public `capture()` cases with the
pinned source predecessor. A separate semantic extension matches six cases,
adding ordered projection and a compound bound predicate while reusing the
same source-pinned installed wheel. Hosted cohorts, full capture semantics and
native drivers remain unqualified.

The latest clean-source `umf_access` local gate was rebuilt after the private
Selection Rust change and profile-path guard at `1bf2217b9`. It passes exact
source-to-wheel closure, profile path provenance, isolated dependency checks,
and all six predecessor `capture()` cases in CPython 3.14.8 macOS arm64.
The linked [artifact and semantic receipts](evidence/rust-migration/r8-umf-access-installed-qualification/README.md)
remain nonpublishing and not release eligible; they do not qualify hosted
cohorts, native drivers or the complete public access surface.

The regenerated [R8 inventory and gap ledger](evidence/rust-migration/r8-symbol-inventory/README.md)
still record 922 logical executable default-route retirement gaps: 67 have an
accepted opt-in Rust mapping and 855 do not. These private/additive changes
retire none. The Rust port and release gates remain open.

### R8 retained-resource and capture-budget continuation — 2026-10-26

The [private combined Core Kind/Nullability binding](evidence/rust-migration/r8-core-kind-nullability-candidate/README.md#private-shared-dispatcher-implementation-slice--2026-10-26)
now snapshots caller resources once and sends generic model requests through
the same retained Rust `Engine` as its six staged Kind/Nullability operations.
Explicit resource witnesses are compared with the admitted values under the
operation's work meter; stateless calls and closed Record Type shapes keep their
required witnesses. The checked-in [fresh Chromium replay](evidence/rust-migration/r8-core-kind-nullability-candidate/combined-browser.json)
passes one generic model call and the six staged operations with no later
resource-proxy reflection or Node globals. A rebuilt Node addon passes all
eleven frozen successes and thirteen refusals; the two focused Rust wire tests
pass. The generic facade still eagerly constructs a separately metered Core
Key verifier, and the previous warm-call performance gap remains open. This
factory is opt-in and does not select either V4 root.

The [private capture DTO budget](evidence/rust-migration/r8-capture-dto-budget/README.md)
now keeps node, text and output counters in the PyO3 session while Python
retains traversal and JSON encoding order. Its offline extension build and
focused CPython overlay pass 100 tests and three subtests; Sol independently
reran the budget and graph-validator subset (29/29). This does not change the
public `capture()` route. Public cutover still needs DTO-free validation,
first-fault parity and a decision on the bridge's 50,000-node/depth-64/8-MiB
ceilings versus Rust `Context::ordinary()` and the predecessor's supported
inputs.

The metamodel and action-plan identity were regenerated to a fixed point after
these Rust source changes; their checks, 61 unit tests/484 assertions and 139
real-Chromium cases pass. The branch merged `origin/main` at `85627a2a4` and
repaired a type-only assertion annotation in the newly merged schema-browser
release qualifier so repository typecheck passes. The strict per-file
unified-client checker still scans every access source and its eleven negative
controls pass. The post-merge Rust boundary gate and core-authority check pass.
The [recaptured R8 ledger](evidence/rust-migration/r8-symbol-inventory/README.md)
labels the installed `securityNot` archive as fixed-point **at source commit
`dc746ad53`**, not at the later merged tree: its 14-case Node/Bun/Chromium
replay remains private and does not enter the five current-cohort proven routes.
Inventory and ledger `--check` modes and the 48-case ledger suite pass. All
922 logical default-route retirement gaps remain open, with 67 accepted Rust
mappings and 855 without one.

### R8 shared verifier and private capture continuation — 2026-10-26

The [combined Core Kind/Nullability candidate](evidence/rust-migration/r8-core-kind-nullability-candidate/README.md)
now shares one retained Rust Engine and Registry across the generic model
dispatcher, six staged operations, and Core Key verification. Sol reviewed the
setup ordering and corrected an intermediate limit drift: Engine construction
uses catalog limits, Kind/Nullability schema preparation retains ordinary
limits, and Registry preparation uses catalog limits. Independent focused Rust
tests pass 5/5; a rebuilt Node addon passes eleven frozen successes and
thirteen refusals, and Bun's host-admission replay passes six semantic cases
and ten negative controls. The fresh Chromium 153 receipt pins 165 source
inputs, nine private operations, malformed-receipt-before-current refusal,
single caller-resource reflection, and zero page errors or external requests.
Setup work for the pinned resource cohort fell from 832,477,520 to 432,197,359
metered units. This is setup work, not a warm-call performance qualification.
The combined factory remains opt-in; neither V4 default route changes.

The [current-source Node/Bun default-route gate](evidence/rust-migration/r8-core-kind-nullability-candidate/default-route-qualification.json)
passes exact caller-resource reflection, first-fault, and same-host TypeScript
operation-trace controls, but warm calls remain much slower. Across five
setup-separated rounds of 30 calls, the pinned receipt's median Rust/TypeScript
ratio is 22.76 in Node 26.12.1 and 33.50 in Bun 1.4.3. Sol independently
reran the same harness and source cohort: the controls passed and the median
ratios were 20.77 and 32.01. These local timings are not a cross-platform
benchmark; they keep default selection open rather than justify a cutover.

The [private capture budget evidence](evidence/rust-migration/r8-capture-dto-budget/README.md)
now includes session-aware Python-to-Rust graph DTO admission. Sol independently
reran the rebuilt CPython overlay cohort: 101 tests and three subtests pass.
The response envelope, Python traversal, DTO encoding, and `_validate_node`
remain outside that Rust admission slice. A separate
[private exact empty-terminal validator](evidence/rust-migration/r8-python-captured-graph-selected-key/search-leg-graph-validation-20261026.md)
now admits exact built-in `Node(op, (RecordRef, ()))` shapes for `all`,
`first`, `one`, `count`, and `exists` directly in PyO3, with no tagged graph
DTO. Its side-effect-safe gate rejects custom
metaclasses, descriptors and dictionary keys before graph reads; unsupported
shapes continue through the existing private DTO route. Sol independently ran
the rebuilt seven-file CPython overlay cohort: 113 tests and three subtests
pass. The public `capture()` route and general graph families remain Python;
these closed profiles do not establish complete first-fault or resource parity.

The [private Selection host evidence](evidence/rust-migration/r8-selection-private-host-route/README.md)
now proves the existing registration provider's 47-event, seven-lookup
callback interleaving against same-host TypeScript in Bun with the Node addon
and in a fresh Chromium WASM replay. This slice changed tests and evidence,
not Selection runtime code. Arbitrary semantic iterables and default Selection
routing remain open.

A further [transparent-Proxy parity probe](evidence/rust-migration/r8-selection-private-host-route/proxy-admission-blocker-20261026.md)
matches the TypeScript source/query reflection trace and complete Selection
result in Bun with the private Node addon. An initial probe falsely reported a
result mismatch because its TypeScript baseline omitted the returned value;
independent review found and corrected that test error. The source-first
exception-identity control also passes. This is a bounded successful-host
probe, not complete arbitrary callback or installed default-route
qualification. The focused binding and facade suite passes 30/30;
`selectCoreElements` remains opt-in pending those gates.

The generated metamodel manifest and action-plan identity were refreshed to a
fixed point after the DTO-free PyO3 extension, Selection test correction and
latest `origin/main` merge. Metamodel and identity checks, repository typecheck,
and 139 real-Chromium metamodel receipts pass. The earlier 61 metamodel unit
tests/484 assertions passed before the latest source-only digest refresh;
generated schema outputs did not change.
The Rust boundary gate still reports zero V8 debt, and the strict unified-client
and core-authority checks pass. Sol's post-binding full core-wire suite passes
62/62 tests. The final [R8 inventory and ledger recapture](evidence/rust-migration/r8-symbol-inventory/README.md)
passes both generator checks and the 48-case ledger suite against the settled
source. It records 922 logical default-route gaps, 67 accepted opt-in Rust
mappings, 855 unmapped names, 90 Node/browser source-selected declarations,
and five current fixed-point routes. None of the private work in this section
retires a gap.

Next, establish resource-order and warm-call parity before any Kind/Nullability
default selection, extend DTO-free capture semantics beyond the five closed
terminal profiles while retaining side-effect-safe outside-profile handling,
complete Selection callback and installed-host parity, and retire the remaining
executable default routes.
Installed Python/Node/browser cohorts, coordinated release gates and publication
must pass before a full-port or release claim. The current R8 census remains
922 logical gaps (67 accepted opt-in Rust mappings, 855 unowned).

### R8 exact public capture and artifact-reference core — 2026-10-26

The [public capture exact-terminal cut](evidence/rust-migration/r8-public-capture-exact-terminal/README.md)
selects the DTO-free PyO3 validator only when an exact empty parameter tuple
and built-in `Node`/`RecordRef` with empty steps admit one of `all`, `first`,
`one`, `count`, or `exists`. Raw instance dictionaries, keys and operation text
are bounded before graph accessor reads. Outside-profile inputs go directly to
the Python predecessor, including parameters, other terminals and nonempty
steps. Sol independently replayed seven CPython 3.13.16 source-overlay files:
137 tests and three subtests pass. Current-source `umf-core==0.11.0` and
`umf_access==0.1.0.dev7` wheels now build offline after synchronizing the
canonical action-runtime manifest. An isolated CPython 3.14.8 macOS arm64
installation resolves both packages from site-packages. Sol independently
replayed the five admitted operations with `_validate_node` patched to fail:
all five select the Rust validator and complete four capture observations.
The earlier installed old-core wheel still exercises the guarded Python
fallback. Exact wheel member/source hashes, isolated install commands and
dependency limitations are recorded in the linked evidence. Hosted platform
cohorts, full capture semantics and publication remain gates.

The follow-on [direct empty-step `group_count` candidate](evidence/rust-migration/r8-public-capture-group-count-terminal/README.md)
bumps the exact profile to `0.3.0` and admits one more predecessor-accepted
base `Node` shape. The normal DSL does not emit this empty-step grouped count;
it is reachable through direct public `Node` construction. Sol independently
reran its seven-file source-overlay cohort: 139 tests and three subtests pass.
The later [installed `0.3.0` two-wheel receipt](evidence/rust-migration/r8-public-capture-group-count-terminal/README.md)
selects all six exact empty-step terminals from isolated CPython 3.14.8
site-packages on macOS arm64. The PyO3 profile preflight happens before graph
reads; the old `0.2.0` wheel falls back to Python for the sixth terminal.
This is a six-shape installed qualification, not general capture parity or a
hosted release matrix.

The [private Selection iterator continuation](evidence/rust-migration/r8-selection-callback-trace/README.md)
matches primitive iterator, missing/noncallable `next`, and primitive next
result failures without rereading caller objects. The 30-case same-host
Node/Bun/Chromium receipt is private; arbitrary callback and resource-limit
parity, complete host behavior and default selection remain open. The
[selected-key capture observer](evidence/rust-migration/r8-python-captured-graph-selected-key/README.md)
also remains private after 124 passing CPython overlay tests and three
subtests; it consumes live reads after terminal and Join-owner preflight and
must not retry Python after `unsupported-after-read`.

The [artifact-reference Rust core](evidence/rust-migration/r8-artifact-reference-core/README.md)
now computes the ordered diagnostic pass after structural domain-pack
validation. Sol reviewed a one-diagnostic duplicate correction and exact
UTF-16 key handling; two focused Rust tests pass. A follow-on
[bounded opt-in Node/WASM wire route](evidence/rust-migration/r8-artifact-reference-binding/README.md)
matches four focused Node tests after structural pack validation and passes two
Rust wire tests. Its inspection dimensions are capped. The
[real Chromium opt-in receipt](evidence/rust-migration/r8-artifact-reference-binding/README.md)
also matches exact UTF-16 diagnostics and refusal controls. Installed-package
replay remains open. No default route
selects it, so it retires no executable gap. The next dependency is installed
same-host differential evidence, then an explicit default-route decision that
respects the structural-validation precondition.

The metamodel compiler outputs were regenerated after the new Rust module,
and the nine-resource Python action-runtime manifest was synchronized from
those canonical spec outputs. `check:metamodel` and the action-runtime
manifest check pass. The final action-plan identity, R8 inventory/ledger and
all release gates must be refreshed after concurrent default-route work
settles. Neither private slice retires an executable default-route gap.

### R8 Selection false-result and JavaScript numeric route — 2026-10-26

The [private Selection false-result receipt](evidence/rust-migration/r8-selection-kind-runtime-false-refusal/README.md)
extends the callback protocol through the `kindRuntime.valid === false`
branch. Rust reads the live diagnostics only after the false validity result;
the host applies live `JSON.stringify` and native Error coercion. Sol reran the
seven focused Rust tests, four focused Bun tests, and 36 exact outcomes and
traces in Node. The checked-in Node, Bun and real-Chromium receipts also report
36/36 outcomes and traces each. The true-success branch, arbitrary host
effects, resource-order parity and V4 default selection remain open.

The [five CONTRACT-049 JavaScript numeric V4 bindings](evidence/rust-migration/r8-javascript-numeric-default-route/README.md)
select the retained Rust engine through exact Node and browser facades. The
strict unified-client checker continues to scan every `src/access/` file, with
exact audited per-file imports; its negative controls reject new imports and
host hooks. A first private installed replay passed 27 independent numeric
oracle vectors and same-host refusal, proxy-trace and context controls in Node,
Bun and Chromium, but its archive required 11 generated-source transforms.
The follow-on fixed-point archive from commit `ca9cda964` has zero transforms
and matching live/source closure hashes; its installed Node, Bun and Chromium
replay passed the same 27 cases plus package route and asset-refusal controls.
The [focused archive-pinned resource replay](evidence/rust-migration/r8-javascript-numeric-default-route/README.md)
passes six public-root input bounds against the packaged TypeScript reference
in Node, Bun and Chromium. Raw opt-in Node runtime callbacks also pass setup
and per-operation resource, cancellation and deadline controls under Node and
Bun. The saved R8 WASM binding lacks the prepared numeric runtime class, so
opt-in WASM callback qualification is open. These bounded cases do not prove
universal resource behavior or full numeric parity. The explicit `./reference`
route continues to execute TypeScript.

The [private Selection valid-result continuation](evidence/rust-migration/r8-selection-kind-runtime-valid-success/README.md)
retains the caller's `kindRuntime` result through final `/sourceValidation`
copying and skips a conflicting Rust static validation. A source rejected by
that static check but accepted by the caller produces the same Selection and
callback trace in Node, Bun and Chromium; the final-copy accessor refusal also
matches. The [JSON Schema `get` first-fault correction](evidence/rust-migration/r8-json-schema-get-first-fault/README.md)
validates an invalid document before a non-string pointer in private Node and
WASM bindings, matching the predecessor in focused Node and Chromium replays.
Its extra validation call leaves control-budget equivalence open. Both slices
remain opt-in; they establish neither full operation parity nor default-route
retirement.


The ledger now recognizes these five opt-in Rust operations as source-selected
only, preserving a single logical gap per export and condition-specific route
status. The [regenerated inventory and ledger](evidence/rust-migration/r8-symbol-inventory/README.md)
record 922 logical executable gaps, 72 accepted opt-in Rust mappings and 850
unmapped names; the 49-case ledger suite passes. Metamodel, Python resource
mirror, action-plan identity and real-Chromium metamodel checks pass for this
source cohort. The Selection and JSON Schema changes after that capture require
fresh inventory, ledger, generated-resource and installed-package evidence.
Full parity across the remaining gaps, the hosted release matrix, review and
integration still gate any full-port, merge or release claim.

### R8 fixed-point recapture and bounded route qualifications — 2026-10-26

The [canonical recapture](evidence/rust-migration/r8-symbol-inventory/README.md)
at commit `4c3187be9` passed metamodel, nine-resource Python action-runtime,
action-plan identity, 49 ledger tests, 61 metamodel tests, and a real-Chromium
metamodel replay. The ledger still records 922 logical default-route retirement
gaps, 72 accepted opt-in Rust mappings, and 850 unmapped names. Its 50
Rust-selected declarations per V4 root are route selections, not retirement.

A private fixed-point SDK archive from that clean commit has matching captured
and live source-closure SHA-256
`7870eee151f2633c48f49194e20f2bc590cbfabc62b80ef7abffeefa095e91f9`
over 3,461 inputs and zero generated transformations. Its archive SHA-256 is
`64e46f86bfb2ffbd97066d84d8a36cbd5a5cd48f45d6337a2400b4b4a79286ff`.
The [aggregate installed SDK replay](evidence/rust-migration/r8-javascript-numeric-default-route/installed-replay-4c3187be9.json),
SHA-256 `4f37e09655457ca4e8c4f02a3dfee0e9fce82411da7628275dbe1d2ec83bab1b`,
passed on that sealed archive in Node
26.12.1, Bun 1.4.3, and Chromium 153.0.8010.12. It covers 31 R3 cases, 27
JavaScript numeric vectors plus six input-boundary cases, the selected
cardinality, facets, Core Keys, Bit128/UUID and Compact Dataset cohorts, and
three package-route tamper refusals. Missing/corrupt native and WASM controls
also refused. Its 1,083,467 ms duration covers the whole package replay and
is not a numeric performance measurement. The first attempt completed Node
and Bun but could not bind a local Chromium server in the sandbox; an exact
rerun with loopback permission produced the complete receipt. This archive
predates the later opt-in JSON Schema Rust change and is private, not a release
artifact.

On that sealed archive, the [CSV Boolean extension](evidence/rust-migration/r8-csv-boolean-retirement-extension/README.md)
passed 24 contract-derived default/reference cases in Node, Bun, and Chromium,
including token truth values, absent/null refusal, receipt tampering, a proxy
continuation, and receipt-limit precedence. The [Core Inspector replay](evidence/rust-migration/r8-core-inspectors-installed/README.md)
passed 26 frozen cases for three inspectors and additional root and nested
host-admission probes on the same hosts. Both receipts are private and scoped;
neither retires a ledger row or qualifies a release.

The [opt-in JSON Schema profile correction](evidence/rust-migration/r8-json-schema-additional-properties/README.md)
admits `additionalProperties:false` and schema-valued forms only inside the
existing recursive grammar. Rust tests, a fresh Node addon and real-Chromium
WASM agree with same-host TypeScript for four root/nested cases; an unsupported
nested keyword remains visibly incomplete. This post-archive Rust source change
requires a new source closure before it can contribute to any current-source
installed SDK claim. JSON Schema's eight-operation default cutover and broader
host/profile parity remain open.

A [fresh `parseNativeJson` host-boundary observation](evidence/rust-migration/r8-json-schema-parse-native-json-host/README.md)
shows a separate wrong-type gap in Node and Chromium: direct TypeScript reads
host getters and coercion hooks in source order, while descriptor-safe Rust wire
admission rejects those objects before the callbacks. CONTRACT-002 specifies a
text input, so no partial coercion shim was added. If arbitrary JavaScript
wrong-type parity is required for default cutover, it needs an explicit host
callback protocol and first-fault review across the eight-operation family.

The next model-only candidate is Core Evolution's inspect/verify pair. The
governing profile now admits only core 0.10.0, matching the current candidate
and frozen packet; focused TypeScript and Rust negative controls refuse 0.8.0.
Keep the route opt-in/private while retained-output bounds and installed-host
qualification remain open.

### R8 bounded protection bindings and retirement accounting — 2026-10-26

The [security protection-function binding](evidence/rust-migration/r8-security-protection-functions/README.md)
replays 25 exact source-backed tagged cases in Node, Bun, and Chromium. Two raw
accessor observations and two native-schema diagnostic-order cases remain
outside exact tagged parity. The
[source-resolution binding](evidence/rust-migration/r8-security-protection-source-binding/README.md)
replays ten frozen source cases on the same three hosts. Both are opt-in,
incomplete and non-authoritative; neither selects a package-root default or
establishes authorization or native protection behavior.

The [query-property Rust candidate and host binding](evidence/rust-migration/r8-security-protection-query-properties-binding/README.md)
replays 19 of 22 frozen tagged operations in Node, Bun, and Chromium. The three
required-range cases refuse; range identity and entailment remain unimplemented.
Raw accessor and Proxy observations are host-boundary controls, not tagged
semantic parity. The separate
[typed protection-parameter binding](evidence/rust-migration/r8-security-protection-parameters-binding/README.md)
replays eight of eleven frozen cases on those hosts. Its three exclusions are
the pre-spent private helper budget, a raw accessor, and native `oneOf`
diagnostic-array ordering. Both return `complete:false` and `authority:false`,
remain opt-in, and leave default routes and policy enforcement unchanged.

The five reviewed protection operations now have accepted opt-in ledger mappings
in the [source-coherent recapture](evidence/rust-migration/r8-symbol-inventory/README.md):
77 accepted mappings, 845 unmapped executable names, and all 922 logical
default-route gaps open. Mapping is not retirement. The ledger now records
independent open Node/browser dispositions, a separate reference-only status,
and paired-route counting tests. Production generation has no caller-supplied
retirement override; future retirement still needs a validated evidence gate.
The next concrete retirement review is the Core Inspector
trio, but its historical installed host-error differences, remaining
default-reachable TypeScript consumers, and stale archive closure require a
fresh fixed-point Node, Bun and Chromium replay and direct-callsite review
before either default route can be marked retired. The explicit `./reference`
TypeScript route is tracked separately from default-route retirement. The
full Rust port, integration and release remain open.

### R8 Inspector consumer and Relationship predecessor continuation — 2026-10-26

The [sealed Inspector archive replay](evidence/rust-migration/r8-core-inspectors-installed/README.md)
from clean commit `f2bad909` passed its 26 frozen direct-operation cases and
bounded root/nested host-shape checks in Node 26, Bun 1.4.3 and Chromium 153.
The archive is fixed-point and source-pinned, but it predates the consumer
source changes below. Missing and corrupt native addons refused import; Bun's
missing-addon error name differed from Node's while the code matched.

The [raw-profile consumer change](evidence/rust-migration/r8-core-inspector-consumer-boundary/README.md)
injects the existing Rust-backed Record Members inspector into the V4 helper
and keeps the explicit reference helper TypeScript-backed. The 11 focused Bun
tests and nine real-Chromium cases pass. The browser test used regenerated
wasm-bindgen glue around a reused target WASM; a current-source installed SDK
replay remains required. The complete V4 bundle still retains shadowed
TypeScript Inspector code through the broad `src/index.ts` exports. Neither
the direct Inspector family nor the mixed raw-profile helper is retired.

For the next family, direct Core Relationship V4 exports already select Rust,
but six public projection consumers still import the TypeScript relationship
operations. The [18-case predecessor packet](evidence/rust-migration/r8-relationship-consumer-predecessor/README.md)
freezes representative success, blocked, and accessor-refusal outcomes before
changing those consumers. Avoid a mutable module-wide dispatcher: default and
`./reference` may be imported together, so routing must preserve their
independent operation owners. Introduce scoped injection or V4 consumer
wrappers, expand the composed packet where its recorded coverage is limited,
then replay both roots from one fixed-point installed package across Node,
Bun and real Chromium. Rust invocation and reference isolation must be proven
before a retirement status changes.

The R8 accounting remains **77 accepted opt-in mappings, 845 unmapped names,
and 922 open logical default-route retirement gaps**. The next gate is to
rebuild the current source into a zero-transform private SDK archive, replay
the Inspector helper and direct Inspector packets from that archive, and
review all remaining default-reachable TypeScript Inspector paths. Full-port,
merge and release gates remain open.

### R8 Relationship consumer route and installed Inspector continuation — 2026-10-26

The clean `5e7138383` archive has now passed the [installed Inspector and
raw-profile replay](evidence/rust-migration/r8-core-inspectors-installed/current-5e7138383-20261026/README.md).
Its fixed-point source closure and complete archive manifest are pinned to that
commit. The 26 direct Inspector cases and nine raw-profile cases matched the
explicit reference route in Node 26.12.1, Bun 1.4.3, and Chromium
153.0.8010.12; missing/corrupt addon controls refused import. This is
historical cohort evidence, not a qualification of later consumer edits.

Six relationship projection consumers now use scoped factories. The V4 Node
and browser roots supply Rust-bound `lookupCoreRelationship` and
`verifyCoreRelationshipOperation` to those factories; the six legacy modules
continue to supply TypeScript operations to the explicit `./reference` route.
The public wrappers re-export only their prior schemas, types, and functions.
The [source replay](evidence/rust-migration/r8-relationship-consumer-source-replay/README.md)
compares 18 frozen predecessor cases in the V4 Node root and 15 browser-capable
cases in real Chromium, including projected receipts, blocked outcomes, and
accessor refusals. PostgreSQL is excluded from the browser packet because its
supplied parser backend is Node-only. Factory callback tests cover projection,
verification, and recovery, but these consumers still execute TypeScript
adapter logic. The existing Avro proof inputs gained SPDX headers after their
native validation capture; their exact pre-header bytes are now archived with
Git commit and SHA-256 provenance instead of changing the proof hashes.
The Python codegen wheel's nine-resource mirror was also refreshed from its
canonical current spec bytes after a stale resource check; its manifest pin
is now `61bb0bb35dfad7a6d37a1c4372758103d28f04cbce5db7b5fc9de5c47cd78129`.
The mirror check and ten native-contract tests pass under Python 3.9.6. The
subsequent inventory and ledger recapture kept the 922/77/845 disposition
counts unchanged.
The regenerated action-plan producer identity is
`2e9732326e2c3dc0bf0387520aaf8223463d92e731402f689a5d6ac9caea11f6`;
its `--check` mode passes against the current `src/` and `spec/` inputs.
After the final factory source changes, including preservation of the public
projection and verification function names, the R8 inventory and
ledger were recaptured and both generator `--check` modes pass. Inventory
SHA-256 is
`edd8bc4cdca2b1265b6649f0535e840f19ff22cd7eed8eca0ff0c8d66b861132`
(3,375 declarations, 509 source files, 1,126 unique names); ledger SHA-256 is
`e3cfa3eb5ce979c53d923bb58d15db56f7a236c98cfc0e0387373def2778b16e` (922
logical open gaps, 77 accepted opt-in mappings, 845 unmapped names, 50
source-selected declarations per V4 root, zero retired rows). These counts
remain separate from the mixed TypeScript/Rust relationship consumer bindings.

The [callsite audit](evidence/rust-migration/r8-default-inspector-relationship-callsite-audit/README.md)
distinguishes Rust-selected default named exports from TypeScript bodies
retained by the V4 `export * from './index'` path. The [non-root consumer
audit](evidence/rust-migration/r8-nonroot-core-consumer-audit/README.md)
records direct TypeScript calls in compilation admission and record-type
inspection/journal, with their current fixture and host limits.
The [condition-aware ledger](evidence/rust-migration/r8-symbol-inventory/README.md)
marks the 25 V4 relationship consumer declarations as mixed TypeScript/Rust,
not exact Rust-owned operations. Its totals remain **77 accepted opt-in
mappings, 845 unmapped names, 922 open logical gaps, and zero retired rows**.

The next bounded gate is a clean-commit, zero-transform SDK archive of this
relationship cohort, followed by installed Node/Bun/Chromium replay of both
default and reference routes, explicit Rust-invocation and source-closure
checks, and review of the remaining live TypeScript callsites. The [bounded
V4 barrel-separation plan](evidence/rust-migration/r8-v4-default-barrel-separation-plan/README.md)
specifies a generated explicit facade and export/bundle-graph checks to
remove shadowed TypeScript bodies from default bundles while preserving
`./reference` and every public declaration. These gates precede any Inspector
or Relationship retirement, full-port claim,
merge, or release.

### R8 V4 default facade source cut and 26aa installed continuation — 2026-10-27

The private SDK archive from clean source commit `26aa44ca1` is sealed. Its
bounded installed relationship-consumer replay now passes 18/18 cases on Node
26.12.1 and Bun 1.4.3, and 15/15 browser-capable cases on Chromium 153.0.8010.12.
The [installed relationship-consumer evidence](evidence/rust-migration/r8-relationship-consumers-installed/README.md)
matches the frozen outcomes and getter traces and proves Rust invocation on the
default routes plus zero Rust calls through `./reference`. PostgreSQL is
excluded from Chromium and uses an externally supplied, separately
Node-targeted backend with its dependency and source hashes pinned in the
receipt; this is not self-contained PostgreSQL support in the archive.
The archive receipt at
[`r8-sdk-26aa44ca1-private-package`](evidence/rust-migration/r8-sdk-26aa44ca1-private-package/README.md)
records package provenance only, and this archive predates the facade source
cut below. It is not installed qualification of that cut.

The V4 Node and browser roots now route their inherited API through a generated
explicit facade. The source checker preserves all 1,886 type/value export
names (1,120 runtime facets and 771 type facets), and bundle-input checks
exclude the reference barrel plus all 11 targeted Inspector/Relationship
TypeScript operation modules. The generated facade's `--check` is wired into
the private SDK source builder. Frozen current-source relationship behavior
passes 18/18 in Node and 15/15 in real Chromium using a regenerated private
WASM package; both replay receipts pin the generated facade and action-plan
identity inputs. See the [facade evidence](evidence/rust-migration/r8-v4-default-facade-slice/README.md)
and [barrel separation record](evidence/rust-migration/r8-v4-default-barrel-separation-plan/README.md).

The recaptured R8 inventory is 3,375 route-specific declarations across 509
files (SHA-256 `159ed518151d3eab681b28f97d542c9c51a2017ab78efcbe11aa00695bfe9b7c`);
the gap ledger SHA-256 is
`383ede15de7b95d297e488ad8eb342bfdd308ede116b1eca549f03604b1c5010`.
Retirement remains **922 open logical default-route gaps**, comprising 77
accepted opt-in Rust mappings and 845 unmapped names; neither V4 route has a
retired declaration. Bundle exclusion is not source declaration retirement.
The next gate is a clean archive containing the facade source followed by
installed default/reference replay across supported hosts. The bounded
relationship-consumer replay does not qualify the facade source cohort, retire
any declaration, or establish full-port or release readiness. Those claims
remain open.

### R8 facade archive and security truth-fold continuation — 2026-10-27

The V4 default facade source cut is now in a clean private SDK archive from
commit `ce1acfb65`. The [package provenance](evidence/rust-migration/r8-sdk-ce1acfb65-private-package/README.md)
records archive SHA-256 `5513efdca5ddb98fce9c5f8d9e105b07205bed1ebd8cd7cf87354e912da0a02e`,
fixed-point source closure SHA-256
`4d4fcdc18399339146e5cb710521f68124833adb5cbba6b19a4543bf07aee0e7`,
zero generated-input changes, and verification of all 1,801 listed member
hashes. The private SDK's full installed test passed Node 26.12.1, Bun 1.4.3,
and Chromium 153.0.8010.12, including package conditions, missing/corrupt
binding refusals, and its bounded prior operation packets. The archive is
explicitly nonpublishable. The [same-archive relationship-consumer replay](evidence/rust-migration/r8-relationship-consumers-installed-ce1acfb65/README.md)
passed 18/18 cases in Node and Bun and 15/15 browser-capable cases in real
Chromium. Default routes invoked Rust; `./reference` invoked none. PostgreSQL
still uses a separately supplied Node-targeted backend in that replay. This
installed evidence qualifies the selected facade relationship behavior for
the `ce1acfb65` cohort, not all inherited exports or a declaration retirement.

After that archive was sealed, the V4 roots source-selected Rust for
`securityAnd` and `securityOr` through a raw-input admission adapter. The
[source-level replay](evidence/rust-migration/r8-security-and-or-v4-source-replay/README.md)
matches 68 frozen predecessor cases in Node, Bun, and real Chromium, with 30
Rust calls for valid inputs and zero calls for preflight refusals per host.
It preserves snapshot-before-bound/token error order and retains the explicit
TypeScript reference route. Controls and `maxWork`/meter parity are unqualified;
no installed SDK archive contains this new source cut yet.

The R8 ledger now has an optional, fail-closed exact-row retirement evidence
gate. With no retirement manifest supplied, it reports **922 open logical
default-route gaps**, 77 accepted opt-in Rust mappings, 845 unmapped names,
and zero retired declarations. The current inventory SHA-256 is
`316febe0d0265264ea0c036495ea7f829fde8813aaf47ec02e446b30840c416a`;
the ledger SHA-256 is
`96f14829214b410fae1216143eb29ebe00b1a381612b7ee2d54a9a3982256127`.
The next gates are exact installed default/reference evidence for the four
core relationship operations and a clean installed security truth-fold archive
from the new source cohort. No full-port, merge, or release claim follows from
these bounded checkpoints.

The [four-operation installed relationship retirement replay](evidence/rust-migration/r8-relationships-default-retirement-replay/README.md)
freezes one Rust-executed case and one preflight refusal per operation and
compares each default route with `./reference` on Node, Bun, and Chromium.
All twelve host/operation receipts pass on the historical `ce1acfb65`
archive, with positive Rust invocation for valid cases, zero Rust calls on
refusals, and zero Rust calls through the reference route. The receipt checker
also proves that this archive fails the current-source retirement gate: it
predates the packet files and the present closure. These receipts qualify the
historical archive only; the four ledger rows remain open pending replay from
a new fixed-point archive containing the packets and exact source closure.

An independent review found that the first exact-row validator trusted the
reported archive/member hashes without reopening the `.tgz`. The validator now
hashes the archive bytes, checks every regular tar member including strict PAX
paths, compares the complete member map, and binds the embedded Rust manifest's
fixed-point source closure to the recomputed live-source input map. Archive
tamper, fabricated member-map, embedded-closure, and unsafe tar-path controls
pass. The historical relationship receipt checker still refuses retirement at
its stale-source gate. The seven operation packets below cannot retire rows
until a new archive passes this stronger gate.

The [Core Inspector packet](evidence/rust-migration/r8-inspectors-default-retirement-replay/README.md)
adds one frozen success and one accessor-preflight refusal for each of
`inspectCoreScalarType`, `inspectCoreRecordMembers`, and
`inspectCoreReferenceLinks`. Its packet generator pins the reviewed TypeScript
predecessor and historical host-shape evidence. A historical `ce1acfb65`
installed smoke replay passed all six cases in Node, Bun, and Chromium with
Rust invocation on success and none on refusal or `./reference`. This is a
bounded harness check; no new archive containing the packets has yet been
built, and the Inspector and non-root TypeScript callsite retirement decisions
remain open. The ledger stays at **922 open, zero retired**.

### R8 current-source installed archive and two-cohort retirement decision — 2026-10-27

The [current-source archive and replay bundle](evidence/rust-migration/r8-default-retirement-current-46ae463ea/README.md)
records a fixed-point private macOS arm64 SDK from `46ae463ea`, archive
SHA-256 `fe9b101303207574cc68f50bf4853590f683b51cbde9db39e03083c87e60a998`,
source closure SHA-256
`a75f3a86b75f48f2695fa2785cce8fc230c16a25c439f1a360343bc616ef3da1`,
3,518 source inputs, and zero generated-input transforms. The complete
installed SDK harness passed Node 26.12.1, Bun 1.4.3, and Chromium
153.0.8010.12, including package export conditions, the bounded R3 and
resource-sensitive packets, and missing/corrupt native and WASM refusals.
The installed receipt is preserved with the evidence bundle. This validates
the tested macOS archive; it does not qualify a release or close the R8 ledger.

Four Core Relationship and three Core Inspector frozen packets were separately
replayed against that same archive through the default and explicit TypeScript
reference routes on Node, Bun, and Chromium. Their 21 raw receipts are pinned in
the bundle. A source-level security truth-fold diagnostic also passed the 68
frozen cases against the extracted archive, but its receipt does not bind the
full installed package closure or count reference-route Rust calls, so a formal
installed replay remains required. At the source revision of this archive, the
validator rejected the otherwise matching Relationship values because it
compared object property order, and two Inspector operations lacked accepted
Rust-owner mappings. Both source defects have since been corrected; the old
archive cannot qualify the changed source. Neither finding marks a row retired.

The ledger's `retired` status is global across the supported default-route
platforms. A single macOS archive cannot substantiate it. The `/2` evidence
validator requires exact macOS arm64 and Linux x64 cohorts, each with an
independently hashed archive, complete member map, exact native target,
platform-matched Node/Bun/Chromium raw operation receipts, and the same
fixed-point current source closure and packet. It also pins the full source
transform and runtime-specific native or WASM member. The initial macOS bundle
remains a diagnostic source snapshot; source edits to the validator, ledger or
harness require rebuilding both cohorts. The hosted workflow captures both
archives and receipts and assembles a self-contained bounded matrix. It has
not yet completed on GitHub; its retained artifacts still need durable release
provenance.

Sol review found that one successful case and one preflight refusal per
operation cannot establish the contract acceptance surface. The `/2` validator
therefore records **bounded route evidence only**; the ledger retirement
entrypoint rejects `/2` and keeps every row open. A future retirement format
must bind operation-specific contract acceptance coverage across both archive
cohorts and all declared hosts before any global gap can close. CONTRACT-053's
four lexical tokens alone do not cover Boolean constraints, unsupported token
classes, wrong Field kinds, changed or forged receipts, and byte limits. The
[new CSV Boolean packets](evidence/rust-migration/r8-csv-boolean-default-retirement-replay/README.md)
add an exact post-prepare and zero-call preflight distinction and passed a
diagnostic Node/Bun/Chromium replay against the older
`fe65bf01` archive, but that archive predates their source closure. Its full
installed harness reached the final security receipt check after Node and Bun
R3 and Chromium replay, then failed because it read the runner's console
summary as a full receipt. The raw 68-case security replay passed; the harness
read has been corrected in source and requires a fresh fixed-point archive.
The [current ledger](evidence/rust-migration/r8-symbol-inventory/gap-ledger.json)
at SHA-256 `b32b0d579c588d167a96796a2651fb1b63ea9bae8da77ae53e47173264ff0c2c`
records **81 accepted opt-in Rust mappings, 841 unmapped names, 922 open
logical default-route gaps, and zero retired rows**. R8
integration, full contract coverage, the remaining gaps, merge, and release
remain open.

For CSV retirement, combine the existing 14-case predecessor and 18-case
adversarial host corpus with the new per-case Rust-call and reference-route
controls. Add explicit String Field, map cardinality, old core version,
unsupported token classes, missing/null/wrong-type token, changed and forged
receipt components, and an independently qualified Record API case that keeps
present-null distinct from absent without inserting a default. The historical
`inputByteLimit` exact-boundary fixture omitted the required token, so its
exact-size branch currently proves request-shape refusal rather than the
4,000,000-byte boundary; repair that fixture before claiming the limit. Replay
the completed acceptance set against both fixed-point archive cohorts in Node,
Bun, and Chromium, recording default/reference outcomes, traces, and Rust-call
counts. Repeat equivalent contract-acceptance review for the Relationship and
Inspector packets before defining a retirement schema.

### R8 d5 fixed-point installed archive checkpoint — 2026-10-27

The [d5 macOS arm64 cohort](evidence/rust-migration/r8-bounded-route-d5e1783d/README.md)
pins private SDK archive SHA-256
`7105a7f69118367cefe1e156481a6e3c85bad49c63157f1956f85dcef52383e2`
and fixed-point source closure SHA-256
`d5e1783d7f615c8c1877df4f3d9ded43e68039f6b8f4d307e13ea79c190fa8f9`
(3,529 inputs, zero generated transforms, 1,803 regular archive members).
Its 27 raw default/reference route receipts pass the four Relationship,
three Inspector, and two CSV Boolean bounded packets in Node 26.12.1, Bun
1.4.3, and Chromium 153.0.8010.12. The complete installed SDK harness
passed on the same archive, including 31 R3 cases and missing/corrupt native
and WASM refusals. The installed 68-case security truth-fold replay passed
30 valid Rust/WASM invocations per host with zero refusal and reference-route
calls. The full installed and security receipts are retained in that bundle.

The separate [Core Cardinality diagnostic](evidence/rust-migration/r8-core-cardinality-d5e1783d/README.md)
passes the trio's existing frozen installed replay on this archive in all
three hosts, including admission order, Proxy traces, error identity and
browser WASM loading. The Cardinality binder still performs TypeScript
`copyJson` admission before Rust. These macOS receipts qualify only their
frozen subsets on the d5 source snapshot. The Linux x64 archive, combined
hosted matrix, full contract acceptance, remaining 922 logical retirement
gaps, integration, and release remain open. Later source edits require a new
fixed-point archive before a current-source claim.

The [Compact Dataset diagnostic](evidence/rust-migration/r8-compact-dataset-installed/d5e1783d-20261027/README.md)
also passed its 17 frozen `validateCoreDatasetValuesCompact` cases on that
archive in Node, Bun, and Chromium, including admission and Proxy traces,
detached copies, work limits, and the paired 349/350 boundary. It does not
exercise `verifyCoreDatasetValuesCompact`; that operation's cumulative
`ValueWork` parity remains open. The Core Facets current-source route gate
still needs a fresh source-coherent capture because its historical receipt
pins an older `bindings/core/node/index.d.ts` hash.

The [expanded CSV Boolean acceptance packet](evidence/rust-migration/r8-csv-boolean-default-retirement-replay/README.md)
now freezes 44 validation, 17 verification, and two separate TypeScript-only
Record presence cases. It repairs the exact input boundary with a present but
unsupported token: 4,000,000 serialized bytes reach request validation,
while 4,000,001 reach the Rust input limit. Paired exact and over-limit receipt
budgets are also frozen. Diagnostic replay of the expanded packets passed in
Node, Bun, and Chromium against the d5 archive with zero reference-route
Rust calls, but the archive predates the expanded packets and harnesses. The
Record cases preserve present-null versus absent without inserting a default;
they are TypeScript-only in the d5 and 97e archive cohorts and are excluded
from the two-operation CSV Rust retirement manifest. A fresh fixed-point archive and both
hosted cohorts must replay these exact packet hashes before current-source
qualification.

### R8 97e fixed-point archive and new V4 source selections — 2026-10-27

The [97e macOS arm64 cohort](evidence/rust-migration/r8-bounded-route-97e2325e/README.md)
pins the private archive SHA-256
`ff89d87351b29e9762ac5bd76370944c437a1827e8dc5c32ede2fc53b8e2591a`
and fixed-point source closure SHA-256
`97e2325ecc8c630e13914027a2ca0f161f109843cb566faad0bf2fc96d254613`
(3,530 inputs, zero generated transforms, 1,803 regular members). Its 27
bounded default/reference receipts include the expanded CSV packet and pass
in Node 26.12.1, Bun 1.4.3, and Chromium 153.0.8010.12. The full installed
SDK and 68-case security truth-fold suites pass on that same archive. This
snapshot predates the following Record Values and Semantic Types V4 edits.

`validateCoreRecordValues` now selects the existing raw-input Rust host engine
through the V4 Node/Bun and browser roots. The tagged-wire model route is not
used for this boundary. The source-root Bun replay passes all 24 frozen R5
cases and host admission, while a fresh-WASM Chromium source replay passes the
same 24 cases and two accessor preflights with no getter invocation or Node
globals. The function remains synchronous with its predecessor name and arity.
An installed Node/Bun/Chromium replay on a new archive, full CONTRACT-049
acceptance, and two-platform qualification remain open. The strict access
boundary checker scans every `src/access` file and grants this binder only
type imports from the predecessor; negative tests reject a value import,
cross-file grant reuse, dynamic imports, and host hooks.

The V4 roots also select `SemanticTypeRegistry`,
`validateSemanticTypeValue`, and `validateCoreSemanticTypeValue` through the
Rust semantic value engine. A default-profile adapter restores the exported
class, fluent instance identity, and two-argument callback with a stable
entry-shaped receiver; the opt-in three-argument `reportWork` profile remains
separate. Source-root tests compare direct results, refusals, aggregate
ordering, callback receiver/mutation and lookup with the TypeScript
predecessor. The native Node/Bun tests pass 10 cases, and a real Chromium
WASM replay passes callback arity/receiver and existing core controls.
Installed-package default-route evidence, broader CONTRACT-078 acceptance,
and hard isolation of trusted callbacks remain open. Both new selections
require a fresh fixed-point archive and paired macOS arm64/Linux x64 cohorts.

The hosted bounded matrix attempted the 97e PR snapshot but Linux typecheck
ran before generated WASM bindings existed. The workflow now builds those
bindings before typechecking. That failed attempt is not cohort evidence;
rerun both hosts on the next pushed source snapshot. Core Facets gained a
focused facade regression control for request/receipt admission order and
public Rust-error translation; no source fix was needed.

The [current R8 inventory and ledger](evidence/rust-migration/r8-symbol-inventory/README.md)
were regenerated after the four explicit V4 exports. They show 52
source-selected declarations in each default root, 81 accepted opt-in Rust
mappings, 841 unmapped executable names, **922 open logical gaps and zero
retired rows**. Exact normalization for the new root declaration shapes has
source/kind/initializer drift controls. The
[Security And/Or source replay](evidence/rust-migration/r8-security-and-or-v4-source-replay-current/README.md)
was rebuilt and passed its 68 cases in Node, Bun and Chromium against the
current roots, preserving the earlier receipts. This is source evidence only;
it does not satisfy installed acceptance or release gates.

### R8 4547 fixed-point archive and installed value routes — 2026-10-27

The new private macOS arm64 SDK archive has SHA-256
`5f3dccf215b0c1d631d2534946f8305ce6e1bef2d6a10477992a3aa4b4faf599`
and exact live/source closure SHA-256
`4547d877ea7ac3b5e7bfb2101ae80833257c19ae7ba825cf884bc05c666a49b3`.
The builder reported zero generated-source transforms after regenerating the
metamodel manifest and action plan identity. The nine archive integrity tests
pass. The broad installed SDK replay and hosted Linux x64/macOS arm64 matrix
are still separate gates; this archive is private and non-publishable.

The [installed Record Values replay](evidence/rust-migration/r5-record-values/installed-v4/README.md)
matches all 24 frozen cases in Node 26.12.1 and Chromium 153.0.8010.12.
The default path enters the packaged Rust addon/WASM bridge 29 times per host,
including five admission cases; the explicit `./reference` path enters it zero
times. Accessors remain unread, refusal order matches, and the browser fetches
WASM without Node globals. The [installed Semantic Types replay](evidence/rust-migration/r5-semantic-value/README.md)
passes under Node 26.12.1 and Bun 1.4.3, each with real Chromium
153.0.8010.12. It covers ten frozen registration cases, callback arity and
receiver, fluent identity, aggregate dispatch, and document refusal before
callback execution. Its isolated archive package links dependencies from the
repository's pinned `node_modules`; it does not claim dependency installation
from an independent offline cache.

The hosted Linux run for the preceding `ac153de4` snapshot failed because its
generated V4 facade was stale. That facade now passes local generation check,
typecheck, and a zero-transform SDK build. The separate access workflow had a
job-level `runner.temp` expression that prevented job creation; its Cargo
target setup now uses the runner environment in a step, with a focused
installed-inventory negative control. CI confirmation on the next pushed
snapshot remains necessary. The R8 ledger still counts **922 open executable
default-route gaps and zero retired**. Neither these bounded installed routes
nor the Python V8-free source audit closes full-port, two-platform release, or
retirement requirements.

### R8 b141 fixed-point source and qualification checkpoint — 2026-10-27

The four Core Semantic Types metadata operations (`inspect`, `get`, `declare`,
and `verify` declaration) now select the Rust model engine through both V4
roots. Their 16-case frozen predecessor replay passed Bun and bundled Node
source routes and real Chromium after rebuilding browser WASM from the same
source. The [R5 evidence](evidence/rust-migration/r5-core-semantic-types/README.md)
also records installed Node 26.12.1, Bun 1.4.3, and Chromium 153.0.8010.12
replays on the private `b14148f1` archive. Those tests cover the selected
operations and packet, including unknown qualifier preservation; they do not
close CONTRACT-078, allocation limits, or logical retirement.

The new private macOS arm64 SDK archive is SHA-256
`372f4c9d91202d904e1a1c736389563d0b023d9bf0fb9a6858e9ed902aa688ad`,
with live/source closure
`b14148f15a6a3a77864c42e305857a6abb6e0b700aa21a797ed21b0751f97f9c`
and zero generated transforms. Nine archive integrity tests and the
[full installed SDK qualification](evidence/rust-migration/r8-bounded-route-b14148f1/README.md)
pass locally on macOS arm64 across Node, Bun, and Chromium, including the R3
replay and missing/corrupt native and WASM refusals. The updated R8 census
records 56 source-selected declarations in each V4 root, 81 accepted opt-in
operation mappings, 841 unmapped names, **922 open logical gaps and zero
retired rows**. Its current inventory SHA-256 is
`0482d81255965c75d444c44f1b12749bbcfea242dc9538fe734d937b6a1bc6c6`;
ledger SHA-256 is
`eb7a63c33e673e7101a1f9969df3ce5ec0374554a5ad55e9252183d983cdcdc7`.
All 61 ledger tests pass. The 68-case Security And/Or source replay passes in
Node, Bun, and Chromium on the refreshed V4 roots. The installed replay
harness now resolves real paths before comparing package module identity, so
macOS `/var` and `/private/var` aliases cannot cause a false mismatch. The
[focused installed replay](evidence/rust-migration/r8-security-and-or-installed-b14148f1/README.md)
passes all 68 cases in Node, Bun, and Chromium on the b141 archive, with 30
valid Rust/WASM calls per host and zero refusal or reference-route calls. The
broad installed SDK replay also passes for this b141 archive. This archive
predates the later Compact Dataset verifier source selection.

The [historical 4547 Inspector installed receipts](evidence/rust-migration/r8-inspectors-default-retirement-replay/current-4547-20261027/README.md)
preserve bounded Node/Bun/Chromium results against that exact earlier archive.
Linux x64, full CONTRACT-040 acceptance, and current-source callsite review
remain open. No Inspector route is retired on this evidence.

The coordinated Python release-pair verifier now compares every declared
`umf-codegen` sdist build input and its bytes against the current checkout,
including Hatch's root `.gitignore`, before rebuilding a wheel. Its receipt
records 24 input hashes for the current offline sdist. It rejects unexpected
nested `PKG-INFO` files and package-source symlinks rather than silently
omitting them. The focused pair and six-cohort matrix tests pass (31 cases).
A source-coherent hosted release
matrix and publication remain open. The hosted Rust SDK Linux job on `ffb7cb34d`
failed before building the private snapshot because Cargo offline resolution
had not fetched `regress`; the workflow now prefetches locked Rust
dependencies before the offline snapshot. Both hosted platform results must
be rerun after this workflow change.

Independent Core Key tuple review found that the direct native/WASM raw-byte
and retained prepared-object interface described as pending in the older
checkpoint above is already implemented. The current focused Rust core suite
passes 5/5, wire suite 7/7, and Node/Bun suite 21/21 with 334 assertions.
An older installed Node replay matches 87 in-profile encoder and five verifier
outcomes, including 100,001-byte and 4,000,000-byte reads, receipt-before-
current order, and prepared-source isolation. Those receipts predate changed
core-wire and entrypoint files. A current integrated browser replay and
resolution or explicit contract bounding of one unsafe JavaScript Number
refusal-path difference are required before default selection. The direct
tuple route therefore remains opt-in in this source snapshot.

### R8 Compact Dataset verifier source selection — 2026-10-27

`verifyCoreDatasetValuesCompact` now selects the existing staged Rust verifier
from both V4 default roots. The receipt-only preparation call preserves
malformed-receipt refusal before reading `current` or `expectedInput`. The
[five-case frozen source replay](evidence/rust-migration/r8-compact-dataset-verify-source/README.md)
passes in Node 26.3.0, Bun 1.4.3, and real Chromium 153.0.8010.12, comparing
complete predecessor results/refusals and host traces. It includes the adjacent
267-record acceptance at 997,426 ValueWork units and 268-record refusal at
1,000,000 units, stale source, copy limits, and caller Proxy error identity.
The focused tests pass 28/28, V4 facade tests 4/4, and typecheck and unified
client boundaries pass. Installed archive and complete CONTRACT-056 acceptance
are separate gates; no declaration is retired.

The current [R8 inventory and ledger](evidence/rust-migration/r8-symbol-inventory/README.md)
record 57 source-selected declarations per Node/browser default root and 114
total, with **922 open logical gaps, zero retired**, 81 accepted opt-in Rust
operation mappings, and 841 unmapped names. Inventory SHA-256 is
`5a901c4943624f6bb69759fa7ba4eadea0cb0a0519549898d168df69dc80cc6d`;
ledger SHA-256 is
`acb59e438db95a0344dccf58b9fc7d6d3a04c75e522a15da1d2a2eefaac66344`.
The full ledger suite and fixed-point `--check` pass. The refreshed Security
And/Or source replay still passes 68 cases and 30 Rust/WASM calls per host in
Node, Bun, and Chromium on these same V4 roots.

A private fixed-point macOS arm64 SDK archive containing this verifier route
has SHA-256
`242336e7d6d1ea88434b31fcb908f47b4522f021690ccb55b95ccbc27c8dac50`
and live/source closure
`bdb716aa53ab9c45f058266534580bd59d50b725de77ce3dd07b156fba68dbd1`,
with zero generated transforms and nine passing package integrity tests.
Focused installed verifier replay and full installed SDK qualification for
this exact archive remain open. The newer installed verifier harness itself
must be included in a later fixed-point source closure before a source-coherent
installed claim.

### R8 tagged-wire paths and bounded qualification — 2026-10-27

The shared tagged-wire decoder now propagates exact UTF-16 JSON Pointer
segments through object and array traversal, including `~` and `/` escapes
and lone-surrogate keys. This corrects the nested unsafe-Number Core Key tuple
refusal from `/0` to `/0/integerToken` without changing the separate generic
host-admission path. The focused tagged-wire tests pass 3/3; the rebuilt Node
tuple suite passes 21/21 with 334 assertions; the Rust core-wire tuple packet
passes 7/7; the cardinality route test passes 2/2. Integrated installed
Node/Bun/Chromium tuple replay and full CONTRACT-040 acceptance remain open.

The [Compact Dataset verifier source replay](evidence/rust-migration/r8-compact-dataset-verify-source/README.md)
was rebuilt after that decoder change. Its three-host source closure now pins
the tagged-wire source and replay harness at
`a41732bdf6dcedab8ad17ce1cafb88e02c52cc2486ec6e4362156d95e6e07dcb`;
all five frozen cases still pass in Node, Bun, and Chromium. The
[Security And/Or source replay](evidence/rust-migration/r8-security-and-or-v4-source-replay-current/README.md)
likewise passes all 68 cases and 30 Rust/WASM calls per host on its refreshed
22-file closure
`5cf945fe2dd4c4fbc3eef536723e477c32c9ba9076f86b83cf11d73131a4fe9c`.
The [installed Compact verifier diagnostic](evidence/rust-migration/r8-compact-dataset-verify-installed-diagnostic/README.md)
matches all five frozen cases and host controls in Node 26.12.1, Bun 1.4.3,
and Chromium 153.0.8010.12 on the earlier `bdb716aa` archive. Each case has
zero `./reference` Rust calls and two default native/WASM calls. That archive
predates the harness, so the result is diagnostic only. The SDK source
snapshot now includes the harness and six frozen packet files; a newly built
zero-transform archive and same-archive replay are required for fixed-point
installed qualification.

The [raw-host `readJsonValue` probe](evidence/rust-migration/r8-read-json-value-raw-host-probe/README.md)
blocks default source selection. Existing default and `./reference` routes
match across eleven Node/Bun cases, but the direct Rust candidate mismatches
eight text-admission cases, including a throwing `length` getter's object
identity and Proxy access order. A browser probe did not initialize WASM and
makes no browser parity claim. Keep `readJsonValue`, `copyJson`,
`writeJsonValue`, and `assertExactJsonNumber` on their current default routes
until raw-host behavior has a proved Rust-owned admission design.

The [local Python release-pair attempt](evidence/rust-migration/r8-python-local-pair-check-20261027/README.md)
passes 91 focused gate tests and a current-source codegen sdist comparison of
all 24 build inputs. Its core rebuild preserved non-native payload but produced
different native extension bytes, and installed-pair qualification stopped
before installation because pinned `pydantic==2.11.9` was unavailable in the
local cache without network access. The six hosted Python cohorts, package
publication, and complete Rust port remain open. The latest regenerated R8
ledger still has **922 logical default-route gaps, zero retired**.

Independent Sol review found that the four Core Semantic Types rows lacked
immutable three-host receipts and build-time source pins for their 16-case
source replay. The R8 ledger now records those operations as Rust-selected by
the current V4 route but **unqualified on the current source**; the earlier
16-case and b141 installed receipts remain historical, bounded evidence. The
Compact verifier source replay is being strengthened to bind its build-time
source and artifact hashes before further current-source claims.

The rebuilt private macOS arm64 SDK is now a zero-transform fixed point:
archive SHA-256
`01b15705bb1fcdc30814de4740cda352a23d5bc28dece3a60da9ffddf680504d`,
live/source closure
`8a105dd69a5e42001250cd5e6063ed8c2721e844408389b8f5d5b561abedcdf7`,
and 1,805 archive members. All nine archive integrity tests pass. The
[source-coherent installed Compact verifier replay](evidence/rust-migration/r8-compact-dataset-verify-installed-8a105dd6/README.md)
matches all five frozen cases and host controls in installed Node 26.12.1,
Bun 1.4.3, and Chromium 153.0.8010.12; each default case makes exactly two
Rust/WASM calls and each explicit reference case makes zero. The archive's
source manifest pins the exact harness and six frozen packet files, and the
harness verifies those bytes and explicit archive/closure hashes. The
[full installed SDK suite](evidence/rust-migration/r8-full-sdk-8a105dd6/README.md)
subsequently passed on this historical archive; this bounded qualification
still leaves the 922 logical retirement gaps, Linux x64, and release matrix
open.

The `8a105dd6` archive is a fixed point for its captured source only. A later
metamodel refreeze changed two source pins in the compact verifier packet index,
and Sol review identified a source replay gap: host receipts could have used
stale compiled artifacts while naming current source files. The refreshed
[compact source replay](evidence/rust-migration/r8-compact-dataset-verify-source/README.md)
now binds one immutable build manifest (SHA-256
`c796428db9fe36b3215057187d569d5adddefb237b9b917d0c9bab8acf6515b0`)
to the exact source closure and six compiled artifacts, verifies it before
each host replay, and passes the same five frozen cases in Node, Bun and real
Chromium. All five frozen result payloads remain byte-identical; the old index
is retained. The gap ledger checks this manifest and rejects altered source,
artifact or manifest bindings. Its current SHA-256 is
`bec39f2da2ff8d2078285a5f5e13c476521ffe2ef60ad4e5967f2bdb0025d4b5`;
it still has **922 open logical gaps and zero retired**. A new archive and
installed replay against these refreshed inputs are required before the
current-source installed Compact verifier claim can be renewed.

The [raw-host `readJsonValue` Rust prototype](evidence/rust-migration/r8-read-json-value-raw-host-prototype/README.md)
matches eleven TypeScript host cases in Node 26.12.1, Bun 1.4.3 and Chromium
153, with one native/WASM call per case. It handles the observed length-getter
and Proxy order that blocked the earlier direct candidate. Production routing
remains open: preserve raw host source through the binding, prove exact
UTF-16/error/resource behavior at the facade, and qualify an installed SDK
archive before source selection or retirement. This prototype alone does not
upgrade any of the 922 ledger gaps.

An [instrumented replay](evidence/rust-migration/r8-core-key-tuple-installed-8a105dd6/README.md)
of the `8a105dd6` installed SDK found a Core Key
tuple routing gap. The public package-root encoder and verifier match the
frozen TypeScript cases, but Node and Bun make zero calls to the direct
`CoreKeyTupleRuntime`, and Chromium records only generic Core Key verifier
and Record Type verifier WASM exports, with zero tuple export calls. The
package root also does not expose the direct model-engine factory. Therefore
the parity replay does **not** qualify public default-root tuple execution as
Rust-owned. A 4,000,000-byte tuple also diverges between Node's stack overflow
and Bun's `KEY_TUPLE_RESULT` refusal; 4,000,001 bytes returns the expected
limit on both. Keep direct tuple ownership opt-in and default selection held
until route instrumentation and this host boundary are resolved. The archived
receipt is source-pinned to `8a105dd6` and cannot qualify a newer SDK.

### R8 fixed-point source and release-pair checkpoint — 2026-10-27

Independent Sol review found two defects in the pending source cohort. The
Core Semantic Types V4 Rust wrapper preserved runtime results but weakened
the public TypeScript signatures; it now exposes the four predecessor
`Document`, identity, reference, inspection and declaration types through
type-only imports. The strict per-file unified-client boundary policy forbids
executable predecessor imports and includes negative controls. The Security
And/Or source replay's `--build` command now delegates to the shared
manifest-producing builder; a fresh-directory build smoke passed. Both fixes
passed focused tests and typecheck before a new source cohort was captured.

The action-identity generator then revealed one stale generated source. It
was run canonically in the live worktree and its `--check` passes; the
generated `src/extensions/actions/plan-identity.ts` SHA-256 is
`525e20080bdcc27588dbf46064a74f8e5c4ac1f44adf5db775068e089acabc8e`.
Earlier source receipts are retained as historical cohorts. The current
[Compact verifier source replay](evidence/rust-migration/r8-compact-dataset-verify-source/README.md),
[Security And/Or source replay](evidence/rust-migration/r8-security-and-or-v4-source-replay-current/README.md),
and [Core Semantic Types public-error replay](evidence/rust-migration/r8-core-semantic-types-public-error-source-20261027/README.md)
use a single fresh source build manifest, SHA-256
`4d25c856fdac60bd5e0ae9c0bf7ac9afeda235251c13c05f313e3c6da96e5f3e`,
with expanded source-closure SHA-256
`2f83e19ace175ceb538d0b7aba94926a41a868c3af4ad87d52d73a996b88fd31`.
Node, Bun and real Chromium pass the bounded five-case Compact and 68-case
Security packets with Rust/WASM dispatch; the semantic-type 16-case source
replay passes in all three hosts with public `UmfError` identity. These are
bounded source-route claims, not complete operation parity or retirement.

The private SDK builder then produced a **zero-transform fixed point** with
source closure
`499d13c2e4a4a2373eea763ab3fe359861fb1218a24ae030bddf4f405bf18df5`,
1,806 archive members, and archive SHA-256
`5ec44a154649cc0ddfd17279f9d686f7f87bcc92277ff113721c45d6173b4f89`.
All nine archive integrity tests pass. The
[installed Security And/Or packet](evidence/rust-migration/r8-security-and-or-installed-499d13c2/README.md)
matched 68 cases in Node, Bun and Chromium in the supplied extracted tree,
but independent review found that its runner did not prove that tree matched
the named archive and mislabeled Bun's version as Node's. Treat that receipt
as diagnostic pending an archive/member-bound replay. Full
installed SDK replay runs separately. The
[installed Compact verifier packet](evidence/rust-migration/r8-compact-dataset-verify-installed-499d13c2/README.md)
also passes all five frozen cases and host controls on the archive, with zero
reference and two default native/WASM calls per case. These bounded installed
packets do not qualify the full SDK or release. The regenerated R8 ledger SHA-256 is
`553a4924258b04d04e4f561138cc4c509910a9f4c00d545b1e617590c104426a`;
its 62-case suite and `--check` pass. It still records **922 open logical
default-route gaps, zero retired**, and conservatively keeps Core Semantic
Types current-route unqualified until its new three-host evidence has a
dedicated immutable ledger gate.

The [current Python release pair](evidence/rust-migration/r8-python-pair-current-metamodel-20261027/README.md)
now rebuilds fresh core and codegen wheels/sdists from refreshed canonical
resource mirrors. The installed pair verifier passes import, generation,
CLI and the 24-input codegen sdist check; an isolated macOS arm64 /
CPython 3.11.17 cohort with Pydantic 2.11.9 passes 217 installed tests.
This is one local cohort. The hosted Linux/macOS × CPython 3.11/3.12/3.13
matrix and aggregate release gate remain open.

For the next `readJsonValue` slice, retain the TypeScript default until the
production binding accepts the original raw JS source without pre-encoding,
preserves JSON-mode coercion and two-read host order, uses the 4,000,000
UTF-16-unit text limit, transports lone-surrogate keys and values losslessly,
maps native and Rust failures to the exact public classes, and carries one
`Context` budget through extraction, parsing and reconstruction. Expand the
frozen differential packet to include non-string explicit-JSON coercion,
stateful getters and Proxies, 3,999,999/4,000,000/4,000,001-unit limits,
isolated surrogates, and cancellation/deadline/meter failures before a
source-selected route or installed acceptance claim. The eleven-case
raw-host prototype is insufficient for default selection.

The [expanded raw-host `readJsonValue` oracle](evidence/rust-migration/r8-read-json-value-expanded-oracle-20261027/README.md) records 22/22 TypeScript reference/default matches on Node and Bun, while the N-API prototype differs on 16/22 Node and 18/22 Bun cases. It confirms that JSON-mode coercion and stateful host operations, the 4,000,000 UTF-16-unit boundary, and error-envelope parity remain production gates; the lone-surrogate cases pass only within this bounded N-API cohort. The run makes no WASM or browser claim and does not change source selection. Next, adapt Rust-owned admission to preserve the exact raw host operations and exception behavior, then prove the full bounded limit/coercion/error/resource matrix in the production facade and a zero-transform installed SDK replay before reconsidering the TypeScript default.

### R8 fixed-point installed checkpoint — 2026-10-27

The zero-transform `ef9f20c8` SDK archive has SHA-256
`3302afe1837647344b6fa08606f31cc61a88637d3897f15feb6cb218c01c4046`, source
closure SHA-256
`ef9f20c85e220651590552b94e92da0743d02f5a97446b1e2f51f5781e244ecb`, and
manifest SHA-256
`a3317d5edd5a3971904899f14f1050b441b029dfd9ee0bafeecaaecd643d17ab`. Its
[installed Compact verifier replay](evidence/rust-migration/r8-compact-dataset-verify-installed-ef9f20c8/README.md)
qualified five frozen cases and host controls on Node 26.12.1, Bun 1.4.3,
and Chromium 153.0.8010.12: every reference route made zero native/WASM calls
and every default route made two per case. Its
[installed Security And/Or replay](evidence/rust-migration/r8-security-and-or-installed-ef9f20c8/README.md)
qualified the bounded 68-case packet on the same archive and hosts, with 30
valid default Rust/WASM calls and zero refusal, reference, or unattributed
calls per host. The Security receipt also binds the complete installed file
inventory to the archive and records archive-payload, altered-installation,
and extra-file rejection controls.

The [full installed SDK replay](evidence/rust-migration/r8-full-sdk-ef9f20c8/README.md)
also passed on this private macOS arm64 cohort: 31 R3 cases, all installed
controls, and the broader runtime and export checks recorded in its receipt;
the suite completed in 1,133,333 ms. This confirms the archive-wide installed
test suite for this cohort, while the Compact and Security receipts retain
their narrower packet-specific claims. These runs do not close all acceptance
criteria. The R8 ledger still records **922 open logical default-route gaps,
zero retired**. There is no release qualification or release claim.

The final R8 ledger was regenerated after the archive-payload verifier change.
Its SHA-256 is
`4b09f83b44faa7c8c744f6520712f65832f3f1d5f8a1c3dd7576751e4df4a32b`;
the sole delta from the preceding ledger is the installed Security replay
script hash in the script census. Its 922 gaps and zero retirements are
unchanged.

The [improved raw-host `readJsonValue` N-API spike](evidence/rust-migration/r8-read-json-value-improved-raw-host-20261027/README.md) matches all 22 reference/default cases on Node 26.12.1 and Bun 1.4.3, including the tested coercion order, two `length` reads, 4,000,000 UTF-16-unit boundary and lone-surrogate results. This remains a bounded N-API prototype: WASM/browser behavior, general inputs, Context controls, production facade integration and installed SDK qualification are open. Keep the TypeScript default selected until those gates pass.

A supplemental 39-case `readJsonValue` falsy-input packet now matches the TypeScript reference/default and temporary raw-host N-API candidate on Node 26.12.1 and Bun 1.4.3, including `NaN`, `0n`, signed zero, and other falsy/truthy non-string inputs ([evidence](evidence/rust-migration/r8-read-json-value-falsy-expansion-20261027/README.md)). This remains a scoped host-runtime spike: no WASM/browser claim or default-route selection follows. Open gates include isolated-surrogate error-path preservation, output object shape/prototype validation, thrown-value identity during length/coercion, Context shared-ledger metering for host JSON preflight, and complete transitive source closure; general inputs, production facade, and installed SDK qualification also remain open.

The proposed production binding boundary is documented in the [ordinary-profile Rust interface proposal](evidence/rust-migration/r8-read-json-value-production-interface-proposal-20261027/README.md). Initial scope is private Rust sequencing over an opaque raw host handle, one Context, exact UTF-16 success/error transport, null-prototype result checks, and direct shape/error-identity acceptance in Node/Bun before WASM/Chromium. The second length read supplies YAML's `endOffset` during compose third-argument evaluation before the generator body, without coercion; its access remains observable. The YAML lexer accepts primitive strings unchanged, treats falsy nonstrings as an empty stream, and throws `TypeError` for truthy nonstrings. Catalog JSON stays TypeScript-selected pending a separate design for raw scanner reads and dynamic JSON.parse lookup. Host JSON.parse remains synchronous and opaque: shared Context checkpoints cannot guarantee hard bounds or interruption, and the first raw length may be small before a large coercion. No source route/default change is authorized; fresh source closure and installed replay remain later gates.

### R8 ordinary readJsonValue acceptance freeze — 2026-10-27

The [59-case ordinary-profile packet](evidence/rust-migration/r8-read-json-value-ordinary-20261027/README.md)
matches the TypeScript reference and default source routes on Node 26.12.1
and Bun 1.4.3. It directly compares result prototypes, own keys and
descriptors, error fields, thrown-value identity and ordered host traces.
It includes nonstring coercion, live JSON.parse, stateful length reads,
UTF-16 boundaries, lone surrogates, and inherited-setter controls. It is a
baseline, not a Rust or browser parity receipt.

An explicit dedicated-entry Rust N-API slice for primitive-string ordinary inputs is
under qualification. Keep all 59 baseline cases in the acceptance packet,
including cases outside that bounded slice; record supported cases and
mismatches separately. The [18-case dedicated-entry replay](evidence/rust-migration/r8-read-json-value-ordinary-20261027/package-parity.md)
matches 15 cases on each of Node and Bun and retains three blockers: valid
JSON duplicate keys produce different public diagnostics; an inherited array
index setter has a different observable call count; and a live `JSON.parse`
override accepting malformed input exposes Rust's extra native JSON preflight.
Repair and rerun exact parity before extending source selection. The
general raw-host handle, controls across host callbacks, catalog profile,
WASM/Chromium binding, installed SDK replay, and default-route change remain
open. The default Node/browser package roots retain their prior export shape.
Hosted SDK and six-cohort Python jobs at the fixed-point checkpoint
were queued when this note was written; no hosted pass is claimed.

After adding this opt-in seam, the earlier source-bound Compact and Security
receipts were made historical and replayed on one current immutable build.
The generated action-plan producer identity and metamodel manifest were
refreshed to a fixed point before that build; the interim pre-identity replay
is also retained as historical evidence.
The [source manifest for that checkpoint](evidence/rust-migration/r8-compact-dataset-verify-source/build-manifest.json)
has SHA-256 `9d70a420cc76a308bd42d3984993bc616919e718f3073bceb332822625b363cc`
and closure `d0d54682e6bc91b1eaa31d55d2b425b0bfbe706b6e2fe3be966422cccd2cc264`.
The five-case Compact and 68-case Security packets pass Node 26.12.1, Bun
1.4.3 and real Chromium 153.0.8010.12 against that build. The recaptured
[R8 ledger](evidence/rust-migration/r8-symbol-inventory/README.md) has
SHA-256 `8c22bcd000582fc48dc29345fe0c6f631e132b6a1bb033e08494908c0ee6fb1c`
and still counts 922 open logical default-route gaps, zero retired.
The prior `ef9f20c8` installed archive qualifies its captured earlier source;
the current source needs a new zero-transform installed archive before any
installed or release claim.

Next, make the TypeScript-order JSON path honor the predecessor's successful
live preflight by entering YAML parsing without a second native JSON syntax
gate; verify duplicate diagnostics and a modified live parser against the
frozen oracle before accepting that repair. Separately trace the YAML
parser's inherited-array-setter calls and their throw/order behavior; do not
paper over them with a post-parse callback count. Then move raw-source
length/coercion/throw handles and frame reconstruction under the reviewed
single-Context host protocol, qualify the same semantics in WASM/Chromium,
and only consider default selection after an installed fixed-point replay.

The strict unified-client boundary policy still scans every direct
`src/access/*.ts` source and requires an exact per-file import grant; dynamic
imports, disallowed predecessor value imports, and host hooks remain rejected.
The checker now also rejects parser-recovered malformed TypeScript and runtime
global escape hatches (`globalThis`, Deno, workers, and `importScripts`). The
focused boundary suite passes 18 tests and the full directory checker passes.
This is static boundary evidence only; it does not change Rust route selection
or qualify runtime behavior.

### R8 ordinary diagnostic and private host continuation — 2026-10-27

The [current dedicated-entry repair](evidence/rust-migration/r8-read-json-value-ordinary-rust-repair-20261027/README.md)
matches **17/18** primitive-string cases on Node 26.12.1 and Bun 1.4.3. The
Rust continuation now honors the successful live `JSON.parse` preflight and
matches the [40-case diagnostic source oracle](evidence/rust-migration/r8-read-json-value-ordinary-diagnostic-source-oracle-20261027/README.md):
21 returned value trees and 19 exact error code/path/message triples. Its
diagnostic mapping is restricted to the TypeScript YAML 1.2 profile; the
24-test serialization unit suite and a low-work malformed-input control pass.
The dedicated entry still differs when `Array.prototype[0]` has an inherited
setter. The [52-case source-only setter oracle](evidence/rust-migration/r8-read-json-value-inherited-setter-source-oracle-20261027/README.md)
proves parser-phase counts, throw boundaries and receiver mutations vary with
input. Do not synthesize a callback count after parsing or qualify the public
route from the 17/18 sample.

The [private raw-host protocol checkpoint](evidence/rust-migration/r8-read-json-value-private-host-adapter-20261027/README.md)
adds Rust-owned acquisition order through one `Context` and a test-only N-API
dispatcher with opaque thrown-value tokens and UTF-16 error frames. Seven
Rust fake-host tests and seven Node tests using the compiled addon pass. It
does not reconstruct the public result/`UmfError` graph, meter opaque host
work, accept caller controls, or prove stale/reentrant handle safety. Catalog
mode remains TypeScript-selected; its [15-case source oracle](evidence/rust-migration/r8-read-json-value-catalog-source-oracle-20261027/README.md)
is a baseline only. Finish those production interfaces, causal parser-setter
behavior, general raw-host parity, WASM/Chromium and installed SDK replay
before any default-route selection or ledger retirement.

The preceding source manifest and ledger are historical after this Rust source
change. Refresh one immutable source build, replay Compact and Security against
it, then recapture the inventory and ledger. A new zero-transform installed
archive must qualify this exact source cohort. The last confirmed ledger had
**922 open logical default-route gaps and zero retired**; no new retirement
claim follows from these bounded opt-in packets. The owner has also directed
that macOS CI must not run. Local evidence and buildable macOS artifacts may be
retained, but cancelled or unrun macOS CI cells cannot be treated as passes.

### R8 current-index source and Linux-only qualification checkpoint — 2026-10-27

The frozen Compact verifier packet now has a separate
[`index-current.json`](evidence/rust-migration/r8-compact-dataset-verify-source/index-current.json)
for regenerated schema provenance. All five case payloads are byte-identical
to the historical index. The [current Compact receipts](evidence/rust-migration/r8-compact-dataset-verify-source/README.md)
and [Security receipts](evidence/rust-migration/r8-security-and-or-v4-source-replay-current/README.md)
bind one immutable 1,958-file source closure
`fe21235aaf399b3adf616ef5ce4d6c9a91cafe75dd1b5e1ed22b084d63edb832`
and manifest `2d204008769e77edbb8d4c78eee7cac2d589957dd9441f9f62303f0996b84cf3`.
Compact passes all five cases on Node 26.12.1, Bun 1.4.3 and real Chromium
153.0.8010.12; Security passes all 68 cases on each host with 30 valid Rust
or WASM calls and zero refusal calls. These are source-route cohorts, not
installed SDK or release qualification.

The [regenerated inventory and ledger](evidence/rust-migration/r8-symbol-inventory/README.md)
have SHA-256 values `017d33882125f9e6df005515040bc87fa60f0659cab76610090a3a4c9a7059ea`
and `821fe5501fe5fa3bfaf8c491b623d8e5b0b3094579025ffcfac534b8575c4e21`.
They retain **922 open logical executable default-route gaps, zero retired**,
81 accepted opt-in mappings, 841 unmapped names and five proven bounded
binding routes. The Rust core library suite passed 471 tests before the BOM
offset repair; its updated serialization module passed 25 tests, including
the BOM regression. The 26 focused ordinary-facade and strict-import tests,
the Rust boundary checker (zero V8 debt), TypeScript typecheck, and 54 Python
coordinated-release verifier tests passed locally.

All current branch workflow runner selections are Linux-only under the owner's
no-macOS-CI direction. A separate three-Linux-cohort release aggregate has an
explicit receipt schema and exact current-run artifact/hash/source controls;
the six-cohort verifier remains available as a distinct mode. The SDK Linux
cohort retention step checks archive, source, member and host receipt hashes.
At this checkpoint these changes had only local static and regression checks. A macOS
SDK archive build is allowed by the owner's artifact instruction, but no
cancelled or unrun macOS CI cell is counted as qualification. The installed
archive replay was still open here; hosted Linux CI remains open.

### R8 current installed SDK and next retirement gates — 2026-10-27

The [private installed SDK packet](evidence/rust-migration/r8-full-sdk-9b89b757/README.md)
passes a zero-transform macOS arm64 archive, SHA-256
`c250b82bd689abdd85c6c3a5296892408cf8fdd590f36c6eecd753460f7e7706`,
with source and captured-live closure
`9b89b757176d03f518af3aa1a97f446e672d791a3f85629df490a6da07c085bf`.
Preflight checked 3,549 source inputs and 1,806 payload-member hashes. The
installed replay passed Node 26.12.1, Bun 1.4.3 and Chromium 153.0.8010.12:
31 R3, 27 numeric and six boundary, 66 Core Cardinality, 19 Facets, 14 Keys,
11 Bit128, 19 Compact, and 68 Security And/Or cases. Missing/corrupt native
and WASM controls and three route-tamper refusals passed. A local loopback
sandbox restriction initially stopped Chromium startup; the harness now checks
Bun's structured `EADDRINUSE` code, and the entire rebuilt archive replay
passed with local loopback permission. No macOS CI ran. This is one private
platform cohort, not Linux, release, or default-route retirement evidence.

Core Cardinality is the next narrow three-operation retirement candidate.
The current Rust metamodel source and compiler generate its v4 schema, and
the current ledger already classifies the resource as
`generated-authority-known`; the older authority decision packet has a dated
correction. Its per-resource transitive source closure still needs explicit
current-cohort linkage. More importantly, the selected V4 TypeScript binder
performs `copyJson` semantic admission before calling Rust. Move that
admission under Rust-driven ordered host reflection, preserve the source
oracle's getter/Proxy/throw order and caller identity, and qualify complete
CONTRACT-040 acceptance against installed Node, Bun and Chromium routes before
retiring exactly those logical names. The current 66-case installed packet
does not establish that gate.

The inherited-array-setter residual in ordinary `readJsonValue` requires
causal parser writes: the predecessor YAML parser invokes setters in its
line-start, stream, flow-collection and composition phases. Saphyr's event
parser and Rust `Vec<Value>` composition have different write sites. A host
callback added only after parsing cannot reproduce the 52-case source oracle;
porting equivalent parser/composer behavior or explicitly narrowing the
supported subset remains open. The private host protocol also lacks complete
public result reconstruction and bounded host work. Keep ordinary JSON opt-in
and the ledger at **922 open, zero retired**. Hosted Linux checks, broader
portable semantic ownership, independent integration review and release remain
open.

### R8 Cardinality host-input production cut and Python resource repair — 2026-10-27

The Node and browser V4 package roots now route the three Core Cardinality
authoring operations through the existing Rust-owned host-input engine. The
public facade no longer executes TypeScript `copyJson`; Rust orders the
source, identity, request and receipt admission through opaque host reflection.
The packaged `CORE_MODEL_RESOURCES` are fixed at factory setup; the host-input
engine still refuses callback controls, so no broader resource-control claim is
made. A host-json response-error marker converts only Rust response failures
to the public `UmfError`, leaving arbitrary caller-thrown objects untouched.
The explicit TypeScript reference export remains available for comparison.

The [current installed Cardinality packet](evidence/rust-migration/r8-cardinality-host-default-ab4731e7/README.md)
pins a zero-transform local macOS arm64 SDK archive at SHA-256
`78a6ab851b87cab09584b88d67fc98d543fc2da27846c18669be5e305d997079`;
source and captured-live closure both equal
`ab4731e7748e20eed2c560f6da926153af47e098dfa8706f41b1f4e3589ea117`.
Its bounded installed replay passed on Node 26.12.1, Bun 1.4.3 and Chromium
153.0.8010.12, including the frozen predecessor outcomes, direct reference
comparison, refusal shapes, Proxy order, thrown identity and browser WASM
loading. The focused source test passed 4 cases and 36 assertions; the Rust
library suite passed 472 tests. The metamodel outputs and generated action
identity were refreshed to a fixed point. The Python wheel's nine-resource
manifest was also synchronized after Linux CI exposed stale canonical hashes;
the manifest check and 47 action-resource/sdist tests now pass locally.
The full installed SDK replay subsequently passed against this exact archive on
all three hosts, including its R3, numeric, Cardinality, Facets, Keys, Bit128,
Compact Dataset and Security And/Or packets and missing/corrupt asset refusals.
Its [receipt](evidence/rust-migration/r8-cardinality-host-default-ab4731e7/installed-sdk-receipt.json)
is historical once later source changes enter the worktree.

This is a bounded private macOS archive result, with no macOS CI. The previous
`9b89b757` archive is historical for this route change. Before any retirement,
capture the matching Linux x64 archive and installed Node/Bun/Chromium receipts
for the committed source, bind the embedded Cardinality v4/v6 operation
schemas and shared Core resources to their transitive current source
authority, and complete the CONTRACT-040 authoring
and refusal acceptance matrix rather than relying on this frozen subset.
Retire only the three exact logical names if both platform cohorts and the
operation-specific acceptance gate pass. The current ledger remains **922 open
logical default-route gaps, zero retired**. The remaining Python-owned access
semantics, ordinary-JSON inherited-setter residual, broad default-route
catalog, integration, merge and release are still open.

### R8 Python count-result composition and Linux CI repair — 2026-10-27

The `umf_access.unified.operation_values.result_frame` count branch now selects
the versioned Rust read-frame shape check, existing Rust native token decision,
and a new Rust-owned count response composer. The production boundary keeps
the database row and scalar decode in Python: Rust checks row count and width
in the predecessor's host-read order, then Python decodes the one value before
Rust rejects a negative token. Metadata reads and final response construction
follow that refusal. The Rust composer accepts exact built-in text arguments,
streams canonical JSON into a capped 8 MiB buffer, and preserves the public
count DTO and bound error text. `one`, `optional`, `many` and `page` response
composition, cursors, and broader Python access behavior remain Python-owned.
This slice imposes no earlier work or row cap; complete access-stream resource
ownership and mixed host-object qualification remain open.

The Python access import graph now has an explicit shared capture type and no
capture/observer cycle. Its private Rust graph candidate retains exactly four
named capture primitives under an AST-scoped exception; new private imports and
host hooks still refuse. The checker reports 98 modules and zero violations,
with 30 focused boundary tests. The count result route passed 17 focused Python
tests, the Rust unit test and PyO3 build. The action-rule current-source receipt
was refreshed after generated provenance moved, while its nine captured
outcomes remained unchanged. The core authority scanner retains eight exact
frozen old-version refusal controls without relaxing its global rule. Clean
Linux SDK workflows now generate WASM declarations before repository typecheck;
hosted CI must still run on the committed source. No macOS CI is requested.

The new Rust source changed metamodel provenance. Generated schema/model files,
the Python core and codegen nine-resource mirrors, and action producer identity
were refreshed together; their fixed-point checks pass. This invalidates the
historical `ab4731e7` SDK source closure. A coherent Security/Compact source
replay, regenerated gap ledger, new fixed-point SDK archive, Linux installed
qualification and the full port/release gates were outstanding at that
checkpoint; the next section records the new local evidence.

### R8 coherent source and local artifact checkpoint — 2026-10-27

The [current Compact source packet](evidence/rust-migration/r8-compact-dataset-verify-source/README.md)
and [Security source packet](evidence/rust-migration/r8-security-and-or-v4-source-replay-current/README.md)
now share one immutable manifest, SHA-256
`50f19d4e492f8f00afbfe9a91ccfe94e093839703adfbd8b72b44e59f18aa5c8`,
and a 1,958-file source closure
`8ef3b7d6e5eec0e64dbd3f9b7d1170602de3882dbc0db5173cb037cbe33bb711`.
Node 26.12.1, Bun 1.4.3 and Chromium 153.0.8010.12 each passed five Compact
cases with 14 Rust/WASM dispatches and 68 Security cases with 30 dispatches.
The five Compact freezer payloads remain byte-identical; their source index
records refreshed schema provenance. The [inventory and ledger](evidence/rust-migration/r8-symbol-inventory/README.md)
checks pass at SHA-256 `cc3f62c7c496e63f3a55d5c2c24e00d985b1daf5b5e689932cf4ee29cad29050`
and `bf4e07bb1c0aa82e4a7852269f06c32eccfcdb565a31de28c0cb7683f82c9580`:
3,375 declarations across 509 files, **922 open logical executable default-route
gaps, zero retired**.

The new private macOS arm64 SDK archive is SHA-256
`b6288048969bc163255064fe7c391fd8043b6e3bcfb6e4b0817e24aa65c62dc6`.
Its 1,806 payload-member hashes and manifest SHA-256
`e8e1e781298577dcb169160a1881253fb81c8b08bbc31372c5a3632cfeecf718`
bind a zero-transform source and captured-live closure
`b991bc20731f42efd3a73aebd922f8cea7c6927346a63e197e467cf9f1eb028f`.
Nine package integrity tests pass. The [installed Core Cardinality replay](evidence/rust-migration/r8-cardinality-final-installed/README.md)
against this exact archive passed on Node, Bun and Chromium, including frozen TypeScript
outcomes, host admission order, Proxy traces, caller-thrown identity and public
error shape. This is a bounded private cohort; Linux installed parity,
CONTRACT-040's complete acceptance matrix and exact resource-authority closure
remain required before any of its three logical names can retire.

The [full installed SDK packet](evidence/rust-migration/r8-full-sdk-b991bc20/README.md)
also passed against this exact archive on Node 26.12.1, Bun 1.4.3 and
Chromium 153.0.8010.12 in 1,223,817 ms. Its preflight verified 3,549 source
inputs, 1,806 payload hashes and 1,807 tar members. The installed replay
covered 31 R3 cases, 27 numeric and six boundary cases, 66 Cardinality,
19 Facets, 14 Keys, 11 Bit128 and 19 Compact cases, and a 68-case Security
And/Or packet with 30 Rust/WASM calls per host. Missing/corrupt native and
WASM assets refused at their intended boundaries. The installed receipt SHA-256
is `0fed52e384d272416edbccff2e462750bdde893d3e5c5f891bacd2fcb6632d2e`.
This remains a single private macOS arm64 cohort, not Linux or release
qualification; no macOS CI ran.

The [Cardinality resource/source closure](evidence/rust-migration/r8-cardinality-resource-source-closure/README.md)
binds the generated v4 schema, separately authored v6 schema and five shared
Core resources to the metamodel output manifest and the same private archive.
All seven archive members match current source bytes. An independent audit of
the archive's 3,549 captured-live source inputs found zero differences from
commit `1453af78d3da71693b551a31609a126190591407`. This closes provenance
for this bounded source/archive cohort; the complete CONTRACT-040 acceptance
matrix, Linux installed parity and three-row retirement review remain open.

The Rust core library suite passed 473 tests; Python core and Rust-core tests
passed 196, action-resource/sdist tests passed 47, and 53 focused Bun tests
passed with 317 assertions. TypeScript typecheck, the strict Python and
TypeScript access boundaries, core authority, metamodel, action identity,
Rust/V8 boundary census and action-source review hashes pass locally. The
[macOS Python artifact packet](evidence/rust-migration/r8-macos-python-current-20261027/README.md)
records six freshly built arm64 core, codegen and access distributions,
installed PyO3 count composition, codegen generation and 26 focused access
tests with 33 subtests. The core sdist-rebuilt native binaries differ bytewise
from the direct wheel; the receipt records both hashes and makes no native-byte
reproducibility claim. No macOS CI ran.

The next Python production slice is non-count read-frame cardinality, but its
existing Rust helper still accepts caller-supplied row counts and bounds without
shared resource charging. Prove the `pg18-read-frame/0.1` guard and bound
provenance through the installed PostgreSQL route before selecting it publicly;
preserve full decode-before-cardinality and cursor/metadata/final-size order.
The ordinary JSON inherited-array-setter mismatch, broad default-route
catalog, Linux x64 and coordinated release cohorts, merge and publication
remain open. The complete Rust port and release are not qualified.

The follow-on read-frame investigation keeps the public non-count cardinality
branch in Python. `table_reads._prepare_owned` checks only Weft's
`nativeReadGuard` metadata; the sync, async and SQLAlchemy paths execute its
compiled SQL and materialize with `fetchall()` before `result_frame` can act.
CONTRACT-079 places the 8 MiB visible-value guard, including lookahead, in the
PostgreSQL statement. The current installed packet has no live database read
showing SQLSTATE 22012 before delivery, and the existing Weft compiler packet
records `nativeExecutionQualified:false`. The Rust helper remains private
until installed Weft/UMF SQL custody, bound provenance and positive/oversize
live PostgreSQL receipts prove that ordering across supported drivers. Its
private tests now cover one/optional/many/page boundaries, later-row decode
precedence, page cursor and metadata order, and profile refusal (9 tests,
21 subtests). This does not retire any ledger row.

The first hosted Linux checks on commit `1453af78d` exposed three stale
qualification pins. The Python action-runtime job built both direct and
sdist-rebuilt artifacts and passed 255 installed tests on each, but its final
receipt expected the previous sdist helper SHA-256. The command job selected
Bun 1.4.2 while the current-source action receipt correctly requires 1.4.3;
the Python test job's only failure was a contradictory obsolete 3.11.9 workflow
assertion beside the current 3.11.17 assertion. The exact helper pin, Bun
runner pin and test assertion were corrected, with a mismatched-helper
negative control and 40 distribution-artifact tests passing locally. Hosted
reruns of those corrections and all remaining Linux cohorts are still open.

### R8 post-merge current-source replay refresh — 2026-10-27

After merge `3e02db411`, the Compact five-case and Security And/Or 68-case
source packets were replayed against one fresh 1,958-input build. The immutable
manifest SHA-256 is
`8b3a7fa5d854f709d6ca7888758e7099ef9b8c5707f0722bdc16f64735890cf2`; source
closure SHA-256 is
`0f8f116988ba2da74a13085790824cb9a4f2dc8deda9a5abdb2a594aa14f20dd`.
Node 26.3.0, Bun 1.4.3, and Chromium 153.0.8010.12 pass the Compact cases
with 14 Rust calls or WASM dispatches per host. They also pass all Security
cases with 30 valid calls per host and zero invalid calls. The security fixture
is byte-identical to the preserved packet fixture (SHA-256
`d5dddb6766cadd5f9e3c45ef40f7d9fc8d5d486d59d3163b236477ef6966308d`). See
the refreshed [Compact packet](evidence/rust-migration/r8-compact-dataset-verify-source/README.md)
and [Security packet](evidence/rust-migration/r8-security-and-or-v4-source-replay-current/README.md)
for receipt hashes and limits. These remain bounded source-replay evidence,
not installed archive or release qualification.

The packet checksums validate. The generated gap ledger was reviewed and
regenerated for the refreshed receipts and merged metamodel inputs. Its 365
value changes are provenance hashes only; route counts and dispositions remain
unchanged at 922 open logical executable default routes and zero retired.
The generated ledger SHA-256 is
`5cbf92bddfe5a0053c44ccba8b23999fb1af48c4b09461d27af984ec21bf135e`.
This checkpoint predates the new Cardinality acceptance test source. Its
current-source replay and ledger refresh are recorded in the next checkpoint.

### R8 Cardinality acceptance and retirement gate audit — 2026-10-27

The new Rust wire matrix at
`crates/umf-core-wire/tests/r8_cardinality_acceptance.rs` passes its focused
test. It covers authored Core Cardinality inspection, declaration, refusal,
opaque item metadata retention, and receipt consistency on the current source.
This is bounded core-authoring evidence, not complete five-system acceptance.
The test entered the metamodel workspace inventory, so its generated manifest
and downstream Action producer identity were refreshed in that order. Both
generator `--check` commands, the full application-and-tools typecheck, core
authority check, Rust/V8 boundary census, and unified-client/access boundaries
now pass. A separate one-line tools tuple annotation repaired the full
typecheck without changing runtime behavior.

The current Cardinality conformance generator deliberately reports
`idealAdmitted: false` and zero currently qualified native bindings. Its older
positive five-binding packet proves a historical concept-acceptance cohort;
retained fingerprints do not authenticate fresh native/browser execution. The
R8 `/2` default-route validator likewise accepts two-platform receipts only as
bounded evidence, and the retirement validator rejects that format until a
complete CONTRACT-040 acceptance proof exists. Therefore the three Cardinality
logical names remain open. A disposable exact-source five-binding environment
is prepared for current native/browser execution, with its Java and Chromium
versions recorded as a new cohort; no current five-system result is claimed yet.
The next gates are a fixed-point rebuild after the CONTRACT-040 status edit,
a hosted Linux x64 installed replay, fresh five-binding receipts, and a
reviewed acceptance-capable retirement evidence interface.
The total remains 922 open logical executable routes
and zero retired.

The Compact Dataset and Security Node, Bun and Chromium replays now share
immutable source manifest SHA-256
`5962a782eac5ffd09f4c64c1b98828dfc648d2439b7a401cdb105e5378a15d70`
and a 1,959-file source closure
`60e9ef033087b32ae195653662afb8955338f82314d108f8ac0f14d773aba30a`.
Compact passes five cases on each host, with 14 Rust calls on Node and Bun and
14 WASM dispatches in Chromium 153. Security passes 68 cases per host, with 30
valid Rust calls and zero refusals. The packets' recursive checksums pass.
The independently regenerated R8 ledger SHA-256 is
`cb9ef94664142d5be0202539c66b79f81a4e05da5cbc4e2fabe27e24be2f60f0`:
96 rows change: 90 resource-ownership provenance rows for the generated
manifest and corrected CONTRACT-040 status, and six current route-receipt
rows. Counts and route dispositions remain unchanged. This is
source-tree evidence, not installed-release qualification.

The [Docker-emulated Linux x64 archive packet](evidence/rust-migration/r8-cardinality-linux-x64-emulated-b505/README.md)
records a clean `b50523cda` SDK build with zero source transforms and source
closure SHA-256
`5564642b25543372aa160df665c5b696664ec447397f09f7de0ec95dfebe0eeb`,
matching the separate macOS arm64 build from that source. Archive integrity
passed 9/9 checks; the full TypeScript typecheck passed. Its installed
Cardinality receipt passed the three operation routes on Node 26.12.1, Bun
1.4.3, and Chromium 153.0.8010.12 with packaged WASM and no external browser
requests. Archive SHA-256 is
`eea56e3ae4b00f55b322064d641043d35d374604ec0a0be1dc04f527d8a1fdfc`;
the raw receipt SHA-256 is
`52e64280b0a7a5f4bbac6e969a09b13b0497d5ccfbe2ee7d4a8eacd08c565d0a`.
This is emulated local provenance, not hosted Linux CI, CONTRACT-040
five-binding acceptance, default-route retirement, or release qualification.
Because CONTRACT-040 is an input to the SDK source closure, the later status
correction makes this frozen `b50523cda` archive historical relative to the
edited branch; a new exact-source archive replay is required.

Fresh five-binding work encountered a TableSpec source-version mismatch before
native qualification: the clean current TableSpec checkout's
`src/tablespec/type_mappings.py` does not match UMF's pinned native fixture.
An exact historical source blob was located at TableSpec commit `bb34a0382`
(lineage `v0.0.9-5-gbb34a03`), enabling a separately labeled pinned-version
replay. No current TableSpec or five-system qualification is claimed. The
CONTRACT-040 status text now distinguishes its historical five-binding gate
from the current conformance record's `UNQUALIFIED` native state.
The fixture's declared TableSpec commit `647e8e566ad78b864282ec65c0b0b2237aa63084`
is also present in the local TableSpec Git object store; its
`src/tablespec/type_mappings.py` SHA-256 is the fixture's pinned
`eaa36bcbd96d2b09d22161c5200a2be6a0788d7fd5ee46292d62428bb24cbbe7`.
The host oracle hardcodes that commit label in its emitted JSON, so a run from
the later `bb34a0382` checkout would be mislabeled even if the checked file
matched. Qualification must execute from an isolated checkout of the actual
`647e8e5` commit and record its tree and installed package version.
That isolated `647e8e5` replay has now passed native and Chromium 153 routes
against the frozen `b50523cda` UMF source. The native route passed all five
subcommands, including 28 declarations, 336 classification cases with 452
recoveries, and 78 projection cases with 44 emitted targets and 88 recoveries.
The browser route passed the same classification and projection case totals,
with 110 and 34 expected blocks respectively and no reported external browser
requests. The TableSpec tree is `f6d419cef7e482684a795147d68130ac0cd39d0e`
and its derived package version is `0.0.3.post2.dev0+647e8e5`. The raw
TableSpec packet at `/private/tmp/umf-cardinality-receipts/tablespec` passes
recursive SHA-256 verification. All five priority native/browser pairs have
therefore passed on the frozen `b50523cda` source, but that remains a historical
cohort relative to the later CONTRACT-040 edit. A separate exact-current-source
replay and acceptance validator are still required.
The focused PostgreSQL, SQL Server and Avro contract-review receipts explicitly
remain `acceptance-pending`; their passing route pairs cannot substitute for
the combined five-system regression, existing Field/Nullability gates or a
qualified Cardinality admission/delivery decision.
The TableSpec projection evidence itself reports `bindingAccepted: false` and
`idealAdmitted: false`; the PostgreSQL review calls for a 69-command combined
refresh, but the current retained Field integrated refresh has 184 commands
and must be treated as the actual current gate. The SQL Server, Avro and Parquet
reviews also leave combined
regression/conformance work open. None of those status fields may be promoted
by a validator from successful per-route command summaries. Case-level loss,
refusal and reciprocal recovery evidence, exact source pins, and the combined
Field/Nullability/Cardinality gates must pass before `/3` may return a retired
disposition.

The next retirement evidence format must close the gap between the bounded
two-platform `/2` route proof and CONTRACT-040 acceptance. It will name exactly
the three Cardinality exports and six Node/browser ledger rows, pin their
current contract and source bytes, and require one fixed-point source closure
shared by the macOS arm64 and Linux x64 installed SDK archives. Each operation
needs raw Node, Bun and Chromium packet-case receipts per archive, including
default Rust/WASM invocation counts, reference zero-Rust controls, exact outcomes
and ordered traces. The same source closure must bind fresh native and browser
receipts for TableSpec, PostgreSQL, SQL Server, Avro and Parquet, with explicit
native versions, projection/classification cases, strict refusals, loss
residuals and both retained recovery directions. The verifier must reopen and
hash those raw files, reject duplicate or missing cases and mixed cohorts, and
require current conformance to report ideal admission and all five qualified
bindings before returning a retired disposition. A pinned historical TableSpec
version may satisfy only a separately identified supported-version cohort;
it cannot establish support for the current TableSpec checkout. The existing
`/2` format continues to return bounded evidence only. Negative controls must
show rejection of stale source, absent native/browser receipts, a skipped Rust
call, a reference Rust call, changed unknown content, and a five-system status
assertion unsupported by the raw cases.
Sol review of the proposed `/3` validator keeps the `/2` archive, packet and
runtime checks intact, then requires exactly six current Cardinality ledger
rows and five native/Chromium binding groups. Each binding needs a separate
recomputed source/evidence closure tied to the same committed SDK source,
including scripts, fixtures, bundles, contracts, lockfiles and tool versions;
per-case outcomes, loss lists and original-source recovery digests must be
verified from raw files rather than summary counts. The current installed
Cardinality receipt uses a different schema from `/2` host receipts, so a
lossless adapter or new raw host capture is required. The positive gate must
also rerun the combined five-system refresh and dependent Field/Nullability
conformance; a passing per-binding pair alone is insufficient. Tests should
rehash adversarially edited receipts so semantic checks, not only file hashes,
reject omitted/swapped cases, altered losses and one-direction recovery.
A focused audit of the current installed Cardinality receipt found no lossless
adapter: it aggregates the three operations without packet case IDs, per-case
ordered traces or exact default/reference Rust-call counts. Archive/member
hashes are reusable, but zero reference Rust calls cannot be inferred from
parity. The next host harness must capture each frozen case separately on
Node, Bun and Chromium, instrument both routes' Rust calls, and pin the packet,
cohort/platform, archive export conditions and native/WASM artifact members.

The [exact-`e0487691` Docker-emulated Linux x64 packet](evidence/rust-migration/r8-cardinality-linux-x64-emulated-e0487691/README.md)
now passes fixed-point source closure
`1355bf21b58ad9e422fa8998c1ce5325b8643bb1eefbc6a1b6a127babc52b5d7`
with zero transforms, the full TypeScript typecheck, nine archive checks, and
installed Cardinality parity on Node 26.12.1, Bun 1.4.3, and Chromium 153.
The archive SHA-256 is
`7f36bce11d7eac07aa1235b8d192e64b1aacc2a000934984080890291a915c6f`;
the raw receipt SHA-256 is
`189d526cb65c26a74510a8dd83d67f6c71d2738c7242c9aa85365a35d43d4255`.
Chromium requested packaged WASM and made zero external requests. The 1,807
tar-entry set matches b505 exactly; the changed manifests bind the one changed
CONTRACT-040 input, while separately rebuilt native/WASM binaries contain
different temporary source-root paths and are pinned by their actual archive
hashes. This is local emulated Linux and three-operation installed evidence,
not hosted Linux CI, five-binding current qualification, retirement or release.

The independent [exact-`e0487691` macOS arm64 packet](evidence/rust-migration/r8-cardinality-macos-arm64-e0487691/README.md)
also records fixed-point source closure
`1355bf21b58ad9e422fa8998c1ce5325b8643bb1eefbc6a1b6a127babc52b5d7`
with zero transforms and 3,550 source inputs, a passing full TypeScript
typecheck, 1,806 verified archive payload members, and installed three-operation
parity on Node 26.12.1, Bun 1.4.3 and Chromium 153 with packaged WASM and zero
external requests. Its private archive SHA-256 is
`b87fe222f8e6f0c2446e54d683b22e8cec3ebdeca8fb75e4a5a82f2aa1ea3235`,
and its raw receipt SHA-256 is
`a49eb835d4df798ecd7be45ec00aac424f00ac95c80db0d980f1887b36f571f9`.
Both platform archives now have one matching committed source closure and
bounded installed replay. Their aggregate receipt schema lacks per-case
invocation evidence required by `/2`, and their local runs are not hosted
Linux or complete acceptance; ledger retirement remains zero.

### R8 exact-source binding replay and all-Rust packet profile — 2026-10-27

The [retained E048 five-binding route packet](evidence/rust-migration/r8-cardinality-five-binding-routes-e0487691/README.md)
now records successful focused native and Chromium 153 pairs for TableSpec,
PostgreSQL 17.4, SQL Server 16.0.4295.3, Apache Avro 1.12.0/fastavro 1.12.2,
and PyArrow 21.0.0. It pins UMF commit `e0487691e34be22de9e63d8ead5f1c9db21fee13`,
tree `ee0c192c9e9929c31700a05ab16b510ad0234d67`, and the zero-transform
pre-run SDK closure `1355bf21b58ad9e422fa8998c1ce5325b8643bb1eefbc6a1b6a127babc52b5d7`.
The generated fixture outputs have their own path/hash inventory; they are not
silently folded into the pre-run input closure. All retained recursive SHA-256
checks pass. The TableSpec replay uses its exact historical `647e8e5` source,
so it does not qualify current TableSpec. B505 and E048 generated case-ID
inventories and aggregate dimensions match, but byte-level equality is not
claimed. Existing focused contract reviews still mark acceptance pending;
combined five-system regression, Field/Nullability dependencies, and a current
Cardinality conformance admission decision remain open.

The exact-source E048 combined Cardinality conformance rerun now completes with
11,194 evidence fingerprints after distinguishing current-source receipts from
historical re-authoring. PostgreSQL verifies 26/26 current receipts in place
and SQL Server verifies 68/68; neither cohort increments historical replay
counters. Field and Nullability conformance also complete, but both remain
historical-partial and current-source UNQUALIFIED. The combined result keeps
`nativeEquivalence=false`, `idealAdmitted=false`, and `qualifiedBindings=0`.
The disposable log is
`/private/tmp/umf-cardinality-e048-cardinality-conformance-final.log`
(SHA-256 `49caa0577f42f3b510aa36dd10d749a28b66f4475462c82d0353837dca83c859`);
it pins UMF E048 commit `e0487691e34be22de9e63d8ead5f1c9db21fee13`, tree
`ee0c192c9e9929c31700a05ab16b510ad0234d67`, and the pre-patch, zero-transform
SDK input closure `1355bf21b58ad9e422fa8998c1ce5325b8643bb1eefbc6a1b6a127babc52b5d7`.
This is bounded conformance evidence only: acceptance remains pending and no
Cardinality retirement status changes.

A private per-case installed-SDK capture spike replayed 11 frozen Cardinality
cases per host against the exact E048 macOS archive on Node 26.12.1, Bun 1.4.3,
and Chromium 153, and against the exact E048 Linux archive on Node 26.12.1 and
Chromium 148. Every default-route case returned or refused with the same value,
error and ordered host trace as `./reference`; each called the actual N-API or
WASM Cardinality export exactly once, while each reference case called it zero
times. The source/current throwing-Proxy cases and malformed input refusals
also entered Rust once. No genuine zero-Rust preflight case was found for this
family. The Linux image lacked Bun for this per-case spike, though the earlier
aggregate installed Linux replay covered Bun 1.4.3. These observations remain
private design evidence until a source-bound harness captures all six host
receipts against a new fixed-point archive pair.

The bounded `/2` validator now accepts a distinct Cardinality packet `/2`
`all-rust` profile with an exact positive `expectedDefaultRustCalls` count for
every case and a zero-Rust reference control. It leaves legacy packet `/1`
mixed Rust/preflight requirements intact and still refuses default-route
retirement without a separate acceptance-capable manifest. Rehashed negative
tests reject skipped/extra default calls, a reference Rust call, missing or
duplicate cases, changed traces, and fabricated zero-call preflight claims.
The focused profile tests and all 62 R8 ledger tests pass. The new source-bound
`core-cardinality-case-capture.mjs` harness and three frozen operation packets
are now checked in. It reopens the archive, checks every extracted member,
resolves the actual Node/Bun package conditions and the browser condition,
counts calls at the N-API or raw WASM export, and compares each default and
`./reference` case to the frozen outcome and ordered trace. Before it emits
`status: pass` receipts, it requires the archive's live fixed-point closure to
contain exact hashes of the harness, its tests, validator, and packets. Eleven
focused harness/profile tests pass. E048 archives predate these files and are
correctly rejected before a qualifying receipt is written. Their separate
private smoke observations remain bounded only. Next, build and inspect a new
fixed-point macOS/Linux archive pair containing these sources, capture all six
Node/Bun/Chromium host receipts, and independently verify them. Then rerun the
combined five-system refresh and dependent gates before deciding whether any
Cardinality logical gap may be retired. The ledger remains **922 open logical
default-route gaps, zero retired**.

The next envelope/preservation spike examined seven root names: `copyJson`,
`LIMITS`, `pointer`, `UmfError`, `readDocument`, `writeDocument`, and
`editExtension`. Its isolated Rust core probe matched seven serialized JSON
value cases, including unsafe-number refusal and unknown/dangerous data keys;
valid document JSON matched the TypeScript reference byte-for-byte and YAML
round-tripped semantically. It found one concrete invalid-document mismatch:
Rust returned only the first validation diagnostic while TypeScript placed the
whole ordered diagnostic array in `UmfError.message` with an empty public path.
The Rust `document::require_valid` implementation now emits that full
`JSON.stringify`-shaped diagnostic array through the UTF-16 serializer. A
frozen three-diagnostic reference vector and a valid unknown-preserving
read/write round trip pass 2/2 focused Rust tests. This repairs a core parity
gap only; general `copyJson` host reflection, getter/Proxy exception identity,
`editExtension` live callback/Registry behavior, Node/Bun/Python wrappers,
Chromium/WASM and installed-package qualification remain open before any
envelope root selection.

An independent wrapper probe then showed that existing N-API and WASM
`copyJsonWire` routes preserve the TypeScript Proxy trap order and a trap-thrown
object's identity, but differ on accessor, hidden-property, custom-prototype,
symbol, cycle, depth-limit and unsafe-number refusal envelopes. The existing
wire encoder does not enable cycle detection for this path; its deep refusal
must not be reported as the reference `CYCLE /self` result. The real WASM
module ran under Bun, while Chromium launch in this private probe was denied
by the local Mach port sandbox. These are candidate-wrapper failures, not
accepted default behavior. A Rust-owned host-input traversal using thin
N-API/WASM reflection callbacks, following the Cardinality bridge pattern,
was then exercised through the existing private Cardinality host-input bridge.
The core `copy_host_json` event protocol matched TypeScript error code, path,
message and Proxy trap order for accessors, hidden fields, custom prototypes,
symbols, cycles, depth overflow and unsafe integers on N-API and WASM under
Bun. A Proxy-thrown sentinel kept its object identity. Node also matched the
100,000-value boundary; a 4,000,001-unit string passed value admission.
Chromium was blocked by this probe's local browser launch permissions, so
there is no real-browser qualification yet. The production candidate is a
dedicated opt-in `copyJson` host-input operation over these existing Rust
callbacks, with host hooks limited to reflection and thrown-object rethrow;
default root routing waits for broader cross-host and installed evidence.

The bounded opt-in implementation now adds `executeCopyJsonHostJson` in the
N-API and WASM Rust bindings and separate `copy-json-host-input.js` entrypoints
for both packages. The established `index.js` and declaration entrypoints
remain unchanged; package file lists include the additive entrypoints. Focused
Node/Bun parity tests pass 11 cases / 22 assertions for accessor, hidden-field,
custom-prototype, symbol, cycle, depth-limit and unsafe-number refusals; Proxy
reflection order and thrown-object identity; dangerous and lone-surrogate
keys; and a 4,000,001 UTF-16-unit string. The WASM module passes the same
behavioral packet under Bun. An independent local Chromium 153.0.8010.12
replay also matched ten source-tree cases, including ordered Proxy reflection
and trap-thrown object identity, after local loopback/browser access was
allowed. The retained
`bindings/core/wasm/tests/copy-json-host-input.chromium.mjs` harness passed
independent replay in Chromium 153.0.8010.12 with ten calls through the
WASM-bindgen export, an actual WASM binary fetch, and zero external requests;
these observations do not qualify an installed SDK browser route. The
long-string Node case takes about 20 seconds, so copying plus wire encoding
needs performance work before broad routing; the 100,000-value boundary was
seen only through the earlier Cardinality bridge, not requalified through this
new opt-in export. Node package-closure and generated WASM source checks pass.
The R8 ledger check remains blocked by exact source-closure drift: first at
`bindings/core/node/package.json`, now extended for the additive entrypoint,
and the changed Rust binding source is also pinned by existing receipts. Those
receipts remain unchanged. This is an opt-in implementation and bounded
parity result only; it does not select a default route, retire a gap, or
qualify installed packages or browser behavior.

### R8 current-source receipt and capture custody checkpoint — 2026-10-27

The general `copyJson` host-input candidate and invalid-document diagnostic
repair passed the complete locked `umf-core` Rust test suite: 473 library
tests plus the integration and documentation tests, with the two separately
gated ignored tests left ignored. The dedicated Node/Bun and real Chromium
candidate probes above remain opt-in evidence, not installed-package parity.

A live R5 Compact refreeze changed only compiler-provenance hashes for
`spec/core/schema.json` and `spec/core/semantic-type-reference.schema.json`;
all five frozen payloads were byte-identical and their model hash was
unchanged. The refreshed [Compact source packet](evidence/rust-migration/r8-compact-dataset-verify-source/README.md)
binds one 1,967-input source closure, SHA-256
`571569bc131aaa1a38c6d52edfd2273cec7cf13e52e01b77eb63d8b2b03c31ed`,
to an immutable build manifest, SHA-256
`65bb6505f247e221f55b3e0fe7a5b998c76ef7470b390bfae33c8140add3d5aa`.
Node 26.12.1, Bun 1.4.3 and Chromium 153 passed all five cases, with 14
native/WASM dispatches per host. The dependent
[Security And/Or packet](evidence/rust-migration/r8-security-and-or-v4-source-replay-current/README.md)
was replayed against that same build: 68 cases per host, 30 valid Rust/WASM
calls and zero refusal calls per host. Both packets retain the prior cohort
under historical directories and pass their checksum indexes.

The full five-binding Cardinality conformance test now passes 3/3 tests and
381 assertions after its replay expectation was limited to nonblocked native
rows. The combined exact-E048 refresh remains bounded: current PostgreSQL
26/26 and SQL Server 68/68 native-input replays match, while ideal admission
and five-binding current qualification remain false. The Cardinality `/2`
archive-capture harness now refuses symlinked or extra extracted members and
recomputes the complete fixed-point source closure, including exact input
maps and file count, before emitting host receipts. Its ten focused tests and
the combined 13 focused capture/validator tests pass. The Linux-only SDK
workflow captures Node, Bun and Chromium Cardinality cases from the same
archive and uploads the raw receipts; no macOS CI job was added.

The regenerated [R8 ledger](evidence/rust-migration/r8-symbol-inventory/README.md)
passes its current-source check at SHA-256
`2e86c1158af02db939d3d997dffe88a00c607be17299ab485a65a6dce3cbeaf7`.
It still records **922 open logical default-route gaps, zero retired**: 81
accepted opt-in Rust operation names, 841 without accepted mappings, and five
with bounded current-source route proof. The current Compact/Security replay
does not satisfy the separate installed-SDK, Cardinality acceptance, R4
Python matrix, R6 consumer, R7 default-authority, or R8 release gates.

An exploratory local R4 installed probe used a previously built core/codegen
wheel pair under CPython 3.11.17 on macOS 27.0.1 arm64. With executable lookup
disabled for JavaScript runtimes, all seven codegen operations, CLI help,
`pip check`, and retained writer, tamper and deadline controls passed. Its
source checkpoint was not pinned to the current commit; the result does not
replace a fresh source-coherent wheel/sdist build or cross-platform release
qualification. Honor the owner's no-macOS-CI constraint: use local macOS
evidence and Linux CI, and record any unrun supported-platform matrix cells
explicitly rather than counting them as qualified.

At this checkpoint, the next substantive unported family identified by the R8
inventory was the CONTRACT-016 Arrow schema JSON adapter: 87 route-specific
declarations, zero accepted Rust mappings and no Arrow-specific Rust owner.
A bounded Rust core slice was selected to start with import, inspect and export
against the 52-case authored corpus and pinned PyArrow evidence, preserving exact numeric tokens, ordered
metadata and unknown native content. IPC, FlatBuffers and record-batch behavior
remain outside that first slice. Selection waits for frozen predecessor and
Node/Bun/real-browser parity; the 87 rows are not 87 independent operations.

### R5 Arrow and R8 source-custody continuation — 2026-10-27

The opt-in Rust `arrow_schema` core now owns schema-JSON import, inspection,
export, node lookup and nonmutating edit proposals. It preserves `NativeJsonTree`
number lexemes, member and metadata order, duplicate metadata and unknown native
content. Four focused Rust tests pass, including exact JSON export for all 52
authored schema inputs, pinned historical JS/PyArrow oracle identity, known
invalid shape and dictionary-integer refusals, and an unknown fractional
parameter on a known type that remains valid with `ARROW_UNKNOWN` rather than
`ARROW_INTEGER`. The TypeScript adapter's five existing Bun tests still pass
with 178 assertions. This is a source-core subset, not a selected default
route: cross-host binding parity, exact diagnostic ordering, IPC/data and
native Arrow execution remain unqualified. The existing oracle metadata
assertions do not themselves establish Rust/native parity.

The opt-in `copyJson` host-input export now exercises the actual 100,000-value
boundary in Node and WASM: an array of 99,999 null children plus its root is
admitted, and 100,000 children match the TypeScript overflow refusal. Fresh
WASM-bindgen 0.2.100 output passes the Bun packet including a 4,000,001-unit
string; real Chromium 153 passes twelve exact WASM calls, including the
boundary and overflow, with zero external requests. A one-shot local Node
resource probe measured 4,000,001 UTF-16 units at 15.5 seconds and 258 MB RSS,
and 16 million units at 62 seconds and 727 MB RSS. The per-unit JSON transport
needs bounded performance work before default routing; these local measurements
are not an installed SDK or release qualification.

Independent review of the SDK fixed-point builder found that it hashed only the
pre-generator source list. The builder now re-enumerates its dynamic source
roots after private generators and rejects any added or removed file before
labeling a snapshot fixed-point. Three focused inventory-gate tests and the
tools TypeScript check pass. The first private SDK build before this correction
reported two generated transforms, the metamodel manifest and action-plan
identity, and remains nonpublishable. Those files were regenerated on the live
worktree; the final generator/check cycle must run again after the current
Arrow/binding/harness edits. Consequently the Compact and Security source
receipts above are now historical for their exact closure, and the R8 ledger
requires another current-source refresh. No R8 gap retirement or release gate
is inferred from this checkpoint.

The generator/check cycle subsequently reached a fixed point. A private SDK
`BUILD_ONLY` run returned `sourceTransformStatus: fixed-point`, zero generated
source transforms, and matching captured/live source-tree SHA-256
`47e531b490c202e6c19137d892e7776e445461ab69b9c8a79d99532d8faa02d5`
across 1,800 built assets. Its release status remains explicitly private and
nonpublishable. The current-source Compact and Security replay packets were
refreshed after the Arrow and host-input work: their common manifest SHA-256
is `1dfb786e44d32a22ed7595bf7f3b4a6be0692b5932c3b9de87ad2da894996ae4`,
binding 1,969 source inputs at closure
`45133a5eab727481d7ee30d0cfaa1e00ccf2b10ea9d0117a9952887f17e00f2c`.
All five Compact and 68 Security cases passed on Node, Bun and real Chromium;
the previous source cohort is retained under each packet's historical tree.
The [R8 ledger](evidence/rust-migration/r8-symbol-inventory/README.md) now
checks at SHA-256
`c432635cf345e9d8c6f6c36114078f40403c96dcfb9590d329d201781c05a8ba`,
still with 922 open logical gaps and zero retired. The fixed-point SDK build
and source replays do not establish installed archive or release qualification.

The next Arrow slice is an opt-in wire binding for the five schema-JSON
operations already present in Rust: import, inspect, export, node lookup, and
edit proposal. Freeze the current TypeScript results for the 52 authored
schemas and negative, unknown-content, duplicate-metadata and edit cases
before exposing the operations through Node, WASM, Python and the CLI. Sol
review found a diagnostic path bug in the Rust core: a field index was escaped
inside one pointer segment. It is corrected with a focused exact-path
assertion, which passes. This makes the immediately preceding source-bound
SDK build and Compact/Security receipts historical; their corrected-source
refresh is in progress.

For this binding, the predecessor's public diagnostics and error transport are
the parity target. The Rust core currently emits an additional
`ARROW_SEMANTICS_UNVERIFIED` warning, uses different wording for some
representation/export refusals, and condenses invalid import/edit diagnostics
to a count. Those differences must be resolved before host parity can be
claimed. Keep broader Arrow semantics explicitly unverified in capability
documentation. IPC, array data, FlatBuffer operations and native execution
are separate later slices; the 87 Arrow route declarations are not 87
independent operations.

The Arrow diagnostic correction was followed by a governed regeneration and
private R5 refreeze. `bun scripts/metamodel/build.ts --check`, action-plan
identity, Python codegen resource, and Python action-runtime resource checks
all pass. The five Compact payloads remain byte-identical; their current index
SHA-256 is
`475f7311eec810c84806b23ee6d0bd41c99bedc9b2bc84bd99318962d917db68`
with only two generated schema pins changed. The refreshed [Compact](evidence/rust-migration/r8-compact-dataset-verify-source/README.md)
and [Security](evidence/rust-migration/r8-security-and-or-v4-source-replay-current/README.md)
source packets pass five and 68 cases respectively on Node, Bun, and real
Chromium, bound to manifest SHA-256
`0faa8dc02cb0e0068af0b66c5e0cffe46a7d16c3c15d953403916c643bc6dc65`
and 1,969-input source closure
`12e2975de46a4bed5749e4f93390959f2a0ebed30cf23b36940189c328451a61`.
Their previous cohort remains in `historical/pre-arrow-pointer-20261027/`.

The corrected-source private SDK build returned fixed-point, zero transforms,
and matching captured/live source SHA-256
`e95ca0fa8109a3a81f605cbeae735683ca5b253b3663e90edb105b38f8260a6d`.
The private archive SHA-256 is
`b48f5c50d11e9766256919905e82d1bab01dde3c4a1413eeaf105d5c6950cb29`;
installed-route qualification against it is pending. The preceding archive's
bounded installed Compact/Security receipts are preserved as
[historical evidence](evidence/rust-migration/r8-installed-compact-security-pre-arrow-pointer-20261027/README.md).
The [R8 ledger](evidence/rust-migration/r8-symbol-inventory/README.md) now
checks at SHA-256
`dbcda31cde1d44f17aebda8bfb3c4bd9705bb3832256e90c81e60dd4dcbc9414`,
with 922 open logical default-route gaps and zero retired. Typecheck, core
authority, Rust boundaries, all 62 ledger tests before the final refreeze,
the full Rust core suite, and the focused corrected Arrow regression passed;
the ledger tests are rerunning after the final refreeze. This checkpoint does
not qualify a release or complete the Rust port.

The [corrected-source installed packet](evidence/rust-migration/r8-installed-cardinality-compact-security-20261027/README.md)
now binds the private SDK archive above. On local macOS arm64, Node v26.12.1,
Bun 1.4.3, and Chromium 153.0.8010.12 passed all 11 Cardinality retirement
packet cases (four inspect, four declare, three verify) with exactly one
default Rust/WASM call and zero reference calls per case. The capture verified
all 3,570 source inputs and 1,807 archive members before emitting the nine
raw receipts. Installed Compact passed five cases per host with two default
calls per case; installed Security And/Or passed 68 per host with 30 valid
default calls and zero refusal calls. Chromium loaded WASM and made no external
requests. The receipt packet and its checksum index are retained; these are
bounded local observations, not Linux CI or a retirement/release claim.

Fresh R4 Python wheel/sdist qualification independently found a source-archive
blocker: `python/hatch_build.py` omitted the two new Arrow schema
`include_str!` resources from the core sdist. Direct current-source core,
codegen and access wheels built, and initial isolated CPython 3.11/3.13
no-JavaScript probes passed; rebuilding the core wheel from its sdist failed
because `spec/extensions/arrow/package.json` and
`spec/extensions/arrow/integration-schema.json` were absent. The exact
sdist-source inclusion fix and full wheel-from-sdist rerun remain required
before R4 can be qualified. The Python packaging paths are outside the SDK
archive and Compact source closures, so this fix does not alter those
recorded source cohorts.

An additional Sol review found that the Rust Arrow union `typeIds` integer
diagnostic escaped `typeIds/0` as one JSON Pointer segment. The path is now
formed from separate segments, and a focused exact-path Rust regression passes.
This changes Rust source after the corrected-source archive and replay capture,
so those receipts remain valid only for their pinned earlier closure. The
52-case [TypeScript predecessor outcome packet](evidence/rust-migration/r5-arrow-typescript-predecessor-20261027/README.md)
is frozen for all five schema-JSON operations and focused refusals; the opt-in
Node/WASM wire and
exact diagnostic parity are the next implementation gates. No Arrow default
route, installed current-source archive, gap retirement or release claim follows
from the earlier receipts.

### R4 Arrow sdist repair and local Python continuation — 2026-10-27

The two Arrow `include_str!` files are now included in the core sdist source
closure, its retained-source test mirror and the R4 qualification inventory.
The [local R4 packet](evidence/rust-migration/r4-arrow-sdist-local-20261027/README.md)
records a successful core wheel rebuild from the repaired sdist on macOS
arm64, with core sdist SHA-256
`fd7f9cc3598837412f24ceac6f722448c688b776f06f7cfc548dd298073ba428`
and rebuilt wheel SHA-256
`a1c9fc57c0ca1a1d194601a7087f0a67069d7c9c392c3ab082cf17ec97684030`.
Codegen and access sdists also rebuilt wheels. In isolated CPython 3.11.17
and 3.13.16 environments, the selected no-JavaScript codegen, row-scope,
reviewed-change, deployment, migration, access count-frame and package
resource probes passed; the focused sdist/resource tests passed 48/48 per
version with Git and Hatchling available and no Node/Bun on `PATH`.

This is bounded local packaging evidence. The 491-file source audit snapshot
was captured during subsequent Arrow wire/Python wrapper edits and is not an
immutable source-to-artifact identity. The full core Python suite was not
rerun after the packaging fix. A final fixed-point wheel/sdist build, hosted
Python matrix, complete Python semantics and release qualification remain
open; the prior package failure itself is resolved.

### R5 Arrow binding resource decision — 2026-10-27

The first opt-in Arrow wire is stateless and constructs the embedded core
schema, extension grammar and registry for every operation. A pinned private
Node probe measured about 4.1 seconds per call in the debug binding; its
source-to-binary closure was not captured. The direct Rust
[resource-cost packet](evidence/rust-migration/r5-arrow-resource-cost-20261027/README.md)
measured preparation at about 640 ms in release and about 3.3–3.9 seconds in
debug, while 260 calls on one prepared resource value took 528 ms release or
3,643 ms debug with a fresh Context per call. These are local microbenchmarks,
not end-to-end host session results. The initial 52×5 Bun
replay was stopped before completion after more than six CPU-bound minutes,
and its addon was superseded by parity fixes. This is a production latency
blocker for default selection, not a semantic acceptance result.

The production interface will use an explicit Arrow schema session that owns
the prepared resources. Session preparation must be a visible operation under
the caller's work, cancellation and deadline controls; each subsequent call
uses a fresh operation context and its own controls. The existing stateless
wire, Python and CLI functions may remain one-shot and charge their own
preparation. A hidden process-wide cache is rejected because it would move
setup work to an unpredictable call and silently change work admission.
Node/Bun and WASM engines should own explicit native session handles; Python
and CLI can expose session/batch surfaces separately. Verify concurrent handle
safety before sharing a session across threads. Exact 52-case/five-operation
host parity, negative cases and measured setup/steady-state costs remain gates
before any default Arrow route or R8 retirement.

### R5 Arrow opt-in binding checkpoint — 2026-10-27

The five schema-JSON operations now have a tagged UTF-16 core-wire route and
opt-in Rust CLI, Python, Node/Bun and WASM entrypoints. The CLI's empty-`PATH`
import/export and work/deadline controls passed three focused integration
tests. Local CPython 3.11.17 and 3.13.16 wheels passed four focused binding
tests per version, including exact numeric lexemes, warning order and
nonmutating edits. These are source-local tests; the wheels predate later Rust
diagnostic edits and need a coherent rebuild. The complete TypeScript Arrow
test folder passed 33 tests against the unchanged predecessor.

An invalid integer-width fixture exposed a schema diagnostic-order difference:
the predecessor Ajv presents `required` before `properties` within a failed
`anyOf` branch, while ordinary Rust schema validation follows source keyword
order. The Arrow grammar now uses the existing ECMAScript compiler diagnostic
presentation, and a focused Rust core-wire test matches the frozen compact
TypeScript `ARROW_DOCUMENT` message exactly. This presentation choice needs
the complete frozen outcome and real-host replays before it can be qualified.
An explicit prepared-resource session is being implemented for Node/Bun and
WASM; the one-shot wire, CLI and Python routes remain opt-in. No default export
switch, logical gap retirement, integrated SDK claim or release follows from
this checkpoint.

### R8 next binding queue — 2026-10-27

The next short path to cross-host disposition is Core Cardinality's three
logical exports (`inspectCoreCardinality`, `declareCoreCardinality`,
`verifyCoreCardinalityDeclaration`). Rust ownership and installed Node/Bun/
Chromium receipts already cover a bounded 11-case cohort, including one
Rust/WASM call and no reference calls. The current ledger still records all
three logical gaps as open. Add explicit Python and clean-`PATH` CLI bindings,
then review exact host admission/refusal order under CONTRACT-040 and rerun a
source-coherent installed cohort before proposing retirement.

After Cardinality, Schema Properties has four logical exports with strong
earlier installed predecessor evidence but needs current-source recapture and
host-reflection review under CONTRACT-049. CSV Boolean lexical validate and
verify have two logical exports and a narrower CONTRACT-053 surface; their
earlier archive predates the corrected default error envelope and requires a
fresh installed replay. These queues are priorities, not counted retirements.

### R5/R8 binding continuation — 2026-10-27

The source-local [Arrow binding packet](evidence/rust-migration/r5-arrow-schema-bindings-20261027/README.md)
pins 83 source inputs and rebuilt private artifacts. Node 26.12.1, Bun 1.4.3
and real Chromium 153.0.8010.12 each passed 302 exact Rust calls: 52 authored
cases times five schema-JSON operations, plus 16 focused imports and 26
focused operations. Setup/call controls, disposal, exact diagnostics, raw
JSON output and source immutability passed in this opt-in scope. The predecessor
Proxy thrown-object identity case cannot cross the tagged JSON wire and remains
unqualified. The packet is source-local and macOS arm64; it does not establish
installed SDK, native Arrow IPC/data, cross-platform, Python wheel or default
route qualification. The earlier [resource-cost packet](evidence/rust-migration/r5-arrow-resource-cost-20261027/README.md)
is a historical pre-session cohort after the final Arrow wording/format edits.

Core Cardinality now has separate opt-in Python and pure Rust CLI surfaces for
inspect, declare and receipt verification. The Python high-level wrapper uses
the existing restricted PyO3 core-wire entrypoint; it does not widen default
Python APIs. Seven focused Python tests passed against a locally rebuilt
extension; four CLI integration tests passed with an empty `PATH`, and the
existing core-wire acceptance test passed. These are local source tests only.
The fresh final wheel/sdist build and default-route evidence review remain
required before any of Cardinality's three logical gaps can be retired.

Schema Properties now has a corresponding opt-in Python source surface for its
four selected operations, backed by an exact core-wire whitelist and versioned
capability identifier. The focused core-wire test passes 5/5, the Python
extension builds with Cargo, and the copied private extension passes all 7
focused Python tests. Ruff and syntax checks pass. The installed packet remains
Node/Bun/Chromium only and predates this change. Capture a new fixed-point
installed cohort and review current host-reflection ordering under CONTRACT-049
before any route or retirement claim. No default API change or release
qualification is implied.

### R4/R5/R8 current-source qualification checkpoint — 2026-10-27

The generated metamodel, nine action-runtime resources, and nine Codegen
resource mirrors were resynchronized after the Rust core-wire additions.
Metamodel `--check`, both resource `--check` commands, TypeScript typecheck,
the strict unified-client checker, and the Rust boundary census pass. The
complete Rust core library suite passed 474/474; current-source Arrow and
Cardinality CLI tests passed 3/3 and 4/4. The TypeScript Arrow folder passed
33 tests and 3,552 assertions.

The [final local Python package packet](evidence/rust-migration/r4-final-local-package-20261027/README.md)
pins 499 current source files and extracted-sdist Core, Codegen and Access
wheel builds. CPython 3.11.17 and 3.13.16 installed the `cp311-abi3` core
wheel without Node/Bun in the probe path; `uv pip check` and 66 focused
Arrow, Cardinality, Schema Properties, sdist and resource tests passed in each.
After the workflow pin for the edited sdist helper was corrected, both full
installed core Python suites passed: 613 tests and five passing subtests on
CPython 3.11.17, and the same counts on 3.13.16. The affected
artifact-custody/finalizer tests passed 11/11 per runtime. A 499-file source
closure audit still matches the packet. This is local packaging evidence, not
final release qualification.

The [current-source Arrow binding packet](evidence/rust-migration/r5-arrow-schema-bindings-current-source-20261027/README.md)
pins 110 source inputs and rebuilt private Node/WASM artifacts after those
generated-resource changes. Node, Bun and real Chromium each passed 302 exact
opt-in Rust calls; the focused wire suite passed 2/2. Proxy thrown-object
identity remains unqualified across the JSON wire. The bounded
[`selectCoreElements` predecessor packet](evidence/rust-migration/r5-select-core-elements-predecessor-20261027/README.md)
passes in Node, Bun and Chromium with matching outcomes and no external browser
requests; its ten source hashes and capture-script hash verify. It is a
predecessor freeze, not Selection Rust parity.

The current Compact Dataset verification and Security And/Or source replays
passed on Node, Bun and Chromium against one 1,973-input build closure.
The SDK fixed-point probe required regenerating the action-plan producer
identity after metamodel source changes; the action-plan identity `--check`
now passes. Arrow and both source-replay packets were recaptured after
that final generated byte changed, with prior receipts preserved as historical.
Compact used five cases and 14 Rust/WASM calls per host; Security used 68 cases,
30 valid Rust/WASM calls and zero refusal dispatches per host. Their packet
checksums and the regenerated inventory/ledger checks pass. The inventory has
3,375 route declarations; the ledger still has **922 open logical executable
default-route gaps, zero retired**, 81 accepted opt-in mappings and 841 without
an accepted Rust mapping. These are source-replay qualifications only.

The next 13-operation metadata binding/evidence cluster is Cardinality (3),
Facets (4), Schema Properties (4), and CSV Boolean lexical (2). All are
source-selected Rust in the current default roots, but none has a retired
logical gap. The existing 11-case all-Rust Cardinality installed packet is a
single macOS cohort. The retirement gate explicitly rejects bounded `/2`
packets without full CONTRACT-040 acceptance coverage and requires matching
Darwin arm64 and Linux x86_64 fixed-point cohorts. Refresh installed route
evidence, review exact host admission and refusal order, and satisfy both
platform and contract gates before changing any retirement disposition.

The [current-source installed Cardinality packet](evidence/rust-migration/r8-cardinality-installed-current-20261027/README.md)
now binds one private Darwin arm64 SDK archive to a zero-transform 3,574-input
source closure and 1,807 archive members. Node 26.12.1, Bun 1.4.3, and real
Chromium 153.0.8010.12 each passed eleven frozen inspect/declaration/receipt
cases. Every default case made exactly one Rust or WASM dispatch; every
`./reference` case made zero. The focused capture/retirement negative-control
suite passed 13/13, and all 3,574 live source hashes still match the packet.
This establishes bounded current-source route evidence on macOS only. It does
not satisfy the Linux cohort, complete CONTRACT-040 acceptance or retirement
gate, or the release matrix.

### R5/R8 bounded binding and qualification continuation — 2026-10-27

The next opt-in binding slice adds the four public Core Facets operations and
the two public CSV Boolean lexical operations to the shared Rust core-wire,
Python extension, and pure Rust CLI. The binding whitelists reject internal
stages. The Python facades keep tagged-wire conversion and generated-resource
loading explicit; the CLI has bounded stdin, work, and deadline controls.
Focused source tests passed for each family in Rust wire, Python, and CLI,
including an empty executable `PATH` for CLI cases. These are bounded local
binding tests, not installed default-route, native-system, or release evidence.
No logical default-route gap is retired by adding an opt-in surface.

The R8 `/2` retirement validator now requires the complete governing
CONTRACT-040 acceptance packet even when a bounded Cardinality packet reports
all-Rust calls. A rehashed wrong-contract negative control passes. The
current 11-case Darwin Cardinality packet remains valid only for its pinned
source closure; it cannot establish the five-system conformance matrix or
matching Linux cohort. The implementation and release plan therefore remains
open at 922 logical executable default-route gaps and zero retired.

The source qualification order is fixed: settle hand-edited Python/Rust source
and lint, regenerate the metamodel manifest, regenerate action-plan identity,
check resource mirrors and action-source review hashes, then recapture host
replays, R8 inventory/ledger, and installed Python artifacts. A hash receipt
from an earlier source closure is historical evidence, even when its tests
passed. The Python workflow also needs full checkout history for its
artifact-custody tests, which resolve an exact historical commit tree; the
checkout was changed to fetch full history. Hosted CI must confirm this repair.

The post-lint [Arrow packet](evidence/rust-migration/r5-arrow-schema-bindings-current-source-20261027/README.md)
now pins 118 source hashes and passes 302 exact opt-in Rust/WASM calls each on
Node 26.12.1, Bun 1.4.3, and Chromium 153.0.8010.12. A second
[Compact/Security source replay](evidence/rust-migration/r8-symbol-inventory/README.md#post-lint-fixed-point-replay--2026-10-27)
pins one 1,975-file build closure; Compact passes five cases/14 calls per host
and Security 68 cases/30 valid calls/zero refusal calls per host. The
condition-aware R8 ledger was regenerated and checked with 922 logical
default-route gaps, zero retired, 81 accepted opt-in mappings and 841 without
accepted mappings. None of these source-local receipts qualifies a default
route or release.

Hosted Linux preview-archive CI exposed an incomplete private workspace
snapshot: the preview builder omitted `umf-tagged-wire` and
`umf-metamodel-cli`, then failed to resolve the direct browser-root import of
generated WASM glue. The snapshot list and resolver were repaired, and a
private Darwin arm64 preview archive now builds with a pinned source closure.
Its installed Node 26.12.1, Bun 1.4.3 and Chromium 153.0.8010.12 replay
passes, including missing-native and corrupt-WASM refusal controls. The
archive contains 519 members (517 recorded assets) and has SHA-256
`2c4fabd3e1a4c01589aa08fd7feda88e8cefd2f281d63a8f0998cdf9f568b78b`.
This is preview-only, source-built Darwin evidence. Hosted Linux CI must
confirm the same builder repair; it is not a default SDK or release claim.

The refreshed [R4 local package packet](evidence/rust-migration/r4-final-local-package-20261027/README.md)
pins 505 final-source inputs, three extracted-sdist package wheels and their
artifact hashes. Isolated CPython 3.11.17 and 3.13.16 installations each
passed `uv pip check`, 208 focused tests (including all 16 new Facets/CSV
binding tests), and the full 630-test suite plus five subtests. The long
Iceberg replay passed in 347.59 seconds on CPython 3.11; it explained the
earlier interrupted runs and is included in both final full-suite passes.
This is a private local macOS arm64 cohort without Node/Bun in the probe path.
It does not satisfy the hosted six-cohort release matrix or default-route
retirement.

### R8 next slice decision: exact Arrow IPC capture — 2026-10-27

The next bounded adapter slice is CONTRACT-016's three exact-source IPC
operations: `captureArrowIpc`, `exportArrowIpcCapture`, and
`inspectArrowIpcCapture`. The production Rust owner will load the core
validation resources and pinned `umf.arrow.ipc` 0.1.0 package from source,
use one controlled context per call, and preserve the existing envelope and
ordered diagnostics. The opt-in tagged-wire operations are
`arrow.ipc.capture`, `arrow.ipc.export`, and `arrow.ipc.inspect`; capture
receives lowercase hexadecimal source bytes plus the caller's ID, export
returns lowercase hexadecimal bytes, and the Node/Bun/browser wrappers
convert to copied `Uint8Array` values. Python and the pure Rust CLI expose
the same Rust-owned operations. The byte limit is 1,000,000, including empty,
invalid, unsupported, and trailing native content. Unknown extension fields
remain in UMF but block native byte export. Inspection always reports
`complete:false`; it makes no native Arrow validity claim. This is an opt-in
profile, with no default SDK or V4 route change.

The first evidence gate is a frozen TypeScript predecessor corpus covering
the 18 native fixtures, boundary bytes, mutations, malformed capture
envelopes, unknown representation fields, and ordered diagnostics. Rust wire
and CLI tests, Python installed-package tests, and Node/Bun/Chromium exact
replay must use one current source closure. A later native semantic IPC
slice will be separately governed; this capture slice does not implement
`observeArrowIpcCapture`, `exportArrowSchemaIpc`, layout, or data decoding.
The R8 ledger and release gates remain open until current-source installed
artifact and default-route evidence qualifies a complete route.

The parallel Selection review found a separate default-route blocker.
`selectCoreElements` still comes from TypeScript in both V4 roots. The private
Rust host-input route has frozen graph and callback schedules, but arbitrary
caller `Registry` iterables, property traps, resource boundaries, and
installed-package parity are unqualified. CONTRACT-045's cross-document
`documentBoundary` successor is also outside the current local-only selector.
The public Selection route therefore stays unchanged until those behaviors
have an exact cross-host predecessor replay and a declared contract scope.

### R8 Arrow IPC capture checkpoint and next access boundary — 2026-10-27

The CONTRACT-016 exact-source capture slice is implemented as an opt-in Rust
owner in `umf-core`, with a tagged-wire dispatch, pure Rust CLI, installed
Python facade, Node NAPI facade, and browser WASM facade. The Rust context
loads the generated core validation resources and pinned `umf.arrow.ipc`
0.1.0 package from repository source. The operation preserves empty, invalid,
unsupported and trailing bytes, copies exported bytes, rejects more than
1,000,000 source bytes, and refuses byte export if unknown representation
fields have been added. Inspection keeps ordered diagnostics and
`complete:false`. It neither interprets native Arrow IPC framing nor changes
the default TypeScript route.

The frozen [TypeScript predecessor](evidence/rust-migration/r5-arrow-ipc-capture-predecessor-20261027/README.md)
has 23 byte cases, seven mutated envelopes and copy controls. Fresh
[Node, Bun, Chromium and CLI receipts](evidence/rust-migration/r5-arrow-ipc-capture-bindings-current-source-20261027/README.md)
match the bounded packet on Node 26.12.1, Bun 1.4.3, Chromium 153.0.8010.12
and Rust 1.90.0. Each JavaScript host passed 23 cases, seven mutations and 88
public calls, including the exact 1,000,000-byte and 1,000,001-byte boundary;
the independent pure Rust CLI passed 23 cases, seven mutations and 84
operations. Focused Rust wire and CLI tests passed 4/4 and 3/3; seven wrapper
tests passed with 179 assertions. A fresh [installed CPython 3.13.16 macOS
arm64 wheel](evidence/rust-migration/r5-arrow-ipc-python-20261027/README.md)
passed six focused tests, including all 18 authored IPC fixtures, exact-limit
byte equality, over-limit refusal and resource controls. These are private
local source and artifact receipts, not cross-platform release evidence.
`observeArrowIpcCapture`, Arrow schema IPC export, native layout, data
decoding, complete native-oracle conformance, and default-route retirement
remain separate open work.
The raw JavaScript wrong-type error class and cross-realm `Uint8Array`
admission also differ from the TypeScript default and need an explicit
contract decision before any default cutover.

The hosted coordinated Python validation for the previous branch head found
one checker defect: the strict `umf_codegen` per-file import allowlist omitted
`collections.abc` in `_native.py`. The corrected policy continues to scan
every package module, allows that import only for the audited native facade,
and has a negative control that rejects it in `__init__.py`. The local
checker, three focused negative-control tests, and Ruff now pass. Hosted
checks must rerun on the next pushed head; their earlier result does not
qualify this source cohort.

The first [PostgreSQL search-fusion predecessor packet](evidence/rust-migration/r8-postgres-search-rrf-20261027/README.md)
freezes nine replayable Python `_finish` outcomes under CONTRACT-074, including
the admitted `rrf(k=10**400)` path that raises Python `OverflowError` during
score division. Its
candidate production seam is Rust-owned reciprocal-rank score accumulation
and ordering over already-admitted leg observations, with PostgreSQL
execution, row decoding, Pydantic construction, opaque-row Python equality,
and hydration remaining host responsibilities. The exact key-comparison
boundary and arbitrarily large positive RRF constants still need a scoped
decision before implementation. This packet makes no Rust parity or default
route claim.

The source-bound Security And/Or and Compact Dataset V4 replay receipts were
refreshed from one final shared binding-source build. The Compact predecessor's
five outcome payloads are byte-identical to the prior packet; its provenance
index changed with the generated schema source. Node, Bun and Chromium passed
all five Compact cases and all 68 Security And/Or cases per host. Historical
receipts remain preserved beside the current packets. The checked R8 ledger
SHA-256 is `e61d3232e265f08258d58e77fbe6c9b5e1e8903ca7717088305297b2e1c9a879`.
It records **84 accepted opt-in Rust mappings, 838 executable names without an
accepted mapping, 922 logical default-route gaps and zero retired**. The three
Arrow IPC mappings add bounded opt-in ownership; they do not select or retire
any default route.

### R8 next production seam: PostgreSQL reciprocal-rank fusion — 2026-10-27

The next opt-in Rust owner is the pure score-and-order part of
`umf_access.postgres_search._finish` under CONTRACT-074. Python will retain
PostgreSQL execution, decoded Key and row objects, Pydantic validation,
same-snapshot row-equality checks, Python complete-Key comparison, result
construction, and approximate/partial flag aggregation. Its admission layer
will assign a dense identity index to each equality-equivalent complete Key,
derive a Python-sorted key-order index for ties, and pass ordered leg/rank
observations to Rust. Rust will accumulate each `1.0 / (constant + rank)` in
leg order using binary64 and return identities sorted by descending score,
then by the supplied key-order index, truncated to `top_k`. The constant will
cross the binding as a canonical positive decimal integer of at most 4,096
digits, so the admitted
`10**400` predecessor case can retain its Python `OverflowError` outcome.

The first production profile is bounded to at most 10,000 observations and
10,000 distinct identities, with explicit work and deadline controls; it is
opt-in and leaves `_finish` as the default. The initial Python facade admits
only exact built-in string Key components and string rows, so arbitrary Python
equality and comparison hooks remain on the default path. A score request with an out-of-range
identity, nonpositive constant, malformed rank sequence, or exceeded bound
must refuse before unchecked arithmetic. The nine-case Python predecessor
packet governs the initial parity replay. Python-only key/row behavior and
error precedence across a later row disagreement plus an earlier huge
constant remain default-route gates, as do installed-package and cross-host
qualification. No ledger retirement follows from this seam.

### R8 PostgreSQL RRF opt-in scorer: bounded source replay — 2026-10-27

The [RRF evidence packet](evidence/rust-migration/r8-access-rrf-current-source-20261027/README.md)
now exercises the pure scorer through Rust CLI, PyO3, NAPI and browser WASM.
Rust owns rank accumulation and score/tie ordering for dense identities under
profile `umf-r8-access-rrf/0.1.0`. Python retains PostgreSQL execution,
complete-Key and row equality, Key sorting, result construction, and flags.
The default `postgres_search._finish` path is unchanged. The Python facade
admits exact built-in string Key components and string rows, at most 10,000
observations and identities, and a canonical positive decimal constant of at
most 4,096 digits. It explicitly refuses inputs outside that profile.

The installed `umf-core` and `umf_access` wheels on CPython 3.13.16/macOS
arm64 replay all nine frozen predecessor cases with no source-path override:
12 focused tests pass with zero skips and exact `float.hex()` comparisons. The
CLI replays five scorer cases, six refusal controls, and a non-involutive
three-identity tie-order control. The Node v26.12.1, Bun 1.4.3, and Chromium
153.0.8010.12 source replays each pass four frozen successful scoring cases
and the non-involutive tie control with exact binary64 bits. Their shared
build manifest SHA-256 is
`3e88fb576d9bf076415b96263154b86453b9d372b1b7d88fb22651f9fb788f63`;
the source closure SHA-256 is
`86192c24ea6310ccb7d50e9e78045bb928900fe1876b878a244bfd4832e1fa4a`.
The 68-case Security And/Or and five-case Compact Dataset V4 source replays
were refreshed against that same build. All five Compact predecessor outcome
payloads stayed byte-identical; the source index changed for generated schema
provenance. Prior receipts remain archived. The RRF host JS replays do not
exercise the frozen oversized-constant error or Python-only row/key hooks;
the CLI and installed Python replays cover the former. These receipts do not
qualify PostgreSQL execution, a Linux or installed JS cohort, default routing,
or a release.

The next candidate for an actual default-route retirement is `securityNot`
under CONTRACT-062. Its guarded V4 Node/browser route and Rust owner already
exist, but the current ledger pins a historical installed archive. The
retirement validator currently rejects every retirement schema: its `/2`
manifest is deliberately bounded evidence only, and no CONTRACT acceptance
profile is accepted. Before retiring this one logical gap, add a narrowly
scoped `securityNot` acceptance profile with exact 14-case truth, invalid-input,
trace and Rust-dispatch checks; preserve the `/2` rejection and add semantic
negative controls. Then obtain targeted installed Node/Bun/Chromium receipts
for one fixed-point SDK source closure on Darwin arm64 and Linux x86_64. The
existing Linux SDK workflow runs aggregate Security And/Or, not the targeted
`securityNot` packet. No RRF or `securityNot` default-route gap is retired by
this checkpoint; the full-port release gate remains open.

### R8 `securityNot` retirement acceptance and capture preparation — 2026-10-27

CONTRACT-062 now states a narrow, exact 14-case acceptance profile for the
guarded V4 `securityNot` package-root export. The `/3` retirement validator
binds the frozen T/F/U, invalid-input, effect-trace, and Rust-dispatch
expectations to two fixed-point installed SDK cohorts and their Node, Bun, and
Chromium raw receipts. It continues to reject `/2` bounded evidence for
retirement. The packet and raw-replay harnesses are included in the SDK source
closure. A historical macOS arm64 archive smoke replay passed all 14 cases on
each host with observed Rust calls of one for each valid token and zero for
each of the eleven invalid inputs; it does not qualify this changed source.
The Linux SDK workflow is prepared to capture the same raw receipt shape on
its hosted x86_64 job. Fresh matching source-bound archives, durable two-cohort
receipt provenance, positive ledger integration, and independent review are
still required before this single logical gap may be retired. The ledger
remains at **922 open default-route gaps and zero retired**.

### R8 current-source replay and retirement-gate integration — 2026-10-27

The source-built Security And/Or, Compact Dataset V4, and PostgreSQL RRF
Node/Bun/Chromium replays now pass against one immutable build manifest
(SHA-256 `c48aa7bfe8f65129cdaa1c4fa49c6a0c579d3aed970e410d99dcb1b1189312ff`,
source closure `86192c24ea6310ccb7d50e9e78045bb928900fe1876b878a244bfd4832e1fa4a`).
The Security And/Or fixture is separately pinned to current CONTRACT-062 and
source bytes; its 68 cases pass on each host. All five Compact outcome payloads
and its source index stayed byte-identical on regeneration. RRF's five host
cases pass with exact binary64 scores and order. Prior receipts remain under
historical directories. These are source-built bounded replays, not installed
SDK or release qualification.

Sol review found that the first `/3` validator result used `accepted` while
the R8 ledger only recognizes `retired`. The gate now maps fully validated
`securityNot` evidence to two `retired` route dispositions. Its positive test
reduces a fixture to zero logical gaps; negative tests reject stale source,
packet, receipt, case, and route identities. The focused gate tests and full
64-test ledger suite pass. A first fixed-point Darwin arm64 SDK archive
(SHA-256 `5f5943dace4db5d2fb21bf4ee4593b9b796601b7d278ef78ca01a33d6ad7d0be`,
source closure `a9c04b7e73d24c6c0eda94a0d6917c21f0953f117187d859308ec6f295973f51`)
passed all 14 `securityNot` cases in Node, Bun, and Chromium, observing one
Rust call for each valid truth and zero for each invalid input; Chromium had
no Node globals. The ledger-status fix changed an SDK source input after this
archive was built, so that cohort is historical. A new fixed-point Darwin
archive and matching Linux x86_64 cohort, durable two-cohort archive and
receipt provenance, and independent review remain open. The regenerated
ledger SHA-256 is
`afc8da421ae1d68590b8e483801be8fa884a3810e2c00470fecb4bc2f2b8bad2`;
it still records **922 open logical default-route gaps and zero retired**.

The replacement Darwin arm64 fixed-point archive is now captured at SHA-256
`13035f2cec34e1e55c86eb46f5a685cfbf344628575c321e5e36e1d9be52898b`,
with SDK source closure
`5ff72dd348c40122d8e79e10e13dd54f23a484f9b58896ea2038729ec2582e17`
and zero generated-input transforms. Its installed package-root `securityNot`
replay passes the exact 14-case CONTRACT-062 profile in Node 26.12.1, Bun
1.4.3, and Chromium 153.0.8010.12. The three raw receipts, archive member
map, package manifest, and hashes are preserved in
`r8-security-not-retirement-darwin-20261027/`. This is one of the two required
platform cohorts. The hosted Linux x86_64 archive and receipts,
two-cohort validator result, and independent review remain open. The default
route remains unretired; no complete-port or release claim follows from this
capture.

The final Darwin archive also passed the broader installed SDK replay in
Node 26.12.1, Bun 1.4.3, and Chromium 153.0.8010.12. The raw receipt records
31 R3 cases plus numeric, Cardinality, Facets, Keys, Bit128, Compact Dataset,
Security And/Or, route-tamper and missing/corrupt native/WASM checks; it pins
the same archive and source closure and verifies 1,807 archive members. Its
elapsed time was 1,086,195 ms. The receipt is preserved beside the targeted
`securityNot` evidence. A separate local macOS arm64/CPython 3.13.16 offline
rebuild from the corrected `umf-core` sdist produced a verified
`cp311-abi3-macosx_11_0_arm64` wheel with the native extension and bundled
CLI; its artifact verifier passed source-payload checks. The exact sdist,
wheel, and member hashes are recorded in
`r8-python-sdist-arrow-ipc-20261027/`. Neither local result substitutes for
the hosted Linux SDK cohort or the six coordinated Python release cohorts.
The current PR head is `eca698152a3dde440dfebeaa306bb42cade94f82`; its
hosted jobs are queued. A local Docker-emulated Linux x86_64 archive built
from the same `eca69815` snapshot now shares source closure `5ff72dd3`, with
zero transforms and SHA-256
`df1414877895e260ad88222771dd9736aa5d8c1eb69dcc7939f2af11af11c82f`.
Its installed Node 26.12.1, Bun 1.4.3, and Chromium 153.0.8010.12
`securityNot` replays each passed all 14 exact cases and Rust dispatch counts;
package tests passed 9/9 and the installed Core Cardinality replay passed.
The raw receipts and manifests are preserved in
`r8-security-not-retirement-linux-20261027/`. The pinned `eca69815` `/3`
validator was independently rerun against the Darwin and local Linux archives
and all six host receipts; it accepted exactly the Node and browser
`securityNot` routes as `retired` for that historical source closure. The
input and result are preserved with the Linux packet. This is local emulation
evidence for the pinned snapshot, not hosted CI or the changed current source.
Final-source archive qualification and its `/3` validation remain open; the
current ledger default-route gap remains unretired.

### R8 sparse-copy bridge and receipt reproducibility checkpoint — 2026-10-27

The opt-in Rust `copyJson` host-input route now preserves the narrow dynamic
Proxy case in which its descriptor snapshot contains array holes but the
later live density observation accepts the array. Rust carries those hole
indexes with RFC 6901 paths in a versioned result carrier; the Node/WASM
adapters validate the full deletion plan before restoring holes in the
decoded result. Stable sparse arrays still receive the predecessor refusal,
and existing `copy_host_json` callers retain their prior result type. Focused
`host_json` Rust tests passed 31/31. An independently rerun Bun/Node binding
suite passed 16/16, including escaped nested paths, inherited array-index
setters, malformed metadata atomicity, the 100,000-value boundary, and a
4,000,001-unit string. The WASM Bun packet passed; real Chromium
153.0.8010.12 passed 12 comparison cases plus the boundary with zero external
requests. This is opt-in local evidence, not installed SDK or default-route
qualification. The later text-frame transport addresses the measured
long-string cost on this opt-in route. Direct TypeScript `copyJson` imports
remain open.

The [CSV Boolean Darwin packet](evidence/rust-migration/r8-csv-boolean-current-darwin-20261027/README.md)
pins the earlier `eca69815` fixed-point SDK archive and all three installed
hosts to the 44-case validation, 17-case verification, and two Record
presence-control packets. It is one platform cohort only; the two CSV
Boolean logical gaps remain open. The V4 `validateCoreRecordValues` and
`validateCoreSemanticTypeValue` wrapper rows now map their exact declaration
shapes to the existing accepted Rust owners and record source selection as
unqualified. A focused ledger test passed; both default routes remain open
with unproven installed binding status.

The PostgreSQL RRF current-source replay now emits distinct Node/Bun host
identities, runtime versions, packet hashes, and native addon hashes. A
receipt builder verifies the frozen packet, complete source closure, six
build artifacts, host identities, and Chromium WASM pins before writing new
evidence; six focused positive and negative tests pass, including swapped
hosts and stale source, artifact, and packet bytes. The raw harness still
reports a five-case count and mismatches rather than per-case fingerprints.
The final text-frame change sends `copyJson` string chunks as JSON text only
on its opt-in host-input route; other host-json operations retain the tagged
numeric frame. Node and WASM Rust adapters parse the text frame with the
UTF-16-aware reader and enforce the 8,192-unit request and 52 KiB frame
bounds. Focused Node/Bun tests passed 17/17, including the 100,000-value and
4,000,001-unit boundaries; WASM Bun and real Chromium passed their focused
packets. On the same Node addon, a 4,000,001-unit opt-in copy took 13.39–13.44
seconds with numeric frames and 0.584–0.615 seconds with text frames. This is
a local latency result, not a memory or installed-route claim.

After metamodel regeneration and the Compact index refreeze, a combined build
validated 1,994 current source files under closure
`58faa724a3ca71315ab8337a8bc060841ba6a882797a8bbb85a22025f29b270b`
and manifest SHA-256
`7acacd541cb89814ca04f20d3443ac3b166290fac9d4a8bd1173876e8f5d0d87`.
The five frozen Compact payloads remained byte-identical; only their index's
generated schema provenance changed. Fresh Node, Bun, and Chromium replays
against that one build passed RRF 5/5, Compact Dataset 5/5, and Security
And/Or 68/68 with zero mismatches. RRF receipts pin the exact native addon,
WASM binary, glue, frozen packet, host identity, and source closure; Compact
and Security receipts pin the same build and source closure. Prior intermediate
receipts are retained under `historical/pre-final-text-frame-refresh-20261027/`
within the three canonical evidence directories. The inventory now has SHA-256
`7fe469d31fbe0afbdc3244631a45c541222e31f91a07514ac4b9a1cb39988cf1`;
the recaptured condition-aware ledger has SHA-256
`87063695645a4d66ea075a0ae95aa66f0f976509e09dfaaa940fde3d2db8a75d`.
It still reports 922 open logical executable default-route gaps and zero
retired. Two additional exact V4 wrapper shapes are source-selected, raising
the per-root Rust-selected declaration count to 59, but neither has installed
route qualification. The strict per-file Python RRF facade import policy,
its negative controls, the metamodel fixed-point check, typecheck, and access,
unified-client, and Rust boundary checks pass. These source-built replays do
not satisfy installed SDK or two-platform retirement gates.
The old `eca69815` Darwin archive, and any local Linux archive built from
that same snapshot, remain evidence for that revision only. A later
two-platform retirement or release gate needs matching archives from the
final source closure.

The next Record Values retirement gate must use the current operation
2.0.0/core 0.10.0 profile; CONTRACT-049's 1.0.0/core 0.8.0 clause remains
historical. The installed `eca69815` SDK packet exercises only absent versus
present-null controls and records zero Rust calls, so it does not qualify the
V4 `validateCoreRecordValues` route. Build a checked installed-route harness
from the frozen 24 semantic vectors, two resource controls, and 19 raw-host
admission cases. Compare exact output/error JSON, path, trace, getter count,
and per-case default/reference Rust dispatch on Node, Bun, and real Chromium;
include the 100,001-value browser refusal and no-Node-global assertion. Pin
the full source closure, installed package entries, native/WASM artifacts and
packet bytes, then repeat on a clean same-source Linux x86_64 archive before
reviewing any declaration retirement. Memory claims require a separate
measured peak-memory gate: the prior 100,001-value opt-in probe reached about
403 MB in Node and 547 MB in Bun.

### R8 generated identity fixed-point correction — 2026-10-27

The preceding `851f648bb` source-built replay cohort remains in that Git
revision. A clean SDK build of it found one generated-input transform:
`src/extensions/actions/plan-identity.ts` was stale after the metamodel
regeneration. Both candidate platform builds were stopped before qualification.
The generated identity was refreshed in `e9ace728d`; its own `--check` and the
metamodel `--check` pass. This one-file source change invalidated the previous
current-source RRF, Compact, and Security receipts, so all three packets were
replayed against a new immutable build manifest, SHA-256
`2cd9bdb5bb32e43cb76a11fa3074e321e1c24777ff139e139f1311d21172dcff`,
and 1,994-file source closure
`7483d797dbf4a7cbb0dd538e02dca51ab4d7567bcf1939ad6cdb03b38ad87acf`.
Node, Bun, and Chromium pass RRF 5/5, Compact Dataset 5/5, and Security
And/Or 68/68 with zero mismatches. Compact Node/Bun record 14 Rust calls each;
Security records 30 valid Rust/WASM calls per host and zero refusal dispatch.
The prior packet is preserved in commit `851f648bb`; redundant duplicate
history directories were omitted. The symbol inventory remains SHA-256
`7fe469d31fbe0afbdc3244631a45c541222e31f91a07514ac4b9a1cb39988cf1`;
the corrected-head ledger SHA-256 is
`8ec94b124f9fcb629539ec7c7bd122e489d8efe10d9323f87dd7dbc5beb53a8b`.
The ledger still records 922 open logical executable default-route gaps and
zero retired.

The corrected `e9ace728d` Darwin arm64 SDK archive has zero transforms across
3,595 source inputs, source closure
`a53fba2dcf8edb4907de646040e446f95c6af7c13b6f6abd165dcdde5a893c25`,
archive SHA-256
`accf61b39c4213ab452fbfff4fe1a31b950934a36c321c74984df45088adcd6c`,
and 1,807 verified members. Its installed Node 26.12.1, Bun 1.4.3, and
Chromium 153.0.8010.12 `securityNot` replays each pass the exact 14 cases:
one Rust call for T/F/U, zero for the 11 invalid inputs, no reference Rust
calls, empty getter/Proxy traces, and no Node globals in Chromium. The full
source and member maps and case-level receipts are preserved in
`r8-security-not-current-darwin-20261027/`. The clean Docker-emulated Linux
x86_64 SDK archive has the same 3,595-input fixed-point source closure and
zero transforms, SHA-256
`dc3ec269f99266862ea078e23d166c4b50e30cc5b1fd0ef3cf337982b31bd93a`,
and 1,807 verified members. Its installed Node, Bun, and Chromium replays
also pass all 14 cases with the same dispatch and host-effect constraints.
The [Linux packet](evidence/rust-migration/r8-security-not-current-linux-20261027/README.md)
contains the complete source/member maps and raw receipts.

The current-source two-cohort `/3` validator accepted exactly the default
Node and browser `securityNot` rows as `retired` for this pinned archive pair;
its conditional ledger leaves 921 logical executable default-route gaps.
The frozen packet, source closure, member maps, archive hashes, and all six
host receipts were checked, and four tamper controls were rejected. The
checked default ledger remains at 922 open/zero retired because its normal
invocation supplies no archive evidence. The exact local validator input and
result are preserved in the Linux packet. This bounded result does not
qualify the wider Security API, hosted CI, or an SDK release.

The installed Record Values probe is now a reproducible, two-platform packet.
The [Darwin](evidence/rust-migration/r8-record-values-current-darwin-20261027/README.md)
and [Docker-emulated Linux](evidence/rust-migration/r8-record-values-current-linux-20261027/README.md)
archives share the exact 3,595-input fixed-point source closure above. Their
installed Node 26.12.1, Bun 1.4.3, and Chromium 153.0.8010.12 harnesses use
the same frozen 24 semantic vectors, 19 raw-host admission cases, and pinned
runner bytes. Each host matches exact default/reference outcomes and getter
traces, with 24 semantic plus 20 raw default Rust dispatches and zero reference
dispatches. The browser also retains 700,000 units of opaque content and
rejects 100,001 values with `UmfError LIMIT` at `/99999` on both routes; it
loads the packaged WASM and has no Node globals. Sol independently reran both
packet verifiers and checksum lists; Linux and Darwin Node/Bun semantic and
raw-host receipt payloads are byte-equivalent, and Chromium result payloads
differ only in the platform user agent. These are local, bounded results. The
Record Values `/3` retirement acceptance profile, memory-bound evidence,
hosted CI, and release qualification remain open; `validateCoreRecordValues`
is not retired.

For the next self-contained default-route cut, `declareCoreBit128Field`
accepts current core 0.10.0 only; core 0.9.0 is historical context, not an
accepted source version for this helper. CONTRACT-076 now states this
production boundary, and a focused test accepts 0.10.0 and refuses 0.9.0.
Callers must explicitly migrate before authoring. Freeze current result,
refusal-order, and unknown-content evidence before selecting a Rust route.
`generateDomainPackSchema` is a candidate pure Rust generator under
CONTRACT-052, with the checked-in Draft 2020-12 schema as canonical authority.
First freeze exact object and byte-order parity, unknown-field preservation,
and browser behavior; then replace the two default-route executable bindings
while retaining the explicit TypeScript reference route. This candidate has
no accepted Rust mapping or retirement evidence yet.

### R8 Record Values acceptance and next resource cut — 2026-10-27

The public `validateCoreRecordValues` contract is now explicitly the current
operation 2.0.0/core 0.10.0 profile in CONTRACT-049; the 1.0.0/core 0.8.0
clause is historical. The current source warning scope, order, and
incompleteness rules are recorded without claiming that the old profile is
reachable through the public export. A separate `umf.r8.record-values-bounded-evidence/1`
validator pins the reviewed `e9ace728d` Darwin/Linux archives, exact frozen
24-case semantic and 19-case raw-host packets, runner bytes, six host receipts,
Rust dispatch totals, and browser resource controls. Eleven focused positive
and tamper tests pass. It returns `not-retirable`; the `/3` retirement path
explicitly rejects Record Values until current-source acceptance and measured
memory qualification exist. Both default-route rows remain open.

The Rust Record Values finalization now validates its already-owned result
without another deep copy. Borrowed validation preserves the `copy_json`
limit, path, duplicate-key, number, and work-meter order. Its parity unit test,
the focused Record Values integration test, and the public source tests pass.
The Linux container `umf-core --lib` suite passed 479/479 after this change;
the pinned e9 source files were restored in that evidence container afterward.
The one-shot pre-edit 100,001-null refusal probe on the pinned e9 archive
returned `LIMIT` at `/99999`; Node's observed process high-water increase was
about 212 MiB and Bun's about 766 MiB after their warm baselines. Those
numbers are preliminary observations, not an upper bound. A fresh package
and measured peak-memory profile remain required before retirement.

The next pure resource candidate now has an opt-in Rust-owned immutable
`umf.domain-pack` 1.0.0 schema snapshot with Node, WASM, and CPython entry
points. The Rust core tests, all three binding compile checks, native Node,
CPython 3.11/3.13, and real Chromium WASM local probes pass exact canonical
structure, isolation, and unknown-version refusal. See the
[bounded candidate packet](evidence/rust-migration/r5-domain-pack-schema/README.md).
The TypeScript schema generator and public defaults remain authoritative.
Installed package, Linux, pure Rust CLI, and generator ownership gates remain
open. Metamodel outputs were regenerated after the Rust edits and `--check`
passes. No release gate is closed by these local probes.

### R8 refrozen source and measured-process checkpoint — 2026-10-28

The Compact verifier, Security And/Or and opt-in PostgreSQL RRF packets were
replayed on a single fresh source-built native/WASM cohort (manifest SHA-256
`ef5ff50e418a7060a2df814a226f9f66f7d4d3387a7b6a9d9622b092d9aa7f43`,
source closure SHA-256
`eb0a8cff53696e211dbec2b707751e1d872adc661906084986bad50914923618`).
Node, Bun and Chromium passed all five Compact cases, 68 Security cases and
five RRF scorer cases. The preceding top-level packets are retained under
dated `historical/pre-domain-record-refreeze-20261027/` directories. This is
source-built replay evidence; installed archive and complete semantic parity
remain separate gates.

The [Record Values process-memory packet](evidence/rust-migration/r8-record-values-memory-20261027/README.md)
records five fresh processes per Node/Bun runtime and retention/refusal control
on the pinned `e9ace728d` Darwin archive. One native dispatch per call, the
700,000-unit opaque return, and the exact `LIMIT` refusal at `/99999` passed.
The observed process high-water RSS increase was 53–58 MiB for Node retention,
216–239 MiB for Node refusal, 63–297 MiB for Bun retention, and 463–839 MiB
for Bun refusal. These are local observations without an accepted ceiling;
they do not measure the newly optimized current-source build. The Record Values
retirement gate remains closed until current-source installed, Linux/Chromium,
contract acceptance, and resource qualification are reviewed.

The unified-client boundary checker now scans every `src/access` source file
with exact per-file import and type-only allowances, rejects unlisted files,
new imports, dynamic imports, external import-equals, and named host hooks.
Its 20 negative/positive tests and source check pass. This is a static source
guard, not an execution sandbox. The current R8 ledger still reports 922
logical default-route gaps and zero retired; bounded opt-in mappings and
source-selected declarations do not remove a gap by themselves. Draft PR #61
and the full R4–R8 release goal remain open.

### R8 computed domain-pack schema generator and artifact path — 2026-10-28

CONTRACT-052's `umf.domain-pack` and `umf.dataset-source` 1.0.0 schema
builders now have ordered, pure Rust implementations. The Rust core tests
compare their compact structure and canonical pretty JSON bytes with the two
checked-in Draft 2020-12 schemas; the generated versioned accessor refuses
other versions at `/version`. The opt-in Node and WASM string bindings render
the computed value through the ordinary resource context, preserving exact
canonical pretty bytes and a final LF. CPython converts the computed value to
fresh Python containers after ordinary JSON admission, preserving integer
values. Focused native Node 26.12.1, CPython 3.11.17, and real Chromium
153.0.8010.12 probes pass canonical parity, isolation, and version refusal;
the browser probe also confirms Node globals are absent. All three binding
crates compile offline with pinned Rust 1.90.0. These are local opt-in checks,
not installed-package or Linux qualification.

`umf domain-pack schema --kind domain-pack|dataset-source --version 1.0.0
[--pretty]` is the source-built, read-only Rust CLI interface. Focused CLI
tests pass exact compact/pretty bytes and malformed-argument refusals.
`scripts/domain-pack-schema.ts` now obtains both schemas from that pinned,
offline CLI and only composes the two extension-package manifests with the
generated current core version. Its real `--check` verifies all four existing
artifacts byte-for-byte; three negative controls prove a failed Rust call
prevents any write and missing or stale check output remains untouched. The
R8 resource-authority mapping now names the Rust builders and CLI together
with the TypeScript manifest wrapper; the checked-in ledger has been regenerated after the fixed-point replay below.

The TypeScript reference schema builders remain available through
`./reference`. The Node and browser V4 default roots now select Rust schema-graph
providers for both public generators, then restore the predecessor's JSON
Pointer identity classes. The [R8 route packet](evidence/rust-migration/r8-domain-pack-schema-default-route/README.md)
records complete schema parity, exact live-reference alias-class comparison,
Rust provider call counts in Node and Bun, matching public names and zero arity,
and real Chromium execution with no Node globals. Its private fixed-point
source build used manifest SHA-256
`158359c4cf8f8c28ecdafec3eb4195e587617d7c4a3307aa75a5369fc34793e6` and source
tree SHA-256
`5434635cf74a948bec17601bd3b150703073dfa87bd94193e66cdfbe452911c9`; the
locally unpacked private archive SHA-256 is
`e8f4be0486d26af1cc2f437de7045d9dbfbaa5c8dcc2a4123603d83c52b68c1a`. These are
bounded private observations, not release-grade installed qualification.

The fresh shared current-source replay binds the Compact, Security And/Or, and
RRF packets to manifest SHA-256
`45116162b154da756e3abee5bd59fca9da345b761fd20c91e72891196f328209` and source
closure SHA-256
`9eb6c681a5cabf35d94394b2def87a159c15777b58877dc0070003fb16e71130`. Node
26.12.1, Bun 1.4.3, and Chromium 153.0.8010.12 passed five Compact, 68 Security,
and five RRF cases. The refreshed inventory SHA-256 is
`213ca1b06ede7adb9f9eb0c92b1244f8bd23eff25d00168bc792cc79ef448383`; the
condition-aware ledger SHA-256 is
`ac47b3d0bdb2bda33d276101d262e822f340b3c2df736c969aed10990adf31d7`. It records
922 open logical executable default-route gaps and zero retired, 84 accepted
opt-in Rust operation mappings, 838 unmapped names, and 61 source-selected
declarations per V4 root. The schema and replay packets do not establish
complete Dataset/Security semantics, declaration retirement, or release
qualification.

### R8 five-schema default-route checkpoint — 2026-10-28

The Node and browser V4 default roots now select Rust graph providers for the
five public schema generators: `generateDomainPackSchema`,
`generateDatasetSourceSchema`, `generateArtifactCollectionSchema`,
`generateDomainPackLoaderSchema`, and `generateLoaderInventorySchema`. The
TypeScript reference route remains explicit. Node and Bun each observed two
direct provider calls per generator. Real Chromium passed exact public schema
parity and predecessor alias-identity checks with the adjacent WASM build; the
probe observed no Node globals or external requests. Direct WASM provider call
counters were not observed, so the browser result establishes public behavior,
not the internal provider invocation count.

The fixed-point private SDK source closure is
`f767e90fe77adec74f85358c7d7d0b775a84d35fd5dd445b002da5a51026f231`, covering
3,610 files and 1,802 assets; its canonical archive SHA-256 is
`76413795b9f4fa551f5cd401f9d22440511bdfedc65a6055390df87819a0d9c1`. The
verified [bounded route packet](evidence/rust-migration/r8-domain-pack-schema-default-route/README.md)
has receipt SHA-256
`1c192d0246a85c8c12de39b37b40e119026b692dade2db249e5aace2c689b19a`. Its
private installed-archive observations establish this Darwin arm64
Node/Bun/Chromium cohort only; Linux and release qualification remain open.
The current ledger records 65 source-selected declarations per default root,
922 logical default-route gaps, 84 accepted opt-in Rust mappings, 838 unmapped
names, and zero retired gaps. The current inventory SHA-256 is
`eced450d39b6e2eade2354cc549300179fc9a763183dd56d2d1af138bb662424`; the
condition-aware ledger SHA-256 is
`14a9de59c1a5d37390f5eab7a8900945c2eecd74b8cf626ec773d46aa79d9ba5`. R4–R8,
Linux qualification, full-port, and release gates remain incomplete.

The installed SDK replay for this fixed-point archive then passed Node
26.12.1, Bun 1.4.3, and Chromium 153.0.8010.12 in one run. It exercised
31 R3 cases, 66 cardinality, 19 facets, 14 keys, 11 bit128, 19 Compact
Dataset, and 68 Security And/Or cases, plus missing/corrupt native and WASM
asset controls. The local receipt SHA-256 is
`c618475bd0ba6cb6c715f70117b8babb8011f8bb862c5239b3abcaf7dcf5a7ae`.
Subsequent source changes require a new archive and replay before this can
count as current-source qualification; this remains a Darwin arm64 cohort.

The next bounded candidate, public `inspectDomainPackLoader`, is now selected
by the Node and browser V4 default roots, governed by CONTRACT-057. Rust owns
metadata admission and completeness diagnostics. Canonical structural
validation precedes duplicate-artifact and required-closure checks; unknown
annotations are retained. The host wrapper preserves malformed and non-JSON
input behavior and does not resolve paths, execute companions, or fetch
resources. Focused Rust, Node binding, host-wrapper, typecheck, and WASM-target
checks passed; independent review found and resolved UTF-16 surrogate,
deep-annotation, and catalog-profile admission differences. The exact-source
ledger guard records selection but marks this operation unqualified pending a
tracked fixed-point installed Node/Bun/Chromium parity packet. It has no
accepted ownership mapping or gap retirement.

### R4 hosted Python cohort gate restoration — 2026-10-28

The nonpublishing coordinated-Python workflow now requests all six
Linux x86_64 and macOS arm64 cohorts at the governed CPython 3.11.17,
3.12.15, and 3.13.16 patches. The macOS jobs use uv 0.13.3 managed CPython
because `setup-python` does not currently publish Darwin arm64 distributions
for the first two exact patches; the runner, interpreter implementation,
architecture, and patch are checked before building. Both hosts set
`PYO3_PYTHON` to the selected interpreter. Each installed wheel pair now runs
the R4 ELF/Mach-O dependency-closure checker over its native extension and
CLI, and the same-run aggregate verifier requires the pinned checker source,
complete per-cohort reports, and all six receipts. A synthetic six-cohort
aggregate and 51 targeted verifier/workflow tests pass locally. This is a
reviewed workflow candidate only: no hosted six-cohort run has passed, so R4
release qualification remains open. A later local current-source package
receipt now covers a 510-file closure and two macOS Python versions; it does
not replace the hosted six-cohort gate.

The coordinated-pair receipt now also pins the exact R4 binary-closure
verifier source, which the six-cohort aggregate compares with its checked-out
source. The expanded local pair/matrix/custody/binary-closure suite passed 67
tests and five subtests under CPython 3.13.16. The local package receipt
`r4-current-source-local-package-20261028` now passes for its 510-file closure
and two macOS Python versions. Hosted six-cohort wheel/sdist qualification
remains open.

### R8 current fixed-point route cohort — 2026-10-28

The current canonical SDK archive is `56f2ed6c5e5647c94337b8ee36f8b62e662fd6423ca1c7ef9763739d8a211fe9`, built with zero source transforms from source closure `d7cae37e060e960d94b054872c342042d1a088d6dec2cbb7366b094d2395e96c` (3,629 inputs). The schema-graph, loader-inspector, and profile route packets were rebuilt and validated against that same archive and source closure. These establish a private Darwin arm64 installed cohort, not release qualification.

The five schema graph exports passed Node/Bun parity and real Chromium public-output checks; Node and Bun observed two native provider calls per operation. Chromium fetched WASM with no external requests or page errors, while direct WASM provider counters remain unobserved. `inspectDomainPackLoader` passed 11 cases, with eight native dispatches in each of Node, Bun, and Chromium WASM; wrapper-rejected values produced zero dispatches, and Chromium had no external requests or page errors. `inspectDomainPack` and `requireDomainPackProfile` passed 31 cases and 42 native/WASM dispatches per host, including admission-refusal controls, with Node/Bun parity and isolated Chromium execution. All packets pin source closure, archive member hashes, metadata, and negative controls; the profile validator passed in both async and sync modes.

The current inventory SHA-256 is `fae3c85996956d8b8630f6cb4333704d674be40e522e2151421bc43f4bc65798`; the ledger SHA-256 is `dbdfe36acda3c4c72debfb759403bf94fcdb0ee7eab5ade582917933b0af2b02`. It records 922 logical default-route gaps, zero retirements, 134 Rust-selected source declaration rows (67 per default root), and 13 bounded current-source route names. Inspector and profile rows retain `acceptedRustOperation: null`; no route packet retires declarations. Linux, full-port, and release gates remain open.

The [broad installed SDK receipt](evidence/rust-migration/r8-current-broad-installed-sdk-20261028/README.md) then passed Node 26.12.1, Bun 1.4.3, and real Chromium 153.0.8010.12 against that same archive. It covers the 31-case R3 generator corpus, the named numeric, cardinality, facets, keys, Bit128 and Compact Dataset subsets, Security And/Or 68 cases, package-route tampering, and missing/corrupt native and WASM controls. This is a local Darwin arm64 installed cohort; the hosted Linux SDK job remains open.

CONTRACT-059, TD-078, and STP-078 govern the SEC projection 2.0.0 tranche. Its Rust core implementation parses raw UTF-16 units, retains numeric tokens and unknown fragments, validates every row before applying a 32 Mi UTF-16 output ceiling, and materializes the ordered response in a second pass. Frozen predecessor and admission vectors, two independently pinned SEC source files, parser/root precedence, a late-invalid-row control, and end-to-end output lengths at cap minus one, cap, and cap plus one pass focused Rust tests. The production Python wrapper, explicit `UMFSEC2\0` UTF-16LE framed CLI route, and Node/Bun and browser WASM candidate bindings are implemented. The [installed Darwin evidence packet](evidence/rust-migration/r8-sec-projection-candidate-installed/README.md) pins a zero-transform SDK archive and passes candidate/reference parity within Node 26, Bun 1.4, and Chromium 153; all three pass the exact output-cap and late-invalid controls, plus missing/corrupt native and WASM controls. A locally built abi3 wheel installed on Darwin arm64 CPython 3.11.17, 3.12.15, and 3.13.16, with its packaged CLI, passes the same cap and refusal controls; 8,000-observation child processes measured 84,328,448, 85,032,960, and 86,409,216 bytes peak RSS, respectively. Browser process-tree RSS is sampled with the limits documented in the packet. The V4 SEC default exports still select the TypeScript reference route. The reviewed correction is covered by a rebuilt fixed-point SDK packet and local installed wheel; hosted six-cohort Python, Linux SDK, complete route qualification, and release gates remain open. This tranche does not change the 922-gap retirement count.

The next parallel bounded pilot is `readDescriptorSet` from CONTRACT-003. The existing Rust codec and raw-byte Node/WASM bindings accept an exact `Uint8Array` window. A private 14-vector comparison found matching success/failure classes and error codes but different malformed-wire messages from the Buf predecessor; only the `LIMIT` message matched exactly. Outside the declared byte-array signature, the TypeScript predecessor also has distinct null, string, Array, and `Uint16Array` admission behavior. The tracked candidate may preserve the declared byte-array route with explicit contract-directed diagnostic qualification, but exact full-predecessor parity and default-route retirement remain open. The explicit `./reference` route remains available. The [installed Darwin candidate packet](evidence/rust-migration/r8-protobuf-descriptor-candidate-installed/README.md) now passes the 14 declared-byte vectors on Node, Bun, and Chromium from the same fixed-point SDK archive as the SEC candidate, with exact success values and unknown-wire preservation plus native/WASM asset refusal controls. It records malformed diagnostic-message differences and does not qualify other host inputs, the default route, Linux, or release.

The next default-route Key Tuple cut selects `readCoreKeyTupleBytes` and
`prepareCoreKeyTuples` through the retained Rust runtime on both V4 roots. A
small public facade restores the predecessor's `UmfError` class for branded
native errors and retains host-thrown errors. The [installed Darwin packet](evidence/rust-migration/r8-core-key-tuple-default-installed/README.md)
passes Node, Bun, and Chromium on a fixed-point SDK archive, including frozen
reference parity, receipt-before-current refusal, prepared copy/freeze,
missing-asset controls, and an independently checked four-million-byte Rust
read. The reference receipt regex cannot process that extreme receipt on
these hosts, so the boundary evidence is qualified separately. The strict
unified-client checker still scans every `src/access` file with exact per-file
import grants and negative controls for new imports and host roots. The
public Record Values contract remains operation 2.0.0/core 0.10.0; a focused
test rejects the historical core 0.8.0 source, and its exported result type
is narrowed to 2.0.0. The current ledger still has 922 logical default-route
gaps and zero retired declarations. Linux and complete R8/release gates remain
open.

Independent SEC review found a source-ID precedence mismatch in the CLI and
a missing length precheck before Node buffer copying. The current source
corrects both: an overlong source ID reaches core as an invalid identity only
after JSON parsing, without allocating the oversized ID. Focused CLI and
native tests cover malformed input before the source-ID error. A rebuilt
fixed-point SDK packet and macOS arm64 abi3 wheel now pass the corrected
source-ID admission on Node, Bun, Chromium, and installed CPython 3.11.17,
3.12.15, and 3.13.16 with the packaged CLI. Hosted Linux and full release
qualification remain open.

The [current broad installed SDK packet](evidence/rust-migration/r8-current-broad-installed-sdk-sec-key-tuple/README.md)
passes Node 26.12.1, Bun 1.4.3, and real Chromium 153 from the same
zero-transform archive as the refreshed SEC and Key Tuple packets. It covers
the R3 generator corpus and named numeric, cardinality, facets, keys, Bit128,
Compact Dataset, and Security And/Or subsets, plus route tampering and
missing/corrupt native/WASM controls. This is a private Darwin arm64 cohort;
hosted Linux and release gates remain open.

### R8 schema graph and loader-inspector mapping/retirement gates — 2026-10-28

The earlier five-schema packet covers `generateDomainPackSchema`,
`generateDatasetSourceSchema`, `generateArtifactCollectionSchema`,
`generateDomainPackLoaderSchema`, and `generateLoaderInventorySchema`; the
loader-inspector packet covers `inspectDomainPackLoader` under CONTRACT-057.
Their pinned receipts are
`1c192d0246a85c8c12de39b37b40e119026b692dade2db249e5aace2c689b19a` and
`5e5138d7d614b474bc41f9743cbf9c5d6ccb8051ae01b1a1fb57cd01cba3af4b`,
respectively. These receipt identities preserve the earlier private Darwin
arm64 route observations described above; they do not establish current-source
qualification. Re-running both fixed-point validators against this checkout
fails on source drift at `bindings/core/node/index.d.ts`, so fresh packets
bound to the current closure are required before either route claim can be
reused as current evidence.

The five generators each have a Node and browser V4 root declaration plus the
separately retained TypeScript implementation/reference declaration. The
inspector has corresponding Node and browser `inspectDomainPackLoaderOperation`
root bindings and the TypeScript reference implementation. These six
operations are source-selected to Rust, but their inventory rows still have
`acceptedRustOperation: null`; no explicit accepted mapping has been recorded.
Acceptance therefore still requires reviewed row-to-operation ownership in the
R8 accepted-mapping ledger and evidence bound to current source, native core,
wire and host bindings, and the named versioned contract. The five-schema
receipt observes two native calls per operation in Node and Bun and exact
public-output/alias behavior in Chromium, while its direct WASM call count is
unobserved. The inspector's earlier packet has eleven parity cases and eight
observed native/WASM dispatches per host, with rejected-wrapper inputs
dispatching zero times. Those are bounded operation observations, not
complete adapter or release claims.

Retiring any of the six default-route declarations has a stricter gate than
accepting its bounded ownership mapping. The retirement validator requires an
exact frozen operation packet tied to the current contract and Rust owner,
current fixed-point source closure, verified Darwin arm64 and Linux x86_64
archives/member maps, and Node, Bun, and Chromium default-versus-reference
case receipts in both cohorts with the required per-case dispatch traces. It
retires only the exact Node and browser rows while retaining the TypeScript
`./reference` row. The existing schema packet has neither the per-case
Chromium WASM dispatch trace nor the Linux cohort; the inspector packet lacks
the Linux cohort and retirement-profile receipts. As a result all six
operations remain unmapped in the accepted ledger and all twelve default-root
rows remain open for retirement. The previous source-bound inventory and
ledger counts above are historical snapshots; no new counts are asserted by
this checkpoint.

### R8 SEC default-route and current resource checkpoint — 2026-10-28

The V4 Node and browser roots now select the Rust `projectSecSubmissions` and
`projectSecCompanyFacts` functions as their ordinary exports. The generated
shared V4 facade omits the predecessor exports; `./reference` retains them.
The [installed SEC default-route packet](evidence/rust-migration/r8-sec-projection-default-installed/README.md)
passes Node 26.12.1, Bun 1.4.3, and real Chromium 153 on a zero-transform
private Darwin arm64 SDK archive. Its archive SHA-256 is
`6cace7b4dcca7dd7684349754f2633597d5a9c6afe959c73047a9b89b260fe9f`,
source closure SHA-256 is
`1ba919b661ae36490b6f633dcafb9fe106c6c58d122a0881122e55fde7ff9031`,
and receipt SHA-256 is
`882acb9edf259d5829c1ae6628f363fa80b85a59c1f0975c646c5457170547c6`.
The installed defaults match both Rust candidate aliases and the TypeScript
reference on the frozen cohort; each host passes the exact 32 Mi UTF-16 output
boundary, late-invalid-row precedence, and missing/corrupt asset refusal.
Independent review found no material overclaim in the bounded packet. This
does not qualify Linux, the full SEC API, complete Python release cohorts, or
the R8 declaration-retirement gate. Both default-root declarations remain
open in the ledger.

The [broad installed SDK packet after SEC default selection](evidence/rust-migration/r8-sec-default-broad-installed-sdk-20261028/README.md)
passes Node 26.12.1, Bun 1.4.3, and real Chromium 153 against that same
archive and source closure. Its receipt SHA-256 is
`6c60d95abce300d497f0743e69ad95081a4fc0bb3b62f948471010b0574be668`.
It covers the frozen R3 generator corpus, the named numeric, cardinality,
facets, keys, Bit128, Compact Dataset, and Security And/Or subsets, package
route tampering, and missing/corrupt native and WASM asset refusal. This is a
single local Darwin arm64 cohort; it does not close hosted Linux, full API
parity, declaration retirement, or release qualification.

The [current JSON resource authority review](evidence/rust-migration/r8-symbol-inventory/current-unresolved-json-resource-authority-20261028.md)
leaves five resource files explicitly unresolved. The current metamodel build
manifest does not identify their exact output paths as generated authorities;
historical writer evidence does not establish authority for this source cut.
Do not infer resource retirement from the broad runtime category or assign a
writer until the current build dependency and provenance are traced.
The [current-source resource pin](evidence/rust-migration/r8-symbol-inventory/current-unresolved-json-resource-authority-source-pin-20261028.md)
adds a deterministic guard for all five file hashes, their ledger rows, and
their absence from the metamodel manifest. It leaves each authority unresolved
and makes no retirement claim.

The [dedicated-entry `readJsonValue` replay](evidence/rust-migration/r8-read-json-value-ordinary-20261027/package-parity.md)
now matches 17 of 18 primitive-string cases on both Node 26.12.1 and Bun
1.4.3 with a freshly rebuilt release addon. Rust now uses the facade's
observable live `JSON.parse` preflight rather than repeating a native JSON
parse; this closes the duplicate-key diagnostic and lenient-override
mismatches in that exact packet. The inherited array-index setter still has
five predecessor calls versus zero in the Rust path. The packet is an opt-in
native spike, with no browser, arbitrary-host-value, installed SDK, or
default-route qualification. Keep `readJsonValue` on its TypeScript default
and preserve the mismatch in the acceptance set. The
[inherited-setter source oracle](evidence/rust-migration/r8-read-json-value-inherited-setter-source-oracle-20261027/README.md)
attributes the five calls to distinct parser phases and a callback catch
boundary. A causal Rust replacement needs phase-aware host callbacks at those
writes with the same throw order; a post-parse call count cannot qualify the
route.
The [Rust parser-seam assessment](evidence/rust-migration/r8-read-json-value-inherited-setter-rust-seam-design-20261028.md)
records the exact observed setter and throw boundaries and the evidence needed
before a faithful callback design can be implemented.

The coordinated Python release workflow now triggers on changes to its
binary-closure negative-control suite and runs all 16 tests on the aggregate
Linux verifier host. The suite passes locally under CPython 3.13.16; the
pytest-based coordinator/matrix suite was unavailable in the offline local
environment. The hosted six-cohort wheel/sdist run remains queued and no
R4 release qualification follows from this workflow correction.

The next independent Python-access ownership slice to freeze is
`TargetPin.matches` in `python/umf_access/src/umf_access/catalog.py`, under
CONTRACT-071/072. Its current Python implementation compares five exact
identity fields, requires equal platform-component counts, and checks each
observed `(name, version)` against the pin's qualified versions. Rust can own
the closed identity/pin matcher while Python retains `target.identity()`,
artifact calls, dispatch, and Pydantic construction. Existing catalog and
target-verification tests were supporting coverage only. The new
[13-case direct Python predecessor packet](evidence/rust-migration/target-pin-python-predecessor-20261028/README.md)
freezes the current method, including an observed duplicate-name defect: two
`driver` observations can satisfy a two-component pin even when `server` is
absent. CONTRACT-072 says a target identity equals its pins; resolve whether
to reject duplicate platform names in the Python boundary before porting this
behavior to Rust. Freeze result/error order and `ReadPlan.bind` host-call timing
separately. The [six-case direct Python `ReadPlan.bind` packet](evidence/rust-migration/read-plan-bind-python-predecessor-20261028/README.md)
now freezes selection, errors, and ordered artifact, identity, platform, and
parameter-model observations around the matcher without changing the
duplicate-name policy. No default Python route or R5 ownership claim changes
at this checkpoint.

The duplicate-name policy is now resolved in CONTRACT-072: pin and observed
platform component names must each be unique. The Python matcher rejects
duplicates before any Rust ownership change. Four current direct regressions
and the unchanged historical predecessor packet pass together (five tests).
The packet's formerly accepted duplicate case remains historical evidence.
Full `ReadPlan.bind` host timing and the installed route remain open.

The [opt-in Rust target-pin candidate](evidence/rust-migration/r8-target-pin-rust-candidate-20261028.md)
now implements the closed matcher in `umf-core` and exposes it through a
separate exact-carrier PyO3/Python wrapper. The Rust suite passed 2/2 against
the unchanged 13-case predecessor packet under the approved duplicate policy;
the CPython 3.13.16 candidate suite passed 6/6 against a source-built native
library. Public `TargetPin.matches` still uses Python, and installed wheel
qualification and `ReadPlan.bind` host timing remain open.

The [ReadPlan.bind seam review](evidence/rust-migration/r8-read-plan-bind-rust-seam-design-20261028.md)
found and corrected an extra `identity.platform` observation introduced by
the first duplicate-name fix. The current Python matcher rejects duplicates
but preserves the historical two-read host order in the frozen six-case bind
packet; all six outcomes and ordered traces pass. Moving complete bind
orchestration to Rust requires lazy callbacks for Python validation, artifact,
identity, match, selected artifact and Pydantic construction, with injected
exception controls. No Rust bind route is claimed by this review.

### R8 source-coherent `securityNot` retirement replay — 2026-10-28

The [Darwin arm64](evidence/rust-migration/r8-security-not-current-darwin-20261028-df7fbaa2/README.md)
and [Docker-emulated Linux x86_64](evidence/rust-migration/r8-security-not-current-linux-20261028-df7fbaa2/README.md)
SDK archives were built from the same immutable `df7fbaa2` source snapshot.
Both have fixed-point source closure
`6ac79efee9c97b0534378f058b330a0d2f073b0fd6c37ed643219078848969d3`
over 3,639 inputs with zero transforms. Their archive SHA-256 values are
`2c33a74ff8c1a77d689eb32a6b6676f01bfc356bc39f98efbefb5f9efc035494`
and `76edb6c40500498067dd0c1b478001f1c07165e3df51c55941463d608674ef8e`,
respectively. Installed Node 26.12.1, Bun 1.4.3, and Chromium 153 each pass
all 14 CONTRACT-062 cases on both platforms, including exact Rust dispatch
and TypeScript reference-route controls. The `/3` validator accepts only the
Node and browser `securityNot` rows as retired for these pinned cohorts,
leaving 924 evidence-scoped logical gaps at the pinned `df7fbaa2` source cut;
its four tamper controls fail as required. At that cut the checked default
ledger had 925 open gaps and zero retired because no archive evidence was
supplied. The subsequent four-data-alias classification makes the current
checked count 921 open executable gaps and zero retired; it does not extend
the earlier two-cohort retirement packet to the changed source closure.
Hosted CI, broader security parity, and release qualification remain open.

The scoped Node and WASM `editJsonSchemaNode` wrapper tests now cover crossed
pointer, document, and replacement faults with exact first-error and host
effect order. The focused wrapper suite passes 27/27. The default V4 route
remains TypeScript; the changed test source requires a new installed SDK
source-coherent packet before this Rust candidate can advance.

The [next current-source edit review](evidence/rust-migration/r8-json-schema-edit-current-reference/README.md)
replayed all eleven frozen direct `editJsonSchemaNode` reference cases with no
outcome mismatch. Its checked TypeScript AST source closure has 32 local files,
79 import edges, and seven changed local inputs against the historical packet.
The review also found a decisive host-boundary difference in the opt-in Node and
WASM wrappers. For a method-bearing non-string pointer whose `startsWith('/')`
returns true, the
predecessor next reaches `pointer.slice(1)` and throws the native `TypeError`
before document access or preflight. The candidate instead performs preflight
and reaches wire admission, which rejects the function-valued method with an
`AdmissionError`. A focused regression test records the differing error and
host effect in both wrappers; its full suite passes 29/29. The historical
22-case installed Node/Bun/Chromium packet has seven changed transitive schema
and generated-code inputs, so it is not current-source installed evidence.
Keep the default V4 edit route on TypeScript until the host boundary and a
fresh source-coherent installed replay close; this checkpoint retires no row.

The subsequent opt-in wrapper correction now executes the predecessor's
non-string edit-pointer method sequence before preflight in both Node and WASM.
The method-bearing `startsWith` sentinel consequently reaches the same native
`pointer.slice` `TypeError` with no document, preflight, replacement, or Rust
dispatch effects. Sol reviewed the narrow wrapper change and reran its full
suite (29/29). This closes that specific first-error counterexample, not the
general non-string host-input boundary: an object with all pointer methods can
still pass the predecessor's pointer phase while Rust wire admission refuses
it. The current-source installed packet and complete host parity remain open;
the V4 default stays TypeScript and no ledger retirement follows.

The R8 ledger now accepts exact bounded Rust ownership for the two SEC 2.0.0
projection exports on each V4 Node/browser root. Each mapping pins the
CONTRACT-059 core and UTF-16 bindings plus the private Darwin arm64 installed
receipt for Node 26.12.1, Bun 1.4.3, and Chromium 153. Their explicit
`./reference` rows remain TypeScript and unmapped. The ledger's logical
accepted-operation aggregate still reads 86 because it counts the reference
representative for each export; the four default-root rows record the newly
accepted mappings. Both logical names remain among 921 executable default
route gaps, with zero declaration retirements. Linux, broader SEC parity,
hosted CI, and release qualification remain open.

### R4 canonical resource refresh and local pair verification — 2026-10-28

The [local source-refresh packet](evidence/rust-migration/r4-local-source-refresh-20261028/README.md)
records a reviewed `5e46b5a5` archive plus the repository's canonical
`sync_codegen_resources.py --write` transform. Five embedded core resources,
their manifest, and the `_release.py` pin had drifted from canonical `spec/`
inputs; the synchronizer refreshed exactly those seven generated outputs in
the shared worktree, and its `--check` passes. The prepared source closure has
517 files. Both macOS arm64 wheel/sdist pairs built, passed `twine check`, and
the codegen wheel rebuilt byte-identically from its sdist. The coordinated
pair verifier passed with `publishing=false` and receipt SHA-256
`4c063d7d7cbcbc17222c63fd96969b6612ed277a29fe3773cea59db090d38783`.
Installed artifacts passed 217/217 focused tests on CPython 3.11.17 and
3.13.16 with `PATH` empty; 61 release/matrix/binary-closure tests passed. The
packet's checksums and the current resource sync check pass. This local
Darwin evidence does not close the hosted six-cohort release matrix, Linux
wheel behavior, R8 executable gaps, or package publication.
The later `scalarTypesForVersion` Rust source edit changed the metamodel
compiler fingerprint; the canonical outputs and Python embedded resource pin
were regenerated and pass their `--check` modes. The 217/217 Darwin pair
receipt remains evidence for its pinned earlier source cut, not qualification
of these newly regenerated artifacts. Rebuild and requalify the pair at the
next candidate release cut.

### R8 generated scalar vocabulary opt-in ownership — 2026-10-28

The [bounded `scalarTypesForVersion` packet](evidence/rust-migration/r8-scalar-types-for-version/README.md)
freezes five direct TypeScript predecessor version cases before implementation.
Rust now implements exact UTF-16 comparison for current core `0.10.0` and
returns the eleven scalar labels in generated order through the shared
`model/scalarTypesForVersion` wire operation. Node and WASM Core Model factories
offer opt-in routing. A Rust test compares the local list and version against
the generated `spec/core/schema.json` authority, so a vocabulary or version
change fails closed instead of silently drifting. Sol reviewed the narrow
request shape and reran Rust core and wire tests (2/2 each), the direct Bun
predecessor test (1/1), and Node/WASM factory routing tests (2/2). The normal
TypeScript package roots remain selected. Installed Node/Bun/browser parity,
host-input behavior beyond strings, current-source package receipts, and
default-route retirement remain open.

### R4 exact Linux pair preparation boundary — 2026-10-28

The [pinned Linux preparation record](evidence/rust-migration/r4-linux-pair-7c1bc684-cpython311-20261028/README.md)
captures an immutable `7c1bc684` source archive and confirms a cached Linux
x86_64 CPython 3.11.17 runtime. Its image lacks a compiler and the
workflow-pinned build/test packages; the cached Rust/GCC image has Python
3.11.2, and the cached maturin image is arm64. No Linux wheel pair was built,
installed, or tested. A disposable network bootstrap was rejected by automatic
approval review before execution because it would install packages over the
network and create a persistent image after an earlier network-capable Docker
rejection. The hosted six-cohort workflow is enabled but still queued. An
already-provisioned offline image with exact tools, or explicit review of a
network bootstrap, is needed for independent local Linux qualification.

### R8 native YAML 1.2 opt-in parser — 2026-10-28

The [frozen native YAML packet](evidence/rust-migration/r8-native-yaml/README.md)
records 30 direct TypeScript predecessor cases, including 24 without custom
options. Rust now has an opt-in `parseNativeYaml` path through the native tree,
shared JSON Schema wire dispatcher, and Node/WASM binding factories. Rust wire,
Node 26.12.1, and Chromium 153 pass all 24 default-profile tree and error-code
comparisons; both host bindings preserve the tested lone UTF-16 surrogate.
Six additional numeric probes match their returned trees or error; the
explicit scalar tag and defined alias also match. An unknown alias has a
different error code, and a tagged alias
has a different syntax message and caret. Two of the 24 main cases also have
different exact syntax messages: duplicate-plus-malformed input loses the
predecessor's aggregate duplicate diagnostic, and malformed sequence wording
differs. YAML 1.1 options, arbitrary host inputs, limits and metering,
unobserved YAML forms, current-source installed package closure, and exact
diagnostic parity remain open. Keep the package default on TypeScript and do
not count this as a retired R8 route.

The next Rust-only diagnostic correction retains duplicates emitted before a
scanner error, matches the frozen malformed-sequence wording, and aligns the
unknown/tagged alias code and caret for the tested forms. Sol reviewed the
change and ran the pinned-toolchain wire tests: all 24 frozen default-profile
cases now match complete trees, codes, and exact messages, and two alias edge
diagnostics match. A full 25-test Rust serialization-module regression found
and then verified the fix for a shared-parser wording leak into the separate
`readJsonValue` route; the native diagnostic rules are now scoped to the
native-tree operation. The prior Node/Chromium receipts remain tied to the earlier
binary; a fresh current-source native/WASM build and installed host replays
must precede any broader parity or route claim.

### R8 `securityNot` pinned Darwin replay and offline Linux gate — 2026-10-28

The [new `13e3313e` source-cut packet](evidence/rust-migration/r8-security-not-retirement-current-13e3313e/README.md)
has a fixed-point Darwin arm64 SDK archive and 14/14 installed
`securityNot` default/reference cases on Node 26.12.1, Bun 1.4.3, and real
Chromium 153.0.8010.12. All three receipts pin one archive, source closure,
and frozen packet. The offline Linux x86_64 build reached TypeScript
declaration emission but lacked the exact cached
`@typescript/typescript-linux-x64@7.0.2` package; no Linux SDK archive or
receipts were produced. The `/3` retirement validator consequently did not
run, and neither default-route declaration is retired. The later YAML source
edit also makes this an earlier pinned cohort rather than a current-worktree
installed result. A complete new two-cohort source cut and hosted
qualification remain required.

### R8 resource and Parquet relationship ownership follow-up — 2026-10-28

The [three generic selection resource authority review](evidence/rust-migration/r8-symbol-inventory/three-generic-selection-resource-authority-20261028.md)
traces the historical writers and current hashes of
`key-selection.schema.json`, `relationship-selection.schema.json`, and
`schema-properties-selection.schema.json`. They remain public JSON exports,
but their historical builders are absent and the current metamodel writer
does not own them. Their names do not establish that current Rust selection
or schema-property operations compute these schemas. Keep all three
`authority-unresolved` pending an explicit supported-resource disposition
or a restored exact writer; the other two unresolved JSON resources also
remain open.

The direct TypeScript Parquet relationship predecessor is now frozen in a
reproducible three-outcome corpus under
`tests/rust-core/fixtures/parquet-relationship-predecessor.json`, checked by
`tests/rust-core/parquet-relationship-predecessor.test.mjs` (1/1). Report,
strict, and unsupported-vocabulary cases preserve the original source,
unknown metadata, observation order, and residuals. The current Rust Parquet
decoder exposes a narrower SchemaElement projection, which cannot yet
reconstruct the predecessor's complete `nativeField` payload or checked and
blocked metadata diagnostics. Port full native-field preservation and field
metadata first; only then add an opt-in Rust classifier with receipt
verification/recovery. No default route or retirement follows.

The Protobuf descriptor candidate test now pins the exact nine malformed
declared-byte diagnostic differences against the predecessor (5 focused tests,
93 assertions). Its return/error classes and codes remain qualified only to
the existing 14-vector byte-array profile; exact messages and non-byte host
admission remain open.

### R8 immutable-source YAML host replay and copyJson first-effect guard — 2026-10-28

The [YAML current-host packet](evidence/rust-migration/r8-native-yaml-current-host-400590311/README.md)
rebuilt optimized Node and WASM bindings from an immutable `git archive` of
`400590311`. Node 26.12.1 and real Chromium 153.0.8010.12 each match all 24
frozen default-profile `parseNativeYaml` trees, error codes, and exact
messages, with zero mismatches; both preserve the tested lone UTF-16
surrogate, and the browser has no Node globals. The receipt pins the source
tree, binding artifacts, scripts, and predecessor packet. This is private
opt-in package-path evidence for the YAML 1.2 subset, not a default-route,
Linux, arbitrary-YAML, or release qualification.

The opt-in `copyJson` host-input regression now freezes a crossed-effect
boundary: the parent descriptor snapshot completes before child traversal,
and an enumerable parent accessor refuses before any later child Proxy trap.
Direct TypeScript and Rust-backed Node, Bun/WASM, and real Chromium traces
match. The Node suite passes 18/18; Bun/WASM and Chromium harnesses pass with
19 Chromium WASM calls and zero external requests. Existing broader
`copyJson` route gates remain open; the V4 default route is unchanged.

The condition-aware ledger now classifies only the exact source-pinned
`BIT128_PROFILE = 'umf-128/1' as const` export as inert JSON scalar data on
Node, browser, and reference routes. An AST, source-hash, route, and value
guard rejects mutable, computed, array, and object initializers; the public
mutable `LIMITS` object stays executable. This is a one-name classification
correction, not a Rust implementation or route retirement. The latest ledger
reports **920 open logical executable default-route gaps, zero retired**,
86 accepted opt-in Rust mappings, and 834 executable names without one.

### R8 Parquet retention and bounded YAML options — 2026-10-28

The Rust Parquet footer decoder now has separate strict and retaining entry
points. Existing LIST and record-type classifiers continue to call the strict
entry point, which refuses unknown `SchemaElement` fields, native parameters,
and conflicting logical/converted annotations rather than consuming a lossy
projection. The retaining entry point preserves ordered field IDs and typed
Compact Protocol values, including bool, integer width, binary, double bits,
list/set/map, nested structs, UUID, and unknown fields. Synthetic footer
controls confirm all three refusal categories on the strict path and native
retention on the new path. Sol reran the eight focused decoder tests and the
33-test Parquet Rust module group. This is decoder groundwork only: complete
field metadata, a Rust Parquet relationship classifier, predecessor parity,
host receipts, and any default-route decision remain open.

The [native YAML option packet](evidence/rust-migration/r8-native-yaml/README.md)
freezes eight direct TypeScript predecessor cases for YAML 1.1 boolean words,
date-only string handling, `pyyaml` single-letter boolean behavior, timestamp
refusal, and invalid-version precedence for string, null, and number versions.
The opt-in Rust wire operation and
Node/WASM facades now carry `version`, `dateOnly`, and `booleanLexicon`; both
facades forward only these supported keys, preserving the positional source.
The three focused Rust wire YAML tests and 29 Node/WASM wrapper tests pass.
This does not establish general YAML 1.1 parity or qualify installed hosts
for this new source cut. The earlier 24-case Node/Chromium YAML 1.2 receipt is
historical for its immutable `400590311` cut. No default route is retired.

CONTRACT-049 already states that the public Record Values profile is operation
2.0.0/core 0.10.0. The focused public test now pins the operation name and
refusal of core 0.9.0 in addition to older historical versions; its four Bun
tests pass with 31 assertions. The 1.0.0/core 0.8.0 clause remains historical.

### R8 YAML host options, descriptor diagnostics, and scalar route continuation — 2026-10-28

The [immutable `3240df36c` YAML host packet](evidence/rust-migration/r8-native-yaml-options-current-host-3240df36c/README.md)
rebuilds optimized Node and browser WASM packages from the committed source
tree. Node 26.12.1, Bun 1.4.3, and real Chromium 153.0.8010.12 each match
the frozen TypeScript predecessor on all 24 YAML 1.2 default cases and eight
bounded option cases, including exact trees, error codes, messages, and a lone
UTF-16 surrogate. Independent Node and Chromium replays reproduced the
recorded receipt hashes; independent Bun replay reproduced all 32 outcomes.
This is private Darwin-arm64 opt-in package evidence for the stated subset.
The source cut is historical after the subsequent Rust edits. General YAML
1.1, arbitrary options/inputs, installed SDK default routing, Linux, and
release acceptance remain open.

The Protobuf `readDescriptorSet` candidate now matches the predecessor's
exact messages for all 14 frozen declared-byte cases through the rebuilt
local Node addon. The nine previously recorded diagnostic mismatches are
corrected at source; focused Rust descriptor tests pass 12/12 and the Node
candidate tests pass 5/5 with 101 assertions. This does not admit the
predecessor's non-byte host inputs or select the public default route. The
earlier installed candidate receipt remains accurate for its older source
cut and must be refreshed for the corrected diagnostics.

`scalarTypesForVersion` is now selected through the Rust Core Model engine
in the V4 Node/browser source. A narrow adapter checks the Rust result against
the frozen current `SCALAR_TYPES` vocabulary and preserves the predecessor's
shared current-array identity, fresh empty arrays for other versions, and
non-string invalid-input behavior. The explicit `./reference` export remains
the TypeScript predecessor. Five focused Bun source tests pass with 45
assertions, typecheck and the V4 generated-facade check pass. Installed
Node/Bun/browser route parity, current source closure, and any R8 retirement
remain to be qualified; the checked ledger still reports 920 open logical
executable default-route gaps and zero retired declarations.

The unified-client boundary continues to scan every `src/access` TypeScript
file. The new scalar adapter has an exact empty import allowlist; an explicit
negative control rejects both a predecessor value import and a host hook.
The boundary command and all 23 tests pass. Any future access file needs its
own reviewed import entry, preserving the strict per-file policy.

The regenerated metamodel, Python and action embedded resources, R8 symbol
inventory, and condition-aware ledger pass their fixed-point checks. The
full R8 ledger suite passes 77/77 after updating its scalar V4 export-shape
assertions; the ledger remains at 920 open logical executable gaps and zero
retired.

The [scalar V4 host packet](evidence/rust-migration/r8-scalar-types-for-version-default-route/README.md)
rebuilds native and WASM bindings from the reviewed source, then exercises
private V4 Node, Bun, and real Chromium bundles against the explicit
TypeScript reference. Node and Bun match 12 cases each; Chromium matches
11 browser-relevant cases, with shared current-array identity and fresh
empty unsupported/invalid results. Twenty-eight source hashes were independently
rechecked. The canonical SDK builder failed temporary package staging with
local `EPERM`, so installed-package, Linux, release, and retirement gates
remain open.

The retaining Parquet decoder now also preserves ordered FileMetaData
fields, including field 5 key/value metadata. A bounded opt-in inspector
exposes raw key/value entries and classifies `ARROW:schema` as absent,
unique, duplicate, or blocked for malformed metadata without selecting a
first or last duplicate. Ten focused decoder tests pass. Arrow IPC decoding,
complete predecessor relationship classification and diagnostics, receipt
verification/recovery, host evidence, and default routing remain open.

### R8 next Parquet, descriptor, and SDK snapshot slice — 2026-10-28

The opt-in Rust Parquet relationship observation substrate now decodes the
frozen report footer through the retaining decoder, preserves the 11 non-root
schema entries in predecessor order and index, and carries each ordered
native Thrift field. Unknown SchemaElement or FileMetaData fields and any
file key/value metadata explicitly block interpretation while retaining the
original data.
The report fixture itself carries `ARROW:schema`, so its observation is
correctly blocked pending Arrow IPC interpretation; it is not a complete
relationship classifier or receipt/recovery route. The focused Rust suite
passes 6/6, including the frozen report order and raw unknown-value controls. The
[Arrow metadata negative controls](evidence/rust-migration/r8-parquet-arrow-negative-controls/README.md)
add malformed, missing, and duplicate `ARROW:schema` values; all remain blocked
and the raw values are retained.

The opt-in Protobuf descriptor candidate now has a bounded host admission
extension: `Uint8Array`-family windows (including Node Buffer) and empty
DataView match the pinned TypeScript predecessor; unsupported non-view inputs
match its captured diagnostics. Non-empty DataView and other typed-array
views fail closed rather than being coerced into bytes. The six focused Bun
candidate tests pass with 102 assertions and typecheck passes. Installed
Node/Bun/browser replay for this new source cut, arbitrary host parity,
default route selection, and retirement remain open.

The private SDK source-snapshot builder now copies pinned files through byte
streams, preserving bytes and modes without Darwin clonefile. Its focused
copy test passes with four assertions and keeps no-overwrite behavior. An
initial canonical build moved past the earlier staging failure and compiled
the release WASM, then correctly refused the artifact because the live
Parquet test source changed during compilation. A stable-source retry passed
with zero transforms over the fixed-point source tree
`ec2c6b92fcd75419613d95722a2d6e985b32f94bbc2d081285b32fd3c24f1c30`.
The strict package verifier accepted the private 1,814-member Darwin arm64
archive `abf9ac58a5d05bffedcd6869e0d435ecbe3f87f14d9b0949ee02ebb19931a946`.
Its [installed Node/Bun/real-Chromium replay](evidence/rust-migration/r8-sdk-stream-snapshot-darwin-20261028/README.md)
passed the canonical package-root, route-tamper, R3 corpus, numeric,
Cardinality, Facets, Keys, Bit128, Compact Dataset, and securityAndOr checks.
This private cut predates the later TargetPin and Core Evolution source edits
and cannot qualify their current cut, Linux, or a release.

The [host-lazy TargetPin candidate](evidence/rust-migration/r8-target-pin-host-lazy/README.md)
adds a private, opt-in PyO3 method that preserves the tested live attribute-read
order while delegating comparison to Rust. Its focused Python suite passes 8/8
against a freshly built CPython 3.13.16 extension; with the two bind-predecessor
tests, the combined cohort passes 10/10. It covers the 13-case frozen packet,
seven live-object order/error cases, and six bind outcome/trace cases over exact
tuple/string carriers. It does not select the default route, qualify arbitrary
host-object parity, or establish a release.

The separately approved [bounded Linux Python bootstrap](evidence/rust-migration/r8-linux-python-bootstrap-20261028/README.md)
used exact CPython 3.11.17, 3.12.15 and 3.13.16 linux/amd64 images, Rust
1.90.0, read-only source/cache mounts and network-disabled test containers.
Each cohort passed core/codegen wheel and sdist builds, package/artifact
checks, offline installed-pair smoke and 217 focused tests. Its source archive
predates the final generated-resource recapture and opt-in PyO3 candidate;
the coordinated pair verifier's fresh-venv dependency download was not run.
These bounded results do not qualify the current whole branch or a release.

### R8 host semantics and retained-output continuation — 2026-10-28

The [dynamic TargetPin controls](evidence/rust-migration/r8-target-pin-host-dynamic-controls-20261028/README.md)
extend the private PyO3 candidate beyond exact string/tuple carriers. Rust
controls the predecessor's attribute-read and comparison order while calling
Python's equality, length, iteration, set/dict, membership, and truth protocols
through PyO3. A source-built CPython 3.13.16 Darwin-arm64 extension passes
13/13 focused TargetPin and `ReadPlan.bind` tests, including the frozen
13-case pin packet, six bind traces, custom equality and exception order,
iterable faults, and short-circuiting. Pathological mutating protocols, other
Python versions/platforms, installed-wheel behavior, and default-route
selection remain open; the Python method is not retired.

The [Core Evolution verifier control](evidence/rust-migration/r8-core-evolution-retained-output/README.md)
proves that the private Rust verifier charges its recomputed receipt in the
aggregate 4,000,000-byte retained-output bound. Source inspection can return a
receipt below the ceiling while verification refuses when independently
supplied inputs plus the recomputed receipt cross it; the focused Rust suite
passes 12/12. The current TypeScript predecessor permits an over-aggregate
inspection case, and the crossed-control first-fault matrix and installed
host qualification remain open. CONTRACT-083 remains core 0.10.0 only.

The [Protobuf descriptor host controls](evidence/rust-migration/r8-protobuf-descriptor-host-admission/README.md)
freeze six non-empty `DataView` and non-`Uint8Array` typed-array cases. The
TypeScript predecessor indexes these hosts by element and emits its captured
`PROTOBUF_BINARY` diagnostics; the opt-in Rust candidate explicitly refuses
them with different profile diagnostics. The seven focused Bun tests pass with
114 assertions. These cases are visible parity gaps, not admitted inputs or a
default-route claim.

The [access-temporal R8 packet](evidence/rust-migration/r8-access-temporal/README.md)
replays 48 tagged TypeScript reference cases through the existing pure Rust
parser and `umf.core-wire/1` binding. Bun matches the frozen current reference
48/48, and the focused Rust test compares complete successful results and
refusal code/message units for all 48. Eight raw-host predecessor cases remain
outside the tagged transport. At that packet stage, the two logical exports
still needed Node/Bun and browser/WASM package bindings, installed parity, and
explicit default-route review; the packet did not change R8 retirement status.

The same [access-temporal packet](evidence/rust-migration/r8-access-temporal/README.md)
now includes opt-in N-API and WASM bindings over the shared Rust wire
operation. Source-built Node 26.12.1, Bun 1.4.3, and real Chromium
153.0.8010.12 match all 48 tagged predecessor cases. Host wrappers check only
primitive token/kind admission before the wire boundary; Rust owns supported
kind, length, and parsing decisions. The eight raw-host TypeError cases and
proxy/accessor silence pass in the host-specific tests; the browser replay also
checks token-kind precedence and absence of Node globals. These are local
source-built opt-in results, not installed SDK package qualification. The V4
Node/browser sources now select these guarded Rust bindings and the generated
facade retains TypeScript only under `./reference`. A fixed-point local source
build passed the 48-case V4 default-route replay and eight raw-host refusals on
Node/Bun. The two logical
access-temporal exports remain open in the
R8 retirement ledger.

The [current three-schema provenance replay](evidence/rust-migration/r8-symbol-inventory/selection-schema-current-provenance-blocker-20261028.md)
reconstructs the historical key-selection, relationship-selection, and
schema-properties-selection writers, but their outputs differ from the present
resources. The writers are absent from current source and the metamodel does
not declare these outputs. They remain among the five unresolved JSON
authorities; historical replay alone does not establish current writer custody.

The [pinned access-temporal installed candidate](evidence/rust-migration/r8-access-temporal-installed-80614a5/README.md)
uses a fixed-point, zero-transform SDK archive from commit `80614a587`.
Installed Node 26.12.1 and Bun 1.4.3 pass all 48 tagged vectors plus raw-host
refusals; archive WASM passes the same candidate replay in the Chromium engine
of Edge 156.0.4314.50, including absent/corrupt binding controls. This archive
predates the V4 source-selection edit, so it qualifies only the opt-in candidate,
not the newer default route, Linux, or release.

The [pinned V4 installed default-route replay](evidence/rust-migration/r8-access-temporal-default-installed-5cddac8/README.md)
uses a fixed-point SDK archive from committed source `5cddac834` with zero
source transforms. Installed Node 26.12.1, Bun 1.4.3, and Edge/Chromium
156.0.4314.50 match all 48 frozen tagged cases on both the default Rust route
and `./reference`, and each refuses eight raw-host values without proxy traps
or getters. Missing/corrupt native and WASM asset controls fail closed. This
establishes a bounded Darwin arm64 source-pinned default-route result for
access temporal; it does not qualify Linux, the whole SDK, or release, and it
does not retire the two logical gaps.

The [current-core Bit128 Field candidate](evidence/rust-migration/r8-bit128-field-candidate-20261028/README.md)
adds `declareCoreBit128Field` to pure Rust and an opt-in core-wire operation for
core 0.10.0 only. Eleven frozen TypeScript cases cover both `uuid` and
`bits128` success, source/version and exact-identity refusals, selected-field
warning precedence, and unknown-content preservation. Focused pure-core and
wire tests pass, including closed-request negative controls. Opt-in host bindings
have the bounded result below; installed routes, default selection, and general
JavaScript host equivalence remain unqualified, so the logical gap remains open.

The [Bit128 Field host candidate](evidence/rust-migration/r8-bit128-field-host-20261028/README.md)
adds opt-in Node/Bun and WASM/browser adapters over the Rust wire operation.
The focused Bun predecessor suite passes four tests and 38 assertions; a
source-built addon loads under Node 26.12.1. A real Chromium 153.0.8010.12
replay confirms the WASM endpoint is called once, with the current core 0.10.0
resource, preserved extension payload, and no Node globals. The binding error
constructor does not share TypeScript `UmfError` identity, and these results
do not establish installed parity or default-route selection.

The [Python V8 closure audit](evidence/rust-migration/r8-python-v8-closure-20261028/README.md)
finds that the present production `umf`, `umf_codegen`, and `umf_access`
Python sources have no active MiniRacer or JavaScript runtime dependency. The
historical R4 installed codegen cohort demonstrates the narrow V8-free path on
one macOS arm64 CPython 3.11 host; it does not qualify current-source wheels or
the release matrix. Python host orchestration and package ergonomics remain,
while semantic ownership still needs symbol-level review. The audit selected
`TargetPin.matches` and `ReadPlan.bind` as a Python semantic tranche, with
duplicate platform names rejected under CONTRACT-072 and ordered host
observations preserved under the existing frozen packets.

The [public Python TargetPin cutover](evidence/rust-migration/r8-target-pin-default-python-20261028/README.md)
now routes `TargetPin.matches` through the lazy Rust host binding and removes
its duplicated Python matcher. The source-built Darwin arm64 CPython 3.13.16
cohort passes 13 current-policy target-pin cases, dynamic host protocol and
exception controls, unavailable/wrong-profile refusals, and all six frozen
`ReadPlan.bind` outcome/trace cases (20 combined tests after the opt-in bind
seam landed). This validates a bounded
current-source public Python route, not installed-wheel or cross-platform
qualification. Public `ReadPlan.bind` orchestration remains Python-owned.

The [opt-in Rust ReadPlan bind seam](evidence/rust-migration/r8-read-plan-bind-rust-opt-in-20261028/README.md)
now owns the ordered selection loop in Rust while Python supplies lazy
artifact, identity, presence, pin, and parameter callbacks. The six frozen
predecessor outcomes and traces pass on source-built CPython 3.13, with added
causal controls for throwing presence access, selected-artifact and parameter
failures, zero/multiple matches, and original exception-object propagation.
The public `ReadPlan.bind` route is still Python, and argument/continuation
validation plus final model construction remain host-owned. Installed-wheel
qualification and full semantic ownership remain open.

The combined 2026-10-28 source build reached a zero-transform fixed point
with source-tree SHA-256
`359f2c927404c84d42fbd7973277a92ff7465c1c68b2a49a31ceaff6839d5bea`
after regenerating the metamodel and action-plan identity inputs. The
condition-aware ledger suite passed 78/78, the access-boundary suite passed
31/31 while scanning all 102 Python modules, and the focused Rust, Python,
Bun, Node and Chromium checks above passed. Full Python access-suite collection
requires external `commerce` and `weft` test fixtures absent from this
checkout. These are source-built candidate results, not installed-wheel or
whole-release qualification.

The Python access boundary checker now assigns explicit owners to the target-pin
and `ReadPlan.bind` Rust facades and enforces each facade's exact imports,
including its single `_rust` bridge. The target-pin host bridge owns its profile
and unavailable error locally, avoiding a runtime-to-host-to-runtime import
cycle. New negative controls reject unlisted imports and direct `open`/`input`
hooks while retaining the normal scan over both supported source layouts.
`bun run check:access-boundaries` passes with 102 modules and zero violations;
`bun run test:access-boundaries` passes 31 cases. These checks establish source
boundary enforcement only; candidate runtime qualification remains as stated
above.
