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


## Shared native-head probes through all per-call adapters — 2026-10-19

The source-proved head checks now share one library-owned query protocol. The
original raw Psycopg3 observer and administrative source-snapshot helpers use
that same sequence as the new `observe_table_head` /
`observe_table_head_async` session integrations. No source SQL/callback or
installer authority is exposed to requests. Ordinary targets receive only the
exact public preparation/error seam; boundary controls still refuse migration
API imports and general Psycopg2 use outside its exact cursor integration.

Sessions explicitly select `catalog_only=True` for this native profile. Earlier
default resolution stays intact and cursor authority includes the effective
setting. Control cursors use tuple rows without changing caller factories.
The source verifier runs in a bounded worker before an async lease, since the
embedded V8 timeout API cannot run in an event loop. All database IO remains
async. Cancelling preparation cannot acquire a connection later. Synchronous
observation also works inside an already-running host loop: only bounded CPU
verification moves to a temporary worker, never the caller's connection or
synchronous driver work. Actual running-loop calls are included in the native
fixture.

The [execution packet](evidence/praxis-p2/native-head-adapter-execution.json)
records75 actual PostgreSQL18.6 assertions across Psycopg3 sync/async, Psycopg2
sync, SQLAlchemy Core2 sync with both drivers and async with Psycopg3. Actual
pools verify person/batch switches, active caller transactions, stale-source
rollback, dict row-factory preservation, complete return and repeated cancellation
during confirmed advisory-lock waits. Psycopg3 restores/reuses its backend;
SQLAlchemy invalidates/replaces its cancelled backend and the next batch call
succeeds. All28 tracked owned leases exit; separate caller leases also return.

A percent-bearing synthetic schema exposed existing metadata transport defects:
parameterized ledger identifiers need DBAPI percent framing, and unbound history
queries must omit empty parameter frames. SQLAlchemy control statements now use
explicit no-parameter execution when appropriate. The fixture preserves the exact
native schema identifier through all six configurations. The prior101 native
head/history controls and50 installed Weft sync/async operation assertions pass.
Twenty-five scheduling/session tests also pass in a fresh SDK environment without
database drivers or umf_codegen, including no late lease after cancelled source
preparation. Twenty-three boundary tests/157 assertions,72-module import checks,
exact changed source/wheel bytes and dual-license audit pass.

UMF38c0be341 hosted run39318298101 is now green; the new source-dbapi job includes
this fixture and the current candidate outcome remains pending push. No compiler
or generated native-data guard is opened by metadata observation. Live native
data/privilege/principal admission, generated module execution, authenticated
cursors, durable replay and the remaining codec/lifecycle/consumer/release gates
stay required. The complete Praxis release goal remains active.

Next: use the shared probe scheduling inside a single native operation lifetime,
with current principal/audience role closure, schema/object/ACL containment and
complete live data-table correspondence before/after execution. Trigger/rule and
incoming-reference closure must be established explicitly; comparing a cached
head or an incomplete table witness alone cannot admit an operation. Generated
methods remain guarded until these checks and their compiler obligations close.


## Live ordinary-principal installation correspondence — 2026-10-19

The native recipe now combines the approved current head with live principal,
source audience, role reachability, schema/object/ACL containment and table
correspondence. Original administrative role checks and native witness capture
share the same fixed query generators with sync/async native sessions. Person
identities must be individual roles; inherited batch login principals retain
their separate source grant and cannot be relabelled as people. Scope digests
include effective and MEMBER closure because group policies use native MEMBER
even for edges with disabled INHERIT/SET.

The new table boundary is checked in both original-source proof and ordinary
correspondence. It rejects extra policies, user triggers, disabled/unexpected
constraint triggers, inheritance and incoming FKs from outside the module.
Current columns/defaults, constraints/indexes, policy expressions/dependencies,
ownership/access methods and table/column ACLs must match the source-proved
witness. Schema ACL/inventory and plugin root-role external containment remain
exact; actual people can retain their other plugin grants. No observed drift is
reclassified as expected. Metadata checks deliberately demand no SELECT grant
on denied module tables. Shared advisory locking coordinates compliant migration;
selected native business statements will acquire their own table locks.

