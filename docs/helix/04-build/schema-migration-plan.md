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
and delivery proposal; no migration implementation or release claim follows.

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
| U1, active | Mixed transactional/concurrent phases, explicit validation, durable progress, fencing and recovery without replaying committed data effects | Owns native phase execution portions of MIG-04/07 |
| U2, active | Source-bound reviewed markers; drop/rename, nullability, finite type conversions and constraint/Key/policy dependency changes | Owns bounded native portions of MIG-05/06 |
| U3, active | row_scope normalization into canonical policies | Related authoring/security work, not a new migration engine |

The candidate evidence is local and unpublished; U1/U2 were not observed complete
or released. Bounded backfill and finite conversions do not establish arbitrary
per-row transforms, online chunked rewrites, recoverable retirement windows or
non-PostgreSQL execution. Assess those against the accepted capability inventory
before assigning residual implementation. Reconcile overlapping documentation
with that chat; this checkout is not the current native implementation baseline.

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
cases and allocate remaining US-051-AC11–16 criteria in STP-051 before residual
implementation. Do not duplicate native primary tests.

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
sequence recorded; no implementation performed in this chat. Native work is
active in Plan UMF and Weft Praxis asks. Next action: MIG-00 reconciliation and
design review against that stream's accepted interfaces/evidence.
Record completed slice IDs, source/profile
versions, evidence paths, failures, remaining decisions and next action here when
execution begins. Do not discover or create tracker work without selection.

## Risks and Rollbacks

| Risk | Response | Recovery |
| --- | --- | --- |
| New format interpreted under old semantics | New closed profile and explicit version admission | Preserve original intent/source; reject unsupported profile |
| Backfill overwrites concurrent updates | Versioned rows or qualified equivalent; protected writers | Idempotent conditional replay or abort staged candidate |
| Cutover after incomplete checks | Complete native target validation under write guards | Keep old active generation; retain checkpointed candidate |
| Drop/type change loses data | Retain source values or verified backup; explicit loss approval | Restore only when data and post-cutover writes permit; otherwise forward repair |
| Private birthday/reject values leak | Host-controlled storage; summary counts in receipts | Restrict capture and retention; test diagnostics for raw values |
| Backend cannot meet online/atomic promise | Capability-specific mode/refusal | Qualified maintenance window or separately approved staged plan |

## Exit Criteria

Plan readiness: ownership, operation semantics, dependency order and verification
gates are recorded. MIG-00's exact interfaces and technical/test designs remain
the implementation entry gate. Dates, named implementers, managed test target,
retention policy and additional backend priorities are uncommitted.

Execution completion requires all four operations on the selected PostgreSQL
profile, including staged backfill and honest recovery; portable/browser and
installed-native gates; source-bound approval/outcome verification; generated
client cutover; public documentation and independent review. Each later backend
receives a separate operation/mode/version qualification. No completion statement
may imply atomicity, online operation or reversibility outside that evidence.
