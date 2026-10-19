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
