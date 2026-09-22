---
ddx:
  id: TP-001
  type: test-plan
  activity: test
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.prd
      kind: informed_by
    - id: umf.cross-cutting-requirements
      kind: informed_by
    - id: umf.architecture
      kind: informed_by
    - id: CONTRACT-040
      kind: informed_by
    - id: FEAT-005
      kind: informed_by
---

# UMF Test Plan

## Core ideal amendment: planned acceptance gates

CONTRACT-040 and US-040–US-044 govern the next core expansion. These tests are
required work, not part of the recorded scalar-family/native baseline. Run one
concept at a time in field → nullability → cardinality → facets → key order.

- Structural/core tests cover authored assertions, classified observations,
  conflicts, exact numeric bounds, unknown labels, old-member collisions and
  migration/rollback without lost native content (each story AC1/2/10).
- Five native binding matrices exercise strict blocks and report residuals for
  every non-exact outcome (AC3/4). Native-only reimports cannot invent author intent.
- Both round trips are independent gates: ideal → native → ideal restores the
  assertion or explicit residual (AC5); native → ideal → native restores untouched
  source text/bytes outside the ideal claim, including unknown details (AC6).
- Keep permanent negative oracles: SQL Server filtered/disabled unique indexes
  admit duplicates outside their enforcement scope, and binary64
  1.0000000000000002 narrows to binary32 1.0. Existing oracle artifacts are
  fixtures/sqlserver/indexes-oracle.json, index-projection-oracle.json and
  fixtures/avro/tablespec-oracle.json. Replay relevant native scripts and add new
  ideal-binding assertions; old native evidence alone does not pass the new story.
- Add present-null versus omitted-member cases, TableSpec contextual/schema/runtime
  disagreement, Parquet optional ancestors/LIST/MAP duplicates, SQL array bounds,
  Unicode-scalar versus UTF-16 length and decimal-rounding cases (AC7).
- Bun and real Chromium reproduce schemas, diagnostics, residuals, source recovery
  and copy isolation with no host globals or external requests (AC8).
- Publish three distinct claims: >=2-system ideal admission, completed all-five
  priority delivery, and any later separately proven native equivalence (AC9).
  A blocked mapping with retained residual may satisfy its explicit refusal case;
  it cannot be counted as native support for enforcing the ideal.

## Testing Strategy

TableSpec table-edit checks must cover monolithic/split export, namespace refresh,
explicit primary-key/context reference repair, retained original source and attached
core metadata. Table-only edits must leave column/sidecar files byte-identical and
preserve any shadowed inline columns in table.yaml. Native model/loader checks must
distinguish valid repairs, invalid unrepaired references and preserved rejection of
unknown table fields. Chromium reproduces edits and both UMF recovery formats.

Parquet→Avro must report decoded embedded Arrow refinements separately and block
ambiguous/malformed embedded declarations. Compare stored-schema and physical-only
fixtures whose target Avro schemas agree despite different duration/list/timezone
semantics. Native codec checks may use an explicitly authored carrier binding but
must not infer source equivalence from equal output bytes. Verify composed TableSpec
loss retention and browser rejection/recovery parity.

US-015-AC12 executes edited PostgreSQL DDL in four fresh PostgreSQL 17.4 databases.
Compare candidate and reconstructed catalogs against independently authored expected
DDL, and verify changed defaults, type bounds, nullability, checks, filtered uniqueness
and comments with SQLSTATE-qualified rejection probes. Bind current generated SQL,
input fixtures and snapshot query to native evidence fingerprints. Chromium must replay
the same AST edits and recover both SQL and fresh catalog captures. Do not count this
as in-place migration or automatic synchronization of catalog-node edits.

US-019-AC23 verifies coordinated physical/embedded Arrow renames across nested structs,
large lists, durations and timezone timestamps, with NONE/SNAPPY/GZIP and multiple row
groups. Native Thrift must limit footer changes to selected names/paths and embedded
Arrow bytes; PyArrow must verify schema metadata, page checksums, values and inverse
recovery. Keep old-name references in unrelated metadata and report them. Browser
outputs must match native-tested hashes through both UMF formats and inverse edits.
Invalid field correspondence or policy must expose no partial output.

Nested correspondence tests must traverse interpreted LIST/MAP roles rather than
guessing wrapper names. Cover list-of-struct and map-value fields, null/empty values,
duplicate map keys, distinct Arrow/Parquet element labels and exact inverse restoration.
Compare native schema trees directly so the oracle does not normalize Map entry names
while constructing an expected type. Raw IPC role-label probes must retain the PyArrow
key/value normalization counterexamples and keep those operations blocked.

US-019-AC22 compares embedded Arrow schema observations with PyArrow 21.0.0 and both
UMF formats. Exercise absent/duplicate metadata, missing values, canonical base64,
modern/legacy prefixes, truncation/trailing content and body-bearing schema rejection.
Require full source preservation and native schema/metadata equality after detached
re-encoding and field rename. Browser output must match Bun. Compare stored-schema
and physical-only reading to expose large-list, duration and timezone differences;
do not mistake extraction or equal field names for proven schema correspondence.

PostgreSQL AST/catalog edits must reject unknown tagged representation content before
replacement, including root and automatic state changes. The preservation regression
covers payload/root/leaf/state locations, disjoint edits, unchanged originals, native
unknown-member retention and both UMF recoveries in Bun and Chromium. Native syntax
edit/deparse and catalog state regressions must continue to pass. This does not prove
that edited catalog observations reconstruct into a live database.

US-007-AC9 tests explicit Avro candidate edits separately from conservative edits.
Validate the proposal schema, retained original, exact replacement, synchronized
core metadata, unknown-content preservation and blocked reassociation/representation
loss. Test root and dependency edits through both UMF formats and Chromium. Native
codecs must measure decimal interpretation and exact reader-default changes, rather
than treating equal bytes as equal meaning. The candidate-edit oracle records local
timestamp differences and fingerprints its input. Candidates do not certify schema
compatibility or implement a row migration.

Projection boundary regressions must distinguish omitted decimal scale from explicit
null/boolean/string/container values, require exact temporal logical-type strings,
and reject trailing LF/CR/U+2028/U+2029 in generated identifiers. Compare runtime
guards with published policy schemas across the five priority projection directions,
including blocked composed policies. Run projection-boundaries.test.ts,
projection-boundaries-browser.ts and avro-decimal-boundary-oracle.py; native parser
coercion is recorded as a counterexample, not accepted as portable validity.

CONTRACT-039 tests composed PostgreSQL/SQL Server/Parquet→Avro→TableSpec projections.
Assert exact retention of both stage issue lists and source contexts, source-path
qualification, no final target after either blocked stage, upfront policy validation,
copy isolation and unknown vocabulary retention. Native Pydantic checks validate
four outputs/eight recoveries; Chromium covers both formats and stage-blocking
boundaries. Original stage-native evidence does not imply composed row equivalence.

CONTRACT-038 adds Avro→TableSpec schema tests, native model validation and a limited
reverse carrier cycle. Cover explicit representations, namespace dependencies,
unions/defaults, invalid decimal capacity, unsupported widths, source retention and
strict blocking. Native codecs compare both recovered values and bytes; float-width
counterexamples and ignored local-timestamp warnings must remain visible. Chromium
checks both UMF formats and reverse projection. Commands and interpretation limits
are recorded in CONTRACT-038; no general TableSpec row/pipeline execution is claimed.

CONTRACT-037 adds SQL Server generated-DDL conformance. Its native oracle executes
three generated schemas and compares captured columns/constraints plus enforcement
behavior against source databases. DDL tests verify source/query/output fingerprints,
declared alias/system-name normalization and measured persistence/storage losses.
Chromium checks both UMF formats, no partial SQL under strict policy and candidate
generation. Commands and limits are in CONTRACT-037. Three candidates now have
native execution/recapture evidence for six copied edits: length, description,
default, check predicate, filtered predicate and nullability. Verify changed runtime
behavior, original-source isolation, retained unknown vocabulary and re-ingestion
of each fresh capture through both UMF formats in Bun and Chromium.

SQL Server v3 index evidence (CONTRACT-031/032, US-031 AC7) combines native authored
DDL/capture/enforcement checks with both UMF recoveries, browser metadata/edit parity
and explicit Avro projection losses. `bun test tests/sqlserver` covers older-profile
availability, unknown content and malformed observations. Run
`bun scripts/sqlserver-indexes-oracle.ts`,
`bun scripts/sqlserver-indexes-browser.ts` with Chromium configured, and
`.venv/bin/python scripts/sqlserver-index-projection-oracle.py` for independent
evidence. Native filtered/disabled uniqueness counterexamples constrain ideal key bindings
and native-equivalence claims; they do not prohibit an author-defined core key;
no arbitrary DDL reconstruction is claimed.

CONTRACT-036 adds the authored FR-41 mixed TableSpec/OpenAPI/DDD consumer
demonstration. Run `bun test tests/consumers/orders.test.ts` for both UMF formats,
unknown vocabulary, native recovery, metadata edits, exact-key rename/validation
and enforcement counterexamples. `bun scripts/orders-consumers-browser.ts` checks
real SVG/form/documentation rendering and local row conversion in Chromium.
Independent Python source/target scripts and scoped evidence are listed in the
contract; no service delivery or DDD invariant execution is claimed.

`bun run test:schemas` audits the distributed package and schema inventory before
native conformance execution. It validates manifests through one registry, compares
embedded/standalone payload schemas, checks local evidence paths, and compiles all
published schemas with their declared Draft 2020-12, 2019-09 or Draft-04 compiler.
Missing evidence, duplicate registrations, unsupported dialects, invalid schemas and
unresolved references fail the gate. Results are stored in
`fixtures/extension-package-audit.json` and `fixtures/json-schema-audit.json`.
This proves packaging/reference consistency only; file existence does not prove
executed evidence, native conformance or completion of the required system inventory.

Prove declared native fidelity, expose every known cross-system limitation,
and prevent regressions in unknown-content preservation. The first executable
scope is JSON Schema + Protobuf and the directed JSON Schema-to-Protobuf
projection (FR-37). Wider ecosystems expand the same strategy when selected.

Sources: [PRD](../01-frame/prd.md), [cross-cutting constraints](../01-frame/cross-cutting-requirements.md),
[architecture](../02-design/architecture.md), and the owner's bootstrap brief.
This is the project verification strategy. Core-envelope tests and a synthetic
fixture now exist under US-001, with scoped Bun/Chromium evidence in the build
plan. Native adapter fixtures and native compatibility results remain unimplemented.

Out of scope for the first slice: all ecosystem versions, lexical identity unless
explicitly claimed, general ontology inference, production runtime execution,
and a claim that every pair of systems can translate losslessly.

### Test Levels

| Level | Coverage Target | Priority |
| --- | --- | --- |
| Contract | Every selected document, registry, adapter, capability, and diagnostic boundary, including invalid inputs | P0 |
| Integration | Native parser/importer/model/exporter/serializer paths and vocabulary validation | P0 |
| Unit | Identity, reference, preservation, classification, and normalization rules with negative cases | P0 for in-scope rules |
| End-to-end | Native round trips, cross-system projection/reporting, and unattended offline workflows | P0 |
| Regression | Every discovered semantic loss, authority conflict, and security/resource-limit defect | P0 |

### Frameworks

TypeScript compiled to JavaScript is the default implementation direction.
Use Bun's test runner by default under ADR-002, with separate type checking and
actual-browser tests. Libraries, browser and Bun/toolchain versions remain unpinned.
Use pinned native tools, not invented parsers, for independent interpretation.
Candidates include a dialect-conforming JSON Schema validator and Google's
Protobuf compiler/descriptor APIs. Bowtie can provide an additional JSON Schema
implementation comparison; it is a candidate aid, not the sole oracle.

### Browser execution

P0: run the packaged library in an actual browser with supplied fixtures and
references, without a Node.js runtime or transformation server. Exercise native
JSON Schema and Protobuf import, validation, export, edited-model round trips,
unknown-content retention, and cross-system projection with fidelity diagnostics.
Require equivalent semantic outputs and diagnostics for the same declared inputs
in browser and CLI runs. A successful bundle build alone is insufficient.
Record browser and dependency versions. Native compiler oracles may run separately
in the harness, checking the browser-produced outputs independently. Apply these
checks to each subsequent extension before claiming browser support.

### DDD vocabulary and projections

FR-40 is the early extension gate after the initial JSON Schema/Protobuf slice.
Use a versioned UMF-authored DDD profile until a concrete external DDD tool format
is selected; do not claim a universal native DDD file format or oracle.

| Case class | Required evidence |
| --- | --- |
| Sales domain | Order root, OrderLine and ShippingAddress members, Money value object, identity/equality and invariant scopes retained through read/edit/write |
| Context independence | `sales.Customer`, `support.Customer`, `billing.AccountHolder` remain distinct; identical structures and names never cause implicit merges |
| Context map | Explicit directional/partial mapping; reject inferred reverse equivalence; preserve anti-corruption-layer intent and context terminology |
| Domain declarations | Domain service, repository and OrderPlaced event survive; no implicit endpoint, persistence or messaging implementation |
| Invalid mutations | Unresolved members/context references, invalid identity/root declarations and changed invariant scope fail the declared profile's semantic checks |
| Partial understanding | Unknown extension fields and opaque invariant expressions survive; uninterpreted expressions never count as enforced rules |
| Physical projections | Explicit document, SQL, OpenAPI, Axon and Palantir bindings tested when each target exists; validate target independently and account for unexpressed aggregate/consistency semantics |
| Recovery | Original versus retained-source recovery checked separately from target-only reimport; no lossless-return claim when the target lacks DDD meaning |

Use reviewed expected semantic models plus meaningful mutations independently of
the DDD adapter. Add external native-tool oracles per concrete format. Run DDD
access/edit/projection cases in Bun and a browser. This gate supplements FR-37;
it does not expand SPIKE-001's timebox or claim all later target adapters exist.

### Metadata consumers and evolving shapes

FR-41 requires one mixed table/service/DDD model to drive seven demonstrators:
an authored transform, data visualization, generated pipeline, generated validator,
dynamic form metadata, AI-agent context, and human-readable documentation. Compare
each output with explicit expected metadata and source references. Check field
selection, context/identity, relationships, constraints, provenance, and reference
closure or declared external dependencies. Run generated validators on positive
and negative data; check generated pipeline definitions with their target tooling
where available, without claiming UMF executes the business pipeline.

Introduce a new synthetic storage/compute vocabulary after establishing the
baseline. Older consumers must retain unknown data and report interpretation
limits while still using understood content. Test incomplete shapes, declared
versus inferred metadata, conflicting representations, unsafe edits and dangling
references. Require zero invented agent facts or enforcement claims in the
expected outputs. No live AI provider or full application UI is required to
verify the extracted-context and form-metadata contracts.

