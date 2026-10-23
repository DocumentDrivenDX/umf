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

Owner selection, clarified 2026-10-22: implement the remaining upstream U4–U9
embedder asks, provide a consumer adoption handoff, implement bounded MIG-G01 fill,
then cut another release. This plan uses the existing WS-5–9 registry. It does
not reopen delivered U1–U3 or turn every MIG-G01–G11 residual into this release.
Actual Praxis changes belong to its owner. Read-only consumer inspection informs
upstream fixtures; this work does not edit the Praxis codebase. MIG-G09 managed
consumer qualification remains an explicit unverified residual rather than a
gate on this upstream release. Other residuals retain their stated limits.

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
| EC-09 / WS-5–7 | UMF integration owner supplies upstream conversion APIs, fabricated domain fixtures and a Praxis-owner handoff; actual consumer port stays outside this task | EC-02–05; installed candidate | Explicit policy/domain conversion and refusal evidence; handoff preserves original applied history and identifies host-ledger transition needs without fabricating generated history |
| EC-10 / WS-7, WS-9 | External consumer/platform owner qualifies actual adoption on an authorized isolated Lakebase/Databricks target | External follow-up after EC-09 handoff | Keep MIG-G09 unverified in the release inventory until genuine consumer/server/driver/permission/recovery evidence is supplied; local proxies cannot close it |
| EC-11 / WS-5–9 | Integration/release owner freezes assets and cohort, obtains source/evidence review, merges and publishes another immutable release | EC-02–09 upstream gates | CI green, installed/browser/native/mirror/source hashes agree, new release assets/index entry or complete mirror available, Hohfeld release linked and exact support inventory including external residuals published |

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

External managed qualification requires an authenticated, authorized isolated target,
selected Databricks/Lakebase profile, database/schema/role provisioning authority,
allowed network path and consumer test configuration. The integration owner has
requested profile/test-target information without requesting credential content.
The Praxis owner supplies the target-bound consumer runner and private receipt;
this upstream task supplies reproducible fixtures and package/support custody.
Any runner must verify target identity/permissions and create only authorized
disposable objects. Do not execute against a guessed production target. Missing
managed evidence leaves EC-10 and MIG-G09 unverified; it does not block the
clarified upstream release scope. No managed adoption claim follows from it.

Hohfeld delivery similarly requires its repository/release authority and actual
installed release. Inspect existing changes before editing; finish missing
behavior rather than replacing working current-core support. A public release
candidate may be prepared while external tests are pending, but the requested
fully completed release must not be reported until all selected upstream gates
pass. The owner's 2026-10-22 scope correction excludes changes to Praxis and
consumer-owned acceptance work; this is not a waiver of upstream qualification.

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

### Source and local qualification checkpoint

The governing plan is committed at `40316ae54`. Parallel integration includes
G01 compiler/schema and history fixes (`d03d2d053`, `fc169ae21`), the U5 host
boundary (`f5cc72a40`), U6 containment (`905e52581`), U7/U8 tooling (`b9ee3430e`)
and U4 authoring (`7409eacc8`). Candidate versions are SDK 0.5.5, access
0.1.0.dev7 and codegen 0.1.0a4 (`086becf5c`); none is published.

EC-01 admission precedes feature changes. The integrated Python graph checks 92
modules with zero violations; focused migration/history/boundary regressions pass
76 tests/442 assertions. G01's Chromium corpus passes 96 assertions; U4 extends
browser parity to 98 and has eight local PostgreSQL domain/comment checks. Final
installed-cohort qualification remains open. The old 0.5.4 oracle is retained
separately. Review found and the compiler owner fixed historical 0.2 NULL-literal
verification and selection of a command introduced only in next source.
Independent fix review and native writer/recovery gates remain open.

U6's five real-parser test families and boundary negative controls pass. Source
review found no blocker within its inert subset; see the
[API/refusal guide](guides/sql-containment.md). Native catalog and execution
authority are separate. Its installed optional matrix still needs CI receipts.

U7/U8 have four intended cells, not four final tested-cell claims. Twenty-four
pinned dependency wheels were acquired. Review found release blockers in relative
License-File handling, actual OS identity and network isolation/remote dependency
closure. Fixes and the complete final candidate offline install remain in
progress; the lock template is not an installation lock.

Hohfeld 0.5.0 is verified as published at 2026-10-21T22:49:32Z. Downloaded wheel
and sdist match published SHA-256 digests. Its installed reader passes 29 tests;
its installed Truss adapter passes two native full-corpus acceptance tests on
disposable PostgreSQL 18.6. The test/harness bytes match the released sdist. The
independent same-document UMF/Weft/Hohfeld journey and explicit legacy controls
remain open. This makes no full-core conformance claim.

