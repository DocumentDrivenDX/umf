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

1. PostgreSQL Field/Record and Cardinality, authored SQL Server Cardinality and
   TableSpec Record pass their focused public baselines after the shared schema
   resource, transport profile and valid refusal-fixture corrections. Exclude
   these passing cases from unrelated repair runs.
2. Extra Relationship for GraphQL/RDF/LinkML, PostgreSQL Nullability, authored SQL
   Server Nullability and TableSpec Cardinality now pass their focused public
   workflows. Authored SQL Server Keys and TableSpec Nullability now also pass.
   PostgreSQL and TableSpec Keys also pass their current public workflows.
   Authored SQL Server Field/Record and TableSpec Facets also pass. PostgreSQL
   Facets, TableSpec Relationships, authored SQL Server Facets and TableSpec
   Field/Record now pass. The four medical public functions also pass. Parser
   callbacks supply AST transport only.
3. Complete authored target operations in coherent parallel cuts: Field/Record
   together per target, then related Cardinality/Nullability and Keys/Facets.
   TableSpec classifiers and authored operations pass their current baselines.
   PostgreSQL classifiers, including Composite and DDL-kind, also pass.
4. Close generic report inspectors/verifiers and the remaining adapter/extension
   composites listed below. Reuse current Rust primitives for the full public
   operation; a TypeScript composite around a Rust inspector retains ownership.
5. Retire public reference/candidate executable exports and their SDK bundles
   after all current defaults are callable. Run the complete local Cargo, host,
   browser and installed-package integration once; repair actual failures, review,
   merge current main and publish the complete successor release without Actions.

Each capability has an implementation owner and a focused normal/refusal baseline.
A passing baseline leaves the repair queue unless its behavior or dependency changes.
Source review and metadata compilation precede a shared native build; they do not
replace runtime tests. Node-focused batches check every Rust host and CLI with
Cargo metadata, then build only the Node binding for their runtime cases. Keep
that same feature graph and target cache. Build and test Python and CLI executables
during final host integration; Node runtime results do not establish those hosts. Do not grow an admitted batch while compiler fixes prevent
it from reaching runtime.

## Remaining implementation lanes

The remaining queue comes from current callable exports and their implementation
bodies. Static packages, types and host registration are excluded. Each cut includes
its public Rust route and one ordinary normal/refusal/recovery workflow as applicable.

| Lane | Concrete remaining implementation | Reuse and next cut |
| --- | --- | --- |
| Authored targets | PostgreSQL native authored Field/Record closure, Cardinality/Nullability and Keys/Facets; Avro Cardinality; Parquet Cardinality/Nullability and Keys/Facets. | Bundle Field/Record per target and related scalar operations; reuse target adapters, author verification and exact receipt/native recovery. Avro/Parquet Field/Record and staged PostgreSQL Field/Record pass; native PostgreSQL backend composites are the next closure cut. |
| Generic reports | Field classification/projection, Record projection and Structured classification inspector/verify pairs. | Reuse Rust kind/schema and receipt primitives; preserve exact current diagnostic and integrity meaning. |
| Adapter composites | Arrow IPC schema export, layout/consistency/rename/observation; embedded Parquet Arrow schema inspection/coordinated rename; Delta checkpoint reconciliation; Protobuf descriptor edit. | Implement each complete public composite on its existing Rust capture/schema primitive, including ordinary edit/refusal behavior and caller controls. |
| Extension composites | Relationship Extra archive import. | Reuse the existing Rust importer, classification and archive validation; preserve parser injection and exact retained-source meaning. |

Implement the remaining queue through three parallel Luna lanes. The PostgreSQL
lane finishes observation helpers, then authored Field/Record followed by its
related scalar pairs. The authored-format lane finishes Parquet Field/Record,
then Avro/Parquet Cardinality/Nullability and Parquet Keys/Facets. The composite
lane finishes generic reports, Arrow IPC plus embedded Parquet Arrow operations,
then Delta reconciliation, Protobuf edit and Relationship Extra archive import.
Sol reviews additive integration and batches source-ready cuts into the single
build slot; an independent correction does not hold other ready capabilities.

