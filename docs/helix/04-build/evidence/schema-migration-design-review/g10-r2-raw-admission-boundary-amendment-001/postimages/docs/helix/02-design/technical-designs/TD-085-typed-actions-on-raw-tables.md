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


### G11 original logical enrollment authority and native first-epoch path

Implement the exact ConfiguredGenerationEnrollmentAuthority, immutable source/
subject/key/purpose configuration and original operator trust bootstrap registry
context/resolver. Bind policyRevision, complete configuration/context digest and
key selection in original signed requests and durable ledger. Complete cohort
tuples match as tuples, and EVERY admitted legacy subject is LOGIN/nonprivileged
with preserved original inherit/groups. Physical creation/store approvals do not
authorize logical enrollment; the six owner scopes remain closed and unchanged.

Separate original pre-OID preparation from actual-OID activation under the new
signing domain. Actual native role preparation and one prepared epoch share
one transaction before final authentication barrier completion; preserve exact
existing native provision/enrollment receipt keys with original domain/capability
resolution. Native store entrypoints accept only original private prepared/
activation capabilities, not raw epoch/success dictionaries or generic object
seals. No fake old=new transition or null-head existing-enrollment branch.

Use SAME actual qualified G11 native gate/candidate/resolution barrier through
the exact original initial-enrollment binding/fence record and fixed private
evidence resolver. Preserve NULL/starting observations, full original candidates
and terminal proofs across restarts. Reobserve protected source/head/cohort/
policy/roles/target before activation; enable approved wrappers and mark initial
epoch active with actual receipt in ONE native transaction. Gate/credentials
stay unavailable until positive original native/external confirmation.

Provide positive original request/context/prepared/active recovery against
EXISTING original bootstrap/ledger/native history. Missing original custody
refuses without recreating keys, locks, contexts or role history. Do not rerun
confirmed roles/epoch or re-enable legacy subjects after unknown COMMIT. Actual
native production/acceptance trust, private issuer, backend barrier and process
restart evidence remain mandatory, not implied by source signature tests.


### G04 concrete store/table capability and same-transaction capture integration

Implement exact original store reservation/native COMMENT creation receipt and
positive external confirmation; no undeclared .1 table or prefix/name adoption.
Record real created object OIDs/complete native definitions, including implicit
types/index/dependency closure; exclude only the creation-receipt comment from
its own definition projection to avoid a hash cycle. The comment is visible
metadata, never a place for values/signatures/credentials or native authority.
Missing original ledger/target/attestor after unknown COMMIT refuses instead of
creating a new schema or treating matching metadata as birth proof.

Implement exact per-table source/plan/ingress/native identity/token/name/capacity
request and original reservation before ALTER. Existing adopted row_tables
record is the native enrollment receipt; no extra columns/table or copied JSON
capability. Native metadata/guard/issued IDs/ACL translation and enrollment
record commit together. Retained execution0.6 selects exact G04 policy0.2 with
maxIssuedInstances; actual original ingress signature/policy digest binds it.
No .1 policy normalization or future OID invented during preparation.

Expose only finite fixed store methods with original phase/enrollment/archive
capabilities. Same actual private connection/backend/native top-level xid8/
INTRANS and original target/context persist across every role boundary. Original
outer businessOwner and complete dynamic session policy are observed, controller
hooks use transaction-local fixed original roles, and restoration is reverified
before receipt. Follow the adopted locked/fenced temporary TABLE RLS disable,
businessOwner typed collection, controller-only archive insert, final original/
next ENABLE/FORCE/role/settings restoration. No controller general business
SELECT workaround, author callback/elevated cursor or online RLS-disable claim.

Before adapting values, native finite/calendar/domain and canonical-length
preflight bounds source ID batches1000/8MiB logical cost, under original source
locks. Private typed values stay internal and complete set/budget/revision proof
remains mandatory. On any hook/error/restore uncertainty invalidate capability,
abort whole phase and close/quarantine actual physical connection; no business-
only commit or elevated pooled reuse. Real driver/native resource evidence is
required; logical bytes do not claim Python RSS/physical disk limits.


### G04 explicit signed capacity and repeated capture batches

Construct defaults only in trusted unsigned policy preparation. Require explicit
maxIssuedInstances on policy0.2 signed wire/receipts; never normalize missing
signed fields. Repeat bounded1000-row/8MiB PRIVATE batches over the complete
locked population within aggregate original approved policy, maintaining full
ID/set witnesses. Enforce explicit single-value8MiB refusal before adaptation,
not a hidden whole-archive cap or row omission. Integration002 SHA256: b2ff1a1b90f1ff279e65d06442adad5a4dfe45f284dc7d5e45df2c7d4db26f9c.


### G04 exact TOAST and RI creation custody

Implement the amended closed objects with required actual parent addresses.
Follow actual reltoastrelid and automatic storage/index/type dependency closure;
pg_toast is allowed only for those original parent-bound objects. Match the
COMPLETE native-generated RI trigger set to actual declared FK constraints and
all function/event/enable/argument/index/relation/dependency facts against pinned
PG18.6. No prefix/internal-flag/schema-name waiver or invented created builtin
function. Capture actual OIDs/definition/parent closure in original same-TX
creation receipt and external original confirmation. Reject missing/extra/foreign
internals and retain strict user-trigger/default/ACL/privacy restrictions.
Integration003 source SHA256: d319c315a1b50c44eb1777017e1016dd2a18eb65627adf4b6ff687190e2f9786.


### G11 acyclic operator-root logical trust bootstrap

Implement the exact original .2 bootstrap/root policy, fixed registry birth,
request/confirmation records and root-signed trust enrollment specified in the
G11 original operator root contract. Original operator roots precede physical
setup and contain no future native IDs. The actual logical configuration is
signed after real target/source/head/subject/store observations. No caller key,
self-hashed sidecar, native observer or filesystem UID confers trust.

Keep native-class orchestration above bootstrap/core leaves. Bootstrap owns
original immutable request/enrollment/context registries and actual birth
custody; concrete crypto verifies configured root signature; native owns actual
observation/target/store registries. No callback registrar, import back-edge or
source-test issuer may replace this concrete production/acceptance path.

