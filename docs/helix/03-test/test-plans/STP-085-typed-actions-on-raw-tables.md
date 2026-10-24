---
ddx:
  id: STP-085
  type: story-test-plan
  activity: test
  status: draft
  authoring:
    home: repo
  links:
    - id: US-085
      kind: informed_by
    - id: TD-085
      kind: informed_by
    - id: SD-007
      kind: informed_by
---

# STP-085: Invoke typed actions on raw tables

## Story Reference

**User Story:** [[US-085-typed-actions-on-raw-tables]].
**Technical Design:** [[TD-085-typed-actions-on-raw-tables]].
**Related Solution Design:** [[SD-030]]. **Project Test Plan:** [[test-plan]].

## Scope and Objective

Prove that a generated action method on each raw-table target commits only with
the CONTRACT-073 guarantees for that platform, classifies every native result
into exactly one CONTRACT-072 outcome, and refuses unsupported actions and
runtime states before sending a statement. Each platform is qualified
separately; a pass on one says nothing about another.

All tests, fixtures and commands in this plan are planned and **UNTESTED** until
created and executed. The citations below are required future test-source
annotations, not coverage.

## Acceptance Criteria Test Mapping

| AC ID | Failing test to create | Asserted behavior | Required source citation |
| --- | --- | --- | --- |
| US-085-AC1 | `raw_action_commits_serializable` (conformance case `actions.commit`, run on `postgresql` and `lakebase`; static cases in `tests/static/actions_input_bad.py`) | All three pinned checkers reject wrong input; one SERIALIZABLE transaction; typed outputs and original effect/no-op result agree with independent observations. Receipt epoch equals independently issued original incarnation/restore namespace, version equals captured xid8, and store encodes original database identity under CONTRACT-073. | `@covers US-085-AC1` |
| US-085-AC2 | `raw_action_rejects_and_denies_without_change` (conformance case `actions.reject_and_deny`) | A false precondition raises `<Action>Rejected` whose `code` is the first failing declared code; a session without the mapped role raises `ActionDenied`, not `<Action>Rejected` or a native exception; an independent read shows identical rows before and after both calls. | `@covers US-085-AC2` |
| US-085-AC3 | `raw_action_conflict_rolls_back` (conformance case `actions.conflict`; Postgres/Lakebase write skew with a two-connection barrier; Unity Catalog concurrent writer) | The loser raises `ActionConflict` with `retained=False`; none of its writes are visible; the statement log shows one submission per call. | `@covers US-085-AC3` |
| US-085-AC4 | `raw_action_commit_loss_is_indeterminate` (conformance case `actions.commit_loss` with the fault-injecting connection wrapper; Postgres lane also through a TCP proxy that drops after forwarding COMMIT) | Drop acknowledgement after COMMIT. Qualified same-original-scope status returns retained Committed when committed; aborted without deadline raises ActionFailed with ABORTED_CAUSE_UNKNOWN, never Conflict. A wrong cluster, same-system-ID divergent restore, wrong database, unverified replica, missing original result, unavailable epoch continuity, NULL or failed factory yields ActionIndeterminate. Assert no second submission and no unsafe connection reuse. | `@covers US-085-AC4` |
| US-085-AC5 | `raw_action_unsupported_refuses_at_build` (UMF build test) | Policy, person-required on service, roles/1 on service even with native-session attribution, unknown role profile, handler, missing role map and unsupported Spark multi-statement cases produce named refusal entries; no business program runs. Administrative-single-tenant mode does not bypass roles/1 semantics. | `@covers US-085-AC5` |
| US-085-AC6 | `raw_action_runtime_preconditions_refuse` (static case `tests/static/replaying_actions_raw_bad.py`; conformance case `actions.runtime_refusals`) | Pyright, mypy and ty reject `ReplayingActions(raw_target)`; at run time that construction raises `TypeError`; a connection inside a host transaction raises `ActionRefused` with `TRANSACTION_STATE`; zero statements are sent and the host transaction status is unchanged afterwards. | `@covers US-085-AC6` |
| US-085-AC7 | `uc_action_atomic_block_and_receipt` (managed Unity Catalog lane) | Exactly one atomic block executes on admitted tables. Decode the string receipt and compare its UUID/version vector to this exact native commit, with a concurrent later writer proving that a history head is not substituted. Missing catalog commits, original epoch custody or exact commit version attribution refuses qualification. | `@covers US-085-AC7` |
| US-085-AC8 | `raw_action_validate_reports_all` (conformance case `actions.validate`, run on `postgresql` and `lakebase`; needs Weft WR-B4) | For an input making "order is paid" and a second declared precondition false, `validate()` returns `valid=False`, `complete=True` and both codes; for a valid input it returns `valid=True` with no failures. The server shows each call's transaction rolled back, and an independent read shows identical rows before and after. | `@covers US-085-AC8` |
| US-085-AC9 | `raw_action_returns_created_and_changed_keys` (conformance case `actions.returned_keys`; static case `tests/static/committed_keys_types.py`; needs Weft WR-B4) | After `shipOrder` commits, `Committed.created == (ShipmentKey(...),)` and `Committed.changed == (OrderKey(...),)`, equal to Keys read independently; pinned pyright, mypy and ty reveal both as tuples of the action's generated Key DTOs. | `@covers US-085-AC9` |
| US-085-AC10 | `async_raw_action_matches_sync` (conformance action cases rerun with `AsyncPostgresTarget` and `AsyncLakebaseTarget`) | For the commit, rejection, denial and conflict fixtures, awaited outcomes, raised failures, receipts and `validate()` results equal those of the sync target; the server observes one `SERIALIZABLE` transaction per call; static cases reveal an awaitable of the sync result type. | `@covers US-085-AC10` |
| US-085-AC11 | `raw_action_timeouts` (conformance case `actions.timeout`; lock held by a second connection; fault-injecting wrapper holding the COMMIT acknowledgement) | For sync and async, a held lock and confirmed cancellation/rollback after deadline yield ActionTimedOut with no effect. Delay COMMIT acknowledgement: qualified committed status returns retained success; qualified aborted status after deadline yields ActionTimedOut. Unresolved cancellation, precommit disconnect/rollback, original scope or commit yields ActionIndeterminate. Assert original settlement independently, no automatic retry, and quarantine of uncertain connections. | `@covers US-085-AC11` |
| US-085-AC12 | `multi_effect_action_atomic` (conformance case `actions.multi_effect`; `created` needs Weft WR-B4) | `addNoteWithReminder` commits both rows in one transaction (same `xmin` observed) with both Keys in `Committed.created`; with the reminder violating a check constraint it raises `ActionFailed` and neither row exists. An inventory of public callables in `umf_access` and the generated package finds no method that begins, joins or commits a transaction across action calls. | `@covers US-085-AC12` |
| US-085-AC13 | `person_required_on_human_target` (build test plus native lane) | Qualified human per-user sessions compile person-required/roles1. Alice and Bob retain distinct session_user and current_user attribution; SET ROLE does not relabel the authenticated human. Native role checks use the qualified human correspondence. A service connection and a human label without its qualified binding refuse. | `@covers US-085-AC13` |

