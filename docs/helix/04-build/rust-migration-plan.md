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

| Capability | Present source and checked behavior | Next implementation |
| --- | --- | --- |
| OpenAPI, LinkML, ODCS, TableSpec and SQL Server | Rust wire/CLI routes and actual Node public-root flows pass. TableSpec's nine operations and SQL Server's catalog/facet routes are callable. | Finish browser and Python public activation for the remaining operations. |
| Shared Registry and documents | Default Registry admits packages and validates extension structure through the retained Rust model; native read/write keeps the public YAML default. Actual Node public-root validation, callbacks, YAML roundtrip and refusal pass. | Exercise the same default path in the final browser and package integration. |
| Table deployment | Existing Rust codegen compile/verify routes now drive Node/browser default exports. The actual Node public-root lifecycle fixture compiles to SQL, retains exact source, verifies its bundle, and refuses invalid configuration or modified SQL (2/2). | Verify the browser public root; complete the distinct migration and row-scope contracts below. |
| GraphQL | Rust pre/post-validation host callback and Node/WASM default routes are integrated; actual Node callback edit/export and prevalidation refusal pass. | Complete browser host integration. |
| JSON-LD | Source, expansion, flattening, compaction, RDF conversion, compound literals, generalized input, framing and payload inspection are wired. Focused wire, Node public-root, Python extension, CLI and development WASM Chromium baselines pass. The new scalar-default, graph, pruning and compact-option frame wire case passes. | Implement structured `@default` and remaining frame semantics; the current Rust route explicitly refuses unsupported structures. Check the release-profile browser build at integration. |
| RDF and generalized RDF | Seventeen existing Rust operations now drive the Node/browser default roots. Actual Node import/edit/export, native Registry inspection and refusal pass; the public Python RDF edit/export/payload-inspector and refusal flow also passes. | Verify the browser public root and the remaining Python generalized-RDF operations. |
| SHACL and OWL | Rust wire tests pass 2/2; actual Node public-root SHACL validation, OWL view and refusal pass. SHACL reports its real `umf-shacl-native-subset/2` identity and incomplete evidence for unsupported constraints. Basic `languageIn` range/wildcard support also passes its focused wire case. | Complete remaining supported constraint semantics and browser/Python activation. |
| PostgreSQL | Catalog capture, supplement inspectors, resolved predicates and parser-session raw SQL routes pass 12/12 focused wire tests. The host-only `pg_query` 6.1.1 C path passes import→AST edit→deparse→reparse and unsupported-version refusal; codec-loss refusal also passes. Fresh Node and Python public native SQL flows pass. The caller-supplied parser's Rust-owned session wire and actual Node callback-failure→retry flows pass through the public root. | Verify the caller-supplied browser host route and published package declarations. |
| Avro | The existing Rust document kernel is exposed through new import/inspect/metadata/get/edit/export/bundle wire routes; its focused source roundtrip/dependency refusal and fresh Node public-root flow pass. | Activate and verify browser/Python public entry points. |
| Iceberg schema and table | The standalone schema Rust kernel drives default Node/browser wrappers for import/inspect/export/get/edit and a native Registry payload inspector; its fresh Node public-root import/edit/export and refusal cases pass. Table core/wire/CLI source, context, transform, rename and promotion operations pass seven focused wire cases; fresh Node import→rename/promotion→export, native Registry validation and exact branded refusal pass, as does public Python edit/export. | Verify the browser public table route. |
| Parquet | The existing Rust capture, footer, schema, page, value and metadata-edit operations drive both default roots. The fresh Node public-root fixture capture→metadata append→export and oversized-source refusal pass. | Activate and verify browser and Python public routes. |
| Protobuf sources | Existing Rust source sessions now back the Node/browser default `importProtobufSources` and `exportProtobufSources` Promise APIs; a fresh Node public-root tiny Go compile→descriptor edit→emit case passes. | Verify the browser callback flow. |
| Delta schema, table and log | Existing Rust kernels now drive the Node/browser default schema/table/log routes, including native payload inspection and table embedded-schema extraction. Fresh Node public-root schema/table edit→export, log capture/inspect/export, Registry callbacks and malformed-source refusal pass; public Python schema/table/log edit/export/refusal passes. | Implement mapped rename and checkpoint/sidecar/multipart recovery; verify the new routes in Chromium. DDL/Spark and Parquet action projection have separate passing cuts below. |
| Python native transport and generic CLI | The public `umf.adapters` family dispatcher passes a staged-package roundtrip, refusal and resource-limit baseline with a fresh extension. The Rust `umf adapter FAMILY --stdin-wire` route passes a focused metadata→Delta import/export→malformed-source refusal case without JavaScript on `PATH`. | Include new adapter resources and verify the final wheel/sdist. |
| Saga browser SDK subpath | Runtime source and default SDK asset integration are present. | Run one representative host baseline at the next SDK integration point. |