The [source-bound packet](evidence/praxis-p2/live-correspondence.json) records141
ordinary correspondence assertions across six real adapter/pool configurations,
116 catalog,64 role,133 privilege and101 native ledger assertions. Committed
drift leaves a matching head readable but the new checks refuse changed defaults,
column grants, policies, forced RLS, role authority and cross-audience membership.
Native cases cover batch login aliases, MEMBER-only scope changes, source/ordinary
trigger and incoming-FK refusals, valid source FKs and disabled/always-enabled
constraint triggers. Native caller ownership, actual pools, running-loop sync
calls and repeated async cancellation remain covered by the shared fixture.

Twenty-five session/scheduling tests pass in full and minimal SDK environments.
The23-test/161-assertion boundary corpus and74-module import checks pass; a first
5s infrastructure timeout is retained as a precursor, with no weakened limit.
Changed runtime bytes match the installed wheel, and source/wheel dual-license
audits pass. aee257f1f hosted run39322791079 is green; the new CI outcome remains
pending push, with the correspondence fixture added to source-dbapi acceptance.

This is installation correspondence, not permission to execute an operation.
Results keep lifecycleAdmission/operationAdmission false. Next combine these
checks inside one operation lifetime with verified Weft programs, exact codecs
and current scope before/after execution, then generate typed native module
methods. Cursor authentication, durable outcomes and the remaining lifecycle/
consumer/release gates remain part of the full active Praxis goal.

## SDK-owned declared native reads — 2026-10-19

`SyncTableReader`/`AsyncTableReader` now compile and source-recheck declared reads
inside the SDK. Trusted host configuration pins the original source, deployment
and committed installation reference. Identity remains a separate authenticated
per-call argument; no SQL/program or execution callback enters this API. The
closed host profile refuses unknown Weft obligations. One catalog-only native
lease combines pre/post live correspondence with the checked business statement,
exact scalar/cardinality checks and final wire bound. Write declarations remain
explicitly gated on the durable outcome executor.

Weftff169567 adds the shared `pg18-read-frame/0.1`8MiB uncompressed-octet guard,
including lookahead, with hidden native ordering fields excluded from public
results. The SQLAlchemy adapter now distinguishes no-parameter control statements
from explicitly bound empty DBAPI tuples; percent-containing schema names pass
both paths. Opaque HMAC cursors bind exact inputs/size, source/head/reference,
verified principal and live role/MEMBER scope. No cross-page snapshot is implied.

The [source-bound receipt](evidence/praxis-p2/declared-reads/receipt.json) records126
native PG18.6 assertions across six driver/pool configurations. All72 tracked
leases exit; caller read-only ownership, cardinality failures, source-driven RLS,
cross-principal/tampered/changed-scope cursors, compressed oversize frames and
repeated async cancellation at real advisory/relation waits pass. PostgreSQL's
catalog deparser reaches the relation wait during admission; the retained
precursor and final report identify that phase without claiming business-query
cancellation. Native codec coverage is text and count; exact scalar unit tests
do not establish every native codec. Twenty-five session tests and five value/
cursor tests pass in full and dependency-minimal environments. Twenty-four
boundary tests/170 assertions,76-module imports, exact changed source/wheel/
installed bytes and MIT OR Apache-2.0 audits pass.

Predecessor c66707ed hosted run39325447746 is green. CI now pins the exact
ff1695675b05c98c0ae56d7cdd675b82426f65b2 Weft source and runs this native reader
fixture. New hosted results remain pending publication of this UMF increment.
No prerelease is published and the goal remains active. Next close durable
write outcomes and generated lifecycle module execution; remaining required
native codecs/constraints, seed/evolution work, the selected private Praxis
conversion/identity mapping and available Lakebase/cohort release acceptance
remain required. The local unreleased package version labels are not release
support promises.

## Native declared mutations and authenticated effect recovery — 2026-10-19

`SyncTableWriter`/`AsyncTableWriter` now execute declared insert/update/delete,
upsert and atomic single-operation batches through the same source-checked Weft
program admission and native per-call sessions as the reader. Inputs are copied
before hashing and compilation. The source-required caller key or an explicitly
optional generated key identifies the operation slot; inputs, source/head or
verifier changes cannot turn an occupied slot into a second write. Both current
correspondence and the actual principal are rechecked after waiting on the native
slot lock and after execution. No driver or client automatically retries.

