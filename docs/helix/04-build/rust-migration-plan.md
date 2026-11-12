---
ddx:
  id: umf.plan.rust-migration
  type: implementation-plan
  activity: build
  authoring:
    home: repo
  links:
    - id: umf.prd
      kind: informed_by
    - id: umf.cross-cutting-requirements
      kind: informed_by
    - id: umf.architecture
      kind: informed_by
    - id: ADR-006
      kind: informed_by
    - id: ADR-004
      kind: references
    - id: ADR-005
      kind: references
    - id: CONTRACT-080
      kind: references
    - id: TP-001
      kind: informed_by
    - id: umf.implementation-plan
      kind: references
---

# Shared Rust port plan

## Objective and decisions

UMF-owned executable semantics have one Rust owner. The Rust library, native CLI,
Python extension, Node/Bun addon and browser WebAssembly interfaces execute that
implementation. Wrappers admit host values, transport explicit capabilities and
present results. ADR-006, the PRD, cross-cutting requirements, architecture, TP-001
and the affected contracts govern behavior.

Core documents remain at 0.10.0. Release versions are shared across Rust, CLI,
SDK and Python artifacts. Preserve native values, unknown content, receipts,
resource controls and caller capabilities required by the current APIs.

## Implementation

Rust owns core/model/registry operations; native formats and schema adapters;
RDF, JSON-LD, SHACL and OWL; TypeSpec and Smithy compiler routes; authored targets
and core-ideal classifiers; binding, DDD and physical SQL projections; Bit128,
medical and dataset operations; Actions, plans, Saga and security; dashboard,
catalog, lifecycle, inventory and migration operations; row scope, digests and
reports; Arrow, Parquet, Delta, Protobuf and Relationship Extra archive import.

Public Node and browser roots route callable operations and validation to Rust.
Python calls the native extension and bundled Rust CLI without a JavaScript
subprocess. The default SDK excludes retired reference/candidate executable
exports and drivers. Required schemas, metamodel programs and runtime resources
are packaged explicitly, with current versions and dependent pins aligned.

Host resource registration, explicit compiler/worker factories and pointer
formatting remain host responsibilities. Callback identity, order and configured
controls are retained. Each Rust operation uses its passed Context; a Context
object does not cross the JavaScript boundary.

## Implementation and test discipline

GPT-6 Luna agents implement and test independent capabilities in parallel;
GPT-6.1 Sol plans and reviews their source cuts. Give each capability a concrete public
operation and an ordinary normal/refusal workflow, with recovery where relevant.
Repair observed failures and rerun affected workflows. A passing capability stays
closed unless its implementation or dependencies change. Batch native compilation
and retain incremental build outputs. Preserve user `.tmp/`.

All testing and CI work runs locally. Do not wait for GitHub Actions or dispatch
publication builds. Publish the locally tested binaries directly.

## Remove superseded TypeScript semantics

The current public runtime routes execute Rust, but superseded TypeScript semantic
implementations still remain in the source tree. Remove those implementations and
their obsolete consumers. Keep purposeful host wrappers, examples, development
tooling and TypeSpec interop. Extract live type contracts and static package data
where necessary; do not replace deleted engines with compatibility shims. Earlier
retention or archive requirements do not constrain this cleanup.

The completed first cleanup batch removes nine semantic implementations:

1. Delete `src/projections/openapi-json-schema.ts`. Keep the Rust default wrapper,
   extract its two live public interfaces, and update its type, barrel and direct
   consumers. The public Node/browser operation continues through the Rust owner.
2. Delete the four TypeScript report engines in
   `src/core-ideals/classification-report.ts`, `structured-report.ts`,
   `field-report.ts` and `record-report.ts`. Extract the live report contracts and
   update consumers to `reports-rust-default.ts` through the current public root.
   Remove obsolete corpus/parity drivers instead of retaining old engines for them.
3. Delete the GraphQL-input and Avro JSON Schema projectors. Retain their types and
   update Orders to receive Rust-backed projectors from Node or browser hosts.
4. Delete the TypeSpec and Smithy JSON Schema projectors. Keep their type contracts,
   compiler/emitter integration and explicit Smithy JavaScript backend. Route the
   surviving Smithy oracle through the current Rust public root.

The historical field-conformance checker and its caller entry are also removed.
Its useful current group/opaque-metadata refusal case now exercises the Rust
public API. Old implementation test suites, report corpus/browser drivers and the
obsolete TypeSpec materializer outputs are deleted; no compatibility delegates or
empty legacy modules are retained.

