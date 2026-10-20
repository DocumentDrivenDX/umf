# Praxis P1 — first implementation evidence

The owner authorized pushing the remaining licensing changes and starting P1.
The [build plan](../praxis-p1-plan.md) governs this change under FEAT-033,
US-092 and CONTRACT-067/068/079. P1-01/02/03 have scoped passing evidence below;
P1-04/05 remain open. No complete-P1, native driver, managed-service, production
graph-host or package-index acceptance is claimed.

## Delivered behavior

The generated stdlib-only package now exposes SyncClient/SyncActions and explicit
AsyncClient/AsyncActions aliases for the existing Client/Actions surface.
`Model.objects.using(sync_client)` selects synchronous typed query terminals;
async bindings retain awaitable terminals. The implementations share wire
validation, exact-value codecs, row/key types and schema metadata. The controlled
runtime template derives the two scheduling-dependent implementations; generated
sync methods do not create/run an event loop or schedule coroutines. Bound
queries and action wrappers reject the other scheduling mode. Limits,
relationship ownership, keyed lookups, paging, error sanitization and unknown
write outcomes retain their existing semantics, including no write retries.

`umf_access` now declares `pydantic>=2.13,<3`. The older Pydantic-based generator's
profile admission accepts exact 2.13.x pins and still refuses earlier/major-3
versions. Test profiles retain exact dependency pins. Pydantic2.13.5 exposes the
real MISSING sentinel through its experimental namespace;2.14.1 exposes it at
the top level. One typed compatibility export in `umf_access.types` selects the
actual sentinel, and runtime/generated imports consume that export. No sentinel
replacement or null/absence conversion is introduced. The build harness verifies
that exact qualification locks satisfy library dependency ranges instead of
requiring library metadata itself to be an exact lock.

## License publication

| Repository | Published licensing commit | Destination |
| --- | --- | --- |
| UMF | 0699d31f | origin/codex/praxis-p1-lifecycle |
| Weft | 93d1f817 | origin/main |
| Truss | e1e1e377 | origin/main |
| Hohfeld | 34a6c8e | origin/main |

Each push completed. The sibling checkouts were clean after publication. UMF
uses a named branch because this chat started on a detached managed worktree.
No package publication or release tag was performed.

## Passing verification

Bun1.4.3 and Python3.11.17 were used locally. The exact current source/wheel
hashes are in [the source receipt](praxis-p1/source-receipt.json). All reported
wheel tests import installed package files and compare their bytes against the
built wheel; they do not import the development runtime in place of the wheel.

| Gate | Evidence and result |
| --- | --- |
| Fail before implementation | [Old dependency conflict](praxis-p1/dependency-before.log): the previous wheel cannot resolve with2.13.5. [Missing sync API](praxis-p1/sync-before.log): the new application test initially fails importing AsyncActions. |
| Actual generated models and installed runtime, Pydantic2.13.5/core2.46.5 | [Receipt](praxis-p1/compatibility-2.13.5.json): exact wheel payload verified;14 explicit model/codec refusal cases; exact decimals and absence/null checks;57 runtime tests pass. |
| Actual generated models and installed runtime, Pydantic2.14.1/core2.50.1 | [Receipt](praxis-p1/compatibility-2.14.1.json): the same generated/model/runtime checks and57 tests pass. No deprecation warnings are emitted. |
| Portable behavior/regeneration | [Functional run](praxis-p1/functional.log):33 pass, one native test skipped. [Final focused run](praxis-p1/final-focused.log):5 pass, including additional reserved sync-name and cross-mode wrapper guards. These overlap; do not add their counts as independent coverage. |
| Sync/async behavior | `tests/unified/sync_client_probe.py` compares complete request transcripts and outcomes against an independent node/edge host. It covers exact UUID/bits128/Decimal values, get-many ordering/missing slots, relationship composition, resumed pages, bounds, invalid cursors/keys/modes, wrong schemas and lost write response without retry. The same synchronous function runs inside an actual running asyncio loop and in a separately spawned child with a fresh host. This is portable/fixture evidence, not native connection/fork safety. |
| Python typing | mypy2.4 strict, Pyright1.1.414 standard and ty0.0.88 pass the generated package and positive return-type assertions. [Eight negative sites](praxis-p1/negative-sites.json) are rejected by all three, covering transport mode, action binding, foreign keys, action arguments and await/value mismatches. Checker outputs are retained beside this report; no generated suppression comments were added. |
| Browser parity | [Chromium](praxis-p1/browser.log): complete generated file bytes/hashes agree with Bun; one test/four assertions pass. |
| Boundaries | [Source gates](praxis-p1/boundaries.log) pass; [21 boundary tests](praxis-p1/boundary-tests.log) pass, including negative import/execution/cycle controls. Portable generator still has no host APIs or SQL compilation; generated Python uses only the standard library. |
| Build/typecheck | [Build](praxis-p1/build.log) passes browser ESM/declarations and generated authority checks; [TypeScript](praxis-p1/typecheck.log) passes both projects. |
| Metadata/license | [Audit](praxis-p1/licenses.json) passes source/header/package and candidate wheel license checks. Generate/check CLI reports no byte drift against current output. |
| Existing lint debt | [Comparison](praxis-p1/lint-comparison.json) finds no new default-Ruff diagnostics in changed host modules;16 existing diagnostics remain. No whole-runtime lint success is claimed. |