### Native Round-Trip Oracle

For every native fixture x and declared system/version S:

1. Independently parse or compile x to native model A.
2. Import x to UMF, then export back to native representation y.
3. Independently parse or compile y to native model B with the same declared
   dependencies and semantics.
4. Assert `A ≡S B`, check the export is valid, and verify fidelity claims agree.

Lexical fidelity compares source bytes and is optional. Structural fidelity
compares native syntax/schema structure under explicit normalization rules.
Semantic fidelity compares native meaning and is mandatory for a supported claim.
Comments, layout, and ordering may be ignored only when they are nonsemantic
for that native context and are outside any lexical guarantee.

The oracle must detect deliberately altered native constructs. A self-consistent
importer/exporter bug, syntax-only success, or serialized UMF snapshot cannot
substitute for native semantic evidence.

### JSON Schema Oracle

Pin dialect, validator version/configuration, vocabularies, and reference resources.
For each upstream schema and associated instances, compare native validation
outcomes before and after round trip and with upstream expected outcomes.
Pin optional behavior explicitly, including format-related behavior where applicable.

Add preservation checks for annotations, defaults, custom keywords, declared
vocabularies, resource identities, and references; boolean validation outcomes
alone cannot prove these survive. Exercise composition, conditionals, recursive
references, and other dialect-specific constructs only under their declared
scope, recording exclusions rather than relabeling them as passes.

Compare preserved native structures where appropriate and test edited UMF content
to ensure it is actually reflected in output. Keep a list of permissible
structural differences; no blanket “normalization” may erase native constraints.
Agreement on a finite test corpus is evidence, not a proof of universal equivalence.

The upstream suite is a native **instance-validation** suite, not an UMF
round-trip suite. The harness must supply the import/export path and preservation
assertions. See [source notes](../00-discover/interoperability-sources.md).

### Protobuf Oracle

Compile original and emitted schemas with a pinned native compiler and dependency
set. Compare descriptors using a documented normalization profile, then exercise
native behavior for distinctions not sufficiently covered by that profile.

Feature cases include field numbers/types, presence, defaults where supported,
repeated fields, maps, oneof alternatives, enum aliases, nested definitions,
imports, reserved names/numbers, options/custom options, and service definitions
within the declared language version. Explicitly distinguish proto2, proto3,
and Editions support; do not imply coverage for all three from one corpus.

Do not strip options, presence, reserved declarations, or meaningful ordering
to make descriptor comparisons pass. Source-location metadata may be excluded
only under a documented non-lexical policy. Unknown options/native extension
mechanisms require preservation evidence even when not interpreted by UMF.

### Cross-System Projection Oracle

For `S → UMF → T`, compare expected source-concept outcomes with emitted target
semantics, native target validity, retained UMF source content, and diagnostics.
Expected outcomes cover preservation, equivalent mapping, approximation,
preserved-but-inexpressible meaning, incompatibility, and unsupported constructs.
Retained-in-UMF and emitted-to-target are separate observations.

For `S → UMF → T → UMF`, compare the reimported target against the expected
projection, not an assumption of full source recovery. Also demonstrate return
to S using retained source UMF, and report which information was unavailable
from T alone. Never merge retained source content into the target-only test
and present that as target expressibility.

First projection cases should pressure-test numeric ranges, required/presence
and nullability, defaults, alternatives/unions, and constraints with no target
equivalent. Valid target syntax without disclosed source losses is failure.

## Test Data

| Type | Strategy |
| --- | --- |
| Native upstream | Pin upstream revision, dialect, license, and associated expected results; retain required reference dependencies |
| Representative schemas | Include nontrivial multi-definition and cross-file examples with native escape hatches |
| Edge cases | Unknown extensions/fields, conflicts, references, identities, boundary values, partial understanding, and migrations |
| Negative mutations | Change one native semantic distinction and verify the oracle fails |
| Generated/property cases | Exercise preservation and determinism across variations; supplement rather than replace native corpora |
| Adversarial cases | Cyclic/expanding references, excessive nesting, unsafe tags/code-like values, network traversal, and explicit limits |
| Legacy baseline | Inspect existing TableSpec UMF schemas; test unchanged acceptance or deterministic migrations |
| Mocks | Use only for environmental failure boundaries; native semantic oracles must use real native tooling |

Every fixture records provenance, native versions, exercised concepts, expected
fidelity, and any redistribution constraints. A support claim requires positive
and meaningful negative evidence. Unknown, skipped, and unsupported outcomes
remain visible separately from failed or passed tests.

## Coverage Requirements

| Metric | Target / Minimum | Enforcement |
| --- | --- | --- |
| Declared supported native cases | 100% / 100% pass | Block that support claim on any failure |
| In-scope semantic acceptance criteria | 100% / 100% exercising test coverage | Block milestone completion for missing, failing, or uncited coverage |
| Known mismatch detection | 100% / 100% of expected mismatches reported | Block projection fidelity claim |
| Unknown-content retention | 100% / 100% applicable preservation cases | Block parse-edit-write claim |
| Evidence traceability | 100% / 100% published compatibility entries tied to versioned results | Reject unsupported marketing claims |
| Code coverage | Not selected before code exists | Select risk-based thresholds later; line coverage never substitutes for semantic tests |

### Critical Paths (P0)

1. Register versions and validate structure without conflating semantic validity.
2. Rewrite understood content without unauthorized unknown-content loss.
3. JSON Schema native round trip with upstream and preservation evidence.
4. Protobuf native round trip with descriptor and behavioral evidence.
5. JSON Schema-to-Protobuf projection with correct target output and diagnostics.
6. Safe refusal/incomplete outcomes for unsafe partial understanding and limits.
7. Reproducible offline reruns using declared versions and dependencies.
8. Actual-browser execution and semantic parity with Bun (FR-39).
9. Early DDD profile round trips, context independence and projection limits (FR-40).
10. All seven metadata consumer demonstrations, including partial understanding (FR-41).

### Secondary Paths (P1-P2)

No original product obligation is downgraded. Self-description, independent
multi-language implementations, later ecosystem matrices, and production-scale
benchmarks are later-phase verification, not waived requirements.

## Acceptance Criteria Layer Allocation

FEAT-001, US-001 and TD-001 cover the first core-envelope slice. Other feature
and story specifications and story test plans remain to derive. This table
allocates **requirement classes**, not completed story coverage. Before build
completion, each selected `US-<n>-AC<m>` must receive one primary layer and
concrete tests in its story test plan; exercising tests cite `@covers US-<n>-AC<m>`.

| Requirement Class | Sources | Primary Layer | Story Test Plans |
| --- | --- | --- | --- |
| Core and multiple representations | FR-2, FR-3, FR-20, FR-21, FR-28, FR-35 | Integration | To derive; self-description later |
| Extensions and partial participation | FR-4, FR-5, FR-22, FR-27, FR-31, FR-34 | Contract | To derive |
| Native interchange and consumers | FR-1, FR-6, FR-26, FR-29, FR-30, FR-33, FR-36, FR-38 | End-to-end | To derive; later consumers remain explicit |
| Projection, fidelity, and provenance | FR-7, FR-8, FR-9, FR-10, FR-24, FR-25 | End-to-end | To derive |
| Identity, composition, and evolution | FR-15, FR-16, FR-17, FR-18, FR-19 | Integration | To derive |
| Validation and evidence | FR-11, FR-12, FR-13, FR-14, FR-23, FR-32, FR-37 | Integration | To derive |
| Browser execution | FR-39 | End-to-end | To derive; actual-browser artifact execution |
| DDD vocabulary and mappings | FR-40 | Integration | To derive; early extension, target projections follow target readiness |
| Programmatic metadata consumers | FR-41 | End-to-end | To derive; all seven consumer classes and unknown future vocabulary |

Cross-cutting allocation below covers every NFR. Review/evidence checks are
appropriate for legal/specification boundaries; they must not be reported as
runtime tests. Applicable first-slice constraints remain binding even when
broader ecosystem demonstrations happen later.

| Constraint Class | Sources | Primary Verification |
| --- | --- | --- |
| Compatibility, preservation, native distinctions | NFR-1, NFR-2, NFR-3, NFR-23, NFR-24, NFR-25, NFR-31, NFR-40, NFR-44 | Native integration and preservation regressions |
| Identity, composition, authority | NFR-5, NFR-6, NFR-7, NFR-8, NFR-9, NFR-10, NFR-34, NFR-41, NFR-42, NFR-43 | Contract/integration cases plus core-promotion evidence review |
| Reproducibility and portability | NFR-4, NFR-11, NFR-12, NFR-13, NFR-14, NFR-26, NFR-27, NFR-45, NFR-47 | Fresh-environment, offline, and independent-implementation comparisons |
| Bounded and secure processing | NFR-15, NFR-16, NFR-17, NFR-18, NFR-19, NFR-32, NFR-33, NFR-46 | Adversarial, incremental, resource-limit, and minimal-participation tests |
| Diagnostics and specification authority | NFR-20, NFR-21, NFR-22, NFR-38, NFR-39 | Contract failures and semantic-claim evidence audit |
| Review and tool composition | NFR-28, NFR-29, NFR-30, NFR-35, NFR-36, NFR-37 | Diff/merge checks, inspectability review, and unattended multi-tool workflows |
| Ecosystem durability and boundary | NFR-48, NFR-49, NFR-50 | Independent recovery demonstration, license review, architecture scope review |

## Implementation Order

This sequence concerns test development, not authorization to implement now.

1. Pin native scopes, fixture sources, and baseline oracle outcomes before adapters.
2. Write registry, serialization-preservation, validation-layer, and unsafe-input cases.
3. Establish failing native round-trip tests and oracle mutation checks independently.
4. Exercise JSON Schema and Protobuf through their UMF paths.
5. Add the directed cross-system projection and target-only reimport comparisons.
6. Generate the compatibility matrix from results and add every defect as regression evidence.
7. Add the early DDD profile and its domain/context-preservation cases.
8. Exercise FR-41 consumer reuse and a new unknown vocabulary.
9. Expand only after the next ecosystem's native fidelity boundary is declared.

## Infrastructure

Tests run locally and on an automated worker with pinned runtime, compiler,
validator, fixture revision, and configuration. TypeScript and Bun are the default
toolchain; browser automation tooling, worker provider and exact versions remain
open. The first slice requires no database
or cloud service. Package reference resources locally for offline checks;
network-denied runs must expose accidental remote dependencies.

Collect original and emitted native schemas, descriptors or validation vectors,
UMF artifacts, fidelity/provenance results, version manifests, failures, resource
limit outcomes, and exclusions. Keep fixture licensing information with evidence.

## Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Finite tests are presented as universal equivalence proof | False support claims | Publish scope, oracle limitations, fixture provenance, and untested constructs |
| Descriptor normalization strips real meaning | False round-trip pass | Review every excluded field and use semantic mutation tests |
| Upstream validator behavior differs | Unstable oracle | Pin dialect/options and compare native expectations; investigate disagreements |
| Network or ambient state changes results | Flaky tests | Package dependencies and rerun offline with explicit manifests |
| Large corpora slow feedback | Slow iteration | Split focused regressions from complete conformance runs without weakening claim gates |
| Legacy fixtures or licenses unavailable | Unsupported migration/corpus claims | Keep those claims blocked until source evidence is obtained |

Known gaps: no story-level matrix, exact contracts, pinned executables, fixture
manifest, numeric resource budgets, or runnable commands yet. These are recorded
gaps, not accepted exemptions from product requirements.

## Build Handoff

Next: execute the bounded [SPIKE-001](../02-design/spikes/SPIKE-001-jsonschema-protobuf.md)
after its prerequisites are resolved, then define exact contracts and story-level
test coverage. Runnable commands must be added once a runner exists; none are
invented here.

The first-slice completion gate is: declared supported native cases pass;
unknown content survives; target output validates; every known mismatch is
reported; versions and evidence are reproducible; and excluded features remain
visible. A spike result does not imply production readiness or full-format support.

## Review Checklist

- [x] Native and cross-system oracles are distinct.
- [x] Finite validation evidence is not described as universal equivalence proof.
- [x] All 41 functional and 50 cross-cutting requirements have class-level allocation.
- [x] Real corpora, negative cases, unknown-content preservation, and resource safety are included.
- [ ] Pin browser/toolchain and native versions, runner, and redistribution-safe fixtures.
- [ ] Derive story test plans with stable acceptance IDs and concrete tests.
- [ ] Implement and run tests; add reproducible commands and evidence.

## Executed Profile Addendum (2026-09-20)

The bootstrap gaps and unchecked handoff checklist above describe the original
planning baseline. Scoped runnable evidence now exists; it does not close the full
inventory or imply production readiness. See the implementation plan's execution
sections for successive profiles and retained limitations. Current commands are
`bun run typecheck`, `bun run test:conformance` and `bun run test:browser`, with pinned
native prerequisites documented in the root README and fixture READMEs.

Avro CONTRACT-007 / US-007 adds `tests/avro/native.test.ts` for AC1–AC3,
`scripts/avro-oracle.py` for AC4 and `scripts/browser.ts` for AC5. The oracle checks
full native metadata separately from binary behavior and preserves disagreements.
The current gate passes 97 Bun tests / 1,635 assertions, the existing independent
JSON Schema gate, 21 Avro oracle checks and 18 Chromium checks. Upstream Avro corpus
coverage and cross-system transforms remain open; current authored cases cannot
serve as a full Avro conformance claim.

Avro dependency coverage now adds US-007-AC7/AC8 in `tests/avro/bundle.test.ts`
and `scripts/avro-dependency-oracle.py`: isolated ordered name registries, source
retention, explicit export requirements, atomic edits and independently enforced
changed field types. The complete command passes 100 tests / 1,718 assertions and
all native oracle gates. Actual Chromium passes 19 checks. Standalone-schema and
explicit-dependency evidence remain distinct support profiles.

Avro document projection adds US-008-AC1–AC5, the complete result contract and
independent instance/fidelity checks. The current full gate passes 103 Bun tests /
1,787 assertions and all native oracles; actual Chromium passes 20 checks. Official
corpus projection checks target compilability separately from the five authored
mapped-instance comparisons. Nineteen standalone schemas project; unresolved
ApplicationEvent remains blocked without its explicit dependency bundle.

GraphQL SDL CONTRACT-009 / US-009 adds source/AST round trips, invalid native models,
exact numeric literals, atomic edits and actual default behavior. GraphQL-core 3.2.12
supplies a separate-runtime check with shared GraphQL.js lineage disclosed. Current
full gates pass 107 Bun tests / 1,815 assertions, all native oracles and 21 actual
Chromium checks. Official corpus and GraphQL projection evidence remain open.