Prepare persists exact selected root key and request before export. Confirmation
revalidates actual original native continuity and signature, then atomically
consumes the root approval and records confirmed trust in the ONE original
registry file. Issue the process-local context only after durable confirmation.
This trust operation creates no native database effect. Original recovery
settles the same request/birth/confirmation with stable IDs and no reconstructed
confirmed-missing files. Old-host .1 trust upgrade, missing stable subject/schema
bootstrap, headless G10 authority and full native qualification remain explicit
separate gates.


### G11 one primary original setup state, no optional-sidecar first use

Implement new context0.3 EXACT as the G11 primary setup contract. The existing
fixed owner-bootstrap-context.json is the primary original state; original
operator deployment installs pending binding and existing setup lock BEFORE
resource initialization. Runtime factory never creates a missing primary, lock
or inferred first configuration, and never substitutes a caller-selected path.
No usable context/approval/native session exists while primary is pending.

Under original existing setup lease initialize only pinned original owner ledger
and, for enrollment0.2, generation registry, using exact existing header bytes
and qualified original custody. One atomic primary pending-to-confirmed write
commits birth after all required bytes/fsyncs; no two-file confirmation window.
Original pending header/lock/prefix resume is initialization-only, never effect
history repair. Confirmed missing files refuse without O_CREAT. The concrete
supervisor constructor independently verifies confirmed primary/path/core; pure
crypto construction grants no native authority.

Keep owner enrollment0.1 and root enrollment0.2 exact. Owner-only context0.3
uses generationAuthority:null; root-enabled context0.3 binds010 root policy and
acyclic registry birth. Old context0.1/0.2 upgrade and configured deployment
restoration are separate unqualified operations. The old optional birth/anchor
files cannot authorize native sessions or change path after loss. Preserve
actual003/004 failures and scope every source/native claim.


### G11 root registry implementation and exact third verifier boundary

Implement the exact original root-registry0.1 canonical JSON, zero-state birth
and full current continuity from the concrete root-registry contract. It is
never an empty file or the existing logical context-registry0.2 JSONL. Primary
context0.3 binds original birth, not equality with every future file version.
Verify every current request/enrollment/sequence/signature/custody cross-link.
Complete actual original root prepare/export/confirm/recover/session, retaining
exact scope/config/purpose/native association and no automatic trust installer.

Use dedicated native-free generation_authority_bootstrap and exact concrete
ConfiguredGenerationAuthorityRootVerifier.verify_approval for the root domain,
with only the separately enumerated lazy crypto/version exception. Preserve
existing type/error/registry aliases and separate logical ledger/context records.
Freeze acyclic source moves, using native-free generation_enrollment_ledger
where shared context/approval ledger code requires it; no back-import into the
logical authority and no generic callback/registrar. Actual native orchestration
lives above those leaves in generation_authority_session. Preserve exact native
lease/root registry/context journal lock ordering from the contract.

Repair original lease descriptor cleanup on every validation exception and exact
full lexical verifier class/method enforcement. Preserve all003/004/005 actual
failures; owner-only positive controls do not qualify rooted composition.


### G11 root prepared birth, atomic confirmation and readonly context issue

Implement the root-context birth ordering exactly: under original native custody
lease validate prepared root request/signature, release ROOT lock for original
subordinate context/ledger birth, close their locks, revalidate same original
request/native continuity under ROOT lock, atomically confirm ROOT, release it
and ONLY then readonly issue context. No usable context before confirmation;
confirmed root missing subordinate history refuses without initialization.

Production contextId is signed RootIntent.contextId, distinct from trust's
enrollment identity. Derive only new ROOT-backed production ledger paths and
logical IDs using the exact fixed path/UUIDv5 rules in the contract; do not
rewrite source-test or historical identities. Shared context journal cannot
be recreated if any ROOT entry was confirmed. File effects before confirmation
are fenced original initialization, not distributed atomic commit or authority.

Preserve exact original root request/config/context/type/registry aliases and
actual native association checks above pure logical core. Physical owner may
use only the fixed native-free ROOT codec/current-validation edge, with no
reverse dependency, physical context laundering, native callback or generic
issuer registrar. Implement actual missing native hooks and positive original
root entry issuance; naming a fail-closed future hook is insufficient.


### G04 original store creation journal integration

Implement the exact external/supervisor journal0.2 kinds, closed payloads,
per-store original state and cross-journal parent/sequence/receipt binding from
the G04 original store journal contract. New original target profiles only;
old0.1 bytes/meaning/readonly recovery stay exact. No boolean/tag/hash/COMMENT
or supplied reservation creates a native provider capability.

Original external reservation precedes typed supervisor intent, which directly
precedes the existing generic native-effect-intent. Owner core binds THAT
generic event as its existing original reservation requires. Same native DDL+
full COMMENT receipt commit first; actual positive fresh original outcome then
external observation/confirmation, typed supervisor confirmation, existing
generic native-effect confirmation and SAME owner-ledger finish precede issuing
the opaque store creation capability. Reconcile every partial confirmation by
original IDs/state without DDL replay. No cross-file/DB atomicity is promised.

Known-abort attempt remains original operation pending; repeat only with actual
positive noncommit proof/fresh authority/absence under remaining original bounds.
Unknown never allocates another request/reservation or retries speculatively.
Use fixed actual original native resolver/type/registry paths, not callbacks or
custodian-to-native back-import; freeze exact source map before code adoption.
Global original lease precedes either journal append lock; release append locks
before native SQL/other journals. Current dynamic provider objects require their
OWN positive original births; do not equate current whole catalog with initial
empty-store receipt or waive extras. All actual qualification gates remain.


## MIG-G10 full phase-aware inventory design adoption 001

This amendment adopts the exact reviewed successor006 inventory definition set
as REQUIRED design for CONTRACT-081/TD-085/STP-085. It does not claim implemented
support, issue authority or relax any original native/installed/release gate.
The reviewed source manifest is
`86ef804046e88edc90021a52d879f0e6bd13a8257322365bc9c9ba0611f9ffc8`;
independent design review is
`c04707129131fee777f736c68202a954c419427a7dd7af12b9dfd0bb903adcec`.
The existing artifact frontmatter, IDs and complete prior bytes are retained.

