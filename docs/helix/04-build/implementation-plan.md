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
---

# UMF Implementation Plan

## Scope

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
claim, not permission to drop the other three binding tasks. Experimental model
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
has passed acceptance with the experimental 0.3.0 envelope, typed authoring,
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
Parquet Nullability is ready;
every later concept remains behind the Nullability delivery gate. Existing untracked bootstrap implementation/evidence must
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

## Execution Evidence: experimental Smithy JavaScript assembler (2026-09-20)

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
is separate experimental evidence; the public library's existing 159-test/43-browser
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

US-019-AC12 advances typed decoding with an experimental schema-driven physical assembly
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
An experimental finalizer fixes document completion only. Namespace inclusion
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

Added an explicit experimental literal serializer over the pinned parser. It fixes
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