The available private cohort has ten table declarations plus its module and four
SQL/snapshot pairs; all four snapshots also contain ten tables. The upstream
eleven-table statement remains unreconciled. No private source is copied here.
Authorized isolated managed-target information is pending; EC-09/10 acceptance is
not claimed.

U5's persistent approval relation exposes an integration gap: generated-reader
inventory admits only its original fixed metadata. Before final qualification,
select a closed successor installation-reference/metadata profile binding exact
approval relation/ACL proof to verified source/history. Do not add an old-profile
inventory exception or discard durable approvals. CLI receipt custody, this
successor boundary, native atomic/recovery tests and independent review are the
next U5/G01 gates.

### Review continuation, 2026-10-22

Closed approval metadata/reference 0.3 and three-state host verification are
integrated at `2fea3f678`. The native U5 harness observes apply and immediate
replay, person/batch correspondence, denied approval-table reads and a generated
action. This is provisional source-runtime evidence, not a frozen installed
cohort. Sol review still requires historical 0.3 replay after a later migration
and executable command-only publication; both are implementation work in progress.
G01's writer barrier has reached a blocked person UPDATE and native NOT NULL
refusal after pair commit. Final acceptance additionally requires exact failure
causes inside the pair, rollback after dispatched UPDATE, date/clock coverage and
independent installed replay; no generic CatalogError counts as constraint proof.

Type checking, 92-module Python boundaries and 381 schemas pass at this source
checkpoint. The complete offline acquisition helper ordering/lifetime fix is
integrated at `9a79c8909`; its actual macOS 27 ARM64/Python 3.14 run acquires all
eighteen distributions and passes network-disabled install/probe plus missing and
tampered wheel controls. Earlier actual Python 3.11 receipts and four intended CI
cells remain separately scoped. Final source freeze and runner-specific CI
receipts remain open.

The same exact public document now passes Bun DDD inspection and installed
Hohfeld 0.5.0/Truss 0.0.45/Weft 0.4.49 execution on PostgreSQL 18. The public
[U9 receipt](evidence/hohfeld-public-reader-u9-20261021.json) qualifies that
facet-free document only. Independent review finds released Hohfeld can silently
ignore Field allowedValues and unknown Field extensions. This violates its own
unsupported-construct refusal contract; a bounded reader fix is being prepared in
an isolated Hohfeld checkout. U9 remains open pending that fix, review and renewed
installed evidence; no general reader conformance is claimed.

Private source inspection accounts for ten tables, 48 columns, two foreign keys,
ten explicit indexes, one enum check and one range check, with no ignored checks.
Nine tables carry scope and one explicitly reviewed table is unscoped. Scope
forms include owner, group, via and parent-through behavior. Original four SQL
and snapshot pairs remain untouched. This inventory does not establish EC-09
conversion or acceptance. The managed target request is still pending and EC-10
remains open. No new release or PR has been published at this checkpoint.

## Risks and Rollbacks

Owner clarification, 2026-10-22: no Praxis files have been edited. The supplied
handoff asks its owner to convert authoring/typed calls, reconcile ten versus
eleven tables, preserve four original migration pairs, design ledger transition,
and qualify local/managed adoption before removing consumer code. EC-09 now owns
upstream fixtures and that handoff only; EC-10 is external follow-up. Earlier
checkpoints describing consumer acceptance as a release gate are superseded by
this explicit scope decision. MIG-G09 stays open in the candidate inventory.

Final U9 scope review qualifies the released Hohfeld 0.5.0 exact facet-free
current-core document journey and actual release date, satisfying EC-08's
selected subset. Additional Field refusal fixes pass source review and the
upstream default suite but are unreleased follow-up changes; they are not
advertised as part of Hohfeld 0.5.0. Earlier checkpoints requiring their release
overexpanded U9 and are superseded. No broader facet closure is inferred from
projected metadata: the provider receives original source and owns native
constraint semantics. Preserve that distinction in the release inventory.

Draft UMF PR 44 runs hosted qualification. U5 fixes are source-reviewed and its
installed native tamper/lost-publication harness passes. G01's unchanged-default
refusal was fixed by sharing the existing typed column renderer between
deployment and successor migration compilation, retaining historical paths.
The scoped installed v2 cohort at source `435ed5844` has source/wheel/installed
equality for 88 access and 18 codegen files and 1,657 installed RECORD hashes;
its thirteen-case native fixture is undergoing independent replay. These package
bytes are frozen independently of later tooling-only inventory updates.

Independent design/native review now accepts that exact v2 cohort: thirteen
installed G01 scenarios, nine supplemental checks including actual lock timeout
SQLSTATE 55P03 before any fill, and the installed host replay/tamper/lost-response
journey. The [preserved review packet](evidence/schema-migration-design-review/g01-review.json)
records hashes, original probes, fixture archive, native reports and cleanup.
G01 is closed only for its standalone single-Field maintenance subset; G02–G11
remain open as individually enumerated. Browser parity passes 103 assertions,
including unchanged future defaults and the original 0.2 fixture. A fresh SDK
archive installs and passes 139 conformance cases. Remaining release gates are
final tooling source review, actual platform/offline cohort receipts, final
source/asset correspondence and immutable merge/release/post-download checks.


