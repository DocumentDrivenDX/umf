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

1. Finish the two remaining compiler baselines. G01 must move its already emitted
   backfill before NOT NULL tightening, without inserting a duplicate. G11 uses
   the supported two-nonkey-Field replacement workflow proved against the current
   API, retaining its primary Key and adding a secondary Key dependency.
2. Admit the reviewed cumulative Security and projection cuts. Security covers
   legacy policy interpretation/dependencies, access/collection/write evaluation,
   V2 legacy access and retained read registration. Projections cover Arrow/Spark,
   Avro/TableSpec, PostgreSQL/SQL Server to Avro, and SQL Server DDL.
3. Continue the parallel implementation lanes: Security disclosure and Rust-owned
   authority state; remaining projections and binding targets; current table
   inventory compilation, discovery, serialization and verification. Then close
   remaining JSON-LD/SHACL semantics and host routes.
4. Delete public reference/candidate executable exports and their SDK bundles
   once current defaults are callable. Complete local package/browser/consumer
   integration, review, merge current main and publish binaries without Actions.

## Latest focused capability results

The native build and compiler preflight pass. Action Manifest construction,
inspection and assessment pass through the Node public root, together with
caller-tampered and schema-invalid inspection refusal. Bit128 logical binding
inspection and public full-row encode/decode/refusal pass after restoring the
sole-owning-Record table fallback. Separate carrier/model/file projection
baselines remain required. Security V2 upgrade, inspect, JSON/YAML round trip,
downgrade and refusal pass. Reviewed-value digest positive/refusal and public
migration compile/verify/refusal pass; the positive migration fixture now supplies
its required `reviewedChanges` member and actual predecessor digest. Python's
source-resource closure passes with the four newly embedded Action schemas.

G01 and G11 are the only failed compiler baselines from this batch. G01 refused the raw step order; G11's original fixture attempted a forbidden primary
Key backfill. Sol has repaired the ordering and replaced that fixture with the
supported workflow already compiled by the current TypeScript API; the Rust
repairs await their focused runtime check. These two
cases join the new Security/projection cases in the next build. The passing
Manifest, Bit128, digest and public migration cases are excluded from that repair
run unless their dependencies change.

Sol reviews each source cut before admission. Metadata checks precede native
code generation; static checks do not substitute for callable runtime results.

## Current callable baseline

| Family | Current implemented and passing workflows | Remaining work |
| --- | --- | --- |
| Registry/document | Rust-owned default package validation, caller callbacks, read/write and refusal pass through Node. | Final browser/installed-package integration. |
| Native formats | OpenAPI, LinkML, ODCS, TableSpec, SQL Server, RDF, JSON-LD, SHACL/OWL, Avro, GraphQL, Parquet, Iceberg and Delta have Rust routes with ordinary source/edit/export or validation baselines. | Finish still-missing semantics listed below and final host/package activation. |
| Compiler hosts | TypeSpec compile/graph and actual pinned Smithy assembly/selection pass in Chromium. Supplied PostgreSQL browser parse→callback failure→retry→edit→deparse passes after making the runtime asset loader relocatable. | Final release-profile SDK and remaining callback routes. |
| Delta recovery | JSONL sidecar, Parquet actions/checkpoint and multipart routes pass focused wire/Node tests; new browser sidecar/checkpoint/multipart cases pass. Mapped rename passes Node. | Final package and remaining browser/Python activation. |
| Spark | Rust import/inspect/get/edit/export and metadata/collation rename pass focused wire and Node public workflows, with unknown metadata and numeric tokens preserved. Invalid target refusal passes. | Browser/Python activation. |
| DDD JSON Schema | Native projection → inspection → node access → edit → write/read workflow and refusal pass through Node; focused wire cases pass. | Browser/Python activation and the separate DDD GraphQL/PostgreSQL projections. |
| Bit128 | Classifier, Field authoring, logical binding inspection and public full-row encode/decode/refusal pass native baselines. | Carrier/model/file projection/recovery baselines and host activation. |
| Action Plan | Rust prepare/inspect/assess, blocked dependency, complete read-Field obligations and caller diagnostic handling pass Rust, Node and staged Python; Chromium prepare/inspect/blocked passes. | Final package integration and dependent Manifest activation. |
| Action authoring | Node declaration → inspect → edit → assessment, custom caller validation and duplicate identity refusal pass with supported Actions. | Browser/Python activation, selector/rule/bulk and Manifest admission. |
| Saga | Supported Action declaration → inspect → edit → assessment and opaque-source refusal pass through Node, CLI and installed Python. JSON object member order no longer changes parameter identity. | Browser/package activation. |
| Action selectors/rules/bulk | Native selector compilation, typed input admission, prepared identity selection, rule compilation and bulk-outcome validation pass all eight new Node normal/refusal cases. | Browser/package activation; Manifest remains a separate cut. |
| Security | Native function/value/query properties, source/parameter/domain activation and V2 source migration/transport pass Node baselines; basic query join passes Chromium. | Legacy policy/evaluation/registration cumulative cut admission; authority state and disclosure implementation. |
| Migration and row-scope | Discovery `.2`/`.3`/`.4`, G04 recipes, caller row-scope, compiler `.4`/`.5`/`.7`, public compile/verify and reviewed digest pass focused baselines. G02 orders revoke before column changes and grant afterward. | G01 `.3` ordering and G11 `.6` supported replacement baseline; inventory compilation/discovery/serialization/verification. |
| Python/CLI/package | Native adapters, Action Plan, callback semantics, Delta/RDF/Avro/PostgreSQL workflows and sdist include closure pass local focused cases without JavaScript on PATH. | Complete installed wheel/sdist, supported local platform builds and final CLI consumer. |

