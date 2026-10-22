---
ddx:
  id: umf.plan.schema-migrations
  type: implementation-plan
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-007
      kind: informed_by
    - id: US-051
      kind: informed_by
    - id: SD-007
      kind: informed_by
    - id: CONTRACT-046
      kind: references
    - id: CONTRACT-081
      kind: references
    - id: TP-001
      kind: informed_by
---

# Field schema migration build plan

## Scope

Owner request, 2026-10-21: plan additions, requiredness with defaults/backfills,
removals and type changes, with explicit UMF/backend ownership. This is a design
and delivery proposal for the broader design; the bounded implementation checkpoint
below records separately authorized work and does not establish full delivery.

Governing artifacts: PRD FR-18/19, FEAT-007 COMP-06–11, US-051-AC11–16,
SD-007, architecture, CONTRACT-046/049/081, ADR-002 and TP-001. Catalog: installed
HELIX 0.18.0. Existing CONTRACT-058 is a separate historical preservation checker.

The first proposed executable target is current-core, single-document direct
PostgreSQL. Exact before/after bytes and existing deployment digests avoid a new
core revision member. Cross-document work still depends on US-050/CONTRACT-045.
Full delivery of the four operations is required for the first selected native
profile; other backends get explicit capability refusal until independently
qualified. Online and maintenance-window modes are distinct capabilities.

## Shared Constraints

### Existing implementation ownership and overlap

Inspection on 2026-10-21 of the active chat **Plan UMF and Weft Praxis asks**
found an independently authorized U1–U3 implementation through review, merge and
release. The owner selected that chat to write code and this chat to review and
finalize migration design. Its CONTRACT-081 successor and Praxis roadmap own the
native table implementation. Consume that work and qualify remaining gaps;
do not start a second implementation or redefine its versioned interfaces.

| Existing work | Observed scope | Relationship to this plan |
| --- | --- | --- |
| Bounded lifecycle candidate | Evidence packet reports required appended columns, literal/transaction-clock backfills, later default/NOT NULL installation, added checks/FKs and index-only concurrent recovery | Reuse for MIG-03; qualify exact accepted artifacts |
| U1, bounded local acceptance | Mixed transactional/concurrent phases, explicit validation, durable progress, fencing and recovery without replaying committed data effects | Owns native phase execution portions of MIG-04/07 |
| U2, bounded local acceptance | Source-bound reviewed markers; drop/rename, nullability, finite type conversions and constraint/Key/policy dependency changes | Owns bounded native portions of MIG-05/06 |
| U3, bounded local acceptance | row_scope normalization into canonical policies | Related authoring/security work, not a new migration engine |

The [accepted candidate packet](evidence/praxis-u123-adoption/README.md) now records
local source/evidence acceptance of U1–U3 against SDK 0.5.4, access dev6 and codegen
a3. It does not establish release publication or managed consumer adoption.
Bounded backfill and finite conversions do not establish arbitrary per-row
transforms, online chunked rewrites, recoverable retirement windows or
non-PostgreSQL execution. Assess those against MIG-G01–G11 before assigning
residual implementation; do not duplicate the accepted native state machine.

### Invariants

- Preserve original sources, stable IDs, unknown/native content and explicit
  losses. Source history cannot recover deleted instance values by itself.
- Portable planning stays offline and browser-compatible; host execution owns
  connections, credentials, scans, locks, rewriting, approvals and durable state.
- Keep historical backfill, logical defaults and future-write defaults separate.
  Validate complete target constraints and protect concurrent writes at activation.
- Build on CONTRACT-081 deployment/history and Weft lowering where applicable.
  Do not create a competing migration ledger or general transformation engine.
- Exact wire/API shapes, version assignments and limits require the first design
  slice. New schema-shaped content follows ADR-005/CONTRACT-080 authority where
  applicable; no hand-maintained duplicate core model is introduced.
- No automatic cascade, guessed conversion, semantic compatibility from a native
  cast, or automatic data rollback after irreversible effects.

## Implementation Slices