New installations atomically create fixed forced-RLS outcome metadata and issue
version0.2 references pinning its proven shape. Owner-only schema administration,
exact ACL/policies/columns/keys/checks/indexes and trigger/FK closure apply to the
metadata as well. Earlier outcome-free installations keep version0.1 head reads;
writes refuse before leasing. An explicit administrative runtime-upgrade
operation remains pending. Effect receipts are authenticated with a host secret;
input/response fingerprints are opaque HMAC values. Recovery returns direct
effect counts, with no retained historical business rows. Fresh returning rows
and recovered receipts have explicit different status shapes. Caller-owned
results remain pending until the outer commit.

Weft4c7c2eb0 adds `pg18-write-frame/0.1` inside the existing native effect guard:
oversized uncompressed RETURNING data raises SQLSTATE22012 and rolls back the
statement. SDK streaming JSON accounting bounds cumulative batch/wire output,
including repeated Field identities. Empty returning lists emit no invented
business rows. The
[source-bound packet](evidence/praxis-p2/durable-outcomes/receipt.json) records
native mutations, read/ledger regression, all six driver/pool and caller-owned
modes, native contention, current-role RLS, forged receipts, commit uncertainty,
metadata drift and legacy-reference refusals. Actual outcome-slot/row-lock waits
are distinguished from controlled cancellation boundaries after confirmed native
effects or actual commit. A cancelled call can have committed; fresh observation
recovers its receipt. Native codec coverage remains text and exact count markers,
with separate exact-scalar unit coverage.

The predecessor UMF Python workflow exposed31 lint diagnostics. Ruff0.17.1 now
passes the full Python tree: imports/exports are sorted, optional-driver errors
retain deliberate sanitized SDK boundaries, and SQLAlchemy metadata keys retain
their actual API semantics. No global rule is weakened. CI pins the exact new
Weft commit and includes the outcome trust-boundary and native mutation fixtures.
SDK source/wheel byte and MIT OR Apache-2.0 audits are recorded separately.

The complete goal remains active and no prerelease is published. Next expose
these operations through generated typed module clients and the native wire
transport. Required temporal/domain/native constraints, seed execution, broader
forward schema/policy/command evolution, runtime upgrades, private source/data
conversion, available managed Lakebase acceptance and immutable publication
remain required; this component does not redefine the release scope.

## Generated declared module integration — 2026-10-19

The user's selected replacement for the private SQL escape is declared typed
operations. `generatePythonClient` now emits module-only native methods, exact
keyword input and projection dataclasses, typed read terminals and immutable
applied/recovered/unobserved unions. No native `.objects` escape is generated.
An SDK-owned closed native binding maps those requests to the existing checked
Weft reader/writer; authenticated person/batch identity is bound outside wire
input, with per-call factory/session behavior retained. Source/operation/profile
mismatches and unsupported meanings refuse. Native JSON is the qualified source
format; ordinary generator profiles retain their own support contract.

The [generated-module evidence](evidence/praxis-p2/generated-modules/receipt.json)
records80 PG18 assertions across six native driver/pool variants and both
transaction owners,68 balanced tracked leases, generated async cancellation at
actual advisory waits, source/role RLS, paging, CRUD recovery, upsert and atomic
batches. This augments the prior162 native mutation and126 read assertions;
it does not replace their broader fault controls. Three pinned static checkers
accept the generated package/positive sites and reject exactly five reviewed
misuses each. Actual Chromium matches Bun bytes; the installed embedded Python
compiler matches18 complete accepted/refused corpus results with external
JavaScript executables, network and subprocesses forbidden. Four wire controls
cover identity/mutation/SQL injection, session-mode mismatch, sanitized diagnostics
and cancellation propagation. CI preserves these checks.

No release tag or asset is published. Required remaining work includes the
native temporal/domain constraint and codec profile, seeds, broader forward
schema/policy/command evolution and old-runtime upgrade, read-only selected
private source conversion/data acceptance, available managed Lakebase testing,
version bumps, hashes/licenses and immutable UMF/Weft publication. The full goal
remains active.

The first hosted generated-module run exposed a stale full-table browser
assertion that still required declared operation generation to refuse. The
harness now compares the complete generated result against Bun and retains
explicit no-command, unknown-operation-meaning and invalid-conflict refusals.
The full Chromium harness passes42 assertions with no external requests or host
globals. This changes the acceptance expectation for the newly implemented
surface; it does not widen native execution authority. Hosted rerun is pending.

## Finite native dates, instants and numeric domains — 2026-10-19