GraphQL US-009-AC7/AC8 now add pinned upstream schema and grammar coverage plus
explicit fragment mode. The complete conformance command passes 109 Bun tests /
2,011 assertions and all native gates. GraphQL-core confirms all 552 introspected
types and detects an output-type mutation; its one directive-extension grammar
mismatch is pinned, not suppressed. Chromium passes 22 checks, including incomplete
fragment preservation. Dynamic parser-input exclusions remain visible in the corpus.

GraphQL US-010 adds input-document projection with thirteen independent coercion/
validation comparisons, three missing-report negative controls and nine comparisons
for three pinned upstream input types. Current full gates pass 112 Bun tests / 2,051
assertions and all native oracles; actual Chromium passes 23 checks. Default insertion,
list coercion and ID normalization remain reported differences, not target behavior.

OpenAPI US-011 adds native JSON/YAML preservation, candidate edits, exact numbers and
12 independently checked official-object-schema cases. A shared-core regression proves
identical exact-JSON definitions across JSON Schema/Avro/OpenAPI. The complete gate
passes 117 Bun tests / 2,099 assertions and all native oracles; actual Chromium passes
24 checks. Embedded-schema and reference interpretation remain explicitly incomplete.

OpenAPI US-011-AC6/AC7 adds all 46 official example files, 38 complete-description
round trips and eight independent legacy structure cases. The native corpus oracle
preserves timestamp strings explicitly. Current full gates pass 119 Bun tests /
2,355 assertions and all native oracles; actual Chromium passes 25 checks. Referenced
fragments and semantic/reference/runtime validation gaps remain separately recorded.

OpenAPI resource bundles add US-011-AC8/AC9: exact source/URI retention, root-export
loss prevention, copied lookup, candidate edits and explicit scope failures. Two
five-document native variants retain all eight fragments; Python checks 11 supplied
references per variant and an edited-type behavior change. Current full gates pass
121 Bun tests / 2,398 assertions and all native oracles; Chromium passes 26 checks.
Literal pointer lookup is not credited as general OpenAPI/JSON Schema resolution.

OpenAPI embedded schema syntax adds US-011-AC10/AC11 with known/unknown dialect
boundaries, literal-data exclusions, 3.2 media/encoding positions and XML vocabulary
checks. Independent official meta-schemas verify nine known cases plus two 3.2 cases;
unknown dialects remain explicit exclusions. Current full gates pass 123 Bun tests /
2,418 assertions and all native oracles; actual Chromium passes 27 checks. No instance
or schema-reference resolution credit is assigned to meta-schema validation.


OpenAPI typed Reference Objects add US-011-AC12/AC13/AC14: two-hop resolution,
annotation precedence, copied targets, result-schema validation, seven declared roles
and explicit failures for cycles, missing resources, role mismatch and unsupported
scope. Python independently resolves the chain and validates each target role against
unmodified official schemas. Full gates pass 126 Bun tests / 2,448 assertions and all
native oracles; actual Chromium passes 28 checks. Source-role inference, nested
references and Schema Object scope remain outside this evidence.


US-011-AC15/AC16 verify contextual Schema Object extraction: exact unsafe numbers,
source/reference retention, copied tree access, complete result-schema validation,
dialect provenance and unsupported-selection failures. Full gates pass 128 Bun tests /
2,466 assertions, existing native oracles and 29 Chromium checks. Extraction evidence
does not establish reference closure, standalone schema evaluation or HTTP behavior.


US-011-AC17/AC18 add static schema identity/anchor/pointer resolution, retrieval aliases,
OpenAPI document identity and negative controls for ambiguity, unknown dialects and
non-schema targets. Both result schemas validate emitted objects. Python referencing
independently agrees on four JSON Schema resolutions; authored tests separately cover
OpenAPI source-role discovery and `$self`. Full gates pass 130 Bun tests / 2,493
assertions, native oracles and 30 Chromium checks. Dynamic evaluation remains unproved.


US-012 covers static OpenAPI schema projection and complete result-schema validation.
The authored recursive/external-schema model supplies ten independent instance cases
before/after target UMF round trip; all six official Tic Tac Toe components add twelve
comparisons. Missing annotation/API/identity reports each fail a negative control.
Unknown assertions, dynamic keywords and unavailable compilation block output. Full
gates pass 134 Bun tests / 2,537 assertions, native oracles and 31 Chromium checks.
These establish static JSON constraints, not HTTP or dynamic-reference evaluation.


US-011-AC19/AC20 verify explicit dynamic-scope target selection, complete result-schema
validation, ordinary-anchor/pointer fallbacks and invalid context rejection. Python
referencing independently agrees on six targets. Full gates pass 136 Bun tests / 2,567
assertions, native oracles and 32 Chromium checks. No instance-evaluation or dynamic-
projection claim follows from reference-target agreement.


US-013 covers TypeSpec exact multi-file source round trips, syntax/report schemas,
semantic edits, explicit unsupported imports and unknown-representation retention.
The pinned native CLI accepts the exported model and rejects the edited numeric
default with `unassignable`; this is separate-host, same-compiler evidence. Chromium
compiles a supplied bundle and rejects the semantic edit. Full baseline passes 139
Bun tests / 2,590 assertions, native gates and 33 browser checks; strengthened TypeSpec
diagnostic checks pass in a targeted rerun. Type-graph and projection evidence remain
missing and cannot be inferred from source/compiler agreement.


US-013-AC5/AC6 verify selected TypeSpec semantic graphs, schema validation, recursion,
inheritance, operations, exact literals/defaults and blocked invalid selections. Native
filesystem-host inherited-property traversal agrees with the emitted graph; same-
compiler limitations remain explicit. Full gates pass 141 Bun tests / 2,651 assertions,
native oracles and 34 Chromium checks. Graph reimport, arbitrary compiler-state coverage
and cross-system projection are not inferred from these metadata checks.


US-013-AC7/AC8 cover all pinned upstream TypeSpec samples/specs files with hashes,
31 entrypoint outcomes and exact source/diagnostic round trips for 30 syntax-valid
bundles. Two compile; 28 have explicit profile errors; one intentional syntax error is
rejected. A filesystem-host oracle agrees on all outcomes. String-template semantic
metadata also runs in Chromium. Full gates pass 143 Bun tests / 2,888 assertions and
35 browser checks, with missing-library compiler outcomes retained as support gaps.


US-013-AC9/AC10 verify exact TypeSpec library selection, JSON/YAML source-bundle
retention, unavailable-version rejection, compiler-report provenance and selected-
library browser compilation. The four-library upstream profile compiles twenty of
thirty-one entrypoints; native filesystem outcomes/code multisets agree for all thirty
syntax-valid bundles. Full gates pass 145 Bun tests / 2,959 assertions and 36 Chromium
checks. Ten error cases, one intentional syntax failure and absent emitters stay explicit.


US-013-AC11 verifies the expanded official TypeSpec library set and library-owned
configuration. Twenty-nine upstream entrypoints compile; the filesystem host agrees
on all thirty syntax-valid outcomes and diagnostic-code multisets. GraphQL feature
configuration works in Chromium. Full gates pass 146 Bun tests / 3,020 assertions and
37 browser checks. Custom JS, consumer configuration and emitter/projection behavior
remain outside this compilation evidence.

US-013-AC12/AC13 cover TypeSpec native JSON Schema emission, the result JSON Schema,
source-round-trip stability, explicit policy failures and emitted/empty/blocked states.
The official three-file sample matches native filesystem output exactly; seven
independent jsonschema 4.26.0 cases validate observable target behavior. Chromium emits
through the public API. Full verification passes 148 Bun tests / 3,036 assertions, all
native gates and 38 browser checks. Emission is not evidence of an exhaustive semantic
loss inventory or a lossless TypeSpec projection.

US-013-AC14 adds exact numeric emission regressions under both integer strategies.
Twenty-six independent before/after validator comparisons explicitly demonstrate native
literal rounding and omitted scalar constraints while checking a successful bound edit.
Five emission cases / seven files agree with the native filesystem host. The public
browser API retains exact source and discloses the risks. Full validation passes 149
Bun tests / 3,059 assertions, all native gates and 39 Chromium checks. Passing loss
regressions is not evidence that emitted schemas faithfully validate TypeSpec domains.

US-013-AC15/AC16 cover native TypeSpec output materialization into the JSON Schema
adapter, result-schema validation, dependency registration, source retention, target
YAML round trips and strict/invalid-policy blocking. Seven independent native target
checks and Chromium exercise the public path. Verification passes 151 Bun tests /
3,080 assertions, all native gates and 40 browser checks. Emitted target behavior is
verified; full source-domain equivalence remains unproven and explicitly disclaimed.

US-014-AC1–AC4 cover Smithy exact AST round trips, unknown native/representation content,
structural rejection, candidate edits, the complete 63-file pinned loader corpus and
independent JVM model hashes/outcomes/events. Native edit checks distinguish valid
changes from unresolved targets. All 64 comparisons agree; 62 cases assemble alone.
Chromium exercises the public adapter without JVM dependencies. Full verification
passes 154 Bun tests / 3,222 assertions, all native gates and 41 browser checks. These
checks do not establish IDL, full assembly, trait semantics or projection support.

US-014-AC5/AC6 verify dependency IDs/roots through native bundle and UMF JSON/YAML
round trips, candidate edits, malformed/duplicate inputs, unknown representation and
single-file export guards. Ten JVM cases cover augmented upstream contexts, canonical
model agreement, valid edits, missing references and conflicting definitions. Chromium
exercises bundle APIs. Full checks pass 156 Bun tests / 3,238 assertions, all native
gates and 42 browser checks. Native assembly remains an external oracle, not a browser
implementation; the standalone upstream baseline is retained separately.

US-014-AC7–AC9 cover exact Smithy IDL/JSON source archive round trips, candidate edits,
profile separation, path restrictions and explicit unvalidated status. JVM checks
compare all 80 upstream IDL files (78 standalone valid) and an authored bundle with
meaningful/invalid edits. Chromium tests preservation without claiming parsing. Full
gates pass 159 Bun tests / 3,414 assertions and 43 browser checks. SPIKE-002 separately
records a failed TeaVM runtime experiment; it is not a conformance or support result.

SPIKE-002's patched-runtime experiment adds separate evidence: 144 JVM corpus outcome,
event and exact canonical-hash comparisons in Bun and Chromium; three invalid browser
models; exact numeric metadata; no host globals; and 26 JVM compatibility-adapter
comparisons/guards. Type checking passes. A clean `bun run build:smithy-experiment`
reproduces the recorded artifact hash. The unmodified compilation remains a deliberate
failing baseline. These checks do not certify generic-superclass reflection, arbitrary
custom validators, worker isolation or public assembly APIs; all remain separate work.

US-014-AC10/AC11 verify public native assembly contracts, source/input isolation, exact
model numbers, guarded failures and explicit dependency mappings. The real optional
runtime passes 144 JVM corpus comparisons through that API; all 140 accepted models
survive YAML and native reassembly. Two native mixin serialization changes are recorded
separately from stable flattened effective models. Chromium checks the public AST/IDL
path and located native rejection. Verification passes 162 Bun tests / 3,441 assertions,
the full native gate and 44 public browser checks; the updated direct runtime also
passes 144 Chromium/JVM comparisons. Worker/time/resource isolation is not yet covered.

### Smithy worker lifecycle evidence

`tests/smithy/worker.test.ts` verifies pre-abort, active abort, deadline expiry,
malformed response, recovery with a fresh worker, exactly-once termination and blocked
public result/source retention. The browser gate exercises valid/invalid native module
worker assembly. A separate intentionally busy worker verifies cancellation/deadline
and continued page heartbeats; it is lifecycle evidence, not additional native-language
coverage. Chromium 148 passed all 46 public browser checks after this addition.

### Smithy upstream invalid corpus

US-014-AC13 now has 182/182 JVM/public JavaScript outcome comparisons, including
181 diagnostic rejections and one separately recorded native IllegalStateException.
Every blocked result preserves source without a partial model. The focused Smithy
suite passes 14 tests / 927 assertions, including hash and exact-source checks for
every negative fixture. Chromium 148 agrees on all 326 combined native corpus cases,
plus three authored invalid models, exact numeric metadata and absent host globals.
Typechecking passes. The negative oracle is now included in the full conformance gate;
this addition was verified directly, without rerunning unrelated native language oracles.

### Smithy selector evidence

US-014-AC14 uses `scripts/smithy-selector-oracle.ts` in the conformance gate: all 15
upstream selector case files, 90 expected vectors, complete JVM shape sets, UMF source
round trips, public result schemas and three malformed expressions. Chromium 148 runs
all 90 native query comparisons alongside 326 assembler comparisons. Focused contract
tests cover malformed response JSON, unknown fields, duplicate IDs, runtime exceptions,
source retention, and prevention of query invocation after assembly failure. Variable
environments and worker query lifecycle have no implementation/evidence yet.

The selector addition passes typechecking, 16 focused Smithy tests / 946 assertions,
and 47 public Chromium checks. The final shape-ID schema constraint was rechecked
against all 90 native selector vectors and both query contract tests. Other language
native oracles were not rerun for this addition; the expanded scripts are wired into
the full conformance gate for subsequent complete runs.

### Smithy worker selector lifecycle

US-014-AC15 verifies selection request payloads, pre-abort without worker creation,
active cancellation, timeout, exactly-once termination and recovery on a fresh worker.
Public query tests prevent exposing results after cancellation and prevent selection
after assembly cancellation. Chromium 148 passes all 49 public checks: real native
worker selection and invalid-expression rejection, plus a deliberately busy test worker
for selection-stage timeout/abort with continued page heartbeats. The test composes a
normal assembly backend with a busy selector worker to isolate selection-stage behavior;
it is lifecycle evidence, not extra native-language coverage. The completed assembly
report remains available when selection stops. Typechecking passes.

The full Bun suite passes 169 tests / 4,041 assertions after the worker selector change.
Native selector semantics were unchanged; the previous 90-case JVM/Chromium comparison
remains the language evidence, with new browser checks covering worker transport and
lifecycle. The unrelated native conformance oracles were not rerun for this change.

### Smithy native JSON Schema projection

US-014-AC16 retains every upstream converter resource and compares 52 declared data
roots with the unmodified JVM. Forty-two expose targets under allow-reported-loss;
eight native conversion failures and two unresolved recursive-root schemas remain
blocked. Native output/exception comparisons and full public result-schema checks run
in `scripts/smithy-jsonschema-oracle.ts`. The Python companion verifies 12 target-instance
vectors and requires an actual unresolved-reference exception for the recursive defect.
The native fractional-long mapping is an expected loss, not misreported as source
validation. Browser checks exercise successful conversion and blocked recursive output.
Strict policy, malformed native text, unresolved references and invalid base URI have
focused contract tests. All 50 public Chromium checks and typechecking pass.

