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
Truss ontologies and Ashlar publications. Everything here is a draft
specification; no generator, runtime, native support or consumer adoption is
delivered by these documents.

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
| Contracts | [CONTRACT-067](../02-design/contracts/CONTRACT-067-access-sdk-generator.md) generator, [068](../02-design/contracts/CONTRACT-068-generated-python-types.md) Python types, [069](../02-design/contracts/CONTRACT-069-engine-target-adapters.md) engine adapters, [070](../02-design/contracts/CONTRACT-070-access-extension.md) `umf.access` extension, [071](../02-design/contracts/CONTRACT-071-query-command-catalog.md) query DSL and catalog, [072](../02-design/contracts/CONTRACT-072-runtime-targets.md) runtime and targets, [073](../02-design/contracts/CONTRACT-073-native-sql-action-profile.md) native SQL action profile, [074](../02-design/contracts/CONTRACT-074-search.md) search |
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
commit `bfe0b88`). A Weft agent is implementing them. UMF work proceeds in
parallel: generation, types, DSL and static typing need no Weft change, and each
catalog slice is qualified per target as the matching Weft requirement lands.

| ID | Owner | Needed capability | Weft requirements | Blocks |
| --- | --- | --- | --- | --- |
| W-0 | Weft | Compile inputs and outputs the catalog needs: structural digest, logical SQL echo, carriers, raw-table security profile | WR-I3, WR-I4, WR-I6 | B-TP-006 onward |
| W-1 | Weft | Tranche A query forms (comparisons, null tests, OR/NOT, IN, ordering, general keyset pages, counts, temporal values) | WR-A1 to WR-A8 | Forms beyond today's Weft subset, per target |
| W-2 | Weft | Raw-table read backends: Postgres and Lakebase, then Unity Catalog and Spark/Delta, over UMF bindings and `umf.access` ColumnSets | WR-B1, WR-B2, WR-B5 | B-TP-008, B-TP-009 |
| W-3 | Weft | Bulk UPDATE extensions and plan templates; set-based mutations on raw tables. Weft's existing Truss mutation backend admits only string and boolean fields | WR-A9, WR-I5, WR-B3, WR-B6 | B-TP-007, B-TP-011 |
| W-4 | Weft | Action lowering on Postgres and Lakebase, then Unity Catalog and Spark/Delta | WR-B4, WR-B6 | B-TP-010 |
| W-5 | Weft | Search lowering | WR-C1 to WR-C5 | B-TP-012 |
| W-6 | Weft | Released Python distribution that the catalog build can pin | WR-I1 | Release of any catalog-dependent scope |
| T-1 | Truss | Public action admission, read and bulk APIs callable by an adapter; Truss-local adoption design; typed carriers for timestamp and binary fields and exact values (CONTRACT-069 current limits); attribution is decided by Truss admission from the host-supplied connection, not by the SDK | — | B-TP-013 |
| A-1 | Ashlar | Resolver API for pinned execution by an adapter; Ashlar-local adoption design; core 0.8 document admission; byte equality between Ashlar's read-time recompilation and catalog entries; instant and numeric decoders beyond `published_at` and string scalars | — | B-TP-014 |
| U-1 | UMF | CONTRACT-901 rule profile support for decimal values | — | Decimal action conditions |
| U-2 | UMF | CONTRACT-042 binding profiles for `lakebase`, `unity-catalog` and `spark-delta` that `umf.access` ColumnSets can reference | — | B-TP-002, B-TP-008 |
| U-3 | UMF | CONTRACT-902 null and wider value domains for bulk SET, matching WR-A9 | — | Bulk `SET NULL` and non-string/boolean SET |

## Implementation Slices

All paths and commands are planned. Do not label an absent command passing.
Slices B-TP-000 to B-TP-005 need no Weft change. Truss is the first catalog
target because Weft already compiles Truss reads and bulk updates; raw Postgres
and Lakebase follow as Weft's raw-table backends land, then Unity Catalog and
Spark/Delta.