The [finite temporal packet](evidence/praxis-p2/finite-temporal/receipt.json)
qualifies generated date/instant/decimal projections, predicates, writes, atomic
batches, effect recovery and source-declared transaction timestamp defaults on
PG18.6. All six driver/pool variants pass88 assertions with62 balanced leases,
both transaction owners, finite year boundaries, pre-lease rounding refusal and
unchanged alternate ambient timezone/date-format settings. The native deployment
tampering fixture passes116 assertions; the prior non-domain ledger fixture
passes101. SDK source/wheel/installed bytes match across75 runtime modules.

New date/instant/numeric domain constraints enter the source-derived expected
catalog. New finite-domain sources use nested witness0.2 typed expression trees:
the first native run exposed timezone/date-format deparser differences that
could masquerade as installed-generation drift. The new representation removes
that rendering dependency without changing existing non-domain witness0.1 bytes.
Original source scratch correspondence, engine/location pins, owner/policy/ACL
inventory and pre/post checks remain required. Timezone-free native timestamps
and unqualified temporal refinements remain refused.

Weft f910d9c6137861e15f93fe9b316703fb5412cf8d is pushed and now pinned by CI.
Its pure shared parser normalizes only exact finite instants without clocks,
floats or timezone databases; generic raw APIs retain their refusals. Native
Python/CLI and actual browser WASM match34 cases;10 self-rehashed program controls
refuse. Its full workspace run passes944 tests across80 groups. UMF's actual
Chromium harness passes44 assertions and its installed embedded generator passes
19 complete corpus cases with external JavaScript executables/network/subprocesses
forbidden. All three local wheels retain MIT OR Apache-2.0 metadata and notices.
Local version labels remain candidate labels; no release/tag/assets are published.

Hosted a94705017 passed the native source cohort, Linux/macOS embedded compiler,
Pydantic compatibility, typed client and table-browser jobs. Its remaining
boundary failure was an eight-process test exceeding Bun's five-second test
timeout. Only that test now has a30-second timeout; all24 boundary tests/170
assertions pass locally without weakening any assertion. New hosted results
remain pending this push.

Read-only inspection of the selected private branch confirms32 blocking quality
checks:26 enumerations and six ranges. These require explicit source-derived
native/domain support; they must not be discarded during conversion. Fixed
statement syntax also uses server-time expressions, requiring declared typed
assignments rather than an SQL escape. These concrete gaps join seed execution,
broader forward evolution/runtime upgrade, private full-method/data conversion,
available managed runtime acceptance and immutable publication as the next
required work. Private source, SQL, names and values remain outside public code
and evidence. The full release goal stays active.

## Blocking domains and declared transaction-clock operands — 2026-10-19

The selected private branch's32 blocking quality checks are26 VARCHAR membership
sets and six DECIMAL ranges; no private names, SQL, strings or data were copied.
This increment implements those meanings as logical scalar domains, generated
Python validation and source-derived native CHECK inventory. It also adds the
typed `currentTimestamp` operation value needed for fixed server-time statements.
It emits only the backend's fixed transaction-time keyword and cannot be used as
a caller-supplied SQL/function surface.

The [domain/clock packet](evidence/praxis-p2/scalar-domains/receipt.json) records150
PG18 assertions across six driver/pool variants and both transaction owners,
with74 balanced leases. Invalid enums, ranges, boolean memberships and text lengths
refuse before leasing; native direct writes also fail their CHECKs. Generated
server-time updates return exact UTC instants and repeated keys recover without
executing again. Source/role/current-generation and existing frame/outcome checks
remain active. Unknown qualifiers, invalid clock targets and generic raw-domain
admission retain their refusals.

Three pinned static checkers accept ordinary and domain-specific generated clients
and reject exactly ten reviewed misuse sites each, including caller time on a
server-time method. The shared core passes339 tests and the focused PostgreSQL
compiler passes15. Native CLI/Python and actual Chromium WASM match37 cases,
with10 self-rehash controls. UMF's full table browser now has46 assertions and
its embedded Python compiler matches20 complete corpus cases without external
JavaScript processes, network or subprocesses. Constructor controls additionally
cover Unicode scalar length, exact int64 enumeration and extreme-exponent decimal
zero without context rounding. Existing container refinement refusal stays explicit.

Predecessor UMF054bf4194's complete hosted typed-access workflow39342106052 and
Weft f910d9c6's39341867909 are green. The new schema must be pinned by its exact
producer commit in Weft and the paired compiler must then be pinned by UMF CI.
Those source-provenance follow-ups do not publish a release. Remaining gates are
seed execution, broader forward evolution/runtime upgrades, selected private
full-method/source/data conversion, available managed acceptance and immutable
versioned publication. The full goal remains active.