| Slice | Scope / governing artifacts | Depends on | Validation gate |
| --- | --- | --- | --- |
| MIG-00 | Reconcile U1/U2 interfaces/evidence and US-050 status; map remaining SD-007 obligations to CONTRACT-081/TD-085/STP-085 before authoring missing portable contracts or TD-051/STP-051 | Accepted native inventory for overlap closure | Independent design review; AC11–16 allocation; concrete Person fixtures; version/bounds decisions; no duplicate state machine |
| MIG-01 | Map planner/compiler/host boundaries and adopt checker coverage before feature code; architecture, ADR-002, NFR-50 | MIG-00 | Extend existing boundary commands or add one documented migration boundary command wired identically locally/pre-commit/CI; allowed/private/host-import negative controls pass |
| MIG-02 | Portable stable-ID comparison, dependency closure, authored intent, capabilities, plan compilation and verification; CONTRACT-046 scoped rules, new contract | MIG-01 | Bun/Chromium deterministic plans, tamper/drift/unknown controls, resource exhaustion; no database access; unsupported operations retain whole intent |
| MIG-03 | Add optional Fields; future-write default changes; atomic required additions/tightening with fail-if-any or literal fill; CONTRACT-049/081 | MIG-02 | PG18 exact-source populated/empty Person migrations, explicit null/missing distinction, concurrent violations blocked, target constraints verified; default alone cannot pass backfill gate |
| MIG-04 | Staged resumable backfill with approved versioned transform, writer protection, full validation and activation | MIG-03 | Stable-key/version checkpoints; insert/update/delete races; cancellation, restart and duplicate retry; no lost user edits; whole-data acceptance without an unprotected activation gap |
| MIG-05 | Drop planning/execution with dependency changes, retirement, retained values and separate approved purge | MIG-03; MIG-04 for staged mode | Referenced field refuses until companion steps resolve; no implicit cascade; stale clients refused; restore retained data; purge honestly irreversible |
| MIG-06 | Type changes using qualified preservation rules or explicit conversion; shadow representation and binding cutover where needed | MIG-04 | Date/string/timestamp and exact numeric boundary corpus; invalid values, loss, key collisions and dependency changes; target validation; recover retained originals |
| MIG-07 | Installed Python/native integration, generated client/catalog/cursor cutover, durable history/outcome recovery and managed environment qualification | MIG-04/05/06 | Actual installed cohort; competing migrators, schema drift, edited approvals, privilege changes, lost commit response, nontransactional interruption and failure at every phase |
| MIG-08 | Shared conformance profiles for Truss, Ashlar and subsequent storage targets; docs/reference and release | MIG-07; each backend's authority prerequisites | Same Person intent yields correct backend plan/refusal; real mutable graph and immutable publication evidence; release inventory lists qualified operations/modes/versions |

MIG-00 is bounded design work. Later slices are not implementation-ready until
its contract, TD and story-test gates pass. MIG-03 may initially offer a
maintenance window; online mode is claimed only after MIG-04's concurrency proof.
MIG-08 can release individual backend profiles independently, without claiming
unimplemented cross-backend execution or atomic coordination.
For overlapping slices, validate/adopt the U1/U2 result first and implement only
requirements absent from its accepted profile. U1 phase recovery alone does not
prove online chunked-backfill correctness; a reviewed U2 drop alone does not
prove retained instance-value recovery.

## Validation Plan

TP-001 owns the project migration acceptance matrix. Reuse STP-085's U1/U2 native
cases and allocate G01 in that existing suite. Allocate later uncovered
US-051-AC11–16 criteria in STP-051 only where needed before their implementation.
Do not duplicate native primary tests.

| Family | Required proof |
| --- | --- |
| Portable | Exact source identity, deterministic plan, relevant dependency closure, unknown retention/refusal, forged receipt/approval/capability refusal, bounds, Bun/Chromium parity |
| Add/require | Empty/populated Person; optional date; required add and tightening; literal fill; per-row derived fill; present values retained; future default versus historical fill; invalid default rejected |
| Drop | Dependencies in keys/FKs/indexes/checks/policies/actions/catalogs/clients; unknown consumer coverage; retention restore; immediate purge explicitly approved; history not advertised as data recovery |
| Type | Proven widening versus physical changes; narrowing overflow; string/date invalid values; date/timestamp timezone choice; exact decimals; uniqueness/FK collisions; explicit quarantine/loss accounting |
| Concurrency | Old/new writers, writes during chunks, deletes/reinserts, competing migrators, final-check/cutover race, mixed-generation clients and held transactions |
| Recovery/security | Fault at each phase, cancellation, uncertain commit, idempotent resume, failed reverse conversion, drift, changed permissions, native policy bypass attempts, private reject storage |
| Backend conformance | Transactional table, staged table, mutable graph, immutable publication; native catalog/data assertions and backend-specific refusal; target-bound evidence |

