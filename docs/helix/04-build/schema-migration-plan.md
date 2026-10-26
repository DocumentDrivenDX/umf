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
| MIG-G10 | Mixed v0.2/v0.3 table-inventory changes and initial deployment are outside the selected existing-table evolution profiles. The separately qualified v0.1 bootstrap/add-table route does not imply a downgrade path from persistent-approval metadata or one mixed plan that creates tables and evolves existing ones. G02 does not rewrite retained create commands: a required appended Field without a default requires those commands already to supply it, or ordinary admission refuses with `TABLES_OPERATION_REQUIRED`. | MIG-02/07; table compiler/host | Explicit portable refusal of unsupported v0.2/v0.3 shapes, preserved exact v0.1 bootstrap/add-table behavior, then a separately designed prefix-inventory execution profile before expansion |
| MIG-G11 | Dropping and appending columns in one existing-table migration is explicitly unsupported and must refuse before plan emission, including equal-count replacement. G02 does not rewrite retained commands to bridge such replacement; combined command evolution around a derived append/drop remains separately scoped. Do not infer atomic combined support from separate drop/add capabilities. | MIG-02/05; stable-ID dependency scheduling owner | Stable-ID additions/removals and complete ordered effects; same/different counts, denied UPDATE and dependent policies; separately approved migrations only where each intermediate schema/data state is valid and independently qualified |

Do not invent dates or erase residuals to close the bounded release. Each owner
must select and design its next slice before advertising the corresponding
capability. A change that was explicitly refused becomes supported only after
its native and portable acceptance gates pass for the declared version/subset.

## Backlog execution selection — 2026-10-23

The human explicitly selected **all remaining MIG-G02–G11** through planning,
implementation, test, design review, independent native verification and release.
G02 is next. This selection supersedes the older proposed ordering below, while
preserving that historical record and the qualified G01/0.5.5 evidence. The active
umbrella goal stays open after the G02 release until the remaining entries pass
their own closure gates or a concrete external prerequisite is explicitly tracked.
Unavailability of a target is not evidence that its gap is closed.

**UMF/Weft — migration implementation and releases** owns the consolidated
implementation, integrated contracts, tests, independent Sol review, merge and
release. **Stack — integration and release coordination** coordinates the other
surviving **UMF — Rust port and V8 removal** and **Arras — release and Truss
installer** workstreams. These names supersede the earlier split design and
implementation chat names. This plan does not authorize changes to Praxis.
No successor release version/date or managed target is assumed.

The [2026-10-25 combined source evidence](evidence/schema-migration-design-review/combined-integration-source-2026-10-25/manifest.json)
records actual integrated G02/G03 native fixture sources and the accepted R2
context/accounting source at `45b41b42db2bea6895ea7adda6afba8b6e91825d`.
The dedicated hosted qualification at `880f1e53032e7e46752c9767865fb03e246c959c`
remains pending; its portable/typecheck/Bun/Chromium scope does not qualify native
campaigns or public inventory 0.2. G04 recovery implementation remains unreviewed
and unrun. Its owner decisions preserve immutable original signed evidence,
truthful current read-only observations, a separate 30-second observational
window with zero DDL, and the original creation window of 30 seconds/two attempts.
Weft's retained full selected Rust run compiled and recorded 54 passing/four
failing tests; it supplies no Python/WASM/native acceptance. All release gates
above remain open until their actual evidence and publication are complete.

### G02 selected delivery gates

