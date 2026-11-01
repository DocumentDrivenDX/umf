// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,Diagnostic,Json} from './model/types';
import {assertPythonClientRustPlatformV4,initializePythonClientRustDefaultV4} from './access/rust-default-v4';
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
import {bindSemanticTypeAccessorsRust} from './model/rust-semantic-type-accessors-default';
import {bindCoreSemanticTypesRust} from './access/rust-core-semantic-types-default';
import {bindScalarTypesForVersionRust} from './access/rust-scalar-types-for-version-default';
import {createSecurityNotRustAdapter} from './extensions/security/rust-not-adapter';
import {createSecurityLogicRustAdapter} from './extensions/security/rust-logic-adapter';
import {createProtectionRustDefault} from './extensions/security/protection/rust-default';
import {createProtectionSourcesRustDefault} from './extensions/security/protection/rust-sources-default';
import {createSecurityPolicySourceRustDefault} from './extensions/security/policy-source-rust-default';
import {createSecurityPolicyRustDefault} from './extensions/security/policy-rust-default';
import {SecurityReadRegistration as SecurityReadRegistrationBase} from './extensions/security/registration-rust-default';
import {createRawTableBindingInspector} from './extensions/binding/raw-profiles-inspector';
import {createTableSpecRelationshipProjection} from './core-ideals/relationship-tablespec-projection-factory';
import {createSqlServerRelationshipProjection} from './core-ideals/relationship-sqlserver-projection-factory';
import {createRelationshipParquetProjection} from './core-ideals/relationship-parquet-projection-factory';
import {createRelationshipExtras} from './core-ideals/relationship-extras-factory';
import {createRelationshipPostgresql} from './core-ideals/relationship-postgresql-factory';
import {createGeneratedSchemaGraphOperation} from './domain-packs/generated-schema-graph';
import {createDomainPackLoaderInspectionOperation} from './domain-packs/loader-rust';
import {createDomainPackProfileInspectionOperation} from './domain-packs/profile-rust';
import {createSecProjectionRustOperations,utf16LittleEndianBytes} from './domain-packs/sec-projection-rust';
import {createReadDescriptorSetRustCandidate} from './adapters/protobuf/descriptor-rust-candidate';
import {createProtobufDescriptorDocumentRustDefault} from './adapters/protobuf/rust-default';
import type {ProtobufDescriptorDocumentRustEngine} from './adapters/protobuf/rust-default';
import {bindArrowSchemaRust} from './adapters/arrow/rust-default';
import {bindArrowIpcRust} from './adapters/arrow/rust-ipc-default';
import {bindDbtRust} from './adapters/dbt/rust-default';
import {createRegistryRustDefault} from './registry/rust-default';
import {createCoreModelPublicRustDefault} from './model/rust-public-default';
import {createNativeUtilityDefaults} from './model/native-utility-default';
import {createTableInventoryRustDefault} from './table-migration/inventory-rust-default';
import {createJsonSchemaRustDefault} from './adapters/json-schema/rust-default';
import {createSecurityAuthorityGuardRustDefault} from './extensions/security/authority-guard-rust-default';
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
import {createBindingParquetRustDefault} from './projections/binding-parquet-rust-default';
import {createBindingDeltaRustDefault} from './projections/binding-delta-rust-default';
import {createBindingSqlServerTablesRustDefault} from './projections/binding-sqlserver/tables-rust-default';
import {createBindingSqlServerPhysicalRustDefault} from './projections/binding-sqlserver/physical-rust-default';
import {createDddJsonSchemaRustDefault} from './projections/ddd-json-schema-rust-default';
import {createDddPostgresqlRustDefault} from './projections/ddd-postgresql-rust-default';
import {createPostgresqlRustDefault} from './adapters/postgresql/rust-default';
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
import type {AccessTemporal,AccessTemporalKind} from '../bindings/core/node/index.js';
import {CURRENT_CORE_VERSION,SCALAR_TYPES} from './model/types';

