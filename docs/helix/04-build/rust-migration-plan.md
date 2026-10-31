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
These results do not establish a release wheel or release-profile browser build.

| Capability | Present source and checked behavior | Next implementation |
| --- | --- | --- |
| OpenAPI, LinkML, ODCS, TableSpec and SQL Server | Rust wire/CLI routes and actual Node public-root flows pass. TableSpec's nine operations and SQL Server's catalog/facet routes are callable. | Finish browser and Python public activation for the remaining operations. |
| Shared Registry and documents | Default Registry admits packages and validates extension structure through the retained Rust model; native read/write keeps the public YAML default. Actual Node public-root validation, callbacks, YAML roundtrip and refusal pass. | Exercise the same default path in the final browser and package integration. |
| GraphQL | Rust pre/post-validation host callback and Node/WASM default routes are integrated; actual Node callback edit/export and prevalidation refusal pass. | Complete browser host integration. |
| JSON-LD | Source, expansion, flattening, compaction, RDF conversion, compound literals, generalized input, framing and payload inspection are wired. Focused wire, Node public-root, Python extension, CLI and development WASM Chromium baselines pass. The new scalar-default, graph, pruning and compact-option frame wire case passes. | Implement structured `@default` and remaining frame semantics; the current Rust route explicitly refuses unsupported structures. Check the release-profile browser build at integration. |
| RDF and generalized RDF | Seventeen existing Rust operations now drive the Node/browser default roots. Actual Node import/edit/export, native Registry inspection and refusal pass; the public Python RDF edit/export/payload-inspector and refusal flow also passes. | Verify the browser public root and the remaining Python generalized-RDF operations. |
| SHACL and OWL | Rust wire tests pass 2/2; actual Node public-root SHACL validation, OWL view and refusal pass. SHACL reports its real `umf-shacl-native-subset/2` identity and incomplete evidence for unsupported constraints. Basic `languageIn` range/wildcard support also passes its focused wire case. | Complete remaining supported constraint semantics and browser/Python activation. |
| PostgreSQL | Catalog capture, supplement inspectors, resolved predicates and parser-session raw SQL routes pass 12/12 focused wire tests. The host-only `pg_query` 6.1.1 C path passes import→AST edit→deparse→reparse and unsupported-version refusal; codec-loss refusal also passes. Fresh Node and Python public native SQL flows pass. The caller-supplied parser's Rust-owned session wire and actual Node callback-failure→retry flows pass through the public root. | Verify the caller-supplied browser host route and published package declarations. |
| Avro | The existing Rust document kernel is exposed through new import/inspect/metadata/get/edit/export/bundle wire routes; its focused source roundtrip/dependency refusal and fresh Node public-root flow pass. | Activate and verify browser/Python public entry points. |
| Iceberg schema and table | The standalone schema Rust kernel drives default Node/browser wrappers for import/inspect/export/get/edit and a native Registry payload inspector; its fresh Node public-root import/edit/export and refusal cases pass. Table core/wire/CLI source, context, transform, rename and promotion operations pass seven focused wire cases; fresh Node import→rename/promotion→export, native Registry validation and exact branded refusal pass, as does public Python edit/export. | Verify the browser public table route. |
| Parquet | The existing Rust capture, footer, schema, page, value and metadata-edit operations drive both default roots. The fresh Node public-root fixture capture→metadata append→export and oversized-source refusal pass. | Activate and verify browser and Python public routes. |
| Protobuf sources | Existing Rust source sessions now back the Node/browser default `importProtobufSources` and `exportProtobufSources` Promise APIs; a fresh Node public-root tiny Go compile→descriptor edit→emit case passes. | Verify the browser callback flow. |
| Python native transport | The public `umf.adapters` family dispatcher passes a staged-package roundtrip, refusal and resource-limit baseline with a fresh extension. | Include new adapter resources and verify the final wheel/sdist. |
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
| TypeSpec compiler and emit | New Rust document/session kernel; `prune_history` owns `compileTypeSpecDocument`, semantic graph and `emitTypeSpecJsonSchema` around the explicit pinned compiler capability. | Tiny source compile→graph/emit and compiler refusal through the public API, including a browser-compatible host boundary. |
| Smithy assembly and selection | New Rust document/session kernel; `prune_history` follows TypeSpec with `assembleSmithyDocument` and `selectSmithyShapes` around the supplied backend. | Tiny source assembly→shape selection and an invalid-selection refusal through the public API. |
| Delta log and checkpoint | Existing kernel activation; next adapter lane maps capture, export, action inspection, commit reconciliation and sidecars to the public defaults. | One public log capture→inspect/reconcile→export and one malformed-log refusal. |
| Delta schema and table | Existing kernel activation for import/get/edit/export; next adapter lane checks mapped rename separately against its current TypeScript behavior. | One public table/schema edit→export with preserved unknown content and an invalid-schema refusal; add rename only once its Rust semantics are callable. |
| Delta definition, DDL and Spark realization | New Rust semantics; next adapter lane ports the current definition, DDL bundle and realization exports. | One definition→DDL bundle workflow with an explicit unsupported-meaning refusal. |
| Spark schema and metadata | New Rust semantics; next adapter lane ports import/inspect/export/get/edit, metadata/collation/parameter diagnostics and rename. | One public schema edit→export/inspect and one invalid-schema refusal. |
| Action evaluation and planning | `evaluateActionRule` has a Rust codegen kernel but lacks a public wire/default route; `assessActionPlan` still needs a Rust implementation. Assign the next freed adapter lane. | A public rule evaluation and plan assessment use Rust results, with one invalid-rule refusal. |
| Protection-value assessment | Existing Rust security kernels need public default activation for `evaluateProtectionValue`; assign the next freed adapter lane. | One public protection-value assessment and one rejected invalid input through the native route. |
| Avro-to-JSON-Schema projection | `projectAvroToJsonSchema` is still a TypeScript projection and needs a Rust kernel and public route; assign the next freed adapter lane. | A public Avro schema projects to JSON Schema with the current loss report and one unsupported-meaning refusal. |
| JSON-LD framing | Extend existing kernel after larger missing family cuts: structured `@default` and still-refused current frame options. | One public structured-default selection plus a malformed-frame refusal, preserving graph identity and unknown metadata. |
| SHACL Core validation | Extend existing kernel with remaining current constraint/path semantics and real RDF result rows. | One conforming and one violating public shape for each new coherent constraint group, then browser/Python validation routes. |
| Browser and Python default adapter surfaces | Host activation; Root integrates public routes for newly callable Rust kernels. | Fresh Chromium public-root and staged Python package workflows for each newly exposed host boundary; do not replay green Node cases. |
| Published reference and release package | Published-surface integration; Root redirects or retires shipped TypeScript semantic entry points, including `./reference`, legacy `dist/umf.js`, and the V2/V3 candidate subpaths after replacements are callable. | Published-package consumer test, release-profile browser build, and wheel/sdist source closure show that executable public semantics run through Rust. |

## Remaining Port Work

The current library is not the entire TypeScript port. Remaining work includes
TypeSpec and Smithy; JSON-LD frame options; SHACL constraint coverage; the
caller-supplied PostgreSQL parser-session activation and other relational adapters; cross-format
projections; action/security/table control operations; and portions of
Delta/Iceberg/Spark. New kernels also need Python, Node/Bun and browser WASM
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