The generated compatibility fixture is genuinely non-temporal and preserves the
unselected timestamp source. A separate generated relationship fixture supplies
the runtime suite's commerce import; no stand-in models or fake emitter outputs
are used. The older Pydantic-generated package also passes a standard Pyright
scan with the actual2.13.5 installation after correcting the static sentinel
export. This does not establish complete old-profile/static or temporal acceptance.

## Reproduce and CI

Build the host wheel, install it into separate Python3.11 environments with
`pydantic==2.13.5` and `pydantic==2.14.1`, then run for each environment:

```sh
bun scripts/praxis-p1-compatibility.ts --python /path/to/environment/bin/python --pydantic 2.13.5 --wheel /path/to/candidate.whl --report /tmp/compatibility.json
```

Use the matching pinned version for the second run. The harness discovers the
actual Python/runtime versions, invokes the public emitter, validates installed
wheel bytes, and runs `tests/unified/dependency_probe.py` under Python `-I`.
The generated model and runtime tests verify the selected semantics; the report
retains their commands, hashes, results and qualification limits.

`.github/workflows/access-boundaries.yml` now includes the two-version installed
wheel matrix and portable sync/async regression tests. Its YAML and matrix parse
locally; the equivalent commands passed locally. Remote CI execution is not
claimed by this record.

## Attempts, limits and next work

The first2.13.5 installed import exposed the top-level MISSING incompatibility,
which the shared sentinel export corrects. A subsequent static scan exposed the
need for the TYPE_CHECKING alias as well. The runtime suite initially lacked its
required generated commerce relationship fixture; the harness now generates it
from the existing relationship source rather than changing the assertions.
One boundary test exceeded its existing5-second case limit during concurrent
verification; an unchanged-source isolated run passes all21 cases. No timeout
was increased. An exploratory strict-Pyright template scan reports existing
unknown/unused diagnostics; this record claims standard Pyright, strict mypy
and the named ty run, not a strict-Pyright certificate.

The local candidate wheel retains the development version0.1.0.dev2 because no
release is being published. Its exact hash distinguishes it from the old release
wheel. Publish a new immutable version before distribution. The complete frozen
Praxis platform dependency lock was not supplied, so two isolated pinned-version
runs do not certify that complete platform.

Next is P1-04: a governed per-call connection/lease/session contract, genuine
sync/async Weft/driver adapters and native person/batch/pool/cancellation tests.
The current WeftTableBinding remains async. P1-05 still needs a qualified
Bun-free generator artifact, a verified index, immutable release cohorts and
offline vendoring. Native PostgreSQL/managed Lakebase execution was not rerun in
this portable/compatibility change; the native regression case remains explicitly
skipped. Truss/Ashlar/Hohfeld production lifecycle acceptance remains separate.


## P1-04 session foundation — 2026-10-19 working candidate