### Current-main integration, 2026-10-23

All hosted checks at `75ef423efd9c6c412e72d2f9703fe052e12ea380` completed
successfully. Four exact frozen-v2 default-mirror cells cover Ubuntu 24.04
x86_64 and macOS 14 arm64 with Python 3.11/3.14. Four optional parser cells
pass, but their original logs do not establish wheel hash identity; the successor
workflow must retain artifact hashes before final optional-cohort qualification.
The source/evidence review is preserved in
[evidence/praxis-embedder/sol-final-source-review.json](evidence/praxis-embedder/sol-final-source-review.json).

Main's R3 compiler port is integrated at `b8c47b23c`. Default Python compilation
still uses V8; additive Rust migration profiles 0.1/0.2 do not imply G01 profile
0.3 support. Generated compiler provenance changed, requiring fresh access/codegen
assets, package/input diffs, installed native checks and offline qualification.
The frozen v2 receipts remain immutable historical evidence. Fresh merged-source
SDK installation passes 139 conformance cases, TypeScript checking passes, and
focused G01/lifecycle regression passes 13 tests/64 assertions. Final combined-head
CI, reviewed v3 asset custody and publication remain open.

| Risk | Response and recovery |
| --- | --- |
| Fill and tighten separated by a commit | Compiler emits one typed paired phase; host rejects split phases. Uncommitted pair rolls back; after commit retain data/constraint and fencing until exact resume or approved forward repair. |
| Host abstraction weakens native safety | Require explicit durability, locking, native verification and unknown-outcome capabilities; preserve strict legacy adapter verification and prove genuine native failure/recovery. |
| Parsed containment is treated as general SQL safety | Closed optional subset, exact schema/object/callable closure and no execution authority; refuse unknown syntax and retain source. |
| Platform or mirror claims exceed receipts | Publish only tested matrix cells and complete locked closure; failed cells remain unsupported and block any consumer that needs them. |
| Private consumer leakage or unavailable managed target | Keep original sources/receipts private; publish aggregate hashes. Continue independent work; retain explicit EC-10 blocker and executable handoff. |
| Hohfeld constant mistaken for delivery | Installed same-document behavior, actual host journey and published release/date are required; retain old distribution and source for rollback. |
| Published asset mutation | New immutable versions for changed artifacts; reuse unchanged core release bytes; retain old cohorts and document forward-only data effects. |

### Qualification transport continuation, 2026-10-23

The [transport diagnosis](evidence/praxis-embedder/cli-stdin-transport-diagnosis.json)
records an intermittent local input-pipe wait: 41 repeated fixture runs completed,
then the Rust CLI waited in stdin `read_to_end` while Node and Bun waited on
children. Captured process samples precede termination of the disposable diagnostic
group. This does not prove the cause of the still-running hosted macOS jobs.

The reviewed harness uses private file-backed stdin with identical wire bytes,
inherited working directory/environment and serial comparisons. CLI waits have
fatal timeouts, output bounds, process-group termination and cleanup. Existing
public CLI stdin semantics and product behavior remain unchanged. Nine transport
controls, 139 CLI cases plus three controls, 100 repeated fixtures/500 requests,
and all 102 compiler fixtures/615 cases pass on the recorded local macOS 27
runtime. The [source review](evidence/praxis-embedder/cli-stdin-transport-review.json)
distinguishes these runs from the final command-logging-only delta.

EC-11 still requires fresh exact-head CI and package/input/asset custody before
merge and immutable publication. Original source and execution receipts retain
their actual identities; no historical evidence is relabeled. Every required matrix cell must pass on the new source tree. A timeout remains
a failure; every fixture retains its complete result comparison.

## Exit Criteria

Plan readiness requires concrete ownership, boundaries, sequence, shared interface
agreement and test allocation; it does not establish implementation completion.
Full execution completes only when:

- U4–U9 and the selected finite G01 behavior pass their stated source/native,
  browser and installed gates; the new profile preserves historical verification.
- Upstream domain and conversion fixtures pass, and the Praxis owner receives
  an adoption handoff preserving original history. Actual consumer replacement
  and managed EC-10 acceptance remain externally owned, unverified residuals.
- The complete offline mirror and advertised V8 matrix pass exact-cohort tests;
  actual Hohfeld current-core release assets and date are available.
- Independent changed-source/evidence review, CI and final package/hash custody
  pass; another immutable release is published with qualified support inventory.
- Required canonical docs and runnable handoff/recipes agree; no selected gate or
  material blocker remains. Unselected MIG residuals retain their explicit limits.
