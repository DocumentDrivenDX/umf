---
ddx:
  id: umf.implementation-plan
  type: implementation-plan
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.prd
      kind: informed_by
    - id: umf.architecture
      kind: informed_by
    - id: ADR-002
      kind: informed_by
    - id: SPIKE-001
      kind: informed_by
    - id: TP-001
      kind: informed_by
    - id: CONTRACT-040
      kind: informed_by
    - id: FEAT-005
      kind: informed_by
    - id: FEAT-006
      kind: informed_by
    - id: CONTRACT-041
      kind: informed_by
    - id: CONTRACT-042
      kind: informed_by
    - id: CONTRACT-043
      kind: informed_by
    - id: CONTRACT-044
      kind: informed_by
    - id: US-054
      kind: informed_by
    - id: TD-054
      kind: informed_by
    - id: STP-054
      kind: informed_by
---

# UMF Implementation Plan

## Scope

### Current alignment and execution priorities

The relationship/binding amendment below is historical preparation. Its scoped
implementation and integrated acceptance are recorded under “Integrated
relationship and binding acceptance”; those results qualify their recorded
source, versions and subsets. The core 0.8.0 API simplification and current-only
Key tuple correction have later scoped evidence in
[schema-property execution evidence](evidence/schema-properties-core.md#current-only-key-tuple-correction-2026-10-06).
The later [action certificate](evidence/actions-certification.md) records completed
core regression and bounded native qualification at its captured revision. The
current integration changes those inputs and needs fresh evidence; earlier green
acceptance must not be presented as acceptance of changed source. The
[documentation build plan](actions-documentation-plan.md) and
[delivery record](evidence/actions-documentation-execution.md) govern the new
learning path and website build.

| Next work | Governing input | Completion boundary |
| --- | --- | --- |
| Restore current acceptance evidence | TP-001 and schema-property execution evidence | Repair recorded qualification failures, regenerate affected native/browser proofs and complete logged unchanged-source regression and gates; retain failed/partial attempts and versions/subsets. |
| Frame the TableSpec finalization gate | PRD first ecosystem integration goal and owner clarification | Define semantic coverage, migration/recovery, stable API, Python consumption and native pipeline acceptance; identify US-050 prerequisites before implementation planning. |
| Prepare offline composition | FEAT-007, US-050 and CONTRACT-045 | Settle the public package API, bounds and crossing members; publish TD-050 and allocate all ten ACs in TP-001. Its dependency relationship to TableSpec finalization remains open. |

These are preparation and verification obligations. They do not select a new
finalization subset or waive the remaining product requirements.

### Action formal-analysis execution (2026-10-08)

Astra-reviewed bounded plan executed: independent Z3 command relations, actual
phased TLC safety/progress checks and native-history sequentialization. Semantic
counterexamples changed association observability, transactional cross-Key alias
resolution and executor-owned invariant dependency boundaries. See
[findings/results/limits](evidence/actions-formal-analysis.md). These are design
and synthetic executor observations, not public-library or production acceptance.

### Declarative action design iteration 2 (2026-10-08)

Owner-directed improvement adds CONTRACT-057 for bounded rule/key selectors,
revision/invocation/lookup, controlled handler access, concurrency/auth timing,
validation-only preview and audit/receipt epochs. CONTRACT-056 now distinguishes
role authorization from general policy bindings. ACT-09–13 and EX-01–EX-05 are
allocated; no new runtime or public-library acceptance is claimed.

Implement complete normative fixtures and the declaration library first; optional
static rule checking follows with its own versioned evidence. Consumer executor
code requires a separate story/design for isolation, native invariant scope,
policy coupling and durable reconciliation. Current core qualification remains
an independent gate. Earlier bounded experiments remain evidence only for their
original synthetic subset; they do not prove the expanded contract.

### Declarative action design handoff (2026-10-08)

Current action identities are FEAT-900, SD-900, US/TD/STP-900 for declarations and US/TD/STP-901 for the transactional consumer, governed by CONTRACT-900/901. The dated handoff below retains its former branch-local IDs; source-specific qualification keeps those historical identities. Security artifacts now own the overlapping IDs on main.

Owner scope now includes implementation and complete bounded qualification in the
isolated worktree. FR-51, FEAT-008,
US-078, CONTRACT-056, SD-008, TD-078 and STP-078 define a local-document extension
contract. US-056, TD-056 and STP-056 allocate the requested reference-consumer
implementation and EX-01–05 qualification; production release and downstream
adoption remain separate.
Current TableSpec finalization/offline-composition priorities are not displaced.

| Gate | Governing artifact | Required outcome |
| --- | --- | --- |
| Requirements/interface review | FEAT-008, US-078, CONTRACT-056 | Review local-only references, explicit-key recipes, contract read/write frames, postconditions, handler/profile boundaries and independent DDD binding. |
| Library implementation readiness | TD-078, STP-078, current core evidence | Resolve current core qualification gaps; create exercising tests for all nine ACs before acceptance; preserve whole-document registry behavior. |
| Declaration library acceptance | TD-078, STP-078 | Package/schema audits, scoped regression, typechecks, public build and Bun/Chromium proof with exact versions/fingerprints and limits. |
| Consumer executor qualification | CONTRACT-057, TD-056, STP-056 | Real store evidence for authorization, state checks, atomic failure, replay races, native side effects and freshness receipts; no mock-derived support claim. |

Scoped public-library tests and actual Chromium now pass;
[historical certification](evidence/actions-certification.md) records completed
qualification for its exact sources and bounded reference consumer. Fresh
integrated qualification is tracked separately in the documentation delivery record. The bounded design investigation
has executed portable, real-store and protocol experiments; see
[evidence](evidence/actions-plan-execution.md) for separate gate status. Core admission, native equivalence,
Python action-semantic support, Palantir import/export and cross-document action
references remain separate. The other consumer proposal sections are not adopted
by this action handoff.

### Format separation follow-on

FEAT-005 IDEAL-07 and [CONTRACT-050](../02-design/contracts/CONTRACT-050-format-separation.md)
govern this work independently of direct TableSpec/core field parity. Do not add
an overloaded core `format` or heuristically convert native text into assertions.

| Slice | Dependency | Required result and verification |
| --- | --- | --- |
| Native usage qualification | Retained TableSpec baseline and CONTRACT-030 | Pin model, ingest cast, flexible parser and output renderer separately; record positive/negative behavior, fallback order, environment and presence-based domain/type exceptions. Source inspection supplies hypotheses, not native execution evidence. |
| Interpretation and recipe design | CONTRACT-050; package ownership/schema decision | Story, technical design and exercising test plan for source-linked interpretation, directional recipes, unknown/stale handling, copy isolation and explicit legacy-slot selection. Keep libraries browser-compatible. |
| Extension implementation | Reviewed design and test plan | Versioned schemas/APIs, Bun and real Chromium parity, both retained recoveries, simultaneous meanings, source edits, monolithic/split archives and migration/rollback. Preserve all native text. |
| Allowed-value binding | CONTRACT-048 admission and equality decisions | Reuse typed allowed-value meaning; never split legacy enumeration prose. Two useful priority mappings and all-five delivery remain separate gates. |

Package selection and recipe environment binding remain design decisions. This
section schedules preparation dependencies, not core admission or delivered
behavior. Record native versions, exact subsets and evidence before claiming any
parser, renderer or constraint support.

### Historical alignment proposal: authored relationships and physical bindings

This section retains the original preparation plan for the Hohfeld-driven
amendment. Its “current” gaps, missing-artifact statements and instructions
describe that checkpoint. FR-42–44, FEAT-006, US-045–049, CONTRACT-041–044 and
TD-045–049 now exist; later scoped execution records document their delivery.
Use the current priorities above for remaining work. The original proposal follows.

Continue the ordered core backlog
with relationship **after key**. Key's five-system gate remains the prerequisite
for relationship implementation. Drafting the upstream documents may proceed
while that gate is open. Keep the PRD, feature and story language about product
behavior; put exact payloads, mapping rules and error semantics in contracts.

**Governing inputs:** [PRD](../01-frame/prd.md) FR-2/3/4/5/7/8/20/21/26/28/34/40/41;
[FEAT-005](../01-frame/features/FEAT-005-core-ideals.md) IDEAL-01–05;
[CONTRACT-001](../02-design/contracts/CONTRACT-001-core-envelope.md),
[CONTRACT-004](../02-design/contracts/CONTRACT-004-json-schema-protobuf-projection.md),
[CONTRACT-005](../02-design/contracts/CONTRACT-005-ddd-profile.md),
[CONTRACT-006](../02-design/contracts/CONTRACT-006-ddd-document-projection.md),
[CONTRACT-040](../02-design/contracts/CONTRACT-040-core-ideals.md),
[US-044](../01-frame/user-stories/US-044-core-key.md),
[TD-040](../02-design/technical-designs/TD-040-core-field.md),
[TD-044](../02-design/technical-designs/TD-044-core-key.md),
[architecture](../02-design/architecture.md), [TP-001](../03-test/test-plan.md),
and the current execution evidence later in this plan. The selected concerns
remain fidelity/partial understanding, identity/composition, reproducible
portable processing, bounded processing, conformance, review/composability and
the NFR-48–50 execution boundary. ADR-002 keeps Bun in development and a real
browser in validation.

#### Alignment ledger and authority order

| Current content or gap | Classification | Destination and content to add | Follow-up / gate |
| --- | --- | --- | --- |
| PRD FR-3's ordered backlog ends at key ([PRD, FR-3](../01-frame/prd.md)); FR-4/40/41 do not name separately versioned physical bindings or authored generation | split | Amend FR-3 to place relationship after key, retaining its two-priority admission versus five-priority delivery distinction; add FR-42–FR-44 for authored relationships, independent physical bindings/index capabilities, and directed DDD-to-target generation. Preserve FR-40's storage-independent DDD meaning and FR-41's consumer metadata rule. | Frame first; update PRD acceptance matrix and open questions; do not imply new capability is delivered. |
| FEAT-005 IDEAL-01 lists only five concepts ([FEAT-005, Requirements](../01-frame/features/FEAT-005-core-ideals.md)); there is no feature joining authored relationships with physical choices | split | Extend IDEAL-01 to add relationship in sixth position; create FEAT-006, “Authored relationships and physical bindings,” covering relationship/DDD precedence, separate `umf.binding`, indexes as physical capability, and the two directed projections. Link it to new FRs and FEAT-005. | Frame; check every selected concern and do not put exact schema payloads in the feature. |
| US-044 defines the acceptance pattern ([US-044, Acceptance Criteria](../01-frame/user-stories/US-044-core-key.md)); US-045–049 do not exist | needs-new-artifact | Create US-045 relationship, US-046 binding, US-047 indexes, US-048 DDD→PostgreSQL, US-049 DDD→GraphQL. Give each stable Given/When/Then ACs and test traceability. | Frame before design; each story covers strict block, report residual, both retained recovery directions, migration/rollback and version/subset evidence, adapted to its actual direction. |
| CONTRACT-040's semantic table and five-system mappings end at key ([CONTRACT-040, Normative Surface](../02-design/contracts/CONTRACT-040-core-ideals.md)); current DDD references are storage-neutral ([CONTRACT-005, Fields, Equality and Relationships](../02-design/contracts/CONTRACT-005-ddd-profile.md)) | split | Create CONTRACT-041 for relationship meaning and all-five bindings; CONTRACT-042 for the versioned `umf.binding` document/module and index rule; CONTRACT-043/044 for DDD+binding→PostgreSQL and DDD+relationship→GraphQL. Add only narrow cross-references to CONTRACT-040/005/006 after the new contracts settle. | Design; contracts precede every schema edit. Reject core promotion if the admission record lacks a useful down-projection in two priority systems. |
| TD-040–044 and TP-001 describe the first five ideals ([TD-044](../02-design/technical-designs/TD-044-core-key.md); [TP-001](../03-test/test-plan.md)) | needs-new-artifact | Create TD-045–049 in the TD-040 pattern, then extend TP-001 or add story test plans mapping every new AC to an exercising test and pinned native/browser oracle. | Design then Test; implementation issues are not ready until these exist. |
| Architecture phase table still names relationships/indexes as future pressure ([architecture, Proposed ecosystem expansion](../02-design/architecture.md)) | move | After implementation evidence, list relationship as delivered core and indexes as delivered `umf.binding` capability, with version/subset/evidence. Explain DDD concept references as a qualified binding, never a merge. Until then describe them as planned. | Evolve architecture only when evidence supports “delivered”; retain historical phase table meaning. |

The alignment classifications above are source-to-destination handoffs. No
source content is removed before the destination exists. The feature/stories
own behavioral scope; contracts own exact surface; TDs own files, sequencing and
tests. Preserve artifact IDs, frontmatter and deliberate `ddx.links` to actual
upstream instances. Consult installed HELIX templates, prompts and graph when
authoring each artifact.

#### Contract decisions to settle before schema work

1. **Relationship shape and admission.** CONTRACT-041 defines module-unique
   name, exact-ID source/target sets (each nonempty), per-end cardinality from
   the existing ideal, `directed`, optional `inverse`, self-reference and
   undirected meaning. It distinguishes schema assertion from instance edge,
   foreign key and enforcement. Existing core `references` remain unchanged.
   A DDD concept-reference field is a qualified binding only when the author
   declares a relationship; `many` alone creates none. Native FK and object
   fields classify as observations with their refinements retained, never
   invented author intent. Specify identity across modules, rename behavior,
   collision rules and versioned migration/rollback before reserving a core key.
2. **Five-system gate.** TableSpec, PostgreSQL, SQL Server, Avro and Parquet
   each need an authored down-projection and retained native up-classification,
   including exact/approximate/residual/refusal outcomes. The brief names four
   of these five: CONTRACT-041 must add TableSpec, likely an explicit residual
   or refusal until its native model proves useful representation. A refusal
   alone cannot count toward the two-useful-priority-system admission gate.
   PostgreSQL/SQL Server FK or junction carriers, Avro/Parquet reference/nested
   carriers, and TableSpec's actual model require versioned evidence rather
   than assumed equivalence. GraphQL, RDF and LinkML are additional scoped
   bindings, not substitutes for TableSpec. Test one-to-one, many-to-one,
   many-to-many, heterogeneous source, self-reference and undirected fixtures.
   Resolve endpoint-set cardinality and heterogeneous relation lowering
   explicitly; a single FK column cannot claim to type-check several source
   element kinds. GraphQL source-end participation and RDF union class behavior
   need residuals. Native-only reimport never asserts the authored relationship.
3. **Binding and index boundary.** CONTRACT-042 defines an independently
   versioned, target-qualified `umf.binding` artifact referencing a logical
   model without mutating its identity; one model can have distinct PostgreSQL
   and Delta bindings. Per-element partition/table, per-field
   column/embedded path, per-relationship edge/FK/junction/inline, and indexes
   remain physical. The contract must define external-reference resolution,
   missing/stale model and binding versions, conflicting target bindings,
   path grammar and duplicate names. A field's logical definition never
   contains or implies index availability; consumers inspect the binding for
   filter/sort capabilities. Per-index name, kind, ordered field/path targets,
   opaque predicate language/version, unique flag and includes need structural
   and semantic checks. `unique` kind versus `unique: boolean` requires one
   unambiguous rule. A catalog-observed index remains native evidence under
   CONTRACT-015, not author intent. Preserve the Hohfeld 1-row/300,000-row,
   21-minute/1.7-second query observation as *consumer-supplied rationale*,
   without treating it as UMF performance evidence or executing queries.
4. **Binding fidelity matrix.** Qualify PostgreSQL btree/hash/gin/gist,
   expression/partial/unique and document-path expression indexes against
   pinned 17 syntax and semantics; clustering stays residual. SQL Server
   rowstore/unique/filtered support is scoped to its native vocabulary;
   gin/gist stay residual. Delta liquid clustering, Iceberg sort order and
   Parquet residual-only behavior need target versions and reports. No
   `embedded` or `edge` choice enters core. Predicate text is opaque and
   unenforced by UMF; do not call a generated index exact until its parsed
   expression, target support and relevant semantics are actually checked.
5. **Directed generators.** CONTRACT-043 defines the complete DDD+binding→
   PostgreSQL DDL result, source retention, table/column/partition naming,
   FK/junction/adjacency rules, index emission, SQL identifier and expression
   safety, strict/report policy, atomic failure and adapter/native checks.
   CONTRACT-044 defines DDD+relationship→GraphQL SDL object/field naming,
   scalar/nullability/cardinality lowering, declared inverse only, and the same
   fidelity/recovery policy. Both report aggregate and invariant gaps from
   CONTRACT-006, heterogeneous endpoints and any unsupported target choice.
   No resolver, pagination, budget, SPARQL or query execution enters either
   projection. Hohfeld's per-entity SQL views need a later scoped projection
   if required; the requested generator deliverable is DDL. GraphQL needs a declared root/schema-mode policy; a set of
   object types alone may not validate as a complete schema.

#### Implementation slices (after contracts, TDs and test plans)

| Slice | Story / area | Governing artifacts to create | Depends on | Validation gate |
| --- | --- | --- | --- | --- |
| RB-01 | US-045 core representation | CONTRACT-041, TD-045, story tests | Key five-system gate and contract | New version/profile, collision-preserving migration/rollback, exact endpoint validation, typed inspection; Bun and Chromium; no `spec/core/schema.json` edit before signed semantic contract. |
| RB-02 | US-045 native bindings | CONTRACT-041, TD-045, TP-001 | RB-01 | TableSpec, PostgreSQL, SQL Server, Avro, Parquet separate matrices; two useful priority mappings recorded for admission; all-five delivery recorded separately; GraphQL/RDF/LinkML qualified additional checks. Both retained recovery directions. |
| RB-03 | US-046/047 extension | CONTRACT-042, TD-046/047, story tests | Contract and logical model reference rules | Publish `spec/extensions/binding/{package.json,schema.json}` and registration; independent versioning, all storage/index kinds, unknown preservation, physical-only capability inspection, strict/report and migration/rollback. |
| RB-04 | US-048 PostgreSQL generator | CONTRACT-043, TD-048, story tests | RB-01/03 plus Field/Nullability/Cardinality/Facets/Key | Authored order/customer/product/reified-association corpus; every declared PostgreSQL index kind and storage form; checked-in DDL and report; `umf.postgresql` parse/deparse/codec; isolated PostgreSQL 17 oracle; Bun/Chromium parity. DDL generation is not a live migration or query run. |
| RB-05 | US-049 GraphQL generator | CONTRACT-044, TD-049, story tests | RB-01 plus Field/Nullability/Cardinality | Checked-in SDL/report; `umf.graphql` schema-mode import, GraphQL.js and GraphQL-core independent-port oracles; inverse/nullability/cardinality loss cases and Bun/Chromium parity. |
| RB-06 | Integration and publication | FEAT-006, TP-001, four contracts and five TDs | RB-02–05 | Fixture hashes, accepted/rejected native cases, both recovery directions, all-five and additional target version/subset claims, no unknown loss, strict/report evidence; only then amend architecture from pressure to delivered status. |

Create one runtime work item per bounded slice and one per native binding when
execution starts; label with `helix`, `activity:build`, story ID and area, link
the nearest governing TD/contract/test plan via `spec-id`, and wire RB-01→RB-02,
RB-03→RB-04, RB-01→RB-05 and RB-02–05→RB-06. Record test-to-AC links as
`@covers US-045-ACn` through `US-049-ACn`. Required fixtures include negative
counterexamples, original native archives, generated candidates and residual
reports. Reuse the current pinned native harnesses and add fresh evidence;
historical adapter evidence does not prove the new generators.

**Risks and rollback:** Core name collisions or old unknown members require
an explicit version/profile transition and reversible receipt; unsafe
interpretation blocks. Physical path/index semantics can drift by engine
version, so each binding pins syntax, subset and oracle and reports unsupported
claims. Generated DDL/SDL and test-only native execution are reviewable outputs,
not deployed changes. Reverting an capability retains the original
logical model, binding document, residuals and native source archive; it never
silently discards new assertions or rewrites preexisting `references`.

**Exit for this plan:** PRD→FEAT/stories→CONTRACT→TD→test-plan dependencies are
explicit; the TableSpec gap and contract decisions are tracked; no unsupported
delivery claim is made. Build exit requires the separate ideal-admission and
all-five-delivery records, version-qualified native/browser evidence, zero
phantom test claims and every acceptance criterion exercised.

### Current owner amendment: ideals before equivalence

The latest owner direction supersedes blanket lossless-equivalence prerequisites
for core admission. FR-3 admits UMF-defined ideals; FR-28 separately governs claims
that core replaces native concepts. Governing artifacts are FEAT-005,
CONTRACT-040, US-040–US-044 and TD-040–TD-044. This is a documentation/scope
amendment; the envelope schema and runtime are unchanged.

| Order | Concept | Core task | Binding tasks | Exit gate |
| --- | --- | --- | --- | --- |
| 1 | Field | TD-040 / US-040 | TableSpec, PostgreSQL, SQL Server, Avro, Parquet | Kind distinguishes fields, records and groups; retain native type distinctions |
| 2 | Nullability | TD-041 / US-041 | Same five, explicit absence carriers | Required/absent-allowed/unspecified without native null/presence collapse |
| 3 | Cardinality | TD-042 / US-042 | Same five, checked container roles | One/array/map/unspecified; no repeated/container scalar misclassification |
| 4 | Author facets | TD-043 / US-043 | Same five, explicit units and domains | Exact bounds or loss/refusal; float-narrowing counterexample preserved |
| 5 | Author key | TD-044 / US-044 | Same five, equality and enforcement | Identity intent separate from observed filtered/disabled indexes |

For each concept: implement schema/types/validation only after its contract, then
five independently scoped binding/evidence tasks, then an all-five gate. Complete
one concept before starting the next. At-least-two-system admission is an interim
claim, not permission to drop the other three binding tasks. Model
implementation may precede admission evidence but must not be described as admitted
or complete. Each binding includes authored down-projection, native up-classification,
strict/report, explicit residuals, both round trips, Bun/native/Chromium evidence,
unknown-content retention and version/subset-qualified claims.

DDx portable beads now track this ordered execution scope; stories remain governing
artifacts rather than tracker copies. The documentation commit precedes queue
population. No implementation task is complete merely because its design was written.
Older execution notes below are historical evidence, not contrary inclusion policy.


### Core-ideal bead queue

The documentation evolution is committed in `f2e29c5`. Epic `umf-97221618-b9969a6a`
tracks 35 tasks: one core implementation, five native bindings and one
conformance gate per concept. The Field authoring/validation task is closed with
acceptance evidence committed in `e0c04bb`. The scoped TableSpec Field binding
is closed with refreshed native/browser evidence in `3236095`, and PostgreSQL
in `b7545c2`. SQL Server, Avro and Parquet close with `1283337`. Field admission
and qualified five-system delivery pass in `d6c4108`; native equivalence is not
claimed. Seven tasks are closed and 28 remain unfinished. The portable CLI-managed
queue is `.ddx/beads.jsonl`.

| Concept | Core implementation | Five-system exit gate |
| --- | --- | --- |
| field | `umf-97221618-994aef58` | `umf-97221618-c4baf8f1` |
| nullability | `umf-97221618-a91c451b` | `umf-97221618-a5ef534b` |
| cardinality | `umf-97221618-231a08d7` | `umf-97221618-bdcf50d1` |
| facets | `umf-97221618-c0b3f203` | `umf-97221618-21f0a415` |
| key | `umf-97221618-bbefbb0a` | `umf-97221618-f4f9b4e8` |

Use `ddx bead list --label plan:core-ideals`, `ddx bead ready` and
`ddx bead status` to inspect execution state. Nullability core implementation
has passed acceptance with the 0.3.0 envelope, typed authoring,
migration/rollback, selection and versioned Field kind/record-type receipts.
The TableSpec Nullability binding has passed its expanded acceptance, with
selected-context classification, authored strict/report projection, retained
scope metadata, both recovery directions and qualified native row checks.
PostgreSQL Nullability has now passed qualified binding acceptance: captured
stored-column classification, authored DDL, explicit scope/carrier metadata and
both retained recovery directions. All 50 refresh commands pass, including the
prior five-system Field native/browser checks and both TableSpec/PostgreSQL
Nullability bindings. The broader regression passes 206 tests / 13,404
assertions across 59 files; the separate Field gate passes. Current
fingerprints replaced the prior stale-gate status at that checkpoint. See the
[PostgreSQL acceptance record](../../../fixtures/validation/postgresql-nullability-acceptance-evidence.json).
SQL Server has now passed qualified binding acceptance for captured catalog-v3
columns and authored single-column DDL under stored-relation/SQL-NULL policy.
Supplement v2 preserves visibility and bound-rule observations; unresolved native
interactions remain residuals or refusals. All 54 refresh commands pass, including
five-system Field checks and all three implemented Nullability bindings. The
current broader regression passes 234 tests / 16,414 assertions across 68 files; the
separate Field gate passes three tests / 24 assertions. This supersedes the older
refresh counts above. See the
[SQL Server acceptance record](../../../fixtures/validation/sqlserver-nullability-acceptance-evidence.json).
Avro has now passed qualified binding acceptance for underlying-field-value
classification and authored single-Field projection with retained native bundles.
The two pinned codecs preserve their differences in omission, reader defaults,
boolean coercion and logical types. All 58 refresh commands pass, including the
five-system Field checks and all four implemented Nullability bindings. The
current broader regression passes 332 tests / 25,725 assertions across 111 files, covering
core/core-ideals and all five priority adapter test directories. The separate
Field gate passes three tests / 24 assertions. This supersedes the previous
refresh counts and stale-fingerprint status above. See the
[Avro acceptance record](../../../fixtures/validation/avro-nullability-acceptance-evidence.json).
Parquet has now passed qualified binding acceptance for physical leaf classification
under explicit row/repeated-entry contexts and authored single-Field schema
projection. Native PyArrow 21.0.0 evidence preserves optional ancestor/member and
masked-container distinctions, 264 source-byte recoveries, and 198 projection
row-write outcomes including the float-narrowing counterexample. All 62 refresh
commands pass, including five-system Field and Nullability checks. The current
broader regression passes 340 tests / 30,057 assertions across 113 files; the separate Field gate passes three tests /
24 assertions. See the
[Parquet acceptance record](../../../fixtures/validation/parquet-nullability-acceptance-evidence.json).
The separate Nullability admission/delivery gate now passes across all five
qualified profiles: 90 ideal recoveries, 60 native recoveries, strict/report
residual pairs and current native/browser fingerprints. It admits the ideal and
completes this five-system slice without native-equivalence graduation. See the
[conformance record](../../../fixtures/validation/nullability-conformance.json).
Cardinality core implementation has started with a 0.4.0 schema/transition
foundation: container/scalar separation, item/value Field references, legacy
collision archives and rollback. The focused suite and real Chromium pass.
Authoring/inspection and verified receipts now pass. Versioned Field, Nullability
and record-type API integration supports 0.4.0 and prior receipt versions. Consumer
selection now covers shape filters, typed item boundaries and cycle-safe traversal.
Core-task acceptance now passes all 66 refresh commands, 358 tests /
31,542 assertions across 117 files, and both separate conformance gates.
The refresh reruns native/browser checks for all five existing Field and Nullability
bindings and all four Cardinality core browser probes. See the
[core acceptance record](../../../fixtures/validation/cardinality-core-acceptance-evidence.json).
TableSpec Cardinality now passes qualified binding acceptance after 68 refresh
commands, 365 priority regression tests / 34,378 assertions across 119 files,
and both separate prior conformance gates. See the
[TableSpec acceptance record](../../../fixtures/validation/tablespec-cardinality-acceptance-evidence.json).
PostgreSQL, SQL Server, Avro and Parquet Cardinality bindings remain pending;
ideal admission and all-five delivery require their separate gate. Facets and key retain their ordered dependencies. Existing untracked bootstrap implementation/evidence must
be checkpointed before isolated-worktree dispatch; no worker is launched by this
queue update. Queue lint verifies mechanically checkable acceptance criteria, not
that those future implementation commands already pass.

### Current owner priority: tabular ingestion and usable core fields

The owner's 2026-09-21 correction supersedes the earlier extension execution order.
Active work is TableSpec, PostgreSQL, Microsoft SQL Server, Avro and Parquet schema
ingestion, together with core field/type promotion demonstrated by those systems.
Stop RDF/OWL expansion and RDF/XML spike work in the active queue. Retain their
existing implementation/evidence; they are deferred requirements, not the next work.

1. Pin and ingest the local TableSpec baseline at `/home/erik/Projects/tablespec`.
   Preserve its actual column model, checked-in schema, examples and unknown content.
   Resolve model/schema discrepancies with native validation evidence.
2. Expose useful table/column metadata from PostgreSQL, SQL Server, Avro records
   and Parquet schema trees, reusing existing adapters where present. Add SQL Server
   as an explicit package with a versioned input contract, DDL/catalog fixtures and
   independent validation. A PostgreSQL adapter is not SQL Server support.
3. Implement a shared scalar type field and assess other common field metadata
   against this five-system matrix. Start with boolean, integer, decimal, floating
   point, string, binary, date, time and timestamp families. Determine precise names
   and qualifications in the core contract before schema/runtime changes. Keep
   native width, signedness, precision/scale, encoding/collation and temporal semantics
   available; a shared family does not imply interchangeable native types.
4. Prove native schema recovery, copied edits and metadata access in Bun and Chromium
   for representative simple, nested and boundary cases. Record type-mapping losses
   explicitly. These ingest paths take precedence over additional ontology work.

TableSpec is available locally at commit 647e8e566ad78b864282ec65c0b0b2237aa63084;
content hashes must also record the actual working-tree baseline. The existing claim
that TableSpec access is unresolved is historical and no longer governs this work.
Its column model includes scalar `data_type`, length, precision, scale, descriptions,
and bool-or-contextual nullability. The checked-in schema's nullable representation
differs from the current Python field annotation; do not assume either source alone
proves the native runtime contract.

Deliver complete JSON Schema descriptions of UMF core and each declared extension,
implemented extension packages, and reliable native round trips and representative
cross-system transforms. Begin with JSON Schema and Protobuf; add domain-driven
design (DDD) immediately after that fidelity slice, then work through the existing
ecosystem inventory. Admit ideals under FR-3; require separate FR-28 evidence before
claiming native replacement.
Also demonstrate the programmatic metamodel serving all seven FR-41 consumer
classes, including under partial understanding and newly introduced data shapes.

Governing artifacts: [PRD](../01-frame/prd.md),
[constraints](../01-frame/cross-cutting-requirements.md),
[concerns](../01-frame/concerns.md), [architecture](../02-design/architecture.md),
[Bun ADR](../02-design/adr/ADR-002-bun-development-runtime.md),
[SPIKE-001](../02-design/spikes/SPIKE-001-jsonschema-protobuf.md),
[TP-001](../03-test/test-plan.md), and
[competitive research](../00-discover/competitive-analysis.md).

This is a build sequence, not completed implementation or a release promise.
Exact contracts, feature/story acceptance criteria, and per-story designs/tests
must be derived before their dependent slices execute. The B-series slice IDs below remain planning references; the DDx portable queue
tracks execution tasks for the current amendment.

## Shared Constraints

- Use TypeScript by default, Bun for development/testing, and a browser-compatible
  JavaScript library. Keep host file/process APIs outside portable components (FR-39, ADR-002).
- Preserve native and unknown content, including after safe edits; reject or
  report unsafe partial-understanding operations (FR-5, FR-8; NFR-23–NFR-25).
- Separate structure, semantic consistency, native validity, and target enforcement.
  Retained expressions, policies, and aggregate declarations do not imply execution.
- Pin systems, dialects, revisions, fixtures, configurations, and oracle profiles.
  Store provenance, redistribution terms, explicit resource limits, and exclusions.
- Preserve stable identity, independent vocabularies, and context distinctions.
  DDD identity/equality and lifecycle semantics do not enter core by naming analogy.
- No mandatory network resolution, inference engine, global catalog load, or
  proprietary runtime. Use synthetic non-PII fixtures for authored examples.
- Keep semantic specifications independently implementable; no undocumented
  TypeScript behavior becomes normative. Performance optimization follows evidence.

## Implementation Slices

| Slice | Area / Deliverable | Governing artifacts | Depends on | Validation gate |
| --- | --- | --- | --- | --- |
| B-001 | Publish system/version/subset inventory; inspect TableSpec baseline; identify Axon; pin Bun, compiler, browser and fixture tools | PRD FR-26/36/38/39; ADR-002 | None | Every initial scope and oracle named; unresolved external access explicit; no invented compatibility |
| B-002 | Define document, registry, extension, adapter, preservation, and fidelity contracts; derive initial stories/designs | Architecture; TP-001 | B-001 for affected native contracts | Reviewable JSON-compatible structures, identity/reference rules, serialization limits, edit safety, report semantics, and testable ACs |
| B-003 | Scaffold TypeScript/Bun library and CLI boundaries; build minimal core and extension-package JSON Schemas | B-002 contracts; ADR-002 | B-002 | Positive/negative schema cases, type check, Bun tests, actual-browser load; no host-only imports |
| B-004 | Implement registry, structural/semantic validation coordination, preserved unknown data, deterministic references and diagnostics | FR-4/5/23/34; TP-001 | B-003 | Parse-edit-write, missing/conflicting versions, invalid references, limits and offline cases pass |
| B-005 | JSON Schema extension, adapter pair, upstream and authored corpus | FR-37; SPIKE-001 | B-004 | Native validation vectors and non-assertion preservation pass; negative mutations detected; browser/Bun parity |
| B-006 | Protobuf extension, adapter pair, descriptors and behavioral corpus | FR-37; SPIKE-001 | B-005 | Pinned independent native compiler validates outputs; presence/options/numbers/references survive; edits reflected |
| B-007 | JSON Schema-to-Protobuf projection and evidence report; conclude bounded spike | FR-7–FR-13/37; TP-001 | B-006 | Valid target, all expected mismatches reported, source retention versus target-only recovery demonstrated |
| B-008 | Versioned `umf.ddd` profile/contract and extension JSON Schema; derive DDD stories and oracle | FR-40; architecture DDD section | B-007 | Every DDD concept has rules, reference scope, and preservation/interpretation classification; no storage semantics assumed |
| B-009 | DDD typed access, validation, read/edit/write and semantic corpus | FR-40; TP-001 DDD cases | B-008 | Aggregates, distinct contexts, events, invariants, services, repositories, terminology and partial mappings survive; corruptions detected |
| B-010 | DDD-to-document projection using existing JSON Schema adapter | FR-7/8/40 | B-009 | Explicit binding yields useful document schema; aggregate/invariant enforcement gaps reported; retained DDD source recoverable |
| B-011 | Repeat extension cycle for inventory below, adding DDD-to-SQL/OpenAPI/Axon/Palantir projections as each target becomes available | Architecture; TP-001; discovery research | B-010; each target's declared prerequisites | Complete package, native round trips, edit propagation, real/representative examples, robust transforms and browser evidence per target |
| B-012 | Evaluate ideal admission separately from native-equivalence graduation; maintain compatibility evidence | FR-3/28/32; NFR-41/43 | Each concept/binding cycle | Ideal meaning/counterexamples and >=2 priority bindings; all-five delivery gate; independent both-way equivalence and migration/rollback only for native replacement |
| B-014 | Define metadata-selection/consumer contracts and seven demonstrators; introduce an unfamiliar vocabulary | FR-41; architecture; TP-001 | B-009; needed target adapters | Typed traversal/selection/editing and all seven outputs preserve required context, references and provenance; unknown/inferred content and unsupported enforcement explicit |
| B-013 | Audit inventory completeness and reproducible distribution | Original owner goal; FR-32/41 | All required extension cycles, B-014 and promotion reviews | No missing schema/package or failed/untested required transform; evidence traceable to exact versions |

The SPIKE-001 investigation cap is not a deadline for the whole implementation.
An unresolved spike result produces explicit follow-up work; it does not waive
any overall completion criterion. TableSpec/Axon access gaps block their specific
claims, not independent core, DDD, or public-format work.

### Extension inventory and order

The table below retains the full inventory. Its previous row order is superseded
by the current owner priority above; it is not the active execution sequence.

| Order | Systems / vocabularies | Scope decision required before implementation |
| --- | --- | --- |
| First native slice | JSON Schema, Protobuf | Dialects/language versions, options, references, bounded native oracles |
| Early semantic slice | DDD (`umf.ddd`) | UMF-authored profile and oracle; external DDD tool formats separately named |
| Remaining structural | Avro | Named schemas, defaults, unions, logical types and evolution scope |
| Graph/API | GraphQL SDL, OpenAPI, TypeSpec, Smithy | Schema versus service/binding metadata; native parser/compiler and versions |
| Physical/analytical | PostgreSQL catalog/SQL, Spark StructType, Arrow, Delta, Iceberg, dbt, Parquet | Separate logical/physical/storage contracts; each exact dialect/API/release |
| Semantic web | LinkML, RDF, OWL, SHACL | Syntax, graph identity, reasoning profile versus validation semantics |
| Operational | Palantir Foundry Ontology, Axon, Databricks | Public/authorized interfaces and platform-specific preservation; Axon identity unresolved |
| Additional named interchange | Open Data Contract Standard (ODCS), CUE, application types | Exact versions; application-language type system still unnamed |
| Shared/native vocabulary packages | structural, relational, graph, authority, lineage/provenance, quality, API, actions | Define boundaries and ownership; do not create duplicate packages for synonymous labels without analysis |
| Consumer continuity | TableSpec | Inspect supplied baseline and run deterministic migration/compatibility fixtures |
| Research candidates | OntoBricks, Stardog, GraphDB; further competitors from discovery | Determine whether a new adapter is needed or native OWL/SHACL/mapping extensions suffice; research inclusion alone adds no support claim |

This inventory retains the previously proposed systems. Broad families are not
finished extensions. Resolve each to named packages and bounded support manifests;
record unresolved entries visibly. Moving a required entry out of scope requires
an explicit owner scope change, not silent omission to satisfy B-013.

### Repeatable extension cycle

1. Inspect primary native sources and existing examples; pin version/dialect,
   subset, provenance, redistribution terms, and native equivalence criteria.
2. Define the versioned package under `spec/extensions/<extension>/`: complete
   structural schema, semantic rules, capabilities, references, and migrations.
3. Build `adapters/<system>/` and trusted validators with typed access and edit
   propagation. Opaque retention alone cannot pass implemented-support gates.
4. Add `fixtures/<system>/{basic,edge-cases,upstream}/` plus native round-trip,
   cross-format, conformance, and regression tests. Use independent native oracles;
   for UMF-authored profiles, use reviewed semantic expectations and mutation checks.
5. Run supported scenarios in Bun and a real browser; compare semantics and
   diagnostics, validate emitted targets independently, and rerun offline.
6. Publish evidence, failures, exclusions and projection losses. Review potential
   ideal admission and native-equivalence graduation separately; record gaps in each gate.

## Issue Decomposition

For each slice, create separate work items for contract/story definition, schema
package, adapter/validator, corpus/oracle, projection, and evidence closeout where
needed. Each item must reference its FRs, governing contract/design, story ACs,
TP-001 and this plan; name files, prerequisites, expected outcomes, and verification
commands. Use stable dependencies and the chosen runtime tracker's conventions.
Do not fabricate story IDs or test coverage before those artifacts exist.

DDD-specific work must cover the owner's entire concept list, even where a
concept is declared preservation-only pending a validator. Such a declaration
is not full semantic support. External-format adapters are separate work items.

## Validation Plan

The scaffold now provides these commands for the implemented core-envelope scope:
`bun install --frozen-lockfile`, `bun run typecheck`, `bun test`,
`bun run build`, `bun run test:browser`, and `bun run test:conformance`.
Native-adapter suites will extend them as implemented; `test:conformance` currently
runs only the core envelope suite. Type checking and browser
execution are separate gates from the Bun test runner.

- Require 100% passing declared supported cases and 100% expected mismatch detection.
- Require meaningful negative mutations, typed edits, unknown-content retention,
  resource-limit failures, and deterministic offline reproduction.
- Validate schemas and emitted native output independently of adapters.
- Trace every support-matrix entry to versioned results; distinguish untested,
  unsupported, failed, preserved-only, and supported capabilities.
- For DDD projections, compare original intent with retained-source recovery and
  target-only reimport separately; never infer aggregate enforcement from shape.
- Include package-only consumer/browser tests so development imports cannot hide
  missing assets or leaked runtime dependencies.

## Risks and Rollbacks

| Risk | Impact | Response / rollback |
| --- | --- | --- |
| Core abstraction collapses native or context-specific meaning | Broken fidelity | Retain native refinements alongside ideals; block/report mismatched projections; roll back replacement only with versioned preservation migrations |
| Browser lacks a native parser | Incomplete extension | Evaluate browser JS/WASM tooling; report unavailable support rather than silently requiring a server |
| Native export/API drifts | Broken adapter | Pin interface and fixtures; disable affected claim until verified; retain source content |
| Opaque DDD expressions presented as enforced invariants | False operational guarantee | Mark interpretation status; reject unsupported evaluation, preserve expression and scope |
| Source access/redistribution unavailable | Unreproducible evidence | Continue independent targets; keep affected claim incomplete until usable evidence exists |

## Exit Criteria

- [ ] Complete core JSON Schema and all required extension schemas with explicit semantic rules.
- [ ] Each required extension implemented with typed access, edits, declared directions and versioned package metadata.
- [ ] Robust native round trips and representative transforms pass in declared browser/Bun scope.
- [x] All seven FR-41 consumer classes demonstrated from one authored mixed model, including partial/unknown semantics (CONTRACT-036). General consumers and runtime delivery remain open.
- [ ] All DDD concepts and context distinctions covered; target-specific projections preserve intent and report losses.
- [ ] Every ideal has meaning/counterexamples, >=2 admission bindings and all-five delivery evidence; every native-replacement claim separately has equivalence and migration/rollback evidence.
- [ ] Full inventory audited; no unresolved required entry silently excluded.
- [ ] Reproducible commands, fixtures, support matrix, and limitations accompany the implementation.

## Review Checklist

- [x] Governing artifacts, boundaries, dependencies, and evidence gates named.
- [x] Browser/Bun and DDD directions integrated into the extension cycle.
- [ ] Resolve exact contracts, versions, stories, and designs before dependent build slices.
- [ ] Configure tracker and derive executable work items.

## Execution Evidence: core envelope, 2026-09-20

Concrete progress: CONTRACT-001, FEAT-001, US-001, TD-001, the core and package
JSON Schemas, TypeScript model/validation/registry modules, Bun build tooling,
and browser checks now exist. This advances B-002–B-004; it does not complete
native support, the whole core metamodel, or the overall inventory.

| Gate | Executed result |
| --- | --- |
| `bun install --frozen-lockfile` | Passed; existing lockfile unchanged |
| `bun run typecheck` | Passed for portable source and separate tools/tests type environments |
| `bun test` | 15 passed, 0 failed, 178 assertions, including 100 generated preservation examples |
| `bun run test:conformance` | Passed at the earlier 14-test core checkpoint; same core suite now contains 15 tests and passed under `bun test` |
| `UMF_CHROMIUM_PATH=/home/erik/.local/bin/chromium bun run test:browser` | Passed in Chromium 148.0.7778.0; built ESM round trip, unknown retention, invalid input rejection, absence of host globals and validated atomic edit |
| `bun run build` | Passed as part of browser verification; ESM, declarations and referenced schema assets emitted |

Pinned tools: Bun 1.3.14, TypeScript 7.0.2, Ajv 8.20.0, yaml 2.9.1,
Playwright 1.63.0 and @types/bun 1.4.2. The installed system Chromium was supplied
explicitly after Playwright's managed-browser download failed. This is evidence
for Chromium 148.0.7778.0 only, not for the uninstalled managed Chromium revision.
The browser path is a host-specific override, not a library dependency.

Native adapters, upstream native corpora, projections, DDD and FR-41 consumer
examples remain unimplemented. No core concept has graduated from extensions.
The present numeric profile explicitly rejects values it cannot retain; a
lossless native-number representation is needed before broad JSON Schema and
Protobuf numeric support. Strict browser Content Security Policy compatibility
and semantic-validator execution bounds remain unverified. TableSpec and Axon
baselines remain requested, not fabricated.

Next: define the JSON Schema native extension contract, including exact-number
and reference handling, obtain pinned upstream native tests, and implement typed
native access/edit/export with independent validation vectors. Continue the full
extension inventory and promotion gates; do not treat the envelope as completion.

## Execution Evidence: JSON Schema native extension (2026-09-20)

Implemented CONTRACT-002 / US-002 / TD-002 as `umf.json-schema` 0.1.0. The package
contains a complete recursive JSON Schema representation of native JSON values;
exact number tokens remain extension-owned. The browser-compatible TypeScript
adapter supports import/export, explicit retrieval resources, metadata traversal,
copied node access and atomic existing-node edits. Full bundle export preserves
its source UMF document and reports meaning that root-only output cannot carry.
No extension concept has been promoted to core from this single-language evidence.

Validation executed with Bun 1.3.14:

- `bun run typecheck`: portable source and host tools pass.
- `bun run test:conformance`: 69 Bun tests / 1,369 assertions pass, followed by
  independent Python oracle coverage. The 46 required upstream Draft 2020-12 files
  contain 384 schemas / 1,301 instance vectors. All schemas preserve native trees;
  every case passes native expected vectors before and after round trip in at
  least one independent oracle. Reports retain Ajv's 24 baseline disagreements and
  11 compile failures, and Python's two unsupported Unicode-regex cases.
- `UMF_CHROMIUM_PATH=/home/erik/.local/bin/chromium bun run test:browser`:
  Chromium 148.0.7778.0 passes all eight checks, including native round-trip,
  bound edit and exact-number preservation. The ESM bundle is 486,138 bytes.

Fixture provenance, pinned revision, exact oracle profiles and limits are recorded
in `fixtures/json-schema/README.md` and its reports. The installed inspector marks
103 corpus cases incomplete; independent oracle coverage does not make those
schemas safe to edit in the browser. Optional/proposal cases were not executed.
Known invalid schemas still fail with unknown keywords present; unknown native
meaning and compiler limits remain explicitly preserved-only.

This implements the bounded JSON Schema slice B-005 and native evidence work; it does
not finish SPIKE-001, the full core, Protobuf, cross-system transforms, DDD or the
ecosystem implementation inventory. Next: native Protobuf schema and independent
compiler evidence, then the declared JSON Schema/Protobuf projection and DDD slice.


## Execution Evidence: Protobuf descriptor foundation (2026-09-20)

B-006 is in progress under CONTRACT-003 / US-003 / TD-003. Added `umf.protobuf`
0.1.0, its complete 30-definition descriptor JSON Schema and package, and browser
TypeScript import/export of binary FileDescriptorSet. Native presence, defaults,
source metadata, custom/unknown wire options and descriptor order remain explicit.
Programmatic access returns copies; edits return candidates requiring compilation.
No browser compiler validity or full source-language adapter is claimed.

The native protoc 36.2 oracle compiles 19 standard protos plus authored proto2,
proto3 and Edition 2023 fixtures, then decodes original and emitted descriptors
independently. All 22 files retain identical native text decoding, including source
metadata and unknown custom options. An edited int64 default is independently
recompiled and checked. The compiler version and source hashes are test gates.
`fixtures/protobuf/README.md` documents origin, licenses and normalization scope.

The fixtures exposed shared YAML emitter line wrapping that changed leading-indented
multiline comment values. Disabled line wrapping and added a core regression case;
JSON Schema corpus coverage remains intact. Type checking passes; the full Bun
suite reports 75 passing tests, followed by the existing 384-case independent
JSON Schema coverage gate. Chromium 148.0.7778.0 passes ten packaged-library checks,
including Protobuf descriptor retention and candidate edits.

Remaining B-006 work: browser-compatible native `.proto` parsing/emission, broader
native application-wire behavior, source edit propagation and expanded language
corpora. Descriptor preservation is a foundation for that work, not a substitute.
B-007 projection, early DDD and the remaining ecosystem inventory still follow.


## Execution Evidence: Protobuf source compilation and behavior (2026-09-20)

B-006 progressed with an explicit source-bundle compiler interface and archived
original source files. The optional Go/WASM bridge uses protocompile 0.14.1,
Go 1.27.1 and pinned module checksums. Its in-memory resolver never consults the
filesystem or network for imports. ADR-003 records the choice; the main library
and development workflow remain TypeScript/Bun. Source archives are never presented
as current edited native output.

Executed gates:

- 77 Bun tests / 1,407 assertions pass through `bun run test:conformance`; the
  existing independent JSON Schema coverage gate still passes all 384 cases.
- Python protobuf 7.36.2 passes 42 authored behavior checks before and after UMF
  descriptor round trip and detects two valid semantic mutations. Source-compiled
  descriptors pass the same 42 expectations against native protoc results.
- Independent source compilation agrees on every descriptor field after excluding
  SourceCodeInfo across different compilers and normalizing omitted proto2 syntax.
  Native protoc uses `--retain_options`; otherwise it would discard source-retention
  options before comparison. Original text remains in the UMF source archive.
- Type checks pass. Chromium 148.0.7778.0 passes 12 checks, including actual WASM
  compilation, source retention and invalid declaration rejection. Compiler assets
  are separate from the main ESM bundle; dependency licenses accompany their build.

Evidence: `fixtures/protobuf/behavior-results.json`, `source-compiler-results.json`,
`source-behavior-results.json` and the associated test/oracle sources. These are
bounded authored language/runtime cases, not full Protobuf conformance. Remaining:
native source emission from edited descriptors, broader corpus coverage and B-007
cross-system projection, followed by early DDD and the full extension inventory.

## Execution Evidence: Protobuf edited-source emission (2026-09-20)

The bounded Protobuf native slice now includes source emission from current
UMF descriptors, implemented by protoprint 1.18.1 in the optional WASM worker.
The emitter recompiles every output file and compares against an untouched input
copy. Unknown fields without a native source destination fail rather than vanish.
Source layout changes are reported and original UMF/source archives remain attached.

Validation:

- `bun run typecheck` passes.
- `bun run test:conformance`: 80 tests / 1,473 Bun assertions pass, followed by
  the unchanged 384-case independent JSON Schema coverage gate.
- Independent protoc recompilation matches original and edited authored descriptors;
  the edited default appears in output and survives reimport. The native Python
  oracle retains 42 expected behaviors for unchanged emitted source.
- All 19 standard source roots are accounted for: 15 emit and recompile with native
  descriptor agreement; four Edition 2024 roots reject with explicit version errors.
  Their binary descriptor preservation evidence remains separate from source support.
- Chromium 148.0.7778.0 passes 13 checks, including WASM edited-source emission and
  reimport. The Go dependency update to protobuf 1.36.12 is covered by the rerun.

SourceCodeInfo is excluded only in regenerated-source comparisons; proto2 syntax
absence is normalized to its native default. All other descriptor fields remain
in the comparison. Custom options are normalized between decoded-extension and
opaque-wire representations without dropping their values. Full native source
lexical recovery requires retained UMF, not target `.proto` alone.

Evidence lives in the three `fixtures/protobuf/emission-*.json` reports and their
test/oracle implementations. B-007 JSON Schema-to-Protobuf projection is next.
SPIKE-001 remains incomplete until that projection, known-mismatch reporting and
source-recovery comparison are executed. Broader Editions/language conformance and
the remaining ecosystem extensions remain open work under the original goal.


## Execution Evidence: Directed projection and bounded spike (2026-09-20)

B-007 now has an implemented directed JSON Schema Draft 2020-12 → proto3 profile
under CONTRACT-004 / US-004 / TD-004. Its complete result JSON Schema, explicit
field-number/integer policy, source retention, target-only reimport and per-path
fidelity issues are implemented. Unknown scopes/types and invalid bindings block;
known approximations require the caller's allow-reported-loss policy. This profile
projects schemas; it does not claim an application-data converter.

Executed verification:

- Type checking passes. `bun run test:conformance` reports 85 passing Bun tests /
  1,516 assertions; all prior native coverage gates remain intact.
- Independent protoc compiles the target. Python jsonschema and protobuf check
  nine authored source/target correspondences and three additional native behaviors.
  Every observed mismatch requires an expected issue code/path; deleting the
  required-member issue fails the oracle.
- Nested Order definitions, repeated messages and recursive local references
  compile. Strict policy, unknown dialects, nested resource scope, unsupported
  alternatives and missing/conflicting/reserved/unused tags block explicitly.
- Target-only reimport has no JSON Schema vocabulary; retained source exports the
  original schema. These tests never merge source back into the target-only path.
- Chromium 148.0.7778.0 passes 14 checks, including the public projection through
  WASM compilation, source preservation and target-only separation.

Evidence: `fixtures/projections/constraints-result.json`, `oracle-results.json`,
the projection test and independent oracle. The bounded FR-37 paths are now
executed; SPIKE-001 records conclusions and exclusions. This does not establish
complete UMF, arbitrary cross-system equivalence, TableSpec/Axon compatibility or
support for all native versions. Next: B-008/B-009 DDD semantics, then its first
projection, the remaining extension inventory and seven metadata-consumer outputs.

## Execution Evidence: DDD semantic profile (2026-09-20)

B-008/B-009 now have a complete versioned payload/package JSON Schema and executable
UMF-authored profile under CONTRACT-005 / US-005 / TD-005. Attachments distinguish
bounded contexts, context maps and domain definitions. TypeScript interfaces expose
entities, values, events, services, repositories, fields, terms and mappings.
Model consistency checks cover qualified references, identity/equality, aggregate
ownership/scope, event/repository targets, invariant boundaries and context maps.
Opaque expressions and asserted equivalence remain incomplete interpretation;
unknown content survives. No native external DDD tool compatibility is claimed.

Evidence:

- The original sales fixture retains three contexts, ten definitions, all concept
  families, a partial directional mapping, ACL ownership and an opaque invariant.
- Twelve semantic corruptions fail; copied metadata and atomic edits pass. Identical
  sales/support customer structures remain separate context-qualified identities.
- DDD reference arrays exposed a shared Ajv equality failure on null-prototype
  dictionaries. JSON-only const/enum/uniqueItems comparators fix it without invoking
  object methods. A separate core regression checks object ordering, duplicate
  references and method-like data keys.
- `bun run typecheck` and builds pass. `bun run test:conformance` reports 90 tests /
  1,577 assertions, followed by the established independent JSON Schema gate.
- Chromium 148.0.7778.0 passes 16 checks, including DDD retention and semantic edits.

The fixture and its README state that these are authored profile expectations,
not external-tool certification or business-invariant execution. The full opaque
model blocks conservative editing; the safe-edit case removes the uninterpreted
rule explicitly. B-010, the DDD-to-document projection with explicit bindings and
fidelity reporting, is next. Broader targets and the seven consumer demonstrators
remain open under the original objective.

Promotion review: entity identity is not a Protobuf field number; DDD value equality
is not inferred from JSON object structure; aggregate consistency is not a schema
shape constraint. This profile preserves those meanings in `umf.ddd`. Existing core
module/element identities supply addresses without becoming DDD bounded contexts.
No additional core promotion is justified by the current evidence.

## Execution Evidence: DDD document binding (2026-09-20)

B-010 now projects the DDD profile into JSON Schema Draft 2020-12 under CONTRACT-006
/ US-006 / TD-006. The complete result schema records explicit root, scalar encoding,
collection, openness and embed/identity choices, concept mappings and source/target
separation. Aggregate-local identity references without owner bindings and non-data
roots block. Embedding never acquires transaction, lifecycle or uniqueness semantics.

Evidence:

- An Order document embeds lines, Money and ShippingAddress and references Customer
  by identity fields. Reused value definitions remain one schema definition without
  implying shared mutable instances. Switching Customer to embedding changes native
  shape and leaves retained domain intent unchanged.
- Independent Ajv accepts the positive document and rejects missing required fields,
  wrong decimal encodings and fields forbidden by the selected identity-only shape.
  A negative total still passes, demonstrating the disclosed invariant-enforcement gap.
- Unknown/opaque domain meaning, context maps, terminology, repositories/services,
  identity/equality, aggregate rules and event semantics remain source-owned with
  explicit target limitations. Target-only reimport cannot restore DDD semantics.
- Type checks pass. The full conformance command reports 94 passing Bun tests /
  1,613 assertions and retains all existing native coverage gates. Focused projection
  tests pass after refining diagnostic source locations.
- Chromium 148.0.7778.0 passes 17 checks, including the public Order projection,
  generated-schema validity, source retention and aggregate-loss reporting.

Evidence artifact: `fixtures/ddd/document-projection.json`, its native instance tests
and browser harness. This closes the initial document-binding slice only. The next
B-011 cycle is Avro, followed by the remaining graph/API, storage, semantic-web and
operational inventory. DDD-to-SQL/OpenAPI/Axon/Palantir work and seven metadata consumer
outputs remain required. No semantic core promotion is justified solely by these
physical encodings.

## Execution Evidence: Avro schema JSON foundation (2026-09-20)

B-011 is in progress under CONTRACT-007 / US-007 / TD-007. The extension package
and complete representation schema preserve exact JSON trees for Avro 1.12.0
schema artifacts. Public import/export, copied node access and conservative
atomic edits run in Bun and browser JavaScript. avsc 5.7.9 is a bounded native
interpreter; logical types, unknown metadata, unsafe host numbers and compiler
limits remain explicitly incomplete. Unknown representation fields block export.

Evidence:

- Original Order covers recursive names, ordered unions, enum/fixed, array/map,
  primitive types, aliases, defaults, logical decimal/timestamp and custom metadata.
  All native metadata survives both UMF serializations. Exact 64-bit default tokens
  survive without rounding; unsupported interpretation prevents conservative edits.
- Apache Avro 1.12.0 and fastavro 1.12.2 agree on before/after encoded bytes and
  decoded values for two complex records. The 21-check oracle covers reader defaults,
  invalid values, writer omissions and a changed-default negative control. The report
  explicitly records fastavro accepting an out-of-range int that Apache rejects.
- `bun run typecheck` passes. `bun run test:conformance` reports 97 passing Bun tests /
  1,635 assertions, the established JSON Schema independent coverage gate and the
  new Avro oracle. Chromium 148.0.7778.0 passes 18 public-path checks including Avro.

`fixtures/avro/oracle-results.json` records versions, source hash and limitations.
Next: official corpus coverage, broader native validation and explicit cross-system
transforms. IDL, protocol/RPC and container artifacts are not implemented. The shared
exact-JSON representation is a possible core helper promotion; no domain meaning
is promoted merely because two languages serialize as JSON. All remaining ecosystem
extensions, DDD projections and seven metadata consumers remain required.


## Execution Evidence: Official Avro schema corpus (2026-09-20)

B-011 now includes all 20 `.avsc` fixtures in three Apache Avro release-1.12.0
directories, pinned to commit `8c27801dc8d42ccc00997f25c0b8f45f8d4a233e` with hashes,
license and notice. Selection is directory-based and includes unsupported cases.
US-007-AC6 checks every fixture through both core serializations and native export.

All 20 retain native metadata. The browser interpreter completes 12 and reports
limits on eight. Apache Avro 1.12.0 and fastavro 1.12.2 both parse 19 standalone
schemas; ApplicationEvent's external DocumentInfo reference is unresolved in this
profile. Each Apache-accepted schema receives one independent generated finite
instance; all 19 preserve encoded bytes and decoded values before/after UMF.
This probes schema-derived behavior but does not prove all values or union branches.

Type checks and focused Avro tests pass (four tests, 83 assertions). Both Avro
native oracles pass: 21 authored checks and 19 official-fixture binary probes with
all parser outcomes recorded. The conformance command now includes the corpus
oracle. No runtime implementation changed in this slice, so the existing actual
Chromium import/edit evidence remains applicable. Next Avro work is explicit
external named-schema bundles and cross-system transforms, followed by the remaining
inventory. The overall completion gate remains open.

## Execution Evidence: Avro named-schema dependencies (2026-09-20)

B-011 adds optional ordered dependency artifacts to the complete Avro payload
schema. Import registers their native names before the root in a fresh environment.
Artifact IDs remain separate from native names. JSON/YAML and bundle export retain
all sources; root-only export rejects a nonempty dependency list. Copied node access
and atomic edits can select a dependency, and validate the whole resulting model.
No external files or URLs are discovered implicitly.

US-007-AC7/AC8 demonstrate ApplicationEvent with its DocumentInfo dependency,
source immutability, copied access, duplicate artifact IDs, conflicting native
names, forward-resolution failure, isolated registries and unknown representation
content. Renaming a referenced dependency fails the conservative edit. Changing a
field from string to bytes succeeds, and both Apache Avro and fastavro independently
reject stale string data and round-trip the edited bytes value.

Verification: type checks pass; `bun run test:conformance` reports 100 passing Bun
tests / 1,718 assertions plus all independent native gates. Chromium 148.0.7778.0
passes 19 checks, including dependency bundle import/edit/export/reimport. The
standalone corpus still deliberately reports one unresolved schema; the separate
explicit-bundle profile supplies the missing declaration and completes interpretation.

Next: an Avro cross-system projection with explicit fidelity reporting and robust
instance examples. Broader Avro language surfaces and the full remaining extension
and consumer inventory are still open. Named-type dependency registration alone
establishes no cross-language semantic equivalence for core promotion.

## Execution Evidence: Avro document projection (2026-09-20)

CONTRACT-008 / US-008 / TD-008 implement Avro-to-JSON-Schema projection with complete
result schema, explicit long/bytes/union encodings, qualified named-type mappings,
retained source and fidelity issues. Records keep all writer fields required;
reader defaults are not mistaken for optional fields. Recursive types and explicit
dependency bundles project. Unknown/unsupported interpretation blocks where shape
cannot be trusted; strict policy rejects remaining losses.

Evidence:

- Original Order tests recursive records, enums/fixed, arrays/maps, logical types,
  long strings, encoded bytes, integer bounds, missing fields and invalid encodings,
  including trailing-newline rejection. Target-only import cannot recover Avro.
- The official corpus yields 19 independently compilable target schemas and one
  blocked standalone unresolved dependency. All 20 retain source content. Explicit
  dependency tests demonstrate that supplying the missing type permits projection.
- Independent Apache Avro and Python JSON Schema compare five manually mapped
  instance vectors. A signed-long overflow is accepted by the selected target
  string pattern but rejected by Avro; its source-positioned loss is required.
  Removing that issue makes the fidelity check fail.
- Type checks and `bun run test:conformance` pass: 103 Bun tests / 1,787 assertions
  plus all independent native gates. Chromium 148.0.7778.0 passes 20 public checks,
  including dependency-aware Avro projection and reader-default loss reporting.

This completes the initial Avro schema JSON round-trip/projection cycle, with
broader native surfaces and interpretation limits still explicitly open. It does
not close the full Avro or UMF goal. Next inventory cycle: GraphQL SDL, followed
by OpenAPI, TypeSpec, Smithy and the remaining physical/semantic/operational systems.
No type equivalence is promoted to core: Avro identity, default resolution and union
selection remain distinct from JSON Schema validation meaning.

## Execution Evidence: GraphQL SDL foundation (2026-09-20)

The next B-011 inventory cycle implements CONTRACT-009 / US-009 / TD-009 using
GraphQL.js 17.0.2. A complete generated schema covers 38 reachable SDL AST definitions
and an original-source archive. Import/export, copied AST access and atomic edits
run in browser-compatible TypeScript. The original source preserves comments and
formatting; edited source prints current AST with layout-loss reporting. Numeric
literal strings retain exact tokens beyond host integer precision.

Evidence:

- The authored shop covers all standard type families, roots, interfaces, OneOf,
  directives/defaults, and schema/type extensions through JSON/YAML. Invalid
  references, duplicate fields, defaults, OneOf declarations and executable documents
  fail. Unknown AST fields block native loss; opaque custom semantics block edits.
- An argument-default edit changes actual resolver behavior without mutating source.
  GraphQL-core 3.2.12 checks seven query/introspection/coercion cases before/after
  export and independently observes the edited default. Shared GraphQL.js ancestry
  is disclosed; this is separate-runtime evidence, not unrelated algorithm lineage.
- `bun run test:conformance` passes 107 tests / 1,815 assertions and all native gates.
  Chromium 148.0.7778.0 passes 21 checks, including public GraphQL round-trip/edit.
- Schema generation uses a pinned development-only TypeScript compiler API alias;
  build/typecheck invoke the normal TypeScript 7 package directly to avoid competing
  `tsc` binary links. Bun remains the default runtime.

Next: official GraphQL corpus and robust projection examples. Federation conventions,
introspection import and execution bindings remain open. OpenAPI, TypeSpec, Smithy
and the physical/semantic/operational inventory still follow. GraphQL nullability,
argument defaults and object interfaces are not promoted to core based on naming
similarity with storage schema concepts.

## Execution Evidence: GraphQL upstream corpus and fragments (2026-09-20)

GraphQL.js v17.0.2 commit `71606d736c79b77588a15b32b9c9497e397adae0` is now
vendored selectively with exact hashes and license: both benchmark documents,
SDL parser test source and kitchen-sink SDL source. Selection retains executable
and incomplete-schema cases, rather than filtering for import success.

The 368,240-byte GitHub schema preserves all 540 declarations and exact source
through JSON/YAML. GraphQL-core 3.2.12 confirms complete introspection equality over
552 types, including built-ins; changing Query.viewer's output type breaks equality.
The independent-runtime limitation remains explicit because GraphQL-core is a port.

Static extraction yields 48 parser cases: 29 syntax-valid fragments and 19 syntax
errors, with six dynamic call sites excluded and listed. None is a standalone valid
schema. That evidence motivated an explicit `mode: "fragment"`: it retains SDL
syntax and source with `GRAPHQL_FRAGMENT` incomplete interpretation, while default
schema mode still requires roots and consistent references. All 29 fragments survive
native and YAML round trips. GraphQL-core agrees with 47/48 syntax outcomes; the
remaining directive-extension grammar addition is recorded and pinned as an expected
profile difference. Actual Chromium checks fragment retention and incomplete status.

Next: GraphQL cross-system projection with explicit fidelity/instance expectations.
Complete-schema composition, federation conventions and introspection import remain
open alongside the rest of the extension inventory. Fragment representation is not
promoted into a universal semantic concept solely because other formats also have
unresolved references.

Final verification for this slice: `bun run typecheck` and the complete conformance
command pass, with 109 Bun tests / 2,011 assertions and all native oracles. Chromium
148.0.7778.0 passes 22 public checks. The expected 47/48 Python parser agreement is
reported separately from retention and schema-consistency success.

## Execution Evidence: GraphQL input document projection (2026-09-20)

CONTRACT-010 / US-010 / TD-010 add a complete result schema and public GraphQL
input-to-JSON-Schema projection. Callers choose the input type expression, array-only
list binding and string/integer ID inputs. Native defaults permit omission without
being inserted by JSON validation. Nullability, recursive inputs, enums, unknown-key
rejection and OneOf rules project. Fragments, output/missing types and reached custom
scalars block; source model and fidelity issues remain separate from target recovery.

Evidence:

- Authored instance checks cover missing/nullable/non-null/defaulted fields, list
  elements, enum values, recursive objects and all OneOf cardinality/null failures.
- GraphQL-core 3.2.12 and jsonschema 4.26.0 compare thirteen input instances, including
  changed coerced values and singleton-list acceptance differences. Removing required
  default/list/ID fidelity reports fails three independent negative controls.
- Three pinned GitHub mutation inputs produce valid schemas and nine native/target
  positive/negative comparisons. This is three examples out of 90 input types,
  not a claim of complete upstream input coverage.
- The full conformance command passes 112 Bun tests / 2,051 assertions and all native
  gates. Chromium 148.0.7778.0 passes 23 public checks, including input projection
  with default reporting. Existing source preservation gates remain green.

This completes the initial GraphQL SDL/input-projection cycle. Output/operation
projection, custom scalar bindings, composition/federation and broader coverage
remain explicit follow-up work. Next inventory cycle: OpenAPI, then TypeSpec, Smithy
and remaining storage/semantic/operational systems. GraphQL defaults are coercion
rules, unlike Avro reader-resolution defaults and JSON Schema annotations; current
evidence does not justify promoting one shared default semantics into core.

## Execution Evidence: OpenAPI native description foundation (2026-09-20)

CONTRACT-011 / US-011 / TD-011 implement an OpenAPI JSON/YAML exact-tree extension
with source archive, copied node access and explicit candidate edits. Native 3.1/3.2
object structure is checked with pinned official schemas; unsupported versions and
unsafe host numbers remain recoverable and incomplete. Embedded dialects, references,
formats, all prose constraints and HTTP/security execution are explicitly unvalidated.

The current release verified in discovery is 3.2.1. The official object schemas are
3.1 revision 2026-08-03 and 3.2 revision 2026-08-30, retained unchanged with hashes and
license. Ajv exposed a dynamic-anchor binding error; a private static binding works
around it only for this standalone object-schema profile. Python validates the
unmodified official schemas independently and agrees on all twelve cases, including
intentional non-validation of an invalid embedded schema keyword.

Evidence:

- Original Orders covers operations, parameters, media, recursive references,
  security, links, callbacks/webhooks and extension data. Core/native JSON/YAML
  retain content; unchanged YAML retains comments. Candidate edits preserve the
  original and report layout changes and interpretation limits.
- Exact YAML integer/fraction values survive without host rounding. Duplicate or
  non-string keys, tags, aliases and non-JSON numbers fail explicitly. Unknown tree
  fields cannot silently disappear on native export.
- JSON Schema, Avro and OpenAPI prove identical exact-JSON node definitions. That
  helper/schema now lives in core with a compatibility export and dedicated regression;
  no native domain/default/identity/execution semantics are promoted.
- Type checks and the full conformance command pass: 117 Bun tests / 2,099 assertions,
  all native gates and 24 actual Chromium public-path checks.

Next: official OpenAPI examples, embedded dialect/reference validation, legacy
3.0/2.0 interpretation and schema projections. TypeSpec, Smithy and the remaining
storage/semantic/operational inventory still follow. This foundation does not close
OpenAPI or the overall UMF objective.

## Execution Evidence: OpenAPI official corpus and legacy versions (2026-09-20)

The OpenAPI Initiative Learn OpenAPI example tree is pinned to commit
`43756549c27cbf84107b190b82c65e0336f2f09f`, with all 46 JSON/YAML files, hashes,
CC-BY-4.0 attribution and license. All 38 complete descriptions retain exact original
source through both core serializations and preserve native JSON content. Eight
referenced fragments remain distinct from standalone versioned descriptions.

Swagger 2.0 schema 2017-08-27 and OpenAPI 3.0 schema 2024-10-18 now provide bounded
legacy validation through ajv-draft-04 1.0.0. They reuse the safe JSON equality hooks;
3.1/3.2 dialect rules are not imposed on legacy Schema Objects. Eight positive/negative
legacy cases and all 38 full corpus descriptions agree with Python evaluation of
unmodified official schemas. Runtime, reference and all-prose limitations remain.

The Python corpus reader exposed date/time conversion in plain PyYAML for the 3.2
query example. Its explicit JSON-compatible profile preserves those timestamp literals
as strings; all 46 contents then compare equal. This adjustment is documented and
not generalized into a claim that arbitrary YAML schemas are interchangeable.

Next: explicit reference bundles and embedded Schema Object dialect interpretation,
then OpenAPI projections. Referenced fragments are retained source resources, not
validated standalone documents. The remaining extension inventory stays open.

Verification passes: type checks, 119 Bun tests / 2,355 assertions, all independent
native gates, and 25 actual Chromium public-path checks including legacy validation.

## Execution Evidence: OpenAPI explicit resource bundles (2026-09-20)

CONTRACT-011 / US-011-AC8/AC9 now include optional base URI and resource archives in
the complete payload schema. Explicit resources preserve fragment content and native
format without requiring each file to be a complete description. Import checks owned
URI identities, duplicate/colliding resources and source syntax; remaining contextual
interpretation stays explicit. No files or URLs are fetched implicitly.

Bundle export retains every resource, while root-only export rejects nonempty resource
sets. Copied JSON Pointer access and candidate edits select a document URI. Literal
URI/pointer lookup returns a copied node and clearly identifies its restricted scope;
named anchors and missing/malformed targets fail. Nested IDs, `$self`, dynamic scope,
contextual reference target kinds and closure remain separate work.

The official separate-file petstore has one owner plus four fragments in each JSON/YAML
variant. All eight fragment sources survive exact export, core serialization and bundle
reimport. The independent oracle looks up 11 fixture references in each supplied map,
then confirms that changing Pet ID from integer to string changes Draft4 instance
acceptance. Original documents remain unchanged; changed layout is reported.

Verification passes: type checks, 121 Bun tests / 2,398 assertions, all native gates,
and 26 actual Chromium checks including resource lookup/edit/context reporting.
Next: embedded Schema Object dialect validation and contextual reference resolution,
then OpenAPI projections. The remaining system and consumer inventory remains open.

## Execution Evidence: OpenAPI embedded dialect syntax (2026-09-20)

US-011-AC10/AC11 add embedded Schema Object keyword validation for known 3.1/3.2
profiles and explicit Draft 2020-12. Pinned dialect/meta resources retain provenance
and hashes. A role-aware visitor locates actual schema declarations in components,
parameters, media, callbacks/webhooks, request/responses, additional operations and
encoding headers. Literal examples/defaults and specification-extension data remain
uninterpreted content rather than accidental schema declarations.

Known schema nodes receive shallow standard/OAS meta-validation, followed by explicit
schema-child traversal with inherited or overridden dialect. Unknown dialect subtrees
remain preserved with warnings, including nested/deprecated dependency boundaries.
Invalid keyword types, discriminator fields, XML annotations and nested schemas fail.
This does not evaluate instances or resolve references, schema IDs, anchors or custom
vocabulary behavior. Resource fragments still require contextual interpretation.

The independent oracle checks nine fully known cases against unmodified official
dialect resources plus two 3.2 XML cases. Unknown-dialect/literal-extension cases are
explicitly excluded from that oracle and have authored preservation checks. The existing
object-only oracle remains distinct: its acceptance of an invalid embedded keyword is
now compared against the stronger adapter rejection, not mislabeled as agreement.

Verification passes: type checks, 123 Bun tests / 2,418 assertions, all native gates,
and 27 actual Chromium checks. All 38 complete official example descriptions still
round-trip. Next: contextual OpenAPI reference/schema scope and robust projections;
the rest of the extension inventory remains required. Shared meta-schema syntax is
not sufficient evidence to promote API validation/execution meaning into core.


## Execution Evidence: OpenAPI typed references (2026-09-20)

US-011-AC12/AC13/AC14 implement supplied-file Reference Object chains for seven
caller-declared roles: parameter, header, response, request body, example, link and
security scheme. Results retain target URI/pointer, copied native content, reference
chain and effective summary/description annotations. Original siblings and source
files remain intact. The result has a complete JSON Schema and explicitly reports
partial interpretation. Source roles are declared, not inferred from source locations.

Cycles, absent resources, invalid target roles, unsupported anchors and OpenAPI 3.2
`$self` identity scope fail explicitly. Resolution performs no implicit network or
filesystem access. Nested references and Schema Object scope remain unresolved.
The Python oracle independently follows a two-hop chain, verifies annotation behavior
and validates all seven target roles using unmodified official object schemas.

Verification passes: type checks, 126 Bun tests / 2,448 assertions, all native gates,
and 28 actual Chromium checks. CONTRACT-011 and TD-011 record the bounded behavior.
Next: contextual schema scope and OpenAPI projections; all remaining extensions and
metadata consumers remain in the completion inventory.


## Execution Evidence: contextual OpenAPI schema extraction (2026-09-20)

US-011-AC15/AC16 deliver the public `extractOpenapiSchema` API and complete result
JSON Schema. Selection uses declared Schema Object positions, preserves exact numeric
lexemes and references, and returns dialect provenance and the full copied UMF source
with supplied resources. Examples and contextless fragments are rejected. This is a
metadata-consumer prerequisite for FR-41 and OpenAPI projections, not a standalone
validator: relative-reference scope, IDs, anchors, dynamic scope and runtime meaning
remain open. Unknown dialects remain attached without conversion.

Type checking, 128 Bun tests / 2,466 assertions, the existing native oracle gates and
29 Chromium checks pass. New extraction tests establish exact/context retention and
selection boundaries; they do not extend native evaluation claims. Next: resolve
schema resource scope and implement explicit OpenAPI validator projections. The full
extension and seven-consumer inventory remains required.


## Execution Evidence: OpenAPI static schema scope (2026-09-20)

US-011-AC17/AC18 add the public schema index and one-step static reference resolver.
Known dialects identify schema-bearing positions; nested IDs, named anchors, document
identity and retrieval aliases retain original source locations. Explicitly classified
standalone schema resources join the index; unclassified fragments remain preserved.
Unknown dialects, identity collisions, missing resources and non-schema targets fail.
Complete JSON Schema descriptions cover both public results.

Python referencing 0.37.0 agrees on four static JSON Schema resolutions. OpenAPI role
discovery and `$self` handling have authored tests and are not attributed to that
independent oracle. Type checking, 130 Bun tests / 2,493 assertions, all native gates
and 30 Chromium checks pass. Results continue to report incomplete interpretation.
Next: dynamic-reference evaluation and explicit validator projection using retained
resource context; remaining extension and consumer scope is unchanged.


## Execution Evidence: OpenAPI static JSON constraint projection (2026-09-20)

US-012 and CONTRACT-012 implement selected-schema projection to Draft 2020-12. Static
references and nested schema positions become generated definitions; recursion is
preserved through allocation before traversal. Source context and location mappings
remain separate from target constraints. Identity changes and omitted API/annotation
behavior have explicit reports; strict policy blocks losses. Dynamic scope, unknown
assertions, missing references and unavailable target compilation block projection.

Python jsonschema compares ten authored instance vectors against original constraints
and emitted/UMF-round-tripped targets. Six pinned official Tic Tac Toe schema components
add twelve comparisons. Three missing-report controls verify fidelity evidence. Type
checking, 134 Bun tests / 2,537 assertions, all native oracle gates and 31 Chromium
checks pass. The result has a complete JSON Schema and the public API runs in-browser.

This completes the first static OpenAPI projection cycle, not all OpenAPI support.
Dynamic scope/evaluation, legacy dialect conversion, request/response direction and
HTTP behavior remain explicit work, alongside the remaining language/system inventory
and all seven metadata-consumer acceptance paths. No domain concept is promoted to
core from matching representation syntax alone.


## Execution Evidence: explicit OpenAPI dynamic scope (2026-09-20)

US-011-AC19/AC20 add `$dynamicRef` target selection from an explicit outermost-to-
innermost resource stack. Initial static resolution gates dynamic selection; ordinary
anchors and pointers retain static behavior. Scope identities must exist and the last
resource must own the selected source schema. The public result preserves initial and
selected locations, native target and supplied stack, with a complete JSON Schema.

Python referencing agrees on six target selections including competing outer anchors
and ordinary-anchor fallbacks. Type checks, 136 Bun tests / 2,567 assertions, all native
gates and 32 actual Chromium checks pass. Caller-provided evaluation paths are not
certified; assertions and annotations are not evaluated by this operation. Static
projection continues to block dynamic schemas. Dynamic validation/projection, legacy
OpenAPI conversion and remaining extensions/consumers remain in the full inventory.


## Execution Evidence: TypeSpec source/compile foundation (2026-09-20)

US-013, CONTRACT-013 and TD-013 add `umf.typespec` 0.1.0 with complete source-bundle,
syntax-location and compiler-report JSON Schemas. TypeSpec 1.16.0 is pinned. Supplied
`.tsp` files retain exact text through UMF JSON/YAML; syntax navigation and candidate
source edits are available. An in-memory host compiles against the bundled standard
library and fixed native decorator/intrinsic modules. Project configuration, arbitrary
JavaScript libraries and emitters are not implicitly loaded. Version, license and
standard-file hashes are recorded.

The authored multi-file corpus exercises imports, namespaces, templates, recursive
models, enums/unions, operations, standard decorators, comments, Unicode and a numeric
literal beyond JavaScript's safe integer domain. A type/default mismatch produces the
specific native `unassignable` error after an edit. Native CLI checks independently
exercise the filesystem host on re-emitted sources and confirm that diagnostic; they
share compiler implementation with the memory host and are labeled accordingly.

Type checks, 139 Bun tests / 2,590 assertions, all existing native gates plus the
TypeSpec CLI checks, and 33 Chromium checks pass. Strengthened diagnostic-specific
TypeSpec tests and CLI checks were rerun successfully after the full gate. No full
TypeSpec support claim is made: semantic type-graph representation, upstream corpus,
configuration/library support and cross-system projections remain required next work.
Other OpenAPI gaps and the remaining system/consumer inventory remain open.


## Execution Evidence: selected TypeSpec semantic graphs (2026-09-20)

US-013-AC5/AC6 add a compiled graph consumer API with a complete JSON Schema. Selected
types expose snapshot-local IDs, native kinds/names, source locations, attributes and
relationship edges. Recursion and instantiated templates retain object identity; model
inheritance remains separate from own properties. Native literals/defaults use exact
text or tagged value structures, and decorator arguments/doc metadata are available.
The full copied source and compiler report remain attached. Failed compilation or
unresolved selection blocks availability; unexpanded state stays explicit.

A native filesystem-host traversal agrees with graph-derived inherited property names,
resolved types, optionality and defaults. The authored graph survives source YAML
round trip unchanged. Type checks, 141 Bun tests / 2,651 assertions, native gates and
34 Chromium checks pass. This establishes a selected consumer view, not reversible
complete compiler-state interchange. Next: upstream TypeSpec corpus, project/library
configuration and native emitter-backed projections; remaining extensions and consumers
and previously recorded OpenAPI gaps remain in scope.


## Execution Evidence: full upstream TypeSpec sample inventory (2026-09-20)

US-013-AC7/AC8 archive all 110 sample/context files under the pinned upstream
samples/specs subtree, plus license/compiler metadata. The 51 TypeSpec files form
31 entrypoints. Thirty syntactically accepted bundles retain exact sources and native
diagnostics through JSON/YAML; two compile with the standard library, 28 report errors
under the missing-library profile, and the intentionally invalid editor sample is
rejected. Filesystem-host native outcomes agree for all 31; code multisets agree for
all 30 syntax-valid bundles. Compiler metadata at the pinned commit is 1.16.0.

Upstream string-template semantic extraction also survives source round trip and runs
in Chromium. Type checks, 143 Bun tests / 2,888 assertions, native gates and 35 browser
checks pass. Passing gates do not turn the 28 compiler-error samples into supported
models. Non-source configuration, emitter/custom JS and generated outputs remain
archived context, not input interpreted by the current source-bundle profile.

Next implementation: explicit versioned TypeSpec library registration, starting with
HTTP/REST/OpenAPI, followed by JSON Schema, Protobuf, GraphQL and versioning as shown
by corpus diagnostics; retain project configuration and library selectors and verify
newly supported samples in both hosts and browser. Custom sample code requires an
explicit host registration contract. Native emitter projections and remaining system/
consumer work remain required; this corpus does not narrow completion scope.


## Execution Evidence: registered TypeSpec libraries (2026-09-20)

US-013-AC9/AC10 add exact library selectors to source payloads, bundle exports and
compiler reports. HTTP 1.16.0, REST 0.86.0, OpenAPI 1.16.0 and Streams 0.86.0 mount
pinned sources/package metadata and fixed native JS modules only when selected.
Unknown versions remain preserved and fail compilation explicitly. Dependencies are
not silently selected. Licenses and source hashes accompany the library bundle.

With the four-library selection, 20/31 pinned upstream entrypoints compile, up from
2/31 without libraries. Ten retain compiler errors and one is intentionally invalid
syntax. Thirty syntax-valid bundles retain selectors, sources and native diagnostics
through YAML. The native filesystem host agrees on all thirty outcomes and diagnostic
code multisets. Chromium compiles a selected-library service before and after round
trip. Type checks, 145 Bun tests / 2,959 assertions, native gates and 36 browser checks
pass. Semantic graph extraction uses the same selector-aware compiler host.

Next: register the remaining official libraries identified by the corpus, preserve
project configuration, and implement native-emitter-backed projections. OpenAPI3
emission is not provided by registering the OpenAPI metadata library. Custom sample
JavaScript still requires an explicit host contract. All remaining extension, consumer
and recorded OpenAPI work remains part of the original completion scope.


## Execution Evidence: expanded TypeSpec library coverage (2026-09-20)

US-013-AC11 adds GraphQL 0.3.0, JSON Schema/OpenAPI3 1.16.0 and Protobuf/Versioning/
SSE/Events 0.86.0 to explicit registration. Library archives now preserve published
root configuration. This fixed a measured discrepancy: GraphQL needs its own auto-
decorator feature opt-in, while HTTP's config enables its type-info provider. No
consumer feature setting is synthesized, and emitter execution remains disabled.

The all-library profile compiles 29/31 upstream entrypoints. Only the petstore requiring
unregistered custom JS and the intentional editor syntax failure remain non-compiling.
The filesystem host agrees for all thirty syntax-valid cases, including diagnostic-code
multisets. Exact library selections, sources and diagnostics survive YAML round trips.
GraphQL compilation with its published feature config passes in Chromium. Type checks,
146 Bun tests / 3,020 assertions, all native gates and 37 browser checks pass.

Next: native emitter-backed projections and explicit consumer project/custom-module
contracts. All prior profiles remain evidence baselines, and the remaining extensions,
metadata consumers, semantic interchange gaps and OpenAPI work remain required.

## Execution Evidence: TypeSpec native JSON Schema emission (2026-09-20)

US-013-AC12/AC13 add an explicit native emission operation and complete result schema.
The pinned JSON Schema 1.16.0 emitter runs in the same browser-compatible memory host,
with explicit integer wire policy and retained source. Emitted/empty/blocked outcomes
are distinct; compiler errors suppress partial output. Output paths, collisions and
aggregate size are checked. Ordinary compilation remains no-emit.

The official Person/Address/Car sample emits three files identically after YAML round
trip and through the native filesystem host. Seven independent Python jsonschema cases
verify target bounds, required fields, uniqueness and references. Type checking, the
full conformance gate (148 Bun tests / 3,036 assertions and all native gates), and
38 Chromium checks pass. The browser directly runs the native emitter.

This completes the native JSON Schema emission foundation, not the TypeSpec cycle.
Next: audited projection contracts that account for unrepresented compiler semantics,
additional native emitters, consumer configuration/custom module registration, and
remaining extension languages/systems. No new core concept is promoted on this evidence.

## Execution Evidence: TypeSpec numeric emission fidelity (2026-09-20)

US-013-AC14 tests both integer strategies with exact unsafe-integer literals, int64,
uint64 and an edited percentage bound. The pinned emitter rounds the literal and omits
64-bit bounds (plus numeric syntax for string strategy). Every emission result now
discloses these concrete risks and retains exact source. Twenty-six independent Python
comparisons demonstrate those losses and the successful bound edit. Native filesystem
emission matches five cases / seven files. No equivalence claim follows from these
passing loss regressions.

Type checking, 149 Bun tests / 3,059 assertions, all native conformance gates and 39
Chromium checks pass. A faithful TypeSpec projection still requires per-concept loss
accounting and explicit repair/rejection policies for these numeric cases; source
retention and repeatable native emission alone do not satisfy that requirement.

## Execution Evidence: TypeSpec native-output materialization (2026-09-20)

US-013-AC15/AC16 and CONTRACT-013 add `projectTypeSpecToJsonSchema` and its complete
result schema. A selected emitted file becomes a UMF JSON Schema target with every
other emitted JSON file registered as a dependency. Source, emission policy, resource
URI mappings and explicit global risks remain attached. Strict policy blocks target
creation; allow-reported-loss permits native output with `complete: false`. This is
not an exhaustive per-concept semantic projection or an instance converter.

The official sample's target survives YAML round trip and native export. Seven
independent Python cases verify target reference resolution and validation behavior.
Type checking, 151 Bun tests / 3,080 assertions, all native gates and 40 Chromium checks
pass. The browser directly exercises the projection. TypeSpec source-domain fidelity
remains incomplete; numeric repair/rejection, source-located loss auditing, additional
emitters, consumer configuration and the remaining system inventory still require work.

## Execution Evidence: Smithy JSON AST foundation (2026-09-20)

US-014, CONTRACT-014 and TD-014 add `umf.smithy` 0.1.0, its complete tagged-tree
payload schema and a native structural profile. Exact metadata/trait numbers, shape
references and mixins survive native-to-UMF JSON/YAML round trips. Candidate edits
retain the original and disclose that native semantic checks are still required.
Unknown native content remains retained; unknown representation fields block export.

All 63 upstream loader/valid JSON fixtures are pinned with hashes and license. The
JVM 1.73.0 oracle compares original/round-tripped outcomes, event IDs and canonical
model hashes for these plus one authored case. All 64 comparisons agree; 62 assemble
in isolation. Two require missing referenced models and remain explicit gaps. Native
validation accepts an edited target, changes the model hash, and rejects a missing
target. Browser checks exercise exact metadata, round trips and candidate editing.

Type checking, 154 Bun tests / 3,222 assertions, all native gates and 41 Chromium
checks pass. Smithy remains incomplete: multi-file assembly/context, native IDL,
normalized model editing, trait/selector semantics and target projections are required.
The remaining common-system inventory and unfinished earlier profiles remain in scope.
No shared concept is promoted to core based on these retention checks alone.

## Execution Evidence: Smithy supplied dependency bundles (2026-09-20)

US-014-AC5/AC6 extend the package schema and APIs with explicit dependency models,
IDs, bundle export and dependency-selected candidate edits. Every root retains exact
native values and receives structural inspection. Duplicate IDs and malformed ASTs
fail; unknown representation fields block export. Single-file export cannot omit
dependencies. Native model conflicts are preserved for the assembler to reject.

Ten JVM assembly cases exercise the two previously unresolved upstream ASTs with an
explicitly authored Widget dependency: original/restored model hashes agree, valid
edits change native models, and missing references/conflicting definitions fail. This
is additional supplied-context evidence; the original standalone corpus still records
two unresolved cases. Chromium verifies dependency retention and the export guard.

Type checking, 156 Bun tests / 3,238 assertions, all native gates and 42 browser checks
pass. Remaining Smithy work includes native IDL, browser-callable assembly, normalized
model editing/provenance, trait/selector semantics and explicit projections. Broader
extension coverage and prior unfinished profiles remain required for goal completion.

## Execution Evidence: Smithy IDL source preservation (2026-09-20)

US-014-AC7–AC9 add the complete `smithy-idl-sources` payload schema and TypeScript
source import/export/candidate-edit APIs. Relative IDL/JSON filenames, exact text,
comments, Unicode and numeric lexemes survive UMF JSON/YAML. Source validation always
reports unvalidated syntax/semantics; it checks the archive, not the language.

All 80 pinned upstream IDL fixtures have matching native assembly outcomes, event IDs
and canonical hashes before/after round trip. Seventy-eight assemble standalone; two
require context. An authored multi-file model round-trips, changes meaning after a
constraint edit, and fails on an unresolved reference. Type checking, 159 Bun tests /
3,414 assertions, all native gates and 43 Chromium checks pass.

SPIKE-002 tested direct compilation of native Smithy 1.73.0 with TeaVM 0.15.0. It
failed on seven distinct Java runtime surfaces, including reflection and resources.
The reproducible optional experiment is not part of the passing gate and supplies no
browser assembly support. Next implementation must resolve the browser parser/assembly
requirement or establish a conformant alternative; normalized editable models, complete
trait/selector interpretation and projections also remain open. Source archival alone
does not finish Smithy or reduce the remaining extension/system scope.

## Execution Evidence: Smithy JavaScript assembler (2026-09-20)

SPIKE-002 now has a successful patched runtime. `bun run build:smithy-experiment`
verifies pinned upstream source hashes, regenerates thirteen compatibility patches
and compiles the native 1.73.0 assembler through TeaVM 0.15.0. The unmodified baseline
still fails reproducibly. No native model validation is disabled; unsupported generic
superclass reflection throws explicitly. The embedded prelude is unchanged. String
slice materialization resolves an observed TeaVM CharBuffer offset difference.

All 144 existing JVM AST/IDL corpus outcomes, sorted diagnostic IDs and canonical model
hashes agree in Bun and Chromium. Browser checks reject three invalid models, preserve
exact unsafe-integer metadata and require no process/Bun globals. Twenty-six JVM
compatibility-helper comparisons/guards and TypeScript type checking pass. A clean Bun
build reproduced the identical runtime SHA-256 recorded in both corpus reports. This
is separate evidence; the public library's existing 159-test/43-browser
source/archive baseline was not replaced or reclassified as native assembly support.

Next: integrate the optional runtime behind a typed, source-retaining public assembly
API; expand the negative corpus and reflective/custom-validator cases; isolate work in
a browser worker; and govern normalized-model editing and projections. Unsupported
reflection and the remaining language/system inventory keep the full goal incomplete.

## Execution Evidence: public Smithy native assembly (2026-09-20)

US-014-AC10/AC11 add a typed assembly backend, the explicit pinned-JavaScript adapter,
`assembleSmithyDocument` and complete bridge/result JSON Schemas. Both source archives
and AST dependency bundles produce explicit native file inputs. Source, compiler
identity, exact native model JSON and events (including locations/shape IDs) remain
attached. Runtime/protocol/native/import failures expose no partial assembled model.

All 144 corpus cases match unmodified JVM acceptance, native event IDs and initial
canonical model hashes through the public API. All 140 accepted models survive UMF
YAML and reassemble to the JVM's second-stage output. Two mixin override cases add
explicit apply entries on reloading; separate native flattened-model hashes remain
stable. This finding is retained and disclosed, not hidden by an idempotence claim.

Type checking, 162 Bun tests / 3,441 assertions, the corrected full native conformance
gate and 44 public Chromium checks pass. The updated optional runtime also passes all
144 direct Chromium/JVM comparisons, negative inputs and exact-number checks. The full
conformance and browser commands now build the optional pinned runtime through Bun.

Remaining Smithy work includes worker isolation/cancellation/deadlines, wider negative
fixtures, unsupported reflection/custom-validator coverage, normalized-model editing
and explicit projections. This integration does not finish Smithy, earlier incomplete
profiles or the remaining common-system inventory. No concepts are promoted to core.

### Smithy worker execution

Implemented US-014-AC12 with an explicit module-worker backend, a fresh runtime per
assembly, AbortSignal cancellation and bounded configurable deadlines. Every settled
job terminates its worker. Timeout/cancellation retain the source and expose no model.
Chromium 148 verifies native acceptance/rejection and responsive-page abort/deadline
behavior using a separate nonterminating test worker. Remaining Smithy work includes
broader negative/custom-validator coverage, reflection gaps and cross-system projections.

### Smithy negative-corpus expansion

Completed US-014-AC13: pinned all 182 upstream loader/invalid model files and compared
JVM rejection/exception behavior with the public JavaScript API after source round trip.
All agree, with source retained and no partial models. Chromium independently runs the
same VM comparison for 326 combined corpus cases. This closes the previously tiny
negative-sample gap for the loader subtree; custom validators, remaining reflection
behavior, selectors and cross-system projections still require further work.

### Smithy native metadata selection

Implemented US-014-AC14: a typed native selector query operation, complete result/bridge
schemas, retained source/assembly reports, and exact shape-ID sets. All 90 expressions
from the full 15-file upstream selector case corpus match JVM and upstream expectations;
Chromium repeats every comparison. Three invalid selectors fail without partial sets.
Remaining selector work includes worker execution, variable-environment results and
custom starting contexts. Smithy projections and other extension families remain open.

### Smithy worker queries

Implemented US-014-AC15: worker dispatch for native selector queries, a shared AbortSignal
across assembly/selection, separate stage deadlines and stage-specific failure codes.
Selection failure retains the completed assembly and source without partial shape sets.
Worker queries close the execution follow-up above. Variable-environment results,
custom starting contexts, projections and the remaining extension families stay open.

### Smithy native JSON Schema emission

US-014-AC16 adds a pinned native converter, explicit profile/loss policy, complete result
schema, and source/native-output retention. The 52-root JVM comparison covers every
upstream source resource plus authored models: 42 usable targets, eight native failures,
and two dangling recursive-root outputs blocked by target compilation. Twelve independent
target-instance vectors verify constraints and expose fractional-long semantics. Remaining
work includes full native configuration, worker emission, root-reference/name-conflict
handling, service lowering and exhaustive fidelity analysis. Other extensions remain open.

### Smithy recursive root definitions

US-014-AC17 adds native-root-definition-2020-12 as an explicit alternative profile.
Both original and adapted output remain available. The expanded 55-root audit matches
JVM output/failures; adapted emission yields 47 targets and retains eight native failures.
It closes recursive-root availability for this profile without claiming to fix naming,
mixin conversion, broader configuration or source/target semantic equivalence. Independent
recursive vectors and exact target round trips provide the validation evidence.

### Smithy declared service-context naming

US-014-AC18 adds explicit native service context and declared rename handling. All 40
service/root combinations match the JVM: 30 usable targets and ten rejected outside-service
roots. Target round trips and independent instance vectors preserve distinct namespace
meanings. This resolves the tested declared-rename and separate-service-closure conflicts;
it does not provide arbitrary aliases or finish all name-conflict handling. Native mixin
conversion, general configuration, service lowering and the broader extension scope remain.

### PostgreSQL cycle begins

US-015 / CONTRACT-015 / TD-015 add umf.postgresql 0.1.0 with an exact source archive,
complete tagged-tree payload schema and a pinned PostgreSQL 17.4 WASM parser/deparser.
Candidate edits propagate through native SQL and are checked by reparsing; Protobuf
encoding cannot silently drop unknown fields. Authored schema samples, Chromium and a
separate PostgreSQL 17.7 pglast oracle provide initial evidence. Upstream corpora, catalog introspection/execution and DDD/cross-system projections remain
required. Smithy's remaining gaps remain open; beginning this family does not close them.

The PostgreSQL typed native schema now describes 272 messages, 71 enums and 1,665
fields from the pinned descriptor. Generation checks exact codec field/enum inventories
and 4,560 individual wire vectors. Native export requires schema validity as well as
codec/reparse fidelity. Unknown fields remain preservable. The optional backend now constructs typed Boolean messages to bypass its converter
defect; raw defective backends remain blocked by fidelity validation.

The full upstream deparser suite now contributes 416 cases / 420 statements, each with
UMF JSON/YAML and guarded native round trips. The separate pglast oracle verifies every
regenerated query. Corpus extraction preserves C literals and records commit/license/hashes.
Broader regression suites, catalog introspection/execution and projections remain required;
these syntax results do not close the PostgreSQL extension cycle.

### PostgreSQL database reconstruction evidence

US-015-AC5 now executes both authored samples (14 statements), their UMF-regenerated SQL,
and a pg_dump schema-only export passed through UMF in three isolated PostgreSQL 17.4
databases. The bounded catalog snapshots match for six relations, two domain/enum types
and one function, including their tested constraints, policies, privileges and metadata.
All eight behavior probes pass in each database (24 total). The image is digest-pinned;
Docker networking and ports are disabled, storage is temporary and cleanup is verified.

`bun run test:postgresql-catalog` reproduces this evidence and is included in full
conformance. Docker is now required for that full command. General catalog interchange
schemas/APIs, additional object families and catalog fields, cluster roles/tablespaces,
data state, migration behavior and cross-system projections remain open.

### PostgreSQL catalog capture package

US-015-AC6 adds umf.postgresql.catalog 0.1.0 with complete schemas for its tagged payload
and current observed-metadata profile. It retains query provenance, catalog metadata and
original reconstruction SQL, supports qualified relation lookup, and preserves unknown
content and exact numeric tokens. Candidate edits persist modified state across UMF and
native round trips; the reconstruction accessor refuses stale archives.

The live oracle now sends its capture through this extension before reconstructing the
third database. General pg_catalog coverage, additional object families, metadata-to-DDL
synthesis and schema migration remain open. The evidence query's profile is a declared
implemented subset, not a reduction of the final catalog interoperability requirement.

### Catalog object families in snapshot v2

US-015-AC7 adds user triggers, standalone composites, ranges/multiranges and collations
with typed metadata sections. Legacy v1 captures remain supported; v2 requires all four
new sections. The live oracle now executes 24 authored statements and compares nine
relations, two domains/enums, one user trigger, one composite, one range/multirange family,
one collation and seven functions (including server-generated range constructors).
All 36 behavior probes pass across source, regenerated and dump-restored databases.

The broader catalog backlog remains: dependency graphs, aggregates, casts/operators,
text-search objects, foreign-data infrastructure, replication, additional field coverage,
data-state reconstruction, migrations and cross-system projections. No extension concept
was promoted to core on the basis of name or structural similarity.

### Native dependency capture and query

US-015-AC8 adds snapshot v3 dependency edges with schema-described native endpoints/kinds.
All 105 observed edges survive regenerated DDL and dump-based reconstruction. The native
probe matrix now has 42 checks across three databases, including DROP RESTRICT rejection
and the matching DROP CASCADE effect on a referenced composite type. Browser dependency
queries keep native object identities distinct and expose missing coverage explicitly.

Full dependency/lineage coverage remains open: pg_shdepend, pinned built-ins without
pg_depend rows, dynamic/runtime SQL and excluded object families require separate work.
No topological execution order, migration generator or core relationship equivalence is
claimed. Legacy v1/v2 captures retain their original profile and query provenance.

### PostgreSQL row projection to JSON Schema

US-015-AC9 adds a source-preserving, explicit-encoding read-row projection with a complete
report/policy schema and matching SELECT query. It supports native text, boolean, int32
and JSON value encodings, blocks unverified bindings/edited captures, and requires an
explicit loss policy. Strict mode emits no query or target. Identifiers/keys are quoted.

Two live row shapes run against source, regenerated and dump-restored databases: six
native rows validate independently, including bigint/decimal text and exact embedded JSON
tokens. Six invalid representation mutations reject. This begins PostgreSQL cross-system
projection evidence; INSERT semantics, DDD lowering, automatic native constraint conversion,
instance decoders, migrations and the other extension families remain required work.

### Complete live coverage of implemented row encodings

The row fixture matrix now covers sql-text, json-boolean, json-int32 (including smallint)
and json-value against all three reconstructed databases. Fifteen native rows validate;
33 invalid representation mutations reject independently. True, false, nullable booleans,
SQL NULL, JSON null, empty text and smallint bounds are explicit cases. The NOT NULL
jsonb fixture demonstrates why JSON null remains accepted under json-value.

The additional table brings the live source to 25 DDL statements, ten relations and
110 captured dependency edges; all catalog comparisons and 42 behavior probes still pass.
This closes the previously documented boolean live-evidence gap, not the broader catalog,
projection, migration or remaining-extension requirements.

### Arrow cycle: native schema feasibility

SPIKE-003 begins the planned Arrow family without closing PostgreSQL's remaining work.
A pinned TypeScript/browser native probe covers 52 schema cases: 47 descriptor-preserving,
one struct alias normalization, one duplicate-metadata collapse and three unsupported
families. PyArrow reads 49 emitted IPC schemas; its re-emission renumbers the large
schema dictionary ID. The native JSON writer also drops schema/field metadata.

These results require a preservation-first Arrow representation independent of the native
JavaScript object model. The extension package, complete schemas, unknown FlatBuffer/IPC
handling, maps, upstream/data corpora and projections remain implementation work. Public
Arrow support is not yet claimed. No shared concept was promoted into core.

### Arrow integration-schema extension

US-016 / CONTRACT-016 / TD-016 introduce umf.arrow 0.1.0, its full tagged-payload schema,
a typed extensible integration-JSON grammar and import/export/get/edit APIs. All 52
schema cases survive both UMF formats, including duplicates and native-unsupported types.
Exact dictionary IDs and known integer parameters are checked without host rounding.

The native behavior oracle confirms unchanged results after UMF: 49 decoded schemas and
three unsupported schemas retained. This is the first public Arrow schema boundary;
complete FlatBuffer/IPC handling, conversion guards, dictionary memo/data semantics,
upstream/data corpora and cross-system projections remain required.

### Arrow guarded schema IPC export

US-016-AC4 adds explicit-backend schema-only IPC export. Native decode and re-read must
preserve source semantics under documented aliases/defaults; unknown fields/types, duplicate
metadata and unsafe host dictionary IDs cannot disappear. The source JSON is retained.
Of the 52 authored cases, 48 export and four block. PyArrow independently verifies every
success and an edited field. The optional browser runtime builds separately from core.

Arbitrary IPC import, unknown FlatBuffer preservation, full int64 backend IDs, data and
dictionaries, unsupported native type families, upstream corpora and projections remain
required. This does not close the Arrow extension or the broader goal.


### Arrow native IPC input evidence

SPIKE-003 now includes 18 authored PyArrow file/stream inputs with actual data and
metadata. Twelve native JS rewrites pass independent complete-table comparison;
six unsupported view/run-end inputs fail explicitly. Chromium agrees on all 18
native decode outcomes. A separate six-case consumption probe shows why native
reader success cannot serve as complete IPC validation: trailing bytes and a second
stream are not represented by the first reader's output. These experiments are
reproducible through scripts/arrow-ipc-inputs.py, arrow-ipc-inputs.ts,
arrow-ipc-boundaries.ts and arrow-ipc-browser.ts. Public byte-preserving IPC import,
framing/consumption reporting, complete FlatBuffer schemas, upstream data corpora and
cross-system projections remain required; no extension or core completion claim changes.


### Arrow byte capture implementation

US-016-AC5 / CONTRACT-016 now provide the separate umf.arrow.ipc package and complete
capture-envelope JSON Schema, with bounded exact-byte import/export and optional native
schema observation. Four Bun tests (153 assertions) pass; Chromium verifies all 18
public JSON/YAML capture round trips and observed/uninterpreted outcomes. Typechecking
passes. scripts/arrow-ipc-browser.ts reproduces the browser evidence. Invalid/trailing
source remains intact, and no schema observation becomes authoritative source.

This closes the initial source-preservation gap identified by the IPC experiment.
It does not close semantic IPC import, full FlatBuffer schemas, data/schema edits,
framing/consumption validation, upstream corpus or cross-system projection work.


### Arrow complete pinned metadata vocabulary

US-016-AC6 adds umf.arrow.flatbuffer and its generated logical model JSON Schema:
59 declarations, 85 fields and 64 explicit enum/union members from all five pinned
Arrow 21.0.0 FlatBuffer files. Native flatc 23.5.26 independently confirms name and
required-table-field inventories. Four Bun tests (2,217 assertions), typechecking and
a Chromium logical-model check pass. Source hashes and compiler evidence are retained.

This establishes structural vocabulary coverage for that pinned source set, not full
Arrow extension completion. Next work must connect the logical model to actual IPC
metadata, preserve unknown wire content and field presence, validate native semantics,
implement useful edits/transforms, and expand upstream/native data evidence. Cross-system
projections, the remaining ecosystem inventory and seven consumers remain required.


### Arrow raw metadata decoding

US-016-AC7 connects the logical metadata vocabulary to binary FlatBuffer roots. Seventy
native metadata roots decode and match independent flatc 23.5.26 output, including all
five root types, listview/largelistview/runend metadata, exact dictionary IDs and duplicate
metadata keys. Chromium matches all 70 logical models/source bytes. Five Bun tests cover
positive metadata, preserved unknown slots, unknown enums, malformed/truncated buffers
and traversal bounds; typechecking passes. Artifacts and reproduction are in TD-016.

This implements raw metadata decoding with exact source retention, not full IPC framing,
complete wire verification, semantic validation, encoding or edits. Those tasks and the
remaining ecosystem/projection/consumer inventory remain required; no core promotion
is supported by this wire-format work alone.


### Arrow metadata encoding and logical edits

US-016-AC8 adds guarded raw metadata encoding and atomic logical-model edits. All 70
corpus roots encode in Bun and Chromium. Independent flatc comparison passes for those
70 plus an edited min-int64 dictionary ID and explicit-default metadata (72 outputs).
Unknown logical properties and retained wire-omission markers block encoding; backend
semantic drift and lossy string conversion are detected. The optional runtime pins
FlatBuffers 25.9.23. Typechecking passes; focused regression evidence is under tests/arrow/.

This closes raw metadata encode/decode/edit support within the documented structural
profile. IPC framing, source/body-aware dataset edits, semantic validation, upstream
corpora, cross-system projections and the remaining extension/consumer inventory stay
open. Native metadata agreement does not promote Arrow concepts into core.


### Arrow IPC boundary inspection

US-016-AC9 adds inspectArrowIpcLayout with a complete report JSON Schema, decoded metadata,
body boundaries, footer location and explicit incomplete/remaining-content diagnostics.
Nineteen modern file/stream and legacy stream inputs agree with native PyArrow offsets;
Chromium repeats their public inspections. Three Bun tests (228 assertions) cover those
comparisons, optional EOS, trailing and concatenated content, truncation and corrupt
file footers. Typechecking passes. Native oracle reproduction is
scripts/arrow-ipc-layout-oracle.py; browser evidence remains arrow-ipc-browser.ts.

Framing inspection does not complete footer/block/schema consistency, dictionary state,
body semantics, dataset editing, upstream corpora or projection work. Those and the
remaining extension/consumer inventory remain in scope.


### Arrow footer consistency

US-016-AC10 adds a schema-described footer consistency report. Nine file fixtures agree
with their embedded streams; ten streams correctly have no footer comparison. Bun tests
re-encode six contradictory footers that still pass framing and detect their schema,
version, block count/duplicate, offset or length differences. Reordering is reported as
a recommendation mismatch, not a validity error. Chromium checks all 19 corpus outcomes.

This adds metadata consistency evidence, not complete native validity. Dictionary state,
body layouts/compression, source/body-aware edits, upstream corpus breadth, projections
and the remaining extension/consumer inventory remain required.


### Arrow dataset field-name transform

US-016-AC11 implements a real dataset transform using the metadata codec and framing
work: rename a positional field, update both schema copies and file offsets, preserve
all record/dictionary messages byte-for-byte, retain source/candidate envelopes, and
report uninterpreted name-reference risk. PyArrow independently verifies all 19 renamed
datasets against expected full tables. Chromium emits identical bytes for those 19.
Bun tests cover nested selection, missing EOS, unknown envelope retention and rejection
of invalid paths/trailing content; typechecking passes.

This demonstrates a bounded native Arrow transform. It does not finish general schema
migration, data/dictionary semantic validation, upstream corpus breadth, cross-system
projections, remaining extension packages or the seven consumer classes.


### Arrow complete upstream IPC integration corpus

US-016-AC12 pins all 275 files in the selected apache/arrow-testing integration subtree
plus license: 182 binaries and 91 compressed JSON examples, README and license. All binary
and extracted-schema JSON/YAML round trips pass in Bun and Chromium. All 182 inputs frame;
179 rename outputs pass independent PyArrow complete-table comparison and have identical
Chromium bytes. The three retained 0.14.1 footer-version discrepancies block transforms
while preserving native-readable originals. CONTRACT-016 records paths and boundaries;
corpus outcome baselines and 15 focused historical assertions guard these claims.

This closes the missing upstream integration-corpus evidence for the current Arrow
operations. Historical mismatch policy, fuzz corpus, body/dictionary semantic validation,
general migrations, cross-system projections, remaining ecosystem packages and all seven
metadata consumer classes remain required work. No core promotion is justified merely
by this corpus agreeing with native codecs.


### Spark native schema feasibility

SPIKE-004 starts the planned Spark StructType/DataType extension cycle. Forty-nine
native schema JSON probes pin PySpark/JVM Spark 4.0.1. Python accepts 45; JVM accepts 37.
Python drops unknown properties and mutates collation inputs so a repeated parse fails;
JVM adds configuration/metadata/parameter restrictions. Exact source must remain
separate from native objects and engine-validity claims. Fixtures, outputs/errors and
primary source hashes are retained. The spike recommends NativeJson source retention
and separately qualified runtime validation; no Spark extension completion is claimed.

Next Spark deliverables are its package/JSON Schema, typed access/edit/round-trip APIs,
upstream corpus, browser evidence and useful transforms. Arrow's historical mismatch,
body/dictionary semantics, broader migrations and projection gaps remain required work.


### Spark exact schema JSON foundation

US-017 / CONTRACT-017 / TD-017 implement umf.spark with complete payload and recursive
source-profile JSON Schemas, known array/map/struct validation, exact source retention,
unknown/UDT diagnostics, copied access and atomic candidate edits. Of 49 authored cases,
47 round-trip exactly through both UMF formats and two fail missing required native shape
properties. Both native runtimes reproduce all 94 retained-case outcomes; two additional
native comparisons verify a nested decimal edit. Three Bun tests (157 assertions),
Chromium's 49 outcomes/edit and typechecking pass. Native parse success remains qualified
by runtime/configuration; unknown source and collation metadata are never normalized away.

This is an implemented preservation/shape/edit profile, not full Spark completion.
Upstream corpus, semantic validation/configuration reports, safe name-reference handling,
UDT execution boundaries, DDL/Connect/catalogs, data coercion, robust cross-system
transforms and the remaining ecosystem/consumer inventory remain required.

Spark US-017-AC5 now has collation-aware schema rename, a public result schema, 20 native
construction fixtures, 17 verified candidates/three guards, and Chromium parity.
Remaining Spark work includes upstream corpus, broader metadata/configuration semantics,
UDT boundaries, DDL/Connect/catalogs and cross-system projections.

Selected Spark upstream coverage now includes 42 provenance-backed cases from four
pinned tests: 41 exact round trips, one shape rejection, 82 matching Python/JVM
comparisons and Chromium parity. See CONTRACT-017 and SPIKE-004 for source scope and
commands. Broad upstream coverage, complete native semantics and projections remain open.

Spark metadata diagnostics now expose JVM integer wrapping, binary64 conversion, array
restrictions and metadata-without-nullable rejection. Twelve native cases and browser
checks preserve source and confirm diagnostics; all ten Spark tests pass (318 assertions).
See CONTRACT-017 for interpretation limits and reproducible oracle commands.

Spark collation checks now expose malformed, unresolved and non-string-target annotations.
Fourteen authored cases preserve exact source; 28 native comparisons, browser parity and
57 focused assertions verify warnings and observed native drops. See CONTRACT-017. Full
provider/configuration semantics and cross-system projections remain open.

Spark parameter diagnostics now distinguish decimal limits, configuration-dependent
negative scale, JVM int32 parameter overflow and invalid interval ranges. Eighteen
authored cases pass exact round trips and browser checks; 36 native comparisons plus
one enabled-negative-scale configuration check pass. See CONTRACT-017 for scope.

The Spark-to-Arrow native matrix now covers 29 sources × eight option combinations,
with 188 conversions/44 rejections and two target-recovery modes per success. Source
and target preservation plus Arrow metadata decoding pass in Bun and Chromium. See
SPIKE-004 and fixtures/projections/spark-arrow/. This is reference evidence; the
TypeScript cross-system projection and its loss-report contract remain to implement.

Spark-to-Arrow TypeScript projection is now implemented (US-017-AC6/CONTRACT-017).
Explicit policies, retained source, losses and a complete result schema accompany
188 reference-matching models and 44 blocked cases. Independently encoded native reads
pass for all 188 targets and 376 recoveries; Chromium matches the full matrix. Conformance
runs native matrix → capture → project → encode → native target/recovery comparison.
General reverse/data projection and wider source coverage remain required.

Arrow-to-Spark reverse schema projection is implemented under US-017-AC7/CONTRACT-017
with explicit interpretation/loss policies and a complete result JSON Schema. The 376
reference recoveries and 752 native Python/JVM reparses pass; browser checks exercise
both directions. Conformance includes reverse projection and native reparse stages.
Additional reverse-only physical types, upstream examples and data transforms remain.

Arrow-origin reverse coverage now adds 33 schemas × two timestamp policies: 46 verified
projections and 20 blocks. Zero-size binary/list defaults and supported decimal physical
width lowering are implemented; losses stay explicit. Native, browser and 166 focused
assertions pass. See CONTRACT-017 and fixtures/projections/arrow-spark/.

Reverse projection now covers every pinned upstream Arrow integration binary schema:
182 sources × two policies, yielding 216 native-verified projections and 148 blocks.
Twenty blocks protect unmapped reserved extension semantics despite native acceptance.
The corpus exposed and fixed extension/storage conflation. Browser parity passes; see
CONTRACT-017 and fixtures/projections/arrow-spark-upstream/ for reproducible evidence.

Delta discovery (SPIKE-005) now pins protocol and native runtime evidence: 39 schema
probes, 29 native acceptances, three normalization/loss cases, and two real local tables
with constraint-rejected invalid writes. Schema JSON alone omits protocol/configuration
meaning. Next define umf.delta exact schema plus table metadata/protocol profiles and
implement browser round trips and dependency-aware edits. Native probes are included in
conformance; no Delta adapter or complete protocol support is claimed yet.

Delta schema foundation is implemented under US-018/CONTRACT-018/TD-018: complete
profile/package/source-shape schemas, exact source APIs and atomic candidate edits.
Thirty-seven JSON/YAML round trips, two shape rejections, 37 native comparisons, a native
edit, 122 Bun assertions and Chromium parity pass. Conformance includes the native
round-trip stages. Table metadata/protocol profiles and robust transforms remain next.

Delta now has an independent umf.delta.table metadata/protocol context package, complete
payload/context schemas, embedded-schema views, copied edits and incomplete feature
diagnostics (US-018-AC4/5). Two native contexts reopen with matching schema/configuration/
partitions/protocol features; browser parity and future-feature preservation pass. Generic
edits are not safe evolution; dependency-aware changes and log reconciliation remain.

Column-mapping diagnostics (US-018-AC6) now cover eight protocol-derived/native contexts
with JSON/YAML and browser parity. Native loading rejects two malformed mappings but
accepts two other inconsistencies that UMF independently reports. Exact IDs and physical
paths are checked; historical/data-file validation and safe mapped transforms remain.

Mapped rename candidates now pass six native/browser transforms across two mapping modes,
including partition and nested fields. DataFusion scan() confirms records and unchanged
Parquet hashes; the PyArrow dataset reader behaves differently on these fixtures. Known
expression dependencies, collisions and unsupported feature/provider context block.
See CONTRACT-018/US-018-AC7; transaction safety and broader evolution remain unfinished.

Mapped Delta rename coverage now adds twelve array/map nested-field candidates across
name/id mapping and both protocol families. Sixteen native rows exercise null/empty
containers, nullable elements/values and int64 extremes; all four data files remain
byte-identical. Browser parity and source/candidate round trips are checked by the
existing table browser and new mapped-nested corpus. See CONTRACT-018/US-018-AC7.

Delta upstream coverage (US-018-AC8) now pins all 307 JSON log blobs from delta-rs
90b904ede68627c2450007034d9724c043f1a66b. Extracted 77 schemas/64 same-commit contexts
yield 140 JSON/YAML round trips and one missing-schema rejection; native comparisons,
Chromium and 286 assertions pass. This is metadata extraction, not log reconciliation
or an original-dataset read. See CONTRACT-018 and fixtures/delta/upstream/.

Delta log-source capture (US-018-AC9) now preserves all 307 upstream files with exact
SHA-256 through JSON/YAML. The separate umf.delta.log package exposes bounded text and
exact-node envelope inspection with source offsets; malformed and future actions remain
captured. Full action payload schemas, checkpoint parsing and snapshot reconciliation
remain subsequent work. See CONTRACT-018 and scripts/delta-log-upstream.ts.

US-018-AC10 adds known action schemas and exact integer inspection atop Delta log capture.
All 307 upstream inputs agree with independent Python structural checks (305 pass, two
explicit fixture diagnostics). Full feature-dependent validation, checkpoint interpretation
and state reconciliation remain pending; no common-core promotion follows from field-shape
similarity. Conformance includes both the Bun action corpus and independent Python oracle.

US-018-AC11 implements ordinary-commit action reconciliation for explicitly contiguous
histories from zero, with copied sources and blocked ambiguous input. Six native histories
and lowered states agree on rows/files, metadata/protocol and application transactions;
Chromium parity is checked separately. Deferred unknown/CDC actions remain in the result.
Next extend native coverage to upstream histories and feature interactions, then checkpoint
recovery and remaining transaction rules. This does not complete the broader extension plan.

AC12 now covers every upstream ordinary-commit prefix: 59 histories, 303 cases, 278
reconciled and 25 blocked. Native successful observation parity covers 257 cases; another
21 match only on rejection. Chromium matches complete states/errors. The next Delta work
must address checkpoint inputs/recovery and feature semantics; this coverage does not
claim original upstream data reads. Other extension families and consumer demonstrations
remain in the governing scope. See CONTRACT-018 for exact evidence and limitations.

AC13 adds explicitly selected V2 JSON checkpoint recovery with embedded file actions,
followed by contiguous ordinary commits. Three native states with earlier history absent
match UMF lowering and Chromium. Unresolved sidecars, forbidden checkpoint actions and
version/feature mismatches block with source preserved. Next implement Parquet checkpoint
and sidecar decoding, complete dependency resolution and multipart handling; checkpoint
selection/last-checkpoint metadata and full feature validation remain outstanding.

AC14 pins 35 upstream Parquet checkpoint/sidecar files and verifies a browser decoder
experiment against 991 native rows, plus 20 exact decimal boundary rows. Default decoder
decimal loss was found and corrected in the experiment. Next integrate bounded binary
source preservation, typed value/schema contracts and sidecar dependency resolution;
Parquet/sidecar recovery is not yet delivered. See SPIKE-005 for evidence and limitations.

US-019/CONTRACT-019 starts umf.parquet with exact bounded binary capture, JSON Schemas for
the payload and framing result, and browser-safe public APIs. Thirty-nine files preserve
hashes through JSON/YAML; native schemas/1,011 rows and footer bounds agree, and Chromium
repeats hashes/framing. Next define complete metadata/type/value models, bounded decoding
and source-linked Delta sidecar assembly. Source capture does not complete the Parquet
extension or justify core promotion of physical concepts.

US-019-AC5 now provides bounded plaintext footer decoding into an exact, schema-described
Compact Protocol tree. Forty files match independent Apache Thrift node-for-node in Bun
and Chromium, including unknown/repeated IDs and exact numeric/binary boundaries. This
supplies raw metadata for the next Parquet IDL/type-model layer; native field semantics,
row decoding, schema edits and Delta sidecar integration remain pending.

US-019-AC6 pins parquet-format 219e3f12a62f9476e830c21e26d030d231f7c017 and generates
schemas/descriptors for all 69 IDL declarations/176 fields. The public named FileMetaData
view preserves exact values, unknown fields/codes and absent defaults. Thirty-nine native
views and Chromium results agree. Next implement schema-tree/logical validation, metadata
transforms and bounded row decoding before integrating Parquet sidecars. Generated field
schemas alone do not complete the broader Parquet extension or consumer requirements.

US-019-AC7 adds physical schema trees, native definition/repetition levels and row-group
column consistency checks. All 1,813 leaves in 39 files match PyArrow. Twelve malformed
cases block and a literal-dot path case remains correctly separated; Chromium matches
all 52 cases. Next implement logical annotation rules and safe metadata transformations,
then bounded value decoding and Delta sidecar recovery. Physical checks do not complete
these remaining requirements or justify semantic core promotion.

US-019-AC8 adds scalar logical/physical checks and preserves legacy/modern differences.
Thirty authored native cases agree on 15 acceptances/15 rejections; the prior 39 files
pass implemented checks with nested limitations explicit. Chromium repeats 69 outcomes.
Remaining work includes LIST/MAP/VARIANT/FILE semantics, value/statistics validation,
metadata edits and projections, followed by complete Parquet-backed Delta sidecar recovery.
No cross-system semantic promotion is justified by scalar carrier compatibility alone.

US-019-AC9 implements LIST/MAP schema interpretation and legacy wrappers. Eighteen authored
fixtures plus 39 existing files exercise native and browser views. PyArrow's repeated-map-
value tolerance and key-only-map projection are recorded explicitly. This advances nested
metadata access; VARIANT/FILE, decoded values/statistics, safe edits/projections and Delta
Parquet sidecar integration remain open. No semantic core promotion follows from layout
similarities alone.

US-019-AC10 adds a bounded Compact Protocol encoder and a guarded metadata-append transform.
Forty wire trees agree with Apache Thrift; 39 transformed files retain 1,011 native rows,
physical schemas and column metadata. Unknown, encrypted or signed footer rewrites and
replacement of existing keys are refused explicitly. This provides the first native Parquet
metadata transform; schema edits, value decoding, broader logical types and Delta sidecar
integration still remain before the extension can satisfy US-019-AC4.

US-019-AC11 implements guarded native field rename with descendant column-path updates.
Forty-eight transforms cover every field of nested fixtures across NONE/SNAPPY/GZIP, with
native wire comparisons, field IDs, page indexes/checksums, source preservation and browser
hash agreement. Embedded schema metadata and name-sensitive legacy layout changes block
explicitly. Remaining Parquet work includes embedded metadata rewrite policies, other schema
transforms, typed value decoding, broader logical semantics and Delta sidecar integration.

US-019-AC12 advances typed decoding with an schema-driven physical assembly
path. Four native/browser fixtures preserve nested decimals, ordered duplicate/non-string
map keys, JavaScript-hostile names, null/empty containers and temporal meaning across page
versions and dictionary settings. The trial remains a development-only dependency path.
Next establish bounded decoding and malformed-page behavior, then integrate the verified
value view and Delta sidecar recovery. Do not equate passing valid fixtures with a safe public
decoder or with completion of the extension.

US-019-AC13 adds bounded page-header inspection and declared allocation budgets. Native and
browser evidence covers 2,472 headers, two historical declaration mismatches and 18 authored
controls/malformed cases. Next bound actual decompression and encoding/level allocations;
consistent declarations alone do not make the dependency safe for untrusted pages. Continue
toward the public typed decoder and Delta sidecar integration without treating this inspector
as complete Parquet support.

US-019-AC14 adds bounded UNCOMPRESSED/SNAPPY page-body decoding and present-CRC verification,
with native exact-byte and browser evidence. It closes the actual size/back-reference checks
for those codecs, while other codecs and level/value encoding allocation bounds remain open.
Next connect bounded level/encoding decoding to the schema-driven value experiment and
extend codec coverage before integrating full Delta sidecar recovery.

US-019-AC15 supplies the bounded RLE/bit-packed kernel needed for level streams and dictionary
indexes. Native dictionary pages and browser tests cover common widths; boundary/malformed
vectors cover count and range guards. Next integrate V1/V2 level regions and check definition/
repetition counts against page/schema metadata, then decode physical values and assemble the
verified typed view. Complete Parquet/Delta integration and the other extension systems remain
in scope.

US-019-AC16 integrates bounded V1/V2 level regions, domain checks, row/null reconciliation
and physical-value offsets. Independent corpus arrays, native-readable authored layouts and
browser outcomes agree. Next decode PLAIN and dictionary physical values under count/length
bounds, then assemble the schema-driven typed view and extend codec/encoding coverage. The
full extension and Delta sidecar objectives remain active.

US-019-AC17 integrates bounded PLAIN and dictionary carriers with exact bits/widths and a
separate dictionary-expansion budget. Corpus reference values, native physical boundary files
and Chromium outcomes agree. Next assemble physical columns into rows, preserving null versus
empty nested structures and map entry order, then apply logical annotations and connect Delta
sidecars. Other codecs/encodings and the full extension inventory remain in scope.

US-019-AC18 assembles bounded physical records and checks shared-column structure. Native
rows, conflicting-column fixtures, node-budget rejection and browser results are verified.
Next apply authoritative scalar annotations and LIST/MAP reading rules to these physical
records, preserving map entries and exact carriers, then integrate Delta Parquet sidecars.
Full extension coverage and the consumer demonstrations remain required.

US-019-AC19 connects bounded physical rows to native scalar and LIST/MAP views, retaining
physical carriers and unsupported known meanings. Native typed values, exact JSON, malformed
logical values and browser outcomes are verified. Next integrate this typed path with Delta
checkpoint/sidecar reconciliation and expand codec/encoding/logical coverage. The full extension
inventory, robust cross-system transforms and consumer demonstrations remain in scope.

US-018-AC15 adds a bounded Parquet-to-Delta action bridge with native comparisons and explicit
null-omission provenance. The next integration must bind caller-supplied sidecar paths/sizes,
validate file-action-only sidecars, retain original checkpoint and sidecar sources, and reject
missing/duplicate references before recovering state. Typed checkpoint statistics and partition
conversions, classic/multipart checkpoint assembly, remaining extensions and consumer examples
remain required. No new core promotion follows from this representation-specific conversion.

US-018-AC16 implements caller-bound Parquet sidecar recovery for the bounded V2 JSON profile.
Native and browser evidence covers two sidecars, file removal, a retained tombstone and exact
transaction versions across three snapshots. Both supplied upstream checkpoints still require
INT96 statistics conversion. Next extend typed checkpoint statistics/partition semantics and
classic/multipart recovery with native evidence. The broader extension inventory, consumer
examples and evidence-based core promotion remain required; this increment completes neither
full Delta support nor the project goal.

US-018-AC17 adds annotated statistics/partition scalar conversions and retains their typed
inputs. Native and browser evidence now covers 944 upstream actions plus four authored actions.
Remaining checkpoint work includes table-context-dependent INT96 interpretation, schema-aware
statistics consistency, classic/multipart assembly and broader Parquet encoding/codec coverage.
The complete extension inventory and consumer demonstrations remain required; no semantic
concept is promoted to core from these physical conversion rules.

US-018-AC18 adds explicit single-file Parquet checkpoint recovery for V1 and V2, retaining
source/projection/recovery evidence. Nine native scans and 32 upstream checkpoint outcomes now
exercise that path. Multipart assembly, INT96 context, schema-aware statistics consistency,
additional codecs/encodings and physical reader-feature validation remain open. Full extension
coverage, robust cross-system transforms, consumer examples and evidence-based core promotion
are still required for the project goal.

US-019-AC20 adds an independently checked, explicit repair for the two legacy Parquet
checkpoint offset layouts. It preserves original bytes and changes only footer offsets; both
candidates now decode and recover Delta state with matching native observations. This does not
change original-file support claims. INT96 context, multipart checkpoints, broader Parquet
coverage and the remaining extension/consumer inventory are still required. No core promotion
follows from this Parquet-specific metadata correction.

US-018-AC19 adds explicit multipart checkpoint assembly with complete identities, Spark hash
clustering, source projections and row origins. Native three-version recovery and browser/hash
vectors pass. Remaining Delta work includes INT96 context, schema-aware statistics consistency,
DV-bearing multipart native evidence and discovery/reader-feature validation. Broader Parquet
coverage, remaining extension packages and consumer examples remain in the project objective.
No shared semantic concept is promoted from this physical partitioning rule.

US-020 begins Iceberg under the existing Phase 3/B-011 inventory. CONTRACT-020/TD-020 govern
its exact schema JSON package, identity checks, copied access and candidate edits. Authored
native/browser evidence covers 35 cases and a nested rename; the complete Iceberg extension
is not yet finished. Next pin representative upstream schemas/table metadata, model partition
and sort specs/default semantics, and verify dependency-aware transformations. Delta/Parquet
limits remain recorded and unresolved; expanding Iceberg does not remove that work. The full
remaining extension and seven-consumer inventory stays in the goal. Iceberg identifier IDs
are not promoted to core uniqueness or equated with DDD identity.

US-020-AC4 adds pinned upstream schema occurrences, distinct-schema accounting and independent
Java/Python edit/round-trip evidence. The missing-type parser disagreement remains explicit.
Next implement Iceberg table metadata and partition/sort context, then dependency-aware schema
changes and cross-system projections. Seven distinct upstream schemas plus authored cases do
not complete the full Iceberg type/evolution matrix or the remaining extension inventory.

US-021/CONTRACT-021/TD-021 add the Iceberg table JSON package with known v1–v3 field shapes,
embedded schemas, exact integer checks and copied candidate edits. Thirteen upstream cases
have native Java/Python and browser evidence; parser and writer limitations remain separate.
Next validate table ID/reference consistency, partition/sort transforms and dependent evolution.
Physical evidence, broader Iceberg coverage, remaining extensions and seven consumers stay in
scope. No core promotion follows from syntactic similarity of metadata counters or references.


US-021-AC4 adds bounded Iceberg current-reference inspection with a complete report JSON
Schema. Six known-version upstream tables resolve; future-version interpretation blocks while
source remains intact. Bun exercises duplicate/dangling selections, exact snapshot IDs, main
coherence, expired parents and JSON/YAML preservation. Chromium compares seven reports and
three dangling-selection edits. This evidence does not add native acceptance claims for the
negative vectors. Partition/sort compatibility, full history, dependent evolution and physical
verification remain open, alongside all remaining extensions and metadata consumers.


US-021-AC5 adds single-source transform type inspection and its report JSON Schema. The
136-case Java 1.11.0 matrix checks compatibility and native result types; day returns date
natively versus int in the pinned specification, and that distinction remains explicit.
Chromium repeats the matrix. Bun covers unknown syntax and numeric parameter boundaries.
Run `bun scripts/iceberg-transform-oracle.ts` with the documented JDK21 JAVA_HOME and
`bun scripts/iceberg-transform-browser.ts` with UMF_CHROMIUM_PATH. This does not finish
partition/sort integration: current-field binding, directions/null orders, table-version
availability, history, value execution and dependent evolution remain required work.


US-021-AC6 binds current Iceberg partition/sort fields with complete report JSON Schema and
preserves the pinned specification's v3 source-ids representation. Bun covers nested renames,
collection ancestry, missing/duplicate fields, type incompatibility, sort settings and unknown
multi-source transforms. Chromium compares seven upstream reports and two multi-source format
round trips. Java accepts the authored nested table and verifies two formats plus its location
candidate; Java 1.11.0 rejects the multi-source fixture for missing source-id. This disagreement
is recorded explicitly. Full history, version-specific feature checks, actual transform execution,
dependent evolution and remaining extension/consumer inventory are still required.


US-021-AC7 adds append-only schema-version rename candidates for v2/v3 with explicit unused
schema IDs and post-change binding reports. Four fixtures have independent Java SchemaUpdate /
TableMetadata.updateSchema comparison across eight format exports, excluding only update time.
Chromium repeats the four candidates; Bun checks preservation, identifiers and atomic failures.
Run scripts/iceberg-table-rename.ts, then scripts/iceberg-java-oracle.ts --rename --base
fixtures/iceberg/table-rename with the documented JDK21, and scripts/iceberg-table-rename-browser.ts
with the documented Chromium path. Unknown name-dependent metadata remains unchanged and must
be reviewed. Type promotion, history deduplication, name mappings, full evolution and safe commits
remain unfinished; remaining extension and consumer scope is unchanged.


US-021-AC8 adds three primitive widening families as schema-version candidates: int→long,
float→double and same-scale decimal precision increase. Six authored dependency combinations
have independent Java evolution comparison across twelve exports and Chromium parity. Bun
checks source/history preservation, narrowing/scale rejection and unknown historical dependency
blocking. Regenerate with scripts/iceberg-table-promotion.ts and run scripts/iceberg-java-oracle.ts
--promotion --base fixtures/iceberg/table-promotion under documented JDK21, then the matching
browser script. V3 date/unknown promotion, full default/bounds behavior, safe evolution and the
remaining extension/consumer inventory remain open; this is not a data conversion claim.


US-021-AC9 adds physical read evidence for AC8: six PyArrow 21.0.0 Parquet files, 45 rows,
45 source-schema checks and 90 promoted-schema checks through Iceberg Java 1.11.0. Expected
float bits include signed zero, infinities and NaN; integer/decimal values remain exact.
Physical names differ from logical names, testing field-ID binding. File/metadata hashes are
rechecked against current Bun-generated candidates. Generate with scripts/iceberg-promotion-data.py,
then scripts/iceberg-java-oracle.ts --promotion-data --base fixtures/iceberg/table-promotion under
JDK21. This is a local data-file reader oracle, not browser data execution or a full table scan.
Manifest pruning, original bounds, optional/null promoted values, deletes, version-specific
promotions and remaining extension/consumer work are still unfinished.


US-022 / CONTRACT-022 / TD-022 start the dbt inventory cycle with manifest v12 preservation,
an unchanged pinned authoritative native schema, complete payload/package schemas and browser
metadata edits. The isolated dbt Core 1.10.0 / dbt-duckdb 1.9.3 build produces six successful
resources and a 429-macro manifest. Python schema validation and native WritableManifest
round-trip/edit comparison pass for both formats; Bun/Chromium evidence and input hashes are
recorded in fixtures/dbt. Native setup is documented in native/dbt/README.md. This is one
representative project, not full dbt support. Broader resources, graph-aware transforms,
additional artifacts and project interchange remain; Iceberg and earlier gaps stay open.


US-022-AC4 adds native/dbt/rich-project and fixtures/dbt/rich without replacing the initial
fixture. All v12 top-level resource collections are populated. The native build reports six
successes, five passing tests and two metadata no-ops; no MetricFlow execution is claimed.
Thirteen resource metadata edits have 26 native/schema-validated exports and Chromium comparisons.
Bun binds source/provenance/native hashes to current candidates. Reproduce via dbt-fixtures.py
--rich, dbt-rich-roundtrip.ts, dbt-rich-oracle.py and dbt-rich-browser.ts using the documented
isolated environment. No native dbt concept has demonstrated equivalence sufficient for core
promotion. Graph-aware transforms, configuration variants, other artifacts/versions and the
remaining ecosystem/consumer work remain in scope.


US-022-AC5 adds dependency inspection and its complete report JSON Schema. Minimal/rich
fixtures have 436/450 indexed resources and 556/564 explicit edges; native dbt map builders
agree for resource and macro relationships. Bun tests dangling/wrong-kind references, identity
mismatches, stale maps, repeated macro edges and source mutation boundaries. Chromium compares
four format reports and two negative map edits. Regenerate with dbt-graph.ts and the isolated
Python dbt-graph-oracle.py, then dbt-graph-browser.ts. Checked reports are incomplete views,
not SQL lineage, cycle legality or execution plans. Graph-aware transformations, other dbt
artifacts/versions and the remaining ecosystem/consumer scope stay open.


US-022-AC6 adds bounded upstream dependency context selection with full source retention and
complete packet schema. Five cases cover semantic chains, depth/node boundaries and optional
macro traversal. Native dbt maps plus NetworkX verify reachable sets/minimum depths where the
node budget does not bind; the root-only node-limit case has its own explicit-policy assertion.
Bun validates source recovery and malformed options; Chromium repeats ten format selections.
Regenerate with dbt-selection.ts and isolated dbt-selection-oracle.py, then dbt-selection-browser.ts.
This advances metadata consumers without completing FR-41: runnable projections, all seven
consumer outputs, broader dbt artifacts/versions and remaining extensions remain required.


US-022-AC7 adds umf.dbt.artifact for run-results v6 and catalog v1, with complete native/payload
schemas and copied artifact APIs. A fresh local DuckDB build/docs run supplies catalog observations
and run results; the rich fixture adds no-op outcomes. Three artifacts have six native/parser and
schema comparisons plus six candidate-edit comparisons, repeated in Chromium. Tests retain the
manifest's declared decimal and catalog's observed DOUBLE separately. Regenerate with isolated
Python dbt-artifact-fixtures.py, Bun dbt-artifact-roundtrip.ts, Python dbt-artifact-oracle.py and
Bun dbt-artifact-browser.ts. Freshness/source and semantic artifacts, artifact joins, other
versions and remaining extension/consumer work are still required.


US-022-AC8 adds sources v3 freshness preservation and native custom-query outcome fixtures.
Three timed results exercise pass/warn/error; a missing SQL function produces a fourth runtime
error in the runner. Pinned dbt 1.10.0 omits that partial result from emitted sources.json, so
the original artifact and a separately labeled native runner reconstruction are both captured.
Four native/schema round trips and four diagnostic edits pass, with Bun/browser evidence and
hash-bound inputs. Reproduce using dbt-freshness-fixtures.py, dbt-freshness-roundtrip.ts,
dbt-freshness-oracle.py and dbt-freshness-browser.ts in the documented environments. Expected
native failure is evidence; physical-source freshness, semantic manifests, versions, correlation
and remaining extension/consumer requirements remain open.


US-022-AC9 adds a real failing dbt build with all six result statuses. Its eight rows and
hash-bound manifest/log/project context are under fixtures/dbt/failure. The artifact matrix
now contains four artifacts, eight native/schema comparisons and eight candidate-edit
comparisons, repeated in Chromium. Run dbt-failure-fixtures.py before dbt-artifact-roundtrip.ts,
dbt-artifact-oracle.py and dbt-artifact-browser.ts. Bun tests ensure skipped execution remains
distinct from successful parents and test failures/warnings remain distinct from adapter OK.
Failure-path evidence advances robust transforms; it does not complete scheduling, semantic
manifest, correlation, other-version or remaining ecosystem/consumer requirements.


US-022-AC10 adds umf.dbt.semantic, its complete payload/derived serialized schemas and copied
native source APIs. dbt-semantic-sources.py records the Pydantic null-schema discrepancy and
runtime sources; dbt-semantic-schema.ts materializes the package. dbt-semantic-fixtures.py runs
an isolated parse, followed by dbt-semantic-roundtrip.ts, dbt-semantic-oracle.py and
 dbt-semantic-browser.ts. Three description edits yield six native/parser/semantic-validator
comparisons and browser round trips/edits. Tests retain unknown fields discarded by native
Pydantic. The schema has 41 definitions and 67 documented nullable-field adaptations; its
serialized-shape scope is separate from semantic validation. Additional metric types, semantic
transforms, successor MetricFlow interfaces, versions and other ecosystem/consumer requirements
remain open. No core promotion is supported by this evidence.


US-022-AC11 extends semantic-manifest evidence to all five DSI 0.8.5 metric types using seven
native definitions. Six parameter candidates pass native semantic rules, three shape-valid
candidates fail semantic rules, and two fail native parsing/shapes. Two source-format checks
and 22 candidate comparisons pass against native oracles and Chromium. Regenerate with
 dbt-semantic-fixtures.py --metrics, dbt-semantic-metrics.ts, dbt-semantic-metrics-oracle.py and
 dbt-semantic-metrics-browser.ts. These examples change declared analytic meaning explicitly;
no execution, reference-changing transform or cross-system equivalence is implied. Remaining
configuration/semantic transform work, successor versions and all other ecosystem/consumer
requirements remain in scope.


US-022-AC12 adds the serialized-field audit using dbt-semantic-field-oracle.py and
 dbt-semantic-fields-browser.ts. All 143 native fields receive 13 boundary inputs; all 690 native
accepted serializations validate in Python, Bun and Chromium. The evidence records 427 parser
acceptances outside serialized input shapes and 128 direct native field-call exceptions rather
than conflating source preservation with native normalization. The Bun regression has 3,502
assertions. This improves schema evidence; whole-model semantic validation, transformations,
query execution and remaining extension/consumer requirements remain unfinished.


US-023 / CONTRACT-023 / TD-023 begin ODCS interchange with umf.odcs, complete payload schemas
and unchanged official 3.0.0–3.2.0 schema snapshots from release commit
f0bdad95346905d500be5ef4b2c2d9b1d95223b7. All 42 YAML examples preserve original source;
39 match their declared schema and three mismatches are retained explicitly. Both UMF formats
and metadata edits yield 84 independent comparisons and 84 browser edits. Bun passes 614
assertions over corpus fidelity and negative boundaries. Reproduction is in native/odcs/README.md.
Reference interpretation, operational quality/SLA semantics, physical mapping, v2 families and
additional snapshots/projections remain required work. No core promotion is justified yet.


US-023-AC4 adds local v3.2.0 ODCS reference lookup, copied targets/source and a complete result
schema. Thirteen specification-derived cases pass 26 format comparisons in Bun and Chromium;
Bun additionally verifies stable IDs under rename/reorder and blocks duplicates/unknown versions.
The official example's addresses.address_street name mismatch remains unresolved rather than
being silently mapped to the similarly named ID. Reproduce with odcs-references.ts and
odcs-reference-browser.ts; tests/odcs/references.test.ts has 152 assertions. External resource
bundles, composite relationship validation, quality/SLA semantics and projections remain required.


US-023-AC5 adds ODCS relationship endpoint pairing and complete report schemas. Nine original/
authored cases yield 18 Bun/browser format reports. The independent official-schema oracle accepts
six cases; separate checks identify missing targets, unequal composite arity and duplicate IDs.
Property-level array targets are grammar-valid but explicitly uninterpreted by this profile.
Reproduce with odcs-relationships.ts, odcs-relationship-oracle.py and odcs-relationship-browser.ts.
Composite ordering, atomic failed rows, bounded traversal and source preservation are tested.
Cross-contract resources, richer relationship semantics, physical/data enforcement, projections
and other extension/consumer work remain unfinished.


US-023-AC6 adds an ID-selected ODCS rename transformation that rewrites affected local foreign-key
name references and rechecks endpoint identity. Four object/property/nested cases yield eight
native-schema/whole-value checks and browser exports. Collisions and unresolved relationships
block atomically; IDs and unrelated expression-like metadata remain unchanged. Reproduce with
odcs-rename.ts, odcs-rename-oracle.py and odcs-rename-browser.ts. This preserves known local
relationship meaning only; expression rewriting, external references/consumers, quality/data
execution and remaining projections/extensions/consumer deliverables remain open.


US-024 / CONTRACT-024 / TD-024 add umf.linkml with explicit metamodel selection, complete payload
schemas and the unchanged 65-definition LinkML model 1.11.0 JSON Schema. All ten upstream examples
plus an authored common schema preserve source and metadata candidates through both UMF formats.
Twenty-two native/schema comparisons and browser exports agree. The pinned native loader accepts
ten schemas and rejects one structured annotation example; one accepted type-mappings schema
normalizes mappings to strings that fail the JSON Schema. Original exact source is authoritative,
including the upstream large-integer example. Setup/reproduction is in native/linkml/README.md.
Import closure, induced model, semantic transforms, instance validation, generators and remaining
versions/projections/extensions/consumer requirements remain open. No core promotion is established.


US-024-AC4 expands LinkML evidence to every metamodel source file: ten sources, twenty format/
metadata-candidate comparisons, all accepted by the pinned loader. types.yaml's scalar notes
remain a raw JSON Schema mismatch while normalized output passes. The corpus exposed and fixed
underscored int64/uint64 bounds being read as strings. An explicit LinkML YAML 1.1/PyYAML scalar
profile now preserves exact integers and single-letter axis names; date-only strings retain
original archived spelling and an explicit interpretation warning. Default YAML 1.2 adapters
remain unchanged. Reproduce by adding --metamodel to LinkML roundtrip/oracle/browser commands.
Both LinkML corpora, core parser and ODCS baseline checks verify the change. Additional scalar
forms, imports, induced models, semantic transformations and other extension/consumer work remain.

US-024-AC5 adds explicit supplied LinkML import contexts, complete context/report schemas and
copied traversal with repeated edges, cycles, scoped aliases and unresolved imports. Four authored
contexts produce eight native-source-preserving reports in Bun and Chromium. The pinned native
runtime agrees on two reachable sets and one missing-import outcome; scoped aliases cannot be
compared through its global preload map. No network retrieval, merge precedence, induced model or
cross-system equivalence is claimed. Native retrieval and semantic induction remain next LinkML
work, alongside the outstanding extension, projection and metadata-consumer requirements.

US-024-AC6 implements local class-slot membership: ordered ancestry/mixins, attributes, duplicate
source declarations and explicit missing-parent diagnostics. Every class in the pinned example and
metamodel directories plus two authored sources yields 208 reports. Native methods agree on 206
ordered memberships or failures; a known loader rejection excludes two from native comparison.
All reports retain full source, and Chromium reproduces them. This provides a metadata inspection
primitive; effective slot values, import precedence, validators and generators remain required.

US-024-AC7 adds scalar effective slot values and provenance. The 29-field profile implements attribute
precedence, inherited truthiness, class usage precedence and bound narrowing, default range and
identifier/key/list implications. Fifty-four reports agree with pinned native induction and Chromium;
Bun additionally checks malformed fields, source isolation and extreme exact-decimal comparisons.
The report schema names the supported scalar fields and retains all original metadata. Import merging,
structured slot values, computed native fields, instance validation, generators and cross-system
projections remain required. No concept has been promoted to core from these LinkML-specific rules.

US-024-AC8 verifies the scalar API over the full twenty-source membership corpus: 310 native
successes match, and 24 membership plus 13 induction failures are blocked by UMF. The known native
loader rejection remains separate. Native imports are detached on a private model with retrieval
guarded, so this is local induction evidence only. Bun and Chromium compare the queries after
both UMF formats reproduce identical source documents. The authored 54-report AC7 corpus remains
in place. Imported and structured induction, normalization, transformations and other extension/
consumer requirements are still open.

US-024-AC9 implements import-merge proposals with explicit view/merge-imports modes. Native behavior
requires this distinction: later dictionaries win in lookup, while merge_imports preserves existing
definitions. Six declaration dictionaries, collision provenance, native from_schema injection and
full original contexts are covered. Sixteen reports produce twelve candidates; eight match complete
native normalized models, four missing-import reports match native failure, and four scoped-alias
candidates have Bun/browser evidence only. All reports and exports agree in Chromium. URI retrieval,
full imported/structured induction, runtime equivalence and generators remain required follow-up work.

US-024-AC10 extends import-merge evidence to all ten metamodel sources as entry points. Explicit
supplied bindings cover every dependency, including differing file/schema names. Twenty candidates
under both policies match complete native normalized models, and forty browser candidate round trips
agree. Every raw candidate retains seventeen scalar-notes schema errors from types.yaml while every
native-normalized candidate validates; those outcomes remain separate. The main meta graph has six
reachable schemas and 333 selected declarations. Retrieval, full imported induction, structured
values, validators, generators and the remaining extension/consumer scope are still outstanding.

US-025 / CONTRACT-025 / TD-025 add umf.rdf 0.1.0 with complete N-Quads term/quad payload schemas,
source archives, local blank scopes and atomic quad edits in browser TypeScript. N3.js 2.7.12 is
pinned. All 87 official syntax cases match expectations; an authored eleven-occurrence dataset
adds opaque OWL/SHACL metadata, duplicates, blank graphs and exact numeric literal spellings.
RDFLib 7.6.0 confirms 54 positive datasets and 76 edited exports but accepts nine official negatives;
those disagreements stay visible. Chromium verifies 108 original recoveries and 76 candidates.
Reproduction is in native/rdf/README.md. Turtle/TriG/RDFXML/JSON-LD, empty graph handling, semantic
transforms, canonicalization, OWL/SHACL, platform projections and consumer outputs remain open.

US-025-AC4 implements dataset-wide RDF IRI rename proposals with an explicit change list and retained
source archive. The transform covers subjects, predicates, objects, graph names and datatype IRIs;
existing-target collisions and invalid results block without partial output. Fifty-three cases
produce 106 native-compared and browser-verified candidates. Literal text, duplicate occurrences
and blank scope remain preserved. Datatype reinterpretation and external/OWL/SHACL limits are
explicit. Other RDF syntaxes, canonicalization/merge and semantic platform projections remain open.

US-025-AC5 adds RDF 1.1 Turtle with explicit base IRIs, source archives and deterministic scoped
blank labels. All 313 official outcomes and 145 expected graphs pass; 219 N-Quads projections and
204 edited outputs have independent comparisons. RDFLib differs on eleven original positive parses
(seven numeric lexical, four IRI-resolution) and accepts 39 official negatives; these do not change
UMF's expected outcomes. Browser evidence covers 438 original recoveries and 204 edits. Named graph
loss is blocked, and source labels/layout remain archived. Other RDF syntaxes and the broader
semantic, platform, transformation and consumer scope remain unfinished.


US-025-AC6 adds RDF 1.1 TriG with explicit empty named-graph inventory. The complete pinned W3C
corpus has 357 cases (242 positive/115 negative), plus one authored shared-blank empty-graph case.
Bun/native/browser checks cover 486 source recoveries, 216 literal edits, two empty-IRI renames
and four blocked N-Quads projections. RDFLib verifies all graph inventories and 143 official
quad sets; eleven original-source differences and 48 accepted negatives remain explicit.
See CONTRACT-025, tests/rdf/trig.test.ts and fixtures/rdf/trig/ for scoped evidence. Remaining
RDF syntaxes, ontology/shape execution, canonicalization and cross-system projections stay open.


US-025-AC7 adds explicit RDF dataset composition with graph union by name and disjoint blanks
per input occurrence. The report retains complete sources, blank-node maps and quad provenance;
unknown RDF encodings block atomically. All 516 positive baseline datasets merge with an authored
empty/shared-blank dataset, yielding 1,032 native and Chromium comparisons across both UMF formats.
Bun additionally checks identical source ids/scopes, duplicate occurrences, source metadata and
blocked report shape. See CONTRACT-025, tests/rdf/merge.test.ts and fixtures/rdf/merge/. Shared-blank
composition, canonicalization, OWL/SHACL execution and broader platform projections remain open.


US-026 / CONTRACT-026 / TD-026 add umf.jsonld source/context preservation and explicit expansion
proposals. The pinned 385-case official expansion manifest yields 276 matching candidates and 109
negative rejections. Every source survives both UMF
formats. PyLD 2.0.4 agrees with 270 candidate outputs using the integer/Decimal loader; all six native disagreements are recorded against official expected output, which UMF matches. Tests also cover exact numbers, unknown representation,
loss policy, copied edits and per-operation @import context isolation. Native/browser evidence lives
in fixtures/jsonld/expansion; reproduction is in native/jsonld/README.md. Processor gaps, standalone compaction,
framing, HTTP/HTML behavior and RDF conversion remain required work.


US-026-AC5 fixes scoped @nest expansion with a pinned, reproducible jsonld.js dependency patch.
Official tc037/tc038 now pass; seven authored cases verify recursive/remote contexts, sibling
isolation, protected overrides, invalid nested values, opaque JSON and an edited nested value.
The 385-case official corpus and Chromium checks remain gates. Patch provenance is recorded in
fixtures/jsonld/patch-results.json. AC6 closes the legacy gaps; AC7 adds exact numeric expansion.


US-026-AC6 restores version-specific JSON-LD 1.0 term and prefix behavior with a pinned context
processor patch. Official t0026/t0038/t0071 now pass. Eight authored inputs exercise 15 paired-mode
outcomes, including 1.1 rejections, opaque JSON, null prefixes and copied edits. The full 385-case
corpus produces 276 correct candidates and 109 negative blocks. Fresh isolated
installation verifies all three patched source files. The complete browser matrix remains a gate.


US-026-AC7 carries exact numeric tokens through JSON-LD expansion using immutable internal boxed
numbers and a pinned clone/scalar patch. All 276 official positives now match exact expected
values; all 109 negatives are blocked. Nine authored cases cover large integers, precise decimals,
negative zero, overflow/underflow exponents, language/type coercion, invalid numeric positions and
an exact edit. PyLD with an integer/Decimal loader and Chromium verify the results. The comparator
now rejects rounded values and preserves language-looking strings inside opaque JSON literals.
Other JSON-LD algorithms and general semantic/physical projections remain required work.


US-026-AC8 adds JSON-LD flatten proposals and a complete flatten report schema, retaining source
and supplied contexts and supporting optional target-context compaction. All 58 pinned official
cases execute: 57 expected candidates and one negative block, 116 source recoveries/114 exports.
PyLD rejects t0026 and differs on t0014/t0038; those discrepancies remain explicit. Fourteen authored
cases add exact numeric deduplication, lists, JSON literals, direction, named graphs, reverse blank
links, copied edits, context isolation, missing resources and loss rejection. Eleven candidates,
three blocks and 24 candidate/edit exports pass. PyLD collapses signed zero and opposite directions;
UMF retains those distinctions. Chromium repeats all 72 cases with 144 source recoveries and 138
candidate/edit exports, zero external requests and Node globals absent. Reports are under
fixtures/jsonld/flatten; reproduction is in native/jsonld/README.md. The pinned util.js patch now
compares exact numeric values and opaque JSON and includes direction in value identity. The existing
385-case expansion regression remains required. Standalone compaction, framing, HTTP/HTML loading,
RDF conversion, ontology semantics and the wider extension/consumer goal remain unfinished.


US-026-AC9 implements standalone JSON-LD compaction with required target context and explicit
compactArrays/compactToRelative options, plus a complete report schema. All 246 pinned cases run:
229 candidates and 17 expected negative blocks. Strict exact-value/order comparisons match 228
positive outputs; tp001 remains an explicit legacy-prefix discrepancy. Its 1.0 processing mode
expects expanded term definitions not to form prefixes, while t0038 expects such prefixes. UMF
retains the earlier 1.0 prefix interpretation, without claiming full compaction conformance.
PyLD rejects t0112/tm023 and differs on t0038/t0111/t0113/tc028/tp001. All differences are recorded.

Twelve authored cases add nine candidates and three blocks, exact language-neutral numbers,
aliased ordered lists, opaque JSON, array and relative-IRI options, explicit remote contexts,
source expandContext applied once, empty custom indexes and copied edits. PyLD differs on the
absolute-IRI option and empty custom index, and accepts the loss case UMF explicitly rejects.
Chromium repeats 258 cases: 238 candidates, 20 blocks, 516 source recoveries, 476 candidate exports
and two edited exports, with no external requests and Node globals absent. Evidence lives under
fixtures/jsonld/compaction; native/jsonld/README.md records reproduction. The compact.js patch
expands custom index IRIs, selects the actual compacted property using its value, retains empty
index keys and honors compactArrays for remaining index values and map entries. Fresh installation
now checks four patched files. Framing, HTTP/HTML loading, RDF projection, the legacy discrepancy
and the wider extension/consumer goal remain unfinished.


US-026-AC10 adds framing proposals, full report schema and a separately pinned official framing
corpus (w3c/json-ld-framing commit 3bf782ba9a40dd1b143435abe386d38df64f2b47, 271 resources/92 cases).
Eighty-eight candidates match strict expected JSON, all three negatives block, and positive t0010
also blocks because the source uses literal dcterms:creator without defining that prefix while
its frame assigns the prefix a different IRI meaning. The retained source is authoritative; this
legacy corpus disagreement remains explicit. PyLD accepts 87 official sources and rejects five,
including t0010 and positive t0069; every comparable candidate agrees with its output.

Twelve authored cases yield ten candidates/two blocks, 20 exports and two edited exports. They
exercise exact numeric frame matching/defaults, source precision, explicit selection, default versus
merged graphs, cycles as references, requireAll, explicit remote contexts, missing resources,
loss rejection, ordered lists and opaque JSON. PyLD matches nine authored candidates and the edit;
it ignores frameDefault in the authored graph case and accepts the source warning UMF rejects.
Chromium repeats 104 cases: 98 candidates/six blocks, 208 unchanged source recoveries, 196 candidate
exports and two edits, no external requests and Node globals absent. Evidence is under
fixtures/jsonld/framing; native/jsonld/README.md records reproduction.

The pinned jsonld.js patch honors frameDefault; frame.js uses exact value equality for numeric
pattern matching. Fresh installation covers six patched files. Framing is a selected view, not an
assertion of lossless semantic round trip: sources, frame and resource bundles remain archived and
reports disclose selection, defaults, embedding and graph merging. HTTP/HTML retrieval, RDF
projection, the documented legacy disagreements and the wider extension/consumer goal remain open.


US-026-AC11 supersedes the framing counts above. Framing now validates flags and identifier/type
patterns before subject matching, including nested and aliased frames on empty input. Expansion
checks raw flag types before nulls can disappear; preflight checks expanded cardinality and mode
rules before building the node map. Nonstandard @link and 1.1 @first/@last are rejected. Data inside
@default and @value is not interpreted as framing instructions.

The official corpus now yields 86 exact expected candidates and six blocks. In addition to the
three negative cases and the known t0010 collision, positive tg005/tg008 contain @omitDefault:
"true" strings where the syntax requires booleans. These are explicit compatibility discrepancies;
UMF does not silently coerce them. PyLD accepts those two cases, rejects t0069 and otherwise agrees
with comparable candidate outputs. The authored set grows to 26 cases: 13 candidates/13 blocks,
26 exports plus two edited exports. Eleven new invalid frames are accepted by PyLD but rejected
by UMF. Controls retain legacy 1.0 behavior and keyword-looking JSON literal/default data. PyLD
rejects the @json value-pattern control and still ignores frameDefault; these disagreements remain
recorded. Blocked reports retain exact source and NativeJson frame and expose no partial candidate.
Current Chromium baseline: 118 cases, 99 candidates/19 blocks, 236 source recoveries, 198 candidate
exports and two edits; no external requests, Node globals absent. See fixtures/jsonld/framing.


US-026-AC12 connects RDF datasets to JSON-LD through a complete projection report schema. It
preserves source archives, unknown-encoding blocks, empty graphs, exact JSON/numeric values and
selected native-type loss policies. The full pinned fromRDF corpus passes: 52 expected candidates
and two negative blocks, 108 exact source recoveries and 104 candidate exports. PyLD rejects
t0027/t0028 and differs on t0008/tdi11/tdi12; no discrepancy is counted as native agreement.

Eighteen authored cases cover exact native numbers, lexical preservation, non-finite typed values,
RDF JSON in 1.0/1.1, empty graph inventory, direction with native types, malformed JSON, comments,
compound lists/shared nodes/invalid direction/extra-property loss, malformed direction datatypes and a copied edit. Twelve
candidates/six blocks produce 24 exports and two edited exports. Unmodified PyLD agrees on typed
lexical values, opaque datatypes and shared compound nodes; precision, direction, mode and empty-inventory differences
are retained in fixtures/jsonld/from-rdf/authored/oracle-results.json. N-Quads cannot transmit empty
graph inventory, so that oracle case explicitly compares the nonempty subset only.

The collector now retains 2,545 JSON-LD API JSON-LD/N-Quads resources (same source pin). Fresh
installation checks seven patched processor files. The browser matrix covers all 72 official and
authored cases: 64 candidates/eight blocks, 144 source recoveries and 130 candidate/edit exports, no
external requests or Node globals. Reproduction is in native/jsonld/README.md. JSON-LD-to-RDF,
HTTP/HTML retrieval, ontology/platform semantics and the wider extension/consumer goal remain open.


AC12 verification: the combined RDF/JSON-LD regression suite passed 35 tests with 22,484
assertions before the final malformed-datatype guard. After that guard, the focused fromRDF suite
passed three tests with 714 assertions and Chromium passed all 72 official/authored cases.
Type checking and the browser ESM/declaration build passed with the guard in place. The browser
checks recorded zero external requests and absent Node globals. These results qualify only the
implemented subsets; they do not close the overall UMF goal.


US-026-AC13 adds a JSON-LD-to-RDF proposal/report schema and standard RDF dataset candidate.
Full source/context archives remain in the report; JSON/YAML candidate recovery and copied edits
are verified. Explicit losses cover index annotations, empty graph inventory, omitted direction
and blank predicates. Unsafe exact-number conversion, double rounding/overflow, missing resources
and unknown encoding fields block atomically. Compound direction remains a required implementation gap.

The complete pinned toRDF manifest has 467 cases: 361 positives (including 16 syntax-only cases)
and 106 negatives. UMF emits 354 candidates and blocks 113; all negative cases block. Seven
positives remain blocked: tdi11/tdi12 (compound direction), tjs12/trt01 (exact numeric conversion),
tli12/tli14 (invalid RDF terms/list handling), twf05 (language validation). RDFLib 7.6.0 with literal
normalization disabled verifies 334 expected datasets by quad-role graph isomorphism. te111/te112
emit an extra triple whose property IRI contains multiple fragment separators; this is a known
conformance gap. t0118/te075 require generalized RDF with blank predicates, outside the current
RDF representation; their standard-RDF candidates disclose omitted predicates and are not counted
as equivalent. Syntax-only tests have no expected dataset and are counted separately.

Unmodified PyLD 2.0.4 accepts 360 cases. Twelve acceptance differences and five RDFLib-confirmed
output differences remain explicit in fixtures/jsonld/to-rdf. PyLD normalization additionally
miscompares several escaped literals; RDFLib comparisons distinguish those parser differences
from dataset changes. Neither oracle is treated as universal authority.

Sixteen authored cases verify literals, ordered lists, opaque JSON, native source recovery,
report/reject policies, direction, numeric guards and copied edits: seven candidates/nine blocks.
Chromium 148 matches all 483 official/authored outcomes, 966 source recoveries, 722 candidate
exports and two edits, without external requests or Node globals. tli14 has different TypeError
wording between engines; the same blocked status and diagnostic codes are required and both
messages are archived. Bun's two conversion tests pass with 4,112 assertions; type checking and
the browser ESM/declaration build pass. Full JSON-LD conformance, remaining extensions and the
seven metadata consumers remain open. No concepts were promoted to core in this increment.


US-026-AC14 implements compound-literal direction emission. The processor reuses its blank-node
issuer and places rdf:value, rdf:direction and optional lowercase rdf:language in the reference's
graph. Both official direction cases now match their expected RDF datasets under RDFLib graph
isomorphism. PyLD 2.0.4 emits a plain literal instead, dropping direction; these two output
comparisons are explicit native discrepancies, not native agreement.

The full 467-case toRDF baseline now has 356 candidates/111 blocks, including all 106 expected
negative blocks. Five positive blocks remain (tjs12, tli12, tli14, trt01, twf05). There are 336
verified official dataset matches, 16 accepted syntax-only cases, two differing datasets and two
generalized-RDF comparisons outside the current representation. No remaining gap was reclassified
as supported. Twenty authored cases include twelve candidates/eight blocks; five compound cases
exercise plain/language values, lists, named graphs and distinct directions. Reverse conversion
through both UMF formats must reproduce their expected JSON-LD values.


AC14 verification passed: eight scoped tests, 5,014 assertions, eight-file fresh patch installation,
type checking and the browser ESM/declaration build. Chromium ran all 487 official/authored cases:
368 candidates/119 blocks, 974 exact source recoveries, 736 candidate exports, two copied edits
and ten reverse conversions through JSON/YAML. External requests were zero and Node globals
absent. The existing tli14 engine-specific exception wording remains recorded with matching
status and diagnostic codes. The next JSON-LD conversion gaps are exact-number/JCS policy,
invalid-term handling and generalized RDF; wider extension and metadata-consumer work remains open.


US-026-AC15 closes the observed invalid-term conversion gaps. Generic IRI and BCP47 syntax
validation emits explicit loss events; reject policy blocks omissions. Graph/subject/property
checks precede auxiliary triple generation, and null list-first objects are omitted without
removing list-rest structure. Dedicated boundary tests cover Unicode/private-use placement,
percent escapes, authorities, IPv6/IPvFuture, grandfathered tags and duplicate language subtags.

The full toRDF corpus now has 359 candidates/108 blocks: all 106 negatives block and only tjs12
and trt01 remain positive blocks (numeric conversion). RDFLib verifies 341 official expected
datasets, with zero differing comparable outputs; 16 accepted syntax tests have no expected
output, and t0118/te075 still require generalized RDF outside the representation. Nine native
output differences remain, while PyLD emits non-parseable RDF for tli12/twf05 and rejects tli14.
These outcomes are recorded without treating oracle behavior as conformance authority.

The authored set now has 28 cases, 19 candidates/nine blocks. New controls cover malformed
subjects/graphs with lists (no orphan triples), invalid list values, datatype IRIs, duplicate
language extensions, paired omission/rejection and valid IPv6/Unicode/private language forms.


AC15 follow-up probe: RFC 3987 permits U+00A0 in an IRI, but the native processor's earlier
absolute-IRI predicate treats it as whitespace/relative. The source is preserved and omission
warnings are emitted; the candidate currently drops that triple. This is a known compatibility
gap outside the official manifest, recorded in fixtures/jsonld/to-rdf/unicode-iri-gap.json. Generic
term validation does not establish complete IRI handling throughout context expansion/conversion.


AC15 verification passed: ten scoped tests with 5,154 assertions, fresh eight-file processor patch
installation, type checking and browser ESM/declaration build. Chromium matches all 495 official
and authored cases: 378 candidates/117 blocks, 990 source recoveries, 756 candidate exports, two
copied edits and ten reverse conversions. Diagnostic messages now agree across engines, including
the repaired tli14 case. External requests are zero and Node globals absent. Numeric/JCS policy,
generalized RDF, the recorded Unicode-IRI compatibility gap and the wider UMF goal remain open.


US-026-AC16 resolves the Unicode-IRI omission recorded after AC15. Four authored Unicode cases
cover U+00A0/U+2003/U+2028/U+3000 across contexts, graph names, subjects, predicates, objects and
datatypes; an ASCII-space control still rejects. Expansion, flattening and compaction retain the
same datasets. Framing retains the selected terms while intentionally projecting into its merged
default-graph view. Both UMF formats recover sources and RDF candidates and reverse to the expected
JSON-LD values. The original probe remains historical evidence; current resolution is recorded in
fixtures/jsonld/to-rdf/unicode-iri-resolution.json and regenerated by the authored-case script.

PyLD 2.0.4 rejects all four Unicode context mappings. RDFLib 7.6.0's raw N-Quads parser also rejects
the Unicode spaces because of its whitespace predicate. After equivalent Unicode escaping of the
four characters in N-Quads syntax, RDFLib confirms all eight expected dataset comparisons without
literal normalization. Raw rejections and escaped comparisons are recorded separately in
fixtures/jsonld/to-rdf/unicode-iri-oracle-results.json; no raw-native agreement is claimed.

The browser matrix passes all 500 official/authored cases: 382 candidates/118 blocks, 1,000 exact
source recoveries, 764 candidate exports, two edits, 18 reverse conversions and 16 additional
Unicode processing/projection checks. Diagnostic messages agree with Bun; external requests are
zero and Node globals absent. The shared JSON-LD suite's conversion, expansion, flattening,
compaction, framing and numeric regressions pass. A legacy sample-count assertion accidentally
changed with the patch-file count was corrected and rerun; the larger authored matrix now uses
an explicit 30-second timeout and passes its rerun. Type checking and the browser ESM/declaration
build pass. Fresh installation reproduces nine patched files. Numeric/JCS conversion, generalized
RDF and the wider extension/metadata-consumer goal remain open; no core promotion occurred.


US-026-AC17 adds explicit strict/binary64 numeric policy to RDF proposals and report schemas.
Strict is the default. Binary64 mode reports changed numeric values, signed-zero removal,
underflow and RDF integer/double formatting losses at expanded-value pointers. Reject policy
blocks these losses; non-finite JSON overflow blocks under either numeric policy. Exact source
and context values remain in the report. Typed strings, including xsd:double strings, retain their
lexical values. Small exponent-form JSON numbers correctly select RDF double representation.

The official toRDF matrix now selects binary64/report explicitly: 361 candidates and 106 expected
negative blocks. All 343 comparable expected datasets match RDFLib's term-isomorphism check;
16 syntax-only positives have no expected output. The two generalized-RDF expectations remain
outside the current representation and are not counted as equivalent. The numeric policy change
does not establish full JSON-LD conformance or close the remaining extension scope.

Forty-eight authored cases yield 34 candidates/14 blocks. Numeric controls cover paired policy
rejection, copied exact-token edits, underflow, overflow, negative zero, small doubles, typed
strings, large integer formatting and opaque JSON canonicalization. PyLD 2.0.4 rejects three
typed-string controls and differs on four expected numeric lexical results, reflecting its Python
integer/float behavior. These outcomes are recorded in fixtures/jsonld/to-rdf/numeric-oracle-results.json;
no mismatch is counted as agreement. The official native comparison also retains trt01's datatype
difference in addition to the previously documented discrepancies.


AC17 verification passed: twelve scoped regression tests (5,523 assertions) and three focused
numeric tests (49 assertions), type checking, browser ESM/declaration build and nine-file fresh
patch reproduction. Chromium ran all 515 official/authored cases: 395 candidates/120 blocks,
1,030 exact source recoveries, 790 candidate exports, four copied edits (including rounded numeric
edits), 18 reverse conversions and 16 Unicode processing checks. Diagnostics agree with Bun,
external requests are zero and Node globals absent. Generalized RDF, other JSON-LD compatibility
work and the wider extension/metadata-consumer goal remain open. No concepts were promoted to core.


US-027 adds umf.generalized-rdf with complete wrapper and native quad-array schemas, exact
NativeJson source, local blank scope, copied quad access and atomic edits. Unknown native shapes
remain recoverable but block interpretation; unknown encoding fields block native export without
preventing core JSON/YAML recovery. The RDF 1.1 package remains strict. JSON-LD projection now
records produceGeneralizedRdf and selects this package when true; the reverse proposal retains
full source and exact RDF JSON values under explicit processing mode.

Both pinned generalized cases match their expected datasets, including shared blank identities
across predicate and subject roles. Reverse/reprojection equivalence also passes after fixing the
processor's dropped blank-predicate marker. PyLD agrees for te075 but emits ten quads for t0118's
nine-quad expectation; native/expected outputs and the discrepancy are archived. The standard-RDF
matrix still reports its intentional omissions for these inputs; the generalized branch has its
own positive evidence and must not be confused with standard N-Quads equivalence.

CONTRACT-027, TD-027 and US-027 govern the new package. Reproduction and parser qualifications are
in native/generalized-rdf/README.md. This implements the JSON-LD generalized subset, not every
possible generalized RDF term position, empty graph inventory or entailment. No independent domain
semantic equivalence has been established for a new promotion into core.


US-027 verification: the scoped regression run passed ten tests with 5,412 assertions. The expanded
package run passed three tests with 81 assertions, including exact RDF JSON in both processing
modes and unknown-source blocking. Chromium passed both official generalized cases with four
source recoveries, four candidate exports, four reverse projections, four reprojections, four
copied edits, two exact JSON-literal checks and unknown-data/encoding guards. External requests
were zero and Node globals absent. Type checking, browser ESM/declaration build and fresh
nine-file processor patch reproduction passed. Wider JSON-LD compatibility, ontology/platform
extensions and metadata-consumer deliverables remain open; the overall goal is not complete.

## US-028: SHACL graph and property-path implementation

[CONTRACT-028](../02-design/contracts/CONTRACT-028-shacl.md) and
[TD-028](../02-design/technical-designs/TD-028-shacl.md) define the new `umf.shacl`
0.1.0 package. The implementation preserves SHACL 1.0 Turtle graphs, exact source and
literal spellings, returns copied metadata, and supports atomic quad edits. A complete
payload schema and recursive path schema are published under `spec/extensions/shacl/`.
All seven property-path forms compile and evaluate over explicitly supplied data graphs.
Malformed/recursive paths, unknown encoding and named-graph loss block interpretation.
No constraints are silently treated as satisfied: constraint validation is not yet exposed.

The authored matrix has 13 expressions and 52 focus/path cases; independent RDFLib 7.6.0
expressions agree on all value sets. Both source round trips and the changed exact count
agree by native graph isomorphism. Chromium 148 passes 104 evaluations, two source
recoveries, two copied edits, recursive/unknown guards, no Node globals and zero external
requests. Resource-limit tests cover deep path trees and expensive finite traversal.

Official source inventory: W3C data-shapes revision
`fe6275b93fa4de7fc070d82ca8e14d633b2d25da`, 172 hashed files including license and historical
reports. All 150 Turtle resources under the SHACL 1.0 `tests/` directory recover exactly
through both UMF formats; RDFLib confirms 300 graph comparisons. Thirteen declared paths
in the path directory compile in both implementations. Official expected validation reports
are retained, not executed. Native lexical warnings from deliberately invalid literals are
recorded in `fixtures/shacl/corpus-oracle-results.json`.

A historical 2,948,679-byte implementation report imports but its expanded UMF serialization
exceeds the core 4,000,000-character limit. It remains archived and hashed; it is outside
this test-resource matrix. Large-envelope serialization remains a limitation to resolve,
not successful round-trip evidence. Source length and encoded envelope length are distinct.

Next: execute the pinned official target/constraint/report cases, then custom/SPARQL
components and metadata consumers. SHACL 1.2, OWL, platform extensions and the broader
accepted scope remain open. No semantic promotion into core was made.

US-028 verification: five Bun tests passed with 862 assertions. Type checking and
browser ESM/declaration build passed. Chromium evidence remains 104 authored evaluations,
two source recoveries, two edits and the unknown/recursive guards. The large report
limit is reproduced in `fixtures/shacl/large-envelope-limit.json` (6,500,509 encoded JSON
characters for the documented probe options). The overall goal remains active.


US-028 Core targets: `getShaclTargetNodes` now implements explicit node, class,
subjects-of, objects-of and implicit class target unions. Shapes and data hierarchies
remain separate; cycles terminate, terms stay exact, and custom targets/imports/entailment
block instead of producing partial selections. Deactivation does not remove target nodes;
constraint execution will apply it separately. A target-node JSON schema is published.

Evidence: seven pinned official target files and an authored graph pair yield 60
selections, including empty sets. Independent RDFLib 7.6.0 SPARQL/path queries agree on
all 60. Three Bun target tests pass with 159 assertions. Chromium 148 passes 120
selections through JSON/YAML recovery, 16 exact source recoveries, one copied target edit,
and a custom-target guard; zero external requests and no Node globals. Type checking and
browser ESM/declaration build pass. Reproduce with `scripts/shacl-targets.ts`,
`scripts/shacl-targets-oracle.py` and `scripts/shacl-targets-browser.ts`; results are under
`fixtures/shacl/target-*.json`. These results are target sets, not validation reports.

Next: implement constraint components and compare official validation reports, retaining
the remaining SHACL/SPARQL, ontology/platform and consumer scope in the active goal.


US-028 constraint-engine experiment: rdf-validate-shacl 0.6.5 now runs behind
`proposeShaclEngineValidation`, with explicit blank-node policy, source graph copies,
a native RDF report and `complete: false`. Cyclic shape/list dependencies and unsupported
execution declarations block; the engine's silent fifty-check cutoff is disabled. A
60-violation regression verifies that repeated checks are not silently omitted. Numeric
conversion that changes an integer/decimal value blocks, following an authored unsafe-
integer false pass confirmed independently by PySHACL. Exact ordering remains required.

The pinned Core manifests yield 98 cases. All 98 engine booleans agree with expectations.
Report comparison agrees on mandatory top-level fields in all 98 when equivalent mapped
paths are compared; raw path-subgraph isomorphism agrees in 89, due to path-node sharing.
Messages, nested details and blank identity relative to source graphs are excluded, so
these figures do not establish complete report fidelity. Independent PySHACL 0.30.1 /
RDFLib 7.6.0 agrees with 97 booleans and 95 path-semantic report projections; differences
in datatype-001, or-datatypes-001 and uniqueLang-002 are retained in evidence.

Five focused Bun tests pass with 1,026 assertions. Chromium 148 passes 196 evaluations,
392 source recoveries, 196 report recoveries and scope/numeric/recursion guards. Browser
report parity compares complete ordered quad records after first-occurrence blank-label
renaming, not independent conformance. External requests are zero and Node globals absent.
Type checking and browser ESM/declaration build pass. Full shape/report semantics and the
remaining extension/consumer scope stay open; no core promotion is claimed.


Exact numeric follow-up: `umf-exact-decimal-1` replaces the earlier integer/decimal
conversion block with exact six-constraint ordering and datatype checks. The original
9007199254740993 minimum now evaluates to a proper violation. Mixed float/double
promotion remains blocked; full SHACL support remains open. Source spellings are retained.

The authored matrix has 75 cases, including large adjacent integers, negative values,
subnormal-sized decimals, 351-digit integers, equivalent spellings, zero and signed/unsigned
datatype boundaries. PySHACL agrees on 71; four datatype deviations remain recorded.
Seven focused Bun tests pass with 1,932 assertions. Chromium passes 150 authored evaluations,
300 source recoveries and 150 report recoveries plus scope/recursion checks, with no external
requests or Node globals. Type checking and ESM/declaration build pass. The 98 official Core
booleans and qualified mandatory-field comparisons remain passing in Bun/native evidence.

Reproduce the new evidence with `bun scripts/shacl-exact-numeric.ts`,
`.cache/shacl-venv/bin/python scripts/shacl-exact-numeric-oracle.py`,
`bun test tests/shacl/numeric.test.ts tests/shacl/engine.test.ts`, and
`UMF_CHROMIUM_PATH=/home/erik/.local/bin/chromium bun scripts/shacl-exact-numeric-browser.ts`.
The numeric gap fixture now records both the unmodified engine's false pass and the UMF
wrapper's corrected false result. Full report fidelity and remaining datatype/extension
work are still required; no core promotion or overall completion is claimed.


Exact-profile verification update: the refreshed official Chromium run passes 196
evaluations, 392 source recoveries and 196 report recoveries, including scope and
recursion checks. Together with the authored browser matrix this exercises both official
Core cases and the new exact numeric profile. Raw and path-semantic report comparisons
remain separately recorded; the latter still agrees in all 98 engine cases.

The final focused numeric rerun passes two tests with 908 assertions, including explicit
checks for the four recorded PySHACL datatype discrepancies. The browser build is current.


Numeric profile 2 now implements mixed integer/decimal/float/double ordering and
float/double datatype validation. It supersedes the earlier mixed-promotion blocker.
Decimal-to-binary32 rounding is direct, avoiding binary64 double rounding; float literals
enter binary32 before widening. NaN is unordered, infinities compare without subtraction,
and signed zero remains in source while comparing equal. The profile is identified as
`umf-numeric-2` in the report schema. A bounded direct-conversion limit blocks without
partial results or source loss; full SHACL/report support remains unclaimed.

Evidence: 24 authored operand pairs independently agree with glibc 2.41 strtof/strtod.
Those pairs exercise all six ordering constraints, plus 16 datatype cases, for 160 total
cases. The float Bun run passes two tests with 993 assertions; a separate public limit
check passes five assertions. Existing engine/numeric regression passes seven tests with
1,934 assertions. Chromium passes 320 evaluations, 640 source recoveries and 320 report
recoveries, with scope/recursion checks, no Node globals and zero external requests.
All 98 official Core booleans and qualified mandatory-field comparisons remain matching.
Messages/details, source-anchored blank identity, malformed shapes, datetime/string
semantics and remaining extensions/consumers are still required work.

Reproduce with `python3 scripts/shacl-float-inputs.py`, `bun scripts/shacl-float.ts`,
`python3 scripts/shacl-float-oracle.py`, `bun test tests/shacl/float.test.ts`, and
`UMF_CHROMIUM_PATH=/home/erik/.local/bin/chromium bun scripts/shacl-float-browser.ts`.
The C oracle is development-only and requires the documented libc platform; the browser
implementation is TypeScript/JavaScript with BigInt and DataView, not a native dependency.

### SHACL Unicode and language matching

Implemented `umf-string-1` for code-point lexical lengths, xsd:string ordering and
basic language ranges, with 106 authored cases and explicit native discrepancies.
String browser coverage passed 212 evaluations after JSON/YAML recovery. Refreshed
all 98 official Core cases in Chromium (196 evaluations); selected semantic report
comparison still agrees on 98, with the existing report exclusions. Bun type checking
and browser ESM/declaration build passed. Full SHACL conformance, remaining platform
extensions and the seven metadata consumer demonstrations remain open.

### SHACL constraint list preflight evidence

The pinned native engine reports conforms=true for `sh:and` referencing a node with
no list triples. UMF now blocks that malformed shape before execution; the exact
reproduction is `scripts/shacl-list-gap.ts` and `fixtures/shacl/list-gap.json`.
Two Bun tests pass with 201 assertions across 48 malformed cases and valid controls.
Chromium passed malformed-list JSON/YAML recovery checks and all 196 evaluations of
the 98 official Core cases. Type checking and browser ESM/declaration build passed.
Full static shape validation and the broader extension/consumer scope remain open.

### SHACL declared metadata consumer input

Implemented `getShaclShapeMetadata` and `metadata-schema.json`, with a representative
order fixture and generated metadata artifact. Two Bun tests passed 41 assertions;
Chromium passed both JSON/YAML recoveries and copied edits, with zero external requests
and no Node globals. Type checking and the browser ESM/declaration build passed.
The API retains source scope, references, unknown content and exact lexical terms;
its declarations do not imply validity or enforcement. Full generated consumer
artifacts and cross-system transformations remain required under FR-41 and US-028.

### OWL 2 graph package started

Added `umf.owl` 0.1.0, payload/header JSON schemas, Turtle recovery, declared headers,
and copied quad edits. W3C source provenance and an explicit syntax correction are
recorded under native/owl. RDFLib confirms four regenerated graph comparisons;
Chromium passes four source recoveries and two exact-cardinality edits. Type checking
and browser ESM/declaration build pass. Remaining US-029 work includes complete axiom
and expression APIs, syntax adapters, profile checks, reasoning and projections.

### OWL local expression access

Added `getOwlExpressionView`, its JSON Schema, and authored constructor/restriction
examples. Two Bun tests pass 170 assertions; RDFLib agrees on aggregate structure for
44 expressions (28 Primer, one earlier authored, 15 expression cases). Chromium now
passes six source recoveries, two copied edits and two exact-cardinality expression
checks, with zero external requests and no Node globals. Type checking and browser
build pass. These local views do not complete the recursive OWL structural model,
profile checking, reasoning, syntax adapters or consumer projections required by US-029.

### OWL axiom annotation access

Added exact-term axiom/nested-annotation lookup, output JSON Schema and source/edit
provenance. Two Bun tests passed 32 assertions. RDFLib independently confirms the
authored fixture's roots, reachable records and nested links. Chromium passed both
annotation recovery checks alongside eight source recoveries, two edits and two
expression checks. Type checking and browser ESM/declaration build passed. Full
axiom parsing, syntax adapters, profile reasoning and projections remain open.

### OWL annotation identity verification

Expanded authored coverage by 15 boundary cases and 30 JSON/YAML recovery checks.
All independent RDFLib classifications agree. The annotation test file now passes
three tests and 126 assertions. Chromium passes the same 30 cases without external
requests or Node globals; type checking passes. No runtime behavior change was needed:
the new evidence confirms scoped blanks, lexical/datatype distinctions, RDF language
case handling and duplicate occurrence provenance. This does not complete OWL support.

### OWL negative and n-ary assertion views

Completed the previously unfinished special-axiom API and result JSON Schema. Corrected
negative data target roles and preserved inverse object-property references. Two Bun
tests pass 34 assertions; RDFLib agrees on six explicit axioms through both JSON/YAML
recoveries. Chromium passes both recoveries with no external requests or Node globals.
Type checking and browser ESM/declaration build pass. HELIX records these as local RDF
views: complete OWL structural parsing, profile validation and reasoning remain open.

### Cross-extension schema and package audit

Added the repeatable `test:schemas` gate and wired it into conformance execution.
All 30 current packages register together, their embedded payload schemas equal
their standalone schemas, and every declared evidence path exists. All 149 published
JSON schemas compile under their declared dialects, including vendored 2019-09 and
Draft-04 resources. Reports preserve per-package native version/subset declarations
and per-schema dialect/failures. These audits do not certify evidence contents or
complete the full extension inventory.

The existing CONTRACT-001 promotion remains representation-level: the exact JSON
tree is shared across JSON Schema, Avro and OpenAPI, with compatibility and exact
numeric regression tests. Entity, DDD identity, defaults and execution semantics
have not been promoted by this audit.

The core regression suite also passed: 21 tests, 199 assertions covering unknown
retention, identity/reference checks, atomic edits, invalid package/schema rejection,
numeric boundaries and exact JSON representation compatibility. Type checking passed.

### Full regression run: Smithy corpus test deadline

The broad Bun regression run exposed a five-second deadline failure in the single
US-014-AC13 test that archived all 182 pinned invalid-loader models. Replaced that
aggregate test with named per-source cases plus an inventory/hash test. Every original
assertion remains: all manifest hashes, the 182-model inventory, exact YAML recovery,
and incomplete native-validation status. Each case retains Bun's default deadline;
no source was excluded and no native support claim changed.

The focused `bun test tests/smithy/sources.test.ts` rerun passed 186 tests and 724
assertions in 7.56 seconds. Type checking passed. The higher test count reflects case
separation, not expanded native coverage. The original full run continued after its
timeout and was still running when this entry was recorded; a green full-suite result
has not yet been established. These checks concern source preservation, not fresh
native Smithy assembly or browser execution.

### Full regression run completed; Smithy group verified after repair

The original `bun test tests` process finished with exit code 1: 492 passed, one
failed, 60,745 assertions across 158 files in 897.35 seconds. Its sole failure was
the aggregate Smithy invalid-loader deadline above. The run continued through all
remaining groups, including JSON-LD, SHACL and OWL, without another failure. Raw
output is retained in `fixtures/regression/bun-full-before-smithy-split.log`.

After the case separation, `bun test tests/smithy` passed all 204 tests and 1,001
assertions across seven files in 10.62 seconds, with exit code 0. The complete
Smithy group includes preservation, bundles, source archives, assembly, workers,
selectors and projection API checks. Its raw output is retained in
`fixtures/regression/bun-smithy-after-split.log`.

These are a completed broad run with one repaired test-harness failure and a passing
affected-group rerun, not a claimed single green full-suite run. They do not rerun
every external native oracle or browser matrix: tests that inspect saved native
evidence retain that narrower scope. No adapter semantics or core promotion changed.
The remaining extension, transformation and metadata-consumer deliverables remain open.

### OWL explicit entity declarations

Added `getOwlDeclarations`, its complete result JSON Schema and a fixture covering
all six explicit declaration types. Separate IRI/role records preserve overlapping
roles and duplicate occurrence indexes; anonymous type assertions are exposed without
inventing named entities or declaring those assertions invalid. Unrecognized content
remains in the copied source. No import fetching, inferred declarations or OWL profile
claims are introduced.

Two Bun tests passed 138 assertions. RDFLib 7.6.0 agrees on all 12 cases across the
authored boundary fixture, earlier authored graph and corrected Primer, through both
UMF formats and copied edits. Chromium passed all 12 view/recovery comparisons and
six edits with zero external requests and no Node globals. Type checking passed.
Reproduction is wired into conformance; package evidence points to the tests and
native/browser reports. Full structural OWL parsing, other syntaxes, profiles,
reasoning and consumer projections remain required; no core concept was promoted.

The browser ESM/declaration build passed. The updated cross-extension audits passed
all 30 package registrations and all 150 declared JSON schemas, including the new
declaration-view result schema. These are structural checks, not additional native
OWL conformance evidence.

### OWL list axioms

Added `getOwlListAxioms` and its result JSON Schema for ordered property chains,
keys and disjoint unions. Records preserve list heads, repeated members, separate
axioms and all main/list occurrence indexes. Malformed local structures are reported
without deleting source or hiding unrelated axioms. Keys remain unclassified OWL
property references, not generated database uniqueness constraints. The package's
native subset description now includes all implemented local OWL views while
retaining explicit structural/profile/reasoning limitations.

Three Bun tests passed 178 assertions; RDFLib 7.6.0 agrees on 12 authored/Primer
recovery and edit comparisons. Chromium passes all 12 cases and six copied edits,
with zero external requests and no Node globals. Type checking passed. Conformance
execution includes the generators, native oracle and browser runner. The full OWL
reverse mapping, other syntaxes, profiles, reasoning and projections remain required;
no concept was promoted to core.

The browser ESM/declaration build and cross-extension audits passed: 30 packages
and 151 JSON schemas. This adds structural verification of the list-axiom result
schema; it does not widen the stated native semantic coverage.

### RDF/XML browser feasibility and native gaps

SPIKE-006 evaluates pinned rdfxml-streaming-parser 3.3.0 over all 166 active W3C
RDF/XML cases and ten authored boundaries in three configurations. Source files,
expected graphs, license and SHA-256 inventory are retained. All official syntax
outcomes agree; the baseline/default-literal profile matches official graphs but
accepts three malformed authored XML inputs and corrupts an authored XML literal.
An finalizer fixes document completion only. Namespace inclusion
introduces two official graph differences and does not resolve escaping.

The browser experiment initially failed on a Node process entry point. A scoped
build-time resolver selects the browser implementation; Chromium then matches all
528 Bun outcomes with zero external requests and no Node globals. RDFLib 7.6.0
comparisons retain raw and language-case-folded results and all XML discrepancies.
Three tests pass 1,806 assertions; type checking passes. The parser remains a dev
dependency and the public RDF/OWL adapters are unchanged. Next: repair or replace
XML-literal handling, then implement source-preserving RDF/XML import/export and
edited round trips under complete schemas; do not count the spike as syntax support.

### RDF/XML literal repair experiment

Added an explicit literal serializer over the pinned parser. It fixes
text/attribute escaping, required namespace bindings, sibling/nested binding scope,
comment/PI retention and ordinary text accumulation across CDATA events. Historical
baseline evidence remains intact. Fourteen authored XML-literal cases plus an
ordinary CDATA case and the prior official/authored corpus produce 206 comparisons.
All official syntax and exact graph checks still agree; seven authored lexical
differences from RDFLib remain explicit. An independent minidom/Expat structure
comparison passes all 14 repaired XML literals, versus three before repair, within
its declared namespace/value interpretation limits.

Chromium matches all 206 Bun outcomes with zero external requests and no Node globals.
The RDF/XML test group passes four tests and 2,225 assertions; type checking passes.
The public adapter is still unimplemented. Remaining integration gates include full
namespace-context policy, entity/chunking/version/limit checks, complete payload
schemas and edited RDF/XML round trips. See SPIKE-006 for the distinction between
XML structure preservation and exact RDF literal graph equality.

### Owner-directed priority correction and TableSpec baseline

On 2026-09-21 the owner explicitly put TableSpec, PostgreSQL, Microsoft SQL Server,
Avro and Parquet ingestion ahead of ontology work and required practical core
promotion, beginning with scalar types. Updated the PRD, architecture, core contract
revision requirement and active plan; retained earlier ontology evidence as deferred
work. No further RDF/XML changes are part of the active sequence.

Inspected and captured 17 TableSpec source/schema/test/example/license files at
commit 647e8e566ad78b864282ec65c0b0b2237aa63084. All selected paths are clean in that
working tree; individual SHA-256 hashes remain the source authority. The snapshot
contains both a monolithic table example and a split table/column directory.
`scripts/tablespec-sources.ts` reproduces the capture. Core scalar families and
column qualifiers will be derived from these actual inputs and the other four
native systems, with counterexamples for context-specific nullability and temporal
or numeric refinements. This capture resolves source access, not adapter completion.

### Core scalar metadata and initial TableSpec implementation

CONTRACT-001 and the core schema now reserve optional `Element.scalarType` with
boolean, integer, decimal, float, string, binary, date, time and timestamp families.
Unknown string families remain recoverable and report incomplete understanding.
Native refinements remain in extensions; family equality is not native equivalence.

US-030 / CONTRACT-030 introduce a TableSpec package, complete payload JSON Schema,
pinned model-generated native schema, monolithic JSON/YAML ingestion, copied column
access and edits, and derived names/descriptions/scalar metadata. Native unknown
fields and exact number tokens survive. Export rejects unsynchronized derived
metadata and unknown encoding fields. Embeddings remain unclassified as scalars.

Evidence: 25 core/TableSpec Bun tests, 237 assertions; native Pydantic comparison
accepts and agrees on 26 recoveries across 12 source cases and one copied-edit case.
Chromium repeats all 26 recoveries and the copied edit without external requests
or Node globals. Four nullable probes confirm boolean, contextual-map and absent
representations; the checked-in native schema differs from the runtime model.
The 153-schema and 31-package audit and type checking passed. Native validation is
independent evidence, not a browser runtime capability. See fixtures/tablespec and
the reproduction commands in native/tablespec/README.md.

Next: split TableSpec bundles; practical scalar/column views for existing PostgreSQL,
Avro and Parquet adapters; a separately versioned SQL Server package; representative
native and cross-system transforms. SQL Server timestamp/rowversion and Avro/Parquet
logical types require semantic mappings rather than matching type-name strings.
All broader acceptance criteria remain open; RDF remains deferred.

### TableSpec split-file ingestion and edited recovery

Implemented `importTableSpecBundle` / `exportTableSpecBundle` and extended copied
column edits to split inputs. The payload captures every supplied file; the metadata
view follows native filename ordering and sibling derivation precedence. Recovery
preserves opaque auxiliary files and shadowed inline derivations. Monolithic export
of split input rejects rather than discarding native loader migrations or sidecars.

The captured native Python loader agrees on all eight original/edited comparisons
across providers and an authored sidecar fixture, each through JSON and YAML UMF.
The oracle checks installed model bytes against the captured baseline. Chromium
passes the same four bundle recoveries and four edited recoveries, alongside all
26 monolithic recoveries, without external requests or Node globals. Type checking
passes. Evidence lives in fixtures/tablespec/split*.json and browser.json.

This advances US-030 AC4 but does not complete native loader migration execution,
arbitrary split-file edits, split-to-monolithic lowering or cross-system transforms.
The next priority is shared scalar/column metadata in PostgreSQL, Avro and Parquet,
plus the missing SQL Server extension, as directed by the owner.

### Avro field metadata and core scalar families

Avro import now materializes core field elements and exposes complete copied field
metadata with native pointers, enclosing record names and dependency identity.
CONTRACT-007 defines the mappings and full result JSON Schema. Nested records and
named scalar references are supported; recursive records are not expanded. Native
union/default/logical-type refinements remain intact. Mixed unions, structured types,
and unknown/invalid logical types do not receive guessed scalar families.

Native exports reject stale derived metadata. Existing conservative native edits
synchronize fields and reject loss or reassociation of attached metadata. Earlier
documents without the materialized module retain export/accessor compatibility.

Evidence: 40 focused core/Avro/TableSpec tests with 450 assertions, 154 schema checks
and 31 package checks passed. The authored fixture covers 26 field types; Apache
Avro 1.12.0 confirms both schema recoveries and records logical-type warnings.
Chromium matches the full field view, both UMF recoveries and a synchronized native
edit without external requests or Node globals. Type checking passed. The initial
browser run caught a test fixture that serialized a deliberately mutated accessor
copy; regenerated expected metadata from the document and reran successfully.

Reproduce the new evidence with `bun test tests/avro/metadata.test.ts`,
`.venv/bin/python scripts/avro-metadata-oracle.py` and
`bun scripts/avro-metadata-browser.ts` (set UMF_CHROMIUM_PATH when needed).
The native check proves schema recovery, not full scalar constraint enforcement.
Remaining priority work: PostgreSQL and Parquet core column metadata, SQL Server
extension implementation and robust cross-system transforms among the five systems.

### PostgreSQL catalog column metadata

Extended the catalog capture with optional explicit native type identity and exposed
`getPostgresqlColumnMetadata` plus materialized core column elements. CONTRACT-015
and the full metadata result schema define the mappings. Scalar classification uses
recognized pg_catalog base types; legacy formatted names, arrays, domains and other
unresolved meanings do not receive guessed families. Native qualifiers and unknown
content remain in the copied column tree. Candidate edits synchronize core metadata,
and export rejects stale views. Attached metadata cannot silently move to another
column or relation when source locations change.

Reran the pinned PostgreSQL 17.4 Docker oracle with a 20-column type fixture.
Original SQL, regenerated SQL and restored dump produce equal snapshots including
the added native type fields. All 42 existing behavior probes pass across three
databases. The new capture has 56 columns across 11 relations; the fixture includes
all nine scalar families and non-scalar/unresolved counterexamples. Schema definitions
retain backward compatibility with earlier v1/v2 captures lacking nativeType.

Validation: 19 PostgreSQL tests, 143 assertions; 155 JSON Schemas and 31 packages;
type checking; Chromium parity for 56 columns, two recoveries and one copied candidate
edit, without external requests or Node globals. Reproduce with
`bun scripts/postgresql-catalog-oracle.ts`, `bun test tests/postgresql`, and
`bun scripts/postgresql-column-browser.ts` with the Chromium path configured.

This establishes catalog-column ingestion, not catalog-independent DDL name resolution
or complete server semantics. Remaining priorities are Parquet scalar metadata,
SQL Server ingestion, and robust cross-system transforms with explicit losses.

### Parquet core field metadata

Added `importParquetSchema` and `getParquetFieldMetadata` with a complete result
JSON Schema. Successful imports retain all original bytes and expose indexed core
fields with native SchemaElement content, paths and definition/repetition levels.
Checked logical annotations govern scalar families before physical carriers.
Groups, INT96, unknown wire content and unmapped logical meanings remain unclassified.
Invalid logical/physical combinations block schema ingestion while the separate raw
capture API remains available for preservation.

Native export rejects stale materialized fields. Shared footer rewriting refreshes
the view, and explicit native rename retains attached descriptions and references.
This does not promote repeated fields into flattened row scalars or claim complete
instance validation. CONTRACT-019 documents those distinctions.

The 30 logical-type fixtures exercise 15 accepted and 15 blocked schemas. PyArrow
21.0.0 confirms the 15 native schema recoveries and all eight rows after rename.
Chromium matches 30 UMF recoveries and a native rename without Node globals or external
requests. Type checking, browser build, 156 JSON Schema checks and 31 package checks
pass. Reproduction: `bun test tests/parquet/field-metadata.test.ts`,
`.venv/bin/python scripts/parquet-field-oracle.py`, and
`bun scripts/parquet-field-browser.ts` with the Chromium path configured.

SQL Server is now the remaining named priority without an initial adapter. Its
catalog/DDL intake and native evidence take precedence over further ontology work;
cross-system transforms and additional core promotion remain required afterward.

The broader Parquet regression run passed all 45 tests and 4,788 assertions across
18 files, including source preservation, footer transforms, rename, physical/logical
decoding, levels, row assembly and offset repair (59.58 seconds).

### Initial SQL Server extension and native catalog evidence

US-031 / CONTRACT-031 add umf.sqlserver 0.1.0, complete payload/capture/column-result
schemas, browser-compatible catalog ingestion, exact source recovery, native column
access and copied candidate edits. The catalog query retains native type IDs and
alias identities, byte lengths, precision/scale, nullability, collation, identity,
computed/default expressions and descriptions. Core families use canonical system
type identity; timestamp/rowversion is binary. Unknown/CLR/structured types remain
unclassified and native content remains recoverable.

Native SQL Server 2022 build 16.0.4295.3 runs from a pinned image digest in a disposable,
network-isolated container. Replaying the authored DDL in two fresh databases yields
equal catalogs for 32 columns. JSON/YAML UMF recovery preserves the capture. Native
behavior confirms exact identity 9007199254740993, computed result 7 after update,
and changing eight-byte rowversion values. These checks do not reconstruct arbitrary
DDL from UMF. The authored capture includes a decimal alias, Unicode byte lengths,
MAX, rowversion and its timestamp synonym, temporal types, XML and sql_variant.

Three focused tests (41 assertions) and Chromium pass; browser evidence covers
32 columns, two recoveries and a copied candidate edit without external requests or
Node globals. Negative tests enforce capture validation, duplicate rejection,
unknown encoding retention/export refusal, stale core metadata and attachment guards.
They caught a package-registration setting that skipped the custom validator; the
corrected package invokes its qualified semantic validator and remains incomplete.

The native harness required compatible sqlcmd output options, explicit IPv4 loopback
under this host's emulation, and QUOTED_IDENTIFIER ON for the fixture. These are
captured in scripts/sqlserver-oracle.ts. Reproduce with that script, then
`bun test tests/sqlserver` and `bun scripts/sqlserver-browser.ts` with Chromium configured.

All five owner-prioritized systems now have initial ingestion and core scalar metadata.
They are not finished integrations. Next work is representative cross-system schema
transforms, broader SQL Server catalog/DDL coverage, and promotion of additional
shared field concepts only with evidence of equivalent meaning. RDF remains deferred.

### SQL Server to Avro schema transformation

US-032 / CONTRACT-032 implement an explicit schema projection from a selected SQL
Server table to an Avro record. Bindings select field names and native-value versus
SQL-text representation; strict/reporting policies govern fidelity issues. The
complete result schema retains source, policy, mappings and diagnostics. Unsupported
value mappings, modified/version-unknown captures and invalid bindings cannot yield
a successful target. Generated/default behavior, aliases, range/length/collation,
temporal refinements and database constraints are retained in source and reported.

The native sales.Types capture projects all 30 columns with 29 explicit issues.
High-precision temporal and otherwise unsupported fields use caller-selected text.
Apache Avro 1.12.0 and fastavro 1.12.2 agree on 349 binary bytes and decoded sample
values through both UMF formats, covering exact bigint, 38-digit decimals, fixed
bytes, Unicode, date and nullable values. Invalid fixed lengths reject; target
acceptance of tinyint 300 is recorded as evidence of the reported range mismatch.
Chromium matches the full projection and diagnostics, both recoveries and strict
policy blocking. Authored boundary cases separately exercise six-digit temporal
mapping and invalid decimal scale/rowversion widths; they are not native source
observations or end-to-end temporal row-conversion evidence.

Validation: 18 SQL Server/Avro tests, 279 assertions, 160 schemas, 32 packages,
type checking and browser build passed. Reproduce with
`bun test tests/sqlserver/avro-projection.test.ts`,
`.venv/bin/python scripts/sqlserver-avro-oracle.py` and
`bun scripts/sqlserver-avro-browser.ts` with Chromium configured.

This is a schema transform, not a source-row encoder. Broader SQL Server schema
coverage, transforms involving TableSpec/PostgreSQL/Parquet, independent instance
conversion and additional core promotion remain required. The observed mismatches
argue against promoting unqualified precision, length, default or optionality fields:
byte length, decimal precision, float width, SQL defaults and Avro writer presence
have distinct contracts that scalar-family equality alone does not resolve.

### TableSpec to Avro schema transformation

CONTRACT-033 advances US-030 AC5 with explicit per-field representation and nullability
bindings. Source nullability requires a boolean or a named context containing a
boolean; missing contexts/keys and missing decimal precision/scale do not get defaults.
The projection supports declared numeric widths, decimal, dates, instant/local
timestamps, strings and float-vector arrays, while retaining monolithic or split
source artifacts. Fidelity issues cover execution rules, formats, length/dimension,
context selection, explicit overrides and uninterpreted metadata. Strict policy
blocks; unsupported mappings cannot be overridden by reported-loss policy.

Native inspection found a real DATE representation disagreement in the pinned
TableSpec helpers: one returns StringType(), another DateType(). Runtime probes
confirm it, along with 32-bit integer/float and nullable float-array mappings. This
is evidence for explicit bindings and against silently conflating meaning with a
particular physical representation.

The authored 12-field fixture and captured four-field providers schema pass pinned
Pydantic source-preservation checks. Apache Avro 1.12.0 and fastavro 1.12.2 agree on
binary output and qualified normalized values through four UMF recoveries. Their
different local-timestamp return types and Apache warning remain recorded; the
oracle normalizes only that declared field to exact epoch microseconds. An explicit
int64 binding exceeds native Spark INTEGER width, and the target accepts an array
of the wrong declared dimension. Neither is described as lossless source conversion.
Chromium matches both complete projections, four recoveries and strict blocking.

Validation: 19 TableSpec/Avro tests and 266 assertions passed; type checking passed.
Reproduce with `bun test tests/tablespec/avro-projection.test.ts`, the native TableSpec
Python environment running scripts/tablespec-avro-source-oracle.py, then
`.venv/bin/python scripts/tablespec-avro-oracle.py` and
`bun scripts/tablespec-avro-browser.ts` with Chromium configured. The result has a
complete schema under spec/projections/tablespec-avro.schema.json.

Remaining priority work includes PostgreSQL/Parquet cross-system schema transforms,
native instance-conversion policies, broader SQL Server catalog/DDL coverage and
evidence-based promotion beyond scalar families. The full goal remains open.

### PostgreSQL catalog to Avro schema transformation

CONTRACT-034 advances US-015 AC10 with explicit field representations, native identity
checks and source preservation. The 20-column capture projects with 24 fidelity issues.
Numeric typmods retain signed scales: negative scale and scale exceeding precision
produce an explicitly widened target domain. Unconstrained numeric requires text;
finite-decimal excludes NaN. Temporal bindings explicitly restrict values to target
carrier/library ranges and exclude native infinity and time 24:00. Timetz, arrays,
domains and otherwise unclassified types require text or future mappings. Strict
policy, stale metadata, modified/version-mismatched captures and unavailable mappings
block output. No row encoder or general SQL type resolver is claimed.

PostgreSQL 17.4 in the pinned isolated container verifies native modifiers, rounding,
NaN/infinity and 24:00. Apache Avro 1.12.0 and fastavro 1.12.2 agree on 177 bytes and
qualified sample values through two recoveries, including exact int64 and decimal,
Unicode, binary and nulls. Local-timestamp return-type differences remain recorded.
Both target libraries admit smallint 40000 and NUL text, confirming reported losses.
Chromium matches the complete result, recoveries and strict blocking without network
dependencies or Node globals.

Reproduce with `bun test tests/postgresql tests/avro`,
`bun scripts/postgresql-avro-source-oracle.ts`,
`.venv/bin/python scripts/postgresql-avro-oracle.py` and
`bun scripts/postgresql-avro-browser.ts` with Chromium configured.
The complete result schema is spec/projections/postgresql-avro.schema.json.
Validation passed: 34 PostgreSQL/Avro tests with 389 assertions; the final focused
rerun after adding missing-type/version guards passed three tests and 58 assertions.
Type checking, all 162 JSON Schemas, all 32 extension packages and browser build
passed. This is focused evidence, not a fresh whole-repository suite claim.
Remaining priorities include Parquet cross-system transforms, native instance
conversion, broader SQL Server catalog/DDL coverage and further evidence-based core
promotion. RDF remains deferred and the full implementation goal remains open.

### Parquet to Avro schema transformation

CONTRACT-035 advances US-019 AC21 with recursive records, nullable/repeated fields,
legacy/current LIST normalization and explicitly selected map-entry arrays. The
entry arrays preserve non-string keys and duplicate ordering; native last-value
map behavior remains the consumer's responsibility. Key-only maps retain keys with
null values, unlike PyArrow's list-of-keys presentation. Scalar bindings retain
integer/decimal capacity and temporal units, with unsigned64 represented as decimal
and time-nanos as a long carrying a reported missing logical annotation. Unknown
schema content, unavailable logical types, INT96, invalid layouts, stale metadata
and ambiguous field names block lowering. The source byte capture is always retained.

PyArrow 21.0.0 writes and reads the 13-field/three-row nested fixture. Exact temporal
integer access avoids its rejected conversion of nanoseconds to Python datetime.
Apache Avro 1.12.0 and fastavro 1.12.2 agree on binary output and qualified values
through six row/schema recoveries. The oracle explicitly binds native uint64, map
entries and temporal carriers; it is not a general library row encoder. Target
acceptance of negative unsigned64 and int8 1000 confirms reported range gaps. Apache
warnings for fixed UUID and local/nanosecond timestamps remain recorded.

All 26 supported logical/container corpus schemas parse in both native Avro engines;
legacy list structure/nullability is checked against the captured native views.
The 22 invalid cases remain blocked. Chromium matches 20 source mappings, 23 issues,
both schema recoveries and exact source-byte recovery with no external requests or
Node globals. The result has a complete JSON Schema.

Validation: 59 Parquet/Avro tests and 5,153 assertions passed. A final focused run
including the unknown LIST-wrapper guard passed three tests and 179 assertions.
Type checking, all 163 JSON Schemas, all 32 extension packages and browser build
passed. This is focused regression evidence, not a fresh whole-repository run.

Reproduce with `.venv/bin/python scripts/parquet-avro-fixture.py`,
`bun test tests/parquet/avro-projection.test.ts`,
`.venv/bin/python scripts/parquet-avro-oracle.py` and
`bun scripts/parquet-avro-browser.ts` with Chromium configured.
Remaining priority work includes production library value encoders, broader SQL
Server catalog/DDL ingestion, PostgreSQL DDL-derived metadata, source/target systems
beyond these Avro projections, and evidence-based core promotion. Scalar families
do not establish common nullability, repetition, integer width or map contracts.
The full goal remains active; RDF remains deferred.

### SQL Server key, relationship and check observations

CONTRACT-031/US-031 AC6 add native capture profile v2 while retaining the existing
extension envelope and v1 reader. Every v2 table declares keys, foreign_keys and
checks arrays. The copied constraint-metadata API reports per-section availability,
so an older capture does not imply absence of constraints. A complete result schema
and expanded native capture schema cover ordered composite keys, foreign-key column
pairs/actions, SQL check definitions, trust, disabled/replication state and native
index/collation refinements. Unknown content remains exact; unknown kinds/actions
warn, and duplicate constraint names/column ordinals reject ambiguous observations.

The generated query composes the existing column capture with native constraint
catalogs. Native execution exposed null results for empty sections; both base and
expanded queries now explicitly return empty arrays. The oracle compares two named
DDL executions in SQL Server 2022 build 16.0.4295.3, verifies both UMF recoveries,
and separately probes an empty database. The three-table fixture covers five keys,
two foreign keys and three checks. Behavior probes verify cascading updates/deletes,
unique/FK/check rejection, enabled-but-untrusted enforcement, disabled checks and
SQL CHECK acceptance of null operands. This is authored DDL replay, not generation
of arbitrary equivalent DDL from the captured metadata.

Reproduce with `bun scripts/sqlserver-schema.ts`,
`bun scripts/sqlserver-constraints-oracle.ts`, `bun test tests/sqlserver` and
`bun scripts/sqlserver-constraints-browser.ts` with Chromium configured. Browser
coverage compares the full constraint view, both native recoveries and copied edits.
Validation passed: eight SQL Server tests with 118 assertions, type checking,
164 JSON Schema audits, 32 package audits and the browser build. Native query hashes
match the recorded execution evidence; disposable databases/containers were removed.
Do not promote physical key identity, SQL predicates, trust or enforcement flags into
core without matching semantics across systems. Broader index, DDL, trigger, temporal,
security and reconstruction coverage remains required, alongside native value codecs
and cross-system consumers. RDF remains deferred and the full goal remains active.

### SQL Server constraint losses in Avro projection

CONTRACT-032 now reports one source-pointer issue for each captured key, foreign key
and check on the selected table. Missing v1 sections generate explicit coverage
issues, avoiding an inference that the table has no constraints. The three-table
v2 fixture yields ten individual losses, preserving native source observations.
Two Avro engines agree through six recoveries and accept orphan/check-violating rows
and consecutive duplicate records; independent SQL Server probes enforce the native
constraints. Chromium matches full results and strict blocking. The original v1
30-column fixture now has 32 issues, including three missing-coverage reports.

Validation: ten SQL Server tests and 181 assertions, type checking and browser build
passed. Reproduce the added evidence with
`.venv/bin/python scripts/sqlserver-constraint-projection-oracle.py` and
`bun scripts/sqlserver-constraint-projection-browser.ts` with Chromium configured.
No row converter or portable constraint executor is claimed; broader ingestion and
the full multi-system implementation goal remain unfinished.

### PostgreSQL DDL declaration inventory

CONTRACT-015/US-015 AC11 expose table and column declarations directly from the raw
parse tree, including nested CREATE SCHEMA, foreign tables and ColumnDef-bearing ALTER
commands. The copied view carries source pointers, enclosing schema context, native
statements/columns and expansion requirements. Qualified/parser-normalized pg_catalog
names yield syntactic scalar families; unqualified names, domains, arrays and unknown
type fields remain unresolved. The API does not apply DDL to construct a final schema.
Its complete result schema is spec/extensions/postgresql/ddl-declarations.schema.json.

PostgreSQL 17.4 verifies original/regenerated DDL yield the same 14-column catalog.
Eight explicit orders columns become ten after LIKE and ALTER. A separate unqualified
text probe resolves to sales.text under the authored search_path, demonstrating why
syntax cannot substitute for catalog identity. Chromium runs the pinned WASM parser
and matches five declarations, 13 explicit column observations, both recoveries and
a copied edit. Foreign-table extraction is parser-only evidence, not FDW execution.

Validation passed: 24 PostgreSQL tests with 241 assertions, type checking, 165 schema
audits, 32 package audits and browser build. Reproduce with
`bun test tests/postgresql`, `bun scripts/postgresql-declarations-oracle.ts`,
`bun scripts/build-postgresql.ts` and `bun scripts/postgresql-declarations-browser.ts`
with Chromium configured. General DDL state evaluation, catalog-independent resolution,
broader SQL Server ingestion and production cross-system value codecs remain required.
The full goal remains active and RDF remains deferred.

### Full Bun regression baseline, 2026-09-21

`bun test tests` completed successfully under Bun 1.3.14 on Linux arm64: 718 tests
across 176 files, 64,038 assertions, zero failures, 938.97 seconds. The run includes
the new priority-system ingestion, metadata and projection tests alongside the
existing extension corpora. No failing implementation or test needed repair in this
run. Type checking, 165 JSON Schema audits and 32 extension-package audits also passed.

fixtures/validation/bun-full-suite.json records command, runtime, results, scope and
SHA-256 fingerprints; bun-full-suite.txt retains the full output. The fingerprint
covers src, spec, tests, package/lock and TypeScript configurations, and matched when
captured during the run and again after completion. It is not a fixture/native/toolchain
reproducibility manifest. Tests include recorded-fixture assertions and selected native
execution; this does not replace every standalone browser or native oracle run.

This supersedes the earlier lack of a fresh whole-repository Bun result, but does not
prove the full implementation goal. General value conversion, broader native ingestion
and reconstruction, remaining extension subsets, and all seven FR-41 metadata-consumer
demonstrations still require implementation and scoped evidence. The owner's five-system
priority remains in force; RDF work remains deferred beyond regression verification.

### Portable core element selection

CONTRACT-001/US-001 AC6 add selectCoreElements for exact identity/context/name/scalar
filters and explicit core-reference traversal. Results retain full source context,
copied query/elements, source paths, validation limits and outgoing boundary references.
Cycles terminate; duplicate edges and identical names across namespaces retain their
distinct meanings. Native links inside extensions are preserved but not traversed.
Declared core fields are selected as supplied; adapter-specific consistency checks
remain required before native export. Input/output limits fail without partial results.

The complete result schema is spec/core/element-selection.schema.json. A mixed-context
fixture exercises future vocabulary/scalar content, namespace collisions and cyclic
references. Fixtures for TableSpec, PostgreSQL, SQL Server, Avro and Parquet demonstrate
shared scalar selection with unchanged native recovery. Chromium compares all views,
both serialization recoveries for five adapters and isolated result edits.

Validation passed: 27 core tests with 275 assertions, type checking, all 166 schema and
32 package audits, browser build and Chromium checks. Reproduce with
`bun scripts/core-selection-schema.ts`, `bun test tests/core` and
`bun scripts/core-selection-browser.ts` with Chromium configured. This change follows
the recorded 718-test full-suite baseline and has focused new evidence; that baseline's
fingerprint is not presented as covering this later addition.

This advances FR-41 traversal/selection and context retention. Full transform,
visualization, pipeline, validator, form, agent-context and human-documentation consumers
from one mixed model remain required. Existing integration and value-codec work also
remains open; the full goal is active and RDF stays deferred.

### Seven consumers from an authored mixed orders model

CONTRACT-036 supplies a bounded FR-41/B-014 demonstration in
scripts/examples/orders-consumers.ts. One TableSpec/OpenAPI/DDD model generates
an executable rename, SVG, pipeline proposal, validator, form metadata, agent
context and plain-text documentation. Native payloads, unknown vocabulary and
TableSpec → Avro → JSON Schema projection issues remain in the bundle. Core
scalarType metadata supports forms/documentation without replacing native meaning.
The complete result schema is spec/examples/orders-consumers.schema.json.

Both serialization formats regenerate the bundle and preserve native recovery;
copied description edits propagate. Exact-key row conversion rejects extra/missing
fields, wrong types and int32 overflow. Chromium renders six graph nodes, four
associations, three form controls and documentation, then executes local validation
with no external requests or Node globals. Independent Python validation and two
Avro codecs agree on six transformed rows. The pinned TableSpec Pydantic model
accepts both source variants unchanged.

Validation: 7 focused tests / 122 assertions, type checking, 167 schema and 32
package audits, Chromium and native checks pass. CONTRACT-036 records commands
and limits. This follows the 718-test baseline, not a new full-suite run. All seven
B-014 demonstration classes are represented; reusable arbitrary-model generation,
domain enforcement and runtime delivery remain open. The full goal remains active
with the owner's five-system priority and RDF deferral unchanged.

### SQL Server v3 index ingestion and projection evidence

CONTRACT-031/US-031 AC7 add index/heap capture and copied metadata views. V3 requires
the new observations while keeping v1/v2 recovery compatible. The complete capture
and view schemas retain unknown native content; duplicate IDs/positive ordinals
reject ambiguity. Predicate availability, disabled state, columnstore ordering and
partitioning remain explicit native semantics. No core uniqueness/identity promotion
is justified by these observations; CONTRACT-001 records the counterexamples.

SQL Server 2022 build 16.0.4295.3 produces matching captures for two authored databases,
five tables and nine heap/index observations. Native behavior demonstrates filtered
duplicate insert/update rejection, duplicates/nulls outside the filter, disabled
unique acceptance, columnstore duplicate rows and three populated partitions.
CONTRACT-032 reports each captured index as a source-addressable Avro loss. Two
independent Avro codecs accept the filtered duplicates rejected by SQL Server,
agreeing on 22 bytes. Source/query hashes accompany native evidence.

Validation passed: 13 SQL Server tests / 223 assertions, type checking, 168 JSON
Schema and 32 package audits, and Chromium 148 parity for two native recoveries,
two projections, isolated edits and exact unknown numeric content. Commands and
fixtures are listed in CONTRACT-031/032. This is focused evidence after the recorded
718-test full-suite baseline. General T-SQL ingestion/reconstruction, specialized
index catalogs and broader value conversion remain open. The full goal stays active.

### SQL Server catalog-to-DDL lowering

CONTRACT-037/US-031 AC8 add projectSqlServerToDdl and its complete policy/result
schema. Explicit alias, source-state, default-rowstore and reported-loss policies
produce reviewable statements with source paths, retained source and diagnostics.
Unsupported cases and strict loss policy produce no partial SQL. Native expressions
remain verbatim; the browser library never executes SQL.

Native SQL Server 2022 build 16.0.4295.3 executes generated DDL for three fresh
source captures: ten tables and 56 columns. Captured columns and constraints agree
after declared alias/system-name lowering. Source/generated behavior agrees for
exact identity, defaults, computed values, rowversion width, cascades, trust/disabled
checks and filtered/disabled uniqueness. The evidence separately observes lost
computed persistence, columnstore storage and partition placement, rather than
claiming full equivalence. Native tests exposed and resolved collation quoting and
fill-factor-default syntax differences.

Validation passed: 17 SQL Server tests / 340 assertions, type checking, 169 schema
and 32 package audits, native generated-schema execution, and Chromium parity for
three fixtures/six recoveries with strict blocking and candidate edits. Source/query/
generated-DDL fingerprints bind the native evidence; CONTRACT-037 records commands
and limits. This does not replace the older 718-test full-suite baseline. Native
execution of edited candidates, arbitrary T-SQL ingestion, complete physical
reconstruction and broader five-system transforms remain required. The goal stays
active and RDF expansion remains deferred.

### Native execution of edited SQL Server candidates

CONTRACT-037's candidate path now has native evidence. Six copied edits across
three fresh SQL Server 2022 candidate databases change length, description, default,
check predicate, filtered-index predicate and nullability. Recaptured metadata agrees
at every changed path. Native behavior confirms the changed default/length, check
threshold, reversed uniqueness filter and nullable column. Original captures remain
unchanged; implicit candidate generation stays blocked; unfamiliar vocabulary stays
in the retained candidate source without native interpretation.

Both UMF formats preserve each candidate projection and each fresh recapture.
Chromium independently matches six candidate and six recapture recoveries, alongside
the six baseline recoveries. All 18 SQL Server tests / 382 assertions and type
checking pass. ddl-oracle.json records candidate DDL hashes, edits, fresh captures
and behavior; generated candidate SQL is under fixtures/sqlserver/ddl/. The previous
candidate-native-evidence gap is closed for these examples. Arbitrary T-SQL ingestion,
complete physical reconstruction and broader priority-system transformations remain
required. The overall goal stays active; RDF expansion stays deferred.

### Avro-to-TableSpec projection and carrier cycle

CONTRACT-038 adds projectAvroToTableSpec with explicit per-field representations,
named-definition resolution, source-retained native metadata and a complete result
schema. It covers primitive carriers, enum/string, fixed/bytes text, valid decimal,
date and instant/local temporal declarations; complex fields require explicit
Avro-JSON-text representation. Reader defaults never become TableSpec defaults.
Unknown encoding/unsafe numeric interpretation blocks; unsupported mappings do not
produce targets. Table and field names follow the pinned TableSpec native model.

The existing recursive Order, named decimal dependency and temporal examples pass
source schema and target Pydantic checks. A five-field Avro → TableSpec → Avro cycle
recovers the original schema and two representative rows with equal binary/value
results in Apache Avro 1.12.0 and fastavro 1.12.2. Both also measure float64-to-float32
loss, reinforcing the distinction between core scalar family and native width.
Apache's local-timestamp interpretation warning remains recorded in evidence.

Validation passed: 5 focused tests / 81 assertions, type checking, 170 schema and
32 package audits, browser build and Chromium 148 checks for four sources/eight
recoveries and reverse projection. Pinned TableSpec models validate six target
recoveries; native helper observations cover basic carriers, not pipeline execution.
Commands and evidence are in CONTRACT-038. This is focused evidence after the old
718-test baseline. Complex/temporal row encoders and broader mappings among the five
priority systems remain open; the overall goal stays active and RDF stays deferred.

### Composed priority-system projections into TableSpec

CONTRACT-039 adds projectToTableSpecViaAvro for PostgreSQL, SQL Server and Parquet.
It validates explicit stage policies and retains original source, both stage results
and stage-qualified diagnostics. First- or second-stage blocking exposes no final
target while preserving completed intermediate evidence. Copy isolation and the
existing JSON structural limits cover the full composed result. No extra semantic
equivalence or value conversion is inferred from successful schema composition.

Four source cases generate 67 TableSpec columns. The native Pydantic model validates
all four outputs/eight recoveries; SQL Server's indexed case retains each index loss.
Chromium matches eight recoveries and eight blocking checks. Five focused tests /
152 assertions, type checking, 171 schema and 32 package audits, and browser build
pass. CONTRACT-039 records commands and stage evidence limits. This advances US-030
AC5 and FR-41 without replacing the older full-suite baseline or completing broader
native row conversion/integration requirements. The full goal remains active.

### Projection identifier and logical-annotation validation

Review exposed silent coercion in Avro→TableSpec decimal scale: explicit null was
treated as missing zero. It now defaults only for an absent property and requires
an integer for explicit scale. Temporal annotations require exact strings, preventing
array/string coercion and trailing-terminator matches. All five affected projection
directions now require absolute identifier matches in runtime and JSON Schema;
Parquet numeric override keys and composed downstream policy validation follow suit.

Regression evidence covers four line terminators, malformed scales/annotations,
unchanged source and valid prior projections. The 18 affected tests / 618 assertions,
type checking, 171 schema and 32 package audits, and browser build pass. Chromium
rejects 40 malformed names and blocks five logical bindings. Independent native
probes record that both Python Avro engines accept boolean false scale; UMF's explicit
JSON integer requirement rejects this coercion. Evidence and commands are in
CONTRACT-038. No new native semantic equivalence is claimed; the goal remains active.

### Exact temporal semantics in Avro core metadata

The projection boundary review revealed the same final-line-terminator issue in
Avro's core scalar derivation. CONTRACT-007 now requires an absolute match for all
six instant/local timestamp annotation names. Unknown spellings, array annotations
and wrong carriers remain unclassified while their full native metadata survives.
The existing logical-type edit guard remains conservative and is explicitly tested.

A 54-case matrix passes both UMF recovery formats in Bun and Chromium. Two pinned
native engines produce 108 observations and 216 recovery comparisons, with their
array-annotation rejection and local/nanosecond interpretation differences recorded.
Eleven focused metadata, dependency, projection and composition tests pass with
517 assertions; TypeScript checks pass. The browser also reruns the existing
26-field metadata corpus. This is additional scoped evidence after the older full
suite baseline, not complete temporal conformance or closure of the integration goal.

### Explicit Avro candidates for incompletely interpreted schemas

US-007-AC9 and CONTRACT-007 add proposeAvroNodeEdit plus a complete proposal JSON
Schema. The API retains original and candidate documents, exact replacement tree,
path/dependency selection and validation diagnostics. It allows authoring changes to
logical annotations, custom metadata and exact numeric defaults while keeping
conservative editing unchanged. Shared metadata synchronization rejects lost attached
field content; unknown representation fields and stale core metadata block proposals.

Five fixtures edit decimal scale, timestamp locality, unknown annotation spelling,
int64 reader default and a fixed-decimal dependency. Apache Avro 1.12.0 and fastavro
1.12.2 provide ten source/candidate comparisons and twenty candidate recovery checks.
They measure changed decimal meaning despite equal bytes and exact reader-default
resolution to 9223372036854775807. Native local-timestamp interpretation differences
remain recorded. No compatibility certification or row migration is implied.

All 18 Avro tests / 625 assertions pass, along with TypeScript checks, browser build
and the 172-schema/32-package audits. Chromium reproduces five proposals and ten
candidate recoveries while rerunning the 54-case temporal and 26-field metadata
matrices; no external requests or Node globals occur. Reproduction commands and
input-fingerprinted evidence are in CONTRACT-007. This advances edited native round
trips without closing broader priority-system integration work; the goal stays active.

### PostgreSQL candidate preservation before replacement

Raw-AST and catalog candidate edits previously allowed replacing a node containing
unknown tagged-representation fields, erasing that content before native export could
reject it. Both now check the encoding boundary before replacement. Catalog proposals
reuse native-capture export preflight, including stale-core checks. Native unknown
members remain preserved; callers can still retain all unfamiliar encoding content
through UMF JSON/YAML without authoring through it.

The new matrix covers 21 rejected root/leaf/disjoint changes, source immutability and
14 unknown-content recoveries. Chromium reproduces all cases and the existing 56-column
metadata recovery/valid edit. Focused checks cover 15 distinct tests / 169 assertions
across native syntax, catalog, metadata and edit preservation; TypeScript checks pass.
Native parser/deparser regressions pass; no live database regeneration of catalog
edits was added or claimed. CONTRACT-015 records reproduction/evidence. This closes
an unknown-content loss path; broader priority-system transforms remain unfinished.

### Embedded Arrow schema ingestion from Parquet

US-019-AC22 and CONTRACT-019 add getParquetArrowSchema plus a complete result JSON
Schema. The accessor retains the full Parquet source and exposes the optional embedded
IPC Message/Schema through the existing Arrow FlatBuffers extension. Absence, decoded
metadata and blocked interpretation remain distinct. Duplicate entries, malformed
base64, incorrect framing and body-bearing/non-schema messages cannot imply success.
Decoded metadata does not assert correspondence with physical fields or data pages.

PyArrow 21.0.0 fixtures measure large-list/list, duration/int64 and named-timezone/UTC
differences between stored-schema and physical-only reads. Four recovered/re-encoded
Arrow schemas, including detached field renames, match native schemas with metadata.
Parquet bytes are unchanged; coordinated embedded/physical rename remains unfinished.

Five focused tests cover 243 assertions across field metadata and embedded schemas.
Chromium passes 14 cases / 28 recoveries and four schema encodings, with zero external
requests and no Node globals. Native re-encoding checks, 173-schema/32-package audits,
TypeScript checks and browser build pass. CONTRACT-019 records commands and evidence.
No new core promotion occurred: the native counterexamples support keeping these
type refinements in their extensions. The wider integration goal remains active.

### Coordinated Parquet and embedded Arrow field rename

US-019-AC23 and CONTRACT-019 add renameParquetFieldWithArrowSchema and a complete
result/policy JSON Schema. Explicit physical index and Arrow positional path must have
matching native name components. Both declarations receive the rename while data-page
bytes, unrelated metadata and caller-owned UMF content remain intact. The required
preserve-and-report policy makes stale uninterpreted name references explicit. No
intermediate file is exposed; ambiguity and unsupported metadata/layouts block.

Eighteen examples rename six top-level/nested-struct fields across NONE/SNAPPY/GZIP,
two row groups per file, preserving large-list, duration and named timezone refinements.
PyArrow 21.0.0 validates schemas with metadata, values and inverse recovery for 54 rows;
Apache Thrift 0.22.0 independently limits wire changes to names, paths and embedded
Arrow bytes. Native evidence retains original-name references in custom metadata.

Two focused tests / 298 assertions, TypeScript checks, browser build and the
174-schema/32-package audits pass. Chromium matches 18 transforms, 36 UMF recoveries,
18 reverse transforms and six blocking controls, with no external requests or Node
globals. CONTRACT-019 records commands, fingerprinted native evidence and limits.
Nested LIST/MAP wrapper correspondence, automatic metadata-reference rewriting and
arbitrary schema/value migrations remain unfinished; the overall goal stays active.

### Nested LIST/MAP correspondence and native role-label limits

The coordinated rename now walks validated Parquet container roles alongside Arrow
List/LargeList/FixedSizeList, Map and Struct declarations. Ordinary record children
require matching names/positions/counts; explicit physical and Arrow indexes must
resolve to the same structural field. Reports preserve both native paths when they
differ. Optional parquetName restores distinct element labels during inverse edits;
ordinary record-field names still change together.

Five additional native cases cover fields inside large lists and map values, nullable
and empty containers, duplicate ordered map keys and separate item/element restoration.
PyArrow/Thrift verify 20 rows and inverse recovery. Raw IPC probes independently show
PyArrow normalizing Map key/value role names despite their changed FlatBuffers labels;
these counterexamples are retained and those role edits are blocked. Map-value
descendant edits succeed without weakening the native evidence.

Three focused tests / 349 assertions pass, including the prior 18-case regression.
Its native oracle still passes all 54 rows. Chromium adds five transforms, ten UMF
recoveries, five inverse transforms and four rejection checks. TypeScript checks,
browser build and 174-schema/32-package audits pass. CONTRACT-019 documents commands
and limitations. Unverified legacy-layout combinations, metadata-reference rewriting
and arbitrary type/value migrations remain open; the overall goal stays active.

### Native execution of edited PostgreSQL DDL

US-015-AC12 and CONTRACT-015 now bind six raw-AST edits to fresh server evidence.
Authored source and independent expected SQL differ in numeric type/default, text
length/nullability, check threshold, comment and partial-index predicate. The existing
candidate API preserves original SQL and unknown UMF context while regenerating the
edited AST. This adds evidence rather than a new catalog-to-DDL conversion API.

PostgreSQL 17.4 creates four isolated databases. Candidate and candidate-dump restoration
catalogs match the independently authored expected catalog. Thirty-two behavior checks
confirm exact identity values, changed acceptance/rejection boundaries, SQLSTATEs and
Unicode metadata. Four fresh captures survive eight UMF recoveries. The disposable
container was removed after the run; no existing database was changed.

Seven focused tests / 80 assertions and TypeScript checks pass. Chromium's pinned WASM
runtime reproduces six edits, two SQL recoveries and eight capture recoveries with no
external requests or Node globals. Evidence fingerprints input, generated SQL and the
catalog query; reproduction commands are in CONTRACT-015. In-place migration and
general edited-catalog reconstruction remain unfinished; the overall goal stays active.

### Embedded Arrow fidelity in Parquet projections

CONTRACT-035 now inspects optional embedded Arrow declarations before physical Parquet
lowering. Uninterpreted/ambiguous declarations block; decoded declarations get a general
not-projected issue plus specific duration, named-timezone and list-refinement losses.
Diagnostics identify the native metadata entry and decoded Arrow field without guessing
physical correspondence. Full source bytes remain retained through composed TableSpec
projections.

Stored-schema and physical-only fixtures produce identical Avro schemas. Eight native
codec comparisons confirm equal target bytes under an authored duration-carrier binding,
while source duration/list/timezone meanings differ. Chromium matches four source
recoveries, eleven embedded-schema blocks and the composed loss report. Seven focused
tests / 363 assertions and TypeScript checks pass, including the existing physical
projection corpus and composition regressions. No new core promotion occurred; equal
target encoding does not establish semantic equivalence. The overall goal stays active.

### TableSpec table metadata and split-file edits

CONTRACT-030 adds editTableSpecTable for copied metadata changes, namespace refresh
and explicit reference repair following column edits. Column replacement is prohibited.
Split export updates table.yaml while retaining untouched column/sidecar files and
shadowed inline columns. Original archives and attached core metadata remain in UMF;
native references are never guessed or automatically rewritten.

Pinned model/loader checks accept four recovered reference-repaired schemas and reject
two unrepaired renames. Four opaque-field recoveries retain native extra-field rejection;
the input is preserved rather than normalized into acceptance. Chromium reproduces four
table edits/eight recoveries alongside 26 monolithic and four earlier split recoveries.
Nine focused tests / 117 assertions, TypeScript checks and browser build pass. Fixture,
model and loader fingerprints bind the native evidence. Browser-native validation,
general reference rewriting and wider pipeline behavior remain unfinished; the goal
stays active.

### TableSpec-to-Avro table-level loss reporting

CONTRACT-033 now reports individual native table-member paths, including primary
keys, context dispatch and unknown metadata. Monolithic and split edited inputs
retain exact source values and strict-policy blocking. Three focused tests / 58
assertions and TypeScript checks pass. Chromium compares four complete projection
cases and four target recoveries with no external requests or Node globals.
Apache Avro 1.12.0 and fastavro 1.12.2 confirm four repeated-key/missing-context
acceptance counterexamples and the existing four schema recoveries. No native
TableSpec row validation, value conversion or new core equivalence is claimed.

### TableSpec programmatic table metadata access

`getTableSpecTable` now exposes a copied complete NativeJson table view, allowing
metadata consumers to inspect table-level keys, context and unknown qualifiers
without adapter-payload access. The Avro projection uses the public accessor.
Split source archives remain required for shadowed columns and sidecars. Existing
scalar families cover the ten scalar names in the pinned eleven-type model;
EMBEDDING remains non-scalar and no additional core equivalence is asserted.

Four focused tests / 77 assertions and TypeScript checks pass. Chromium checks two
metadata views / four recoveries, alongside 26 monolithic, four split and eight
table-edit recoveries. Exact numeric lexemes and caller mutation isolation are
verified. Native semantic validators, pipeline execution, general value conversion
and wider integration coverage remain unfinished.

### Accumulated priority regression

Ran all checked-in TableSpec, PostgreSQL, SQL Server, Avro and Parquet tests:
129 tests across 51 files, 6,980 assertions, zero failures (150.24 seconds).
The shared core and consumer suites add 34 tests across seven files and 586
assertions, zero failures. Typechecking, all 174 JSON Schema audits, all 32 package
audits and the browser/declaration build pass. The browser ESM is 9,668,704 bytes.

`fixtures/validation/priority-regression.json` records commands, both raw log
hashes and the post-run source fingerprint. No source/spec/test edits occurred
during these runs. This is an accumulated priority-system regression, not a fresh
full-repository run or a rerun of every standalone native/browser oracle. The
remaining extension subsets, general value transforms and all FR-41 consumer
acceptance requirements still govern completion.

### TableSpec edit and filename boundary corrections

Column edits now validate the entire changes mapping before enumeration, matching
table edits and preventing getter invocation or silent symbol/hidden-field loss.
Split column selection requires the exact `.yaml` suffix: newline-suffixed files
remain opaque sidecars, consistent with the native pathlib glob. Legitimate newline
characters within a basename continue to match. Special native object keys remain
ordinary preserved data.

Nine focused tests / 120 assertions and TypeScript checks pass. Chromium checks
seven filename cases, 18 rejected edit inputs and zero getter invocations alongside
the earlier TableSpec corpus. Independent Python pathlib agrees on two selected
column files and five preserved sidecars. The extension manifest now describes
implemented table access/edits and separately qualified projection contracts, removing
its stale claim that all projections remain open. The earlier accumulated regression
is retained as a fingerprinted historical run, not rerun for this bounded correction.

### SQL Server exact catalog integer interpretation

Fixed a capture-validation gap where JSON.parse could round an exact fractional
native token into an accepted integer ID/qualifier. Runtime validation now walks
schema-declared integer fields before catalog interpretation and requires exact
safe integers, retaining unknown native numeric content without coercion. Import
and proposed edits share the guard. Exact integer exponent spellings remain valid.

All SQL Server tests pass: 19 tests / 434 assertions across seven files. TypeScript
checks pass. Chromium reproduces 48 rejected imports/edits, four integer/unknown
metadata recoveries and the existing 32-column metadata checks. Python Decimal
independently verifies 24 boundary tokens. Existing native SQL Server execution
fixtures remain covered by regression assertions; no fresh live-server execution
is claimed for this lexical correction. General transforms and broader extension
requirements remain open.

### PostgreSQL exact catalog integer interpretation

Applied the exact integer guard to PostgreSQL capture validation before host-number
interpretation. Previously a fractional nativeType.dimensions token could underflow
to zero and incorrectly qualify a column as scalar. Version, position, dimensions,
modifier and other schema-declared integer fields now require exact interoperable
integers. Unknown native properties remain exact and unclassified. The shared
internal guard follows properties/items, local definition references and nullable
branches in the two owned catalog schemas; it is not a general JSON Schema engine
or promotion of database-specific metadata into core.

All PostgreSQL and SQL Server tests pass: 46 tests / 804 assertions across 16 files
(31.21 seconds). Chromium repeats 32 PostgreSQL and 48 SQL Server invalid import/edit
cases plus eight exact/unknown recoveries and the existing metadata/encoding checks.
Python Decimal independently checks 16 PostgreSQL tokens. TypeScript and the browser
ESM/declaration build pass (9,671,235 bytes). Raw regression output is in
fixtures/validation/catalog-integer-regression.log. No new live-database execution
or completion of broader transformation requirements is claimed.

### TableSpec projection exact numeric qualifiers

Fixed TableSpec-to-Avro interpretation of selected decimal precision/scale and
embedding dimension tokens. They now require exact interoperable integers before
host-number interpretation; unsupported tokens block with source-path diagnostics
and retain the complete source. Exact integer spellings still project. Avro-to-
TableSpec already uses exact numeric parsing; no symmetric code change was needed.

Six focused projection/chain tests pass (232 assertions), as does TypeScript.
Chromium compares 17 total projection results including 12 blocked numeric cases,
one exact decimal case and the previous four cases. Independent Python Decimal
checks confirm all 12 boundaries; Apache Avro/fastavro agree on binary and value
recovery for the exact positive decimal target. This does not implement native
TableSpec coercion or complete general instance conversion.

### Avro exact decimal scalar derivation

Removed host-number rounding from Avro precision/scale/fixed-size interpretation.
Unsupported exact numeric qualifiers no longer acquire a decimal core family;
source schemas and unknown numeric metadata remain recoverable. Exact integer
spellings retain classification. Named references, nullable unions and copied
candidate edits use the same derivation.

All Avro tests pass: 19 tests / 760 assertions across nine files (15.52 seconds).
TypeScript checks pass. Chromium reproduces 15 new cases / 30 recoveries alongside
existing field, temporal and candidate evidence. Apache Avro 1.12.0 and fastavro
1.12.2 preserve 30 parser observations across 60 recovered schemas, while independent
Decimal checks assess exact values. Native acceptance is not treated as proof of
exact semantics because native parsers may themselves round. No additional core
concept or general decimal value-conversion support is claimed.

### Published Avro native schema syntax

Added the previously missing native Avro JSON syntax description alongside the
existing UMF representation schema. `avroNativeSchema` is exported for consumers;
its generator covers all schema constructors, records/errors, names, field options,
enum uniqueness, fixed sizes and direct union restrictions while preserving open
metadata. It does not replace native name/default/logical validation or gate source
retention. Protocol, IDL and container coverage remains separate unfinished work.

The 238-assertion syntax test covers 62 cases including all 20 pinned upstream files.
Chromium reproduces 62 syntax decisions and 88 recoveries without Node globals or
external requests. Apache Avro 1.12.0 and fastavro 1.12.2 retain outcomes/warnings
through 176 recovery comparisons; differences from structural validation are recorded.
TypeScript checks and audits pass: 175 published JSON Schemas, 32 packages. This
advances the complete-schema deliverable without claiming all extension semantics
or the overall goal are complete.


### PostgreSQL Cardinality qualified binding acceptance

PostgreSQL 17.4 classification and explicit carrier projection pass qualified
acceptance after 70 refresh commands, 377 priority tests / 34,807
assertions across 122 files, and both existing conformance gates. See the
[acceptance record](../../../fixtures/validation/postgresql-cardinality-acceptance-evidence.json).
The binding retains paired native captures and author receipts, blocks losses in
strict mode, and reports array rank/bounds, item/value and JSONB representation
limits. Native-only reclassification does not reconstruct authored map intent.
SQL Server, Avro and Parquet Cardinality and the separate concept gate remain
unfinished. No native equivalence is claimed.


### SQL Server Cardinality qualified binding acceptance

SQL Server 16.0.4295.3 classification and explicit carrier projection pass qualified
acceptance after 72 refresh steps, 383 priority tests / 35,600
assertions across 124 files, and both existing conformance gates. See the
[acceptance record](../../../fixtures/validation/sqlserver-cardinality-acceptance-evidence.json).
Logical Fields retain the physical column family. Projection reports JSON item/value,
key-uniqueness and availability limits, with strict refusal and retained native/ideal
recovery. Avro, Parquet and the separate Cardinality gate remain unfinished.
No native equivalence is claimed.


### Avro Cardinality qualified binding acceptance

Avro 1.12.0 classification and explicit native-type projection pass qualified
acceptance after 74 refresh steps, 395 priority tests / 36,524
assertions across 127 files, and both existing conformance gates. See the
[acceptance record](../../../fixtures/validation/avro-cardinality-acceptance-evidence.json).
Nested item/value Fields, qualified native locations, strict/report losses and
fresh-native plus authored recovery have pinned Apache Avro/fastavro and Chromium
evidence. Codec data behavior remains separate: float narrowing, duplicate native
map entries and avsc's own `__proto__` loss are explicit counterexamples.
Parquet and the Cardinality admission/delivery gate remain unfinished.
No native equivalence is claimed.


### Parquet Cardinality qualified binding acceptance

The [acceptance record](../../../fixtures/validation/parquet-cardinality-acceptance-evidence.json) supersedes earlier Parquet acceptance-pending notes.
All 76 refresh steps pass, including 407 priority tests / 38,324
assertions across 131 files, followed by the separate Field and Nullability
gates. Native evidence uses PyArrow 21.0.0; browser evidence uses Chromium 148.

Run `bun scripts/core-ideals/cardinality-parquet-oracle.ts` and
`bun scripts/core-ideals/cardinality-parquet-browser.ts` with the configured
Chromium executable. Classification covers 120 cases, 152 native recoveries and
76 forged refusals. Projection covers 160 cases, 132 candidates, 28 strict blocks,
264 retained ideal recoveries, 264 fresh-native recoveries and 132 forged refusals.
PyArrow verifies 282 rows written independently under emitted schemas, with ten
explicit float narrowings. These are schema transforms and retained recovery,
not an implicit row converter. MAP uniqueness/non-string keys, legacy repetition,
wrappers, Arrow refinements and unavailable record associations remain qualified
or residualized. No native equivalence is claimed.

All five qualified bindings are now implemented. The separate Cardinality
admission/delivery conformance gate remains unfinished before facets proceed.


### Cardinality gate checkpoint

The [conformance record](../../../fixtures/validation/cardinality-conformance.json) supersedes earlier Cardinality admission/gate-pending
notes. Ideal admission passes the two-binding minimum; qualified delivery passes
all five priority bindings. Neither result claims native equivalence. Facets may
now proceed under TD-043 after its representation/version decision is amended
for the current 0.4.0 baseline; key follows the facets five-system gate.

`bun scripts/core-ideals/cardinality-conformance.ts` verifies current core/binding
acceptance and native/Chromium proof fingerprints, including every combined
five-system oracle/browser entrypoint. `bun test ./tests/core-ideals/cardinality-conformance.test.ts`
checks the gate's positive matrix and rejection of missing, stale, unsafe or failed
evidence. These checks replay current captured evidence; they do not rerun native
engines or authenticate receipts. The preceding 76-step Parquet acceptance refresh
supplies the unchanged native/browser baseline.

The gate exercises 508 authored cases and 696 native cases: 166 strict projection
blocks, 684 ideal recoveries and 932 native recoveries across JSON/YAML. All four
labels are covered in every binding. Unknown document/Field/reference metadata,
nested items, independent availability and native refinements remain recoverable.
Compositions use fresh schema imports for TableSpec, Avro and Parquet and retained
independent engine captures for SQL. Native-only classification cannot recover
unencoded author intent. SQL array bounds, TableSpec vector constraints, JSON and
Parquet MAP uniqueness/key-carrier losses remain explicit; a report candidate does
not establish enforcement. Existing float-narrowing and filtered/disabled-index
counterexamples remain binding constraints. Core 0.4.0 stays experimental.


### Facet candidate validation checkpoint

The candidate 0.5.0 JSON Schema and internal `validateFacetElement` validator now
have Bun and [Chromium 148 evidence](../../../fixtures/validation/core-facet-candidate-browser.json). Three focused tests pass with
887 assertions. The 99-case matrix covers nine scalar families, roles/container
conflicts, length units, decimal pairing/order, signed/unsigned integer widths,
maximum safe counts and retained unknown members/units. Browser checks recover
198 JSON/YAML values and check 18 numeric-token cases without host globals or
external requests. Accessors are refused without execution. Structural JSON Schema
and the additional scale/precision semantic check are distinguished explicitly.

Typechecking, the standard build and audits of 254 schemas / 42 packages pass.
The public browser bundle remains byte-identical to the accepted 0.4.0 build.
Reproduce with `bun test ./tests/core/facet-ideals.test.ts`,
`bun scripts/core-facet-schema.ts` and `bun scripts/core-facet-browser.ts`
(with the configured Chromium executable).

This is a candidate schema/internal-validator checkpoint. The public document API
still refuses 0.5.0. Explicit migration/rollback, facet authoring/inspection,
versioned existing operations and selection remain required before core-task
acceptance; all five native facet bindings and facet admission remain pending.
No new native enforcement or equivalence is claimed. Existing 0.4.0 gate evidence
is retained with documentation-only revalidation; it does not qualify facets.


### Facet core-task acceptance

The [core acceptance record](../../../fixtures/validation/facet-core-acceptance-evidence.json) supersedes the candidate-only checkpoint's
public-runtime limitations. Core 0.5.0 now validates declared facets, explicitly
migrates/rolls back 0.4.0 collisions, authors/inspects known and partial bounds,
verifies source-bound receipts and follows faceted item/value metadata in selection.
Kind/record-type v4, Nullability v3 and Cardinality v2 operations retain prior
receipt versions. Existing Cardinality native bindings explicitly refuse 0.5.0
rather than apply their 0.4.0 representation rules to facet declarations.

All 78 refresh steps pass: 420 priority tests / 39,482
assertions across 135 files, typechecking, 261 schemas, 42 extension
packages, browser build and qualified native/browser checks for existing Field,
Nullability and Cardinality bindings. Their three separate gates subsequently pass.
The scope is core plus the five priority systems, not a new full-repository baseline.

Chromium 148 checks 99 public validation cases, 62 valid-document recoveries,
18 migration/rollback recoveries, eight facet-author receipts, eight versioned
prior-operation receipts, four selection receipts and 15 refusals, with no host
globals or external requests. The separate facet-local matrix retains 198 metadata
recoveries and 18 exact-token checks. Reproduce with `bun scripts/core-facet-operations-browser.ts`
and `bun scripts/core-facet-browser.ts` using the configured Chromium executable.

This closes only the facet core task. All five native facet bindings, useful ideal
admission, the facet delivery gate and key remain required. No native facet
enforcement, general row conversion or native equivalence is claimed. The next
binding is TableSpec under the declared schema/runtime profiles; native refinements
and unknown numeric tokens must stay attached to any classification/projection.


### Qualified TableSpec facet binding

The [acceptance record](../../../fixtures/validation/tablespec-facets-acceptance-evidence.json) covers core 0.5.0 TableSpec facet
classification, authored projection, strict/report loss handling and verified
native/ideal recovery. It supersedes the earlier classification/projection
checkpoints' full-refresh limitation; their original evidence remains historical.

All 80 compatibility-refresh steps pass, including 438 priority tests,
47,122 assertions across 139 files, type checks,
264 schemas, 43 extension packages, browser build and qualified native/browser
checks for existing Field, Nullability and Cardinality bindings. Their three
separate conformance gates pass after evidence revalidation. This is the core and
five-priority-system scope, not a new full-repository baseline.

TableSpec evidence uses commit 647e8e566ad78b864282ec65c0b0b2237aa63084,
Pydantic 2.11.10, JSONSchema 4.25.1, Spark 4.0.1, GX 1.15.1, Java 21.0.2 and
Chromium 148. The browser matrices cover 1,216 native classification cases,
80 explicit-suite cases and 540 authored projection cases. Native checks validate
331 emitted documents and 104 facet representation claims; 11 emitted suite
rules undergo 63 value checks and two tolerance controls. Recovery preserves
native text/archives and full authored ideals, including unknown qualifiers.

Profiles keep declarations, raw/normalized generated schemas, baseline GX,
explicit GX suites and ingest casts separate. Explicit suites support zero length
and canonical widths within the signed-32-bit Spark carrier. Decimal precision
and scale remain consumer-specific. Missing facets do not inherit native defaults.
The binary64-to-binary32 narrowing counterexample remains an exact-input failure.
Unknown detail, unsupported encodings, shape conflicts and conversion losses
remain explicit. This does not qualify whole-pipeline execution or write policy.

This closes the TableSpec facet binding only. PostgreSQL, SQL Server, Avro and
Parquet facet bindings, the distinct facet ideal admission/five-system delivery
gate, and Key remain required. Native-equivalence graduation is not claimed.

### PostgreSQL facet classification

The public PostgreSQL facet classifier and source-recovery API now have operation
and extension-package schemas. Qualified non-null stored/new-value profiles keep
native checks, type modifiers and exact-input obligations distinct. Strict mode
blocks on loss; report mode retains explicit residuals. The classified Field
retains its complete native supplement, and verified receipts recover both exact
original catalog and supplement text. Author conflicts cannot be overwritten.

The [classification checkpoint](../../../fixtures/validation/facets-postgresql-classification-evidence.json)
records 21 Bun tests/520 assertions, typechecking, 267 schemas/44 packages and a
231-case Chromium/WASM matrix over 33 columns. Its 157 classified results recover
native sources; 74 requests block. Native facts derive from the pinned PostgreSQL
17.4 discovery, constraint and Datum oracles. Details and limitations are in
[the PostgreSQL evidence](evidence/postgresql-facet-discovery.md).

Authored facet projection, emitted-native/value qualification and a full prior
binding/concept-gate refresh remain required before PostgreSQL facet acceptance.
The public bundle changed, so earlier gates qualify their recorded snapshots.
SQL Server, Avro, Parquet, the five-system facet gate and Key remain required.

### PostgreSQL authored facet projection checkpoint

The authored projector and operation schema now complement public classification.
It generates qualified PostgreSQL types/functions/operators and explicit checked,
type-modifier or carrier-only encodings, preserving unprojected meaning in the
receipt. Both ideal recovery serializations are verified against exact native SQL.

The [projection record](../../../fixtures/validation/facets-postgresql-projection-evidence.json)
covers 232 cases, 145 emitted tables, 87 blocks, and 479 PostgreSQL 17.4 value
probes with 166 expected rejections. Native creation runs with deliberately
shadowed comparison operators. Chromium/WASM matches the matrix and performs
290 ideal recoveries, plus the unrepresentable-comment control. The focused
PostgreSQL suite passes 26 tests/1960 assertions and typechecking.

Next: aggregate the PostgreSQL facet workflows and run the complete compatibility
refresh and prior Field/Nullability/Cardinality gates. Do not close the binding
bead or claim facet admission from this projection checkpoint. SQL Server, Avro,
Parquet and Key remain in their existing dependency order.

### PostgreSQL facet composition checkpoint

All 145 emitted native schemas now pass composed classification and retained
recovery: 145 ideal recoveries and 145 exact native recoveries. The authored facets
return in 66 cases; 79 retain explicit residuals. Native inferred refinements remain
separate from author intent. All six aggregate Chromium workflows pass, including
refreshed public classification/projection and new bigint signature controls.
See [the composition record](../../../fixtures/validation/facets-postgresql-composition-evidence.json).

Next: execute the aggregate native runner during the full compatibility refresh,
then rerun the prior Field, Nullability and Cardinality gates. PostgreSQL facet
acceptance remains open; SQL Server, Avro, Parquet, the facet gate and Key retain
their ordered dependencies. No native equivalence or five-system facet admission
is claimed.


### Qualified PostgreSQL facet binding

The [acceptance record](../../../fixtures/validation/postgresql-facets-acceptance-evidence.json) qualifies core 0.5.0 PostgreSQL
facet classification, authored projection, strict/report residuals and retained
native/ideal recovery. It supersedes the earlier checkpoints' full-refresh
limitation; their original counts and fingerprints remain historical.

All 82 compatibility-refresh steps pass, including 466 priority tests,
49,198 assertions across 148 files, type checks,
268 schemas, 44 extension packages, browser builds and existing five-system
Field/Nullability/Cardinality native/browser workflows. Accepted TableSpec facets
are revalidated. The three prior concept gates pass after evidence refresh.
The initial PostgreSQL aggregate failed after its native stages passed because
its metadata reader expected the constraint proof's server version at the wrong
path. The reader was corrected; typechecking and the affected aggregate were
rerun. Earlier successful commands were retained because their implementation
inputs were unchanged. The failed attempt and adjustment are archived in the
acceptance record. This is the core and five-priority-system scope, not a
full-repository baseline.

Five native workflow stages use PostgreSQL 17.4/UTF8 and the qualified
little-endian Datum64 layout. The projector matrix has 232 cases: 145 emitted
schemas and 87 blocks. Emitted schemas pass 479 independent native value probes
with 166 expected rejections under an adversarial operator search path. All 145
schemas undergo composed classification and both retained recoveries; 66 recover
the authored facets and 79 retain explicit residuals. Inferred native refinements
remain separate from author intent.

All six Chromium 148 workflows pass against the public bundle and optional pinned
PostgreSQL WASM runtime. Public classification covers 231 cases with 157 exact
native recoveries and 74 blocks; projection covers 232 cases with 290 ideal
recoveries plus comment controls. Browser execution has no host globals or
external requests. Typed operation and extension schemas cover both directions.

Qualification is limited to supported direct scalar carriers and verified CHECK
expressions with explicit stored/new non-null scope. NOT VALID, unknown/custom
predicates, scalar-family conversion, character NUL/padding and input rounding
remain native refinements or residuals. Binding ceilings are length 10485760,
checked integer width 1024 and decimal precision 1000. Arbitrary SQL expression
conversion, source authentication and composition with earlier nullability or
cardinality operations are not claimed. The float-narrowing case remains an
exact-input failure. Native payloads are never removed by core labels.

This closes the PostgreSQL facet binding only. SQL Server, Avro and Parquet facet
bindings, the separate facet ideal admission/five-system delivery gate, and Key
remain required. No native-equivalence graduation is claimed.

### SQL Server facet native discovery

The SQL Server facet task is in progress. A pinned 16.0.4295.3 native corpus now
passes 86 probes, including 27 expected rejections, with 37 captured columns and
two catalog-tree serialization recoveries. It preserves byte/UTF-16 distinctions,
rounding and session settings, malformed string values, constraint enforcement
states and the filtered/disabled-index counterexamples. TD-043 now states the
binding rules these observations require before public schema/API authoring.

An internal browser-compatible native type decoder has seven Bun tests / 397
assertions and 37 Chromium cases, plus exact catalog recovery and unsafe-input
guards. It neither labels core facets nor changes the public bundle. See the
[discovery record](../../../fixtures/validation/facets-sqlserver-discovery-evidence.json)
and [native findings](evidence/sqlserver-facet-discovery.md).

Next: bounded CHECK interpretation, public classification/projection schemas and
implementations, retained recovery and full binding qualification. SQL Server
acceptance, Avro and Parquet facets, the five-system facet gate and Key remain open.
No native-equivalence graduation is claimed.

### SQL Server facet CHECK syntax checkpoint

Bounded internal CHECK inspection now retains full native expressions and exact
numeric tokens while distinguishing syntax recognition from enforcement. Ten of
the eleven captured CHECK definitions are recognized; the custom function is
refused. Disabled, untrusted and replication-specific recognized predicates still
require separate qualification. Unknown conjuncts and unsupported syntax refuse
atomically. Seven targeted Bun tests / 545 assertions, typechecking and 75 Chromium
cases pass; see the [checkpoint record](../../../fixtures/validation/facets-sqlserver-predicate-evidence.json).

Next: qualify type/column association, trust and enforcement scope, and collation;
then implement public schemas, classification/projection, retained recovery and
full acceptance. The SQL Server facet bead remains in progress. No new ideal
admission or equivalence graduation is claimed.

### SQL Server facet catalog interpretation checkpoint

The internal catalog interpreter now checks source profile/version/state, native
column association, direct type and CHECK enforcement flags before exposing scoped
native facts. All 37 discovery columns pass Chromium parity: six CHECKs are
interpreted, five retain explicit residuals, and two interpretations are limited
to ordinary checked writes. Twelve targeted Bun tests / 711 assertions and
typechecking pass. Native source remains unchanged. See the
[checkpoint record](../../../fixtures/validation/facets-sqlserver-constraints-evidence.json).

Next: public facet operation/extension schemas and classifier/projector, additional
native qualification for emitted target schemas and table-level association, both
retained recovery directions, and full binding acceptance. The SQL Server facet
bead remains in progress; Avro, Parquet, facet admission/delivery and Key remain
required. This checkpoint does not grant native equivalence.

### SQL Server public facet classification checkpoint

Core 0.5.0 now exports `classifySqlServerFacets`, its verification and
native-text recovery APIs, a closed operation schema and `umf.sqlserver.facets`
extension package. An explicit logical Field receives scoped integer-width,
decimal coefficient and binary-byte observations. Native columns remain unchanged;
strict/report losses, author conflicts, unknown content and exact-input failures
are explicit. Original native text recovers through both receipt serializations.

Validation: 67 tests / 5,213 assertions across 20 files, typechecking, 270 schemas,
45 packages, and 48 Chromium cases (41 classified, seven blocked, 82 native
recoveries) pass. The browser bundle is 10,921,873 bytes. Native discovery evidence
is reused; earlier accepted gates remain historical snapshots pending the full
refresh. See the [classification record](../../../fixtures/validation/facets-sqlserver-classification-evidence.json).

Next: authored SQL Server projection and its operation schema; independent native
qualification for emitted targets/table-level CHECK associations; ideal recovery
and composition; then full binding acceptance. SQL Server facets remain in
progress, followed by Avro, Parquet, the separate facet gate and Key. No native
equivalence or completed five-system facet delivery is claimed.

### SQL Server authored facet projection checkpoint

`projectFacetsToSqlServer` and `recoverFacetsFromSqlServer` now expose authored
facet DDL and retained ideal recovery under a closed operation schema. Carrier,
encoding and value-domain/exact-input obligations are explicit. Strict mode blocks
loss; report mode retains residuals for Unicode, padding, conversion, unsupported
facets, scalar-family changes and other unprojected meaning.

Independent SQL Server 16.0.4295.3 execution passes 145 emitted DDL targets from
238 cases (93 blocked), 27 value probes with ten expected rejections, quoted
identifier/Unicode description controls and two catalog recoveries. Chromium 148
passes all 238 cases with 290 retained ideal recoveries. Combined validation passes
45 tests / 2,723 assertions / 14 files, typechecking, 271 schemas and 45 packages.
See the [projection record](../../../fixtures/validation/facets-sqlserver-projection-evidence.json).

Next: emitted-capture classification composition and native-versus-authored facet
reconciliation, table-level CHECK qualification, then full compatibility refresh
and SQL Server facet binding acceptance. The bead remains in progress. Avro,
Parquet, separate facet admission/delivery and Key remain required; native
equivalence is unclaimed.

### SQL Server facet composed recovery checkpoint

All 145 emitted native schemas now compose with facet classification and both
retained source recoveries. Classification recovers authored facets directly in
57 cases; 88 have explicit residuals. Extra native facets remain inferred rather
than authored. The full aggregate catalog also recovers through JSON and YAML.
Zero-byte variable-string checks now classify as empty-string length zero.

Independent table-declaration association evidence passes 11 probes / three
expected rejections / 12 columns / two catalog recoveries. The pinned engine
assigns positive column IDs to single-column table-syntax CHECKs; cross-column
ID-zero predicates stay residuals with native counterexamples. Chromium passes
145 composed cases, 290 ideal and 290 native-view recoveries, two full-catalog
recoveries, and 24 association cases. Forty-eight Bun tests / 2,890 assertions /
16 files and typechecking pass. See the
[checkpoint record](../../../fixtures/validation/facets-sqlserver-composition-evidence.json).

Next: full priority compatibility refresh, earlier concept gates and SQL Server
facet binding acceptance. SQL Server remains in progress until those pass. Avro,
Parquet, facet admission/delivery and Key remain required. No native equivalence
is claimed; cross-column expression semantics remain explicit native residuals.


### Qualified SQL Server facet binding

The [acceptance record](../../../fixtures/validation/sqlserver-facets-acceptance-evidence.json) qualifies core 0.5.0 SQL Server
2022 16.0.4295.3 facet classification, authored projection, strict/report losses
and both retained recovery directions. It supersedes earlier checkpoints' pending
refresh status; their counts and fingerprints remain historical.

All 84 refresh steps pass, including 492 core/priority tests with
51,613 assertions across 156 files, typechecking,
271 schemas, 45 packages, browser builds and five-system native/browser checks.
Field, Nullability and Cardinality gates pass after evidence revalidation; accepted
TableSpec and PostgreSQL facets remain qualified. A metadata-only browser evidence
label was corrected before its stage ran, with a separate typecheck. Runtime
behavior and assertions were unchanged; the adjustment is archived.

Four native stages and six Chromium 148 workflows cover discovery, CHECK
association, 238 projection cases (145 emitted, 93 blocked), 27 projection value
probes, and composed native/ideal recovery. The 145 emitted cases recover authored
facets directly in 57 cases and retain explicit residuals in 88. Browser composition
passes 290 ideal and 290 native-view recoveries, two full-catalog recoveries and
24 scoped association cases. Extra native refinements do not become author intent.

Qualification covers direct supported scalar carriers, bounded CHECK expressions,
explicit non-null stored/ordinary-checked-write scopes and separately identified
logical Fields. Disabled, untrusted, replication-exempt, cross-column, Unicode,
padding, alias/computed and input-conversion distinctions stay explicit. The only
exact string bound inferred is the qualified zero-byte variable-string domain.
Arbitrary SQL conversion, complete inventory, source authentication and composition
with earlier native availability/container operations are not claimed.

This completes the SQL Server facet binding only. Avro, Parquet, the separate
facet ideal admission/delivery gate and Key remain required. Native equivalence
is unclaimed; native payloads and unknown content remain recoverable.

### Avro facet native discovery checkpoint

The Avro facet bead is now in progress. TD-043 separates declared domains,
validation, writer conversion, encoded coefficients and reader behavior before
public API/schema changes. Apache Avro Python 1.12.0 and fastavro 1.12.2 exercise
84 inputs, 168 writer cases, 109 successful writes and 218 cross-codec read
attempts. Fifty-four assertions retain reviewed counterexamples: float narrowing,
integer overflow acceptance differences, boolean conversion, unenforced width and
length metadata, fixed-zero bounds and decimal conversion/bypass differences.
Errors remain recorded rather than converted into passes.

`bun scripts/core-ideals/facets-avro-discovery.ts` passes the native assertions
and 34 JSON/YAML tree recoveries over 17 distinct schemas. `bun run typecheck`
passes. See the [discovery checkpoint](evidence/avro-facet-discovery.md).
No public library implementation, new facet package, browser qualification or
binding acceptance is claimed. Existing accepted profiles retain their earlier
snapshots while new source and governing-document changes accumulate.

Next: internal schema-domain interpretation with retained native refinements,
then complete public schemas and classification/projection, named/union/default
composition, both retained recovery directions, native/browser evidence and full
binding acceptance. Parquet, facet admission/delivery and Key remain required.

The internal Avro facet declaration interpreter now passes seven Bun tests / 332
assertions, typechecking and Chromium parity for all 84 discovery inputs. It
retains unknown native content, distinguishes exact fixed sizes from length
maxima and refuses unsafe metadata or unsupported logical meaning. The internal
browser bundle has no host globals or external requests. Public exports and
packages are unchanged; selected name/union resolution and public binding schemas,
classification/projection, both recovery directions and full acceptance remain
unfinished. See the [interpreter evidence](evidence/avro-facet-discovery.md#internal-declaration-interpreter).

Avro facet selection now retains named definitions/dependencies, ordered union
branches, explicit item paths and recursive reference locations. The separate
facet structural profile adds exact size-zero support without widening previous
Cardinality behavior. Sixteen Bun tests / 613 assertions, typechecking and ten
Chromium fixtures pass. Native verification records 20 parser outcomes, 32 sample
recoveries and 20 retained schema-tree recoveries. Duplicate-union disagreement
is preserved, not described as native parser consensus. See the
[selection checkpoint](evidence/avro-facet-discovery.md#native-selection-checkpoint).
Public schemas/classification/projection, both retained recovery directions and
full binding acceptance remain next; the Avro facet bead stays in progress.

Avro classification now has complete operation/extension schemas and
public classify/verify/recover APIs. It separates declared domains from native
writer profiles, requires explicit logical scalar identity and verified authored
provenance, and retains branch/dependency distinctions plus strict/report losses.
Chromium passes 148 cases (100 classified, 48 blocked), 200 original native-text
recoveries and forged/getter refusals. Schema audits pass 273 schemas / 46 packages;
the public and optional PostgreSQL browser builds pass. Scoped test/typecheck
logs and native-evidence limits are linked from the
[classification checkpoint](evidence/avro-facet-discovery.md#classification-checkpoint).
Next authored projection, native target/composition and ideal recovery, then full
compatibility refresh and binding acceptance. Earlier gates remain historical
snapshots after this public-bundle change. No ideal admission or native equivalence
is claimed; the Avro bead remains in progress.

Avro authored facet projection now has independent native and internal-browser
evidence: 558 cases, 388 emitted schemas, 170 refusals, 776 pinned-codec writes,
1,552 cross-codec reads and 776 Chromium ideal recoveries. Native discrepancies
remain explicit, including Apache's ignored local-timestamp annotation. See the
[projection checkpoint](evidence/avro-facet-discovery.md#authored-projection-native-and-browser-checkpoint).
Composition, public integration and full compatibility acceptance remain next;
the Avro bead stays in progress and package export support is not yet claimed.

Avro facet projection is now public and its package declares export
support. Native re-import/classification composition passes for 388 targets:
776 ideal and 776 native-text recoveries, 76 directly recovered nonempty authored
facet sets, 150 explicit residual cases and 162 facetless controls. Public
Chromium parity covers all 558 projection cases and both recovery directions.
See the [public composition checkpoint](evidence/avro-facet-discovery.md#public-projection-and-composition-checkpoint).
Full compatibility and prior concept-gate refresh remain required before closing
the Avro binding. Facet admission and native equivalence are not claimed.


Avro compatibility verification has completed the 85 native/browser refresh stages
and a priority regression of 515 tests / 52,275 assertions across 160 files with
zero failures. The earlier full-repository run retained three evidence-gate
failures, which require the separate refreshed Field/Nullability/Cardinality
gates before acceptance. A descriptive package-status correction also requires
rebuilding and rechecking the browser evidence. The
[Avro evidence record](evidence/avro-facet-discovery.md) records the final outcome;
these intermediate results alone do not close the binding.

## Facet gate acceptance checkpoint

Facets now pass the separate ideal-admission and qualified five-system delivery gate. Native equivalence remains unclaimed; native payloads and unknown extension content remain attached. Key is the next ordered concept. See the
[admission evidence](evidence/facet-gate-admission.md) for exact counts, qualified versions, retained
failures and scope limits. Earlier pending checkpoints above remain historical.

## Core Key candidate checkpoint

Facet admission/delivery has passed. The integrated plural-key plan now governs
Key. 0.6.0 candidate schema and portable validation define explicit
Record membership, primary/alternate key identity and required singular equality
components. Bun and Chromium cover 54 candidate cases and metadata recovery;
public APIs, tuple encoding, migration and native bindings remain pending. See the
[implementation evidence](evidence/key-core-implementation.md). Earlier native
qualification remains historical until the integrated library's compatibility
refresh; the Key core bead stays in progress.

Core Key exact tuple encoding now has internal Bun/Chromium evidence: 58 golden
and boundary cases, 52 browser receipt recoveries, rejection of rounding and
forged framing, and explicit resource limits. The full Key/tuple/Facet candidate
regression passes 12 tests / 1,478 assertions. See the
[tuple checkpoint](evidence/key-core-implementation.md#exact-tuple-encoding-candidate).
Public version activation, authoring, migration, versioned existing APIs and native
Key bindings remain required before core-task acceptance and admission.

Core Key explicit migration/rollback now has internal Bun/Chromium evidence:
90 archived element-member collisions and both serialization directions preserve
original and later envelopes separately. The combined candidate regression passes
16 tests / 1,747 assertions; typechecking and 281 schemas / 48 packages pass.
See the [transition checkpoint](evidence/key-core-implementation.md#explicit-key-migration-and-rollback-candidate).
Public activation, authoring and versioned operations are next; the Key core task
and all five native bindings remain unfinished.


Core Key public integration now has focused Bun and public Chromium evidence:
0.6.0 validation/serialization, membership/key authoring and inspection, stable-ID
lookup, migration/rollback, exact tuple encoding, versioned earlier operations
and selection are exported. The exact-file core suite passes 95 tests / 3,424
assertions; typechecking, public build and 288 schemas / 48 packages pass.
See the [public integration checkpoint](evidence/key-core-implementation.md#public-key-integration-checkpoint).
The broader regression and fresh native/browser compatibility qualification
remain required before core-task acceptance. All five Key bindings and their
separate ideal-admission gate remain unfinished; no native equivalence is claimed.


Core Key task acceptance now passes for 0.6.0 after the complete
native/browser compatibility refresh and all four prior concept gates. The full
repository test inventory contains 329 files: 324 regression files passed 1,213
tests / 113,170 assertions; five separately executed gate/evidence files passed
ten tests / 159 assertions. All 92 refresh commands, typechecking, the public
build and 288 schemas / 48 packages pass. Named-key/membership authoring, lookup,
exact tuple bytes, collision-preserving migration/rollback and versioned prior
operations retain unknown content and browser parity. See the
[core acceptance record](../../../fixtures/validation/key-core-acceptance-evidence.json).
This closes only the core implementation task. The five native Key binding tasks
and their separate admission/delivery gate remain open; native equivalence is
unclaimed. Older native binding qualifications retain their published profiles.


TableSpec Key binding acceptance now passes for pinned native declarations and
explicit authored projection with per-key residuals. The scoped TableSpec/core
compatibility run passes 226 tests / 21,024 assertions across 43 files; twelve
emitted schemas pass pinned native model/schema checks, and Chromium verifies
both retained recovery directions and strict/report refusals. Runtime uniqueness
and native equivalence remain unclaimed. See the
[TableSpec Key acceptance](evidence/tablespec-key-acceptance.md).
PostgreSQL, SQL Server, Avro and Parquet Key binding tasks remain open, followed
by the separate Key ideal-admission/all-five delivery gate. Historical earlier
concept gates retain their own execution scope; this task does not refresh them.


PostgreSQL Key binding acceptance now passes for PostgreSQL 17.4 catalog/DDL
profiles: correlated index observations never invent authored identity; explicit
primary/alternate constraints retain stable-ID and domain residuals. Unknown
selected key/member/facet qualifiers cannot claim exact equality. The scoped
PostgreSQL/core compatibility run passes 260 tests / 8,972 assertions across
57 files. Twenty projection cases include seventeen native tables, 137 insertion
probes and Chromium parity with 34 ideal and 34 native SQL recoveries. All 53
native/browser source fingerprints match; typechecking, browser/WASM builds and
297 schemas / 50 packages pass. See the
[PostgreSQL Key acceptance](evidence/postgresql-key-acceptance.md).
This closes only the PostgreSQL binding task. SQL Server, Avro and Parquet Key
bindings and the separate Key admission/all-five delivery gate remain open.
Historical conformance gates retain their original scope; native equivalence
and arbitrary SQL input conversion are not claimed.


SQL Server Key binding acceptance now passes for SQL Server 2022 16.0.4295.3.
Native observations preserve conditional/disabled enforcement and padding
counterexamples without inventing author identity. Authored projection retains
explicit physical encodings, session preconditions, stable-ID and domain residuals.
The generated-DDL oracle passes 73 probes on 19 tables, verifies 39 constraints
and exercises the accepted primary/alternate byte limits. Chromium verifies
38 ideal recoveries, two native archive recoveries and strict/forged/stale refusals.
The [SQL Server Key acceptance](evidence/sqlserver-key-acceptance.md) records
the scoped core/SQL Server regression command and source fingerprints.
Avro and Parquet bindings remain before the separate Key admission/all-five gate.
Earlier conformance gates retain their own execution scope; no native equivalence
or exact arbitrary-input conversion is claimed.


Avro Key binding acceptance passes with Apache Avro 1.12.0 and fastavro 1.12.2.
Native record observations never invent keys; explicit authored scalar projection
retains each primary/alternate identity and enforcement obligation separately.
The scoped Avro/core compatibility command passes 228 tests / 10,168 assertions
across 54 files. Generated schemas pass 32 writer cases, 64 cross-reads and 63
missing/null refusals. Fastavro's boolean null-to-false coercion remains an explicit
reported loss. Chromium verifies 26 native archive recoveries, 32 ideal recoveries
and strict/forged/stale refusals. See the
[Avro Key acceptance](evidence/avro-key-acceptance.md) for fingerprints and limits.
Parquet remains before the separate Key admission/all-five gate. Avro does not
enforce collection uniqueness; successful encoding is not native equivalence.


Parquet Key binding acceptance passes with PyArrow 21.0.0 and the pinned
parquet-format definition. Native observations retain original bytes and never
infer authored identity; generated required scalar schemas retain each key as
an explicit identity/enforcement residual. The scoped Parquet/core regression
passes 253 tests / 18,469 assertions across 64 files. Native checks cover 21
generated schemas and duplicate write/read cases, 21 required-null refusals
and twelve integer-input truncations. Chromium verifies fourteen classified
source recoveries, two blocked-source recoveries and 42 authored ideal recoveries.
All 63 native/browser fingerprints match; typechecking, browser build and
306 schemas / 53 packages pass. See
[Parquet Key acceptance](evidence/parquet-key-acceptance.md).
All five individual Key binding tasks now have qualified acceptance evidence.
The separate Key ideal-admission/all-five gate remains open; collection
uniqueness in Parquet and native equivalence are not claimed.


## Key admission and qualified five-system delivery evidence

Key ideal admission and five-system delivery now pass as separate results.
PostgreSQL and SQL Server provide useful nonempty stored-value enforcement
witnesses; TableSpec, Avro and Parquet retain explicit identity residuals.
The gate covers 118 authored cases, 85 emitted targets, 170 ideal recoveries,
178 native recoveries and twenty shared identity/ownership conflict refusals.
Fresh native/browser qualification, negative evidence checks, core tests,
typechecking and schema/package audits pass. Native equivalence remains
unclaimed; source payloads and unknown semantics remain attached. See the
[Key gate admission record](evidence/key-gate-admission.md) for commands, versions, profiles and limits.


## Relationship 0.7.0 candidate validation checkpoint

Following the accepted Key gate, TD-045 now stages the 0.7.0 relationship
envelope. `spec/core/relationship-document.schema.json` and
`validateRelationshipCandidate` validate exact keyed endpoints, stable target
Key IDs, endpoint/name uniqueness, inverse presentation collisions, independent
participation bounds, directed ownership and keyed association Records.
Future qualifiers and lifecycle values remain uninterpreted; older envelopes
retain relationship-shaped unknown content without adopting it.

The authored corpus includes the six original shapes plus alternate keys,
bounded participation and Enrollment with its own key and grade Field. Bun
passes three tests / 242 assertions. Chromium matches all 35 cases (15 accepted,
20 rejected), completes 70 JSON/YAML recoveries and invokes no getters. See
[the candidate browser record](../../../fixtures/validation/core-relationship-candidate-browser.json).
Typechecking, the browser build and 307-schema / 53-package audits pass. This
checkpoint does not qualify public 0.7.0 integration, migration/rollback,
authoring operations, native bindings or relationship ideal admission.


### Relationship candidate migration and rollback checkpoint

The explicit 0.6.0-to-0.7.0 transition now archives every module-level
`relationships` collision, including valid-looking legacy values. Unrelated
document/element members, references and native extension content remain intact.
Rollback recomputes the upgrade receipt, validates current semantics/identity,
restores the exact original envelope and retains the entire current candidate
separately, including later relationship assertions and native edits. Transition
verification rejects changed receipts without claiming authentication.

Candidate and transition tests pass seven tests / 349 assertions. Chromium
verifies seven transition cases, fourteen serialized rollback recoveries and
22 refusals; the 35-case candidate browser matrix also passes again. See the
[transition browser record](../../../fixtures/validation/core-relationship-transition-browser.json).
Typechecking, build and 308-schema / 53-package audits pass. Public authoring,
inspection, selection/versioned operation integration and core-task acceptance
remain unfinished; this checkpoint does not claim native relationship admission.


### Relationship candidate authoring and inspection checkpoint

`declareCoreRelationship`, `inspectCoreRelationships`, `lookupCoreRelationship`
and receipt verification now operate on the explicit candidate profile. The
complete operation schema retains copied source, diagnostics and provenance.
Stable IDs survive presentation edits and endpoint-set reordering; endpoint/key,
direction or association Record reassignment rejects. Unknown qualifiers survive
by identity and block participation/lifecycle changes. Future lifecycle values
remain inspectable without being adopted by authoring. Inspection does not
authenticate author intent; verification recomputes the receipt and current
source/target context. Native bindings and their residuals remain separate.

Five Bun tests pass 157 assertions. Chromium verifies thirteen operation cases,
78 serialized receipt recoveries and 41 refusals with no getters or host globals.
See the [operations browser record](../../../fixtures/validation/core-relationship-operations-browser.json).
Typechecking, build and 309-schema / 53-package audits pass. Public 0.7.0
validation/serialization, earlier versioned operations, selection and complete
core-task acceptance remain before the first native relationship binding.


### Public relationship 0.7.0 integration checkpoint

Public Document validation/serialization and relationship exports now support
0.7.0. Extension validators receive the complete relationship-bearing document.
Kind, record-type, availability, cardinality, facets, Key/member and tuple
operations have new receipt versions; older schemas and interpretation remain
unchanged. Edits that invalidate keyed endpoints reject atomically. Element
selection retains the full relationship context and its explicitly stated
element-dependency traversal scope; it does not infer relationship navigation.

All 114 core tests pass across 24 files (3,978 assertions), including updated
unsupported-version probes at 0.8.0. Public Chromium checks pass thirteen
relationship cases, 78 receipt recoveries and 43 refusal checks, plus versioned
operations and public serialization. Candidate, transition and operation browser
evidence is refreshed. Typechecking, build and 317 schemas / 53 packages pass.
See the [public integration record](../../../fixtures/validation/relationship-public-integration.json).
Relationship selection/navigation and broad native/adapter compatibility refresh
remain before core-task acceptance; no relationship binding admission is claimed.


### Relationship metadata selection checkpoint

Public `selectCoreRelationships` now filters by exact module/relationship ID,
name and source/target Record identity, preserving full source context. Each
entry includes exact Record/target Key paths and a separate keyed association
Record reference. Forward/reverse presentation metadata respects directed,
inverse and undirected declarations without constructing instance edges or
expanding endpoint sets. Recomputed receipts detect forged paths and filters.
The existing element traversal scope is unchanged.

All 118 core tests pass across 25 files (4,116 assertions). Chromium's public
13-case matrix passes 78 operation recoveries, 26 relationship-selection
recoveries and 44 refusals. Typechecking, build and 318-schema / 53-package
audits pass. The native/browser compatibility replay and subsequent adapter
regression remain before core-task acceptance.


### Relationship name-scope correction

Commit `842727cb` corrects CONTRACT-041 forward-name validation: names are
unique within their containing module, so assertions in different modules may
use the same forward name on the same source Record. Inverse presentation
collisions still reject across modules. Two corpus cases exercise the distinction.
All 118 core tests pass across 25 files (4,152 assertions); see the
[name-scope regression record](../../../fixtures/validation/relationship-name-scope-regression.json).
Typechecking, the browser build and 318-schema / 53-package audits also pass.
The incomplete compatibility run was deliberately cancelled after this source
correction; a fresh 114-command replay is required before broad regression and
the seven separate conformance/evidence test files. Core-task acceptance and
relationship binding admission remain unclaimed.

### Relationship core implementation acceptance

The 0.7.0 core implementation task `umf-a8beb12a` is accepted.
The fresh compatibility replay passed all 114 commands, including typechecking,
the browser build and the 318-schema / 53-package audit. The full regression
passed 1,481 tests and 116,628 assertions across 345 files. All five existing
concept conformance commands and seven separate gate/evidence test files also
passed: 13 tests and 186 assertions. Together these cover all 352 test files,
with 1,494 tests, 116,814 assertions and zero failures.

Chromium 148 verifies 37 candidate cases, seven transition cases and fourteen
operation/public cases, including 28 relationship-selection recoveries. Unknown
qualifiers, old-member collisions, stable endpoint/Key identities, atomic
refusals and module-scoped forward names retain their specified behavior.
The acceptance audit verifies the recorded source, test-input and execution-log
fingerprints. See the [core acceptance record](../../../fixtures/validation/relationship-core-acceptance-evidence.json)
and [separate gate results](../../../fixtures/validation/relationship-refresh/conformance-runs.json).

The replay preserves its initial TableSpec Spark failure under the default Java
runtime. After source verification, the failed step and remaining commands passed
with OpenJDK 21.0.2; successful earlier steps were retained. Historical acceptance
counts remain historical, with explicit links to this fresh revalidation.

This accepts core schema, public operations, metadata selection and migration
work only. US-045 remains incomplete: TableSpec, PostgreSQL, SQL Server, Avro
and Parquet relationship bindings, their recoveries/residuals and the separate
two-system admission/all-five delivery gates remain queued. GraphQL/RDF/LinkML
are additional profiles. No native-equivalence claim is made. TableSpec binding
`umf-95881098` is the next priority relationship implementation.

### TableSpec relationship carrier discovery

Work on `umf-95881098` has started. Twenty pinned TableSpec model/schema
probes cover foreign keys, outgoing multiplicity metadata, composite joins,
expressions, lookup joins, reverse metadata and unknown members. Both native
interfaces accept nineteen cases and reject an out-of-range confidence value.
They accept missing endpoint columns/tables, duplicate foreign keys, malformed
or contradictory multiplicity strings and simultaneous lookup/expression
declarations. Native metadata validation therefore cannot establish endpoint
resolution, coherent UMF participation bounds or execution enforcement.

Native model dumps discard unknown nested relationship members. The UMF
archive preserves those original members, including native-invalid metadata;
22 Bun tests pass 96 assertions for JSON/YAML recovery, absence of inferred
authored relationships, and exact split-bundle/sidecar recovery. Typechecking
passes. See the [native discovery record](../../../fixtures/validation/relationship-tablespec-discovery-native.json).

This checkpoint supplies counterexamples, not a relationship binding. The
classification/projection APIs, complete extension/receipt schemas, strict/report
losses, both composed recoveries and Chromium evidence remain required before
TableSpec binding acceptance. Source-native multiplicity strings and join
expressions must remain attached even when a supported subset is classified.

### TableSpec relationship classification checkpoint

The public classification/verification/native-recovery API and the complete
`umf.tablespec.relationships` package/receipt schemas are implemented under
TD-045. Native observations retain raw refinements and source paths, resolve
only local outward source columns and never invent target Key identity or
authored relationship intent. Strict mode blocks unresolved meaning; report
mode retains it alongside the complete copied source. Existing authored 0.7
relationships remain unchanged.

Discovery and classification tests pass together: 47 tests, 339 assertions,
zero failures. Chromium 148 passes 22 classification cases, 44 source recoveries,
19 strict blocks and 22 each forged/stale receipt refusals, with no getter calls
or external requests. Typechecking, build and all 320 schemas / 54 packages pass.
See the [browser record](../../../fixtures/validation/relationship-tablespec-classification-browser.json).
Authored projection, composed ideal/native recovery and full binding acceptance
remain before closing `umf-95881098`; no admission or equivalence is claimed.

### TableSpec authored projection contract

TD-045 now specifies the `outgoing-metadata` operation's verified author input,
explicit native source/target tables, ordered target-Key column pairs,
source-qualified residuals and recomputed recovery. Heterogeneous endpoint sets
and separately keyed association Records receive explicit refusals in this
profile; no endpoint or association attribute may be silently discarded.
The complete planned receipt/request schema is
`spec/core/relationship-tablespec-projection.schema.json`, generated by
`scripts/core-ideals/relationship-tablespec-projection-schema.ts`.
All 321 JSON schemas and 54 packages pass the structural audit; typechecking
passes. This is an executable schema contract, not an implemented projection or
native acceptance claim. Runtime implementation, authored corpus, native and
Chromium composition evidence remain the next work on `umf-95881098`.

### TableSpec authored projection implementation checkpoint

The outgoing-metadata runtime and public verification/recovery APIs implement
the preceding contract. The 36-case strict/report matrix projects twelve
complete carriers and blocks twenty-four cases. All twelve emitted carriers
pass the pinned native model/schema, with ordered composite column pairs,
multiplicity metadata and preservation of unrelated native content checked
independently. The API retains the logical document, author receipt and both
original native sources; it does not infer physical layout or native enforcement.

All 84 discovery/classification/projection tests pass 631 assertions across three
files. Chromium passes 36 projection cases, 24 ideal recoveries, 24 original
native source-pair recoveries, 24 fresh-import/classification recoveries and
24 forged/stale refusals, with no getters or external requests. The 22-case
classification browser proof is also refreshed. Typecheck, build and
321-schema / 54-package audits pass. See the
[projection checkpoint](../../../fixtures/validation/relationship-tablespec-projection-checkpoint.json).
Binding acceptance remains open pending its complete acceptance audit and wider
compatibility verification. Relationship admission and other target bindings
remain separate work.

### TableSpec projection review corrections

The projection review found that an unknown-qualifier residual retained the
whole relationship instead of the value at its diagnostic path. Residuals now
resolve that exact value, including escaped JSON Pointer segments. It also
identified native tables whose checked schema accepts missing primary-key or
context columns, or an embedding dimension on a non-embedding column, while
the pinned runtime model rejects them. The projection blocks these cases and
retains both original native sources. Independent native probes confirm all
three schema/runtime disagreements.

The expanded 42-case projection matrix has twelve emitted carriers and thirty
blocks. All 91 TableSpec discovery/classification/projection tests pass 663
assertions. Chromium confirms the expanded matrix and the same 24 recoveries
in each composed direction; the classification browser proof is refreshed.
Typechecking and build pass. The projection checkpoint retains the earlier
execution counts in its history. Remaining native model validators, including
source configuration and domain-specific column checks, still need review
before broader binding acceptance; checked-schema acceptance alone cannot
establish native runtime acceptance for arbitrary supplied tables.

### TableSpec source-configuration checks

The projection now checks the pinned runtime's JDBC table/query exclusivity,
JSON projection coverage/duplicates/nonblank paths, and derivation candidate
column-or-expression requirement. JSON path whitespace follows Python's native
strip set, including its control-character differences from JavaScript trim.
Six additional native probes demonstrate schema-accepted/runtime-rejected
inputs; valid JDBC table/query, complete JSON projection and expression
derivation controls remain projectable. The original configuration stays in
the retained native archive and is never executed by UMF.

The matrix now has 62 strict/report cases: sixteen emitted carriers and
forty-six explicit blocks. All sixteen carriers pass the pinned model/schema;
nine native schema/runtime disagreements are pinned. All 111 TableSpec tests
pass 799 assertions. Chromium verifies 32 recoveries in each composed direction
and 32 forged/stale refusals, alongside the refreshed classification suite.
Typecheck and build pass. The checkpoint retains prior execution history.
Domain-type compatibility still depends on the native registry, whose source
and expected-type mapping must be pinned before that remaining validator can
be qualified. Full binding acceptance and broader compatibility remain open.

### Pinned TableSpec domain-type compatibility

The remaining domain registry dependency is pinned to the same TableSpec commit
as the model. `native/tablespec/relationship-runtime/sources.json` records the
registry Python source and YAML catalog hashes. A native oracle verifies the
installed registry matches those files and derives the portable expected-type
mapping. All 42 registered domains are covered: six have DATE, TIMESTAMP or
INTEGER constraints; the others impose no base-type requirement. An unknown
domain control is retained without invented semantics.

The projection applies the native model's compatibility rules, including its
formatted-string exception, to supplied source and target columns. Domain names
and formats remain native metadata; this does not promote domain semantics,
validate data values or execute conversions. Six incompatible-domain cases join
the earlier nine schema/runtime disagreement probes.

The expanded matrix has 172 cases: 65 emitted carriers and 107 explicit blocks.
All 65 pass the pinned native model/schema. The three TableSpec test files pass
221 tests and 1,790 assertions. Chromium verifies 130 ideal recoveries, 130
original-native source-pair recoveries, 130 fresh-import/classification recoveries
and 130 forged/stale refusals; classification parity is also refreshed.
Typechecking and build pass. The projection checkpoint retains previous
execution history. Broader compatibility and the final binding acceptance audit
remain required before closing `umf-95881098`.

### TableSpec relationship binding acceptance

`umf-95881098` passes qualified acceptance for declared-metadata classification
and authored outgoing-metadata projection under TD-045. Native observations
remain separate from author intent; strict mode blocks unfulfilled obligations
and report mode retains each loss alongside the complete native carrier.
The 172-case matrix includes 65 native-accepted carriers and 107 explicit blocks.
Chromium verifies 130 recoveries in each composed direction and 130 forged/stale
refusals. All 221 relationship tests pass within the full regression.

The fresh compatibility replay passes all 118 commands. Regression passes 1,702
tests / 118,418 assertions across 348 files; five concept gates and seven separate
conformance/evidence test files also pass. Combined verification is 1,715 tests /
118,604 assertions across all 355 test files, with zero failures. Typechecking,
browser builds, 321 schemas and 54 extension packages pass. Source, test and log
fingerprints were verified before acceptance. See the
[acceptance record](../../../fixtures/validation/relationship-tablespec-acceptance-evidence.json).

This acceptance covers metadata carriers and retained recovery, not referential
enforcement, join execution or relationship ideal admission. Heterogeneous
endpoints and keyed association Records remain explicit profile refusals.
PostgreSQL, SQL Server, Avro and Parquet relationship bindings and the separate
relationship admission/delivery gates remain open. Earlier checkpoint counts
and acceptance records retain their historical scope; the new replay and gate
logs record the current execution.

### Avro relationship native discovery

The next ready relationship binding is Avro (`umf-c81cfc9c`); PostgreSQL and
SQL Server remain dependent on the physical-binding ID migration. Ten synthetic
schemas exercise named reuse, nested values, recursive arrays, nullable recursion,
heterogeneous unions, namespace distinctions, dangling ID metadata, unresolved
and forward names, and missing required record values. Apache Avro 1.12.0 and
fastavro 1.12.2 produce twenty parser outcomes: four parse refusals and two
write refusals. All 28 cross-codec reads reproduce the supplied values.

Repeated IDs with different nested content, empty child arrays annotated with a
custom minimum, and dangling scalar IDs carrying relationship metadata all
encode successfully. These are counterexamples to inferring record identity,
participation enforcement or graph associations from named schema references
and custom metadata. Both codecs reject unresolved and forward type names.

Twelve Bun tests pass 202 assertions, covering JSON/YAML native-tree recovery,
unknown metadata, exact number lexemes and named dependencies without inferred
authored relationships. Typechecking passes. The existing Avro adapter preserves
native structure and number tokens, not original whitespace; the forthcoming
relationship receipt must retain the original source text separately. See
[the native evidence](../../../fixtures/validation/relationship-avro-discovery-native.json).
Classification/projection APIs and schemas, authored carriers and residuals,
composed browser evidence and binding acceptance remain required.

### Avro relationship classification checkpoint

`classifyAvroRelationships`, verification and exact original-archive recovery
are implemented with a complete `umf.avro.relationships` package and receipt
schema. The schema-structure profile observes record declarations, named-type
tokens, unions, arrays and maps without inferring authored relationships or
certifying native name resolution. Unknown metadata is retained without being
walked as schema grammar. Strict mode blocks interpretation losses; report mode
retains source-qualified tagged-node residuals and original schema/dependency
texts. Conflicting content, stale targets, forged receipts and getters refuse.

The discovery and classification suites pass 28 Bun tests / 402 assertions.
They cover core envelopes 0.1 through 0.7, metadata lookalikes, enum/fixed reuse,
exact numeric lexemes, invalid native-name counterexamples and package payload
validation. Chromium checks eleven cases, 22 JSON/YAML archive recoveries,
eleven strict blocks and eleven forged-receipt refusals with no external
requests. Typechecking and browser build pass. See
[the browser record](../../../fixtures/validation/relationship-avro-browser.json).

This is classification evidence only. Authored carriers, obligation-specific
projection residuals, composed ideal recovery, broader compatibility and full
Avro binding acceptance remain on `umf-c81cfc9c`. No relationship admission or
native-equivalence claim is made.

### Avro reference-value carrier checkpoint

TD-045 now defines the `target-key-record` authored profile and its required
mapping, loss and retained-recovery checks. The internal native carrier builder
is implemented; it emits explicitly named ordered key components under singular,
nullable-singular or array wire shapes, with no inferred defaults or logical
relationships. Invalid names, duplicate components, unknown request fields and
getters refuse atomically. Logical binding is not yet wired to this builder.

Twelve generated schemas pass Apache Avro 1.12.0 and fastavro 1.12.2 parsing.
The 24 writer runs include four expected missing/null-reference refusals and
40 successful cross-codec reads. Dangling keys, empty arrays and duplicate
references encode, while the binary32 probe narrows 1.0000000000000002 to 1.
Composite, self-reference and binary key values also round-trip. These results
constrain future projection residuals rather than proving association enforcement.

Fourteen Bun tests / 197 assertions pass. Chromium checks all twelve generated
carriers, 24 JSON/YAML native archive recoveries, twelve strict blocks and zero
getter executions or external requests. Typechecking passes. See the
[native record](../../../fixtures/validation/relationship-avro-carrier-native.json)
and [browser record](../../../fixtures/validation/relationship-avro-carrier-browser.json).
Authored Record/Key binding validation, complete projection receipts, individual
obligation residuals, ideal recovery and full binding acceptance remain required.

### Avro authored relationship projection checkpoint

The `target-key-record` projection and complete receipt schema are implemented.
A verified author receipt and unchanged endpoint/Key components precede native
emission. Each authored relationship obligation and unknown qualifier remains in
a source-qualified residual. Strict mode blocks; report emits only a complete
carrier. Recovery recomputes the operation and accepts matching fresh native
imports without inferring authored intent from them.

The 36-case matrix has twelve projections and 24 blocks. Cases cover one-to-one,
many-to-one, many-to-many, required bounds, ownership, undirected and self links,
alternate/composite Keys, unknown qualifiers, nullable wire shape and facets.
Heterogeneous endpoints and keyed association Records refuse this profile;
malformed names, incorrect component mappings and type conflicts also block.
Stale components, forged authors/receipts and getters reject. Floating-point Key
equality remains invalid under the core contract.

All 81 Avro relationship tests across four files pass 1,518 assertions. Both
pinned codecs accept the twelve emitted schemas: 24 writer runs and 48 cross-codec
reads pass. Chromium verifies 24 ideal recoveries, 24 emitted-native recoveries,
24 classification recoveries, 24 blocks and twelve forged-receipt refusals, with
zero getter executions or external requests. Typechecking and the browser build
pass. See the [native evidence](../../../fixtures/validation/relationship-avro-projection-native.json)
and [browser composition](../../../fixtures/validation/relationship-avro-projection-browser.json).

`umf-c81cfc9c` remains in progress. Broader compatibility, final coverage audit
and qualified binding acceptance remain required. These scoped results do not
claim relationship ideal admission, all-five delivery or native equivalence.

### Avro acceptance coverage audit and replay preparation

The authored matrix now explicitly exercises `1..*`, boolean/binary/int32 Key
carriers, duplicate components and reserved native names. It has 48 cases:
sixteen projections and 32 blocks. All 93 Avro relationship tests pass 1,822
assertions. Both pinned codecs pass 32 writer runs and 64 cross-codec reads.
Chromium verifies 32 recoveries in each composed direction, 32 blocks, sixteen
forged-receipt refusals and sixteen stale-target refusals. No getters execute;
no external browser requests occur. Typechecking and browser build pass.

The extension manifest now points to the authored-projection evidence while
retaining the distinction between classified payloads and authored receipts.
The bead's acceptance commands now name the implemented native Python probes
and composed browser harness rather than a nonexistent generic oracle command.

An isolated `avro` profile in the compatibility replay includes the prior 118
core/TableSpec commands plus two Avro corpus generators, three native probes
and three browser checks. Its 126 commands record current outcomes and input
fingerprints separately from earlier acceptance records. Full regression and
existing conformance gates must follow a successful replay; the binding remains
in progress until that evidence and the final acceptance audit pass.

### Avro relationship qualified binding acceptance

The 126-command compatibility replay, full non-gate regression and all five
existing concept gates completed on 2026-09-24. The final publication audit on
2026-10-01 verified every recorded source and execution-log fingerprint against
the retained run. The regression passed 1,795 tests across 352 files with
120,240 assertions; seven separate gate files passed thirteen tests and 186
assertions. Total verification is 1,808 tests across 359 files, 120,426
assertions and zero failures. The audit corrected seven null file counts by
reading the singular `1 file` summaries; no execution logs were changed.

The [qualified acceptance record](../../../fixtures/validation/relationship-avro-acceptance-evidence.json)
accepts `umf-c81cfc9c` for native grammar classification and the explicit
`target-key-record` authored carrier. Sixteen emitted schemas pass Apache Avro
1.12.0 and fastavro 1.12.2 with 32 writer runs and 64 cross-codec reads.
Chromium 148 checks 32 recoveries in each composed direction, 32 projection
blocks, sixteen forged-receipt and sixteen stale-target refusals, with no getter
execution or external requests. Native archives and unknown metadata remain
attached. Dangling values, duplicates and empty required arrays still encode;
Avro does not enforce relationship identity, participation or lifecycle.
Heterogeneous endpoint and keyed association layouts remain explicit refusals.
Relationship ideal admission, all-five delivery and native equivalence are
separate and are not claimed by this acceptance.

### Complete DDD and relationship GraphQL SDL

`umf-cf807ae4` now implements `projectDddToGraphql` for core 0.7.0 and DDD 0.1.0,
with explicit Field pairing, Record/entity endpoint pairing, complete root
policy, forward/inverse naming and heterogeneous output unions. Required
singular relationships produce non-null output fields; higher maxima produce
lists with explicit participation and item-availability residuals. Undirected
links require an explicit display orientation. Named Keys, lifecycle,
association identity, aggregate boundaries, invariants and native/unknown
content remain retained with source-linked losses. Strict mode publishes no
SDL; invalid roots, names, references or uninterpreted relationship qualifiers
refuse even in report mode.

The eight-case [native oracle](../../../fixtures/projections/ddd-graphql/oracle.json)
uses GraphQL.js 17.0.2 and GraphQL-core 3.2.12. The historical shared authored
graph matches its independently written expected SDL. The
[Chromium record](../../../fixtures/projections/ddd-graphql/browser.json) checks
both retained recovery directions through JSON/YAML, independent native archive
IDs, forged/stale reports, getter refusals, unknown native content and composed
migration/rollback. The [acceptance record](../../../fixtures/projections/ddd-graphql/acceptance.json)
records the focused tests and source fingerprints. This completes the bounded
schema-generation task, not GraphQL execution, relationship ideal admission or
native equivalence.

### PostgreSQL relationship binding acceptance (2026-10-01)

`umf-b89363fd` now has qualified PostgreSQL 17.4 new-keyed-table FK/junction
projection, native DDL/catalog classification and retained ideal/native recovery.
Four generated variants pass 41 total native write/control probes including
separate NOT VALID/MATCH SIMPLE/alternate UNIQUE/action counterexamples.
The scoped regression passes 23 tests/489 assertions; Chromium verifies all ten
projection cases, five catalog captures, eight ideal and 22 native recoveries.
See [the acceptance record](evidence/postgresql-relationship-acceptance.md) for
exact profiles and limits. Full DDD PostgreSQL generation, the remaining binding
work and separate Relationship admission/delivery gates remain distinct tasks.

### Additional relationship binding acceptance

`umf-e6cbcca4` delivers generic authored relationship projections to GraphQL SDL,
RDF N-Quads with explicit OWL union classes, and LinkML class/slot metadata.
Exact Record and relationship naming, verified author checkpoints, strict/report
losses and complete classification/projection receipt schemas prevent native
syntax from becoming inferred author intent. Retained recoveries preserve native
archives, unknown extensions and the entire authored source. GraphQL inverse
fields, RDF inverse predicates and LinkML inverse slots require an authored
inverse and an explicit native name.

The authored nine-shape corpus produces 26 native carriers across the three
systems; heterogeneous LinkML slot ranges refuse explicitly. Core Record Fields,
Keys, participation enforcement, lifecycle and association identity remain
source-linked residuals. GraphQL Record markers and the query root provide
schema validity only. RDF union-domain/range lists preserve disjunctive class
meaning without claiming closed-world reference checks. LinkML metamodel
acceptance does not validate relationship instances.

The [acceptance record](../../../fixtures/validation/relationship-extras/acceptance.json)
links GraphQL.js 17.0.2 / GraphQL-core 3.2.12, RDFLib 7.6.0 and LinkML
metamodel 1.11.0 / runtime 1.11.0rc2 evidence, focused Bun/schema checks and
Chromium recoveries. Historical RDFLib 7.1.4 evidence is not relabeled.
Repository-wide compatibility and the separate relationship admission/five-system
delivery gates remain separate. These additional systems are not priority-gate
substitutes, and no native equivalence is claimed.

### Complete DDD PostgreSQL generation (2026-10-01)

CONTRACT-043 / TD-048 now implement the whole `ddd-postgresql-1` report/strict
projection: complete bound table/JSONB graph, exact Keys and FK/junction/keyed
association structures, real shared homogeneous edge carriers, eligible LIST
partitions without Key widening, and exhaustive declared-index dispositions.
Full schemas, source/statement mappings and verified ideal/binding/policy/native
recovery accompany pinned PostgreSQL17.4 and Chromium acceptance. Unsupported
heterogeneous endpoints, association-edge discriminator layouts and unsafe
structural choices remain explicit refusals. See
[qualified execution evidence](evidence/ddd-postgresql.md).

### Relationship admission and five-system conformance — umf-582e0269

The executable relationship gate records ideal admission separately from
qualified five-system delivery and keeps `nativeEquivalence: false`. Its
canonical nine-case corpus checks named alternate Keys, keyed Enrollment with
attributes, bounded/owned multiplicities and legacy collision rollback. A
current-source replay covers PostgreSQL 17.4, SQL Server 2022 16.0.4295.3,
TableSpec 647e8e56, Avro 1.12.0/fastavro 1.12.2, PyArrow 21.0.0,
GraphQL.js 17.0.2/GraphQL-core 3.2.12, RDFLib 7.6.0, LinkML model 1.11.0/runtime
1.11.0rc2 and Chromium 148. The gate derives case coverage from executable
matrices and executes focused retained-recovery tests again at admission.

Evidence is published to `fixtures/validation/relationship-{admission,delivery,conformance}.json`;
`relationship-gate-refresh.json` binds successful command logs, current source
and native/browser proofs. An integrated final replay must publish its own
refresh record after all generators settle. Earlier feature acceptance and
broad repository gates remain historical until that replay; this scoped gate
does not reclassify or fabricate their previous counts.

The frozen worktree replay passed all 18 commands, including 408 focused tests
across nine files with 5,019 assertions, the native oracles, seven Chromium
matrices and typecheck. Independent parent acceptance then passed the three
conformance tests (15 assertions, one file, 201.72 seconds), the conformance CLI
and typecheck. The gate verified 14 current proof records and counted eight
useful PostgreSQL relationship mappings and 20 SQL Server projections; both
systems have successful native writes and FK rejection controls. The canonical
Chromium matrix recorded nine cases, 18 migration recoveries, 54 ideal
recoveries, 108 native recoveries, 27 strict blocks and 27 forged-receipt refusals.

The first independent run exposed only Bun's default five-second timeout on
the synchronous canonical corpus test, which took about 20 seconds under
parallel load. That test now uses an explicit 300-second timeout; no library
behavior changed. The failed pre-fix log remains alongside the successful
[acceptance test log](../../../fixtures/validation/relationship-gate/acceptance-tests.txt),
[CLI log](../../../fixtures/validation/relationship-gate/acceptance-conformance.txt)
and [typecheck log](../../../fixtures/validation/relationship-gate/acceptance-typecheck.txt).
The full 18-command replay was repeated after the timeout edit so the published
source snapshot matches the tested files. These are scoped worktree results;
final integrated acceptance must replay against the merged implementation.


### Integrated relationship and binding acceptance — umf-c2ef7c2c

The merged implementation passed all 175 compatibility commands and the broad repository regression: 2055 tests across 369 files, 129660 assertions and zero failures. All 8 separate gate/evidence test files and six conformance commands are recorded in the [final acceptance](../../../fixtures/validation/relationship-integrated-acceptance-evidence.json); its unique combined totals exclude repeated nested/focused suites. Typechecking, browser builds and the 343-schema / 59-package audits passed.

Architecture, README and the test plan now distinguish the delivered browser library and extension/generator subsets from historical checkpoints. Explicit coverage tags and consumer tests verify binding-aware access decisions plus ordered index/predicate/unknown-content migration and edited rollback. The old facet drift ledger is retained as history; freshly replayed proofs need no current hash exceptions. Native versions, command logs, tested-source fingerprints, refusal boundaries and the resolved pre-fix relationship timeout are retained in the final record. No native-equivalence graduation or completion of unrelated product requirements is claimed.

### Canonical Bun test discovery boundary — umf-99f73baa

`bunfig.toml` fixes Bun's default test root at the live repository `tests/`
directory. The package and conformance commands retain their explicit `tests`
target, while a direct `bun test` invocation uses the same boundary and cannot
discover frozen acceptance snapshots under `fixtures/**/tests/`. The archived
relationship baseline remains byte-for-byte unchanged and auditable. Typecheck,
the retained facet-evidence gate and whitespace validation pass; the broad live
suite traversed only root tests and exposed one governed-document fingerprint
drift from acceptance-ID normalization, now recorded in the existing explicit
revalidation ledger.

## Shared schema properties: owner-directed core slice (2026-10-04)

### Shared JavaScript numeric policy (2026-10-07)

FEAT-005 IDEAL-08, US-054, TD-054, STP-054 and CONTRACT-049 govern a bounded adapter over existing
integer/decimal tokens. Implement exact binary64 comparison, safe integer
admission, bigint conversion, spelling-preserving decimal construction and
optional current-Field validation without runtime dependencies. Verify boundary
values, subnormals, overflow/underflow, signed zero, malformed/unknown carriers,
declared domains and JSON/YAML recovery with Bun and real Chromium. The slice
does not alter schemas or native bindings; downstream adoption and float instance
semantics remain separate. Earlier integrated acceptance does not cover this slice.

| Slice | Dependency | Validation gate |
| --- | --- | --- |
| US-054 numeric carrier conversion | Existing CONTRACT-001 carriers and CONTRACT-049 core 0.8.0 literal validation | STP-054 contract/integration assertions and existing schema-property/key regression |
| US-054 public browser qualification | Numeric module/public export and fresh build | Portable/tooling typechecks, Chromium harness and resolved AC citations |

Rollback removes the additive module/export and consumer calls; existing token
artifacts remain readable. No schema migration or native-binding gate is added.

Scoped execution on 2026-10-07 used Bun 1.4.2 (43848b5a7), rather than the
manifest's Bun 1.3.14, with frozen-lockfile dependencies and TypeScript 7.0.2:

- `bun test tests/core/javascript-numeric.test.ts tests/core/schema-properties.test.ts tests/core/schema-properties-review.test.ts tests/core/key-tuple.test.ts`:
  70 tests, 769 assertions, zero failures across four files.
- `bun run typecheck` and `bun run build`: passed portable/tooling type checks
  and browser ESM/declaration build (11,499,396-byte bundle).
- `bun scripts/javascript-numeric-browser.ts`: Chromium 153.0.8010.12 passed
  26 checks for admission/refusal, exact binary64/subnormal values, bigint,
  declared integer/decimal domains, JSON/YAML recovery, unknown-content retention
  and absence of Bun/process globals.
- `git diff --check`: passed. No full repository/native replay or downstream
  Truss/Ashlar/TableSpec adoption is claimed.

Initial tests/typechecking could not load missing dependencies; installation
then passed with `bun install --frozen-lockfile` after sandbox temp-directory
refusals. The first browser launch could not bind the sandboxed loopback server;
the authorized local-server/browser run passed. These environment failures are
retained separately from successful verification. The final rerun followed an
accessor guard correction and additional decimal browser checks.

SHA-256 of the tested adapter:
`3d38e52cc878910509e8e277f671ff304707db37633f4f7c39082eb943618fdc`;
numeric test:
`7faaa2b0784040334ed43ead4c280a68a1126912a9cb0d2526e557bc431d5757`;
browser script:
`26a743f202c450afd0042ff93117dc09405ba9266a08748da1ef49a222607b6f`.

### Numeric specification evolution qualification

The owner requested complete HELIX evolution on 2026-10-07. The source direction,
FR-41 scope, FEAT-005 IDEAL-08, US-054, architecture, CONTRACT-001/049,
TD-054, TP-001 and STP-054 now carry the bounded requirement, design and gates.
Existing artifact IDs/frontmatter entries are retained; TP-001 and this plan
gain explicit downstream traceability links. ADR-002 and the cross-cutting
requirements remain applicable without a new runtime decision or constraint.

Only canonical citation comments changed in the numeric test/browser files;
the adapter fingerprint and built library behavior above are unchanged.
The cited Bun file passed again: 4 tests, 77 assertions, zero failures.
The cited Chromium harness passed again: 26 checks on Chromium 153.0.8010.12.
`bun scripts/acceptance-traceability.ts --check` passes with 442 criteria and no
dangling citations. US-054 has eight Bun-cited rows and one browser-harness
`REVIEWED_EXCEPTION` row; all 433 prior rows retain their earlier status.
Ledger classifications establish citation traceability, not independent proof
of execution or full repository acceptance.

Catalog-derived structural checks passed for all three new artifacts: required
sections, frontmatter, ten resolved governing links, local Markdown file links
and all nine criterion/matrix references. The installed Python validator could
not run because PyYAML is absent; equivalent scoped structural checks used the
repository YAML parser. TD-054 explicitly inherits architecture directly,
following existing bounded core-design practice; the catalog's separate
solution-design wiki-link pattern is inapplicable to this slice. No fictitious
solution design or automatic approval is asserted.

SHA-256 after citation-only edits: numeric test
`6f898c3731b59c0080f2279c71cbc862a3e1decbacd262c2631ca4a5955cc9a2`;
browser harness
`64a7be5ef51ddb287c9bce2788229917e9e693138cf253087fce62794b65da1e`.
Full repository/native requalification and downstream consumer adoption remain
separate work. Float semantics, codecs and core schema versions remain unchanged.

### Shared property implementation

Implement CONTRACT-049 as 0.8.0 without changing old schemas:
versioned schema, portable semantic validator/literal domain, copied authoring
and inspection, explicit defaults, migration/rollback, public export and tests.
TP-001 owns acceptance coverage. Record actual checks after execution. Existing
native bindings and ideal-admission gates retain their qualified scope.

The slice is implemented. [Execution evidence](evidence/schema-properties-core.md)
records core regression, Chromium public-API behavior, independent exact-number
probes, typechecks and schema/package audits. Native adapter admission and
TableSpec integration remain outside this implementation.

### Routine metadata API amendment (2026-10-05)

Owner direction removes persistent element/relationship selection verification
and schema-property declaration receipts. Selection returns copied snapshots;
`declareCoreSchemaProperties` returns the copied validated Document. Migration
and native-conversion preservation records remain. Unknown length units make
validation incomplete even with minimum-only or zero-maximum bounds, so
extension editing refuses. Current scoped evidence and historical qualifications
are recorded in [schema-property execution evidence](evidence/schema-properties-core.md).

### Official Python consumer package (2026-10-07)

Owner direction places reusable Python models, canonical schema resources,
validation, serialization and extension-registration machinery in UMF, while
TableSpec owns its pipeline extension. CONTRACT-051 defines the bounded package
surface. Package build resources copy canonical schemas, preserving their version
identities; no JavaScript runtime or TableSpec dependency is introduced.

The initial TableSpec binding consumes shared names and scalar families with
explicit native refinements. Legacy migration and retained source archives,
compiler snapshots, unsupported-property refusal and the existing compiler path
are consumer-owned. Broader core-property execution bindings and full native-port
acceptance remain distinct from package delivery. Scoped Python/package/browser
evidence is recorded in [python-consumers.md](evidence/python-consumers.md).

### Portable domain packs and dataset sources (2026-10-08)

Owner direction assigns all pack metadata, tabular schemas and schema tooling to
UMF, with generation, CSV output, ingestion and data testing in TableSpec.
CONTRACT-056 governs `umf.domain-pack` and `umf.dataset-source` 1.0.0, source
provenance and explicit execution boundaries. The legal source pack lives under
`spec/domain-packs/legal/`; generated consumer snapshots preserve compatibility.

Implement portable schema generation and registration, local native-schema
export/check, Python resources and Chromium metadata checks. TableSpec consumes
versioned references through trusted factory registration, retaining external
source declarations while refusing fabricated substitution for external row
inputs. Retrieval adapters and general mixed-source transformation remain open;
no workspace or source dataset is fetched during this implementation.

Scoped implementation evidence is recorded in
[domain-packs.md](evidence/domain-packs.md). The portable metadata subset has
TypeScript, Bun, Python, canonical-audit and real-browser evidence. Broader native
adapter qualification remains distinct and its failing gates are retained.

### Official medical fixture consumption (2026-10-08)

The medical corpus extends the legal domain-pack system without another metadata
version or generator framework. Explicit local-source export verifies rights,
checksums and path boundaries. TableSpec consumes external CSV bindings through
its shared validation, ZIP archive and ingestion paths; generation still refuses
external bindings. The bounded FHIR R4 corpus preserves original resources,
clinical literals and terminology notices. CMS samples remain references pending
specific redistribution clearance. Scoped evidence:
[medical-domain-pack.md](evidence/medical-domain-pack.md).


### Mixed legal corpus (2026-10-08)

Owner direction updates the existing legal pack to 1.1.0 under CONTRACT-056.
Retain the eight generated firm-operation tables; add one sourced case, seven
original public PDFs and 383 per-page extraction records. Court filings,
deposition designations and corporate exhibits remain separately qualified.
Originals retain SHA-256 pins; unknown third-party rights block full source
redistribution. Schema-only exports can refresh consumer/catalog metadata.
Scoped checks and limitations are recorded in
[evidence/domain-packs.md](evidence/domain-packs.md#mixed-legal-corpus-110).


### Medical carrier and terminology expansion — pending (2026-10-08)

Authority: FR-51 and CONTRACT-056. This is a dependency sequence for the expanded
requirement, not execution evidence or an implementation-ready schema design.
The clinical 1.0.0 checks remain scoped to their existing corpus.

1. Inventory exact CMS synthetic RIF, DE-SynPUF, Blue Button and official FHIR
   candidate files against every carrier area in CONTRACT-056. Record versions,
   coverage gaps, download/access requirements and embedded terminology rights.
   Select the smallest useful enrollment/claim source subset; keep historical
   ICD-9 claims separate. Exit: source/rights manifest and explicit gap matrix.
2. Frame linked carrier stories, technical design and story tests before code.
   Define keys and relationships, temporal/event handling, money/currency,
   lossless native retention and pack version compatibility. Model eligibility,
   authorization, adjudication and payment separately. Exit: concrete approved
   surfaces and acceptance scenarios; missing public examples stay named gaps.
3. Define version-pinned terminology/reference bindings and consumer-local
   licensed inputs. Start with official ICD-10-CM/PCS and HCPCS Level II files;
   support SNOMED CT and CPT without requiring their redistribution. Define
   qualified directional maps for Truss/Ashlar independently of tabular rows.
   Exit: exact release/rights decisions and tests for ambiguous, retired,
   unavailable and unknown codes; no inferred clinical/billing equivalence.
4. After those prerequisites, implement UMF pack schemas and export fixtures,
   TableSpec local ingestion/archive/readback and separately qualified graph
   consumption. Exit: Bun metadata/hash/recovery checks, real Chromium checks,
   source-inclusive rights refusal checks, TableSpec native ingestion/readback,
   and graph preservation evidence within declared subsets. Include active and
   inactive coverage, positive/negative eligibility, authorized/denied services,
   multi-line paid/denied claims, adjustments, multiple coverages and appeals.
   Supplemental fabricated scenarios carry separate provenance; they cannot
   substitute for public-source coverage claims.

No new pack version, terminology release or source redistribution entitlement is
chosen by this amendment. Full carrier support remains pending until its
coverage matrix and the separate consumer gates pass.


### Epidemiology and imaging subpacks — pending (2026-10-08)

Authority: FR-51 and CONTRACT-056. Keep these independent of carrier delivery,
while sharing the versioned terminology/source-binding work above.

- Epidemiology: select a bounded CDC WONDER export and pin query, release,
  original bytes and use conditions. Design population/geography/time/measure
  schemas and tests for denominators, adjusted rates, suppression versus zero,
  incompatible cohorts and revisions. Acceptance requires exact source recovery
  and preserved aggregate meaning in TableSpec and separately qualified graphs.
- Imaging/PACS: select a rights-qualified small TCIA collection subset and pin
  its DICOM edition, native objects and collection terms. Design study/series/
  instance metadata and binary-reference handling before adding fixtures.
  Acceptance requires independent native metadata inspection, exact original
  byte recovery, nested/private-tag preservation, unresolved-link handling and
  Bun/Chromium metadata checks. Pixel decoding and live PACS/DICOMweb operations
  require their own future designs and evidence.

Frame linked stories/designs/tests for each subpack before implementation.
Cross-subpack tests must reject fabricated patient links and population-to-patient
promotion. Record source coverage and rights gaps without inventing source facts.

### Medical subpack implementation — US-078 (2026-10-08)

US-078 / TD-078 / STP-078 implement a bounded first delivery of the carrier,
epidemiology, imaging and terminology requirements above. Four independent
1.0.0 packs use CONTRACT-056 and the unchanged shared source exporter and TableSpec
local ingestion/archive paths. Browser-compatible projections retain original
text and exact native fragments; the host builder produces deterministic source
manifests, native TableSpec schemas and CSV rows without fetching.

The carrier subset contains nine official HL7 R4 resources, nineteen authored
FHIR-shaped supplements and four workflow events. Epidemiology includes twelve
CDC/NCHS observed aggregate rows and two separate authored edge cases. Imaging
includes one synthetic DICOM binary/JSON object with private tags and a sequence.
Terminology includes twelve historical official ICD-10-CM order-file records
and separate source/system descriptors; SNOMED CT and CPT use caller-local record
lookup without bundled vocabularies. This is not full carrier or native support.

[medical-subpacks.md](evidence/medical-subpacks.md) records executed gates and
residuals. The previous pending sections remain the broader delivery sequence:
CMS/TCIA source qualification, full dictionaries/maps, richer native-conformance
profiles and Truss/Ashlar engine adoption still require separate execution evidence.
## Full domain catalog first release

Astra ultra reviewed SD-026 and CONTRACT-057. Implement shared profile admission, target-scoped ingestion, mixed-schema ZIP closure, synthetic run provenance, opt-in bounded sources and trusted fixture checks before qualifying the fourteen new packs. TD-063 through TD-076 and STP-063 through STP-076 own each domain slice. Legal/medical receive ontology schemas without regenerating fixed clinical content. Evidence distinguishes schema visibility, component replay and local engines from deferred native-source, realism and graph-storage support.

### Domain catalog first release

The sixteen-pack catalog, mixed-target schemas, trusted TableSpec replay and graph
companions are implemented under SD-026/CONTRACT-057. See
[evidence/domain-pack-catalog.md](evidence/domain-pack-catalog.md) for reproduction,
review corrections, executable results and remaining qualification boundaries.

### Public dataset schema packs (2026-10-08)

FR-51 and CONTRACT-056 govern the owner's selected NYC TLC, MovieLens,
NOAA GHCN Daily and GTFS Schedule profiles. Generate 16 authored TableSpec
schemas and four external-source manifests with distinct documentation pins.
Preserve native missing/time/code semantics and explicit unresolved row inputs.
The existing microsite catalog discovers the canonical pack directory.

Verification requires deterministic regeneration, pack/source/schema/domain
reference consistency, exact TableSpec adapter recovery, native consumer model
admission, export/check and real Chromium inspection of all sixteen schemas.
Record scoped results in [domain-pack evidence](evidence/domain-packs.md).
Rollback removes the four packs and generator and rebuilds the catalog.
No row ingestion, full native replay, source equivalence, public deployment or
new TableSpec generator is claimed.

### Ontology-aware schema explorer (2026-10-08)

Extend the existing FR-39/FR-41 metadata consumer and CONTRACT-057 graph-schema
inspection: split Tables/Ontology navigation, display record-owned properties
and keys, separate incoming/outgoing relationships, and provide clickable
record neighborhoods/full-model maps. Reuse stable module/element identity.
Deduplicate pack-owned schema files while retaining legacy URL aliases.

Bun verifies ecology's exact 19 records/81 properties/20 relationships and
catalog ownership. Chromium verifies old-link redirects, record/edge clicks,
corresponding table navigation, multiplicity display, mobile containment and
all existing catalog entries. Multi-endpoint relationships remain explicit
declarations and are not flattened into binary arrows. No data-instance
graph, ontology inference or native backend acceptance is added. Rebuild the
previous viewer to roll back; pack schemas are unaffected. Results live in
`../05-deploy/schema-explorer-evidence.json` and microsite build notes.

## Browser schema downloads — 2026-10-08

CONTRACT-054 records the owner-requested consumer profile. The explorer now
previews nine generated scalar targets, blocks unsupported members, requires
review of limitations and downloads a source-retaining report bundle. Native
adapter payloads expose separate recovery downloads with source companions.
Bun checks fields, exact source retention, rejected types/nullability, SQL
quoting, GraphQL parsing, Avro parsing and JSON Schema compilation. Chromium
checks all nine previews, review gating and an actual SQL download alongside
all catalog navigation checks. No DDL execution or native-equivalence claim.
Rollback removes the download widget and rebuilds the microsite.

### Website YAML defaults — 2026-10-08

Owner-directed human-facing schema interactions use YAML in playground presets,
explorer metadata/ontology/source views and JSON Schema/OpenAPI generation.
Explicit JSON output remains available; Avro/Spark native downloads, report
bundles, catalog transport and exact original-source downloads retain JSON or
their source format. Native source views preserve numeric lexemes through YAML
AST rendering rather than JavaScript number conversion.

Both TypeScript configurations and seven download tests (45 assertions) pass.
Chromium 153.0.8010.12 passes 23 checks, including YAML playground input, JSON
input/output switching, YAML generation and existing explorer preservation and
navigation checks; see the schema-explorer evidence. Public deployment is not
performed. Changed playground HTML requires its Innsigle signature to be renewed
before publication. Rollback restores the prior viewer and rebuilds bundles.

### Integrated medical family and public samples

Owner direction completes the sample integration under US-078/TD-078/STP-078:
qualify bounded public CMS CSV and TCIA DICOM sources, retain exact native meaning
and originals, add all subpack fixed profiles/ontology companions, link the
Medical family in the explorer and expose allowed original/row downloads.
Preflight and export the complete family in separate versioned directories; run
Bun, actual Chromium, independent TableSpec/pydicom and deployment gates before
merging. Live PACS and production carrier services remain separate future scope.

### Reusable domain-pack loader companions (2026-10-09)

FR-45, FEAT-009 PACK-07 and US-060-AC8–AC12 govern CONTRACT-057 and
TD-060/STP-060. The [loader build plan](domain-pack-loader-plan.md) sequences
portable admission, trusted companion export, bounded acquisition/replay, local
publication and Pages delivery. Preserve TableSpec's ingestion ownership and
explicit finite-inventory source scope. Astra ultra plan and implementation
reviews, process/TLS tests, real Chromium and regression evidence are required
before deployment. [Execution evidence](evidence/domain-pack-loaders.md) records
actual qualification and downstream integration feedback.
### Historical appellate development pack — 2026-10-09

Owner-requested plan, Astra review and build are complete for the bounded
US-061-AC9–AC12 slice. The independent legal-appellate 1.0.0 pack has 34 original
judicial PDFs, 13 issue groups, provisional evidence-linked screening annotations,
partial counsel observations and independent temporal workflow expectations.
Shared finite-inventory loader bytes are pinned and qualified against all selected
originals plus offline archive replay. Schema/browser/native fixed ingestion,
source export and local catalog checks pass. See [scoped plan](legal-appellate-plan.md)
and [measured evidence](evidence/legal-appellate.md). No live monitoring, email,
PACER or Supreme Court docket workflow is claimed.
## Public-company intelligence pack — 2026-10-09

Owner-directed FEAT-027 / US-078 / TD-078 / STP-078 implement CONTRACT-059
under existing CONTRACT-052/053. Build a fixed SEC-selected issuer corpus,
exact source-preserving projections, tables/ontology, independently reviewed
item-metadata screens and authored opportunity hypotheses. Qualify offline
regeneration/export, TableSpec local ingestion, independent engine readback
and actual Chromium discovery. Record outcomes in
[evidence/public-company-intelligence.md](evidence/public-company-intelligence.md).
Databricks egress, S&P licensing, narrative extraction, model evals and
production scheduler/email remain separately owned consumer work.

### Ashlar-driven Delta DDL generation — 2026-10-08

Owner direction places the reusable Delta DDL generator in UMF.
[CONTRACT-064](../02-design/contracts/CONTRACT-064-delta-ddl.md) defines
`umf.delta.definition` 0.1.0 alongside existing exact `umf.delta` schemas.
The pure TypeScript API generates proposed managed CREATE statements with
explicit nullability, clustering/partitioning and five selected table properties.
Unknown meaning remains serializable and blocks generation. No native UUID,
protocol compatibility, migration, relationship enforcement or predictive
optimization change is inferred.

Eight focused Bun tests (151 assertions, including existing schema recovery)
and library typecheck pass. The initial tests could not resolve dependencies
in this worktree; linking the existing project dependency installation resolved
that environment issue. Browser evidence is scoped in
`fixtures/delta/ddl-browser-results.json`; native DDL execution remains separate.
Ashlar must independently compare its model-generated carriers with its existing
layout before replacing installation input.


### Delta DDL decimal iteration — 2026-10-08

CONTRACT-062 now covers canonical decimal(p,s) declarations with precision 1–38
and scale 0–precision. The emitter preserves both authored integers without
rounding/defaulting; unsupported bounds, noncanonical spellings and SQL-like
content refuse. Exact original schema recovery remains required.

Six focused DDL tests pass (53 assertions), library TypeScript checking passes,
and real Chromium verifies atomic/decimal JSON and YAML recovery, unknown-content
retention/refusal and absence of Node globals. Browser evidence is retained in
`fixtures/delta/ddl-browser-results.json`. Initial local startup was unusually
slow; a redundant broader test process was stopped. No new cloud jobs or native
SQL execution occurred. Nested types, logical-core-to-physical mapping and wider
dialects remain subsequent explicit work, not claimed support.


### Delta DDL recursive type iteration — 2026-10-08

Owner direction grows the reusable generator in UMF. CONTRACT-062 now permits
recursive STRUCT/ARRAY/MAP and explicit TIMESTAMP_NTZ without changing the
preserved schema envelope or definition vocabulary shape. Ordered struct fields,
quoted names, decimal parameters and nullability remain explicit. Non-null array
elements/map values, absent map nullability, required fields below collections,
unknown recursive properties, nested metadata and complex layout keys refuse.
The emitter never silently relaxes these meanings or asserts native protocol admission.

Nine focused Bun tests pass (81 assertions), including exact JSON/YAML recovery,
full nested type expectations and refusal cases. Library TypeScript checking
passes. Chromium 153.0.8010.12 verifies nested nullable arrays of TIMESTAMP_NTZ,
atomic/decimal definitions, source recovery and unknown-content refusal in the
browser library. Browser evidence is fixtures/delta/ddl-browser-results.json;
STRUCT/MAP execution is covered by Bun generation tests, not native SQL.
Initial sandbox browser startup failed to listen on localhost; the same focused
check passed outside the sandbox. No cloud runs or SQL applications occurred.
Native target execution, migrations, richer metadata interpretation and logical
core-to-physical projection remain separate work.


### Delta DDL column-description iteration — 2026-10-08

Reusable generation remains UMF-owned. CONTRACT-062 now interprets only the
Delta field metadata key `comment`, at top-level and nested STRUCT fields.
Empty/Unicode descriptions and apostrophes/backslashes retain exact source
schema and emit escaped Databricks literals. Other metadata, nonstring comments,
controls and client dollar macros refuse without relaxing preservation.

Eleven focused Bun tests pass (93 assertions); library TypeScript checking
passes. Chromium verifies comment JSON/YAML recovery and SQL generation alongside
previous atomic/decimal/nested checks; evidence is
`fixtures/delta/ddl-browser-results.json`. Initial typecheck exposed an object
annotation mismatch, corrected before the passing check. The sandbox could not
bind the browser server; the focused localhost check passed outside it.
No native SQL, cloud compute, migration or protocol admission is claimed.
Logical-core-to-physical mapping, richer metadata and wider DDL targets remain
separate increments.

### Delta DDL complete-bundle iteration — 2026-10-08

Reusable multi-table generation now belongs to UMF through
`generateDeltaDDLBundle`, governed by CONTRACT-062. The browser-compatible API
retains caller order, exact per-table schemas, copied physical definitions and
source document IDs. It requires explicit catalog/schema/table names and refuses
empty bundles, duplicate document IDs, case-insensitive qualified-name collisions
and unsupported meaning in any member. No partial proposal is returned; database
application is not claimed atomic. Dependency ordering and relationships remain
consumer-owned explicit requirements.

Thirteen focused Bun tests pass (106 assertions), and library TypeScript checking
passes. Chromium verifies ordered JSON/YAML bundle recovery and whole-bundle
refusal alongside previous single-table evidence in
`fixtures/delta/ddl-browser-results.json`. Sandbox localhost binding failed; the
same focused browser check was rerun outside the sandbox. No native SQL, cloud
compute, migration or protocol admission is claimed. Ashlar's existing pinned
single-table generator remains compatible; consumer repinning is separate work.
## Shared security execution goal (2026-10-08)

Owner authorization covers requirements/design, bounded formal/native spikes, robust backend plans and an active goal to make implementations pass all allocated tests. Governed slice: FR-46, FEAT-008, US-079–057, CONTRACT-062/063, SD-008 and TD/STP-079–057.

1. Specify meaning and qualified binding admission; retain formal assumptions.
2. Execute a small independent oracle/formal/physical-mapping spike.
3. Implement portable extension validation/evaluation and verify Bun/Chromium.
4. Integrate policy lowering through Weft owner interfaces without a compiler fork.
5. Qualify raw PostgreSQL, actual Truss, raw Delta and actual Ashlar independently, including mandatory restrictions, private facts, bags and native bypass.
6. Execute writes/history/revocation/derived-copy schedules and publish per-AC evidence.

No synthetic spike closes actual Truss/Ashlar or production deployment acceptance. Missing native capability/access is a recorded gate, not a skipped pass. Progress/evidence lives in `evidence/security/`; no unrelated existing gate is waived.

Production implementation has begun with bounded portable truth/composition,
defensive runtime validation and a fresh-runner process/output boundary.
The portable package now includes policy/ontology schemas, preservation and
typed pinned-document closure with bounded correlated expression validation.
It passes focused Bun and real Chromium checks at retained fingerprints.
The portable host-attested fact evaluator now executes bounded correlated
expressions, collection refusal, typed disclosure and protected query-use admission.
Fresh required cases S01–S12 pass; all 120 backend cases remain open.
Immutable read registration now pins policy/ontology/core source revisions and
refuses content-changing revision reuse. This in-process helper does not
authenticate callers or establish native authority. Consumer lowering/admission, independently authenticated fact
providers and native lifecycle qualification follow. Databricks aidev-cus
authentication was observed successfully; an isolated target and ordinary-actor
qualification are not yet established. See
[scoped execution evidence](evidence/security/README.md).

Shared lifecycle implementation now includes the bounded single-realm authority
guard. Focused Bun/Chromium schedules verify final-release drain, new generation,
queued versus active cancellation, uncertain-transition closure and generation
reuse refusal. All native writer participation and native lifecycle cases remain
open; an application lock alone cannot qualify any backend.

Semantic write admission now implements complete original/proposed states,
changed-field checks and separate ownership/policy-attribute actions, with
coherent current authority cuts and finite aggregate check budgets. It has Bun
and Chromium evidence; native effects/atomicity and actual backend L01/L02 remain
open. Failed initial write typecheck evidence is retained separately; the
coverage-variable narrowing was corrected before the fresh verification replay.

Typed dependency analysis now strengthens write admission: live policy fields,
key/endpoint components and association inventories are derived from complete
meaning. Missing target policy-field classification refuses; tests retain the
omission/denial/permitted progression. This component is browser-compatible;
actual backend writer inventories and compiler lowering remain open.

A separate native PostgreSQL epoch candidate now executes seven ordinary-session
freshness/absence controls. It rejects a first protected RR read after acknowledgment
and non-MVCC rollback gaps, and denies direct private epoch/clock reads. Two added
scoped algebra checks accompany the native observations. Integration must ensure
explicit admission for zero-row operations, complete native writer participation,
clock custody and independently reconciled recovery; all native/backend cases
remain open. Disposable startup failure/readiness retry is retained.

Live Databricks actor preflight now confirms both configured profiles resolve
to the same original actor, leaving zero distinct non-installer identities.
Independent ordinary credentials and target namespace remain required external
inputs. TD-056 records exact available Weft obligation transport and unresolved
model-version, disclosure-result-domain and native host-checker adoption. No
profile name, generic obligation or opaque codec is treated as native authority.


A native PostgreSQL application-buffer witness now extends the drain candidate
past SQL transaction commit. Session guards block revocation until explicit host
release/discard. A weakened early native close reproduces acknowledgment with
revoked rows still buffered. Production connection-loss/stream cancellation and
public-driver integration therefore remain required; five lifecycle witnesses
are qualified feasibility evidence, not backend acceptance. Source/effect receipts
and fresh native/epoch replays are retained in the security evidence directory.


Public Bun SQL/PostgreSQL driver feasibility now has six exact ordinary-connection
and buffered release/discard observations. Source/typecheck, native SQLSTATE,
finite barrier deadlines and exact disposable-container cleanup are retained.
This strengthens the physical integration seam; Weft security lowering and full
backend acceptance remain open. Failed error-code/readiness attempts are retained,
with TCP initialization readiness corrected before the passing replay.


The PostgreSQL public driver candidate now exercises native data-connection loss
under an independently held coordinator guard. Its seven source-qualified
observations pass; host buffer invalidation precedes drain/acknowledgment and a
fresh ordinary connection sees revoked access removed. Evidence publication now
requires successful cleanup. Coordinator failure, complete native writer custody
and production compiler/host integration remain open; no native AC is closed.


Coordinator-loss controls now compare the native-only weakened design against
the implemented shared single-realm host guard using actual Bun SQL/native PID
termination. Nine driver observations pass; the positive transition producer
stays queued through host-buffer invalidation, while the weakened design actually
acknowledges with a live revoked buffer. This qualifies the scoped host/native
schedule only. All-native-writer participation and distributed profile admission
remain required; all 120 backend acceptance cases stay open.


A fresh isolated owner Rust build now executes four compiler model-version
controls. Original qualified Truss/Ashlar core07 requests compile; correctly
re-pinned core08 variants refuse at the public request envelope with no partial
SQL/plan. The next security compiler integration must therefore version request
admission before catalog/source/result lowering; changing the loader alone cannot
admit the security model. Exact owner source/corpus/binary custody is retained.
Truss native routine/security installation and Databricks independent identities
remain separate unresolved foundations, not synthetic profile passes.


Weft-owned B-008 has begun with FR-19–22/CONTRACT-005 and the explicit 0.3 security
transport/core08 custody foundation. Fifteen fresh owner Rust admission/frontend/
envelope tests pass, including no backend-factory invocation for unsupported
activation. Existing ordinary core07 contracts remain separate. Complete security
semantic/IR/result-domain/backend/host execution and language-binding parity remain
required; no native case is closed by this foundation.


The owning Rust compiler now admits bounded policy/ontology source shapes and
exact model/ontology revision closure, preserving source bytes and opaque native
archives. Reproducible canonical/strict-overlay correspondence and nineteen owner
admission/frontend/envelope tests pass. Full ontology/domain/variable interpretation,
security IR/result-domain/backend lowering and host/native language-parity acceptance
remain open. The prior broad Rust checkpoint reached terminal exit0 before this
source-packet stage; current targeted checks qualify the new stage separately.


Weft now has exact ontology reference/key/member/endpoint closure with qualified
cross-document identity and selected-domain-shape refusal. The current twenty-five
owner security/frontend/envelope tests pass; distinct equal local IDs do not merge.
Complete literal/facet interpretation, policy variable/type checking, logical/physical
security lowering and native host/actor qualification remain open. Unsupported
activation still occurs before the backend factory; no backend AC is closed.


The owner compiler now checks declared policy term types, lexical variables,
qualified identity/scalar domains and action/disclosure membership. Source/model
stage reuse is coherent: changed and rehashed inputs cannot replace prepared
catalog definitions. Thirty-one current owner tests pass. Complete literal/facet
semantics, truth/composition IR, physical lowering and native host/binding parity
remain open; unsupported activation still precedes backend composition.


The current Rust admission stage now validates exact integer/decimal coefficients,
binary tokens, Unicode scalar lengths, finite-width numeric bounds, range emptiness,
allowed-value identity, examples and defaults for the admitted scalar singleton
subset. Thirty-four targeted owner tests pass, including fractional/overflow
refusals and equivalent numeric enum duplicates. Constant/transform checking uses
this same validator. Source-bound receipts retain commands and observations.
This remains admission evidence: truth/composition IR, physical lowering, binding
parity and native qualification remain required. The acceptance gate remains
12/132; none of the 120 backend cases is discharged by these component checks.


The owner compiler now constructs an immutable type-admitted logical security plan
with qualified scalar/type/key references, exact retained literal wrappers,
explicit effects and disclosure dispositions. Nested existential bindings use
distinct slots while retaining outer correlation. Targeted tests inspect the
Project membership chain, refuse unbound terms and reject reuse with mutated
prepared definitions. Truth evaluation/composition and physical lowering remain
open; the public 0.3 compile response remains blocked-only. These observations
are component evidence, not backend acceptance closure.

The current owner replay passes 46 tests: ten library unit tests (including the
private-definition mutation witness), six compile-envelope, four frontend,
twenty-three security-admission and three exact-literal tests. The initial
integration-test attempt incorrectly accessed private Catalog definitions and
failed compilation; its receipt is retained as
`evidence/security/weft-admission-ir-test-access-failure.json`. The repaired unit
witness exercises that state inside the crate without making it public.


Rust now implements pure scoped rule composition over the admitted logical plan:
unknown-first refusal, permit/require/forbid decisions, protected-field obligation
coverage, withholding dominance and exact typed transform conflicts. Transform
identity/version are explicit in the IR. An independently executed TypeScript
oracle supplies 120 truth vectors and 27 decision combinations; the owner tests
check every vector and rule-reversal invariance. These caller-truth simulations
do not admit authority cuts or evaluate fact-dependent expressions. Native
authentication, logical expression evaluation, physical lowering and final release
remain open, and no backend acceptance case is closed.

The current owner replay passes 51 tests, including five composition tests and
120 TypeScript-derived truth vectors plus 27 decision vectors. Projection-specific
checks preserve unprotected-key reads and reject duplicate selections. Exact mask
identity distinguishes adjacent values above 2^53 and accepts equivalent numeric
tokens/signed zero. A new test initially used `integer` instead of the canonical
`integerToken` wrapper and correctly failed source admission; the failed receipt
is retained as `evidence/security/weft-admission-composition-test-wrapper-failure.json`.
The evidence tool's first corpus integration also used a tuple where a Path was
required; that tooling error was corrected before retaining a successful receipt.
The 132-case backend acceptance gate remains open at 12 semantic cases passing.


The owner Rust evaluator now computes bounded fact-dependent expression truths
over explicit simulated cuts, including exact qualified tuple identity, endpoint
identity, scalar equality, correlated existential bindings and strong Kleene
operators. Preflight covers all scoped branches and selected targets even for
empty collections. Coverage omissions, stale metadata, ambiguous subjects,
duplicate private identities, key/field mismatch and budget exhaustion refuse.
Twenty freshly executed TypeScript scenarios check Project membership and whole-
collection refusal correspondence. Independent owner tests retain nested same-type
relations and bag multiplicity. This is conditional simulation: caller assertions
do not establish native authority, and results contain dispositions without
released values. Query-use, writes, binding parity, native codec correspondence,
physical lowering and backend actor qualification remain required. Unsupported
activation still precedes backend factories; the 132-case acceptance gate remains
open at twelve semantic cases passing.

The fresh owner replay passes 55 tests: nineteen library tests, six compile-
envelope, four frontend, twenty-three admission and three exact-literal tests.
The twenty Project scenarios match the portable evaluator. A large-key witness
admits one/eight resource rows but refuses nine when repeated identity copying
exhausts the work budget; no previously admitted prefix is returned. Logical
identity remains an exact qualified component structure, with native codec and
physical correspondence explicitly unqualified.


The portable evaluator and owner Rust simulation now admit all five query-use
operators, separate original-value permissions and complete cross-action
dependencies. An empty collection cannot skip prohibited-field or original-action
preflight. Seventy-five cross-language scenarios pass; real Chromium repeats
fifteen new empty-query observations (25 evaluation observations total). Native
query execution remains open: CONTRACT-063 and all four B08 procedures require
source-qualified exact field/operator/action bindings and unrelated-action
substitution controls before execution. The simulation's explicit action labels
are conditional inputs, not native provenance. The first broader run caught a
TypeScript narrowing error and sandboxed loopback listen failure; repaired
component and browser replays pass, with failures retained in
`evidence/security/components-query-narrowing-failure.json` and
`evidence/security/acceptance-query-browser-listen-failure.json`.


The owner compiler now admits immutable source-bound query profiles with complete
qualified field/operator/original-action bindings. It derives the exact action
and refuses caller substitution by a different granted action, including empty
collections. Profile reuse retains raw model inputs/module selections and exact
policy/ontology/backend-binding sources. Valid profiles still hit the unsupported
activation gate; stale profiles refuse earlier and neither calls a backend
factory. A new Rust fixture initially conflicted mutable/immutable borrows; its
failed build receipt remains in
`evidence/security/weft-admission-query-profile-test-borrow-failure.json`.

Formal analysis now retains eighteen conditional checks, adding exact original-
action lookup, qualified target/field/operator separation and exact-source reuse
even under an abstract digest collision. Each new check has a satisfiable admitted
population and a satisfiable weakened counterexample. These prove contract-model
invariants under stated premises, not Rust machine correctness, authenticated
source ownership, actual SQL-use extraction or installed database enforcement.
All native backend acceptance remains open.

The current owner replay passes sixty tests: twenty-two library tests, six
compile-envelope, four frontend, twenty-five admission and three exact-literal
tests. All eighteen scoped solver checks pass with SAT populations and weakened
controls. The freshly executed semantic gate passes S01–S12; all 120 native
backend cases remain missing, leaving acceptance at 12/132. Component/type/schema
checks and the 26-check retained-evidence audit also pass. This checkpoint closes
no native backend criterion and does not release a security compiler profile.


Weft now extracts actual field/operator lineage from its resolved SQL tree and
applies source-bound profiles before native activation. Tests inspect all five
operators and both self-join occurrences, retain keyset dependencies and
field-free count scans, and preserve ordered alias outputs after dependency
deduplication. Actual protected predicates and out-of-profile counts refuse
without backend factories. The resulting profiled-query artifact has a private
constructor and read-only source-derived uses. An initial SQL fixture selected
unbounded integers outside the existing application's 0.2 numeric subset; that
refusal remains in `evidence/security/weft-admission-query-extraction-width-failure.json`.
Fresh positive SQL witnesses explicitly use authored names and signed 64-bit
integers. Relationship bridges, transformed operator typing, physical lowering,
installed source authority and native release remain unqualified.

The current owner replay passes 66 tests: twenty-six library tests, six compile-
envelope, four frontend, twenty-seven admission and three exact-literal tests.
The ordinary-version bridge probe passes. The concurrent component replay
passed both typechecks and the schema audits, but its acceptance-ledger test
exceeded the 15-second deadline; the failed receipt is retained as
`evidence/security/components-ledger-timeout.json`. The isolated replay also exceeded the deadline. The three full-ledger audits
now have explicit 60-second test deadlines; security unit-test deadlines remain
15 seconds and the audit assertions are unchanged. The bounded replay passes all four component checks, including 59 tests and
1,931 assertions.
All 26 retained evidence checks remain fresh; freshness alone does not establish
a passing test result. The actual SQL/profile connection is source-level
admission only. Native SQL lowering and enforcement remain open, and the full
acceptance gate remains 12/132 with 120 backend cases missing.

## Per-scan physical-mapping obligation foundation

The owner compiler now derives immutable obligations from the admitted profiled
SQL query, separately for each scan occurrence and selected action. Source and
subject keys retain their ordered components even for field-free COUNT. Scoped
rule conditions are visited without truth simplification; an original-value
query action retains its own correlated dependencies, including false branches.
Private association inventories retain every classified field and endpoint target
key. Context dependencies, live record attributes, projection fields and query
operator fields remain distinct; constant domain references add no live fact read.
The derivation charges globally bounded work and identifier text. Qualified reuse
continues to require exact source/model/module-selection snapshots.

The fresh owner replay passes 69 tests: 29 library, six compile-envelope, four
frontend, 27 admission and three exact-literal tests. New witnesses cover both
self-join occurrences, field-free COUNT, complete Ownership/Assignment inventories
and endpoint identities, original-action false branches, context separation and
bounded work/text refusal. The ordinary-version probe passes four observations;
all four component checks pass (59 tests, 1,931 assertions; typechecks and 60-package/
349-schema audits). All 26 evidence-freshness checks succeed. These are conditional
compiler inventory/admission results, not native completeness or enforcement proof.
Physical mapping validation, transformed query types, native lowering, installed
source authority and final release remain open. The acceptance gate remains
12/132 with 120 native backend cases missing; no security criterion is closed.


## First native raw-table acceptance runner

The previously missing `pg-raw.B01` runner now installs and removes an owned
disposable PostgreSQL 17.9 raw-table RLS fixture, with ordinary Alice, Bob and
outsider login connections, a private non-login/non-superuser policy helper owner,
and a separate authored fact/result oracle. The retained execution covers active/
inactive assignments, sibling Projects sharing a company, no owner and multiple
owners; direct private-fact reads refuse. Exact installed catalog metadata and
actual ordinary actor attributes are retained rather than installer-role claims.
The initial sandbox run could not access the Docker socket; the authorized
escalated disposable run and fresh gate replay succeed. No preexisting installation
is modified, and owned-fixture cleanup completes before success publication.

The fresh gate now has 13/132 passing cases: twelve semantic cases and this native
read-membership case. Its intentional failure retains 119 missing native cases.
This is stable-cut raw-table membership evidence only; compiler mapping integration,
current-authority ordering, other native controls and all actual graph-backend
cases remain open. No full security acceptance criterion is closed.

Final verification of this increment: the B01 gate receipt has 28 passing
observations and retains 13 native relations/indexes, 12 columns and 12 constraints,
plus policies, routine source, roles, memberships and actual actor identities.
The four component checks pass again; all 27 evidence-freshness/allocation checks
succeed, including the new native execution. These checks do not alter the
119-case native deficit or close any full security acceptance criterion.


## Native collection acceptance and conditional noninterference

`pg-raw.B03` now executes ordinary native lookup/list/count/min/max/SUM, secured
resource-to-Project traversal, offset paging and keyset paging on the owned raw
fixture. Authored per-actor vectors cover active membership and all-hidden actors;
explicit missing lookups and empty count/aggregate/traversal/page queries are
also exercised. Raw fact junctions remain private. The secured barrier view
requires source eligibility and active target-Project membership; its actual
definition/settings and columns join the retained catalog inventory.
A native weakened control disables RLS only in this disposable installation and
exposes five rows to ordinary counts. Restoring RLS restores exact eligibility.
The first lookup run failed because psql renders SQL NULL as empty text; explicit
JSON null now preserves the lookup outcome. The failed gate is retained as
`evidence/security/acceptance-pgraw-lookup-null-failure.json`.

Two new Z3 checks establish hidden-record noninterference for mathematical
COUNT/SUM over three symbolic carrier identities with unbounded nonnegative bag
multiplicities/integer payloads, and for any eligible page rank 0..2 under fixed
public ordering. Positive populations are SAT, violations UNSAT and weakened
unfiltered-aggregate/page-before-filter controls SAT. Complete stable
eligibility, equal eligible values and public order are premises; native overflow,
NULL/masked operator domains, arbitrary ordering/collation, cursor provenance and
current authority remain independently unproved. The formal suite now has 20
conditional checks, not a proof of installed backend correctness.

Fresh replay passes twelve semantic cases plus pg-raw.B01 (29 observations) and
pg-raw.B03 (77 observations). The full gate remains intentionally failed at
14/132 with 118 missing native cases. No full security criterion is closed.

The four component checks pass after this increment (59 tests, 1,931 assertions,
both TypeScript checks and schema audits). All 28 evidence-freshness/allocation
checks pass. The 14/132 gate remains the acceptance authority; these component
and freshness results do not close the 118-case native deficit.


## Independently authenticated native actors and privileged controls

The raw fixture now uses unique, separately generated SCRAM credentials over TCP
for ordinary actors. Credential values travel through private environment/stdin. Neither generated
secret values nor their stored verifiers enter retained source, arguments, receipts
or native catalog inventories.
The excluded installer/assessor retains local container-host access; this is an
explicit host exclusion, not production authentication qualification. Receipts
retain actual TCP authentication rules and native SCRAM-storage boolean outcomes.

`pg-raw.B14` verifies that the excluded administrator actually has native superuser/
bypass attributes and reads all five resources under forced RLS. Ordinary actors
are not administrator/guardian members, cannot SET ROLE or SET SESSION AUTHORIZATION
to either authority (native SQLSTATE 42501), and cannot authenticate as the
administrator using their own credentials. The first boolean-scalar run failed
because psql rendered f/t; explicit JSON encoding fixes the transport. That failure
is retained as `evidence/security/acceptance-pgraw-privilege-boolean-failure.json`.
Owned cleanup also reconciles an uncertain creation result by exact generated name
and run label before deletion. Successful publication follows completed cleanup.

The fresh gate passes twelve semantic cases plus pg-raw.B01 (31 observations),
B03 (79 observations) and B14 (51 observations), all replayed with authenticated
ordinary SCRAM connections. It remains intentionally failed at 15/132 with 117
missing native cases. Complete role/pool and definer closure, host authentication,
current-authority ordering, compiler/physical mapping integration, protected-field
controls and actual graph backends remain open. No full security criterion closes.

Final verification: all four component checks pass (59 tests, 1,931 assertions,
both TypeScript checks and schema audits), and all 29 evidence-freshness/allocation
checks pass. The authoritative acceptance gate remains 15/132, with 117 missing
native cases; no production or complete backend qualification is inferred.


## Native definer and name-resolution qualification

`pg-raw.B06` now exercises temporary shadow employee/assignment/ownership tables,
caller search-path changes, a caller-defined always-true predicate and caller-owned
SECURITY DEFINER wrappers through actual ordinary SCRAM sessions. Direct, caller-
predicate and wrapped reads retain the independent authorized resource IDs.
Protected overload creation, body replacement and SECURITY INVOKER alteration
refuse with native SQLSTATE 42501. PUBLIC EXECUTE grant attempts are judged by
their actual installed ACL effect, including PostgreSQL's possible no-op warning.
Actual temporary routine owners/settings/native definitions are retained as
inventory diagnostics; authored output vectors remain separate correctness oracles.

The excluded assessor then replaces only this owned fixture's helper with an
unqualified pg_temp-first lookup. The same ordinary temporary-shadow attack now
exposes all five resources for all three ordinary actors. Exact native definition
restoration is checked and restores the authorized IDs. This is a substantive
physical counterexample to weakened name resolution, not a simulated trust flag.
The passing case retains 59 observations and actual caller routine inventories.

The fresh gate passes twelve semantic cases and four native raw-table cases
(B01, B03, B06, B14): 16/132, with 116 native cases still missing. This qualifies
the selected fixture routine surface only; complete PostgreSQL routine/extension
closure, role/pool closure, host current-authority enforcement, protected-property
semantics, compiler/physical source integration and actual graph backends remain
open. No full security acceptance criterion is closed.

Final verification: all four component checks pass (59 tests, 1,931 assertions,
both TypeScript checks and schema audits); all 30 evidence-freshness/allocation
checks pass. The authoritative gate remains 16/132 with 116 missing native cases.
The 20 conditional formal checks and earlier owner-compiler evidence remain scoped;
no complete backend or production qualification is inferred.


## Native private-carrier and direct-storage boundary

The raw fixture now has a private JSONB/retained-bytea carrier and a dependent FK
child carrier. Native columns/constraints/owners/ACLs and independently authored
private seed facts are retained. JSONB object keys are compared canonically;
array ordering and scalar/retained byte tokens remain exact. This does not claim
native inheritance or partition closure.

`pg-raw.B04` exercises each ordinary SCRAM actor against private table direct/list/
count/COPY, private joins/aggregates and retained-byte projections; these refuse
with native SQLSTATE 42501 and no stdout values. Public SELECT ONLY and COPY
return the exact authorized public rows. Server-file read/write and COPY PROGRAM
refuse against files confined to the owned container. A temporary private-carrier
SELECT grant exposes all private bags/bytes despite parent RLS, proving that
carrier privileges are independently necessary. Revocation restores denial before
the secure native inventory and successful result are published.

The fresh gate passes twelve semantic and five native raw cases: 17/132, with
115 native cases still missing. Current raw observation counts are B01=33, B03=81,
B04=119, B06=61 and B14=53. Protected-field publication/masking, dynamic carrier
drift admission, external endpoints, current-authority and actual graph-storage
implementations remain independently unqualified. No full security criterion closes.

Final verification: all four component checks pass (59 tests, 1,931 assertions,
both TypeScript checks and schema audits), and all 31 evidence-freshness/allocation
checks pass. The authoritative acceptance gate remains 17/132, with 115 missing
native cases. No complete backend or production qualification is inferred.


## Native typed field publication and portable codec crossing

`pg-raw.B07` now publishes resource-ID/note/salary cells through the native secured
view and `umf.security.disclosure/0.1.0`: original JSON null, absent property,
withheld without value, and explicit string-domain constant transformation remain
distinct. Native frames match independently authored per-actor vectors and decode
through the portable UMF codec against a separately revised model/ontology/policy
fixture. Codec acceptance proves shape/domain only; native RLS and independent
output vectors separately establish this fixture's authorized publication.
The initial fixture omitted the required extensions envelope and was rejected;
it was corrected without weakening any validator. The helper also passes its
dedicated TypeScript check. Native/runtime receipt versions include PostgreSQL,
Python, Bun, core 0.8.0, security 0.1.0 and the disclosure wire version.

A native note encoder rejects unknown bag/note domains rather than coercing them.
LEFT JOIN retains a resource with a missing required carrier so it fails instead
of silently vanishing. Numeric-note and missing-carrier controls fail the entire
aggregate JSON publication with no stdout rows, and restoration recovers exact
frames. Private bag and retained bytes remain inaccessible to ordinary actors.
The successful B07 receipt has 49 observations and scoped native routine/view
inventories. Direct streaming, all query-use modes/transforms, arbitrary codecs,
source authority and final release remain separate unqualified B/L obligations.

The fresh gate now passes twelve semantic and six native raw cases: 18/132,
with 114 native cases still missing. The 20 formal checks remain conditional;
no full security acceptance criterion or complete backend qualification closes.

Final verification: all four component checks pass (59 tests, 1,931 assertions,
both TypeScript checks and schema audits), and all 32 evidence-freshness/allocation
checks pass. The authoritative gate remains 18/132 with 114 missing native cases;
no complete backend, source-authority or production qualification is inferred.

## Native private-fact diagnostic counterexample

The owned PostgreSQL 17.9 fixture reproduces an authorization-fact population
leak under ordinary SCRAM identities. Adding an unrelated staff assignment and
running ANALYZE leaves every actor's authorized resource IDs unchanged, while
public pg_class.reltuples changes from 3 to 4. Native live-tuple statistics expose
an assessor-confirmed estimate changing from 3 to 5; estimates are not treated as
exact physical row counts. Direct private-table denial therefore does not establish
private-fact confidentiality.

The retained `pg-private-diagnostics.json` counterexample has twelve observations
and exact fixture/probe source custody. A restricted prototype revokes access to
pg_class, two statistics views and pg_stat_get_live_tuples(oid), closing the three
tested diagnostic paths while preserving authorized resource output. This is not
a complete diagnostic inventory or proof: alternate views/functions, size,
EXPLAIN, history and timing remain unqualified. CONTRACT-063 and TD-056 now make
that closure an explicit physical admission obligation. `pg-raw.B10` remains a
counterexample-found case without a passing implementation command; no acceptance
case or criterion is closed by the prototype.

Final verification for this diagnostic investigation: all four component checks
pass; the 470-criterion traceability ledger is current; all 33 retained-evidence
freshness/allocation checks pass. The refreshed gate still passes 18/132 required
cases and fails on 114 missing native cases. Its formal runner retains twenty
conditional passing checks, not an unconditional proof of diagnostic closure.
All 28 complete security acceptance criteria remain open. The implementation goal
remains active; B10 requires a complete admitted diagnostic surface and independent
positive/negative native evidence before qualification.

## Native ordinary-principal connection-pool role isolation

`pg-raw.B05` now runs actual Bun SQL pools over unique owned PostgreSQL SCRAM
endpoints. It checks three ordinary principals against owner/internal and native
file/program role inheritance/adoption, including an internal private-carrier
privilege that cannot be inherited. Native membership admin/inherit/set options
are retained. A separately granted lower role proves reset is exercised rather
than vacuously tested against a role that cannot be adopted.

The same native PID restores its pinned session/current principal and exact
independent authorized IDs after role-changing commit and SQLSTATE 22012 abort.
No result escapes an aborted lease or a failed final reset. A weakened no-reset
lease leaves the lower role active; subsequent secure admission restores the
principal. Pools are dedicated to native ordinary logins; this is not shared
service-login attestation or a complete connection-loss/lifecycle qualification.
Component source custody now recursively includes native test files, and the new
pool helper plus the disclosure helper have an explicit TypeScript check.

The first full pool gate replay rejected the primary receipt solely for different
JSON object-member ordering: Python confirmed equal expected/observed values,
while the gate correctly refused its exact serialized comparison. The rejected
gate is retained as `acceptance-pgraw-pool-order-failure.json`. Primary object keys
are now canonicalized, matching the existing native JSONB/disclosure convention;
array ordering, exact scalar values and the gate itself are unchanged. Fresh
replay is required before counting this case as passing.

Fresh pool verification now passes B05 with 93 observations on PostgreSQL 17.9 /
Bun 1.4.2. The authoritative gate passes twelve semantic and seven raw-native
cases: 19/132, with 113 native cases still missing. All five component checks pass
(59 tests / 1,931 assertions, dedicated native-helper and driver TypeScript checks,
both project TypeScript configurations and schema audits). The 470-criterion
traceability ledger is current; all 34 evidence-freshness/allocation checks pass.
Twenty formal checks remain conditional. All 28 complete security criteria remain
open, including the independently reproduced B10 diagnostic leak. The full
implementation goal remains active.

### Host-owned original preparation foundation — 2026-10-09

`tools/security/truss-original-preparation.ts` adds a host-only preparation
boundary: verify trusted host executable/source pins, freshly invoke the
original mapping compiler on exact request bytes, lower only its returned
handoff with the existing Truss original-use consumer, recheck source pins,
then issue an opaque local handle. Client handoffs and qualification flags are
not preparation inputs. Handles cannot be copied or adopted by another
preparer; exposed request/handoff data are copies. This selected Resource
profile retains the existing consumer's private source/action obligations.

Strict TypeScript checking and two Bun tests with nine assertions pass against
the actual owner executable. Controls cover positive preparation, copied and
cross-preparer handles, exposed-copy edits, owner refusal and stale executable
pins. Astra review is pending. The foundation is not yet connected to the
existing native original-use harness or public installation, and trusted host
filesystem/configuration custody remains a premise. Source-to-native authority,
complete obligation implementation and positive security activation remain
open. Original acceptance remains 26/132; no consolidated refresh is claimed
for these newly added source files.

## Native installed-inventory drift admission

`pg-raw.B11` now pins independent native catalog descriptors by value and compares
a fresh capture before query execution. Seven actual owned mutations cover owner,
private grant, membership, definer mode, RLS predicate, column mapping and bypass
attribute. All ordinary actors must refuse with zero protected queries while the
inventory differs; exact restoration recovers independently authored resource IDs.
A no-admission private grant control exposes the actual protected carrier, proving
the drift assertion detects a consequential bypass. Missing inventory and failed
buffered/lazy output publish no rows. Full changed native inventories are retained.

The host helper requires an externally stable cut and a trusted independent
provider; matching metadata is neither authentication nor complete qualification.
This does not establish concurrent DDL/final-release guards, full diagnostic closure
or production compiler/model correspondence. B10 and lifecycle cases remain open.

Fresh verification passes B11 with 90 observations and all seven changed native
inventories retained. The authoritative gate now passes twelve semantic and eight
raw-native cases: 20/132, with 112 native cases still missing. All five component
checks pass (59 tests / 1,931 assertions plus TypeScript/schema checks), the
470-criterion ledger is current and all 35 evidence-freshness/allocation checks
pass. Formal coverage remains twenty conditional checks; no complete security
criterion, backend profile or production admission is qualified. The full goal
remains active.

## Native incomplete-authority collection admission

The targeted B15 replay passes seven corruptions of the independently retained
source cut. Native exact Employee/Project/Resource/Assignment/Ownership facts must
match before all selected collection operators, including empty and outsider
selections. No protected operation runs under an incomplete cut, and exact
restoration recovers independent vectors. Missing inactive facts are detected even
when visible rows stay unchanged. A same-count A-to-D replacement admits RD to an
unguarded Alice read, showing that population counts do not establish completeness.

Two initial controls failed and are retained: the endpoint negative oracle omitted
RD, and PostgreSQL refused the type mutation because the secured view depends on
active. The first oracle is corrected; a native-installable required NULL control
exercises unknown input without dropping the view. Both failures remain scoped
historical evidence, not passing acceptance. Full fresh gate replay is required.

This host witness pins source content by value; it does not authenticate a
production issuer or establish dynamic cut transitions, complete direct-path
admission or concurrent authority/release guards. Those obligations remain open.

Fresh full replay passes B15 with 414 observations. The authoritative gate now
passes twelve semantic and nine raw-native cases: 21/132, with 111 native cases
still missing. All five component checks pass (59 tests / 1,931 assertions and
TypeScript/schema checks), the 470-criterion ledger is current and all 36 retained
source-freshness/allocation checks pass. Twenty formal checks remain conditional.
All 28 complete security criteria remain open, including authenticated production
source completeness, current-authority transitions and direct-path admission.
The full implementation goal remains active.

## Managed Python helper source custody

Six component checks reproduce a real equal-size/equal-timestamp stale-bytecode
control and verify that native admission helper execution uses the exact source
bytes bound by the case. Changed source, absent/malformed pins and excessive
source size refuse; module-authored digest metadata cannot replace the computed
executed digest. B11/B15 now check and compile the loader and selected admission
helper directly from the verified buffers, bypassing import bytecode selection.
Actual executed managed-source digests are retained with the native witness.

This closes a content-custody gap in the test/host boundary without asserting that
an earlier native run actually selected stale code. Trusted reviewed code and the
versioned Python runtime/stdlib remain prerequisites. B12's broader native receipt,
issuer, model/policy/mapping correspondence and fabricated-receipt controls remain
unimplemented. Full gate replay is required before claiming fresh case evidence.

Fresh custody replay retains both exact executed managed-source bindings in B11
and B15, with all existing implemented cases passing. The authoritative gate stays
21/132, with 111 native cases missing; this hardening does not create another
passing backend case. All six component checks pass, including six Python custody
tests, 59 Bun tests / 1,931 assertions, TypeScript and schema audits. The ledger is
current and all 38 freshness/allocation/managed-source correspondence checks pass.
Twenty formal checks remain conditional and all 28 complete security criteria
remain open. The implementation goal remains active.

## Native typed association binding admission

The targeted B02 native replay passes five mapping refusals and three actual
native endpoint/key/enforcement mutations. The qualified home/type/role selection
is pinned by value; independent descriptors bind ordered primary keys, exact FK
target homes/columns, validation/deferral/actions and active enforcement triggers.
The wrong-target control is fully validated and uses identical A/B/D TEXT labels
in a different logical type. Native traversal remains unchanged, proving output
vectors alone do not establish typed correspondence. Reversed native key order
and disabled FK triggers likewise require independent admission refusal.

All selected ordinary actors refuse before protected traversal and recover exact
independent vectors after restoration. RAB's two owner-junction identities remain
distinct. A reversed but SQL-valid TEXT join silently loses rows without admission.
The supported subset is natural raw-junction identity with nonnullable deterministic
TEXT keys and nondeferrable/no-action FKs. Actual graph stores, broader key/edge
identity domains, production source/query correspondence and concurrent mapping
changes remain unqualified. Full fresh gate replay is required.

Fresh full replay passes B02 with 88 observations and retained native key/FK/
trigger descriptors. The gate now passes twelve semantic and ten raw-native
cases: 22/132, with 110 native cases still missing. All six component checks pass
(six Python custody tests, 59 Bun tests / 1,931 assertions and TypeScript/schema
audits). The 470-criterion ledger is current; all 40 freshness/allocation/managed
source-correspondence checks pass. Formal coverage remains twenty conditional
checks. All 28 complete security criteria and complete backend profiles remain
open; the full implementation goal stays active.

## Actual Truss ordinary-login runtime integration

The user-owned Truss repository now has an optional ordinary-principal boundary
in its actual pg-runtime package. Original frames verify native session/effective
actor, NOSUPERUSER/NOBYPASSRLS and UTF8 context at checkout, after BEGIN and before
safe pool reuse. Role/session/settings reset occurs at checkout/release. Wrong
identity, privileged login, incompatible encoding and changed bypass flags close
new source admission and retain original quarantine. Generic unselected sources
keep their prior semantics; profile selection remains an explicit trusted-host task.

The owned PostgreSQL 17.9 / pg 8.16.3 / Bun 1.4.2 component passes 42 observations
with three SCRAM-authenticated ordinary actors, same-PID reuse after commit/abort
and explicit quarantined transport cleanup. The native test exposed unsupported
ParameterStatus responses during context reset; the wire adapter now preserves
those bounded UTF8 name/value/raw-byte reports without substituting for original
command completion. Four wire tests pass with twelve assertions. An initial
cleanup masked the original failure; explicit quarantine cleanup now preserves it.
A legacy counter uses its supported SET command instead of unsupported generic
RESET command-count handling. Both issues are documented in Truss's build plan.

The source compiles with existing cached pinned pg/Node declarations through an
explicit typecheck configuration; the default uninstalled-workspace attempt failed
and does not qualify the source. `truss-principal.json` retains actual runtime,
wire, fixture and probe source custody and original context reports. This is a
real Truss host component on raw relational fixtures, not an installed graph
security profile or a passing Truss B/L case. Native 0.13 graph protection, shared
service identities, transaction-mode poolers and full current-authority/release
remain open. The complete objective is unchanged.

Final actual-runtime verification: the 42-observation native component receipt is
fresh, all eight component checks pass (actual Truss source/probe typecheck, four
wire tests / twelve assertions, six Python custody tests, 59 Bun tests / 1,931
assertions and existing TypeScript/schema audits), and all 41 retained freshness/
allocation/source-correspondence checks pass. The 470-criterion ledger is current.
The authoritative acceptance gate remains 22/132 with 110 missing native cases;
its implemented source fingerprints remain current. No Truss graph case or complete
security criterion closes through this component work. The full goal remains active.

## Actual Truss context-journal provenance controls

The native actual-runtime probe now passes 53 observations using both the public
Truss disk journal and an independent memory capture of original request/frame/
outcome bytes. Offline inspection confirms complete originals and consecutive
exact local ordinals. Malformed ParameterStatus and missing command completion
are invalid; missing outcomes are incomplete with raw originals retained.

The omission control removes a well-formed ParameterStatus and still obtains a
structurally complete response. Full independent original-content comparison
rejects its correspondence. This exposes the precise remaining provenance
constraint: complete structure is not source authenticity or transaction/replay
permission. Private native originals and damaged copies remain under the owned
directory retained in `truss-principal.json`; startup/password frames are excluded.
No Truss graph case or full receipt-security criterion is accepted by this work.


### Truss journal component verification closure — 2026-10-08

The actual Truss PostgreSQL runtime probe now retains 141 original query journals across nine local leases and passes 53 observations on the owned PostgreSQL 17.9 ordinary-principal fixture. Independent captured requests, raw protocol frames, and terminal outcomes correspond to the inspected originals. Malformed ParameterStatus and missing CommandComplete refuse; missing terminal outcomes remain incomplete with raw bytes retained. Removing a well-formed ParameterStatus yields a structurally complete journal but fails independent original-content correspondence: structural inspection does not establish authenticity or complete provenance. No graph B12 or other backend acceptance case is credited by this component evidence.

Refreshed component verification passes all eight commands with unchanged source digests; evidence validation passes 41 checks; the acceptance ledger remains current at 470 criteria. The authoritative security gate remains 22/132, with 110 required native cases missing and all 28 complete security acceptance criteria open. The implementation goal remains active. Evidence: `evidence/security/truss-principal.json`, `evidence/security/components.json`; backend obligations: `../03-test/security/truss.md`.


### Native protected-field query-use separation — 2026-10-08

Added and executed `tools/security/pg-mask-query.py` on owned PostgreSQL 17.9
ordinary SCRAM identities. Thirty-two observations retain fixed positive
filter/order/group/join/aggregate outcomes on an Alice-only native salary-use
surface and native refusals on the public masked surface and ungranted actors.
The weakened output-only-mask view leaks hidden salary selection to Bob, who
lacks raw salary query permission; a hidden-value mutation changes weak results
without changing permitted public publication, and restoration recovers the
original selection. The native security-barrier flag cannot repair a pre-mask
predicate that already uses the protected value. This narrows the compiler's next
physical design obligation: prove original field-use lineage against separate
semantic permissions before selecting/lowering its native surface.

Evidence is `evidence/security/pg-mask-query.json`; the first diagnostic-format
failure is retained as `pg-mask-query-initial-error-format.json`. This is component
evidence and a reproduced counterexample, not a passing pg-raw.B08 receipt.
The full security gate remains 22/132, with 110 required cases missing and all
28 complete criteria open. The implementation goal remains active.

Final verification for this increment: eight component commands pass with unchanged source digests; 42 retained-evidence freshness/allocation checks pass; acceptance traceability remains current at 470 criteria. No native acceptance case was credited by the query-use component or weakened-control witness.


### Constant-mask query algebra formal increment — 2026-10-08

The preceding native query-use witness is now paired with five independent Z3 noninterference checks in `evidence/security/mask-query-formal.json`, reproducible with `/private/tmp/umf-security-proof-venv/bin/python3 tools/security/prove-mask-query.py`. Before/after published fields are separately symbolic and constrained to the constant-mask profile; original hidden values can differ. With two stable resource identities and shared complete eligibility, each predicate/order/group/join/aggregate violation is UNSAT. Positive populations are SAT, and weakening each operator to use original hidden values produces a SAT counterexample. Stable ordering includes identity tie-breaking. These are explicitly conditional finite proofs; actual compiler lineage, installed policy, arbitrary transformations, native NULL/domain/error/timing behavior and concurrent authority remain unproven. The native query-use spike and mathematical abstraction remain separate evidence. B08 and the overall 22/132 acceptance gate remain open. The goal is active.


### Native empty-query and separate-grant revocation controls — 2026-10-08

Expanded the actual PostgreSQL protected-query component to 51 observations. Ungranted Bob/outsider queries refuse all five original salary uses under constant-false predicates or LIMIT 0 (42501, no stdout). Alice has independent exact positive empty count and collection vectors. A committed revocation of her separate native query surface also refuses the five empty modes on newly connected ordinary sessions, while her masked publication remains exact; restoring the grant restores the authored aggregate 433. This establishes native privilege admission despite empty populations for this fixed fixture, not concurrent generation/guard/cache semantics. The owned container was removed before publishing `evidence/security/pg-mask-query.json`. Refreshing the five conditional algebra checks binds their receipt to current probe source without claiming native proof. Compiler-owned original action/field lineage and complete dependency binding remain the B08 qualification gap. No case or criterion was marked complete; the active goal and 22/132 required gate remain unchanged.


### PostgreSQL prepared-query privilege recheck — 2026-10-08

The native protected-query component now passes 57 observations. A bounded interactive ordinary Alice transport prepares the salary aggregate once, returning the authored sum 433. After the excluded assessor commits revocation of the separate salary-query grant, EXECUTE on that original native session refuses with SQLSTATE 42501 and no stdout result. Restoring the exact grant allows the same prepared statement to return 433 again; independently captured backend PID equality establishes connection continuity. Request/response boundaries use explicit native markers, selector-based reads, five-second deadlines and a one-MiB capture bound; the ordinary transport closes before owned-container cleanup and receipt publication. Password delivery stays on private stdin and is not retained. Evidence is `evidence/security/pg-mask-query.json`. This closes the prepared-query stale privilege component for this fixed PostgreSQL 17.9 surface, not B08 or L09 in full: original compiler lineage, semantic cursor/cache binding, concurrent guard drain and final application-buffer release remain unproven. The active goal and authoritative 22/132 acceptance gate remain unchanged.


### Actual compiler-to-mapping handoff component — 2026-10-08

Implemented `SecurityProfiledQuery::mapping_handoff_json` in the actual Weft Rust owner under its CONTRACT-005, exporting experimental `weft.security.mapping-handoff/0.1.0`. The immutable compiler artifact rechecks exact model/policy/ontology/profile/backend-binding sources, then retains the complete original resolved application plan, exact source pins, extracted field/operator/derived original-action uses and per-scan/action typed ordered identity and private fact obligations. Target-key maps are arrays of qualified target/keyId/ordered-field tuples; original output order, aliases, multiplicity and substituted parameter meaning remain in the resolved plan. Deterministic exports above 16 million bytes refuse. Tests prove source/backend mismatch refusal, retained plan meaning and separate original-action obligations. This is a concrete physical-mapping input, not an execution credential or a public compiler activation. Security lowering and Rust/Python/browser/native qualification remain open; the authoritative gate stays 22/132. Owner execution evidence: `evidence/security/weft-admission.json`; upstream governing contract: `/Users/erik/Projects/weft/docs/helix/02-design/contracts/CONTRACT-005-security-compilation.md`. The goal remains active.

Handoff verification closure: actual-owner replay passes 70 Rust tests plus the independent 75-case evaluation and 147-vector composition inputs; eight component commands pass. The actual compiled-runtime version probe rebuilds successfully and passes four original/core08 boundary observations. Forty-three retained-evidence checks pass and the 470-criterion ledger remains current. No security activation or native case is credited by these component checks.


### Compiler mapping handoff scan identity coverage — 2026-10-08

The actual Weft Rust owner test now verifies the serialized field-free COUNT self-join handoff, not just the in-memory obligation collector. Both s0/s1 occurrences survive with their own join uses and read-action closure. Each retains the membership/reader rule IDs, complete Assignment/Ownership associations and typed ordered identities for Assignment, Ownership, Project, Resource and Staff despite having no projected fields. Native-action absence is explicit JSON null rather than a fabricated original-action label. Fresh owner replay passes 71 Rust tests and independent evaluation/composition oracles; compiled-runtime version boundary is refreshed against these source bytes. This is compiler handoff component evidence only. Physical mapping installation, backend enforcement and final-release admission remain open; no required case or criterion is marked passed. The goal remains active.


### Executable original-owner handoff transport — 2026-10-08

Added an actual Weft Rust example that accepts bounded strict inspection input, prepares source definitions, resolves the SQL, admits the exact query profile and emits the original-owner mapping handoff. `tools/security/weft-handoff-probe.py` builds it offline and retains two emitted packets (scalar resource predicate and field-free COUNT self-join) in `evidence/security/weft-handoff.json`. Nine checks include protected original-value use refusal, stale backend/model pin refusal, unknown version/member, duplicate JSON and 32-million-byte input budget refusal; every failed request emits no stdout packet. Source fixture names and signed64 domains are explicitly authored inputs, not a production binding. Source/schema and executable digests are retained. These packets enable real physical mapping tests to consume original compiler output; no host issuer, execution authority, public compiler activation or native lowering is claimed. Actual-owner test/version evidence and component receipts are refreshed. The full security goal remains active and the 22/132 gate remains unchanged.


### Original compiler identities to native PostgreSQL mapping — 2026-10-08

Extended the actual Rust inspection probe to retain an explicitly separate
natural-key profile, alongside its unchanged surrogate-key artifacts. It now
passes ten transport checks and retains three original compiler packets. The
new native mapping probe passes ten observations: original surrogate identities
refuse, natural composite tuples match actual ordered PostgreSQL primary keys,
and missing/reversed components refuse. A deliberately swapped Project/Staff
home demonstrates key-shape insufficiency. Composed selected-home/FK/endpoint
validation rejects it before ordinary native operations. Three ordinary fixture
self-join counts retain independent exact actor vectors. All helper code is
executed from source-verified original in-memory bytes using the reviewed loader,
with executed source digests retained. Owned container cleanup precedes receipt
publication. Evidence: `evidence/security/weft-handoff.json` and
`evidence/security/pg-compiler-keys.json`.

This advances actual compiler-to-physical identity correspondence. It is not
security SQL lowering, complete policy/fact-domain mapping, generic graph table
discrimination or release qualification. No required case is additionally
credited: the authoritative gate remains 22/132 and the goal remains active.


### Compiler-required fact domains and fresh handoff provenance — 2026-10-08

Extended original-compiler/native correspondence to all required action fact
groups and scan query/projection fields within the declared unrefined required
single-value TEXT/BOOLEAN subset. The owned PostgreSQL witness now has 19
observations. Missing Assignment.active binding refuses. Two actual alternate
Assignment tables retain ordered PK/FK semantics but change active to TEXT or
nullable BOOLEAN: key/endpoint correspondence alone passes, required-field
correspondence refuses. Original typed mapping and independent actor self-join
counts remain exact. Refinements, other domains, optional/multivalue codecs and
context providers are not inferred. Physical type equality never establishes
trusted semantic issuer/attribute meaning.

The runner freshly executes the source/binary-pinned actual Rust inspection
transport for both original surrogate and separate natural models, comparing
complete emitted packets with retained originals before native mapping checks.
Executable digest participates in receipt freshness. Original helpers still
execute source-verified same-memory bytes; native container cleanup precedes
publication. Evidence: `evidence/security/pg-compiler-keys.json`. Eight component
commands pass. This is mapping provenance/domain evidence, not native security
policy lowering or complete B/L acceptance. The goal stays active, with the
authoritative gate unchanged at 22/132.


### Actual normalized security rules in compiler handoff — 2026-10-08

Implemented serialization of the actual Weft Rust admitted security IR, and
advanced the experimental handoff to `weft.security.mapping-handoff/0.2.0`.
The `securityLogicalPlan` member is versioned `weft.security.logical-ir/0.1.0`.
It retains all original admitted rules, permit/require/forbid effects, actions,
qualified targets, typed identity/endpoint/field/context/constant terms, declared
domains and exact literal wrappers, ordered expression structure, lexical
existential correlation slots and ordered disclosure dispositions. There is no
admitted-plan JSON deserializer or caller-constructed annotation substitute.
Backend mapping now has the normalized logical policy as well as scan/action
dependency closure; no second policy parser is required for physical translation.

Actual-owner tests verify mandatory versus permit effect, withheld disclosure,
Ownership slot 0, nested Assignment slot 1, correctly bound active field and
Boolean constant/domain. The compiler example retains three new-version packets;
ten transport checks pass. Native key/fact/endpoint replay passes 20 observations
with fresh original-compiler correspondence and explicit legacy-version refusal.
Owner admission tests, rebuilt runtime version boundary and eight component
commands pass. This establishes IR export and version custody, not installed
policy SQL, complete issuer/current-authority/fact trust or final release. All
full criteria remain open and the active goal's authoritative gate stays 22/132.


### Actual Truss normalized-IR to native RLS translation — 2026-10-08

Implemented backend-owned portable `packages/postgresql/src/security-predicate.ts`
in Truss and a host inspection bridge. It translates actual source-qualified
Weft normalized rule trees to correlated schema/operator-qualified PostgreSQL
row predicates. Permit/require/forbid truth conditions and unknown-preserving
existence CASEs are explicit. Unsupported domain/context/shape/depth/output and
shared-type-home-without-discriminator inputs refuse. The public backend factory
and compiler security activation remain closed.

Native replay `tools/security/truss-policy-lowering-probe.py` passes 49
observations on the owned PostgreSQL 17.9 raw-table fixture. Generated source
implements exact original-actor Project membership under forced RLS. A complete
explicit native login roster includes the unassigned outsider. Native privileges
publish resource IDs only, denying unmapped columns, prior disclosure views and
private assignments. The actual Rust owner emits a weakened source requirement
as a permit; its generated native function exposes all five IDs to all actors.
Exact original generated-definition restoration recovers all independent vectors.
Actual routine owner/login/super/bypass/definer/STRICT/stability/search-path/PUBLIC
ACL and forced-RLS/column grants are independently captured and compared.
Managed helper bytes and fresh original compiler packets precede translation;
owned fixture cleanup precedes the passing receipt.

Real Chromium 148.0.7778.96 emits the exact native-tested original and weakened
SQL from the same portable source, with no host globals or external requests,
and verifies shared-home refusal. Evidence is `evidence/security/truss-policy-lowering.json`
and `evidence/security/truss-predicate-browser.json`. Initial normalized-domain
refusal and NULL transport failures remain separate nonpassing diagnostics.
Qualified JSON truth envelopes and the declared native helper STRICT boundary
are used by the passing replay.

This proves scoped native row-policy translation witnesses, not a complete
security backend or typed Truss graph installation. Field publication/query-use
lowering, complete issuer/fact/current-authority protocol, native privacy
closure, writes/history/cache/stream/guard/release and production profiles remain
open. No required B/L case or full criterion is marked accepted; the
authoritative gate remains 22/132 and the goal remains active.

Final verification for the row-predicate increment: 49 native observations, exact original/weakened real-Chromium SQL correspondence plus shared-home refusal, nine component commands and 47 evidence freshness/allocation checks pass. The final strict browser-harness lookup issue is corrected with explicit fixture validation. Current 470-criterion ledger checks pass. No full backend criterion or graph case is inferred from these scoped results.


### Native unknown existence and conditional proof — 2026-10-08

Executed actual Rust source variants for negative membership existence and
unknown-witness forbid through the actual Truss row emitter. The new owned-native
probe has 63 observations, including the 49-observation foundation. Known-subject
negative membership complements are authored independently. Deliberately removing
the unassigned subject mapping creates unknown witnesses for RA/RAB/RB; the
source-compiled negative/forbid primitive decisions deny. A disposable naive
SQL EXISTS counterexample collapses unknown to false and grants those decisions.
Original source-generated function and complete roster restore exactly before
normal final checks and container cleanup. Missing-subject primitive diagnostics
are explicitly outside admitted whole-collection context; that context must
refuse at the host boundary.

The companion Z3 replay proves three conditional finite checks over two optional
T/F/U witnesses, including empty populations: Kleene-OR versus native CASE
existence algebra, unknown-negation refusal and unknown-forbid refusal. Each
violation is UNSAT with SAT populations and SAT naive-EXISTS counterexamples.
Complete identical stable witnesses/scalar truth correspondence remain premises;
installed SQL or compiler correctness is not proven by the symbolic model.
Evidence: `evidence/security/truss-existence-truth.json` and
`evidence/security/existence-truth-formal.json`. The original native lowerer and
real-browser source remain unchanged and retain their qualified evidence.
The full 22/132 gate and all complete criteria remain open; the goal is active.

Verification for the unknown-existence increment: nine component commands pass; all 49 evidence freshness/allocation checks pass; acceptance traceability is current at 470 criteria. These checks do not promote diagnostic results to complete backend acceptance. The authoritative gate remains 22/132, with 110 required native cases missing and all 28 complete security acceptance criteria open.


### Ordinary subject preflight component — 2026-10-08

The actual Truss pg-runtime has an optional `ordinarySubject` selection paired
with a pinned `ordinaryPrincipal`. Before BEGIN can return successfully, original
native protocol must report exactly one non-null TEXT key tuple, in the selected
column order, from a fully qualified private routine invoked with SESSION_USER.
Column aliases, original type OIDs/text format, cardinality, UTF-8 and finite key
byte bounds are checked. Selection is copied before acquisition. Only stable
repeatable-read/serializable read-only transactions admit this experimental
selection; read-committed and writable requests refuse before native BEGIN.
Subject check failure retains quarantine and closes source admission. No
application query, including an empty scan/count, can run on that failed lease.

`tools/security/truss-subject-probe.py` independently exercises the actual source
on an owned PostgreSQL 17.9 fixture with three original SCRAM ordinary logins.
Private mapping publication is unavailable. Positive empty counts are valid only
after admission. Missing/duplicate/null/wrong-native-type/wrong-column/error
responses reject before application SQL; composite keys retain exact original
column order and Unicode values, while reversed order rejects. Original query
journals independently retain all preflight attempts and show empty queries only
for admitted leases. The existing ordinary-principal 53-observation probe replays.

This fills a host preflight gap, not complete backend admission. Trusted exact
routine source/owner/ACL/inventory qualification, model-key correspondence,
current-authority generation and revocation guard remain external premises.
An attacker-controlled same-shaped routine is not an authenticated mapping.
Stable snapshots alone cannot establish current authority after acknowledgment.
Actual Truss typed graph adoption, complete facts, field publication and lifecycle
cases remain open; no full B15 or security criterion is accepted. Evidence:
`docs/helix/04-build/evidence/security/truss-subject.json`. Full gate remains 22/132.


Subject preflight concurrency refinement: eight additional native observations
raise this component to 58. An independently observed PostgreSQL advisory-lock
wait proves the original preflight is pending. Concurrent application SQL, BEGIN,
COMMIT, ROLLBACK and release refuse locally without submission. After native lock
release, admission completes and the original empty count returns zero. Eleven
original one-key preflight attempts and only four admitted empty-count submissions
are retained (composite attempts are separately checked). The original principal
53-observation replay passes at the same modified runtime source. This establishes
pending-admission exclusion, not revocation barriers/current-authority admission.

Final subject-preflight verification: 58 native subject observations and 53 original principal observations pass; nine component commands pass; all 50 evidence freshness/allocation checks pass; the 470-criterion acceptance ledger is current. Native originals include 149 subject-probe journal requests. No full backend case or criterion is promoted; the gate remains 22/132 and the goal remains active.


### Explicit shared-home type selection — 2026-10-08

The actual portable Truss PostgreSQL row emitter now accepts explicit native
row discriminators. Shared homes require every logical type to select the same
native discriminator column/carrier with distinct canonical values; absent,
overlapping, mixed-column and mixed-carrier mappings refuse. int4/int8 values
remain canonical decimal text and are range-checked with bigint, never stored
as JavaScript numbers. Typed resource lowering also requires the original native
row-type parameter immediately after ordered key parameters; omitting it refuses.
Subject and every association witness scan select their declared row type before
three-valued existential aggregation. Raw unique-home SQL remains byte-identical.

`tools/security/truss-type-selection-probe.py` retains 28 observations on owned
PostgreSQL 17.9 shared native fact projections with int4 discriminators. The
original Rust handoff is replayed with its exact binary/source digest. Deliberate
same-ID/different-type subject rows and wrong-relationship endpoint tuples cannot
supply witnesses. All three original ordinary actors match authored eligibility,
wrong root types return no eligible rows, and private facts remain unpublished.
Seven malformed mapping controls refuse before SQL. Erasing only association
filters causes Alice to read RB through wrong-relationship witnesses; exact
restoration recovers every actor vector. NULL root inputs cannot grant.

Real Chromium 153.0.8010.12 runs the actual portable module and matches all three
native-tested predicates (original raw, weakened raw, explicit typed projection),
plus shared-home-without-selection, missing root selection and overlap refusal.
The original 49 native row-lowering and 63 unknown-existence observations replay
at the new backend source; the existing three conditional existence proofs replay.
Two further Z3 checks establish typed witness fold versus filter-before-CASE
algebra and refusal on wrong/missing root tags. Each violation is UNSAT, with SAT
positive populations and SAT type-erased controls. Truthful injective native tag
correspondence and complete stable witness/scalar truth sets are premises.

This native projection is synthetic, not the current installed Truss graph
node/scalar/key/edge layout. TEXT/int8 discriminator execution, business-key codecs,
current property-carrier decoding, graph catalog identity and native endpoint
registry correspondence remain unqualified. Existing raw key correspondence
cannot automatically validate a shared (type,id) primary key as an id-only key;
an explicit typed native key bridge is required. Root parameter authenticity,
source/issuer/fact/current-authority/guard/privacy/lifecycle admission remain open.
No required graph case or full criterion is credited; gate remains 22/132.
Evidence: `truss-type-selection.json`, `type-selection-formal.json` and refreshed
`truss-predicate-browser.json` under the security build evidence directory.

Final typed-home verification: 28 new native observations, two new conditional formal checks, three exact native/browser predicate matches on Chromium 153.0.8010.12, nine component commands and all 52 evidence freshness/allocation checks pass. Original raw 49-observation and unknown-existence 63-observation native probes and three conditional existence proofs are current. Acceptance traceability remains current at 470 criteria. No complete graph/backend criterion is promoted; gate remains 22/132 with 110 required native cases missing and all 28 complete criteria open. The goal stays active.


### Typed logical/native key correspondence — 2026-10-08

The actual portable Truss backend now has `security-native-key.ts`, a synchronous
key correspondence check over original admitted compiler declarations and original
native inventory. Required unrefined TEXT key fields must match complete qualified
field references in authored order. Predicate field columns and key columns must
agree. Shared homes require distinct canonical int4 type selections, original
native catalog type/column observations and matching complete model source pins.
Native columns must have exact nonnull/deterministic TEXT domains; type columns
must be nonnull INTEGER. The validated native primary key must contain exactly the
selected discriminator and logical key carriers. An explicit
`nativePrimaryKeyColumns` preserves native index order separately from logical
component order; absent that declaration, the fixed type-prefix/default order
must match exactly. No silent component permutation or omitted type is allowed.
Malformed facet arrays and non-boolean native key flags refuse interpretation.

`tools/security/truss-native-key-probe.py` records 44 observations on owned
PostgreSQL 17.9 original descriptors and a synthetic native type catalog/fact
projection. Actual original Rust source/handoff/binary are replayed and pinned.
Eighteen malformed mapping/source/domain/metadata controls refuse. Native key
reordering, VARCHAR replacement, wrong type catalog entries and changed source
pins refuse before predicate emission and restore exactly. Equal keys in three
entity types and equal endpoints in two association types coexist. Explicitly
reviewed native composite order and type-last primary keys validate without
changing logical component order or emitted predicates; prior mappings reject
those same changed native orders. The same owner module validates original raw
TEXT keys and emits the byte-identical original native-tested raw predicate.

Real Chromium 153.0.8010.12 runs the same portable checker: raw and typed positive
inputs plus three key-order/type-source/predicate-column mismatch refusals pass,
with no host globals or external requests. Z3 has three conditional checks over
two ordered unbounded string components and unbounded type tags: canonical typed
logical/native tuple correspondence, distinct namespaces and declared component
order. Violations are UNSAT with SAT populations and type-erased/reversed controls.
Truthful injective tag correspondence and scalar equality remain premises; the
symbolic model does not prove compiler/code/native installation or catalog origin.

An initial raw refusal control targeted descriptor table zero (unselected Company)
instead of Staff. That test error is retained in
`truss-native-key-raw-control-failure.json`; controls now resolve Staff's exact
mapped home. It does not justify requiring every unrelated table to be part of
the declared key dependency closure. Complete authority inventory is independent.

This remains a key correspondence component, not actual Truss graph admission.
Original graph business-key codecs, node/current-state/property carriers, native
catalog/source authenticity, ordered endpoint/FK registry, complete issuer/facts,
current authority and final release remain open. Original stable inventory/cut is
a host premise; passing caller-supplied metadata cannot authenticate it. Public
security activation remains unavailable and no backend criterion is credited.
Evidence: `truss-native-key.json`, `truss-native-key-browser.json` and
`type-key-formal.json` under the security build evidence directory. Full gate
remains 22/132, all complete criteria open; the goal stays active.

Final typed-key verification: 44 native key/catalog/declared-order observations, five real-Chromium raw/typed/refusal checks on version 153.0.8010.12, three conditional symbolic key checks, nine component commands and all 56 freshness/allocation/managed-source checks pass. Acceptance traceability is current at 470 criteria. Canonical symbolic tuple proofs do not prove all native index-order implementations; explicit order changes have separate native execution evidence. No graph/backend full criterion is promoted. Full gate remains 22/132 with 110 required native cases missing and all 28 complete criteria open; the goal remains active.


### Original UMF tuple / native key-bucket transport — 2026-10-08

The actual portable Truss `security-key-transport.ts` captures independently
registered original UMF encode/verify functions plus copied model/key/namespace
selection. It requires the original current-core 3.0.0 `umf-key-tuple-v1` receipt,
reverified by its owner, and derives exact UTF-8 storage bytes for
`umf-key-tuple-v1:hex:<lowercase tuple hex>`. The native one-MiB encoded transport
bound and 64-KiB namespace bound apply. Full namespace and full encoded transport
must match together. A prefix, digest, caller-provided receipt shape or equal
value bytes in another namespace never establishes selected key correspondence.
The producer and original namespace authority remain independently qualified host
premises; the portable constructor cannot authenticate supplied methods or bytes.

`tools/security/truss-key-transport-probe.py` loads the exact original 0.15 owner
export in owned PostgreSQL 17.9 and uses actual native canonical string/tree
helpers. Seventeen observations pass with the registered 9e4bed3e UMF value
producer: ordered decimal `12.340`, Unicode `雪🙂` and integer token
`9007199254740993` match the independent original tuple oracle. Exact transport
bytes round-trip through the actual `object_key_bucket` BYTEA columns. Two native
memberships have identical key payload/digest but different complete namespace
bytes. The second namespace is deliberately unadmitted. Three original ordinary
roles lack schema access and direct bucket queries refuse with SQLSTATE 42501.
All fixture credentials remain private; owned native cleanup precedes receipt.

Real Chromium 153.0.8010.12 executes the actual owner bundle and portable backend
module. Four checks pass: exact expected encoding, original native bytes, foreign
namespace refusal and changed-payload refusal. No host globals or external
requests occur. This is original codec/native transport evidence, not a new formal
proof of the encoder, installed namespace authority or whole graph implementation.

Initial native source-completeness and ordinary namespace-lookup failures are
retained in `truss-key-transport-initial-refusals.json`; failed source snapshots
were not retained, so that diagnostic does not establish source-qualified failed
case receipts. Final fixture definitions retain required original document source
references and canonical type lineage. They remain installer-only fixtures:
`accepted_document` labels do not establish protected catalog acceptance, owner
property/key parity, original namespace/codec authorization or protected writer
execution. The actual object property bodies are incomplete and the second
namespace intentionally invalid; no successful complete graph operation is claimed.

Current `runtime_stage_object_key` admits only an already-encoded envelope shape;
its protected producer must separately establish complete source/codec/namespace
and canonical value correspondence. Security binding cannot accept arbitrary hex
payloads merely because that prefix passed. Actual graph business-key uniqueness,
full bucket collision/source inventory, native endpoint joins, complete canonical
facts, original-role/current-authority/guard and privacy closure remain open.
Evidence: `truss-key-transport.json` and `truss-key-transport-browser.json`.
No required graph case or complete criterion is promoted; full gate stays 22/132.

Final key-transport verification: 17 original-owner/native transport observations, four real-Chromium checks on 153.0.8010.12, nine component commands and all 58 evidence freshness/allocation/managed-source checks pass. Current acceptance traceability remains 470 criteria. The original 0.15 owner-export table constraints and byte carrier are exercised, but protected graph producer/namespace authority, owner-key parity and full profile remain unqualified. No required backend case or complete criterion is promoted; gate remains 22/132, 110 required cases missing and all 28 complete criteria open. The goal remains active.

### Security namespace binding follow-through — 2026-10-08

Implemented portable exact-canonical namespace verification and stored-key assembly in Truss, retaining source/identity/producer capture before async verification. Current Bun namespace replay passes 23 checks; current Chrome 153 namespace replay passes 23 checks. Four Z3 checks establish conditional native integer-domain representation properties. Stored-key assembly passes five Bun controls (including caller method replacement while pending) and four real Chromium controls against original registered UMF codec and retained native 0.15 bucket bytes.

The initial namespace probe executed 23 observations on PostgreSQL 17.9 before the factory change. A fresh native rerun could not start because OrbStack Docker inventory/info calls timed out; no fixture was created by that attempt and no daemon restart was performed. Preserve its historical receipt and qualify current results as retained native oracle replay (`freshNativeExecution: false`). This does not establish namespace registry authority, live signed/zero key definitions, complete graph parity, protected actor custody or final-release authority guards. Full gate stays 22/132, all 28 security acceptance criteria open; goal remains active.

Final current-source verification for this increment: all nine aggregate component command groups passed; phase evidence validation passed 64 checks with zero failures. Validation confirms retained-source correspondence and allocation, not native admission or completeness. Namespace and stored-key replay receipts remain explicitly qualified as non-fresh native execution.

### Raw identity carrier collision follow-through — 2026-10-08

Prepared an independent native ordinary-actor probe over the actual raw forced-RLS resource keys: case-sensitive text, NFC/NFD-distinct strings, supplementary Unicode and delimiter differences, plus a lossy-case negative control and native array NULL/empty/framing controls. This targets part of required B13 while preserving its remaining cross-home/hash/composite authorization obligations. Python compilation passed; Docker inventory again timed out after 15 seconds before creation was attempted. The process is terminal with exit 1; no restart, fixture or passing native receipt is claimed. The exact-source pending receipt records zero native observations. Full gate and goal remain unchanged.

### Original tuple capture race corrected — 2026-10-08

The async stored-key assembly initially awaited canonical namespace verification before rereading caller-owned values and stored key bytes. Executed adversarial controls found three counterexamples: repairing an initially invalid key or value tuple could be accepted, and changing initially valid bytes could alter the decision. Retained `stored-key-await-counterexample.json` and the pre-fix source snapshot. Fixed the actual portable Truss assembly to capture stored bytes and decide tuple correspondence synchronously before any await, with unsupported inputs refusing. Current actual-owner replay passes eight Bun checks and seven Chrome 153 checks. All replay evidence retains its explicit non-fresh-native scope; no backend case/criterion promotion or revocation proof is claimed.

### Native execution critical-path audit — 2026-10-08

Rechecked live Docker info: bounded eight-second timeout, terminal, no daemon restart. Fresh authorized Databricks profile and current-user calls complete: both configured profiles remain valid but authenticate the same installer actor, with zero distinct ordinary actors. The initial sandbox network failure was followed by successful permitted network observations; it is not an authentication failure claim. No workspace data/permissions were modified.

Current evidence validator passes 64 source/allocation checks. Full gate remains 22/132; missing required cases are pg-raw 20, Truss 30, delta-raw 30 and Ashlar 30. All 28 complete security ACs remain open. Requirements/design, conditional formal analysis and portable component progress do not qualify missing native cases. Remaining implementation/integration work is still required, including protected graph enforcement, writes, privacy closure and authority through final release.

Repeated native environment blockers now prevent the next required execution/integration step: Docker/OrbStack must recover for owned PostgreSQL fixtures; hosted qualification requires installer plus two distinct ordinary Databricks actors in the same disposable context. Requested engine recovery or explicit OrbStack restart authorization (may interrupt unrelated containers), and configured profile names only for distinct hosted actors. Goal is blocked pending these external prerequisites; it is not complete and its scope/acceptance gate is unchanged. Resume by executing the current namespace and raw identity probes, then advancing full required backend cases with acceptance-linked native evidence.

### Owner-requested Astra ultra review and fixes — 2026-10-08

OrbStack recovery was verified live (Docker 29.4.0). Prepared probes executed successfully on owned PostgreSQL 17.9 fixtures: namespace 23 observations, exact raw TEXT identity 16 observations. The owner explicitly requested an Astra ultra review; that reviewer read current code, contracts and evidence without edits. Four actionable findings were verified and addressed:

1. Scoped composition: a real-owner two-permit policy with T and U emitted an eligible SQL result despite CONTRACT-062 indeterminacy. Native pre-fix RA diagnostic returned true where false was expected. Archived source/probe and the counterexample receipt retain the evidence. Added multiple-scoped-permit NULL guards; actual owner/native tests cover both permit orders, false competing permit, and unknown rules outside selected actions or types. Expanded native truth probe passes 78 observations. Three new conditional scoped-composition Z3 checks pass with UNSAT violations and SAT weakening controls.
2. Original response custody: actual runtime permitted overlapping operations to install competing wrappers on one original socket parser. Added per-lease exclusion covering begin/execute/control/commit/rollback/release including reset. An independently observed native advisory-lock wait proves all competitors refuse without new original journal submission. Both principal-only and unconfigured sources preserve original response, subsequent query and healthy next checkout. Expanded runtime/subject probe passes 82 observations; principal regression remains 53.
3. Passing evidence counts: fresh gate now records an `accepted` outcome only after complete receipt and original source validation. Phase counts derive from accepted outcomes, not bare zero exits. Four isolated executions of the actual gate verify valid receipt acceptance and zero-exit malformed, omitted-assertion and stale-source refusals. No full fixture gate is claimed, because those one-case controls intentionally leave criteria unallocated.
4. Leading evidence summary: labeled early spike counts historical and added current qualification/version summary. No historical source receipt was silently repinned.

Refreshed affected native lowerer (49), typed projection (28), native key correspondence (44), subject (82), principal (53), conditional proofs and real Chrome 153 predicate/key correspondence. The complete fresh acceptance run executes and accepts the existing 22 cases; all remaining 110 still fail for missing required implementations. All 28 complete ACs remain open. The next integration priority remains compiler-owned action/field/operator enforcement on raw PostgreSQL and an actual Truss store/catalog/actor/complete-authority/publication boundary; synthetic shared-table projections are not a substitute for graph acceptance. Databricks distinct-actor prerequisites remain unresolved independently of restored PostgreSQL execution.

Astra ultra independently re-reviewed all four fixes and found no remaining defects in them. It verified current source hashes against affected native/browser/regression receipts and the gate's 22 accepted executions with zero accepted failures/timeouts. Final refreshed component verification passes nine command groups; current phase validation passes 68 checks with zero failures; the 470-criterion ledger is current. The passingFreshCases list additionally requires current fingerprint correspondence, so historical accepted runs cannot inflate current totals after source changes. Complete backend acceptance and all 28 criteria remain open; work resumes along compiler-derived field/operator and actual graph-native integration, rather than narrowing the goal to these reviewed fixes.

### First compiler-to-native query-use integration and unbounded logic — 2026-10-08

The owner's formal-logic question was answered by inspecting current retained Z3 evidence: conditional semantics and refinement models exist; they do not prove the complete system. Added a first-order unbounded witness-population existence theorem, independently specified as a least upper bound. Three Z3 4.15.4 checks pass with UNSAT violations and SAT positive/weakened controls. Identical complete stable witnesses and scalar correspondence remain explicit premises; SQL/compiler/issuer/final-release implementation is not proven.

Advanced the missing raw field/operator critical path: actual owner compilation derives protected salary predicate/order/group/join/aggregate bindings to querySalary and refuses malformed bindings. A broadly permitted unrelated action is retained as a separately selected profile identity, not substitute authority. Added actual portable Truss finite application/query-use lowering and reviewed host bridge. Native installer freshly replays exact owner artifacts, emits private source and fixed query routines, checks the bound action before any native application query, and applies compiler-derived row membership. All five populated/empty variants pass their authored Alice outputs and deny Bob/outsider; direct original sources remain private. Native role/routine metadata is independently observed. 10 owner checks, 62 native observations, ten actual Chromium program matches and four refusals pass.

Initial capability whitelist omitted the parser's filter capability; the initial predicate bridge refused without native effects. Added the implemented filter capability and re-executed native/browser checks. This did not weaken unsupported operations. Protected original projection, unknown capabilities, foreign profile and missing original action refuse. Integer input and output remain native/exact lexical carriers.

Scope remains fixed raw fixture, inspection-owner source and resource-independent original-value permissions; history/limit/page, resource-dependent permissions and broader physical domains remain unimplemented. No full B08, actual graph case, current-authority/issuer/privacy/final-release or public activation claim. Full goal and 132-case gate remain unchanged.

Final checks for this increment: nine aggregate component commands pass, including strict TypeScript for new owner bridges/browser consumer; all 72 current evidence checks pass; acceptance traceability remains current at 470 criteria. Native/browser receipts retain current source pins. No required backend case is promoted and no acceptance criterion is closed by these component results.

### Query-use binding and eligible source completeness — 2026-10-08

The experimental raw query home is now captured as exact original binding bytes (`truss.security.raw-query-home/0.1.0`). The portable consumer verifies binding, ontology and profile hashes, joins the profile binding to the handoff binding, checks native mapping against captured binding content, derives protection and operator/action selection from the captured ontology/profile, and captures inputs synchronously before asynchronous hashing. These establish source correspondence under the trusted original-owner premise; hashes do not establish issuer authenticity or current authority.

Before every application statement, the fixed native routine requires exactly one private original carrier with non-null required native fields for each eligible root row. Original action admission and this collection check precede application filtering, including empty results. Fresh PostgreSQL 17.9 evidence passes 74 observations: missing eligible carriers refuse all ten populated/empty routines, exact restoration recovers the result, and deleting an ineligible carrier does not alter the eligible aggregate. This does not yet qualify arbitrary domains, graph storage, concurrent authority changes or full privacy closure.

Real Chromium 153 matches ten native programs, refuses nine profile/capability/projection/action/mapping/source substitutions, and confirms that input mutation cannot change the captured result or repair an initially invalid mapping during asynchronous validation. The complete 132-case goal remains unchanged; B08 and the full backend acceptance criteria remain open.

### Conditional original-source completeness theorem — 2026-10-08

`original-source-completeness-formal.json` retains four quantified Z3 checks over arbitrary eligible resource populations. An independently stated universal specification (each eligible resource has exactly one carrier with all required fields) is equivalent to anti-existence admission. Empty application results cannot hide unavailable source; unauthorized original actions and duplicate/null carriers cannot admit. Each check has an UNSAT violation, SAT weakened control and SAT positive control. Exact native key correspondence, truthful eligible-root RLS, complete carriers, field availability, independent action authorization and a stable authority/source cut through final release are explicit premises. This proves the admission algebra, not SQL generation or backend isolation. The current 74 native observations cover missing eligible carriers and restoration, but do not establish every formal premise or all duplicate/null implementations. Full B08 and graph/native acceptance remain open.

Verification for this theorem increment: four conditional proof checks pass; nine aggregate component command groups pass; phase evidence validation passes 73 checks; the acceptance ledger remains current at 470 criteria. Full backend gate remains 22/132, with no backend criterion promoted by the theorem.

### Malformed original carrier refusal — 2026-10-08

The fixed private PostgreSQL query routine now normalizes caught execution errors to an authored 42501 refusal before results are returned. Added eligible-carrier controls for null, text sentinel, fractional number, signed64 overflow and object values across all ten populated/empty application routines, plus exact restoration. Fresh PostgreSQL 17.9 receipt passes 125 observations. These controls require no output, 42501, and absence of the sentinel/cast diagnostic categories in ordinary-client stderr. This is not a general proof of diagnostic noninterference; cancellation/assertion exceptions, timing, logs, concurrent mutation and complete physical admission remain unqualified. The boundary is the explicitly authored fixed spike installer, not an activated production compiler/runtime API. B08/B10 and graph criteria remain open.

### Duplicate original-source cardinality controls — 2026-10-08

Fresh PostgreSQL 17.9 evidence now passes 138 observations. Owner-authored replacement of the private original view duplicates the eligible RAB projection while retaining base-table primary keys. All ten populated/empty query routines refuse before results; exact restoration recovers the aggregate. Duplicating ineligible RB leaves the eligible aggregate unchanged, followed by restoration. This concretely exercises the exactly-one-carrier branch of the conditional completeness theorem. The mutation is an authored fixture owner change: it does not demonstrate authenticated source installation, native dependency sealing, current-epoch/source drift admission or concurrent stable-cut enforcement. Full B08/B10 and actual graph backend cases remain unqualified.

### Hidden carrier error interference counterexample and native fix — 2026-10-09

The expanded native test found an actual privacy counterexample: changing only unreadable RB salary to JSON null made Alice's eligible predicate query fail. The vulnerable fixture source and observed failure are retained as `original-use-hidden-carrier-vulnerable.py.txt` and `original-use-hidden-carrier-counterexample.json`. Root RLS alone did not isolate malformed carrier evaluation in the native query.

The fixed spike installer enables and forces SELECT membership RLS on the private original carrier relation, using the same compiler-derived read membership predicate. PostgreSQL catalog observations independently verify enabled/forced RLS, guardian ownership and the authored SELECT policy. Fresh PostgreSQL 17.9 evidence passes 240 observations, including all five malformed hidden-carrier variants across all ten operator/empty-result programs: eligible outputs remain unchanged and client diagnostics are empty. Restoration, eligible missing/malformed/duplicate refusal and private-source access controls also pass.

Physical lowering must isolate every protected carrier before operations that can evaluate its stored values or errors; root row filtering plus a private view alone is insufficient evidence. Require either native policy on the carrier or an independently validated equivalent barrier, including hidden malformed-value regression controls. This applies to raw and graph carrier homes. The fixed authored installer is still a spike; native dependency/source sealing, concurrent authority cuts, timing/log noninterference, full backend B08/B10 and public compiler activation remain open. Full gate remains 22/132.

### Captured complete physical mapping inputs — 2026-10-09

Experimental raw-query-home binding 0.2.0 includes the subject and complete authored physical type mappings (root, subject and associations), in addition to the original carrier home and target. The portable consumer compares captured inputs to the exact original binding and the profile/handoff binding identity before lowering. The reviewed bridge reads physical mappings from these captured bytes. This closes the prior caller-substitution gap for completeness-root and policy association mappings; binding hashes establish correspondence, not issuer authenticity or native catalog equivalence.

Actual owner export passes ten checks/six artifacts; freshly replayed native programs retain 240 passing observations. Four conditional source-completeness proofs are refreshed against the consumer source. Chromium controls additionally refuse substituted root table, association field column and subject type. Native mapping admission, schema drift/epoch, authenticated source custody and final-release guards remain host duties and open backend acceptance. Full gate remains 22/132.

### Cross-source ontology/profile join — 2026-10-09

The portable original-use consumer now requires the profile's ontology digest to equal the captured handoff/ontology digest, and requires the selected subject to equal the ontology subject. Individual matching source hashes alone did not establish these joins. Chromium's new substitution control changes the ontology revision and recomputes its standalone handoff hash while retaining the original profile; the consumer refuses. This is cross-source identity checking under trusted owner provenance, not source authenticity or proof that logical IR was compiled correctly. Native programs retain 240 passing observations and the four conditional completeness checks remain scoped to their explicit premises. Full backend gate stays 22/132.

### Pinned compiler handoff snapshot — 2026-10-09

The portable original-use consumer now requires an expected SHA-256 for the canonical complete handoff snapshot, including logical plan, application plan and query-use lineage. The reviewed fixture host computes the pin only after fresh original-owner replay; later handoff mutation refuses before rendering. This closes consumer snapshot substitution under the trusted pin-provider premise. A caller-supplied pin is not authority: public activation must establish this custody independently, and that protocol remains open.

Chromium controls remove the application filter while retaining the original pin and supply a wrong handoff pin; both refuse. Existing capability/projection/action/cross-source semantic controls recompute their altered snapshot pins so their rejection still tests independent admission rules rather than only snapshot identity. Fresh native programs retain 240 passing observations and conditional completeness proof scope is unchanged. Complete compiler refinement, trusted public issuer/pin custody, native epoch admission and final release remain unqualified. Full gate stays 22/132.

### Exact original integer boundaries and aggregate widening — 2026-10-09

Fresh PostgreSQL 17.9 evidence passes 252 observations. Added signed64 minimum/maximum carriers across all ten operator/empty programs and exact restoration. Actual owner IR declares each SUM argument signed64 but its nullable integer result has no integer-width facet. PostgreSQL's numeric SUM result therefore preserves the admitted result: summing two signed64 maxima yields lexical `18446744073709551614`, and summing minimum plus maximum yields `-1`. Stored boundary values are authored as native numeric SQL literals; outputs stay text and never pass through JS Number. This qualifies the fixed integer subset only, not arbitrary aggregate facets/domains, protected projection, complete backend acceptance or issuer/current-cut guarantees. Full gate remains 22/132.

### Backend regression protocol propagation — 2026-10-09

Expanded all four required backend plans with acceptance-linked original-carrier isolation procedures: hidden malformed-value noninterference, eligible missing/malformed/duplicate whole-request refusal, type/key separation, actual native metadata, drift/migration custody, explicit concurrent release barriers and exact integer transport. Truss/Ashlar require actual graph registries/homes; Delta requires its selected native compute/policy tuple. The observed raw PostgreSQL counterexample is motivation only and is not transferred as backend acceptance. Graph original-use lowering remains unsupported pending original root discriminator and guarded source integration. Full 132-case scope and 22 current accepted cases remain unchanged.

### Conditional hidden-carrier error isolation theorem — 2026-10-09

`carrier-error-isolation-formal.json` records four quantified two-world Z3 checks. Worlds share eligible resources, original action authority and all eligible carrier validity/cardinality while hidden carrier content is unconstrained. Eligibility-limited evaluation preserves admission and carrier-error outcomes; no eligible resources means no carrier error; malformed eligible carriers cannot admit. Each check retains an UNSAT violation, SAT negative control and SAT positive control. The all-carrier evaluation mutant yields a concrete SAT hidden-error interference control corresponding to the observed PostgreSQL regression.

The theorem requires exact eligibility, complete source cardinality, evaluation confined behind a truthful native barrier, faithful scalar domain checks and a stable source/authority cut. It does not prove the PostgreSQL optimizer/barrier, graph/Delta mapping, arbitrary result values, timing/log/diagnostic payload noninterference or full backend refinement. The 252 native observations remain separate empirical evidence for the fixed PostgreSQL raw spike. Required B08/B10/B15 backend cases must establish these premises rather than inheriting acceptance from an abstract proof.

### Original-query epoch integration and stale-snapshot control — 2026-10-09

Fixed authored native original-use routines now check private table/sequence authority generation before original-action admission, source completeness and application execution. An actual ordinary TCP/SCRAM connection establishes repeatable-read with a returned snapshot barrier; installer commits Assignment revocation plus generation advancement before the first protected read. The old connection refuses without output. A fresh connection after exact assignment restoration and another generation advance succeeds. Native generation is independently observed as lexical `2` after revocation. Fresh PostgreSQL 17.9 evidence passes 256 observations.

The first integration run failed stale-snapshot refusal because the newly created sequence's first nextval reused generation 1. The vulnerable source is retained as `original-use-epoch-initialization-vulnerable.py.txt`; initialization now explicitly sets generation 1 as already called, matching the existing epoch spike. No stale-row output was retained from that failing assertion, so this record does not claim its exact returned value. Fixed evidence tests actual advancement and refusal.

This is explicit installer-controlled authority mutation and stale-snapshot rejection, not exhaustive authority-change detection or drain coordination. The sequence is non-MVCC and nontransactional; abort/advance may conservatively refuse until repaired. No guard through final client release, revocation acknowledgment/drain, public activation, native source custody or full L06 qualification is claimed. Full gate remains 22/132.

### Epoch rollback and ordinary custody controls — 2026-10-09

Fresh original-use PostgreSQL 17.9 evidence passes 270 observations. A sequence advance inside a rolled-back authority transaction persists while the epoch row rolls back; the next fresh ordinary request refuses with no output. Explicit installation of a new generation restores the expected aggregate. Alice, Bob and outsider independently cannot read the epoch table, read the sequence, invoke nextval or call the private epoch helper. This verifies conservative mismatch refusal and least-privilege custody in the fixed installer.

Repair is an explicit assessor/installer action; no public recovery API or automatic acknowledgment is claimed. Authority changes remain manually enumerated in this spike, and no drain/final-release barrier or exhaustive authority invalidation is established. Link these controls to B05/L06/L11/L12/L13 qualification without promoting those cases. Full gate remains 22/132.

### Guarded native buffer/publication integration — 2026-10-09

Actual UMF SecurityAuthorityGuard now participates in a reviewed native pipeline spike around the original compiler-derived PostgreSQL aggregate. The ordinary query completes and decodes exact lexical output, then waits at an explicit publication barrier while the read callback still holds its guard. A participating change queues; its callback has not started, and an independent native assessor query confirms Assignment remains active. Publication completes before change callback admission; revocation and epoch advancement commit, and the next guarded ordinary query sees no eligible rows. A guarded restoration recovers the expected result. Six new observations produce 276 native observations overall.

The initial test oracle expected the word true, whereas psql's ordinary boolean carrier is t; correcting that lexical oracle and rerunning passes. No native safety failure is claimed for that oracle mismatch.

This demonstrates one-process read/change participation through buffered publication, not a production transport receipt, distributed/native-exclusive lock, all authority writers, streaming, cancellation/crash or final byte delivery. Public issuer/source/guard custody and exhaustive mutation participation remain open; L03/L05 are not promoted. Full gate stays 22/132.

### Guarded publication/transition failure controls — 2026-10-09

Extended the actual UMF guard/native publication pipeline with two failure paths. A buffered native result whose publication callback throws rejects the read and releases the guard, allowing the previously queued participating revocation to commit; subsequent protected reads have no eligible resources. A participating change that commits native revocation then throws an acknowledgment error produces SECURITY_TRANSITION_UNKNOWN, closes the guard, refuses subsequent reads before any native query, and refuses self-repair through that closed guard. Native assessor observation verifies committed revocation; separate explicit assessor restoration recovers the raw fixture.

Fresh PostgreSQL 17.9 aggregate receipt passes 287 observations. These are controlled single-process callback failures, not process crash, network acknowledgment ambiguity, distributed custody, final bytes delivered, all native writers or production recovery qualification. No L03/L11/L12 criterion is closed by the component. Full gate stays 22/132.

### Queued revocation cancellation and retry — 2026-10-09

Actual UMF guard/native pipeline now includes an AbortSignal-cancelled authority change queued behind a buffered read. The queue rejects with SECURITY_GUARD_REFUSED; the mutation callback never starts, an independent native observation confirms Assignment still active, and the active guarded read returns its original exact result. An explicit later participating retry commits revocation and the next protected read is empty. Restoration is separate and guarded. Fresh PostgreSQL 17.9 aggregate receipt passes 292 observations.

This qualifies cancellation before change callback admission only. Cancellation of a callback already executing, process crash, distributed/native-exclusive coordination, canceled native transactions and full guard participation remain open. No revocation acknowledgment is emitted for the cancelled request. Full gate stays 22/132.

### Conditional publication-drain induction — 2026-10-09

`publication-drain-formal.json` records four Z3 checks over unbounded abstract reader and pending-publication counts. Empty initialization plus every admitted reader/buffer/publication/release/change transition preserves pending publications <= retained reader guards and authority change => no retained reader. The invariant excludes publication outstanding at change admission/acknowledgment. A premature lease-release mutant produces a SAT counterexample. All checks retain UNSAT violations and SAT negative/positive controls.

Every operation must retain its own lease through publication, every authority mutation must use the same coordinator, callback settlement must be truthful, and coordinator transitions must be atomic/serialized. Global counts abstract individual lease custody; those premises are not proved by the theorem. No TypeScript implementation refinement, all-native-writer seal, distributed participation, streaming/final-byte completion, crashes or liveness/fairness is established. Current native guard pipeline tests remain separate scoped component evidence. Full gate remains 22/132.

### Separate-connection native publication drain — 2026-10-09

Added actual PostgreSQL coordination across separate native connections: an ordinary TCP/SCRAM read transaction acquires an explicitly authored shared transaction advisory lock, queries the compiler-derived routine and holds its lexical decoded result. A separate installer transaction attempts the matching exclusive advisory lock before assignment revocation/epoch advancement. The assessor observes PostgreSQL pg_stat_activity advisory wait and independently observes active Assignment while the read lease is retained. Publication precedes reader COMMIT; reader exits without diagnostics; revoker then commits and returns acknowledgment. A fresh ordinary read is empty, and explicit restoration recovers the fixture. Fresh aggregate receipt passes 302 observations.

The lock key is fixed coordination metadata, not a native resource identity. This proves the authored participating transactions' drain ordering and native lease lifetime through controlled publication. It does not seal all mutators, prove source/role lock custody, enforce lock use in public activation, cover distributed application buffers beyond the declared lease, final byte delivery, streaming, crashes, cancellation/deadlines or full L03/L05 acceptance. The original test's bounded deadline and actual native lock-wait observation establish ordering; elapsed sleep is not used as evidence. Conditional publication-drain proof source pins are refreshed, but the theorem does not verify advisory-lock implementation. Full gate remains 22/132.

### Native DML writer participation in the fixture — 2026-10-09

The fixed installer now creates statement triggers on employee, project, resource, Assignment junction, Ownership junction and private original carrier tables. BEFORE INSERT/UPDATE/DELETE/TRUNCATE acquires the selected exclusive transaction advisory lock; AFTER advances the non-MVCC generation and epoch row. PostgreSQL catalog evidence independently verifies all twelve enabled triggers and their selected routines. The separate native revoker now omits both explicit lock acquisition and explicit epoch advancement: its update blocks under the retained reader lease, and the trigger alone advances generation after drain. Fresh PostgreSQL 17.9 receipt passes 304 observations, retaining prior query/domain/privacy/epoch/guard controls.

This enforces participation for ordinary SQL DML on the six authored fixture tables with these enabled triggers. It does not seal trigger/role/function/schema changes, disabled-trigger or replication paths, excluded owner/admin bypass, independent native data sources, all selected graph homes, public read-lease acquisition, statement snapshot semantics beyond tested cuts or final client delivery. Protected read methods must still retain the native lease; ordinary direct invocation alone does not establish final-release drain. Installer/source inventory admission and comprehensive writer/read-path closure remain open. Conditional proofs retain updated source pins without claiming native-code verification. Full gate remains 22/132.

### Native revocation lock timeout — 2026-10-09

While the ordinary native reader holds its publication lease and a revoker is independently observed waiting in PostgreSQL, a second revoker executes an Assignment update with native lock_timeout=100ms. The trigger-enforced lock wait returns 55P03, no output/acknowledgment, and the connection ends without committing. Independent native observations show Assignment and epoch unchanged. Publication then completes and the original waiting revoker commits successfully. Fresh PostgreSQL 17.9 receipt passes 307 observations.

This verifies bounded native lock timeout without authority effects for the authored transaction, not elapsed-time ordering, canceled active callbacks, process crash/connection loss, complete deadline budget containment, distributed acknowledgment or production recovery. No drain acknowledgment is issued on timeout. The full required backend scope remains unchanged at 22/132 accepted cases. Conditional drain proof source pins are refreshed without native implementation proof claims.

### Protected-routine automatic native lease — 2026-10-09

The fixed native original-query routines acquire the selected shared transaction advisory lock before epoch checking, original-action admission, completeness validation and query evaluation. The ordinary retained read transaction no longer calls an explicit lock helper. After the query-result barrier, independent PostgreSQL pg_locks/pg_stat_activity observations confirm the ordinary reader's granted ShareLock on the selected coordination key. Trigger-only revocation still waits and timeout remains without acknowledgment/effects until publication and reader commit. Fresh PostgreSQL 17.9 receipt passes 308 observations.

Moving the catalog observation after the actual buffered-result barrier avoids timing-based lease evidence. Epoch checking follows acquisition so old data/authority snapshots cannot masquerade as current solely by obtaining a new lease. Autocommit releases the transaction before later application publication; production hosts must retain the admitted native transaction through their declared final-release boundary and qualify all read surfaces. This is a fixed authored installer protocol, not a public physical/compiler activation or complete source/role/mutator/graph closure. Full gate remains 22/132; conditional proof pins are refreshed without native code verification claims.

### Native backend-loss buffer-drain counterexample — 2026-10-09

Actual native negative control establishes an ordinary retained transaction, invokes the compiler-derived aggregate and holds its exact lexical result in the live client. Assessor terminates only that owned reader backend. Trigger-enforced Assignment revocation now commits before the client drains its buffered result; the old buffer remains available. Client subsequently detects connection failure. `original-use-native-lease-loss-counterexample.json` points to immutable retained evidence (`original-use-native-lease-loss-evidence.json`, SHA pinned). Fresh aggregate receipt has 313 passing observations, including successful observation of this unsafe mechanism boundary; those five counterexample observations are not acceptance of its drain behavior. No unauthorized publication is executed.

A native transaction lock alone cannot establish the CONTRACT-063 application-buffer final-release rule under backend loss. Production needs separately demonstrated publisher/lease participation that survives loss of the native session, or must refuse revocation acknowledgment while publication drain is unknown. Merely detecting the connection error later, retrying epoch admission or discarding the result in a cooperative client does not prove that all publication paths were drained before acknowledgment. Cleanup must distinguish dead publication owner from a live owner whose database session died; bounded uncertainty must not be reported as successful revocation. The conditional drain theorem's lease-through-publication premise is violated by treating this lost native lock as the sole lease. Native schema lock/read/DML results remain useful, but full L03/L11 acceptance remains open. Full gate stays 22/132.

### Persistent enrolled publication lease spike — 2026-10-09

Added a private persistent publication-lease registry and a separately enrolled aggregate wrapper to the fixed raw PostgreSQL fixture. A trusted issuer registers original actor/native backend before the wrapper executes. Unenrolled ordinary callers refuse, and all three ordinary actors cannot read the registry. Native writer triggers acquire the exclusive guard then refuse while any unresolved enrolled publication exists. Writers using repeatable-read are explicitly unsupported and refuse before effects, preventing an old writer snapshot from treating unseen leases as absent. The current ordinary read profile remains separately tested; this enrolled wrapper is not a public activation.

Actual enrolled reader buffers its compiler-derived aggregate, then the assessor terminates its backend. Its persistent publication record remains. Revocation returns 42501 with no acknowledgment; independent native observations prove Assignment and epoch unchanged while the live client retains the old buffer. Only after client failure is observed, trusted publisher explicitly discards its buffer and issuer clears the lease does a later native revocation commit. Fresh receipt passes 333 observations, retaining the unregistered native-lock-loss counterexample as a negative control.

This closes the observed backend-loss interleaving in the enrolled authored spike under trusted registration/release, not the whole system. Current binding uses actor/native PID; PID reuse, session incarnation/opaque token custody, public issuer authentication, lease recovery/owner-death proof, complete read enrollment, streaming/final bytes, DDL/trigger drift and graph/Delta implementation remain open. Cleanup is never inferred from backend disappearance or elapsed timeout. The unregistered base routine remains a spike control and cannot qualify publication custody. Conditional proof source pins are refreshed without claiming verification of registry snapshots or SQL implementation. Full backend gate remains 22/132.

### Exact issuer-created publication ID — 2026-10-09

The enrolled native aggregate wrapper now takes a UUID publication ID and requires the private row to match that ID, original native actor and backend PID. The trusted issuer captures the exact native RETURNING lease_id text and passes it through without numeric conversion. The actual enrolled ordinary session tests wrong and NULL IDs under savepoint controls; neither returns a result. Its exact ID then succeeds, and persistent backend-loss refusal/explicit trusted release still pass. Fresh PostgreSQL 17.9 receipt has 335 observations.

Opaque ID matching strengthens enrollment but does not authenticate the issuer, prove UUID entropy, provide public token custody or prove native session incarnation/PID-reuse safety. An old known token plus a reused PID must not be treated as a new publisher; actual incarnation/fresh-enrollment binding remains open. Private token values are not copied into observation receipts. The separately admitted public read/release protocol, immutable lease fields, cleanup evidence and recovery remain unqualified. Full gate stays 22/132; conditional proof source pins are refreshed without native source refinement claims.

### Native backend-start binding and metadata capability — 2026-10-09

The enrolled publication row now includes a native timestamptz backend-start value captured by the issuer from pg_stat_activity. The wrapper requires exact native equality for the current backend alongside UUID, original actor and PID. Controlled incarnation mismatch keeps those three other fields valid but substitutes -infinity: no result escapes. Restoring the actual native backend-start value admits the query. Values remain native timestamps; no JS Date or timestamp string conversion is used.

Initial direct stats lookup under the guardian role withheld metadata, so the valid enrolled request failed closed with Publication custody unavailable. The selected fixture now explicitly grants pg_read_all_stats to the internal guardian and uses pg_stat_activity; native checks establish that Alice, Bob and outsider cannot inherit this capability. Fresh PostgreSQL 17.9 receipt passes 339 observations. This additional capability is part of this fixture's qualified subset, not a default public role grant or a least-privilege production role proof.

Backend-start matching detects the tested mismatch; it is not a formal proof of globally unique session incarnation under clock/PID reuse, metadata-source authenticity or public token custody. Production must qualify the native identity source and isolate/retain its required capability. Issuer authorization, immutable lease/enrollment fields, reused tokens, owner cleanup, all read paths and final delivery remain open. Full gate stays 22/132; conditional proof pins are refreshed without native code verification claims.

### Isolated native incarnation metadata capability — 2026-10-09

Replaced the fixture guardian's broad pg_read_all_stats membership with a dedicated umf_sec_incarnation NOLOGIN/NOSUPERUSER/NOBYPASSRLS owner of the private stable, fixed-search-path original_backend_incarnation helper. It returns only the current backend's native start timestamp. Guardian receives only EXECUTE on that exact helper. Independent catalog evidence verifies stats capability on the helper owner, absence on guardian, restricted definer metadata, no PUBLIC EXECUTE and no resource/publication-registry SELECT for the helper role. Alice, Bob and outsider cannot invoke the helper or inherit the helper role; they also retain no stats membership. Enrolled wrong-incarnation refusal and restored admission still pass. Fresh PostgreSQL 17.9 receipt has 346 observations.

The prior guardian-wide metadata grant is historical spike evidence and is superseded by this isolated fixture capability. This is not a complete production privilege/dependency inventory or native metadata authenticity/uniqueness proof. Public issuer/cleanup/session/token custody, source drift and actual graph/Delta profiles remain open. Full gate stays 22/132; conditional source-isolation proof pins are refreshed without backend refinement claims.

### Exact publication release and sibling-owner counterexample — 2026-10-09

Two actual ordinary Alice publisher sessions enroll independently, buffer their admitted aggregate and lose only their native backends. The first tested cleanup still deleted by original actor; the exact-release-retains-sibling-publication control failed. Vulnerable source and actual failed control are retained in original-publication-actor-cleanup-vulnerable.ts.txt and original-publication-actor-cleanup-counterexample.json. The failing control did not retain its returned count, so no exact failed count is claimed.

Fixed cleanup deletes only the first exact publication UUID after its explicit trusted buffer discard. The second private lease remains, its live client still holds the original buffer, and another revocation refuses 42501 without acknowledgment or authority effects. Only after the second client detects native loss, discards its own buffer and releases its own UUID can revocation commit. Fresh PostgreSQL 17.9 evidence passes 354 observations. This closes the observed actor-wide cleanup interleaving in the authored enrolled spike, not public issuer/release authenticity, immutable lease history/token reuse, recovery, final delivery or graph/Delta custody. Full gate remains 22/132.

### Terminal publication lease history — 2026-10-09

Explicit exact release now marks the retained UUID row released instead of deleting it. Native primary-key history rejects attempted re-enrollment of the same UUID; release-state trigger rejects revival, deletion and truncation. Pending enrollment uses a partial actor/backend uniqueness index so terminal history does not block a future distinct lease. The query wrapper and writer-drain check consider pending rows only. Two-publisher exact release still retains the sibling blocker, and both terminal rows remain afterward. Fresh PostgreSQL 17.9 receipt passes 359 observations, including five terminal history controls.

These constraints apply to the enabled authored fixture triggers and ordinary DML paths. Pending record binding fields remain mutable under the trusted fixture issuer; immutable enrollment, privileged source/trigger changes, recovery/history retention bounds, public token/issuer custody and graph/Delta implementation remain open. Terminal UUID retention is not an authenticated lease protocol by itself. Conditional proof pins are refreshed without backend verification claims. Full gate stays 22/132. A read-only Astra re-review of the accumulated source/proof/protocol changes has been requested under the owner's existing review instruction.

### Publication retirement snapshot fence — 2026-10-09

Astra identified an unmodeled lease-retirement schedule. Actual PostgreSQL 17.9 replay confirmed that a retained ordinary repeatable-read snapshot could reuse a UUID already marked released; terminating that backend then allowed revocation while its second result buffer survived in the test host. Neither result was delivered to a consumer. The vulnerable source, full 370-observation run and focused counterexample are archived as original-publication-stale-retirement-* under the security evidence directory. Terminal history alone does not establish current admission.

The authored enrolled spike now requires read-committed retirement, takes the same exclusive native coordinator lock, and advances the non-MVCC sequence plus transactional authority epoch before pending->released. A live protected repeatable-read transaction prevents retirement acknowledgment (bounded lock timeout, unchanged pending state/epoch). After its native lease ends, retirement advances the epoch; an older idle repeatable-read snapshot refuses its first protected query, and a fresh snapshot refuses a terminal token. Trusted publication drain still precedes native lease termination and exact issuer retirement. Fresh native evidence passes 374 observations. The P2 discard evidence now retains explicit expected/observed booleans.

publication-retirement-formal.json contains four Z3 4.15.4 conditional algebra checks with SAT negative controls for unfenced terminal-state admission and retirement under retained readers. It assumes serialized lock participation and truthful snapshot/non-MVCC epoch comparison; it does not verify SQL ordering, runtime refinement, rollback/recovery, immutable enrollment, authenticated issuers, final delivery or full backend implementations. Existing publication-drain proof remains qualified separately. US-057-AC2/3/5/7 remain open; full acceptance remains 22/132. Astra re-review of the repaired protocol is pending.

Astra re-review of the repaired schedule found no remaining demonstrated bypass under the stated trusted-issuer and immutable-identity premises. Both lock orderings are explained conditionally: a retained protected read lock excludes retirement, and an earlier retirement invalidates an older eligibility snapshot at the post-lock epoch check. Actual opposite-order lock-wait and retirement-rollback schedules remain additional refinement work; no complete backend claim follows. Chromium 153.0.8010.12 correspondence passes all ten programs and fifteen refusal controls.

Retirement repair verification completed: nine component groups pass; evidence freshness/allocation validation passes 76 checks with zero failures; acceptance traceability remains current at 470 criteria. Fresh full security gate executes and accepts 22 cases, reports 110 missing required implementations, and remains failed across 132 required cases/28 allocated criteria. No component or formal receipt was promoted to backend acceptance.

### Retirement rollback and opposite lock order — 2026-10-09

Extended the same authored PostgreSQL 17.9 enrolled spike to execute both refinement controls requested by Astra. A rolled-back retirement restores the pending row and transactional epoch, while the native sequence advancement survives. Both the retained ordinary repeatable-read snapshot and a fresh ordinary statement refuse without a result. The fixture then explicitly advances a new coordinated generation, verifies the same still-pending lease can read, discards its buffer, and retires the exact UUID. This trusted fixture recovery is not a public recovery protocol or issuer qualification.

In the opposite ordering, an ordinary repeatable-read snapshot is established before retirement, but has no protected read lease yet. The separate retirement transaction updates the lease and retains its exclusive native coordinator lock. Independent pg_stat_activity/pg_locks observations establish that the ordinary protected query waits on that advisory lock and the retiring backend owns it. Retirement commits; the waiting reader then refuses without any result buffer under the obsolete snapshot. Native receipt truss-original-use.json now passes 395 observations, including ten opposite-order and eleven rollback controls.

publication-retirement-formal.json now has five conditional Z3 algebra checks. The new rollback check shows transactional epoch restoration cannot admit old or fresh snapshots while the non-MVCC generation remains strictly advanced; its rewound-generation negative control is SAT. This does not prove actual SQL, recovery, multi-lease custody or backend refinement. Chromium 153.0.8010.12 still matches ten programs and fifteen refusal controls. US-057-AC2/3/5/7 and the full 132-case backend gate remain open; these are actual scoped refinement observations, not additional accepted backend cases.

### Immutable pending publication enrollment — 2026-10-09

The authored PostgreSQL 17.9 lease trigger now refuses changes to a pending row's UUID, original actor, native PID or native backend incarnation. Four actual issuer-side ordinary UPDATE attempts each fail 42501 without result, followed by independent catalog comparisons confirming the original exact binding remains pending and unchanged. The wrong-incarnation admission control now enrolls an initially invalid incarnation, verifies ordinary refusal, retires that exact UUID and creates a distinct correctly bound UUID; it no longer rewrites an existing enrollment. Terminal history retains both that invalid enrollment and the two drained publisher enrollments. Native receipt passes 403 observations; Chromium 153.0.8010.12 still matches ten programs and fifteen refusal controls.

This qualifies enabled authored triggers against ordinary DML on the owned raw fixture. It does not authenticate insertion metadata, restrict a superuser/owner from replacing triggers or tables, establish a production issuer/recovery API, or implement actual graph/Delta custody. Conditional proof premises are unchanged: immutable identity is now separately observed in this fixture, not discharged for every backend. US-057 lifecycle acceptance remains open and the full gate remains 22/132.

### Typed original-query binding readiness — 2026-10-09

Fresh original inspection-owner replay confirms that the current Truss original-query consumer refuses explicitly bound Resource root discriminators with text, int4 and exact int8 carriers (including 9007199254740993). Each replay rehashes the complete physical binding into the original query profile and obtains a new original handoff before invoking the actual portable consumer; unchanged old handoff hashes are not used to fabricate this result. truss-query-typed-readiness.json retains all three sources/handoffs/refusals. This is a support-boundary observation, not actual installed graph execution or an accepted backend case.

The current raw-query-home/0.2.0 binding cannot establish typed private-carrier identity. Before admitting typed graph original-query use, its replacement must independently bind the complete root and carrier type selectors and exact key correspondence. Every source/join alias must apply the selected carrier type; collection completeness must range over eligible roots of only the selected type and count carriers of that same bound type/key, before application filters. A sibling type with the same local key must neither satisfy completeness nor affect errors, grouping, ordering or sums. Missing/unknown/native-null selectors must refuse. Original resource-independent action admission needs an explicit selected-type contract: the row-predicate emitter currently requires a native root discriminator parameter even for such actions. Do not drop type constraints or synthesize a native parameter to bypass that requirement.

Actual current Truss node/key/scalar/edge and history homes must come from original installed catalog correspondence, not guessed table names or synthetic projected rows. The next implementation boundary is a compiler-owned qualified typed physical binding plus independently checked native carrier/root correspondence, followed by actual Truss storage installation. This requirement does not redefine the full goal around raw-table support. All 30 Truss and all 30 Ashlar backend cases remain required and open.

### Quantified typed carrier completeness — 2026-10-09

prove-typed-source-completeness.py and typed-source-completeness-formal.json retain four Z3 4.15.4 conditional checks over arbitrary uninterpreted type/key domains, arbitrary eligible populations, and nonnegative carrier counts. The selected-type universal completeness specification equals anti-existence admission; a sibling carrier cannot fill a missing selected-type carrier; arbitrary sibling count/required-field changes leave admission unchanged when selected-type facts agree; and type-plus-key matching excludes a sibling's colliding local key. Every violation query is UNSAT, every weakened negative control is SAT, and every admitted positive population is SAT. The type-erased control explicitly admits a sibling carrier while the selected type has zero carriers.

These checks establish the admission algebra required by the next typed physical binding. They assume truthful complete eligibility/cardinality/availability, injective native/logical identities, independent original-value authorization and a stable authority/source cut. They do not prove a binding API, native SQL emission, database error isolation, query result/group/order behavior, original-source authenticity or actual Truss/Ashlar storage refinement. No JavaScript number or invented native table identity participates. Current raw-query-home/0.2.0 typed-root refusal remains required until those physical obligations are implemented and qualified. Full backend acceptance stays 22/132.

### Portable typed completeness SQL builder — 2026-10-09

Implemented security-source-completeness.ts in the actual Truss PostgreSQL package and integrated it into the original-query consumer's admitted raw completeness path. The builder binds separate root/carrier selectors, exact qualified key fields and required carrier fields. It refuses one-sided typing, malformed references, duplicate logical fields or physical key/carrier columns, unsupported selector carriers and noncanonical/out-of-range integers. Integer selector transport stays lexical with exact BigInt admission and native typed SQL literals. No graph table allocation is inferred.

The owned PostgreSQL 17.9 spike now executes fifteen additional physical witness controls across text, int4 and int8 selectors, including 9007199254740993. For each selector: a malformed sibling field does not block selected-type completeness; a sibling cannot fill a missing selected carrier; sibling duplicates do not block; selected duplicates refuse; an untyped carrier binding refuses before SQL. Native receipt passes 418 observations. These authored witness tables establish SQL behavior only; they are not actual installed graph stores, compiler-owned typed binding or independently qualified eligible-root/carrier RLS.

The raw consumer's ten owner-derived programs remain equivalent in Chromium 153.0.8010.12, including fifteen refusal controls. This browser run exercises the integrated raw path; typed native SQL witnesses have no separate typed browser qualification yet. Fresh original-owner typed-root readiness still refuses all three selectors under raw-query-home/0.2.0, as required until the typed binding, query alias selection and typed original-action contract are implemented. Nine component groups and 78 evidence checks pass; traceability remains current at 470 criteria. Full acceptance remains 22/132.

### Typed completeness browser qualification — 2026-10-09

Closed the explicitly recorded browser gap for the physical typed completeness builder. truss-source-completeness-browser.ts builds the actual Truss helper as browser ES modules, executes it in Chromium 153.0.8010.12, and retains three exact host/browser SQL correspondences for text escaping, int4 and int8 selector 9007199254740993. Eight independent malformed-input variants refuse with the declared unsupported result: absent carrier selector, signed64 overflow, noncanonical integer, empty qualified reference, duplicate qualified carrier field, duplicate physical carrier column, NUL namespace and unknown selector carrier. The browser has no Bun/process/Buffer globals and makes zero external requests. Source hashes and exact inputs/SQL/refusal outcomes are retained in truss-source-completeness-browser.json.

This establishes portable SQL generation/refusal behavior for this helper, alongside separately retained native typed witness SQL execution. It does not establish compiler-owned typed binding, typed application alias selection, original-action admission, root/carrier RLS, source authenticity or actual graph storage installation. Typed original-query admission remains refused under raw-query-home/0.2.0. No additional required backend case is accepted; the full gate remains 22/132.

### Astra typed-builder review and malformed selector repair — 2026-10-09

Direct inspection first found null/absent physical metadata escaping as incidental JavaScript TypeErrors; the helper now normalizes capture/generation failures to TRUSS_SECURITY_SOURCE_COMPLETENESS_UNSUPPORTED. Astra independently identified the stronger P2 defect: falsy provided selectors (null, false, zero or empty string) were interpreted as omitted and emitted untyped TRUE predicates. The helper now treats only undefined/absence as untyped, validates every provided selector as an object, and compares selector presence explicitly.

Chromium 153.0.8010.12 passes three exact typed SQL correspondences and 24 malformed input refusals, including all twelve both/root-only/carrier-only falsy combinations. Astra's direct Bun re-review confirms those twelve refusals, preserves valid omitted raw selectors, and reports no further actionable type/key SQL or proof-scope defect. Native PostgreSQL 17.9 still passes 418 observations; original raw-path browser correspondence passes ten programs/fifteen controls; typed owner readiness still refuses three profiles. Nine component groups, 79 evidence checks and the 470-criterion traceability check pass.

Retained typed-completeness-falsy-selector-counterexample-variant.ts.txt and its focused JSON receipt reproduce twelve untyped outputs when the identified conditions are reinstated. This is explicitly a reconstructed tested variant, not a claimed original source snapshot. Original historical receipt fingerprints were refreshed before an immutable pre-fix archive could be retained, so no original-byte archive correspondence is asserted. The defect and repair do not promote any graph/backend case. Current source/issuer/installed storage and typed query admission obligations remain open; full acceptance remains 22/132.

### Original Truss graph correspondence boundary — 2026-10-09

Current-source inspection retains four original source/contract pins in truss-graph-correspondence-readiness.json. stageNewCatalogCohort returns provisional_new_catalog_staging_only; its allocated rows do not establish committed current catalog admission. The native new-catalog collector independently reconciles Record/Field storage IDs and creation revisions with original archived declarations. Default property home selection applies only to absent binding under ADR-002; explicit home interpretation remains separate. CONTRACT-007 requires business-key components distinct from opaque object storage IDs, object/type_id/props and edge/rel_type_id/props correspondence, canonical allocated property member names, and independently qualified state/node/scalar joins for row homes.

Therefore a typed security binding must retain original current catalog/layout custody and explicit native property-home correspondence, rather than reconstructing flat column maps from a provisional allocation or review-only schema export. Record type IDs, relationship type IDs and association-owner type IDs are separate identities. JSON-home scalar extraction and ordered key-component materialization must use original property catalog IDs and original native codecs; row homes must preserve complete state/presence/absence/domain guarantees. Carrier construction must retain its own type/key/source proof through eligibility, original-value use and final publication. The current flat SecurityPhysicalType.fields column subset and raw-query-home/0.2.0 do not realize those graph obligations.

Next implementation must close original admitted catalog/layout observation, property-home projection/codec correspondence and business-key materialization together with the typed compiler binding. Typed completeness SQL alone cannot qualify actual graph queries. This is source-derived readiness evidence only, not executed current graph state, source authentication or additional accepted cases. Full gate remains 22/132; all graph and Delta requirements remain intact.

### Graph storage/business-key correspondence algebra — 2026-10-09

prove-graph-key-correspondence.py retains three Z3 4.15.4 conditional checks in graph-key-correspondence-formal.json using separate uninterpreted storage-identity and logical-business-key domains. A truthful original-key projection preserves equality selection; separately qualified selected-key uniqueness excludes equal business keys on distinct storage owners; changing unrelated storage identities cannot change logical selection when original keys agree. Each safety violation is UNSAT, weakened control SAT and positive population SAT. An unqualified storage-ID cast has a counterexample selecting the wrong original key. Distinct storage IDs without the independently admitted key constraint permit equal business keys.

The selected-key uniqueness premise applies only within the separately qualified logical type/key namespace, not globally across all graph objects. Projection truth, original catalog/property/codec correspondence and native key namespace uniqueness must be established by implementation evidence; this algebra does not prove them. No SQL, JSON/row codec, compiler projection, graph installation or backend case is accepted by this proof. The typed binding port must consume compiler-owned property decoding and original native correspondence rather than casting object storage IDs or implementing a parallel guessed decoder. Full backend gate remains 22/132.

### Private insert-counter diagnostic counterexample — 2026-10-09

Extended the actual owned PostgreSQL 17.9 private-fact probe beyond the prior three known restricted diagnostic families. pg_catalog.pg_stat_get_tuples_inserted(oid) remains executable by Alice, Bob and outsider and exposes the private Assignment insert count. A second unrelated Eve Assignment advances that count exactly once for all three ordinary identities while each independently checked authorized Resource set stays unchanged. Restricting that exact additional function blocks ordinary invocation without changing authorized reads. pg-private-diagnostics.json now retains 21 observations including both worlds and the scoped restriction.

All catalog privilege changes occur only in the disposable owned fixture. These database-wide PUBLIC restrictions are a prototype, not a selected multi-tenant production deployment or a proved per-user policy. Restricting four known families does not establish complete metadata/statistics/function/view closure. pg-raw.B10 and US-056-AC8 remain open; direct private-table SELECT denial cannot qualify them. The next backend implementation must inventory and qualify the complete ordinary diagnostic surface and deployment scope, or refuse ordinary paths that cannot meet the selected privacy guarantee. Full acceptance remains 22/132.

### Deny-first native diagnostic candidate — 2026-10-09

Extended the owned PostgreSQL 17.9 diagnostic spike with a separately scoped candidate: ordinary subjects have no direct SELECT on security_raw relations/views or pg_catalog relations/views and no explicit EXECUTE on pg_catalog routines; the excluded guardian receives the built-in execution capability required by the private fixed-search-path read routine. Ordinary callers receive only that routine's explicit EXECUTE for this read surface. Forced resource RLS and SESSION_USER-based membership still govern its original authorized rows. Existing direct-RLS profile evidence is neither silently replaced nor promoted by this candidate.

Alice, Bob and outsider retain their actual ordinary native identity and exact authored authorized rows. Each refuses six known direct-root/catalog-view/cumulative-statistics/relation-size/private-EXPLAIN probes without output. Independent assessor ACL queries confirm zero effective SELECT privileges on all selected pg_catalog and security_raw relations/views, zero effective explicit EXECUTE privileges on catalog routines, and no CREATE in pg_catalog or public for each actor. pg-private-diagnostics.json now retains 27 observations. All catalog PUBLIC ACL changes are isolated to the disposable owned database.

These native ACL and row outcomes are stronger than a growing list of individual statistics revocations, but do not establish full diagnostic closure: implicit operator/type/language/extension behavior, other command surfaces, owner/dependency/role change closure, deployment isolation, approved client compatibility, current authority and final delivery still need independent qualification. Full graph and Delta implementation remains required. pg-raw.B10/US-056-AC8 and the full gate remain open at 22/132.

### Deny-first native command and wrapper controls — 2026-10-09

The separate PostgreSQL 17.9 candidate now revokes ordinary direct EXECUTE on security_raw helpers and regrants only the admitted protected-read routine for this surface. Guardian retains its own helper authority and the separately excluded built-in execution capability. Existing direct-RLS profile behavior is unchanged outside this candidate's disposable fixture.

For Alice, Bob and outsider, COPY of private Assignment, JSON EXPLAIN of the private table, direct allowed() invocation, and a caller-owned temporary SECURITY DEFINER function forwarding to the private statistics getter all refuse with no output. The temporary wrapper runs under its ordinary owner's rights and cannot acquire the guardian capability. Separately, nonexecuting JSON EXPLAIN of the admitted definer read call remains identical after an unrelated Eve Assignment is added and analyzed; exact authorized rows also remain identical for all three identities. Native receipt now retains 33 observations.

These tests address actual native command and caller-wrapper paths and a specific observable plan boundary. They do not prove timing, executing EXPLAIN, every implicit operator/type/language/extension surface, privilege/dependency drift, public runtime activation or streaming/final-release custody. pg-raw.B10 remains open; no raw, graph or Delta case is promoted. Full acceptance stays 22/132.

### Native operator/function ACL boundary — 2026-10-09

The owned PostgreSQL 17.9 candidate now tests an installer-created unary operator in the ordinary reachable security_raw namespace, backed directly by the denied pg_stat_get_tuples_inserted(oid) function. Alice, Bob and outsider all refuse both direct function and operator invocation with no output. An explicit temporary per-role EXECUTE grant then makes the identical operator return the exact assessor-observed private count for all three identities, proving the operator/control is live rather than malformed. The grant is revoked and the operator removed before fixture cleanup. pg-private-diagnostics.json now retains 39 observations.

This establishes native behavior for that exact operator/getter/role path and the value of its explicit function privilege boundary. It does not establish every operator, cast/type, language/extension or changed dependency under a full deployment. The positive control intentionally admits the diagnostic only inside the owned disposable fixture and is retained as a negative privacy profile. pg-raw.B10 remains open; full acceptance remains 22/132.

### Native raw PostgreSQL scale and statement-budget evidence — 2026-10-09

pg-raw-scale.py executes the actual forced-RLS raw fixture at 1,000, 100,000 and 1,000,000 additional Resources, with deterministic complete A/B ownership. All three original ordinary identities match independent authorized counts and exact boundary identity/value samples at every scale. Actual total stored rows are independently checked, including the five baseline Resources. Full protected Alice and excluded-assessor EXPLAIN ANALYZE JSON plans are retained in pg-raw-scale.json; the assessor is explicitly outside ordinary protection.

The latest run records protected/assessor execution times of 5.796/0.050 ms, 592.880/2.505 ms and 6176.115/14.193 ms at the three sizes. These are distinct access paths and output populations on one owned host, not a general percentage-overhead promise or SLA. The protected function checks membership per source row. A selected native 1 ms statement timeout on the million-row aggregate refuses with SQLSTATE 57014 and no stdout/partial aggregate. Every native subprocess is bounded and only the original UUID-labeled fixture is removed after source correspondence checks.

This completes empirical scale-plan and database-statement-budget observations for the authored raw component. It does not prove portable runtime cancellation/drain, reusable connection cleanup, streaming/final-publication custody, arbitrary workload budgets, complete diagnostic closure or actual graph/Delta performance. pg-raw.B16/US-056-AC10 remain open until the admitted runtime/backend profile exercises those obligations. No required case is promoted; full acceptance stays 22/132. Nine component groups, 82 evidence checks and the 470-criterion traceability check pass.

### Actual Truss runtime native-budget recovery — 2026-10-09

Extended the actual pg-runtime ordinary-principal component, with original in-memory/disk protocol correspondence, to test a supplied cancellation context and a native statement timeout separately. Cancellation remains unsupported: begin refuses before any original native query or BEGIN. A normal transaction then sets a selected native 1 ms budget and calls pg_sleep; original native response proves SQLSTATE 57014, zero DataRow frames, ReadyForQuery E and server_error journal outcome. A subsequent application statement receives 25P02, proving the failed transaction was not silently treated as recovered.

Only explicit original-connection ROLLBACK restores the lease. A new transaction on the same native PID and original effective principal returns exact authorized Resource IDs, then rolls back/releases normally. No transport quarantine is asserted for this fully observed native server error; no cancellation or rollback result is inferred from deadline expiry alone. The native Truss principal receipt passes 65 observations, including complete original journal request/frame/outcome and consecutive custody evidence. Nine component groups pass.

This qualifies selected native server-budget recovery on the existing original runtime, not AbortSignal delivery, concurrent cancellation, uncertain transport/commit recovery, portable resource-budget admission, final-publication or full B16/backend acceptance. Current runtime principal preflight reads pg_roles directly; it therefore cannot be combined unchanged with the deny-first candidate that removes all ordinary catalog SELECT. That candidate needs an original qualified private principal observation mechanism without weakening actual caller/bypass/reset checks. Both profiles and this compatibility gap remain explicit. Full gate stays 22/132.

### Private principal observer native candidate — 2026-10-09

The deny-first PostgreSQL 17.9 fixture now executes a least-privilege private principal observer. Its non-login, non-superuser, non-bypass owner can SELECT pg_roles and execute exactly current_setting(text), text(boolean) and nameeq(name,name); it has no private Assignment SELECT or retained schema CREATE privilege. The zero-argument fixed-search-path SECURITY DEFINER helper selects SESSION_USER internally. Original and effective caller identities are observed outside that helper, so SET ROLE remains visible rather than becoming the helper owner. Ordinary users still cannot read pg_roles, call current_setting directly or supply another actor to the helper.

Fresh pg-private-diagnostics.json retains 61 observations, including original/effective identity, lower-role visibility, RESET ROLE/SESSION AUTHORIZATION/ALL restoration, changed client encoding, and installer-only BYPASSRLS/SUPERUSER positive controls restored immediately. Initial native failures identified explicit boolean-to-text and name equality dependencies. Outside-helper identity uses native name carriers: casting those identities to TEXT requires a further ordinary function privilege under the deny-first ACL. The candidate does not grant that privilege. Any runtime integration must qualify the two native name response fields and the three TEXT observer fields explicitly; weakening caller, bypass or encoding checks is not an integration strategy.

This is native feasibility evidence for the principal-observation obligation in CONTRACT-063 and the compatibility gap identified under US-056-AC8. Actual pg-runtime still uses direct pg_roles preflight; no public private-observer option or deployment admission is implemented. Current owner/dependency/ACL custody, change invalidation, complete diagnostic closure, graph/Delta enforcement and final publication remain open. No required backend case is promoted; full acceptance remains 22/132. Astra review of the candidate is requested under the existing owner instruction.

### Principal observation review and native response validation — 2026-10-09

Astra ultra reviewed the private principal candidate and source-current 61-observation receipt; no demonstrated bypass was found. Review supports a scoped runtime port with exact native carriers, independently observed routine metadata and pooled failure controls. Added the requested independent installer inspection of pg_proc and expanded ACLs: isolated observer owner, SECURITY DEFINER, STABLE, zero arguments, fixed search_path=pg_catalog, no PUBLIC EXECUTE and selected ordinary EXECUTE. Fresh native privacy receipt now records 62 observations. This metadata is installation evidence inside the owned fixture, not persistent deployment authenticity or change closure.

The actual Truss pg-runtime direct principal path now requires all five RowDescription fields to have native TEXT OID 25 and wire text format 0, in addition to exact ordered names, one complete row and original/effective caller, privilege and UTF8 checks. Native principal replay passes 65 observations; subject replay passes 82 observations. No private-observer runtime option is yet delivered. The proposed port still requires native name OIDs 19 for its first two outside-definer caller fields, TEXT OIDs 25 for the remaining three, and pooled reset/missing/altered helper/elevated actor/LATIN1 controls. US-056-AC5/8, complete backend requirements and full acceptance remain open at 22/132.

### Actual private principal/subject runtime composition — 2026-10-09

Actual Truss pg-runtime now accepts the experimental ordinaryPrincipalObserver selection defined by CONTRACT-063. It captures qualified identifiers synchronously, requires a pinned principal and uses the selected zero-argument helper without fallback. Original/effective caller identity remains outside the definer; ordered OIDs [19,19,25,25,25], text format, one complete UTF8 row, actual caller pin, non-superuser/non-bypass and UTF8 encoding remain mandatory. Missing/malformed/unavailable observations close admission with original quarantine custody.

Fresh truss-private-principal.json passes 81 native observations on the owned PostgreSQL 17.9 restricted fixture, with actual pg8.16.3 protocol and independently retained memory/disk journal correspondence. Three ordinary actors return independent oracle-authorized rows; pooled reacquisition preserves native PID and restores effective identity. Missing, bad-shape, false privilege declaration, empty/multiple observations, wrong pin, elevated native actor, changed encoding and altered SECURITY INVOKER helper refuse. Independent pg_proc/ACL metadata remains explicit. A direct-catalog principal profile also refuses under this selected restriction rather than silently activating.

Astra found an integration regression: principal OID selection had also changed subject output validation. It is repaired: subject outputs always require TEXT OID25. Native combined tests admit valid TEXT output and refuse NAME, absent and ambiguous keys. The selected actorCarrier=name passes actual SESSION_USER without an ordinary name-to-text function grant; text remains the default. Unknown/null/falsy input carrier selections refuse before acquisition. The fixture observer owner, not ordinary users, receives the conversion dependency required by its TEXT subject result. Astra re-review of current source and source-current 81-observation evidence reports no remaining actionable defect within this component scope.

Existing direct principal and subject native replays pass 65 and 82 observations; nine component groups pass. This implements the previously missing runtime composition path, not authenticated deployment/change custody, complete diagnostic closure, actual graph catalog/codec/security adoption, Delta implementation, final delivery or full backend acceptance. US-056-AC5/8 and all unaccepted backend cases remain required.


Verification after private-observer composition: twenty Z3 4.15.4 conditional checks are refreshed against CONTRACT-062/063. The complete 132-case gate freshly executes the implemented runners and remains failed with 110 missing/failed required cases (22 accepted); all 28 complete security criteria remain open. Evidence validation passes 83 checks, aggregate components pass nine command groups, and the 470-criterion traceability ledger is current. New runtime component evidence does not replace those required backend cases.

### Actual scale runtime and bounded response window — 2026-10-09

The owned raw PostgreSQL17.9 scale fixture now executes million-row ordinary aggregates through actual Truss pg-runtime/pg8.16.3 with original memory/disk protocol correspondence. The first positive run failed into quarantine under the fixed 5000ms response window while the protected native plan measured 6201.223ms; close masked the preceding exception. scale-fixed-deadline-failure.json retains source archives and original uncertain journals. It does not assert an independently captured exact deadline event or native SQLSTATE for that failure.

CONTRACT-063 now defines the experimental originalResponseTimeoutMs option (default5000, selectedinteger1..60000). Runtime construction validates and captures it synchronously; originalQuery also validates the bounded window. Expiry remains uncertain transport custody, never native cancellation/rollback acknowledgment. The scale fixture selects30000ms to admit the known positive workload, separately from the native1ms statement budget. Invalid zero/negative/oversized/fractional/nonfinite/string/null selections refuse. Response timing remains subject to host event-loop/transport scheduling; no arbitrary-workload SLA or completed cancellation is asserted.

Fresh pg-raw-scale.json passes three scale stages (1k/100k/1M additional resources plus the authored baseline), native CLI timeout, and39 actual-runtime observations across76 original journaled queries. All ordinary actors return exact text aggregate counts. The million-row native budget returns57014 withzeroDataRows andReadyE; a following statement returns25P02, and only explicitROLLBACK restores the same nativePID and exact authorized baseline IDs. The ownerless recovery control now uses the actual RO key rather than the erroneous R0 spelling found by Astra. Selected cancellation context still refuses beforeBEGIN.

Latest paired protected/excluded-assessor plan times are5.780/0.055ms,595.005/2.316ms and6140.543/9.776ms. They are distinct access paths/output populations on one host, not a percentage-overhead guarantee. B16 remains unregistered pending an independent scale oracle, freshgate UUID/case binding, complete actual native inventory and explicit external runtime source-binding policy. Astra confirms the exact B16 assertion can be exercised at this authored stable cut without waiting for unrelated graph/Delta, diagnostic or revocation-streaming cases; those full requirements remain separately open. No case is promoted by this component receipt.


Post-deadline verification: existing principal, subject and combined private-observer replays pass65/82/81 native observations with current runtime/source/typecheck pins. Nine component command groups pass. Twenty Z3 conditional checks are refreshed against the amended contracts. The complete gate freshly remains22/132 accepted,110 missing/failed required cases andall28 security acceptance criteria open; the470-criterion ledger is current. B16 registration is the next implementation task, with actual driver and scale observations now available but no acceptance substitution.

### Raw PostgreSQL B16 accepted at authored stable cut — 2026-10-09

Implemented and freshly accepted pg-raw.B16 under STP-056/US-056-AC10. The reviewed runner tests exact total resource populations1000/100000/1000000, independently authored aggregate counts and samples for three ordinary SCRAM identities, paired protected/excluded-assessor native plans and actual pg-runtime execution at every scale. The million-row native1ms budget produces57014 withzeroDataRows/ReadyE; subsequent use produces25P02 until explicitROLLBACK, after which the same original nativePID returns authorized baseline IDs. Unsupported cancellation context refuses before nativeBEGIN. The recovery candidates include the actual ownerless RO record.

pg-raw-B16.json retains133 exercising observations, native objects/RLS/policies/routines/roles/membership/grants/indexes/constraints/authentication, all three plans and54/54/76 original journaled queries. Eighty-three source pins include every adapter module, independent oracle and selected managed dependency source:14 packages/70 JS/JSON files. Actual driver resolution is observed from both the UMF probe and Truss runtime importer. Astra caught and repaired the initial importer-origin gap and oracle-budget drift risk; supported statement budget/error states are validated and consumed, recovery expectations are consumed, and exact required populations are enforced. Re-review found no remaining actionable source/evidence-binding/native-inventory defect before the fresh gate.

The gate explicitly permits shared pg-runtime and task-managed dependency sources for raw PostgreSQL, as specified by CONTRACT-063; this does not imply graph storage qualification or authenticate source issuers by hashes. The complete gate now accepts23/132 required cases and leaves109 missing/failed. All28 complete security acceptance criteria remain open; AC10 still has other required evidence/implementations. B16 establishes only this authored raw workload at a stable cut, not arbitrary workloads, timing SLAs, streaming/final delivery, complete diagnostic closure or graph/Delta behavior. The older pg-raw-scale.json component uses additional populations plus baseline and is distinct from the exact-total B16 acceptance receipt.


### Composite identity native witness and verification — 2026-10-09

The original `tools/security/pg-raw-identity-probe.py` now retains 32 PostgreSQL 17.9 observations. Four independently authored two-component namespace/resource pairs exercise delimiter collisions, empty components, equal resource labels across namespaces and normalization-distinct Unicode. Actual composite primary/foreign keys and forced RLS use exact component equality; ordinary SCRAM Alice/Bob connections see their respective Project-owned rows and the outsider sees none. A deliberately delimiter-concatenated policy exposes both colliding resources to both assigned readers. Restoring exact component equality restores separate visibility. This is a fixed authored native installer witness, not compiler admission, hash routing, subject-composite coverage, arbitrary cross-home correspondence or full pg-raw.B13 acceptance.

`pg-raw-identity-component.json` pins the original probe, fixture helper, baseline SQL, new composite SQL and independent oracle. The earlier Docker-unavailable attempt remains historical evidence; the present OrbStack replay succeeds. Refreshed gate-receipt regression passes four controls; aggregate components pass nine command groups; evidence validation passes 85 checks and the 470-criterion ledger is current. Complete backend acceptance remains 23/132, with 109 required cases missing/failed and all 28 complete security criteria open.


### Qualified composite subject identity — 2026-10-09

The identity component now passes 41 native PostgreSQL 17.9 observations. The independent oracle assigns two distinct namespace/Staff identities to original SCRAM Alice and Bob logins, with respective Project A/B assignments. Composite subject primary keys and assignment foreign keys preserve the complete identity. The private RLS helper binds SESSION_USER to its subject and joins assignments using both namespace and subject ID. Both ordinary actors receive their respective resource and the outsider receives none. Deliberately omitting the subject namespace makes both assigned actors receive both delimiter-pair resources; restoring the exact join restores the independent oracle outcomes. The outsider is checked in the unsafe and restored profiles too.

This exercises the complete-identity premise of the retained logical key correspondence analysis at one fixed native corpus. It does not prove universal native/compiler refinement or authenticated subject enrollment. Source-current `pg-raw-identity-component.json` retains all 41 observations. Aggregate components pass nine groups and evidence validation passes 85 checks. Hash-routing collisions, wider cross-home identity and admitted compiler lowering remain open; no full B13 promotion or acceptance-count change is made. The full gate remains 23/132 accepted, 109 required cases missing/failed, and all 28 complete security criteria open.


### Native hash collision and conditional key refinement — 2026-10-09

CONTRACT-062 requires complete typed Key identity rather than a hash alone; CONTRACT-063 requires exact native correspondence. The independently frozen PostgreSQL 17.9 corpus now includes `hash-key-13383` and `hash-key-42423`. Separate original native evaluations verify both `pg_catalog.hashtext` results as exact text `-1315717682` before the collision test proceeds. The native fixture stores generated routing hashes, retains full resource IDs in primary/foreign key constraints, and indexes candidate hashes. Forced RLS consults a private helper that compares both candidate hash and complete resource ID before accepting Project assignment. Ordinary SCRAM Alice/Bob see their respective resources; outsider sees none. Replacing that predicate with hash-only equality leaks both resources to both assigned actors; restoring exact equality restores the oracle. All three profiles independently check outsider denial.

The source-current identity receipt passes 52 native observations. This adds a fixed real native hash collision to the preceding scalar/composite resource and qualified subject witnesses. It does not qualify arbitrary hash algorithms, hash-based subject enrollment, cross-home/graph identity or public compiler admission. Full pg-raw.B13 remains required and unaccepted.

`tools/security/prove-hash-key.py` and `hash-key-formal.json` retain two conditional Z3 4.15.4 checks over an unbounded uninterpreted complete-identity domain, arbitrary authorization predicate and deterministic non-injective hash. Independently stated direct authorization equals existential lookup with hash plus exact identity. The violation is UNSAT; a colliding positive population and a hash-only false-positive control are SAT. Complete truthful identity equality, the same hash semantics on each side, complete current facts and native eligible-only evaluation remain physical/authority premises. This is a refinement of the abstract lookup expression, not a proof of the SQL implementation or complete compiler/backend.

Aggregate components pass nine groups; evidence validation now includes the new proof receipt and passes 86 checks. The full acceptance state remains 23/132, with 109 required cases missing/failed and all 28 complete security criteria open.


### Raw PostgreSQL B13 accepted at authored stable cut — 2026-10-09

The fresh complete gate accepts pg-raw.B13 under US-056-AC1 with 144 observations. The fixed PostgreSQL 17.9 raw profile uses non-null ordered TEXT identity components, explicit C collation and exact session-bound subjects. It does not hash subject identities. Scalar case, normalization-distinct and supplementary Unicode, delimiter-bearing composite keys, equal Staff labels in distinct namespaces, and a real native hashtext collision remain isolated. Genuine case-distinct quoted/unquoted table homes carry equal local resource labels with opposite Project ownership. Deliberately lossy delimiter, subject-label and hash-only policies disclose both resources to assigned actors; exact restoration recovers the independent oracle. No general compiler activation or graph/lifecycle support follows from this case.

The public actual pg-runtime decoder independently exercises scalar/composite/hash/quoted homes and unfiltered final corpus reads for three ordinary SCRAM actors. It retains 81 original queries with exact memory/disk request-frame-outcome correspondence and unique complete custody. Missing and duplicate-replacement controls refuse. Exact independent schema/table/routine privileges and effective column permissions are asserted, including no authority-table writes; all 16 installed identity/authority fact sets are independently compared. Native columns/collations, ordered constraints/FKs, generated hash expressions, routines/policies, role attributes/membership, authentication, encodings, client build and image identity are retained. Eighty-six source bindings include actual adapter modules and the selected managed pg8.16.3 closure (14 packages/70 files); actual resolution from both probe and importer matches the selected entry.

Astra ultra identified the quoted-home, decoder, full-fact, privilege-assertion and journal-bijection gaps, then found no actionable issue after the fresh 143-observation component replay. The first gate attempt refused duplicate relative/absolute source-path bindings; the second refused unordered JSONB member serialization in one private fact comparison. Both attempts and source archives are retained as b13-registration-path-failure.json / b13-registration-json-order-failure.json. The corrected runner pins one exact test-source spelling and applies the membership runner's existing unordered-object normalization to evidence, preserving arrays/scalars and original journal bytes. The third fresh full gate accepted B13.

Current full acceptance is 24/132, with 108 required cases missing/failed. All 28 complete security criteria remain open. Ten component command groups pass, including repeatable strict identity-runtime TypeScript checking; evidence validation passes 88 checks and the 470-criterion ledger is current. B13 qualifies the authored raw identity assertion at fixed stable cuts. Arbitrary cross-home/hash algorithms, authenticated enrollment/issuers, complete native/compiler refinement, live concurrent authority/final publication, full raw backend and actual graph/Delta acceptance remain independently required.


### Raw write action fold component — 2026-10-09

Under US-057-AC1, CONTRACT-062 and TD-057, the PostgreSQL 17.9 raw write fixture now retains 246 observations across 29 independently authored vectors in pg-raw-write-component.json. Its three non-null TEXT fields require object actions, changed-field actions and distinct changeOwner/changePolicy grants. Inline owner_project is both ownership and a live policy dependency. Native scenarios isolate original/proposed membership, original/proposed ownership and policy actions, and missing original/proposed writeValue grants across owner changes. Missing writeId refuses a rename; a positive rename succeeds without unrelated changeOwner permission. An active reader with all field permissions but no update grant sees zero updated rows for a no-op. Unchanged value does not require writeValue; a forbidden NULL transition refuses before the NOT NULL constraint.

A dependent data-modifying CTE processes an authorized mutation before a forbidden mutation. A private nontransactional sequence independently witnesses that processing; complete committed business snapshots remain unchanged after refusal. This sequence is excluded integrity instrumentation, not business state or a claim of zero diagnostic effects. Ordinary actors cannot write private grant facts, TRUNCATE, disable the trigger or read that sequence.

write-fold-formal.json retains nine Z3 4.15.4 conditional checks: the independent quantified obligation specification equals the expanded selected-state enforcement model, and ownership, policy-change, changed identity-field and changed value-field actions are separately necessary at OLD and NEW. Every violation is UNSAT, permitted populations SAT and weakened controls SAT. Complete current session-bound authority, truthful classifications, exact non-null text semantics and faithful native execution remain premises. This is not a proof of actual SQL/compiler refinement, nullable profiles, concurrent revocation or publication.

Ten aggregate component command groups pass; evidence validation passes 90 checks and the 470-criterion ledger is current. L01 is not registered or accepted: original public pg-runtime decoder/journal custody, explicit same-session failed-transaction rollback/recovery and complete native inventory remain next requirements. Full acceptance remains 24/132 with 108 required cases missing/failed and all 28 complete security criteria open. Actual graph and Delta implementations remain in scope.


### Raw write explicit session recovery component — 2026-10-09

Astra ultra found no actionable defect in the 246-observation/29-vector action fold and nine conditional proofs. A subsequent explicit ordinary SCRAM session recovery probe now brings pg-raw-write-component.json to 253 observations. Eve processes an authorized WA write, receives 42501 on a forbidden WE ownership change, and then receives 25P02 for a query in the failed transaction. Explicit ROLLBACK restores the complete business snapshot. Native TEXT backend PID observations before failure, after rollback and after a fresh successful no-op transaction agree; the fresh transaction is also explicitly rolled back. The private excluded sequence witnesses two authorized mutation executions. This is psql session evidence, not public pg-runtime journal or native protocol acknowledgment evidence. Original driver custody and complete inventory remain prerequisites to L01 acceptance. Ten component groups, 90 evidence checks and the 470-criterion traceability check pass. Full acceptance remains 24/132 and the full goal remains active.

Astra ultra re-reviewed the source-current 253-observation session component and found no actionable defect within its declared psql scope. Public-driver protocol custody remains open.


### Raw write original runtime composition — 2026-10-09

The source-current pg-raw-write-component.json now passes 718 observations across the same 29 independently authored write vectors. tools/security/pg-raw-write-runtime.ts imports the actual Truss pg-runtime and executes each vector as an ordinary SCRAM actor against the owned PostgreSQL 17.9 loopback fixture. A fixed validated RETURNING boundary selects original id, owner_project and value carriers. Decoded columns, TEXT cells, affected-row text and command labels match the independent oracle; successful commands receive explicit committed acknowledgment. Rejected commands yield 42501, then 25P02 inside the failed transaction, explicit rolled_back acknowledgment, a fresh transaction with the same native TEXT backend PID, and another explicit rollback. Healthy release observes no quarantine.

The component retains 525 original query journals. Exact memory/disk request, frame and terminal-outcome correspondence is bijective; missing-custody and duplicate-replacement controls refuse for every vector. Both importer and probe resolve the independently selected managed pg8.16.3 driver. Eighty-five pinned sources include the actual runtime modules, selected dependency closure, reviewed collector, fixture and independent oracle. The excluded host compares complete committed business snapshots and private approval counts after every runtime vector. It explicitly restores the authored seed and private sequence between the separate runtime and psql phases; this is not an ordinary mutation or rollback path. The preceding psql session controls also replay successfully.

Strict TypeScript verification is added to the aggregate component runner; eleven groups pass. Evidence validation passes 90 checks and the 470-criterion ledger is current. Complete independent native inventory, physical/refinement and current-authority coordination remain required before L01 registration. Full acceptance remains 24/132, with 108 required cases missing/failed and all 28 complete security criteria open; actual graph and Delta implementations remain required. Astra ultra review of this new runtime composition is pending.


### Raw write inventory and rejected-response controls — 2026-10-09

Astra ultra found one verification gap in the preceding runtime component: execute throwing and journal bijection did not separately exclude DataRow frames before ErrorResponse. Retained originals showed no actual disclosure. The corrected runtime selects the unique original write statement/custody and asserts server_error, zero DataRow/CommandComplete frames, one 42501 ErrorResponse and one final ReadyForQuery E. A compatible three-TEXT-field RowDescription/DataRow is injected only into an independent in-memory inspection. Native ResponseIngress feed/finish accepts that protocol-valid response, while the security assertion refuses it. Original journals are unchanged.

The excluded-host pg-write-inventory.py collector records the write schema's objects, columns, constraints, routines, policies, roles and memberships; it independently checks exact object/routine/policy names, guardian-owned forced RLS, three non-null TEXT/C resource columns, native PK/FK, enabled BEFORE mutation trigger, SECURITY DEFINER ownership and fixed search_path, and exact selected-state policy expressions/commands. Every ordinary actor's effective schema, table, column, routine and sequence privileges is compared against an independent allowlist; private grants and instrumentation have no ordinary access, and ordinary CREATE/TRUNCATE/REFERENCES/TRIGGER rights are absent. Host authentication is SCRAM; image and client build are retained. Recollection after both runtime and psql phases matches the complete collected installation metadata at this authored stable cut.

The source-current component now passes 863 observations across 29 vectors. Eleven aggregate command groups, 90 evidence checks and the 470-criterion traceability check pass. These are scoped installation and response observations; full dependency/authority inventory qualification and Astra review remain required before L01 registration. Native/compiler refinement, live concurrent authority/final publication and actual graph/Delta implementation remain required. Full acceptance is unchanged at 24/132 with 108 missing/failed required cases and all 28 complete security criteria open.


### Raw write review corrections and L01 registration — 2026-10-09

Astra ultra found that the first 863-observation inventory receipt retained 20 expected/observed mismatches despite status=passed: enriching a mutable privilege object after comparison changed earlier evidence. That historical receipt is preserved as write-inventory-alias-failure.json with status=failed and explicit qualification. The runner now copies both observation sides and rejects any final mismatch or duplicate observation ID before publication. A dependency-inventory attempt also refused a host variable-name collision before recording success; the corrected collector uses separate names for dependency descriptors and column privilege expectations.

The fresh corrected component passed 961 matching observations with unique IDs and current source hashes. It records original security_raw schema/objects/columns/key/login constraints, guardian ownership, non-elevated ordinary roles and a non-login guardian, and effective table/column privileges on employee, m2m_employee_project and project. Ordinary enrollment/assignment/project mutation probes refuse. Complete enrollment, assignment, action-grant and Project fact sets are independently compared after both execution phases. Installation metadata is independently recollected across the two phases. Astra ultra found no remaining implementation blocker for the fixed L01 assertion; partial-row and receipt-aliasing findings are resolved.

pg-raw.L01 is now registered with the reviewed original test source, independent oracle and exact 87-source implementation closure. The runner preserves the gate-supplied UUID/case binding, checks its exact selected source set, adds ordinaryActor and a canonical nativeInventory digest, retains managed-source execution metadata and serializes observations canonically. The complete 132-case gate and a separate component refresh are executing; registration alone does not imply acceptance. General compiler/refinement, live authority/final publication, every other lifecycle case and actual graph/Delta implementation remain required.


### Raw PostgreSQL L01 accepted at authored stable cut — 2026-10-09

The fresh complete gate accepts pg-raw.L01 under US-057-AC1 with 962 matching observations, its preserved gate UUID and exact 87-source bindings. The independently authored PostgreSQL17.9 raw profile exercises create/delete/update and ownership-changing writes across original/proposed states, changed-field actions and separate changeOwner/changePolicy permissions. Native hidden-original zero-row commands remain indistinguishable from absent targets. Dependent multirow refusal preserves the complete committed business snapshot, with excluded private sequence instrumentation demonstrating prior authorized processing. Direct ordinary authority mutations, trigger disable and TRUNCATE refuse.

The actual public pg-runtime decodes native RETURNING values/counts and commits permitted commands; rejected commands retain zero data/command frames, 42501 then25P02, explicit rollback acknowledgment and same-native-PID recovery. All525 original query journals have bijective request/frame/outcome custody, with missing/duplicate and protocol-valid partial-row controls. Both execution phases retain independent full authority fact comparisons and installation descriptors, including original enrollment/assignment/project key/login constraints and ordinary effective table/column privileges. NativeInventory ordinaryActor/digest, executed managed-source metadata, SCRAM, image/client and dependency resolution are retained. A separate source-current component passes961 observations. Astra ultra found no remaining implementation or registration defect after the archived receipt-aliasing failure and partial-row/dependency corrections.

The complete gate now accepts25/132 required cases and leaves107 missing/failed. All28 complete security acceptance criteria remain open. Eleven aggregate command groups,91 evidence checks and the470-criterion traceability check pass. L01 qualifies this authored stable-cut raw assertion; it does not accept L02 or any other remaining case, general compiler lowering/refinement, live concurrent authority/final publication, or actual graph/Delta implementations. The full original goal remains active.


### Raw L02 field-authority component and registration — 2026-10-09

The additive L02 fixture preserves the accepted L01 source/corpus and requires US-057-AC1 field-authority behavior under TD-057. Jules has active A/B membership and object, ownership-change and policy-change grants, but lacks writeOwner at B. Separate OLD/NEW owner changes refuse; the same actor's value-only update at B permits. Existing baseline ID/value/policy cases and independent Dave/Frank positive controls show unchanged ownership/policy fields do not require those extra actions. Actual runtime and plain SQL execution retain complete authority/effect snapshots, native inventory, original responses, transaction recovery and private mutation-denial controls.

Astra requested the same-actor positive control and explicit read qualification. The ordinary PostgreSQL WHERE/RETURNING profile requires read visibility at selected write states. Every actor's native read/create/update/delete grid across A/B/D is independently compared with enrollment, active assignments and authored grants; write eligibility implies read permission in this corpus. TD-057 and receipts explicitly exclude write-without-read and full SQL/compiler admission from the symbolic fold. Eleven Z3 conditional checks add distinct OLD/NEW owner-field necessity to the independently quantified authorization algebra.

The first additional seed attempt was correctly refused by guardian-owned forced RLS. The corrected excluded installer step seeds the two new rows while the mutation trigger is disabled, then re-enables it before ordinary execution; no ordinary privilege or policy is weakened. Fresh pg-raw-field-write-component.json passes1119 matching observations with unique IDs across34 vectors and retains source-current proof evidence. Twelve component groups,93 evidence checks and the470-criterion ledger pass. Astra ultra found no remaining scope/isolation blocker to fixed-profile registration.

pg-raw.L02 now binds the original field-write test, independent oracle and exact88-source closure, preserving its case/run UUID, complete inventory and canonical observation requirements. The complete132-case gate is executing; L02 registration does not yet imply acceptance. Full acceptance before that result remains25/132, with107 required cases missing/failed and all28 complete criteria open. General compiler/refinement, live concurrent authority/final publication, graph/Delta and every remaining required case stay in scope.


### Raw PostgreSQL L02 accepted at authored stable cut — 2026-10-09

The fresh complete gate accepts pg-raw.L02 under US-057-AC1 with1120 matching observations, its preserved fresh case/run UUID and exact88-source closure. The34-vector fixed three-non-null-TEXT-field corpus runs through actual pg-runtime and ordinary SQL. It retains separate OLD/NEW owner-field refusals with object, membership, ownership-change and policy-change grants present; the same actor's value-only success at the forbidden-owner Project confirms field isolation. Existing identity/value/policy refusals, unchanged-field positive controls, independent complete business/authority facts, original native response custody, explicit transaction recovery and before/after installation/privilege checks remain exercised.

Native action grids independently verify the selected raw WHERE/RETURNING read precondition for all11 ordinary actors. Semantic read/write actions remain distinct; write-without-read is unqualified for this wrapper. Eleven conditional Z3 checks establish the independent authorization algebra under stated premises, not SQL/compiler admission or concurrent authority. The source-current standalone component retains1119 matching unique observations and595 original query journals. Astra ultra found no remaining scope/isolation blocker after the same-actor and read-precondition refinements.

The complete gate now accepts26/132 required cases, leaving106 missing/failed and all28 complete security criteria open. Twelve aggregate command groups,94 evidence checks and the470-criterion traceability check pass. L02 accepts its declared fixed raw field-authority assertion only. L03 revocation/drain, all other unaccepted raw cases, general compiler/refinement, live concurrent authority/final publication and actual graph/Delta implementations remain required. The full goal stays active.

### Raw L03 consumer drain and backend-loss counterexample — 2026-10-09

The source-current pg-raw-drain-component.json retains145 matching unique observations across four schedules through actual Truss pg-runtime and ordinary PostgreSQL17.9 reader/revoker identities. Publish and discard retain a native session guard after data transaction commit until the parent consumes the actual delivery bytes and acknowledges final receipt. Independent native lock and assignment observations show the revoker waiting before that acknowledgment. Original request/frame/outcome journal correspondence and missing/duplicate custody controls remain exercised.

Early unlock and exact reader-backend termination are deliberately unsafe controls: revocation commits while host-buffered rows remain deliverable. Native session loss is therefore not a publication drain. The separate persistent-publication-formal.json retains four conditional Z3 checks for initialized and preserved durable custody, backend-loss refusal and acknowledgment excluding a live buffer. Its single-publisher atomic model does not prove SQL/TypeScript refinement, registry installation, issuer authenticity, multiple publishers or recovery/liveness; nativeImplementationQualified remains false.

Astra ultra required private telemetry, EOF output inspection and exact terminal-event validation. Private runtime receipts use0600 files in0700 directories. The corrected verifier rejects both delayed output and rows embedded in an otherwise successful completion event, with actual subprocess negative controls for both failures. Astra found no remaining defect in that fix and independently verified145 matching source-current observations. Thirteen component groups,96 evidence checks and the470-criterion ledger pass.

L03 remains unregistered: persistent native publisher custody surviving backend loss, authenticated enrollment/retirement and complete native inventory/fact comparisons are required next. The full acceptance count remains26/132,106 missing/failed, with all28 complete criteria open. Actual Ashlar/Truss graph enforcement, remaining backend cases and general compiler/refinement remain part of the unchanged goal.

### Actual runtime persistent publication component — 2026-10-09

pg-raw-persistent-drain-component.json passes119 matching unique observations across healthy publication and exact native reader-backend termination followed by consumer discard. An excluded trusted fixture issuer enrolls a UUID bound to original actor, native PID and native backend_start. The ordinary actual pg-runtime reader invokes a separately enrolled routine; one successful admission atomically changes enrolled to pending before the data transaction commits. A repeated same-token read in a fresh transaction refuses42501 with no data/command frames and explicit rollback. The durable row remains unresolved independently of native connection lifetime.

The ordinary revoker acquires the exclusive native guard, uses a supported read-committed authority snapshot and refuses42501 while unresolved custody remains. Original refusal evidence binds the exact revoke statement and retains no data/command frames, one42501 error, ReadyE and explicit rollback. After backend loss, independent native assignment observation remains active while the actual host still retains buffered rows. Actual consumer acknowledgment precedes buffer clearing; native guard release permits a refusal, not revocation acknowledgment. Only after explicit trusted issuer retirement does a new ordinary native transaction revoke and commit. A fresh ordinary read then returns no rows.

Astra's initial review found overlapping admission/retirement and helper-owner ACL issues. Single-use native enrollment plus exclusive retirement fencing addresses repeat admission; the helper's guardian EXECUTE grant now follows ownership transfer. The first runtime integration attempts failed closed on the parameter carrier, helper privilege and unsupported SAVEPOINT decoding; controls now use supported begin/rollback commands. Concurrent refusal custody no longer uses the last inserted journal record. Fourteen component groups,97 evidence checks and the470-criterion traceability ledger pass. Astra independently reviewed the corrected sources and119-observation receipt and found no new safety or verifier defect in the two authored committed-admission schedules. Single-use is qualified to committed admission: rollback can undo the enrolled-to-pending claim, so rollback/replay custody remains an open requirement.

This is an unregistered authored component, not L03 acceptance or proof of SQL refinement. Complete independent inventory and business/authority fact comparisons, missing/unknown/terminal and identity-mismatch controls, ordinary registry/helper access isolation, isolation-level refusal and multiple simultaneous publisher controls remain required. Public issuer authentication, every read/release and authority writer path, process-owner loss/recovery and actual graph/Delta implementations remain open. Full acceptance remains26/132 with all28 complete criteria open; the original goal remains active.

### Persistent custody rollback/replay and isolated refusal controls — 2026-10-09

The expanded actual pg-runtime component passes249 matching unique source-current observations across three schedules. Its new rollback/replay schedule retains the original result after read rollback; an independent native observer confirms durable enrolled custody and unchanged authority. Replay creates a second retained host buffer before admission commits. Exact backend termination then allows the ordinary revoker to acquire its guard, but unresolved custody still yields42501/no acknowledgment. Both host buffers remain until actual consumer discard acknowledgment; explicit issuer retirement precedes successful retry. This qualifies the authored rollback/replay path, not every savepoint, cancellation, process failure or publisher-owner cleanup path.

All four ordinary identities independently lack private registry SELECT/INSERT/UPDATE/DELETE/TRUNCATE, helper EXECUTE and native stats capability. Actual attempts refuse42501. RR/serializable reads and writers refuse with their specific native isolation-guard messages. Terminal revival/delete/TRUNCATE fail and preserve the exact private binding; null and unknown UUIDs refuse. On the original still-live native reader, a retired token refuses with the specific custody error and no data/command frames, then rollback recovers the same PID. Private token values are not copied into public observations.

Astra found two masked controls in the first238-observation version: NULL-token isolation refusal could be caused by missing custody, and terminal reuse on a different backend could be caused by native binding mismatch. The249-observation replay adds isolation-specific native reasons and original-backend terminal reuse. Astra re-reviewed the249-observation corrections: both control-isolation findings are resolved, all observations match with unique IDs and current source hashes, and no additional defect was found. Fourteen component groups and97 evidence checks pass. Complete inventory/fact qualification, otherwise-valid actor/PID/incarnation mismatch controls, multiple publishers, public issuer authentication and full read/writer/release closure remain open. L03 stays unregistered and full acceptance stays26/132; all28 complete criteria remain open.

### Independent simultaneous publisher custody — 2026-10-09

The persistent actual pg-runtime component now passes336 matching unique source-current observations across four schedules. Two independent ordinary Alice native sessions enroll distinct UUID/PID/backend_start bindings, buffer their own protected rows and commit their data transactions. Exact primary-backend termination and primary consumer discard/retirement leave the sibling's durable row pending. The actual ordinary revoker's next transaction refuses with original42501 Publisher drain unavailable, no data/command frames and explicit rollback; the assessor independently confirms authority remains active. Only a separate sibling consumer discard acknowledgment followed by exact sibling retirement allows the subsequent native revocation commit. Both terminal rows remain.

Astra found that the intermediate330-observation verifier reported final buffer liveness from the primary alone and sibling drain as a constant. The corrected336-observation replay derives sibling drain from the actual sibling buffer, reports final revocation across both buffers and requires both empty before the final native retry. A retained-sibling control demonstrates that the primary-only view appears drained while the actual aggregate remains live. Astra re-reviewed the336-observation fix and found the sibling-buffer gap closed, all observations matching with unique IDs/current hashes and no additional defect. Fourteen component groups and97 evidence checks pass.

This qualifies the authored live sibling versus lost-primary schedule, not all publisher-owner/session loss combinations, unbounded concurrent publisher SQL refinement or recovery. Otherwise-valid identity mismatch controls, complete native inventory/business/authority fact qualification, public issuer authentication and every admission/release/mutator path remain required. L03 remains unregistered; the full26/132 acceptance count and all28 open complete criteria remain unchanged.

### Complete authored business and authority facts around custody schedules — 2026-10-09

The source-current persistent component passes432 matching unique observations across four schedules. Independent excluded native queries now compare all eight authored relational fact sets against the separately retained membership oracle: company, Project, employee/native-login enrollment, employee-Project assignment, resource, resource-Project ownership and both private/child carriers. Comparisons run at each restored initial cut, after native revocation refusal, after pending-sibling refusal and after successful revocation. The final expected set changes only Alice's active assignment flags; other authority and business facts must remain exact. Native ordering is explicit under C collation, JSON carrier meaning is compared structurally and retained bytes use exact hexadecimal representation.

Fourteen component groups and97 evidence checks pass. Independent review of this full-fact addition is pending. These comparisons qualify the authored fact universe, not arbitrary schema inventory, native authority authentication or full writer closure. Otherwise-valid actor/PID/incarnation mismatch controls, complete native effective privilege/ownership/policy inventory, public issuer authentication, every admission/release/mutator path and graph/Delta implementation remain required. L03 stays unregistered; acceptance remains26/132 and all28 complete criteria remain open.

Astra confirmed the eight-table comparison logic and432 matching unique source-current observations, but found the healthy publication schedule's refusal boundary lacked its own full-fact observation. The corrected fresh replay adds that comparison before retirement/retry and passes440 matching observations across four schedules. Thus every authored revocation-refusal boundary is checked independently. Astra re-reviewed the440-observation correction and found no remaining defect: all eight fact sets are checked immediately after healthy refusal and before retirement/retry, observations match, IDs are unique and hashes are current. Fourteen component groups and97 evidence checks pass; no inventory or L03 acceptance is inferred.

### Ordinary effective table and column privilege inventory — 2026-10-09

The persistent component now passes449 matching unique source-current observations across four schedules. An independently authored expected matrix covers all four ordinary actors across eight raw tables, both raw views and the private publisher registry. Native catalogs enumerate every table/view and column in the two admitted schemas, with explicit deterministic ordering. The assessor checks SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER at table level and SELECT/INSERT/UPDATE/REFERENCES for each exact authored column. The raw resource and two views retain ordinary reader SELECT; no ordinary raw authority/private-registry mutation privilege is admitted. The complete matrix is re-observed after every schedule.

A native negative control temporarily grants revoker UPDATE(active) on assignment inside the excluded installer's transaction. The same native assessor observes table-level UPDATE still false, column-level UPDATE true and mismatch against the independent baseline matrix. The transaction rolls back; a separate fresh observation matches the original privileges, and later raw/drain installation descriptors remain unchanged. Thus checking only table privilege cannot satisfy this component's column qualification.

Fourteen component groups and97 evidence checks pass. Independent review of this addition is pending. This qualifies authored ordinary table/column privilege expectations, not complete schema/routine/role/RLS-policy inventory, authentic issuer deployment or full read/mutator/release closure. Otherwise-valid identity mismatch controls and the remaining native inventory work still precede L03 registration. Full acceptance stays26/132 and all28 complete criteria remain open.

Astra found the449-observation matrix omitted PostgreSQL17's eighth table privilege, MAINTAIN, documented in the [PostgreSQL17 privilege catalog](https://www.postgresql.org/docs/17/ddl-priv.html). The corrected native and expected lists include MAINTAIN=false for every ordinary relation. A transactional native GRANT MAINTAIN makes the full matrix refuse, while removing MAINTAIN from both sides demonstrates the older seven-action assessor would pass. Rollback and a separate fresh observation restore the authored profile. The corrected replay passes453 matching unique source-current observations across four schedules. Astra re-reviewed the fix and found MAINTAIN checked throughout, the native negative control and restoration sound, and no additional defect. Fourteen component groups and97 evidence checks pass. The intermediate seven-action scope is incomplete for PostgreSQL17 and does not establish full privilege qualification.

### Role, schema and routine entry expectations — 2026-10-09

The persistent component passes479 matching unique source-current observations across four schedules. An independently authored native entry matrix enumerates six declared role capability profiles, both protected schema owners and each role's effective USAGE/CREATE, and all six exact routine signatures. Routine expectations include owner, SECURITY DEFINER status, fixed pg_catalog search path, absence of PUBLIC EXECUTE and effective EXECUTE for all six roles. The isolated non-login incarnation owner alone inherits native stats access; guardian helper execution remains explicit. Ordinary reader and revoker entry capabilities are independently distinct. The entry matrix is re-observed after every schedule alongside the complete relation/column and authored business/authority fact checks.

Four transactional negative controls change PUBLIC helper execution, outsider schema CREATE, outsider inheritance of the guardian owner role, and an unexpected public routine. Each independently observed native capability differs from the authored matrix; rollback followed by a fresh observation restores the profile. The owner-membership control verifies effective inherited capability, not only direct ACL text. Astra independently reviewed the479-observation entry addition and found no new defect; the targeted capability changes and separate rollback restorations are exercised, all observations match with unique IDs and current hashes. Fourteen component groups and97 evidence checks pass.

This qualifies the declared role flags/schema permissions/routine entry subset. Additional role settings and grant-option closure, independently expected RLS/policy/trigger/constraint metadata, native incarnation identity-mismatch controls, public issuer authentication and all admission/release/mutator paths remain required for complete profile qualification. L03 remains unregistered; full acceptance stays26/132 with all28 complete criteria open.

### Independently expected enforcement metadata — 2026-10-09

The persistent component passes509 matching unique source-current observations across four schedules. Independent expectations now enumerate all eleven authored table/view owners, kinds, RLS/forced-RLS flags and security-barrier view options; both exact resource policy role lists, commands, permissiveness, predicates and check expressions; and both publisher history/retirement trigger definitions. Trigger expectations include enabled state, event/timing/row type, condition, UPDATE-column list, argument bytes, deferrability, transition-table names and exact routine signature. All are independently re-observed initially and after every schedule.

Five transactional native controls remove forced RLS, add a PUBLIC true policy, disable retirement, change publisher ownership and replace the same named/event trigger with WHEN(false). Each demonstrates its actual weakened metadata, is refused by the expected matrix, rolls back and is followed by a separate complete expected observation. The false-condition control prevents name/type-only trigger checking from hiding skipped retirement enforcement.

Astra independently reviewed the509-observation evidence and found no new safety/evidence defect; observations match, IDs are unique and source hashes current. Fourteen component groups and97 evidence checks pass. This qualifies authored enforcement metadata, not all native constraints/settings/grant options or SQL/source refinement. Native actor/PID/incarnation mismatch controls, public issuer authentication and complete admission/release/mutator closure remain required. In particular the baseline's direct raw reader surfaces are not qualified as durable enrolled publication paths by these wrapper schedules. L03 remains unregistered and full acceptance stays26/132 with all28 complete criteria open.

### Otherwise-valid native identity binding controls — 2026-10-09

The persistent component passes552 matching unique source-current observations across four schedules. Three separate UUID enrollments bind to the same actual ordinary Alice reader, varying only actor, native PID or native backend_start. The wrong actor names existing Bob; the wrong PID is the independently captured live revoker PID; wrong incarnation uses native timestamptz -infinity without JS timestamp conversion. Independent native comparisons establish exactly one failed equality per enrollment, with other identity facts and enrolled state intact.

The original actual pg-runtime reader attempts each token in supported read-committed transactions. Original request/frame/outcome custody establishes one specific42501 Publisher custody unavailable error, no data/command frames, ReadyE and explicit rollback. Each row remains enrolled after refusal. The same original PID then uses a distinct correctly bound enrollment successfully, ruling out missing wrapper permission, lost session or general fixture failure as the refusal cause.

The excluded test issuer has original no-output evidence for the three control requests. With no reader transaction/session guard and no returned buffer, it conservatively marks those rows pending and explicitly retires them, retaining terminal UUID history before normal publication schedules proceed. This test-only cleanup is not proof of a public cancellation/issuer protocol or a rule that enrolled state implies no buffered output; the rollback/replay schedule already demonstrates why that inference is unsafe.

Astra independently reviewed the552-observation addition and found no new safety/evidence defect, with matching unique observations and current hashes. Fourteen component groups and97 evidence checks pass. Broader native incarnation uniqueness, issuer authentication, complete role/settings/constraints/grant-option inventory and all admission/release/mutator paths remain open. Direct baseline read surfaces are still outside durable wrapper qualification. L03 remains unregistered; full acceptance stays26/132 with all28 complete criteria open.

### Schema and routine delegation expectations — 2026-10-09

The persistent component passes570 matching unique source-current observations across four schedules. The entry matrix now independently checks schema USAGE/CREATE and routine EXECUTE grant options for all six declared roles. Owners retain their inherent delegation capability; ordinary roles and the guardian's separately granted incarnation-helper execution lack grant options. Native inquiry follows the [PostgreSQL17 access privilege functions](https://www.postgresql.org/docs/17/functions-info.html#FUNCTIONS-INFO-ACCESS-TABLE).

Two transactional controls add WITH GRANT OPTION to already-admitted Alice schema usage and enrolled-routine execution. Ordinary access remains true, so removing the new grant-option fields makes the old expected matrix pass. The full matrix instead detects delegation and refuses; rollback and fresh observations restore the expected profile. Actual ordinary Alice GRANT attempts to give the enrolled routine to outsider and raw-schema usage to revoker produce native no-grant warnings and no output. Separate complete entry observations confirm no capability changes.

Fourteen component groups and97 evidence checks pass. Astra independently reviewed the570-observation addition and found no new evidence defect; controls isolate delegation, restoration and ordinary no-grant behavior, with unique matching observations and current hashes. This qualifies schema/routine delegation expectations, not table/column/default-grant or role administrative-option closure. Remaining native inventory, public issuer and complete admission/release/mutator paths still precede L03 registration. Full acceptance stays26/132 and all28 complete criteria remain open.

### Effective table and column delegation expectations — 2026-10-09

The persistent component passes584 matching unique source-current observations across four schedules. Independent ordinary-role expectations now include effective grant options for all eight table privileges and all four privileges per authored column across the eleven admitted relations. All ordinary grant options must be false; ordinary resource/view SELECT remains separately admitted. These checks run at the initial and final schedule inventories and after negative-control restoration.

Transactional table SELECT and column SELECT(id) WITH GRANT OPTION controls preserve ordinary SELECT while exposing delegation. The full assessor refuses each changed matrix; stripping only the grant-option fields demonstrates that the older permission-only matrix would pass. Rollback followed by an independent observation restores the profile. Actual ordinary Alice GRANT attempts for table and column SELECT to revoker produce no-grant diagnostics, with complete privilege matrices independently unchanged afterward.

Astra independently reviewed the584-observation addition and found no new defect, with unique matching observations and current source hashes. Fourteen component groups and97 evidence checks pass. Role administrative options, default grants and remaining native settings/constraints, public issuer authentication and complete admission/release/mutator paths remain open. L03 is still unregistered; full acceptance stays26/132 with all28 complete criteria open.

### Exact native membership options and ordinary escalation refusal — 2026-10-09

The persistent component passes629 matching unique source-current observations across four schedules. The membership assessor independently expects the sole scoped native grant: pg_read_all_stats to the isolated non-login incarnation owner, granted by postgres with ADMIN=false, INHERIT=true and SET=true. It enumerates all native grants touching a declared role, including grantor and each option, at initial and final schedule cuts. The option semantics follow [PostgreSQL17 role membership](https://www.postgresql.org/docs/17/role-membership.html).

Three transactional controls independently enable ADMIN or disable INHERIT/SET. Each rejects the expected inventory, exposes the changed native option and verifies every other membership fact unchanged before rollback. Separate observations confirm rollback restores the complete expected grant set. All four ordinary identities attempt to grant the guardian role to outsider and to SET ROLE to guardian/incarnation. Every attempt refuses42501 with no output; exact native membership observations remain unchanged after each actor's attempts.

Astra independently reviewed the629-observation addition and found no defect; observations match with unique IDs and current hashes. Fourteen component groups and97 evidence checks pass. Default grants, remaining native settings/constraints, authenticated issuer and full admission/release/mutator closure remain required. L03 remains unregistered; full acceptance stays26/132 with all28 complete criteria open.

### Ordinary runtime credential bundle — 2026-10-09

The persistent publication probe previously passed every fixture credential, including the excluded PostgreSQL installer credential, to the ordinary runtime child. It now passes only the authored reader and revoker credentials. The runtime refuses an unexpected actor key, missing required actor or empty/non-string password before endpoint and journal setup. Exact sorted key arrays are compared structurally; delimiter-joined names are not an identity representation. Each schedule retains only the exact actor names in its observation, never credential values.

Four retained synthetic subprocess controls verify extra-installer, missing-revoker, empty-password and combined-key bundles refuse with the exact bundle error and no stdout before invalid endpoint setup. The source-current native component passes637 unique matching observations across four schedules; fourteen component groups and97 evidence checks pass. This constrains the explicit actor bundle, not inherited environment, host filesystem or complete process-secret isolation. L03 remains unregistered and full acceptance remains26/132. Authenticated enrollment/retirement and complete direct-read, release and authority-mutation participation remain open.

Astra ultra independently reviewed the final credential-boundary change and found no actionable defect. It confirmed637 matching unique observations and all87 current source digests.

### Denied unenrolled raw reads and enrolled fresh reads — 2026-10-09

CONTRACT-063 requires uncoordinated disclosure paths to refuse. The persistent integration fixture now revokes ordinary table, function and schema grants in security_raw. Independent table/column and schema/routine inventories expect no ordinary raw access at initial and final cuts. Guardian still executes the enrolled ID projection under forced resource RLS and original SESSION_USER. The original raw membership/write profiles remain separate; their general direct-query behavior is not supplied by this fixed Alice ID-projection component.

All four ordinary actors refuse SELECT on every authored raw table/view (40 checks) and COPY/cursor/helper paths (16 checks). The actual Truss runtime additionally exercises seven direct paths in each of four schedules: one original server-error attempt, no data/command-success frames, native42501, ReadyE, rollback and unchanged native PID. A failed replay exposed an incorrect ReadyForQuery field accessor in the new test; the accessor was corrected to the existing decoder representation before the successful replay.

The post-revocation freshness read no longer bypasses custody. A distinct UUID binds its original native actor/PID/backend_start, the enrolled query returns the expected empty result after revocation, COMMIT retains pending custody, and the excluded issuer retires only after the actual empty-result completion event. Native pending and released states are independently observed. Table/column grant-option controls explicitly normalize their newly added access when testing option-only omission; schema grant-option isolation uses the drain schema where Alice retains USAGE.

The current component passes945 unique matching source-current observations across four schedules, fourteen component groups and97 evidence checks. This is progress on uncoordinated-read denial for the authored projection, not general relational query/disclosure compilation or complete L03 acceptance. Public authenticated enrollment/retirement, wider authority-writer/release closure, remaining native inventory, actual graph stores and other backend cases remain required. L03 stays unregistered; full acceptance remains26/132 and the original goal stays active.

Astra ultra found no actionable defect in the final change and verified945 unique matching observations, all87 current source digests and224 original-runtime direct-path assertions.

### Enrolled public-value, ownership and disclosure projection — 2026-10-09

The authored enrolled raw projection now returns four fields: resource ID, public value, authorized Project ownership context and typed disclosure cells. It composes the existing forced-RLS resource table with the security-barrier ownership and disclosure views inside the same guarded durable claim. Ordinary raw privileges remain absent. Alice sees only Project A ownership for RA and RAB, even though RAB also has Project B ownership in native facts. The independent expected public values and disclosure cells come from the retained literal membership oracle; they are not computed from native query results.

Actual Truss buffers retain all four native TEXT carriers, including JSON encoded ownership and disclosure. Typed JSON decoding preserves original-null, absent, withheld and transformed cells; object key order is normalized solely for structural comparison. Initial buffering, rollback/replay, independent sibling buffering and the actual consumer publication compare the complete projection, not only IDs. Parent-controlled consumer delivery also independently compares the full payload. Post-revocation enrollment still returns no rows and commits pending custody before explicit terminal retirement.

This extends the integration component's useful relational semantics without admitting unenrolled direct access. It does not implement a general query/disclosure compiler, all actors' projection profiles, actual graph storage mappings, public authenticated enrollment/retirement or complete physical refinement. Those remain part of the original goal. Astra ultra found no actionable security defect and confirmed full carrier preservation and independent expected semantics. An obsolete oracle phrase describing an ID-only projection was corrected and native evidence replayed to preserve source freshness. L03 remains unregistered; acceptance remains26/132.

Final source-current replay passes945 matching unique observations across four schedules; fourteen component groups and97 evidence checks pass.

### Unbounded token/count durable-custody induction — 2026-10-09

A new Z3 proof supplements the earlier single-publisher Boolean proof with unbounded integer-indexed token identities and unbounded nonnegative per-token retained buffer counts. Its invariant states that every live buffer retains unresolved custody, terminal tokens have no custody or buffer, and a revocation event excludes every live buffer. Eight modeled atomic transitions individually preserve the invariant: enrollment, read/replay, commit/rollback, backend loss, complete consumer drain, unlock, retirement and revocation. Further checks cover terminal non-reuse, independent sibling preservation, sibling exclusion of revocation and backend-loss retention.

All fourteen cases retain an UNSAT violation query, a SAT unsafe control and a SAT valid population. Controls include forgotten durable custody and a primary-only revocation assessment that overlooks a live sibling. New enrollment/read resets the event acknowledgment marker; this permits new post-acknowledgment operations rather than permanently closing the realm. Fresh eligible policy cuts are an explicit separate premise, not established by this count model.

The proof assumes a complete truthful durable registry, authenticated enrollment/retirement, truthful drain of all buffers for the exact token, atomic serialized protocol transitions, complete writer participation and fresh native authority observations. Integer identities and counts abstract UUID/native identity binding, payloads and transport ownership. Source digests link the authored persistent SQL/runtime/oracle for traceability; they do not prove refinement. Native SQL/TypeScript refinement, current-policy correctness, crash recovery and liveness/fairness remain open. The proof is linked to US-057-AC2 and remains conditional component evidence, not L03 acceptance.

The proof command is part of component validation; its source freshness, unique case IDs, exact expected solver outcomes and explicit nativeImplementationQualified=false are checked by the evidence validator. Fifteen component groups and99 evidence checks pass. Existing native component evidence remains945 observations across four schedules. Acceptance stays26/132 and the full goal remains active.

Astra ultra identified a retained-formula replay defect in the first proof receipt: post-solve SMT serialization included Z3 internal model-converter declarations, and26 of42 formulas did not parse independently. Formula results were not contradicted, but that receipt was insufficient as standalone replay evidence. The prover now serializes before solving and requires a fresh solver to parse and reproduce every retained formula result before writing the receipt. All42 formulas replay with expected outcomes; the validator checks their replay outcomes. Positive preservation populations now explicitly include live buffers for read/replay, commit/rollback, backend loss and unlock, and multiple buffers for consumer drain. The eight preservation cases share one custody-forgetting negative control; they are not eight transition-specific mutants. Final fourteen formal cases, fifteen component groups and99 evidence checks pass.

Astra ultra re-reviewed the corrected proof, independently parsed and solved all42 retained formulas to their recorded results, confirmed five current source digests and found no remaining actionable defect.

### Retained formal-formula replay audit and hash/key correction — 2026-10-09

Following the quantified custody serialization defect, a fresh-solver audit examined the selected saved smt/result leaves in the formal receipt directory. It found four nonparseable hash/key SAT formulas containing undeclared uninterpreted model constants. The hash/key prover now captures pre-solve SMT and requires fresh parsing and reproduction of every outcome before retaining its two conditional cases. This corrects reproducibility evidence; the original UNSAT/SAT theorem results were not refuted.

The retained audit scans19 formal receipts and reproduces147 selected formulas from eight receipts. Per-receipt counts explicitly identify eleven receipts without selected smt/result leaves: some use alternate query fields, others omit serialized formulas. They remain outside this audit, and expanded replay coverage remains required. Legacy selected formulas can contain Z3 model-converter annotations ignored with parser diagnostics; the result concerns parsed assertions, not strict SMT-LIB conformance. Neither replay nor source hashes validate formula-to-generator correspondence, assumptions or physical implementation refinement.

Astra identified two verifier issues during review: absolute/relative self-path mismatch caused coverage to fail closed, and nonempty/unique result checks could accept truncated coverage. The audit now guards and retains its reviewed relative self path; the validator independently derives the exact saved leaf ID/result map and requires exact coverage, uniqueness and matching outcomes. Missing-leaf and duplicate-leaf controls refuse. Astra independently replayed all147 selected formulas, confirmed all20 audit source digests and found no remaining actionable defect in the qualified scope.

Seventeen component groups and101 evidence checks pass. Native persistent evidence remains945 observations across four schedules. Expanded formal replay coverage and full implementation refinement remain open; no backend case is promoted. Full acceptance remains26/132 and the original goal remains active.

### Expanded saved-formula replay coverage — 2026-10-09

The replay audit and independent exact-coverage verifier now recognize the older query/result field pairs used by the main semantic, mask-query and existence-truth receipts. This exposed a nonparseable main semantic weakened-control formula caused by post-solve model-converter serialization. The main prover now captures all three queries before solving and requires fresh solver replay before retaining its twenty cases. Its source change correctly invalidated prior S12 gate evidence, so the full acceptance gate was launched to refresh it rather than modifying stored gate results.

The eight remaining formula-less formal receipts now retain pre-solve SMT and fresh replay results in their existing safety/control/population records. No formulas, assumptions or scope claims were changed in those generators. The resulting audit independently reproduces321 formulas across all nineteen selected receipts; none lacks a selected saved formula. Some legacy formulas still contain ignored parser annotations, so strict SMT-LIB conformance remains outside this replay claim. Formula-to-generator correspondence, policy assumptions and native/compiler/runtime refinement remain separately required.

Astra ultra independently replayed all321 formulas, confirmed exact receipt counts and current source digests, tested omitted coverage rejection and found no actionable defect. Twenty-six component groups pass. The original full acceptance refresh completed with26 of132 cases accepted and106 missing/failed; S12 evidence is fresh again. All101 evidence checks pass. The full gate remains failed because the original required backend scope is incomplete. No extra backend case or full criterion is claimed accepted, and the original goal remains active.

### Independent durable-publisher integrity inventory — 2026-10-09

The persistent raw component now compares independent authored expectations for all five publisher columns (native type, NOTNULL, default, identity and generated flags), exact UUID primary-key and state-domain constraints (keys, definition, validation and deferral), and the authored btree index (keys, uniqueness, primary/valid/ready/immediate flags, predicate and expressions). Initial and final cuts and every control restoration retain full expected/native snapshots. Transactional controls drop the primary key or state check, permit NULL state or add a state default; each rejects the baseline, matches an independently constructed control snapshot and restores the exact profile after rollback.

Actual excluded native insert attempts reject invalid state23514, NULL state/ID23502 and duplicate UUID23505. SQLSTATE checks match the anchored verbose native ERROR line. The duplicate is one atomic multirow INSERT in the fresh owned fixture, and all refused insert transactions leave the publisher table empty before schedules. UUID history and ordinary privilege controls remain separately exercised.

Astra recommended retaining full queried integrity facts instead of only equality Booleans; the final receipt includes all thirteen snapshots, including independently expected control mutations. The source-current native probe passes980 matching unique observations across four schedules; twenty-six component groups and101 evidence checks pass. This qualifies the authored publisher metadata and tested integrity refusals, not all raw constraints, operator classes, default grants/settings, authenticated issuer custody or complete admission/release/authority-writer participation. L03 remains unregistered; full acceptance stays26/132 and the goal remains active.

Astra ultra confirmed980 matching unique observations, all87 current source digests and thirteen complete integrity snapshots, and found no remaining actionable defect in this scoped addition.

### Guard-before-tuple private publisher retirement — 2026-10-09

The persistent SQL component now exposes a private guardian-owned SECURITY DEFINER retire_publisher(uuid) routine, with fixed pg_catalog search path, no PUBLIC/ordinary EXECUTE and read-committed-only admission. It acquires the exclusive realm guard before updating the exact pending UUID to released, and refuses missing or terminal identifiers. Normal excluded fixture retirement paths use this routine. This is a private issuer primitive, not authenticated public enrollment/retirement or proof of truthful consumer acknowledgment.

The earlier direct UPDATE path could acquire the publisher tuple lock before its history trigger waited for the realm guard, opposite the enrolled read's guard-before-tuple order. Two actual owned PostgreSQL contention controls run while Alice retains her original shared guard and the actual ordinary revoker waits for the exclusive guard. The old tuple-first UPDATE prevents an independent FOR UPDATE NOWAIT probe; the private guard-first routine leaves that row available while waiting. Both retirement attempts then refuse with native lock-timeout55P03, leave custody pending and preserve all business facts. Ordinary invocation and unsupported snapshot refusals remain checked, and independent routine/privilege inventories include the new private entry.

Astra caught a verifier timing gap: a successful row probe after retirement timeout could falsely demonstrate availability during waiting. The corrected controls capture the exact native decimal-text retirement PID and require both the owned process to remain live and that same PID/app/actor to remain blocked on the same exclusive advisory guard immediately after the row probe. Astra confirmed the fix and independently verified1009 unique matching observations and87 current source digests, finding no remaining actionable defect. Twenty-six component groups and101 evidence checks pass.

These observations establish the authored lock-ordering improvement, not general deadlock freedom, native/compiler refinement, public issuer custody or complete writer/release participation. The trigger still protects excluded direct mutations, which are outside the ordinary profile. L03 remains unregistered, full acceptance stays26/132 and the original goal remains active.

### Native-bound private enrollment and queue-safe admission — 2026-10-09

The persistent component now has a guardian-owned enroll_publisher(uuid,name,integer,timestamptz) routine with fixed pg_catalog resolution, read-committed-only admission and no PUBLIC/ordinary EXECUTE. Its native realm guard participates in writer exclusion. Nonnull UUID/PID/backend_start and the authored Alice profile are mandatory. A separate private incarnation-role stats helper compares supplied actor, PID, native backend_start and client-backend kind against PostgreSQL's actual backend observation; only guardian can execute that helper. Primary, sibling and post-revocation fixture enrollments now call this primitive instead of directly inserting valid publisher rows. Deliberately malformed raw rows remain explicit excluded test injections for read-boundary mismatch controls.

Native controls reject three otherwise-valid actor/PID/incarnation mismatches and four NULL components with exact42501 and no new custody, reject active UUID duplication and terminal UUID reuse with23505 while preserving their states, and independently compare successful native identity bindings. Ordinary calls to both new routines and unsupported enrollment snapshots refuse. Native routine/privilege inventories enumerate both new entries.

Astra identified a circular-wait regression in the first implementation: a reader held its session shared guard while awaiting a separate issuer's shared acquisition, which can wait behind a queued exclusive writer that is itself waiting for the reader. Enrollment now commits before the reader acquires its session guard. To also avoid nested-admission stalls while another publication remains live, the enrollment primitive uses native try-shared acquisition and explicit42501 Publisher enrollment guard unavailable rather than waiting. An actual queued-writer control distinguishes this admission refusal from native55P03 timeout and verifies no token, unchanged publisher count and unchanged original reader/writer guard states. Public issuer retry and recovery remain unimplemented; refusal is conservative, not automatic retry or weak admission.

All four schedules independently observe no granted reader shared guard after committed enrollment, then invoke a separate actual ordinary revoker before signaling the child to acquire its guard. Revocation refuses on the specific durable-custody condition, enrollment remains enrolled and all eight authored business relations stay unchanged. These forty-four checks demonstrate the intervening-writer gap is closed in this authored component.

Final native evidence passes1103 matching unique observations across four schedules, with all87 source digests current. Twenty-six component groups and101 evidence checks pass. Astra ultra re-reviewed the ordering, private identity validation and all forty-four intervening-writer assertions, finding no remaining actionable defect. These private primitives do not establish public issuer authentication, broker all-buffer drain truth, complete retry/recovery, generalized query profiles or all writer/release paths. L03 remains unregistered and full acceptance stays26/132; the original goal remains active.


### Private retirement state admission — 2026-10-09

The persistent raw probe now attempts private retirement of the actual enrolled UUID before the runtime acquires its shared guard, plus NULL and unknown UUIDs. Each attempt must refuse with an anchored native verbose ERROR42501, the specific Publisher retirement unavailable diagnostic and no result output. After each refusal an independent native query compares the original actor, PID and backend_start binding and requires state enrolled. Each schedule also attempts a second retirement of its released post-revocation token, requiring the same refusal and preserved released history. These thirty-two additional assertions cover all four existing schedules.

The source-current native component passes1135 matching unique observations across four schedules; twenty-six component groups and101 evidence checks pass. This qualifies the private routine's authored state admission and refusal preservation. The unbounded custody model currently combines enrolled and pending as unresolved custody; these finer native state restrictions are additional observations, not a state-refinement theorem. Public issuer authentication, truthful all-buffer retirement, recovery, generalized query profiles and complete writer/release participation remain open. L03 remains unregistered, full backend acceptance stays26/132 and the original goal remains active. Astra ultra independently verified all1135 unique matching observations, four schedules and87 current source digests and found no actionable defect. Repeated terminal retirement checks state preservation; full binding preservation is separately checked for enrolled refusal controls.


### Explicit publisher-state conditional proof — 2026-10-09

publisher-state-formal.json retains fourteen Z3 cases and forty-two pre-solve formulas, each independently parsed and replayed. The unbounded integer-token model distinguishes absent, enrolled, pending and released custody with nonnegative retained-buffer counts. Empty initialization and nine modeled atomic transitions preserve custody. An admitted claim rollback restores enrolled from pending while keeping host buffers; a subsequent read can accumulate another buffer. The exact state projection unresolved=(enrolled or pending), terminal=released satisfies the existing abstract custody invariant. Specific admission mutants remove the relevant state restriction and yield counterexamples for enrolled retirement, repeated terminal retirement and terminal reenrollment. The nine preservation cases share one custody-forgetting mutant and are not nine distinct mutation tests.

An initially unconstrained SAT population returned unknown under the solver deadline. Transition populations now supply explicit array witnesses with the authored live or multiple-buffer counts; safety formulas and unbounded domains were unchanged. The final fourteen cases require UNSAT safety queries and SAT control/population queries, including fresh replay of all retained formulas. Twenty-seven component groups pass; the independent audit reproduces363 saved formulas across twenty formal receipts and all103 evidence checks pass.

This is conditional model induction and state-invariant projection, not transition-by-transition refinement to the other model or verification of SQL/TypeScript execution. Commit is a modeled stutter; rollback covers an admitted claim rollback only, not arbitrary nested transactions or enrollment rollback. Abstract locks do not model PostgreSQL queues. Truthful complete enrollment and all-buffer drain, authenticated issuer, serialized transitions, participating writer guard and fresh authority observations remain premises. Public issuer/recovery and full physical/backend qualification remain open. Astra ultra independently replayed all42 saved formulas, verified all three current source digests, confirmed the exact invariant projection and intended admission mutants, and found no actionable defect. The explicit witnesses constrain only SAT populations; universal preservation formulas remain unchanged. No additional backend case is accepted; the full gate remains26/132 and the original goal stays active.


### Publisher-state transition correspondence — 2026-10-09

The explicit-state generator now loads the actual multipublisher custody model and substitutes unresolved=(enrolled or pending), terminal=released, and the same retained counts, locks and acknowledgment event. Nine additional cases require each concrete modeled transition to satisfy its mapped abstract transition. Commit and claim rollback map to commit-or-rollback; read maps to read-or-replay; the other operations map to their corresponding abstract operations. These checks retain UNSAT correspondence violations, SAT concrete populations and SAT controls that deliberately add one to the projected next buffer count. The controls test a broken projection, not nine native implementation mutants.

Z3 returned unknown for some lambda-array SAT queries. Array equalities in the mapped abstract formula are now expressed extensionally as equality at every integer index, with beta reduction through simplify. This preserves array equality semantics and avoids accepting an unknown solver result. The twenty-three explicit-state cases retain sixty-nine independently replayable pre-solve queries. Twenty-seven component groups and103 evidence checks pass; the whole retained audit now covers390 formulas across twenty receipts.

This establishes transition correspondence between the two authored mathematical models under their recorded premises. It does not establish SQL/runtime refinement, PostgreSQL queues or snapshots, authenticated issuer and truthful all-buffer retirement, arbitrary nested/enrollment rollback, recovery or full backend acceptance. Earlier statements that transition correspondence was unproved are historical and superseded only for these two models. Astra ultra independently replayed all69 saved queries, rebuilt all nine transition implications with UNSAT violations, verified current source digests and confirmed the projection and extensional equality transformation. No actionable defect remained. Full acceptance remains26/132 and the original goal remains active.


### Dedicated authenticated host issuer capability — 2026-10-09

The persistent fixture now defines a distinct LOGIN host issuer with NOSUPERUSER, NOBYPASSRLS, NOCREATEROLE, NOCREATEDB and NOREPLICATION. Its protected-schema grants are drain USAGE and EXECUTE on the two guardian-owned enrollment/retirement routines without grant options. It has no business or publisher table/column privileges, no stats membership, no incarnation/helper/read/revocation EXECUTE and no privileged role membership. The independent effective inventory now covers seven selected roles and includes issuer table/column privileges and grant options across all eleven protected relations. Ordinary reader/revoker roles cannot SET ROLE to the issuer.

Normal primary, sibling and post-revocation enrollment and retirement now connect separately with the host issuer's SCRAM credential. Enrollment still obtains exact decimal-text PID and native timestamp text from the excluded assessor, then supplies that binding to the private native-validation routine. Nine actual issuer login identity checks require session_user=current_user=issuer and no superuser/bypass attributes. Ten issuer attempts refuse native42501 for publisher/raw reads, raw writes, stats helpers, protected read/revocation, privileged role switches and reader delegation. The original runtime child continues receiving only reader and revoker credentials; the issuer credential remains in the fixture host context. Malformed identity injection and drift/lock controls remain explicit excluded administration.

The source-current native component passes1158 unique matching observations across four schedules, twenty-seven component groups and103 evidence checks pass. This reduces routine-operation privilege from fixture superuser to a separately authenticated restricted host role. The trusted host can still falsely retire a drained-looking token, and the assessor still supplies enrollment identity: this is not a public broker, truthful all-buffer retirement service, production host isolation, complete recovery/query/writer profile or L03 acceptance. Astra ultra review is pending. Full acceptance remains26/132 and the original goal remains active.


Astra's issuer review found no privilege or credential-handoff defect, but requested direct evidence for the SCRAM claim. The probe now retains ordered native pg_hba_file_rules host facts, requires every selected host rule to use scram-sha-256 without errors and an all-database/all-user127.0.0.1 rule, and rejects a separately attempted issuer TCP login with a fresh wrong password and the issuer-specific authentication diagnostic. The original issuer credential is restored in finally and subsequent normal successful issuer logins remain required. Local installer trust remains an explicit exclusion. Each final schedule cut independently compares the entire ordered host-rule snapshot. The first authentication addition failed an installation comparison because of a new inventory field; the base inventory comparison and separate authentication stability assertion have been corrected. Final refreshed native evidence passes1164 unique matching observations across four schedules, including all four complete host-rule stability comparisons. Twenty-seven component groups and103 evidence checks pass. Astra ultra verified1164 unique matching observations, all four complete authentication-rule comparisons and87 current source digests, confirmed wrong-password refusal plus subsequent successful issuer logins and found no remaining actionable finding.


### Authenticated issuer refusal preservation — 2026-10-09

The existing enrolled, NULL, unknown and repeated-terminal retirement controls now authenticate through the restricted host issuer rather than the excluded administrator. Exact native42501, retirement-specific diagnostic, no output and independent selected-binding/state assertions remain mandatory. An additional native snapshot reads every publisher row and all five columns in native UUID order immediately before and after each refusal. Sixteen added checks compare the full registry, including unrelated retained history, across the four schedules. Private UUID values stay in assessor memory; observations retain the equality result rather than exposing those values.

This strengthens evidence for the actual host issuer's refusal paths without proving truthful positive retirement or a public broker. The native run passes1180 unique matching observations across four schedules; twenty-seven component groups and103 evidence checks pass. Astra ultra independently verified all sixteen complete-registry comparisons and87 current source digests, retained error/binding assertions and qualified scope, finding no actionable defect. No backend acceptance case is added; the full gate remains26/132 and the original goal remains active.


### Authenticated issuer enrollment refusal preservation — 2026-10-09

The probe now factors native actor/PID/incarnation observation into the issuer enrollment statement builder. The three otherwise-valid binding mismatches, four NULL components, active and terminal UUID duplication and busy queued-writer enrollment execute via the restricted authenticated issuer. Test overrides are fixed reviewed SQL expressions, not a public input parser; malformed raw identity injection remains excluded administration. Existing exact42501/23505 diagnostics, guard-specific busy refusal, selected binding/state/count checks and successful issuer identity assertions remain mandatory.

Sixteen additional complete-registry comparisons cover these enrollment refusals across the existing four schedules. Each compares every row and all five binding/state fields before and after the attempt without publishing private UUIDs into observation receipts. This supports the actual issuer's tested refusal paths; it does not establish public issuer input validation, identity-observer isolation, truthful all-buffer retirement, recovery or complete backend admission. The source-current native run passes1196 unique matching observations across four schedules; twenty-seven component groups and103 evidence checks pass. Astra ultra independently verified all sixteen new registry comparisons and87 current source digests, exercised all seven mismatch/NULL argument variants and found no actionable defect. No new backend case is claimed; full acceptance stays26/132 and the original goal remains active.


### Owned host publication buffers — 2026-10-09

A candidate SecurityPublicationCustody component now owns copyJson snapshots behind opaque in-process buffer handles. Sealing forbids new retention; retirement calls the trusted native callback only after sealing and draining every registered buffer. Asynchronous consumer callbacks retain their buffers through resolution. Duplicate/forged/foreign handles and discard during delivery refuse. Backend loss never disposes host buffers. Consumer rejection or uncertain native retirement quarantines the publisher, refusing subsequent retirement/retry. The component rejects accessor-bearing payloads without invoking getters and bounds live buffers at128.

The independently authored twenty-four-observation corpus exercises retained first/replay buffers, pending consumer acknowledgment, data-copy isolation with large identity text and null, remaining-buffer retirement refusal, exact native-callback count, terminal reuse refusal, foreign/forged handles, consumer/native uncertainty and payload/buffer bounds. Bun and actual Chromium153.0.8010.12 reproduce identical results without Node/Bun globals or external requests in browser execution. Twenty-seven component groups and105 evidence checks pass. The source is not yet exported from the public root or connected to the actual native publication runtime.

This is a host component for buffers routed through one instance. It cannot account for arbitrary host copies, authenticate consumer acknowledgment, recover a lost process or prove issuer/native writer closure. Consumer callback resolution must mean the host's declared final-release boundary, and the native callback remains trusted. Claims of truthful global drain or completed native/backend acceptance would therefore be premature. Integration with the enrolled native runtime and corresponding physical evidence remains required. Astra ultra review is pending. Full backend acceptance stays26/132 and the original goal remains active.


Astra reproduced a Proxy reflection-trap reentrancy defect in the first host component: copyJson could invoke a trap that sealed/retired the empty publisher before retain inserted its buffer. Retention now guards the copy window, rejects nested retention/sealing and rechecks publisher state and capacity after copying. The guard resets in finally. Five new Proxy controls prove seal/retirement refusal during copying, zero premature native callback calls, retirement refusal while the resulting buffer remains live and one callback only after disposal. Bun and Chromium153.0.8010.12 pass the expanded twenty-nine-observation corpus. This repairs the observed admission window; it does not claim arbitrary host-copy or native/backend qualification. Astra also identified that the first foreign-handle test used a retired target, allowing state rejection to mask ownership rejection. The revised control targets an open publisher with a live local buffer, verifies foreign refusal preserves that custody and allows retirement only after local disposal. Bun and Chromium now pass31 unique matching observations. Twenty-seven component groups and105 evidence checks pass. Astra ultra verified all six current browser source digests and found no remaining actionable finding in the stated component scope. Native integration remains required.


### Managed custody in the original native publication runtime — 2026-10-09

The actual pg-runtime consumer now imports SecurityPublicationCustody and retains copied four-carrier rows behind opaque handles for primary, rollback/replay, sibling and fresh post-revocation reads. Primary custody seals after all authored replay buffers are registered. Actual publication projects the owned managed payload and waits for the parent's receipt acknowledgment while custody remains live. Discard schedules keep managed payloads until that same declared discard acknowledgment; replay handles drain separately before retirement. The existing original buffers are cleared only after this boundary.

Only the managed retirement callback now emits the existing drained request and waits for the restricted issuer's native retirement acknowledgment. Sibling and empty fresh reads use the same admission/drain/retirement discipline. New runtime checks attempt retirement while owned buffers are live, while consumer acknowledgment is pending and before even an empty buffer has been explicitly released; exactly one retirement request must follow each drain. The child still has only reader/revoker credentials. The native source closure now pins the custody implementation and JSON-copy/type dependencies in addition to the original pg-runtime/driver sources.

This connects the candidate component to the authored actual native schedules, not a general public broker. Original private journal/assessor copies and arbitrary host copies remain outside the routed publication custody claim; callback resolution still relies on the declared fixture consumer boundary. Process recovery, complete read/query/writer closure, authenticated public broker and L03/full backend admission remain open. Typecheck passes; the actual native run passes1227 unique matching observations across four schedules, including31 managed-custody checks. Twenty-seven component groups and105 evidence checks pass. Astra ultra independently verified all90 current source digests, acknowledgment-before-drain/issuer ordering and separate replay/sibling obligations, finding no actionable defect in this scoped integration. Full acceptance remains26/132 and the original goal stays active.


### Native consumer-failure quarantine — 2026-10-09

A fifth, final native schedule now delivers the original managed payload and receives an explicit consumer-release failure rather than acknowledgment. The callback rejects; host custody reports unknown and refuses retirement with zero issuer requests. The original payload remains retained through that failure boundary. A fresh actual ordinary writer attempt retains original request/response custody and must refuse42501 Publisher drain unavailable with no DataRow/CommandComplete, error ReadyForQuery and rollback. The lost original reader also refuses further use and is quarantined.

The child exits its run through transport cleanup and then completes the original journal bijection checks. The independent parent skips every retirement path, observes durable pending custody and all eight unchanged business relations before exit, and confirms pending state and ordinary revocation refusal after child shutdown. Owned fixture destruction is excluded cleanup and supplies no drain acknowledgment or recovery claim. The schedule remains last so its deliberately unresolved custody is never silently repaired to admit a later scenario.

Astra found that inherited terminal-history/revoked labels were misleading for this pending/active outcome. The refreshed source uses state-neutral final authority and explicit pending-history/binding/other-backend labels. Evidence validation now requires all five named schedules and eight critical failure assertion identities in addition to unique matching observations. The source-current native execution passes1421 unique matching observations across five schedules; twenty-seven component groups and106 evidence checks pass. Astra ultra independently verified all90 current source digests, five schedules and eight critical failure checks, confirmed no drain/retirement acknowledgment in the failure transcript and post-shutdown revocation refusal, and found no remaining actionable finding. Full backend acceptance stays26/132; public broker, general failure/recovery and L03 qualification remain open and the original goal remains active.


### Installed routine body source correspondence — 2026-10-09

The persistent raw probe now compares native pg_proc.prosrc against exact body bytes extracted from the three fingerprinted fixture SQL files in installation order. The reviewed parser admits only named functions with literal dollar-quoted bodies; the later revoke_alice replacement supersedes its earlier definition. The exact qualified set contains nine routines. Native enumeration covers every routine in both protected schemas, so an extra overload or routine changes the observed list and refuses correspondence. Existing independent signature/owner/definer/settings/ACL checks remain separately required.

A transactional control replaces only the retirement body with an unconditional return. It rejects the source baseline, matches an explicitly authored one-body mutation and demonstrates that a name-only assessor would miss the change. Rollback restores all bodies; each of the five final schedule cuts independently repeats complete correspondence. Eight complete expected/native body snapshots and two drift/control observations are retained. Evidence validation requires all ten assertion identities and all nine typed body records at each snapshot.

The native run passes1431 unique matching observations across five schedules, with90 current source digests. Astra ultra independently extracted all routine bodies, confirmed the later override and exact mutation/restoration/final snapshots, and found no actionable defect. This is installed-source correspondence for the reviewed PostgreSQL17.9 fixture subset, not independent semantic correctness, general SQL parsing, complete resolution/dependency inventory or public native admission. B12 and L03 remain unregistered; full backend acceptance remains26/132 and the original goal stays active. Twenty-seven component groups and107 evidence checks pass. Astra independently checked the source-coverage expression and rejected thirteen missing, duplicate or malformed evidence variants, finding no actionable defect.

### Registration failure atomicity and capacity controls — 2026-10-09

The in-process registration corpus now exercises a late ontology revision conflict
after a new policy candidate has been considered. A differently populated policy
with the same new revision then registers successfully, demonstrating that the
refused candidate did not reserve its pending policy pin. Existing handles retain
withholding. Forty unsupported candidates leave all 32 registration slots usable;
the next valid registration refuses while every issued handle keeps its controls.

`tests/security/registration.test.ts` passes four tests with 86 assertions.
Strict TypeScript passes. Chromium 153.0.8010.12 records ten registration outcomes
without mismatches in `evidence/security/logic-browser.json`. Astra independently
checks that premature-pinning and refused-registration-charge mutants fail the
controls. Its requested browser refinement now requires the exact
SECURITY_REVISION_REUSE, SECURITY_INTERPRETATION and SECURITY_REGISTRATION_BOUND
codes, preventing unrelated exceptions from satisfying failure-stage expectations.

These controls qualify in-process registration atomicity and the 32-handle limit,
not the separate 512-pin/text budgets, authenticated facts or native activation.
The pre-refinement complete acceptance replay is terminal with all 26 registered
cases passing and 106 required cases unimplemented. A fresh complete replay for
the final reviewed corpus and a component replay are running; that older aggregate
must not certify the subsequently refined browser source. All 132 original cases
and the full backend goal remain required.

The final reviewed registration corpus now has a terminal complete acceptance
replay: all 26 registered cases pass; 106 original required cases remain
unimplemented. The 59-group component replay also passes. Its regenerated
candidate-condition/proof-input receipt bytes require a dependent native/browser
replay; the broader validator currently reports those two stale checks among 150.
No previous aggregate total certifies that pending dependent evidence.

The dependent replay is now terminal: 213 PostgreSQL candidate observations and
36 Chromium artifact matches pass. The final broader validator reports 150
checks with zero failures. This restores freshness at the scoped component
boundary; it does not close any of the 106 unimplemented acceptance cases.

### Atomic security activation proof and isolated replay — 2026-10-09

The B09/L12 design now retains six conditional activation invariants with
explicit mutant transitions and isolated positive populations. Corrected
source-pinned activation receipt has 18 fresh Z3 4.15.4 queries. Astra reviewed
the activation algebra and source custody with no remaining actionable finding.
See TD-056 for premises, initial review corrections and retained failed aggregate
attempts. Publisher SAT example grounding and per-formula context isolation
leave universal safety predicates unchanged. Astra independently checked 84 regenerated assertion comparisons and both formerly unstable triplets, finding no remaining actionable issue in that correction.

Terminal verification passes 60 component command groups and 563 retained
formulas across 32 receipts. Regenerated condition inputs have fresh dependent
PostgreSQL 17.9 evidence (213 observations) and Chromium 153.0.8010.12 evidence
(36 artifacts). Current consolidated validator passes all 151 checks. Backend
activation/native refinement is still unfinished; no case or complete acceptance
criterion is closed by this conditional proof increment.

### Profile-checked native activation checkpoint — 2026-10-09

The PostgreSQL 17.9 activation component now retains 128 unique observations,
including 123 matching expected/observed pairs and five native custody records,
with seven current source pins. The private profile comparison checks catalog,
authority facts and version together; helper-body, grant, assignment and column
drift refuse before installation. Repeatable-read and serializable activation
refuse explicitly. A read-committed installer waiting for the exact assignment
table lock observes the writer's committed fact change and refuses the stale
profile, preserving policy and version. Full fact restoration is checked.
Astra ultra reviewed the final receipt and found no remaining actionable issue
in this scoped component. See the PostgreSQL raw test plan for the excluded
assessor role, failed-attempt provenance and admission limitations.

After the 60-group component execution, dependent condition evidence was freshly
executed: 213 native PostgreSQL observations and 36 Chromium 153.0.8010.12
artifacts pass. The consolidated evidence validator passes all 155 checks with
no failures. Retained formal replay remains 563 formulas across 32 receipts.
This checkpoint supersedes the earlier consolidated check counts for current
evidence only. Catalog/role writer participation, authenticated complete-bundle
admission and SQL/runtime refinement remain open; B09/L12 are not accepted.
The original 132-case scope is unchanged, with 26 accepted and 106 outstanding;
the full implementation goal remains active.

### Routine dependency race reproduced — 2026-10-09

Fresh PostgreSQL activation execution passes 137 observations, retaining an
excluded owner routine replacement after profile comparison and before commit.
The version advances while the ordinary outsider gains all five authored rows.
Exact helper restoration recovers the prior complete profile with only version
advanced. The raw backend test plan and TD-056 now record this physical
counterexample to treating selected relation locks as complete dependency
serialization. Full B09/L12 acceptance remains open.

Astra found and the implementation corrected a blocking observer read and a
validator gap accepting missing assertion payloads or mutually falsified empty
disclosure arrays. The new gate requires eight complete assertion records with
independent expected outcomes and original-oracle resource IDs. One 60-group
component execution passed before this validator correction; the final source
refresh and dependent native/browser evidence are still being executed. No
current consolidated success is claimed by this entry. Original acceptance
remains 26/132 and the goal remains active.

Final verification of the routine-race increment completed after the validator
correction: all 60 component groups, 213 dependent PostgreSQL observations,
36 Chromium artifacts and 156 consolidated evidence checks pass. Astra ultra
independently exercised the actual corrected gate with the unchanged receipt
and 16 adversarial in-memory mutations; the receipt passed and every mutation
refused. Seven activation source pins remain current. This supersedes the
pending verification statement above, without promoting B09/L12 or changing
the original backend acceptance count. The next implementation obligation is
enforced participation or denial of dependency writers through commit.

### Enforced routine-writer participation — 2026-10-09

The activation spike now installs a database-local CREATE FUNCTION event trigger
and a private serialized installer wrapper sharing an exclusive transaction
advisory guard. Fresh native execution passes 148 observations, including exact
helper-writer blocking through installer commit, resumed writer rollback,
complete profile preservation and independent ordinary result vectors. The
counterexample remains retained before the guard is introduced. The new
validator gate derives expected helper body from the original fixture and
checks exact custody and normalized complete profile preservation.

All 60 component groups pass. Dependent native/browser refresh and the final
157-check consolidated gate are pending, as is Astra's review of this guard
increment. This does not cover role changes, other DDL, guard administration,
committed-writer generation advancement or public/bypassing installer paths.
Full B09/L12 and original acceptance remain open at 26/132; the goal is active.

Astra confirmed the native mechanism but reproduced a verifier gap that allowed
the two added routines' signatures or bodies to change in the receipt while
passing the baseline comparison. The validator now binds both exact signatures
and canonical PostgreSQL definitions to bodies extracted from the authored
source SQL before excluding these routines. Its scoped guard check passes;
the consolidated attempt remains failed only on stale component/browser
receipts. A new source-bound component refresh is running, and dependent
native/browser execution must follow before final consolidated success.

Final source-bound verification now passes all 60 component groups, 213
dependent PostgreSQL observations, 36 Chromium artifacts and 157 consolidated
evidence checks. Astra independently checked the actual corrected gate against
eight separate signature/body/key/return-type mutations of the two new routines;
all refused, while the unchanged 148-observation receipt passed. All seven
activation source pins are current. No actionable finding remains in this
scoped guard increment. These terminal results supersede the pending refresh
and review statements above. B09 still requires actual native refusal of
unsupported path/mask/history/composition semantics in report mode, rather
than this routine-writer synchronization witness. Original full acceptance is
unchanged at 26/132 and the implementation goal remains active.

### Actual compiler factory-boundary witness — 2026-10-09

`activation-compiler-witness.rs` invokes the actual owner Weft compiler with an
observation callback at its backend-factory boundary. A fresh offline locked
build and `activation-compiler-boundary.py` replay pass nine source-bound
observations. A legacy positive control reaches that callback. A supported constant-mask
source passes semantic source admission and stops at the closed activation
gate; changing only its transform name refuses at source admission. Public security,
allowCandidate, unsupported path/mask, an invalid history-profile input,
a prohibited protected-field predicate and an unknown report option refuse without callback invocation or
executable output. Exact diagnostic codes, requests, response packets, build
command and current source/binary digests are retained in
`evidence/security/activation-compiler-boundary.json`.

The invalid history-profile input and unknown report options refuse at transport validation; they are not
implemented history/report semantics. The witness neither installs nor proves
native preservation. Astra identified the real integration boundary as fresh
owner source/plan/query-profile admission, followed by complete consumer
obligations and an opaque prepared handle before acquiring the installation
connection. Row-predicate success alone cannot discharge disclosure obligations;
the existing original/deny templates cannot represent arbitrary candidate bytes.
The next native bridge must preserve these distinctions and independently
compare the installed bundle before/after semantic refusal. Full positive
activation, B09 and original 132-case acceptance remain open. The new witness
is not yet included in the consolidated gate; its addition also makes the prior
component-source receipt stale until refreshed. Astra review is pending.

### Fresh compiler refusal alongside native preservation — 2026-10-09

The PostgreSQL activation spike now executes all nine owner compiler witness
requests while the original protected fixture is installed. Fresh native runs
pass 197 observations, retaining complete compiler requests/results and the
initial native inventory/authority/version profile. Each of eight refusal
cases preserves that complete profile and version 1; all 24 ordinary actor
reads match the independent membership oracle. The factory positive control is
noninstalling, and existing native installation controls remain separate. No
compiler response selects an original/deny installation template.

Astra independently checked the initial 197-observation receipt and all 82
source pins. Its review found that equal truncated baseline/profile records
could pass the first verifier. The gate now requires source-authored catalog
coverage, original-oracle authority facts, complete record fields, exact RLS
and policy semantics, and the original helper signature/body before checking
preservation. The corrected scoped check passes; the consolidated gate is
pending source refresh. The compiler witness is now one of 61 component command
groups. After that run, refresh the native activation receipt (its compiler
input receipt is regenerated), dependent native condition and Chromium evidence,
then rerun the 158-check consolidated validator. Astra's final review of the
completeness correction is pending.

This is refusal/native-preservation evidence, not a compiler-to-installer
admission protocol. Historical semantics, conflicting-disclosure composition,
supported positive compiler activation and complete source/writer admission
remain required for B09. Original acceptance remains 26/132; the full goal is
active.

### Compiler refusal/native preservation terminal checkpoint — 2026-10-09

Ordered final execution passes 61 component command groups, 197 PostgreSQL
activation/refusal observations, 213 dependent native condition observations,
36 Chromium artifacts and all 158 consolidated evidence checks. The activation
receipt was refreshed after compiler receipt regeneration, and all 82 source
pins are current. Astra verified the actual completeness gate against 685
omission variants plus erased definitions and disabled RLS; every variant
refused and the actual baseline passed. These results supersede the pending
verification and review notes for the refusal/native-preservation increment.
No compiler result is admitted to installation; B09 and complete positive
activation remain unfinished. Original full acceptance remains 26/132 and the
implementation goal remains active.

### Trusted original preparation integration — 2026-10-09

This supersedes the pending foundation note. The original-use host CLI now
accepts only a request, selects its profile from trusted host configuration,
freshly invokes the actual owner, and issues a local handle only after the
Truss consumer accepts. Caller handoffs, qualification flags and profile pins
are rejected. Three Bun tests with thirteen assertions and strict TypeScript
checking pass, including actual owner success followed by consumer refusal.

The native runner freezes the preparation module and complete selected lowerer
closure before process launch. Astra identified a missing explicit comparison
between the independent owner replay and internal preparation; all twelve
programs now assert exact handoff and ontology/binding/profile source JSON
correspondence before SQL installation. The refreshed PostgreSQL 17.9 receipt
passes 501 observations with 85 current source pins. Chromium passes twelve
program correspondences and fifteen refusal controls. Astra independently
verified the correction and found no remaining actionable defect.

The dependent typed-binding test host now selects each independently replayed
typed profile and uses the same preparation boundary. Text, int4 and int8
carriers still reach the consumer and refuse with the intended unsupported
query-use diagnostic. Astra independently replayed these controls. The fixed
raw profile of the main host CLI is unchanged. All 62 component groups pass.

These handles establish local preparation custody under trusted host source,
executable and filesystem configuration. They do not supply native credentials,
authentication, current inventory/fact admission or public policy installation.
B08/B09 and full backend acceptance remain open at 26/132. The implementation
goal remains active; the final consolidated refresh is recorded below.

### Trusted preparation terminal checkpoint — 2026-10-09

The completed ordered refresh passes all 158 consolidated evidence checks,
62 component command groups, 501 original-use native observations, twelve
original-use Chromium programs with fifteen refusals, 197 activation
observations, 213 dependent native condition observations and 36 condition
Chromium artifacts. The typed-readiness stale-source finding is resolved by
an actual replay through the updated host boundary; receipts were regenerated,
not repinned. Astra found no actionable defect in the final integration or
typed-refusal correction. Acceptance remains 26/132; no backend case was
promoted and the full implementation goal remains active.

### Preparation precedes native fixture acquisition — 2026-10-09

The original-use native host now prepares all twelve programs before its first
Docker listing/create or SQL call. It retains the independently compared
programs for subsequent installation and rechecks every captured source hash
immediately before native acquisition. Unsupported unrelated profiles and
protected projections are exercised before acquisition, requiring the actual
Truss unsupported-query-use diagnostic, nonzero exit and no output. The receipt
retains request and original process stdout/stderr/exit evidence. The
creation-attempt flag independently records no fixture creation; zero native
call ordering is additionally qualified by reviewed source and the separate
intercepted replay, rather than inferred solely from that flag.

PostgreSQL 17.9 passes 515 native observations; Chromium passes twelve programs
and fifteen refusals. Astra independently executed the actual preparation
prefix while intercepting direct Python Docker/psql dispatch: twelve programs,
44 checks, 27 executed owner/bridge subprocess records, zero native dispatches
and three interceptor self-controls pass. The full 85-source closure and exact
review command are retained in
`evidence/security/original-preparation-acquisition-review.json`. Interception
does not observe arbitrary OS-level descendants; trusted executable/source and
filesystem custody remain premises. Astra's overly broad initial refusal
finding is corrected by requiring and retaining the intended diagnostic.

All 62 component groups and 197 activation observations pass after this source
change. This is executable trusted-host ordering, not public compiler adoption,
native installation authorization or completed B08/B09. Acceptance remains
26/132 and the full implementation goal remains active. The dependent native,
browser and consolidated evidence refresh follows this checkpoint.

### Preparation/acquisition terminal checkpoint — 2026-10-09

Final ordered refresh passes all 158 consolidated evidence checks, 62 component
groups, 515 original-use native observations, twelve original-use Chromium
programs with fifteen refusals, 197 activation observations, 213 native
condition observations and 36 condition Chromium artifacts. Astra's retained
independent preflight review has 85 current source pins and no remaining
finding. The prior pending dependent refresh is superseded by these actual
terminal executions. Original full acceptance remains 26/132; the goal is
active and public compiler/native installation admission remains unfinished.

### Original owner security backend critical path — 2026-10-09

Astra's critical-path audit identifies the next implementation boundary in
Weft, rather than another UMF host wrapper. The actual public compiler discards
the admitted profiled security query and always refuses; ordinary backend
Plan/Context types cannot carry complete policy/disposition/dependency meaning,
and response 0.3 is blocked-only. The full goal requires a security-specific
owner/backend/result contract followed by real compiler-to-installer execution
for raw PostgreSQL B08/B09. Actual Truss graph adoption also retains its separate
unfinished commit finalizer; no raw fixture substitutes for that backend.

The owning Weft CONTRACT-005 now contains the reviewed planned boundary. It
requires actual immutable owner-admitted Catalog/logical policy/resolved and
profiled query views, exact source identities, complete per-scan/action
obligations, dispositions, an explicitly registered security interface and no
ordinary fallback. Native admission remains separate from compilation. It
permits isolated staging while preserving the prior protected installation,
then requires independent installed correspondence before atomic activation.
Astra corrected an initial bootstrap cycle and required valid owner-admitted
source whose backend obligations are unsupported, separately from malformed
source refusals. Both findings are resolved. The amendment was applied through
approved scoped filesystem escalation, with prior contract bytes preserved by
an exact before-hash guard. No compiler code or public activation gate changed.

Compiled response version/schema and the exact security registration API are
explicit design items still to resolve before dispatch implementation. The
first executable target must cover all B08 modes/operators, empty queries,
complete dependency refusal, supported positive lowering, B09 valid-source
physical refusal, rollback/concurrent changes and independently observed
installed ordinary behavior through the same public entrypoint/installer.
The goal remains the original 132 cases, with 26 accepted.

Actual owner Rust replay passes three groups; conditional graph proof replay
passes twelve queries; actual Truss candidate graph staging passes 88 native
observations. Dependent selector/compiler/condition receipts were regenerated
through execution after their stale-source guards refused the old contract.
Astra verified the applied amendment and current Rust/formal source closure;
final component/native/browser/consolidated refresh is pending below.

### Owner contract boundary terminal checkpoint — 2026-10-09

All 158 consolidated evidence checks pass after actual dependent replays:
three owner Rust command groups, twelve conditional graph queries, 88 native
candidate graph-stage observations, 62 component groups, 197 native activation
observations, 213 native condition observations and 36 condition Chromium
artifacts. Additional source-dependent Chromium refreshes pass 13 candidate
endpoint, 144 association, 33 relationship and 22 graph-source checks. Earlier
stale-source refusals are superseded only by these terminal executions;
no stored receipt was repinned. Astra verified the amended owner contract and
resolved its two findings. The closed public compiler is unchanged. Full
acceptance remains 26/132; next resolve the exact security compiled-result schema
and registration API before implementing the public compiler/installer path.
The full implementation goal remains active.

### Reviewed security compiler protocol draft — 2026-10-09

The owning Weft CONTRACT-005 now defines draft compile 0.4, security backend
0.1 registration, an owned lowering return, typed result contracts and tagged
result cells. Four new versioned transport schemas accompany the amendment;
older interfaces and the public compiler's security refusal remain unchanged.
The installation preserved prior contract bytes and refused source drift or
existing-schema overwrite. This is design readiness, not implemented dispatch.

Astra's review resolved missing exact result-contract serialization/hash binding,
missing constant-mask configuration and normalized rule/target/field linkage,
underspecified return/manifest/candidate selection, and unbounded recursive
cell batches. Native admission stays independent and cannot be granted by a
compiled success flag. Candidate selection cannot erase unsupported semantics
or incomplete obligations. Cell parsing must bound bytes, depth and nodes and
release no prefix of a refused batch; runtime enforcement is still required.

The retained `tools/security/weft-protocol-conformance.ts` passes 54 transport
shape/custody checks and strict TypeScript checking. It admits only the installed
runner/schema paths, parses frozen captured inputs, pins the complete Ajv
executable dependency closure and Bun executable, then checks unchanged bytes
before publication. Independent evidence validation requires the exact source
set and complete ID-to-Boolean expectation table. The separately retained
mutant runner executes captured helper bytes and rejects every omitted source,
every reversed expectation and duplicate/unrelated controls: 607 checks pass.
Astra's evidence-binding findings are resolved; review and execution receipts
are retained under `docs/helix/04-build/evidence/security/weft-protocol-*.json`.
These synthetic transport positives do not establish owner/native admission.

After the final source changes, actual dependent replays pass: three owner Rust
command groups, twelve conditional graph proof queries, 88 native graph-stage
observations, 62 component groups, 197 native activation observations, 213 native
condition observations and 36 condition Chromium artifacts. Additional Chromium
refreshes pass 13 endpoint, 144 association, 33 relationship and 22 graph-source
checks. All 159 consolidated evidence checks pass with current source pins.
Earlier stale component/condition receipts and unchanged-source refusals are
superseded only by those terminal executions, not by editing their fingerprints.

Next implement the private-constructor security context and explicit Rust
registry against this contract, preserving zero callback calls on owner refusal
and prohibiting ordinary fallback. Complete semantic/coverage validation before
admitting a compiled result, then connect real raw PostgreSQL lowering and the
transactional installer through the same public entrypoint. Runtime cell-domain,
duplicate-member/budget checks, installed correspondence, graph commit finalizer
and other backend acceptance remain unfinished. Formal proofs remain conditional
on their models; no general logical-to-native refinement is claimed. Original
full acceptance remains 26/132 and the implementation goal remains active.

### Actual Rust security registration boundary — 2026-10-10

Weft now implements the compile 0.4 Rust security-factory entrypoint, a separate
explicit security registry, the private-constructor immutable owner context and
owned lowering/result/obligation declaration types. Actual bounded policy,
ontology, logical query and query-profile admission precede context construction.
The factory receives the original admitted objects, including complete existing
scan/action obligations; source reuse and exact query-object correspondence are
checked. Registration is distinct from ordinary backend composition, with exact
backend ID/version and target-profile membership. Legacy 0.3 refusal and ordinary
compile behavior remain covered by the current owner compatibility tests.

This increment admits registration only. Manifest parsing checks closed
structure, exact version tuple, bounds and declaration/reference integrity.
Neither registration nor target membership establishes binding, session/domain,
capability or complete semantic coverage. `SecurityBackend::lower` is never
called: the compiler still returns LOWERING-UNSUPPORTED after registration until
independent physical/result/dependency validators exist. No compiled success or
native installation is introduced. Python/browser security registration remains
separate unfinished host adoption.

Six additional owner integration tests cover actual callback ordering and owner
object identity, projection and field-free count dependencies, source/profile
refusals, missing or mismatched registration, ordinary fallback prohibition,
closed manifest negatives, and all three manifest statuses with both candidate
option values. Astra reproduced a warning-only callback Diagnostic violating the
blocked-response schema. The fix preserves valid bounded error diagnostics and
replaces malformed severity/code/phase/message/span with a fixed bounded error;
eleven actual public-entrypoint controls and Astra's relinked external client
verify the correction. The external private-context-substitution compile-fail
control passes. The owner replay now retains four command groups, including
60 library tests, 48 security-admission tests and the documentation negative.
Review evidence is `weft-security-registration-review.json`.

Fresh owner version/handoff/original-use and typed-refusal foundations were
executed after the final Rust change. Astra independently regenerated the
preparation review: 91 current pins, twelve programs, 44 assertions and zero
direct parent native dispatch attempts before preparation, with the previous
receipt retained by hash. Actual original-use native replay passes 515
observations; original-use Chromium passes twelve programs and fifteen refusals.
Conditional graph proof replay passes twelve queries, and actual candidate graph
staging passes 88 observations. No general compiler-to-native refinement or
source authentication follows from these scoped observations.

The initially attempted component refresh could not resolve missing offline
Cargo registry entries. Locked workspace/witness fetches restored the metadata;
actual subsequent execution passes all 62 groups with unchanged sources. The
source-dependent native activation/condition and Chromium refreshes pass 197,
213 and 36 observations/artifacts. Additional compiler-key, predicate, type/key,
transport and namespace native foundations and their dependent browser/stored-key
replays were executed after stale-source validation identified the dependency
closure. All 159 consolidated evidence checks now pass. Protocol transport and
its receipt-mutant corpus remain 54 and 607 passing checks respectively; no
receipt was qualified by editing its fingerprints.

Next implement independently complete selected capability/binding, result-domain
and scan/action/disposition coverage validation, then actual raw PostgreSQL
lowering and atomic native installation through this public owner entrypoint.
The graph commit finalizer, authenticated native admission, result-cell runtime
validation and other backend cases remain required. Original full acceptance
remains 26/132; the full implementation goal is active.

### Owner-derived result envelope design spike — 2026-10-10

SPIKE-010 defines the next private owner requirement boundary: explicit primary
action, complete scan/action rule joins, separate disclosed/original-authorized
operator modes, and ordered outputs from the actual application plan. Direct
field domains remain revision-qualified model domains. COUNT/SUM stay explicit
unresolved result requirements until their relational/disclosed semantics are
validated; a first direct-field checker cannot silently skip them. Requirement
expansion must charge work/text budgets before cloning. Existing opaque manifest
domain objects remain declarations; a closed matching grammar and binding/session
interpretation still precede physical dispatch.

The conservative permit-disposition union is an allowed-outcome envelope, never
permission for the backend to choose an outcome. All runtime scoped rules,
Unknown refusal, protected defaults, withheld precedence, conflicts and exact
normalized transform equality remain required. The Z3 4.15.4 analysis executes
29 selected bounded checks: twelve UNSAT searches, twelve explicit nonvacuity SAT
populations and five SAT weakening/omission controls. Every retained pre-solve
formula is parsed/replayed in a fresh solver context. The 47 captured source and
runtime pins remain unchanged. This conditional abstract model does not prove
Rust extraction, literal normalization, result presence/encoding or native SQL.

Astra independently replayed all 29 formulas and verified all 47 pins after
fixes to SMT capture, duplicate misleading mutant labels and nonvacuity evidence.
Its final scoped review is clean. Receipts are `result-envelope-proof.json` and
`result-envelope-astra-review.json`; no original acceptance case is promoted.
Next implement private owner-issued requirements and direct-field declaration
correspondence tests, then complete aggregate/capability/binding/native gates.
Compiler lowering stays closed and full acceptance remains 26/132.

### Actual private owner requirement inventory — 2026-10-10

Weft now constructs SecurityRequirements inside the private backend context after
exact source/profile/binding and actual query identity rechecks, before registration
dispatch. The new `security_requirements` module retains immutable borrowed
scan/action inventories and complete actual Rule objects, explicit
Disclosed/OriginalAuthorized operator modes, the primary action from the admitted
profile, and every ordered actual application Output occurrence. Rule conditions,
disclosures, keys, fields, context and complete association requirements remain
available without cloning their trees. Public callers cannot construct,
deserialize or replace the owner requirement inventory.

The counted derivation ledger refuses at one million visits or sixteen million
selected identifier bytes before retaining further entries. It does not bound
every comparison or CPU instruction; upstream parser/container bounds remain
required. COUNT/SUM are preserved requirements rather than admitted result
contracts. Every registration still ends at the existing lowering refusal gate.
The governing owner CONTRACT-005 records the module/construction boundary.

Actual Rust verification passes 62 library and 49 security-admission tests. New
cases exercise repeated output aliases, COUNT/self-join scan occurrences, SUM's
nullable computed integer domain distinct from its signed64 source argument,
admitted predicate/aggregate original-action modes, full false-permit/forbid Rule
identity, and exhaustion during actual admitted COUNT requirement derivation.
The owner evidence replay retains four command groups, including the new external
private-inventory substitution compile-fail control. Astra's installed-source
review is clean; receipt: `owner-requirements-astra-review.json`.

All source-dependent owner, component, native and browser producers were actually
replayed after the final source change. The component suite remains 62 passing
groups; original-use native/Chromium evidence remains 515 observations and twelve
programs/fifteen refusals; native activation/condition remains 197/213. Graph
staging, key/predicate/transport and dependent browser/stored-key witnesses were
also replayed. Astra independently refreshed preparation preflight (92 fresh
pins, twelve programs/44 assertions, zero direct parent native acquisition) and
all 29 result-envelope formulas/47 proof pins, retaining prior reviews by hash.
The final consolidated validator passes all 159 checks with fresh sources.

Next implement owner-checked ordered result declaration correspondence, complete
disposition/domain validation and closed capability/binding matching. Runtime
cells, actual physical compiler lowering, atomic installation, graph finalization
and all remaining backend cases remain required. No original acceptance case was
promoted; full acceptance is 26/132 and the original goal remains active.

### Pure direct-field result declaration correspondence — 2026-10-10

The actual Weft private owner context now exposes a pure declaration checker.
It compares every ordered direct-field output with its actual scan occurrence,
exact revision-qualified source and model domain, and the complete conservative
permit disclosure inventory. Equivalent exact constants retain every class
source; distinct classes and Withheld remain declared. Optional Original
presence, Absent, aggregates and incomplete or extra outcomes refuse. A valid
declaration does not issue an executable artifact or permit runtime release.
Public compilation still reaches the unconditional lowering refusal gate.

Astra ultra feedback was implemented: normalized numeric payload is charged
against the aggregate byte budget even for short exponent tokens, and caller
lookup/domain/literal failures use LOWERING-UNSUPPORTED while initial source
custody diagnostics propagate. Isolated mutations assert that diagnostic.
Actual owner execution passes four command groups, 63 library tests and 55
security-admission tests. Dedicated controls include 256 accepted outcomes, 257
required outcomes refusing despite a truncated caller declaration, and COUNT
refusal both alone and beside a valid field. CONTRACT-005 owns the boundary;
STP-056 records partial component coverage and remaining dedicated controls.

Astra's final source review is clean within scope, retains eleven reviewed pins
and independently audits 408 admission pins. It explicitly attributes Cargo
execution to the parent. Receipt: `owner-result-checker-astra-review.json`.
The abstract 29-query/47-pin result-envelope proof remains conditional and does
not establish Rust extraction or general physical compiler refinement.

After the final code correction, all dependent producers were actually replayed:
owner/transport/refusal controls, twelve graph proof queries, 88 native graph
staging observations, 62 component groups, and native/browser query, activation,
condition, graph-input, key and transport witnesses. Stored-key replay remains
explicitly non-native. Astra refreshed preparation evidence with 93 current
pins, twelve programs and 44 matching assertions, preserving the previous
review by hash. The consolidated evidence validator passes all 159 checks.

No original required backend case is promoted; acceptance remains 26/132.
Next complete dedicated correspondence controls, capability/binding matching,
runtime cells/presence and physical lowering before atomic native installation
and graph finalization. The original implementation goal remains active.

### Protected default and null declaration regression — 2026-10-10

Added an actual admitted-source owner control for protected optional salary with
no disclosure and with explicit constant null. Invented Original refuses in both
configurations. Transformed(null) passes declaration correspondence; Absent and
Withheld substitutions refuse LOWERING-UNSUPPORTED. Both variants reach the
owner callback and retain public backend-required refusal. Implementation bytes
are unchanged. Rust verification passes 63 library/56 security-admission tests
and all four owner command groups. STP-056 records the partial R03/R09 evidence.

Astra reviewed the actual control, refreshed eleven review pins and audited all
408 admission pins, attributing execution to the parent. Prior reviews are
archived by hash. All dependent owner/proof/staging/component/native/browser
producers were actually replayed; preparation evidence has 93 current pins,
twelve programs and 44 matching assertions. Consolidated validation passes all
159 checks. Stored-key replay remains explicitly non-native. No runtime presence,
cell selection or backend case is accepted by this declaration-only regression.
Acceptance stays 26/132 and the original goal remains active.

### Runtime JSON bounds foundation — 2026-10-10

Implemented private checked_json_bounded with explicit UTF8 byte, root-depth-one
and value-node limits, decoded duplicate detection and complete final parsing.
Ordinary checked_json preserves its existing limits. Three Rust tests exercise
exact/over byte limits including UTF8/whitespace, depth/node accounting, nested
escaped duplicates and malformed syntax. Actual owner verification passes four
command groups, 66 library and 56 security-admission tests. CONTRACT-005 records
raw-entry allocation and the absence of any runtime-cell/release consumer.
STP-056 records the component scope and still-required production-bound tests.

Astra's source review is clean within scope; owner-bounded-json-astra-review.json
retains source pins and independently audits 408 admission pins while attributing
Rust execution to the parent. Final-source owner/proof/staging/component/native
and browser producers were actually replayed. Preparation evidence passes with
93 current pins, twelve programs and 44 matching assertions. Consolidated
validation passes all 159 checks. Historical reviews remain archived by hash.

The next consumer must enforce production cell bounds, exact contract custody,
row shape, selected domain and constant equality before policy selection/current
authority/final release can be admitted. No original backend case closes,
acceptance remains 26/132 and the original goal remains active.

### Pure owner-context runtime cell correspondence — 2026-10-10

Implemented private security_result_cells and the public owner-context pure
check_result_cells method. It rechecks actual declaration/source correspondence,
exact retained contract bytes/hash and full structural equality, then validates
a closed version/hash/rows envelope, ordered row width, selected outcome tag,
model-domain literal and exact normalized constant equality. Both JSON inputs
use 32MiB/depth64/1000000-node bounds; rows cap at4096. No executable artifact,
checked batch or release capability is returned. Public lowering stays closed.

Actual owner tests exercise complete/empty batches, custody mismatches, duplicate
contract/batch members, width/tag/member errors, invalid/null domains, equivalent
numeric tokens, different valid masks, signed64 overflow, value on Withheld and
Transformed(null). Astra feedback corrected reused budget errors to result-phase
WFT-LIMIT. Real2/6-cell positives and8-cell aggregate refusal use individually
valid1M strings with JSON below32MiB. Rust verification passes66 library and57
security-admission tests plus all four owner command groups. CONTRACT-005 owns
the boundary and STP-056 records component observations and remaining controls.

Astra's final installed-source review is clean within scope; receipt
owner-result-cells-astra-review.json retains14 reviewed pins and independently
audits409 admission pins, explicitly attributing Rust execution to the parent.
After the final diagnostic fix, all dependent owner/proof/staging/component/native
and browser producers were actually replayed. Preparation now includes94 current
pins,12 programs and44 matching assertions; prior review archived by hash.
Consolidated validation passes all159 checks. Stored-key replay remains non-native.

Production exact byte/depth/node/row boundaries, actual policy-authorized outcome
selection, native codec/source correspondence, current authority and guarded
release remain open, as do physical compiler lowering/atomic installation and
backend coverage. No original case closes; acceptance stays26/132 and the goal
remains active.

### Original PostgreSQL string rows to owner cells — 2026-10-10

Added the experimental security_cell_inspection Rust example. Its closed input
retains compile-request JSON and native-row JSON; a fresh source-admitted owner
callback derives ordered Original direct-field declarations, encodes only string
rows and invokes the actual cell checker. Output is correspondence counts/hashes
and releasedRows0. Compilation must still end in backend-required refusal. It
has no database connection, installer, checked batch or release token.

The original PostgreSQL17.9 probe now captures exact binary psql stdout under
the ordinary SCRAM role for predicate/order/join populated and empty samples.
Trailing LF survives strict UTF8 decoding into the bridge; its retained-input
hash equals the original captured bytes. Null/wrong-width mutations refuse with
parsed exact code/phase and empty stdout. The final native run passes539 unique
matching observations, including six byte captures and twelve bridge refusals.

Astra feedback was implemented: selected build inputs are frozen before Cargo,
bytes and exact inventory/config presence rechecked afterward and at later
boundaries, then the produced binary is captured separately. The206 selected
build-input pins and244 total native pins are current. Cargo dependency/cache
artifacts, platform linker/SDK and environment remain explicit trusted premises;
no complete hermetic-build or host-tamper proof is claimed.

Astra independently audited the retained539 observations, six captures, source
request conversion, actual owner output identity, independently authored
declaration SHA and twelve exact diagnostics; scoped review is clean. Receipt:
original-cell-bridge-astra-review.json. Its updated preparation guard independently
ran one exact Cargo build,13 owner executions and14 host bridges, with44 matching
assertions, two build-guard refusal controls and zero direct native acquisition.
Previous preparation evidence is archived by hash.

Components pass62 groups; refreshed conditional carrier formulas pass4 queries,
and formal replay passes563 formulas across32 receipts without claiming compiler
refinement. All dependent native/browser producers were actually replayed after
final sources; consolidated validation passes159 checks. Existing Rust owner
evidence remains66 library/57 security-admission tests. Stored-key replay remains
non-native. STP-056 records the native-link subset and remaining controls.

This links original fixture string values to owner cell interpretation, not
protected/native aggregate codecs, policy-selected mask truth, coherent current
authority or guarded release. B07/B08/B09 remain open and no original backend
case is promoted. Full acceptance remains26/132; the goal stays active.


### Conditional result selection checkpoint — 2026-10-10

The actual Weft owner now checks supplied per-row scan/action/rule truths against
its immutable source-bound requirements before accepting the selected cell
outcome. Every required action must Permit, and ordered outputs retain their
actual scan occurrence even for self-joins. Existing conservative declaration
and exact cell/domain/custody checks precede selection. Original, Withheld and
exact normalized constant transforms are matched to the existing composition
fold; no caller-selected potential outcome can bypass that fold.

Astra ultra feedback is implemented and independently reviewed. Isolated
controls now refuse a failing secondary original-use action with unchanged
permitting primary actions, a failing later row after a valid first row, and
selection-ledger exhaustion after valid declaration and 4096 small-cell checks.
The new secondary fixture initially used an invalid singular action property;
strict source admission rejected it before dispatch. It was corrected to the
actual actions array before the final passing replay. The contract names the
selected byte categories charged and excludes uncharged composition inspection,
normalization and CPU/allocation. Actual owner verification passes four groups,
66 library and58 security-admission tests, with410 current source pins.
Review: owner-result-selection-astra-review.json (19 review pins); execution is
parent-attributed, not an independent Rust replay or compiler refinement proof.

All downstream evidence producers were replayed against frozen final sources.
Components pass62 groups; formal replay passes563 formulas across32 receipts.
The isolated PostgreSQL17.9 original native run retains539 matching observations,
six exact captured byte streams and twelve bridge refusals. Its245 source pins
and207 selected build inputs are current. Astra independently audited the native
receipt and bridge correspondence without native reacquisition. Updated
preparation independently passes12 programs/44 assertions, one exact Cargo
build,13 owner executions and14 host bridges, with zero direct native acquisition;
previous reviews are archived by hash. The complete native/browser pipeline
finishes with159 consolidated checks passing. Stored-key replay remains non-native.

STP-056 links these partial controls to the result correspondence test plan and
B07/B08/B09. Supplied truths can be infeasible under actual source conditions;
this is conditional simulation, not authenticated fact evaluation or authorization.
Original-value row provenance, correlated actual facts, compatible current
native authority and guarded release remain open. Empty batches grant no query
permission. Public compiler lowering stays closed and no release token or checked
batch is issued. No original backend case is promoted: acceptance remains26/132
and the implementation goal remains active.


### Evaluated scoped-fact/value correspondence checkpoint — 2026-10-10

The actual Weft owner now exposes `check_simulated_fact_selection`. A closed
versioned row envelope binds every fact to its actual owner scan and exact target.
The existing finite Record interpreter eagerly preflights every required rule,
then evaluates each actual scan/action/rule from one supplied simulated cut.
Only those internally evaluated truths reach the conditional selection check.
Original cells also equal their scan fact's exact normalized field value under
complete declared field coverage. Repeated identities in bag/self-join rows,
the subject and association population must retain one normalized field/absence
assignment. The method returns unit only; no checked batch or release token.

Actual owner controls exercise Original and conditionally masked outputs in
single-scan/self-join contexts, Project/Staff membership, missing/inactive
associations, incomplete dependencies including empty batches, stale caller
generation, work exhaustion, duplicates/missing fields/foreign scans, later-row
coherence and distinct-scan swaps. Missing projected Original values and coverage
are isolated from policy preflight. Identical and numerically equivalent scoped /
population assignments pass; conflicting Resource or subject assignments refuse.
The distinct-row self-join fixture uses a satisfiable tautological join condition;
the method itself still does not evaluate query predicates or join provenance.

Astra ultra found metadata amplification before the downstream selection ledger.
Generated truth-map rule/action/scan IDs are now charged before cloning against
a separate one-million-visit/sixteen-million-byte ledger. An admitted129-rule
fixture with128-byte rule IDs passes512 repeated rows;1024 individually valid
small rows refuse this metadata ledger at WFT-SECURITY-EVALUATION/model after
successful declaration/cell checks. Parser limits are per cut/rows text, while
the4M input byte limit is combined. Underlying literal/source diagnostics retain
their original boundaries. One test initially used unsupported leading-zero
numeric syntax; it correctly refused and was changed to supported exact `1e2`
before the final passing replay. No language support claim was broadened.

Final actual owner evidence passes four groups,66 library and60 security-admission
tests with410 current pins. Astra's clean scoped review has21 pins and nine
observations in owner-fact-selection-astra-review.json; Rust execution remains
parent-attributed. The earlier owner-result-selection review remains historical,
not silently repinned after its governing contract changed. STP-056 records the
partial R01/R02/R04/R05/R07/R11/R12 and B07/B08/B09 correspondence controls.

All affected producer evidence was regenerated from frozen final sources.
Components pass62 groups; formal replay passes563 formulas across32 receipts
without compiler/interpreter refinement claims. The native/browser pipeline
passes159 consolidated checks. The PostgreSQL17.9 fixture retains539 observations,
six exact byte captures and twelve bridge refusals, with245 current source pins
and207 selected build inputs. Astra independently audits that retained native
receipt without native reacquisition. Independent preparation passes12 programs /
44 assertions, one exact Cargo build,13 owner executions and14 host bridges;
zero direct native acquisition. Prior preparation/native reviews are archived
by hash. Stored-key replay remains non-native.

The new evaluated-fact API has actual Rust evidence; the native bridge still
checks its prior Original string-cell inspection subset. No native fact capture,
new browser/WASM API parity, authenticated issuer/census, actual query result
completeness, empty-result query-wide original-action admission, current authority
or guarded release is qualified by this checkpoint. Supplied trust/coverage /
generation remain caller assertions. Native graph witnesses outside the existing
Record interpreter refuse. Public compiler lowering stays closed. No original
backend case closes: acceptance remains26/132 and the full goal stays active.

### Captured native facts and strict object carriers — 2026-10-10

The new experimental `security_fact_inspection` owner executable consumes exact
native row text plus captured model facts, evaluates the admitted Record policy
conditions for each actual query scan, and checks result selection and Original
field values without releasing rows. The isolated PostgreSQL 17.9 producer
`tools/security/pg-owner-fact-selection.py` passed63 observations across6captures:
Alice/Bob single scans, Cartesian selfjoins containing distinct resource
identities, and empty single scans. It checks the complete authored typed fixture
census, rejects a real native string-valued salary mutation, and retains swapped
selfjoin scope, incomplete coverage, stale generation, inactive membership and
substituted Original value controls. Helper execution and SQL use frozen reviewed
bytes; selected build inputs/config presence are checked around the build and
native acquisition. This is selected source correspondence within trusted build
and fixture premises, not a hermetic or authenticated build.

Astra ultra independently reproduced Serde positional-array admission and the
feedback was implemented: both inspection envelopes require object roots, and
the new fact path additionally requires object carriers for cut/scoped roots,
facts, field values, coverage and qualified references before decoding. The
legacy standalone simulator is unchanged. Actual owner admission replay passed
66 library/60 security tests, including11 nested-carrier mutations. Foundation
replays passed6 owner-dispatch producer groups,12 original graph conditions,
88 native graph observations,62 protocol/component observations,4 carrier
controls and563 formal observations across32 retained proofs. These remain
qualified component/model results rather than production backend proofs.

The retained `owner-fact-bridge-astra-review.json` independently audits all63
unique observations,236 current source pins and208 selected build inputs. It
replays6 captured positives and12 independently reconstructed array-carrier
mutants against the pinned actual owner binary and independently derives every
result-contract hash. The original native producer also passed545 observations,
including6captures and18 bridge refusals after the outer-array correction.
Review receipts retain source/build premises and execution evidence; previous
reviews remain historical when their pins no longer match.

Native fact capture is now evidenced for this fixed raw fixture. Separate native
connections do not establish one authenticated coherent cut or protection against
ABA changes. Trust, generation, coverage and mapping assertions remain fixture
premises. Actual query result completeness, compiler lowering refinement,
authenticated issuer/current authority, guarded release, arbitrary native codecs,
graph property projection and browser/WASM parity of the new API remain open.
No original backend case is promoted: acceptance remains26/132 and the full goal
stays active. See STP-056 and the retained receipts for partial AC correspondence.

Astra's original-cell audit also passed545 unique matching observations,
246 current source pins,208 selected build inputs,6 exact captures and18 exact
refusals. The22-command dependent native/browser replay passed its execution
producers; its final freshness check identified only the component receipt's
pin of the changed validator. That component producer is replayed rather than
editing retained hashes. The validator now includes freshness checks for the new
native fact receipt and independent fact bridge review; those checks preserve
its existing limited source freshness/allocation scope.

Final dependency-order refresh passed:62 component commands, followed by197
activation observations,213 candidate-condition native observations and36
browser artifacts against their regenerated inputs. The consolidated evidence
validator passed all161 checks with no failures. No retained source hashes were
manually repaired and no backend acceptance case changed.

### Security registration object grammar — 2026-10-10

The next critical compiler boundary is selected capability/binding admission,
not another supplied-fact inspection wrapper. Astra's source audit confirms
that registry selection currently checks backend/version/target identity but
logicalDomain, resultDomain, constraints, target settings and bindingProfile
remain uninterpreted declarations. SPIKE-010 requires a closed versioned matching
grammar before dispatch. The next implementation must derive every actual
scan/action/rule/operator/output requirement, including false branches, ordered
Keys, association and context dependencies; interpret complete selected domains,
bindings/settings/constraints and obligation parameters; and preserve candidate
restrictions. Its admission result must be private and immutable. Physical,
result and native-obligation validation remain required before successful lower
and compiled response emission. The following milestone is an actual registered
raw PostgreSQL backend whose public compiled artifact reaches the real installer
unchanged, with ordinary execution and B08/B09 refusal/rollback evidence.

The audit also found a concrete registry grammar defect. The actual Rust
regression reproduced acceptance of six positional struct carriers: manifest,
source profile, target profile, capability, language profile and obligation.
`security-manifest-carrier-counterexample.json` retains that historical pre-fix
execution and exact source hashes; those hashes are intentionally historical.
The owner parser now requires object carriers before Serde decoding. It preserves
opaque domain, target-setting and obligation-parameter JSON rather than changing
unknown meanings. The focused regression checks exact nested arrays/objects/nulls
in all four opaque payloads and refusal of all six positional carriers through
both parser and registry. Actual owner replay passed4 producer groups,66 library
and61 security tests. This corrects declaration admission, not capability
coverage or native enforcement. The public lower gate remains closed and no
original acceptance case is promoted; the full132-case goal stays active.

Astra independently executed the final focused Rust regression, retaining464
current source/runtime/review pins in `security-manifest-carrier-astra-review.json`.
All six refusals and all four opaque-payload equality assertions passed. The
owner foundation was regenerated after that final test change, then Astra's
independent preparation replay passed12 programs/44 assertions with246 current
source pins and208 selected build inputs, one exact Cargo build,13 owner and14
bridge executions, and zero direct native acquisition. Final native fact capture
passed63 observations/6captures; Astra's independent fact audit replayed6positives
and12malformed carriers against the fresh actual binary and verified all236
source pins/208 build inputs. Previous changed-source reviews are archived by
hash; the pre-fix counterexample remains explicitly historical. Graph evidence
passes12 conditional queries and88 native staging observations, and formal replay
passes563 observations across32 retained qualified proofs.

Final current-source replay passed all22 dependent native/browser/evidence
commands. The original native producer passed545 observations and Astra's
independent audit verified246 source pins/208 selected build inputs,6 exact
byte captures and18 refusals. Component production passes62 commands against
regenerated graph inputs. The consolidated validator now also checks freshness
of the independent manifest review and passes162 checks with no failures.
Acceptance remains26/132. The matching grammar in SPIKE-010 is still an explicit
next design item, not a supported capability inferred from opaque declarations.

### Security matching checkpoint — 2026-10-10

SPIKE-010 now proposes complete action-fold, operator and output bundles as the
unit of selected capability matching, with compatible interpreted semantic
profiles and a distinct versioned Record-home binding. Carrier correspondence
requires bidirectional complete selected-Key population equality, no extra or
duplicate rows, and normalized field coherence. This remains a design proposal;
closed logical/result-domain grammars and actual owner-private interpretation
are unfinished. Obligation parameter transport custody remains explicit work.

The new capability-bundle proof retains ten laws / thirty formulas, including
explicit guard-deleted candidate/status/constraint matchers and a compatible
positive population in which two capabilities each cover only their own complete
bundle. Astra ultra feedback was implemented, then all thirty formulas replayed
independently (ten UNSAT, twenty SAT) with current source pins and a clean review
within the abstract scope. Exact mappings and complete bundles are predicates,
not proved Rust derivation, native correspondence or authentication. Evidence:
`evidence/security/capability-bundle-coverage-formal.json` and
`evidence/security/capability-bundle-coverage-astra-review.json`; partial
traceability is US-056-AC6/AC7, with zero backend cases promoted.

Full retained formal replay passes593 formulas across33 receipts. The refreshed
component producer passes62 commands; regenerated dependent native activation
and graph-condition checks pass197 and213 observations respectively, and the
Chromium graph-condition consumer passes36 artifacts. Consolidated evidence
validation passes165 checks. Acceptance remains26/132; public lowering remains
closed. Next implement and independently test owner-derived bundle and closed
binding/profile interpretation before any backend lowering dispatch.

### Owner semantic matching implementation checkpoint — 2026-10-10

The private Weft Rust module `security_semantic_coverage.rs` now interprets the
closed logical/result-domain grammar described in SPIKE-010. It borrows the
actual owner scan/action Rules and full relational application plan, checks
complete action bundles without partial-capability union, retains every scan
and ordered output position, and refuses computed/optional results under this
first direct-result profile. Its selected-target list restricts action/application
roots; it is explicitly not the field/domain/ordered-Key/endpoint/provider
binding inventory. Exact interface and all five source-profile values, target
applicability, eligibility and selected unknown meaning are rechecked.

Astra ultra found and the implementation corrected indirect source-tuple trust,
unbudgeted lookup/copy/matching work and wrong-phase selected-target diagnostics.
The single ledger charges source and selected metadata before copies, indexes
only selected owner modules, and bounds condition traversal and matching. Six
actual Rust tests cover grammar mutants, complete-rule nonunion, explicit status
and source substitutions, duplicate output positions, selfjoin occurrences,
field-free COUNT refusal, false-branch exact19-node/6-depth/2-Exists bounds, and
exact/minus-one/zero work/text ledgers. Astra independently ran all six tests;
772 source/config/runtime pins remained unchanged. Evidence is
`evidence/security/owner-semantic-coverage-astra-review.json`; this is partial
US-056-AC6/AC7 declaration correspondence, not backend implementation or native
admission. The module remains private and disconnected from public dispatch.

Final source-frozen owner foundation passes72 library tests,61 security admission
tests and the other existing frontend/envelope/literal/doc groups. All six
owner/protocol producers pass, including607 protocol evidence controls. Refreshed
component production passes62 commands. All22 dependent native/browser/evidence
commands pass; original native capture has545 observations, fact capture has63
observations/six captures, graph staging has88 observations, and the consolidated
validator passes167 checks. Formal replay remains593 formulas across33 qualified
receipts. Current independent reviews verify the manifest carrier, preparation
acquisition, fact bridge and conditional matching laws against final source pins.

Acceptance remains26/132. No native case was promoted. Next implement the closed
Record-home binding interpretation against actual owner domains and ordered
Keys/endpoints, target settings and complete obligation-parameter custody; then
compose physical/result/obligation validation before any lowering dispatch.

Astra's final original-cell audit also independently executes all six retained
capture packets and eighteen reconstructed null/width/positional refusals
against the pinned current owner binary (24 executions). It verifies247 native
source pins and209 selected build inputs, with unchanged inventory/config and
binary bytes. The current review records exact input hashes and process outputs;
its prior audit-only receipt is archived by hash. No Cargo or direct native
acquisition occurs in that independent replay. Consolidated validation remains
167 checks passed after the final review update.


#### PostgreSQL Record-home design and correspondence spike (owner-directed continuation)

The first proposed physical declaration is closed in
`../02-design/spikes/security/record-homes-v0.1.schema.json`. It applies equally
to raw tables and selected typed relation/view populations, with explicit ordered
natural/composite Keys and endpoint maps. Astra review required separating
same-type authoritative/carrier source reuse from distinct-type partitioning,
exact PostgreSQL17.9/UTF8/C declarations, known-literal traversal independent of
live fields, required-output restrictions and aggregate interpreter budgets.
These changes are captured in SPIKE-010; different codecs, contexts and overlapping
native type populations remain explicit additional-interpreter work.

The executable shape experiment and conditional correspondence laws retain
separate evidence in `evidence/security/record-home-shape-execution.json` and
`evidence/security/record-home-correspondence-formal.json`. Ten conditional laws
retain violation UNSAT, weakened-control SAT and positive-population SAT formulas
and fresh replay. They cover qualified identities, ordered Keys, complete domain
metadata, endpoint role/target/selected-Key membership, same-type source reuse,
bidirectional carrier population/multiplicity, field coherence, UTF8 bytes and
known literals in dead branches. Domain normalization, canonical native images
and authenticated source meaning are premises, not established implementations.

Next implement the private Rust binding interpreter against the actual owner
catalog and complete requirements, with pre-copy parsing/normalization budgets
and adversarial tests. Keep native source/column/image/population/authentication
and current-authority obligations explicit; do not enable lowering until physical,
result and complete obligation-parameter custody checks compose. This checkpoint
promotes no backend case: acceptance remains26/132 and the original132-case plan
is unchanged.

Final executed checkpoint: shape389 checks, including10 deliberately
schema-valid but owner/native-unqualified inputs; strict TypeScript passes.
Astra fixes isolate each home/carrier path mutation, test an actual root array,
freeze the recursive installed Ajv closure and Bun before import, and retain
captured schema/core bytes with inventory/hash rechecks. Astra independently
repeats all389 outcomes (549 pins) and replays all30 new SMT formulas in fresh
contexts (43 pins). Copied-producer and foreign-cwd executions both refuse
before receipt publication. Current reviews have no remaining findings and
archive their predecessors by hash. The existing semantic review executes all
six focused Rust tests against772 unchanged pins; the capability review replays
30 fresh formulas against43 pins.

Source-frozen component execution passes63 commands, including an explicit
strict check for the new shape runner. Formal replay passes623 formulas across
34 qualified receipts. The affected PostgreSQL17.9 activation and condition
producers pass197 and213 observations respectively, and Chromium153.0.8010.12
comparison passes36 artifacts. Consolidated evidence validation passes175
checks. No Rust physical binding interpreter or lowering dispatch was added in
this design checkpoint; original backend acceptance remains26/132.

### Private owner Record-home correspondence — 2026-10-10

The private Weft Rust checker now matches the proposed declaration against the
actual selected owner catalog and complete action/scan dependencies. It checks
revision-qualified identities, ordered selected Keys and association endpoints,
source-domain/codec correspondence, source reuse and partition declarations,
query carriers, subject declarations and known literal native images. The exact
spike schema is embedded with provenance; public lowering remains closed.

The initial Astra review found uncharged repeated Key/model-pin/endpoint-role
searches and discriminator tests whose carrier mismatch could mask the intended
refusal. Searches now charge each comparison; discriminator controls use matching
carrier sources and include an admitted in-range counterpart. The parent focused
Rust run passes11 tests, including work/text exhaustion, exact integer bounds,
false-branch literal/context checks and same-domain composite endpoint ordering.
Independent execution and downstream evidence freshness are still pending at
this checkpoint. Earlier receipts must not be treated as current merely because
the focused tests pass.

Declaration correspondence does not establish native source contents, complete
populations, authentication, privilege closure, installed enforcement or release
custody. Computed result interpretation and complete obligation-parameter custody
remain separate requirements. This checkpoint promotes no backend case; the
original132-case plan and26/132 acceptance count remain unchanged.

Final executed checkpoint for this slice: Astra independently passes all11
Record-home tests plus the charged-reader test against776 unchanged pins, with
no remaining findings. See
[evidence/security/owner-record-homes-astra-review.json](evidence/security/owner-record-homes-astra-review.json).
The owner foundation passes84 library tests,61 security-admission tests and the
frontend/envelope/literal/documentation groups. Exact source-schema correspondence
passes. The semantic, manifest, shape, formal, preparation, fact-bridge and
original-value independent reviews were refreshed through actual execution;
prior receipts were archived by hash.

Dependent evidence first refused stale graph sources, then passed after the
original compiler proof and native graph foundation were reexecuted. The frozen
component suite passes63 commands; formal replay passes623 formulas across34
selected receipts. The22-command downstream replay completes, including
PostgreSQL17.9 activation197 and condition213 observations and Chromium
153.0.8010.12 comparison36 artifacts. Stored-key replay remains explicitly a
retained-native replay rather than fresh native execution. Consolidated evidence
validation passes177 checks, including fresh independent owner correspondence
and exact embedded-schema checks. Original backend acceptance remains26/132.

Next compose complete obligation-parameter custody and checked result semantics
with the private correspondence gate, then qualify authenticated native source,
population/domain/privilege/current-authority enforcement before opening public
lowering. Conditional logical laws and declaration checks do not discharge these
remaining physical/runtime acceptance obligations.

### Immutable obligation custody and faithful JSON boundaries — 2026-10-10

The private Rust registry now retains the exact original security declaration
from one callback invocation. Selected obligation custody borrows that immutable
registration, preserves every selected capability origin and requires complete
parameter/owner/failure-code equality for repeated obligation IDs. Each repeated
comparison charges the shared resource ledger. This implements declaration
custody only: unknown parameter content remains uninterpreted and public
security lowering remains closed.

Astra found that ordinary JSON objects with Serde's reserved-looking marker
keys could be silently decoded into different values. Raw-tree construction and
opaque-slot restoration now preserve these objects across ordinary/security
manifests, selected fact/request/context/scoped-row readers and Databricks
relationship mappings. Non-object roots and object-carried enum variants refuse
with diagnostics. Positive counterparts and mutation controls exercise the
actual readers/compiler, rather than treating raw byte retention as sufficient.

The owner foundation passes97 core-library and61 security-admission tests plus
its frontend/envelope/literal/documentation groups. Databricks passes1 library,
7 binding and18 compiler tests. Astra independently repeats the97 and26 tests
and18 fresh conditional custody formulas; no scoped findings remain. See
[evidence/security/owner-obligation-custody-astra-review.json](evidence/security/owner-obligation-custody-astra-review.json).
Those formulas model custody laws and controls, not a proof of the Rust parser
or native enforcement. They trace to US-056-AC7 and US-056-AC10.

The new evidence gate checks current review sources, exact formula hashes and
outcomes, and anchored complete libtest summaries with exact counts. The initial
substring implementation accepted inflated counts; the corrected gate refuses
inflated/reordered counts, ignored tests and altered formula identity/hash/outcome.
The shape receipt now scopes its flag to qualification by that probe, avoiding
an obsolete global claim that no private binding interpreter exists.

Frozen component execution passes64 commands. Formal replay passes641 formulas
across35 selected receipts. Original graph proof12, native graph88 and owner
fact selection63 observations/six captures pass. Independent preparation, fact
and original-value replay receipts have been refreshed through actual execution
and their predecessors archived by hash. The22-command downstream native/browser replay completes, including PostgreSQL
17.9 activation197 and condition213 observations and Chromium153.0.8010.12
comparison36 artifacts. Stored-key replay remains explicitly retained native
evidence, not fresh native execution. Consolidated evidence validation passes181
checks with no failures, including the new independent custody gate.

Original backend acceptance remains26/132. Next implement semantic obligation
parameter profiles and checked result semantics, then qualify authenticated
native source populations, privilege closure and current-authority enforcement
before opening lowering. Preserving an obligation is not discharging it.

### Closed declaration projection — 2026-10-10

The next private owner slice interprets the exact registered obligation
parameters under the draft
[admission-obligation profile](../02-design/spikes/security/admission-obligation-v0.1.md).
It reconstructs the complete selected declaration inventory without a new 0.4
parameter member and retains original IDs/failure codes and capability origins.
Unknown fields/versions, incompatible owner/site declarations, missing selected
prerequisites and cycles refuse before returning an inventory. The source/case
identity strings still require independent actual-plan and native-case coverage
checks; no enforcement claim or public lowering is added.

Astra found that original obligation IDs followed the registry's codepoint bound
while prerequisites followed the new UTF8 byte bound. Projection now checks the
original ID's byte bound too; source-admitted4096-byte and4098-byte controls
isolate that correction. Cross-selected-capability prerequisite closure and a
diamond/shared-prerequisite DAG plus isolated-cycle refusal strengthen coverage.
The initial test helper placement caused a compile failure; helpers are now in
the correct private test module and the actual complete core suite passes103
tests with unchanged captured sources. See
[evidence/security/weft-obligation-projection.json](evidence/security/weft-obligation-projection.json).

The formal experiment passes12 fresh formula checks. The directed four-node
Kahn model includes all sixteen symbolic edges and checks completion against a
rank-defined DAG; it is not an arbitrary-size algorithm theorem or Rust proof.
Its cyclic-population controls are not mutated algorithm controls. Closed
projection and native-admission predicates remain explicit modeled premises.
Astra independently passes all103 core tests and12 fresh-context formulas.
Both scheduling orders agree with an independent transitive-closure cycle
detector on all65536 four-node graphs (543 acyclic), with no disagreements.
[evidence/security/owner-obligation-projection-astra-review.json](evidence/security/owner-obligation-projection-astra-review.json)
retains841 unchanged pins. This finite oracle does not prove arbitrary-size
Rust refinement. The broader source-dependent refresh now completes through actual execution:
66 component commands;653 saved formulas across36 selected receipts; the
22-command PostgreSQL/browser replay; and187 consolidated evidence checks with
no failures. PostgreSQL17.9 activation197 and condition213 observations and
Chromium153.0.8010.12 comparison36 artifacts pass. The independent custody,
Record-home, semantic, manifest, shape/formal, preparation, fact and original-cell
reviews were reexecuted, with predecessors archived by hash. The component
rerun changed the retained parallel libtest output; the dependent projection
review was actually reexecuted against those final receipt bytes. Stored-key
replay remains retained-native evidence rather than fresh native execution. No backend case is
promoted and original acceptance stays26/132.

Next bind projected semanticSources and evidenceCaseIds to compiler-derived
requirements and independently required native cases, then compose result,
physical binding and capability checks before emission. String identities and
a consistent prerequisite DAG do not establish those correspondences. Native
source populations, authentication, privilege closure/current authority and
guarded final release still need executable backend qualification. The original
132-case plan is unchanged; this checkpoint leaves the goal active.

### Compiler-owned obligation source correspondence — 2026-10-10

The private context projection now derives canonical compact JSON tuple IDs
from actual owner requirements and requires exact union equality with declared
semanticSources. It retains source/model pins, selected modules, scan/action/rule
dependencies, ordered key components, stored/context channels, projection/query
fields, operator modes and output positions. Self-join occurrences and repeated
output positions stay separate. No native case meaning or site enforcement is
inferred from this correspondence. See the
[source annex](../02-design/spikes/security/obligation-source-correspondence-v0.1.md).

Actual complete core execution passes108 tests with current captured sources.
New controls omit each issued source independently, add/substitute foreign
sources, preserve self-join and COUNT requirements, check canonical tuple
escaping/UTF8 limits, and refuse actual-context work/text exhaustion. Initial
fixture construction failed compilation because SecurityManifest deliberately
lacks Serialize; the fixture now explicitly constructs original declaration
JSON without broadening the public API. The first operator fixture used a
prohibited protected salary field; an admitted key predicate/order counterpart
now isolates the correspondence behavior. Astra requested an independently authored complete expected inventory and
canonical spelling, context/original-authorized/composite-order controls. These
now pass: exact hand-authored fixture paths, pretty-JSON alias refusal, same-field
stored/context IDs, both query operator modes/action scopes and forward/reversed
same-domain Key positions. Primitive encoder budgets pass at exactly2visits and
6bytes and refuse either one-unit shortage. These are finite tested witnesses,
not arbitrary extraction/native refinement.

Five conditional laws/15 fresh formula checks pass. They use unbounded source
relations and algebraic scoped/channel/key-position identities, not a proof of
JSON encoding, actual inventory extraction, compiler/native refinement or
required native evidence. The first replay exposed an SMT accessor/free-variable
name collision; unique accessor names fix the serialized replay.

Astra ultra independently executed108/108 core tests, replayed15/15 formulas
in fresh solver contexts and checked six valid-domain SAT populations. All843
source pins remained unchanged and no findings remain within the declared
source-lineage scope. The retained receipt is
[evidence/security/owner-obligation-source-correspondence-astra-review.json](evidence/security/owner-obligation-source-correspondence-astra-review.json).
Source correspondence does not establish required evidence-case coverage,
per-capability enforcement-site assignment, native enforcement or Permit for an
original-authorized action.

The new proof and independent review are now mandatory consolidated-validator
checks; the component runner includes the new formal producer. The first current
validator execution reports191 checks with38 failures: older source-dependent
receipts and dependent coverage checks correctly remain stale pending actual
execution. The previous187-check checkpoint is historical. The owner admission
refresh passes with canonicalSchemaMatches=true; projection12, custody18,
Record-home30 and capability30 formulas and389 shape observations have also
been reexecuted successfully. Independent prior-scope reviews and remaining
component/native/browser refreshes are in progress. Original acceptance remains
26/132; no case is promoted and public lowering stays closed. The full original
132-case goal remains active.


#### Source-correspondence consolidated refresh—2026-10-10

Astra identified two validator coverage defects during integration. The new
review gate accepted truncated/unrelated observations and omitted or zero-position
SAT populations; it now requires all nine independently specified observation
IDs/values, six exact population IDs and canonical nonempty names/positions1/2.
The semantic review gate accepted contradictory libtest summaries despite ten
passing name lines; it now requires the anchored10passed/0failed/0ignored/
0measured/98filtered summary from the current108-test library. An intermediate
extra-parenthesis syntax error was corrected before final execution. Python
syntax validation uses a writable temporary cache after the system cache path
refused a write.

All prior owner/shape/formal reviews have been actually reexecuted, including
108 core,26 Databricks,11 Record-home,10 semantic and manifest carrier scopes.
Owner dispatch/version/handoff/original-use/readiness/protocol producers pass;
independent preparation executes12 programs/44 assertions. Graph IR12 queries,
native graph88 checks and PostgreSQL fact selection63 checks/six captures pass.
The expanded component suite passes all67 commands; formal replay passes668
formulas across37 receipts. Rerunning the parent projection producer changes
its retained execution bytes, so the two independent reviews that pin that
receipt are being actually rerun. Native/browser downstream refresh and final
consolidated validation remain pending; these scoped successes do not promote
any of the original132 required backend cases.


The first downstream refresh stopped at truss-original-use-probe.py line291
when an ordinary fixture PostgreSQL call exceeded the existing15-second command
timeout. It produced no passing receipt; the remaining21 downstream commands
were not executed by that attempt. A retry retains the same assertions and
limits. The independent gate review has meanwhile passed23 negative/baseline
controls, and both parent-receipt-dependent108-test reviews were actually rerun
against the final component receipt; no predecessor was repinned.


#### Verified source-correspondence checkpoint—2026-10-10

The unchanged downstream retry completed all22 commands successfully. Original
query-use545 checks, activation197 native checks, condition213 native checks and
36 Chromium artifacts passed; the remaining scoped key/policy/type/transport
and browser probes also passed. The stored-key oracle replay explicitly remains
freshNativeExecution=false and is not described as a fresh native execution.
Astra independently replayed six captured cells and18 refusal controls against
current252 pins/214 build inputs, with no native acquisition of its own. The
initial15-second PostgreSQL timeout remains recorded above.

Final consolidated validation passes191/191 checks with zero failures after
actual producer and independent-review execution. The expanded component suite
passes67 commands and the formal audit replays668 formulas across37 receipts.
Current evidence:
[phase-validation.json](evidence/security/phase-validation.json),
[components.json](evidence/security/components.json),
[formal-replay-audit.json](evidence/security/formal-replay-audit.json),
[source correspondence review](evidence/security/owner-obligation-source-correspondence-astra-review.json),
[evidence gate review](evidence/security/obligation-evidence-gate-astra-review.json).

This checkpoint qualifies the reviewed logical source-correspondence experiment
and retained evidence within each stated subset. It does not establish arbitrary
Rust/compiler/native refinement, required evidence-case or per-site coverage,
source authentication, current authority, public lowering or full installed
backend security. Original backend acceptance remains26/132; no promotions.
Next derive independently required obligation kinds/evidence-case coverage and
compose semantic, physical, capability and authority gates before qualifying
public lowering and admitting additional original backend cases. The full
132-case implementation goal remains active.


### Owner-issued semantic capability allocation—2026-10-10

The preceding191-check checkpoint is historical after this implementation.
Original required backend acceptance remains26/132 and the full goal is active.
Astra's next-gate design review established that actual owner contexts cannot
issue deployment-case sufficiency. Independent profile issuance must preserve
original obligation identity, failure/owner semantics and required prerequisite
edges; a DAG alone does not establish correct sequencing. The draft
[assignment annex](../02-design/spikes/security/obligation-assignment-v0.1.md)
captures these constraints without admitting native cases.

Implemented the substantive first issuer prerequisite in Rust: private
OwnerCoverage retains every complete selected capability candidate for each
actual scan/action scope and the whole application. It borrows the immutable
registration and actual context, and retains exact charged selected IDs.
Astra found that zero-edge selections initially disappeared; the fix preserves
a valid selected Staff-only capability with no obligations in a Resource query.
Actual tests compare equal assignment edges but distinct selected inventories.
No public constructor/transport/lowering is added. Independent required
case/site/kind/profile issuance and relational admission remain unfinished.

Five new actual-context/retention tests pass: complete candidate sets and reverse
selection order; self-join/action/application separation; original-authorized
versus read action scopes; registration callback drift plus zero-edge selection
custody; exact measured traversal and edge limits/refusals. Full core113 tests
pass with source-pinned retained execution in
[weft-semantic-allocation.json](evidence/security/weft-semantic-allocation.json).
All original fixture files are included in this producer's source inventory.

Seven conditional laws/21 formulas pass and replay in fresh solver contexts.
Astra identified an initially weak collapsed-scope negative control; explicit
defective occurrence/action projections now collide while original datatype
scopes stay distinct. Positive populations for complete capabilities, whole
application and native conjuncts now exercise successful admission as modeled,
preventing an always-refusing model from satisfying every control. These laws
assume correctly derived complete/selected predicates; no Rust/native refinement
or deployment evidence is proven.

The new two producers are integrated into the planned69-command component
suite, and consolidated validation now requires fresh allocation execution,
formal proof and independent review. Original projection expected count is113;
semantic review expects15 tests/98filtered with explicit passing names. Those
broader receipts require actual refresh; the last executed prior validator191
reported38 stale/dependent failures after this source change. Astra independent
113-test/21-formula review is pending. No case is promoted.


Astra independently passed113 core tests,21 fresh-context formula replays and
five concrete successful/selection/projection population checks with845 source,
runtime and config pins unchanged. The retained
[allocation review](evidence/security/owner-semantic-allocation-astra-review.json)
reports no remaining implementation findings and no native acquisition or
acceptance promotions. Original source/registration authentication and backend
case/site/kind issuance remain unresolved as stated in the annex.

Integration review found that deleting retained observation/population tables
still passed. The gate now requires all eight observation IDs and independently
expected values plus five exact population IDs/model values. Python structural
equality initially admitted true/false as1/0; canonical closed-JSON comparison
now distinguishes these carriers (and integer/float spellings). Both allocation
and original source-review observation helpers use the strict comparison. Current
validator executes197 checks: all six new allocation checks pass;44 older
source-dependent/dependent execution checks remain stale or require actual
113/15-test refresh. Do not reuse the prior191-check green record as current
qualification. The planned69-command integrated refresh is not yet executed.


The final independent evidence-gate audit passes132 frozen-AST mutation/baseline
controls across six unchanged inputs, including observation/population omissions,
raw summary/test-name/hash/ID contradictions and boolean/numeric aliases. These
are validator controls, not the132 original backend acceptance cases. Receipt:
[owner-semantic-allocation-gate-astra-review.json](evidence/security/owner-semantic-allocation-gate-astra-review.json).
No remaining scoped findings; no Cargo or native acquisition by that audit.
Current consolidated execution still reports197 checks/44 older stale or
unrefreshed failures with all six allocation checks passed. Native/backend
acceptance remains26/132 and the full goal stays active. Next execute the actual
source-dependent refresh, then compose the retained owner allocation and exact
source instances with independently issued backend-profile obligation contracts;
do not infer selected inventories from obligation origins or evidence unions.


### Verified allocation integrated refresh—2026-10-10

Actual source-dependent refresh closes the stale-receipt gap recorded above.
Owner admission passes with canonicalSchemaMatches=true. All existing custody,
projection, source, Record-home, semantic15, manifest, shape and capability
reviews were independently executed against current113-test sources, with
predecessors archived and no repinning. Preparation independently executes12
programs/44 assertions with one explicit Cargo build and no native acquisition.
Graph IR12, native graph88 and PostgreSQL fact63/six captures pass; the independent
fact bridge replays six positives/twelve carrier refusals on current captures.

The expanded component runner actually passes69 commands. Formal replay passes
689 formulas across38 receipts. After the final producer receipts, Astra actually
reexecutes three113-test suites with48 formula replays, the65,536-graph oracle,
and11 concrete population checks. Auxiliary evidence-gate reviews pass23 and132
mutation/baseline controls against the final bytes; these counts are not backend
acceptance cases.

The complete22-command downstream native/browser sequence passes on its first
attempt this refresh. It includes545 original query-use observations,197 native
activation checks,213 native condition checks and36 Chromium artifacts, plus the
remaining scoped policy/key/type/transport and browser probes. Stored-key replay
still declares freshNativeExecution=false. Astra's final cell audit checks the
fresh545 receipt and independently replays six captured-byte positives/eighteen
refusals with252 sourcepins/214 build inputs current, without Cargo or native
reacquisition by that audit.

Consolidated validation now passes197/197 checks, zero failures:
[phase-validation.json](evidence/security/phase-validation.json).
The same record explicitly retains productionAcceptance=open, requiredCases=132
and26 passingFreshCases. No original case is promoted; public lowering stays
closed. These current scoped results do not establish arbitrary compiler/native
refinement, profile/issuer authentication, required native case/site/kind
coverage, current authority, installed complete graph protection or final release.

Next bind canonical owner source instances to retained owner scope assignments,
then independently issue backend-profile obligation contracts and validate
original identity/owner/failure/prerequisite and capability/source/site/case
coverage before composing the remaining native/authority/activation/release
gates. The full original132-case implementation goal remains active.


Astra's next-step design review identified that assignment atoms must also retain
required scope: the earlier five-part proposal can collapse Application/read/
original-authorized demands for one capability/source/case. The new draft
[source-demand binding design](../02-design/spikes/security/source-demand-binding-v0.1.md)
explicitly corrects that future assignment interface before implementation.
It retains source→AND-scopes→alternative-complete-capabilities, exact coverage
custody and zero-edge selection. Original-authorized operators require Application,
primary and original action; query-field sources collect every actual operator
action for their exact occurrence/field. Executable mapping and trusted profile
issuance remain pending. Existing frozen implementation/proof inputs are unchanged;
the197-check source-current checkpoint remains qualified within its stated scope.

Astra's final review also fixes the quantifier: choose a complete capability
per scope covering every required source, rather than choosing fragments per
source. The annex now enumerates all issued prefixes, conservative global-source
custody across all actual scopes, direct-output occurrence binding, accumulated
operator demands and independent profile requirements. Edges are derived beside
source issuance from retained context, never by parsing backend source strings.
The six-coordinate relation explicitly supersedes the earlier private draft;
no existing transport is silently reinterpreted. These design changes leave
the frozen executable/proof inputs unchanged. Implementation and its independent
expected-map, omission, swapped-scope, disjoint-alternative and budget controls
are the next work item; acceptance remains26/132.

### Private source-demand issuer—2026-10-10

Implemented canonical source-to-scope binding beside the owner source traversal.
OwnerSourceDemands borrows the exact OwnerCoverage and its scope keys/candidate
sets; no backend source parsing or independent constructor is exposed. Required
primary/original/Application scopes accumulate for actual operator uses, output
scopes follow the actual expression occurrence, action dependencies retain their
owning scan/action and global source custody retains all actual scopes. This
issuer does not choose capabilities or interpret backend obligation assignments.

The complete118-test core suite actually passes. Five new controls independently
specify the full baseline source/scope map, accumulate two original actions and
remove each required scope, preserve self-join output/false-branch ownership,
retain differing complete candidate sets and selected zero-edge capabilities,
and exercise exact work/text bounds plus a real256-by25665,536-edge retention
population. The edge population is a private primitive, not a full native or
compiler-context qualification. A hand-authored legacy source ledger confirms
that source-only derivation skips the newly added demand-only comparisons.

Astra review found and corrected that source-only availability regression and
requested the distinct-candidate, zero-edge and original-scope omission controls.
Its evidence review then found an incomplete selected input inventory and an
omission/time-of-check gap in the new gate. The corrected producer enumerates
all selected core sources, owner contract/schema trees, external test fixtures,
upstream/vendor/toolchain inputs and four config-presence entries, with pre/post
file-set and symlink-target checks. The final actual118-test receipt retains736
selected source/build pins. This is selected-input custody, not a hermetic Cargo
dependency-cache or aggregate resource theorem. Development failures and earlier
receipts are archived; no receipt is silently repinned.

The new formal producer actually proves five conditional finite laws with15
retained/replayed SMT formulas. The scoped gate independently replays all15 and
passes five checks over the exact inventories, raw test summary/names, captured
receipt bytes and qualification boundaries. Its original-use omission model
specifically drops original authorization; Rust controls remove every actual
required scope. These results do not prove arbitrary-size matching, Rust/native
refinement, authenticated profile/evidence or native execution. Receipts:
[Rust execution](evidence/security/weft-source-demands.json),
[formal laws](evidence/security/source-demands-formal.json),
[scoped validation](evidence/security/source-demands-validation.json).

The prior197/197 integrated checkpoint is now historical: an actual freshness
run after the Rust/contract changes reports197 checks with35 stale/unrefreshed
failures. RequiredCases remains132, passingFreshCases26 and production acceptance
open. The new three commands are added to the component sequence for the next
actual refresh; that expanded sequence has not yet been executed. Update the
integrated gate and predecessor118-test expectations, actually refresh their
producers/reviews/native/browser dependencies, then implement the scoped original
obligation matcher and independent backend-profile requirement issuer. No backend
case is promoted and the full goal stays active.

Final local custody strengthening loads the inventory helper from its exact
captured bytes after the invocation guard, pins that captured digest and refuses
later changes; the gate likewise validates captured receipt/helper snapshots.
The actual118-test producer and five-check/fifteen-replay gate pass again after
this change. The component sequence now contains72 planned commands. A final
integrated freshness execution after that sequence edit reports197 checks with36
stale/unrefreshed failures (the preceding35-failure observation remains historical);
required132 and passingFresh26 remain unchanged. Full expanded integration and
its authenticated/native qualification remain pending.

Astra's final independent read-only audit finds no remaining scoped defect. It
actually reruns nine in-memory controls against the gate's freshness-check AST:
baseline passes; shrinking to six pins/deleting configs, empty configs, omitted
production schema, omitted external fixture, omitted backend source, integer
config-presence aliases, extra config keys and invented symlink targets refuse.
Reviewed bytes remain unchanged and all736 Rust pins/four proof pins/four gate
input hashes match. This audit does not independently rerun Rust or formulas.
Final Rust receipt SHA256 is
8038697147ba89d4c542096b44b0d88612cc4fb8f42f894bb98ae9374352d611;
scoped validation SHA256 is
bad868ad17f7076c3bbe4ab1779490684c33678b6eace5fdc46b2d6fbbe3ef02.

### Source-demand integration refresh in progress—2026-10-10

The main validator now actually invokes the captured-byte scoped source-demand
gate and adds its five closed check IDs, retaining the independent native/no-
promotion boundary. The predecessor projection and allocation runners require
the actual118-test core and use the reviewed complete selected-input inventory
plus their own runner source, with pre/post file-set/config/symlink checks. Both
actual suites pass; owner admission passes four checks with canonical schema
correspondence. Five predecessor formal producers and the allocation producer
actually rerun126 conditional formulas across their six receipts.

The semantic review gate now requires the exact anchored19-name inventory and
99 filtered tests. Astra found the intermediate count-only/old15-name gap; all
four source-demand names are now independently mandatory. Component validation
also requires the exact current72-command inventory rather than any passing
subset. The expanded component sequence has not yet run at this checkpoint.

Astra actually executes the independent initial review batch: custody118 core
plus26 Databricks and18 formula replays; Record homes11 plus one shared reader;
semantic19/99; manifest six carrier/four opaque controls; shape389 with10 schema-
valid/unqualified cases; correspondence30 plus two invocation refusals; and
capability30. Its16 in-memory integration/semantic controls pass, including
omitted/substituted new test names and nonzero scoped child gate. No remaining
scoped integration finding is reported. These independent reviews retain actual
execution and predecessor archives; they do not promote native/backend cases.

The six owner-dispatch refresh commands actually pass: version4, handoff10 with
three compiler artifacts, original-use10/six artifacts, typed refusal3, protocol
shape54 and evidence controls607. The main integrated execution currently has202
checks, all five source-demand checks passing, with30 stale/unrefreshed failures
at its captured checkpoint. Subsequent review receipts are now refreshed; final
integration is still pending. Required132, passingFresh26 and production open
remain binding. Preparation's independent current-source execution is live in
agent-owned session48932; parent defers Cargo until that execution is terminal.

### Verified source-demand integrated checkpoint—2026-10-10

The preparation session recorded above is terminal:12 programs/44 assertions,
one authorized offline Cargo build,13 owner executions/14 host bridges and no
native reacquisition by that independent audit. Parent subsequently actually
refreshes original graph IR12, native graph-stage88 and PostgreSQL fact63/six
captures. Astra's fact bridge actually replays six positives/twelve carrier
refusals against those current captures;242 source pins/214 build inputs match.

The expanded component sequence actually passes all72 commands. Formal replay
actually checks704 saved formulas across39 selected receipts. After these final
producer bytes stabilize, Astra independently executes three complete118-test
core runs and replays projection12/source15/allocation21 formulas. Projection
also exhausts65,536 four-node graphs/543 DAGs; source and allocation retain six
and five concrete population controls respectively. Each review retains849
source/runtime pins and archived predecessor bytes. No receipt is repinned.

The source/semantic/main gate review actually passes199 in-memory controls,
including all72 component omissions/all71 adjacent reorderings, duplicate and
foreign commands, numeric aliases for exit/timeout values, exact19 semantic
names and five-check scoped gate composition. Allocation gate review passes132
controls; a separate read-only subaudit rejects722 component-gate mutants.
These are evidence-validator controls, not the original132 backend cases.

The full22-command native/browser sequence actually passes on its first attempt
this refresh. It includes545 original query-use observations,197 activation
checks,213 native condition checks/36 Chromium artifacts and the remaining
scoped association/relationship/type/key/transport/browser probes. Stored-key
replay explicitly retains freshNativeExecution=false. Astra's final cell audit
actually replays six captured-byte positives/eighteen refusals on fresh545,
with252 source pins/214 selected build inputs matching and no Cargo/native
reacquisition by that review.

Consolidated validation now passes202/202 with zero failures:
[phase-validation.json](evidence/security/phase-validation.json).
The five new source-demand checks are included and passing. The same authoritative
record retains productionAcceptance=open, requiredCases=132 and26
passingFreshCases. The prior36/30-failure observations are historical checkpoints,
not current failures. All processes above are terminal and Cargo is released.

Next implement the scoped original-obligation matcher with six-coordinate
identity and complete-capability-per-scope choice, then independently issue
backend-profile kinds/sites/cases/failure/prerequisite requirements before native
evidence, authority, activation and release composition. Source-demand issuance
and exact evidence correspondence do not themselves authenticate an issuer,
establish native case sufficiency, prove general compiler/native refinement or
qualify installed complete graph protection. Public lowering remains closed;
no original backend case is promoted and the full implementation goal stays active.

### Exact selection prerequisite and scoped-subject correction—2026-10-10

Astra ultra reviewed the next matcher boundary and identified that unscoped
admission-obligation0.1 cannot represent paired source/scope demands or mandatory
selected-wide deployment obligations. The new
[private0.2 design](../02-design/spikes/security/scoped-obligation-matching-v0.2.md)
keeps0.1 projection unchanged, separates Semantic and SelectedCapability subjects,
and requires exact independent full contracts/atoms plus ∀scope ∃capability
∀required-source complete alternatives. Unchosen selected obligations stay
mandatory. Matcher/profile issuer and their formal receipts remain unfinished.

Weft original custody now retains the exact selected set borrowed from the
immutable manifest, including capabilities with no obligations. An actual new
regression verifies unchanged obligation inventories cannot substitute for exact
selection, caller selection storage can be discarded, backend callback drift
cannot change retained IDs, and duplicate selections refuse. Actual full core
passes119/119, zero failures; [raw evidence](evidence/security/custody-exact-selection.json)
retains command/output and an explicitly limited Rust source pin; the later
design digest is identified separately. Astra ultra read-only review found no
custody defect; its nonempty/homogeneous subject-list and complete-profile
accounting clarifications are incorporated. This scoped run is
not complete build custody, native acquisition or integrated refresh.

The preceding202-check integrated checkpoint is historical after these source
edits. Do not repin it or call it current; producers, formal gates and dependent
evidence need actual refreshed execution after matcher implementation. Original
acceptance remains26/132, production open, public lowering closed, goal active.

### Private paired-subject decoder—2026-10-10

Weft original custody now exposes a separate private0.2 declaration decoder.
It preserves borrowed originals/all origins, closed typed paired subjects and
owner-compatible sites, validates the entire original prerequisite DAG, and
charges origin×subject×case expansion before returning any complete result.
It accepts at most4096 expanded atoms and phase-local1m visits/16m text bytes.
No public transport conversion, native evidence or independent profile matching
is supplied by this step. Existing0.1 projection is unchanged.

Three new actual-registry controls cover paired semantic/selected-wide positives,
original pointer/provenance retention, exact/minus-one measured work/text budgets,
successful legacy0.1 projection with scoped refusal, eight malformed declaration
mutants, missing/self-cyclic prerequisites, exact4096 expansion,4097 boundary refusal and8192 refusal
from repeated origins. Astra read-only review identified a UTF8 byte-limit gap
because registration counts characters. The decoder now validates every selected
capability, including empty-obligation capabilities; actual2048é/4096-byte
positives and2049é/4098-byte refusals pass for both variants. Exact independently
authored subject assertions and measured budget controls also pass. Full Rust core actually passes122/122 with zero failures:
[scoped raw evidence](evidence/security/scoped-obligation-decoder.json).
This selected-source receipt is deliberately narrower than complete build
custody or integrated freshness. Prior119 and202 checkpoints are historical.
The next work is independently issued requirements plus exact full contract/atom
matching and complete capability choice per scope, followed by new formal
receipts and actual dependent evidence refresh. Original acceptance remains
26/132; production open, public lowering closed, implementation goal active.

### Scoped-obligation relation proof experiment—2026-10-10

The new `tools/security/prove-scoped-obligations.py` actually executes12 laws/36
SMT checks with fresh-context replay, using Z3 in the existing proof environment.
Ten finite laws check paired source/scope identity against equal marginals,
mandatory zero-edge selected-wide duty (including isolated missing profile and
deployment predicates), mandatory unchosen origins, full failure/prerequisite
contracts, subject variant identity, complete-capability choice, and independent
release gates. Each has violationUNSAT, weakened negativeSAT and populated
positiveSAT. These are conditional guard/formula checks, not issuer/extraction
or Rust refinement proofs.

Two further laws quantify over arbitrary typed atoms with original obligation,
origin, typed subject, site and case coordinates. Under independently supplied
pointwise required/declared equality no required atom can be omitted and no
surplus atom added. Their negative controls use closed populated relations
with distinct origins/cases swapped, preserving every individual coordinate
projection while violating exact correspondence. Typed Semantic subjects retain
source/scope pairs; SelectedCapability retains its separate requirement ID.
This does not prove unbounded whole-capability assignment, independent requirement
completeness/authentication or native physical semantics.

[Formal receipt](evidence/security/scoped-obligations-formal.json) retains formulas,
SAT witnesses, solver version, source digests and explicit scope exclusions.
Independent Astra review is terminal and clean within the conditional scope:
[review receipt](evidence/security/scoped-obligations-astra-review.json) retains
36 independent fresh-context replays (12UNSAT/24SAT) and42 unchanged
source/runtime pins. Parent also separately replays all36 retained formulas
and checks the three producer source pins. Earlier8/24 and10/30 executions
are archived by digest; an interrupted obsolete review publishes no result. Matcher/profile issuer and actual integrated refresh
remain open. Original132-case scope remains binding;26 passing backend cases
are unchanged, production open, public lowering closed, goal active.

### Conditional actual-owner scoped matcher—2026-10-10

Implemented private Weft `security_obligation_matching.rs` against an explicitly
independently authored trusted RequiredPremise0.1. It borrows actual owner
demands, original custody and expected profile, checks exact registration/target/
complete selection, preserves every original contract/origin and compares full
typed atoms. Semantic claims require actual demanded edges and eligible origins;
selected-wide claims require that origin's explicit profile requirement.
Complete alternatives are chosen per scope over every demanded source.
No profile authentication, native enforcement or public admission is issued.

Actual full Rust core passes124/124 with zero failures:
[raw scoped evidence](evidence/security/scoped-obligation-matching.json).
First compilation of the integration fixture failed because the private registry
handle was not Copy; copying its immutable borrowed references now keeps custody
without exposing a constructor. Subsequent actual runs pass. The tests include
every-atom omission, contract/selection/zero-edge drift, extra atoms,
exact/minus-one measured matcher budgets and same-marginal subject swaps.
Astra's requested semantic populations have mutually agreeing declarations and
requirements: split whole-scope sources refuse, distinct complete read/Application
origins pass, and foreign source/scope claims refuse. These reach semantic
matching rather than merely testing mismatched expected sets.

Required premise issuance is still explicitly trusted and private. Independent
production profile derivation/authentication, obligation-kind/case sufficiency,
native evidence and authority/activation/release composition remain unfinished.
Selected source pins are not full build custody; the prior integrated202 and
122 checkpoints are historical. New source edits require actual formal/dependent
evidence refresh, never repinning. Original acceptance remains26/132,
production open, public lowering closed, goal active.

Astra final read-only matcher review is clean within the explicit trusted-premise
scope. Parent's124 Rust passes remain parent-attributed; Astra runs no Rust or
native acquisition. Its refreshed independent formal review actually replays
all36 saved SMT formulas in fresh contexts (12UNSAT/24SAT), with42 captured
source/runtime pins unchanged; predecessor review is archived by digest.
Measured exact/minus-one matcher budgets establish exhaustion controls, not an
independently derived complete ledger or aggregate CPU/memory bound. Neither
review establishes issuer completeness or Rust/formula/native refinement.

Next implement independently issued backend requirements with exact profile/
context/registration custody and original132-case mapping; add shared original-ID
origin controls and profile authentication/evidence admission, then execute actual
formal/native/browser/integrated refresh. No stored receipt is repinned.

### Shared-origin controls and issuer completeness boundary—2026-10-10

Actual full Rust core again passes124/124 after extending the existing
actual-owner matcher fixture. Shared IDs/identical original parameters retain
both capability origins with unchanged contract count and both source-complete
alternatives. Removing each second-origin atom refuses even with the first
alternative complete. An actual zero-edge capability with its obligations removed
retains selection but refuses its independently required deployment contract.
[Raw scoped evidence](evidence/security/shared-origin-matching.json) records
the parent run and limited source pin; Astra's read-only review finds these
controls nonvacuous. No independent Rust/native acquisition by that review.

Astra's subsequent issuer review identifies that source-complete alternatives
are insufficient for several independent kinds per source. Codec at A and privacy
at B can match all selected originals globally while neither capability alone
completes all kinds. Current RequiredPremise0.1 is explicitly source-level;
production issuance must use a separate versioned kind/occurrence demand inventory
and match a whole capability's complete template expansion for every instance.
The [issuer design](../02-design/spikes/security/backend-requirement-issuer-v0.2.md)
retains original132 cases and records missing exact kind/site/failure/prerequisite
mappings as deliberate unknowns that refuse issuance. Case names/layers and planned
IDs never infer authority or evidence. Typed demands must derive beside actual
source construction, not by parsing encoded source IDs.

Actual `prove-kind-completeness.py` passes3 conditional finite laws/9 formulas
with fresh-context replay: same-source kind fragmentation counterexample,
different instance-complete alternatives across scopes, and independent native
evidence. Its negative control models the current source-only limitation rather
than claiming the new matcher implemented. Existing scoped relation proof is
actually rerun12/36 after the annex change; predecessor receipts are archived.
Independent formal/design review is pending. Typed issuer, kind matcher, complete
production profile mapping/authentication and actual integrated/native refresh
remain open. Original acceptance stays26/132; production open, lowering closed,
goal active. Prior source-pinned124/202 checkpoints are historical after edits.

Astra proof review caught a producer output-path defect: the initial kind proof
wrote its three-law payload to source-demands-formal.json. The misplaced bytes
and prior source-demand bytes are preserved with explicit role/provenance in
[kind-proof-receipt-routing-correction.json](evidence/security/kind-proof-receipt-routing-correction.json).
The kind path is corrected and both producers are actually rerun into distinct
receipts (kind3/9, source-demand5/15); no digest repinning is used.
Its annex review also identified missing B10 in the proposed family checklist.
An explicit private-authorization-fact confidentiality/ordinary-observation
isolation family now retains B10 separately from generic custody. All original
30 backend duties remain mandatory. Kind proof must rerun after that annex edit.

Final independent Astra review is terminal and clean after both corrections.
It actually replays kind9 (3UNSAT/6SAT), scoped36 (12UNSAT/24SAT) and restored
source-demand15 formulas in fresh contexts, verifies current pins and preserved
routing/archive hashes, and confirms the explicit B10 family. The parent also
separately validates all three current receipt source digests and replays all60
formulas with zero failures.
[Kind review](evidence/security/kind-completeness-astra-review.json) and
[scoped review](evidence/security/scoped-obligations-astra-review.json) retain
conditional scope and exclude native/Rust refinement and backend qualification.
No original acceptance case is promoted. The actual next implementation is
typed kind/occurrence demand custody and full per-capability instance expansion
matching, then independently registered profile mappings and authentication.
Current source-complete correspondence must not be relabeled kind-complete.


### Private kind/occurrence matching checkpoint

Implemented a separate versioned private InstancePremise and match_instances
boundary while preserving source-level RequiredPremise0.1. Exact semantic atom
partitioning, shared-original kind/occurrence consistency and complete
per-scope capability alternatives are required. The independently complete
trusted premise remains an explicit assumption; production issuer and profile
authentication are not supplied.

Actual full core execution passes125 tests with zero failures. Astra ultra
read-only review requested three isolated controls, all implemented and reviewed
clean: same-kind distinct occurrences, shared-origin identity mutation retaining
a complete alternative, and one-case omission from a populated expansion.
[Execution receipt](evidence/security/kind-instance-matching.json) records selected
post-run source pins, not complete frozen build custody. The previous integrated
202-check checkpoint is historical after these source changes.

Actually reran kind3/9, source-demand5/15 and scoped12/36 formal checks after final
pinned edits. These are conditional logical laws, not Rust/native refinement.
Independent replay review is separately retained when complete. Original backend
acceptance remains26/132, production open, lowering closed and goal active.
Next: issue typed kind/occurrence events from actual owner semantics, register
independent complete backend templates and assertion mappings, authenticate the
profile, and execute refreshed backend acceptance/integration evidence.

Independent Astra replay is terminal and clean: all60 current formulas pass in
fresh contexts (20UNSAT/40SAT); exact source digest inventories match and51
captured source/runtime pins remain unchanged.
[Combined review](evidence/security/kind-instance-astra-review.json) preserves
parent attribution of Rust execution and excludes native qualification. Earlier
individual reviews remain historical. No original acceptance promotion.


### Typed owner event lineage implementation

Retained explicit OwnerEventKind categories at all18 owner traversal sites,
with exact source/demand/event projection and borrowed coverage custody. Stored
Field and Context channels are distinct. Event-copy work/text charging and
category-alias refusal are verified; legacy source-only ledger remains checked.
Actual full core126 tests pass with zero failures. Astra identified the missing
actual Context branch control; it is now exercised through registered coverage.
[Execution receipt](evidence/security/owner-events.json) qualifies selected
post-run pins and excludes complete build custody, refinement and native claims.

This is event lineage, not full obligation-kind issuance: next extract typed
field/domain/disclosure/operator details and define complete independent template
applicability/mappings. Original backend acceptance26/132 remains unchanged;
production open, lowering closed, goal active. Earlier source-pinned reviews and
integrated202-check evidence are historical when their pins changed.

Astra's final event-lineage review is terminal and clean. It independently
replays24 current source/kind formulas in fresh contexts (8UNSAT/16SAT), checks49
selected source/runtime pins unchanged, and records parent attribution of126
Rust tests. [Review receipt](evidence/security/owner-events-astra-review.json)
excludes native qualification, general issuer/refinement claims and original
acceptance promotion. Previous combined reviews remain historical.


### Actual rule semantic custody implementation

Rule events retain exact borrowed immutable owner Rule objects, preserving all
conditions/domain literals/dispositions and distinct scan/action occurrences.
Identity-key encoding and retention are charged; conflicts refuse,4096map ceiling.
Actual full core126 tests pass with independently authored rule IDs, original
pointer equality, and populated false-branch/self-join scope controls.
[Execution receipt](evidence/security/rule-event-custody.json) records selected
post-run pins and excludes complete build custody/general refinement claims.

This advances typed issuance inputs but is not a completed issuer: enumerate
condition/disclosure paths, retain remaining identity/operator/output details,
author independent backend templates and authenticate profiles before native
qualification. Original26/132 acceptance remains unchanged; production open,
lowering closed, goal active. Earlier event/source reviews are historical where
source pins changed. Actual producer/formal reruns and independent review follow.

Final refinement implements Astra's isolated pointer/ledger and dual-action
recommendations. Actual full core128 tests pass, zero failures. Independent
6visit/74byte retention limits and both minus-one controls pass; eight actual
rule occurrences across two scans/two actions/two rules preserve original
pointers and exact scope. Previous126 receipt/raw are archived by content hash.
Complete model domains remain in retained context, not all embedded in Rule.
No original acceptance promotion or native qualification.

Final independent Astra review is terminal and clean: source15+kind9 formulas
replay in fresh contexts (8UNSAT/16SAT),52 selected source/runtime pins remain
unchanged, and exact pointer/budget/eight-occurrence controls are inspected.
[Review receipt](evidence/security/rule-event-astra-review.json) verifies the
parent-attributed128-test raw log and post-run pins; no independent Cargo/native
execution or build/refinement qualification is claimed. Original26/132 remains.


### Typed rule occurrence enumeration checkpoint

Implemented private borrowed RuleOccurrences keyed by source and typed structural
path. All conditions/operands/ordered disclosures retain actual immutable owner
payloads, including false/empty nodes and repeated positions. Actual full core130
passes, zero failures, with independent20/80/44-entry fixtures, pointer/scope
custody and4096/4097,64/65 and exact/minus-one budget controls.
[Execution receipt](evidence/security/rule-occurrences.json) qualifies selected
post-run pins, not complete frozen build custody or Rust/native refinement.

Formal address laws retain ordered index, namespace and source-coordinate identity
in an algebraic model, not a traversal/refinement proof. Exact backend template
applicability, other owner details, authenticated profiles and native acceptance
still remain. Original acceptance26/132, production open, lowering closed and
goal active. Previous source-pinned reviews are historical where edited.

Final occurrence refinement passes131 core tests, zero failures. Astra's
requested exact operand/nested Exists payload-pointer controls and independent
10visit/37byte(64bit) path-copy ledger pass, including both minus-one refusals.
Depth64 is explicitly64child edges/65expression levels; positions zero-based.
Previous130 receipt/raw archived by hash. Actual formal producers rerun after
final sources/docs; index/namespace/source erasure controls remain conditional
algebraic laws, not Rust refinement or traversal completeness.

Final independent Astra review is terminal and clean:33 formulas replay in fresh
contexts (11UNSAT/22SAT),56 selected source/runtime pins remain unchanged. Exact
payload pointers, Exists slot/association details, independent10/37 ledger and
boundaries are reviewed. [Review receipt](evidence/security/rule-occurrences-astra-review.json)
verifies parent-attributed131 tests and four post-run pins; it excludes full
build custody, Rust refinement, complete issuer and native qualification.
Original acceptance26/132 remains unchanged and goal remains active.


### Native private planner observation checkpoint

Extended the actual PostgreSQL17.9 disposable private-fact probe from68 to94
observations. Ordinary caller debug GUCs expose internal private relation plans
through client stderr despite the deny-first catalog/routine ACL candidate.
Unrelated1000-row private population changes alter estimates while authored
ordinary results remain fixed. Routine-local all-three off settings preserve
exact traces and rows across another1000-row private change; individual weakening
restores disclosure. Native body/owner/ACL/proconfig and caller SET restoration
controls pass. Initial table-name detection was corrected to exact native OIDs
before final positive/negative evidence.

Astra's source-custody finding is implemented: freeze helper, plan, oracle and
complete declared closure before exec; execute captured helper inputs/SQL; retain
transformed-prefix digest and final byte guards. Actual final session3445 exits0
and owned container cleanup completes. The selected native evidence is
[pg-private-diagnostics.json](evidence/security/pg-private-diagnostics.json).
The [annex](../02-design/spikes/security/pg-planner-observation-v0.1.md) records
physical requirements and open prepared/cache/closure/drift work. Original B10
remains counterexample-found;26/132 acceptance, production open, lowering closed
and goal active. Earlier integrated source-pinned checkpoints remain historical.

Diagnostic comparison covers exact decoded stderr text and retained UTF-8
transcripts from text-mode subprocess capture; it is not raw native-wire custody.
Astra verifies the five-source declared helper closure, reconstructed executed
prefix digest and21 retained diagnostic log hashes; final review follows.

Final Astra native-design/custody review is terminal and clean. Its36 independent
read-only checks verify five frozen source inputs and reconstructed helper prefix,
all21 transcript hashes/content,26 planner-stage records within94 observations,
authored rows, caller-setting restoration, nine isolated weakenings and native
wrapper inventory.34 selected review/source/docs/runtime/log pins stay unchanged.
[Review receipt](evidence/security/pg-private-planner-astra-review.json) retains
parent attribution of native execution and excludes B10 promotion/full closure.
Prepared/cached guard mutation and admission drift integration remain next work.
Original26/132 acceptance and active goal remain unchanged.


### Typed field semantics on main — 2026-10-10

Weft main effe0276abb486c847d2901581a2255199931c18 now retains actual borrowed
Field/Context payloads beside owner source events, advancing the independent
requirement issuer design under current Weft CONTRACT-006. Stored events retain
the exact qualified field/inventory owner references, catalog carrier and raw
ontology classification (protection/query-use); context has a separate channel.
All original domain/facet/allowed-value/opaque metadata remains available without
normalization or cloning. Charged lookup/ID retention, exact event-key projection,
foreign equal-pointer substitution refusals and populated4096/4097 boundaries
remain private. Source-only derivation retains its prior ledger.

The [source-pinned execution checkpoint](https://github.com/DocumentDrivenDX/weft/blob/effe0276abb486c847d2901581a2255199931c18/docs/helix/04-build/evidence/security-field-events/checkpoint.json)
records557 passing Rust workspace tests/44groups with no failures/ignored/filtered;
all822 declared repository inputs were frozen before execution and verified
unchanged, including after concurrent main integration. External Cargo registry/
build runtime dependencies are outside that inventory. Separate document/schema
validation passes51 artifacts/31schemas/30planned compiler criteria/636fixtures;
those ordinary compiler criteria do not replace the shared security acceptance plan.
Initial/pre-refinement runs and the corrected directory-link/parser failures are
preserved rather than relabeled.

Astra ultra's independent read-only review is clean after isolated channel-only
and false-branch self-join controls. It replays3 conditional algebraic address
laws/9formulas in fresh Z3 contexts (3UNSAT/6SAT), verifying source prefreeze and
pre-solve SMT capture. These establish constructor separation under the stated
address assumptions; they are not Rust pointer/string/traversal refinement,
backend enforcement or native acceptance. The [review](https://github.com/DocumentDrivenDX/weft/blob/effe0276abb486c847d2901581a2255199931c18/docs/helix/04-build/evidence/security-field-events/astra-review.json)
retains those limits.

Next retain typed Key/member ordering and query projection/operator/output
semantics, then author complete independent kind/template/site/failure/prerequisite
and original case/assertion mappings with authenticated exact backend profiles.
Complete issuance, admission drift/B10 closure, physical lowering and integrated
native qualification remain unfinished. All132 original cases remain binding;
no case is promoted by this field-custody checkpoint and the goal remains active.


### Selected Key/member semantics on main — 2026-10-10

Weft main bf64c8c56520d1117ace6d12b517c6b5a15559de retains actual selected Key
and ordered-member payloads beside owner source events under CONTRACT-006. Exact
qualified target/key-ID/member-slice references, original native Key definition,
zero-based ordinal, native member declaration and catalog field carrier remain
borrowed. A selected nonprimary Key stays selected when another Key is primary;
existing canonical source member positions remain one-based without decoding.
Resolution/retention is phase-charged and bounded, preserves original member order,
and refuses foreign equal pointers, reordered/shortened/duplicate/missing selected
members. Key/KeyField source-key projection equals the complete payload map; the
legacy source-only ledger stays unchanged.

The [execution checkpoint](https://github.com/DocumentDrivenDX/weft/blob/bf64c8c56520d1117ace6d12b517c6b5a15559de/docs/helix/04-build/evidence/security-key-events/checkpoint.json)
records559 Rust workspace tests passing across44groups, zero failed/ignored/filtered.
All823 declared repository inputs were prefrozen and checked unchanged at terminal
exit0 and after concurrent-main integration; external Cargo registry/build-runtime
dependencies are excluded. Separate documentation/schema/corpus checks pass51
artifacts/31schemas/30planned compiler criteria/636fixtures, without replacing the
shared security acceptance plan. Initial visibility/initializer compilation errors
and a correctly refused fixture missing mandatory Key.name are preserved with
actual corrected runs; admission checks and assertions were not weakened.

Astra ultra's read-only implementation review is clean. It independently replays
three conditional Key-address laws/nine formulas in fresh Z3 contexts (3UNSAT/6SAT)
and verifies all four current source pins, prefreeze/recheck and pre-solve SMT
capture. These establish constructor/projection separation under stated address
assumptions, not Rust pointer/string/usize/Vec/traversal refinement, selected-Key
implementation proof or native enforcement. Simplified erasure controls are not
Rust mutants. The [review receipt](https://github.com/DocumentDrivenDX/weft/blob/bf64c8c56520d1117ace6d12b517c6b5a15559de/docs/helix/04-build/evidence/security-key-events/astra-review.json)
retains these limits and the historical producer receipt remains source-qualified.

Next retain actual query projection/operator/output payloads and author complete
independent backend kind/template/site/failure/prerequisite and original assertion
mappings with authenticated exact profiles. Complete issuance, B10/admission-drift
closure, physical lowering and integrated native qualification remain unfinished.
All132 original cases remain binding; no acceptance case is promoted by this
Key-custody checkpoint. The goal remains active.

### Query payload custody merged directly to main — 2026-10-10

Weft main45910686acb1c607bcd9769e163f8189a0afc595 contains reviewed private
Projection/QueryField/Operator/Output payload custody under CONTRACT-006 and the
shared independent requirement issuer design. Actual scan inventories, qualified
field references, native catalog carriers, ontology classifications, admitted
requirements and original resolved application Plan remain borrowed. Projection
objects retain exact identity; operators preserve the profile-owned admitted use
and OriginalAuthorized action; outputs preserve original ordered positions, aliases
and expressions, including repeated fields. Resolved uses/projections are families,
not all SQL AST occurrences. Identity conflicts refuse, work/text is charged and
population is bounded at4096. Complete query payload keys equal their source-event
projection while legacy source-only traversal retains its ledger.

The [execution checkpoint](https://github.com/DocumentDrivenDX/weft/blob/45910686acb1c607bcd9769e163f8189a0afc595/docs/helix/04-build/evidence/security-query-events/checkpoint.json)
records559 Rust workspace tests passing across44groups with zero failed, ignored or
filtered, plus successful documentation/schema/corpus checks. Its824 declared test
inputs were captured during execution and checked unchanged at terminal and after
concurrent main integration; this is explicitly not a pre-execution freeze and
excludes external registry/runtime dependencies. Initial strengthened-test failure
(profile-owned use versus raw-query pointer expectation) and premature documentation
check failure are preserved alongside corrected runs. Astra ultra's final read-only
implementation review has no remaining findings after pointer expectation correction
and isolated scan/operator carrier/classification substitution controls.

Direct main push succeeded with concurrent main updates preserved, without a PR or
force push. This checkpoint adds tested private semantic custody, no new formal Rust
refinement proof or native enforcement claim; older source-specific formal receipts
remain unchanged. All132 original backend cases remain binding and none is promoted.
Next complete remaining association custody and independent backend applicability,
templates, sites, failures, prerequisites and original assertion mappings, then
authenticated issuance, physical lowering and B10/admission-drift closure. The
implementation goal remains active.

### Original association semantics on main — 2026-10-10

Weft main2650937c1cc1827689d903d7d97b3dbc08c6c637 retains original association
semantics under CONTRACT-006 and the shared independent requirement issuer design.
Each private record-association dependency carries exact original scan/action
inventories, qualified association reference, native catalog record and complete
ontology declaration. Endpoint roles, qualified targets, selected keys, ordered
component fields and classification metadata remain borrowed rather than decoded
from source IDs. This is per-scan/action dependency custody; Rule occurrence
inventories separately retain each Exists expression. Graph association activation
remains unfinished. Charged full-qualified declaration lookup refuses absent or
duplicate matches; bounded identity retention refuses foreign equal objects, and
Association source-key projection equals the complete payload map. The legacy
source-only traversal ledger remains unchanged.

The [execution checkpoint](https://github.com/DocumentDrivenDX/weft/blob/2650937c1cc1827689d903d7d97b3dbc08c6c637/docs/helix/04-build/evidence/security-association-events/checkpoint.json)
records560 Rust workspace tests passing across44groups, zero failed/ignored/filtered,
with all825 declared repository inputs frozen before execution and checked
unchanged at terminal. External Cargo registry/runtime dependencies are excluded.
Documentation/schema/corpus checks also pass51 artifacts/31schemas/30planned
compiler criteria/636fixtures. Actual controls cover independently authored
source-to-qualified-reference expectations, all five pointer substitutions,
self-join ownership, forward/reverse compound endpoints, an actual empty inventory
retaining its action duty, exact/minus-one budgets and populated4096/4097 boundaries.
Astra ultra caught a test-oracle gap accepting swapped complete payloads; the
independent golden map closes it and final read-only review has no findings.

The requirement trace links identity/order controls to original S01/S02/S05 and
B02/B13 assertions without claiming those native cases passed. No original132
backend case is promoted, and historical26/132 acceptance remains unchanged.
This checkpoint adds no formal Rust refinement proof, complete independent issuer,
authenticated profile, public security lowering or native population completeness.
Direct main push succeeded without a PR. Next connect retained semantic inputs
to explicitly authored backend applicability/templates/sites/failures/prerequisites
and original assertion mappings, implement authenticated issuance and physical
bodies, and close B10/admission drift with integrated native evidence. The current
Truss handoff still explicitly lacks seven native semantic protected bodies; its
other checkpoint progress is not full backend qualification. The goal remains active.


### Native prepared-call installation drift checkpoint — 2026-10-10

Under the PostgreSQL planner-observation annex and original pg-raw.B10 assertion,
a current-main spike now connects selected installed routine custody to actual
prepared-call dispatch. The private observer helper snapshots ten explicit native
metadata fields and refuses drift before the original ordinary connection sends
EXECUTE. PG17.9 with SCRAM authentication passes72 native observations:18 individual
flag-on/flag-removed refusals,18 unchanged-PID checks and18 restored same-prepared
call results, plus independent fixture metadata/identity/baseline and actual
guard-erasure disclosure controls. Four pure custody tests pass on Python3.9.6.
The [execution checkpoint](evidence/security/pg-routine-drift/checkpoint.json)
retains raw logs, current source pins, the full97,695-byte positive native trace
and independently observed private OID16417, historical source-specific receipts
and the initial missing-database failure. Native runs freeze five declared inputs
and verify them unchanged; unit pins are qualified as post-run source custody.

Astra ultra's review corrected a structurally vacuous zero-dispatch assertion by
requiring one shared read/admit/execute path and an actual guard-erasure dispatch.
Its other implemented feedback covers resilient owned cleanup, authenticated TCP
readiness, exact executed-script binding, and retained positive disclosure evidence.
The final independent read-only audit verifies all72 expectations, five source
pins, the trace hash and six exact private-relid matches; no findings remain
within the stated native JSON/trusted-installer premise.

This is a physical detected-drift experiment, not complete backend enforcement.
The selected tuple omits other metadata/dependencies; production registration
authentication, atomic check-to-use exclusion, direct ordinary SQL bypass closure,
complete diagnostic observation policy and authority/publication integration
remain open. The original B10 case stays counterexample-found, historical26/132
acceptance is unchanged and all132 required cases remain binding. No formal Rust/
Python/native refinement proof follows from these runs. Next bind installation
validation to common native exclusion and close direct SQL/dependency routes
alongside the independent backend issuer and physical bodies. Goal remains active.


### Cooperative installation exclusion checkpoint — 2026-10-10

The [native receipt](evidence/security/pg-installation-exclusion/native.json)
records 61 passing observations on PostgreSQL 17.9 across Alice, Bob and outsider
persistent ordinary prepared sessions. A real installer mutation after successful
validation exposes private plan metadata. With a shared transaction advisory lock,
an independently observed exclusive installer waits through validation and execution;
all protected traces contain two outer plans and no relation IDs. After reader
release, the installer progresses and fresh drift causes zero-dispatch refusal.
Six frozen inputs and six complete trace hashes bind these observations.

The [formal receipt](evidence/security/pg-installation-exclusion/formal.json)
contains eight independently parser-replayed SMT formulas (three UNSAT, five SAT).
Two conditional ideal laws establish initial installation identity and preserve it
through finite histories while readers hold exclusion and every mutator cooperates.
Assumption-erasure controls and a possible post-release writer transition are
satisfiable; they do not prove eventual progress or fairness. This is not refinement of
Python or PostgreSQL, authentication, complete mutator coverage or noninterference.

A failed stronger trace check is retained alongside its exact source and log.
The final producer uses offset-independent reads of live stderr; shared descriptor
seeking could interfere with writes. The earlier passing receipt remains historical,
with relocated trace hashes, rather than being repinned to the corrected producer.
B10 remains counterexample-found, historical acceptance remains 26/132, and all
132 original cases remain binding. Direct SQL routes, transitive dependencies,
complete diagnostics, authenticated issuance, cancellation and publication remain
open. The goal remains active.

Astra ultra independently verifies all 61 observations, six traces, six native
and eight formal source pins, the executed helper prefix and all eight fresh Z3
replays. No findings remain within the qualified scope. Four custody unit tests
also pass. Review and execution receipt hashes are retained in the checkpoint.


### Independent typed template expansion integration — 2026-10-10

Weft main now contains [ae13dbb](https://github.com/DocumentDrivenDX/weft/commit/ae13dbb251cf0878e511f133290cc4978649e99d):
a private issuer expands independently authored typed templates into original
contracts, explicit kinds/case atoms and prerequisite instances. It consumes actual
owner events and structural Rule payloads, preserving source/scope/address and all
shared original origins. Mandatory semantic templates cannot disappear because
another kind is present. Per-capability deployment catalogs remain unconditional,
including selected zero-edge declarations. The existing instance matcher rejects
codec/privacy fragments even when source-level correspondence passes.

The [integration receipt](evidence/security/weft-requirement-templates/integration.json)
retains unchanged Weft-namespace execution/review evidence:569 passing release
workspace tests in44 groups (core226), all nine new controls passing, all828
prefrozen declared input hashes unchanged, and independent Astra ultra verification.
The full workspace log, corrected development failures and specification checks
are retained. Exact failed-attempt source snapshots were not captured; those logs
are development diagnostics only. Review fixes address transitive missing dependency
panic, per-capability selected template instantiation and charge-before-copy/visit
accounting. Independent tiny ledgers, complete shared origin omission controls and
4096/4097 aggregate links isolate the intended checks.

This expands requirements conditionally from an independently authored trusted
fixture profile. Payload-specific domain/transform/operator/backend applicability,
exact original backend case/assertion mappings, authenticated registry selection,
cross-target prerequisites, native physical bodies and public lowering remain open.
Rule enumeration and template expansion have separate phase-local budgets, not an
aggregate CPU/allocator bound. No new formal Rust refinement or native acceptance
is claimed. Historical26/132 and all132 required cases remain unchanged; the goal
remains active. Next author and validate the exact backend template/case catalogs
and profile authentication before permitting native physical dispatch. Direct main
integration continues without new PRs.

### Original security acceptance catalog binding checkpoint

Weft main `f7a682e27db5d3530678bea3312a5ea2211d4f28` retains the exact original 132-case plan and requires the complete 42-case semantic/backend inventory for private catalog-bound issuance. Full assertion metadata, including S10 disclosure and nullable pending procedures, is preserved. The frozen workspace passed 573 tests across 44 groups (230 core); all 833 input pins remained unchanged. Astra ultra independently audited the receipts and four new controls with no blockers. [Retained checkpoint](evidence/security/weft-case-catalog/checkpoint.json) and [integration provenance](evidence/security/weft-case-catalog/integration.json) link this component evidence to US-056 AC7/AC10. Backend labels and registration pins remain trusted host premises; production template adequacy, authentication, and native enforcement remain open. All 42 selected cases stay pending and historical required acceptance remains 26/132.

### Native old-snapshot first-read controls — pg-raw.L06

The new isolated [producer](../../../tools/security/pg-old-snapshot-admission-probe.py) extends original pg-raw.L06 / US-057-AC2 and CONTRACT-063 snapshot admission controls against the existing fixed enrolled read projection on PostgreSQL 17.9. Each of three isolation schedules first reads the independently authored nonempty Alice result through that exact protected entry, consumes it, and retires its enrollment. A new transaction anchors its snapshot before the ordinary revoker commits assignment removal; only afterward does the dedicated ordinary issuer enroll the reader. Repeatable-read and serializable first reads return SQLSTATE 42501 with the exact unsupported-snapshot error, no rows, and no consumption of the enrollment. The failed transaction refuses further work (25P02); rollback and read-committed restart on the same PID return no revoked resources. The read-committed schedule directly observes removal in its first protected statement. Empty result consumption precedes exact retirement and retained terminal history.

The native run passed 58 observations with six captured source pins and 48 request transcripts. Per-request stdout SQLSTATE/error-message markers and independent stderr markers fence diagnostics before capture; an earlier attempt demonstrated that a stdout marker alone does not fence Docker-relayed stderr. Both failed attempts and the intermediate 58-check run retain exact producer snapshots, start/native/failure receipts and terminal logs. [Native receipt](evidence/security/pg-old-snapshot-admission/native.json) records the original case assertion unchanged.

This qualifies the fixed isolation-admission refusal/restart behavior only. Enrollment commits after the old snapshot, so the schedule does not establish isolation-check-erasure necessity or stale-row disclosure through that entry. Native table/routine/dependency closure, authenticated production broker, generalized compiled queries, disclosure diagnostics, all authority mutations and final-publication boundaries remain required. Original pg-raw.L06 remains pending, historical required acceptance stays 26/132, and the full goal remains active.

Astra ultra independently reconstructed the 58 observations against the authored oracle and 48 transcript schedule, checked all six current source pins and both diagnostic boundaries, and found no remaining landing blocker in this stated scope. [Retained checkpoint](evidence/security/pg-old-snapshot-admission/checkpoint.json) and [review](evidence/security/pg-old-snapshot-admission/astra-review.json) preserve the acceptance qualification.

### Authored deployment qualification duty checkpoint

Weft main `60e82559941ff124fa38e248adb49af4f0a77a18` contains the separate candidate
`weft.security.deployment-duty-catalog/0.1.0`:42 distinct original qualification
duties for each backend home, with exact owners/sites/failures/case assignments and
81 explicit same-capability prerequisite edges. The strict bounded gate refuses
all duty/assignment omissions and contract substitutions, including unchosen and
zero-edge capabilities. A coherent original manifest/profile catch-all passes
weaker instance matching but still refuses this independent gate. Its distinct
private DeploymentIssued type retains strict-gate provenance; no public lowering
or native execution is enabled.

The [retained checkpoint](evidence/security/weft-deployment-catalog/checkpoint.json)
and [integration receipt](evidence/security/weft-deployment-catalog/integration.json)
link candidate correspondence to US-056-AC7/AC10:578 passing release workspace
tests in44 groups (235 core), five new controls, all837 prefrozen source pins
unchanged, zero failed/ignored/measured/filtered, and independent Astra ultra
source/receipt audit with no blockers. Specification checks passed51 artifacts,
31 schemas,30 criteria and636 fixture scenarios. Earlier development logs are
retained as diagnostics without exact attempted-source snapshots; the final run
has fresh captured pins. The manual42-row golden table is separate from the Rust
implementation. Shared charged profile preflight and visit/text reservation fixes
were applied before the frozen run.

This implements deployment qualification mapping only. Complete semantic payload
applicability, authenticated profile/case/procedure selection, native assertion
adequacy and backend enforcement/current-cut evidence remain necessary. Proposed
prerequisites do not prove test sufficiency or Rust/native refinement. All42 cases
remain pending at the issuer, historical required acceptance stays26/132, and all132
original acceptance obligations remain intact. Continue toward admitted profiles
and complete backend qualification; component correspondence cannot finish the goal.


### Typed payload applicability component checkpoint

Weft main `c6d8c531b9a467aaabeaf8daf6ae6e6ad3735f72` now contains the private
template0.2 family/presence applicability subset described in the
[issuer annex](../02-design/spikes/security/backend-requirement-issuer-v0.2.md).
Actual borrowed payloads generate mandatory scalar/nullability/refinement-family/
protection, key, query/output and ordered association occurrence duties. Each
missing applicable selector or eligible origin refuses; template0.1 retains its
earlier behavior and rejects payload selectors. Full payload values remain intact
in the owner. No public compiler transport or native dispatch is activated.

The [unchanged Weft checkpoint](evidence/security/weft-payload-applicability/checkpoint.json)
and [integration receipt](evidence/security/weft-payload-applicability/integration.json)
link this component evidence to US-056-AC7/AC10:584 release workspace tests across
44 groups,241 core, six new controls,840 freshly frozen input pins unchanged,
zero failed/ignored/measured/filtered, and an independent Astra ultra source/hash/
log audit with no landing blocker within this subset. The independently authored
33-occurrence/48-scoped-duty golden is compared with actual owner dispatch and
issued requirements; exact/minus-one whole0.2 ledger checks are retained.
Specification checks pass51 artifacts/31 schemas/30 criteria/636 fixtures.
Development corrections remain diagnostic logs without failed-source snapshots.

Astra's availability feedback was applied: required and absent-allowed are exact
values, separate from logical-type nullability. Actual-owner tests exercise two
scans/actions, Context/Stored, operator modes and ordered endpoint/member positions.
Authentic source-plan extraction checks optional Field/COUNT/nullable SUM typing.
An exact direct-original result contract passes for a required Field and refuses
the equivalent absent-allowed Field; this does not assert blanket optional-source
or owner-context refusal or aggregate result admission.

Facet numeric values, allowed-value members, constant/transform domains/literals/
revisions and complete physical compatibility remain unqualified. Authenticated
complete profiles, original assertion/procedure adequacy, native backend bodies
and current enforcement evidence still remain required. This is not a formal
Rust/native refinement proof. All132 original acceptance obligations remain
binding, historical required acceptance remains26/132, and the full goal stays
active. Neither this candidate nor deployment-catalog provenance closes it.


### Rule domain/literal verification-demand component checkpoint

Weft main `5120c54f76acbd17e2ac0a6a53721fdd16a4d274` contains the separate
private template0.3 experiment described in the
[issuer annex](../02-design/spikes/security/backend-requirement-issuer-v0.2.md).
Actual borrowed Field/Context/Constant operand domains and constant0.1.0 transform
output domains now produce mandatory occurrence-specific verification duties.
Exact RulePath framing keeps both Equal operands and ordered disclosures distinct
even with equal values and a populated false condition. Literal duties preserve
wrapper family and typed absence without cloning/normalizing owner payloads.
Unknown selected transform names/revisions or unsupported wrapper shapes refuse.
Earlier template0.1/0.2 paths retain their meaning and reject new rule-only selectors.

The [unchanged Weft checkpoint](evidence/security/weft-rule-payload/checkpoint.json)
and [integration receipt](evidence/security/weft-rule-payload/integration.json)
retain component evidence for US-056-AC7/AC10:588 release workspace tests across
44 groups,245 core, four new controls,842 fresh frozen inputs unchanged, zero
failed/ignored/measured/filtered and independent Astra ultra source/pin/log audit
with no landing blocker in this conditional demand-extraction scope. A manually
authored28-duty actual-owner golden covers both Equal sides and distinct target
Fields with identical transform output Field/domain/value. All applicable selector/
origin omissions and whole0.3 ledger minus-one controls refuse. Direct dispatch
controls cover all five scalar wrappers, typed absence and independently counted
Boolean4-visit/7-text versus null3-visit/0-text pre-encoding ledgers.

Astra's fixture feedback was applied: original source admission continues to reject
duplicate disclosure target Fields. The repeated-target direct typed test qualifies
framing only. The development correction is retained as diagnostics without exact
failed-source snapshots; only the final fresh frozen run qualifies current sources.
Specification checks passed51 artifacts/31 schemas/30 criteria/636 fixtures.

These checks do not prove exact numeric/literal native representability, complete
authenticated profile selection, original assertion/procedure sufficiency or
Rust/database refinement. Native bodies/current-cut/enforcement qualification
and all132 original acceptance obligations remain required. Historical required
acceptance stays26/132; no case is promoted and the full goal remains active.


### Original-layout native graph membership checkpoint

The fixed graph spike now executes against the complete original Truss0.16 DDL,
not a reconstructed entity/association table layout. PostgreSQL17.9 ordinary
SCRAM actors match the independent raw membership oracle. The
[final receipt](evidence/security/truss-native-membership/3d079a08-9485-49c2-b3f1-81f7ad503fd4/native.json)
retains110 observations/51 transcripts and six unchanged input pins. Separate
active/ownership-rel/assignment-rel/root-type erasures expose native leaks and
restore; direct bags/retained/edges and owner transitions deny, while reversed
endpoint roles fail the actual FK without an index-collision confounder.
Three exact-invocation refusal controls pass. Seven original attempt directories
retain their source preimages and outcomes; only the final source-qualified run
supports current110-observation claims.

TD-056/STP-056 document the synthetic fixed mapping, direct fixture source rows,
excluded non-FORCE table owner and defensive overlapping IDs. This is not Truss
schema admission, normal allocation, registered property/key decoding, original
Weft lowering, complete native diagnostics or current-authority publication.
It is not a formal implementation refinement proof. All132 original obligations
remain required, historical acceptance stays26/132, truss.B01 remains not-run,
and the full implementation goal remains active.

The [Astra ultra read-only audit](evidence/security/truss-native-membership/astra-review.json)
found no remaining blocker in this component scope; no independent native rerun
was performed by the reviewer.


### Native graph principal binding and formal preflight checkpoint

The fixed native graph overlay now enforces unique, exactly typed Staff login
binding before eligibility and before Resource iteration. The
[current native receipt](evidence/security/truss-native-membership/61a4b228-9f59-48a1-8ba4-b34cd82720e0/native.json)
retains217 observations at six unchanged pins, including missing/ambiguous binding
refusal with zero Resources, ordinary JSON Boolean/string login discrimination,
foreign-type matching login and complete actor restores. Cardinality, projection
preflight and JSON string guard erasures demonstrate distinct native failures.
Three current-source invocation controls pass. Earlier110/191/206 records remain
historical at their own captured sources.

[Four conditional denotational laws](evidence/security/graph-principal-formal/c3f36651-19b6-4c93-8072-6d9b1b3171a7/proof.json)
pass12 safety/population/erasure queries and saved-formula replay with Z3 4.15.4.
They assume complete typed matches and exact count/min semantics, using three
arbitrary int64 Staff IDs plus arbitrary nonnegative count/preflight variables.
This is not automatic SQL/Rust refinement or native fact/source authentication.
Outer WHEREfalse/LIMIT0 may avoid invocation: no output is observed, but no
principal admission is proved. Arbitrary diagnostics remain unqualified.
All132 original obligations, full backend integration and current-authority
publication remain required; historical acceptance stays26/132 and the goal
remains active. The former fixed anonymous/no-match join is not retained as the
current implementation of missing-binding semantics.

The principal-binding count/preflight formulas are explicit guard-definition
sanity checks; they do not independently model publication or prove SQL ordering.
The final cardinality-erasure control retains JSON string typing. Earlier217
and formal source snapshots remain historical rather than repinned.

The [Astra ultra final read-only review](evidence/security/truss-native-membership/61a4b228-9f59-48a1-8ba4-b34cd82720e0/astra-review.json)
verified all current native/formal source pins and independently replayed12
formulas, finding no remaining issue in this fixed-fixture scope. It did not
execute a native rerun or promote acceptance.


### Actual Truss inventory: native role transition authority, merged to main

The reusable Truss private installed observer now captures an eleventh section
using PostgreSQL16.15 native MEMBER/USAGE/SET/ADMIN semantics. Its fixed invoker
profile refuses distinct SET or ADMIN routes independently of matching expected
inventories. Direct effective ACL checks alone were insufficient: native
INHERIT FALSE / SET TRUE direct and indirect memberships and an ADMIN-only
self-grant can expose registry writes. Native controls demonstrate those effects,
observer refusal and exact restoration; membership-only without those privileges
can match a fresh scoped baseline. Legacy ten-section packets refuse.

The [integration receipt](evidence/security/truss-installed-role-paths/integration.json)
points to Truss main11f14e23a0fa747e6fca4fa61250fa41c78dcfef and retains305
installed-wheel tests,63 native observations/29 inventories,20 verified original
source pins, exact wheel file custody and200 Python boundary edges. Concurrent
main's snapshot-neutral adoption fix is preserved and tested in that wheel.
Astra ultra found a producer frozen-input custody defect; it was fixed, reviewed
and natively rerun. Historical failed and earlier passing attempts remain in the
owner repository at their captured bytes.

This is component evidence toward US-056-AC5/AC9/AC10 and Truss PA01/PA02, not
completion of those criteria. The native actor uses a local socket fixture;
production authentication, coherent protected cuts and arbitrary mutator closure
remain unqualified. Seven native helper routines are not the seven required
semantic operation bodies. All132 original obligations remain required;
historical acceptance stays26/132, no case is promoted, and the full goal remains
active. Implementation and evidence were published directly to main without PRs.


### Source-derived Truss role guard laws

The [current guard proof](evidence/security/truss-role-guard-formal/ddff3684-cae4-4029-bd7a-4ac7cb518b5b/proof.json) extracts the pure role predicate,
its complete unfiltered `any` iteration and terminal classification from the exact
Truss module merged at11f14e23. It checks original native/module/integration pins;
no handwritten replacement classifier is treated as the implementation. Five
UNSAT violations cover distinct SET/ADMIN routes, matching unsafe baselines,
nonclearing prior refusals and ordinary-self SET handling. Three SAT populations
and three SAT guard-erasure counterexamples prevent an always-refuse or vacuous
proof. All11 exact saved SMT byte digests and outcomes replay;32 Boolean/identity
vectors compare the extracted actual Python expression with the restricted SMT
translator. Policy-predicate replay covers29 original native inventories.

Astra ultra requested saved-formula byte custody and clarified that native row
completeness is an explicit premise. Both were applied before this fresh run.
Earlier failed and passing producer attempts retain their exact inputs and scope.
This is source-derived pointwise/finite-fold guard analysis, not whole Python
packet-admission, native role-graph, SQL/compiler or temporal-cut refinement.
`other_route` abstracts the remaining finite disjunction and `prior_reason`
abstracts preceding baseline and other refusals. The independent original native
receipt supplies real direct/indirect SET and ADMIN-only write witnesses; the
formal producer does not rerun native SQL. Full authentication/cut/mutator/body/
publication obligations remain required. Historical acceptance stays26/132,
no original case is promoted, and the full goal remains active.

The [final Astra ultra read-only review](evidence/security/truss-role-guard-formal/ddff3684-cae4-4029-bd7a-4ac7cb518b5b/astra-review.json) independently replays11 formulas and reproduces32 actual Python vectors/29 native predicate results, confirming seven source/preimage pins and all formula hashes. Two exact invocation controls refuse wrong-root and extra-argument calls. No native rerun or full acceptance promotion follows from the review.


### Truss SCRAM authentication and session lifetime — 2026-10-10

[Direct-main integration evidence](evidence/security/truss-scram-authentication/integration.json) records Truss main
`bb5eb75a018e068c281c565ae49e9a50825ee400`. The separately installed combined wheel matches53 source,
owner-asset and typing files, passes328 tests and212 Python boundary imports.
The original PostgreSQL16.15 / pgserver0.1.4+truss.pg16.15 / pg8000
1.31.5 Unix-socket SCRAM fixture passes82 observations across31 inventories,
with21 frozen source/preimage pins. Native authentication log entries bind the
ordinary role and SCRAM method to its backend PID. Wrong credentials and missing
roles refuse28P01. NOLOGIN changes inventory qualification and refuses new
sessions28000, but two established authenticated sessions remain usable.
Restoring LOGIN allows a fresh connection. Thus authentication establishes a
connection identity; login permission alone cannot revoke current operation
authority or retire existing sessions. Protected admission must independently
establish current authority at its coherent cut.

Four failure controls cover receipt/stderr secret redaction, an unwritable receipt
sink, continued connection cleanup and cluster cleanup after failures. Astra ultra
feedback was applied and the captured helper bytes execute directly. The final
read-only review verifies current pins and preserves the qualification boundary.
Historical Truss development evidence retains its original source hashes.

This supplies component evidence for US-056-AC5/AC9/AC10. It does not prove
production/TLS authentication, native protected ontology mapping, complete
collection/current cuts, PA01/PA02 completion, seven semantic operation bodies
or complete backend acceptance. Historical acceptance remains26/132; every
original required case remains governed by the existing plan and the goal stays
active. No source-derived formal theorem gains native/temporal premises merely
from this fixture's success.


### Native elevation routes outside the registered namespace — 2026-10-10

[Verified direct-main integration](evidence/security/truss-definer-routes/integration.json) records Truss
`71ba19f8373657cca34085250819220efd5ea79c`. The fixed invoker observer now requires a twelfth census
section enumerating native EXECUTE-accessible SECURITY DEFINER routines across
all schemas. Schema USAGE is retained independently and cannot filter the census.
Any nonempty census refuses even against an identical unsafe baseline; legacy
eleven-section packets refuse. This is a conservative profile-specific rule.
Protected registered definer chains require a distinct admitted profile; UMF
logical semantics do not prohibit all definers.

The PostgreSQL16.15 / pgserver0.1.4+truss.pg16.15 / pg8000
1.31.5 SCRAM fixture passes97 observations across35 inventories with21 frozen
inputs. An ordinary session with no direct UPDATE right invokes an external
PUBLIC-executable definer owned by a distinct nonlogin role. The actual committed
row UPDATE changes xmin, independently observed, while logical revision remains
unchanged. Original and matching unsafe baselines refuse. Revoking EXECUTE removes
the route; revoking only schema USAGE retains and refuses it. Native prepared-call
revalidation in this fixed fixture returns42501 with unchanged xmin; it does not
demonstrate a surviving write or prove behavior of every retained statement.

Astra identified and verified fixes for the schema-USAGE filter and replayed
packet budgets skipping empty final-section columns. Exact80164-unit budget
passes;80163 and80076 refuse. Native final-section row overflow refuses. The
separately installed wheel matches53 source/owner/typing files and passes334
tests; Python boundary checks pass212 imports. Exact source/preimage, test,
wheel/log/native digests and the read-only Astra review are retained. Owner
historical attempts preserve earlier pins and two rejected prepared-call
predictions instead of being repinned to the final producer.

This advances US-056-AC5/AC9/AC10 and Truss PA01/PA02 component evidence.
It is not complete installed call closure: operator/type/extension routes,
trigger/default/RLS paths, indirect resolution, protected capture, current
authority cuts and seven semantic operation bodies remain unqualified. Earlier
source-derived role proofs retain their historical source scope; no fresh
whole-program, SQL or temporal refinement proof follows. No original required
case is promoted; acceptance remains26/132 and the full goal remains active.


### Operator-backed hidden definer and source-derived guard laws — 2026-10-10

[Native integration](evidence/security/truss-operator-routes/integration.json) records Truss main
`f48975262c74317940329c4f70bd193db81b68fa`. A native operator invokes a SECURITY DEFINER
implementation in a distinct function schema to which the ordinary caller has
no USAGE. The caller also lacks direct UPDATE, but the operator commits a row
UPDATE whose changed xmin is independently observed. The merged census retains
that hidden function and refuses an identical unsafe baseline. Revoking function
EXECUTE then returns42501 with unchanged xmin; scoped correspondence and operator
removal restore the baseline. The proposed EXECUTE-ignoring operator bypass was
not observed. No thirteenth inventory section or new permission semantics is
introduced: this validates an actual route covered by the existing conservative
function census.

The fixed PostgreSQL16.15 / pgserver0.1.4+truss.pg16.15 / pg8000
1.31.5 SCRAM fixture passes107 observations across38 inventories with21 frozen
inputs. The unchanged separately installed53-source wheel passes336 tests,
including original-native operator packet regressions. The read-only Astra review
verifies the native source/preimage and wheel pins. Library source remains the
reviewed71ba19f8 implementation; no unchanged owner build is attributed as new
implementation.

[Source-derived analysis](evidence/security/truss-definer-census-formal/cfa978ae-c2c9-4fef-b244-4495aab10da9/proof.json) recognizes the complete exact
census SQL subset and extracts the actual final three Python classifier
statements. Three UNSAT violation queries show the selected hidden executable
definer cannot be filtered by schema access, a nonempty census cannot match and
an earlier refusal cannot clear. Three SAT controls populate a safe empty
profile, the hidden operator witness and a namespace-filter-erasure leak. All six
SMT byte digests replay independently. Sixty-four Boolean vectors execute the
extracted actual tail;38 original native inventory tail replays preserve refusal
when the census is nonempty. The role-route fold is retained, without replacing
the full classifier with a handwritten policy implementation.

Complete faithful immutable native rows and effective privilege facts are explicit
analysis premises. This is a recognized-filter and pure-tail proof, not native SQL
semantics, full Python ingress/admission, authenticated producer, dependency
closure, temporal-cut or protected-publication refinement. Operator
support/selectivity/planner, type/extension and trigger/default/RLS paths remain
required. The actual protected capture/writer protocol and seven semantic bodies
remain open. This augments US-056-AC5/AC9/AC10 component evidence without
promoting any original requirement. Full acceptance remains26/132 and the goal
stays active.

The [independent Astra ultra review](evidence/security/truss-definer-census-formal/cfa978ae-c2c9-4fef-b244-4495aab10da9/astra-review.json) replays all six exact SMT formulas, reproduces64 actual-tail vectors and38 native tail replays, and verifies27 proof pins,21 native pins and30 integration hashes. Two producer invocation controls refuse wrong-root and extra-argument calls. Review does not execute native SQL or promote acceptance.


### Protected caller capture: post-elevation information loss — 2026-10-10

[Native observability evidence](evidence/security/truss-capture-observability/533c90f6-3dbe-4d7d-ae83-484617149b4a/native.json) passes10
observations on PostgreSQL16.15 / pgserver0.1.4+truss.pg16.15 / pg8000
1.31.5. In one physical connection and transaction, direct and unregistered
wrapper paths enter the same privileged function. Their original effective actors
differ; the nine post-elevation fields are identical: session person, effective
writer owner, role setting, database, backend PID, xid, session-role OID, writer
role OID and entry-routine OID. The wrapper explicitly captures its actor in
PLpgSQL before entering the writer; direct host capture precedes its native call.
This avoids relying on SQL target-expression evaluation order.

[Formal equal-input analysis](evidence/security/truss-capture-observability-formal/4b3dbd6b-1c44-49f6-8480-0e84fd4c6a69/proof.json) retains two
UNSAT separation attempts for arbitrary deterministic decisions over that exact
tuple, including equal extra state. A SAT population shows that adding a distinct
trusted pre-entry actor can distinguish the paths. This does not authenticate an
added caller label or implement capture. The formulas do not prove all PostgreSQL
protocols impossible: unequal history/nonce/state, trusted host original-call
custody, native frame/stack evidence and additional provenance remain outside
the equal-input premise. No HMAC/signature primitive is implemented or proved.

PA02's protected realization therefore must name the independently trusted
pre-elevation provenance or qualified original-call restriction that enforces
the registered chain. Sealing only these post-elevation fields cannot recover
the missing actor; same-entry OID/xid/PID binding alone cannot classify these
paths. One-use custody must remain, but refusing a second invocation is distinct
from establishing the original caller of a first invocation. The accepted trusted
embedding host can supply original call facts under Truss ADR-008 only through
qualified exclusive physical-connection custody and protected carriers. Native
SQL arguments do not themselves authenticate Python object identity. Preserve
the existing invoker elevation guard; neither writer-owner substitution nor
caller-supplied JSON/GUC fields is an implementation shortcut.

Required protocol tests now include this collision witness, independently
authenticated pre-entry capture, a forged added actor, copied public context,
first-use submission through a different wrapper, same/different native attempt,
transaction and connection, and native plus trusted-host one-use custody across
savepoint rollback. Original PA-N01–PA-N12 and all132 required cases remain
required; this supplies US-056-AC5/AC9/AC10 design evidence only. The fixture
uses local trust actors and synthetic routine/role names, no actual Truss registry
or business effects, and no authenticated subject/production capture qualification.
PA02 and full backend acceptance remain open at26/132. Earlier cleanup failure
and preliminary SQL-expression-order run retain their original sources; the
final receipt alone qualifies the explicit capture order.

The [Astra ultra read-only review](evidence/security/truss-capture-observability-formal/4b3dbd6b-1c44-49f6-8480-0e84fd4c6a69/astra-review.json) independently replays all three formulas and verifies four native/seven formal pins plus the installed bodies/owners/settings/entry OID. No native execution or PA02 promotion follows from review.


### Trusted-host protected capture candidate — 2026-10-10

The [native candidate receipt](evidence/security/truss-protected-capture-candidate/90e12409-3a54-466f-8184-2a54c961669d/native.json) retains23 matching observations on
PostgreSQL16.15, corrected pgserver0.1.4+truss.pg16.15 and pg8000 1.31.5.
Original source bytes, seven source pins and actual installed routine OIDs,
owners, settings and complete definitions accompany the receipt. The earlier
19-observation run and preliminary23 run remain historical; the final run
adds same-transaction absence checks, original frozen AdmissionCustody execution
and guaranteed sanitized failure reporting even if the receipt sink fails.
Two retained subprocess controls exercise secret-bearing exceptions with writable
and unwritable evidence sinks; both suppress secret text and exception chaining.

This implements an isolated physical candidate for the PA02 prerequisite:
an INVOKER query captures native person/actor OIDs, database, backend PID and
xid before elevation. A separately privileged trusted registrar inserts a
private random 32-byte capability bound to those facts, original attempt and
exact synthetic payload. The fixed host dispatch invokes an INVOKER gate and
DEFINER writer; the writer atomically consumes the matching capability before
inserting the synthetic effect. Ordinary callers cannot read capabilities,
write effects directly, create routines in the candidate schema, or inherit
writer/registrar roles. The wrapper gate refuses elevated acting identities.
The capability is never public context or included in retained evidence.

Actual native negatives refuse forged/copied public context, a different
connection (even with the private capability), another login route, attempt/input
substitution, unregistered wrapper invocation and direct private access.
The exact native positive effect is inspected in its original transaction.
For this inspection only, the fixture administrator temporarily grants effect
SELECT, immediately revokes it, and verifies the final prohibition. This is
an administrative test observation, not an adopted ordinary read surface.

Native same-transaction reuse refuses, but savepoint rollback restores the
native capability's unused state. The producer independently demonstrates
successful direct native replay after rollback and verifies its actual effect.
The existing original Truss AdmissionCustody ticket refuses that resubmission
and retains one fixed dispatch. Therefore the composed candidate requires
trusted exclusive host dispatch and private carrier custody; its native table
alone does not provide rollback-resistant one-use authorization. This is not
a qualified SQL-only route or protection from a malicious same-credential host.
A changed transaction also refuses the old capability.

The adjacent acceptance-map.json ties all23 observations to original requirement
IDs without marking a complete schedule passed. The adjacent astra-review.json
retains independent review: all three harness findings were fixed and the final
seven pins, installed definitions and failure controls were independently checked.

This advances US-056-AC5/AC10 physical component evidence and PA-N03/04/05/09
schedule development, without promoting them to complete acceptance cases.
Local trust authentication, synthetic registrar inputs and the fixed actor
profile do not establish production authenticated subject mapping, SET ROLE,
current owner authority, generation/configuration checks, complete callable
closure, resource admission or publication. PA01–PA04 and all seven Truss
semantic bodies remain unfinished; the original132-case goal remains26/132.
Next integration must replace synthetic registrar facts with the original
owner authority/artifact and coherent-cut protocol, qualify installed closure
and protect the carrier throughout the registered adapter. No public API or
ordinary registry grants are added to Truss.


### Native current-authority primitive and lock boundary — 2026-10-10

The [final native receipt](evidence/security/truss-protected-capture-candidate/85d31486-2f88-48e5-b492-ec15b9d730f3/native.json) extends the protected capture candidate to39
matching observations. Seven original source pins/preimages and six actual
installed routine identities, owners, settings and complete bodies are retained.
READ COMMITTED is independently observed and explicitly required by the writer.
RR/Serializable refusal is currently source-reviewed, not natively exercised.
The earlier23/33/38 schedules and their preimages remain historical evidence.

A separate non-login authority responsibility owns a private, fixed single-actor
row with permitted/generation fields. Only the writer can execute its private
check helper. The helper locks the selected row FOR SHARE, then checks complete
row presence, permission and exact captured generation before the writer inserts
its synthetic effect. Ordinary authority SELECT/UPDATE/helper execution and
revoker direct UPDATE refuse. The registered revoker routine updates the row;
it is the selected native mutation route in this fixture, not a complete policy
administration or ontology resolver interface.

Actual revocation after capture refuses without effects. A separately issued
capability matching the revoked generation independently isolates permission
false; regrant advances the generation and the earlier capability remains stale.
A fresh matching generation produces an independently inspected original effect.
An independently submitted revoker times out with native55P03 while the writer
retains the authority row lock; authority remains unchanged. After writer rollback,
the same revoker succeeds and advances the generation. This is one bounded native
row-lock schedule, not proof of complete writer participation, fair termination,
deadlock freedom or final publication. PostgreSQL16's documented FOR SHARE
conflicts and transaction/savepoint release rules govern this candidate:
https://www.postgresql.org/docs/16/explicit-locking.html.

[Formal guard analysis](evidence/security/truss-capture-authority-formal/19fe84d8-27c7-4bc7-b323-52ad9fe0223d/proof.json) saves eight independently replayable formulas:
four UNSAT laws and four SAT positive/weakened controls. Positive generation
integers are unbounded in the model. Exact authority-check and writer routine
bodies are recognized, but SQL execution/FOUND/atomic exception behavior and
complete faithful current authority are premises. The held-lock serialization
law explicitly assumes revoker exclusion; it is not derived PostgreSQL semantics.
The stale mutant requires captured<current; advancement requires next>current.
Originally parsed native bytes are frozen, canonical invocation is required,
and saved formula bytes are rechecked before publication. No SQL/Python/compiler
refinement, ontology resolution or publication-drain theorem is asserted.

The adjacent native acceptance-map.json links all39 observations to original
US-056-AC5/AC9/AC10 and PA-N01/03/04/05/07/08/09/11 component schedules without
claiming those complete schedules passed. The two sanitized failure controls
remain passing; new UUID receipts use exclusive creation, preserving reruns.
Astra review findings about independent permission evidence and proof source
custody/directional controls were applied before final qualification.

This supplies a current-authority physical primitive only. Production subject
mapping, original ontology/policy/artifact admission, coherent complete source
cuts, all authority mutation/callable dependencies, resource/family bindings,
protected carrier lifecycle and final release remain required. Savepoint rollback
releases the native authority lock and restores native capability reuse; the
existing host ticket remains burned. This cannot replace durable pending-buffer
custody or L03 revocation/drain. No Truss public API or supported backend profile
is promoted. PA01–PA04, seven semantic bodies and the original132 required cases
remain open at the historical26/132 checkpoint.


## Raw ontology read-admission candidate — 2026-10-10

The retained Weft `natural-count-self-join` logical plan now drives the captured Truss PostgreSQL predicate lowerer in a private raw-table experiment. Exact original lowerer and graph-source bytes are frozen with the bridge; no fresh Rust compilation or production owner-artifact admission is asserted. Staff, Projects, resources, assignments and ownership form five private relational tables. The rule requires an active Staff assignment to the same Project that owns the resource. This is a synthetic read-admission receipt, not authorization to mutate resources.

Final native evidence is `truss-ontology-capture-candidate/a91be6ca-a0de-417d-bc51-aec34faaeb41/native.json` under `docs/helix/04-build/evidence/security/`: 76 observations, 11 source pins, eight installed routine bodies and three complete five-table fact cuts. PostgreSQL 16.15, corrected pgserver 0.1.4+truss.pg16.15, pg8000 1.31.5 and Bun 1.4.2 qualify this run. Alice can obtain RA/RAB receipts; inactive, unrelated, ownerless and unknown resources refuse. Ordinary private-fact access and predicate execution refuse. The selected membership revoker receives 55P03 while the authority lock is held, then succeeds after rollback. Only Alice/A's active flag changes. Independent current authority `[[6,true]]` precedes denial of all six resources after membership revocation, isolating ontology denial from stale-generation or permission-false denial. Two sanitized failure-boundary controls pass; earlier run receipts remain historical.

Formal evidence is `truss-ontology-capture-formal/e48c8318-302b-4b23-8fd4-f4d25c00a167/proof.json`: seven replayable formulas (three UNSAT laws, four SAT positive/weakened controls), 14 source pins and three complete finite-population replays. Typed unbounded relational semantics establish the natural-witness join law and refusal without active assignment or ownership. Erasing active status, project equality or the mandatory rule admits counterexamples. Faithful facts, native keys, subject binding and serialized current authority remain premises; exact source coupling is not a compiler, SQL or Rust refinement proof. Exact ordered cuts, unique observations and one actor/Staff mapping prevent vacuous replay.

Astra ultra independently verified final pins, formulas and seven rejected mutation controls; review receipts are adjacent. The acceptance map ties all 76 observations to original US-056 criteria and PA schedules as component evidence only. Historical acceptance remains 26/132. Actual typed graph execution (AC2), Ashlar/Delta, authenticated production subjects and owner artifacts, coherent complete current cuts, installed callable closure, four-family protected admission, seven Truss semantic bodies, field publication and final publication/drain remain open. No supported public backend profile or complete PA02/L03 qualification is promoted. Next integration must use the same owner artifact across actual typed graph storage and raw tables, with production owner admission and final release obligations.


## Original-policy graph/raw population parity — 2026-10-10

A separate installer-only spike now executes the same retained Weft `natural-count-self-join` IR through the frozen actual Truss row-predicate and graph-source modules against the exact captured `qualified-property-layout-0.15.owner-export.sql` object/edge tables. Predecessor IR and both lowerer pins must equal the raw candidate's pins before lowering. The current exported layout bytes, including property declaration modules and definition provenance constraints, are retained; synthetic catalog seeds satisfy those constraints without weakening them. These are fixture assertions, not original catalog staging or authenticated owner metadata.

Final evidence `docs/helix/04-build/evidence/security/truss-ontology-graph-parity/9b5634ec-caf8-4624-9c02-00ed637b3a94/native.json` contains 53 passing observations and nine source pins, SHA256 `e957e0d3de95338d5df53743bd9548fe4fd5ca0d17672894b9d49aed501b1f64`. PostgreSQL16.15, corrected pgserver0.1.4+truss.pg16.15, pg8000 1.31.5 and Bun1.4.2 qualify this run. Five complete native projected relation populations match the independently retained raw initial cut, and five match the raw final membership-revocation cut. Alice admits RA/RAB initially and none after her assignment is deactivated; Bob admits RB/RAB both before and after Alice's revocation. Both six-resource corpora include ownerless and unknown resources. A deliberately reused native object ID across Staff/Project verifies qualified type incidence rather than untyped ID equality.

The authored host preflight checks all five source-validity programs (including outer Resource), six unique natural-key/login groups and both native edge-incidence/logical-endpoint correspondences. Eleven malformed-source controls refuse with42501: absent or wrong-domain active properties, logical/native endpoint mismatches, duplicate Staff keys or logins, retired resource/association metadata, absent ownership/resource fields and wrong active metadata. The two endpoint controls independently observe all11 validity/uniqueness components true, Assignment incidence false and Ownership incidence true before refusal. This isolates incidence from both native and logical duplicate-key constraints. The exact installed read-receipt routine is retained. Ordinary callers have no object/edge SELECT; the fixture's PostgreSQL-owner definer returns only synthetic booleans.

Earlier failures are retained, including missing synthetic definition-provenance fields and a corruption initially blocked by native edge uniqueness. Final controls use existing ProjectD to isolate incidence. No new theorem is asserted: the prior typed relational laws apply conditionally, while native correspondence evidence does not prove automatic SQL/Rust/compiler refinement. Natural key properties remain fixture-attested and explicitly checked; canonical key-bucket codecs/namespaces, current coherent cuts, authenticated production subjects/owner artifacts, original staging, production role/callable closure, protected four-family admission, concurrent authority participation and final publication/drain remain required. The adjacent acceptance map links all53 observations to US-056-AC1/AC2/AC5/AC10 as components only. Complete typed-graph AC2 and full backend acceptance remain open at26/132; no public supported profile is promoted.

Astra ultra independently verified all53 observations, nine current/preimage pins, exact frozen lowering, complete initial/final fact parity, all13 installed preflight components and both isolated incidence controls. The adjacent review receipt records no remaining blocker within this installer-only scope.


## Composed protected graph read-admission candidate — 2026-10-10

The actual graph predicate and explicit full preflight now run behind the private original-call capture primitive. The original INVOKER entry still requires the actor/captured native tuple; the writer checks its registrar-issued capability, exact original transaction/attempt/resource bytes and READ COMMITTED, then calls its private authority helper. That helper obtains the same authority row FOR SHARE, verifies permission and captured generation, executes all13 authored graph-preflight components separately, and evaluates the original compiled owner predicate before inserting a synthetic read-admission receipt. There are no raw shadow fact tables. Exact captured Truss object/edge layout and frozen lowerer bytes are used; synthetic catalog seeding remains installer-authored, not original catalog admission.

Native evidence `docs/helix/04-build/evidence/security/truss-graph-capture-candidate/8ea0b9dd-a0c3-4ecc-b8cb-0d5fbf26998a/native.json` passes135 unique observations with14 source pins, SHA256 `108096e8eb0bace54a4ce709cd44e6ef1b995a4aeb52abd7241f3be9576de7db`. PostgreSQL16.15, corrected pgserver0.1.4+truss.pg16.15, pg8000 1.31.5 and Bun1.4.2 qualify the run. The captured graph predecessor's IR, bridge, both lowerer modules and layout pins must match before composition. Nine installed protected routine bodies, exact generated SQL and frozen fixture/lowerer code are retained. The private authority role owns the edge table and can read required catalog/object facts; actor and revoker cannot directly read/write graph tables or invoke preflight. No public graph support claim follows from those fixture grants.

Eleven deliberately committed installer corruptions now traverse genuine fresh private capabilities and the original native entry. Every malformed source independently yields preflight false,42501, an unconsumed native capability, zero effects inspected in the actual actor transaction, and restored preflight true. Both endpoint corruptions observe the exact13-component vector isolating Assignment incidence. Authority [[5,true]] is independently observed before these controls. These fault injections deliberately sit outside the admitted mutation closure; they do not prove complete participation or coherent source-cut authority.

The selected membership revoker updates the authority generation before changing the actual graph Assignment edge. An independent revoker receives55P03 while the read-admission writer holds the authority row; all five projected fact populations remain unchanged. After actor rollback the revoker succeeds, only Alice/A's active flag changes, independent authority [[6,true]] is observed, and all six resource admissions refuse. Three complete projected fact cuts are retained. Transaction rollback still restores native capability reuse; the original host custody restriction remains necessary and is independently exercised. This is synthetic read admission, not permission for canonical resource writes or a complete publication protocol.

Formal evidence `truss-graph-capture-formal/c2b4aa2a-f28e-4434-bb0a-ce96071da3a3/proof.json` under the same evidence root saves14 formulas: six UNSAT laws and eight SAT positive/weakened controls, with17 source pins and all three complete population replays. Original typed natural-witness laws are supplemented by an explicit authored conjunction of original capability, current authority, full graph preflight and ontology membership. A positive composed SAT control prevents an always-false conjunction from passing; independently erasing each admission guard yields a counterexample. These are conditional model laws, not automatic SQL/gate extraction, compiler refinement, native snapshot/lock semantics or final publication proofs. Source custody and observed native controls are separate evidence.

Two sanitized failure-boundary controls pass. The adjacent acceptance map links all135 observations to original US-056-AC1/AC2/AC5/AC9/AC10 and PA component schedules without promoting complete cases. Authenticated production subjects/owner artifacts, canonical graph key-bucket and namespace authority, original catalog staging, complete authority/callable closure, coherent source cuts, all four protected admission families, seven Truss semantic bodies, field publication and final release/drain remain required. Full graph AC2/PA02/L03 and the original132-case acceptance plan remain open at26/132. No public Truss backend profile is promoted.

Astra ultra verified all135 observations, fourteen native pins, nine installed bodies and eleven corruption groups, then independently replayed the final fourteen formulas with seventeen source/preimage pins. The always-false composition mutant fails the added positive control. Adjacent review receipts record no remaining landing blocker within the declared experimental scope.


## SCRAM-authenticated graph composition and owner-binding audit — 2026-10-10

The composed graph candidate now authenticates fresh ordinary, registrar and revoker sessions with PostgreSQL SCRAM on its owned Unix socket. Four role secrets are generated only in memory and never retained or included in receipt hashes or exception chains. The original bootstrap postgres session remains an explicitly trusted installer; the exact HBA admits local postgres trust, requires SCRAM for other local sessions and rejects both loopback host families. Reload completion, parsed rules, stored SCRAM-verifier presence (booleans only) and unchanged final rule rows are independently observed. This is an authenticated owned fixture, not a production issuer/Staff/owner mapping or general connection-authority profile.

Final native evidence `docs/helix/04-build/evidence/security/truss-graph-capture-candidate/f4186d8d-38ff-461d-9f0c-deefd7b8969f/native.json` passes147 observations with14 current/preimage pins (SHA256 `7cbb71735a60b89f622968eb5426ef6457c826f47914f8dfa0b30b8d1dbb5e4b`). Four wrong-secret attempts and an absent role yield28P01; correctly authenticated sessions independently expose the five expected original native identities, including two distinct connections using the same actor credential. NOLOGIN refuses a fresh actor session with28000 while the existing session still has its original identity. Admission revocation remains an independent current-authority obligation; NOLOGIN alone is not an existing-session revocation mechanism. All135 original graph/protected-capture/authority/corruption controls also pass on these freshly authenticated sessions. SQL, lowerer packet, nine installed protected bodies and complete fact cuts are unchanged from the reviewed135 run. Two sanitized failure controls match the updated producer.

Refreshed formal evidence `truss-graph-capture-formal/0e186858-5aca-40cf-b1a6-53b2e792bbb7/proof.json` under the same evidence root replays14 formulas (six UNSAT/eight SAT),17 source pins and three complete populations, SHA256 `f52b59906718137e426c9b959e0652159a31a872f486b3a7e036cae3e47d5aec`. This rebinds the previously qualified conditional model to the authenticated native run; no SCRAM cryptographic, SQL/compiler or publication theorem is added. Historical135 receipts retain their original source bytes and narrower trust-authentication scope.

The next catalog integration cannot silently rewrite the owner source. The actual frozen Truss declaration collector, executed on the retained original owner document, exposes five keys with unspecified primary roles, zero core relationship declarations and two ontology associations with ordered typed endpoints. Resource's complete required signed64 integer salary declaration is preserved alongside key-only read projections. Current native staging source explicitly requires a Boolean primary selection; its guard is source inspection here, not a performed native refusal. These facts require owner-issued storage key-role choices and relationship bindings with original accepted-binding provenance. Key-only graph projection cannot stand in for complete Record/property catalog staging or field publication.

[Owner-binding audit](evidence/security/truss-owner-binding-audit/9d296d60-1dd6-48cd-bb6e-2b63d7d4778e/audit.json) is located under `docs/helix/04-build/` and passes14 observations with five current/preimage pins, SHA256 `46a649c19af2f370518c27667e45de4177b59e0b954ba6f4a12426809d938f01`. A separately parsed frozen oracle checks the complete post-call document, exact ordered keys, complete Field/reference inventories and full ordered ontology endpoints. Composite-key reversal, integer-width deletion, unknown-extension mutation, omitted Record and omitted Field controls all refuse. The initial eight-observation audit had aliased preservation checks and provides no independent preservation qualification; its receipt remains historical. The twelve-observation correction predates the final completeness controls. No fresh owner validation, original catalog preparation/staging or binding authority is claimed by this audit.

Astra ultra independently verified147 native observations/14 pins, replayed14 formulas/17 pins and verified the final14 audit observations/five pins, including all five mutation/omission controls. Adjacent reviews are clean within their declared scopes. The acceptance map treats authentication as a PA-N01 prerequisite, without claiming SET ROLE coverage, and retains original US-056 component links. Complete owner bindings/authenticated artifact/current-cut/installed-callable and mutation closure, all four families/seven semantic bodies, canonical graph keys and final publication/drain remain required. Complete backend acceptance stays26/132; no supported production profile is promoted.

## Original owner document/native catalog staging — 2026-10-10

The unchanged `natural-count-self-join` owner document now passes genuine original UMF preparation and actual Truss provisional catalog staging on PostgreSQL16.15, pgserver0.1.4+truss.pg16.15, pg8000 1.31.5 and Bun1.4.2. Retained evidence `docs/helix/04-build/evidence/security/truss-owner-catalog-stage/75408a57-00c9-4054-bffc-ab2a918dfb73/native.json` passes31 observations/697 source pins, SHA256 `bec358feb8942d8a5bea0208f368da2bece80dc7c08c87e9a1ae3cdbf7cefa88`. Executed copied source includes the owner bundle, actual Truss preparation/stager/native SQL/layout, and declared Ajv8.20.0 dependency closure. The private bounded stdio adapter drives one installer transaction; this does not qualify the complete installed public runtime or driver.

Independent native projections verify exactly five original Records, all nine owned Fields with full scalar/nullability/cardinality/facets and accepted-document provenance, five original ordered keys as non-primary, and zero relationships/endpoints. Exact archived source retains absent primary markers, the unowned Field and unknown content. Salary retains its required signed64 facet. A native primary substitution and a composite component reversal each refuse the intended message/55000 from an isolated genuinely new-key prestate with an agreeing successful positive; exact state is restored. The head stays unpublished and rollback removes all staged catalog rows. Passing evidence is emitted only after independently attempted cleanup succeeds.

The first retained run failed in the RPC command-result adapter. Historical13/20/21-observation runs do not independently isolate key guard refusal: their existing-key prestate can also refuse55000. The corrected29 run predates complete native type/relationship checks. These remain historical receipts, not the final qualification. Refreshed post-validation collector/literal guard audit `truss-owner-binding-audit/db1509e7-7399-4d62-8322-a1663e40a614/audit.json` passes14 observations/five pins, SHA256 `cb2b47b065313e8295a0d8e4e08428245ba1f00b358c78365b5f68b9d55c36cc`; its scope remains source inspection and post-validation preservation, separate from the new native spike.

This resolves the extra host primary-marker restriction and qualifies complete original catalog projection for the captured installer-only subset. Original ontology associations still require authenticated owner-issued physical relationship bindings with exact source provenance. Synthetic operation artifacts, trusted installer identity, absent binding/default JSON homes and rollback-only provisional revision are explicit premises. Accepted owner/binding/current-cut authority, canonical key buckets, complete mutation/callable closure, protected semantic bodies and final publication/drain remain open. US-056-AC1/AC2/AC10 gain component evidence; no whole criterion or backend profile is promoted. Historical acceptance remains26/132.

Astra ultra independently audited final31 native observations and all697 current/preimage source hashes with no remaining blocker. Review was read-only, with no native execution; the qualification remains provisional installer staging with rollback.

Catalog-stage source preimages are retained as byte-exact `preimages.zip` bundles next to each receipt. The producer checks every entry against the captured bytes before execution; independent hash verification checks all entries against the receipt source inventory. This compact representation replaces duplicated dependency trees without changing original receipts or source bytes. The earlier58932dc5 run precedes only this archive representation change.

## Ontology association storage binding implementation gate — 2026-10-10

`docs/helix/02-design/contracts/security-association-binding.proposal.md` specifies original ontology/core/binding provenance, explicit binary edge roles, ordered target-key correspondence, physical compatibility, complete source coverage and acceptance-linked positive/negative tests. Current Truss accepted-binding vocabulary covers storage keys only. A new relationship interpretation must be registered and qualified before native relationship creation; absence of core direction/multiplicity/lifecycle cannot be repaired by silently rewriting the owner document. The next implementation must consume original authenticated artifacts and compiler-owned logical predicates, retain same-witness incidence/attributes, and prove complete mutation/current-authority/publication closure. The31-observation installer-only catalog result does not close these gates or promote26/132.

## Conditional association storage compatibility — 2026-10-10

Formal evidence `docs/helix/04-build/evidence/security/association-storage-compatibility/d31be4c0-393e-4209-b775-e6563ac54c83/proof.json` saves12 independently replayed formulas (four UNSAT/eight SAT), five current/preimage source pins, Z3 4.15.4, SHA256 `0c94557e3b6e55545565d04022a66bf73312f5b30e01bfd19c7470883814ce80`. Quantification over every nonnegative participation count proves that complete preservation excludes an inferred positive minimum or finite maximum, with explicit unrestricted positive and separate restrictive-bound counterexamples. Exact distinct binary role selection preserves the same-witness key/attribute predicate in either physical orientation; assuming ontology array order is native direction has a valid-population counterexample. This is an abstract conditional model. It does not extract SQL/compiler semantics, prove lifecycle compatibility, authenticate owners/cuts, establish complete facts/keys or qualify publication. The initial8-formula run had a tautological count check and is superseded by the quantified model.

Implementation must preserve native unrestricted storage compatibility or require an explicit semantic restriction before choosing bounds. Current Truss native relationship carrier requires bounds/lifecycle/direction, while the retained ontology asserts none. No existing core source is rewritten, and no new accepted-binding vocabulary or native support is claimed by this proposal. Owner-issued role choices, original accepted binding/archive custody, exact independent native definition correspondence and compiler-owned lowering remain required. US-056-AC2/AC10 gain design/component proof obligations; historical26/132 remains unchanged.

Astra identified native `edge_out` endpoint-pair uniqueness as a separate association-instance preservation gate. The final proposal requires an authored key proving endpoint-tuple uniqueness or refusal of this layout. Three additional formulas establish conditional instance injectivity, a valid distinct-endpoint positive and a parallel same-endpoint/different-key counterexample. The nine-formula predecessor lacks this gate. Semantic count laws assume realizability over all nonnegative counts; arbitrary owner domains/keys must be compared independently, and explicit operational resource refusal is separate from semantic restriction. No infinite storage capacity is promised.

Astra ultra independently replayed final12 formulas (four UNSAT/eight SAT), verified all five current/preimage pins and found no remaining blocker within the proposal scope. These remain conditional laws, not native binding admission, SQL/compiler refinement or acceptance promotion.

## Implemented private association correspondence boundary — 2026-10-10

Truss main `fe8a67051a4ecb3c6a0ff10fdd89ab71f3d9a218` implements `packages/python/src/truss/_security_association_binding.py` as a preliminary source-correspondence boundary. It captures exact bounded original core/ontology/binding bytes and returns frozen tuples/bytes, preserving unknown numeric tokens without imposing Decimal or integer ranges. It requires complete association and role mappings, explicit orientation/unrestricted independent storage choices, exact ordered association/target-key references and an authored association key contained in endpoint Fields. Separate instance IDs and attribute-dependent keys refuse the endpoint-pair edge layout. Higher arity, non-string endpoint profiles, changed source digests/revisions, missing/defaulted metadata and duplicate mappings refuse.

Truss evidence `docs/helix/04-build/evidence/security-association-binding/b332851f-fc2d-4489-b737-536aa90bfe84/tests.json` passes39 tests under Python3.11.17, six current/preimage pins, SHA256 `d81a4d95a527948dda63e3e08fa76817a8e8a762818ab2b5bcb7603c01ca44b8`. Tests retain original fixture bytes, both explicit orientations, composite-order positives and independent reversals, endpoint-key subset positives, parallel-instance loss, duplicate/omitted mappings, Unicode/depth/byte boundaries, unknown fractions and extreme exponents/5000-digit integer tokens. Python module boundaries pass245 imports. Astra ultra verified all six pins,39 names against AST/log and the boundary result; it reviewed the corrected implementation with no remaining blocker. It did not rerun the suite or execute native operations.

This checks source correspondence only. Genuine UMF/ontology owner semantic validation, authenticated original artifact/cut and archive revision/pointer authority, registered relationship interpretation, actual catalog/namespace/key/incidence observations, original Weft lowering and complete protected mutation/publication remain independent required gates. The output dataclass is not an admission capability; no database effects/public exports or installed-wheel/backend qualification follow. The mapping carrier is a private candidate, not a newly accepted native vocabulary. US-056-AC1/AC2/AC10 gain preliminary component evidence, not completed criteria; historical26/132 remains unchanged.