The full conformance gate passed after native-emission integration: 171 Bun tests /
4,058 assertions, all independent native adapter checks, 144 public Smithy assembly
comparisons, 182 negative-model comparisons, 90 selector vectors, 52 converter-root
comparisons and the 12 independent target-instance cases. Native emission matches the
JVM for all roots; 42 produce targets, eight conversion failures and two unresolved
root references remain explicitly blocked. Typechecking and 50 public Chromium checks
also passed. This establishes the named profile's evidence, not complete Smithy support.
The rebuilt native runtime also passed Chromium's 326 assembly and 90 selector corpus
comparisons after adding the converter, plus three authored invalid models, exact numeric
metadata and absent host globals. Its current runtime hash is recorded in browser-findings.

### Smithy recursive-root profile

US-014-AC17 expands the native converter matrix to 55 data roots. Original and adapted
profiles have separate reports and retain original native output. The adapted profile
matches JVM output/failures for every root, emits 47 targets and blocks eight native
conversion failures. The original profile retains 11 blocked outcomes, including three
dangling recursive roots. Exact target trees survive UMF YAML round trips before
independent Python validation. Python checks all 47 target meta-schemas, 13 recursive
instance vectors and unchanged exact numeric/literal defaults. The original 12 target
vectors also pass. Strict/missing-capability behaviors have focused contract tests.

A combined unsafe-integer/default and dangling-reference regression verifies that
reference checks cannot be skipped when JavaScript numeric limits prevent compilation.
The profile's reference walk uses only schema positions and local pointers. This is
not a general-purpose JSON Schema reference engine; nonlocal/resource/dynamic references
outside the fixed native profile remain blocked explicitly.

Final verification for the root-definition change: 172 Bun tests / 4,072 assertions,
typechecking, 51 public Chromium checks, both 55-root JVM matrices, 47 independent
adapted target meta-schema checks, and 25 combined target-instance vectors passed.
Unrelated native language oracles were not rerun for this change. Exact-number target
validation limits remain visible; no browser numeric-validation capability is inferred
from Python's independent validation evidence.

### Smithy service-context projection

US-014-AC18 adds a separate JVM matrix over every declared service/data-root combination
within each supplied source model with services. All 40 combinations match output or
native failure; 30 targets survive exact UMF YAML round trips and ten roots outside their
selected service are blocked. Independent Python validation checks all 30 target
meta-schemas and 11 instance vectors, including distinct same-named Customer fields and
separate enum domains for ServiceA/ServiceB. Existing fractional-integer behavior remains
explicitly covered as a native representation difference.

Contract tests require an explicit service ID only in the service-context profile and
reject missing backend capability. Chromium checks successful declared renames and
outside-service rejection; all 52 public browser checks pass. This is not evidence for
arbitrary automatic renaming, service-operation lowering or transport equivalence.

The first full Bun run passed 172 tests but exceeded the default five-second timeout in
the existing GraphQL 48-case grammar corpus. That test now has the same 20-second timeout
as its neighboring full-schema corpus test; no cases or assertions were removed. The
full suite is rerun after this bounded timing correction. All three native converter
profiles have already been rechecked: 55 original, 55 root-definition, and 40 service-
context combinations, with independent target vectors passing for each profile.

Final service-context verification: the rerun passed all 173 Bun tests / 4,081 assertions,
including the complete GraphQL grammar corpus. Typechecking and 52 public Chromium
checks passed. The three converter matrices (55 + 55 + 40 combinations), exact target
round trips and all 36 independent instance vectors passed. Unrelated native-language
oracles were not rerun for this change. The expanded service-context commands are part
of the full conformance gate for future complete runs.

### PostgreSQL native source/tree boundary

US-015-AC1–AC3 pass for two authored schema files containing 14 statements, a targeted
AST rename, unknown-field/representation rejection and invalid SQL/NUL input. The full
Bun suite passes 176 tests / 4,107 assertions; typechecking and all 53 public Chromium
checks pass, including actual PostgreSQL WASM parse/deparse and exact numeric defaults.
The separate pglast 7.18 oracle confirms its original/regenerated AST equality, excluding
source offsets, and the isolated edit. Its PostgreSQL 17.7 differs from WASM 17.4; both
versions are recorded in the result. No database DDL was executed.

`build:postgresql` creates the optional browser runtime. `scripts/postgresql-oracle.ts`
and `.py` are included in the full conformance gate. Unrelated native-language oracles
were not rerun for this new adapter. Upstream PostgreSQL corpus coverage, a complete
typed AST vocabulary/schema, catalog introspection/execution and projection cases remain
open. Current complete JSON Schema describes the source/tagged-tree representation,
not the entire typed PostgreSQL node vocabulary.

### PostgreSQL typed native AST evidence

The pinned descriptor schema now covers 272 messages, 71 enums and 1,665 fields.
`bun scripts/postgresql-schema.ts --check` verifies source hashes, exact codec field
and enum inventories, 4,560 wire vectors and generated artifact freshness. Probes
use direct message creation; they do not establish fromObject coercion fidelity or
SQL grammar validity. Native export separately checks codec loss and typed schema
validity before deparse/reparse. Unknown native fields stay preserved in UMF.

Five focused Bun tests / 36 assertions and typechecking pass. All 54 public Chromium
checks pass with the installed executable, including the new schema validation check.
The separate pglast oracle still passes two DDL samples / 14 statements, an isolated
rename and invalid SQL rejection. The full multi-language suite was not rerun in this
slice. A regression test confirms the pinned Boolean converter loses boolval for
SELECT TRUE: export is blocked and the original AST remains unchanged.

The browser runner initially lacked its default Playwright executable; rerunning with
UMF_CHROMIUM_PATH=/home/erik/.local/bin/chromium succeeded. Upstream SQL corpora,
catalog behavior and cross-system projections still require evidence.

### PostgreSQL upstream deparser corpus and Boolean repair

US-015-AC4 now has all 416 upstream deparser cases at libpg_query commit
1c1a32ed2f4c7799830d50bf4cb159222aafec48. C compilation extracts literals without
manual SQL splitting. Source, license, generated vectors and hashes are retained.
The Bun corpus runner checks original source and native AST preservation through
JSON/YAML, the typed schema, codec fidelity and native deparse/reparse. Every case
passes. The separate pglast 7.18 / PostgreSQL 17.7 oracle compares all 420 statements
against their originals. Engine versions remain distinct and no SQL is executed.

All 56 public Chromium checks pass, including the same 416-case corpus and true/false
round trips. Six focused Bun tests / 45 assertions and typechecking pass. The two
authored native-oracle schemas and isolated table edit still pass. Full multi-language
conformance was not rerun; its command now includes this corpus and oracle.

The optional wrapper constructs nested native messages before invoking fromObject,
using Boolean.create to avoid its constructor-shadowing bug. This supersedes the
previous blocked-Boolean result for the corrected backend only. A regression test
still supplies the raw defective converter and confirms export rejects its loss.
A true-to-false candidate edit passes using native false's empty-message representation.
Explicit false field presence is not silently normalized away. Runtime source and
schema hashes document the adapter alongside the unchanged upstream artifacts.

Next: broader PostgreSQL SQL regression fixtures and negative grammar cases, database
catalog extraction and rebuild evidence, and loss-aware DDD/cross-system projections.

### PostgreSQL live database oracle

`bun run test:postgresql-catalog` passes on digest-pinned PostgreSQL 17.4. It executes
14 authored DDL statements, reconstructs them through UMF, and independently rebuilds
a database from pg_dump schema-only SQL passed through UMF. Source, regenerated and
restored catalog snapshots match for the fields in native/postgresql/catalog/snapshot.sql.
Six relations, two domain/enum types and one function are covered. Image, query, probe,
adapter and input hashes accompany fixtures/postgresql/catalog-results.json.

Eight probes pass in each database: exact numeric/default/generated results, Unicode
function output, role-based row filtering, and the expected SQLSTATEs for five rejected
operations. The initial expected generated-value scale was corrected to nine decimal
places after observing PostgreSQL behavior and independently calculating it with Decimal.
An initialization race was fixed by waiting for the final PostgreSQL process, not its
temporary setup server. The final run passes and leaves no oracle container running.

Typechecking passes. Existing browser and multi-language suites were not rerun: this
slice changes development oracles, fixtures and documentation only. Full conformance now
requires Docker and includes the new oracle. Browser adapter validation remains incomplete
for catalog/server semantics; the bounded evidence query is not a general catalog schema.

### PostgreSQL catalog capture interchange

US-015-AC6 has four focused Bun tests / 25 assertions and passing typechecking. Tests
cover both UMF formats, exact unknown decimal tokens, copied qualified-relation lookup,
duplicate-observation rejection, unknown representation preservation, conflicting-state
rejection and warnings for untested PostgreSQL minor versions. Modified state survives
native capture export/reimport, preventing the original SQL accessor from treating edited
metadata as synchronized. Python jsonschema independently validates both new schemas and
the live capture fixture.

The live PostgreSQL oracle now imports its observed capture into umf.postgresql.catalog,
round-trips it through JSON/YAML, retrieves the SQL archive and rebuilds the third database
through the SQL adapter. Catalog comparisons and all 24 behavior probes pass. Capture
adapter/schema hashes join the evidence report. The query profile remains bounded;
these tests do not establish complete system-catalog coverage or metadata-to-DDL synthesis.

All 57 public Chromium checks pass, including catalog capture serialization, qualified
lookup, stale-state persistence and the minor-version warning. The 416-case PostgreSQL
SQL corpus also remains green in this browser run. The disposable database container is
removed after the live oracle. The full multi-language native suite was not rerun.

### Catalog v2 object-family coverage

Five focused catalog tests / 38 assertions and typechecking pass. Legacy v1 and expanded
v2 captures also pass independent Python JSON Schema validation. Negative tests remove
each v2 object section and confirm rejection; a trigger edit remains explicitly modified
and cannot expose its old archive as synchronized reconstruction SQL.

The live PostgreSQL 17.4 oracle executes 24 authored statements, round-trips the capture
and SQL, and compares all three catalog snapshots. It passes 36 behavior probes across
the three databases. New probes exercise composite attributes, trigger-produced values,
range/multirange containment, invalid range bounds, exact bigint sequence values and
materialized-view refresh. No query/DDL execution is added to browser APIs.

All 57 public Chromium checks pass, including reading v2 trigger/range metadata, catalog
round trips and the 416-case native SQL corpus. The disposable container was removed.
The full multi-language native conformance suite was not rerun in this slice.

### Catalog v3 native dependencies

Six focused catalog tests / 48 assertions and typechecking pass. Tests distinguish
same-identity native objects by catalog/type, verify copied dependency results, distinguish
missing legacy coverage from zero matches, and reject v3 captures missing dependencies.
The live oracle compares all 105 captured edges across source, regenerated and restored
databases. Its 42 behavior checks include RESTRICT/CASCADE semantics for a referenced
composite type; the dependency API is also exercised against the live capture.

The captured multiset is a scoped native observation, not a complete lineage or execution
graph. No field promotion to core follows from the existence of a dependency edge.

All 58 public Chromium checks pass, including dependency lookup and the existing SQL
corpus. Independent Python JSON Schema validation accepts v1, v2 and v3 captures. The
final live rerun passes and leaves no oracle container running. The full multi-language
native conformance suite was not rerun in this slice.

### PostgreSQL read-row projection

US-015-AC9 has four focused tests / 25 assertions and passing typechecking. Tests cover
row shape/nullability, exact text encodings, target JSON/YAML round trips, explicit loss,
strict blocking, unsupported encodings, modified-capture rejection and the complete
projection-result schema. Adversarial identifier/key strings produce one native-parsed
SELECT statement; embedded quote/semicolon/backslash content remains quoted data.

The live catalog oracle now runs two generated row queries in all three reconstructed
databases. Six native rows validate against their target schemas; the independent Python
oracle rejects six invalid representation mutations and confirms exact bigint/decimal
text plus the embedded JSON integer token. The existing 105-edge catalog comparison and
42 native behavior probes still pass. No disposable container remains running.

All 59 public Chromium checks pass, including projected/strict-blocked row results and
the existing native SQL corpus. Full multi-language native conformance was not rerun;
its command now includes the independent row oracle. The current live row matrix covers
text, int32 and JSON encodings; boolean is not included in that live matrix. Database
constraint equivalence, INSERT validation, decoding and migration remain open.

### Boolean and null row encoding evidence

Five projection tests / 32 assertions and typechecking pass. The live oracle now emits
15 rows across three row schemas and three reconstructed databases. Python independently
validates every row, requires the complete database/relation/case identity sets, and rejects
33 invalid representation mutations. Cases include true/false, nullable boolean values,
SQL NULL versus JSON null, NOT NULL jsonb containing JSON null, empty text and both
smallint bounds. This supersedes the earlier boolean live-matrix gap.

The expanded fixture has 25 DDL statements, ten relations and 110 dependency edges.
Catalog reconstruction and all 42 existing native behavior checks still pass. The public
projection remains an explicit-loss read contract; it does not claim INSERT semantics or
that JSON validation enforces all native constraints.

All 59 public Chromium checks pass, including the expanded encoding projection and
existing native SQL corpus. No oracle container remains running. The full multi-language
native suite was not rerun in this slice.

### Arrow schema capability spike

SPIKE-003 records a 52-case authored schema matrix against apache-arrow 21.2.0 in Bun and
Chromium, with matching outcomes and no Node globals in the browser. PyArrow 21.0.0 reads
49 generated schema-only IPC streams and re-emits native-equal schemas. JavaScript observes
one re-emission change: the dictionary ID is reassigned to 0. Duplicate-metadata collapse,
struct alias normalization, three unsupported decoder families and JSON-writer metadata
omission are explicit results, not successful fidelity claims. Typechecking passes.

No public Arrow extension, full type-parameter conformance, maps, unknown FlatBuffer
preservation, record batches or cross-system transform is established. The dedicated
probe commands in SPIKE-003 reproduce these findings; the full existing native suite was
not rerun. The spike is separate from public browser conformance.

### Public Arrow integration-schema adapter

US-016 has five focused tests / 178 assertions and passing typechecking. All 52 authored
schemas survive UMF JSON/YAML and exact schema export; tests include metadata duplicates,
unknown types/fields, exact signed-64-bit dictionary IDs, immutable edits and blocked
unknown-representation export. Negative tests cover malformed widths/time/decimal/child
layouts and dictionary tokens that would round to integers in a host number.

The UMF native-behavior oracle confirms 49 schemas decode with unchanged pinned native
results and three remain unsupported while fully preserved. Independent Python JSON
Schema validation accepts all 52 structural samples. All 60 public Chromium checks pass,
including Arrow schema round trips and exact unknown numbers. Native Arrow IPC remains
experimental, and the full multi-language native suite was not rerun in this slice.

