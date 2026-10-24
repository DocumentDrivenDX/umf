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


### G11 generation ingress acceptance

Allocate US-051-AC15/16 to the concrete provider/custodian/store tests and real
G11 installed-native runner. Structural/fake provider tests are source controls;
they cannot qualify any native capability. Pin full artifacts/auth/HBA/runtime
versions, source census, custody and the actual PostgreSQL18.6 source ordering.

- Enroll an existing isolated populated installation with stable Alice/Bob/batch
  roles and real SCRAM login epochs. Verify unchanged CURRENT_USER/roleOIDs,
  owner values and occupied outcome slots across credential rotation. Prove
  wrapper memberships SET-only/noninherit/noADMIN and no cross-subject/owner/
  controller reachability. Legacy LOGIN-subject enrollment permanently converts
  that authentication role to NOLOGIN without changing subject identity.
- Use old actual connections that already SET ROLE, prepared SQL, held cursors,
  idle and active transactions. Race reconnects/late pool checkout and a paused
  actual SCRAM handshake begun before fencing. Capture starting/NULLidentity
  backend tokens without role/database filtering; wait unknown unrelated
  handshakes, never broadly kill them. Prove all old sessions actually gone,
  wrong credentials/old principals denied after fence AND publication, and only
  explicitly re-admitted successor logins can bind the reused native name.
- Independently verify full native stats access/fresh snapshots, exact owned PID/
  backend_start identity, timeout-positive termination versus signal-only result,
  PID reuse and native authentication registration ordering. Failed termination,
  invisible stats, extra PUBLIC/inherited/definer access, prepared transaction,
  unknown role/marker/target and resource exhaustion refuse before carrier effects.
- Verify exact private store DDL/owner/inventory/constraints/indexes/ACL and
  closed record/column/digest correspondence. Native concurrent requests cannot
  create two active epochs or competing original transition bindings. No app or
  business owner can access the store; no extra-object namespace waiver.
- Verify actual same-connection controller-role hook entry/restore around phase
  and publication DML. Inject denied SET, wrong actor/settings, SQL error,
  timeout/cancellation and failed restoration. Prove no business-only commit or
  controller connection returned to a pool. Record previous catalog at index0,
  next at index1 and distinguish predecessor metadata head from cutover carriers.
- Inject failure/crash/lost acknowledgement at fence commit, each retirement,
  phase commit, final publication and external confirmation. Reconcile original
  binding/reservation/progress/native state without duplicate effects or a new
  transition. Preserve durable fence/retired credentials on uncertainty.
- Copy/restore the database/control schema while retaining the actual external
  custodian journal. Prove wrong resource/incarnation/rewind is refused BEFORE
  ordinary endpoint exposure; no same-name/OID-marker adoption. Authorized
  restart/restore is custodian-controlled and opens admission only after verified
  continuity or separately approved recovery/new incarnation.
- Reproduce the real commit-to-finalize crash gap with old prepared direct SQL:
  no old login/session regains authority when successor data/head ACLs return.
  Newly authenticated principals require exact new reference and explicit fresh
  admission; source factory/head/token checks remain effective. Cached old data
  already delivered is not represented as new-generation results.

Complete the independent multiple-fill rollback oracle, whole dependency/CHECK
and command matrix, both host routes, browser/planning compatibility, final
installed artifact cohort and public release-byte gates. Record unqualified
managed issuers, seed-history evolution, generated dependency compositions,
old-only copies and retained recovery separately; passing this provider subset
must not erase the full remaining backlog.

- Provision disabled successor roles before final OID-bound transition approval.
  Lose the provision COMMIT acknowledgement and reconcile the original creation
  receipt; reject same-name adoption, guessed OIDs and a recursive future digest.
- Verify exact trusted policy bounds, boolean/unknown-member refusal, immutable
  approval binding and legacy behavior. Execute two fills that individually fit
  maxRows but jointly exceed the actual aggregate counter; prove the first fill
  executed and the second overflow rolls back all business effects. Count the
  same business row twice when two fills affect it; prove no-fill dispatch is zero.
- Use multiple individually short native statements whose combined runtime
  exceeds the phase budget, including a blocked statement and COMMIT boundary.
  Prove transaction_timeout was installed before BEGIN, the native transaction
  aborts, the host cannot dispatch after expiry, and timeout restoration/discard
  and unknown COMMIT reconciliation preserve original custody. Fake clocks are
  source controls only; actual PostgreSQL18 timeout behavior must pass.