Luna owns implementation and focused test additions. Sol reviews each source cut
and its additive integration before the shared compiler/build slot. Source patches,
facade counts and a Rust inspector inside a TypeScript composite do not close a cut.

## Current capability status

All core-ideal classifiers for Avro, Parquet, SQL Server, TableSpec and PostgreSQL
have current focused public Rust baselines, including verification and available
source/native recovery. PostgreSQL Composite and DDL-kind each pass two cases.
TableSpec authored Field/Record, Cardinality/Nullability and Keys/Facets pass;
the Keys/Facets pair passes both current cases. Authored SQL Server Field/Record,
Cardinality/Nullability, Keys/Facets and Relationship pass. Authored Avro
Nullability, Keys/Facets and Relationship, Parquet Relationship, and PostgreSQL
Relationship also pass. Extra Relationship for GraphQL/RDF/LinkML and all four
medical public operations pass.

The PostgreSQL and SQL Server physical composers, standalone table/index APIs,
Binding target/index projections and Bit128 carrier/model/file operations pass.
Binding inspect/get/read/write, index projection, migration/rollback and registration
meaning pass three public cases. Model editing/prepared inspection pass, preserving
updater error identity, frozen source snapshots and Rust-owned identity/view
admission. These workflows leave the repair queue unless a dependent change
materially affects their behavior.

Authored Avro Field/Record passes projection, refusal and receipt recovery. The
actual native Rust PostgreSQL bridge classifies an ordinary two-column table,
recovers its exact SQL and refuses a module collision without supplied parser ASTs.
Catalog public editing passes its result-shape and representation-loss baselines,
including exact raw native numeric-token retention. The small association dataset
also passes. The separate ordinary timestamp/float case now passes with the
existing mixed-column uuid-model2 profile; production admission remains intact.
Both dataset cases leave the repair queue.

Dashboard read/inspection/selection and invalid-order refusal, public table
lifecycle inspection, authored Parquet Field/Record projection/refusal/byte recovery,
and PostgreSQL Key/Cardinality observation helpers all pass their current public
baselines (seven cases). Full TypeScript, actual host-library compilation and
resource closure also pass. These capabilities leave the repair queue.

PostgreSQL authored Field/Record now passes staged public projection, refusal
and exact recovery, including whole-target integrity. The Record baseline uses
one already-kinded document so its author receipts share the same snapshot.
Only that failed fixture case was retried; the passing Field case was excluded.
The native Rust/Python/CLI backend composites remain a separate implementation
closure item and are not established by this staged Node flow.

Reports, Avro/Parquet Cardinality, Parquet Nullability and PostgreSQL native
composites are under source review. Remaining authored targets and adapter
composites continue in parallel. Local source guards also require exact audited
type-only grants, generic Registry ownership transport and removal of transitive
JSON-LD hashing/clock host dependencies; keep the strict checks intact. Run only
new or affected cases during these batches, then perform complete current
host/package integration once.

Preserve current meaning constraints during integration: PostgreSQL generated SQL
retains its original text while deparse validates the codec; parser AST admission
and index outcomes remain Rust-owned. Native unknown values and exact tokens stay
retained, every unprojected meaning is disclosed, whole receipts and supplied native
sources are checked for recovery, and controls propagate through the caller Context.
Preserve discovered table review-marker order and equality. Table-removal compilation
still reports `TABLE_REMOVAL_EFFECTS_NOT_LOWERED`; discovery and irreversible-purge
disclosure remain supported.