### Arrow guarded public IPC export

US-016-AC4 has three focused tests / 59 assertions and passing typechecking. The 52-case
matrix exports 48 schemas and blocks duplicate metadata plus the three decoder-unsupported
families. Tests also cover immutable edits, documented defaults/aliases, unsafe host IDs,
unknown content and deliberately changed backend re-read descriptors. An empty schema
also produced a valid 72-byte schema-only stream in the native probe.

PyArrow 21.0.0 independently reads all 48 public outputs and confirms native schema/type
and metadata equality against the pinned native baseline. It verifies the edited field
name separately. All 61 public Chromium checks pass, including the same export/block
matrix through the separately built Arrow runtime. The full multi-language native suite
was not rerun; its command now includes the public IPC oracle. Arbitrary binary input,
unknown FlatBuffer fields, array data and dictionary batches remain outside this claim.


Arrow source-capture evidence (US-016-AC5) is tests/arrow/capture.test.ts plus
scripts/arrow-ipc-browser.ts: all 18 authored native file/stream fixtures must survive
UMF JSON/YAML and byte export exactly, including six unsupported native type cases.
Native observations must retain source and incomplete status. Invalid/trailing input,
mutation isolation, unknown representation data and capture bounds are distinct tests.
No native-validity claim follows from capture-envelope validation.


US-016-AC6 tests the logical FlatBuffer model separately from native IPC. The generated
schema must cover all pinned declarations and fields; flatc inventory comparison is an
independent optional native gate. Exact signed-64-bit boundary/spelling cases, required
union/struct failures and all five logical root round trips are in
 tests/arrow/flatbuffer-schema.test.ts. scripts/arrow-ipc-browser.ts checks a public
logical schema round trip alongside capture evidence. Binary conversion and Arrow
semantic invariants require additional tests before native support can be claimed.


US-016-AC7 compares 70 decoded raw Arrow metadata roots with an independent flatc
23.5.26 oracle. This covers known metadata values and field presence, not array/body
semantics. tests/arrow/flatbuffer-decode.test.ts checks source retention, unknown-slot
warnings, uninterpreted unknown enum values, invalid offsets/vtables, truncation and
vector bounds. scripts/arrow-ipc-browser.ts repeats all 70 public decodes. Wire encoding,
edit propagation, full IPC framing and semantic validation remain separate open gates.


US-016-AC8 checks metadata encode/decode equality, including physical field presence.
The 70 corpus encodings plus two edited/default fixtures have independent flatc
comparisons; Chromium independently exercises all 70 public encoding paths. Tests in
flatbuffer-encode.test.ts also check source immutability, invalid edits, unknown content,
backend drift and invalid Unicode conversion. Unknown-wire marker tests prevent a
partial decoded model from silently becoming a complete-source export. These checks
must not be reported as dataset-body or full IPC framing support.


US-016-AC9 compares public IPC layout reports against native PyArrow message consumption
for 19 file/stream inputs, including one legacy-prefix stream. The report JSON Schema
is validated alongside offsets, source retention and explicit incomplete status. Negative
cases cover optional EOS versus truncation, trailing garbage/concatenation and invalid
file footers. Browser checks repeat the 19 layouts. These gates prove bounded framing
observations, not footer consistency, dictionary evolution or valid array bodies.


US-016-AC10 distinguishes complete byte accounting from footer declaration agreement.
Tests re-encode contradictory native footers and verify that framing succeeds while
consistency reports fail. Block reordering is warning-only. Nine file baselines and ten
stream not-applicable results are checked in Bun and Chromium; the result JSON Schema
is validated. Matched footer declarations must not become a full data-validity claim.


US-016-AC11 requires independently readable renamed IPC datasets, not only logical model
agreement. PyArrow compares 19 complete tables and schemas after rename; Chromium output
bytes must match the independently checked Bun artifacts. Additional tests preserve
original/envelope content, select nested fields, retain absent EOS and reject invalid
paths/trailing bytes. The explicit metadata-reference policy and incomplete diagnostics
must survive in schema-valid transform results. This is not general body migration.


US-016-AC12 applies the current Arrow operations to the entire pinned upstream integration
subtree: 182 binary and 91 schema cases. All round-trip exactly through both UMF formats;
179 guarded native renames are independently checked against full PyArrow tables. Browser
execution repeats those outcomes and output bytes. Three historical footer-version
mismatches must remain preserved, reported and blocked under current policy. Source hashes,
licenses, per-case outcomes and reproduction scripts prevent cherry-picked coverage.
Fuzz data is a separate upstream subtree and remains untested by this corpus gate.


Spark baseline feasibility (SPIKE-004) compares 49 authored schema JSON inputs between
PySpark and JVM Spark 4.0.1, recording acceptance, re-emission, source mutation and repeated
parse behavior. scripts/spark-capabilities.py asserts the observed counts and collation
mutation cases. Future adapter tests must preserve unknown source and exact numeric
metadata and qualify engine/configuration validity separately from Python parsing.
This native probe does not yet establish UMF round-trip or browser support.


Spark US-017 gates now include exact schema JSON/YAML round trips for 47 authored sources,
two mandatory-property rejections, exact numeric metadata, unknown properties, opaque UDT
nonexecution, mutation isolation and representation export guards. Python/JVM Spark 4.0.1
must reproduce all 94 source/UMF outcome comparisons and both authored-edit comparisons.
Browser execution repeats the 49 profile outcomes and a copied edit. These tests separate
source preservation from native acceptance; engine rejections stay visible in reports.
Upstream and full semantic/data/transform coverage remain required.

Spark rename evidence: run `bun test tests/spark`, `bun scripts/spark-rename.ts`,
`.venv/bin/python scripts/spark-rename-oracle.py`, and the existing Spark browser script.
The oracle expects 17 candidates/34 native comparisons and three guarded empty-name
cases out of 20 authored fixtures, including independent demonstrations of native
collation loss. Conformance regenerates fixtures before transforms and native checks.

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

US-018-AC9 adds Delta whole-log source checks: scripts/delta-log-upstream.ts verifies
all 307 pinned files by SHA-256 after JSON/YAML serialization, with 1,725 inspected lines
and one expected _autostats envelope mismatch. delta-log-browser.ts repeats source hashes
and inspection diagnostics in Chromium without Node globals. tests/delta/log.test.ts
covers malformed/future envelopes, CRLF/Unicode/exact numbers, representation additions
and limits. Source capture alone is not native commit or snapshot conformance.

US-018-AC10 checks known Delta action schemas with exact signed integer boundaries and
unknown-content preservation. delta-action-upstream.ts and delta-action-oracle.py compare
307 pinned inputs against independent Python jsonschema; delta-log-browser.ts compares
all inspection diagnostics in Chromium. Authored tests cover malformed known fields,
int64 extremes, overflow/fraction rounding risks and arbitrary commitInfo JSON. This is
structural evidence; native transaction and snapshot correctness require further tests.

US-018-AC11 uses six real-data histories and independent native reopening of their lowered
UMF action states. delta-reconcile-probe.py records native source observations;
delta-reconcile.ts captures/reconciles; delta-reconcile-oracle.py compares metadata,
protocol, exact transaction versions, active paths and DataFusion rows with unchanged
Parquet hashes. delta-reconcile-browser.ts repeats the states and JSON/YAML source exports.
Focused tests reject gaps, duplicates and checkpoint actions and check DV set ordering,
domain tombstones and opaque-action provenance. DV/domain tests are authored vectors;
native feature-dependent histories, checkpoint recovery and full transaction validity
remain outstanding. Ordinary conformance runs the three native/Bun stages.

AC12 adds all 303 upstream ordinary-commit prefixes with source SHA-256, complete state
hashes and explicit errors. The independent deltalake oracle compares native original and
lowered log state: 257 successful pairs, 21 rejection-only pairs. Browser execution repeats
278 reconciled and 25 blocked outcomes. No upstream data/checkpoint files are supplied;
row-read evidence remains limited to the earlier authored corpus. The test and conformance
scripts are listed in CONTRACT-018. Checkpoint and native domain/DV observations remain
required work rather than inferred from action-state parity.

AC13 adds native embedded-V2-JSON checkpoint recovery without earlier commit files.
The probe writes a real version-10 checkpoint and later commits; the independent oracle
compares its three native states to lowered UMF outputs on rows/files and exact application
versions. Chromium repeats these results and source round trips. Negative tests cover
missing/duplicate checkpoint metadata, version/feature mismatch, prohibited actions,
int64 version overflow, successor gaps and both upstream unresolved sidecars. Parquet and
multipart checkpoint support remains unverified. See CONTRACT-018 for commands and scope.

AC14's decoder trial compares 35 hash-pinned Parquet files (991 rows) against PyArrow
21.0.0 typed vectors. Preserve both the default decoder's two decimal-mismatch results
and the corrected experiment's 35 matches. Four authored decimal-storage fixtures add
20 boundary/null rows up to precision 70. Chromium verifies all 39 files and 1,011 rows;
the Bun test checks 80 assertions. These are decoder observations, not binary round-trip
or integrated checkpoint-recovery claims. Commands and remaining cases are in SPIKE-005.

US-019-AC1–3 verifies exact Parquet capture over 35 upstream checkpoint/sidecar files and
four decimal boundaries. parquet-capture.ts checks JSON/YAML hashes; the PyArrow oracle
compares full schemas/1,011 rows and footer positions; Chromium repeats hashes/framing.
Authored tests cover copy isolation, malformed bytes, unknown payload fields, length
bounds and synthetic encrypted-footer magic. Complete logical schema support, real
encryption, metadata edits and Parquet projections remain US-019-AC4 work.

US-019-AC5 compares entire footer trees with Apache thrift Python 0.22.0 for 39 Parquet
fixtures and one native-written wire boundary fixture. Chromium repeats all 40 results.
Keep field order, duplicate IDs/map keys, integer widths, binary and double bits in the
comparison. Authored negatives enforce region/varint/depth/cardinality limits and preserve
source on failure. UUID has authored-vector evidence only. This suite validates wire
decoding, not the Parquet IDL or safe schema transformations. Commands: parquet-footer-oracle.py,
parquet-footer.ts and parquet-footer-browser.ts; results reside in fixtures/parquet/footer/.

US-019-AC6 compares named FileMetaData from the public mapper with an independent
thriftpy2-generated reader for every one of the 39 Parquet files; Chromium repeats these
views and byte preservation. Generated schemas cover all 69 pinned IDL declarations and
176 fields. Focused negatives cover missing/duplicate/mistyped known fields and invalid
UTF-8; future enum codes and repeated unknown fields remain preserved. Source hashes are
checked before native IDL compilation and fixture reads. This does not establish complete
logical-type, page/index/crypto, row decoding or safe transformation coverage.

US-019-AC7 compares physical types, dotted native display paths and definition/repetition
levels for 1,813 leaves against PyArrow 21.0.0. Exact component paths remain separate in
UMF. Thirteen authored files exercise twelve structural failures and one valid dotted
field name. Record native metadata acceptance separately: eight inconsistent cases load
natively but still violate the declared structural profile. Chromium repeats 40 checked
and 12 blocked results. Commands and reports are in CONTRACT-019; logical annotations,
page decoding, native edit fidelity and projections remain unverified by this test layer.

US-019-AC8 adds 30 scalar annotation fixtures with native PyArrow logical-to-Arrow
observations: 15 accepted/15 rejected. Include decimal carrier/scale boundaries, integer
widths, UUID/FLOAT16/INTERVAL lengths and temporal carriers, preserving local-time flags
and absent/conflicting legacy fields. The prior 39 files add regression coverage; Chromium
matches all 69 annotation views/diagnostics and source bytes. Nested annotation layouts,
actual values, statistics and safe transforms remain outside this matrix. Commands and
explicit capacity bounds are in CONTRACT-019.

US-019-AC9: run parquet-container-schema.ts, parquet-container-oracle.py,
parquet-containers.ts and parquet-containers-browser.ts. Tests in
`tests/parquet/containers.test.ts` verify all 57 statuses, result schema, byte preservation,
recursive native element/key/value observations, nullability, nested legacy lists and
explicit map reader/spec differences. Fixtures and evidence live under
`fixtures/parquet/containers/`. The native oracle uses PyArrow 21.0.0 and thriftpy2 0.5.3
with the pinned Parquet IDL. These are schema observations, not data-page validation.

US-019-AC10: parquet-transform-schema.ts, parquet-transform.ts and
parquet-transform-oracle.py generate/verify 40 Compact Protocol encodings and 39 native
metadata transforms. parquet-transform-browser.ts repeats encodings/output hashes and
39 blocked duplicate-key retries. tests/parquet/transform.test.ts checks exact wire trees,
source immutability, prefix bytes, absent/empty/BOM/Unicode metadata values, result schema,
unknown UMF extension preservation, blocked unsafe edits, numeric bounds and resource limits.
Evidence is in fixtures/parquet/transforms. PyArrow table equality ignores newly added schema
metadata intentionally; physical schemas, existing metadata entries and independent wire
fields outside the edited file-level field are compared separately. Full format conformance
and arbitrary metadata-consumer behavior are not inferred from these tests.

US-019-AC11: parquet-rename-fixtures.py writes nested native sources with store_schema=False,
three codecs, three row groups, field IDs and page indexes/checksums, plus an embedded-schema
negative source. parquet-rename-schema.ts and parquet-rename.ts produce the contract/output
fixtures. parquet-rename-oracle.py independently verifies exact wire edits and native reads
with page_checksum_verification=True. parquet-rename-browser.ts matches all output hashes.
The 48 successful transforms cover every non-root schema index; the 384 observed rows are
8 rows read after each transform, not 384 unique source rows. Tests also reject collisions,
invalid names, stale metadata and legacy tuple/list interpretation changes. Source and output
UMF documents remain separate. Evidence: fixtures/parquet/rename and tests/parquet/rename.test.ts.

AC11 additionally reverses every successful rename. The native oracle compares restored
full wire trees and tables (including schema metadata) to the originals; Bun and Chromium
compare all 48 restored hashes. These inverse cases supplement the one-way 384 row reads.

US-019-AC12 experimental evidence: parquet-values-fixtures.py creates four native files and
expected typed values using PyArrow scalar inspection, covering page versions 1/2 and dictionary
on/off. parquet-values-trial-schema.ts defines the experimental output shape. parquet-values-trial.ts,
parquet-values-browser.ts and tests/parquet/values-trial.test.ts compare full typed views,
duplicate/integer map keys, nested decimal strings, unsigned extremes, null/empty structures,
name preservation and timestamp semantics. Source buffers must remain unchanged. Files live
under fixtures/parquet/values-trial. Public decoder acceptance is still pending resource bounds,
malformed pages and wider type/codec evidence; these valid fixtures cannot establish safety for
untrusted pages.