Run focused affected tests, strict type checks, boundary controls and portable
browser checks, then one final integrated native replay against exact installed
artifacts. Re-run only when changed inputs or failures justify it. Historical
green evidence is context, not proof for the new profiles.

## Execution Contract

Planning is authorized. Implementation and production migration application are
separate actions. No source changes, database migrations, releases or native
administrative effects are authorized by this plan. A host administrator approves
each concrete target-bound plan and its destructive/loss effects before execution.

Token range and usage basis: unknown; no comparable complete four-operation
migration implementation measurement was supplied. Total spending ceiling: not
set. Do not start a budgeted run or invent a numerical estimate. Record observed
slice costs and agree a ceiling if budgeted execution is requested. Runtime
metering/enforcement availability must be stated at that time.

## Continuation Evidence

Planning baseline: requirements, solution design, project test gates and this
sequence were recorded separately from the native implementation workstream.
The 2026-10-21 [U1–U3 packet](evidence/praxis-u123-adoption/README.md) reconciles its
accepted existing-table maintenance profile. Installed native receipts cover
mixed execution (21 checks, independently replayed), reviewed operations (128
assertions across 14 native cases plus two compiler refusal cases), legal
lifecycle (42) and owner+via authorization (10). Portable affected tests pass
55 tests (282 assertions); Chromium passes 91 assertions; SDK installation conformance
passes 139 checks. Exact package/source custody and published 0.5.3 historical
initial/additive verification/replay are retained. Counts overlap across suites.

This closes the bounded review findings below, not the full MIG-03–08 slices or
US-051-AC11–16. Next actions are hosted CI/publication and actual consumer
qualification for the selected profile, then owner selection of residual design
work. Do not discover or create tracker work without selection.

## Design review and remaining migration gaps

The owner requires ongoing collaboration until the selected implementation passes
independent design review and native verification. The U1–U3 implementation
workstream owns code, integrated native evidence and status updates. Migration
design reviewers own acceptance against this matrix. A passing bounded release does not close unsupported
full-lifecycle requirements. Do not remove or renumber entries when changing
status; link their eventual source-bound evidence and owning slice instead.

### Active verification blockers

Snapshot: source/evidence review completed on 2026-10-21 against the retained
installed candidate cohort. **Approved for the recorded local PostgreSQL 18.6
maintenance profile.** Each closed finding below is bounded by CONTRACT-081,
TD-085/STP-085 and the [candidate packet](evidence/praxis-u123-adoption/README.md).
Hosted CI, publication and actual managed consumer acceptance remain separate.

| ID | Status | Finding / required acceptance | Owner / allocation | Closure evidence |
| --- | --- | --- | --- | --- |
| MIG-R01 | Closed, bounded profile | Canonical typed Field-reference dependency matching, old/new disposition and ordered policy/dependency changes precede destructive native effects. Markers cannot bypass unsupported dependencies. | U2 compiler; MIG-05/06 | Current-source review, affected portable corpus and reviewed A/D receipts: policy rewrite before purge, unchanged native dependency refusal and inbound Key refusal; exact source hashes retained |
| MIG-R02 | Closed, bounded profile | Applied mixed replay binds the original file digest and predecessor head; changed inputs refuse without replaying effects. | U1 host; MIG-07 | Installed mixed receipt: resumed file binding, applied wrong-file/wrong-head refusals and correct historical replay |
| MIG-R03 | Closed, bounded profile | Complete relevant native boundary is checked under required app locks before resumed effects, including triggers, trusted role attributes and schema ACLs. | U1 host; MIG-04/07 | Installed mixed receipt: phase/prefix tamper, trigger, ACL, BYPASSRLS and external-authority drift refuse with zero backfill effects and continued fencing |
| MIG-R04 | Closed, bounded profile | One plan combines backfill, NOT VALID/VALIDATE, concurrent indexes and seeds; committed effects are observed without replay, with explicit invalid-index repair and atomic final publication. | U1 host; MIG-04/07 | Installed mixed 21-check receipt and independent 21-check replay; progress removed, ordinary history/catalog and final person read pass |
| MIG-R05 | Closed, bounded profile | Native qualification covers advertised column purge/rename, nullability, finite widening, CHECK/FK/index/Key/policy changes and selected refusals; unsupported compounds remain blocked. | U2 compiler and native harness; MIG-03/05/06 | Installed reviewed A/B/C/D: 28/27/40/33 assertions, 14 native cases plus two compiler refusal cases; actual-data failure rollback, second-session NOT NULL lock/write controls, preserved unrelated constraints, source-bound markers and final native catalogs |
| MIG-R06 | Closed, bounded profile | Exact installed generator/runtime source and embedded assets correspond to portable/browser/native evidence; historical verification/replay does not authorize fresh unreviewed effects. | Integration/release owner; MIG-07 | Wheel/source/RECORD audit, 55 affected tests/282 assertions, Chromium 91 assertions, SDK install 139 checks, installed native receipts and actual published 0.5.3 initial/additive oracle with fresh legacy policy-effect refusal |