Use ordinary complete capability inputs. Keep broad existing captures for the final
suite; do not inherit their full edge collections into each new baseline. Batch
related new capabilities and actual failures in one build, then remove passing cases
from later repair runs. Compile the actual Rust host libraries without explicit
test/binary-only selectors; Node-focused batches build Node only. After the remaining
callable owners are complete, run one full current Rust/CLI, Python, Node/Bun,
wasm32/browser and installed-package integration, then fix actual failures and
complete review, main integration and the successor release.

## Current callable baseline

| Family | Current implemented and passing workflows | Remaining work |
| --- | --- | --- |
| Registry/document | Rust-owned default package validation, caller callbacks, read/write and refusal pass through Node. | Final browser/installed-package integration. |
| Native formats | OpenAPI, LinkML, ODCS, TableSpec, SQL Server, RDF, JSON-LD, SHACL/OWL, Avro, GraphQL, Parquet, Iceberg and Delta have Rust routes with ordinary source/edit/export or validation baselines. | Finish still-missing semantics listed below and final host/package activation. |
| Compiler hosts | TypeSpec compile/graph and actual pinned Smithy assembly/selection pass in Chromium. Supplied PostgreSQL browser parse→callback failure→retry→edit→deparse passes after making the runtime asset loader relocatable. | Final release-profile SDK and remaining callback routes. |
| Delta recovery | JSONL sidecar, Parquet actions/checkpoint and multipart routes pass focused wire/Node tests; new browser sidecar/checkpoint/multipart cases pass. Mapped rename passes Node. | Final package and remaining browser/Python activation. |
| Spark | Rust import/inspect/get/edit/export and metadata/collation rename pass focused wire and Node public workflows, with unknown metadata and numeric tokens preserved. Invalid target refusal passes. | Browser/Python activation. |
| DDD JSON Schema | Native projection → inspection → node access → edit → write/read workflow and refusal pass through Node; focused wire cases pass. | Final browser/Python/package activation; DDD GraphQL/PostgreSQL workflows also pass. |
| Bit128 | Classifier, Field authoring, logical binding inspection and public full-row encode/decode/refusal pass native baselines. | Carrier/model/file projection/recovery now pass Node; final host activation. |
| Action Plan | Rust prepare/inspect/assess, blocked dependency, complete read-Field obligations and caller diagnostic handling pass Rust, Node and staged Python; Chromium prepare/inspect/blocked passes. | Final package integration and dependent Manifest activation. |
| Action authoring | Node declaration → inspect → edit → assessment, custom caller validation and duplicate identity refusal pass with supported Actions. | Browser/Python/package activation. |
| Saga | Supported Action declaration → inspect → edit → assessment and opaque-source refusal pass through Node, CLI and installed Python. JSON object member order no longer changes parameter identity. | Browser/package activation. |
| Action selectors/rules/bulk | Native selector compilation, typed input admission, prepared identity selection, rule compilation and bulk-outcome validation pass all eight new Node normal/refusal cases. | Browser/package activation. |
| Security | Native function/value/query properties, source/parameter/domain activation and V2 source migration/transport pass Node baselines; basic query join passes Chromium. | Legacy policy/evaluation/registration, authority, catalog, purpose, obligation and V1/V2 disclosure workflows pass Node; final host activation remains. |
| Migration and row-scope | Discovery `.2`/`.3`/`.4`, G04 recipes, caller row-scope, compiler `.4`/`.5`/`.7`, public compile/verify and reviewed digest pass focused baselines. G02 orders revoke before column changes and grant afterward. | G01 `.3`, G11 `.6`, inventory command/seed/history and replay-refusal workflows pass; final package integration remains. |
| Python/CLI/package | Native adapters, Action Plan, callback semantics, Delta/RDF/Avro/PostgreSQL workflows and sdist include closure pass local focused cases without JavaScript on PATH. | Complete installed wheel/sdist, supported local platform builds and final CLI consumer. |