| US-085-AC14 | `native_dependency_closure_fenced` (conformance `actions.native_admission`) | An undeclared FK cascade, trigger write and unknown routine/policy dependency each refuse before business dispatch. Race dependency replacement with admission and prove the fence prevents an outside-frame effect. Repeat after a verify-cache hit. Lost fence after dispatch returns known failure only with positive rollback, otherwise indeterminate. | `@covers US-085-AC14` |

## Executable Proof

Planned commands (none exist yet):

```sh
python -m pytest python/umf_access/tests/build/test_action_refusals.py
python -m pytest python/umf_access/tests/static/test_action_inputs.py
python -m pytest python/umf_access/tests/native/test_actions.py --umf-target postgresql
python -m pytest python/umf_access/tests/native/test_actions.py --umf-target lakebase
python -m pytest python/umf_access/tests/native/test_actions.py --umf-target spark-delta
python -m pytest python/umf_access/tests/native/test_actions.py --umf-target unity-catalog
python -m pytest python/umf_access/tests/native/test_async_actions.py --umf-target postgresql
python -m pytest python/umf_access/tests/native/test_async_actions.py --umf-target lakebase
```

The native test module runs the shared `umf_access.conformance` action cases
(`python/umf_access/conformance/`) against the selected target, then the
platform witnesses above. Commands run in the isolated pinned profile
environment, separately, each with its own retained status; a later success
cannot hide an earlier failure. Static-negative cases assert the expected
diagnostics and a nonzero checker status, with a positive control showing the
imports resolve.

Retain results under `docs/helix/04-build/evidence/typed-persistence/` with the
platform name and version, driver version, catalog digest, command, status,
expected and observed facts and the independent observation queries. A missing
Lakebase endpoint or Unity Catalog workspace is recorded as not run, never as a
pass.

## Data and Setup

