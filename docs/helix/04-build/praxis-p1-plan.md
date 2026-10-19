---
ddx:
  id: umf.praxis-p1-plan
  type: implementation-plan
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.praxis-lifecycle-roadmap
      kind: informed_by
    - id: SD-033
      kind: informed_by
    - id: CONTRACT-079
      kind: informed_by
---

# Praxis P1 implementation

## Scope

The owner authorized committing/pushing the remaining licensing changes and
starting P1 on 2026-10-18. Governing artifacts are the
[roadmap](../01-frame/praxis-lifecycle-roadmap.md), FEAT-033, US-092,
[SD-033](../02-design/solution-designs/SD-033-generated-ontology-access.md),
CONTRACT-068/079 and the existing generator/boundary/installed-wheel tests.
This first implementation change delivers Pydantic dependency compatibility and
a genuine generated synchronous client alongside the existing async API.
It does not claim completion of P1 or native driver/session qualification.

## Shared Constraints

Generated Python stays stdlib-only, browser generation remains deterministic,
SQL compilation stays in Weft, and hosts own execution and authorization.
Sync and async transports exchange the same wire requests; sync methods never
run or schedule a coroutine. Preserve exact values, schema custody, limits,
relationship/field ownership and unknown write outcomes without retries.
Existing async Client/Actions names remain valid. No package-index publication
or release tagging is included in this implementation start.

## Implementation Slices

| Slice | Area / governing artifacts | Depends on | Validation gate | Boundary |
| --- | --- | --- | --- | --- |
| P1-01 | License publication; roadmap WS-9 | Prior licensing audit | Four remote branch heads and clean sibling trees | UMF branch publication; sibling main publication explicitly authorized |
| P1-02 | Compatibility; roadmap gap 7, CONTRACT-068 | P1-01 | Demonstrate old-wheel resolver conflict; install candidate wheel with Pydantic 2.13.5 and 2.14.1; exercise generated models/codecs and runtime guards | Library range >=2.13,<3; exact versions remain test inputs |
| P1-03 | Typed sync API; US-092 AC1–6/8–9, CONTRACT-079 | Source boundary baseline | Isolated Python3.11 sync/async parity, real running-loop synchronous calls, spawned child, malformed transports, lost-write behavior; three checker positive/negative cases; Bun/Chromium parity | No native driver/session support inferred from portable tests |
| P1-04 | Per-call connections and native sync/async drivers; roadmap gaps 4/5 | P1-03 and driver/session contracts | Native person/batch/pool/cancellation/transaction tests | Follow-on; authentication and native authority remain host-owned |
| P1-05 | Pinned Bun-free generation, index and installed cohort; roadmap gaps 9/10 | Packaging/toolchain design and publisher availability | Complete-byte cross-generator comparison and offline vendoring from verified index | Follow-on; do not invent a working index or Bun-free CLI |

The source module map is `src/access/index.ts` (schema derivation and Python
model/action emission), `src/access/python-runtime.ts` (shared portable codecs,
request semantics and sync/async runtime emission), existing output writer in
`scripts/umf-access-generate.ts`, and host runtime `python/umf_access`.
`bun run check:unified-client-boundaries` and `bun run check:access-boundaries`
are the existing portable/host gates. Their negative controls and ownership
checks must pass; the sync addition cannot permit I/O, SQL, host imports or
executable schema hooks in generated clients. Existing boundary exceptions
remain scoped; do not expand them to hide feature dependencies.

## Execution Contract

Continue the authorized implementation through the first two functional slices
and their verification, preserving remaining P1 work explicitly. Do not publish
new runtime guarantees for untested backends. No comparable token baseline or
runtime budget enforcement is available; provisional implementation/verification
ceiling is 24,000 additional tokens for this first change, with a continuation
record required if reached. No elapsed-time delivery commitment is inferred.

## Validation Plan