- Qualify a retained missing-only-default source through module0.2 with an
  explicit typed backfill and unchanged future-default behavior. Pin the actual
  new Weft artifact and prove trusted admin/client identities and legacy0.1
  compatibility separately. Record exact committed budget receipt and counts.


### G11 owner authority and backend normal-form acceptance

Allocate the closed owner/session/backend records to actual US-051-AC15/16
provider tests. Source controls reject swapped issuer/resolver, dict/digest minting,
wrong provider/custodian/installation, unknown/bad bounds and cyclic approval
hashes; preserve exact native state/null shapes and require original candidate
resolution. Source tests do not qualify a live authority or admission barrier.

Actual native tests must create/observe an isolated supervised target, authenticate
maintenance separately from controller/businessOwner, verify exact real role
flags/memberships/full closure, target/settings and fixed same-connection hooks.
Prove original external intent before role/store creation, unknown-outcome
reconciliation, native restart versus copied/restored target, endpoint gating,
wrong process/PID reuse/alternate routes and journal rewind refusal.

Observe real delayed SCRAM activity as actually emitted: starting or SQL NULL
state is retained, never synthesized. Verify full native stats visibility,
missing-start refusal, pending/non-old/exited/owned-old resolutions, cross-DB
old sessions, unrelated pending handshakes, activity-disabled clients, bounded
positive termination and fresh zero-old-session proof. Lose fence acknowledgements
and prove original candidates survive. Test introducing the verified fence
receipt on fencing→fenced and no old-client authority through carrier COMMIT,
publication or recovery. Native/profile/artifact/release gates remain mandatory.


### G04 checked conversion acceptance

Allocate US-051-AC14 plus AC15/16 recovery/client gates to the exact selected
CONTRACT-081 successor. The50 manually specified cases in the design-review
g04-independent-oracle-001.json are planned scalar oracles, not native passes.
Exercise all12 recipes/NULL cases and refusals through actual typed native
conversion, not a source-only helper that never changes a carrier. Include
numeric ties/negative/carry/nonfinite, Gregorian/UTC bounds, offset/precision,
strict lexical/token/UUID cases and complete target facets/Key collisions.

Test exact discovery wire, cycle-free marker/irreversibility binding, full
unknown source preservation, explicit companion defaults/commands/dependencies,
old version replay/refusal and browser parity. Native round-trip CHECKs must
reject broad target-domain writes through real direct SQL/COPY/admitted MERGE,
not only generated clients.

Independently observe all native private-store objects, exact typed old values
including NULL, counts and logical-byte accounting, complete nonempty FORCERLS
capture, no data in public receipts/logs, private controller-role restoration,
column grants, token supplied/RETURNING/COPY/ON CONFLICT/MERGE attacks, parameter
role/trigger bypass, UUID collision, revision overflow and no-op updates. Test
unchanged/updated/inserted/deleted/Key-reused restore populations; verify current
revision matches actual post-cutover baseline and conflicts cause full refusal.

Inject lost acknowledgements and errors at enrollment/capture/rewrite/validation/
phase COMMIT/publication. Actual held prepared readers/cursors/direct writers
must stay fenced through the commit-to-publication gap; original-progress lookup
proves no double conversion. Missing/tampered/expired/restored custody, unknown
objects/ACLs and budget exhaustion refuse. Qualify native function/trigger
authority and each pinned platform/driver, then freeze installed artifacts,
browser/CI matrix and fresh public release bytes. No G05/G06/other-backend
claim follows from this maintenance subset.

Test exact source recompile and closed step.kind/operation/phaseOperation/SQL/path
variants; swapped before/after/source/target/recipe/program/artifact and fake
prepared handles; descriptor injection/truncation and wrong private guards;
no portable runtime Weft dependency or fallback native cast; native recipe-token
escaping inside the fixed DDL expression and no assumed driver-DDL parameters.
Verify original-source-only input, all-row conversion coverage and exact committed
G04 descriptor/artifact/domain/count/archive correspondence. Exercise defined
cycle-free logical-byte projection at counter digit/metadata/NULL/limit edges.


### G11 concrete supervisor and native issuer acceptance

US-051-AC15/16 must now execute the selected privileged local profile rather than
qualifying a structural fake. Independently create and observe an actual owned
PG18.6 SCRAM cluster, exact native flags/role edges/authority, dedicated process
birth/binary/PGDATA/endpoint chain, private original external journal and all
listener/auth routes. Verify maintenance-only external HBA precedes every actual
startup, not a later best-effort check on restored LOGIN roles. Native source/
platform/toolchain/helper/wrapper artifact census is mandatory.