The governing design is [SD-007's G02 section](../02-design/solution-designs/SD-007-schema-migrations.md#mig-g02--typed-same-row-backfills-selected-2026-10-23).
The selected finite typed algebra closes a useful declared profile, not arbitrary
user code. Broader expression families stay explicitly unsupported; no generic
trusted callback claim may be inferred.

| Gate | Implementation owner deliverable | Independent acceptance / exit |
| --- | --- | --- |
| G02-D1 interfaces | Amend CONTRACT-081, TD-085 and STP-085: closed operation 0.2 AST, options/plan 0.4, Weft program 0.2 guard descriptor, exact source/reference/approval/runtime admission and two atomic phase correspondences | Review concrete shapes, type/NULL/exactness/resource semantics and old-version refusal/replay before feature code |
| G02-D2 Weft | Shared Rust admission/lowering for Python and WASM; finite exact arithmetic, C text semantics, private full-effects exactness/count guard; qualified built-in resolution | No UMF SQL renderer; no rounding/truncation/intermediate loss; baseline operation 0.1 unchanged; new unsupported shapes refuse |
| G02-D3 UMF | Browser-compatible compiler/validators, stable input closure, canonical identity, two closed phase variants, unchanged native meaning admission | Bun and actual Chromium; malformed/tampered/resource/unsupported cases; no new operation admitted by old schema authority |
| G02-D4 host | Versioned program admission, locked atomic data/constraint/progress, full native constraints, bounded effects and sanitized failures | Existing and appended required target shapes; unknown commit resolution, rollback/no repeat and held direct-writer evidence |
| G02-D5 independent native | Frozen installable cohort and synthetic PostgreSQL fixtures with manually specified expected rows; semantic and fault matrix in SD-007/STP-085 | Reviewer independently runs installed artifacts; records native versions, hashes, SQLSTATEs, exact rows, locks and recovery; no self-oracle |
| G02-D6 candidate review | Focused source review, dependency/platform inventory, required CI, fresh package installation/network-denied controls and accurate release notes | Candidate source/tree and all artifacts frozen; old capabilities retained, UMF Rust 0.4 refused unless separately qualified; remaining G03–G11 listed |
| G02-D7 publication | Merge reviewed candidate; publish exact immutable UMF/Weft cohort in dependency order, without colliding with another release | Fresh published downloads match reviewed hashes/inner SDK inventory and merge/tag tree; notes accurately state finite G02 limits and every residual |

D1 must fix exact wrapper/reference version dispatch and the compiled guard wire
contract, not defer those decisions to implementation. D2–D4 may proceed in
parallel only after interface review. Any semantic expansion returns to design
review. The selected native baseline is PostgreSQL 18.6 maintenance execution;
managed adoption remains G09. Each new dependency release must use a unique actual
version after checking concurrent publishers; historical 0.4.49 artifacts cannot
be relabeled. Public platform support follows shipped and verified artifacts,
not a historical platform count.

#### Historical pre-reconciliation G02 integration checkpoint — Core 0.10.1

This is a preserved pre-reconciliation checkpoint for the earlier Core 0.10.1
producer. Its source comparison and qualification receipts are historical evidence;
they do not describe the current Core 0.10.2 cohort or qualify reconciled source.

SDK 0.5.7 is selected after the separate Core 0.10.1 publication at
`umf-v0.5.6`, commit `259bf1ed91466ff7e9782d7517c14f2112282026`.
The integration retains those immutable Core wheel/sdist bytes and their original
producer identity. Comparison against the regenerated SDK 0.5.7 source maps
32 Core Python/JSON payloads: 31 match exactly; the generated metamodel manifest
differs only in two root `package.json` fingerprints. The Core semantic document
version remains 0.10.0. Reusing the published component requires fresh installed
composition tests; an SDK source fingerprint does not relabel its Core producer.

The combined source passed type checking, nine focused G02 compiler tests
(47 assertions), five host phase tests, one ordinary-runtime refusal test and
three host-error privacy tests. The reviewed single-cell selector and aggregate
verifier passed 29 self-contained tests in the integration checkout. These checks precede the final
source freeze and do not replace current-source CI or native acceptance.

The actual published 0.5.5 legacy mirror passed a fresh network-denied replay on
macOS 27.0.1 arm64 / CPython 3.11.17 using its original corpus and fixtures.
Independent review verified the archive, all 29 original wheels, actual exit
status and probe receipts. The retained [replay evidence](evidence/mig-g02/final-integration/legacy-public-0.5.5/independent-review.json)
qualifies that legacy path only. Missing/tamper controls use separate temporary
copies; the generated mirror is disposable test output excluded from publication.

The additional date/instant/UUID/boolean native fixture passed its owner run on
PostgreSQL 18.6 with the frozen installed cohort: five cases and 78 checks,
including retained ordinary creates, exact full-row oracles and matched-NULL
rollback with the authenticated READY receipt and ingress fence retained.
The [actual report and dispatch](evidence/mig-g02/final-integration/temporal-native-attempt-005/runner-report.json)
bind the reviewed runner and fixture; settings and database/role inventory
projections were restored. A separate installed environment independently passed
the same five cases and 78 checks; all 431 installed payloads remained exact
afterward. The [independent receipt](evidence/mig-g02/final-integration/temporal-independent-007-review.json)
records that gate and owned-resource cleanup. Full settings/inventory projection
equality is the separate owner-run evidence, not an inferred independent check.

Earlier harness failures are retained: an initial boolean cast, a query assuming
transient progress survives publication, and unequal observation roles under
FORCE RLS. An initial-install-only diagnostic proved the owner saw zero rows
while the administrative observer saw all three. The corrected runner uses one
read-only UTC administrative observer and an explicit manual three-row baseline.
A separate socket-permission failure occurred before native dispatch. These
failures do not substitute for the successful run or its independent gate.

Final candidate review includes a closed four-cell wheel-union index and actual
network-denied installation from that union on each supported runtime cell.
Aggregate source review passed its scoped gate. Final regeneration, current-source CI, independently
reviewed native evidence, merge and SDK publication remain open. The
[0.5.7 candidate notes](../05-deploy/sdk-release-notes-0.5.7.md) retain the finite
capability and residual migration scopes. Earlier 0.5.6 backfill candidate
receipts remain historical evidence with their original components and hashes.

### Successor work queue and closure gates

After each reviewed release, update the residual matrix with exact qualified
subset/evidence and select the next concrete contract slice. Carry any remaining
part of a gap forward under its existing ID. The default sequence below is by
dependency; independently available external qualification can proceed earlier.

| Order / ID | Next design and implementation slice | Closure evidence required |
| --- | --- | --- |
| 1 / G02 | Finite typed per-row algebra above, both target shapes | All G02-D1–D7 gates; residual arbitrary/external transforms explicitly refused |
| 2 / G03 | Existing-column SET/DROP future defaults; finite expression identity/type/volatility rules | Old rows unchanged, omitted versus explicit NULL writes, source/native default correspondence, tamper/recovery and installed publication |
| 3 / G11 | Stable-ID combined drop/append scheduling and full dependency closure | Equal/different counts; exact ordered effects; policies, denied UPDATE and references; no name/count matching; atomic failure and native postconditions |
| 4 / G10 | Successor initial/prefix inventory profile, including mixed table creation/evolution | Empty/add/remove/combined inventory fixtures, persistent approval continuity, no downgrade, exact historical 0.1 replay and native phase recovery |
| 5 / G04 | Explicit narrowing/cross-family conversion vocabulary and retained shadow representation | Format/timezone/precision/rounding/loss decisions, target constraints, retained originals and independent native edge-value oracle; no implicit cast claims |
| 6 / G05 | Retire access, retain recoverable values and separately authorized physical purge | Retention/backup authority, restore after subsequent writes, privacy/access enforcement, expiry and irreversible purge receipt; history alone insufficient |
| 7 / G06 | Online chunking with stable keys/version reconciliation and guarded cutover | Insert/update/delete/reinsert races, interrupted chunks, bounded progress, cancellation, no lost edits or unprotected activation interval |
| 8 / G07 | US-050/CONTRACT-045 dependency revision closure followed by coordinated store migration | Exact cross-document pins/unknown meaning handling and multi-store failure recovery; no assumed distributed transaction |
| independent / G08 | Select actual Truss mutable and Ashlar immutable backend owners/capabilities | Genuine effects, refusal and journal/publication recovery for shared Person intents; adapter-specific versions and native evidence |
| independent / G09 | Obtain authorized isolated managed target and actual consumer workload from its owner | Frozen installed cohort, actual managed privileges/platform constraints and consumer workload acceptance; local PostgreSQL does not close it |

G08 cannot be marked complete because a reader or schema comparator works. G09
cannot be marked complete using a local substitute or unauthorized production
exercise. If external ownership/access remains unavailable, record the precise
owner, missing prerequisite and remaining acceptance work; keep the umbrella
objective incomplete and report the actual dependency. Do not silently reduce
the human's all-backlog scope to the immediate G02 release.

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
plan selects G01 and upstream embedder delivery. Managed-consumer qualification
remains external MIG-G09 follow-up; subsequent residual waves below remain
separately selected scope. Do not infer release numbers or dates.

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


## G11 source002 independent review checkpoint — 2026-10-24

[The source002 review evidence](evidence/schema-migrations/g11-native-adapter-source002-review/README.md)
rejects the candidate despite its 29 passing supplied source controls. Seven
integration findings block native qualification: flat native/session observation
shape, launch-intent digest provenance, exact settings projection, signed
registration/reservation correspondence, fixed legacy custody approval scope,
raw terminal receipt comparison and already-unwrapped registration payload.
Independent real Ed25519 terminal recording succeeds; original adapter recovery
then refuses the matching confirmed outcome. Authority007's separate acceptance
is unchanged. Luna repairs the adapter against the frozen failure probes while
implementing the separate initial-generation authority under governing009.

The governing009 adoption at `e37cd7e45eb351d0c2f95ca720cf2ba4b6c7f126`
defines two logical enrollment scopes, separate from all six physical owner
scopes. Existing-head enrollment requires original non-null source/head and
actual private native capability/barrier/activation recovery. True headless
installation remains a G10 requirement. Source-only controls and document
adoption do not close these capabilities, G04 retained originals, G05 lifecycle,
the broader G02–G11 backlog, or testing/merge/release/public-byte gates.


## G11 source correction and release checkpoint — 2026-10-24

The native adapter source004 and authority007 correction is committed at
`3cdb0b1a36b377596ecd2c2fd759d3704e1cec78`. Its bounded source review passed;
actual PostgreSQL/helper execution remains unqualified. The full committed
boundary checker still reports seven violations. The accepted refactor moves
canonical serialization and bootstrap identity into leaves, keeps ledger logic
in a pure core, and puts concrete native validation and lifecycle/recovery
orchestration in the session facade. Original bootstrap must durably bind the
ledger path and birth intent; confirmed missing history/lock refuses across
restart. This implementation is in progress, not a passing boundary gate.

[Initial-enrollment review evidence](evidence/schema-migrations/g11-initial-authority-review/source006-root-review.json)
records root replay of source006: 19 tests, eight independent original-context
birth/history/immutability controls, the original issuer-subclass refusal probe,
a two-process append-lock control, and configured lint pass. Earlier source002
accepted a caller-defined issuer resolver and production-marked test context;
source003 then incorrectly excluded original native-acceptance purpose. Both
rejections are retained alongside source006. A later frozen run exposed a shared
append-lock race; source006 holds an exclusive lock across read/replay/append.
The frozen packet preserves that failed run. These are bounded prior-dependency
source controls: external independent review, actual branch integration, original
production trust bootstrap, native prepared epoch/activation and recovery are
still required. No source-test issuer establishes native authority.

G04's finite native TOAST/RI creation-inventory correction is adopted at
`235a149bd17472f0e03527aa930c7aec61ca1b59`. Exact parent/native dependency
closure is mandatory; no namespace or internal-flag waiver is admitted. The
adoption receipt retains the sole blank-EOF normalization. Actual fixed DDL,
full catalog observation and unknown-COMMIT custody remain native gates.

Core candidate `2a76a8e8213ec64334408ec49edadc3b6e765cce` contains the actual
fresh inventory after the website staging fix. Root and independent Sol approved
its separate check-only preparation with fixed 300-second total, 180-second
checker ceiling and 95-second cleanup reserve. The actual check has not run;
a new coordinator resource handoff is required. CI, platform artifacts, final
review, merge, publication and fresh public-byte verification remain separate.

G10 proposal003 is under design revision for enrolled-carrier retirement,
acyclic first native plan approval after metadata creation, and exact signed
component policies with native phase timeouts and receipt digest correspondence.
An explicit first-subset refusal does not complete the full carrier-composition
requirement. G02–G11 implementation, portable/browser/installed/native testing,
review, merge and immutable release remain the active full delivery objective.


## Migration source and qualification checkpoint — 2026-10-24, successor

The preceding Core check preparation has now executed. The actual full-source
inventory check against `2a76a8e8213ec64334408ec49edadc3b6e765cce` passed,
with terminal owned child processes, independent cleanup/custody verification,
unchanged inventory and retained dependency snapshot. Evidence-only successor
`909a6969b38893e0bb0e5ece81bff42b125811ff` is posted to draft PR49. Its Python
support and inventory CI passed; the current website browser and command native
checks failed. The latter returned LIMIT where a handler commit was expected;
the responsible deadline stage is unproven. No timeout increase, automatic
retry success, or prior-platform artifact establishes current qualification.

The local Core source successor `37290c7c6261c13106ce42378fe26626220e34ae`
replaces stale ontology counts with independently pinned 24 record identities
and 27 projected relationship identities. Pure-source correspondence and
missing-member controls pass under exact Bun1.4.2. Existing geometry, mobile,
focus and navigation requirements remain unchanged. Actual rebuilt-browser
qualification, fresh inventory generation/check and current hosted/platform
evidence remain required. Isolated checksum-verified Bun1.4.2/Go1.27.1 resolve
observed default-toolchain drift without changing source version requirements.

G11 governing010 and011 are adopted at
`fede119d3c11ffe3c4d8c32b8c9434add44cd05f` and
`3339a9732e96d2afd5e1b84ee51e50a79c827bb4`. Original context0.3 binds ledger
birth in one primary setup state, composes original enrollment0.1/0.2 and
requires original deployment setup before ordinary runtime initialization.
Boundary source005 has 111 focused passing controls and a clean 103-module
boundary scan, but remains uncommitted and under independent review. Its
logical-root registry initialization and evolving-history verification have a
material candidate defect: empty-file birth and full-file initial-digest equality
cannot implement the adopted closed root registry. Correct original registry
birth, authenticated evolution and recovery remain implementation gates.

G04 source `b0f09643a35a3f98d6d7d074bce99eaa0a9e672c` records finite store
creation/catalog guards and source tests. Bounded corrections passed 25 focused
tests, nine successor controls and 90 distinct independent trigger cases,
including real PostgreSQL18 constructor shapes represented as source tuples.
These are not native database observations or exhaustive provider acceptance.
The original external custodian store reservation/confirmation, supervisor
capability, positive COMMIT, restart/reopen, enrollment/capture/baseline/restore
and installed/native evidence remain open; current creation fails closed.

G10 proposal004 is being reconciled to add an exact denied native approval
outcome and recovery without replacing the original approval identity. No
moving draft is adopted. G02–G11's full implementation, qualification, review,
merge, immutable release and fresh public-byte verification remain unfinished.


## Migration integration checkpoint — 2026-10-24, journal recovery

G11 governing012 and013 are adopted at
`867a770b1684f7b422277a6b25f4adc001dd6c05` and
`8105df3284d7f58793b59996eaaf80235a4677a8`. They fix canonical root-registry
birth/evolution, preserve native-free component ownership, and require subordinate
logical context/ledger birth before root enrollment confirmation under the same
original native exclusion lease. Confirmed missing history refuses recreation.
The current extraction passes 25 focused authority/birth tests, but production
root enrollment and session issuance remain incomplete: the concrete native
lease/resolver and upper session coordinator do not yet exist. The read-only
source map identifies these actual missing methods; no method-name check,
source-test issuer or fabricated observation establishes the positive path.

G04 journal governing010 is adopted at
`e4621c25e1a9a071bd06d6ca1308eea253083ad3`. Fresh original external custody and
supervisor journal0.2 streams retain the original store reservation and six
physical owner scopes. External reservation precedes typed supervisor intent
and the existing generic native reservation bound to owner core. Positive
native COMMIT precedes external, typed supervisor, generic native and owner
confirmations. Every gap recovers the same original IDs without committed DDL
replay; known abort is an attempt observation and unknown remains occupied.
Legacy0.1 bytes/replay remain exact without implicit upgrade. Concrete source
types, registries and coordinator binding must be reviewed before implementation.
Current G04 provider code reserves then executes DDL in its caller transaction;
it has no owner-session binding seam or actual supervisor store capability yet.

Core37290 browser controller005 was rejected by independent review for parsing
approval bytes separately from the bytes it hashed. Immutable controller006
uses one bounded byte snapshot for parsing/hashing and compares fresh bytes
before effects. Root verified 113 manifest members and reran 14 bounded controls
successfully. Independent Sol approval and a fresh resource window are still
required; no actual build/browser qualification or new inventory is implied.
The handler timing candidate has nine passing mocked-runtime tests covering
actual handler control flow. It is still under review and does not establish
the cause or resolution of the hosted native LIMIT failure.

G10 proposal005 adds one common approved/denied decision slot, exact private
request/reservation/attempt accounting/settlement and retained native binding.
Its 101 manifest files and 32 document/source/design controls verify, preserving
all 72 preceding acceptance rows and adding eight. These checks do not execute
product methods or native transactions. Root semantic and external design review
remain open; no proposal005 implementation or governing adoption is claimed.

The full G02–G11 implementation, portable/browser/installed/native verification,
independent review, merge, immutable release and fresh public-byte qualification
remain the delivery goal. UMF/Weft ownership and the exclusion of Praxis changes
are unchanged. Shared heavy validation remains serialized by the coordinator.


### Reviewed source boundary and inventory design checkpoint

G11 source008 portable candidate003 is adopted after root and independent
review. Its complete 240-file source closure matches the retained manifest
under `evidence/g11-source-boundary-008/`. The distinct source suite passes
123 tests with cryptography50.0.2; the new typed-copy regression fails against
frozen source007 with three expected failures. Correct matching prepared and
confirmed physical associations remain accepted; signed foreign associations
refuse. This qualifies source guards and ownership boundaries only. Native014
lease/checkpoints, committed ingress-store creation, genuine subject/schema
births, native effects, installed evidence and release gates remain open.
Auxiliary scratch ROOT byte-transition helpers are not adopted by this change.

G10 design adoption001 is committed at
`1fe2ddba25a3d98c34f4b4f55eb7dabb688db7ac`: all three governing documents
retain their complete base prefixes, and all 21 reviewed definition files are
retained with the full 88 planned acceptance obligations. One durable original
provider allocation must serve common and outer campaign records; native
receipts charge one attempt, while cumulative admission preserves every grant.
This is a required design, not implemented or native-qualified G10 support.

Core37290 actual browser attempt001 stopped during its build because the
external dependency symlink failed the existing input realpath guard. The
browser did not run. Its controller and all 40 recorded child process groups
are absent; the temporary worktree was removed, source stayed clean, and
retained full dependency snapshots matched. Source-only preparation work is
correcting the owned dependency copy; a new reviewed finite resource grant
remains required before another build/browser attempt.

The full G02-G11 testing, independent review, merge, immutable release and
fresh public-byte qualification goal remains open. UMF/Weft ownership and
the exclusion of Praxis changes remain unchanged.


G11 pure ROOT registry source005 is adopted after independent review. The
helper computes canonical reserve/confirm byte transitions with strict original
policy/signature/cross-link/sequence/cap and replay checks. Its module is internal
and gains no IO, UUID allocation, native context, capability, persistence or CAS.
Final focused tests pass24; the unchanged helper body also passed the integrated
133-test source suite. Independent19 transition controls and13 checker probes
pass. Both runtime scan roots are retained:107 modules, zero boundary violations;
the earlier102-module packet omitted five package-root conformance modules and
is superseded. Exact import and nested open/input controls enforce the selected
static source boundary, not a general Python sandbox.

Governing014 is adopted at5edefb5f9039f037486f4bba1c8919d37b68c745. Actual
bounded original target/control exclusion and writer integration are the next
implementation cuts. Full native observation, durable checkpoint/recovery,
committed ingress and application origin providers, all other migration gaps
and testing/review/merge/immutable-release/public-byte gates remain open.


Governing015 adopts explicit original supervisor journal birth and fixed private
context metadata, with a native-free journal codec and signed target request
version dispatch. Exact prior contract/design/test-plan prefixes are preserved;
the complete proposal and root source review are retained in
`evidence/schema-migration-design-review/g11-contract-015/` and
`g11-contract-015-root-review001.json`. Implementation and all eleven new test
obligations remain open. Null ingress/application event families are unavailable;
the full native, managed, installed, merge, release and public-byte gates remain
required. No current setup, journal or request is automatically upgraded.


The bounded original control lease source009 is adopted after independent Sol
review. Original setup exclusion now spans the reviewed facade/core/native effect
paths, validates the original lock and owner identities, and retains one bounded
acquisition budget. Native effects additionally require original signed pending
requests, reservations and handles; a lease kind alone grants no effect permission.
Fork-child cleanup closes its inherited descriptor without unlocking the parent.
Root isolated verification passed148 integrated source tests plus17 store tests;
the14 lease tests include actual finite fork/exclusion and failed-constructor
controls. Exact source hashes, review withdrawals, metadata erratum and qualified
synthetic fixtures are retained in `evidence/schema-migration-native-lease009/`.
This is source implementation evidence, not PostgreSQL/native acceptance. Journal
birth015, durable ROOT checkpoints/all-writer fences, original ingress/application
providers and all remaining migration/release/public-byte gates stay open.


G10 governing checkpoint002 adopts the closed schema-USAGE subject and actual
renderer lowering contract after root review of the complete addendum and
governing001 definitions. One original combined grant maps exactly the person
and batch catalog rows; installed unchanged schemas retain both grants without
reissuing or revoking them, including last-table removal. Private closed renderer
tags must reproduce the historical public bundle bytes exactly. Exact prior
contract/design/test-plan prefixes and the complete proposal/review packet are
retained in `evidence/schema-migration-design-review/g10-contract-002/`.
This is design adoption only. Source implementation/legacy parity, original
bootstrap and native ACL/COMMIT recovery, fenced clients and all mixed, browser,
installed, managed, merge/release/public-byte gates remain open.


G10 checkpoint003 adopts the exact compiler-owned metadata diagnostic paths
retained in `evidence/schema-migration-design-review/g10-fixed-metadata-paths-001.md`.
All three fixed steps remain present for empty, initial and installed plans;
paths confer no authority. Original prefix, approval denial, recovery and
source/native/browser/installed/merge/release/public-byte gates remain open.


G11 checkpoint016 clarifies journal family ownership and the pure ROOT/native
issuer boundary; its complete definition and root review are retained in
`evidence/schema-migration-design-review/g11-journal-family-codec-boundary-001.md`
and the adjacent adoption receipt. Independent source002 review found valid
second-stop replay failure, noncanonical observation acceptance and missing typed
scope4 parent/per-store state. Candidate002 is not adopted; Luna is implementing
003 with regressions. Full signed pure ROOT replay remains required, while
null-ingress cannot create its genuine native prerequisite. Actual original
creator/snapshot/ROOT writer/provider and all native/installed/managed/merge/
release/public-byte gates remain open.


G10 checkpoint004 adopts one current local table-definition digest, retained in
`evidence/schema-migration-design-review/g10-table-state-definition-digest-001.md`
with its root adoption receipt. Complete current catalog rows participate after
every phase; the full source/review digest remains a separate domain. Semantic
predecessor continuity and actual operation-bound creation/removal references
are required. Source009 wire/step-reference/seed-order defects and history
recompilation remain under source repair in010. No source tests or runtime
checks were executed for this adoption under the shared resource hold. Native,
browser, installed, managed, merge/release/public-byte gates remain open.


### G11 journal015/016 source005 adoption — 2026-10-24

The ten-path original supervisor journal source slice is adopted with exact
source/command/custody evidence in
`evidence/schema-migration-journal015-source005/`. Original pending journal/lock
birth, fixed private metadata, closed native-free replay and signed target
request selection preserve old profiles and the original six-scope boundary.
The final codec binds typed ORIGINALS custody to its original prepared
registration digest. Rejected precursors and the003 manifest erratum remain
retained; no frozen manifest or old native profile was rewritten.

Independent verification of the frozen265-file closure passed207 tests, retained
signed ROOT/restart/typed-parent/custody/legacy controls,108-module boundary
checks and Ruff. The exact one-shot source ticket completed in12.471691 seconds
with exit0, no timeout/reap failure and owned process-group absence. Resources
were returned. All265 source hashes match the adopted live closure; only the
two final005 overlays changed during adoption. No native/PostgreSQL/build/browser
or further runtime was launched under that ticket.

This closes the reviewed source cut only. Real native snapshots and origin
providers, durable ROOT/all-writer checkpoints, complete crash recovery,
historical active-target upgrade, remaining G02–G11 work, independent native/
managed/browser/installed acceptance, merge/release and fresh public-byte
verification remain required. Null ingress/application families are unavailable.