Capture a failing dependency resolution and failing sync-client test before the
change. Build and install the actual candidate wheel with each pinned Pydantic
version; library metadata admits compatible versions rather than pinning one.
Generate the existing commerce fixtures to exercise real Pydantic model/codecs,
not substitute models. Check generated Python3.11 with mypy, pyright and ty,
including wrong sync/async bindings, wrong model keys and action argument types.
Run source boundaries, TypeScript checks, public build, deterministic writer
regressions and a real Chromium byte comparison. Native PostgreSQL tests require
their actual configured environment; a skipped case remains a missing native gate.

## Risks and Rollbacks

| Risk | Response | Rollback |
| --- | --- | --- |
| Sync/async implementations diverge | Derive both scheduling surfaces from the same controlled runtime template and shared codecs; compare request/outcome transcripts | Revert the sync emission slice; existing async API remains |
| Dependency range overclaims compatibility | Exercise actual installed wheels at the Praxis version and existing qualification version; preserve exact failures/limits | Revert metadata widening without rewriting historical locks |
| A fixture is mistaken for native qualification | Label portable/fake and installed-package checks separately from native engines | Withhold native support claim |

## Exit Criteria

The first change is complete when P1-01/02/03 pass their scoped gates, canonical
API/design documents match the implemented calling modes, and evidence names
remaining P1-04/05 work. Full P1 is complete only when the native connection,
Bun-free generation, distribution and consumer gates also pass.

## Continuation Evidence

Initial state: licensing is pushed to UMF `codex/praxis-p1-lifecycle`, Weft,
Truss and Hohfeld `main`. The old installed host wheel refuses Pydantic2.13.5
because it pins2.14.1. P1-02/03 now have scoped passing portable/installed evidence: the library range
and sentinel bridge, generated sync API, shared wire behavior, negative typing
sites, worker/loop calls and Pydantic2.13.5/2.14.1 runtime/model checks. P1-04/05
remain follow-on gates. This is the authorized implementation start, not full P1
completion. Execution results are recorded in
[evidence](evidence/praxis-p1.md) when available.


## Release goal and P1-04 continuation — 2026-10-19

The owner requested an active goal to release UMF and Weft with the complete
Praxis table-method lifecycle, including the roadmap's P2/P3 requirements. The
scope now includes immutable release artifacts and exact compatibility evidence;
proposed version numbers remain proposals until the cohort is qualified.
P1-04 is the active implementation slice. Its current work introduces a shared
pure Weft binding core, explicit synchronous scheduling, trusted person/batch
registries, per-call Psycopg 3 lease composition, explicit adapter/caller
transaction ownership and cancellation-shielded cleanup. CONTRACT-079 records
the proposed native surface. No native driver support or release is claimed yet.

Module ownership stays in the existing `unified` target boundary: `_binding`
owns pure compilation/wire/cursor phases; `__init__` owns sync/async callback
scheduling; `session_policy` owns trusted authority selection and cursor scope;
`session_sync` / `session_async` own lease/transaction lifetimes; `session_binding`
composes these with host executors. Generated code remains stdlib-only and
contains neither driver I/O nor a SQL compiler. Existing boundary negative
controls must continue to pass without broadening approved imports.

Next native gate: isolated PostgreSQL 18 through actual Psycopg 3 direct and
pool connections, generated clients and real Weft artifacts; compare person
roles and explicit batch grants, caller savepoints and outer transaction state,
read-only enforcement, role/settings restoration, closed-connection discard and
cancellation completion before pool reuse. Then implement/qualify Psycopg2 and
SQLAlchemy, full compiler-obligation execution and the shared mutation profile.
The host callback composition is not a substitute for those implementations.

The sandbox blocked PostgreSQL shared memory. Five attempts over three goal turns to obtain approval
for the isolated test cluster failed because the approval service reported its
selected model at capacity; neither attempt executed. Native verification,
commit/push and immutable release are pending. This is an external verification
block, not permission to weaken a release gate. Evidence records the passing
installed-wheel doubles separately from the unavailable native gate.

## P1-05 generator execution decision — 2026-10-19