The complete exact definition set is retained under
`docs/helix/04-build/evidence/schema-migration-design-review/g10-contract-001/definitions/`
and each complete file is hash-pinned in that folder's parent manifest. These
are project design elaborations, not a copied methodology catalog. Within the
scope of this amendment their exact records/DDL/compatibility/ordering/recovery
rules are normative requirements; reviewed proposal status prose remains
historical provenance, not an implementation claim. No omission from the
excerpt below removes a definition-set requirement.

Precedence: successor006 campaign-grant-accounting closes ambiguous005 charge
prose; ordinary-decision-custody replaces004 denial-only private reservation
profiles for BOTH decisions. The004 negative native observation/outcome/return
shapes remain exact. Original approved-only ApprovalReceipt.verify remains
unchanged; genuine denied protected-row/native verification is separate.
Old protocol variants remain exact and refuse unadmitted new profiles. No later
G11 context/native interface is implicitly adopted by these006 source pins.

Full scope includes create/remove/unequal/mixed/empty inventories in initial
and installed modes; complete typed dependency/atomic phase semantics, actual
execution-aware seed lineage, exact metadata/publication/reference and signed
full component/session/provider policies, initial prospective approval ordering,
one original approved/denied decision journal and same-provider campaign grant
allocation, exact carrier retirement branch, and all88 planned acceptance rows.
Do not replace this scope with create-only implementation or safe refusals.
Immediate irreversible table removal is the explicitly disclosed first subset;
retained whole-table archive/restore/separate purge and old enrolled-store
migration remain REQUIRED backlog work, not silently completed by G05 Field
archives or by this adoption.

Concrete enablement remains gated on original schema/stable-subject bootstrap,
genuine authenticated review adapter, actually admitted durable fixed provider
records and same-store atomic CAS, native timers/original continuity/COMMIT and
positive restarted recovery, complete Weft/compiler/session/identity/retention
composition and initial/existing/mixed/empty native acceptance. Old-context/store
upgrade, retained-table recovery, installed/browser/platform/CI/release and
published-byte verification remain explicitly OPEN. Full G02–G11 goal remains
open; design controls do not replace actual implementation/native evidence.

All exact shared shapes remain owned by CONTRACT-081 and its pinned definition closure.

### Exact reviewed technical-design.md

# G10 technical design proposal005

Governing story: US-051-AC11–16; parent SD-007; proposed shared surfaces are in `contract-proposal.md` for CONTRACT-081 adoption. This applies HELIX's design/technical-design contract without minting an artifact ID or changing existing ddx traceability. No implementation is authorized by this packet.

## Approach and requirement coverage

Use stable authored table/Record identities and a compiler-owned graph of typed physical effects. Prefix states come from applying those effects to complete source-derived expected catalogs, not from assuming every table in next already exists. Existing tables, next-only tables and previous-only tables are distinct; a schema with zero application tables can still be an installed generation. New-table-only, mixed new/existing, removals, unequal-count replacement and first install remain explicit requirements.

US-051-AC11/12 require correct absence and historical-row obligations; AC13 requires complete dependent/loss disposition; AC14 retains exact conversion semantics; AC15 requires original outcome/no-repeat/fencing; AC16 separates portable plan from each native capability. The current G10 refusal is retained until the corresponding new profile passes its own tests. A source-only graph is not native qualification.

The trade-off is a larger explicit successor profile and prefix verification rather than widening old assumptions. Retaining each old dispatcher avoids changing historical hashes. One new inventory engine owns the complete schedule; it does not concatenate G02/G03/G11/G04 plans or invoke old verifiers on rewritten projected sources. Shared internal semantic functions may be factored with legacy golden checks, but old public wire acceptance remains exact.

## Complete source correspondence and identity

1. Verify complete original before/after bundles independently, including configuration, module/Record/Field references, all source operations, seeds, logical/native facets and unknown content. Verify supplied original history to exact predecessor and derive complete immutable seed lineage; previous.bundle alone cannot identify an older retired set. Host later matches this source history against actual applied history. For initial, before is null and source history empty. No before shape is inferred from a live database.
2. Build maps keyed by table binding ID, Record ref and Field ref, preserving authored order separately. Bind physical schema/name to stable IDs, never array positions. Classify retained/create/remove. Same binding with a changed Record/name is refused in this proposal; renames need an explicit reviewed successor rule. Different binding/Record with the same physical name is a remove+create with a required drop-before-create edge and destructive disposition.
3. Inventory every affected source/catalog dependency, including inbound/outbound FK, Key/unique index, CHECK/domain CHECK, policy joins, grants, comments, CRUD/query parameters/returns, seed references, shared Field declarations and uninterpreted extension content. Native unowned inbound dependencies remain a native refusal; no CASCADE or broad extra-object exception.
4. Whitelist exact admitted edits and before/after pointers. Do not erase an entire selected Record/table to compare the rest: that could hide unrelated logical metadata or unknown qualifiers. Reconstruct full next meaning from previous plus typed admitted changes and compare the whole document/catalog. Both original sources stay in plan and history. Unchanged unknown content is retained; unknown affected semantics refuse, and current deployment refusal of unsupported extensions remains truthful.
5. Operation/context review is required where context changes, but it cannot override invalid required-create omissions or confer grant authority. Required appended Fields do not rewrite retained commands. No same-name old-only copy or cross-table data transform is inferred from G10; independently selected G02/G04 semantics remain the limit.

## Typed graph and atomic grouping

Nodes are complete typed subjects and operations, with before/after source meaning. Build explicit prerequisite edges, then stable topological sort using authored source order only as a tie-breaker. Never inspect SQL text, name prefixes or operation-name ranks to invent dependencies.