Run real populated G11 migration with actual old/new authenticated clients,
prepared direct SQL, held cursors/transactions, paused SCRAM and reload races.
Observe actual native state/null/token populations, durable old NOLOGIN and
positive retirement before carrier changes. Prove old identities remain retired
after publication and stable effective subject/outcome identity is preserved.
Test exact new-epoch admission with real SCRAM/reference/source probe.

Inject worker/supervisor crashes and unknown journal/native commits, same-target
restart, wrong target/secret/config/binary, PID/group reuse, extra membership,
Unix/IPv6/alternate listener and external journal rewind. Prove original-outcome
lookup without repeated effects, correct same-connection role restoration and
no ordinary exposure while origin/epoch/source is uncertain. Copy/restore native
data/control markers under a different observed incarnation with original
external custody unchanged and prove rejection before ordinary access. Native
full restored-generation forward recovery is separate and cannot be claimed
from this rejection test. Record bounded actual owned shutdown/cleanup and no
changes to shared services. Source simulations, old trust-auth runs and a provider
that always refuses do not pass these acceptance gates.


### G11 all-six-scope authenticated authority acceptance

Test actual valid/invalid Ed25519 verification under original configured keys for
ALL six exact scopes, full target/principal/policy/purpose binding, unknown or
dropped fields, embedded-key substitution, noncanonical/bounded forms and actual
original request/consumption races across processes and same-issuer threads.
Configured production verification must actually succeed for a correct signed
request; missing configuration refuses. Acceptance fixture cannot issue a
production-context capability or adopt an existing/shared target, while native
store/provider effect logic remains the same implementation.

Verify acyclic pre-creation/principal/final-registration/store ordering and
original native receipt binding. RegistrationId precedes signing; ownerApproval
is the exact fixed projection with the existing enrollment scope. Native role/DB
creation is not a fictional single transaction. Lose each native/bootstrap
stage acknowledgement and prove original-outcome recovery, no role/name adoption
and no repeated confirmed stage. Actual OIDs/flags/native context must exist
before final store approval and be reobserved before issuance.

Exercise known abort versus pending/unknown effect, actual replay no duplicate
effects, ledger overflow/tamper/rewind, policy change/revocation for new actions,
read-only historical settlement and settled-only authenticated rotation. Verify
no production fallback to fixture/UID/TTY path. Retain the actual rejected UID
autoapproval evidence and show it was not applied. Native SCRAM, kernel/process
origin, owned endpoint gate, same-connection role restoration, phase/receipt and
publication tests still require actual artifacts and real execution; source
signature tests alone do not complete G11.


### G04 deleted-instance collision and durable reservation acceptance

Independently execute the real fixed guard with an isolated native collision
fixture: reserve an original ID, delete its row and retain then purge its archive
values, force the next generated UUID to collide and prove statement failure
with counter/ledger/business rollback. No production RNG injection or replaced
guard counts as acceptance. Demonstrate a noncolliding Key reuse is a new
instance and a deleted row is never resurrected by restoration.

Test protected existing-row enrollment including FORCE RLS, concurrent issuing
transactions, capacity boundary/exhaustion, rollback after increment, ON CONFLICT
DO NOTHING and UPDATE, COPY and every admitted MERGE route. Preserve committed
unused reservations. Verify exact native object/ACL/custody closure, original
TG_RELID, tampered/rewound/missing ledger/counter refusal and ordinary metadata
read/write/trigger/parameter bypass refusal. Lose enrollment COMMIT acknowledgement
and settle the original outcome without repeating enrollment. Record counter
contention/resource behavior and distinguish reservation bounds from archive
value-byte accounting. These are required native gates, not source-test claims.


### G05 independent retained retirement, restoration and purge acceptance

Prove closed source/options/discovery/step/recompile semantics in Bun and an
actual browser, including historical replay, duplicate/unused/unknown entries,
complete archive source closure and bounds, explicit current defaults/dependencies
and no seed replay. Source-only archive descriptors cannot create native custody.

Execute populated/NULL/empty and FORCE RLS retirement with native per-instance
oracles; verify actual private old typed values and complete source/instance
set, direct/generated ACL denial, no retired live-column leak, dependency closure
and actual old prepared reader/cursor/writer fencing. After current unrelated/
no-op/Key-changing updates, restores preserve all unrelated values. Test deleted
originals, new and Key-reused instances, null/refuse and required scoped fill
with a fill invalid on originals but valid on new instances. Required original
NULL, changed type/meaning/history/guard, missing/tampered/foreign origin and
post-restore replay must refuse without partial activation. Test real issued-ID
collision and persistence after value purge; matching counts are insufficient.