### Implemented public families and final host activation

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
| Core-ideal classifiers/projections/recovery | Classification, verification and available native/source recovery for Avro, Parquet, SQL Server, TableSpec and PostgreSQL; authored target projection/recovery. | Classifiers and the authored targets listed in current status pass. Complete only the remaining authored operations in the implementation lanes above, then final host activation. |
| Binding target projection | `projectBindingToDelta`, `projectBindingToIceberg`, `projectBindingToParquet`, `projectBindingToSqlServer`, `projectBindingTablesToSqlServer`, `projectBindingTablesAndIndexesToSqlServer`, `projectBindingTablesAndIndexesFromPlanToSqlServer`, `recoverBindingSqlServerNative`, `recoverBindingSqlServerSources`, `verifyBindingSqlServerProjection`, `validateSqlServerRelationshipLayout` | Delta, Iceberg and Parquet target workflows pass focused Node baselines. SQL Server tables and layout pass. Full outer SQL Server composition passes both focused public workflows; final host/package integration remains. |
| Binding index projection | `projectBindingIndexesToPostgresql`, `projectBindingIndexesToSqlServer`, `projectBindingIndexesAgainstSqlServerPlan` | Direct SQL Server index projection passes its focused normal/refusal baseline. PostgreSQL native admission, parser-AST acceptance and outcomes are Rust-owned; the focused expression-index and strict-refusal workflow passes. |
| Bit128 projection | `classifyBit128NativeType`, `decodeBit128FileRecord`, `encodeBit128FileRecord`, `projectBit128CarrierSchema`, `recoverBit128CarrierProjection`, `projectBit128Model`, `recoverBit128ModelProjection` | Classifier, Field authoring, binding inspection, full-row and file encode/decode, carrier/model projection/recovery pass Node; final host activation remains. |
| DDD → GraphQL/PostgreSQL | `projectDddEntitiesToGraphql`, `projectDddToGraphql`, `recoverDddFromGraphql`, `recoverDddGraphqlNative`, `verifyDddGraphqlProjection`, `projectDddTablesToPostgresql`, `projectDddTablesAndIndexesToPostgresql`, `projectDddToPostgresql`, `recoverDddPostgresqlIdeal`, `recoverDddPostgresqlNative`, `verifyDddPostgresqlProjection`, `validatePostgresqlRelationshipLayout` | All five GraphQL projection/verification/recovery operations pass focused Node baselines. PostgreSQL layout and full composition pass. The independent table API and table/index refusal/quoted-column cases pass; the combined report/strict baseline also passes its focused retry with its reviewed bounded-runtime allowance. |
| DDD → JSON Schema | `dddFieldBinding`, `projectDddToJsonSchema` | Native DDD mapping kernel and Node public projection/edit/read/write/refusal baselines pass; browser/Python activation remains. |
| Cross-format schema projections | `projectArrowToSpark`, `projectAvroToTableSpec`, `projectGraphqlInputToJsonSchema`, `projectJsonSchemaToProtobuf`, `projectOpenapiToJsonSchema`, `projectParquetToAvro`, `projectPostgresqlRowToJsonSchema`, `projectPostgresqlToAvro`, `projectSmithyToJsonSchema`, `projectSparkToArrow`, `projectSqlServerToAvro`, `projectSqlServerToDdl`, `projectTableSpecToAvro`, `projectToTableSpecViaAvro`, `projectTypeSpecToJsonSchema`, `createSmithyJavaScriptJsonSchemaBackend` | Focused Node workflows pass for the listed source-to-target Rust mappings. `createSmithyJavaScriptJsonSchemaBackend` is a host capability factory. Final browser/installed-package integration remains. |
| Table inventory migration | `compileTableInventoryMigration`, `discoverTableInventoryMigrationChanges`, `serializeTableInventoryMigration`, `verifyTableInventoryMigration`, `irreversiblePurgeDisclosure` | Rust initial inventory compile/discover/serialize/verify and removal discovery/disclosure pass. Retained G02, selected seeds, created-table commands, parameter/cross-table references and linked seed/history normal/refusal baselines pass. Final package integration remains. |
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