| Slice | Story / artifacts | Depends on | Validation gate / observable outcome |
| --- | --- | --- | --- |
| B-TP-000 | Architecture module map | Approved scope | Boundary checker for `src/compilation/` and `python/umf_access/` wired locally and in CI |
| B-TP-001 | CONTRACT-067/068/071 | B-TP-000 | Compatibility spike pins Python, Pydantic (2.14 or later), pyright and mypy versions and settings, drivers and platform versions; extends the DSL typing spike to the full error table and `MISSING` strictness; generated output is tested against the pinned `umf_access` runtime ABI |
| B-TP-002 | US/TD/STP-080 | B-TP-001, U-2 for raw-table ColumnSets | `umf.access` schema and every allow-table row have fixtures |
| B-TP-003 | US/TD/STP-080 | B-TP-002 | Stage-one generator, census, drift check and hand-edit refusal; Bun and Chromium bytes agree |
| B-TP-004 | US/TD/STP-081 | B-TP-003 | Models, keys and codecs pass value, presence and golden-vector corpora |
| B-TP-005 | US/TD/STP-082 | B-TP-004 | DSL capture, rendering to Weft SQL and static corpora pass on pinned pyright and mypy; the renderer's output for every tranche-A form matches the Weft requirements' grammar |
| B-TP-006 | US/TD/STP-083, 087 | B-TP-005, W-0, T-1 reads | Catalog build and reads against Truss for the forms Weft supports today, executed through Truss's read path; unsupported forms refuse with `WEFT_BLOCKED` |
| B-TP-007 | US/TD/STP-086, 087 | B-TP-006, W-3 | Bulk UPDATE on Truss through CONTRACT-009, sealed manifests and coordination; exercises `PLAN_DRIFT` until plan templates land |
| B-TP-008 | US/TD/STP-083 | B-TP-005, W-0, W-1, W-2 | Reads on pinned Postgres and Lakebase, including `verify()` refusals and the shared acceptance corpus |
| B-TP-009 | US/TD/STP-086 | B-TP-008, W-3 | Atomic, bounded bulk commands on Postgres and Lakebase |
| B-TP-010 | US/TD/STP-085 | B-TP-008, W-4 | Actions on Postgres and Lakebase pass conformance and native witnesses, including commit-loss reconciliation |
| B-TP-011 | US/TD/STP-083, 085, 086 | B-TP-010, W-2, W-3, W-4 | Unity Catalog and local Spark/Delta reads, bulk and single-statement actions; Unity Catalog on a separately selected workspace or left unqualified |
| B-TP-012 | US/TD/STP-084 | B-TP-008, W-5 | Search on Lakebase and Postgres; Unity Catalog vector search on a selected workspace |
| B-TP-013 | US/TD/STP-085, 087 | B-TP-006, T-1 actions | Truss action adapter passes conformance and Truss witnesses in the Truss repository |
| B-TP-014 | US/TD/STP-088 | B-TP-006, A-1 | Ashlar adapter passes conformance and Ashlar witnesses in the Ashlar repository |
| B-TP-015 | TP-001, all STPs | All claimed scopes | Unchanged-source replay of generator, catalog, static, native and browser evidence |

Each target and engine adapter is qualified separately; no local pass substitutes
for managed Unity Catalog or engine witnesses.

## Execution Contract

The current request authorizes specifications and design spikes. It does not
authorize implementation, dependencies in the repository, migrations or
production operations. Implementation token estimate and spending ceiling are
**unknown/not selected**; record a ceiling before B-TP-000. No tracker is
selected.

## Continuation Evidence

When implementing, retain exact plan, source, profile and catalog revisions,
completed slices, command outcomes, failed attempts, pending lanes and the next
action under `evidence/typed-persistence/`. Do not reuse acceptance for changed
inputs.

## Validation Plan

At design time, run `check_structure.py` for unique IDs, required sections, link
resolution and AC traceability across all artifacts added since the base branch.
Actual tests remain UNTESTED until code and native observations exist. At build
time, write failing tests first, then run each STP's gates and the replay.

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

## Owner Decisions Recorded

- Weft is the only SQL lowering. UMF writes Weft requirements early and does not
  block its own work on them; no interim UMF lowering is built.
- The 0.1 DSL surface is Weft tranche A. Generated types expose it; targets whose
  backend lacks a form refuse it at catalog build.
- The SDK uses whatever connections the host supplies (per-user or service
  account). Raw-table targets declare `sessionPrincipal`; `person-required`
  actions compile only for `human` targets. Truss decides attribution itself.
- On raw Delta tables, Key uniqueness relies on the SDK being the sole writer,
  recorded as a host obligation.
- Truss is the first catalog target, then Postgres and Lakebase, then Unity
  Catalog and Spark/Delta.

## Open Owner Decisions

1. Truss exact-value spelling: refuse round-tripping spelling-sensitive fields
   (current draft) or add a lexical-preserving carrier. This affects timestamps
   and binary values as well as decimal spelling: Truss currently refuses entity
   projections with timestamp or binary fields and returns exact tokens as text.
2. Where `umf_access` is published from and its release cadence.
3. Implementation spending ceiling.

## Review and Independent Opinion

The [Astra review record](evidence/typed-persistence/astra-review.json) covers the
first draft. The [Claude review record](evidence/typed-persistence/claude-review.json)
records the independent second opinion requested by
[the review prompt](typed-persistence-claude-prompt.txt), its findings, the owner
decisions that followed, and how this revision disposes of each finding. The
[Fable review record](evidence/typed-persistence/fable-review.json) covers the
revised plan, including which claims were verified or refuted.
