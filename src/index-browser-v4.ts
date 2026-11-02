// SPDX-License-Identifier: MIT OR Apache-2.0
import {createMedicalRustDefault} from './domain-packs/medical-rust-default';
import {createPackToolsRustDefault} from './domain-packs/pack-tools-rust';
import {createDashboardRustDefault} from './extensions/dashboard/rust-default';
import type {Document,Diagnostic,Json} from './model/types';
import {createCoreIdealReportsRustDefault} from './core-ideals/reports-rust-default';
import {createSecurityAuthorityGuardRustDefault} from './extensions/security/authority-guard-rust-default';
import {createPythonClientRustCandidateV4} from './browser-v4';
import {initializePythonClientRustDefaultV4} from './access/rust-default-v4';
import {createJsonNumberEngine,initializeCoreModelRootKindNullabilityWasm,initializeCoreBit128FieldWasm,initializeCoreRecordValuesHostInputWasm,createDefaultSemanticTypeRegistry,createCoreKeyTupleEngine,createCoreCardinalityHostInputEngine,createCoreRecordTypeEngine,createSecurityLogicEngine,createSecurityFunctionsEngine,createSecurityQueryPropertiesEngine,createSecurityProtectionSourceEngine,createSecurityPolicySourceEngine,createSecurityReadRegistrationEngine,createSecurityAuthorityGuardEngine,createSecurityProtectionParametersEngine,createSecurityProtectionDomainsEngine,createJavascriptNumericEngine,createArrowSchemaEngine,createArrowIpcEngine,createDbtEngine,createGraphqlEngine,createRdfEngine,createNativeFamilyDispatcher,createPreparedJsonSchemaEngine,createCodegenEngine,createIcebergSchemaEngine,createIcebergTableEngine,createDeltaSchemaTableEngine,createDeltaLogEngine,createPostgresqlParserSessionEngine,createTypeSpecSessionEngine,createSmithySessionEngine,createActionPlanSessionEngine,createParquetCaptureEngine,createProtobufSourceImportEngine,createProtobufSourceExportEngine,UmfError as BindingUmfError,initializeProtobufDescriptorDocumentWasm,initializeBit128Wasm,isCoreBit128FieldBindingError,initializeTemporalWasm,createAccessTemporalEngine,isWireAdmissionError,isNativeUmfCoreError,isBit128EngineError,isHostJsonResponseError,isDbtHostError,ACCESS_TEMPORAL_PROFILE as ACCESS_TEMPORAL_PROFILE_RUST} from '../bindings/core/wasm/index.js';
import {CORE_MODEL_RESOURCES} from './access/core-model-resources';
import {bindCoreCardinalityRust} from './access/rust-cardinality-default';
import {bindCoreKindNullabilityRust} from './access/rust-kind-nullability-default';
import {bindCoreDatasetValuesCompactRust} from './access/rust-dataset-values-compact-default';
import {bindCoreFacetsRust} from './access/rust-facets-default';
import {bindCoreKeysRust} from './access/rust-keys-default';
import {bindCoreRelationshipsRust} from './access/rust-relationships-default';
import {bindBit128Rust} from './access/rust-bit128-default';
import {bindCoreBit128FieldRust} from './access/rust-core-bit128-field-default';
import {bindCsvBooleanLexicalRust} from './access/rust-csv-boolean-default';
import {bindCoreInspectorsRust} from './access/rust-core-inspectors-default';
import {bindCoreSchemaPropertiesRust} from './access/rust-schema-properties-default';
import {bindJavascriptNumericRust} from './access/rust-javascript-numeric-default';
import {bindCoreRecordTypeRust} from './access/rust-record-type-default';
import {bindCoreRecordValuesRust} from './access/rust-record-values-default';
import {bindCoreKeyTupleDefault} from './access/rust-key-tuple-default';
import {bindSemanticTypesRust} from './access/rust-semantic-types-default';
import {bindCoreSemanticTypesRust} from './access/rust-core-semantic-types-default';
import {bindSemanticTypeAccessorsRust} from './model/rust-semantic-type-accessors-default';
import {bindScalarTypesForVersionRust} from './access/rust-scalar-types-for-version-default';
import {createSecurityNotRustAdapter} from './extensions/security/rust-not-adapter';
import {createSecurityLogicRustAdapter} from './extensions/security/rust-logic-adapter';
import {createProtectionRustDefault} from './extensions/security/protection/rust-default';
import {createProtectionSourcesRustDefault} from './extensions/security/protection/rust-sources-default';
import {createSecurityPolicySourceRustDefault} from './extensions/security/policy-source-rust-default';
import {createSecurityPolicyRustDefault} from './extensions/security/policy-rust-default';
import {SecurityReadRegistration as SecurityReadRegistrationBase} from './extensions/security/registration-rust-default';
import {createRawTableBindingInspector} from './extensions/binding/raw-profiles-inspector';
import {createBindingRustDefault} from './extensions/binding/rust-default';
import {createRelationshipExtrasRustDefault} from './core-ideals/relationship-extras-rust-default';
import {createRelationshipPostgresqlRustDefault} from './core-ideals/relationship-postgresql-rust-default';
import {createNullabilitySqlServerRustDefault} from './core-ideals/nullability-sqlserver-rust-default';
import {createKeySqlServerRustDefault} from './core-ideals/key-sqlserver-rust-default';
import {createGeneratedSchemaGraphOperation} from './domain-packs/generated-schema-graph';
import {createDomainPackLoaderInspectionOperation} from './domain-packs/loader-rust';
import {createDomainPackProfileInspectionOperation} from './domain-packs/profile-rust';
import {createSecProjectionRustOperations} from './domain-packs/sec-projection-rust';
import {createReadDescriptorSetRustCandidate} from './adapters/protobuf/descriptor-rust-candidate';
import {createProtobufDescriptorDocumentRustDefault,createProtobufRegistryRustDefault} from './adapters/protobuf/rust-default';
import type {ProtobufDescriptorDocumentRustEngine} from './adapters/protobuf/rust-default';
import {arrowPackage} from './adapters/arrow';
import {arrowIpcPackage} from './adapters/arrow/capture';
import {arrowFlatbufferPackage} from './adapters/arrow/flatbuffer-model';
import {bindArrowSchemaRust} from './adapters/arrow/rust-default';
import {bindArrowIpcRust} from './adapters/arrow/rust-ipc-default';
import {bindDbtRust,createDbtRegistriesRustDefault} from './adapters/dbt/rust-default';
import {createRegistryRustDefault} from './registry/rust-default';
import {createExtensionRegistriesRustDefault} from './registry/extension-registries-rust-default';
import {createPreparedCoreInspectionRustDefault} from './model/prepared-inspection-rust-default';
import {createEditExtensionRustDefault} from './model/edit-extension-rust-default';
import {createCoreModelPublicRustDefault} from './model/rust-public-default';
import {createNativeUtilityDefaults} from './model/native-utility-default';
import {createTableInventoryRustDefault} from './table-migration/inventory-rust-default';
import {createJsonSchemaRustDefault} from './adapters/json-schema/rust-default';
import {createActionRuleRustDefault} from './extensions/actions/rust-rule-default';
import {createActionSelectorsRustDefault} from './extensions/actions/selector-rust-default';
import {createBulkOutcomeRustDefault} from './extensions/actions/bulk-rust-default';
import {createActionPlanRustDefault} from './extensions/actions/rust-default';
import {createActionManifestRustDefault} from './extensions/actions/manifest-rust-default';
import {createActionAuthoringRustDefault} from './extensions/actions/rust-authoring-default';
import {createActionRegistryRustDefault} from './extensions/actions/rust-registry';
import {createSagaRustDefault} from './extensions/actions/saga-rust-default';
import {sagaPackage} from './extensions/actions/saga-package';
import {createTableDeploymentRustDefault} from './table-deployment/rust-default';
import {createTableLifecycleRustDefault} from './extensions/tables/rust-default';
import {createRowScopeRustDefault} from './table-authoring/rust-default';
import {createTableMigrationDiscoveryRustDefault,createReviewedValueDigestRustDefault,createTableMigrationRustDefault} from './table-migration/rust-default';
import {CODEGEN_RESOURCES} from './access/codegen-resources';
import {createGraphqlRustDefault} from './adapters/graphql/rust-default';
import {createJsonLdRustDefault} from './adapters/jsonld/rust-default';
import {createOpenapiRustDefault} from './adapters/openapi/rust-default';
import {createOpenapiJsonSchemaRustDefault} from './projections/openapi-json-schema-rust-default';
import {createTypeSpecSmithyJsonSchemaRustDefault} from './projections/typespec-smithy-jsonschema-rust-default';
import {createLinkmlOdcsRustDefault} from './adapters/linkml-odcs-rust-default';
import {createTableSpecRustDefault} from './adapters/tablespec/rust-default';
import {createSqlServerRustDefault} from './adapters/sqlserver/rust-default';
import {createShaclRustDefault} from './adapters/shacl/rust-default';
import {createOwlRustDefault} from './adapters/owl/rust-default';
import {createRdfRustDefault} from './adapters/rdf/rust-default';
import {createAvroRustDefault} from './adapters/avro/rust-default';
import {createAvroJsonSchemaRustDefault} from './projections/avro-json-schema-rust-default';
import {createCoreIdealRustDefault} from './core-ideals/avro-cardinality-rust-default';
import {createArrowFlatbufferModelRustDefault} from './adapters/arrow/flatbuffer-model-rust-default';
import {createArrowSparkRustDefault} from './projections/arrow-spark-rust-default';
import {createAvroTableSpecRustDefault} from './projections/avro-tablespec-rust-default';
import {createPostgresqlAvroRustDefault} from './projections/postgresql-avro-rust-default';
import {createPostgresqlRowJsonSchemaRustDefault} from './projections/postgresql-json-schema-rust-default';
import {createJsonSchemaProtobufRustDefault} from './projections/json-schema-protobuf-rust-default';
import {createTableSpecViaAvroRustDefault} from './projections/tablespec-via-avro-rust-default';
import {createParquetAvroRustDefault} from './projections/parquet-avro-rust-default';
import {createSqlServerAvroRustDefault} from './projections/sqlserver-avro-rust-default';
import {createSqlServerDdlRustDefault} from './projections/sqlserver-ddl-rust-default';
import {createBindingIcebergRustDefault} from './projections/binding-iceberg-rust-default';
import {createBindingSqlServerPlannedIndexRustDefault} from './projections/binding-sqlserver-planned-index-rust-default';
import {createBindingSqlServerIndexesRustDefault} from './projections/binding-sqlserver/indexes-rust-default';
import {createBindingPostgresqlIndexesRustDefault} from './projections/binding-postgresql/indexes-rust-default';
import {createBindingParquetRustDefault} from './projections/binding-parquet-rust-default';
import {createBindingDeltaRustDefault} from './projections/binding-delta-rust-default';
import {createBindingSqlServerTablesRustDefault} from './projections/binding-sqlserver/tables-rust-default';
import {createBindingSqlServerPhysicalRustDefault} from './projections/binding-sqlserver/physical-rust-default';
import {createDddJsonSchemaRustDefault} from './projections/ddd-json-schema-rust-default';
import {createDddPostgresqlRustDefault} from './projections/ddd-postgresql-rust-default';
import {createPostgresqlRustDefault} from './adapters/postgresql/rust-default';
import {createPostgresqlAuthoredRustDefault} from './core-ideals/postgresql-authored-rust-default';
import {createPostgresqlAuthoredCardinalityRustDefault} from './core-ideals/cardinality-postgresql-rust-default';
import {createPostgresqlAuthoredKeysRustDefault} from './core-ideals/key-postgresql-rust-default';
import {createPostgresqlAuthoredFacetsRustDefault} from './core-ideals/facets-postgresql-rust-default';
import {createPostgresqlAuthoredNullabilityRustDefault} from './core-ideals/nullability-postgresql-rust-default';
import {createPostgresqlCatalogRustDefault} from './adapters/postgresql/catalog-rust-default';
import {createPostgresqlCatalogObservationRustDefault} from './adapters/postgresql/catalog-observation-rust-default';
import {createPostgresqlClassificationRustDefault} from './core-ideals/postgresql-classification-rust-default';
import {createPostgresqlDdlRustDefault} from './core-ideals/postgresql-ddl-rust-default';
import {createPostgresqlRelationshipClassificationRustDefault} from './core-ideals/relationship-postgresql-classification-rust-default';
import {bindParquetCaptureRust} from './adapters/parquet/rust-capture-default';
import {PARQUET_EXTENSION,PARQUET_MAX_BYTES,parquetPackage} from './adapters/parquet/package';
import {createIcebergSchemaRustDefault} from './adapters/iceberg/rust-default';
import {createIcebergTableRustDefault} from './adapters/iceberg/table-rust-default';
import {createDeltaRustDefault} from './adapters/delta/rust-default';
import {createTypeSpecRustDefault} from './adapters/typespec/rust-default';
import {createSmithyRustDefault} from './adapters/smithy/rust-default';
import {createSparkRustDefault} from './adapters/spark/rust-default';
import {SPARK_EXTENSION,sparkPackage} from './adapters/spark/package';
import type {SmithyNativeOperations} from './adapters/smithy/rust-default';
import {createSmithyJavaScriptBackend,createSmithyJavaScriptSelectionBackend,createSmithyWorkerBackend} from './adapters/smithy/host-backends';
import {createSmithyJavaScriptJsonSchemaBackend} from './adapters/smithy/json-schema-host-backend';
import {SMITHY_EXTENSION,smithyPackage} from './adapters/smithy/package';
import type {TypeSpecOperations} from './adapters/typespec/rust-default';
import {executeTypeSpecHostRequest} from './adapters/typespec/host-runtime';
import {executeTypeSpecParserRequest} from './adapters/typespec/typespec-host-parser';
import {DELTA_EXTENSION,DELTA_TABLE_EXTENSION,DELTA_LOG_EXTENSION,deltaPackage,deltaTablePackage,deltaLogPackage} from './adapters/delta/package';
import {ICEBERG_TABLE_EXTENSION,icebergTablePackage} from './adapters/iceberg/table-package';
import {ICEBERG_EXTENSION,icebergPackage} from './adapters/iceberg/package';
import {createProtobufSourceRustDefault} from './adapters/protobuf/source-rust-default';
import type {generateDatasetSourceSchema as DatasetSourceSchemaReference} from './domain-packs/source-schema';
import type {generateDomainPackSchema as DomainPackSchemaReference} from './domain-packs/schema';
import type {generateArtifactCollectionSchema as ArtifactCollectionSchemaReference} from './domain-packs/artifacts';
import type {generateDomainPackLoaderSchema as DomainPackLoaderSchemaReference} from './domain-packs/loader';
import type {generateLoaderInventorySchema as LoaderInventorySchemaReference} from './domain-packs/loader-inventory';
import type {AccessTemporal,AccessTemporalKind} from '../bindings/core/wasm/index.js';
import {CURRENT_CORE_VERSION,SCALAR_TYPES,UmfError} from './model/types';