| Dependency | Required edge |
| --- | --- |
| Remove/rewrite a Field or table | Old policy/grant/FK/check/index/Key consumers detach first, respecting exact source dependency closure |
| Drop referenced Key/index/table | Every selected inbound FK drop precedes it; no unsupported inbound dependency silently disappears |
| Reuse old physical relation/column name | Exact old binding removal precedes new binding creation; no existence-based adoption |
| New table/Field | Its real create/add precedes every dependent constraint, index, policy, grant, comment or data operation |
| Key and FK | Referenced complete Key precedes FK add; FK drop precedes Key drop, across old/new table boundaries |
| G02 required target | Original admitted add/check/fill/default/NOT NULL order stays indivisible; future default never fills history |
| G03 | Drop/SET future default is explicit, old rows untouched; companion conversion default handling remains typed |
| G04 | Capture iff retained, before its conversion; all relevant conversions and reinstalled cross-Field dependencies before complete validation, in one required transaction |
| Policy/grants | Typed relation/Field/join/role prerequisites before policy/grant add; revoke affected old access before destructive changes; absent commands gain no grant |
| Seed sets | Original set/row order edges remain; no skipped/reordered rows. Mutations run with target's declared native constraints, except explicitly selected NOT VALID affecting only prior rows |
| Deferred validation | ADD NOT VALID precedes dependent work and final VALIDATE; NOT VALID still enforces new rows. Complete validation precedes publication |
| Concurrent index | Table/columns/Keys prerequisites committed before dispatch; exact validity completion before dependents/publication; no transaction-forbidden node inside an atomic field group |

Contract identical-source restrictions in old G03/G11/G04 dispatchers are not bypassed. New G10 composition requires explicitly reusing their semantic obligations inside the successor compiler, with full source correspondence and new tests. A combination that cannot preserve an original atomic group is a located full-plan refusal, not partial execution.

Required groups share/merge prerequisites when necessary, including cyclic new-table references that can be represented as create shells, Keys, then FKs inside one native transaction. DDL graph cycles caused only by FK table order disappear through this legitimate decomposition. Data cycles remain real: source-declared deferred FK semantics can work in one seed transaction, immediate forward references still fail. Never disable constraints or infer deferred mode. If a valid domain workflow needs a separately designed data-transform/deferred strategy, keep that unmet requirement visible.

Example mixed graph: existing Person adds a required derived label, new Team is created, existing Person gains an FK to Team, Team seeds are appended, and a concurrent lookup index follows. Create Team/Keys/policies with RLS; retain Person's exact G02 group; explicitly selected ADD NOT VALID on Person FK may permit prior rows while Weft applies original Team seed sets; validate whole Person FK after referenced rows exist; build selected concurrent index after its prerequisites; verify complete next state; publish. New Person inserts during seeding must satisfy the FK. Without explicit NOT VALID or a graph-valid seed-first stage, do not silently relax enforcement.

## Initial and installed native state machines

Use original host-owned custodian/supervisor/owner authority and the agreed immutable production|native-acceptance purpose. Fixed metadata remains owner-only. Author source does not create authority roles, choose credentials, turn fixture context into production or approve native effects. G11 actual credential retirement/private issued-ID/native observer implementation and qualification are prerequisites, not portable profile booleans.

Installed transition:

1. Resolve the exact trusted installation, original head/source/history and persistent approval shape. Acquire the actual original custodian writer lease and lifecycle migration session lock. Verify the predecessor before admitting only the selected new fixed metadata shape under a private transition context. Approval table already present is preserved; selecting old plan0.1/0.2 for fresh effects refuses.
2. Reserve the original transition, approved plan/file/policy and intended successor epoch under G11. Retire actual old login epochs/sessions with the qualified pending-authentication barrier. Persist fencing before carrier effects and retain it through every committed prefix, restart and publication gap. Revoking metadata-head SELECT alone does not fence direct SQL.
3. Run the required prepare metadata phase, record exact original binding and prefix witness; the explicit phase2 approval step reobserves the SAME original native protected approval. Each transactional phase verifies the exact preceding semantic frame and actual witness while holding its locks, executes its complete atomic group, verifies the next frame, and commits effects/progress together.
4. For concurrent indexes, persist original dispatch intent before autocommit. Unknown dispatch settles only the original selected index by full shape/validity/original failed-object custody; invalid repair needs explicit approval. Never IF NOT EXISTS or rerun a non-idempotent phase because its response was lost.
5. Final publication is a metadata-only required phase: validate complete next application catalog/constraints/RLS/privileges/defaults/seeds and exact metadata; record final original history/source/file/plan/witness and persistent approval custody; remove selected pending progress; restore only final head grants and record provider publication in the required native transaction. External custodian confirms original commit before releasing successor credentials/readiness. Unknown publication observes history/provider/custodian; it never executes business steps again.

Initial transition:

1. No installation/history/head is invented. Require the original separately authorized local target/principal/database/schema custody, correct empty dedicated application namespace, stable configured role closure, and a physically closed ordinary endpoint/credential gate before first metadata/business effect. Nonempty schema or lookalike metadata with no original bootstrap receipt refuses.
2. Bind exact source/bundle/plan/file/policy and actual new disabled login inventory to a separately agreed first-publication authority request. The current six closed G11 scopes cannot silently accept null old-source/head/epoch fields. Exact new scopes are proposed in fresh-authority.md and are not an already admitted capability.
3. Reserve original logical bootstrap authority with the exact prospective ApprovalBinding and actual authenticated review evidence, WITHOUT claiming a native receipt before its relation. Then the required prepare phase creates ONLY fixed selected metadata with original setup receipt and phase1-complete progress; ordinary endpoint/credentials stay closed even though the exact baseline head view already has its fixed SELECT grants and zero rows. A history table with zero rows plus matching exact pending bootstrap receipt is admitted ONLY by this explicit profile, never old ordinary history verification. Unknown prepare COMMIT settles original progress/setup/native custody; no lookalike adoption.
4. Run phase2 through the NEW private record_fresh_plan_approval with original authenticated review decision; actual protected _record_approval session_user/native clock/UUID and phase2 completion are one native transaction. Positive confirmed approved native receipt is required BEFORE business/publication; a real denied row atomically records the exact negative outcome/witness/progress in denied-approval-recovery.md, remains phaseIndex1 and fenced, and returns SAME actual native denial receipt on original unknown-COMMIT recovery; unknown remains fenced and resolves original row/outcome without a second INSERT. Then execute graph/prefix phases as above, starting with empty table inventory; creation never pretends newly created relations were original predecessor objects. First native history entry is written ONLY at final publication. A failed initial campaign can leave owned pending metadata/tables fenced and resumable; that is not a published empty installation. A deliberately published empty inventory is a real generation and next migration uses its non-null head.
5. Activate only after final complete native/source/approval/history correspondence and original external confirmation, using actual fresh authenticated successor probes. Never fall back to legacy bootstrap or open HBA because no predecessor exists.