The schema producer638f104d4 is now pinned in Weft6e907632267a7140d07865d295da6ca2d23a6b3f,
which is pushed and pinned in UMF CI. The complete native domain fixture is enabled
in that paired source cohort. New hosted checks remain pending; no release or
tag is published.

### Published-main integration, 2026-10-19

Merged main ba49977a1 into the lifecycle branch without rewriting the638f104d4
schema producer pinned by Weft. Retained the released0.5.1/dev3 metadata, runtime
export collision protection, opaque presentation annotations and retired-demo
cleanup. The modular native binding carries the same presentation rule as main.
The new generator boundary check permits native declarations/templates only in
their owning files; it still prohibits SQL compilation, drivers and host I/O.

Fresh installed SDK/dev3 and embedded-generator wheels pass150 PostgreSQL18.6
assertions across six driver/pool variants with74/74 balanced leases. The merged
generator passes15 focused tests/205 assertions and actual Chromium byte parity
for ordinary, Praxis and native-operation models (10 assertions). TypeScript,
Ruff, Python/compiler and unified-client boundaries pass. One initial browser run
was denied local socket access by the sandbox; its escalated run passed. Paired
hosted runs39345236278 (Weft) and39345398156 (UMF) remain pending at capture.
These are local component candidates; published predecessor assets are unchanged.
Seeds, broader evolution/upgrade, private acceptance and full publication remain
open.

### Forward index and declared-operation evolution, 2026-10-19

The [forward-evolution packet](evidence/praxis-p2/forward-evolution/receipt.json)
records source-recompiled appended btree indexes and approved source-only command
revisions/retirement. Zero-DDL revisions still advance the immutable ledger and
invalidate old installation references; no declared command runs on install.
Original initial/append-table plan bytes are unchanged. Existing index replacement,
column/key/check/FK/policy changes and seeds remain refused by this subset.

PostgreSQL18.6 passes122 administrative assertions, including duplicate-data
unique-index failure, savepoint rollback, caller commit, retained rows and durable
replay. Both person and batch reject stale references after command revision.
Embedded Python matches17 complete cases with88 tamper and4 deadline controls;
actual Chromium passes54 assertions.12 portable tests/75 assertions, TypeScript,
package Ruff and compiler/host ownership checks pass. The previously paired
Weft6e907632 hosted run39345236278 is now green.

The concrete resource audit also identifies repeated immutable source preparation,
redundant per-call catalog scans and per-item batch database round trips. These
need consolidation within the trusted-host boundary before performance readiness.
The remaining full-goal gates in the prior entry stay open; no release is published.

### Private declaration conversion, 2026-10-19

The [aggregate private conversion](evidence/praxis-p2/private-conversion/aggregate.json)
uses the owner's selected read-only prebill-plugin-port commit. Original sources,
converted models, generated packages and diagnostics stay in temporary private
files. The smaller module's2 tables/13 columns compile to14 declared typed CRUD
and read operations. All14 compile/check through Weft; installed embedded
generation matches Bun byte for byte, with Python syntax passing. These are
prospective declarations; existing fixed application methods are not yet ported.

The larger15-table/185-column module refuses because an association row scope
has no authored foreign relationship. Native via lowering currently demands a
foreign-key mapping. Do not invent a constraint or erase the scope. The next
policy slice must add same-module, explicitly typed association field matching
with existential visible-row semantics, native audience SELECT checks and cycle
refusal. It must preserve existing FK-based via behavior. Original decimal
bounds use YAML lexemes, avoiding conversion through binary float. The legacy
unscoped default grant function was inspected; prospective conversion records
explicit person/batch CRUD allow rules rather than inferring unknown audience
authority. This source work does not validate native data/roles or adoption.

### Explicit association policy producer, 2026-10-19

The candidate `related` row rule binds an original same-module Record, explicit
source/target field pairs and a nested rule. It lowers to correlated EXISTS over
natively visible related rows without adding a foreign key. Matching requires
the same singleton carrier; each field's own refinements remain enforced.
Duplicate pairs, cross-module/missing mappings, incompatible carriers, missing
audience SELECT and dependency cycles refuse. Unknown pair content is retained
and blocks execution. FK-backed via semantics are unchanged.