// Module import resolves only after the browser WASM engine is ready. The
// function exported below remains synchronous and never falls back to TypeScript.
const generatePythonClient=await initializePythonClientRustDefaultV4(()=>createPythonClientRustCandidateV4());
const wasmModule=await import('../bindings/core/wasm/pkg/umf_core_wasm.js');
const graphql=createGraphqlRustDefault(createGraphqlEngine(wasmModule),isNativeUmfCoreError,()=>new Registry());
const actionPlanSession=createActionPlanSessionEngine(wasmModule);
const actionPlan=createActionPlanRustDefault(actionPlanSession,isNativeUmfCoreError);
const actionManifest=createActionManifestRustDefault(actionPlanSession,actionPlan,isNativeUmfCoreError);
const {constructActionManifest,inspectActionManifest,assessActionManifest}=actionManifest;
const {prepareActionPlanModel,inspectActionPlan,assessActionPlan}=actionPlan;
const actionAuthoring=createActionAuthoringRustDefault(()=>createCodegenEngine(wasmModule,CODEGEN_RESOURCES),error=>isNativeUmfCoreError(error)||isWireAdmissionError(error));
const actionRegistry=createActionRegistryRustDefault(()=>createCodegenEngine(wasmModule,CODEGEN_RESOURCES),isNativeUmfCoreError);
const {inspectActions,declareAction,editAction,assessAction}=actionAuthoring;
const {registerActions}=actionRegistry;
const saga=createSagaRustDefault(createCodegenEngine(wasmModule,Object.assign({},CODEGEN_RESOURCES,{sagaPackage})),isNativeUmfCoreError);
const {inspectSagas,declareSaga,editSaga,assessSaga}=saga;
const rdf=createRdfRustDefault(createRdfEngine(wasmModule),isNativeUmfCoreError,()=>new Registry());
const {rdfRegistry,inspectRdfDocument,importRdfNQuads,getRdfQuads,exportRdfNQuads,proposeRdfQuadEdit,proposeRdfIriRename,importRdfTurtle,exportRdfTurtle,getRdfNamedGraphs,importRdfTriG,exportRdfTriG,proposeRdfDatasetMerge,generalizedRdfRegistry,inspectGeneralizedRdfDocument,importGeneralizedRdfDataset,exportGeneralizedRdfDataset,getGeneralizedRdfQuads,proposeGeneralizedRdfQuadEdit}=rdf;
const {graphqlRegistry,importGraphqlSchema,inspectGraphql,exportGraphqlSchema,getGraphqlAst,editGraphqlAst,exportGraphqlBundle,projectGraphqlInputToJsonSchema}=graphql;
const nativeFamilyDispatcher=createNativeFamilyDispatcher(wasmModule);
const packTools=createPackToolsRustDefault({generatePackTools:request=>nativeFamilyDispatcher['pack-tools'].generatePackTools({request})},isNativeUmfCoreError);
const {generatePackTools}=packTools;
const medical=createMedicalRustDefault(nativeFamilyDispatcher,isNativeUmfCoreError);
const {projectMedicalFhir,projectCdcMortality,projectDicomMetadata,lookupMedicalTerminology}=medical;
const spark=createSparkRustDefault(nativeFamilyDispatcher,isNativeUmfCoreError,()=>new Registry());
const {sparkRegistry,inspectSpark,importSparkSchema,exportSparkSchema,getSparkNode,proposeSparkNodeEdit,renameSparkField}=spark;
const protection=createProtectionRustDefault(Object.assign({},createSecurityFunctionsEngine(wasmModule),createSecurityQueryPropertiesEngine(wasmModule)),isNativeUmfCoreError);
const protectionSources=createProtectionSourcesRustDefault(Object.assign({},createSecurityProtectionSourceEngine(wasmModule),createSecurityProtectionParametersEngine(wasmModule),createSecurityProtectionDomainsEngine(wasmModule)),isNativeUmfCoreError);
const {resolveSecurityProtectionSources,resolveSecurityProtectionDomains,validateProtectionParameters,inspectProtectionCatalog,requireProtectionInterpretation}=protectionSources;
const securityPolicySource=createSecurityPolicySourceRustDefault(createSecurityPolicySourceEngine(wasmModule),isNativeUmfCoreError);
const securityPolicy=createSecurityPolicyRustDefault(securityPolicySource,isNativeUmfCoreError);
const {inspectSecurityPolicy,requireSecurityInterpretation,securityPolicyDependencies,securityIdentityTransportDependencies}=securityPolicy;
const {validateSecurityDisclosure,encodeSecurityDisclosure,decodeSecurityDisclosure}=securityPolicySource;
const {inspectSecurityDisclosureV2,encodeSecurityDisclosureV2,decodeSecurityDisclosureV2}=securityPolicySource;
const {inspectSecurityActionPurposes,inspectProtectionObligations}=securityPolicySource;
const securityReadRegistrationEngine=createSecurityReadRegistrationEngine(wasmModule);
const SecurityAuthorityGuard=createSecurityAuthorityGuardRustDefault(createSecurityAuthorityGuardEngine(wasmModule),isNativeUmfCoreError);
const {inspectSecurityPolicyV2Source,upgradeSecurityPolicySource,downgradeSecurityPolicySource,readSecuritySource,writeSecuritySource,evaluateSecurityAccess,evaluateSecurityCollection,evaluateSecurityWrite,evaluateSecurityPolicyV2LegacyAccess}=securityPolicySource;
class SecurityReadRegistration extends SecurityReadRegistrationBase { constructor() { super(securityReadRegistrationEngine,isNativeUmfCoreError); } }
const {inspectProtectionFunction,evaluateProtectionValue,inspectProtectionQueryProperties}=protection;
const evaluateActionRule=createActionRuleRustDefault(()=>createCodegenEngine(wasmModule,CODEGEN_RESOURCES),error=>isNativeUmfCoreError(error)||isWireAdmissionError(error));
const actionSelectors=createActionSelectorsRustDefault(()=>createCodegenEngine(wasmModule,CODEGEN_RESOURCES),error=>isNativeUmfCoreError(error)||isWireAdmissionError(error));
const validateBulkOutcome=createBulkOutcomeRustDefault(()=>createCodegenEngine(wasmModule,CODEGEN_RESOURCES),error=>isNativeUmfCoreError(error)||isWireAdmissionError(error));
const {compileActionRule,compileActionSelector,admitActionInputs,selectActionIdentity,prepareActionIdentities,actionFieldValueKey}=actionSelectors;
const tableDeployment=createTableDeploymentRustDefault(()=>createCodegenEngine(wasmModule,CODEGEN_RESOURCES),error=>isNativeUmfCoreError(error)||isWireAdmissionError(error));
const normalizeRowScope=createRowScopeRustDefault(()=>createCodegenEngine(wasmModule,CODEGEN_RESOURCES),error=>isNativeUmfCoreError(error)||isWireAdmissionError(error));
const discoverTableMigrationChanges=createTableMigrationDiscoveryRustDefault(()=>createCodegenEngine(wasmModule,CODEGEN_RESOURCES),error=>isNativeUmfCoreError(error)||isWireAdmissionError(error));
const reviewedValueDigest=createReviewedValueDigestRustDefault(()=>createCodegenEngine(wasmModule,CODEGEN_RESOURCES));
const tableMigration=createTableMigrationRustDefault(()=>createCodegenEngine(wasmModule,CODEGEN_RESOURCES),error=>isNativeUmfCoreError(error)||isWireAdmissionError(error));
const {compileTableMigration,verifyTableMigration}=tableMigration;
const {compileTableInventoryMigration,discoverTableInventoryMigrationChanges,verifyTableInventoryMigration,serializeTableInventoryMigration,irreversiblePurgeDisclosure}=createTableInventoryRustDefault(()=>createCodegenEngine(wasmModule,CODEGEN_RESOURCES),error=>isNativeUmfCoreError(error)||isWireAdmissionError(error));
const {compileTableDeployment,verifyTableDeployment}=tableDeployment;
const {inspectTableLifecycle}=createTableLifecycleRustDefault(()=>createCodegenEngine(wasmModule,CODEGEN_RESOURCES),error=>isNativeUmfCoreError(error)||isWireAdmissionError(error));
const deltaDdlOperations=nativeFamilyDispatcher['delta-ddl'];
const deltaParquetOperations=nativeFamilyDispatcher['delta-parquet'];
const deltaEngine=Object.assign({},createDeltaSchemaTableEngine(wasmModule),createDeltaLogEngine(wasmModule),{
  inspectDefinitionPayload:(payload:Json)=>deltaDdlOperations.inspectPayload({payload}) as Diagnostic[],
  defineTable:(source:string,definition:import('./adapters/delta/ddl').DeltaDefinition,id:string)=>deltaDdlOperations.defineTable({source,definition,id}) as Document,
  generateDdl:(document:Document)=>deltaDdlOperations.generate({document}) as ReturnType<typeof import('./adapters/delta/ddl').generateDeltaDDL>,
  generateDdlBundle:(documents:readonly Document[])=>deltaDdlOperations.generateBundle({documents}) as ReturnType<typeof import('./adapters/delta/ddl').generateDeltaDDLBundle>,
  realizeSparkDelta4:(document:Document,target:Parameters<typeof import('./adapters/delta/ddl').realizeSparkDelta4DDL>[1])=>deltaDdlOperations.realizeSparkDelta4({document,target}) as ReturnType<typeof import('./adapters/delta/ddl').realizeSparkDelta4DDL>,
  projectParquetActions:(document:Document)=>deltaParquetOperations.projectActions({document}) as ReturnType<typeof import('./adapters/delta/parquet').projectDeltaParquetActions>,
  reconcileCheckpoint:(checkpoint:import('./adapters/delta/reconcile').DeltaCommit,commits:import('./adapters/delta/reconcile').DeltaCommit[],spec:'v1'|'v2')=>nativeFamilyDispatcher['delta-log'].reconcileCheckpoint({checkpoint,commits,spec}) as ReturnType<typeof import('./adapters/delta/reconcile').reconcileDeltaCheckpoint>,
  reconcileParquetCheckpoint:(checkpoint:import('./adapters/delta/reconcile').DeltaCommit,commits:import('./adapters/delta/reconcile').DeltaCommit[],spec:'v1'|'v2',sidecars:import('./adapters/delta/sidecars').DeltaSidecar[])=>deltaParquetOperations.reconcileCheckpoint({checkpoint,commits,spec,sidecars}) as ReturnType<typeof import('./adapters/delta/parquet-checkpoint').reconcileDeltaParquetCheckpoint>,
  reconcileMultipart:(version:string,partCount:number,parts:import('./adapters/delta/multipart').DeltaCheckpointPart[],commits:import('./adapters/delta/reconcile').DeltaCommit[])=>deltaParquetOperations.reconcileMultipart({version,partCount,parts,commits}) as ReturnType<typeof import('./adapters/delta/multipart').reconcileDeltaMultipartCheckpoint>,
});
const delta=createDeltaRustDefault(deltaEngine,error=>isNativeUmfCoreError(error)||error instanceof BindingUmfError,()=>new Registry());
const {deltaRegistry,deltaTableRegistry,deltaLogRegistry,inspectDelta,importDeltaSchema,exportDeltaSchema,getDeltaNode,proposeDeltaNodeEdit,inspectDeltaTable,importDeltaTable,exportDeltaTable,getDeltaTableNode,proposeDeltaTableNodeEdit,renameDeltaMappedField,getDeltaTableSchema,captureDeltaLog,exportDeltaLog,inspectDeltaLog,inspectDeltaActions,reconcileDeltaCommits,reconcileDeltaCheckpoint,reconcileDeltaCheckpointSidecars,defineDeltaTable,generateDeltaDDL,generateDeltaDDLBundle,realizeSparkDelta4DDL,projectDeltaParquetActions,reconcileDeltaParquetCheckpoint,reconcileDeltaMultipartCheckpoint}=delta;
const icebergSchema=createIcebergSchemaRustDefault(createIcebergSchemaEngine(wasmModule),error=>isNativeUmfCoreError(error)||error instanceof BindingUmfError,()=>new Registry());
const {icebergRegistry,inspectIceberg,importIcebergSchema,exportIcebergSchema,getIcebergNode,proposeIcebergNodeEdit}=icebergSchema;
const icebergTable=createIcebergTableRustDefault(createIcebergTableEngine(wasmModule),error=>isNativeUmfCoreError(error)||error instanceof BindingUmfError,()=>new Registry());
const {icebergTableRegistry,inspectIcebergTable,importIcebergTable,exportIcebergTable,getIcebergTableNode,proposeIcebergTableNodeEdit,inspectIcebergTableContext,inspectIcebergTableTransforms,inspectIcebergTransformType,proposeIcebergTableRename,proposeIcebergTablePromotion}=icebergTable;
const avro=createAvroRustDefault(nativeFamilyDispatcher,isNativeUmfCoreError,()=>new Registry());
const {avroRegistry,inspectAvro,importAvroSchema,getAvroFieldMetadata,exportAvroSchema,exportAvroBundle,getAvroNode,editAvroNode,proposeAvroNodeEdit}=avro;
const {projectAvroToJsonSchema}=createAvroJsonSchemaRustDefault(nativeFamilyDispatcher,isNativeUmfCoreError);
const coreIdealRust=createCoreIdealRustDefault(nativeFamilyDispatcher,isNativeUmfCoreError);
const {projectCardinalityToSqlServer,recoverCardinalityFromSqlServer,projectFieldToSqlServer,recoverFieldFromSqlServer,projectRecordToSqlServer,recoverRecordFromSqlServer}=coreIdealRust;
const {recoverNullabilityFromParquet,projectNullabilityToParquet,recoverFacetsFromParquet,projectFacetsToParquet,recoverKeysParquetIdeal,verifyKeysParquetProjection,projectKeysToParquet,recoverCardinalityFromParquet,projectCardinalityToParquet,projectCardinalityToAvro,recoverCardinalityFromAvro,classifyAvroCardinality,verifyAvroCardinalityClassification,recoverAvroCardinalityBundle,classifyAvroRecordType,recoverAvroRecordTypeBundle,classifyParquetRecordType,recoverParquetRecordTypeBytes,classifyParquetRecord,recoverParquetRecordBytes,classifyParquetRelationships,verifyParquetRelationshipClassification,recoverParquetRelationshipSource,classifyParquetNullability,verifyParquetNullabilityClassification,recoverParquetNullabilityBytes,classifyParquetField,verifyParquetFieldClassification,recoverParquetFieldBytes,classifyParquetKeys,verifyParquetKeyClassification,recoverParquetKeySource,classifyParquetCardinality,verifyParquetCardinalityClassification,recoverParquetCardinalityBytes,classifyParquetFacets,verifyParquetFacetClassification,recoverParquetFacetSource,classifyAvroField,recoverAvroFieldBundle,classifyAvroRecord,recoverAvroRecordBundle,classifyAvroKeys,verifyAvroKeyClassification,recoverAvroKeySource,classifyAvroRelationships,verifyAvroRelationshipClassification,recoverAvroRelationshipSource,classifyAvroNullability,verifyAvroNullabilityClassification,recoverAvroNullabilityBundle,classifyAvroFacets,verifyAvroFacetClassification,recoverAvroFacetSource,projectNullabilityToAvro,recoverNullabilityFromAvro,projectFacetsToAvro,recoverFacetsFromAvro,projectFacetsToSqlServer,recoverFacetsFromSqlServer,projectKeysToAvro,verifyKeysAvroProjection,recoverKeysAvroIdeal,projectFieldToAvro,recoverFieldFromAvro,projectRecordToAvro,recoverRecordFromAvro,projectFieldToParquet,recoverFieldFromParquet,projectRecordToParquet,recoverRecordFromParquet,projectRelationshipToAvro:rustProjectRelationshipToAvro,verifyRelationshipAvroProjection:rustVerifyRelationshipAvroProjection,recoverRelationshipAvroIdeal:rustRecoverRelationshipAvroIdeal,recoverRelationshipAvroNative:rustRecoverRelationshipAvroNative,projectRelationshipToTableSpec:rustProjectRelationshipToTableSpec,verifyRelationshipTableSpecProjection:rustVerifyRelationshipTableSpecProjection,recoverRelationshipTableSpecIdeal:rustRecoverRelationshipTableSpecIdeal,recoverRelationshipTableSpecNativeSources:rustRecoverRelationshipTableSpecNativeSources,projectRelationshipToSqlServer,verifyRelationshipSqlServerProjection,recoverRelationshipSqlServerIdeal,recoverRelationshipSqlServerBinding,recoverRelationshipSqlServerNative}=coreIdealRust;
const projectRelationshipToAvro=rustProjectRelationshipToAvro,verifyRelationshipAvroProjection=rustVerifyRelationshipAvroProjection,recoverRelationshipAvroIdeal=rustRecoverRelationshipAvroIdeal,recoverRelationshipAvroNative=rustRecoverRelationshipAvroNative;
const projectRelationshipToTableSpec=rustProjectRelationshipToTableSpec,verifyRelationshipTableSpecProjection=rustVerifyRelationshipTableSpecProjection,recoverRelationshipTableSpecIdeal=rustRecoverRelationshipTableSpecIdeal,recoverRelationshipTableSpecNativeSources=rustRecoverRelationshipTableSpecNativeSources;
const arrowFlatbufferModel=createArrowFlatbufferModelRustDefault(nativeFamilyDispatcher,isNativeUmfCoreError);
const {importArrowFlatbufferModel,inspectArrowFlatbufferModel,exportArrowFlatbufferModel,proposeArrowFlatbufferEdit,decodeArrowFlatbuffer,encodeArrowFlatbuffer}=arrowFlatbufferModel;
const {projectArrowToSpark,projectSparkToArrow}=createArrowSparkRustDefault(nativeFamilyDispatcher,isNativeUmfCoreError);
const {projectAvroToTableSpec,projectTableSpecToAvro}=createAvroTableSpecRustDefault(nativeFamilyDispatcher,isNativeUmfCoreError);
const {projectPostgresqlToAvro}=createPostgresqlAvroRustDefault(nativeFamilyDispatcher,isNativeUmfCoreError);
const {projectPostgresqlRowToJsonSchema}=createPostgresqlRowJsonSchemaRustDefault(nativeFamilyDispatcher,isNativeUmfCoreError);
const {projectToTableSpecViaAvro}=createTableSpecViaAvroRustDefault(nativeFamilyDispatcher,isNativeUmfCoreError);
const {projectParquetToAvro}=createParquetAvroRustDefault(nativeFamilyDispatcher,isNativeUmfCoreError);
const {projectSqlServerToAvro}=createSqlServerAvroRustDefault(nativeFamilyDispatcher,isNativeUmfCoreError);
const {projectSqlServerToDdl}=createSqlServerDdlRustDefault(nativeFamilyDispatcher,isNativeUmfCoreError);
const {projectBindingToIceberg}=createBindingIcebergRustDefault(nativeFamilyDispatcher);
const {projectBindingIndexesAgainstSqlServerPlan}=createBindingSqlServerPlannedIndexRustDefault(nativeFamilyDispatcher);
const {projectBindingToParquet}=createBindingParquetRustDefault(nativeFamilyDispatcher);
const {projectBindingToDelta}=createBindingDeltaRustDefault(nativeFamilyDispatcher);
const {projectBindingTablesToSqlServer,projectBindingTablesAndIndexesFromPlanToSqlServer,projectBindingTablesAndIndexesToSqlServer}=createBindingSqlServerTablesRustDefault(nativeFamilyDispatcher);
const bindingSqlServerPhysical=createBindingSqlServerPhysicalRustDefault(nativeFamilyDispatcher);
const {projectBindingToSqlServer,verifyBindingSqlServerProjection,recoverBindingSqlServerSources,recoverBindingSqlServerNative}=bindingSqlServerPhysical;
const dddRust=createDddJsonSchemaRustDefault(nativeFamilyDispatcher,isNativeUmfCoreError);
const {projectDddToJsonSchema,dddFieldBinding,projectDddEntitiesToGraphql,projectDddToGraphql,verifyDddGraphqlProjection,recoverDddFromGraphql,recoverDddGraphqlNative,validateSqlServerRelationshipLayout,validatePostgresqlRelationshipLayout}=dddRust;
const parquet=bindParquetCaptureRust(createParquetCaptureEngine(wasmModule),isNativeUmfCoreError,error=>error instanceof BindingUmfError);
const {captureParquet,importParquetSchema,encodeParquetWire,exportParquetCapture,inspectParquetFraming,decodeParquetFooter,inspectParquetMetadata,getParquetArrowSchema,renameParquetFieldWithArrowSchema,inspectParquetSchema,inspectParquetPages,decodeParquetPageBodies,decodeParquetLevels,decodeParquetPhysical,decodeParquetValues,assembleParquetRows,repairParquetDictionaryOffsets,inspectParquetLogicalTypes,inspectParquetContainers,getParquetFieldMetadata,appendParquetKeyValueMetadata,renameParquetField}=parquet;
function parquetRegistry():Registry{return new Registry().register(parquetPackage);}
const postgresql=createPostgresqlRustDefault(createPostgresqlParserSessionEngine(wasmModule),isNativeUmfCoreError,()=>new Registry());
const postgresqlAuthored=createPostgresqlAuthoredRustDefault(nativeFamilyDispatcher,postgresql,isNativeUmfCoreError);
const postgresqlAuthoredKeys=createPostgresqlAuthoredKeysRustDefault(nativeFamilyDispatcher,postgresql,isNativeUmfCoreError);
const {projectKeysToPostgresql,verifyKeysPostgresqlProjection,recoverKeysPostgresqlIdeal}=postgresqlAuthoredKeys;
const {projectFieldToPostgresql,recoverFieldFromPostgresql,projectRecordToPostgresql,recoverRecordFromPostgresql}=postgresqlAuthored;
const postgresqlAuthoredCardinality=createPostgresqlAuthoredCardinalityRustDefault(nativeFamilyDispatcher,postgresql,isNativeUmfCoreError);
const {projectCardinalityToPostgresql,recoverCardinalityFromPostgresql}=postgresqlAuthoredCardinality;
const postgresqlAuthoredFacets=createPostgresqlAuthoredFacetsRustDefault(nativeFamilyDispatcher,postgresql,isNativeUmfCoreError);
const {projectFacetsToPostgresql,recoverFacetsFromPostgresql}=postgresqlAuthoredFacets;
const postgresqlAuthoredNullability=createPostgresqlAuthoredNullabilityRustDefault(nativeFamilyDispatcher,postgresql,isNativeUmfCoreError);
const {projectNullabilityToPostgresql,recoverNullabilityFromPostgresql}=postgresqlAuthoredNullability;
const postgresqlCatalog=createPostgresqlCatalogRustDefault(nativeFamilyDispatcher,isNativeUmfCoreError,()=>new Registry());
const postgresqlCatalogObservations=createPostgresqlCatalogObservationRustDefault(nativeFamilyDispatcher,isNativeUmfCoreError);
const {inspectPostgresqlKeyCatalog,correlatePostgresqlKeyCatalog,inspectPostgresqlCardinalityCatalog,resolvePostgresqlCardinalityType,correlatePostgresqlCardinalityCatalog}=postgresqlCatalogObservations;
const {postgresqlCatalogRegistry,inspectPostgresqlCatalog,importPostgresqlCatalogCapture,exportPostgresqlCatalogCapture,getPostgresqlColumnMetadata,getPostgresqlCatalogNode,findPostgresqlCatalogRelation,proposePostgresqlCatalogEdit,getPostgresqlCatalogReconstruction,queryPostgresqlCatalogDependencies}=postgresqlCatalog;
const {projectBindingIndexesToPostgresql}=createBindingPostgresqlIndexesRustDefault(nativeFamilyDispatcher,postgresql);
const {postgresqlRegistry,validatePostgresqlAst,inspectPostgresql,importPostgresqlSql,exportPostgresqlSql,getPostgresqlSource,getPostgresqlNode,proposePostgresqlNodeEdit}=postgresql;
const postgresqlClassification=createPostgresqlClassificationRustDefault(nativeFamilyDispatcher,isNativeUmfCoreError);
const postgresqlDdl=createPostgresqlDdlRustDefault(nativeFamilyDispatcher,isNativeUmfCoreError);
const {getPostgresqlDdlDeclarations,classifyPostgresqlDdlRecord,recoverPostgresqlDdlKinds}=postgresqlDdl;
const coreIdealReports=createCoreIdealReportsRustDefault(nativeFamilyDispatcher,isNativeUmfCoreError,{projectFieldToPostgresql,projectRecordToPostgresql,classifyPostgresqlDdlRecord});
const postgresqlRelationships=createPostgresqlRelationshipClassificationRustDefault(nativeFamilyDispatcher,isNativeUmfCoreError);
const {classifyPostgresqlRelationships,verifyPostgresqlRelationshipClassification,recoverPostgresqlRelationshipSource}=postgresqlRelationships;
const {classifyPostgresqlComposite,verifyPostgresqlCompositeClassification,recoverPostgresqlCompositeCapture,classifyPostgresqlField,verifyPostgresqlFieldClassification,recoverPostgresqlFieldCapture,classifyPostgresqlRecord,verifyPostgresqlRecordClassification,recoverPostgresqlRecordCapture,classifyPostgresqlCardinality,verifyPostgresqlCardinalityClassification,recoverPostgresqlCardinalitySource,classifyPostgresqlNullability,verifyPostgresqlNullabilityClassification,recoverPostgresqlNullabilitySource,classifyPostgresqlKeys,verifyPostgresqlKeyClassification,recoverPostgresqlKeySource,classifyPostgresqlFacets,verifyPostgresqlFacetClassification,recoverPostgresqlFacetSource}=postgresqlClassification;
const dddPostgresqlRust=createDddPostgresqlRustDefault(nativeFamilyDispatcher,postgresql,isNativeUmfCoreError);
const rawTypeSpecSession=createTypeSpecSessionEngine(wasmModule,{executeCompilerRequest:executeTypeSpecHostRequest,executeParserRequest:executeTypeSpecParserRequest});
const typespecOperations:TypeSpecOperations={
 inspectTypeSpec:document=>rawTypeSpecSession.inspectTypeSpec(document) as ReturnType<TypeSpecOperations['inspectTypeSpec']>,
 importTypeSpecSources:(input,options)=>rawTypeSpecSession.importTypeSpecSources(input,options) as ReturnType<TypeSpecOperations['importTypeSpecSources']>,
 exportTypeSpecSources:document=>rawTypeSpecSession.exportTypeSpecSources(document) as ReturnType<TypeSpecOperations['exportTypeSpecSources']>,
 proposeTypeSpecSourceEdit:(document,path,source)=>rawTypeSpecSession.proposeTypeSpecSourceEdit(document,path,source) as ReturnType<TypeSpecOperations['proposeTypeSpecSourceEdit']>,
 getTypeSpecSyntax:(document,path)=>rawTypeSpecSession.getTypeSpecSyntax(document,path) as ReturnType<TypeSpecOperations['getTypeSpecSyntax']>,
 inspectTypeSpecPayload:payload=>rawTypeSpecSession.inspectTypeSpecPayload(payload) as ReturnType<TypeSpecOperations['inspectTypeSpecPayload']>,
 compileTypeSpecDocument:document=>rawTypeSpecSession.compileTypeSpecDocument(document) as ReturnType<TypeSpecOperations['compileTypeSpecDocument']>,
 getTypeSpecSemanticGraph:(document,input)=>rawTypeSpecSession.getTypeSpecSemanticGraph(document,input) as ReturnType<TypeSpecOperations['getTypeSpecSemanticGraph']>,
 emitTypeSpecJsonSchema:(document,input)=>rawTypeSpecSession.emitTypeSpecJsonSchema(document,input) as ReturnType<TypeSpecOperations['emitTypeSpecJsonSchema']>,
};
const typespec=createTypeSpecRustDefault(typespecOperations,isNativeUmfCoreError,()=>new Registry());
const {TYPESPEC_EXTENSION,typespecPackage,typespecRegistry,inspectTypeSpec,importTypeSpecSources,exportTypeSpecSources,compileTypeSpecDocument,getTypeSpecSyntax,getTypeSpecSemanticGraph,emitTypeSpecJsonSchema,proposeTypeSpecSourceEdit}=typespec;
const rawSmithySession=createSmithySessionEngine(wasmModule);
const smithyOperations:SmithyNativeOperations={
 inspect:({document})=>rawSmithySession.inspect({document}) as ReturnType<SmithyNativeOperations['inspect']>,
 inspectPayload:({payload})=>rawSmithySession.inspectPayload({payload}) as ReturnType<SmithyNativeOperations['inspectPayload']>,
 importJson:({source,id,dependencies})=>rawSmithySession.importJson({source,id,...(dependencies?{dependencies}:{})}) as ReturnType<SmithyNativeOperations['importJson']>,
 importSources:({files,id})=>rawSmithySession.importSources({files,id}) as ReturnType<SmithyNativeOperations['importSources']>,
 exportJson:({document})=>rawSmithySession.exportJson({document}) as ReturnType<SmithyNativeOperations['exportJson']>,
 exportSources:({document})=>rawSmithySession.exportSources({document}) as ReturnType<SmithyNativeOperations['exportSources']>,
 exportBundle:({document})=>rawSmithySession.exportBundle({document}) as ReturnType<SmithyNativeOperations['exportBundle']>,
 getNode:({document,path,dependencyId})=>rawSmithySession.getNode({document,path,...(dependencyId===undefined?{}:{dependencyId})}) as ReturnType<SmithyNativeOperations['getNode']>,
 editNode:({document,path,replacement,dependencyId})=>rawSmithySession.editNode({document,path,replacement,...(dependencyId===undefined?{}:{dependencyId})}) as ReturnType<SmithyNativeOperations['editNode']>,
 editSource:({document,path,source})=>rawSmithySession.editSource({document,path,source}) as ReturnType<SmithyNativeOperations['editSource']>,
 assembleSmithyDocument:(document,backend,options)=>rawSmithySession.assembleSmithyDocument(document,backend,options) as ReturnType<SmithyNativeOperations['assembleSmithyDocument']>,
 selectSmithyShapes:(document,backend,selector,options)=>rawSmithySession.selectSmithyShapes(document,backend,selector,options) as ReturnType<SmithyNativeOperations['selectSmithyShapes']>,
};
const smithy=createSmithyRustDefault(smithyOperations,isNativeUmfCoreError,()=>new Registry());
const {smithyRegistry,inspectSmithy,importSmithyJson,importSmithySources,exportSmithyJson,exportSmithySources,exportSmithyBundle,getSmithyNode,proposeSmithyNodeEdit,proposeSmithySourceEdit,assembleSmithyDocument,selectSmithyShapes}=smithy;
const jsonld=createJsonLdRustDefault(nativeFamilyDispatcher,isNativeUmfCoreError,()=>new Registry());
const {jsonldRegistry,importJsonLdDocument,inspectJsonLdDocument,exportJsonLdDocument,getJsonLdNode,proposeJsonLdNodeEdit,proposeJsonLdExpansion,proposeJsonLdFlatten,proposeJsonLdCompaction,proposeJsonLdFraming,proposeJsonLdToRdf,proposeRdfToJsonLd,proposeGeneralizedRdfToJsonLd}=jsonld;
const openapi=createOpenapiRustDefault(nativeFamilyDispatcher,isNativeUmfCoreError,()=>new Registry());
const {openapiRegistry,importOpenapiDocument,inspectOpenapi,exportOpenapiDocument,getOpenapiNode,lookupOpenapiResource,extractOpenapiSchema,indexOpenapiSchemas,resolveOpenapiSchemaReference,resolveOpenapiDynamicReference,resolveOpenapiObjectReference,exportOpenapiBundle,proposeOpenapiEdit}=openapi;
const openapiJsonSchemaProjection=createOpenapiJsonSchemaRustDefault(nativeFamilyDispatcher,isNativeUmfCoreError);
const {projectOpenapiToJsonSchema}=openapiJsonSchemaProjection;
const typespecSmithyJsonSchema=createTypeSpecSmithyJsonSchemaRustDefault(nativeFamilyDispatcher,emitTypeSpecJsonSchema,assembleSmithyDocument,isNativeUmfCoreError);
const {projectTypeSpecToJsonSchema,projectSmithyToJsonSchema}=typespecSmithyJsonSchema;
const linkmlOdcs=createLinkmlOdcsRustDefault(nativeFamilyDispatcher,isNativeUmfCoreError,()=>new Registry());
const {linkmlRegistry,importLinkmlDocument,inspectLinkmlDocument,exportLinkmlDocument,getLinkmlDocumentNode,proposeLinkmlDocumentNodeEdit,inspectLinkmlImportContext,proposeLinkmlImportMerge,inspectLinkmlClassSlots,inspectLinkmlSlotValues,odcsRegistry,importOdcsDocument,inspectOdcsDocument,exportOdcsDocument,getOdcsDocumentNode,proposeOdcsDocumentNodeEdit,resolveOdcsReference,inspectOdcsRelationships,proposeOdcsElementRename}=linkmlOdcs;
const tableSpec=createTableSpecRustDefault(nativeFamilyDispatcher,isNativeUmfCoreError,()=>new Registry());
const {importTableSpec,inspectTableSpec,exportTableSpec,getTableSpecTable,getTableSpecColumn,editTableSpecTable,editTableSpecColumn,importTableSpecBundle,exportTableSpecBundle,classifyTableSpecField,verifyTableSpecFieldClassification,projectFieldToTableSpec,recoverFieldFromTableSpec,classifyTableSpecRecord,verifyTableSpecRecordClassification,projectRecordToTableSpec,recoverRecordFromTableSpec,projectCardinalityToTableSpec,recoverCardinalityFromTableSpec,projectNullabilityToTableSpec,recoverNullabilityFromTableSpec,classifyTableSpecCardinality,verifyTableSpecCardinalityClassification,recoverTableSpecCardinalitySource,classifyTableSpecNullability,verifyTableSpecNullabilityClassification,recoverTableSpecNullabilitySource,classifyTableSpecKeys,verifyTableSpecKeyClassification,recoverTableSpecKeySource,projectKeysToTableSpec,verifyKeysTableSpecProjection,recoverKeysTableSpecIdeal,classifyTableSpecFacets,verifyTableSpecFacetClassification,recoverTableSpecFacetSource,projectFacetsToTableSpec,recoverFacetsFromTableSpec,classifyTableSpecRelationships,verifyTableSpecRelationshipClassification,recoverTableSpecRelationshipSource}=tableSpec;
const sqlServer=createSqlServerRustDefault(nativeFamilyDispatcher,isNativeUmfCoreError,()=>new Registry());
const {projectBindingIndexesToSqlServer}=createBindingSqlServerIndexesRustDefault(nativeFamilyDispatcher,sqlServer);
const shacl=createShaclRustDefault(nativeFamilyDispatcher,isNativeUmfCoreError,()=>new Registry());
const {shaclRegistry,inspectShaclDocument,importShaclTurtle,exportShaclTurtle,getShaclQuads,proposeShaclQuadEdit,getShaclPropertyPath,evaluateShaclPropertyPath,getShaclTargetNodes,getShaclShapeMetadata,proposeShaclEngineValidation}=shacl;
const owl=createOwlRustDefault(nativeFamilyDispatcher,isNativeUmfCoreError,()=>new Registry());
const {owlRegistry,inspectOwlDocument,importOwlTurtle,exportOwlTurtle,getOwlQuads,proposeOwlQuadEdit,getOwlOntologyHeaders,getOwlExpressionView,getOwlListAxioms,getOwlSpecialAxioms,getOwlAxiomAnnotations,getOwlDeclarations}=owl;
const {sqlserverRegistry,importSqlServerCatalog,inspectSqlServer,exportSqlServerCatalog,getSqlServerColumnMetadata,getSqlServerConstraintMetadata,getSqlServerIndexMetadata,proposeSqlServerCatalogEdit,inspectSqlServerFacetType,inspectSqlServerFacetPredicate,inspectSqlServerFacetConstraints,classifySqlServerField,verifySqlServerFieldClassification,recoverSqlServerFieldCapture,classifySqlServerRecord,verifySqlServerRecordClassification,recoverSqlServerRecordCapture,classifySqlServerCardinality,verifySqlServerCardinalityClassification,recoverSqlServerCardinalitySource,classifySqlServerNullability,verifySqlServerNullabilityClassification,recoverSqlServerNullabilitySource,classifySqlServerKeys,verifySqlServerKeyClassification,recoverSqlServerKeySource,classifySqlServerRelationships,verifySqlServerRelationshipClassification,recoverSqlServerRelationshipSource,classifySqlServerFacets,verifySqlServerFacetClassification,recoverSqlServerFacetSource}=sqlServer;
const accessTemporal=createAccessTemporalEngine(wasmModule);
export const ACCESS_TEMPORAL_PROFILE=ACCESS_TEMPORAL_PROFILE_RUST;
export function parseAccessTemporal(kind:AccessTemporalKind,token:string):AccessTemporal {
  return accessTemporal.parseAccessTemporal(kind,token);
}
const loaderSchemaWasmModule=wasmModule as typeof wasmModule & {
  domainPackLoaderSchemaGraphJson:()=>string;
  loaderInventorySchemaGraphJson:()=>string;
  inspectDomainPackLoaderWire:(inputJson:string)=>string;
  inspectDomainPackProfileWire:(inputJson:string)=>string;
};
const secWasmModule=wasmModule as typeof wasmModule & {projectSecSubmissionsUtf16Wire(input:Uint16Array,sourceId:Uint16Array):string;projectSecCompanyFactsUtf16Wire(input:Uint16Array,sourceId:Uint16Array):string};
const secProjection=createSecProjectionRustOperations({submissions:(input,sourceId)=>secWasmModule.projectSecSubmissionsUtf16Wire(input,sourceId),companyFacts:(input,sourceId)=>secWasmModule.projectSecCompanyFactsUtf16Wire(input,sourceId)});
const {projectSecSubmissions,projectSecCompanyFacts}=secProjection;
const generateDomainPackSchemaOperation=createGeneratedSchemaGraphOperation(wasmModule.domainPackSchemaGraphJson) as typeof DomainPackSchemaReference;
const generateDatasetSourceSchemaOperation=createGeneratedSchemaGraphOperation(wasmModule.datasetSourceSchemaGraphJson) as typeof DatasetSourceSchemaReference;
const generateArtifactCollectionSchemaOperation=createGeneratedSchemaGraphOperation(wasmModule.artifactCollectionSchemaGraphJson) as typeof ArtifactCollectionSchemaReference;
const generateDomainPackLoaderSchemaOperation=createGeneratedSchemaGraphOperation(loaderSchemaWasmModule.domainPackLoaderSchemaGraphJson) as typeof DomainPackLoaderSchemaReference;
const generateLoaderInventorySchemaOperation=createGeneratedSchemaGraphOperation(loaderSchemaWasmModule.loaderInventorySchemaGraphJson) as typeof LoaderInventorySchemaReference;
const inspectDomainPackLoaderOperation=createDomainPackLoaderInspectionOperation(loaderSchemaWasmModule.inspectDomainPackLoaderWire);
const domainPackProfileOperations=createDomainPackProfileInspectionOperation(loaderSchemaWasmModule.inspectDomainPackProfileWire);
const {inspectDomainPack,requireDomainPackProfile}=domainPackProfileOperations;
function generateDomainPackSchema(){return generateDomainPackSchemaOperation();}
function generateDatasetSourceSchema(){return generateDatasetSourceSchemaOperation();}
function generateArtifactCollectionSchema(){return generateArtifactCollectionSchemaOperation();}
function generateDomainPackLoaderSchema(){return generateDomainPackLoaderSchemaOperation();}
function generateLoaderInventorySchema(){return generateLoaderInventorySchemaOperation();}
Object.defineProperty(generateDomainPackSchema,'name',{value:'generateDomainPackSchema'});
Object.defineProperty(generateDatasetSourceSchema,'name',{value:'generateDatasetSourceSchema'});
Object.defineProperty(generateArtifactCollectionSchema,'name',{value:'generateArtifactCollectionSchema'});
Object.defineProperty(generateDomainPackLoaderSchema,'name',{value:'generateDomainPackLoaderSchema'});
Object.defineProperty(generateLoaderInventorySchema,'name',{value:'generateLoaderInventorySchema'});
const model=await initializeCoreModelRootKindNullabilityWasm(CORE_MODEL_RESOURCES,async()=>wasmModule,globalThis);
const {prepareCoreInspection}=createPreparedCoreInspectionRustDefault(model,isNativeUmfCoreError);
const {editExtension}=createEditExtensionRustDefault(model,isNativeUmfCoreError);
const dashboardPublic=createDashboardRustDefault(nativeFamilyDispatcher,isNativeUmfCoreError,()=>new Registry(),editExtension);
const {dashboardRegistry,registerDashboard,inspectDashboard,readDashboardDocument,writeDashboardDocument,getDashboardDefinition,editDashboardDefinition}=dashboardPublic;
const {declareCoreBit128Field}=bindCoreBit128FieldRust(await initializeCoreBit128FieldWasm(CORE_MODEL_RESOURCES,async()=>wasmModule),isCoreBit128FieldBindingError);
const {Registry,validateDocument,readDocument,writeDocument,createUmfRegistry:baseCreateUmfRegistry}=createRegistryRustDefault(model,isNativeUmfCoreError,registerActions);
const ownedExtensionRegistries=createExtensionRegistriesRustDefault(
 ()=>new Registry(),securityPolicySource,model,
 createCodegenEngine(wasmModule,CODEGEN_RESOURCES),
 isNativeUmfCoreError,
);
const {securityRegistry,semanticTypesRegistry,tableLifecycleRegistry}=ownedExtensionRegistries;
const bindingPublic=createBindingRustDefault(nativeFamilyDispatcher,isNativeUmfCoreError,()=>new Registry());
const {validateCoreDatasetValues,verifyCoreDatasetValues,inspectCoreEvolution,verifyCoreEvolution,encodeCoreKeyTuple,verifyCoreKeyTuple,selectCoreElements,selectCoreRelationships}=createCoreModelPublicRustDefault(model,createCoreKeyTupleEngine(wasmModule,CORE_MODEL_RESOURCES),error=>isNativeUmfCoreError(error)||error instanceof BindingUmfError,()=>new Registry());
const {importJsonSchema,inspectJsonSchema,exportJsonSchema,exportJsonSchemaResources,exportJsonSchemaBundle,getJsonSchemaNode,walkJsonSchema,editJsonSchemaNode,parseNativeJson,parseNativeYaml,jsonSchemaRegistry}=createJsonSchemaRustDefault(createPreparedJsonSchemaEngine(wasmModule),error=>isNativeUmfCoreError(error)||error instanceof BindingUmfError,()=>new Registry());
const dddRegistry=()=>dddRust.dddRegistry(()=>new Registry());
const inspectDdd=dddRust.inspectDdd;
const registerDdd=<T extends InstanceType<typeof Registry>>(registry:T):T=>dddRust.registerDdd(registry);
const createUmfRegistry=()=>registerDashboard(registerDdd(baseCreateUmfRegistry()));
const readDddDocument=(source:string,format:'json'|'yaml'='yaml')=>dddRust.readDddDocument(source,format,readDocument);
const writeDddDocument=(document:import('./model/types').Document,format:'json'|'yaml'='yaml')=>dddRust.writeDddDocument(document,format,writeDocument);
const getDddDefinition=dddRust.getDddDefinition;
const editDddDefinition=dddRust.editDddDefinition;
type Registry=InstanceType<typeof Registry>;
const kindNullability=bindCoreKindNullabilityRust(model,isHostJsonResponseError);
const {inspectCoreElementKind,declareCoreElementKind,verifyCoreKindDeclaration,inspectCoreNullability,declareCoreNullability,verifyCoreNullabilityDeclaration}=kindNullability;
const scalarTypesForVersion=bindScalarTypesForVersionRust(model as typeof model & {scalarTypesForVersion(version:string):readonly string[]},CURRENT_CORE_VERSION,SCALAR_TYPES);
const coreKeyTuple=bindCoreKeyTupleDefault(model,isNativeUmfCoreError);
const {readCoreKeyTupleBytes,prepareCoreKeyTuples}=coreKeyTuple;
const protobufDescriptorEngine=await initializeProtobufDescriptorDocumentWasm(async()=>wasmModule,globalThis,{ErrorType:UmfError} as never) as unknown as ProtobufDescriptorDocumentRustEngine;
const protobufDescriptorDocument=createProtobufDescriptorDocumentRustDefault(options=>{
  if(options.ErrorType!==UmfError)throw new TypeError('Public Protobuf error constructor mismatch');
  return protobufDescriptorEngine;
});
const protobufRegistries=createProtobufRegistryRustDefault(protobufDescriptorDocument,()=>new Registry());
const {protobufRegistry}=protobufRegistries;
const {readDescriptorSet,writeDescriptorSet,importProtobufDescriptorSet,exportProtobufDescriptorSet,getProtobufDescriptorSet,proposeProtobufDescriptorEdit,inspectProtobuf,exportProtobufBundle}=protobufDescriptorDocument;
const protobufSources=createProtobufSourceRustDefault(
  createProtobufSourceImportEngine(wasmModule),
  createProtobufSourceExportEngine(wasmModule),
  isNativeUmfCoreError,
);
const {projectJsonSchemaToProtobuf}=createJsonSchemaProtobufRustDefault(nativeFamilyDispatcher,protobufSources.importProtobufSources,inspectProtobuf,isNativeUmfCoreError);
const readDescriptorSetRustCandidate=createReadDescriptorSetRustCandidate(protobufDescriptorEngine,isNativeUmfCoreError);
const {inspectCoreSemanticTypes,getCoreSemanticTypes,declareCoreSemanticTypes,verifyCoreSemanticTypeDeclaration}=bindCoreSemanticTypesRust(model,isNativeUmfCoreError);
const {getSemanticTypes,setSemanticTypes}=bindSemanticTypeAccessorsRust(model,isHostJsonResponseError);
const recordValuesHost=await initializeCoreRecordValuesHostInputWasm(CORE_MODEL_RESOURCES,async()=>wasmModule);
const validateCoreRecordValues=bindCoreRecordValuesRust(recordValuesHost);
const {SemanticTypeRegistry,validateSemanticTypeValue,validateCoreSemanticTypeValue}=bindSemanticTypesRust(()=>createDefaultSemanticTypeRegistry(wasmModule),CORE_MODEL_RESOURCES);
type SemanticTypeRegistry=InstanceType<typeof SemanticTypeRegistry>;
const securityEngine=createSecurityLogicEngine(wasmModule);
const securityNot=createSecurityNotRustAdapter(securityEngine);
const {securityAnd,securityOr}=createSecurityLogicRustAdapter(securityEngine);
const nativeJsonNumber=createJsonNumberEngine(wasmModule);
const {copyJson,readJsonValue,writeJsonValue,readProtectionSource,writeProtectionSource,inspectExtensionKinds,assertExactJsonNumber,composeSecurityRules,securityRefIdentity}=createNativeUtilityDefaults(Object.assign({},model,securityEngine,{copyJson:model.copyJson,assertExactJsonNumber:nativeJsonNumber.assertExactJsonNumber}),error=>isNativeUmfCoreError(error)||error instanceof BindingUmfError,()=>new Registry());
const javascriptNumeric=bindJavascriptNumericRust(()=>createJavascriptNumericEngine(wasmModule,CORE_MODEL_RESOURCES));
const {exactDecimal,integerFromBigInt,integerToBigInt,admitJavascriptNumber,numericToNumberLossless}=javascriptNumeric;
const recordType=bindCoreRecordTypeRust(createCoreRecordTypeEngine(wasmModule,CORE_MODEL_RESOURCES),isNativeUmfCoreError);
const {declareCoreRecordType,verifyCoreRecordTypeDeclaration}=recordType;
const temporal=await initializeTemporalWasm();
const {parseGregorianDate,truncateGregorianDate,parseRfc3339ExactInstant,sameRfc3339ExactInstant}=temporal;
const {validateCsvBooleanLexical,verifyCsvBooleanLexical}=bindCsvBooleanLexicalRust(model,isWireAdmissionError,isNativeUmfCoreError);
const {inspectCoreScalarType,inspectCoreRecordMembers,inspectCoreReferenceLinks}=bindCoreInspectorsRust(model,isWireAdmissionError,isNativeUmfCoreError);
const inspectRawTableBinding=createRawTableBindingInspector(inspectCoreRecordMembers);
const {inspectCoreSchemaProperties,declareCoreSchemaProperties,validateCoreFieldValue,resolveCoreDefault}=bindCoreSchemaPropertiesRust(model);
const cardinality=bindCoreCardinalityRust(createCoreCardinalityHostInputEngine(wasmModule,CORE_MODEL_RESOURCES),isHostJsonResponseError);
const {inspectCoreCardinality,declareCoreCardinality,verifyCoreCardinalityDeclaration}=cardinality;
const {validateCoreDatasetValuesCompact,verifyCoreDatasetValuesCompact}=bindCoreDatasetValuesCompactRust(model,isNativeUmfCoreError);
const {inspectCoreFacets,declareCoreFacets,verifyCoreFacetDeclaration,historicalCoreFacetPatch}=bindCoreFacetsRust(model);
const {inspectCoreKeys,lookupCoreKey,declareCoreRecordMembers,declareCoreKey,verifyCoreKeyOperation}=bindCoreKeysRust(model,isNativeUmfCoreError);
const relationshipOperations=bindCoreRelationshipsRust(model);
const {inspectCoreRelationships,lookupCoreRelationship,declareCoreRelationship,verifyCoreRelationshipOperation}=relationshipOperations;
const nullabilitySqlServer=createNullabilitySqlServerRustDefault(nativeFamilyDispatcher,isNativeUmfCoreError);
const keySqlServer=createKeySqlServerRustDefault(nativeFamilyDispatcher,isNativeUmfCoreError);
const {projectKeysToSqlServer,verifyKeysSqlServerProjection,recoverKeysSqlServerIdeal}=keySqlServer;
const {projectNullabilityToSqlServer,recoverNullabilityFromSqlServer}=nullabilitySqlServer;
const {projectRelationshipToParquet,verifyRelationshipParquetProjection,recoverRelationshipParquetIdeal,recoverRelationshipParquetNative}=coreIdealRust;
const relationshipExtras=createRelationshipExtrasRustDefault(nativeFamilyDispatcher,isNativeUmfCoreError);
const {importRelationshipExtraArchive,projectRelationshipToExtra,classifyRelationshipExtra,verifyRelationshipExtra,recoverRelationshipExtraIdeal,recoverRelationshipExtraNative}=relationshipExtras;
const {projectRelationshipsToPostgresql,verifyRelationshipPostgresqlProjection,recoverRelationshipPostgresqlIdeal,recoverRelationshipPostgresqlNative}=createRelationshipPostgresqlRustDefault(nativeFamilyDispatcher,postgresql,isNativeUmfCoreError);
const {parseBits128,parseUuid,bits128FromBytes,bits128ToBytes,uuidFromBits128,uuidToBits128,compareBits128,bits128ToWords,bits128FromWords,bits128ToInteger,bits128FromInteger,classifyBit128NativeType,inspectBit128Binding,encodeBit128CarrierValue,decodeBit128CarrierValue,encodeBit128Record,decodeBit128Record,projectBit128Model,recoverBit128ModelProjection,encodeBit128FileRecord,decodeBit128FileRecord,projectBit128CarrierSchema,recoverBit128CarrierProjection}=bindBit128Rust(await initializeBit128Wasm(),isBit128EngineError);
const arrowSchemaRust=bindArrowSchemaRust(createArrowSchemaEngine(wasmModule),isNativeUmfCoreError);
const {importArrowSchema,inspectArrow,exportArrowSchema,getArrowNode,proposeArrowNodeEdit,validateArrowExtensionPayload}=arrowSchemaRust;
const arrowRegistry=()=>new Registry().register(arrowPackage,validateArrowExtensionPayload);
const arrowIpcRegistry=()=>new Registry().register(arrowIpcPackage);
const arrowFlatbufferRegistry=()=>new Registry().register(arrowFlatbufferPackage);
const {captureArrowIpc,exportArrowIpcCapture,inspectArrowIpcCapture,inspectArrowIpcLayout,inspectArrowIpcConsistency,observeArrowIpcCapture,exportArrowSchemaIpc,renameArrowIpcField}=bindArrowIpcRust(createArrowIpcEngine(wasmModule),copyJson,isNativeUmfCoreError,error=>error instanceof BindingUmfError);
const dbt=bindDbtRust(createDbtEngine(wasmModule),isNativeUmfCoreError,isHostJsonResponseError,isDbtHostError);
const dbtRegistries=createDbtRegistriesRustDefault(dbt,()=>new Registry());
const {dbtManifestRegistry,dbtArtifactRegistry,dbtSemanticManifestRegistry}=dbtRegistries;
const {importDbtManifest,exportDbtManifest,inspectDbtManifest,getDbtManifestNode,proposeDbtManifestNodeEdit,importDbtArtifact,exportDbtArtifact,inspectDbtArtifact,getDbtArtifactNode,proposeDbtArtifactNodeEdit,importDbtSemanticManifest,exportDbtSemanticManifest,inspectDbtSemanticManifest,getDbtSemanticManifestNode,proposeDbtSemanticManifestNodeEdit,inspectDbtManifestGraph,selectDbtManifestDependencies}=dbt;
export {editExtension,prepareCoreInspection};
export * from './index-v4-default';
export {generatePackTools};
export type {PackToolsRequest,PackToolsResult,PackToolsSource,PackToolsTarget,PackToolsFile,PackToolsFileKind,PackToolsDiagnostic,PackToolsCoverage} from './domain-packs/pack-tools-types';
export {arrowRegistry,arrowIpcRegistry,arrowFlatbufferRegistry};
export {projectKeysToSqlServer,verifyKeysSqlServerProjection,recoverKeysSqlServerIdeal};
export const projectDddToPostgresql=dddPostgresqlRust.projectDddToPostgresql;
export const projectDddTablesToPostgresql=dddPostgresqlRust.projectDddTablesToPostgresql;
export const projectDddTablesAndIndexesToPostgresql=dddPostgresqlRust.projectDddTablesAndIndexesToPostgresql;
export const verifyDddPostgresqlProjection=dddPostgresqlRust.verifyDddPostgresqlProjection;
export const recoverDddPostgresqlIdeal=dddPostgresqlRust.recoverDddPostgresqlIdeal;
export const recoverDddPostgresqlNative=dddPostgresqlRust.recoverDddPostgresqlNative;
export type {NativeShaclEngineReport as ShaclEngineReport} from './adapters/shacl/rust-default';
export {dashboardRegistry,registerDashboard,inspectDashboard,readDashboardDocument,writeDashboardDocument,getDashboardDefinition,editDashboardDefinition};
export {Registry,validateDocument,validateDocument as validateRelationshipCandidate,validateDocument as validateSchemaPropertiesDocument,readDocument,writeDocument,createUmfRegistry,dddRegistry,inspectDdd,registerDdd,readDddDocument,writeDddDocument,getDddDefinition,editDddDefinition,declareCoreBit128Field};
export const inspectFieldClassification=coreIdealReports.inspectFieldClassification;
export const verifyFieldClassificationInspection=coreIdealReports.verifyFieldClassificationInspection;
export const inspectFieldProjection=coreIdealReports.inspectFieldProjection;
export const verifyFieldProjectionInspection=coreIdealReports.verifyFieldProjectionInspection;
export const inspectRecordProjection=coreIdealReports.inspectRecordProjection;
export const verifyRecordProjectionInspection=coreIdealReports.verifyRecordProjectionInspection;
export const inspectStructuredClassification=coreIdealReports.inspectStructuredClassification;
export const verifyStructuredClassificationInspection=coreIdealReports.verifyStructuredClassificationInspection;
export {getSemanticTypes,setSemanticTypes};
export {importArrowSchema,inspectArrow,exportArrowSchema,getArrowNode,proposeArrowNodeEdit};
export {captureArrowIpc,exportArrowIpcCapture,inspectArrowIpcCapture,inspectArrowIpcLayout,inspectArrowIpcConsistency,observeArrowIpcCapture,exportArrowSchemaIpc,renameArrowIpcField};
export {dbtManifestRegistry,dbtArtifactRegistry,dbtSemanticManifestRegistry,importDbtManifest,exportDbtManifest,inspectDbtManifest,getDbtManifestNode,proposeDbtManifestNodeEdit,importDbtArtifact,exportDbtArtifact,inspectDbtArtifact,getDbtArtifactNode,proposeDbtArtifactNodeEdit,importDbtSemanticManifest,exportDbtSemanticManifest,inspectDbtSemanticManifest,getDbtSemanticManifestNode,proposeDbtSemanticManifestNodeEdit,inspectDbtManifestGraph,selectDbtManifestDependencies};
export {scalarTypesForVersion};
export {readCoreKeyTupleBytes,prepareCoreKeyTuples};
export {inspectDomainPackLoaderOperation as inspectDomainPackLoader,inspectDomainPack,requireDomainPackProfile};
export {inspectCoreElementKind,declareCoreElementKind,verifyCoreKindDeclaration,inspectCoreNullability,declareCoreNullability,verifyCoreNullabilityDeclaration,generatePythonClient,generateDomainPackSchema,generateDatasetSourceSchema,exactDecimal,integerFromBigInt,integerToBigInt,admitJavascriptNumber,numericToNumberLossless,inspectCoreCardinality,declareCoreCardinality,verifyCoreCardinalityDeclaration,validateCoreDatasetValuesCompact,verifyCoreDatasetValuesCompact,inspectCoreFacets,declareCoreFacets,verifyCoreFacetDeclaration,historicalCoreFacetPatch,inspectCoreKeys,lookupCoreKey,declareCoreRecordMembers,declareCoreKey,verifyCoreKeyOperation,inspectCoreRelationships,lookupCoreRelationship,declareCoreRelationship,verifyCoreRelationshipOperation,inspectCoreScalarType,inspectCoreRecordMembers,inspectCoreReferenceLinks,inspectCoreSemanticTypes,getCoreSemanticTypes,declareCoreSemanticTypes,verifyCoreSemanticTypeDeclaration,inspectRawTableBinding,inspectCoreSchemaProperties,declareCoreSchemaProperties,validateCoreFieldValue,resolveCoreDefault,validateCoreRecordValues,SemanticTypeRegistry,validateSemanticTypeValue,validateCoreSemanticTypeValue,declareCoreRecordType,verifyCoreRecordTypeDeclaration,parseBits128,parseUuid,classifyBit128NativeType,inspectBit128Binding,encodeBit128CarrierValue,decodeBit128CarrierValue,encodeBit128Record,decodeBit128Record,projectBit128Model,recoverBit128ModelProjection,encodeBit128FileRecord,decodeBit128FileRecord,projectBit128CarrierSchema,recoverBit128CarrierProjection,bits128FromBytes,bits128ToBytes,uuidFromBits128,uuidToBits128,compareBits128,bits128ToWords,bits128FromWords,bits128ToInteger,bits128FromInteger,validateCsvBooleanLexical,verifyCsvBooleanLexical,parseGregorianDate,truncateGregorianDate,parseRfc3339ExactInstant,sameRfc3339ExactInstant,securityNot,securityAnd,securityOr};
export {generateArtifactCollectionSchema};
export {generateDomainPackLoaderSchema,generateLoaderInventorySchema};
export {projectSecSubmissions,projectSecCompanyFacts};
export {projectMedicalFhir,projectCdcMortality,projectDicomMetadata,lookupMedicalTerminology};
export {projectSecSubmissions as projectSecSubmissionsRustCandidate,projectSecCompanyFacts as projectSecCompanyFactsRustCandidate};
export {readDescriptorSetRustCandidate};
export {protobufRegistry,readDescriptorSet,writeDescriptorSet,importProtobufDescriptorSet,exportProtobufDescriptorSet,getProtobufDescriptorSet,proposeProtobufDescriptorEdit,inspectProtobuf,exportProtobufBundle};
export {graphqlRegistry,importGraphqlSchema,inspectGraphql,exportGraphqlSchema,getGraphqlAst,editGraphqlAst,exportGraphqlBundle,projectGraphqlInputToJsonSchema};
export {rdfRegistry,inspectRdfDocument,importRdfNQuads,getRdfQuads,exportRdfNQuads,proposeRdfQuadEdit,proposeRdfIriRename,importRdfTurtle,exportRdfTurtle,getRdfNamedGraphs,importRdfTriG,exportRdfTriG,proposeRdfDatasetMerge,generalizedRdfRegistry,inspectGeneralizedRdfDocument,importGeneralizedRdfDataset,exportGeneralizedRdfDataset,getGeneralizedRdfQuads,proposeGeneralizedRdfQuadEdit};
export {jsonldRegistry,importJsonLdDocument,inspectJsonLdDocument,exportJsonLdDocument,getJsonLdNode,proposeJsonLdNodeEdit,proposeJsonLdExpansion,proposeJsonLdFlatten,proposeJsonLdCompaction,proposeJsonLdFraming,proposeJsonLdToRdf,proposeRdfToJsonLd,proposeGeneralizedRdfToJsonLd};
export {ICEBERG_EXTENSION,icebergPackage,icebergRegistry,inspectIceberg,importIcebergSchema,exportIcebergSchema,getIcebergNode,proposeIcebergNodeEdit};
export {ICEBERG_TABLE_EXTENSION,icebergTablePackage,icebergTableRegistry,inspectIcebergTable,importIcebergTable,exportIcebergTable,getIcebergTableNode,proposeIcebergTableNodeEdit,inspectIcebergTableContext,inspectIcebergTableTransforms,inspectIcebergTransformType,proposeIcebergTableRename,proposeIcebergTablePromotion};
export {postgresqlRegistry,validatePostgresqlAst,inspectPostgresql,importPostgresqlSql,exportPostgresqlSql,getPostgresqlSource,getPostgresqlNode,proposePostgresqlNodeEdit};
export {postgresqlCatalogRegistry,inspectPostgresqlCatalog,importPostgresqlCatalogCapture,exportPostgresqlCatalogCapture,getPostgresqlColumnMetadata,getPostgresqlCatalogNode,findPostgresqlCatalogRelation,proposePostgresqlCatalogEdit,getPostgresqlCatalogReconstruction,queryPostgresqlCatalogDependencies};
export {inspectPostgresqlKeyCatalog,correlatePostgresqlKeyCatalog,inspectPostgresqlCardinalityCatalog,resolvePostgresqlCardinalityType,correlatePostgresqlCardinalityCatalog};
export {classifyPostgresqlComposite,verifyPostgresqlCompositeClassification,recoverPostgresqlCompositeCapture};
export {getPostgresqlDdlDeclarations,classifyPostgresqlDdlRecord,recoverPostgresqlDdlKinds};
export {classifyPostgresqlField,verifyPostgresqlFieldClassification,recoverPostgresqlFieldCapture,classifyPostgresqlRecord,verifyPostgresqlRecordClassification,recoverPostgresqlRecordCapture,classifyPostgresqlCardinality,verifyPostgresqlCardinalityClassification,recoverPostgresqlCardinalitySource,classifyPostgresqlNullability,verifyPostgresqlNullabilityClassification,recoverPostgresqlNullabilitySource,classifyPostgresqlKeys,verifyPostgresqlKeyClassification,recoverPostgresqlKeySource,classifyPostgresqlFacets,verifyPostgresqlFacetClassification,recoverPostgresqlFacetSource};
export {classifyPostgresqlRelationships,verifyPostgresqlRelationshipClassification,recoverPostgresqlRelationshipSource};
export {projectFieldToPostgresql,recoverFieldFromPostgresql,projectRecordToPostgresql,recoverRecordFromPostgresql};
export {projectCardinalityToPostgresql,recoverCardinalityFromPostgresql};
export {projectFacetsToPostgresql,recoverFacetsFromPostgresql};
export {projectKeysToPostgresql,verifyKeysPostgresqlProjection,recoverKeysPostgresqlIdeal};
export type {KeyPostgresqlProjection,KeyPostgresqlRequest} from './core-ideals/key-postgresql-projection';
export {default as keyPostgresqlProjectionSchema} from '../spec/core/key-postgresql-projection.schema.json';
export {projectNullabilityToPostgresql,recoverNullabilityFromPostgresql};
export type {NullabilityPostgresqlProjection,NullabilityPostgresqlRequest} from './core-ideals/nullability-postgresql-projection';
export {POSTGRESQL_NULLABILITY_EXTENSION,postgresqlNullabilityPackage,postgresqlNullabilityClassificationSchema,nullabilityPostgresqlProjectionSchema} from './core-ideals/nullability-postgresql-package';
export type {CardinalityPostgresqlProjection,CardinalityPostgresqlRequest} from './core-ideals/cardinality-postgresql-projection';
export {POSTGRESQL_CARDINALITY_EXTENSION,postgresqlCardinalityPackage,postgresqlCardinalityClassificationSchema,cardinalityPostgresqlProjectionSchema} from './core-ideals/cardinality-postgresql-package';
export type {PostgresqlBackend} from './adapters/postgresql/index';
export {avroRegistry,inspectAvro,importAvroSchema,getAvroFieldMetadata,exportAvroSchema,exportAvroBundle,getAvroNode,editAvroNode,proposeAvroNodeEdit};
export {projectAvroToJsonSchema};
export {recoverNullabilityFromParquet,projectNullabilityToParquet,recoverFacetsFromParquet,projectFacetsToParquet,recoverKeysParquetIdeal,verifyKeysParquetProjection,projectKeysToParquet,recoverCardinalityFromParquet,projectCardinalityToParquet,projectCardinalityToAvro,recoverCardinalityFromAvro,classifyAvroCardinality,verifyAvroCardinalityClassification,recoverAvroCardinalityBundle,classifyAvroRecordType,recoverAvroRecordTypeBundle,classifyParquetRecordType,recoverParquetRecordTypeBytes,classifyParquetRecord,recoverParquetRecordBytes,classifyParquetRelationships,verifyParquetRelationshipClassification,recoverParquetRelationshipSource,classifyParquetNullability,verifyParquetNullabilityClassification,recoverParquetNullabilityBytes,classifyParquetField,verifyParquetFieldClassification,recoverParquetFieldBytes,classifyParquetKeys,verifyParquetKeyClassification,recoverParquetKeySource,classifyParquetCardinality,verifyParquetCardinalityClassification,recoverParquetCardinalityBytes,classifyParquetFacets,verifyParquetFacetClassification,recoverParquetFacetSource,classifyAvroField,recoverAvroFieldBundle,classifyAvroRecord,recoverAvroRecordBundle,classifyAvroKeys,verifyAvroKeyClassification,recoverAvroKeySource,classifyAvroRelationships,verifyAvroRelationshipClassification,recoverAvroRelationshipSource,classifyAvroNullability,verifyAvroNullabilityClassification,recoverAvroNullabilityBundle,classifyAvroFacets,verifyAvroFacetClassification,recoverAvroFacetSource};
export {projectNullabilityToAvro,recoverNullabilityFromAvro};
export {projectFacetsToAvro,recoverFacetsFromAvro,projectFacetsToSqlServer,recoverFacetsFromSqlServer};
export {projectKeysToAvro,verifyKeysAvroProjection,recoverKeysAvroIdeal};
export {projectFieldToAvro,recoverFieldFromAvro,projectRecordToAvro,recoverRecordFromAvro};
export {projectFieldToParquet,recoverFieldFromParquet,projectRecordToParquet,recoverRecordFromParquet};
export {importArrowFlatbufferModel,inspectArrowFlatbufferModel,exportArrowFlatbufferModel,proposeArrowFlatbufferEdit,decodeArrowFlatbuffer,encodeArrowFlatbuffer};
export {projectArrowToSpark,projectSparkToArrow};
export {compileTableInventoryMigration,discoverTableInventoryMigrationChanges,verifyTableInventoryMigration,serializeTableInventoryMigration,irreversiblePurgeDisclosure};
export {copyJson,readJsonValue,writeJsonValue,readProtectionSource,writeProtectionSource,inspectExtensionKinds,assertExactJsonNumber,composeSecurityRules,securityRefIdentity};
export {validateCoreDatasetValues,verifyCoreDatasetValues,inspectCoreEvolution,verifyCoreEvolution,encodeCoreKeyTuple,verifyCoreKeyTuple,selectCoreElements,selectCoreRelationships};
export const {bindingRegistry,inspectBinding,getBinding,readBindingDocument,writeBindingDocument,projectBindingIndexes,migrateBindingRelationships,rollbackBindingRelationships,validateBit128Dataset}=bindingPublic;
export {importJsonSchema,inspectJsonSchema,exportJsonSchema,exportJsonSchemaResources,exportJsonSchemaBundle,getJsonSchemaNode,walkJsonSchema,editJsonSchemaNode,parseNativeJson,parseNativeYaml,jsonSchemaRegistry};
export {projectAvroToTableSpec,projectTableSpecToAvro};
export {projectPostgresqlToAvro};
export {projectPostgresqlRowToJsonSchema};
export {projectJsonSchemaToProtobuf};
export {projectToTableSpecViaAvro};
export {projectParquetToAvro};
export {projectSqlServerToAvro};
export {projectSqlServerToDdl};
export {projectBindingToIceberg};
export {projectBindingIndexesAgainstSqlServerPlan};
export {projectBindingIndexesToSqlServer};
export {projectBindingIndexesToPostgresql};
export {projectBindingToParquet};
export {projectBindingToDelta};
export {projectBindingTablesToSqlServer,projectBindingTablesAndIndexesFromPlanToSqlServer,projectBindingTablesAndIndexesToSqlServer};
export {projectBindingToSqlServer,verifyBindingSqlServerProjection,recoverBindingSqlServerSources,recoverBindingSqlServerNative};
export {projectDddToJsonSchema,dddFieldBinding,projectDddEntitiesToGraphql,projectDddToGraphql,verifyDddGraphqlProjection,recoverDddFromGraphql,recoverDddGraphqlNative,validateSqlServerRelationshipLayout,validatePostgresqlRelationshipLayout};
export {PARQUET_EXTENSION,PARQUET_MAX_BYTES,parquetPackage,parquetRegistry,captureParquet,importParquetSchema,encodeParquetWire,exportParquetCapture,inspectParquetFraming,decodeParquetFooter,inspectParquetMetadata,getParquetArrowSchema,renameParquetFieldWithArrowSchema,inspectParquetSchema,inspectParquetPages,decodeParquetPageBodies,decodeParquetLevels,decodeParquetPhysical,decodeParquetValues,assembleParquetRows,repairParquetDictionaryOffsets,inspectParquetLogicalTypes,inspectParquetContainers,getParquetFieldMetadata,appendParquetKeyValueMetadata,renameParquetField};
export {openapiRegistry,importOpenapiDocument,inspectOpenapi,exportOpenapiDocument,getOpenapiNode,lookupOpenapiResource,extractOpenapiSchema,indexOpenapiSchemas,resolveOpenapiSchemaReference,resolveOpenapiDynamicReference,resolveOpenapiObjectReference,exportOpenapiBundle,proposeOpenapiEdit};
export {projectOpenapiToJsonSchema};
export {projectTypeSpecToJsonSchema,projectSmithyToJsonSchema};
export {createSmithyJavaScriptBackend,createSmithyJavaScriptSelectionBackend,createSmithyJavaScriptJsonSchemaBackend,createSmithyWorkerBackend};
export {SMITHY_EXTENSION,smithyPackage,smithyRegistry,inspectSmithy,importSmithyJson,importSmithySources,exportSmithyJson,exportSmithySources,exportSmithyBundle,getSmithyNode,proposeSmithyNodeEdit,proposeSmithySourceEdit,assembleSmithyDocument,selectSmithyShapes};
export {TYPESPEC_EXTENSION,typespecPackage,typespecRegistry,inspectTypeSpec,importTypeSpecSources,exportTypeSpecSources,compileTypeSpecDocument,getTypeSpecSyntax,getTypeSpecSemanticGraph,emitTypeSpecJsonSchema,proposeTypeSpecSourceEdit};
export type {TypeSpecPayload} from './adapters/typespec/package';
export type {TypeSpecCompilerReport,TypeSpecGraphReport,TypeSpecJsonSchemaEmission} from './adapters/typespec/report-types';
export type {SmithySourcePayload} from './adapters/smithy/source-profile';
export type {SmithyAssemblyBackend,SmithyAssemblyEvent,SmithyAssemblyResult} from './adapters/smithy/assembly';
export type {SmithySelectionBackend,SmithySelectionResult} from './adapters/smithy/selection';
export type {SmithyJsonSchemaBackend,SmithyJsonSchemaPolicy,SmithyJsonSchemaProjection} from './projections/smithy-json-schema-types';
export type {TypeSpecJsonSchemaPolicy} from './projections/typespec-json-schema-types';
export {linkmlRegistry,importLinkmlDocument,inspectLinkmlDocument,exportLinkmlDocument,getLinkmlDocumentNode,proposeLinkmlDocumentNodeEdit,inspectLinkmlImportContext,proposeLinkmlImportMerge,inspectLinkmlClassSlots,inspectLinkmlSlotValues,odcsRegistry,importOdcsDocument,inspectOdcsDocument,exportOdcsDocument,getOdcsDocumentNode,proposeOdcsDocumentNodeEdit,resolveOdcsReference,inspectOdcsRelationships,proposeOdcsElementRename};
export {importTableSpec,inspectTableSpec,exportTableSpec,getTableSpecTable,getTableSpecColumn,editTableSpecTable,editTableSpecColumn,importTableSpecBundle,exportTableSpecBundle,classifyTableSpecField,verifyTableSpecFieldClassification,projectFieldToTableSpec,recoverFieldFromTableSpec,classifyTableSpecRecord,verifyTableSpecRecordClassification,projectRecordToTableSpec,recoverRecordFromTableSpec,projectCardinalityToTableSpec,recoverCardinalityFromTableSpec,projectNullabilityToTableSpec,recoverNullabilityFromTableSpec,classifyTableSpecCardinality,verifyTableSpecCardinalityClassification,recoverTableSpecCardinalitySource,classifyTableSpecNullability,verifyTableSpecNullabilityClassification,recoverTableSpecNullabilitySource,classifyTableSpecKeys,verifyTableSpecKeyClassification,recoverTableSpecKeySource,projectKeysToTableSpec,verifyKeysTableSpecProjection,recoverKeysTableSpecIdeal,classifyTableSpecFacets,verifyTableSpecFacetClassification,recoverTableSpecFacetSource,projectFacetsToTableSpec,recoverFacetsFromTableSpec,classifyTableSpecRelationships,verifyTableSpecRelationshipClassification,recoverTableSpecRelationshipSource};
export {default as fieldTableSpecProjectionSchema} from '../spec/core/field-tablespec-projection.schema.json';
export type {FieldTableSpecProjection,FieldTableSpecRequest} from './core-ideals/field-tablespec-projection';
export {default as recordTableSpecProjectionSchema} from '../spec/core/record-tablespec-projection.schema.json';
export type {RecordTableSpecProjection,RecordTableSpecRequest} from './core-ideals/record-tablespec-projection';
export {default as tableSpecFieldClassificationSchema} from '../spec/core/tablespec-field-classification.schema.json';
export type {TableSpecFieldClassification,TableSpecFieldRequest} from './core-ideals/tablespec-field';
export {default as tableSpecRecordClassificationSchema} from '../spec/core/tablespec-record-classification.schema.json';
export type {TableSpecRecordClassification,TableSpecRecordRequest} from './core-ideals/tablespec-record-package';
export {sqlserverRegistry,importSqlServerCatalog,inspectSqlServer,exportSqlServerCatalog,getSqlServerColumnMetadata,getSqlServerConstraintMetadata,getSqlServerIndexMetadata,proposeSqlServerCatalogEdit,inspectSqlServerFacetType,inspectSqlServerFacetPredicate,inspectSqlServerFacetConstraints,classifySqlServerField,verifySqlServerFieldClassification,recoverSqlServerFieldCapture,classifySqlServerRecord,verifySqlServerRecordClassification,recoverSqlServerRecordCapture,classifySqlServerCardinality,verifySqlServerCardinalityClassification,recoverSqlServerCardinalitySource,classifySqlServerNullability,verifySqlServerNullabilityClassification,recoverSqlServerNullabilitySource,classifySqlServerKeys,verifySqlServerKeyClassification,recoverSqlServerKeySource,classifySqlServerRelationships,verifySqlServerRelationshipClassification,recoverSqlServerRelationshipSource,classifySqlServerFacets,verifySqlServerFacetClassification,recoverSqlServerFacetSource};
export {shaclRegistry,inspectShaclDocument,importShaclTurtle,exportShaclTurtle,getShaclQuads,proposeShaclQuadEdit,getShaclPropertyPath,evaluateShaclPropertyPath,getShaclTargetNodes,getShaclShapeMetadata,proposeShaclEngineValidation};
export {securityPackage} from './extensions/security/policy-package';
export {semanticTypesPackage} from './extensions/semantic-types/package';
export {tableLifecyclePackage} from './extensions/tables/package';
export {securityRegistry,semanticTypesRegistry,tableLifecycleRegistry};
export {owlRegistry,inspectOwlDocument,importOwlTurtle,exportOwlTurtle,getOwlQuads,proposeOwlQuadEdit,getOwlOntologyHeaders,getOwlExpressionView,getOwlListAxioms,getOwlSpecialAxioms,getOwlAxiomAnnotations,getOwlDeclarations};
export {projectRelationshipToAvro,verifyRelationshipAvroProjection,recoverRelationshipAvroIdeal,recoverRelationshipAvroNative,projectRelationshipToTableSpec,verifyRelationshipTableSpecProjection,recoverRelationshipTableSpecIdeal,recoverRelationshipTableSpecNativeSources,projectRelationshipToSqlServer,verifyRelationshipSqlServerProjection,recoverRelationshipSqlServerIdeal,recoverRelationshipSqlServerBinding,recoverRelationshipSqlServerNative,projectRelationshipToParquet,verifyRelationshipParquetProjection,recoverRelationshipParquetIdeal,recoverRelationshipParquetNative,importRelationshipExtraArchive,projectRelationshipToExtra,classifyRelationshipExtra,verifyRelationshipExtra,recoverRelationshipExtraIdeal,recoverRelationshipExtraNative,projectRelationshipsToPostgresql,verifyRelationshipPostgresqlProjection,recoverRelationshipPostgresqlIdeal,recoverRelationshipPostgresqlNative};
export {projectCardinalityToSqlServer,recoverCardinalityFromSqlServer,projectFieldToSqlServer,recoverFieldFromSqlServer,projectRecordToSqlServer,recoverRecordFromSqlServer};
export type {FieldSqlServerProjection,FieldSqlServerRequest} from './core-ideals/field-sqlserver-projection';
export type {RecordSqlServerProjection,RecordSqlServerRequest} from './core-ideals/record-sqlserver-projection';
export type {CardinalitySqlServerProjection,CardinalitySqlServerRequest} from './core-ideals/cardinality-sqlserver-projection';

