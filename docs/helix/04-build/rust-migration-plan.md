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

## Objective

Move UMF-owned executable semantics to one shared Rust implementation and expose
them through the Rust CLI, native Python, Node/Bun and browser WebAssembly
interfaces. The current passing Rust library is an implementation milestone, not
completion of the port. Wrappers handle host admission and presentation; Rust owns
model, validation, adapter, projection and generator decisions under ADR-006.
Delete historical qualification reports, retirement ledgers, source custody
chains and receipt-based build gates at the owner's request. Keep executable
regression cases as ordinary fixtures.

ADR-006, the PRD, cross-cutting requirements, architecture, TP-001 and the affected
adapter contracts govern behavior. Preserve exact native values, unknown content
and explicit resource boundaries. Core is 0.10.0; the native Python candidate is
0.10.4 with matching dependent-package pins.

## Implementation slices

1. Complete the current Rust foundation. Run the default Cargo library and CLI
   suite under the stable test profile (`opt-level = 1`, debug assertions and
   overflow checks enabled), check production boundaries and generated metamodel
   outputs, and verify source packaging and an independent Rust consumer. Use
   this evidence to support the following kernel and host-activation work; the
   complete port and release remain the objective.
2. Activate existing native kernels through tagged wire and CLI routes, starting
   with OpenAPI and LinkML/ODCS. Keep exact UTF-16/value transport, unknown
   content and caller controls. For each new route, run one end-to-end operation
   and one malformed-request refusal before broader integration tests. Add the
   GraphQL host callback bridge so Rust completes edit prevalidation before the
   host callback runs.
3. Implement the remaining semantic families in reviewable cuts. Start parallel
   RDF semantic work (JSON-LD, then SHACL and OWL) on the existing RDF core and
   relational/TableSpec work on the existing core-ideal kernels. Complete the
   remaining Delta/Iceberg/Spark behavior, cross-format projections, action and
   security operations, and TypeSpec/Smithy compiler-backed operations. A source
   archive or parser alone is not completion of compiler or assembly semantics.
4. Activate every implemented family through the shared Rust API, CLI where
   applicable, Python, Node/Bun and browser WASM. Replace wrapper-side semantic
   execution rather than retaining a hidden JavaScript or Python fallback.
   Generate language-specific clients from the Rust-owned compiler and rules.
5. At integration points, run the affected functional baselines and complete
   current Rust, binding, packaging and real-browser suites. Test additions
   target new capabilities and failures; do not repeat broad historical
   qualification matrices after each small edit. Run checks locally without
   GitHub Actions.

Use the existing worktree. Luna handles implementation; Sol plans and reviews.
Use one expensive build/test job at a time. Preserve user-owned `.tmp/`.

## Current State

The focused native adapter checkpoint now passes SHACL/OWL 2/2,
PostgreSQL catalog/raw-SQL 12/12, and five new native capability cases: pinned
PostgreSQL C parse/edit/deparse/reparse and version refusal, JSON-LD frame
options, Avro source operations, and parser-session codec-loss refusal. Fresh
Node public-root tests pass for the retained-model Registry, document
read/write, SHACL validation and OWL views, and RDF import/edit/export with its
native payload inspector. A public `umf.adapters` Python test passes from a
staged package and fresh extension with no PATH tools; the fresh CLI advertises
SHACL, OWL and PostgreSQL routes. A fresh Node build passes the new PostgreSQL
native SQL, Avro, Iceberg schema and Protobuf source callback flows. Python
PostgreSQL native SQL and the public RDF
edit/export/payload-inspector flow pass with no PATH tools. The SHACL
language-range wire case passes.
Fresh Node public-root Delta schema/table/log source flows and a malformed-source
refusal pass, as does the public Python schema/table/log edit/export/refusal flow.
These results do not establish a release wheel or release-profile browser build.