All four retained reviewed fixture/report hash closures and final C critical
source/asset hashes were independently checked. A/B/D retain their original
reports and builder hashes: the complete selected fixture bytes are identical
under the final builder, documented in `fixture-equivalence.json`. C changed and
was rerun against its final fixture. This custody qualification does not relabel
old reports as newly executed runs. The earlier frozen candidate policy fixture
and the actual published 0.5.3 oracle retain distinct provenance.

### Explicit capability residuals

These are full-design gaps retained beyond the selected maintenance-window
PostgreSQL U1/U2 profile. They are neither successful execution nor evidence of
native support. A release inventory must state the exact refusal/limit, including
whether refusal occurs in planning or requires unqualified host capability.

| ID | Current boundary / remaining requirement | Owning follow-up | Verification needed to close |
| --- | --- | --- | --- |
| MIG-G01 | Implemented and independently qualified for the recorded PostgreSQL maintenance subset: one unchanged-identity/type/default optional Field, finite explicit NULL-only literal or qualified transaction-clock fill and reviewed NOT NULL in one standalone required transaction. Broader transforms, online execution and composition remain unsupported. | MIG-03/04; table migration maintainer; [installed design/native signoff](evidence/schema-migration-design-review/g01-review.json) | Frozen source `435ed5844`, exact dev7/a4 wheels: thirteen installed native scenarios, nine supplemental checks, actual constraint/bound SQLSTATEs, writer locking, unchanged future defaults and no-repeat recovery; scope and hashes in the signoff |
| MIG-G02 | Arbitrary per-row derived backfills are unsupported. Current bounded assignments use literals or the selected transaction clock; a trusted transform protocol and versioned semantics remain to be designed. | MIG-00/04; UMF intent, Weft lowering and host transform owners | Exact transform identity, typed input/output, invalid-value disposition, effect bounds and no repeat/non-idempotent work |
| MIG-G03 | General future-default changes on existing columns are outside the selected subset. Appended-column default installation after fill does not imply SET/DROP/default-expression lifecycle support. | MIG-03; table compiler/host | Default change/removal, omitted versus explicit-null writes, old-row nonmutation and exact native correspondence |
| MIG-G04 | General narrowing, cross-family conversions and shadow representation rewrites are unsupported; finite proven widening is the selected type-change subset. | MIG-06; backend conversion owner | Date/string/timestamp format/timezone decisions, overflow/rounding/loss policy, target keys/references and retained-original recovery |
| MIG-G05 | Retained-value retirement windows and reversible physical deletion are not implemented. Reviewed immediate column purge must explicitly disclose irreversibility; metadata history is not a data backup. | MIG-05; host retention/purge owner | Access retirement, approved retention/backup policy, restore with post-cutover writes and separately authorized final purge |
| MIG-G06 | Online chunked backfill/rewrite with concurrent application writes is unqualified. Fenced maintenance execution and durable phase resume do not imply online row reconciliation. | MIG-04/07; execution host | Stable-key/version chunking, concurrent insert/update/delete/reinsert, no lost edits, cancellation and gap-free activation |
| MIG-G07 | Cross-document schema migration and coordinated multi-store execution are not delivered by single-document deployment digests. | US-050/CONTRACT-045 then MIG-02/08 | Exact revision/dependency closure, unknown extensions, source/target identity and explicit cross-store recovery without assumed distributed atomicity |
| MIG-G08 | Truss, Ashlar and other storage backends lack qualification for this shared migration design. Mutable admission and immutable new-publication semantics remain backend-owned. | MIG-08; each backend owner | Same Person intent with genuine graph/table/file effects, backend-specific refusals and publication/journal recovery |
| MIG-G09 | Actual managed Lakebase/Praxis consumer migration acceptance is unverified. Local PostgreSQL evidence and installed wheels do not establish managed privileges, platform limits or adoption. | MIG-07; integration and consumer owners | Dedicated managed target and actual consumer schema/workload replay on frozen installed artifacts |
| MIG-G10 | Mixed v0.2 table-inventory changes and v0.2 initial deployment are outside the selected existing-table evolution profile. Use the qualified v0.1 bootstrap/additive-table route separately; do not imply one mixed plan can create tables and evolve existing ones. | MIG-02/07; table compiler/host | Explicit portable refusal of unsupported v0.2 shapes, preserved exact v0.1 bootstrap/add-table behavior, then a separately designed prefix-inventory execution profile before expansion |
| MIG-G11 | Dropping and appending columns in one existing-table migration is explicitly unsupported and must refuse before plan emission, including equal-count replacement. Do not infer atomic combined support from separate drop/add capabilities. | MIG-02/05; stable-ID dependency scheduling owner | Stable-ID additions/removals and complete ordered effects; same/different counts, denied UPDATE and dependent policies; separately approved migrations only where each intermediate schema/data state is valid and independently qualified |