Sol reviews each deletion and combines shared barrel/generator changes. Check
that deleted imports are absent, regenerate the affected facade/source inventories,
run TypeScript checks, and execute one existing ordinary Rust public-root workflow
for each affected capability. Do not rerun a broad predecessor corpus.

Both TypeScript configurations, facade freshness and core authority checks pass.
Affected native public-root baselines and Orders tests pass. Five tests exceeded
Bun's default five-second timeout; only those cases were retried with
`--timeout 60000`, and all passed. The changed Orders browser consumer passes in
Chromium 153.0.8010.12 with its served WASM asset, no external requests, no Node
globals and unknown metadata preserved. Rust executable sources are unchanged;
the checks reuse the released native addon and WASM build.

Continue with adjacent projection families, classifiers and adapters as coherent
source cuts. Update their purposeful consumers directly, preserving TypeSpec and
other explicit host interop. Remove a shared semantic helper when its last live
consumer has been removed or moved to Rust. Keep each cut reviewable and advance
independent ready deletions without an exhaustive inventory gate.

## Current-main completion slices

Lakeview and bulk action coordination now run through shared Rust dispatch on
the Node and browser SDK roots. Their TypeScript semantic implementations have
been removed. The hosts still construct JavaScript maps, preserve JavaScript
value shapes, and present errors from the bindings.

| Slice | Dependencies and scope | Local acceptance |
| --- | --- | --- |
| Lakeview legacy dashboard projection | CONTRACT-083. Preserve the projection signature, ordered module and element maps, and loss diagnostics. Keep the native import and export routes. | Use `tests/lakeview/legacy-projection.test.ts`, `tests/lakeview/interchange.test.ts` and `scripts/lakeview-browser.ts` for ordinary projection, unsupported native meaning and exact native round trip. |
| Bulk action coordination | CONTRACT-904 and STP-907. Move the transition, decision, fence and token operations together. Preserve receipt shape, refusal precedence and exact decimal fences. | Use `tests/actions-bulk-state.test.ts` and `scripts/actions-bulk-state-browser.ts` for submission, claim, authorization and guard refusal, stale fences, reconciliation and token handling. |
| Raw table binding inspection | Both V4 roots use Rust for profile validation, membership and diagnostics. The TypeScript host presents binding errors and exports the profile data and public types. | Use `tests/binding/raw-profiles-rust-route.test.ts` and `scripts/binding/raw-profiles-rust-browser.ts` for acceptance and refusal. Route the retained cases through the public owners before deleting the predecessor inspector. |

Start the projection removals after Lakeview and bulk action work starts.
These cuts reuse existing Rust owners and can proceed independently of raw
table binding.

1. Extract the live contracts from `src/projections/arrow-spark.ts` and
   `src/projections/spark-arrow.ts`. Update `arrow-spark-rust-default.ts` and
   `src/index.ts` before removing both engines. Use
   `tests/rust-core/arrow-spark-projection-public-root.test.ts`.
2. Extract the contracts from `src/projections/avro-tablespec.ts`,
   `tablespec-avro.ts`, `parquet-avro.ts`, `postgresql-avro.ts` and
   `sqlserver-avro.ts`. Redirect the corresponding Rust wrappers and public
   type imports, including the direct PostgreSQL policy import in the
   TableSpec chain test. Remove `tablespec-via-avro.ts` after moving its
   public contracts and routing its operation to the Rust wrapper. Then
   remove the five stage engines. Use
   `tests/rust-core/{avro-tablespec-projection,tablespec-via-avro,parquet-avro,postgresql-avro,sqlserver-avro}-public-root.test.ts`.

DDD JSON Schema, PostgreSQL row JSON Schema and SQL Server DDL are further
independent projection removals with existing Rust public-root tests.
Extract the shared projection diagnostic contract from
`src/projections/json-schema-protobuf.ts` before removing that engine.
Continue by family through classifiers, adapters, actions, binding,
security, table lifecycle, model and validation. Follow both V4 roots,
the reference barrel and direct imports in wrappers, tests, scripts and the
microsite. Update purposeful consumers before removing their engines and
delete obsolete predecessor drivers. Keep host wrappers, static package
data, live declarations, examples, development tooling and explicit
TypeSpec and Smithy interop.

### Runtime ownership follow-up

- SQL Server CHECK predicate inspection uses one parser, in Rust. Route the
  predicate cases through the Node and browser SDKs. A rejected conjunction
  must retain the source and return no candidates, including when the first
  clause is supported.
