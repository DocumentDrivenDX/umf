---
ddx:
  id: umf.typed-persistence-design
  type: implementation-plan
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.prd
      kind: informed_by
    - id: SD-028
      kind: informed_by
    - id: SD-029
      kind: informed_by
    - id: SD-030
      kind: informed_by
    - id: SD-031
      kind: informed_by
    - id: TP-001
      kind: informed_by
---

# Typed data access SDK: design and build handoff

## Scope

A schema-first Python data access SDK generated from UMF. Developers get typed
models, a precompiled query and search catalog, typed action clients, and runtime
targets for raw Postgres, Lakebase, Unity Catalog and Spark/Delta tables and for
Truss ontologies and Ashlar publications. Main now includes a recovered stage-one generator and local Python model/value/DSL runtime. Only the source-pinned component evidence below is complete; the full SDK surface, catalogs, native targets and engine adoption remain subject to their separate acceptance gates.

This handoff replaces the first typed-persistence draft (commit 81d78af2) after an
independent review and owner decisions recorded in
[the Claude review record](evidence/typed-persistence/claude-review.json). It is
indexed by the canonical implementation plan and does not change its release
priorities or the TableSpec-first goal.

### Read the design

| Layer | Artifacts |
| --- | --- |
| Direction | PRD FR-52 to FR-55 |
| Features | [FEAT-028](../01-frame/features/FEAT-028-typed-model-generation.md) typed models, [FEAT-029](../01-frame/features/FEAT-029-precompiled-queries-and-search.md) queries and search, [FEAT-030](../01-frame/features/FEAT-030-typed-actions-and-native-targets.md) actions and native targets, [FEAT-031](../01-frame/features/FEAT-031-engine-target-adapters.md) engine adapters |
| Decision | [ADR-004](../02-design/adr/ADR-004-typed-data-access-sdk.md) |
| Contracts | [CONTRACT-067](../02-design/contracts/CONTRACT-067-access-sdk-generator.md) generator, [068](../02-design/contracts/CONTRACT-068-generated-python-types.md) Python types, [069](../02-design/contracts/CONTRACT-069-engine-target-adapters.md) engine adapters, [070](../02-design/contracts/CONTRACT-070-access-extension.md) `umf.access` extension, [071](../02-design/contracts/CONTRACT-071-query-command-catalog.md) query DSL and catalog, [072](../02-design/contracts/CONTRACT-072-runtime-targets.md) runtime and targets, [073](../02-design/contracts/CONTRACT-073-native-sql-action-profile.md) native SQL action profile, [074](../02-design/contracts/CONTRACT-074-search.md) search; [075](../02-design/contracts/CONTRACT-075-access-temporal-profile.md) typed-access temporal validation |
| Solution designs | SD-028 to SD-031 |
| Stories, designs, tests | US/TD/STP-080 package generation, 081 models and codecs, 082 type-checked queries, 083 precompiled reads, 084 search, 085 actions on raw tables, 086 bulk commands, 087 Truss adapter, 088 Ashlar adapter |
| Evidence | [DSL typing spike](evidence/typed-persistence/dsl-typing-spike/README.md) |

### How the pieces fit

```
UMF documents + umf.access ──(stage 1, TypeScript)──► generated package: models, keys, c/s namespaces, action clients
developer @query/@command modules ──(stage 2, Python + Weft)──► checked-in catalog of native statements per target
application ──► generated functions ──► umf_access runtime ──► target
                                                         ├─ raw tables: host's native SQL connection
                                                         ├─ Truss: protected read, action and bulk paths
                                                         └─ Ashlar: resolver-pinned reads
```

### Responsibility map

