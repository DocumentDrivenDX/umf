---
ddx:
  id: TD-085
  type: technical-design
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: US-085
      kind: informed_by
    - id: SD-030
      kind: informed_by
    - id: SD-007
      kind: informed_by
---

# TD-085: Invoke typed actions on raw tables

**User Story:** [[US-085-typed-actions-on-raw-tables]]. **Feature:** [[FEAT-030]].
**Solution Design:** [[SD-030]].

## Scope

One journey: a generated action method invoked against a raw-table target.
Shared shapes live in CONTRACT-068 (client and types), CONTRACT-071 (catalog),
CONTRACT-072 (protocols, outcomes, conformance suite) and CONTRACT-073 (per
platform guarantees). This design does not define action meaning (CONTRACT-900)
or SQL lowering (Weft).

## Technical Approach

**Build time.** The catalog build compiles every action the generated package
exports, for every selected raw-table target, through Weft's action lowering.
Before calling Weft it checks the CONTRACT-073 refusal rules that do not depend
on lowering: policy authorization, `person-required` attribution on a target whose
`sessionPrincipal` is `service`, roles/1 on a service target (independent of attribution), unqualified role profiles, handler
bindings, a missing `roleMappings` entry, a missing `security` source and, on
`spark-delta`, `administrativeSingleTenant` not set (CONTRACT-071 target
configuration). After lowering it refuses multi-statement programs
on `spark-delta`, and on `unity-catalog` any multi-statement program that is not
a single `BEGIN ATOMIC ... END` block. A refusal is recorded in the catalog as a
non-executable entry `{name, kind:"action", targetId, refusal:{code,
diagnostics}}`, so the runtime can name the reason. An executable entry records
the program, its parameters and carriers, outputs, Weft obligations, the failure
code each precondition reports, the role-check marker, and the tables it
touches.

**Run time.** The generated `Actions` method validates and encodes the input
(CONTRACT-068) and calls `target.invoke(action, input)`. Raw-table targets
implement `ActionExecutor` only, so there is no keyed path: pinned checkers reject
`ReplayingActions(raw_target)`, and its constructor raises `TypeError` at run
time. The raw-table target then:

1. raises `ActionRefused` with the recorded code for a non-executable entry,
   before touching the connection;
2. checks identity and entry pins, then performs CONTRACT-073 action-time
   native dependency/authority closure admission under the qualified fence; a
   cached shape verification never supplies that fence;
3. on `postgresql`/`lakebase`, reads the psycopg transaction status and refuses
   anything but idle (`ActionRefused` with `TRANSACTION_STATE`); then opens one
   transaction with `SERIALIZABLE` isolation, applies Weft obligations, runs the
   program with bound parameters, reads its outputs, captures
   `pg_current_xact_id()`, and commits;
4. on `unity-catalog`, submits the single statement or the one atomic block;
   on `spark-delta`, submits the single statement;
5. classifies the result with the CONTRACT-073 table and builds the receipt.

| Native result | Postgres / Lakebase signal | Delta signal | Outcome |
| --- | --- | --- | --- |
| Committed | COMMIT acknowledged | Commit result with table versions | `Committed(output, receipt, created, changed)` |
| Deadline with confirmed original noncommit | Positive cancellation/rollback, or qualified original aborted status | Independently confirmed native noncommit | `TimedOut` |
| Precondition false | Program's declared precondition marker | Same, folded into statement result | `Rejected(code)` |
| Authorization | Program's role-check marker; SQLSTATE `42501` | Program's role-check marker | `Denied` |
| Concurrency | SQLSTATE `40001`, `40P01` | Delta concurrent-modification exception | `Conflict(retained=False)` |
| Commit unknown | Connection error after COMMIT was sent | Connection error after submission of the committing statement | Postgres/Lakebase: reconciled as below; Delta: `Indeterminate` |
| Known rollback/noncommit | Native exception and positive original settlement | Same | `ActionFailed(code, cause)` |
| Unresolved settlement | Disconnect/cancellation without original termination evidence | Same | `Indeterminate`, including before the commit phase flag |

The program reports a false precondition and a failed role check by markers
Weft defines in the lowered program (for example a declared SQLSTATE raised by
the program, or a result row). The adapter maps only markers recorded in the
catalog entry; it never parses error message text. A failed role check is
`Denied` and is never reported as `Rejected`.

Commit detection records dispatch phases but never treats a phase flag alone as
proof of rollback. With `reconnect=`, the adapter uses the factory once, verifies
the original writer/store/incarnation and restore-epoch custody, then observes
`pg_catalog.pg_xact_status` for the captured xid. Committed status returns the
complete result captured before COMMIT. Aborted status yields `TimedOut` only
when a deadline expired; otherwise it raises
`ActionFailed("ABORTED_CAUSE_UNKNOWN", original_error)`. No generic abort becomes
a concurrency conflict. Missing original results, wrong/diverged/restored scope,
unverified replicas, `NULL` and unresolved status yield `Indeterminate`. The
runtime never resends a program and never releases uncertain connections for
reuse. Async task cancellation follows the same settlement rule.

**Receipts.** Use CONTRACT-073's exact string-valued native receipt. The store
encodes original database identity (Postgres/Lakebase) or ordered UUIDs (Delta),
the epoch identifies qualified original store incarnation/restore custody, and
the version encodes captured xid8 or this commit's exact table-version vector.
No constant `pg`/`delta` epoch or later history head substitutes for original
scope/commit evidence. Native attribution is separate outcome metadata.

**Validation (AT-07).** Each executable entry also records Weft's validate-only
program (WR-B4). `validate()` runs the same pre-checks as `invoke` (entry refused,
pins, idle connection), then runs that program in a transaction it always rolls
back, and returns `ValidationResult` with every failing declared code and
`complete=True`; nothing is committed even when every check passes
(US-085-AC8). The invoke program separately returns the Keys of created and changed entities,
which the adapter decodes through the shared runtime using generated Key metadata into `Committed.created`
and `Committed.changed` (US-085-AC9).