Do not invent dates or erase residuals to close the bounded release. Each owner
must select and design its next slice before advertising the corresponding
capability. A change that was explicitly refused becomes supported only after
its native and portable acceptance gates pass for the declared version/subset.

## Remaining-gap delivery order

Owner selection, 2026-10-21: design closure of the residuals, starting MIG-G01.
This section supersedes the earlier unselected-residual next action. Every G01–G11
entry remains open until its own evidence gate passes. The selected sequence
refines MIG-00–08 and adopts the accepted U1/U2 runner, not another implementation.
The first successor is governed by SD-007's existing optional-field design.

Design and acceptance review stay in **Explain UMF schema migrations**;
**Plan UMF and Weft Praxis asks** owns product code, contract integration and
installed/native qualification. The current frozen release proceeds separately.
The owner subsequently authorized implementation, merge and another release
through the [embedder completion plan](praxis-embedder-completion-plan.md). That
plan selects G01 and managed-consumer qualification; subsequent residual waves
below remain separately selected scope. Do not infer release numbers or dates.

Implementation-owner feasibility review, 2026-10-21: the existing required-phase
runner executes typed backfill and DDL steps in one installation transaction,
then captures the native witness. The paired design fits that mechanism.
Successor compiler grouping, phase validation/prefix projection and bounded
existing-column admission still require implementation. Held/direct-writer native
proof remains mandatory. The implementation owner will integrate the focused
three-document design patch after the current release; no product implementation
was started by this planning exchange.

Readiness review against released 0.5.4: the compiler currently emits existing
tightening before the backfill loop and separately emits appended-fill default/
requiredness steps. The successor must consume each selected tightening exactly
once after its fill without changing the existing default. Its closed ordered
pair must be recognized by portable phase generation, embedded verification and
the host phase validator, which currently accepts only isolated backfill steps.
Bind pairing by typed table/Field identity and reviewed source paths, not SQL
text. Reject swapped, missing, duplicate, extra or partially receipted steps.
Native catalog witnesses detect schema drift; independent row assertions remain
necessary to prove fill correctness and present-value preservation. These are
implementation entry constraints, not evidence that G01 has been implemented.

### G01 first: existing-column fill and tightening