The private prospective conversion now compiles all17 tables/198 columns with
119 generated named CRUD/read declarations,18 indexes,15 foreign keys and32
blocking domains. This remains prospective source conversion, not the existing
application's fixed-method port or native data adoption. Private source stays
in temporary files. New public direct/nested association fixtures include
nullable match columns, duplicate matching rows and an orphan membership.

The portable source producer is being pinned for Weft's exact structural schema;
Weft and native qualification for the new rule are pending at this commit.
Do not treat the private compile result or this schema commit as released support.

The [related-policy packet](evidence/praxis-p2/related-policies/receipt.json) now
records paired Weftc4018a98 (UMF producer0fa1d777b),60 native PostgreSQL18.6
assertions and48/48 balanced real pool leases for generated sync/async methods.
Direct/nested association matching, NULL, duplicate matches, independent batch
grants, writes and effect-only replay pass without a native foreign key. UMF
Chromium passes60 assertions; embedded generation matches22 complete cases.
Weft CLI/Python and Chromium WASM match41 cases, including unknown-pair refusals.
All119 prospective declarations from the17 private tables now compile/check
through this Weft cohort. Private source remains outside public repositories.
Existing fixed application methods, native private/managed acceptance, seeds,
broader evolution/adoption, resource consolidation and publication stay open.
Qualification runs locally on macOS only; no multi-platform campaign is claimed.

### Owned input snapshot cleanup, 2026-10-19

The reviewed cleanup removes repeated caller-tree deepcopies from native read,
write and observe preparation. Public sync/async entry points own one snapshot
before preparation/thread offload; hashing and canonical compiler serialization
use that same tree. Direct private preparation helpers retain their one-copy
wrapper behavior. No tree is exposed to a native callback or compiler (which
receives canonical JSON). Four mutation-isolation tests pass both with installed
optional dependencies and in the minimal environment;12 existing value/outcome
and4 binding tests pass. Package Ruff and80-module ownership checks pass.
[Source receipt](evidence/praxis-p2/input-snapshot.json) qualifies this copy-only
change; the prior native policy packet keeps its exact cohort. No duplicate
native campaign or performance-readiness claim is added. Repeated immutable
source preparation, redundant live checks and per-item batch dispatch remain.

### Owned source preparation reuse, 2026-10-19

The [prepared-source packet](evidence/praxis-p2/prepared-source/receipt.json)
removes source recompilation and JSON/declaration lookup from repeated calls on
the same native reader/writer. Lazy preparation is protected for concurrent
first use; current subject registration and fresh principal/audience rebinding
remain per call. Policy replacement invalidates preparation. A process guard
precedes the new lock. No native observation, lease or result is cached, and
all existing live correspondence/generation steps remain active.

The new dev4 candidate avoids colliding with published hostdev3. All75 wheel
modules match source; dual-license metadata is present. Installed PostgreSQL18.6
passes180 assertions across six driver/pool variants plus nested association
methods, with98/98 leases returned. Ten cache/snapshot unit checks pass in both
full and minimal environments; Ruff and ownership checks pass. This qualifies
source preparation reuse, not complete request performance. Live probe query
consolidation and ordered batch transport remain.

A fresh AST/source inspection also refines the fixed-method port scope: the
review decisions are six generated INSERT-SELECT statements that atomically
copy visible findings and the native current principal. They cannot be replaced
by a separate read followed by insert. Sample cleanup needs a related-table
delete predicate; mixed timestamp-descending/key ordering is also used. These
are real remaining typed-operation capabilities, separate from the119 generic
prospective declarations already compiled. The sample's host-owned reference
read must retain its separate module ownership/authority. Private source and
SQL remain in temporary files only.

The immediate Weft self-check is also removed from the native call path: it
recompiled the trusted in-process compiler's own output. The SDK still checks
ABI/result/transport/obligation compatibility and accepts no externally supplied
compiled program. External artifact verification remains a Weft ingress concern.
Ten source/snapshot and4 binding tests, package Ruff and ownership checks pass.
This source-only cleanup does not repeat the preceding native campaign or extend
its exact wheel hashes. Rust still parses the binding model per compilation, and
redundant live catalog probes remain; those costs are not claimed eliminated.
The wheel-module prose is corrected to75 (the ownership checker scans80 modules).

### Atomic snapshot authoring producer, 2026-10-19

