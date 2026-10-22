---
ddx:
  id: umf.plan.praxis-embedder-completion
  type: implementation-plan
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.praxis-lifecycle-roadmap
      kind: informed_by
    - id: FEAT-033
      kind: informed_by
    - id: SD-007
      kind: informed_by
    - id: CONTRACT-079
      kind: references
    - id: CONTRACT-081
      kind: informed_by
    - id: TD-085
      kind: informed_by
    - id: STP-085
      kind: informed_by
    - id: TP-001
      kind: informed_by
---

# Praxis embedder completion

## Scope

Owner selection, 2026-10-21: implement the remaining U4–U9 embedder asks, qualify
actual consumer adoption, implement the bounded MIG-G01 existing-column fill,
then cut another release. This plan uses the existing WS-5–9 registry. It does
not reopen delivered U1–U3 or turn every MIG-G01–G11 residual into this release.
MIG-G09 managed consumer qualification is selected here; the other residuals keep
their existing limits unless needed by the inspected consumer workload and
explicitly reconciled before implementation.

Governing artifacts are the [retained revision2 request](../00-discover/inputs/praxis-table-lifecycle-asks-v2-2026-10-21.md),
[roadmap](../01-frame/praxis-lifecycle-roadmap.md),
[FEAT-033](../01-frame/features/FEAT-033-generated-ontology-access.md),
[CONTRACT-079](../02-design/contracts/CONTRACT-079-unified-python-access.md),
[CONTRACT-081](../02-design/contracts/CONTRACT-081-table-lifecycle.md),
[TD-085](../02-design/technical-designs/TD-085-typed-actions-on-raw-tables.md),
[STP-085](../03-test/test-plans/STP-085-typed-actions-on-raw-tables.md),
[SD-007](../02-design/solution-designs/SD-007-schema-migrations.md) and
[TP-001](../03-test/test-plan.md). The
[G01 design and sequence](schema-migration-plan.md#remaining-gap-delivery-order)
selects a finite maintenance operation rather than arbitrary transformations.
Catalog: installed HELIX 0.18.0; implementation-plan template and artifact-signal
voice. The published SDK 0.5.4 cohort and its
[U1–U3 packet](evidence/praxis-u123-adoption/README.md) remain historical evidence
for their exact bytes, versions and subset.

## Shared Constraints

UMF owns declarations, comparison, DDL and verified portable plans. Weft lowers
selected typed data operations. The host owns authentication, connections,
approval, locks, durable outcomes and native publication. Keep Bun/Node and driver
imports outside portable/browser libraries. Generated application code remains
stdlib-only; the administrative compiler currently includes embedded V8.

U4 reuses descriptions, allowedValues and range facets. Add shorthand only if a
concrete consumer expression cannot be expressed through the existing canonical
forms; it must normalize without losing source meaning or adding competing null
semantics. U5 provides reusable host orchestration, not a second ledger. U6 is an
optional parsed containment check, not authority to execute arbitrary SQL or a
replacement for source recompilation, approval and native correspondence.

G01 uses options/plan 0.3 and execution profile 0.2, with one typed
`backfill-tighten` required phase. Old execution profile 0.1 admission stays exact.
The progress relation may remain unchanged only with exact existing receipt/schema
semantics. G01 selects one original next-source bounded UPDATE for NULL values in an
existing optional Field becoming required. Same identity/type/default/facets and
explicit scoped-row acknowledgement are mandatory. Fill and native NOT NULL
activation share one locked transaction and one durable phase receipt. Existing
values survive; cached counts or metadata fencing alone cannot protect direct
writers. Preserve original 0.1/0.2 verification/replay and refusal semantics.

Actual Praxis inputs remain private: inspect locally, retain private receipts in
ignored host storage and publish aggregate hashes/counts only. Do not copy the
eleven-table/four-migration sources, payloads, identities, credentials or private
locations into UMF fixtures or release evidence. Independent fabricated fixtures
provide public reproductions. A local PostgreSQL pass does not imply Lakebase.

U9 means a current-core Hohfeld reader and an actual installed/released consumer
journey using the same admitted document as Weft. It does not select general graph
schema migration (MIG-G08). Preserve declared Hohfeld subset refusals and original
legacy sources; never relabel a core 0.10 source as 0.7. The local reader already
names core 0.10; inspect its actual behavior and release custody before deciding
what source changes remain.

## Implementation Slices

Slice IDs identify work in this plan, not new workstreams or tracker items.

| Slice / WS | Work and owner | Depends on | Required gate |
| --- | --- | --- | --- |
| EC-00 / WS-5–9 | Integration owner inventories exact local consumer eleven tables/four migrations, frozen dependency lock, contributed containment checker and current Hohfeld source/release state; reconcile governing amendments | None | Private input custody, per-ask capability/refusal map, explicit managed-target handoff and no invented support or credentials |
| EC-01 / WS-5–7 | Boundary owner maps portable/compiler, host protocol, parser and administrative adapter modules; extend existing checker before feature changes | EC-00 | `bun run check:access-boundaries`, table lifecycle/deployment checkers and allowed/private/host-import negative controls run locally, pre-commit and CI; no baseline expansion hiding new violations |
| EC-02 / WS-6 | U4 owner writes canonical comment/enum/range authoring examples; implement missing normalization only if the inspected consumer requires it | EC-00, EC-01 | Exact source/description recovery, deterministic escaped COMMENT/CHECK DDL, real PG enum/range rejection and NULL behavior, browser and Python agreement, located unsupported-carrier refusal |
| EC-03 / WS-6–7 | G01 owner implements successor portable admission, paired scheduling and existing runtime integration; reuse typed backfill lowering | EC-00, EC-01; CONTRACT-081/TD-085/STP-085 amendment | Public discovery/compile/verify agree across Bun/Chromium/embedded Python; installed populated/empty native and two-session/recovery corpus below; no partial runnable plan |
| EC-04 / WS-7 | U5 owner extracts typed host-neutral applier orchestration and durable host approval receipts, then adapts existing Psycopg implementation | EC-01; reconcile shared runtime hook with EC-03 | Same forward chain/current-source/file/head checks, capability refusals, recorded trusted decider, native approval/effect/outcome durability and every unknown-commit recovery path; no regression in legacy verification |
| EC-05 / WS-6–7 | U6 owner inspects contributed checker, selects a real PostgreSQL parser and implements closed syntax/object closure with Python public API/CLI | EC-00, EC-01 | Positive supported SQL corpus plus hostile syntax/CTE/function/quoting/multi-statement corpus; foreign schema, stored code, roles, settings and external grants refuse; no effects on check/import |
| EC-06 / WS-5, WS-9 | U7 release owner builds exact mini-racer/Python/platform/wheel matrix and publishes installed receipts, sizes and notices | EC-00; final cells rerun after EC-02–05 | Each advertised cell installs from exact wheel hashes, runs generation/discovery/migration/refusal parity and production verification path; unavailable or untested cells explicitly unsupported |
| EC-07 / WS-9 | U8 release owner resolves complete transitive wheel closure and produces static hash-pinned Simple Repository API mirror plus locked offline recipe | EC-06 lock/cohort | Empty-cache clean and network-disabled fresh install with all dependencies, wheel/source/license inventory, generate/check/apply probes and no source build/network fallback; tampered/missing dependency refuses |
| EC-08 / WS-8 | U9 Hohfeld owner reconciles current-core reader, same-document Weft journey and actual installed Hohfeld distribution; publish immutable release with recorded date | EC-00; relevant boundary controls | Current-core source parsed without relabeling, selected model/Key/codec/query behavior and explicit unsupported/legacy controls, real selected host journey, clean installed release and published asset hashes/date |
| EC-09 / WS-5–7 | Consumer integration owner ports exact private schema/history to admitted current-core declarations and generated per-person/batch clients, removing replaced emitter/planner/policy code only after acceptance | EC-02–05; installed candidate | Every source/history item accounted for; original applied bytes/digests retained; actual plugin and scheduled batch, sync/async, two-person/group/owner+via access, defaults/NULL/bounds/counts/replay and failure recovery pass on isolated local PG |
| EC-10 / WS-7, WS-9 | Consumer/platform owner runs the same required workload on an explicitly selected isolated Lakebase/Databricks target | EC-09; external target gate | Record actual server, driver, permission/platform limits, scoped client/DDL/migration/recovery evidence and consumer acceptance; local proxies or synthetic fixtures cannot close this gate |
| EC-11 / WS-5–9 | Integration/release owner freezes assets and cohort, obtains source/evidence review, merges and publishes another immutable release | EC-02–10 | All selected gates pass, CI green, installed/browser/native/mirror/source hashes agree, new release assets/index entry or complete mirror available, Hohfeld release linked and exact support inventory published |

EC-02/03, EC-04, EC-05 and EC-06/08 can progress independently after boundary
adoption. G01 owns compiler/options/schema/phase admission; U5 owns new host
protocol/approval modules and adapter delegation. Reconcile their one runtime hook
before either edits shared execution code. Packaging freezes after product changes;
it does not reopen unrelated compiler semantics. Do not claim U9 or managed
acceptance complete merely because other parallel slices passed.

## Validation Plan

STP-085 owns primary direct-table behavior. Extend its existing portable/browser,
embedded Python and native harnesses; avoid a parallel migration test framework.
Tests for G01 carry `@covers US-051-AC12`, `AC15` and `AC16`.

| Acceptance family | Required observation |
| --- | --- |
| G01 population and intent | Empty, all-NULL, mixed and populated date/instant Fields; only selected NULL cells fill, existing values/unrelated rows survive, zero matches succeeds. Wrong/duplicate/unused selectors or marker, extra assignment, wrong predicate/target, parameters/batch/returning, generated/immutable target and invalid/nullable/date-coerced clock refuse. |
| G01 constraints and writers | Fill and tighten share one transaction/native exclusive lock; Key/CHECK/FK or bound failure rolls back that pair. Held/direct writers scheduled immediately after UPDATE cannot cross the activation gap; committed NOT NULL rejects their later NULL writes even while final publication is fenced. Future defaults are unchanged; default alone does not fill history. |
| G01 recovery and composition | Before/after pair commit, lost response, cancellation and later-phase failure: exact observations distinguish abort from committed effects, committed UPDATE/clock never repeats, old/new generated clients stay fenced until publication. Wrong file/head/command/approval, native/progress/privilege drift refuses before effects. Compose with concurrent-index/validation/seed phases or explicitly refuse before plan emission. |
| U5 approval and state machine | Forward-only chain, terminal source equality and original file digests; trusted decider receipt binds target, plan, predecessor and qualification. No approval from author metadata; unsupported host atomicity/fencing/observation refuses. Effect/progress and final head/grants/ledger pairs are atomic; unknown commit is observed rather than replayed. Fake host tests alone do not qualify native durability. |
| U6 containment | Parse every statement with bounded input/AST depth and closed node set. Traverse CTEs/subqueries/expressions/object references and callable names; reject unsupported nodes, ambiguous search-path resolution, cross-schema names, indirect function effects, stored code, role/schema DDL, settings and external grants. Preserve input and located reasons; approved generated runtime setup is separate trusted host code. |
| U7/U8 delivery | Exact OS/architecture/libc/Python/wheel tags, mini-racer version/hash/size/notices and parity result per matrix cell. Offline install starts with empty caches and no index/network; locked full dependency and source/license manifests, RECORD checks and damaged/missing wheel refusals. Generated stdlib-only and administrative V8 claims stay distinct. |
| U9 actual reader | Same exact core 0.10 document admitted by installed Hohfeld and Weft for the selected ontology journey; admitted meaning preserved, unknown/unsupported meaning refuses explicitly. Legacy source compatibility or migration retains original bytes and explains losses. Actual selected native host execution and immutable release/date prove delivery, not a version constant. |
| Consumer and managed | Exact private eleven/four inventory plus retained history; actual generated plugin and batch calls under distinct authenticated principals. Repeat required catalog, data, policy, migration and recovery checks on declared Lakebase profile; safely retain aggregate public evidence and access-controlled private receipt. |

Final integration retains published 0.5.4 historical compatibility controls,
regenerates source-derived assets, builds fresh SDK/wheels/sdists, audits source and
RECORD correspondence, runs type/schema/boundary/focused regression and real
Chromium parity, then tests the exact installed artifacts natively and offline.
Do not reuse changed-input receipts; unchanged input reuse needs complete custody
and explicit equivalence. Preserve scoped original receipts unmodified.

## Execution Contract

The user explicitly authorizes planning, implementation, disposable testing,
merge and another release. Execute these slices through the stated exit gates.
Authorization does not supply missing managed access, private publisher authority
or an uninventoried production target. No user credentials belong in artifacts.
Root integration owns worktrees/source control and coordinates shared index
access; Sol reviews governing plans and changed source/evidence; implementation
agents own bounded assigned slices. No new tracker is selected.

Token estimate and comparable usage baseline: unknown. No user budget or spending
ceiling was provided; do not invent an enforced cap or derive a calendar date.
Runtime metering/enforcement limits must be reported where available. Preserve a
continuation record at meaningful slice/review checkpoints; required verification
is not waived for elapsed effort. Release versions and date are selected only
after existing package/release heads are reconciled. The current local date is
not a promised publication date.

### External gate and executable handoff

Managed qualification requires an authenticated, authorized isolated target,
selected Databricks/Lakebase profile, database/schema/role provisioning authority,
allowed network path and consumer test configuration. The integration owner has
requested profile/test-target information without requesting credential content.
While waiting, complete all independent slices and prepare the target-bound
runner and redacted manifest. The runner must verify target identity/permissions,
create only authorized disposable objects, run EC-10 acceptance, retain a private
receipt and emit an aggregate public digest/result. Do not execute against a guessed
production target. An unavailable target is an explicit remaining blocker, not
permission to close EC-10 or the full goal. Record the exact input needed and a
ready-to-run command/configuration schema without secrets.

Hohfeld delivery similarly requires its repository/release authority and actual
installed release. Inspect existing changes before editing; finish missing
behavior rather than replacing working current-core support. A public release
candidate may be prepared while external tests are pending, but the requested
fully completed release must not be reported until all selected gates pass or
the human explicitly changes scope.

## Continuation Evidence

Plan initialization: U1–U3 released evidence is retained; G01 design packet has
been reconciled into SD-007, the migration sequence and TP-001. This plan's
CONTRACT-081/TD-085/STP-085 amendments define selected successor behavior and
primary acceptance. No new product implementation or acceptance is claimed here.
Initial private inventory found ten per-table YAML files plus a module document,
rather than the request's eleven-table count, and four SQL migrations with four
snapshots. Reconcile that discrepancy against the selected consumer cohort before
claiming inventory acceptance. The contributed private checker is a tokenizer/
classifier with no reusable public license established; do not copy it as a
parser. Implement independently using a qualified optional parser, fail closed if
that parser is absent, and retain no private source in this repository.
Local and remote Hohfeld source already declare core 0.10, with differing package
versions; installed/release/behavior custody remains to be checked. Managed access
discovery is owned by the integration owner. Shared wire decision: options/plan
0.3, execution profile 0.2 and the typed required pair; U5 adapter hook is reconciled
before shared runtime edits. Next action: complete EC-00/01, then execute independent
implementation slices. Add completed
slice IDs, safe evidence paths and material blockers here at the next checkpoint.

## Risks and Rollbacks

| Risk | Response and recovery |
| --- | --- |
| Fill and tighten separated by a commit | Compiler emits one typed paired phase; host rejects split phases. Uncommitted pair rolls back; after commit retain data/constraint and fencing until exact resume or approved forward repair. |
| Host abstraction weakens native safety | Require explicit durability, locking, native verification and unknown-outcome capabilities; preserve strict legacy adapter verification and prove genuine native failure/recovery. |
| Parsed containment is treated as general SQL safety | Closed optional subset, exact schema/object/callable closure and no execution authority; refuse unknown syntax and retain source. |
| Platform or mirror claims exceed receipts | Publish only tested matrix cells and complete locked closure; failed cells remain unsupported and block any consumer that needs them. |
| Private consumer leakage or unavailable managed target | Keep original sources/receipts private; publish aggregate hashes. Continue independent work; retain explicit EC-10 blocker and executable handoff. |
| Hohfeld constant mistaken for delivery | Installed same-document behavior, actual host journey and published release/date are required; retain old distribution and source for rollback. |
| Published asset mutation | New immutable versions for changed artifacts; reuse unchanged core release bytes; retain old cohorts and document forward-only data effects. |

## Exit Criteria

Plan readiness requires concrete ownership, boundaries, sequence, shared interface
agreement and test allocation; it does not establish implementation completion.
Full execution completes only when:

- U4–U9 and the selected finite G01 behavior pass their stated source/native,
  browser and installed gates; the new profile preserves historical verification.
- Actual local consumer adoption and authorized managed EC-10 acceptance pass,
  with private source custody and a genuine consumer replacement decision.
- The complete offline mirror and advertised V8 matrix pass exact-cohort tests;
  actual Hohfeld current-core release assets and date are available.
- Independent changed-source/evidence review, CI and final package/hash custody
  pass; another immutable release is published with qualified support inventory.
- Required canonical docs and runnable handoff/recipes agree; no selected gate or
  material blocker remains. Unselected MIG residuals retain their explicit limits.