Proceed independently of unavailable native PostgreSQL approval with a separate
`umf-codegen` Python distribution. Its `umf_codegen` API/CLI executes the existing
portable `generatePythonClient` TypeScript implementation inside embedded V8
using `mini-racer==0.14.1`, following Truss's existing deployment approach.
Do not port schema semantics or Python templates into a second generator.
Bun remains the development/bundle builder; installed authors require Python
and the pinned embedded runtime wheel, with no external Bun/Node executable,
SDK tarball, subprocess or network lookup. Generated clients remain stdlib-only.

The package is a proposed `0.1.0a1` local candidate until qualification/release.
The bundle is deterministic, compressed and integrity-pinned together with its
source inventory and exact third-party notices. Wheel and sdist include the
same payload and licenses. A Python-only wheel build from sdist must not call
Bun. New builds refuse stale source inventories rather than silently packaging
an earlier generator. Installed `generate` and read-only `check` must compare
complete bytes, manifests, selections, exact-number carriers and refusal details
with the TypeScript generator. Test JavaScript process launch prohibition,
payload tampering, deterministic rebuild, original-output protection, symlink
refusal and atomic write/rollback failures. Target-runtime platform wheels and
native loading must be observed; do not infer Linux qualification from macOS.

Module boundaries: `scripts/codegen/entry.ts` is the inert JSON bridge;
`scripts/build-codegen.ts` owns deterministic bundling and notice inventory;
`python/umf_codegen/src/umf_codegen/_embedded.py` alone owns V8 and packaged-asset
loading; `__init__.py` owns the typed programmatic surface; `_writer.py` owns
filesystem publication; `__main__.py` owns CLI arguments. No module may spawn
processes or fetch dependencies. Add a scoped source-boundary check and negative
controls; do not expand the existing generated-client or host-runtime imports.


P1-05 local execution now passes complete installed parity, refusal, writer and
packaging controls; see the exact [codegen receipt](evidence/praxis-p1/python-codegen.json).
The selected distribution is a separate wheel with a self-contained sdist and
preserved third-party notices. Linux CI and publication are pending. The native
P1-04 gate remains unavailable after five approval-service failures across three
consecutive goal turns; the final retry was after independent generation work.
Release readiness remains false. Resume native acceptance when approval service
or task permissions allow the isolated cluster, then qualify the remaining
physical-policy/deployment and mutation profile against actual PostgreSQL before
publishing support claims. No smaller subset replaces the complete release goal.


## Resumed native gate — 2026-10-19

Approval service now permits the isolated PostgreSQL18 cluster. The installed
Psycopg3 session foundation passes40 live assertions; source-bound evidence is
[recorded](evidence/praxis-p1/session-native-postgresql.json). The prior external
block is resolved. Continue the full goal through production artifact execution,
Psycopg2/SQLAlchemy, successor Weft qualification and the remaining table,
security, deployment, command and release gates. Source publication of this
bounded P1 slice enables hosted codegen platform checks; it is not a prerelease
support claim or completion of the broader lifecycle objective.

P1-04 now has106 local native assertions across Psycopg3, Psycopg2 and
SQLAlchemy Core sync/async, preserving the original connections and each driver's
transaction bookkeeping. The source-bound receipt and explicit parameter-free
fixture limit are recorded in the continuation evidence. P1-05 Linux/macOS
hosted generation gates pass at7c335aaf4. Production artifact admission,
parameterized DBAPI transport, physical policy/deployment, complete mutations and
release/distribution/consumer acceptance remain open under the active full goal.

## P2 declaration foundation — 2026-10-19

CONTRACT-081 records the proposed current-core `umf.tables`0.1.0 module
vocabulary and PostgreSQL18 native lifecycle boundary. The explicit inspector
and registry now validate copied declarations, native mappings, typed constraints
and seeds, original relationship/FK policy paths, unknown-content preservation
and bounded diagnostics. Inspection always reports `nativeQualified:false`.
The generator refuses selected lifecycle modules and action dependencies until
their operation interpretation is qualified; it cannot silently ignore policy.