| Slice | Work / owner | Gate before proceeding |
| --- | --- | --- |
| G01-A | Design owner and implementation owner reconcile SD-007 with CONTRACT-081/TD-085/STP-085; specify distinct successor profile, closed wire shapes, diagnostics and unchanged historical profiles | Exact next-source command selection, same-ID/type target, explicit scope/effect bound, one locked transaction for fill+tighten and committed-pair recovery agreed; native/browser matrix allocated to existing primary suites |
| G01-B | Implementation owner extends portable discovery/selection/validation and ordered step generation; reuse existing boundary checker before feature edits | A complete plan or path-bearing refusal for every input; exact source/command/review-marker binding; deterministic Bun/Chromium/embedded-Python output; no host imports or unsupported combinations |
| G01-C | Implementation owner extends existing host phase admission/witnesses only where needed | Null-only bounded Weft UPDATE and native complete-table NOT NULL enforcement in one required phase; atomic effect/constraint/progress, authority/RLS restoration, old/new client fencing, no committed-effect replay |
| G01-D | Implementation owner produces exact installed native receipts; design owner independently reviews/replays | All cases below pass on the declared PostgreSQL/driver/package cohort; public discovery/docs and support inventory agree; G01 closes only for that subset |

No dependency on G02 arbitrary transforms, G03 future-default mutation or G06
online chunking is introduced. First qualify the selected field's fill+tighten
journey. Then qualify composition with the already supported concurrent-index,
constraint-validation and seed phases, or return an explicit compiler refusal
for an unsupported combination. No compiler may emit a partial runnable plan.

| Case family | Required acceptance (US-051-AC12/15/16) |
| --- | --- |
| Population | Empty table; all-null, mixed and already-populated birthdays. Exact date literal fills only NULL; present dates and unrelated columns/rows survive. Zero matches succeeds without fabricating changes. |
| Intent and values | No selected fill retains fail-if-any-null behavior. Missing/changed/unused marker, wrong Field/table/command, duplicate selection, extra assignment, wrong predicate and nullable/invalid value refuse. Clock allowed only in its admitted domain; date coercion refuses. |
| Defaults | Historical fill without future default succeeds; omitted and explicit-NULL future writes follow unchanged target semantics. Existing future default alone cannot satisfy tightening while nulls remain. Same-plan default mutation refuses in G01. |
| Data constraints | Effect bound exceeded, duplicate fill violating a Key, CHECK/FK rejection and invalid target data roll back the uncommitted phase and its progress. No constraint/RLS bypass leaks into normal clients. |
| Writers and privacy | Two-session probes cover active and held writers, ordinary old/new clients and direct granted writers scheduled immediately after UPDATE. There is no commit/lock release between fill and tightening. After that phase commits, native NOT NULL rejects null writes even before final publication. Unrelated scopes are filled only under explicit administrative acknowledgement; reports contain counts, not birthday values. |
| Recovery | Fault/cancellation before and after each commit; failure between fill and tightening rolls back both; lost paired-phase/final response; exact resume after committed pair with no repeat UPDATE or clock evaluation. A later failure retains committed fill+constraint and fencing. Wrong file/head/plan, altered command/marker, native drift or privilege tamper refuses before new effects. |
| Compatibility | Existing append fill and no-fill tightening still pass. Actual frozen historical 0.1/0.2 artifacts verify/replay; they cannot select new existing-column effects. Current successor refuses unsupported initial/table-inventory, drop+append, rename/type/default compounds. |
| Composition and delivery | Accepted mixed phases retain complete prefix witnesses, constraint validation, explicit index recovery and final native catalog/client admission. Browser parity and wheel/source/embedded-asset hashes correspond to the same installed native cohort. |

Primary native tests stay in STP-085's existing lifecycle harness; portable
selectors/plans stay in its compiler/browser corpus. TP-001 owns the cross-cutting
acceptance layers. CONTRACT-081/TD-085/STP-085 amendments are an entry gate,
not deferred documentation after code. No duplicate TD-051/STP-051 framework is
required for G01; later general portable surfaces get only missing allocations.

### Subsequent residuals

These are proposed bounded delivery waves. Each needs its own concrete technical
and test design before implementation; the entire matrix is not one release.

