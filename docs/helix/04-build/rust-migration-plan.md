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

Core documents remain at 0.10.0. Rust/CLI 0.1.0, SDK 0.10.2 and Python 0.10.6 ship
together under `umf-rust-v0.1.0`. Preserve native values, unknown content, receipts,
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

### Local verification on the completion branch

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
  constraint interpreter, literal kernel, or registry admission. The TypeSpec
  compiler retains its third-party AJV dependency. Source-only engines remain
  until their own consumers have moved.
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

### Remaining source closure

- Retire the source-only Actions analysis, evaluation and plan engines after
  routing their remaining callers through the Rust Action API. Keep transport
  callbacks, public types and the independent execution examples.
- Remove the TypeScript row-scope engine and the obsolete codegen bridge.
  Extract the migration and inventory contracts together because inventory
  calls the old migration renderer. Remove the deployment implementation
  after the callers of that renderer have moved.
- Remove remaining TypeScript model authoring and validation engines as the
  adapters and tooling that still call them move to Rust. Then remove the
  source-only registry admission, document constraint and literal engines.
- Finish removing source-only classifiers, adapter implementations and their
  old projector factories. Keep schema and package data, explicit compiler
  interop and independent native oracles.

## Completed verification

Focused Rust capability baselines and the affected public integration workflows
pass. Source checks pass for generated resources, TypeScript, compile and import
boundaries, strict whole-source access policy with negative controls, Rust core
authority, coupled release versions and SDK packaging.

An independent Cargo consumer builds from the source archive with locked offline
dependencies and executes RDF and GraphQL exact round trips plus native PostgreSQL
import/export/reparse. The macOS CLI parses an ordinary YAML document with an
empty PATH and returns the expected tagged document.

The macOS SDK archive SHA-256 is
`785de2c4db18b030c9462c7f55f52d012db50a4d4b3c608a4dc3aa6f5fa0d39b`.
Its fixed-point source closure is
`f7261a691247692a1ac18b7a2072ae879e99d9216c7f5661dd422ef18984b68c`.
The installed archive passes ordinary document validation/read/write/refusal,
OpenAPI round trip and Avro projection/recovery workflows in Node 26.12.1,
Bun 1.4.3 and Chromium 153. The browser runs without Node globals.

Python 0.10.6 current wheel and sdist exact-source integrity checks pass. The
installed macOS ABI3 wheel passes its public consumer on CPython 3.14.8 with
JavaScript absent from PATH, including PostgreSQL edit/export/reparse and refusal.
The completed source-distribution native rebuild and installed rebuilt-wheel
consumer also pass; the final archive retains the verified native build inputs.
macOS native builds consistently target macOS 11.0 on arm64.

The Linux x86_64 ABI3 wheel passes exact installed-file verification and the
ordinary public/native PostgreSQL consumer on CPython 3.11.17, 3.12.15 and 3.13.16,
with JavaScript absent from PATH. Its SHA-256 is
`9a4fc6e739fb9c0c80e22916490484fb41b6f00985afc53fb81dcca2d72029b9`.
The Linux CLI passes the same empty-PATH YAML workflow as macOS.

The Linux SDK archive SHA-256 is
`0e210969dc6d585d73b0e70d35660421b40c141746389118f7181c54bfcff943`.
Assembly retains the same fixed-point source closure and 2,063 unchanged common
assets, with the Linux native addon and recorded build provenance. The installed
archive passes the document, OpenAPI and Avro workflows on Node 26.12.1 and
Bun 1.4.3 in the cached Linux x86_64 runtime.

Sol has reviewed the implementation, host routing, source/resource closure and
release preparation and the completed Linux artifact results.

## Integration and release

Refresh main before integrating PR61. Preserve tested artifact inputs; account for
actual incoming source changes without reopening unrelated passing capabilities.
Publish one [umf-rust-v0.1.0 release](https://github.com/DocumentDrivenDX/umf/releases/tag/umf-rust-v0.1.0)
containing the Rust source library, macOS arm64 and Linux x86_64 CLI archives,
matching SDK archives, two Python ABI3 wheels, the Python sdist and SHA256SUMS.
Bind the Rust source archive and tag to the merged revision. Retain native build
provenance and the SDK archive verifier's source and member integrity checks.

Use the Rust-tag dispatcher exclusions; do not run GitHub Actions. Verify the
published revision, exact asset roster and downloaded checksums. The distributed
Rust crates retain `publish = false`.

## Acceptance

Every UMF-owned executable operation exposed by the current public interfaces has
a Rust owner and passes its capability baseline. Library, CLI, Python, Node/Bun and
browser entry points execute that owner while preserving current meaning, unknown
content, caller callbacks and controls. Installed artifact checks pass, review is
resolved, main is integrated, and the published artifacts contain the completed
port. Publication and verification close the goal.
