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