The first development WASM Chromium public-root run completed positive checks
for Registry/document validation, RDF edit, SHACL/OWL, Avro edit, JSON-LD frame,
Delta schema/DDL, Iceberg table rename, TypeSpec compile/graph, Action rule,
deployment compile/verify and protection query. Its final RDF refusal exposed
unbranded WASM error forwarding; the corrected bundle passed an isolated
`RDF_SYNTAX` public `UmfError` retry with Node globals absent. A separate Avro
projection browser case passed normal and strict-loss paths with external
requests blocked. These are development-WASM checks, not release SDK acceptance.

| Capability | Present source and checked behavior | Next implementation |
| --- | --- | --- |
| OpenAPI, LinkML, ODCS, TableSpec and SQL Server | Rust wire/CLI routes and actual Node public-root flows pass. TableSpec's nine operations and SQL Server's catalog/facet routes are callable. | Finish browser and Python public activation for the remaining operations. |
| Shared Registry and documents | Default Registry admits packages and validates extension structure through the retained Rust model; native read/write keeps the public YAML default. Actual Node public-root validation, callbacks, YAML roundtrip and refusal pass. | Exercise the same default path in the final browser and package integration. |
| Table deployment | Existing Rust codegen compile/verify routes drive Node/browser default exports. Node public-root lifecycle fixture compiles to SQL, retains exact source, verifies its bundle, and refuses invalid configuration or modified SQL (2/2); development WASM Chromium compile/verify passes. | Complete the distinct migration and row-scope contracts below and verify the release-profile browser package. |
| GraphQL | Rust pre/post-validation host callback and Node/WASM default routes are integrated; actual Node callback edit/export and prevalidation refusal pass. | Complete browser host integration. |
| JSON-LD | Source, expansion, flattening, compaction, RDF conversion, compound literals, generalized input, framing and payload inspection are wired. Focused wire, Node public-root, Python extension, CLI and development WASM Chromium baselines pass. The new scalar-default, graph, pruning and compact-option frame wire case passes. | Implement structured `@default` and remaining frame semantics; the current Rust route explicitly refuses unsupported structures. Check the release-profile browser build at integration. |
| RDF and generalized RDF | Seventeen existing Rust operations drive the Node/browser default roots. Node import/edit/export, native Registry inspection and refusal pass; Python RDF edit/export/payload inspection and refusal pass. The development WASM browser public root exercised RDF Registry validation and edit/export; its isolated `RDF_SYNTAX` public-error retry passed after aligning WASM error branding with Node, with `process` and `Buffer` absent. | Verify the remaining Python generalized-RDF operations and release-profile browser package. |
| SHACL and OWL | Rust wire tests pass 2/2; Node public-root SHACL validation, OWL view and refusal pass. Development WASM Chromium validation/view checks pass. SHACL reports its real `umf-shacl-native-subset/2` identity and incomplete evidence for unsupported constraints; basic `languageIn` range/wildcard support passes its focused wire case. | Complete remaining supported constraint semantics, Python activation and release-profile browser checks. |
| PostgreSQL | Catalog capture, supplement inspectors, resolved predicates and parser-session raw SQL routes pass 12/12 focused wire tests. The host-only `pg_query` 6.1.1 C path passes import→AST edit→deparse→reparse and unsupported-version refusal; codec-loss refusal also passes. Fresh Node and Python public native SQL flows pass. The caller-supplied parser's Rust-owned session wire and actual Node callback-failure→retry flows pass through the public root. | Verify the caller-supplied browser host route and published package declarations. |
| Avro | The existing Rust document kernel is exposed through import/inspect/metadata/get/edit/export/bundle wire routes; focused source roundtrip/dependency refusal and fresh Node public-root flow pass. Development WASM browser public-root import/metadata/edit/export and the separate Avro→JSON Schema normal/strict-loss case pass with external requests blocked. | Verify Python public operations and release-profile browser package. |
| Iceberg schema and table | The standalone schema Rust kernel drives default Node/browser wrappers for import/inspect/export/get/edit and a native Registry payload inspector; Node public-root import/edit/export and refusal pass. Table core/wire/CLI source, context, transform, rename and promotion operations pass seven focused wire cases; Node import→rename/promotion→export, native Registry validation and branded refusal pass, as does public Python edit/export. Development WASM Chromium table import→rename→export passes. | Verify browser promotion/refusal and the release-profile package. |
| Parquet | The existing Rust capture, footer, schema, page, value and metadata-edit operations drive both default roots. The fresh Node public-root fixture capture→metadata append→export and oversized-source refusal pass. | Activate and verify browser and Python public routes. |
| Protobuf sources | Existing Rust source sessions now back the Node/browser default `importProtobufSources` and `exportProtobufSources` Promise APIs; a fresh Node public-root tiny Go compile→descriptor edit→emit case passes. | Verify the browser callback flow. |
| Delta schema, table and log | Existing Rust kernels drive the Node/browser default schema/table/log routes, including native payload inspection and table embedded-schema extraction. Node schema/table edit→export, log capture/inspect/export, Registry callbacks and malformed-source refusal pass; Python schema/table/log edit/export/refusal passes. Development WASM browser schema edit/export and managed DDL checks pass. The distinct JSONL sidecar route is now callable and has a focused wire success/missing-supply refusal and two Node public-root cases passing. | Implement mapped rename; verify JSONL sidecars and the remaining source routes in a browser and the final package. |
| Python native transport and generic CLI | The public `umf.adapters` family dispatcher passes a staged-package roundtrip, refusal and resource-limit baseline with a fresh extension. The Rust `umf adapter FAMILY --stdin-wire` route passes a focused metadata→Delta import/export→malformed-source refusal case without JavaScript on `PATH`. | Include new adapter resources and verify the final wheel/sdist. |
| Saga browser SDK subpath | Runtime source and default SDK asset integration are present. | Run one representative host baseline at the next SDK integration point. |