## Exact separate fresh authority (R3)

fresh-authority.md specifies the complete two additional scopes, fresh-only logical configuration0.2/domain/context, absent predecessor witness, actual already-authorized NOLOGIN stable-role prerequisites and original preparation/activation capabilities. Existing-head governing009 and the six physical owner scopes stay closed and unchanged. No new role/schema authority is inferred from source names or physical owner approval. Missing original qualified bootstrap is a refusal. Real scope/native implementation and recovery remain separate enablement gates.

## Physical identity, locking and restart

Lock complete affected existing and referenced owned table closure by stable semantic identity/deterministic order, rechecking original relation identities. ACCESS EXCLUSIVE business-table protection is required where current G11/G04 groups require it. There is no lock on a nonexistent relation and no invented LOCK SCHEMA operation. Absent-name custody requires original exclusive migrator/custodian authority, no ordinary CREATE privilege, privileged-DDL quiescence, full namespace recheck immediately before CREATE, and original actual create receipt. If these assumptions cannot be enforced, refuse; names alone cannot exclude a race.

Creation observes new native identity in the same transaction and binds it to its exact create node and plan. Subsequent phases lock/reverify that same original object. Drop first resolves complete original private provider enrollment/issued-ID/archive/lifecycle custody. An old store0.1/0.2 enrolled carrier REFUSES the first subset. The separately proposed carrier-retirement.md successor preserves old token/OID, issued IDs, archive/hold/lifecycle/removal history with an explicit retired row, absent-business/trigger witness, retained-inert guard and same-transaction native retirement receipt; no stale active trigger/OID witness or erased ledger. Qualification and old-store migration remain OPEN. Drop observes exactly the authorized original object and complete inbound closure; same-name unrelated replacement refuses. OID equality/inequality alone cannot establish birth or continuity. New/removed table RLS, policies, columns, indexes, grants, dependencies and comments all appear in exact prefix inventory; no wildcard table prefixes or unowned metadata exceptions.

After worker/supervisor restart, reestablish original kernel/native target/epoch/authority identity and exclusive custody before observing original progress. Match exact contiguous completed steps, semantic frame, native witness, plan/file/head/source/policy/approval. A committed backfill, conversion or seed is never rerun. Known aborted transaction may be retried only after positive original noncommit proof, with original accounting/budget. Unknown remains pending/fenced. Database/control restore or copied progress is not same-target continuity and cannot reset IDs/head/epochs/history. Corrective migration or an explicitly qualified recovery operation is required for committed prefixes; whole-plan rollback is not promised.

## Fixed native progress and reference (R4)

native-metadata.md/native-metadata.sql/metadata-definition.json specify exact native DDL, indices, owner/ACL/OID origin, closed progress/prefix/object/phase/publication/reference records, same-transaction source history/epoch publication and original unknown-COMMIT recovery. New family umf.table-inventory-installation/0.1 binds actual complete history/seed execution, source/head/plan/ingress and native metadata. No old profile gains extra-object tolerance or downgrade. True headless pending setup is not published empty. Actual current reference survives historical replay and every subsequently admitted existing-only transition; integration must refuse if it cannot preserve it.

## Complete signed policies and native ordering

component-policies.md is normative proposed selection/derivation: full original G11/G04/G05 policy (including explicit G04 .2 maxIssuedInstances), full perphase transaction_timeout and statement/lock/deadline, immutable actual session/compiler/provider selections and campaign envelope are signed before effects. Original receipt.policyDigest hashes the complete ORIGINAL component policy; outer inventory receipt binds the envelope separately. Establish actual transaction_timeout BEFORE BEGIN; original counters are conjunctive, mixed immutable timer/profile conflicts refuse without splitting atomic groups. G01/G02/G11/G04 historical operations require original existing-before carriers, never invented new-table fills. Actual same-connection legacy/derived module qualification is OPEN if absent.

## Component ownership and implementation readiness

| Owner | Affected modules and allowed work |
| --- | --- |
| Portable UMF | `src/table-migration` inventory/selection/source-correspondence/history verification/typed graph/prefix projection; deployment semantic helpers and new schemas. Browser-compatible data APIs only; no driver/filesystem/process/Weft-runtime import. Current `index.ts` dispatch stays exact; proposed `inventory.ts`, `inventory-graph.ts`, `inventory-prefix.ts` each owns one invariant; explicit new history-context verifier is not an implicit change to old plan verification |
| Weft compiler | Existing original-source seed, G02 row-expression and G04 checked-conversion preparation; new schema capability only where exact descriptor binding needs it. No DDL planner or host approvals in Weft; UMF must not render UPDATE/INSERT/conversion SQL |
| Host | `python/umf_access/src/umf_access/lifecycle/{host,mixed,progress,ledger,head,witness,catalog}.py` with explicit new profile dispatch and focused inventory runner/projector modules; native driver adaptation at existing boundary, not portable core |
| Native G11 authorities | Original configured signer, issuer registries, supervisor/custodian, target birth, credentials/epochs, signed purpose and no-repeat journal; initial variants require explicit new agreement and real implementation |
| Integration/release | Shared source/embedded assets, installed Python/native bindings, generated clients/head reference dispatch, CLI/library parity and exact published cohort; source-only packet does not qualify them |

Use `bun scripts/check-table-deployment-boundaries.ts`, `bun scripts/check-table-lifecycle-boundaries.ts` and existing Python lifecycle boundary tests plus negative controls; do not expand checker allowlists merely to hide an ownership violation. ADR-006's shared Rust target remains governing; this proposal identifies current TS/Python integration points, not a new duplicate semantic engine or an exemption from the eventual Rust boundary.

No formal-methods or OpenTelemetry concern is selected in the read project Concern set; do not invent adoption. The bounded transition model above supplies safety/recovery obligations; external reviewer may request executable model checking. Diagnostics reuse governed lifecycle attempt/progress/receipt capture, with source paths and aggregate counts only, no values/secrets. Runtime acceptance must retain actual run/attempt identities, pinned native/compiler/package artifacts, original outcomes and cleanup evidence; source simulations are separate.