| Owner | Responsibility |
| --- | --- |
| UMF | `umf.access` extension, stage-one generator, generated type ABI, `umf_access` runtime, raw-table adapters, native SQL action profile, conformance suite |
| Weft | All SQL lowering: reads, raw-table backends, action and search lowering, mutation plans, parameter carriers and decoders |
| Truss | Truss adapter; protected admission, transactions, journal, feed, receipts, bulk execution |
| Ashlar | Ashlar adapter; resolver, pins, retention, publication |
| Host application | Connections, credentials, configuration, embedders, index population, migrations, deployment |

## Shared Constraints

Schema-first: no string column references and no SQL built from runtime input.
No artifact-supplied code or network loading; no inference from names; no silent
loss. Generated code holds no connections or table handles. Writes go only
through actions or catalog bulk commands. Engine storage is never a binding
target.

## Cross-repository Dependencies

Weft is the only SQL lowering for every target; UMF builds no interim lowering.
UMF's requests to Weft are written as
[the Weft requirements](weft-requirements-typed-access.md) and were delivered to
Weft as `docs/helix/00-discover/umf-typed-access-requirements-input.md` (Weft
commits `bfe0b88`, `c7431eb` and `588e615`). A Weft agent is implementing them. UMF work proceeds in
parallel: generation, types, DSL and static typing need no Weft change, and each
catalog slice is qualified per target as the matching Weft requirement lands.

| ID | Owner | Needed capability | Weft requirements | Blocks |
| --- | --- | --- | --- | --- |
| W-0 | Weft | Compile inputs and outputs the catalog needs: structural digest, logical SQL echo, carriers, raw-table security profile | WR-I3, WR-I4, WR-I6 | B-TP-006 onward |
| W-1 | Weft | Tranche A query forms (comparisons, null tests, OR/NOT, IN, ordering, general keyset pages, counts, temporal values, aggregates and buckets, prefix and term filters, snapshot pages, null-safe distinctness and declared to-one joins) | WR-A1 to WR-A14 | Forms beyond today's Weft subset, per target |
| W-2 | Weft | Raw-table read backends: Postgres and Lakebase, then Unity Catalog and Spark/Delta, over UMF bindings and `umf.access` ColumnSets | WR-B1, WR-B2, WR-B5, WR-B7 | B-TP-008, B-TP-009 |
| W-3 | Weft | Distinct manifest catalog/template and native atomic-program interfaces; no raw reuse of frozen/batch plans. Wider value support is separately gated by U-3/WR-A9. Weft's existing Truss mutation backend admits only string and boolean fields | WR-A9, WR-I5, WR-B3, WR-B6 | B-TP-007, B-TP-011 |
| W-4 | Weft | Action lowering, validate-only rollback programs and created/changed Keys on Postgres and Lakebase, then Unity Catalog and Spark/Delta | WR-B4, WR-B6 | B-TP-010 |
| W-5 | Weft | Search lowering | WR-C1 to WR-C5 | B-TP-012 |
| W-6 | Weft | Released Python distribution that the catalog build can pin | WR-I1 | Release of any catalog-dependent scope |
| T-1 | Truss | Public action admission, read and bulk APIs callable by an adapter; Truss-local adoption design; typed carriers for timestamp and binary fields and exact values (CONTRACT-069 current limits); attribution is decided by Truss admission from the host-supplied connection, not by the SDK | — | B-TP-013 |
| A-1 | Ashlar | Resolver API for pinned execution by an adapter; Ashlar-local adoption design; core 0.8 document admission; byte equality between Ashlar's read-time recompilation and catalog entries; instant and numeric decoders beyond `published_at` and string scalars | — | B-TP-014 |
| U-1 | UMF | CONTRACT-901 rule profile support for decimal values | — | Decimal action conditions |
| U-2 | UMF | CONTRACT-042 raw binding profile definitions/inspectors are implemented and locally tested; native target binding/admission remains separately unqualified | — | B-TP-002, B-TP-008 |
| U-3 | UMF | CONTRACT-902 null and wider value domains for bulk SET, matching WR-A9 | — | Bulk `SET NULL` and non-string/boolean SET |