export const {importProtobufSources,exportProtobufSources}=protobufSources;
export {projectNullabilityToSqlServer,recoverNullabilityFromSqlServer};

export { DELTA_EXTENSION };

export { DELTA_TABLE_EXTENSION };

export { DELTA_LOG_EXTENSION };

export { deltaPackage };

export { deltaTablePackage };

export { deltaLogPackage };

export {deltaRegistry,deltaTableRegistry,deltaLogRegistry,inspectDelta,importDeltaSchema,exportDeltaSchema,getDeltaNode,proposeDeltaNodeEdit,inspectDeltaTable,importDeltaTable,exportDeltaTable,getDeltaTableNode,proposeDeltaTableNodeEdit,renameDeltaMappedField,getDeltaTableSchema,captureDeltaLog,exportDeltaLog,inspectDeltaLog,inspectDeltaActions,reconcileDeltaCommits,reconcileDeltaCheckpoint,reconcileDeltaCheckpointSidecars,defineDeltaTable,generateDeltaDDL,generateDeltaDDLBundle,realizeSparkDelta4DDL,projectDeltaParquetActions,reconcileDeltaParquetCheckpoint,reconcileDeltaMultipartCheckpoint};

export {evaluateActionRule,compileTableDeployment,verifyTableDeployment,inspectTableLifecycle,normalizeRowScope,discoverTableMigrationChanges,reviewedValueDigest,compileTableMigration,verifyTableMigration};
export {SPARK_EXTENSION,sparkPackage,sparkRegistry,inspectSpark,importSparkSchema,exportSparkSchema,getSparkNode,proposeSparkNodeEdit,renameSparkField};