Verify actual Ed25519 signatures/config/scope/purpose/target and original durable
request/effect/history races, current policy and hold mutation serialization,
native reservation separate from effect COMMIT and original positive recovery.
Exercise real enrolled monotonic clock checkpoints/reboot/uncertain intervals/
rollback/rewind and no early purge. Normal purge requires actual lower-bound
eligibility; minimum-only override records unmet duration and cannot bypass hold,
unknown effect, native origin or retained dependency. Lose capture/publication/
restore/purge acknowledgements, prove original outcome lookup and no duplicate
DDL/value effects. Known abort preserves values; confirmed purge is exact native
relation removal plus original tombstone, no source-head reset or UUID reuse.

Test real capacity/time bounds and private diagnostics, current generated
consumers, frozen installed native wrappers/artifacts, source census/platform
CI matrix and fresh public-download bytes. Qualify the actual immutable Weft
archive-complement port and session policy explicitly; its absence is a refusal,
not a fill pass. Keep every remaining family/backend/composition and external
backup/log erasure limitation explicit in the release, rather than closing G05
from an irreversible/null-only/source-only subset.


### G11 initial enrollment independent authority and native acceptance

Test actual valid/invalid Ed25519 signatures for both separate initial scopes,
original configuration/policy/context/key binding, full cohort tuple rather
than independent allowed-list cross-product, EVERY subject flags/ownership/
groups/audience and purpose isolation. Original owner/store signatures, copied
context/config/receipt, raw epoch dictionaries, caller resolver/seal, future
OID injection, first-subject-only checks and fake/null heads must refuse.

Exercise original context bootstrap/registry, positive request/signature recovery
and missing original lock/history refusal. Prove actual role effects and one
prepared epoch commit together under original initial reservation, exact receipt
shape, complete pre/post source/native witnesses and original gate. Delayed
SCRAM/NULL/starting/unrelated/cross-database session tests must run through the
SAME native barrier implementation with distinct initial binding, preserving
original candidate set and resolution evidence after process restart.

Activate actual prepared roles/epoch atomically, retain stable subject OIDs/
current_user/groups, require final source/head/policy/custody checks, and release
only exact fresh admissions after original external/native confirmation. Inject
known abort/cancellation/lost acknowledgements at preparation, fence, activation
and publication. Prove positive original recovery without repeated role/epoch
DDL, credential leak or legacy re-enable. Existing epoch/concurrent enrollment
and source drift during signing refuse. True headless install stays a distinct
G10 test/profile. Actual frozen installed artifacts/native platform/CI/browser
and fresh public bytes are separate required gates; no source-only closure.


### G04 original creation/enrollment and actual capture boundary acceptance

Independently test exact policy0.2/source/plan/ingress/capacity request binding,
original private capability/reservation issuer/registry and no raw JSON/cursor/
callback authority. Execute actual store creation with exact data-free schema
COMMENT and complete native created OID/type/constraint/index inventory in SAME
transaction; external confirmation follows observed COMMIT. Lose acknowledgement
and positively recover original reservation/receipt; copied comment, wrong native
target, same name, missing history and arbitrary extra metadata refuse.

Run real approved per-table ALTER/guard/ledger/record/ACL enrollment with native
name collisions, unknown outcome, original request reuse and no duplicate ALTER.
Use real distinct maintenance/controller/businessOwner identities and verify
backend/xid8/INTRANS continuity plus complete selected policy/dynamic settings.
Capture actual FORCE RLS-hidden/NULL/special/boundary values only inside locked/
fenced businessOwner TABLE RLS-off scope; GUC stays on, controller inserts only
private archives, final RLS/policies/role/settings are exact before receipt.
Test denied SET, wrong actor/transaction, hook exception, rollback/close/quarantine,
ordinary metadata/value denial, partial restoration and no elevated pool reuse.

Verify ISO,YMD/UTC genuine typed value and canonical byte oracles, preadaptation
finite/calendar/size checks,1000-row/8MiB buffer and aggregate capacity edges,
complete instance sets and no public values. Repeat actual original phase/native
COMMIT recovery and no capture replay. Source controls are separate from real
PostgreSQL18.6/driver/installed qualification; G05 .2 upgrade, online and external
custody remain distinct compositions.


### G04 capacity wire and batch-versus-population controls