Implementation readiness requires root + external adoption of R1/R3/R4 exact proposed contracts in review-decisions.md, the fixed native/storage schema and completion/qualification of actually selected Weft/G11/G04 host capabilities. No work item or release is declared complete here. Once agreed, slices should separately demonstrate portable graph/prefix correctness, metadata/bootstrap admission, existing mixed native recovery and initial/removal acceptance before broader integration/publication.

Governing011 at3339a9732e96d2afd5e1b84ee51e50a79c827bb4 is an additional exact pin for original primary context0.3 setup/owner-ledger/logical-root composition. Preserve both enrollment0.1/0.2 bytes and the late actual-config root signature. No missing primary/setup lock/ledger/registry is recreated by runtime; old contexts0.1/0.2 are not widened. G10 fresh logical scope/native setup still needs separate adoption and qualification; physical context0.3 alone does not authorize logical publication or stable-role/schema creation.

Successor005 ordinary-decision-custody.md is normative proposed shared text for ONE original initial phase2 request/reservation/attempt accounting/journal/settlement and recovery across approved|denied. Native decisionBinding binds original common custody in progress/witness and original initial permanent publication. Positive native outcome maps to the actual approved row plus existing successful phase2 receipt; denied native outcome/return is exact004. Native positive COMMIT before original common confirmation cannot issue business capability. Approved-only receipt.verify is unchanged; denied uses genuine protected reader/native full correspondence. Installed pre-transition approval does not enter this fresh-only slot, and no old context/signature scope is widened.

## Successor006 exact one-grant/cumulative mapping

campaign-grant-accounting.md is normative proposed closure. Native budgetReceipt.campaignCharge.elapsedBudgetMs equals ONE dispatched original grant.reservedMs. Common priorCampaignCharge is the original cumulative outer preparation checkpoint including every aborted/resolved-unknown preparation grant, never the successful phase1 receipt alone. Current original outer cumulative time sums UNIQUE grants across every attempt/phase; native receipt/settlement replay addsZERO. Common+outer refer to ONE same-provider durable allocation under original atomic CAS, not independent budgets. Existing decisionBinding resolves phase2 to that SAME original grant. Unknown stays charged/fenced; positively proved abort permits exactly one new fully charged numbered grant if original remaining cap fits. Full native/provider/CAS/custody/Weft/old-store/carrier/table/mixed/installation gates remain OPEN; no signature scope/receipt/old-context widening.


### G11 concrete original native ROOT session and durable checkpoints014

This amendment adopts the following concrete native session/exclusion and ROOT
checkpoint design as requirements. It is not native execution evidence or a
claim that the original ingress-store and application-origin interfaces exist.
Existing010–013 ROOT/config/trust/context/ledger wires remain exact. New typed
native checkpoint events select only original supervisor-journal0.2; legacy0.1
history is never reinterpreted, upgraded or recreated. Source008339d's reviewed
pure validation/physical-context association does not supply actual native facts.

Precedence correction to native-session-interface001: the actual current ingress
store verifier's `_verify_relation` CREATES/DROPS reference tables. That method
MUST NOT run inside the effect-free ROOT observer. Implement a complete read-only
catalog/ACL/role/dependency census against original committed born descriptors
and identities. Creation-time descriptor DDL belongs only inside separately
approved physical store creation. Actual prepared head/correspondence read-only
steps are distinct from administrative verifier paths containing probe DDL;
freeze their exact dependency/source map and verify the executed SQL path.
ROLLBACK does not authorize DDL. No metadata observer runs arbitrary callbacks.

Full original SourceCohort/native evidence closed encoding, actual SQL/census/
deadline projections, concrete original committed INGRESS-store creator and
subject/schema ownership provider remain separate pre-code/enablement gates.
Ingress coordinator002 is a proposed next interface, not adopted here. It must
separately freeze its full born-object witness, dispatch/attempt/custody/COMMIT
receipt and execution-policy source definitions. No pre-DDL authority/schema OID/
marker, source-test issuer or hash of current flags substitutes for those origins.
New application bootstrap authority/profile/scope requires separate exact review;
existing physical scope2 and logical ROOT signatures do not authorize it.

All014 positive paths below require actual original native proofs. Missing
prerequisites refuse and keep full implementation/native acceptance OPEN; named
methods, unavailable stubs or pure helper tests do not qualify this design as
implemented. Active0.1 deployment upgrade, unknown restore/all-history rollback,
managed original continuity, full effect/barrier/epoch/installed/browser/platform/
CI/release qualification remain explicit backlog obligations.

#### Implementation sequence and concrete ownership

The original OwnerAuthoritySession is created/reattached before target exclusion.
Native LocalPostgresSupervisor owns fixed original target lease, actual owned
connection/driver deadlines/read-only observation, persisted original snapshot,
actual original enrollment resolution/trust association and immutable native
binding registry. Pure bootstrap/root transition leaves own canonical validation,
configured signatures and data-only transition plans. Upper generation authority
session orchestrates prepare/export/confirm/recover and joins actual logical core
with concrete native binding. Preserve exact alias/type/registry ownership and
no reverse native imports, generic registrars, caller SQL or callbacks.

Implement durable reserve and confirm mutation intent→exact ROOT replacement→
native confirmation→binding sequence. Replay retained deltas from original zero
state, require exact current state, and fence ALL target/control/ROOT/context
writers while any mutation intent is unresolved. Follow013 subordinate birth and
release-before-other-lock rules under SAME retained outer target exclusion.
Native history does not hash a future ROOT binding or itself. Original signing
wait is outside lease/transaction. Original signed snapshot stays immutable;
fresh confirmation observations prove legitimate actual current continuity.

Source-map every existing original physical/custody/store/epoch/root/context
writer to the same exclusion/pending fence, including second processes and
pre-registration original private control exclusion. No recursive fresh flock
or factory settlement under an already-held outer lease. Track/check original
process/thread/supervisor/target/inode/connection identity and release every FD,
transaction and connection on EVERY exception path. Use bounded actual remaining
native/driver/lock deadlines and persist original capacity before dispatch.

Freeze actual native snapshot private closed rows/SQL/source tuples, committed
ingress creation and application subject/schema origin interfaces before their
positive code paths are adopted. Code admission must include actual positive
native resolution/binding, not merely correctly refusing missing provider hooks.
Pure data-only plans may precede that integration but cannot issue capabilities.


### G11 original supervisor-journal birth/selection015

