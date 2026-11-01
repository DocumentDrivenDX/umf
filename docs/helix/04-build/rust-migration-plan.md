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
and explicit resource boundaries. Core is 0.10.0. Main currently releases SDK 0.10.1 and Python 0.10.5;
the completed Rust port needs a successor release with matching dependent pins.

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

## Execution order

Sol owns planning, admission, integration and review. Luna owns parallel
implementation and focused test additions. Give each implementation lane one
coherent callable capability, its exact existing contract, and one normal
workflow plus a refusal baseline. Keep implementation lanes active while the
shared native/browser build slot verifies the last admitted batch.

Run a metadata/compiler check before optimized native builds. Batch independent
new cases into one host build. After a case passes, exclude it from repair runs
unless a later change affects its behavior or dependency. Do not reopen broad
conformance campaigns during implementation. Run complete suites once the
remaining callable operations are integrated, and repair only actual failures.

Current integration order:

1. Verify the four repaired normal workflows from the last batch: G01 retained
   Field backfill, G11 selected replacements, PostgreSQL→Avro and Arrow↔Spark.
   G01 emitted NOT NULL twice; G11 validated selected markers against an
   incomplete discovery sequence. Keep the existing refusal guards intact.
2. Admit reviewed Security authority/catalog/purpose/obligation kernels and the
   next projections: PostgreSQL row→JSON Schema, Parquet→Avro and the composed
   source→Avro→TableSpec operation. Arrow uses the current FlatBuffer model
   profile; its integration JSON schema is a different adapter.
3. Keep Luna implementation lanes on the missing FlatBuffer binary codec and
   cross-format projections, DDD GraphQL and subsequent binding projections.
   Sol completes the current inventory compiler after the earlier Luna attempt
   failed to implement its actual API. Activate existing Rust core-ideal kernels
   through exact public default routes; do not rewrite implemented primitives.
4. Delete public reference/candidate executable exports and their SDK bundles
   once current defaults are callable. Complete local package/browser/consumer
   integration, review, merge current main and publish binaries without Actions.

## Latest focused capability results

The latest production TypeScript and Rust metadata checks pass, as does the
Python source-resource closure. The native build completes. Its focused Node
batch passes eleven cases: Delta binding (normal and strict), Iceberg binding,
authored Avro nullability and facets (normal/recovery and refusal), Parquet
Relationship observation/verification/recovery, general nested Parquet Record
classification, initial inventory and irreversible-purge disclosure. The utility
error-mapping repair also passes. These passing cases are excluded from repair
runs unless their behavior or dependencies change.

The next repair batch passes Avro Key/Relationship classification, verification
and recovery plus SQL Server table projection and scalar-mapping refusal. Three
Node cases still fail: SQL Server layout wire admission, the observed-catalog
table/index composite, and retained G02 discovery. All three Rust G02 cases also
fail: the base case reaches discovery after successful compilation/verification,
while selected seeds and created commands stop at reviewed-marker comparison.
Exact synthetic-option, wire and tagged-catalog repairs are prepared. Strict
marker equality remains required. Parameter, cross-table and history closure
continues in scratch. Current TypeScript explicitly refuses removal compilation
with `TABLE_REMOVAL_EFFECTS_NOT_LOWERED`; Rust preserves that refusal while
supporting removal discovery and irreversible-purge disclosure.

Sol reviewed the new Rust SQL Server relationship-layout kernel; it compiles and its first runtime baseline exposed the wire admission failure. The full outer SQL Server binding projection and Avro facets classifier have passed source review and are queued for compiler/runtime admission.
Repeated classify/verify/recover families should share Rust receipt mechanics
with format-specific observers. Authored projection mappers remain separate
Rust kernels. Existing passing Action, Saga, Security, Bit128, migration,
projection and browser workflows retain the scope recorded below.

Current remaining implementation cuts are selected inventory seed/history
closure; relationship and binding projection composites still executed in
TypeScript; remaining adapter, model and core-ideal default activation; and
browser/Python/CLI package integration. Retire executable reference/candidate
SDK exports only after current public defaults are callable. Then run the
complete local Rust, host, browser and installed-package suites, repair actual
failures, review, merge and publish the successor release.