export {inspectProtectionFunction,evaluateProtectionValue,inspectProtectionQueryProperties,inspectProtectionCatalog,requireProtectionInterpretation,resolveSecurityProtectionSources,resolveSecurityProtectionDomains,validateProtectionParameters};
export {inspectSecurityPolicyV2Source,upgradeSecurityPolicySource,downgradeSecurityPolicySource,readSecuritySource,writeSecuritySource};
export {evaluateSecurityAccess,evaluateSecurityCollection,evaluateSecurityWrite,evaluateSecurityPolicyV2LegacyAccess};
export {SecurityReadRegistration};
export {inspectSecurityPolicy,requireSecurityInterpretation,securityPolicyDependencies,securityIdentityTransportDependencies};
export {validateSecurityDisclosure,encodeSecurityDisclosure,decodeSecurityDisclosure};
export {inspectSecurityDisclosureV2,encodeSecurityDisclosureV2,decodeSecurityDisclosureV2};
export {inspectSecurityActionPurposes,inspectProtectionObligations};
export {SecurityAuthorityGuard};

export {prepareActionPlanModel,inspectActionPlan,assessActionPlan,constructActionManifest,inspectActionManifest,assessActionManifest};
export {inspectActions,declareAction,editAction,assessAction,registerActions};
export {compileActionRule,compileActionSelector,admitActionInputs,selectActionIdentity,prepareActionIdentities,actionFieldValueKey,validateBulkOutcome};
export {inspectSagas,declareSaga,editSaga,assessSaga};

export {AVRO_FACETS_EXTENSION,avroFacetsPackage} from './core-ideals/avro-facets-package';
export type {RelationshipAvroProjection,RelationshipAvroRequest} from './core-ideals/relationship-avro-projection-factory';

export type {DeltaCommit,DeltaReconciliation} from './adapters/delta/reconcile';

export type {FacetsParquetProjection,FacetsParquetRequest} from './core-ideals/facets-parquet-projection';

export type {KeyParquetProjection,KeyParquetRequest} from './core-ideals/key-parquet-projection';