This amendment adopts the exact new ORIGINAL enrollment0.3/journal0.2 birth,
acyclic header/definition, private context metadata and explicit target request0.2
requirements below. Existing primary context0.3 member set, original six-scope
owner configuration/signing payload/domain, old enrollment0.1/0.2 and old actual
`umf.local-postgresql-supervisor-journal/0.1` bytes/behavior remain exact. NEW
`umf.local-postgresql-owner-journal/0.2` is a distinct literal, not an alias.
No active setup/header/old request is silently upgraded. No missing-file virtual
zero, O_CREAT lock fallback, caller flag/definition or arbitrary registry can
select or create this new original history after confirmation.

The fixed initial definition's ingressEvents/applicationEvents are null. This
means those capabilities are UNAVAILABLE, not accepted or qualified by null.
Full positive ROOT observation/store/application/managed/installed/release support
remains OPEN until actual approved complete interfaces/native evidence exist;
a future supported complete tuple requires its own fresh original enrollment.
The separate unadopted application bootstrap allocation now targets enrollment0.4
with separately reviewed ownerconfig/ledger/context variants. No seventh scope
is introduced here.

#### Concrete ownership and implementation

Bootstrap validates new exact original enrollment and required supervisor journal/
lock birth while SAME primary setup is pending, then confirms ONE original primary
only after owner ledger/ROOT/supervisor resources all verify. The confirmed path
only opens/checks existing original resources. Its opaque birth/context metadata
registries remain physical-bootstrap-owned and identity checked. Pure core consumes
fixed original private metadata bytes through the non-I/O accessor, never a native
callback/caller dictionary or missing-metadata default. Source fixtures explicitly
install genuine original file setup before issuing context; do not weaken asserts
or add a production sourceTest bypass to preserve their old monkeypatch helper.

A native-free exact supervisor journal codec below bootstrap/native owns closed
header/event/state/definition/anchor/canonical replay, with fixed pure ROOT leaf
consumption. Native file constructor/append/recover keeps actual IO/native
ownership; no reverse import or callback registrar. Preserve LocalPostgresError
class/aliases and old0.1 behavior; map codec-private failures explicitly. New
physicalEvents0.2 handles original target request0.2 creation-intent duplicates and
rejects old untyped store-intents on this new journal, requiring its admitted
original typed parent association. Complete current file history is validated;
its immutable birth projection is recomputed separately from mutable events.

Native target preparation obtains bootstrap's real confirmed birth under original
control lease, opens existing actual journal, builds exact request0.2 with actual
birth/context digests and signs through unchanged original scope1 intent binding.
Reserve/execute/recover keep actual same original IDs/signature/header/definition/
context. Pure current-state transition helpers alone do not provide any durable
write, original context, existing lock, actual process/custody or native authority.
Actual controlled target/stores/binding/checkpoints follow014 and independently
qualified original native lifecycle. Historical active-target upgrade is separate
required backlog work, not an automatic fallback or closure of the full goal.


### G10 implementation checkpoint 002: exact grant lowering

Adopt the complete schema-grant-subject001 definition in CONTRACT-081 governing G10 checkpoint002. The actual renderer emits closed private operation/subject tags; stripping them reproduces every historical public deployment step and bundle digest exactly. G10 consumes the typed tags and checks the full public projection. One combined schema-USAGE step maps to two source-derived catalog rows; original bootstrap and native privileges remain separately proved. Grant occurs in a required transaction before metadata-only publication; no ordinary client capability is activated early. No SQL parsing, ordinal guessing, generic grant executor or historical public-wire extension. This is a required design; source/native/browser/installed/release verification is outstanding.


### G10 implementation checkpoint003: fixed metadata paths

Adopt CONTRACT-081 governing checkpoint003 and the complete retained definition
`../../04-build/evidence/schema-migration-design-review/g10-fixed-metadata-paths-001.md`.
The compiler derives the three reserved diagnostic paths from their exact fixed
metadata operations. They are not authored source/options pointers or effect
authority. All original step/phase/prefix, denied approval and recovery semantics
remain required. Implementation and native acceptance remain open.


### G11 implementation checkpoint016: codec and native authority boundary

Adopt CONTRACT-081 checkpoint016 and the complete retained clarification
`../../04-build/evidence/schema-migration-design-review/g11-journal-family-codec-boundary-001.md`.
ROOT pure signed replay remains positive under its non-null family, with strict
canonical observation data and exact associations. ORIGINALS admits G04 typed
per-store reservations only; bare scope4 effects and ingress aliases refuse.
Actual native ROOT authority still requires genuine committed ingress origin,
complete closed snapshots and the separately adopted creator/provider grammar.
No known tuple, active enrollment, signature scope or native capability expands.


### G10 implementation checkpoint004: one local definition domain

Adopt CONTRACT-081 checkpoint004 and the complete retained definition
`../../04-build/evidence/schema-migration-design-review/g10-table-state-definition-digest-001.md`.
Derive the closed current table-definition preimage identically at initial and
installed index0 and after every indivisible phase, after catalog ordering.
It binds complete local catalog rows; full review/source meaning remains in
InventoryTable.meaningDigest and original plan/source bindings. Refuse absent
table leftovers. Remap creation/removal refs to the actual same-operation,
same-binding serialized step before prefix digesting. These are design rules,
not passing implementation/native/browser/installed/release evidence.

### G10 portable public API and review-value amendment002

Adopt the accepted marker addendum
`../../04-build/evidence/schema-migration-design-review/g10-review-marker-adoption-addendum-002.md`
(`d7b08f67c4945cbe285e0555ca92fff9acfaec859030b17707d7dc58f09eb278`) with
CONTRACT-081. The public browser module is `src/table-migration/inventory.ts`,
with explicit re-exports from `src/table-migration/index.ts`. The four calls are:

```ts
compileTableInventoryMigration(request: TableInventoryMigrationRequest): TableInventoryMigrationResult
discoverTableInventoryMigrationChanges(previous, next, selector, originalHistory): TableInventoryReviewedChangeCandidate[]
verifyTableInventoryMigration(plan, originalHistory): TableInventoryMigrationPlan
serializeTableInventoryMigration(plan, originalHistory): string
```