// Module import resolves only after the native engine is ready. The function
// exported below remains synchronous and never falls back to TypeScript.
assertPythonClientRustPlatformV4(process.platform,process.arch);
const [{copyJson:nativeCopyJson,createJsonNumberEngine,createCoreModelRootKindNullabilityEngine,createCoreKeyTupleEngine,createCoreBit128FieldEngine,createCoreCardinalityHostInputEngine,createCoreRecordValuesHostInputEngine,createDefaultSemanticTypeRegistry,createCoreRecordTypeEngine,createBit128Engine,isCoreBit128FieldBindingError,createTemporalEngine,createAccessTemporalEngine,ACCESS_TEMPORAL_PROFILE:ACCESS_TEMPORAL_PROFILE_RUST,createSecurityLogicEngine,createSecurityFunctionsEngine,createSecurityQueryPropertiesEngine,createSecurityProtectionSourceEngine,createSecurityPolicySourceEngine,createSecurityReadRegistrationEngine,createSecurityAuthorityGuardEngine,createSecurityProtectionParametersEngine,createSecurityProtectionDomainsEngine,createJavascriptNumericEngine,isWireAdmissionError,isNativeUmfCoreError,isBit128EngineError,isHostJsonResponseError,isDbtHostError,createProtobufDescriptorDocumentEngine,createProtobufSourceImportEngine,createProtobufSourceExportEngine,createGraphqlEngine,createRdfEngine,createNativeFamilyDispatcher,createPreparedJsonSchemaEngine,createCodegenEngine,createIcebergSchemaEngine,createIcebergTableEngine,createDeltaSchemaTableEngine,createDeltaLogEngine,createPostgresqlParserSessionEngine,createPostgresqlSqlEngine,createTypeSpecSessionEngine,createSmithySessionEngine,createActionPlanSessionEngine,createParquetCaptureEngine,createArrowSchemaEngine,createArrowIpcEngine,createDbtEngine,UmfError:BindingUmfError,domainPackSchemaGraphJson,datasetSourceSchemaGraphJson,artifactCollectionSchemaGraphJson,domainPackLoaderSchemaGraphJson,loaderInventorySchemaGraphJson,inspectDomainPackLoaderWire,inspectDomainPackProfileWire,projectSecSubmissionsUtf16Wire,projectSecCompanyFactsUtf16Wire},{CORE_MODEL_RESOURCES},{createPythonClientRustCandidateV4},{createRowScopeRustDefault},{createTableMigrationDiscoveryRustDefault,createReviewedValueDigestRustDefault,createTableMigrationRustDefault}]=await Promise.all([
 import('../bindings/core/node/index.js'),
 import('./access/core-model-resources'),
 import('./node-v4'),
 import('./table-authoring/rust-default'),
 import('./table-migration/rust-default'),
]);
const secProjection=createSecProjectionRustOperations({
 submissions:(input,sourceId)=>projectSecSubmissionsUtf16Wire(Buffer.from(utf16LittleEndianBytes(input)),Buffer.from(utf16LittleEndianBytes(sourceId))),
 companyFacts:(input,sourceId)=>projectSecCompanyFactsUtf16Wire(Buffer.from(utf16LittleEndianBytes(input)),Buffer.from(utf16LittleEndianBytes(sourceId))),
});
const {projectSecSubmissions,projectSecCompanyFacts}=secProjection;
const protobufDescriptorDocument=createProtobufDescriptorDocumentRustDefault(options=>createProtobufDescriptorDocumentEngine(options as never) as unknown as ProtobufDescriptorDocumentRustEngine);
const graphql=createGraphqlRustDefault(createGraphqlEngine(),isNativeUmfCoreError,()=>new Registry());
const actionPlanSession=createActionPlanSessionEngine();
const actionPlan=createActionPlanRustDefault(actionPlanSession,isNativeUmfCoreError);
const actionManifest=createActionManifestRustDefault(actionPlanSession,actionPlan,isNativeUmfCoreError);
const {constructActionManifest,inspectActionManifest,assessActionManifest}=actionManifest;
const {prepareActionPlanModel,inspectActionPlan,assessActionPlan}=actionPlan;
const actionAuthoring=createActionAuthoringRustDefault(()=>createCodegenEngine(CODEGEN_RESOURCES),error=>isNativeUmfCoreError(error)||isWireAdmissionError(error));
const actionRegistry=createActionRegistryRustDefault(()=>createCodegenEngine(CODEGEN_RESOURCES),isNativeUmfCoreError);
const {inspectActions,declareAction,editAction,assessAction}=actionAuthoring;
const {registerActions}=actionRegistry;
const saga=createSagaRustDefault(createCodegenEngine(Object.assign({},CODEGEN_RESOURCES,{sagaPackage})),isNativeUmfCoreError);
const {inspectSagas,declareSaga,editSaga,assessSaga}=saga;
const rdf=createRdfRustDefault(createRdfEngine(),isNativeUmfCoreError,()=>new Registry());
const {rdfRegistry,inspectRdfDocument,importRdfNQuads,getRdfQuads,exportRdfNQuads,proposeRdfQuadEdit,proposeRdfIriRename,importRdfTurtle,exportRdfTurtle,getRdfNamedGraphs,importRdfTriG,exportRdfTriG,proposeRdfDatasetMerge,generalizedRdfRegistry,inspectGeneralizedRdfDocument,importGeneralizedRdfDataset,exportGeneralizedRdfDataset,getGeneralizedRdfQuads,proposeGeneralizedRdfQuadEdit}=rdf;
const {graphqlRegistry,importGraphqlSchema,inspectGraphql,exportGraphqlSchema,getGraphqlAst,editGraphqlAst,exportGraphqlBundle,projectGraphqlInputToJsonSchema}=graphql;
const nativeFamilyDispatcher=createNativeFamilyDispatcher();
const spark=createSparkRustDefault(nativeFamilyDispatcher,isNativeUmfCoreError,()=>new Registry());
const {sparkRegistry,inspectSpark,importSparkSchema,exportSparkSchema,getSparkNode,proposeSparkNodeEdit,renameSparkField}=spark;
const protection=createProtectionRustDefault(Object.assign({},createSecurityFunctionsEngine(),createSecurityQueryPropertiesEngine()),isNativeUmfCoreError);
const protectionSources=createProtectionSourcesRustDefault(Object.assign({},createSecurityProtectionSourceEngine(),createSecurityProtectionParametersEngine(),createSecurityProtectionDomainsEngine()),isNativeUmfCoreError);
const {resolveSecurityProtectionSources,resolveSecurityProtectionDomains,validateProtectionParameters,inspectProtectionCatalog,requireProtectionInterpretation}=protectionSources;
const securityPolicySource=createSecurityPolicySourceRustDefault(createSecurityPolicySourceEngine(),isNativeUmfCoreError);
const securityPolicy=createSecurityPolicyRustDefault(securityPolicySource,isNativeUmfCoreError);
const {inspectSecurityPolicy,requireSecurityInterpretation,securityPolicyDependencies,securityIdentityTransportDependencies}=securityPolicy;
const {validateSecurityDisclosure,encodeSecurityDisclosure,decodeSecurityDisclosure}=securityPolicySource;
const {inspectSecurityDisclosureV2,encodeSecurityDisclosureV2,decodeSecurityDisclosureV2}=securityPolicySource;
const {inspectSecurityActionPurposes,inspectProtectionObligations}=securityPolicySource;
const securityReadRegistrationEngine=createSecurityReadRegistrationEngine();
const SecurityAuthorityGuard=createSecurityAuthorityGuardRustDefault(createSecurityAuthorityGuardEngine(),isNativeUmfCoreError);
const {inspectSecurityPolicyV2Source,upgradeSecurityPolicySource,downgradeSecurityPolicySource,readSecuritySource,writeSecuritySource,evaluateSecurityAccess,evaluateSecurityCollection,evaluateSecurityWrite,evaluateSecurityPolicyV2LegacyAccess}=securityPolicySource;
class SecurityReadRegistration extends SecurityReadRegistrationBase { constructor() { super(securityReadRegistrationEngine,isNativeUmfCoreError); } }
const {inspectProtectionFunction,evaluateProtectionValue,inspectProtectionQueryProperties}=protection;
const evaluateActionRule=createActionRuleRustDefault(()=>createCodegenEngine(CODEGEN_RESOURCES),error=>isNativeUmfCoreError(error)||isWireAdmissionError(error));
const actionSelectors=createActionSelectorsRustDefault(()=>createCodegenEngine(CODEGEN_RESOURCES),error=>isNativeUmfCoreError(error)||isWireAdmissionError(error));
const validateBulkOutcome=createBulkOutcomeRustDefault(()=>createCodegenEngine(CODEGEN_RESOURCES),error=>isNativeUmfCoreError(error)||isWireAdmissionError(error));
const {compileActionRule,compileActionSelector,admitActionInputs,selectActionIdentity,prepareActionIdentities,actionFieldValueKey}=actionSelectors;
const tableDeployment=createTableDeploymentRustDefault(()=>createCodegenEngine(CODEGEN_RESOURCES),error=>isNativeUmfCoreError(error)||isWireAdmissionError(error));
const normalizeRowScope=createRowScopeRustDefault(()=>createCodegenEngine(CODEGEN_RESOURCES),error=>isNativeUmfCoreError(error)||isWireAdmissionError(error));
const discoverTableMigrationChanges=createTableMigrationDiscoveryRustDefault(()=>createCodegenEngine(CODEGEN_RESOURCES),error=>isNativeUmfCoreError(error)||isWireAdmissionError(error));
const reviewedValueDigest=createReviewedValueDigestRustDefault(()=>createCodegenEngine(CODEGEN_RESOURCES));
const tableMigration=createTableMigrationRustDefault(()=>createCodegenEngine(CODEGEN_RESOURCES),error=>isNativeUmfCoreError(error)||isWireAdmissionError(error));
const {compileTableMigration,verifyTableMigration}=tableMigration;
const {compileTableInventoryMigration,discoverTableInventoryMigrationChanges,verifyTableInventoryMigration,serializeTableInventoryMigration,irreversiblePurgeDisclosure}=createTableInventoryRustDefault(()=>createCodegenEngine(CODEGEN_RESOURCES),error=>isNativeUmfCoreError(error)||isWireAdmissionError(error));
const {compileTableDeployment,verifyTableDeployment}=tableDeployment;
const deltaDdlOperations=nativeFamilyDispatcher['delta-ddl'];
const deltaParquetOperations=nativeFamilyDispatcher['delta-parquet'];
const deltaEngine=Object.assign({},createDeltaSchemaTableEngine(),createDeltaLogEngine(),{
  inspectDefinitionPayload:(payload:Json)=>deltaDdlOperations.inspectPayload({payload}) as Diagnostic[],
  defineTable:(source:string,definition:import('./adapters/delta/ddl').DeltaDefinition,id:string)=>deltaDdlOperations.defineTable({source,definition,id}) as Document,
  generateDdl:(document:Document)=>deltaDdlOperations.generate({document}) as ReturnType<typeof import('./adapters/delta/ddl').generateDeltaDDL>,
  generateDdlBundle:(documents:readonly Document[])=>deltaDdlOperations.generateBundle({documents}) as ReturnType<typeof import('./adapters/delta/ddl').generateDeltaDDLBundle>,
  realizeSparkDelta4:(document:Document,target:Parameters<typeof import('./adapters/delta/ddl').realizeSparkDelta4DDL>[1])=>deltaDdlOperations.realizeSparkDelta4({document,target}) as ReturnType<typeof import('./adapters/delta/ddl').realizeSparkDelta4DDL>,
  projectParquetActions:(document:Document)=>deltaParquetOperations.projectActions({document}) as ReturnType<typeof import('./adapters/delta/parquet').projectDeltaParquetActions>,
  reconcileParquetCheckpoint:(checkpoint:import('./adapters/delta/reconcile').DeltaCommit,commits:import('./adapters/delta/reconcile').DeltaCommit[],spec:'v1'|'v2',sidecars:import('./adapters/delta/sidecars').DeltaSidecar[])=>deltaParquetOperations.reconcileCheckpoint({checkpoint,commits,spec,sidecars}) as ReturnType<typeof import('./adapters/delta/parquet-checkpoint').reconcileDeltaParquetCheckpoint>,
  reconcileMultipart:(version:string,partCount:number,parts:import('./adapters/delta/multipart').DeltaCheckpointPart[],commits:import('./adapters/delta/reconcile').DeltaCommit[])=>deltaParquetOperations.reconcileMultipart({version,partCount,parts,commits}) as ReturnType<typeof import('./adapters/delta/multipart').reconcileDeltaMultipartCheckpoint>,
});
const delta=createDeltaRustDefault(deltaEngine,error=>isNativeUmfCoreError(error)||error instanceof BindingUmfError,()=>new Registry());
const {deltaRegistry,deltaTableRegistry,deltaLogRegistry,inspectDelta,importDeltaSchema,exportDeltaSchema,getDeltaNode,proposeDeltaNodeEdit,inspectDeltaTable,importDeltaTable,exportDeltaTable,getDeltaTableNode,proposeDeltaTableNodeEdit,renameDeltaMappedField,getDeltaTableSchema,captureDeltaLog,exportDeltaLog,inspectDeltaLog,inspectDeltaActions,reconcileDeltaCommits,reconcileDeltaCheckpointSidecars,defineDeltaTable,generateDeltaDDL,generateDeltaDDLBundle,realizeSparkDelta4DDL,projectDeltaParquetActions,reconcileDeltaParquetCheckpoint,reconcileDeltaMultipartCheckpoint}=delta;
const icebergSchema=createIcebergSchemaRustDefault(createIcebergSchemaEngine(),error=>isNativeUmfCoreError(error)||error instanceof BindingUmfError,()=>new Registry());
const {icebergRegistry,inspectIceberg,importIcebergSchema,exportIcebergSchema,getIcebergNode,proposeIcebergNodeEdit}=icebergSchema;
const icebergTable=createIcebergTableRustDefault(createIcebergTableEngine(),error=>isNativeUmfCoreError(error)||error instanceof BindingUmfError,()=>new Registry());
const {icebergTableRegistry,inspectIcebergTable,importIcebergTable,exportIcebergTable,getIcebergTableNode,proposeIcebergTableNodeEdit,inspectIcebergTableContext,inspectIcebergTableTransforms,inspectIcebergTransformType,proposeIcebergTableRename,proposeIcebergTablePromotion}=icebergTable;
const avro=createAvroRustDefault(nativeFamilyDispatcher,isNativeUmfCoreError,()=>new Registry());
const {avroRegistry,inspectAvro,importAvroSchema,getAvroFieldMetadata,exportAvroSchema,exportAvroBundle,getAvroNode,editAvroNode,proposeAvroNodeEdit}=avro;
const {projectAvroToJsonSchema}=createAvroJsonSchemaRustDefault(nativeFamilyDispatcher,isNativeUmfCoreError);
const coreIdealRust=createCoreIdealRustDefault(nativeFamilyDispatcher,isNativeUmfCoreError);
const {classifyAvroCardinality,verifyAvroCardinalityClassification,recoverAvroCardinalityBundle,classifyAvroRecordType,recoverAvroRecordTypeBundle,classifyParquetRecordType,recoverParquetRecordTypeBytes,classifyParquetRecord,recoverParquetRecordBytes,classifyParquetRelationships,verifyParquetRelationshipClassification,recoverParquetRelationshipSource,classifyParquetNullability,verifyParquetNullabilityClassification,recoverParquetNullabilityBytes,classifyParquetField,verifyParquetFieldClassification,recoverParquetFieldBytes,classifyParquetKeys,verifyParquetKeyClassification,recoverParquetKeySource,classifyParquetCardinality,verifyParquetCardinalityClassification,recoverParquetCardinalityBytes,classifyParquetFacets,verifyParquetFacetClassification,recoverParquetFacetSource,classifyAvroField,recoverAvroFieldBundle,classifyAvroRecord,recoverAvroRecordBundle,classifyAvroKeys,verifyAvroKeyClassification,recoverAvroKeySource,classifyAvroRelationships,verifyAvroRelationshipClassification,recoverAvroRelationshipSource,classifyAvroNullability,verifyAvroNullabilityClassification,recoverAvroNullabilityBundle,classifyAvroFacets,verifyAvroFacetClassification,recoverAvroFacetSource,projectNullabilityToAvro,recoverNullabilityFromAvro,projectFacetsToAvro,recoverFacetsFromAvro,projectKeysToAvro,verifyKeysAvroProjection,recoverKeysAvroIdeal,projectRelationshipToAvro:rustProjectRelationshipToAvro,verifyRelationshipAvroProjection:rustVerifyRelationshipAvroProjection,recoverRelationshipAvroIdeal:rustRecoverRelationshipAvroIdeal,recoverRelationshipAvroNative:rustRecoverRelationshipAvroNative}=coreIdealRust;
const projectRelationshipToAvro=rustProjectRelationshipToAvro,verifyRelationshipAvroProjection=rustVerifyRelationshipAvroProjection,recoverRelationshipAvroIdeal=rustRecoverRelationshipAvroIdeal,recoverRelationshipAvroNative=rustRecoverRelationshipAvroNative;
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
const parquet=bindParquetCaptureRust(createParquetCaptureEngine(),isNativeUmfCoreError,error=>error instanceof BindingUmfError);
const {captureParquet,importParquetSchema,encodeParquetWire,exportParquetCapture,inspectParquetFraming,decodeParquetFooter,inspectParquetMetadata,inspectParquetSchema,inspectParquetPages,decodeParquetPageBodies,decodeParquetLevels,decodeParquetPhysical,decodeParquetValues,assembleParquetRows,repairParquetDictionaryOffsets,inspectParquetLogicalTypes,inspectParquetContainers,getParquetFieldMetadata,appendParquetKeyValueMetadata,renameParquetField}=parquet;
function parquetRegistry():Registry{return new Registry().register(parquetPackage);}
const postgresql=createPostgresqlRustDefault(createPostgresqlParserSessionEngine(),isNativeUmfCoreError,()=>new Registry());
const {postgresqlRegistry,validatePostgresqlAst,inspectPostgresql,importPostgresqlSql,exportPostgresqlSql,getPostgresqlSource,getPostgresqlNode,proposePostgresqlNodeEdit}=postgresql;
const dddPostgresqlRust=createDddPostgresqlRustDefault(nativeFamilyDispatcher,postgresql,isNativeUmfCoreError);
const rawTypeSpecSession=createTypeSpecSessionEngine({executeCompilerRequest:executeTypeSpecHostRequest,executeParserRequest:executeTypeSpecParserRequest});
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
const rawSmithySession=createSmithySessionEngine();
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
const {importTableSpec,inspectTableSpec,exportTableSpec,getTableSpecTable,getTableSpecColumn,editTableSpecTable,editTableSpecColumn,importTableSpecBundle,exportTableSpecBundle}=tableSpec;
const sqlServer=createSqlServerRustDefault(nativeFamilyDispatcher,isNativeUmfCoreError,()=>new Registry());
const shacl=createShaclRustDefault(nativeFamilyDispatcher,isNativeUmfCoreError,()=>new Registry());
const {shaclRegistry,inspectShaclDocument,importShaclTurtle,exportShaclTurtle,getShaclQuads,proposeShaclQuadEdit,getShaclPropertyPath,evaluateShaclPropertyPath,getShaclTargetNodes,getShaclShapeMetadata,proposeShaclEngineValidation}=shacl;
const owl=createOwlRustDefault(nativeFamilyDispatcher,isNativeUmfCoreError,()=>new Registry());
const {owlRegistry,inspectOwlDocument,importOwlTurtle,exportOwlTurtle,getOwlQuads,proposeOwlQuadEdit,getOwlOntologyHeaders,getOwlExpressionView,getOwlListAxioms,getOwlSpecialAxioms,getOwlAxiomAnnotations,getOwlDeclarations}=owl;
const {sqlserverRegistry,importSqlServerCatalog,inspectSqlServer,exportSqlServerCatalog,getSqlServerColumnMetadata,getSqlServerConstraintMetadata,getSqlServerIndexMetadata,proposeSqlServerCatalogEdit,inspectSqlServerFacetType,inspectSqlServerFacetPredicate,inspectSqlServerFacetConstraints,classifySqlServerField,verifySqlServerFieldClassification,recoverSqlServerFieldCapture}=sqlServer;
const readDescriptorSetRustCandidate=createReadDescriptorSetRustCandidate(protobufDescriptorDocument,isNativeUmfCoreError);
const {readDescriptorSet,writeDescriptorSet,importProtobufDescriptorSet,exportProtobufDescriptorSet,getProtobufDescriptorSet,inspectProtobuf,exportProtobufBundle}=protobufDescriptorDocument;
const protobufSources=createProtobufSourceRustDefault(
  createProtobufSourceImportEngine(),
  createProtobufSourceExportEngine(),
  isNativeUmfCoreError,
);
const {projectJsonSchemaToProtobuf}=createJsonSchemaProtobufRustDefault(nativeFamilyDispatcher,protobufSources.importProtobufSources,inspectProtobuf,isNativeUmfCoreError);
const generatePythonClient=await initializePythonClientRustDefaultV4(()=>createPythonClientRustCandidateV4());
const generateDomainPackSchemaOperation=createGeneratedSchemaGraphOperation(domainPackSchemaGraphJson) as typeof DomainPackSchemaReference;
const generateDatasetSourceSchemaOperation=createGeneratedSchemaGraphOperation(datasetSourceSchemaGraphJson) as typeof DatasetSourceSchemaReference;
const generateArtifactCollectionSchemaOperation=createGeneratedSchemaGraphOperation(artifactCollectionSchemaGraphJson) as typeof ArtifactCollectionSchemaReference;
const generateDomainPackLoaderSchemaOperation=createGeneratedSchemaGraphOperation(domainPackLoaderSchemaGraphJson) as typeof DomainPackLoaderSchemaReference;
const generateLoaderInventorySchemaOperation=createGeneratedSchemaGraphOperation(loaderInventorySchemaGraphJson) as typeof LoaderInventorySchemaReference;
const inspectDomainPackLoaderOperation=createDomainPackLoaderInspectionOperation(inspectDomainPackLoaderWire);
const domainPackProfileOperations=createDomainPackProfileInspectionOperation(inspectDomainPackProfileWire);
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
const model=createCoreModelRootKindNullabilityEngine(CORE_MODEL_RESOURCES);
const {declareCoreBit128Field}=bindCoreBit128FieldRust(createCoreBit128FieldEngine(CORE_MODEL_RESOURCES),isCoreBit128FieldBindingError);
const {Registry,validateDocument,readDocument,writeDocument,createUmfRegistry:baseCreateUmfRegistry}=createRegistryRustDefault(model,isNativeUmfCoreError,registerActions);
const {validateCoreDatasetValues,verifyCoreDatasetValues,inspectCoreEvolution,verifyCoreEvolution,encodeCoreKeyTuple,verifyCoreKeyTuple,selectCoreElements,selectCoreRelationships}=createCoreModelPublicRustDefault(model,createCoreKeyTupleEngine(CORE_MODEL_RESOURCES),error=>isNativeUmfCoreError(error)||error instanceof BindingUmfError,()=>new Registry());
const {importJsonSchema,inspectJsonSchema,exportJsonSchema,exportJsonSchemaResources,exportJsonSchemaBundle,getJsonSchemaNode,walkJsonSchema,editJsonSchemaNode,parseNativeJson,parseNativeYaml,jsonSchemaRegistry}=createJsonSchemaRustDefault(createPreparedJsonSchemaEngine(),error=>isNativeUmfCoreError(error)||error instanceof BindingUmfError,()=>new Registry());
const dddRegistry=()=>dddRust.dddRegistry(()=>new Registry());
const inspectDdd=dddRust.inspectDdd;
const registerDdd=<T extends InstanceType<typeof Registry>>(registry:T):T=>dddRust.registerDdd(registry);
const createUmfRegistry=()=>registerDdd(baseCreateUmfRegistry());
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
const {inspectCoreSemanticTypes,getCoreSemanticTypes,declareCoreSemanticTypes,verifyCoreSemanticTypeDeclaration}=bindCoreSemanticTypesRust(model,isNativeUmfCoreError);
const {getSemanticTypes,setSemanticTypes}=bindSemanticTypeAccessorsRust(model,isHostJsonResponseError);
const validateCoreRecordValues=bindCoreRecordValuesRust(createCoreRecordValuesHostInputEngine(CORE_MODEL_RESOURCES));
const {SemanticTypeRegistry,validateSemanticTypeValue,validateCoreSemanticTypeValue}=bindSemanticTypesRust(()=>createDefaultSemanticTypeRegistry(),CORE_MODEL_RESOURCES);
type SemanticTypeRegistry=InstanceType<typeof SemanticTypeRegistry>;
const recordType=bindCoreRecordTypeRust(createCoreRecordTypeEngine(CORE_MODEL_RESOURCES),isNativeUmfCoreError);
const {declareCoreRecordType,verifyCoreRecordTypeDeclaration}=recordType;
const temporal=createTemporalEngine();
const accessTemporal=createAccessTemporalEngine();
export const ACCESS_TEMPORAL_PROFILE=ACCESS_TEMPORAL_PROFILE_RUST;
export function parseAccessTemporal(kind:AccessTemporalKind,token:string):AccessTemporal {
  return accessTemporal.parseAccessTemporal(kind,token);
}
const securityEngine=createSecurityLogicEngine();
const securityNot=createSecurityNotRustAdapter(securityEngine);
const {securityAnd,securityOr}=createSecurityLogicRustAdapter(securityEngine);
const nativeJsonNumber=createJsonNumberEngine();
const {copyJson,readJsonValue,writeJsonValue,readProtectionSource,writeProtectionSource,inspectExtensionKinds,assertExactJsonNumber,composeSecurityRules,securityRefIdentity}=createNativeUtilityDefaults(Object.assign({},model,securityEngine,{copyJson:nativeCopyJson,assertExactJsonNumber:nativeJsonNumber.assertExactJsonNumber}),error=>isNativeUmfCoreError(error)||error instanceof BindingUmfError,()=>new Registry());
const {parseGregorianDate,truncateGregorianDate,parseRfc3339ExactInstant,sameRfc3339ExactInstant}=temporal;
const {validateCsvBooleanLexical,verifyCsvBooleanLexical}=bindCsvBooleanLexicalRust(model,isWireAdmissionError,isNativeUmfCoreError);
const {inspectCoreScalarType,inspectCoreRecordMembers,inspectCoreReferenceLinks}=bindCoreInspectorsRust(model,isWireAdmissionError,isNativeUmfCoreError);
const inspectRawTableBinding=createRawTableBindingInspector(inspectCoreRecordMembers);
const javascriptNumeric=bindJavascriptNumericRust(()=>createJavascriptNumericEngine(CORE_MODEL_RESOURCES));
const {exactDecimal,integerFromBigInt,integerToBigInt,admitJavascriptNumber,numericToNumberLossless}=javascriptNumeric;
const {inspectCoreSchemaProperties,declareCoreSchemaProperties,validateCoreFieldValue,resolveCoreDefault}=bindCoreSchemaPropertiesRust(model);
const cardinality=bindCoreCardinalityRust(createCoreCardinalityHostInputEngine(CORE_MODEL_RESOURCES),isHostJsonResponseError);
const {inspectCoreCardinality,declareCoreCardinality,verifyCoreCardinalityDeclaration}=cardinality;
const {validateCoreDatasetValuesCompact,verifyCoreDatasetValuesCompact}=bindCoreDatasetValuesCompactRust(model,isNativeUmfCoreError);
const {inspectCoreFacets,declareCoreFacets,verifyCoreFacetDeclaration,historicalCoreFacetPatch}=bindCoreFacetsRust(model);
const {inspectCoreKeys,lookupCoreKey,declareCoreRecordMembers,declareCoreKey,verifyCoreKeyOperation}=bindCoreKeysRust(model,isNativeUmfCoreError);
const relationshipOperations=bindCoreRelationshipsRust(model);
const {inspectCoreRelationships,lookupCoreRelationship,declareCoreRelationship,verifyCoreRelationshipOperation}=relationshipOperations;
const relationshipConsumers={lookupCoreRelationship,verifyCoreRelationshipOperation};
const {projectRelationshipToTableSpec,verifyRelationshipTableSpecProjection,recoverRelationshipTableSpecIdeal,recoverRelationshipTableSpecNativeSources}=createTableSpecRelationshipProjection(relationshipConsumers);
const {projectRelationshipToSqlServer,verifyRelationshipSqlServerProjection,recoverRelationshipSqlServerIdeal,recoverRelationshipSqlServerBinding,recoverRelationshipSqlServerNative}=createSqlServerRelationshipProjection(relationshipConsumers);
const {projectRelationshipToParquet,verifyRelationshipParquetProjection,recoverRelationshipParquetIdeal,recoverRelationshipParquetNative}=createRelationshipParquetProjection(relationshipConsumers);
const {projectRelationshipToExtra,verifyRelationshipExtra,recoverRelationshipExtraIdeal,recoverRelationshipExtraNative}=createRelationshipExtras(relationshipConsumers);
const {projectRelationshipsToPostgresql,verifyRelationshipPostgresqlProjection,recoverRelationshipPostgresqlIdeal,recoverRelationshipPostgresqlNative}=createRelationshipPostgresql(relationshipConsumers);
const {parseBits128,parseUuid,bits128FromBytes,bits128ToBytes,uuidFromBits128,uuidToBits128,compareBits128,bits128ToWords,bits128FromWords,bits128ToInteger,bits128FromInteger,classifyBit128NativeType,inspectBit128Binding,encodeBit128CarrierValue,decodeBit128CarrierValue,encodeBit128Record,decodeBit128Record,projectBit128Model,recoverBit128ModelProjection,encodeBit128FileRecord,decodeBit128FileRecord,projectBit128CarrierSchema,recoverBit128CarrierProjection}=bindBit128Rust(createBit128Engine(),isBit128EngineError);
const {importArrowSchema,inspectArrow,exportArrowSchema,getArrowNode,proposeArrowNodeEdit}=bindArrowSchemaRust(createArrowSchemaEngine(),isNativeUmfCoreError);
const {captureArrowIpc,exportArrowIpcCapture,inspectArrowIpcCapture}=bindArrowIpcRust(createArrowIpcEngine(),isNativeUmfCoreError,error=>error instanceof BindingUmfError);
const dbt=bindDbtRust(createDbtEngine(),isNativeUmfCoreError,isHostJsonResponseError,isDbtHostError);
const {importDbtManifest,exportDbtManifest,inspectDbtManifest,getDbtManifestNode,proposeDbtManifestNodeEdit,importDbtArtifact,exportDbtArtifact,inspectDbtArtifact,getDbtArtifactNode,proposeDbtArtifactNodeEdit,importDbtSemanticManifest,exportDbtSemanticManifest,inspectDbtSemanticManifest,getDbtSemanticManifestNode,proposeDbtSemanticManifestNodeEdit,inspectDbtManifestGraph,selectDbtManifestDependencies}=dbt;
export * from './index-v4-default';
export const projectDddToPostgresql=dddPostgresqlRust.projectDddToPostgresql;
export const verifyDddPostgresqlProjection=dddPostgresqlRust.verifyDddPostgresqlProjection;
export const recoverDddPostgresqlIdeal=dddPostgresqlRust.recoverDddPostgresqlIdeal;
export const recoverDddPostgresqlNative=dddPostgresqlRust.recoverDddPostgresqlNative;
export type {NativeShaclEngineReport as ShaclEngineReport} from './adapters/shacl/rust-default';
export {Registry,validateDocument,validateDocument as validateRelationshipCandidate,validateDocument as validateSchemaPropertiesDocument,readDocument,writeDocument,createUmfRegistry,dddRegistry,inspectDdd,registerDdd,readDddDocument,writeDddDocument,getDddDefinition,editDddDefinition,declareCoreBit128Field};
export {getSemanticTypes,setSemanticTypes};
export {scalarTypesForVersion};
export {importArrowSchema,inspectArrow,exportArrowSchema,getArrowNode,proposeArrowNodeEdit};
export {captureArrowIpc,exportArrowIpcCapture,inspectArrowIpcCapture};
export {importDbtManifest,exportDbtManifest,inspectDbtManifest,getDbtManifestNode,proposeDbtManifestNodeEdit,importDbtArtifact,exportDbtArtifact,inspectDbtArtifact,getDbtArtifactNode,proposeDbtArtifactNodeEdit,importDbtSemanticManifest,exportDbtSemanticManifest,inspectDbtSemanticManifest,getDbtSemanticManifestNode,proposeDbtSemanticManifestNodeEdit,inspectDbtManifestGraph,selectDbtManifestDependencies};
export {readCoreKeyTupleBytes,prepareCoreKeyTuples};
export {inspectDomainPackLoaderOperation as inspectDomainPackLoader,inspectDomainPack,requireDomainPackProfile};
export {inspectCoreElementKind,declareCoreElementKind,verifyCoreKindDeclaration,inspectCoreNullability,declareCoreNullability,verifyCoreNullabilityDeclaration,generatePythonClient,generateDomainPackSchema,generateDatasetSourceSchema,generateArtifactCollectionSchema,exactDecimal,integerFromBigInt,integerToBigInt,admitJavascriptNumber,numericToNumberLossless,inspectCoreCardinality,declareCoreCardinality,verifyCoreCardinalityDeclaration,validateCoreDatasetValuesCompact,verifyCoreDatasetValuesCompact,inspectCoreFacets,declareCoreFacets,verifyCoreFacetDeclaration,historicalCoreFacetPatch,inspectCoreKeys,lookupCoreKey,declareCoreRecordMembers,declareCoreKey,verifyCoreKeyOperation,inspectCoreRelationships,lookupCoreRelationship,declareCoreRelationship,verifyCoreRelationshipOperation,inspectCoreScalarType,inspectCoreRecordMembers,inspectCoreReferenceLinks,inspectCoreSemanticTypes,getCoreSemanticTypes,declareCoreSemanticTypes,verifyCoreSemanticTypeDeclaration,inspectRawTableBinding,inspectCoreSchemaProperties,declareCoreSchemaProperties,validateCoreFieldValue,resolveCoreDefault,validateCoreRecordValues,SemanticTypeRegistry,validateSemanticTypeValue,validateCoreSemanticTypeValue,declareCoreRecordType,verifyCoreRecordTypeDeclaration,parseBits128,parseUuid,classifyBit128NativeType,inspectBit128Binding,encodeBit128CarrierValue,decodeBit128CarrierValue,encodeBit128Record,decodeBit128Record,projectBit128Model,recoverBit128ModelProjection,encodeBit128FileRecord,decodeBit128FileRecord,projectBit128CarrierSchema,recoverBit128CarrierProjection,bits128FromBytes,bits128ToBytes,uuidFromBits128,uuidToBits128,compareBits128,bits128ToWords,bits128FromWords,bits128ToInteger,bits128FromInteger,validateCsvBooleanLexical,verifyCsvBooleanLexical,parseGregorianDate,truncateGregorianDate,parseRfc3339ExactInstant,sameRfc3339ExactInstant,securityNot,securityAnd,securityOr};
export {generateDomainPackLoaderSchema,generateLoaderInventorySchema};
export {projectSecSubmissions,projectSecCompanyFacts};
export {projectSecSubmissions as projectSecSubmissionsRustCandidate,projectSecCompanyFacts as projectSecCompanyFactsRustCandidate};
export {readDescriptorSetRustCandidate};
export {readDescriptorSet,writeDescriptorSet,importProtobufDescriptorSet,exportProtobufDescriptorSet,getProtobufDescriptorSet,inspectProtobuf,exportProtobufBundle};
export {graphqlRegistry,importGraphqlSchema,inspectGraphql,exportGraphqlSchema,getGraphqlAst,editGraphqlAst,exportGraphqlBundle,projectGraphqlInputToJsonSchema};
export {rdfRegistry,inspectRdfDocument,importRdfNQuads,getRdfQuads,exportRdfNQuads,proposeRdfQuadEdit,proposeRdfIriRename,importRdfTurtle,exportRdfTurtle,getRdfNamedGraphs,importRdfTriG,exportRdfTriG,proposeRdfDatasetMerge,generalizedRdfRegistry,inspectGeneralizedRdfDocument,importGeneralizedRdfDataset,exportGeneralizedRdfDataset,getGeneralizedRdfQuads,proposeGeneralizedRdfQuadEdit};
export {jsonldRegistry,importJsonLdDocument,inspectJsonLdDocument,exportJsonLdDocument,getJsonLdNode,proposeJsonLdNodeEdit,proposeJsonLdExpansion,proposeJsonLdFlatten,proposeJsonLdCompaction,proposeJsonLdFraming,proposeJsonLdToRdf,proposeRdfToJsonLd,proposeGeneralizedRdfToJsonLd};
export {ICEBERG_EXTENSION,icebergPackage,icebergRegistry,inspectIceberg,importIcebergSchema,exportIcebergSchema,getIcebergNode,proposeIcebergNodeEdit};
export {ICEBERG_TABLE_EXTENSION,icebergTablePackage,icebergTableRegistry,inspectIcebergTable,importIcebergTable,exportIcebergTable,getIcebergTableNode,proposeIcebergTableNodeEdit,inspectIcebergTableContext,inspectIcebergTableTransforms,inspectIcebergTransformType,proposeIcebergTableRename,proposeIcebergTablePromotion};
export {postgresqlRegistry,validatePostgresqlAst,inspectPostgresql,importPostgresqlSql,exportPostgresqlSql,getPostgresqlSource,getPostgresqlNode,proposePostgresqlNodeEdit};
export type {PostgresqlBackend} from './adapters/postgresql/index';
export {createPostgresqlSqlEngine};
export {avroRegistry,inspectAvro,importAvroSchema,getAvroFieldMetadata,exportAvroSchema,exportAvroBundle,getAvroNode,editAvroNode,proposeAvroNodeEdit};
export {projectAvroToJsonSchema};
export {classifyAvroCardinality,verifyAvroCardinalityClassification,recoverAvroCardinalityBundle,classifyAvroRecordType,recoverAvroRecordTypeBundle,classifyParquetRecordType,recoverParquetRecordTypeBytes,classifyParquetRecord,recoverParquetRecordBytes,classifyParquetRelationships,verifyParquetRelationshipClassification,recoverParquetRelationshipSource,classifyParquetNullability,verifyParquetNullabilityClassification,recoverParquetNullabilityBytes,classifyParquetField,verifyParquetFieldClassification,recoverParquetFieldBytes,classifyParquetKeys,verifyParquetKeyClassification,recoverParquetKeySource,classifyParquetCardinality,verifyParquetCardinalityClassification,recoverParquetCardinalityBytes,classifyParquetFacets,verifyParquetFacetClassification,recoverParquetFacetSource,classifyAvroField,recoverAvroFieldBundle,classifyAvroRecord,recoverAvroRecordBundle,classifyAvroKeys,verifyAvroKeyClassification,recoverAvroKeySource,classifyAvroRelationships,verifyAvroRelationshipClassification,recoverAvroRelationshipSource,classifyAvroNullability,verifyAvroNullabilityClassification,recoverAvroNullabilityBundle,classifyAvroFacets,verifyAvroFacetClassification,recoverAvroFacetSource};
export {projectNullabilityToAvro,recoverNullabilityFromAvro};
export {projectFacetsToAvro,recoverFacetsFromAvro};
export {projectKeysToAvro,verifyKeysAvroProjection,recoverKeysAvroIdeal};
export {importArrowFlatbufferModel,inspectArrowFlatbufferModel,exportArrowFlatbufferModel,proposeArrowFlatbufferEdit,decodeArrowFlatbuffer,encodeArrowFlatbuffer};
export {projectArrowToSpark,projectSparkToArrow};
export {compileTableInventoryMigration,discoverTableInventoryMigrationChanges,verifyTableInventoryMigration,serializeTableInventoryMigration,irreversiblePurgeDisclosure};
export {copyJson,readJsonValue,writeJsonValue,readProtectionSource,writeProtectionSource,inspectExtensionKinds,assertExactJsonNumber,composeSecurityRules,securityRefIdentity};
export {validateCoreDatasetValues,verifyCoreDatasetValues,inspectCoreEvolution,verifyCoreEvolution,encodeCoreKeyTuple,verifyCoreKeyTuple,selectCoreElements,selectCoreRelationships};
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
export {projectBindingToParquet};
export {projectBindingToDelta};
export {projectBindingTablesToSqlServer,projectBindingTablesAndIndexesFromPlanToSqlServer,projectBindingTablesAndIndexesToSqlServer};
export {projectBindingToSqlServer,verifyBindingSqlServerProjection,recoverBindingSqlServerSources,recoverBindingSqlServerNative};
export {projectDddToJsonSchema,dddFieldBinding,projectDddEntitiesToGraphql,projectDddToGraphql,verifyDddGraphqlProjection,recoverDddFromGraphql,recoverDddGraphqlNative,validateSqlServerRelationshipLayout,validatePostgresqlRelationshipLayout};
export {PARQUET_EXTENSION,PARQUET_MAX_BYTES,parquetPackage,parquetRegistry,captureParquet,importParquetSchema,encodeParquetWire,exportParquetCapture,inspectParquetFraming,decodeParquetFooter,inspectParquetMetadata,inspectParquetSchema,inspectParquetPages,decodeParquetPageBodies,decodeParquetLevels,decodeParquetPhysical,decodeParquetValues,assembleParquetRows,repairParquetDictionaryOffsets,inspectParquetLogicalTypes,inspectParquetContainers,getParquetFieldMetadata,appendParquetKeyValueMetadata,renameParquetField};
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
export type {SmithyJsonSchemaBackend,SmithyJsonSchemaPolicy,SmithyJsonSchemaProjection} from './projections/smithy-json-schema';
export type {TypeSpecJsonSchemaPolicy} from './projections/typespec-json-schema';
export {linkmlRegistry,importLinkmlDocument,inspectLinkmlDocument,exportLinkmlDocument,getLinkmlDocumentNode,proposeLinkmlDocumentNodeEdit,inspectLinkmlImportContext,proposeLinkmlImportMerge,inspectLinkmlClassSlots,inspectLinkmlSlotValues,odcsRegistry,importOdcsDocument,inspectOdcsDocument,exportOdcsDocument,getOdcsDocumentNode,proposeOdcsDocumentNodeEdit,resolveOdcsReference,inspectOdcsRelationships,proposeOdcsElementRename};
export {importTableSpec,inspectTableSpec,exportTableSpec,getTableSpecTable,getTableSpecColumn,editTableSpecTable,editTableSpecColumn,importTableSpecBundle,exportTableSpecBundle};
export {sqlserverRegistry,importSqlServerCatalog,inspectSqlServer,exportSqlServerCatalog,getSqlServerColumnMetadata,getSqlServerConstraintMetadata,getSqlServerIndexMetadata,proposeSqlServerCatalogEdit,inspectSqlServerFacetType,inspectSqlServerFacetPredicate,inspectSqlServerFacetConstraints,classifySqlServerField,verifySqlServerFieldClassification,recoverSqlServerFieldCapture};
export {shaclRegistry,inspectShaclDocument,importShaclTurtle,exportShaclTurtle,getShaclQuads,proposeShaclQuadEdit,getShaclPropertyPath,evaluateShaclPropertyPath,getShaclTargetNodes,getShaclShapeMetadata,proposeShaclEngineValidation};
export {owlRegistry,inspectOwlDocument,importOwlTurtle,exportOwlTurtle,getOwlQuads,proposeOwlQuadEdit,getOwlOntologyHeaders,getOwlExpressionView,getOwlListAxioms,getOwlSpecialAxioms,getOwlAxiomAnnotations,getOwlDeclarations};
export {projectRelationshipToAvro,verifyRelationshipAvroProjection,recoverRelationshipAvroIdeal,recoverRelationshipAvroNative,projectRelationshipToTableSpec,verifyRelationshipTableSpecProjection,recoverRelationshipTableSpecIdeal,recoverRelationshipTableSpecNativeSources,projectRelationshipToSqlServer,verifyRelationshipSqlServerProjection,recoverRelationshipSqlServerIdeal,recoverRelationshipSqlServerBinding,recoverRelationshipSqlServerNative,projectRelationshipToParquet,verifyRelationshipParquetProjection,recoverRelationshipParquetIdeal,recoverRelationshipParquetNative,projectRelationshipToExtra,verifyRelationshipExtra,recoverRelationshipExtraIdeal,recoverRelationshipExtraNative,projectRelationshipsToPostgresql,verifyRelationshipPostgresqlProjection,recoverRelationshipPostgresqlIdeal,recoverRelationshipPostgresqlNative};