## Coordinated SQL-to-actions implementation ledger

This is the canonical shared dependency matrix for this SDK and the existing SQL-to-actions work. It does not replace either owner's governing action protocol. The SQL-to-actions implementation plan's “Portable plan/unsealed manifest construction” and “Browser-local declaration profile” sections link to this ledger after publication. Browser work proceeds independently of Python generation.

| Lane / order | Owner and exact boundary | Prerequisites and completion evidence |
| --- | --- | --- |
| L0: existing browser String UPDATE proof | Weft lowering; UMF construction; Truss registration, issued read grant, frozen selection, sealing, submit and workers | Existing local Products source cohort b8 model / 6f preparation / 633f producer remains immutable. Current tracked branch `codex/security-action-source-custody`, checkpoint a3852847, has worker-owned registration and read grants; this is component evidence, not end-to-end acceptance. Remaining gates: provider frozen materialization and Key receipts/seal; keyed submit with full control recovery; atomic batch outcomes/replay; browser cases below; Astra E2E; signature/build/deploy/public verification. No Python SDK, catalog template or new umf.access annotation is prerequisite. |
| L1: shared semantics and ABI | UMF CONTRACT-067–074; exact full-document ActionRef, selected/per-Key DTOs, presence/null policy, complete original results/control recovery and full cursor context | B-TP-001–005; stage ownership and deterministic generated artifacts; exact source/profile pins. Specification correction is not runtime qualification. |
| L2: catalog compilation and first-consumer reads | Weft owns versioned structural digest and complete read/manifest/native-command/search artifacts, including all security and source inputs | W-0, WR-I3/I5/I6 owner interface and golden corpus; missing output is WEFT_BLOCKED. Praxis raw reads start independently at WR-A1/A2/A3/A5/A8/A13 + WR-B1/B2/B7, with async/stream/timeout/schema-binding and third-checker gates scoped to the claimed surface. Manifest W-3, raw W-3 and wider SET U-3/WR-A9 are independent gates. No local SQL lowering, local digest stripping or profile cast. |
| L3: Truss SDK adoption | Truss owns protected read/action/control APIs and workers; UMF owns SDK ABI and shared conformance | Reads may qualify first (B-TP-006). Actions B-TP-013 require exact revision correspondence and complete original tx/1 results. Bulk B-TP-007 additionally requires Truss action gateway and control adoption, original attempts/submission keys and recovery before a job reference exists. Browser L0 does not qualify US-087 or the wider SDK surface. |
| L4: raw native targets | UMF raw adapters over Weft programs; native privileges and CONTRACT-073 admission | Qualify TD-085 action execution, side-effect closure/fence, role semantics, count/precondition/no-op classification, concurrency and receipt/reconciliation first (B-TP-010). Then TD-086 atomic bulk B-TP-009; each backend separately. Native SQL, tx/1 human/session profiles and browser-local owner/905 remain separate profiles. |
| L5: search and publication consumers | Weft search programs; UMF raw search runtime; Ashlar owns publication/resolver/ACK protocols | Search needs bounded programs and current filtered hydration before per-platform witnesses. Ashlar B-TP-014 requires its original pin/retention/read equality witnesses and never receives a bypass mutation path. |
| L6: source-cohort integration | Each producer/provider owner, coordinated by UMF and SQL-to-actions maintainers | New umf.access annotations change full model bytes: prepare, admit, compile and qualify a new cohort. Merging later UMF sources also changes global producer identity even if action meaning is unchanged. Retain original frozen artifacts, build and separately qualify the new cohort; never relabel old hashes or rewrite pins to simulate acceptance. |

L0's browser witness set includes three items in batches [2,1], no-op, refusal, stale/foreign seal, duplicate submission, reload, ACK loss, multiple tabs and injected failure, with state/journal/feed/receipt and recovery observations. Keep the original worker and admission protocols intact; generated persistence never bypasses actions. Truss native person/SCRAM proofs, local-owner proofs and raw native-session proofs cannot substitute for one another.