A small UMF model with `Order` and `Shipment`, a `shipOrder` action (precondition
"order is paid", two effects, role `fulfilment`), a single-effect action for
Delta, and actions that need policy authorization, `person-required` (on service-principal targets)
attribution, a handler and an unmapped role. Pinned role maps per target.
Owned, isolated databases or schemas with explicit cleanup; a dedicated Unity
Catalog schema with one managed table with catalog commits and one without.
An `addNoteWithReminder` action with two effects and a check constraint on
`Reminder`, a `person-required` action, one target configured with
`sessionPrincipal: human` and login roles `alice` and `bob`, and a second
connection that holds table locks for timeout cases. Validation and returned-Key
cases need Weft WR-B4 and report not-run until the pinned Weft admits it.
Concurrency fixtures use explicit barriers, not sleeps. Expected values come
from independent queries, not from the adapter under test.

## Edge Cases and Failure Modes

Postcondition false (`ActionFailed` wrapping the native error, rolled back),
native privilege refusal (`ActionDenied`), missing unique constraint for a
Key create, unlisted Lakebase minor version, a Delta target without commit
versions, and `spark-delta` authorization without the single-tenant declaration.
No test may execute a live mutation twice to compare implementations.

## Build Handoff

Create the conformance cases and red tests first, then the build-time refusals,
then each platform adapter in TD-085's order. Every AC needs an exercising
assertion carrying its `@covers` tag. Done for a platform only when every case
for that platform has passed with retained evidence; unrun platforms stay
unqualified, and support is claimed per platform version only.

## Table lifecycle successor qualification — 2026-10-21

CONTRACT-081 and the Praxis roadmap govern the bounded lifecycle extension.
`tests/lifecycle/migration.test.ts` covers source-derived comments, legacy bundle
recovery, required-column backfill options, appended checks/FKs, exact plan
recompilation and refusal of unacknowledged/mixed concurrent effects.
`tests/lifecycle/test_cli.py` covers offline chain/terminal-source/original-file
checks, exclusive new-file creation and approval before native connection.
`tests/lifecycle/native.py` uses fabricated legal domain-pack schemas: assigned
team membership limits matters, reference metadata is explicitly readable,
billing data has a trusted group, roster writes deny ordinary/batch callers,
and batch has only declared commands. Native checks cover backfill bound rollback,
NOT NULL/default completion, added constraints, failed concurrent uniqueness,
source-prefix resume, explicit invalid-index repair, metadata-head fencing,
immutable file/ledger replay and native comment drift. Generated sync page/action
calls exercise the original Weft prepared compiler. Exact installed wheel and
source hashes must accompany success; no private Praxis/Lakebase proof is inferred.

The existing real Chromium lifecycle script includes the three legal schema
stages and source-exact migration verification; the embedded corpus includes the
same generation/refusal cases. U1 mixed phases/NOT VALID/VALIDATE, U2 reviewed
existing-object changes, U5 generic host custody and U6 untrusted SQL containment
require their own new tests before next-release support claims. Existing scalar
and host/platform qualifications remain independently scoped.

## Revision2 U1–U3 release acceptance

CONTRACT-081's evolution profile and the Praxis roadmap govern these P0 cases.
Use fabricated legal data only; no private consumer payload is required. Record
exact PostgreSQL, source, schema, compiler and installed wheel versions/hashes.
Native PostgreSQL evidence and managed Lakebase/Praxis acceptance remain separate.

| Case | Primary layer | Required observation |
| --- | --- | --- |
| U1 mixed plan | Bun, real Chromium, embedded Python | One exact plan adds/backfills a required column, builds a concurrent index, adds a NOT VALID CHECK/FK and validates it; phase order and transaction modes agree across runtimes; legacy 0.1 bytes remain exact. |
| U1 committed progress | PostgreSQL18 installed native | Interrupt before/after every commit boundary and concurrent dispatch; resume preserves exact backfill/seed effects without repetition, history stays old until complete, and ordinary old/new clients stay fenced. |
| U1 hostile recovery | PostgreSQL18 installed native | Changed plan/file/head, forged progress, wrong ACL/metadata shape, unrelated objects, invalid index and noncontiguous prefix refuse; explicit exact invalid-index repair succeeds; lost final response is observed without resending effects. |
| U2 reviews | Bun/Chromium/embedded Python | Unreviewed drop returns destructive_change_unreviewed with names/paths; each missing, stale, duplicate, unknown or unused marker refuses; changing approved source/digests fails recompilation. |
| U2 supported effects | PostgreSQL18 installed native | Independently exercise column drop/rename, finite type widening, nullability, Key replacement, constraint/index drop/rename/replacement and policy change. Compare rows and catalogs with independent expectations and assert old-client refusal. |
| U2 unsafe forms | PostgreSQL18 installed native | Nulls block tightening; invalid/duplicate data blocks constraints/Keys; narrowing/unknown conversion, inbound FK, policy/operation reference and unreviewed dependent deletion refuse without partial transaction effects. No CASCADE fallback. |
| U3 normalization | Bun/Chromium/embedded Python | Exact supplied owner+via block plus explicit Field-pair context yields person CRUD, batch SELECT/INSERT and denied batch UPDATE/DELETE. Preserve original/unknown bytes and output locations; unknown groups/joins/cycles refuse. |
| U3 actual policy | PostgreSQL18 installed native | Two people plus separate batch: owner and membership access, open reference SELECT, trusted group, hidden membership, membership reassignment, old/new-row denial and direct SQL controls. FORCE RLS remains enabled; omitted commands gain no grant. |