All calls receive the original history explicitly. Compilation returns exactly
`{status:'compiled',plan,diagnostics:[]}` or `{status:'blocked',diagnostics}`;
discovery and verification use the existing public error convention. Verification
recompiles the complete original before/after bundles, selector/options, and
history and compares the complete plan. Serialization returns the verified
RFC8785 JSON string without a final LF. It does not write files or grant native
authority.

`plan.review` keeps the Candidate wrapper. The accepted closed value union is:
TableReview P for create/remove/table-removal-effects, SeedReview for
retire-seed-history, and each original component candidate's complete original
value shape for existing markers. Initial create uses null oldValue and null
oldPath; an installed create uses the full absent-before TableReview P with null
oldPath. The marker remains exactly `{id,kind,path,oldDigest,newDigest}`. Seed
retirement retains its exact original definition and execution state on both
sides; it never asserts row replay.

The presentation adapter `irreversiblePurgeDisclosure(candidate)` maps each
table-removal-effects candidate, in candidate order, to the exact disclosure
code `IRREVERSIBLE_TABLE_PURGE`, its path/marker ID and the full stored-row and
column loss message specified by CONTRACT-081. Applications display this in the
approval view before collecting approval. No wire key, plan field or compiled
diagnostic is added for the presentation. All implementation, schema, browser,
native, installed and release checks remain separate evidence gates; no runtime
result is asserted by this design amendment.

## G10 inventory.2 R2 implementation adoption001

CONTRACT-081's R2 adoption001 and the exact
[source-freeze contract](../../04-build/evidence/schema-migration-design-review/g10-r2-review-source-freeze-001/local-constructors.md) now define the following
implementation work. These are named responsibilities to implement, not claims
that the modules, schema branches or runtime factories already exist. Preserve
legacy APIs/profiles/bytes and existing lower-level semantics.

| Order | Private module boundary | Concrete implementation result |
| --- | --- | --- |
| 1 | `src/table-migration/inventory-r2-comparison.ts` plus source/history helpers | `createR2ReviewContext`, `resolveWholeArchiveSource`, `resolveFieldArchiveSource`: one immutable full-input context, exact original materials/history, indexed complete correspondence and unknown-meaning coverage; no markerful discovery input or I/O. |
| 2 | Same comparison boundary | `compareWholeRestore`, `compareFieldRestore`, `compareOriginalCommandSubjects`: private context-owned whole/Field/coverage certificates, explicit stored-set exception, actual per-ID two-pass commands and full contexts. Handles cannot cross contexts or certify filtered/fabricated sources. |
| 3 | `src/table-migration/inventory-r2-review.ts` | `constructTableReviewPair`, `constructRestoredTableCompanions`, `constructLineageFieldPair`, `constructFieldArchiveCompanions`, `collectR2Review`: exact closed value branches, full paths, deterministic ordered global C and internal once-only claim map. Keep original same-carrier G05 constructors and immutable old review outputs. |
| 4 | Inventory compiler admission | `bindR2CompilerSelections`: rederive the same C, validate exact markerful options/effects references/every-only A/B/C defaults before lowering. Derive genuine local claims for original G02/G03/G05 validators; never feed global C through a legacy component validator. |
| 5 | Existing component lowering | `lowerR2ReviewedComponents`: typed effects/DAG/prefixes with the required joint restoration group and one actual default/grant/value effect. Reuse qualified local constructors rather than parsing SQL, accepting public effects or assigning target prefixes. |
| 6 | Explicit public dispatch and schema assets | Implement exact .2 closed type/schema branches and compiler/discovery/verify/serialize dispatch. Export only agreed public types/functions, never private handles/certificates/claim builders or injection hooks. Verify recompiles exact original sources/history; serialize returns those verified canonical bytes. |

Each stage performs incremental count/byte/node/depth/work admission before
expansion, with shared-input interning only for exact original bytes and context.
Use the additive 1,000,000 work/99,999 subject ceilings alongside all original
limits; freeze concrete charge events and units with actual implementation before
tests can claim resource qualification. Final complete canonical plan, including
review and digest, remains bounded at24MiB. No count check only after constructing
or hashing an unbounded candidate. Public failures preserve useful located safe
UmfError diagnostics without leaking private material or authority.

The portable import closure stays synchronous and browser compatible; it has no
Bun/Node/fs/PG/native/Weft runtime dependency, callback verifier, dynamic effect
registrar or SQL parser. Weft owns qualified scalar/population lowering and
immutable programs. The fixed host/backend owns native sessions, original live
values, custody, transactions, outcomes, clocks, holds and fences. Native
capability is never inferred from a portable certificate or plan flag.

Implementation owner applies this three-document patch and adopts the exact
289-member source-freeze cohort without rewriting its original bytes. Preserve
provider/metadata descriptor digest files and historical pins. Then freeze the
actual source/schema/import closure and package assets as a separate candidate
for source review, Bun/compiler/schema/browser controls, independent native and
installed evidence, consumers and release correspondence in that order. Design
adoption alone passes none of those gates. No product runtime was run by this
review lane for this adoption.

## R2 raw own-key implementation boundary amendment001

Implement CONTRACT-081's exact raw-boundary proposal and
[event definitions](../../04-build/evidence/schema-migration-design-review/g10-r2-raw-admission-boundary-amendment-001/event-table.json) after independent source acceptance.
In actual R2 source admission/copy kernels, replace batch symbols/descriptors/key
arrays with ONE captured Reflect.ownKeys per raw unowned-node admission, immediate
checked exact-count charge, then charged one-key getOwnPropertyDescriptor calls.
Retain original primitive/prototype/depth/number/dense-array/hidden/symbol/accessor
refusals and all limits. Overflow creates no admitted partial context and avoids
descriptor/value/owned-copy processing; diagnostics stay safe at the container.

Record exact private shape/key-order/count metadata while owning nodes. Accounted
JSON/parser/copy/structural/projection/render/history kernels use only that
root-owned metadata to admit later known extents before growth. No caller-shaped
owned flag, global identity/digest cache, exported shape/history reader or
unchecked prepared port. The raw native reflection exception is explicit and
cannot be reused by an already-owned graph. It grants neither native authority
nor a total-attempt heap/time bound. Implementation owner supplies actual event
coverage and safe controls for independent source and later runtime review;
unintegrated checkCore/history kernels continue located refusal.