The [inspection receipt](evidence/praxis-p2/declaration-inspection.json) records
85 focused tests/5003 assertions and14 real Chromium assertions, browser/Bun
parity, JSON/YAML retention and module boundaries. The embedded Python generator
passes the expanded16-case parity corpus and current packaging/integrity gates;
source and self-contained-sdist wheels match. Historical hosted receipts retain
their predecessor identity; current source CI follows publication of this slice.

Next implement exact deployment bundle/canonicalization and native catalog
verification, RLS/grants/containment, digest-checked forward migrations, then the
Weft operation vocabulary and typed command wire. Native writes, command replay,
full consumer acceptance and prerelease publication remain open. This metadata
foundation does not qualify the full lifecycle release objective.

## P2 inert initial deployment compiler — 2026-10-19

The browser-compatible `compileTableDeployment` now emits source/configuration
digest-bound initial table/Key/FK/check/index/RLS/grant statements and retained
inert seed declarations. Its exact bundle schema and RFC8785 identities are in
CONTRACT-081. Verification recompiles full source; changed SQL, reordered steps,
unknown envelope fields and attacker-recomputed digests refuse. Unknown logical
meaning and unqualified native codecs remain explicit refusals. Hosts must
allocate the private schema/install role and supply installed authority; no
compilation result establishes native admission.

[Source-bound execution evidence](evidence/praxis-p2/initial-deployment.json)
records26 PostgreSQL18.6 assertions with a synthetic fixture executor,19 actual
Chromium assertions and native constraint, covering-index, role/RLS, ordinary
column grant, owner/parent correlation and exact default checks. The namespace
shadowing control and related SELECT dependency closure pass. The earlier
declaration/codegen cohort5e5ece1a6 passes hosted qualification, including the
16-case Linux/macOS installed generator corpus.

Next implement the source-bound native catalog/privilege verifier and trusted
administrative executor, forward digest-checked ledger and drift/replay refusal.
Then extend the shared Weft command model and typed generated lifecycle methods.
Initial emitted SQL under a bounded fixture executor is not production migration
or mutation support. Release readiness remains false under the full goal.

The next administrative prerequisite now exposes this exact compiler/verifier
through the installed Python `umf_codegen` wheel. A separate12-case corpus
compares complete compiled/blocked objects and20 self-consistently rehashed
tamper controls with external JavaScript processes and network forbidden.
The original16 client-generation cases remain unchanged and pass. This
toolchain interface provides source verification for the next host executor;
it does not execute migrations or establish trusted installed authority.

## Source-derived native policy verifier probe — 2026-10-19

The proposed install verifier now has a [native probe](evidence/praxis-p2/source-policy-native.json)
against the source-verified bundle using the installed original Python compiler.
All16 policies match reparsed source for command, permissive mode, native roles,
normalized old/new predicates and dependency closure under exclusive table locks.
Deliberate predicate, audience, command and mode changes refuse. An actual native
SQL error after scratch-policy creation rolls back its savepoint, retains the
original policy and leaves no verification policy. The full synthetic initial
deployment probe now passes50 PostgreSQL18.6 assertions.

This establishes the policy-correspondence technique, not a production catalog
verifier. The source-bound column/Key/check/index/default inventory, role and ACL
closure, durable forward ledger and admission-generation coordination remain
next. The owner chose declared typed operations for consumer acceptance;
conversion must replace a raw-SQL escape method rather than add an untyped API.
The Python deployment toolchain cohort7043e2099 passes all8 hosted typed access
jobs, including Linux/macOS installed deployment parity and source-DBAPI native
execution. Release readiness remains false.

## Source-derived administrative catalog shape — 2026-10-19

The installed `umf_access.lifecycle.verify_native_catalog` now verifies original
source shape, defaults, Keys/checks/FKs/indexes and all command policies under
caller-owned PostgreSQL18 transactions. Compiler expectations retain exact native
definitions; the host reparses them on temporary private-schema objects and
compares native meaning, rather than trusting a supplied fingerprint. Private
tuple cursors preserve caller row factories; bounded lock/statement timeouts and
savepoints preserve healthy caller state after failure. Native data admission is
explicitly false.