Release requires these native examples on the actual built wheels, source-exact
generation/check and CLI/library parity. A passing schema validator or inert SQL
comparison cannot substitute for effects/recovery evidence. Bound support claims
to the exercised conversion/dependency inventory; report remaining unsupported
forms with their located refusals. Public release does not prove that Praxis can
delete its emitter without its independent eleven-table/four-migration workload.

SD-007 release review additionally requires typed dependency cases where a native
column drop would automatically remove a local check/index despite RESTRICT;
logical-domain narrowing disguised as native widening; and concurrent direct
authorized writes during requiredness validation/activation. Review disclosure
must name irreversible instance-value loss. Separate fail-if-null tightening of
an existing optional column from historical fill, which remains unsupported;
retain positive appended-column backfill coverage. After an interrupted committed
stage, assert old metadata head, changed physical state, fenced clients and exact
resume without replay. Do not assert physical rollback from an unchanged ledger.
The release inventory marks these bounded operations qualified/refused/remaining
and does not claim complete SD-007 field-lifecycle delivery.

## Embedder completion acceptance

The [completion plan](../../04-build/praxis-embedder-completion-plan.md) selects
U4–U9, MIG-G01 and actual consumer/managed acceptance. CONTRACT-081's successor
and SD-007 own behavior; TD-085 owns integration. Extend the current primary
suites below. No passing count or new release is asserted by this allocation.

| Coverage / fixture owner | Executable proof to add or extend | Required result |
| --- | --- | --- |
| U4 / schema owner | `tests/binding/table-domains.test.ts`, `tests/binding/table-deployment.test.ts`, `tests/lifecycle/legal-fixture.ts`, real native legal harness | Descriptions survive round trips and escaping; enumerated/range values have exact bounds and ordinary NULL semantics; invalid native writes fail. Same generated declarations in Chromium/embedded Python; unsupported carriers give located refusals. |
| US-051-AC12/16, G01 portable / migration owner | `tests/binding/table-migration.test.ts`, lifecycle browser corpus and embedded `umf_codegen` parity | Existing same-ID optional→required target with selected exact null-only command compiles one paired phase. Missing/changed/unused/duplicate marker/selector, wrong predicate/target, extra assignment/returning/parameter/batch, invalid/nullable value, clock-to-date, generated/immutable and rename/type/default/dependency compounds refuse. 0.1/0.2 artifacts retain original verification/effect admission. |
| US-051-AC12/15, G01 native / migration owner | Extend `tests/lifecycle/mixed-native.py` or focused `tests/lifecycle/existing-fill-native.py` sharing its native helpers | Empty/all-null/mixed/populated dates and qualified instants; exact existing values and unrelated data survive. Zero matches succeeds; over-bound, Key/CHECK/FK or NOT NULL failure rolls back pair/progress. Default alone does not fill NULL; future default behavior unchanged. |
| US-051-AC15, G01 writers/recovery / runtime owner | Same installed native harness with two actual sessions and driver fault injection | Held/direct writer and writer dispatched immediately after UPDATE cannot cross pair activation; native NOT NULL rejects later NULL even before final head publication. Before/after pair commit, cancellation/lost response and later failure preserve atomic pair, fences and no repeated UPDATE/clock. Wrong file/head/plan/approval/command, native/progress/privilege drift refuses before new effects. Compose with indexes/validation/seeds or reject complete plan. |
| U5 / host owner | New focused protocol/approval unit corpus plus existing `mixed-native.py`, `reviewed_native.py` and CLI tests | Forward-only original file/head/terminal source and target/decider approval bindings. Refuse deficient host capabilities and forged/missing approvals. Persist approval intent distinctly from committed outcome; effect/progress and final publication atomicity demonstrated on native PG, uncertain result observed without replay. Old strict inventory/verification stays exact. |
| U6 / containment owner | New `tests/containment/` parser corpus and embedded/CLI host tests | Nested CTE/subquery/callable refs, quoted/dollar/comment/multi-statements; foreign schema, role/schema DDL, stored code, settings, external grants, unsafe function/operator/type and unknown AST nodes refuse. Allowed inventory cases pass. Bounds/deadline/control failures retain source and no check/import effects. |
| U7/U8 / release owner | Existing installed generator/deployment/migration probes plus mirror runner with empty caches and disabled network | Every advertised OS/architecture/libc/Python cell records exact native wheel hashes, versions, sizes/notices and generation/refusal parity. Complete transitive locked offline install, RECORD/source/license correspondence; missing/tampered wheel fails with no network or source-build fallback. |
| U9 / Hohfeld owner | Hohfeld actual reader/host suite and clean installed release; same-source Weft compiler/operation probe | Exact core 0.10 document admitted by both systems for the selected journey, preserved keys/codecs/declared meaning, explicit unknown/legacy refusals, actual native selected host effects/reads and immutable released artifact/date. No general graph-migration claim. |
| Consumer / integration owner | Private exact eleven-table/four-migration conversion and generated plugin/batch runner, using installed candidate wheels | Every item mapped or blocked explicitly; retained applied-file digests and final source agree. Actual person/batch/owner+via/group access, sync/async calls, bounds/counts/default/NULL/replay/fault controls pass locally; private data never enters public fixtures. |
| Managed / platform owner | Same target-bound consumer runner on explicitly authorized isolated Lakebase/Databricks target | Actual permission/server/driver/platform profile and required workload observations retained privately; public aggregate hashes and result. Unavailable target remains blocked, never replaced by local PG evidence. |