export const {importProtobufSources,exportProtobufSources}=protobufSources;

export { DELTA_EXTENSION };

export { DELTA_TABLE_EXTENSION };

export { DELTA_LOG_EXTENSION };

export { deltaPackage };

export { deltaTablePackage };

export { deltaLogPackage };

export {deltaRegistry,deltaTableRegistry,deltaLogRegistry,inspectDelta,importDeltaSchema,exportDeltaSchema,getDeltaNode,proposeDeltaNodeEdit,inspectDeltaTable,importDeltaTable,exportDeltaTable,getDeltaTableNode,proposeDeltaTableNodeEdit,renameDeltaMappedField,getDeltaTableSchema,captureDeltaLog,exportDeltaLog,inspectDeltaLog,inspectDeltaActions,reconcileDeltaCommits,reconcileDeltaCheckpointSidecars,defineDeltaTable,generateDeltaDDL,generateDeltaDDLBundle,realizeSparkDelta4DDL,projectDeltaParquetActions,reconcileDeltaParquetCheckpoint,reconcileDeltaMultipartCheckpoint};

export {evaluateActionRule,compileTableDeployment,verifyTableDeployment,normalizeRowScope,discoverTableMigrationChanges,reviewedValueDigest,compileTableMigration,verifyTableMigration};
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