The [catalog packet](evidence/praxis-p2/source-catalog.json) records112 installed
PostgreSQL18.6 assertions, source hashes,32 focused tests/210 assertions,19 real
Chromium assertions, installed generator/deployment parity and reproducible
source/sdist wheels. Deliberate catalog/policy drift, forged expectations and a
real blocked table lock refuse. Scoped strict typing covers the two new lifecycle
modules; whole-SDK strict typing is not claimed. Historical compiler receipts
retain their original wheel/source identities.

Next verify native ACLs and effective/transitive role containment, then install
trusted generation and forward digest-checked ledger authority. Weft typed
operations, generated client adoption, remaining native codecs and the selected
Praxis branch acceptance remain required before a full lifecycle prerelease.

## Selected native role scope — 2026-10-19

The installed administrative `verify_native_role_scope` now checks configured
owner/person/batch/group principals and an explicit host-selected person registry
using PostgreSQL's native SET and USAGE semantics. Switch chains followed by
inherited privilege chains cannot reach another audience, install ownership or
unsafe native role attributes. Batch-only setup requires no person. Trusted pool
issuers are distinct from selected people; other legitimate plugin memberships
are preserved. The shared source/install/savepoint/deadline guard also serves
the existing catalog verifier.

The [role-scope packet](evidence/praxis-p2/role-scope.json) records56 actual
PostgreSQL18.6 role assertions and112 catalog regression assertions with the
installed host wheel. A mistaken overlapping fixture run was discarded; final
suites run sequentially, and cleanup now owns only schemas created by its run.
Hosted native CI includes the role suite sequentially after catalog verification.
Role scope remains explicitly non-admitting: ACL/external-object containment,
trusted installed generation, migrations and actual generated Weft operations
still gate the full Praxis lifecycle release.

## Source-derived native privileges — 2026-10-19

The installed `verify_native_privileges` reparses source grant steps on private
scratch tables and compares exact native table/column ACLs. It verifies schema
USAGE, default privileges, declared relation inventory and dedicated-schema
root authority using native privilege checks. No observed ACL is repaired.
Actual people may access other plugins; owner/person/batch roots cannot acquire
external table/column/sequence/routine/schema, foreign-server/wrapper or
large-object authority. Native role scope now also rejects predefined roles and
ADMIN authority, including otherwise disabled membership edges that ADMIN could
regrant.

The [privilege packet](evidence/praxis-p2/source-privileges.json) records133 ACL,
62 role and112 catalog assertions on the final installed PostgreSQL18.6 candidate
wheel. Native object-kind evaluation required explicit CASE guards; the failed
precursor and final fix are retained. License/header/metadata checks, scoped
strict typing and boundary controls pass. Hosted CI now runs all three fixture
suites sequentially. Earlier packets preserve their own source/wheel identities.

Trusted installed-generation authority and forward digest-checked migration
history remain next. Administrative observations do not admit normal operations,
freeze native catalogs or qualify identity sequences. Complete Weft lifecycle
methods, native codecs, generated client conversion and consumer/release gates
remain required by the active full goal.

## Inert forward migration plans — 2026-10-19

The portable `compileTableMigration`/`verifyTableMigration` now retain and reverify
both source deployment bundles, explicit predecessor identity, full-plan digest
and phased transactional preconditions/outcomes/recovery. Initial deployment and
append-table candidates preserve original compiler statement order. Existing
logical/native declarations cannot change in this subset. Seed execution,
destructive/metadata-only revisions and role/namespace changes refuse. Every
compiled plan requires digest-bound approval; none grants execution authority.