This is uncommitted work after `a7ce41803`, not a published release or native
qualification. [The plan](../praxis-p1-plan.md#release-goal-and-p1-04-continuation--2026-10-19)
and CONTRACT-079 preserve the remaining gates. The installed candidate's
[receipt](praxis-p1/session-foundation.json) identifies all six host module
hashes and the local wheel. No Weft source or release artifact changed in this
slice. License headers and wheel license metadata retain MIT OR Apache-2.0.

Observed passing checks:

- 22 new session/transport fault-injection tests pass from source and the actual
  wheel installed in Python3.11.17 with Pydantic2.13.5 and2.14.1 using isolated
  `-I` execution.
  All six installed modules match the wheel byte-for-byte. These doubles cover
  scheduling and failure paths; they do not establish PostgreSQL/RLS behavior.
- Both source boundary checks pass (59 Python modules); the 21 boundary negative
  control tests pass with130 assertions. TypeScript project/tool checks pass.
- The scoped portable generated-client tests are recorded separately in the
  receipt (six pass, one native skip,47 assertions). Native cases skipped without a configured database remain unqualified.
- A broader runtime discovery attempt reported37 errors, one failure and37
  skips. A363-test baseline/candidate comparison has exactly the same failing
  identities/counts: missing generated fixture packages/optional Weft, existing
  Pydantic direct-sentinel fixture paths, legacy core-version expectation and
  Unity native-program integrity cases. This is not a clean full-suite result.

The real-browser attempt could not bind its loopback test server in this
sandbox. No browser source changed; no new browser pass is claimed. PostgreSQL
18 initdb failed at shared-memory creation. Five escalated attempts across three goal turns were not
executed because automatic approval review was at capacity. Native person/batch,
actual pool lifecycle, driver transaction and cancellation assertions remain
open. The candidate is neither committed/pushed nor released while that required
verification is missing. The owner has a pending request to restore approval
service availability or task permissions.


Continuation: the real generated `shop.SyncClient` and Weft0.4.44 compiler-only
path in `tests/unified/session_native_e2e.py` passes. It emits a genuine original-
source compiled read artifact without SQL placeholder rewriting. The harness's
native path creates only uniquely named synthetic roles/schema/data and asserts
person/batch RLS, direct/pooled sync and async reads, caller savepoint restoration
and cancellation of an observed active PostgreSQL query before pool reuse. That
path is implemented but remains unexecuted. Its executor is explicitly a bounded
fixture, not a production catalog/privilege admission implementation. Session
cleanup now rejects effective session-user or settings changes and22 installed
fault-injection tests pass on both pinned Pydantic versions. The local wheel
was rebuilt and source bytes compared against its payload; the receipt captures
the updated working candidate, not a published immutable package.


## P1-05 installed Python generation — local qualification

The separate `umf-codegen`0.1.0a1 working candidate executes the original
portable TypeScript generator in embedded V8. [The exact receipt](praxis-p1/python-codegen.json)
records Python3.11.17, macOS arm64, mini-racer0.14.1 / V8 14.4.258.23,
Bun1.4.3 bundle provenance and current wheel/sdist hashes. It is not published.

Observed evidence:

- All15 real TypeScript/V8 cases match complete results or exact refusal details:
  JSON, YAML, CRLF source custody, record/action selections, Unicode, optional
  values, valid arrays and seven invalid/unsupported cases. The installed probe
  forbids subprocess launch, executable lookup and external network connections.
- Installed CLI generate/check passes with exact CRLF source bytes. Check leaves
  output bytes and timestamps unchanged, including when the destination is
  absent. Duplicate options refuse. Writer controls verify hand-edit/untracked-
  file protection, separately owned catalog retention, symlink/path refusal,
  installation rollback and recoverable original backup after failed restore.
- Manifest/bundle corruption refuses. A tiny shared deadline refuses. The actual
  packaging hook accepts current inputs and rejects changed source or damaged
  assets. No independent schema/template port was introduced.
- Repository and sdist builds produce byte-identical wheels. The Python-only
  sdist rebuild also passes with all subprocesses forbidden and PATH empty.
  All18 installed package payload files match the wheel. Source/bundle freshness
  checks, strict mypy across five modules and three boundary test methods with
  eight negative import/execution controls pass.
- [Licensing audit](praxis-p1/python-codegen-licenses.json) verifies first-party
  headers, all pyproject licenses and the candidate wheel's MIT OR Apache-2.0
  metadata and license texts. Five bundled JavaScript dependencies retain their
  own exact license/package notices. The pinned native engine retains its ISC
  license; the test dependency was reconstructed offline from its cached official
  payload after every RECORD content digest was verified.

The Linux/macOS CI job is configured, not observed running. Source remains
uncommitted/unpushed; index/release publication and Linux qualification remain
open. This closes the local no-Bun execution experiment, not the complete P1
release or Praxis lifecycle goal. Native PostgreSQL adapter acceptance is still
blocked: five approval-service attempts across three consecutive goal turns
were rejected because the selected review model was at capacity. None ran the
cluster setup. The final attempt revalidated this after generator qualification.

No live approval/test handle remains. Further native driver, physical-policy,
deployment and mutation qualification depends on that unavailable native gate;
publishing the requested complete cohort is not justified by these local checks.
The full release goal must retain all original lifecycle requirements while this
external block is resolved.


## Resumed native session qualification — 2026-10-19

The owner resumed the full goal and authorized native setup and prerelease
publication after completing the remaining lifecycle work. Approval service
recovered: PostgreSQL18.6 initialized and started on an isolated private Unix
socket. The earlier approval-service block is historical, not current status.

A freshly built host wheel installed in a new Python3.11.17 / Pydantic2.13.5
environment passes [40 live native assertions](praxis-p1/session-native-postgresql.json)
with Psycopg3.2.13, psycopg_pool3.3.3 and Weft0.4.44. Generated sync/async client
reads go through real Weft artifacts under distinct person/batch roles. Native
RLS separates people and explicit batch reads; caller savepoints retain outer
ownership and restore role/settings. A separate connection observes committed
writes and retained state after rollback. Nested async cancellation leaves the
outer transaction healthy. Cancellation of an observed PostgreSQL pg_sleep
returns an idle, reset, usable pool connection. Terminating a borrowed backend
causes its discard and replacement before a different identity runs.

This qualifies the session/lease foundation, not the final runtime: its bounded
read executor is test support, and direct write assertions test session ownership
rather than Weft action compilation. Production catalog/privilege admission,
Psycopg2/SQLAlchemy, complete table/policy/migration/CRUD/count/named/replay paths,
managed acceptance and immutable releases remain open. Weft main has meanwhile
advanced to0.4.46; the existing native cohort remains explicitly0.4.44 until the
successor is rebuilt and replayed. The full release goal stays active.


The resumed source also rejects non-JSON integer/decimal token forms (duplicate
minus signs, Unicode digits, leading zero/plus, whitespace and underscores)
without leaking Python conversion failures. Seven binding identity tests,
including the token regression, and22 installed session controls pass. The
40-assertion native run was repeated against the rebuilt wheel; its updated
receipt includes both exact host/compiler wheel hashes. Hosted native CI now
uses the immutable published Linux Weft0.4.44 wheel with its observed SHA-256,
separate from the locally rebuilt macOS compiler cohort.


## Hosted qualification and repair at P1 source publication

Commit5abcdcb47 was pushed to `codex/praxis-p1-lifecycle`. At that exact head,
[Typed access boundaries run39255052416](https://github.com/DocumentDrivenDX/umf/actions/runs/39255052416)
passes both installed Pydantic jobs, the source-boundary job, the native Linux
PostgreSQL18.6 session job and macOS embedded-codegen parity. Linux codegen
freshness failed because the gzip asset differed between native builders; this
was not treated as a passing Linux qualification. Separately,
[Python support run39255052415](https://github.com/DocumentDrivenDX/umf/actions/runs/39255052415)
passed core tests but reported41 Ruff diagnostics across inherited and new code.

The repair uses deterministic RFC1952 metadata and fixed RFC1951 stored blocks;
wheel packaging supplies compression. Six empty/block-boundary cases round-trip
through a standard gzip decoder with18 assertions. This keeps one byte-stable
universal asset without depending on native compressor behavior. Complete15-case
installed parity, writer/integrity controls, source/sdist wheel equality and
strict typing still pass. The asset freshness check now reports expected/observed
hashes and the uncompressed bundle hash if a future platform differs.

Ruff0.17.1 now passes the entire Python tree: imports/exports and test context
syntax were corrected directly. Narrow inline annotations retain intentional
public Pydantic sentinel re-exports, asynchronous-callable introspection and
rollback/recovery catches that must include cancellation/interruption. No global
lint rule was disabled. The rebuilt installed host still passes22 session and
seven binding identity tests; all40 live native assertions also pass after the
mechanical cleanup. Exact candidate receipts are updated; hosted Linux replay
of the repaired source remains a separate gate.

Weft work continues in isolated `/private/tmp/umf-praxis-weft`, branch
`codex/praxis-lifecycle`, fromfe3864c538bfab407ede0024f8366abb9b054c5e.
The original Weft checkout/branch is preserved. No Weft lifecycle source change
or prerelease is claimed yet; production DB-API/compiler execution and remaining
physical-policy/deployment/mutation gates still govern the full goal.

## Multi-driver native continuation — 2026-10-19

The repair at7c335aaf4 passes hosted
[Typed access boundaries39256785835](https://github.com/DocumentDrivenDX/umf/actions/runs/39256785835),
including Linux/macOS embedded generator installation and native Linux PostgreSQL,
and [Python support39256785669](https://github.com/DocumentDrivenDX/umf/actions/runs/39256785669).
The earlier Linux framing and Ruff failures are resolved at this exact head.

The installed candidate now passes106 local PostgreSQL18.6 assertions with
Psycopg3 3.2.13/pool3.3.3, Psycopg2 2.9.11 and SQLAlchemy2.0.44/greenlet3.2.4.
Psycopg2 covers autocommit on/off, original connection yield, generated person/
batch reads, committed/rolled-back writes, caller savepoints and native-error
recovery, caller write invisibility/outer rollback and broken-pool replacement.
SQLAlchemy covers sync Psycopg2/Psycopg3 and async Psycopg3, original Core
connections, generated identities, owned commit/rollback, caller savepoint/error
recovery, SQLAlchemy bookkeeping, pool reset/replacement, explicit DBAPI-
autocommit refusal and observed native async cancellation before pool reuse.
The exact wheel/source/test hashes and assertion inventory are in the
[native receipt](praxis-p1/session-native-postgresql.json). Hosted CI now runs
these pinned drivers and flags; that new source needs its own hosted result.

`session_psycopg2` owns driver-context versus savepoint selection;
`session_sqlalchemy` owns Core state admission, transaction/execution facades and
invalidation. Both reuse the same authority/settings and lease cleanup contract.
Neither imports a driver, opens a pool or compiles SQL. The original connection
identity remains the concurrency-guard key. Source boundary checks pass61 host
modules; the existing22 installed scheduling/binding tests still pass.

Limits remain material: the fixture executor does not implement full production
catalog/privilege admission; direct writes qualify session lifetime only. New
Psycopg2/SQLAlchemy generated reads use parameter-free compiler SQL. Weft-owned
DBAPI parameter transport is being implemented and must receive separate native
qualification. SQLAlchemy supports transactional Core connections, not ORM
Session, DBAPI autocommit, two-phase transactions or other dialects/drivers.
The full lifecycle release remains pending; no prerelease has been published.

## Compiler-owned parameter transport — successor local cohort

UMF521f0a165 passes all six hosted
[typed-access jobs39257824991](https://github.com/DocumentDrivenDX/umf/actions/runs/39257824991),
including the106-assertion Linux PostgreSQL multi-driver gate and both installed
generator platforms. Python support39257824882 also passes.

Weft's isolated lifecycle branch now publishes source at
e686c27e8c05a17cfbd3a21d14ff5b38c6629b7b. Its compiler adds digest-covered
`dbapiSql`/`dbapiParameterOrder`, preserving original SQL and mapping only actual
PostgreSQL placeholder tokens. Related composition finalizes the parameter
inventory before producing that transport. The rebuilt local0.4.46 compiler
candidate passes187 native assertions with this UMF host: parameterized generated
filters, ordered keyset pages under each person/batch identity, and equivalent
original/DBAPI execution of a Unicode literal containing percent and `$1` text.
[The successor receipt](praxis-p1/session-dbapi-postgresql.json) retains exact
source commits, wheels, test hash, driver versions and assertion inventory.
`--dbapi` is explicit; the immutable0.4.44 compatibility cohort retains its
parameter-free Psycopg2/SQLAlchemy fixture scope.

Hosted native CI now has separate immutable0.4.44 and source-DBAPI jobs. The latter
builds the exact pinned Weft commit using Rust1.90.0/maturin1.9.6 and records the
wheel hash before installation. That successor Linux run is pending. The source
change does not publish a Weft release or qualify the fixture executor as full
production admission. Deployment, policies/grants, migrations, commands/replay,
managed consumer acceptance and package-index/release delivery remain open.