**Async (AT-08).** `AsyncPostgresTarget` and `AsyncLakebaseTarget` share the
`invoke`, `validate`, classification and reconciliation code with the sync
adapters over psycopg 3's `AsyncConnection`; only I/O calls differ
(US-085-AC10).

**Timeouts (AT-09).** Every call takes keyword-only `timeout`; `None` uses the
required target default. The single deadline includes admission, execution and
cleanup/reconciliation; native statement timeouts use the remaining budget.
A cancellation request is not rollback evidence. Return `TimedOut` only after
confirmed original noncommit; a qualified aborted xid after deadline expiry
also permits it. Confirmed commit returns the retained success. If settlement
cannot be established in the bounded cleanup/reconciliation window, return
`Indeterminate` and quarantine original custody (US-085-AC11). Validation has
no commit instruction but still requires confirmed noncommit before asserting
its timeout/rollback result.

**Composite actions and per-user sessions (AT-10, AT-04).** Related changes are
one action with several effects; Weft lowers them into one program, which runs in
the single `SERIALIZABLE` transaction above (US-085-AC12). Neither the generated
clients nor the runtime offer a transaction across action calls. A target whose
configuration declares `sessionPrincipal: human` compiles `person-required`
actions only with the qualified host human/session binding. Original outcome
attribution records `session_user` and `current_user` separately, and roles/1
checks the authenticated human (US-085-AC13). Service-role authorization is
not inferred from native-session attribution.

Trade-off: refusing early and loudly over providing partial guarantees. There is
no fallback to a weaker isolation level, separate statements or retries.

## Component Changes

Planned files (none exist yet):

- `python/umf_access/targets/_actions.py` — shared raw-table
  `invoke` procedure, phase flag and outcome classification.
- `python/umf_access/targets/postgresql.py`,
  `lakebase.py`, `unity_catalog.py`, `spark_delta.py` — per-platform
  transaction control, receipt construction and `verify()` additions
  (catalog-commit table property, unique constraints for Key creates).
- `python/umf_access/build/actions.py` — CONTRACT-073 build-time
  refusals and action catalog entries.
- `python/umf_access/conformance/actions.py` — reusable outcome
  classification cases, including the fault-injecting connection wrapper.

| AC | Component realization |
| --- | --- |
| US-085-AC1 | Generated method signature (CONTRACT-068) plus `postgresql`/`lakebase` SERIALIZABLE transaction and original-incarnation receipt |
| US-085-AC2 | Precondition and role-check markers from the catalog entry; `Rejected` and `Denied` classification |
| US-085-AC3 | SQLSTATE and Delta exception classification to `Conflict(retained=False)`; no retry path exists |
| US-085-AC4 | Commit phase flag, `pg_current_xact_id()` capture, `reconnect=` reconciliation and `Indeterminate` classification |
| US-085-AC5 | Build-time refusal entries with CONTRACT-073 codes; runtime raises `ActionRefused` with the recorded code |
| US-085-AC6 | `ReplayingActions` typed to `ReplayingActionExecutor` with a runtime protocol check; idle-transaction check raising `ActionRefused` |
| US-085-AC7 | `unity-catalog` atomic-block submission, catalog-commit check in `verify()`, delta receipt |
| US-085-AC8 | Validate-only program in the entry; always-rolled-back transaction; `ValidationResult` with every failing code |
| US-085-AC9 | Returned Keys decoded into `Committed.created` and `Committed.changed` with generated Key codecs |
| US-085-AC10 | `AsyncPostgresTarget` and `AsyncLakebaseTarget` sharing the sync procedure; generated async overloads |
| US-085-AC11 | `SET LOCAL statement_timeout` and client deadline; `TimedOut` only with positive noncommit; otherwise reconciled result or indeterminate |
| US-085-AC12 | Multi-effect program in one transaction; no cross-action transaction surface |
| US-085-AC13 | Qualified human-session admission and separate original/effective attribution |

## API/Interface Design

| Surface | Contract | Use |
| --- | --- | --- |
| `Actions.<action>(input)` | CONTRACT-068 | Typed entry point; validates and encodes only |
| `ReplayingActions` | CONTRACT-068 | Not available on raw tables; rejected statically and by a runtime protocol check |
| `ActionExecutor.invoke`, `ActionOutcome`, `Receipt` | CONTRACT-072 | Target protocol and outcome union |
| `ActionExecutor.validate`, `ValidationResult`, `AsyncActionExecutor`, `ActionTimedOut` | CONTRACT-072 | Validation, async invocation and timeouts |
| `ActionDenied`, `ActionConflict`, `ActionIndeterminate`, `ActionRefused`, `ActionFailed` | CONTRACT-072 | Raised failures |
| Action catalog entries, `roleMappings`, `administrativeSingleTenant`, `security` | CONTRACT-071, CONTRACT-073 | Program, markers, obligations, refusals; target configuration |
| Refusal codes carried by `ActionRefused` | CONTRACT-073 | `NATIVE_PROFILE_UNSUPPORTED`, `ROLE_MAPPING_MISSING`, `TRANSACTION_STATE` |

CONTRACT-071 owns executable and refusal entry shapes; this design consumes them.

## Data Model Changes

No UMF core change and no database migration. Catalog entries gain the action
kind above. Role mappings live in the pinned target configuration and are part
of the catalog's inputs.

## Integration Points

Weft action lowering (W-4, Weft WR-B4) produces the program, precondition
markers, the validate-only program and the returned created and changed Keys; if
Weft refuses, the build fails with Weft's diagnostics. psycopg 3 transaction
status and SQLSTATE; Databricks SQL connector or Spark session commit results.
The host supplies connections, roles and grants; the runtime creates none.

## Security

The runtime sends only catalog program text with bound parameters. Authorization
is checked inside the program against mapped native roles, and a failure is
`Denied`; native privileges, row-level security, row filters and masks still
apply; cached `verify()` confers no authorization or effect-transaction fence.
The original outcome records authenticated and effective identities separately. Validation errors name the
field and rule, never the value. Native errors are wrapped unchanged in
`ActionFailed` and are not logged with parameters. The reconciliation connection
from `reconnect=` performs qualified read-only original-scope checks before the
`pg_catalog.pg_xact_status` query. Native dependency closure and its fence are
mandatory under CONTRACT-073; unexpressed cascades/triggers refuse.