## Active implementation queue

Each row identifies a current public surface that still needs a Rust-owned
semantic path or a verified default entry point. Focused tests exercise new
behavior; already green targets are excluded from routine reruns.

| Public capability | Work type and owner | Next baseline and done criterion |
| --- | --- | --- |
| Caller-supplied PostgreSQL SQL backend | Existing session and Node/WASM default bridge are wired; Rust wire and actual Node callback retry pass. | Verify the same supplied-backend route in Chromium and the published Node types. Exact backend identity, one-shot tokens, cumulative controls and public Registry inspection must hold. |
| Iceberg table source and evolution | Existing table kernel, Node/WASM FFI, native-family route and default facade are wired; Rust wire, Node normal/refusal and Python public flows pass. A development WASM Chromium import→rename→export check passes. | Verify promotion and refusal in the release-profile browser package. Preserve historical schemas, unknown fields and exact native numbers. |
| Parquet capture and edit | Existing kernel drives both default roots; actual Node capture/edit/export and refusal pass. | Verify public browser and Python routes for the same operations. |
| TypeSpec compiler and emit | Rust source admission and one-shot compiler prepare/complete wire pass 2/2. Node/Python/CLI builds pass, Python and interactive CLI session baselines pass 2/2. Public Node passes pinned compiler→qualified semantic graph→JSON Schema emitter and invalid-path refusal; development WASM Chromium passes pinned compiler and graph over a tiny source. | Verify browser emission/refusal and packaged declaration closure. |
| Smithy assembly and selection | Rust now owns source/JSON import, exact get/edit/export, assembly and selection admission through a bounded host session. Its five focused wire cases pass; fresh Node public-root assembly→selection through pinned Smithy Model 1.73.0/TeaVM 0.15.0 and unsafe-source refusal pass 2/2. Public Python and interactive CLI prepare/complete/select with supplied schema-valid responses and path refusal pass 2/2. | Verify the supplied-backend browser route and packaged resource closure. The Python/CLI tests exercise Rust session admission with explicit responses, not TeaVM execution. |
| Delta log capture and commit reconciliation | Existing kernel and default routes now cover capture, export, action inspection and `reconcileDeltaCommits`; fresh Node log capture/inspect/export and public Python capture/export pass. | Exercise commit reconciliation through the public route, then browser activation. |
| Delta Parquet action projection | Rust decodes Parquet capture rows and projects exact Delta actions/scalars while retaining authoritative Parquet source. The focused wire target passes 2/2, the Node public-root normal/blocked cases pass 2/2, and the public Python projection/refusal case passes with no partial action/log on refusal. | Verify the browser route, then use this kernel for checkpoint, sidecar and multipart recovery without restoring the legacy projector. |
| Delta checkpoint, sidecar and multipart recovery | Rust handles Parquet checkpoint replay at nonzero V1 and V2 with explicitly supplied sidecars; two focused wire cases, Node public-root normal/refusal and Python checkpoint/refusal pass. It also assembles explicit multipart Parquet checkpoints in ordinal order, preserving source/version and refusing duplicate part identities without a partial recovery; multipart wire 2/2, Node 2/2 and Python normal/refusal pass. The distinct JSONL checkpoint sidecar route now retains the complete derived source while filtering V2 control rows only for replay. Its new focused wire success/missing-supply refusal case and Node public-root normal/refusal cases pass. | Verify JSONL/Parquet checkpoint and multipart public browser routes and Python JSONL sidecar dispatch. |
| Delta schema and table | Existing Rust import/get/edit/export and native Registry inspectors drive Node/browser defaults; fresh Node and Python table/schema edit→export and a malformed-source refusal pass. | Implement mapped rename and verify the new default routes in Chromium. |
| Delta definition, DDL and Spark realization | Rust owns `defineDeltaTable`, `generateDeltaDDL`, ordered `generateDeltaDDLBundle` and local `realizeSparkDelta4DDL` through core/wire/default routes. DDL wire 2/2 and new Spark/bundle wire 3/3 pass; fresh Node public-root DDL/Spark normal/refusal cases pass 4/4, and public Python DDL/Spark cases pass 2/2. No Spark execution or remote target admission is claimed. | Verify the browser public route, then continue the separate Delta Parquet action/checkpoint/sidecar recovery kernels. |
| Spark schema and metadata | New Rust semantics; next adapter lane ports import/inspect/export/get/edit, metadata/collation/parameter diagnostics and rename. | One public schema edit→export/inspect and one invalid-schema refusal. |
| Action evaluation and planning | Existing Rust `evaluateActionRule` has codegen wire and Node/browser default routes; Node typed-integer equality and unknown-operator refusal pass 2/2, public Python action rule passes, and a development WASM Chromium equality check passes. `prepareActionPlanModel`, `inspectActionPlan` and `assessActionPlan` still need a registered Rust artifact/claim kernel and bounded explicit Registry/selection callback session; a scratch core/wire implementation is under review, not yet compiled. | Land and test the Rust-owned Action Plan session with one eligible and one blocked public flow, then verify its browser host boundary. |
| Remaining action APIs | Classify the current default barrel's other executable `extensions/actions` exports against `umf-codegen` and port each unowned decision before removing the legacy barrel. | A representative public action inspection→execution workflow reaches Rust, with unsupported actions explicitly refused; every current action export has a Rust route or an intentional nonsemantic static export. |
| Protection-value assessment | Existing Rust kernels now drive the Node/browser default `inspectProtectionFunction` and `evaluateProtectionValue` exports; focused Node public-root typed-constant transformation and wrong-input refusal pass (2/2). | Verify the browser public root, preserving immutable report presentation. |
| Protection query properties and remaining security APIs | The Rust kernel drives the default `inspectProtectionQueryProperties` export; Node deterministic join and unknown-operator refusal pass (2/2), and a development WASM Chromium join check passes. Parameterized-range identity reuses the core typed literal primitive and supports distinct authored buckets; two focused Rust cases pass (2/2, 87 filtered), and the new public Node same/different-bucket case passes. Prefix/suffix object property identity now preserves unknown members and canonical key order; its new public Node same/different case passes. Other executable `extensions/security` exports need classification and Rust ownership. | Verify browser range/prefix cases, then route each remaining executable security export through Rust or identify it as intentional nonsemantic static data. |
| Avro-to-JSON-Schema projection | Rust owns recursive Avro shape and loss decisions through a closed projection wire, native-family route and Node/browser default export. Focused wire 3/3 and Node public-root ordinary/strict-loss pass while retaining the source; a separate development WASM Chromium normal/strict-loss case passes with external requests blocked. | Verify the Python route and release-profile browser package, retaining explicit loss reports for unsupported Avro meaning. |
| Remaining cross-format and model projections | The default barrel still exposes executable `projections` and `core-ideals` functions, including `projectBit128Model` and `projectDddToJsonSchema`; classify each against native kernels and port remaining shape/loss decisions. | Public representative projections preserve source and report loss through Rust; every current executable projection has a native route before reference retirement. |
| Deployment, migration and row-scope APIs | Existing `umf-codegen` wire and Node/WASM engines implement compile/verify deployment and migration; default deployment Node normal/refusal passes 2/2 and development WASM Chromium compile/verify passes. Native discovery still needs the public versioned selector, and native row-scope forwarding cannot yet carry `admitPolicy`; a staged Rust/host callback and `.2`/`.3` selector cut is in scratch, not yet compiled. Valid G04 `.4` conversion/effects and other currently supported recipe kinds remain separate work. Inventory migration, `reviewedValueDigest` and `irreversiblePurgeDisclosure` also need Rust ownership review. | Activate and test `.2`/`.3` discovery plus row-scope callback first, then implement valid `.4` conversion/effects and the remaining named operations before reference retirement. |
| JSON-LD framing | Extend existing kernel after larger missing family cuts: structured `@default` and still-refused current frame options. | One public structured-default selection plus a malformed-frame refusal, preserving graph identity and unknown metadata. |
| SHACL Core validation | Extend existing kernel with remaining current constraint/path semantics and real RDF result rows. | One conforming and one violating public shape for each new coherent constraint group, then browser/Python validation routes. |
| Browser and Python default adapter surfaces | Host activation; Root integrates public routes for newly callable Rust kernels. | Fresh Chromium public-root and staged Python package workflows for each newly exposed host boundary; do not replay green Node cases. |
| Published reference and release package | Published-surface integration; Root redirects or retires shipped TypeScript semantic entry points, including `./reference`, legacy `dist/umf.js`, and the V2/V3 candidate subpaths after replacements are callable. | Published-package consumer test, release-profile browser build, and wheel/sdist source closure show that executable public semantics run through Rust. |

## Remaining Port Work

The current library is not the entire TypeScript port. Remaining work includes
TypeSpec and Smithy browser host integration; JSON-LD frame options; SHACL
constraint coverage; caller-supplied PostgreSQL browser activation; cross-format
projections; action/security/table control operations; and browser, Python or
release-package activation for Delta sidecars/multipart, Iceberg and Spark. New
kernels also need Python, Node/Bun and browser WASM
activation through the public defaults. A source or wire draft counts as
implemented only after its callable operation passes a current baseline.

## Acceptance

The full port is complete when every UMF-owned shared semantic operation in the
public TypeScript and Python surfaces has a Rust owner, its native behavior and
loss boundaries are tested, and supported Rust CLI, Python, Node/Bun and browser
WASM entry points invoke that owner. The published `./reference` export and
legacy `dist/umf.js` surface must also redirect or retire their executable
TypeScript semantics. The complete current Cargo, binding, packaging and
real-browser suites pass, and the released artifacts execute without a hidden
JavaScript or Python engine. A passing library milestone alone
does not satisfy this acceptance. No archived certificate, historical source
hash or retirement ledger is a prerequisite. Keep actual functional receipt
types and integrity checks required by public operations.