The source-bound [plan packet](evidence/praxis-p2/forward-plan.json) records Bun
tests, exact machine-schema and rehashed-tamper refusals, real Chromium parity for
initial/append candidates, strict TypeScript and pure compilation boundaries.
The existing embedded Python generator remains current because this separate
portable module is not yet part of its interface. Native ledger execution,
forward-history conflict/replay and the Python migration entry point remain
next; this plan compiler does not close those gates or the full release goal.

## Installed Python migration source verification — 2026-10-19

The Python `umf_codegen` candidate now exposes the original migration compiler
and complete-plan verifier through fixed embedded bridge calls. All12 portable
cases agree, including initial JSON/YAML, appended tables and Unicode IDs;44
self-consistently rehashed plan controls and4 invalid deadlines refuse while
subprocesses, executable lookup and network access are forbidden. The original
16 client and12 deployment cases retain their behavior. Source/sdist wheels
match, manifest/stale-source/corrupt-payload gates pass and license metadata
remains MIT OR Apache-2.0.

The [installed migration packet](evidence/praxis-p2/installed-migration.json)
records exact source/wheel identities and local qualification. Linux/macOS hosted
CI includes the new corpus; publication and hosted results remain separate.
Native durable ledger execution, approved-plan application and forward replay
are the next required implementation step.

## Native approved-plan ledger — 2026-10-19

The installed administrative migration executor now applies original verified
initial/append-table plans with explicit approval digest and prior native head.
It verifies the fixed private metadata relation before trusting rows, rechecks
every original plan/link/digest, and captures native witnesses only after complete
source catalog/privilege/role correspondence. DDL, final verification and history
insert share the caller's transaction; the library never commits or retries.
Replay verifies the current cohort and historical authority without rerunning
migration steps. Metadata source remains inaccessible to person/batch principals.

The [native ledger packet](evidence/praxis-p2/native-ledger.json) records49 native
ledger assertions: caller rollback/commit, actual competing-migrator lock wait
and replay, a real SQL error after history insertion, source/history/native drift,
private metadata and bounded count/bytes before payload loading. The final
catalog/role/privilege regressions pass112/64/133 assertions. Caller row factories
and healthy transactions are preserved. The installed compiler's14-case expanded
deployment corpus catches metadata-name reservation and deterministic group-map
SQL after JSONB key reordering; migration/client parity remains intact.

This profile requires READ COMMITTED, UTF8, native row security and origin
replication mode; runtime principals cannot SET replication mode. History is
bounded to128 entries/32MiB, never silently compacted or rewritten. Only initial
and appended-table migrations are executable in this cohort. Ordinary generated
Weft operations/admission, remaining necessary migration/codecs/seeds, consumer
acceptance and immutable prerelease delivery still gate the active full goal.


## Conditional Weft table read custody — 2026-10-19

The owner's selected consumer target remains local `prebill-plugin-port` at
`e195822083fae6993b253af7fb3ac0b4bfdc3546`. Named reads/writes and the old execute
escape must become declared typed operations, as recorded in CONTRACT-081.
Private source was inspected read-only; public fixtures are independent synthetic
examples with no consumer SQL, table names or data copied.

Weft successor commit `713186b604e602549607b4a1e63052cc236199ac` is pushed on
`codex/praxis-lifecycle-047`. It interprets original core0.10/umf.tables0.1 table
custody through an explicit conditional read profile, checking the owning module,
complete native mappings, primary Keys and source FK relationships. A distinct
`weft.table-read/0.1` program retains source and unresolved host obligations for
ledger/current generation, person/batch identity, forced RLS and privileges.
No normal operation is authorized by this program. Selected unknown members
refuse without altering the original preservation schema or source; explicit
CoreLiteral map keys retain their meaning.

The [source-bound packet](evidence/praxis-p2/weft-table-read.json) records ten
focused integration tests, one map-preservation test and eighteen installed
native-Python/CLI comparisons, plus WASM target compilation, boundary/spec and
source/wheel license checks. The earlier full PostgreSQL library regression
passed184 tests at the separately identified predecessor. The final negative
control and its correction remain visible in the Weft evidence. Actual browser
execution and native table data access are not qualified by these results.