US-019-AC13: parquet-pages-schema.ts and parquet-pages.ts generate the result schema and
47-file inventory. parquet-pages-oracle.py independently parses 2,472 headers with thriftpy2
and checks native readability, including two strict-profile rejections. Native Thrift's V2
is_compressed default is supplied only in the comparison view when absent in source.
parquet-pages-negative.py creates 18 controls/mutations; tests/parquet/pages.test.ts verifies
budgets, bounds, source retention and explicit payload-validation limits. The overlap fixture
has valid two-column schema metadata so it reaches the page-range check. Chromium repeats
65 cases via parquet-pages-browser.ts. Full Parquet regression tests cover extraction of the
shared wire parser/IDL mapper. No allocation-safety claim extends to the experimental value
decoder until it validates actual page bodies under resource limits.

US-019-AC14: parquet-bodies-schema.ts, parquet-bodies.ts and parquet-bodies-oracle.py compare
2,424 decoded physical bodies against PyArrow codec output and 1,534 CRCs against zlib.
parquet-snappy-vectors.py supplies 25 native-verified blocks, including all copy widths,
long literal length widths and empty data. tests/parquet/bodies.test.ts verifies exact bytes,
input preservation, resource bounds, malformed blocks, CRC corruption and Snappy length
mismatch. parquet-bodies-browser.ts repeats corpus and prior malformed-page controls,
expecting 46 decoded/19 blocked. Gzip and historical declaration mismatches are intentional
scope rejections. Existing header corruption tests remain valid: only the body stage claims
CRC/decompression verification. Complete typed decoding is still pending.

US-019-AC15: parquet-hybrid-fixtures.py writes 27 native dictionary-page files and asserts
PyArrow reads the intended values. parquet-hybrid-schema.ts generates the internal result
schema. tests/parquet/hybrid.test.ts checks full vectors, schema, input immutability, final
padding, uint32 boundaries and rejection before hostile count expansion. The browser harness
parquet-hybrid-browser.ts repeats all 27 native-backed vectors plus four malformed cases.
No fixture allocates a dictionary for the full uint32 domain; those boundary vectors remain
explicitly authored tests. Page-prefix/Dremel integration needs its own acceptance evidence.

US-019-AC16: parquet-levels.ts generates corpus arrays; parquet-levels-oracle.py independently
reconstructs them using a Python hybrid implementation and native PyArrow schema maxima.
It matches 54,575 level pairs on 1,864 pages. parquet-levels-fixtures.py supplies eight
native-readable required/optional/repeated/list cases plus seven malformed streams/counts.
parquet-levels-schema.ts defines the result; tests/parquet/levels.test.ts verifies complete
arrays, source retention, schema, offsets and rejection without partial output. Chromium
repeats 62 files via parquet-levels-browser.ts. Native readability of authored valid rows
complements the reference-array oracle; do not describe the reference parser as PyArrow's
internal level decoder. Cross-column alignment and physical values require later tests.

US-019-AC17: parquet-physical.ts generates corpus views; parquet-physical-oracle.py compares
9,574 carriers using an independent Python PLAIN/dictionary implementation and native schema
information. parquet-physical-fixtures.py creates 15 native-readable boundary files, checking
integer/float buffers and binary/Boolean/INT96 native values. It additionally creates invalid
index and over-budget dictionary expansion cases. parquet-physical-schema.ts defines output;
tests/parquet/physical.test.ts checks native expectations, object independence, source retention,
malformed lengths and expansion guards. parquet-physical-browser.ts repeats 64 cases (59/5).
Native buffer evidence is distinguished from the independent reference parser. Physical
carriers alone do not establish logical validation or complete row assembly.

US-019-AC18: parquet-rows.ts generates physical records; parquet-rows-oracle.py reconstructs
expected physical wrappers/carriers from native PyArrow scalars and the pinned Thrift schema.
It matches 1,024 rows in 44 files. parquet-rows-fixtures.py creates two native-readable shared
row layouts and five assembly-specific failures. tests/parquet/rows.test.ts first proves each
authored file passes physical decoding, then verifies merge outcomes, node bounds, source
retention and result schema. parquet-rows-browser.ts repeats 54 inputs. The oracle evidence
is scoped to these native layouts; logical projection and complete type conformance remain
separate acceptance work.

US-019-AC19: parquet-values.ts emits bounded typed rows; parquet-values-oracle.py compares
native PyArrow scalar values and ordered maps, recording INT96 timestamp-view differences.
parquet-values-authored.py produces ten malformed/valid/opaque scalar cases with native
observations; UMF's value validation is not assumed to match reader permissiveness on invalid
logical values. parquet-values-schema.ts defines the public result. tests/parquet/values.test.ts
checks corpus/source preservation, exact JSON syntax, numeric constraints, opaque BSON,
FLOAT16/float/double bits and agreement with earlier nested-decimal/map experiment fixtures.
parquet-values-public-browser.ts repeats 57 cases, including uniform UTF-8 errors. Native
physical carriers remain available independently of the projected scalar text.

US-018-AC15: delta-parquet-actions-schema.ts defines the public report;
delta-parquet-actions.ts projects 35 pinned files. delta-parquet-actions-oracle.py independently
reads all files with PyArrow 21.0.0 and compares 896 actions plus omission paths across 23
projected inputs; 12 bounded failures retain source. delta-parquet-actions-authored.py generates
seven additional boundary inputs. tests/delta/parquet-actions.test.ts verifies result schemas,
exact source retention, int64 text and fail-closed conversion. delta-parquet-actions-browser.ts
compares actions, omissions, diagnostics and binary recovery in Chromium. This evidence tests
action projection, not recovered sidecar state or complete Delta support.

The AC15 Chromium 148 run matches Bun for 42 inputs: 26 projected, 16 blocked and 899
projected actions. Expected payloads cross the Playwright boundary as JSON text, because
its object transport dropped a literal __proto__ member; both UMF runtimes preserve that key.
TypeScript checks pass. Browser results record absent Node process/Buffer globals.

US-018-AC16: delta-sidecars-probe.py writes two native Parquet sidecars and checks deltalake
1.6.4 recovery at versions 10, 11 and 12 without earlier history. delta-sidecars.ts derives
states; delta-sidecars-oracle.py independently scans their lowered native logs and compares
rows, paths and transactions. delta-sidecars-schema.ts defines source/origin/result shapes.
delta-sidecars-upstream.ts binds both upstream JSON checkpoints to supplied bytes and records
INT96 conversion blockers. tests/delta/sidecars.test.ts covers exact source preservation,
tombstones, origins, missing/duplicate/extra/size-mismatched bindings, mixed file locations,
non-file actions and malformed bytes. Existing reconciliation/checkpoint tests remain required.
delta-sidecars-browser.ts checks all three native-backed states, JSON/YAML source and binary
recovery, missing/duplicate/extra bindings, and a missing successor version in Chromium.

US-018-AC17 extends delta-parquet-actions-authored.py with negative nanosecond/UTC and local
microsecond timestamps, exact decimal, negative zero and nonfinite statistics. The action
oracle now compares 44 native files, traversing PyArrow scalars directly to retain nanosecond
counts instead of calling datetime conversion. Thirty-four inputs project 948 actions. Tests
check conversion records, exact tokens, unit-dependent fractions and years 0001–9999 limits.
Chromium matches all 44 results and source bytes (34 projected, 10 blocked). Existing sidecar
native scans, three browser snapshots and binding/gap rejections still pass. JSON report schemas
require conversion records alongside fully derived checkpoint origins and omission records.

US-018-AC18: delta-parquet-checkpoint-probe.py produces native V1, V2 embedded and V2 sidecar
Parquet files with explicit protocol integer widths, then scans nine snapshots without earlier
JSON history. delta-parquet-checkpoint.ts checks source hashes, recovers state and emits lowered
native logs; delta-parquet-checkpoint-oracle.py compares their scans. The upstream harness
exercises all 32 pinned single-file checkpoints, excluding three sidecars as standalone seeds.
Its native oracle records 24 matching observations, five catalogOwned reader rejections and three
UMF blocks on otherwise native-readable inputs. tests/delta/parquet-checkpoint.test.ts verifies
report schemas, sources, spec mismatch, missing sidecars/successors and all corpus outcomes.
Existing checkpoint/replay/sidecar tests remain required. delta-parquet-checkpoint-browser.ts
compares all 41 authored/upstream reports, binary JSON/YAML recovery and wrong-spec rejection.

US-019-AC20: parquet-offset-repair.ts repairs the two pinned legacy offset layouts and explicitly
recovers Delta action state from the candidates. parquet-offset-repair-oracle.py checks the
complete native footer after applying only recorded offset edits, unchanged-prefix hashes and
23 native rows. delta-parquet-checkpoint-upstream-oracle.py --offset-repair compares both original
native checkpoints against lowered recovered states. tests/parquet/offset-repair.test.ts checks
source retention, complete candidate validation, byte-prefix equality, repeated-repair rejection
and corrupt-dictionary rejection. parquet-offset-repair-browser.ts matches both reports and
JSON/YAML binary recovery, then verifies the repaired checkpoints recover in Chromium. Existing
strict corpus outcomes are intentionally unchanged: repair is a separate explicit operation.

US-018-AC19: with JAVA_HOME set to OpenJDK 21, delta-multipart-probe.py generates 26 expected
hashes via Spark 4.0.1 Murmur3HashFunction, partitions two native checkpoint files using those
hashes, and scans three recovered versions without earlier history. delta-multipart.ts verifies
part hashes and emits UMF states; delta-multipart-oracle.py scans lowered states independently.
delta-multipart-negative.py generates V2-feature and duplicate-action files. Tests verify schemas,
part identities, caller-order independence, clustering failures, incomplete sets, exact source
preservation and invalid finite part-count reports. delta-multipart-browser.ts repeats all three
states, 26 hashes and binary JSON/YAML source recovery in Chromium. Deletion-vector data reads
and concurrent-writer provenance are not covered by these native multipart fixtures.

US-020-AC1–3: iceberg-schema.ts defines the package and recursive source grammar.
iceberg-fixtures.py produces 35 authored schemas with PyIceberg 0.11.0 observations;
iceberg-roundtrip.ts verifies 26 preserved schemas and nine known-invalid rejections, then
emits JSON/YAML exports and a nested rename. iceberg-oracle.py verifies 52 format round trips,
21 native accepted schemas, five unchanged native rejections, and field/identifier-ID retention
through the edit. PyIceberg accepts four cases rejected by UMF's source constraints; the
manifest records each difference. tests/iceberg/schema.test.ts checks copied access, atomic
failure, unknown representation export guards, exact numeric tokens and identity rules.
iceberg-browser.ts repeats all cases and the edit with no Node globals. This evidence does
not cover full table metadata, evolution, upstream corpora or cross-system projections.

US-020-AC4: iceberg-upstream-fetch.py retrieves 19 pinned core JSON resources plus legal
notices and records 21 schema locations (seven distinct canonical schemas). iceberg-upstream.ts
checks hashes and produces exact extractions, 40 format round trips and 20 candidate renames.
iceberg-upstream-oracle.py compares PyIceberg 0.11.0 outcomes; iceberg-java-oracle.ts builds and
runs the Apache Iceberg 1.11.0 SchemaParser oracle with pinned Maven plugins/dependency. Both
verify accepted round trips/edits. Java and UMF reject missing root type while PyIceberg accepts
it; the original malformed fragment remains unchanged. tests/iceberg/upstream.test.ts checks
sources, edits and the recorded discrepancy. iceberg-upstream-browser.ts repeats all 21
outcomes and edits. This is fragment-level evidence, not complete table/view metadata support.

US-021-AC1–3: iceberg-table-schema.ts defines known metadata shapes; iceberg-table.ts exercises
13 pinned table resources, two UMF formats and location candidates. iceberg-table-oracle.py
records native parsing separately from re-emission, including PyIceberg's v3 export limitation.
iceberg-java-oracle.ts --table independently compares native Java metadata for accepted cases.
Seven preserved sources yield 14 format round trips; six are accepted/re-emitted by Java and
one retains unsupported version 42. Tests cover exact signed counters, shape failures, unknown
content and atomic edits. iceberg-table-browser.ts repeats seven preserved/six rejected cases.
These are metadata-model checks, not physical table access or full reference/evolution tests.


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


US-022-AC9: tests/dbt/failure.test.ts verifies a native failing build's six statuses, exact
failure counts, empty skipped timing/adapter fields, explicit source dependencies, immutable
message edits and provenance hashes. tests/dbt/artifact.test.ts now checks four artifacts
against eight native/schema round-trip and edit records; dbt-artifact-browser.ts repeats
eight source and eight candidate comparisons. Native dbt exit 1 is expected and asserted by
dbt-failure-fixtures.py; exit 0 or a different result mapping is a fixture-generation failure.
This corpus does not cover cancellation, retries, fail-fast or arbitrary scheduling policies.


US-022-AC10: tests/dbt/semantic.test.ts checks semantic source and three independent description
edits through both UMF formats against six native parser/semantic-validator records. It binds
schema/project/artifact hashes and explicitly asserts the 43 raw Pydantic-schema null failures.
Derived validation accepts emitted serialized values without erasing unknown fields that native
Pydantic discards. Future versions, malformed known shapes, invalid roots, failed-edit immutability
and representation-export guards are tested. dbt-semantic-browser.ts repeats six source and six
candidate comparisons. No native query execution or browser semantic-validator parity is claimed.


US-022-AC11: semantic-metrics.test.ts binds native metric-type coverage to all five enum members,
checks two source formats and 22 candidate exports, and asserts incomplete public validation.
Native semantic errors remain distinct from serialized-shape acceptance for three cases; two
other candidates fail parsing and shape validation. Six parameter edits pass native semantic
validation without proving query execution. The native oracle asserts whole-source/pointer-edit
equality and stores errors/warnings; the browser checks matching outputs and source immutability.
Provenance includes the isolated metrics-project, parsed artifacts, command log and runtime pins.


US-022-AC12: semantic-fields.test.ts checks 1,859 input-shape and 690 serialized-shape vectors
across all 143 native fields. It verifies the published schema hash, records incomplete raw-input
parser equivalence and distinguishes direct native exceptions from ordinary rejection. Python
and Chromium repeat field-schema checks; no discrepancy appears for accepted serializations.
This boundary set is finite and does not establish arbitrary-value or whole-model validation.