## Testing

| AC | Test | Assertion | Owner |
| --- | --- | --- | --- |
| US-085-AC1 | `raw_action_commits_serializable` | Static corpus rejects wrong inputs; server log or `pg_stat_activity` shows one SERIALIZABLE transaction; receipt version equals the committing txid observed independently | UMF conformance + native lane |
| US-085-AC2 | `raw_action_rejects_and_denies_without_change` | Declared code on the exception; `ActionDenied` for role failure; independent row read shows no change | UMF conformance + native lane |
| US-085-AC3 | `raw_action_conflict_rolls_back` | `ActionConflict` with `retained=False`; loser's writes absent; exactly one program execution per call | UMF conformance + native lane |
| US-085-AC4 | `raw_action_commit_loss_is_indeterminate` | Without a factory, and on Delta, `ActionIndeterminate`; with a factory, the reconciled outcome equals the independently observed one; no second submission | UMF conformance + native lane |
| US-085-AC5 | `raw_action_unsupported_refuses_at_build` | Catalog refusal entries with expected codes; zero statements at run time | UMF build tests |
| US-085-AC6 | `raw_action_runtime_preconditions_refuse` | Checker error and `TypeError` for `ReplayingActions`; `ActionRefused` with `TRANSACTION_STATE`; zero statements; host transaction state unchanged | UMF static + conformance |
| US-085-AC7 | `uc_action_atomic_block_and_receipt` | Statement text is one atomic block; receipt UUIDs and versions equal `DESCRIBE HISTORY`; refusal without catalog commits | Managed Unity Catalog lane |
| US-085-AC8 | `raw_action_validate_reports_all` | Both failing codes, `complete=True`; valid input has no failures; rollback and no change observed independently (Weft WR-B4) | UMF conformance + native lane |
| US-085-AC9 | `raw_action_returns_created_and_changed_keys` | `created` and `changed` equal independently read Keys; static types are Key DTO tuples (Weft WR-B4) | UMF static + native lane |
| US-085-AC10 | `async_raw_action_matches_sync` | Async outcomes, receipts and validation results equal sync ones on the same fixtures; awaitable types on pinned checkers | UMF static + native lane |
| US-085-AC11 | `raw_action_timeouts` | `ActionTimedOut` with no change before commit; after dispatch, original settlement determines committed, confirmed timeout/noncommit or indeterminate | UMF conformance + native lane |
| US-085-AC12 | `multi_effect_action_atomic` | Both rows or neither; both Keys in `created`; public-surface inventory finds no cross-action transaction API | UMF conformance + native lane |
| US-085-AC13 | `person_required_on_human_target` | Entry compiles with the human-session obligation; original attribution separates authenticated human and effective execution role | UMF build + native lane |

| US-085-AC14 | `native_dependency_closure_fenced` | Unexpressed cascade/trigger and changed routine/policy refuse; replacement cannot escape the fence; cached verify does not bypass admission | UMF conformance + native lane |

STP-085 owns the authoritative mapping and commands.

## Migration & Rollback

New capability; nothing existing changes. Removing a target from the catalog
configuration, or reverting the generated package and catalog, stops action
execution on that target. Reverting code does not undo committed native effects.

## Implementation Sequence

1. Write the conformance cases and red native tests for Postgres.
2. Implement build-time refusals and the shared `invoke` procedure.
3. Add Lakebase, then local Spark/Delta, then Unity Catalog on a selected workspace.
4. Record each platform's evidence separately; qualify only what passed.

Prerequisites: US-083, W-4, W-0 (action entries are specified in CONTRACT-071).

## Revision2 lifecycle integration

CONTRACT-081's U1–U3 evolution profile governs the next direct-table cut under
FEAT-033. Keep the existing legacy compiler path exact. The source-aware change
analyzer matches stable table/Field/Key/constraint/index identities before emitting
reviewed DDL; ordinary positional append checks cannot authorize removal or rename.
The phase scheduler consumes typed emitted steps and original selected metadata,
groups adjacent transactional effects, and introduces explicit validation/index
barriers. It does not parse arbitrary SQL to infer source meaning.

`src/table-migration/index.ts`, `options.ts` and a new reviewed-change module own
diff admission, review markers and operation emission. A separate `phases.ts`
owns scheduling through a pure postprocessor, with a small compile hook before
final IDs and hashing. New 0.2 schemas dispatch independently of legacy 0.1.
The authoring normalizer lives separately from canonical extension inspection;
retained original row_scope and exact join context yield the existing RowRule
forms without adding an alternate native policy interpreter.

The Python mixed runner owns one supplied administrative session and session lock.
It records phase effects and progress together, fences ordinary data admission,
and invokes a separate verified ledger finalizer after final correspondence.
It MUST NOT re-enter the existing all-required-steps executor after a committed
prefix, which would replay data effects. A source-selected metadata profile
registers the fixed progress relation with exact shape and owner-only privileges;
catalog inventory and witness verification explicitly admit that profile only.
Legacy inventory remains unchanged. A completed prefix requires source-bound
catalog correspondence, including unvalidated-constraint state where selected.

Implement in separate source worktrees: U1 owns the phase module, Python runner,
finalizer, metadata inventory and CLI; U2 owns reviewed diff/emission, shared
options/schema dispatch and TypeScript tests; U3 owns normalization and its tests.
Integrate the shared options and compile hook once. Verify each native change
kind separately, then run one mixed migration through interrupted phases.
Committed effects are forward-only; recovery resumes verified progress or requires
an explicit corrective migration, never a simulated whole-plan rollback.

SD-007's field lifecycle acceptance applies to the release inventory. Analyze
typed source references before DDL, including local constraints/indexes that
PostgreSQL removes automatically on column drop even with RESTRICT. Native
dependency errors supplement this analysis. Review disclosures explicitly name
stored-value loss and immediate irreversibility or supplied recovery custody.
Validate both logical/native domains for finite type conversions. Existing
optional-column tightening uses fail-if-null native activation; filling its
historical nulls is a distinct unsupported operation. Appended-column backfill
retains its existing explicit source-declared path. Hold native write protection
through actual-data validation and activation; a metadata fence protects ordinary
generated calls but cannot alone exclude direct authorized SQL. A failed committed
stage keeps clients fenced and requires resume/forward repair even while the old
metadata head remains. Reusing that head does not undo physical effects.