### Remaining public executable export queue (current V4 barrel)

This queue names the current TypeScript-executed V4 exports in the Action, Security, Projection and migration families. Static package constants, type exports and host Registry registration helpers are omitted. A source-level native primitive is a reuse point, not proof that the composite public operation is callable. Each row closes only after its exact public export reaches Rust in Node and browser with one normal/refusal baseline; Python/CLI routes join where that API is exposed there.

| Cut | Exact public exports | Rust owner / next change |
| --- | --- | --- |
| Action Plan staged artifact/session | `prepareActionPlanModel`, `inspectActionPlan`, `assessActionPlan` | Rust artifact/claim kernel and explicit Registry/selection session; native, Node, Python and Chromium baselines pass. |
| Saga default activation | `inspectSagas`, `declareSaga`, `editSaga`, `assessSaga` | Rust kernels/codegen wire now own V4 defaults; Node, CLI and installed Python normal/refusal pass; browser/package activation remains. |
| Action declaration and assessment | `inspectActions`, `declareAction`, `editAction`, `assessAction` | Rust authoring/assessment kernel drives V4 defaults; supported Action workflow and caller callback/refusal baselines pass. |
| Action selector/expression | `admitActionInputs`, `compileActionRule`, `compileActionSelector`, `prepareActionIdentities`, `selectActionIdentity`, `actionFieldValueKey` | Rust default routes own all named operations; six new selector/identity/rule Node normal/refusal cases pass; browser/package activation remains. |
| Action manifest/bulk | `constructActionManifest`, `inspectActionManifest`, `assessActionManifest`, `validateBulkOutcome` | Bulk-outcome Rust validation passes both new Node cases. Manifest construction/inspection/assessment and retained Rust session refusals pass focused Node baselines. |
| Security existing-kernel activation | `composeSecurityRules`, `securityRefIdentity`, `resolveSecurityProtectionDomains`, `resolveSecurityProtectionSources`, `validateProtectionParameters`, `readProtectionSource`, `writeProtectionSource` | Existing `security_logic`, `security_domains`, `security_parameters`, `security_protection_source_binding` kernels/wires; add thin defaults with ordinary/refusal. |
| Security policy/source meaning | `inspectSecurityPolicy`, `requireSecurityInterpretation`, `inspectSecurityPolicyV2Source`, `upgradeSecurityPolicySource`, `downgradeSecurityPolicySource`, `readSecuritySource`, `writeSecuritySource`, `securityPolicyDependencies`, `securityIdentityTransportDependencies` | Generic native JSON/YAML transport exists, but policy/V2 migration and dependency closure decisions still need Rust kernels/defaults. |
| Security evaluation and authority | `evaluateSecurityAccess`, `evaluateSecurityCollection`, `evaluateSecurityWrite`, `evaluateSecurityPolicyV2LegacyAccess`, `SecurityAuthorityGuard`, `SecurityReadRegistration` | New Rust evaluation/stateful authority kernels with explicit caller capabilities; no JS policy decision fallback. |
| Security disclosure/catalog | `inspectProtectionCatalog`, `requireProtectionInterpretation`, `inspectProtectionObligations`, `inspectSecurityActionPurposes`, `validateSecurityDisclosure`, `encodeSecurityDisclosure`, `decodeSecurityDisclosure`, `inspectSecurityDisclosureV2`, `encodeSecurityDisclosureV2`, `decodeSecurityDisclosureV2` | Reuse native source/literal/parameter primitives; add missing disclosure/catalog/obligation semantic kernels and exact source retention. |
| Binding target projection | `projectBindingToDelta`, `projectBindingToIceberg`, `projectBindingToParquet`, `projectBindingToSqlServer`, `projectBindingTablesToSqlServer`, `projectBindingTablesAndIndexesToSqlServer`, `projectBindingTablesAndIndexesFromPlanToSqlServer`, `recoverBindingSqlServerNative`, `recoverBindingSqlServerSources`, `verifyBindingSqlServerProjection`, `validateSqlServerRelationshipLayout` | Native binding source/inspection and generic index projection are reuse points; target-specific composition/verification remains a Rust cut. |
| Binding index projection | `projectBindingIndexesToPostgresql`, `projectBindingIndexesToSqlServer`, `projectBindingIndexesAgainstSqlServerPlan` | Reuse `binding_index_projection::project_binding_indexes`; add target-specific DDL/catalog admission and public routes. |
| Bit128 projection | `classifyBit128NativeType`, `decodeBit128FileRecord`, `encodeBit128FileRecord`, `projectBit128CarrierSchema`, `recoverBit128CarrierProjection`, `projectBit128Model`, `recoverBit128ModelProjection` | Classifier, Field authoring, binding inspection and full-row encode/decode pass; carrier/model/file projection/recovery baselines remain. |
| DDD → GraphQL/PostgreSQL | `projectDddEntitiesToGraphql`, `projectDddToGraphql`, `recoverDddFromGraphql`, `recoverDddGraphqlNative`, `verifyDddGraphqlProjection`, `projectDddTablesToPostgresql`, `projectDddTablesAndIndexesToPostgresql`, `projectDddToPostgresql`, `recoverDddPostgresqlIdeal`, `recoverDddPostgresqlNative`, `verifyDddPostgresqlProjection`, `validatePostgresqlRelationshipLayout` | Reuse native GraphQL/PostgreSQL source adapters; DDD mapping and recovery/loss kernel is absent. |
| DDD → JSON Schema | `dddFieldBinding`, `projectDddToJsonSchema` | Native DDD mapping kernel and Node public projection/edit/read/write/refusal baselines pass; browser/Python activation remains. |
| Cross-format schema projections | `projectArrowToSpark`, `projectAvroToTableSpec`, `projectGraphqlInputToJsonSchema`, `projectJsonSchemaToProtobuf`, `projectOpenapiToJsonSchema`, `projectParquetToAvro`, `projectPostgresqlRowToJsonSchema`, `projectPostgresqlToAvro`, `projectSmithyToJsonSchema`, `projectSparkToArrow`, `projectSqlServerToAvro`, `projectSqlServerToDdl`, `projectTableSpecToAvro`, `projectToTableSpecViaAvro`, `projectTypeSpecToJsonSchema`, `createSmithyJavaScriptJsonSchemaBackend` | Reuse existing Rust format/source adapters and explicit compiler backends; add one Rust-owned mapping/loss kernel per coherent source→target relation. The Smithy backend factory remains a host capability, but projected status/source/loss belongs to Rust. |
| Table inventory migration | `compileTableInventoryMigration`, `discoverTableInventoryMigrationChanges`, `serializeTableInventoryMigration`, `verifyTableInventoryMigration`, `irreversiblePurgeDisclosure` | Separate new inventory kernel; `umf-codegen` current migration compiler does not own this public profile. |
| Migration digest and selected compiler | `reviewedValueDigest`, `compileTableMigration`, `verifyTableMigration` | Native canonical digest and public compile/verify/refusal pass. Compiler `.4`/`.5`/`.7` baselines pass; `.3` ordering and `.6` supported replacement baseline remain in repair. |

Host-only/static exports in these families: `actionExpressionLimits`, `actionsPackage`, `sagaPackage`, `createSagaResources`, `registerActions`, `registerSagas`, `protectionPackage`, `SECURITY_EXTENSION`, `securityPackage`, `securityV2Package`, and `securityRegistry`. Keep these as data/registration facades only; underlying validation and semantics must still use Rust. The broader `core-ideals` barrel has native classifier/recovery primitives in `umf-core` and needs a separate exact default-route audit, not a blanket new-kernel assignment.

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