Owner observations used for coordination: SQL-to-actions source at `e02fc2198a2fab3f84d0d01673d2d1100ea5a395`, later worker checkpoint `a3852847`; Weft `94b2de5e` CONTRACT-006; Truss `a9cfb691` CONTRACT-013; Ashlar `855ab296`. These are separate repository snapshots, not claims of implementation at the expanded SDK baseline. Before implementation, resolve and retain full owner commit/artifact hashes in the adoption packet. The SQL-to-actions owner retains its construction and local-profile receipts under `evidence/bulk-update/`; this ledger does not transfer their authority.

## Implementation Slices

All paths and commands are planned. Do not label an absent command passing.
Slices B-TP-000 to B-TP-005 need no Weft change. Praxis makes Lakebase/Postgres 18 schema-neutral reads the first consumer path: B-TP-008 starts when WR-B1/B2/B7 and its minimum query forms land, in parallel with the existing Truss slices. Wider forms qualify independently; Unity Catalog and Spark/Delta follow their own backend gates.

| Slice | Story / artifacts | Depends on | Validation gate / observable outcome |
| --- | --- | --- | --- |
| B-TP-000 | Architecture module map | Approved scope | Boundary checker for `src/compilation/` and `python/umf_access/` wired locally and in CI |
| B-TP-001 | CONTRACT-067/068/071 | B-TP-000 | Compatibility spike pins Python 3.11+, Pydantic 2.14+, pyright, mypy (check_untyped_defs) and ty versions and settings, drivers and platform versions; extends the DSL typing spike to the full error table and `MISSING` strictness; generated output is tested against the pinned `umf_access` runtime ABI |
| B-TP-002 | US/TD/STP-080 | B-TP-001, U-2 for raw-table ColumnSets | `umf.access` schema and every allow-table row have fixtures |
| B-TP-003 | US/TD/STP-080 | B-TP-002 | Stage-one generator, census, drift check and hand-edit refusal; Bun and Chromium bytes agree |
| B-TP-004 | US/TD/STP-081 | B-TP-003 | Models, keys and codecs pass value, presence and golden-vector corpora |
| B-TP-005 | US/TD/STP-082 | B-TP-004 | DSL capture, rendering to Weft SQL and static corpora pass on pinned pyright, mypy and ty; the renderer's output for every tranche-A form matches the Weft requirements' grammar |
| B-TP-006 | US/TD/STP-083, 087 | B-TP-005, W-0, T-1 reads | Catalog build and reads against Truss for the forms Weft supports today, executed through Truss's read path; unsupported forms refuse with `WEFT_BLOCKED` |
| B-TP-007 | US/TD/STP-086, 087 | B-TP-006, W-3 manifest catalog interface, T-1 qualified action gateway and control protocols | Bulk UPDATE on Truss through CONTRACT-009, sealed manifests and coordination; exercises `PLAN_DRIFT` until plan templates land |
| B-TP-008 | US/TD/STP-083 | B-TP-005, W-0, WR-A1/A2/A3/A5/A8/A13, WR-B1/B2/B7 and applicable U-2 | Schema-neutral reads on pinned Postgres 18 and Lakebase, including `verify()` refusals and the shared acceptance corpus |
| B-TP-009 | US/TD/STP-086 | B-TP-010 (qualified TD-085 foundation), W-3 native atomic program | Atomic, bounded bulk commands on Postgres and Lakebase |
| B-TP-010 | US/TD/STP-085 | B-TP-008, W-4 | Actions on Postgres and Lakebase pass conformance and native witnesses, including commit-loss reconciliation |
| B-TP-011 | US/TD/STP-083, 085, 086 | B-TP-010, W-2, W-3, W-4 | Unity Catalog and local Spark/Delta reads, bulk and single-statement actions; Unity Catalog on a separately selected workspace or left unqualified |
| B-TP-012 | US/TD/STP-084 | B-TP-008, W-5 | Search on Lakebase and Postgres; Unity Catalog vector search on a selected workspace |
| B-TP-013 | US/TD/STP-085, 087 | B-TP-006, T-1 actions | Truss action adapter passes conformance and Truss witnesses in the Truss repository |
| B-TP-014 | US/TD/STP-088 | B-TP-006, A-1 | Ashlar adapter passes conformance and Ashlar witnesses in the Ashlar repository |
| B-TP-015 | TP-001, all STPs | All claimed scopes | Unchanged-source replay of generator, catalog, static, native and browser evidence |