The `insertFrom` operation declares one same-module source table/predicate and
explicit target assignments. `sourceField` copies only source-table fields with
proved target compatibility and exact native capacity; currentPrincipal binds
PostgreSQL's effective role outside caller input. Atomic INSERT-SELECT lowering
is required; a separate read followed by insert is not equivalent. Missing or
hidden source rows produce zero effects; excess effects must roll back.

Portable authoring/generation tests and browser/embedded parity pass for a public
snapshot fixture including nullable text and exact numeric source refinements.
The source/target native command obligations are represented separately in the
SDK. Native Weft lowering/execution for this new source form remains pending
at this schema producer commit. No released support is claimed.

### Atomic snapshots, ordered batches and per-call cost, 2026-10-19

[Combined component evidence](evidence/praxis-p2/snapshot-batch/receipt.json)
qualifies the installed dev4/Weft0.4.48 candidate on local macOS ARM64 and
PostgreSQL18.6. Generated sync/async snapshots pass29 assertions with16 balanced
pool leases, including hidden/missing sources, exact nullable numeric copies,
effective person/batch roles, replay and whole-statement overflow rollback.
Independent plain INSERT batches use one insert-only MERGE with source ordinals;
ordered results and receipts do not require returning or correlating primary keys.
Same-key upserts retain sequential semantics. Four batch cases pass64 assertions;
a9MB returning frame aborts all effects and leaves no receipt (6 assertions).
All39 observed leases across those tests return. CLI/Python and Chromium/WASM
agree on48 original-source compiler cases;17 focused Rust tests pass.

Owned reader/writer source preparation stays cached. Ordinary calls now use a
shared lifecycle lock, fixed current head/location observation and selected
principal/audience/group facts in three control statements. Full catalog audit
remains available through explicit diagnostic steps; operator DDL/ACL/role changes
require quiescence as CONTRACT-079/081 describe. A versioned scope digest rejects
old incompatible cursors/receipts without missing an occupied recovery slot.
Five session settings use vector snapshot/set operations; caller-owned settings
restore before savepoint release. Eight native probe/session cases pass.
This is a qualified component, not full Praxis integration or a published release.
Seeds, forward column/policy evolution, actual fixed-method acceptance, related
delete predicates and mixed-direction paging remain required.

### Mixed-direction keysets and related deletes, 2026-10-19

[Related operation evidence](evidence/praxis-p2/related-operations/receipt.json)
qualifies generated sync/async mixed-direction keyset pages (17 native assertions)
and correlated related-table deletes (19), with24/24 pooled leases returned.
Pages carry every required ordering Field and end with the complete original
unique Key as a tie-breaker. Timestamp ties and a one-microsecond difference
retain exact order; principal/size/tampered cursor reuse refuses. Native related
EXISTS preserves both source and target row policies; over-bound deletes roll
back without receipts and matching replay returns the durable outcome.
Five portable tests/27 assertions,63 browser assertions,23 complete embedded
cases and56 CLI/Python/Chromium-WASM source cases pass. Required ordered fields
and same-module native-capacity equality are the qualified subset. This does not
claim a held paging snapshot, private application routing, seeds or completed
forward column/policy migration support. Mixed-order continuation SQL has O(k²)
comparisons for k sort fields; each scalar binds once. Uniform directions keep
PostgreSQL tuple comparison. Related scope indexes reuse admitted Field objects.

### Typed seeds and bounded forward evolution, 2026-10-19

[Seed/migration evidence](evidence/praxis-p2/seed-migrations/receipt.json)
qualifies source-selected administrative seed compilation/application on local
macOS PostgreSQL18.6. Newly appended immutable seed sets run once in the approved
migration transaction. Initial1005 rows require two mutation statements; primary
ignore preserves authored first values, replay does no seed DML, and failure in
a second chunk rolls back the first chunk, ledger and RLS changes. Exact large
integer/decimal, date/instant, UUID, boolean/null and omitted native transaction
clock values pass. Same-shape self-FK forward references fail in authored order;
parent-first order succeeds as two row statements. The harness passes26 checks,
with9 observed seed mutations across successful and deliberately failed cases.
Two Rust tests and10 CLI/Python/Chromium-WASM source cases pass. Stored Field
metadata is indexed once per touched table, not copied for each seed row.