Test trusted unsigned default construction separately from signed-wire missing
capacity refusal. Execute more than1000rows and8MiB total across repeated private
batches while within aggregate signed limits, proving complete per-instance
capture. Separately refuse a single value above8MiB before adaptation and verify
rollback/no omitted rows. Integration002 SHA256: b2ff1a1b90f1ff279e65d06442adad5a4dfe45f284dc7d5e45df2c7d4db26f9c.


### G04 actual implicit storage and FK trigger acceptance

Execute exact fixed originals DDL on real PostgreSQL18.6 and independently
observe its actual TOAST tables/indexes/columns/types and FK RI trigger set.
Prove every recorded internal object has the exact native parent/dependency,
owner/flags/definition and receipt origin. Force extra/missing/disabled/foreign
internal trigger, unrelated pg_toast object, wrong parent and copied receipt
refusal; no namespace/prefix waiver. No TOAST chunk/row values enter receipts.
Confirm unknown creation COMMIT through complete original receipt+native closure
and external custody. Native source mocks are not execution evidence.
Integration003 source SHA256: d319c315a1b50c44eb1777017e1016dd2a18eb65627adf4b6ff687190e2f9786.


### G11 original logical trust root qualification

Prove exact old .1 physical compatibility and logical refusal; original .2 root
installation before future OIDs; complete actual native configuration export;
valid real root signature; and positive confirmation/restart using the SAME
production verification/provider path for isolated acceptance. Wrong root key,
principal, purpose, policy, logical ID/profile, complete source/cohort/subject/
store binding, copied request, subclass, mutable request and caller resolver
refuse. Source-only acceptance issuers cannot become production roots.

Exercise two real writer processes, every birth/replace/fsync/return interruption,
actual original positive prepared/confirmed recovery, duplicate approval/effect
refusal, rewind/cap exhaustion and new-process missing-file refusal without
O_CREAT repair. Exact root signature and confirmation survive restart. A crash
after durable replacement must return the same context/enrollment; no second
consumption or native effect follows. No configuration parser that always
refuses valid production input can pass this gate.

Then qualify actual target/source/head/subject/store/gate/epoch operations,
installed concrete crypto and platform CI, final release and public bytes.
Source tests/signature examples and data-only native receipts cannot substitute
for those gates. Old active .1 root upgrade and absent subject/schema bootstrap
remain explicitly tracked until separately implemented and qualified.


### G11 primary setup birth original positive recovery and missing custody

Rerun all original boundary003 seven probes and BOTH actual004 failure controls
against exact frozen source. The original signed pending effect history cannot
be rebound after both obsolete sidecars are lost. Inject real filesystem failure
at every init lock/header/fsync/replace/return boundary and positively resume
SAME pending IDs/path/expected bytes; no effect DDL or signature replay.

Exercise new-process and real two-writer initialization, original setup lease
ordering, missing primary/setup lock, foreign path/ID/root/config/purpose,
lock-only/empty/expected header prefix, wrong prefix/effect records and every
confirmed missing resource. Runtime factory must never install first operator
configuration on absence. Supervisor direct-constructor bypass refuses; copied
config/UID/hash/fixture is not an original production deployment authority.

Prove old enrollment0.1 byte compatibility with originally installed owner-only
context0.3 and root enrollment0.2 with generation registry birth under SAME
primary commit. Old context upgrade remains a located refusal. Source crypto/
file controls alone cannot establish actual deployment-origin/native provider/
process/epoch behavior, installed platform/browser or release/public-byte gates.


### G11 complete root-registry and original continuation qualification

Independently replay005 structured-birth refusal, owner-only positive original
recovery and both missing-sidecar invariants, descriptor leaks and nested-class
crypto import negatives. Verify canonical no-LF zero-state bytes, full current
closed registry and actual root signature after one real original enrollment;
subsequent owner/logical session must retain valid original continuity. A mere
removed digest comparison or shared JSONL parser cannot pass this gate.

Exercise actual root key/purpose/scope/config/native mismatch, exact original
prepare/confirm/restart/session, duplicate effect/ID/approval, immutable request,
capacity conjunction, two writers and every fsync/replace/return crash boundary.
Unknown confirmation observes SAME actual entry/context; missing confirmed files
refuse without O_CREAT. Original type/error/registry/canonical identities and
full module-map/strict lazy verifier dependency negatives remain mandatory.

Original deployment/native target/store/head/subjects/barrier/epoch/effects and
installed platform/browser/CI/release/public bytes remain separate qualification.
No source-only root signature or receipt dictionary closes these gates.