Each target and engine adapter is qualified separately; no local pass substitutes
for managed Unity Catalog or engine witnesses.

## Recovered implementation status — 2026-10-15

Baseline main `5bcfaec09075bb02586f7e04f9aa349208582d35` recovered the original work through `bf0b9cc7`; this review integrates main `1ba3a2a5` (reporting implementation `93ba935b`) and the later `b19a997a` non-temporal codec/creation E2E cut. The [Astra implementation review](evidence/typed-persistence/implementation-review-20261015/astra-review.json) checks actual code against current specs; [fresh verification](evidence/typed-persistence/implementation-review-20261015/verification.json) records corrected-source replay. Historical recovery/packaging evidence remains immutable and does not qualify changed source. The [baseline rereview](evidence/typed-persistence/implementation-review-20261015/astra-baseline-rereview.json) covers `25382ec3`; the [reporting-cut Astra review](evidence/typed-persistence/implementation-review-20261015/integrated-main/astra-review.json) and [reporting-cut verification](evidence/typed-persistence/implementation-review-20261015/integrated-main/verification.json) cover `2aff369d`. The [latest-main review](evidence/typed-persistence/implementation-review-20261015/latest-main/astra-review.json) and [latest-main receipts](evidence/typed-persistence/implementation-review-20261015/latest-main/verification.json) qualify the later combined subset.

| Scope | Complete component / current state | Still required for slice closure |
| --- | --- | --- |
| B-TP-000 | Local TS/Python boundary maps and violation controls implemented; current local commands replayed | Remote CI observation for the final integrated source; checker success is not SDK acceptance |
| B-TP-001 | Exact local Python3.14.8/Pydantic2.14.1 wheel build and Python3.11.17 reporting replay; scoped pinned three-checker evidence | Complete corpora/settings and qualified release profile. Declared Python>=3.11,<3.15 is a compatibility range, not evidence that every interpreter/platform combination passes |
| B-TP-002 | Access schema/context/matrix admission, explicit selected Key and distinct alternate Key DTOs, nested presence and safe refusals | Full per-story criteria and any additionally claimed schema/Key/profile breadth; same-shaped alternate Keys cannot substitute for the selected Key; native uniqueness remains a separate obligation |
| B-TP-003 | Deterministic stage-one candidates, source census/hash, naming/refusal, host writer/drift checks; four stage-two paths preserved; Bun/Chromium parity | Full STP-080 closure for the final qualified profile and ordered prerequisite record; report/candidate is not native schema acceptance |
| B-TP-004 | Generated model/Key/projection/action-input types and shared metadata-driven validators/codecs; thin CodecField metadata-driven row/projection codecs, shared final/Key guards and exact installed-wheel replay | Complete US-081 matrix and action client/result ABI, target transport/native proof. ActionRef now retains exact source, not issued engine authority |
| B-TP-005 | In-memory capture/render for implemented forms, source-bound command identity, generated explicit update keywords, bounded grouped counts and guarded owner typing | Complete revised DSL (aggregates/buckets, prefix/terms, distinctness, four-edge/snapshot joins, ranked search), genuine stage-two generated callsite/refactor corpus and owner Weft interface/grammar qualification |
| B-TP-008 partial | Narrow `ReviewedSQL`/`weft.raw-read/0.1` catalog, generated DSL bridge (up to three to-one edges), schema-neutral bounded reads and keyset pages, native role/RLS/key/timeout checks on disposable PostgreSQL18.6; Lakebase18 compile only | Full CONTRACT-071/072 catalog/Target ABI and exact profile acceptance; full DSL semantics; Lakebase endpoint/service-principal/native transport proof; async/streams; restore/incarnation and collation/session continuation identity; complete STP-083 closure |
| B-TP-006–007,009–014 | No qualified Truss/Ashlar SDK adapter, native command/action, search, Spark/Unity Catalog SDK target delivered | Weft complete artifact boundary; qualified action/atomic-command/receipt/reconciliation protocols; original Truss registration/selection/sealing and Ashlar publication/ACK witnesses |
| B-TP-015 | Component receipts identify exact generator/runtime/source inputs | Integrated unchanged-source replay and every claimed scope's prerequisites. No blanket completion or publication claim |