Mark primary G01 tests with parseable `@covers US-051-AC12`, `@covers
US-051-AC15` and `@covers US-051-AC16` references. Retain historic append-fill,
no-fill tightening and actual published history controls. The release gate uses
one frozen cohort across source, generated assets, browser, installed/native and
offline results, plus independent review of changed material. Test fixtures and
runners may be created in their named bounded slices; these paths are allocation,
not evidence that those new tests already exist or pass.


### Approval metadata reader and predecessor acceptance

Extend `tests/lifecycle/host-native.py` and the installed G01 native harness with
source-selected transition and final generated-reader cases. The exact test
runner name may follow the existing host harness; these are required observations:

- Record approval while the verified predecessor still uses its original source
  profile; apply/resume accepts only the exact active plan 0.3 transition context,
  complete predecessor/head custody and proved owner-only sidecar shape. Wrong
  plan/head/source/profile or an unrelated extra relation refuses before effects.
- Final application and fresh administrative inspection issue the closed
  installation reference 0.3, with approvalPlanDigest equal to current planDigest.
  Historical replay returns the verified current reference without reinterpreting
  old plans. A new unsupported metadata downgrade refuses explicitly.
- Construct a generated client from that actual final reference. A person and
  batch principal perform supported reads/actions, while full prepared head and
  correspondence checks succeed without approval SELECT privileges. Native direct
  SELECT of approval rows by each audience fails; no result contains receipt
  decider, decision, time or qualification/evidence values.
- Extra/missing approval relation, changed owner/ACL/column/constraint/index,
  trigger/rule/policy/foreign dependency and changed reference profile/plan/shape
  fail explicit full correspondence. Granting person/batch table or column access
  also refuses. Rehashing a malformed reference does not pass closed-version
  validation. Restore exact native state between independent tamper probes.
- Frozen 0.1/0.2 references retain their old exact key sets and strict inventories;
  they refuse a lookalike extra approval relation. Existing plain outcome/head
  and generated-operation tests still pass without a source-selected sidecar.

Record exact installed runtime/generator/source hashes and final person/batch
observations. This is a release-blocking data-client integration gate, not proof
from approval-store unit tests or a successful migration return alone.
## G02 typed same-row backfill acceptance

SD-007 and CONTRACT-081 select operation 0.2, migration/options 0.4, execution
0.3 and guarded Weft program 0.2. TD-085 owns component integration. These planned
cases extend the existing primary suites; no pass is claimed by their presence.
Both existing-target and appended-required-target shapes must pass before release.