## Active implementation queue

Each row identifies a current public surface that still needs a Rust-owned
semantic path or a verified default entry point. Focused tests exercise new
behavior; already green targets are excluded from routine reruns.

| Public capability | Work type and owner | Next baseline and done criterion |
| --- | --- | --- |
| Caller-supplied PostgreSQL SQL backend | Existing session and Node/WASM default bridge are wired; Rust wire and actual Node callback retry pass. | Verify the same supplied-backend route in Chromium and the published Node types. Exact backend identity, one-shot tokens, cumulative controls and public Registry inspection must hold. |
| Iceberg table source and evolution | Existing table kernel, Node/WASM FFI, native-family route and default facade are wired; Rust wire, Node normal/refusal and Python public flows pass. | Verify Chromium table import→rename/promotion→export. Preserve historical schemas, unknown fields and exact native numbers. |
| Parquet capture and edit | Existing kernel drives both default roots; actual Node capture/edit/export and refusal pass. | Verify public browser and Python routes for the same operations. |
| TypeSpec compiler and emit | Rust source admission and one-shot compiler prepare/complete wire pass 2/2. Fresh Node/Python/CLI builds pass, Python and interactive CLI session baselines pass 2/2. The actual public Node root now passes pinned compiler→qualified semantic graph→JSON Schema emitter and invalid-path refusal. | Verify the browser-compatible host boundary and packaged declaration closure. |
| Smithy assembly and selection | Rust now owns source/JSON import, exact get/edit/export, assembly and selection admission through a bounded host session. Its five focused wire cases pass; fresh Node public-root assembly→selection through pinned Smithy Model 1.73.0/TeaVM 0.15.0 and unsafe-source refusal pass 2/2. Public Python and interactive CLI prepare/complete/select with supplied schema-valid responses and path refusal pass 2/2. | Verify the supplied-backend browser route and packaged resource closure. The Python/CLI tests exercise Rust session admission with explicit responses, not TeaVM execution. |
| Delta log capture and commit reconciliation | Existing kernel and default routes now cover capture, export, action inspection and `reconcileDeltaCommits`; fresh Node log capture/inspect/export and public Python capture/export pass. | Exercise commit reconciliation through the public route, then browser activation. |
| Delta Parquet action projection | Rust decodes Parquet capture rows and projects exact Delta actions/scalars while retaining authoritative Parquet source. The focused wire target passes 2/2, the Node public-root normal/blocked cases pass 2/2, and the public Python projection/refusal case passes with no partial action/log on refusal. | Verify the browser route, then use this kernel for checkpoint, sidecar and multipart recovery without restoring the legacy projector. |
| Delta checkpoint, sidecar and multipart recovery | Rust now handles the distinct Parquet checkpoint route: nonzero V1 replay, V2 embedded actions and explicitly supplied sidecars preserve checkpoint/source identity. Two focused wire cases, fresh Node public-root V1 normal/V2 unresolved-sidecar refusal cases, and a public Python checkpoint/refusal case pass. The JSONL checkpoint sidecar API and multipart assembly remain separate missing Rust operations. | Implement JSONL sidecar resolution and multipart recovery with one normal and one no-partial-result refusal each, then verify the Parquet checkpoint browser route. |
| Delta schema and table | Existing Rust import/get/edit/export and native Registry inspectors drive Node/browser defaults; fresh Node and Python table/schema edit→export and a malformed-source refusal pass. | Implement mapped rename and verify the new default routes in Chromium. |
| Delta definition, DDL and Spark realization | Rust owns `defineDeltaTable`, `generateDeltaDDL`, ordered `generateDeltaDDLBundle` and local `realizeSparkDelta4DDL` through core/wire/default routes. DDL wire 2/2 and new Spark/bundle wire 3/3 pass; fresh Node public-root DDL/Spark normal/refusal cases pass 4/4, and public Python DDL/Spark cases pass 2/2. No Spark execution or remote target admission is claimed. | Verify the browser public route, then continue the separate Delta Parquet action/checkpoint/sidecar recovery kernels. |
| Spark schema and metadata | New Rust semantics; next adapter lane ports import/inspect/export/get/edit, metadata/collation/parameter diagnostics and rename. | One public schema edit→export/inspect and one invalid-schema refusal. |
| Action evaluation and planning | Existing Rust `evaluateActionRule` now has codegen wire and Node/browser default routes; fresh Node typed-integer equality and unknown-operator refusal pass 2/2, and the public Python action rule baseline passes. `assessActionPlan` still needs a Rust artifact/claim kernel and bounded explicit selection callback session. | Verify the browser rule route; implement public plan assessment with one eligible and one blocked plan baseline. |
| Remaining action APIs | Classify the current default barrel's other executable `extensions/actions` exports against `umf-codegen` and port each unowned decision before removing the legacy barrel. | A representative public action inspection→execution workflow reaches Rust, with unsupported actions explicitly refused; every current action export has a Rust route or an intentional nonsemantic static export. |
| Protection-value assessment | Existing Rust kernels now drive the Node/browser default `inspectProtectionFunction` and `evaluateProtectionValue` exports; focused Node public-root typed-constant transformation and wrong-input refusal pass (2/2). | Verify the browser public root, preserving immutable report presentation. |
| Protection query properties and remaining security APIs | The existing Rust kernel now drives the default `inspectProtectionQueryProperties` export; focused Node public-root deterministic join and unknown-operator refusal pass (2/2). Its `PROTECTION_QUERY_UNIMPLEMENTED` path still blocks parameterized-range identity; other executable `extensions/security` exports need classification and Rust ownership. | Implement the parameterized-range decision and exercise it through the public route; each remaining executable security export must have a Rust route or be an intentional nonsemantic static export. |
| Avro-to-JSON-Schema projection | `projectAvroToJsonSchema` is still a TypeScript projection and needs a Rust kernel and public route; assign the next freed adapter lane. | A public Avro schema projects to JSON Schema with the current loss report and one unsupported-meaning refusal. |
| Remaining cross-format and model projections | The default barrel still exposes executable `projections` and `core-ideals` functions, including `projectBit128Model` and `projectDddToJsonSchema`; classify each against native kernels and port remaining shape/loss decisions. | Public representative projections preserve source and report loss through Rust; every current executable projection has a native route before reference retirement. |
| Deployment, migration and row-scope APIs | Existing `umf-codegen` wire and Node/WASM engines implement compile/verify deployment and migration; public default deployment compile/verify passes its Node normal/refusal target 2/2. Native discovery lacks the public versioned selector, and native row-scope forwarding cannot carry the public `admitPolicy` callback; both need a complete host boundary before override. Inventory-migration operations, `reviewedValueDigest` and `irreversiblePurgeDisclosure` need separate Rust ownership review. | Verify browser deployment, then activate migration and complete selector/callback and named inventory/review operations before reference retirement. |
| JSON-LD framing | Extend existing kernel after larger missing family cuts: structured `@default` and still-refused current frame options. | One public structured-default selection plus a malformed-frame refusal, preserving graph identity and unknown metadata. |
| SHACL Core validation | Extend existing kernel with remaining current constraint/path semantics and real RDF result rows. | One conforming and one violating public shape for each new coherent constraint group, then browser/Python validation routes. |
| Browser and Python default adapter surfaces | Host activation; Root integrates public routes for newly callable Rust kernels. | Fresh Chromium public-root and staged Python package workflows for each newly exposed host boundary; do not replay green Node cases. |
| Published reference and release package | Published-surface integration; Root redirects or retires shipped TypeScript semantic entry points, including `./reference`, legacy `dist/umf.js`, and the V2/V3 candidate subpaths after replacements are callable. | Published-package consumer test, release-profile browser build, and wheel/sdist source closure show that executable public semantics run through Rust. |

## Remaining Port Work

The current library is not the entire TypeScript port. Remaining work includes
TypeSpec and Smithy browser host integration; JSON-LD frame options; SHACL
constraint coverage; caller-supplied PostgreSQL browser activation; cross-format
projections; action/security/table control operations; and Delta JSONL sidecar,
multipart, Iceberg and Spark gaps. New kernels also need Python, Node/Bun and browser WASM
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