Completed fixes preserve full source pins through action capture, reject ambiguous action Python names and unsupported Key reuse, replace unpacked keyword updates, constrain foreign-column operands, bound grouped results, share validation/conversion logic, sanitize persistence decode locations, and preserve `_umf/privileges.json`. Integrated read fixes preserve raw parameter extras for rejection, sanitize host model errors, validate cursor nullability/carriers on both input and output, exclude nested-only projection members, require matching qualified native Key equality/collation, and bind generated records/fields/models/Keys and restored catalogs to exact source/cohort/runtime pins. The later main integration preserves shared CodecField/projection codec metadata and nested exact-model identity checks. It also refuses duplicate unqualified wire Field IDs and compares complete selected-Key identity for get/page; the active nullable map-value fixture now satisfies both row/create F/T in unchanged CONTRACT-070. Latest wheel `5cd2c9090ce87e9ced925c1e6d256af3dac4f444d24f3b68f84ddd4f86ec1989` passes103 isolated component tests on each Python3.11.17/3.14.8, plus83 public schema-load/CLI/creation/codec checks on each;24 actual-Weft/native/provenance tests pass with zero skips. Bun944 tests/3271 assertions, TS/Python boundary checks, three pinned checkers (generated positives and19 misuse cases each), and Chromium15-case parity plus3 joined cases pass. Fresh exact-source receipts are linked above. These are named component gates, not whole-slice closure. The corrected wheel has its own SHA; it does not overwrite or inherit the older `9189...` wheel's acceptance. Nominal `0.1.0.dev0`/ABI0.1 remains an unreleased local pairing; only the exact byte-qualified wheel and regenerated package are observed here.

Next: close the remaining B-TP-001–005 acceptance criteria and qualify the existing first-consumer read subset against the full B-TP-008 contract. The narrow reviewed-SQL profile is executable progress, not completion of the planned general catalog/Target ABI. Truss browser/local-905 progress and the separate performance/publication hold remain owned by the SQL-to-actions/Truss workstream; this recovery review neither releases that hold nor promotes L0 into SDK adoption. New main source changes produce a new action-plan producer identity; preserve and separately qualify cohorts, never relabel frozen artifacts.

The PR #21 merge reconciliation also incorporates main `0b2bf0c1`: source-bound action client/dispatch types, stage-one/runtime catalog generation guards and snapshot export components, plus independent UUID work. [Merge verification](evidence/typed-persistence/pr21-merge-20261016/verification.json) records fresh installed-wheel, native, typing and CI-gate results. These additions do not close native action/engine adoption gates or qualify a new frozen browser cohort.

## Execution Contract