The separately reviewed additive migration producer also passes nine native
checks over four generations for nullable column additions, generated numeric/date
checks, UPDATE grant expansion, deny/allow policy transitions, replay and stale or
tampered source refusal. Its original isolated source hashes remain in the packet;
the integrated producer adds versioned immutable seed selection. Fourteen portable
migration tests/83 assertions,68 browser assertions and23 complete embedded
cases pass. All76 SDK wheel modules match source and dual-license metadata is
present. Required-column/type/key/FK evolution, unsupported native codecs and full
private analytics/method acceptance are not implied. The release goal remains
active; this is an unpublished component.


## Authorized lifecycle gap completion — 2026-10-21

The user authorized the remaining roadmap work and domain-pack table/security
fixtures. Installed HELIX catalog is workflows/graph.yml; evolve hands source
implementation to the runtime. Existing uncommitted assessment files are retained.
No public release, external message or production migration is implied.

| Slice | Owner / boundary | Verification |
| --- | --- | --- |
| LC-01 | UMF descriptions/deployment; native catalog correspondence | Description escaping, deterministic bytes, catalog/comment drift |
| LC-02 | UMF forward-plan options; Weft typed backfill lowering; host atomic apply | Required column with explicit scoped UPDATE; row-bound rollback; added check/FK validation; named policy-change review |
| LC-03 | Host concurrent-index phases; same UMF source/ledger | Valid-prefix resume, unique duplicate failure, explicit invalid-index repair, unchanged history on failure, stale/tampered plans |
| LC-04 | Python new/check/apply CLI and dependency metadata | Offline full-chain/source check, exit reasons, approved apply, installed Python entrypoints, dependency compatibility |
| LC-05 | Legal domain-pack derived table cohort | Matter/team access, separate service commands, generated sync reads/actions, schema evolution and browser/embedded parity |
| LC-06 | Packaging and handoff | Fresh wheel checksums/licenses, local index/offline install; exact consumer/managed/public index acceptance remains externally gated |

Existing boundary commands are check:access-boundaries,
check:unified-client-boundaries and the codegen ownership checker; retain their
negative controls. New lifecycle modules stay under the administrative owner.
No general Weft import permission is added to generated clients or pure runtime.
Run focused Bun tests, TypeScript, actual Chromium, Python packaging/CLI checks
and PostgreSQL18 where locally available. Retain exact source/artifact hashes and
failures. No comparable token baseline or enforced runtime metering is available;
work proceeds in bounded reviewed slices with continuation evidence here.


### Revision2 steering — 2026-10-21

The consumer's U1–U9 replaces its original draft. The existing roadmap owns its
next-release order and ownership map. Complete LC-01–06 verification already in
progress, then use the U1/U2/U5 design gates before widening execution scope.
Current concurrent execution is index-only; mixed data/DDL/concurrent plans and
NOT VALID/VALIDATE remain explicit next-release gaps. Reviewed destructive/type/
Key evolution and the generic host protocol are not implied by local additive
migration support. U3 maps existing native policy forms; no new core policy
language is authorized. U7 takes the tested-mini-racer matrix alternative; U8
includes a documented verified mirror route. External consumer/managed/public
publication and Hohfeld0.10 acceptance remain separate, unfulfilled gates.

### Lifecycle successor checkpoint — 2026-10-21

[The source-pinned component packet](evidence/table-lifecycle-completion/README.md)
records LC-01–05's bounded implementation and LC-06 local wheel/mirror proof:
31 focused Bun tests/179 assertions,83 Chromium assertions,28 final installed
PostgreSQL checks,30 installed generator cases, four CLI tests and source/license
wheel correspondence. The fixture derives four documented legal tables with
explicit membership/billing/batch restrictions, reviewed backfill and failed
concurrent-index recovery. Scoped review fixed quoted-identifier SQL parsing,
legacy comment-bundle recovery and durable phase fencing. No code/SQL lowering
was moved from Weft into UMF.

Continuation: the current local source is verified, not published. U1 mixed phases
and NOT VALID/VALIDATE, U2 reviewed existing-object changes, U3 row_scope conversion,
U5 generic host protocol and U6 untrusted-SQL containment require the revision2
contract/test gates before implementation. Packaging needs complete dependency
mirroring/platform coverage and immutable release versions. Private consumer,
Lakebase, public publisher and Hohfeld gates remain open. Next action is the
roadmap's U3/U4 authoring acceptance followed by U1/U2/U5 phase/evolution design;
do not repeat the completed component campaign without a changed input/failure.