| Stable criterion / primary layer | Test and source citation | Required observation |
| --- | --- | --- |
| US-051-AC12/16, portable | Extend `tests/binding/table-migration.test.ts`, `tests/lifecycle/migration.test.ts`; `@covers US-051-AC12`, `@covers US-051-AC16` | Exact closed AST/options/plan/version admission; stable old/new input closure; no target self/new sibling/related/ambient dependencies; max depth/node/fanout/token and per-node numeric budget; all refused inputs yield no partial plan |
| US-051-AC12/16, compiler parity | Shared derived-backfill fixture through Bun, lifecycle Chromium suite and installed `umf_codegen` | Deterministic plans/refusals and original source/AST identity; explicit UMF Rust 0.4 refusal; 0.1–0.3 frozen verification/replay and default TS/V8 path unchanged |
| US-051-AC12, Weft shared Rust | Extend `crates/weft-postgresql/tests/table_operation.rs`, native Python and real WASM browser corpus | Field/literal/coalesce/strict concat/add/subtract/multiply/conditional type and NULL semantics; exact program 0.2/guard closure, fully qualified resolution and private marker isolation; source/AST/SQL/program self-rehash forgery refuses |
| US-051-AC12/15/16, installed native | New `tests/lifecycle/derived-fill-native.py` using existing G01 helpers; cite all three ACs | Distinct manually specified per-row results for fabricated Person and commerce domains; existing optional tightening and appended required field with/without future default; preserved present/input/unrelated data and final catalogs |
| US-051-AC12/15, native invalid data | Same installed native suite and reviewer-owned independent oracle | NULL result, NaN numeric input (including unused branch), NaN result, decimal rounding, intermediate/resource excess, integer overflow, significant trailing spaces, Unicode/varchar length, enum/range/CHECK/unique/FK and maxRows failures abort the entire phase including earlier valid rows |
| US-051-AC15, native writers/recovery | Same installed native suite with actual two-session barriers and driver fault injection | Writer exclusion across complete existing/append phases; no partial column/fill/default/constraint/progress; known abort retry, lost commit response observation, committed phase never repeated, later failure keeps ingress fenced until exact resume |
| US-051-AC16, host admission/privacy | Extend host-native/progress tests and derived suite | Wrong old/new source, selector, marker, AST/ref, approval, program version, guard descriptor, partial/reordered phase or native privilege/catalog drift refuses before effects; ordinary errors contain SQLSTATE/paths, never native DETAIL/raw rows |

Use synthetic non-PII records with multiple different inputs, all-NULL/mixed/
populated targets, valid and invalid rows in the same statement, and zero matches.
Expected decimals use manually specified exact tokens or an independent
high-precision decimal calculation, not the implementation AST evaluator. Include
numeric(p,s) NaN despite its finite typmod, and invalid data in an unused branch.
Test text/native numeric assignment alterations that satisfy the target's native
type but differ from the intended result. Snapshot actual rows/catalog/progress
before a failing phase and independently prove complete rollback afterward.

Append fixtures must prove nullable creation, only NULL-permitting target domain
CHECKs, fill, optional future default and final NOT NULL share one native required
transaction. A NULL-rejecting staged CHECK explicitly refuses; a compiler may not
weaken it. Existing-target fixtures retain native constraint failure cases.
Every unsupported compound refuses before any executable plan is emitted.

Run the existing boundary commands and negative controls before feature handoff.
After source tests, build fresh SDK/access/codegen and Weft Python/WASM artifacts;
audit source/embedded/RECORD/schema hashes and run isolated installed native tests
on the exact cohort. The design reviewer independently executes native acceptance
on the frozen candidate and reviews scoped support and platform receipts.
Release gates include required CI, reviewed actual merge/source equivalence,
immutable packages/mirrors/licenses, and two independent fresh published-download
comparisons plus the packaged network-denied offline probe. Managed/Praxis
acceptance and MIG-G03–G11 are separate gates, never inferred from local passes.

## G03 existing-column future-default acceptance

CONTRACT-081 selects the exact successor surface; SD-007 and TD-085 govern
ownership and integration. The following allocations are planned tests, not
executed G03 evidence. Existing G01/G02 and PostgreSQL feasibility observations
retain their narrower scope.

| Stable criterion / layer | Planned test and source citation | Required observation |
| --- | --- | --- |
| US-051-AC12/16, portable | `tests/lifecycle/g03-defaults.test.ts`; `@covers US-051-AC12`, `@covers US-051-AC16` | SET/replace/DROP for one existing nullable/required target; exact version and marker consumption; all other source meaning unchanged; coupled missing-only logical/native defaults; both sources independently compile; invalid required-create omission refuses. |
| US-051-AC12/16, literal admission | Same suite and `tests/binding/table-migration.test.ts`; same citations | NULL versus absence, exact numeric capacity/refinements, unsupported volatile domain, NUL/unpaired surrogate and decoded/rendered UTF-8 boundary controls; supplementary Unicode and escaping preserved; no partial plan or native effect on refusal. |
| US-051-AC15/16, source/phase authority | Same suite plus host phase tests; `@covers US-051-AC15`, `@covers US-051-AC16` | Absent-to-NULL and equivalent numeric spelling still produce one required DDL/progress phase; equal native witnesses cannot skip or publish; source/default/marker/step/phase/approval/progress tampering refuses. |
| US-051-AC12/16, compiler parity | Shared new corpus through Bun, real Chromium and installed `umf_codegen`; same citations | Deterministic discovery, plan, verification and refusals; old two-member discovery and profiles 0.1–0.4 retain frozen outputs; opt-in unsupported Rust successor refuses before effects. |
| US-051-AC12/15/16, installed native | `tests/lifecycle/g03-defaults-native.py`, fixture producer and independent reviewer oracle; cite all three | PostgreSQL18.6 nullable and required SET/replace/DROP; unchanged complete historical row snapshots including NULLs; distinct omitted/explicit-NULL/explicit-value commands and raw writes; logical validation does not insert defaults; no UPDATE dispatch or row rewrite. |
| US-051-AC15, volatile/native boundary | Same installed suite; `@covers US-051-AC15` | UUID values use the qualified generator; timestamps equal transaction start across later statements; malicious search_path cannot replace builtins; unchanged RLS/constraints/ACLs remain effective. |
| US-051-AC15, real recovery | Same suite with two-session writer barriers and driver fault injection; `@covers US-051-AC15` | Native writer exclusion, rollback before commit, lost COMMIT response with committed progress and no redispatch, same-catalog transition with/without authenticated progress, publication fault/resume and retained fencing. |