The owner authorizes implementation of the ordered slices, test-first, with
closure only through their STP gates and fresh executable evidence. On
2026-10-15 the owner explicitly waived the spending-ceiling prerequisite:
“Right now I don't care just get it done.” No numeric ceiling is selected;
this is an owner-directed waiver, not a measured budget or a claim of unlimited
resources. Token estimate and aggregate dollar metering are unavailable. Include
implementation, verification and review in execution records. No tracker is selected.

The coordinating chat owns integration. Separate subproject chats prepare and
implement independent work in parallel while preserving slice dependencies;
dependent slices close only after their prerequisite gates pass. This authorization
does not extend to production operations or migrations.

## Continuation Evidence

When implementing, retain exact plan, source, profile and catalog revisions,
completed slices, command outcomes, failed attempts, pending lanes and the next
action under `evidence/typed-persistence/`. Do not reuse acceptance for changed
inputs.

## Validation Plan

At design time, run `check_structure.py` for unique IDs, required sections, link
resolution and AC traceability across all artifacts added since the base branch.
Only named source/version-pinned executable receipts establish the component results above. All other STP/native/consumer criteria remain UNTESTED; write regressions for repairs and close slices only through their complete gates.

## Risks and Rollbacks

| Risk | Response | Rollback |
| --- | --- | --- |
| `MISSING` or strict-mode behavior differs on the pinned stack | Profile stays unqualified | Keep previous generated package |
| Weft cannot lower a DSL form for a target | Form refuses at catalog build | Remove the declaration or target |
| A raw-table platform cannot meet a CONTRACT-073 row | That capability refuses on that target | Use Truss for that action |
| Engine adapter differs from engine-native behavior | `ADOPTION_MISMATCH`; adapter not selected | Engine's own client remains in use |
| Asynchronous search index lag surprises callers | Freshness is declared and recorded as an obligation | Use transactional indexes where available |

## Exit Criteria

Design completion means coherent draft artifacts, passing structure checks, a
recorded review with dispositions, and the typing spike. Implementation readiness
additionally requires the owner decisions below and an execution budget. Runtime
completion requires every claimed native and engine gate.

## First Consumer Feedback

Praxis, an apps host for a law firm, reviewed the proposal as a prospective first
consumer: per-application Postgres/Lakebase schemas, per-user connection pools
with a service account for batch work, Python 3.11, and ty as its gating type
checker. Its feedback is reflected as follows:

- **Schema-neutral catalogs** (`schemaBinding: "search-path"`, Weft WR-B7): no
  schema in the catalog, generated code or call sites; the host binds it per
  connection.
- **Per-user connections**: targets declare `sessionPrincipal: human`; per-user
  pools can satisfy `person-required` only through qualified native authentication/principal correspondence, and a separate `service` target serves
  batch jobs. `verify()` results are cached so per-request pooled connections pay
  only a schema-resolution check.
- **Timeouts**: every call takes a timeout; `TimedOut` means nothing committed;
  only `Indeterminate` may hide a commit.
- **Query forms**: aggregates with group-by (WR-A10), null-safe
  `is_distinct_from` (WR-A13) and typed joins along declared to-one relationships
  (WR-A14); to-many walks use `.related()`. Bounded streams replace raising the
  page cap for exports.
- **Composing writes**: one action with several effects, not a transaction across
  actions.
- **Type checkers**: the typing spike passes on pyright, mypy and ty targeting
  Python 3.11, after switching bulk `update()` to explicit keyword parameters.
- **Toolchain**: Pydantic 2.14 or later is required for the stable `MISSING`
  sentinel.
- **Priority**: Lakebase (Postgres 18) is this consumer's first target, so
  B-TP-008 starts as soon as Weft WR-B1, WR-B2 and WR-B7 land, in parallel with
  the Truss slices.

## Owner Decisions Recorded

- On 2026-10-15, the owner approved real-document tests for reachable presence rows and direct policy tests plus core counterexamples for the explicitly hypothetical absent-allowed/Null=no premise. Core semantics remain unchanged.