US-023-AC1–3: tests/odcs/odcs.test.ts checks all 42 pinned native examples, source hashes,
original-byte recovery, both UMF formats, candidate edits and independent native-schema
outcomes. The oracle retains three upstream schema disagreements; malformed native shape
is not a preservation failure. Chromium compares 84 original/candidate pairs. Future-version
numeric tokens, copied nodes, failed-edit immutability, invalid roots and encoding-loss export
blocks are tested. Native shapes do not establish quality enforcement, reference resolution
or physical compatibility. ODCS 3.0.1 has a schema but no example in this release corpus.


US-023-AC4: tests/odcs/references.test.ts validates the complete report schema and compares 13
source-derived reference vectors across both UMF formats. Source recovery, copied target/source,
nested/colon IDs, name-vs-ID separation, rename/reordering, duplicates, external references and
unknown versions are explicit boundaries. Chromium repeats 26 lookup outcomes. Expected locations
come from the pinned reference prose/example and are not a separate native ODCS runtime result.
The example's unresolved shorthand is retained as negative evidence. Data/foreign-key enforcement
and cross-contract resolution are not covered by successful local lookup.


US-023-AC5: relationships.test.ts verifies whole report schemas, exact source recovery, ordered
composite pairs, implicit property sources and atomic failure for unresolved composite rows.
Nine cases cover context, arity, IDs, unknown types, external references and unsupported property
arrays. Python JSON Schema accepts six cases; these outcomes remain distinct from relationship
inspection. Limits, empty composites and copied-source independence have additional regressions.
Chromium compares 18 complete relationship/diagnostic outcomes. No data-level constraint or
physical-type compatibility claim follows from resolved endpoint pairs.


US-023-AC6: rename.test.ts validates complete candidate/report schemas, exact source recovery,
authored change-pointer expectations and unchanged ordered relationship endpoints after four
rename variants. The native oracle checks whole JSON differences and official schema validity
for eight exports, including unchanged ID references and custom metadata. Bun and Chromium test
atomic collision blocks; Bun also checks unresolved upstream references, invalid names and no-ops.
Successful candidates do not establish expression or external-consumer equivalence.


US-024-AC1–3: tests/linkml/linkml.test.ts checks all ten pinned examples and one authored common
schema against 22 native/schema records, exact original archives, both UMF formats and metadata
candidates. Tests distinguish schema version from metamodel version, preserve future source and
large numbers, and block lossy encoding export. Native oracle asserts the expected annotation
rejection and type-mappings normalization/schema disagreement; these are not rewritten into
passing source. Chromium repeats 22 source and candidate exports. No import resolution, induced
model, instance validation or generator behavior is established by this source package.


US-024-AC4: tests/linkml/metamodel.test.ts checks the full ten-file metamodel source directory,
twenty native source/candidate exports, original archives and scalar-notes normalization evidence.
It asserts exact numeric int64/uint64 boundaries. Core native-JSON regressions verify distinct
YAML 1.1/1.2 integer/boolean spellings, explicit date-only projection, timestamp rejection and
PyYAML y/n behavior. The original LinkML corpus and ODCS default-profile corpus are rerun. Browser
checks repeat twenty metamodel and twenty-two original example exports. Raw-schema acceptance
and native normalization remain separate outcomes.

US-024-AC5: tests/linkml/imports.test.ts validates report schemas, preserved supplied sources,
reachable sets, repeated/cyclic edges, importer-scoped aliases, unknown versions, duplicate/missing
resources and copy isolation. scripts/linkml-imports.ts emits four contexts in both UMF formats;
linkml-import-oracle.py checks two reachable sets and one unresolved graph with native retrieval
guarded. Scoped aliases are marked non-comparable. linkml-import-browser.ts repeats all eight
reports with Node globals absent. Fixtures live in fixtures/linkml/imports/. No native import URI
resolution, closure ordering, cycle legality or merge result is asserted.

US-024-AC6: linkml-class-slots.ts generates 208 local membership reports from 20 sources;
linkml-class-slots-oracle.py compares 206 native outcomes and records one loader rejection covering
two reports. tests/linkml/class-slots.test.ts checks the full report schema, source preservation,
ordered ancestors/slots, duplicate declaration pointers, slot_usage non-membership, cycles, missing
parents, future versions and malformed shapes. linkml-class-slots-browser.ts reproduces all 208
reports without Node globals. Native imports=False is an explicit scope, not import-merge evidence.

The AC6 native split is 158 ordered memberships and 48 missing-parent failures. Attribute
dictionary/name disagreement blocks interpretation; escaped pointer names and unknown metadata
have dedicated source-preservation checks.

US-024-AC7: scripts/linkml-slot-values.ts generates 54 reports from the authored slot-values.json
corpus, covering all 29 scalar field names. linkml-slot-values-oracle.py compares exact projected
values with native SchemaView induction. tests/linkml/slot-values.test.ts validates the full report
schema, both UMF formats, source preservation, provenance, attribute overrides, false/zero semantics,
usage narrowing, identity/list implications, readonly string typing and malformed/coercing input.
Large integers compare via native encoded JSON values, never JS-number fixture parsing. Extreme
exponent tests verify UMF arithmetic only. linkml-slot-values-browser.ts repeats all 54 reports with
Node globals absent. Structured fields, imports and full normalized slots are outside this evidence.

US-024-AC8: scripts/linkml-slot-corpus-oracle.py records native local induction for every class and
slot available in the AC6 twenty-source corpus, after explicitly detaching imports on a private
normalized model. scripts/linkml-slot-corpus.ts compares source-based UMF results and fails on
unexplained field differences. tests/linkml/slot-corpus.test.ts checks source-list coverage, native
query coverage, both UMF serializations, exact recovery and all 347 outcomes (310 successful field
comparisons, 24 membership failures, 13 induction failures). The one loader-rejected source has
preservation evidence only. scripts/linkml-slot-corpus-browser.ts repeats this audit without Node
globals. There are forty source-format recoveries and 347 queries per test/browser run, not 694
separate inductions. Full imported normalization is explicitly outside this evidence.

US-024-AC9: linkml-merge.ts generates four authored import contexts across two policies and two UMF
formats. linkml-merge-oracle.py compares whole normalized candidate models for diamond/cycle cases,
with a guarded native loader and explicit missing-import checks. Scoped aliases remain excluded
from native comparison. tests/linkml/merge.test.ts checks report schemas, original context and
candidate round trips, collision winners, provenance overwrite retention, unknown metadata,
malformed declarations and required policy selection. linkml-merge-browser.ts repeats sixteen
reports and twelve candidates without Node globals. Native counts are eight candidates and four
missing-import outcomes; four further candidates carry only Bun/browser evidence.

US-024-AC10: scripts/linkml-metamodel-merge.ts produces both policy candidates for all ten source
metamodel entries. linkml-metamodel-merge-oracle.py compares complete native normalized models with
retrieval guarded, and records output hashes plus raw/normalized schema outcomes. The twenty raw
candidates each have seventeen compact-notes errors; all normalized candidates validate. Tests in
metamodel-merge.test.ts verify source coverage/hashes, unchanged contexts, closure, selection counts,
shape warnings and forty candidate format recoveries. linkml-metamodel-merge-browser.ts repeats
forty candidate operations and twenty source recoveries without Node globals. Native runtime
container metadata is excluded from definition counts; it is not a schema declaration.

US-025-AC1–3: tests/rdf/rdf.test.ts covers all 87 pinned W3C N-Quads syntax cases plus an authored
schema dataset, hashes, source/candidate round trips, scope/duplicate/lexical preservation, copied
access, atomic failures, unknown representation fields and explicit RDF 1.2 rejection. rdf-oracle.py
compares positive datasets and candidates as reified quad sets up to a shared blank-node mapping.
Plain literals compare as xsd:string and language tags case-insensitively; lexical numbers remain
unnormalized. RDFLib's nine accepted-negative results do not change W3C expectations. Browser
checks cover 54 accepted inputs, 34 rejected inputs, 108 source recoveries and 76 edited exports.
The evidence does not establish OWL reasoning, SHACL validity, empty graphs or other RDF syntaxes.

US-025-AC4: rdf-rename.ts produces 106 candidates from every nonempty baseline positive source plus
all-position/datatype fixtures. rdf-rename-oracle.py rewrites independently parsed native RDF terms
and compares reified dataset isomorphism. tests/rdf/rename.test.ts checks report schemas, per-occurrence
pointers, both UMF formats, source preservation, literal/blank/duplicate fidelity, collision and
invalid-term guards. rdf-rename-browser.ts repeats 106 candidates and three blocked cases without
Node globals. The original native dataset/edit oracle is rerun after extracting shared comparison
helpers; its nine accepted-negative disagreements remain unchanged.

US-025-AC5: rdf-turtle-sources.py captures all 313 official cases and their expected N-Triples graphs.
rdf-turtle.ts verifies syntax outcomes and generates projections/edits; rdf-turtle-oracle.py compares
all 145 official graphs, 219 N-Quads outputs and 204 edited Turtle outputs, recording eleven original
RDFLib positive-source differences and 39 accepted negatives. Tests in turtle.test.ts verify source
hashes, both UMF formats, deterministic noncolliding blank labels, explicit bases, lexical numbers,
IRI rename composition, RDF 1.2 rejection and named-graph loss guards. rdf-turtle-browser.ts repeats
all cases, 438 original recoveries, 204 candidates and the graph-loss guard without Node globals.
Original N-Quads and rename evidence remains unchanged and must pass regression checks.


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

AC9 validation also re-expands every successful authored compact candidate and compares its exact
expanded meaning with the source, including the copied precision edit's expected output. All 14
JSON-LD Bun tests pass with 9,142 assertions; expansion, flattening and compaction Chromium checks,
type checks, browser build and fresh four-file patch installation pass. These are scoped checks,
not proof that the broader UMF completion criteria are satisfied.


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

AC10 verification: all 17 JSON-LD Bun tests pass; the focused framing suite additionally verifies
all 271 pinned resource hashes. Chromium expansion, flattening, compaction and framing regressions
pass with external requests blocked. Type checks, browser ESM/declaration build and isolated fresh
installation of the six-file processor patch pass. This does not close the recorded legacy
compatibility gaps or the wider UMF implementation goal.


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

AC11 verification passes all 17 JSON-LD Bun tests (10,887 assertions), type checks, browser build
and isolated patch installation. Updated Chromium framing and expansion regressions pass with
no external requests. The 26 authored framing cases explicitly compare retained rejected frames
and distinguish PyLD acceptance from normative expected rejection.


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


### SHACL string profile evidence

`umf-string-1` implements code-point lexical length, xsd:string ordering and basic
language-range matching. The 106-case corpus and PySHACL comparison retain six native
disagreements; see CONTRACT-028 for their interpretation and limits. Chromium passed
212 JSON/YAML evaluations, 424 source recoveries and 212 report recoveries with no
external requests or Node globals. Reproduce with `bun scripts/shacl-strings.ts`,
`.cache/shacl-venv/bin/python scripts/shacl-string-oracle.py`, and
`bun scripts/shacl-string-browser.ts` (set UMF_CHROMIUM_PATH when needed).
This remains experimental engine evidence, not complete SHACL conformance.

### SHACL malformed constraint lists

`tests/shacl/lists.test.ts` exercises eight malformed structures across six Core
list parameters (48 cases), plus empty, named, shared and duplicate-triple controls.
Assertions require blocked results without reports or conforms values and exact
source preservation. The official Chromium validation runner also checks a malformed
list after both JSON and YAML recovery. This supplements, rather than replaces, the
remaining static shape-validation requirements.

### SHACL metadata consumption

`native/shacl/metadata.ttl` models an order with multilingual labels, an exact large
numeric order hint, lexical decimal default, scalar and sequence paths, constraints,
group references and unknown policy/rule subgraphs. Bun tests validate the result's
JSON Schema after JSON/YAML recovery, trace labels to source indexes, perform copied
label edits and check unknown-rule preservation. Negative cases distinguish invalid
paths, literal property links and undescribed nodes. The browser runner repeats both
formats and edits without Node globals or external network requests. This is declared
metadata extraction evidence, not a claim of generated form constraint enforcement.

### OWL initial graph evidence

US-029 starts with the W3C Primer appendix (explicitly corrected syntax derivative)
and an authored ontology. The untouched published source is retained as a negative
parse case. Both JSON and YAML recover exact imported text; regenerated Turtle is
independently graph-isomorphic in RDFLib 7.6.0 (202 and 26 triples). Chromium checks
four recoveries and two copied cardinality edits with no network or Node globals.
Tests cover unknown encoding, multiple/blank/missing headers, retained invalid import
terms and atomic RDF rejection. None of this is profile, consistency or entailment evidence.

### OWL expression metadata

The authored expression fixture covers Boolean constructors, individual/data
enumerations, inverse properties, some/all/value/self restrictions, exact qualified
cardinality, onDataRange, n-ary onProperties and datatype facets. JSON/YAML recovery
must preserve literal lexical distinctions and validate the output JSON Schema.
Malformed, cyclic and ambiguous structures must reject without source mutation.
RDFLib independently compares constructor counts and list/facet lengths on this
fixture, the corrected Primer and the earlier authored ontology. That aggregate
comparison does not establish OWL semantic equivalence or a full structural parser.

### OWL negative and n-ary assertions

The special-axioms fixture covers object/data negative assertions, both AllDifferent
list predicates, class/property disjointness, cyclic lists and conflicting records.
Bun tests verify schema validity, JSON/YAML preservation, source-isolated edits,
negative polarity, invalid term roles and inverse property references. RDFLib compares
six extracted targets/member lists after both formats; this is explicit RDF structure
evidence, not an entailment oracle. The dedicated Chromium runner checks both recovery
formats, target distinctions and full source retention.

### OWL axiom annotations

The authored annotation fixture includes two reifications of one assertion, two
levels of nested annotations, a lexically distinct decimal target that must not
match, and a malformed record. Tests validate the result JSON Schema after JSON/YAML
recovery, source-index edits, copy independence and stale-annotation nonattachment.
RDFLib independently confirms the two roots and four reachable records with their
nested links. Browser coverage repeats the fixture through both recovery formats.

### OWL annotation identity boundary matrix

Fifteen authored cases cover matching/nonmatching blank targets, language-tag case
and language differences, datatype and lexical differences, duplicate triples and
structural fields, missing/multiple sources and targets, literal sources, blank or
multiple predicates, and conflicting Axiom/Annotation types. Bun checks both recovery
formats and independently compares all cases with RDFLib 7.6.0. Source occurrence
indexes for duplicates are asserted separately because RDF graphs are sets. The
Chromium matrix repeats the 30 recovery checks, including occurrence counts and exact
source recovery. These checks extend annotation matching evidence only.

### OWL explicit declaration evidence