Selected discovery 0.2 must refuse retained YAML with the actual previous or
next source-format pointer, while unselected YAML discovery retains its old
output. Test Python `options=None` omission separately from raw bridge
`options:null` refusal; do not assign one expected result to both routes.

Temporal literal controls must include a native date default `2000-02-29`
without a logical Field default, an invalid Gregorian date, the wrong carrier,
and temporal facets/allowedValues. Unsupported temporal logical defaults must
still fail complete-source admission. Preserve numeric and string refinement
refusals to prove that native temporal admission does not relax other domains.

Use fabricated commerce integer/decimal targets, Person nullable values, an
audit transaction timestamp and UUID identifiers. Manually specify expected
historical and new row values. Include an empty table and multiple differing old
rows. Compare complete values, row identity/version witnesses and relation-file
identity where applicable; catalog equality alone cannot prove nonmutation or
source publication. Keep exact source distinctions for absent versus literal
NULL and numeric spellings. Command-free-only coverage cannot replace positive
omitted/explicit command cases.

Planned portable command: `bun test tests/lifecycle/g03-defaults.test.ts`.
The native runner must take an explicit isolated target, frozen fixtures and
report path; run it through a fresh installed wheel cohort and independently
repeat its assertions. Exercise both host-neutral and Psycopg routes, including
sync/async where supported. Add default-only replay to the frozen historical
corpus before extracting the shared renderer, so a byte change fails its gate.

Release acceptance requires the actual final source workflow inventory,
source/merge tree correspondence, source/SDK/embedded/RECORD custody, full locked
platform closure and separate optional-parser license custody. Independently
review the exact cohort and repeat fresh published-download/offline tests.
G02 candidate artifacts, guessed dependency counts, another package's release
version and local native feasibility do not satisfy these G03 gates. Managed
consumer, other backends, G10/G11 command composition and Praxis changes remain
outside this slice.


### G03 selected-module compatibility allocation

These are additional planned acceptance criteria, not completed evidence.
Allocate US-051-AC12/15/16 citations to the actual source-admission, native
session, fixed-query, operation-input and table-outcome suites.

- Validate policy default/exact opt-in, unknown strings/non-string refusal,
  immutability and absence of a request-wire/GUC selector. Freeze historical 0.1
  module outputs, cursor derivation, authority scope and outcome receipt bytes.
- On the same default-bearing retained source, module 0.1 still refuses while
  selected 0.2 admits the qualified literal subset. Invalid/mismatched defaults,
  unknown qualifiers and unsupported temporal logical defaults refuse. Native
  date-only defaults retain their separate positive and negative controls.
- Use an actual compatible immutable Weft native artifact and freshly installed
  UMF packages. Selected 0.2 against historical Weft refuses without fallback or
  database effects. Exercise wrapper propagation, not a native-only shortcut.
- Execute ordinary read, declared query, create/update and outcome recovery in
  sync and async routes. Preserve omitted, explicit NULL and explicit value
  behavior and complete historical rows. No default input materialization or
  UPDATE may be introduced merely by preparation.
- Reuse a source-owner cache/prepared handle across profiles and require early
  refusal. Copy a valid page token across profiles and refuse authentication.
  Seed an occupied native outcome slot with the same identity, operation and
  key, then retry/recover under the other profile: find the same slot, refuse
  incompatible scope/invocation and prove exactly one original business effect.
  Repeat both profile directions; a different secret or deployment must not
  evade the stable occupied slot. Include rollback and lost-COMMIT recovery.