- On 2026-10-15, the owner approved an exact-only initial SDK profile: strict and report both refuse unsupported selected meaning. Approximation remains a separately governed future profile; CONTRACT-067 and US/STP-080 AC3 carry this decision. Temporal qualification remains held by the current execution request.

- On 2026-10-15, the owner selected a governed typed-access temporal validation
  profile using authored `umf.access` instant/local distinctions as the Python
  conformance oracle. Generic core temporal semantics remain undefined under
  CONTRACT-049; temporal Key components still refuse under CONTRACT-070.

- Weft is the only SQL lowering. UMF writes Weft requirements early and does not
  block its own work on them; no interim UMF lowering is built.
- The 0.1 DSL surface is Weft tranche A. Generated types expose it; targets whose
  backend lacks a form refuse it at catalog build.
- The SDK uses whatever connections the host supplies (per-user or service
  account). Raw-table targets declare `sessionPrincipal`; `person-required`
  actions compile only for `human` targets. Truss decides attribution itself.
- On raw Delta tables, sole SDK writing is a host obligation, not a uniqueness proof; concurrent creates need a qualified native conflict or serialized per-Key path, otherwise creates refuse.
- Lakebase/Postgres 18 schema-neutral reads are the first consumer path, parallel with Truss. Each further backend and form requires its own qualification.

## Open Owner Decisions

1. Truss exact-value spelling: refuse round-tripping spelling-sensitive fields
   (current draft) or add a lexical-preserving carrier. This affects timestamps
   and binary values as well as decimal spelling: Truss currently refuses entity
   projections with timestamp or binary fields and returns exact tokens as text.
2. Where `umf_access` is published from and its release cadence.
3. Implementation spending ceiling: owner waived the prerequisite on 2026-10-15; see Execution Contract.

## B-TP-000 boundary adoption evidence

The [current checker replay](evidence/typed-persistence/b-tp-000/stdlib-refresh/verification.json)
records 17 passing tests/97 assertions, 7 TS files and 11 Python modules, strict
focused TypeScript checking and actual local/pre-commit failure controls.
Architecture now owns the populated module map and concrete check commands.
CI is wired to the same commands; remote execution remains UNTESTED. The replay
fixes Python 3.9 standard-library extension discovery and passes both Python
3.9.6 and 3.14.8 math/struct positive and third-party negative controls.
The [earlier scaffold replay](evidence/typed-persistence/b-tp-000/verification.json)
is retained as historical evidence. This evidence qualifies
the captured checker source, not SDK functionality or subsequent changed inputs.
The full integration typecheck encountered concurrently authored red generator
imports; diagnostics remain recorded rather than suppressed. Dependent slices
still need their own compatibility, browser, native and STP acceptance gates.

## Review and Independent Opinion

The [Astra review record](evidence/typed-persistence/astra-review.json) covers the
first draft. The [Claude review record](evidence/typed-persistence/claude-review.json)
records the independent second opinion requested by
[the review prompt](typed-persistence-claude-prompt.txt), its findings, the owner
decisions that followed, and how this revision disposes of each finding. The
[Fable review record](evidence/typed-persistence/fable-review.json) covers the
revised plan, including which claims were verified or refuted.

### Expanded-spec review

Astra reviewed exact baseline `dd7b81f6bb5aa6a08cb97bb8c4882eed683dcaba`; its report and correction dispositions are retained in `evidence/typed-persistence/astra-expanded-review.json`. The independent SQL-to-actions overlap review is retained alongside it. Historical review verdicts cover only their named snapshots. All new runtime/native cases remain UNTESTED.

The final focused review of the consumer-reconciled working tree is recorded in [Astra rereview](evidence/typed-persistence/astra-reconciled-rereview.json), including source hashes and remaining qualification gates. [Fresh typing replay](evidence/typed-persistence/consumer-reconciliation/typing-replay.json) reproduces only the existing scoped spike; it does not establish expanded SDK or native support.