UMF e48's hosted run39293707044 passed all eight lifecycle jobs, including Linux
and macOS generator checks and Pydantic2.13.5/2.14.1 compatibility. The broader
release goal stays active. Next work must specify and implement typed table
operation wires, required native codecs and generated data admission, then close
mutations/replay/paging, necessary migrations/seeds and consumer/release gates.
The guarded UMF generator remains closed to selected lifecycle modules. No full
Praxis prerelease was published; Weft0.4.46 coordination remains separate.

## Declared typed table operations — 2026-10-19

CONTRACT-079 now specifies `umf.table-operation/0.1` declarations for explicit
single-table reads/counts/pages, insert/update/delete/upsert and atomic batches of
one named write. The source table payload remains preservation-oriented:
unknown commands retain their exact source and block complete interpretation.
Known versions receive structural and contextual checks for owning module,
original columns and Keys, exact logical/native parameter domains, required
create values, immutable/generated fields, conflict whitelists, result bounds,
replay/consistency, cursor order and predicate complexity. This is declaration
admission; no callback or raw SQL execution escape is introduced.

The [typed operation packet](evidence/praxis-p2/typed-operations.json) records42
passing declaration/deployment/migration/boundary tests and36 actual Chromium
assertions. Installed embedded V8 agrees on16 client,15 deployment and12 migration
cases, refusing30 deployment and44 migration rehashed-tamper controls plus4 invalid
deadlines with subprocess/lookup/network disabled. The generator manifest now
accurately lists its existing migration bridge methods. Source/sdist wheels are
byte-identical; source and wheel license checks pass. Existing generated-access
regression passes35 tests with its native data test explicitly skipped.

An actual installed PostgreSQL18.6 run passes49 ledger assertions over initial
and append sources containing11 typed declarations. Those checks cover
administrative source retention, native catalog/role/privilege proof, concurrent
migration/replay, drift and transaction ownership. They do not execute the new
operations. CI now includes the operation unit/browser/installed corpus and the
additional native source-ledger fixture; new hosted outcomes remain pending.

Next: lower these exact declarations through shared Weft Rust APIs, carry operation
identity/module/input/result bounds through native host admission, and generate
typed module methods. Keep Weft's nonempty-command and UMF's generated lifecycle
guards until their replacements enforce that authority. Required native codecs,
actual typed mutations/bulk/upsert/durable outcomes, consumer conversion and
full release acceptance remain part of the active goal, not optional follow-up.


## Shared Weft operation lowering and native session composition — 2026-10-19

Weft106ae554 on `codex/praxis-lifecycle-048` now compiles the exact typed
declarations from UMF6d623fc52. The dedicated shared Rust frontend admits closed
module-owned input/result domains and original Keys; PostgreSQL lowers read,
count, page, insert, update, delete, conflict-ignore/update and atomic batches of
one declared write. Data is bound, exact numeric driver values are canonical,
per-call read size cannot exceed the source, and direct-effect mutation bounds
fail atomically rather than clipping. The existing raw and generator guards stay
closed. Every program still declares nativeExecutionQualified false.

The [source-bound packet](evidence/praxis-p2/weft-table-operations.json) records20
focused tests,27 installed Python/native comparisons,10 rehashed-tamper controls
and50 native PostgreSQL18.6 assertions through the public SyncSession/AsyncSession
adapters with Psycopg3.2.13/Pydantic2.13.5. All37 sync and8 async leases exit;
caller-savepoint rollback, person/batch RLS and repeated cancellation during an
observed backend lock wait pass, with restored connection reuse. These synthetic
SQL/session tests do not issue production authorization or provide generated
methods. Psycopg2/SQLAlchemy operation composition and real-pool parity remain
separately required. The complete184-test prior PostgreSQL library regression is
qualified at its precursor; final operation changes receive focused/native reruns.