- The SDK Registry delegates duplicate and replacement admission and callback
  order to Rust. JavaScript retains the callback objects and invokes them in
  the returned order. Check same-manifest replacement, changed-manifest
  refusal, and registration with a caller-supplied kind runtime.
- The loader subpath compiles and validates schemas in Rust on both SDK hosts.
  Check a registered reference, exact equality, failed validation diagnostics,
  and the conditional package exports. The facade exposes `addSchema`,
  `compile`, `getSchema` and each predicate's `errors` property. The browser
  root and loader share the generated WASM module.
- The private security catalog routes policy and ontology admission, program
  expansion and rule selection, condition lowering and dependency planning,
  inventory coverage, disclosure and recipe selection, write comparison and
  action planning, and atomic batch assembly through Rust. The Node and WASM
  adapters carry detached inputs and return ordered positions or receipts.
  Host code retains the original issued handles, applies the shared operation
  ledger, and supplies typed fact and graph lookups to the evaluator.
  The shared text ledger counts literal data and retained identities. Field
  definitions use the source text bound, and repeated Field lookups still
  consume work units.
  Verify the private action, disclosure, write and batch results against the
  logical catalog fixtures. Its result envelopes carry `complete: false` and
  `authority: false`.

### Local verification on the completion branch

- The SQL Server CHECK corpus passed in Bun and Chromium; Chromium matched
  all 75 cases and made no external requests. Registry replacement and
  custom runtime checks passed in Bun with the Lakeview interchange baseline.
  The packaged loader passed on Node, Bun and Chromium, including rejected
  schema registration, exact equality and independent validator instances.
  Chromium loaded the SDK root and loader with one WASM binary request.
- The private security catalog passed focused action, write snapshot and
  cumulative budget checks in Bun. The WASM condition callback passed a
  Chromium check for lexical bindings, UTF-16 equality and short circuiting.
  The current port also passed selected graph source and witness checks,
  graph and flat write authorization, mixed operation and scan batches,
  Gregorian recipe rendering, and the V2 disclosure batch corpus with
  181 assertions across provenance, codecs, and shared budgets.
- Lakeview passed the projection and interchange baseline, a 37-case comparison
  with the predecessor, and direct, JSON and YAML native-source round trips in
  Chromium. Stock Node verified the returned map order and a projected field.
- Bulk action coordination passed the transition baseline, 158 matching browser
  cases and a stock Node receipt check. Raw table binding passed nine exact
  Browser WASM cases for the three supported profiles and the Bun binding
  baseline. Python and the standalone Rust CLI matched for Lakeview projection,
  bulk submission and claim, stale-fence refusal, and raw table binding
  acceptance and refusal.
- Arrow and Spark, Avro and TableSpec, Parquet and Avro, PostgreSQL and Avro,
  SQL Server and Avro, DDD JSON Schema, and the three binding projections for
  Parquet, Delta and Iceberg passed their focused public baselines. The
  PostgreSQL binding index and DDD table and relationship family passed eight
  additional public tests.
- Private typed Access compilation now uses the Rust code generator. Its
  exercised cases cover package output, search, diff and structured refusal,
  including the failed admission case corrected on this branch.
- SQL Server binding and physical projection, the Avro cardinality classifier,
  JSON Schema to Protobuf, DDD GraphQL, Arrow IPC and FlatBuffers, and Core
  Evolution passed their public baselines after the predecessor deletions.
- The reference workbench initializes Rust WASM in its worker. Chromium passed
  SDK-profile validation, pinned Protobuf source compilation, and JSON Schema
  projection with both reported loss and strict refusal under the deployed
  content security policy. The playground passed UUID recovery, retained
  unknown extensions and refused an invalid core version in Chromium. The full
  reference site built locally, and Chromium downloaded the projected
  Protobuf source. The separate schema explorer built and recovered Arrow IPC,
  canonical Protobuf descriptors, and the exact OWL and SHACL source bytes.
- Neither public SDK bundle emits UMF's legacy TypeScript document validator,
  constraint interpreter, literal kernel, or registry admission. The explicit
  SDK loader subpath also uses Rust for schema validation. TypeSpec retains
  its compiler interop.
- The SHACL engine deletion exposed native gaps in mixed numeric promotion,
  conversion limits, embedded reports, and untyped or recursive shapes. Mixed
  float/double and decimal/float promotion, binary32 conversion refusal,
  disconnected shape recursion and executable-rule refusal passed. The W3C
  closed-shape example with an inverse property path matched its expected
  validation result and retained its source. Derived integer bounds passed
  the `xsd:byte` acceptance and refusal cases.