## Current callable baseline

| Family | Current implemented and passing workflows | Remaining work |
| --- | --- | --- |
| Registry/document | Rust-owned default package validation, caller callbacks, read/write and refusal pass through Node. | Final browser/installed-package integration. |
| Native formats | OpenAPI, LinkML, ODCS, TableSpec, SQL Server, RDF, JSON-LD, SHACL/OWL, Avro, GraphQL, Parquet, Iceberg and Delta have Rust routes with ordinary source/edit/export or validation baselines. | Finish still-missing semantics listed below and final host/package activation. |
| Compiler hosts | TypeSpec compile/graph and actual pinned Smithy assembly/selection pass in Chromium. Supplied PostgreSQL browser parse→callback failure→retry→edit→deparse passes after making the runtime asset loader relocatable. | Final release-profile SDK and remaining callback routes. |
| Delta recovery | JSONL sidecar, Parquet actions/checkpoint and multipart routes pass focused wire/Node tests; new browser sidecar/checkpoint/multipart cases pass. Mapped rename passes Node. | Final package and remaining browser/Python activation. |
| Spark | Rust import/inspect/get/edit/export and metadata/collation rename pass focused wire and Node public workflows, with unknown metadata and numeric tokens preserved. Invalid target refusal passes. | Browser/Python activation. |
| DDD JSON Schema | Native projection → inspection → node access → edit → write/read workflow and refusal pass through Node; focused wire cases pass. | Browser/Python activation and the separate DDD GraphQL/PostgreSQL projections. |
| Bit128 | Classifier, Field authoring, logical binding inspection and public full-row encode/decode/refusal pass native baselines. | Carrier/model/file projection/recovery now pass Node; final host activation. |
| Action Plan | Rust prepare/inspect/assess, blocked dependency, complete read-Field obligations and caller diagnostic handling pass Rust, Node and staged Python; Chromium prepare/inspect/blocked passes. | Final package integration and dependent Manifest activation. |
| Action authoring | Node declaration → inspect → edit → assessment, custom caller validation and duplicate identity refusal pass with supported Actions. | Browser/Python/package activation. |
| Saga | Supported Action declaration → inspect → edit → assessment and opaque-source refusal pass through Node, CLI and installed Python. JSON object member order no longer changes parameter identity. | Browser/package activation. |
| Action selectors/rules/bulk | Native selector compilation, typed input admission, prepared identity selection, rule compilation and bulk-outcome validation pass all eight new Node normal/refusal cases. | Browser/package activation. |
| Security | Native function/value/query properties, source/parameter/domain activation and V2 source migration/transport pass Node baselines; basic query join passes Chromium. | Legacy policy/evaluation/registration and V1/V2 disclosure pass Node; authority/catalog/purpose/obligation cut and final host activation remain. |
| Migration and row-scope | Discovery `.2`/`.3`/`.4`, G04 recipes, caller row-scope, compiler `.4`/`.5`/`.7`, public compile/verify and reviewed digest pass focused baselines. G02 orders revoke before column changes and grant afterward. | G01 `.3` ordering and G11 `.6` supported replacement baseline; inventory compilation/discovery/serialization/verification. |
| Python/CLI/package | Native adapters, Action Plan, callback semantics, Delta/RDF/Avro/PostgreSQL workflows and sdist include closure pass local focused cases without JavaScript on PATH. | Complete installed wheel/sdist, supported local platform builds and final CLI consumer. |

### Current public executable implementation queue (V4 barrel)

This queue tracks Rust ownership and remaining work for the current V4 exports in the Action, Security, Projection and migration families. Static package constants, type exports and host Registry registration helpers are omitted. A source-level native primitive is a reuse point, not proof that the composite public operation is callable. Each row closes only after its exact public export reaches Rust in Node and browser with one normal/refusal baseline; Python/CLI routes join where that API is exposed there.