| Order / gaps | Smallest next deliverable | Dependency and closure gate |
| --- | --- | --- |
| 2 / G03 | Existing-column SET/DROP future default with a finite typed expression subset, independent of historical fill | Reuse G01 source/profile discipline; prove old rows unchanged and omitted versus explicit-NULL writes; exact native expression/catalog correspondence. Derived expressions require explicit capability admission. |
| 3 / G11 then G10 | Stable-ID add/remove scheduling, then phase-aware table inventory and initial publication | First prove equal/unequal-count column replacements with complete dependency ordering. Separately model absent/new/existing table states, locks/grants, phase witnesses and bootstrap recovery. Preserve qualified legacy bootstrap. Neither gap depends on arbitrary transforms. |
| 4 / G02 | Typed, deterministic per-row expressions first; external trusted versioned transforms only through a separately designed host protocol | Specify inputs/output, null handling, clock/locale semantics, identity, bounded effects and invalid-row policy. Weft owns admitted expression SQL. A callback or SQL string in schema metadata cannot acquire execution authority. Existing maintenance mode is sufficient for the first slice. |
| 5 / G04 and G05 | Maintenance-mode explicit conversions with retained originals, plus logical retirement and a separately approved purge | Share a host-owned retained-data/recovery design. Freeze conversion grammar and date/timezone/rounding/error policy per conversion. Prove complete target keys/references, retained value custody, restore with later writes or honest forward repair. G05 may proceed independently for plain retirement; G04 need not wait for online mode. |
| 6 / G06 | Online chunked backfill/rewrite as its own host capability | Depends on typed transform/conversion semantics and stable row identity/version. Design writer reconciliation, insert/update/delete/reinsert handling, checkpoints, cancellation and gap-free final activation; prove no lost edits with genuine concurrent clients. Durable phases alone do not pass. |
| Independent qualification / G09 | Actual Lakebase/Praxis managed acceptance for each selected operation | Can start on the accepted baseline without waiting for G02–G06. Requires a selected consumer owner, authorized isolated managed target, exact package/permission/platform cohort and actual workload. Unavailable target remains an explicit blocker. |
| Backend track / G08 | One backend at a time: genuine mutable Truss transition or immutable Ashlar publication, then selected table/file targets | Adopt shared intent/conformance; each backend owns native admission, physical strategy and recovery. Priority and host-owner commitment remain open; do not infer transactional table behavior for immutable publications. |
| Coordination track / G07 | Verified cross-document pins/closure, then coordinated multi-store plans | US-050/CONTRACT-045 precede cross-document effects. After selected backend qualification, specify per-store outcomes/compensation and partial failure. Never advertise distributed atomicity without a qualified protocol. |

G04/G05 share retained-data requirements, but neither general retirement nor a
finite maintenance conversion must wait for every arbitrary-transform capability.
G08 and G09 are separately selectable qualification tracks. G07 coordination
depends on the actual participating backend profiles, not all future backends.
The remaining choices are external-transform packaging, retention/purge policy,
online writer protocol, managed target and backend priority. Record each when its
wave is selected; these choices do not block the finite G01 design.

## Risks and Rollbacks

| Risk | Response | Recovery |
| --- | --- | --- |
| New format interpreted under old semantics | New closed profile and explicit version admission | Preserve original intent/source; reject unsupported profile |
| Backfill overwrites concurrent updates | Versioned rows or qualified equivalent; protected writers | Idempotent conditional replay or abort staged candidate |
| Cutover after incomplete checks | Complete native target validation under write guards | No target publication; atomic rollback or fenced staged forward repair |
| Drop/type change loses data | Retain source values or verified backup; explicit loss approval | Restore only when data and post-cutover writes permit; otherwise forward repair |
| Private birthday/reject values leak | Host-controlled storage; summary counts in receipts | Restrict capture and retention; test diagnostics for raw values |
| Backend cannot meet online/atomic promise | Capability-specific mode/refusal | Qualified maintenance window or separately approved staged plan |

## Exit Criteria

Plan readiness: ownership, operation semantics, dependency order and verification
gates are recorded. G01-A's exact successor interfaces and CONTRACT-081/TD-085/
STP-085 amendments remain its implementation entry gate; subsequent waves retain
MIG-00's design gate. Product code belongs to the collaborating implementation
chat. Dates, managed test target, retention policy and additional backend
priorities are uncommitted.

Execution completion requires all four operations on the selected PostgreSQL
profile, including staged backfill and honest recovery; portable/browser and
installed-native gates; source-bound approval/outcome verification; generated
client cutover; public documentation and independent review. Each later backend
receives a separate operation/mode/version qualification. No completion statement
may imply atomicity, online operation or reversibility outside that evidence.