Exercise all six declaration roles, duplicate triples, overlapping roles on one IRI,
anonymous typed resources, unknown types, undeclared usage and unexecuted imports.
Validate the result JSON Schema and source occurrence indexes; recover both UMF
formats; edit a declaration subject without mutating the original; retain unknown
source and reject unknown encoding during interpretation. Independently compare
named role sets and anonymous role counts with RDFLib for authored, earlier authored
and corrected Primer graphs, including copied edits. Chromium repeats all 12 cases
and six edits with source/view parity and no external requests or Node globals.
These checks do not establish OWL DL legality, inferred declarations or entailment.

### Prioritized core scalar and TableSpec evidence

Verify all nine core scalar families, unknown-family recovery with incomplete
understanding, and rejection of empty/non-string values. TableSpec fixtures must
retain native precision, scale, contextual nullability, embeddings, future fields
and numeric tokens outside JavaScript's safe integer range. Copied column edits
must synchronize derived metadata, preserve unrelated content, reject duplicate
names and malformed fields, and leave the original untouched. Unknown native types
must remove a previous scalar classification without removing their source meaning.

Run `bun test tests/core tests/tablespec`, `bun scripts/tablespec-roundtrip.ts`, the
pinned native model through `scripts/tablespec-oracle.py`, and real Chromium through
`scripts/tablespec-browser.ts`. Native model results compare validation and normalized
meaning before/after both UMF formats; edited cases use independently authored
expected native input. Browser results include copied edits and prohibit external
requests and Node globals. These checks cover the captured monolithic subset;
projections to the other four priority systems remain open.

Split bundle checks now cover filename ordering (including Unicode code points),
all-file exact recovery, unknown siblings and opaque files, shadowed inline versus
sibling derivations, copied column edits, invalid paths and unsupported root edits.
`scripts/tablespec-split.ts` builds captured-provider and authored-sidecar fixtures;
`scripts/tablespec-split-oracle.py` compares native loader output before/after both
UMF formats and against independently constructed expected edits. Chromium repeats
the same four recovery and four edited-bundle comparisons. Loader migration execution
in JavaScript and split-to-monolithic projection remain open.

Avro field-metadata tests cover primitive families, compatible and mixed unions,
logical date/time/timestamp/decimal carriers, invalid precision/scale/capacity,
unknown logical types, named fixed references, nesting and recursive record paths.
Assert full result-schema validity, core-module parity, copied accessor isolation,
stale-metadata rejection and atomic edits that preserve attached field metadata or
reject its reassociation. Apache Avro separately parses original/recovered schemas;
Chromium compares the 26-field view, both UMF formats and a synchronized native edit.
Native acceptance must not be mistaken for scalar constraint enforcement.

PostgreSQL column metadata uses live catalog identity evidence, not formatted-name
matching. The scalar-types.sql fixture covers all nine core families and counterexamples
for arrays, a custom domain named text, JSONB and UUID. Compare all catalog snapshots
across original SQL, UMF-regenerated SQL and dump restoration; retain existing native
behavior probes. Validate the full metadata result schema, both UMF formats, copy
isolation, stale view rejection, candidate edits and attached metadata guards.
Legacy captures lacking nativeType must not gain guessed scalar families. Chromium
compares the live-capture view, recovery and candidate edits without server access.

Parquet core field metadata must use checked logical annotations before physical
carrier families, retain native SchemaElement content and definition/repetition
levels, and omit scalar guesses for groups, INT96 and uninterpreted annotations.
The 30 logical fixtures exercise 15 accepted and 15 blocked schemas; verify the full
result schema, both UMF formats and exact native bytes. A native rename must synchronize
materialized names while preserving annotations and references. PyArrow compares
15 recovered native schemas and eight rows after rename; Chromium repeats 30
recoveries and rename. The broader Parquet suite covers shared rewrite regressions.

SQL Server catalog evidence must come from the pinned native container and authored
DDL, with browser ingestion checked independently. Cover canonical system type IDs,
alias types, timestamp/rowversion binary classification, byte lengths versus character
lengths, MAX, exact identity seeds beyond JavaScript's safe integer range, decimal
precision/scale, collation, nullable columns and computed/default definitions.
Compare captures after replaying authored DDL in two databases; verify byte-preserving
numeric tokens through both UMF formats. Exercise native identity generation,
computed-column updates and rowversion changes. Candidate edits must mark modified
state, synchronize core metadata and reject lost or reassociated attachments.
This does not establish general DDL reconstruction or complete catalog semantics.

SQL Server→Avro schema projection tests must validate the complete result contract,
source retention, all explicit bindings and per-field fidelity issues. The 30-column
native capture uses explicit text representations where a value mapping is unavailable.
Strict policy, modified captures, unresolved versions, missing fields, duplicate
target names, stale core metadata, unsupported precision and invalid fixed widths
must block or reject. Test six-digit temporal mappings with labeled authored inputs.
Apache Avro and fastavro compare target binary/value behavior after both UMF formats,
including bigint, 38-digit decimals, nulls, Unicode, date and fixed bytes. Record
target over-acceptance of tinyint 300 rather than implying native constraint equality.
Chromium compares the entire projection and strict-policy behavior. No schema-only
test may be cited as implementation of a source-row instance converter.

TableSpec→Avro tests cover explicit representation and nullable bindings, named
contexts, missing context/precision, type mismatches, embedding item nullability,
dimension loss, split-source retention and strict-policy blocking. Native Pydantic
checks source-model preservation. Probe both pinned DATE helpers and retain their
disagreement. Apache Avro and fastavro compare binary output and values, recording
their local-timestamp return-type difference and the oracle's exact normalization.
Confirm target acceptance of the wrong vector dimension as a reported constraint gap.
Chromium compares full results and both UMF formats for authored and provider schemas.

### PostgreSQL to Avro schema projection

CONTRACT-034 requires explicit representation bindings, strict-loss blocking, source
retention and both target recoveries. Native PostgreSQL probes verify signed numeric
typmods, negative-scale rounding, fractional-only numeric, NaN, infinity and time
24:00. Authored negatives cover unconstrained/invalid modifiers, duplicate relations
and columns, stale metadata, modified captures and unsupported types. Compare Avro
binary/value behavior in Apache Avro and fastavro, recording local-timestamp API
differences. Target acceptance of smallint overflow and NUL text must remain reported
constraint gaps. Chromium compares the complete projection and both recoveries.

### Parquet to Avro schema projection

CONTRACT-035 verifies nested record/list/map representation, source-byte retention,
strict blocking, exact native field mappings, name overrides and stale metadata guards.
Compare accepted legacy LIST layouts with native element-nullability/structure views;
map-entry arrays must retain non-string keys and duplicates, including key-only maps.
The native fixture covers exact uint64/decimal, nanosecond carriers, fixed bytes and
three null/empty/populated rows. Compare Apache Avro and fastavro bytes and values
through both UMF formats, retaining logical-type warnings and integer range gaps.
Use direct temporal integer carriers where Python datetime would lose precision.
Chromium compares complete results, target schemas and exact source bytes.

### SQL Server constraint capture

SQL Server→Avro must report each captured key/FK/check at its native source pointer,
and report unavailable sections separately for older captures. Native Avro probes
should accept intentionally orphaned/check-violating rows and repeated records,
demonstrating the reported constraint gaps. Chromium compares all three table
projections and six schema recoveries, including strict-policy blocking.

CONTRACT-031/US-031 AC6 require v2 section completeness and explicit v1 availability,
ordered composite key/foreign-key columns, trust/disabled/replication flags, unknown
content retention, copied edits and ambiguity rejection. Compare independent native
DDL executions and both UMF serializations. Probe cascade updates/deletes, duplicate
unique keys, enabled-untrusted constraints, disabled checks and SQL UNKNOWN from null
check operands. Empty sections must be arrays. Browser views and recoveries must match
the captured native observations without claiming full catalog visibility.

### PostgreSQL DDL declaration metadata

US-015 AC11 checks CREATE, nested schema, foreign-table and ALTER declaration paths,
native node copies, qualified builtin scalar syntax and unresolved types. Native
PostgreSQL execution must demonstrate that LIKE/ALTER expands the declared column
list and search_path can resolve text to a user domain. Compare original/regenerated
DDL catalogs. Chromium must run the pinned WASM parser and compare the complete view,
both recoveries and copied edits. Invalid native AST fields and versions block views;
unknown type syntax must not gain a guessed scalar classification.

### Full Bun regression baseline

The 2026-09-21 `bun test tests` run passed all 718 tests across 176 files and 64,038
assertions. Evidence is fixtures/validation/bun-full-suite.json and its hashed raw
log. Type checking and all 165 schema/32 package audits also passed. This verifies
the checked-in assertions at the recorded source fingerprint, not unimplemented
requirements or a fresh execution of every standalone native/browser oracle.

### Portable core metadata selection

US-001 AC6 verifies exact AND/OR filter rules, module-qualified identities, namespace
collisions, future scalar strings, explicit core-reference closure, cycles/repeated
edges and outgoing boundary references. Preserve full source and unknown extension
context without treating native dependency graphs as traversed. Check copy isolation,
accessor rejection, malformed queries, semantic-registry failures and output limits.
All five priority adapters must retain native recovery from the selected view's source.
Chromium compares the mixed-context and five-adapter fixtures through both formats.

### OWL chain, key and disjoint-union lists

The authored list fixture exercises ordered/repeated members, inverse expressions,
multiple lists on one subject, repeated main/list triples, axiom annotations and
unknown content. Negative cases include empty keys, singleton chains, literal heads
and members, missing/conflicting first/rest, cycles, anonymous disjoint-union subjects,
damaged rdf:nil and literal tails. Verify complete result schemas, source indexes,
copied member edits and both UMF formats. RDFLib compares the authored and corrected
Primer samples before/after edits; native blank identities are abstracted for that
comparison, while Bun and Chromium compare exact source-scoped views. No OWL validity,
chain regularity, key enforcement, disjointness or entailment claim follows.

TableSpec projection table metadata: `tests/tablespec/avro-table-loss.test.ts`
checks monolithic/split table edits, primary-key and context-dispatch loss paths,
JSON Pointer escaping, exact unknown integers, strict blocking and both UMF
recoveries. `scripts/tablespec-avro-browser.ts` reproduces complete results;
`scripts/tablespec-avro-oracle.py` records Apache Avro/fastavro acceptance of
repeated target keys without a context discriminator. These are target constraint
counterexamples, not source instance-validator coverage.

TableSpec table metadata inspection: `tests/tablespec/table-metadata.test.ts`
checks both source layouts, copied-result isolation, exact large integers, negative
zero and decimal lexemes, merged split derivations, shadowed source recovery and
JSON/YAML metadata recovery. `scripts/tablespec-browser.ts` compares both metadata
views and four recoveries in Chromium. The existing NativeJson payload schema
remains the return encoding; this is not native semantic-validation evidence.

TableSpec boundary regression: `tests/tablespec/boundaries.test.ts` verifies both
edit APIs reject non-JSON mappings without evaluating accessors, mutating source or
silently losing symbol/hidden properties. Split filename tests include trailing and
internal line terminators. Chromium repeats edit guards and filename parity;
`scripts/tablespec-boundaries-oracle.py` independently checks Python pathlib selection
and fingerprints the fixture and pinned loader source.

SQL Server exact integer boundaries: `tests/sqlserver/integer-tokens.test.ts`
checks import and proposal rejection before numeric rounding can classify native
IDs or qualifiers incorrectly. Six column fields exercise fractional rounding,
underflow, unsafe magnitude and negative zero; exact exponent spellings and unknown
high-precision metadata still recover. The SQL Server Chromium script repeats all
48 rejections and four recoveries. The Python Decimal oracle independently evaluates
24 tokens and records the input fingerprint, without claiming live server execution.

PostgreSQL catalog integer boundaries: `tests/postgresql/integer-tokens.test.ts`
checks version, position, dimensions and modifier tokens through import and candidate
edits. A tiny fractional dimension must not round to zero and enable scalar metadata.
The PostgreSQL column Chromium script repeats 32 rejections and four recoveries;
`python3 scripts/sqlserver-integer-tokens-oracle.py fixtures/postgresql/integer-tokens.json`
independently evaluates 16 exact Decimal tokens. Shared catalog validation is also
covered by the SQL Server suite and browser replay.

TableSpec-to-Avro integer qualifiers: `tests/tablespec/avro-integers.test.ts`
checks 12 precision/scale/dimension boundaries through both UMF formats, retaining
source and blocking unsupported targets. An exact decimal spelling with unknown
high-precision metadata remains projected. Chromium compares all 13 results; the
Avro oracle independently checks Decimal token values and both native codecs agree
on the positive decimal target's bytes and values.

Avro exact integer metadata: `tests/avro/integer-metadata.test.ts` checks decimal
precision, scale and fixed size through direct fields, named references, nullable
unions and copied candidates. Chromium replays 15 cases and 30 recoveries. The
independent integer-metadata oracle uses Decimal for exact-value checks and compares
Apache Avro/fastavro acceptance and warnings before/after 60 recovered schemas.
Native numeric rounding remains explicitly distinct from core classification.

Avro native syntax schema: `tests/avro/native-schema.test.ts` compiles the published
schema and exercises 62 positive/negative cases, including every pinned upstream
schema, and 88 native recoveries. `scripts/avro-native-schema-browser.ts` repeats
syntax validation and recovery in Chromium. The independent native-schema oracle
records both Python parser outcomes for every case and compares 176 recovered
outcomes/warnings. Reference/default/annotation semantics remain separate from
structural acceptance; parser disagreement is evidence, not a failed preservation test.

### Field ideal conformance gate

Run `bun test tests/core-ideals/field-conformance.test.ts` and
`bun scripts/core-ideals/field-conformance.ts` after the five binding acceptance
checks. The gate requires useful targets on all five priority bindings, strict
refusal/report residual pairs, both JSON/YAML recovery directions, unchanged
native extension content, group/record distinction and legacy collision rollback.
The acceptance records' hashes must match the current files. Deliberately changed
source bytes or missing evidence must fail verification.

`fixtures/validation/field-conformance.json` separates useful ideal mappings from
qualified five-system delivery and explicitly denies native equivalence. A stale
fingerprint requires investigating the changed files and rerunning the affected
native/browser and regression checks; refreshing hashes alone is not verification.
The Field gate refresh evidence records the native/browser reruns after correcting
the experimental-envelope diagnostic. Nullability starts only after the Field gate
closes; each later ideal repeats its own admission and delivery audit.


The Nullability core acceptance record now links a second Field evidence refresh:
all five native/browser subsets were rerun after core 0.3.0 integration. New kind
and record-type operation schema dependencies are required fingerprints; deleting
one must fail the gate. Earlier acceptance counts remain historical. The current
core/core-ideals regression and separate Field gate are recorded independently
from the unfinished native Nullability admission/delivery tests.