The candidate includes the independently published0.4.47 packaging repair at
12051af8. Rebasing changed no compiler/runtime source; rebuilt wheel, focused
tests, native/parity and the repaired1,000-record/twelve-field capacity smoke
with5 rejection controls pass. WASM target compilation, workspace/default feature
checks, adopted module boundaries, specs and dual-license source/wheel audit pass.
No new Weft browser outcome or0.4.48 publication is claimed. UMF6d623fc52 hosted
run39301326934 now passes all8 jobs, including both Pydantic pins and Linux/macOS
embedded code generation. The new Weft hosted job remains pending.

Next implement normal-operation native admission against the approved current
ledger generation and complete privilege closure, then generated typed module
execution. Authenticated cursors, durable data outcomes, necessary native codecs,
schema evolution/seeds and complete pinned private consumer/available Lakebase
acceptance remain release gates. The user's full Praxis goal remains active.


### Shared operation compiler browser evidence

Weft4e0abd77 extends the same compiler packet with actual Chromium153.0.8010.12
execution through wasm-bindgen0.2.105. All27 native/WASM result pairs agree,
compiled programs verify, and one altered program plus two invalid Unicode
transports refuse. Browser network IO is disabled after module loading; actual
WASM/JS hashes and imports are retained. The candidate CI now reproduces the
browser comparison. The [updated packet](evidence/praxis-p2/weft-table-operations.json)
pins this exact pushed successor while retaining the earlier feature source.
This supersedes the compiler's earlier compilation-only browser qualification,
without claiming native execution or closing any remaining release gate. New
hosted candidate jobs remain pending; no full Praxis prerelease is published.


## Source-proved native head observation — 2026-10-19

The current native candidate installs a fixed security-barrier metadata view over
private history and proves its exact native definition, columns, rules,
dependencies and SELECT-only audience grants from a freshly reparsed fixed view.
No original plan or seed projection is granted. Full source-proved application,
replay and inspection issue a bounded trusted-host installation reference that
binds current digests/generation, view OID/shape, private history shape and native
table witness. Historical replay issues the current cohort's reference. A
consistency hash is never treated as request authentication or install approval.

`read_table_head` now observes this reference through an active Psycopg3
READ COMMITTED transaction, including read-only person/batch transactions. It
checks actual database/schema/server context, source metadata before opening
known dependencies, then rechecks locked shapes before selecting the view. The
shared lifecycle lock remains until the caller ends its transaction. Current
digests/witness must match; no outer begin/commit, role change or retry occurs.
The native profile requires ordinary heap tables and heap scratch DDL, retaining
actual access-method identity instead of silently accepting a changed native AM.

Module ownership: `head_view` owns fixed projection/source-reparse proof; `head`
owns trusted reference consistency and the synchronous metadata observation
boundary; `ledger_schema` owns private history shape and proof; `ledger` issues
references only after complete native source correspondence. No generator, DSL,
ordinary-runtime or target import allowance was broadened.

The [current packet](evidence/praxis-p2/native-head.json) records101 native
assertions for baseline source and101 for the same fixture with eleven declared
operations,112 existing catalog assertions,50 installed Weft sync/async operation
assertions and22 session unit tests. Actual side-effect sequences prove neither
a modified view nor new private-history RLS executes before refusal. Native
concurrency proves migrators wait past function savepoint release until caller
transaction completion. Real lock timeout, stale snapshot/head, new native OID,
source/metadata drift and dict-row-factory controls pass. Installed wheel/source
hashes and dual-license payload audit are retained. This supersedes the earlier
missing current-head observation component, not the full data-admission gate.

Weft4e0abd77's browser-enabled hosted run39315199160 is now green. Its pinned SDK
is the earlier6d623fc52 cohort; the new SDK/native head CI outcome remains pending
push. Existing CI automatically runs both expanded native fixtures. Async and
other-driver head composition, live data-table/privilege/current-principal
admission, generated methods, authenticated cursors, durable replay and all
remaining lifecycle/consumer/release gates stay required. Earlier unpublished
ledger-only installations refuse without an implicit metadata upgrade. No new
release was published and the full Praxis goal remains active.