| Cut | Exact public exports | Rust owner / next change |
| --- | --- | --- |
| Action Plan staged artifact/session | `prepareActionPlanModel`, `inspectActionPlan`, `assessActionPlan` | Rust artifact/claim kernel and explicit Registry/selection session; native, Node, Python and Chromium baselines pass. |
| Saga default activation | `inspectSagas`, `declareSaga`, `editSaga`, `assessSaga` | Rust kernels/codegen wire now own V4 defaults; Node, CLI and installed Python normal/refusal pass; browser/package activation remains. |
| Action declaration and assessment | `inspectActions`, `declareAction`, `editAction`, `assessAction` | Rust authoring/assessment kernel drives V4 defaults; supported Action workflow and caller callback/refusal baselines pass. |
| Action selector/expression | `admitActionInputs`, `compileActionRule`, `compileActionSelector`, `prepareActionIdentities`, `selectActionIdentity`, `actionFieldValueKey` | Rust default routes own all named operations; six new selector/identity/rule Node normal/refusal cases pass; browser/package activation remains. |
| Action manifest/bulk | `constructActionManifest`, `inspectActionManifest`, `assessActionManifest`, `validateBulkOutcome` | Bulk-outcome Rust validation passes both new Node cases. Manifest construction/inspection/assessment and retained Rust session refusals pass focused Node baselines. |
| Security existing-kernel activation | `composeSecurityRules`, `securityRefIdentity`, `resolveSecurityProtectionDomains`, `resolveSecurityProtectionSources`, `validateProtectionParameters`, `readProtectionSource`, `writeProtectionSource` | Named utility/domain/parameter/source operations have Rust owners and passing focused Node workflows; final host/package integration remains. |
| Security policy/source meaning | `inspectSecurityPolicy`, `requireSecurityInterpretation`, `inspectSecurityPolicyV2Source`, `upgradeSecurityPolicySource`, `downgradeSecurityPolicySource`, `readSecuritySource`, `writeSecuritySource`, `securityPolicyDependencies`, `securityIdentityTransportDependencies` | Rust policy/V2 migration, dependency and source transport owners pass the focused Node workflows; final host/package integration remains. |
| Security evaluation and authority | `evaluateSecurityAccess`, `evaluateSecurityCollection`, `evaluateSecurityWrite`, `evaluateSecurityPolicyV2LegacyAccess`, `SecurityAuthorityGuard`, `SecurityReadRegistration` | Rust evaluation, registration and stateful authority owners pass focused Node workflows with explicit caller capabilities; final host/package integration remains. |
| Security disclosure/catalog | `inspectProtectionCatalog`, `requireProtectionInterpretation`, `inspectProtectionObligations`, `inspectSecurityActionPurposes`, `validateSecurityDisclosure`, `encodeSecurityDisclosure`, `decodeSecurityDisclosure`, `inspectSecurityDisclosureV2`, `encodeSecurityDisclosureV2`, `decodeSecurityDisclosureV2` | Rust V1/V2 disclosure, catalog, purpose and obligation workflows pass focused Node normal/refusal cases; final host/package integration remains. |
| Core-ideal classifiers/projections/recovery | Thirteen Avro/Parquet classifier and recovery exports now route to existing Rust owners and await their focused runtime batch. | Existing Avro/Parquet classifier and recovery routes, authored Avro nullability/facets/keys, Parquet relationships and nested Records pass focused Node baselines. Avro Key/Relationship classification resource repairs and the new Avro facet classifier await runtime. Many other current composites still need Rust kernels; old relationship factories retain TypeScript semantics. |
| Binding target projection | `projectBindingToDelta`, `projectBindingToIceberg`, `projectBindingToParquet`, `projectBindingToSqlServer`, `projectBindingTablesToSqlServer`, `projectBindingTablesAndIndexesToSqlServer`, `projectBindingTablesAndIndexesFromPlanToSqlServer`, `recoverBindingSqlServerNative`, `recoverBindingSqlServerSources`, `verifyBindingSqlServerProjection`, `validateSqlServerRelationshipLayout` | Delta, Iceberg and Parquet target workflows pass focused Node baselines. SQL Server tables and layout are in the current repair/new-capability batch; the complete outer SQL Server composer is source-reviewed and queued, with runtime still pending. |
| Binding index projection | `projectBindingIndexesToPostgresql`, `projectBindingIndexesToSqlServer`, `projectBindingIndexesAgainstSqlServerPlan` | Reuse `binding_index_projection::project_binding_indexes`; add target-specific DDL/catalog admission and public routes. |
| Bit128 projection | `classifyBit128NativeType`, `decodeBit128FileRecord`, `encodeBit128FileRecord`, `projectBit128CarrierSchema`, `recoverBit128CarrierProjection`, `projectBit128Model`, `recoverBit128ModelProjection` | Classifier, Field authoring, binding inspection, full-row and file encode/decode, carrier/model projection/recovery pass Node; final host activation remains. |
| DDD → GraphQL/PostgreSQL | `projectDddEntitiesToGraphql`, `projectDddToGraphql`, `recoverDddFromGraphql`, `recoverDddGraphqlNative`, `verifyDddGraphqlProjection`, `projectDddTablesToPostgresql`, `projectDddTablesAndIndexesToPostgresql`, `projectDddToPostgresql`, `recoverDddPostgresqlIdeal`, `recoverDddPostgresqlNative`, `verifyDddPostgresqlProjection`, `validatePostgresqlRelationshipLayout` | All five GraphQL projection/verification/recovery operations pass focused Node baselines. PostgreSQL layout and complete projection composition remain implementation work. |
| DDD → JSON Schema | `dddFieldBinding`, `projectDddToJsonSchema` | Native DDD mapping kernel and Node public projection/edit/read/write/refusal baselines pass; browser/Python activation remains. |
| Cross-format schema projections | `projectArrowToSpark`, `projectAvroToTableSpec`, `projectGraphqlInputToJsonSchema`, `projectJsonSchemaToProtobuf`, `projectOpenapiToJsonSchema`, `projectParquetToAvro`, `projectPostgresqlRowToJsonSchema`, `projectPostgresqlToAvro`, `projectSmithyToJsonSchema`, `projectSparkToArrow`, `projectSqlServerToAvro`, `projectSqlServerToDdl`, `projectTableSpecToAvro`, `projectToTableSpecViaAvro`, `projectTypeSpecToJsonSchema`, `createSmithyJavaScriptJsonSchemaBackend` | Focused Node workflows pass for the listed source-to-target Rust mappings. `createSmithyJavaScriptJsonSchemaBackend` is a host capability factory. Final browser/installed-package integration remains. |
| Table inventory migration | `compileTableInventoryMigration`, `discoverTableInventoryMigrationChanges`, `serializeTableInventoryMigration`, `verifyTableInventoryMigration`, `irreversiblePurgeDisclosure` | Rust initial inventory compile/discover/serialize/verify and removal discovery/disclosure pass. Retained G02, selected seeds and created-table command increments are implemented and under focused repair/testing; parameter, cross-table and history closure remains in progress. |
| Migration digest and selected compiler | `reviewedValueDigest`, `compileTableMigration`, `verifyTableMigration` | Rust canonical digest, public compile/verify/refusal and supported compiler .3/.4/.5/.6/.7 workflows pass focused baselines; final package integration remains. |

Host-only/static exports in these families: `actionExpressionLimits`, `actionsPackage`, `sagaPackage`, `createSagaResources`, `registerActions`, `registerSagas`, `protectionPackage`, `SECURITY_EXTENSION`, `securityPackage`, `securityV2Package`, and `securityRegistry`. Keep these as data/registration facades only; underlying validation and semantics must still use Rust. The broader `core-ideals` barrel needs both actual missing kernels and exact default activation. Existing native primitives are reuse points; neither a facade override count nor an injected Rust inspector establishes ownership of a composite.

## Remaining Port Work

Remaining work is the unclosed operations and host activation named above,
legacy executable surface retirement, complete local integration tests, review,
merge and publication. Scratch code and metadata checks alone do not close a
capability: its public operation must pass its focused current baseline.

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