## Raw action risks

Weft may not be able to fold conditions into one Delta statement; those actions
refuse on Delta and remain available on Postgres or Truss. Lakebase minor
upgrades can invalidate qualification until the new minor is listed. Fault
injection at the driver boundary does not prove behavior under every network
failure; the Postgres lane also uses a network proxy.

## Embedder completion integration

[CONTRACT-081](../contracts/CONTRACT-081-table-lifecycle.md#embedder-completion-successor)
owns successor behavior; the [completion plan](../../04-build/praxis-embedder-completion-plan.md)
owns slice dependencies. Preserve public 0.1/0.2 compiler/verifier paths unchanged.
Adopt the new boundaries in `bun run check:access-boundaries` and table lifecycle
checkers before feature changes; include private-import, driver-in-portable-code,
cycle and allowed public import controls in local/pre-commit/CI coverage.

### G01 components and native transaction boundary

`src/table-migration/options.ts` admits the existing selector shape under a
successor version, distinguishes an appended target from an existing same-ID
optional-to-required target, and validates the exact original next-source command.
The reviewed analyzer still requires the exact tightening marker. Discovery must
explain the selected native/value effects without fabricating a fill value.
Closed options/plan 0.3 and execution profile 0.2 schemas and embedded Python
dispatch are updated together; old execution profile 0.1 admission stays exact.
No default mutation, rename/type/dependent-object compound is hidden in G01.

`phases.ts` schedules the selected fill and matching native requiredness step as
one explicit `backfill-tighten` required pair. Python phase admission and source-derived prefix
projection independently verify that pairing; do not infer it by parsing emitted
SQL. Existing `mixed.py` executes the whole required pair inside its current
locked installation transaction, then captures the native witness and progress.
Complete native authority checks precede any effect. Preserve the scoped
backfill's deliberate RLS handling and restore/verify RLS before commit. The
source-derived final catalog requires NOT NULL and unchanged target constraints.
Do not store row values in progress or diagnostic reports.

Existing appended-fill grouping and no-fill tightening remain exact regressions.
A failure before pair commit rolls back both UPDATE and requiredness. A later
failure keeps the committed pair and fencing; exact progress skips that pair on
resume. The installed native harness injects a writer immediately after UPDATE,
a held transaction, bound/constraint failures and lost commit responses to prove
the boundary. Current runtime capability dispatch must reject historical profiles
attempting new effects without relaxing historical verification/replay.

### Host protocol and optional SQL checker

Extract U5 orchestration into separate host protocol/approval modules. Keep the
existing Psycopg catalog verifier, locks, phase executor and finalizer as the first
native adapter. The protocol exposes capability selection, custody/transaction
contexts, history/progress/native observations, execution of verified steps,
approval persistence and atomic finalization. Author-selected callbacks or SQL
cannot provide those capabilities. Reconcile this adapter hook with G01 ownership
before shared runtime edits; one state machine owns resume/publication.

Approval receipts are host-owned and distinguish authorized intent from committed
execution. Expose trusted decider/decision metadata through the administrative
API/CLI rather than modifying compiler-native qualification. Verify durable
receipt binding before dispatch and retain it alongside exact history/progress.
Any new native metadata relation requires versioned source-selected inventory,
owner-only privileges and strict tamper controls; legacy inventory stays exact.

The approval sidecar needs two explicit admission contexts. Before publication,
pass a private verified plan/head/predecessor transition context through native
catalog/privilege verification; it admits exactly the source-selected fixed
approval relation after structure/ACL proof. Do not teach ordinary legacy
verification to ignore that name. After publication, `head.py` issues the closed
installation reference 0.3 from verified latest history, binding approval profile,
plan digest and exact catalog-only shape. Reuse the existing metadata snapshot
query machinery; issuance performs fixed scratch-schema proof under administrator
custody, while prepared ordinary probes use read-only catalog steps.

`head.py` validates the exact new key set and compares pinned approval shape in
full head observations. `correspondence.py` admits its exact fixed relation only
for that checked reference; default 0.1/0.2 inventory remains byte-equivalent.
Keep HEAD view projection unchanged. Do not query approval rows or grant/lock the
approval relation under an ordinary principal. Default fast-operation checks keep
their current short trusted-reference/quiescence contract. Administrative inspect,
apply, replay and uncertain-publication observation all issue the correct current
reference; a pending sidecar alone cannot mint a final 0.3 reference. A future
new effect on the selected approval installation must preserve its profile.

U6 lives in a separate optional parsed-containment module with public Python
inspection/CLI delivery. Inspect the contributed Praxis checker first. Select a
maintained PostgreSQL parser already qualified for the chosen host or explicitly
qualify a new dependency. Bound input size, statement count and tree depth; walk
every supported node, reference, callable and nested statement. Do not add regex
exceptions or let parser success mean containment success. Portable exposure is
claimed only if the actual parser path runs in Chromium; otherwise document the
host-only boundary. The checker does not alter source-recompiled lifecycle plans.

### Delivery and consumer boundary

U4 examples use current descriptions, allowedValues and range facets with real
native failures. U7 receipts enumerate exact installed mini-racer/platform/Python
cohorts and the V8 dependency on production source verification. U8 extends the
existing static mirror tool to prove full locked dependency closure offline;
package count alone cannot establish completeness.

U9 belongs to the actual Hohfeld repository reader and installed distribution.
Use one admitted core 0.10 ontology document in Hohfeld and Weft and exercise its
selected real host journey. Inspect local work first; a changed version constant
or portable mock is insufficient. General graph migration remains MIG-G08.
Consumer eleven-table/four-migration input stays private. The shared runner emits
only aggregate source/cohort digests and observations publicly; original history
and local/managed receipts stay in host-controlled storage. A missing isolated
Lakebase target blocks managed acceptance, not independent source implementation.
## G02 typed same-row backfill implementation

SD-007 selects the finite same-row algebra; CONTRACT-081 owns every successor
version, AST field, program guard and atomic phase correspondence. Implement
both existing-field fill/tighten and appended-required-field add/fill/activation
before claiming the selected profile. Preserve the older compilers/verifiers.

| Module owner | Changes and boundaries |
| --- | --- |
| `src/extensions/tables/types.ts`, new `row-expressions.ts`, `operations.ts` and successor operation schema | Closed source AST, carrier/NULL typing, precision/scale/resource bounds; browser-pure, no native SQL, host or driver imports |
| `src/table-migration/options.ts`, new `derived-backfills.ts`, `index.ts`, `phases.ts`, `phases-options.ts` and successor schemas | Previous/next stable input closure, exact selector/marker consumption, standalone target change and source-derived atomic step roles; no SQL expression rendering |
| Weft `table_operation` core/schema/validation and PostgreSQL adapter | Original-source admission and same shared Rust implementation for native Python/WASM; typed expression lowering and all-row stored-value/finite-input/count/frame guard |
| Python lifecycle `backfills.py`, `progress.py`, `mixed.py`, `mixed_prefix.py`, `host.py`, `ledger.py` | Explicit successor/program/guard dispatch, exact phase/prefix/native witness admission, native locks, approvals and recovery; no AST evaluator or SQL renderer |
| `umf_codegen` embedded engine/package inputs | Regenerate from reviewed portable source; explicit UMF opt-in Rust 0.4 refusal, never fallback to an unrelated engine/profile |

The existing architecture remains intact. Extend the adopted lifecycle/deployment
and Python module maps with the new pure modules and exact allowed dependencies.
Run `bun run check:access-boundaries`, lifecycle/deployment boundary checkers and
their existing negative controls. Source and embedded-input manifests must cover
the new schema/module closure. Vendor AST types do not become public UMF types.

Weft extends the UPDATE RETURNING/effects aggregate rather than introducing a
preflight scan, CTID join or host-side row loop. Infer exact numeric budgets before
lowering. Emit untyped numeric intermediate arithmetic, strict C text semantics,
qualified built-in resolution, and a private per-row exactness/finite-input test.
The complete aggregate raises a runtime statement error on any invalid matched
row. Select only the declared public affected marker after validation. Keep all
numeric input references in the guard, including unused conditional branches.

The portable compiler binds atomic members using stable typed target identity and
explicit step roles. Existing-target pairing remains fill then tightening.
Appended target creation is nullable and default-free; target domain checks,
derived fill, optional declared future default and NOT NULL share one required
phase. No unrelated schema/data step enters that phase. Source-derived prefix
reconstruction must model committed append and existing-target phases exactly.
Before any member, acquire native table locks and verify full source, authority,
approval, catalog and progress correspondence. Hold locks through RLS restoration
and phase receipt commit. Unknown commit recovery observes; it never blindly
evaluates a pure expression again.

Candidate tests use fabricated Person full names and commerce integer/decimal
amounts, with manually specified expected per-row outputs. They contain no Praxis
sources or row payloads. Native exception handling retains SQLSTATE and bounded
identifiers in ordinary errors; rejected row/native DETAIL remains private.

Implementation sequence: freeze interfaces; implement UMF AST/compiler and Weft
admission/lowering in parallel using the same schema; integrate host phase and
installed native fixtures; run browser/Python/native and historical controls;
freeze package source/RECORD/embedded closure; obtain independent native/design
signoff; merge, publish an explicitly pinned cohort and verify fresh downloads.
Weft's in-progress release version must be reconciled before selecting its next
version. No old core asset is rebuilt or silently replaced.

Rollback of an aborted phase restores all its data/DDL/progress. After phase
commit, use exact resume or separately approved forward repair. This design does
not promise reversal of committed derived values, online execution, general
transforms, managed acceptance or additional backend support.

## G03 existing-column future-default integration

CONTRACT-081 owns successor discovery/options/plan/execution versions and exact
source/phase rules. SD-007 selects this future-write-only slice. US-051-AC12
keeps historical fill distinct; US-051-AC15/16 govern recovery and qualified
backend delivery. No G03 product implementation starts before contract review.

| Component | Required change and boundary |
| --- | --- |
| `src/table-deployment/sql.ts`, `ddl.ts` | Extract one internal typed native-default expression renderer from `columnDefinitionSql`; deployment, G02's existing install-default and G03 SET use it with historical bytes unchanged. G03-specific admission limits remain separate. No string surgery or host imports. |
| `src/extensions/tables/columns.ts`, literal/domain helpers | Reuse exact logical/native default matching and storage checks; add successor admission for Unicode/DDL bounds and conservative volatile refinements without widening older declaration profiles. |
| `src/table-migration/reviewed.ts`, `options.ts`, `index.ts` | Explicit successor discovery branch and full old/new source-meaning digests; one exact target native/default and coupled logical-default delta. Independently compile both sources before normalization. Retain all unrelated source and command meaning. |
| `src/table-migration/phases.ts`, `phases-options.ts`, successor schemas | Exactly one required default-change phase with compiler-owned typed correspondence. Never route native-equivalent transitions through the no-phases finalization shortcut. |
| `scripts/codegen/entry.ts`, Python `umf_codegen` bridge/assets | Add the explicitly selected discovery request and exact successor dispatch; preserve legacy two-member requests and old discovery results. Regenerate measured embedded inputs. |
| Python lifecycle `progress.py`, `host.py`, `mixed.py`, `mixed_prefix.py`, `witness.py`, `catalog.py`, `ledger.py` | Explicit successor phase/approval/reference dispatch in both host-neutral and Psycopg paths; exact target/prefix validation, writer locks, atomic DDL/progress, uncertain-COMMIT observation and final publication. Retain fixed metadata schemas/ACLs. |

The renderer remains internal to the browser-compatible UMF PostgreSQL adapter.
Weft's existing ordinary operation grammar is unchanged; no SQL expression or
DDL renderer moves into the Python host. The host executes only the verified
source-derived program and owns connection, identity, approval and recovery.
Retain lifecycle/deployment/compilation boundary checks and their negative controls.

Native catalog verification may use the existing protected scratch comparison,
but it cannot authenticate source changes. For absent versus literal NULL and
normalized numeric spellings, equal catalog witnesses still require exact
approved plan/source identity and committed progress. Prefix reconstruction must
recognize both the uncommitted predecessor and committed successor phase, while
ordinary source publication remains fenced. No row UPDATE is generated or used
to test acceptance. Lock/read-only authority checks cannot be replaced by a
metadata-head fence against directly granted writers.

Implementation order: freeze CONTRACT-081; extract the renderer with historical
byte controls; implement isolated portable discovery/admission/phase generation;
add both host dispatch/recovery routes; extend domain fixtures and independent
native acceptance; measure browser/installed/native artifacts; then qualify the
actual merged cohort and fresh published downloads. The final component versions,
workflow inventory and dependency closure must come from that source, including
any prior public action-runtime integration.

Testing follows STP-085. Known-aborted default changes roll back DDL/progress;
committed changes require exact resume or separately approved forward default
repair. Neither repair nor source rollback erases rows inserted in between.


### G03 selected module 0.2 integration amendment

Apply CONTRACT-081's trusted `SessionPolicy.table_operation_module_profile`
selector at the common ordinary-operation preparation boundary. The frozen
policy defaults to Weft module 0.1; explicit 0.2 is passed through the Python
wrapper to the selected native parser. Keep ordinary UMF declaration ASTs and
G03 migration phase generation unchanged. Read/query/write and their sync/async
wrappers share a profile-coherent source owner and prepared-module cache; refuse
cross-profile reuse before dispatch. Do not infer support from Core defaults or
retry a different profile after a refusal.

`session_policy.py` owns validation and the versioned opt-in cursor-key scope;
`table_reads.py` owns selected module preparation and authority scope;
`table_writes.py` includes that same scope in existing outcome digests while
`outcome_values.py` preserves its stable slot algorithm. Profile selection is
not appended to native connection settings. Audit copied handles, page tokens,
write retries and outcome observation across profile boundaries, including an
already occupied native outcome row. Merely comparing newly computed hashes is
insufficient. Keep legacy profile scopes and wire/storage schemas unchanged.

Weft owns its selected module source admission, literal/domain checks and
ordinary operation lowering. UMF's tables adapter owns retained logical/native
default correspondence and migration DDL. The host owns trusted selection,
connections, transaction authority and recovery. Generated examples must show
the explicit host policy opt-in and its immutable compatible dependency; they
must not expose an author/request selector or imply logical default resolution
performs SQL insertion. Existing administrative seed/backfill dispatch is not
silently widened. CONTRACT-081 and STP-085 are the release gates for this work.

## G11 atomic Field replacement implementation allocation (proposed)

CONTRACT-081 freezes successor 0.6/0.5/0.3; SD-007 owns the reviewed design.
The TypeScript adapter owns stable-ID source comparison, complete typed
dependency graph, companion operation/source-context marker derivation and deterministic
DDL schedule. Build a dedicated successor branch: removing a column-count guard
from an older profile is insufficient. Preserve complete sources, original
pointers, unknown content and authored order. Resolve implicit Record results
and unused/retained parameter dependencies before admitting a companion change.

Weft retains finite G02 typed data lowering; a selected administrative fill is
authorized independently of ordinary batch UPDATE denial. No-fill cases need no
Weft UPDATE. UMF retains default/DDL rendering, phase target/dependency identity,
strict prefix witnesses and final source correspondence. The successor supports
multiple independently selected added targets under the existing array cap,
unique target selection and aggregate phase budgets. Classify column-local
NULL-permitting pre-fill CHECKs separately from cross-Field/NULL-rejecting
post-population dependency CHECKs; both carry exact source rerender ownership. Host-neutral and
Psycopg appliers explicitly admit the successor and must acquire reader/writer
quiescence and native locks over the actual dependency closure. They do not
interpret arbitrary SQL to infer step ownership. Unsupported direct-client
quiescence is a refusal, not a metadata-head fence claim.

Extend exact phase schemas, both host dispatch/recovery routes, approval/reference
latest-plan admission, compiler bridge and generated clients with explicit 0.6
selection. Preserve installation 0.3 and fixed owner-only progress/approval
relations only where their exact schemas/ACL semantics remain valid. No new
unmanaged-object allowance. Progress witnesses cover complete before/after
atomic shapes, including reused SQL names with different Field IDs. Publish
only after native catalog/data/ACL/RLS and generated-client generation agree.

Implementation must retain explicit residuals for generated dependency cycles,
old-only Field copies (G04), retained restoration (G05), online conversion (G06)
and table-inventory changes (G10). A narrow implementation cannot mark broader
G11 command/dependency composition complete without its actual native tests.

The context marker normal form is exactly CONTRACT-081's full retained-document
digest plus complete configuration/module/authored operation. It intentionally
marks extra unchanged operations when context changes; do not invent compiled
result metadata in a deployment bundle that has none. Weft retains fixed-query
resolution. Policy/grant subject IDs are full content digests of closed typed
normal forms; extract the existing policy/grant renderer inputs to build them,
not SQL-prefix/suffix parsing. Bind physical role/relation/policy/ACL witness
separately, including missing/recreated native objects and inherited authority.

Implement a dedicated whole-source correspondence pass before scheduling or
effect emission. Record exact exemptions by before/after location and stable
typed identity, then compare all remaining content/array order; do not normalize
away an entire selected object and lose unknown qualifiers. Configuration,
retained carrier semantics and table inventory/name/order remain unchanged.
Operation-context review does not widen this admitted change set. Preserve
shared Field definitions still used elsewhere while removing a selected mapping.
Keep authored seedSets unchanged and never execute/replay them; seed-dependent
invalid successor or requested seed edit must refuse at its original location.
Seed-history evolution remains explicitly tracked within G11 rather than being
hidden behind a successful command-free/seed-free fixture.


### G11 concrete native generation ingress implementation

Implement CONTRACT-081's mandatory execution0.5 ingressProfile before native
0.6 admission. Preserve stable effective subject role OIDs/CURRENT_USER and
outcome slots; rotate only separately authenticated login epochs. Add trusted
GenerationEnrollment, GenerationIngressRequest/Transition/Lease/Observation,
GenerationFenceReceipt and opaque GenerationAdmission APIs, concrete Psycopg
provider, exact private store and external TargetCustody/Reservation service.
Keep the provider store outside the business schema under a separate controller
owner; no external-object exception or privilege is granted to businessOwner.

Integrate exact source/target/plan/file/approval binding, original external
reservation before native effects, durable NOLOGIN/data/head fence, complete
starting-authentication/session barrier, actual bounded owned termination and
same-transaction phase/publication records. Native store and external journal
use explicit intent/observe/confirm recovery; no distributed atomicity claim.
Credential release follows confirmed active head/epoch, never a process-local
success flag. The external custodian controls restore/start exposure before
ordinary connections, with fixed ownership and nonrewinding sequence custody.

Phase witness index0 is previous native catalog; index1 is next. Committed
business cutover may precede metadata-head publication. Both host routes must
keep that distinction and preserve fence on crash/unknown COMMIT. Fixed private
SET LOCAL ROLE hooks on the SAME physical phase/final transaction enter the
controller only for provider DML, restore/reverify business owner/settings and
abort the whole transaction on failure. No generic elevated SQL callback.

First qualify PostgreSQL18.6 with actual SCRAM-authenticated client sessions and
the pinned startup/status ordering. Owner-created SET ROLE probes do not qualify
authentication or pending handshakes. Reference provider may be implemented
behind fail-closed native admission while these tests are being built; it is not
complete until actual independent native evidence passes. Managed OAuth issuers
and restore providers need their own evidence and stay explicitly tracked.

Implement the trusted phase policy and module0.2 derived admin identity exactly
as CONTRACT-081. Move the private connection setup seam before BEGIN so native
transaction_timeout covers the whole carrier phase, then retain the absolute
host clock and clamp each dispatch. Share one actual marker-row counter across
all fills; record policy and budget receipt with the cutover transaction. Legacy
module0.1 and return behavior stay compatible. New Weft module0.2 artifacts and
installed-native default-bearing G11 evidence are prerequisites for admission.


### G11 concrete owner/session/backend observation integration

Implement CONTRACT-081's closed private owner registration and separately
enrolled native resolver; no caller-selected issuer/resolver/dictionary or
shared construction seal grants target authority. Resolve actual original
cluster/supervisor/endpoint/native observations before TargetCustody issuance.
Prepare actual controller/owner/maintenance native roles under original host
authority before final store creation approval; do not require future role OIDs
in initial target registration. OriginalStoreCreationAuthority binds original
role identities/flags, SET edges and full approved closure, actual native target
and settings. SESSION_USER remains maintenance while CURRENT_USER is controller
or businessOwner depending on the fixed private hook; verify both OID and name.

Preserve native backend state strings/SQL NULL exactly. Capture complete original
client PID/start entries; missing start refuses proof. Keep originals immutable
and persist one-for-one private resolution evidence. Do not drop an unresolved
NULL identity, kill an unrelated handshake, signal by PID alone or treat a
signal-only result as termination. fencing→fenced can introduce the newly
verified receipt; original request/reservation/candidate authority cannot change.
Implement the real supervisor/issuer/native observation path before production
enablement; source test attestations are insufficient.


### G04 checked conversion implementation

Implement CONTRACT-081's options/plan0.7, execution0.6, discovery0.4 without
changing historical meanings. Weft owns the finite checked scalar compiler; UMF
owns typed dependency scheduling/DDL and complete source/default correspondence.
Implement cycle-free conversion-effect discovery/markers and strict unused-entry
consumption; never lower an author SQL cast or treat generic G02 as old-source
conversion authority. Bind the complete trusted policy in original ingress
approval/resume. Use actual G11 credential retirement, protected whole-phase
native deadline and one-transaction capture/rewrite/validation/receipt.

Implement the exact originals-store/row-token/trigger/native-ACL composition and
original external creation custody, not a blanket extra-object exception. Source
business declarations remain distinct from provider metadata and archives remain
native typed/private. Qualify pre-adaptation source domains, complete FORCERLS
capture, post-cutover revision baseline and strict restore conflicts. Native
old-bound CHECK enforcement is mandatory for finite integer round-trip mode.
No provider/module capability is enabled merely by structural interface support.

Keep G05 purge/retirement and G06 online capture separate. A smaller delivered
recipe/recovery subset must leave every unimplemented family/mode tracked.

Implement the exact empty-SQL conversion step variants and cycle-free step/domain
bindings. Runtime Weft preparation returns only the actual qualified closed
checked scalar descriptor; UMF owns its fixed DDL shell. Bind request, original
source/domains/recipe and native compiler artifact through original qualification
and effect receipt; fake/cross-bound prepared replies and cast fallback refuse.
Execution0.6 uses the explicit G04 private transition/receipt variant; historical
variants remain exact. AccountingManifest omits only logicalBytes, avoiding a
self-inclusive counter while preserving defined metadata/value measurement.


### G11 actual supervised PostgreSQL implementation

Implement the selected CONTRACT-081 postgresql18-local-supervisor/0.1 in host-only
code outside the browser library. It creates an actual dedicated PostgreSQL18.6
cluster with original durable external creation/launch custody, private SCRAM
maintenance credential, exact distinct approved maintenance/controller/business
owner roles/flags/SET edges, and controlled external configuration/HBA. Trusted
maintenance/controller are explicitly SUPERUSER in this first profile; do not
claim managed or least-privilege qualification from it. Ordinary clients cannot
reach these identities, source declarations never gain their authority.

Implement real owned initdb/postmaster subprocess handling, native kernel process
observer from qualified pinned host headers/helper, actual private native
authentication/target/settings/listener checks and original birth/continuity
receipts. Ordinary HBA is closed BEFORE process startup/restart/restore, with no
Unix/IPv6/alternate listener. Opening exact active-epoch rules requires original
published/externally confirmed native admission and actual fresh SCRAM probe.
Reload acknowledgement/file parsing alone is never native gate completion.

Keep committed NOLOGIN/old-wrapper retirement and the real pending-authentication
barrier for running phases; source captures cannot replace actual termination.
Implement positive same-target stop/start/original pending-outcome reconciliation,
supervisor re-observation through original kernel/native custody, and negative
restored/copied-target continuity rejection. General restored-generation recovery
and other OS/managed privilege profiles stay explicit residuals, not automatic
new-target adoption. Bound every process/stage and remove only verified owned
resources after durable outcome/evidence settlement. Old trust-auth native runner
helpers may be reused as code, never as SCRAM/issuer/supervisor evidence.


### G11 concrete signed authority and original effect integration

Implement the actual ConfiguredEd25519OwnerAuthority prepare/export/verify/observe
path and its private durable reserve/consume/bind/outcome protocol. Use qualified
standard crypto, original operator-enrolled immutable key/principal/scope/target
configuration and exact six scope forms; no generic arbitrary JSON signing, key
from submitted envelope, shared object seal, UID shortcut or mandatory TTY.
NativeAcceptanceOwnerAuthority uses a separate immutable acceptance context but
the SAME native store/provider effect code; production rejects that purpose and
never falls back. Source tests with real signatures precede actual native tests.

Create-request approval is before initdb. Pre-DDL principal approval binds actual
bootstrap/postgres origin and known names/flags/SET edges, not future application
DB/controller OIDs or final TargetCustody. Roles and CREATE DATABASE are explicit
staged native effects with original intent/observe/confirm; three fixed GRANTs
per edge use one membership option each. Final target registration follows
actual app database/role receipt. Allocate registrationId before signing, omit
ONLY ownerApproval and apply its exact one-to-one legacy scope projection after
verification. Final store signature binds the exact store and full real prepared
native evidence. Provision/transition wrappers keep all original request meaning,
including ORIGINAL UMF plan approvalDigest; never remove it as a self-reference.

Wire every issued owner/store capability through the original enrolled issuer
registry, custodian/supervisor/opaque target/native context and signed purpose.
Durably consume and bind original native reservation before effects; process and
thread races reuse one original ID/resolvable handle. Unknown native/journal
outcome observes the original, not a new approval/effect. Rotation is explicit
authenticated settled-only host configuration enrollment, no automatic live trust
change or loss of original read-only outcome/signature history. No source-only
primitive or self-consistent record qualifies actual native authorization.


### G04 native issued-instance ledger and exact provider composition

Extend the selected unpublished originals store's fixed row_tables shape with
issued_count and its immutable record with maxIssuedInstances; add exactly
issued_instances(table_token,instance_id) with the declared PK/FK/native privacy.
Include every actual native column/relation/constraint/index/owner/ACL dependency
in the original custody inventory, not a prefix-based extra-object allowance.
Earlier experimental stores cannot be adopted or upgraded implicitly.

Enroll the complete protected existing population and its reserved IDs in the
same native transaction before enabling writes or archive capture. Fixed INSERT
guard locks/increments the original table counter within its immutable bound
and reserves its new UUID without conflict suppression. Generation collisions
abort the statement, including collisions with deleted or value-purged originals.
Preserve UPDATE identity/revision checks and actual native relation binding.
Committed unused BEFORE INSERT reservations remain counted; do not equate the
ledger with live rows. All business effects and reservations share one native
transaction, and unknown enrollment outcome observes the original registration.

Per-table counter locking/throughput and finite lifetime reservation exhaustion
are explicit compatibility limits. Archive logicalBytes excludes separately
bounded ledger metadata and does not claim a physical disk/WAL ceiling. Values
purge never removes issued IDs, resets counters or authorizes identity reuse.
No online cap raising/ledger compaction or experimental-store adoption is claimed.


### G05 protected retained retirement and new current-source restore

Implement the selected options/plan0.8, execution0.7, discovery0.5 closed
retirement/restoration/archiveSources forms, typed empty-SQL step variants and
original-source recompile verification. Keep all prior-profile byte/meaning
contracts. Bind complete original source/Field/native domains, selected retention
and original archive descriptors; unknown dependencies, unused entries and
unsupported type/lineage composition refuse. Never replay seeds or infer fill
from future defaults. Retire direct column access, not just generated accessors.

Use the exact original same-database typed archive plus issued-instance ledger
and lifecycle relation/record. Capture/drop/private metadata/native outcome
share one actual transaction under the actual ingress fence and exclusive
protection. Retirement publication is separately authenticated original outcome
observation; no aging/restore/purge before confirmed publication. Unknown native
COMMIT observes the original effect and holds ingress fenced, not repeat capture.

Restore as a NEW current-source approved plan. Prove continuous absent-target
history and original instance/guard/custody. Surviving originals receive exact
old values while preserving unrelated current columns/Keys and allowing greater
revision; deleted originals stay deleted. New instances get only selected
null/refuse/scoped fill. Required original NULL refuses. Weft owns the actual
qualified archive-complement typed fill and guards; do not rewrite its SQL,
evaluate fills against originals, or grant ordinary archive reads to make it
work. Actual immutable compiler/session agreement is required before admission.

Freeze exact lifecycle native inventory, private original request/consumption/
reservation/outcome registry, separately configured Ed25519 retained-data scope
authority and actual enrolled clock certificate/checkpoint implementation.
Serialize restore, purge and current policy/hold changes on the same original
lifecycle row; acknowledged holds and unknown native effects cannot be bypassed.
Purge is host-only, signed for exactly one original values relation, separately
irreversible; no schema-head reset, archive-prefix deletion or CASCADE. Normal
mode needs proved elapsed lower bound; minimum-only override never waives holds,
origin or pending/live dependency. Preserve identity reservations/history after
value purge and confirm original native tombstone/absence before success.

Enforce the exact G05 trusted execution policy, per-phase complete row/value-byte
limits, distinct finite metadata caps, native transaction timeout and host
deadline before effects. Save verified per-effect source/identity/count/compiler
receipt with actual business/catalog/outcome COMMIT. No logical-byte/row bound
claims physical disk/WAL or external copy erasure. External/online custody,
combined type-change restore, table retirement and abandoned cleanup remain
separate unqualified compositions with explicit release tracking.