### Current-main parity gate

Compare the exported names, types, signatures and runtime results with the
current public surface on Node/Bun and browser. Trace callable operations
through the binding to Rust and verify that direct consumers no longer
invoke retired engines. Regenerate the V4 facade and affected source
inventories. Run both TypeScript configurations, facade freshness and
the affected boundary checks.

Exercise a representative ordinary workflow and refusal for each changed
capability, plus recovery where the API supports it. Verify result and
diagnostic shape and order, native meaning, unknown extension content and
caller controls at the affected public entry points. Use local Chromium for
changed browser workflows. Reuse passing results whose inputs and
dependencies are unchanged.

### Source closure

- The old row-scope, deployment, migration, inventory, table lifecycle and
  Python client generation engines have been removed. Their public contracts
  now reference Rust wrappers and type modules. Chromium compiled and verified
  a deployment and compiled its initial migration. Python generation produced
  exact matching files in Node V4 and Chromium WASM across four packs.
- Removed duplicated Core authoring, prepared inspection, record and dataset
  value implementations. Local baselines cover current authoring, owned
  inspection snapshots, dataset receipt isolation and host admission order.
- Removed duplicate adapter and classifier bodies for Arrow, Avro, Parquet,
  PostgreSQL, SQL Server, TableSpec, JSON Schema, OpenAPI, RDF, JSON-LD,
  Spark, Delta, Iceberg, dbt, GraphQL, LinkML and ODCS. Native checks exercise
  projection, refusal, recovery, archive retention and catalog inspection.
  The two current generalized RDF cases exercise forward quad deduplication
  and reverse projection with retained blank predicates in JSON-LD 1.0
  report mode.
- The workspace source barrel selects the same Rust-backed host as the SDK.
  The Node public surface still has 2,018 names and 1,163 runtime exports.
  The browser surface still has 2,017 names and 1,162 runtime exports. The
  type and value facets match the pre-removal surface on both hosts.
- The Rust metamodel compiler emits the 15 portable outputs. The TypeScript
  generated validators and runtime Registry, document and literal engines
  have been removed. The reference self-model check runs through the native
  Rust CLI. Independent metamodel oracles remain under `tests/metamodel/`.
- The action reference tools and private protection experiments use the
  same Rust literal validation and identity code as the library. Public
  security regression checks distinguish explicit null from absence and
  verify that an empty result cannot skip admission or authorization.
- Smithy and TypeSpec retain their explicit compiler host adapters. The
  TypeSpec smoke cases passed exact JSON/YAML recovery, compilation, semantic
  graph extraction and pinned JSON Schema emission. The medical and SEC
  projection engines also use Rust.
- Python ABI3 and the Rust CLI agreed on Smithy bundle import and export,
  inspection of an unknown dependency descriptor, and export refusal. The
  round trip preserved `1.7976931348623157E+309` exactly with an empty PATH.
  Bun and Chromium verified that unknown dependency descriptors also refuse
  assembly before invoking the compiler callback.
- The public-company source export passed after the Rust TableSpec binding
  began reusing its compiled built-in schemas. The runtime keeps each
  request's admission, cancellation and work accounting in its own context.
  Medical family export shares the runtime across its five members. Its
  byte recovery and version, checksum and redistribution refusal tests passed.
- The local SDK archive verified all 1,988 hashed members. The extracted SDK
  passed the current document, OpenAPI and Avro checks on Node, Bun and
  Chromium. The pack tooling produced DDL, ORM, CRUD and a source companion
  for a keyed table and reported the key requirement for a keyless table.
  NodeNext and browser TypeScript declarations passed with `skipLibCheck`
  disabled. The rebuilt archive's runtime modules matched the tested modules
  after accounting for temporary build paths and native link metadata.

## Integration and release

Refresh main before integrating. Keep the local source and artifact verification
receipts tied to the tested revision. Build release artifacts locally and verify
the published tag, exact asset roster and downloaded checksums. The Rust source
archive, native CLI, SDK and Python artifacts share the release version. The
microsite uses the same Rust WASM implementation for its browser workflows.

## Acceptance

Every UMF-owned executable operation exposed by the current public interfaces
has a Rust owner and passes its capability baseline. Library, CLI, Python,
Node/Bun and browser entry points execute that owner while preserving current
meaning, unknown content, caller callbacks and controls. Installed SDK checks
cover native Node and Bun, the Chromium WASM path and TypeScript declaration
resolution. Each release records the merged source revision and verification of
its published artifacts.