- Run the full G03 future-default native matrix after admission is fixed;
  successful preparation alone is insufficient. Preserve G01/G02 historical
  profile checks, actual Chromium/compiler parity, package closure/custody and
  independent published artifact verification. Report any unqualified carrier,
  wrapper, host route or managed identity as an explicit remaining limit.

## G11 combined replacement acceptance allocation (proposed)

Allocate US-051-AC12/15/16 coverage to a dedicated portable G11 suite, compiler
parity corpus, host-profile/refusal suites and fresh installed native runner.
These are planned gates, not execution evidence.

- Stable-ID drop/add with equal and different counts; reuse the old SQL name
  with a new Field identity and prove no implicit rename/value transfer. Include
  nullable no-fill/no-UPDATE and required G02 fill from unchanged inputs; reject
  old-only input copy, new-field chain and future-default-only historical fill.
  Add at least two new required Fields with independent explicit fills, verify
  deterministic ordering and complete expected rows, then fail the second fill
  and prove all first-fill values and DDL rolled back. Test aggregate effect and
  absolute deadline exhaustion without resetting budgets per operation.
- Complete Key/FK/check/index/policy/grant and operation dependencies; explicit
  supported replacements with exact markers, unknown/native dependency refusal,
  inbound retained-table dependencies and deterministic DAG ordering. Refuse
  concurrent effects and unsupported generated cycles. Roll back native
  constraints on invalid complete data, including rows ordinary RLS hides.
  Include NULL-rejecting and cross-new-Field CHECKs that pass only after both
  fills, precise target-check versus dependency-check ownership, and unchanged
  complete CHECK semantics. Reused declaration pointers with distinct operation
  IDs must consume distinct complete markers, never path-only deduplication.
- Actual Person create example: remove old Field `legacyName`, remove its old
  read command, add required `displayName`, and explicitly add a new create
  parameter/assignment. Use unchanged `name` as the reviewed historical fill
  input. Validate both complete sources and regenerated parameter/result types.
  Do not use a source that was invalid before migration as a positive fixture.
  Exercise actual ordinary create after publication and reject the old client.
- Companion parameter removal with another retained use refuses; unchanged
  operation context changes require conservative context markers; unrelated same-ID predicate,
  audience/effect changes refuse. Added/removed command markers are exact and
  fully consumed. Policy review does not grant ordinary batch UPDATE.
- Real old reader/writer transactions and direct granted clients during cutover:
  block/drain before native replacement and keep fenced until publication.
  A prepared old query must never read a new Field through a reused SQL name.
  Include inherited/PUBLIC grants and actual non-owner principals; administrative
  SET ROLE checks alone do not qualify authenticated client isolation.
- Inject failure after each dependency/carrier/fill/default/constraint action
  and before commit: complete old values/catalog survive, no phase completion,
  ingress remains accurately fenced. Inject lost COMMIT response and final
  publication failure: observe exact progress, resume without duplicate fill,
  and retain deleted-value irreversibility disclosure. Forge equal final
  column counts/native names without progress and require refusal.
- Old discovery/profiles and byte-frozen outputs remain unchanged; G03 selected
  module propagation remains explicit where required. Bun/real Chromium and
  installed compiler parity, both host routes, fresh qualified native artifact
  cohort, platform closure, public-download byte identity and release notes
  with all remaining G02–G11 limits are separate mandatory release gates.

Context controls cover an unchanged operation with cross-module Field changes,
metadata-only source byte changes and complete configuration changes. Verify
exact RFC8785 context digests, full source-byte hashing once per side and no
context marker for a changed declaration. Actual Weft result/parameter typing
remains a separate acceptance check. Generated subject controls tamper role,
rule, command, ordered mutable column identities/names, expression and digest;
refuse name-only adoption, role/relation recreation and extra PUBLIC/inherited
capabilities. Positive UPDATE grant scheduling must preserve unrelated mutable
columns and exclude immutable/generated/Key columns exactly.

Whole-source negative controls alter schema/roles/group mapping, retained table
name/order, retained Field default/type/nullability/facets/generation/immutability,
unknown qualifiers and unrelated content. Even complete forged review markers
or a changed source-context digest must not authorize them. Positive shared-Field
cases retain a definition still used elsewhere while dropping only one selected
native mapping. Preserve retained relative ordering and exact new authored order.
Test a predecessor containing seeds unaffected by selected Fields (unchanged,
no replay), a seed row referencing a removed Field, and a row made invalid by a
new required Field. The latter cases refuse before effects with located seed
diagnostics. Editing/removing those declarations to make a fixture pass also
refuses as an unsupported seed companion, explicitly reported as a remaining
G11 limit. Metadata history/source custody is not mistaken for restoring purged
business values.
