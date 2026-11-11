// SPDX-License-Identifier: MIT OR Apache-2.0
export * from './model/types';
export * from './model/nullability';
export * from './adapters/tablespec';
export * from './adapters/sqlserver';
export type * from './projections/sqlserver-avro-types';
export type * from './projections/sqlserver-ddl-types';
export type * from './projections/tablespec-avro-types';
export type * from './projections/avro-tablespec-types';
export type * from './projections/tablespec-via-avro-types';
export type * from './projections/postgresql-avro-types';
export type * from './projections/parquet-avro-types';
export {copyJson,LIMITS} from './model/json';
export * from './model/serialization';
export * from './model/document';
export type {CoreElementQuery,CoreElementSelection,CoreElementSelectionEntry} from './model/selection-types';
export * from './registry/registry';
export {createUmfRegistry} from './registry/builtins';
export {validateDocument} from './validation/document';
export { default as coreSchema } from '../spec/core/schema.json';
export { default as extensionPackageSchema } from '../spec/core/extension-package.schema.json';
export * from './adapters/json-schema';
export * from './adapters/protobuf';
export type * from './projections/json-schema-protobuf-types';
export type {ProjectionIssue} from './projections/projection-types';
export { default as jsonSchemaProtobufProjectionSchema } from '../spec/projections/json-schema-protobuf.schema.json';
export * from './extensions/ddd';
export * from './extensions/dashboard';
export * from './model/extension-kinds';
export * from './extensions/binding';
export type * from './projections/binding-parquet-types';
export type * from './projections/binding-delta-types';
export type * from './projections/binding-iceberg-types';
export type * from './projections/binding-postgresql/indexes-types';
export type * from './projections/binding-sqlserver-types';
export {default as sqlserverPhysicalBindingSchema} from '../spec/projections/sqlserver-physical-binding.schema.json';
export type * from './projections/ddd-postgresql-types';
export {default as dddPostgresqlPolicySchema} from '../spec/projections/ddd-postgresql-policy.schema.json';
export {default as dddPostgresqlProjectionSchema} from '../spec/projections/ddd-postgresql-projection.schema.json';
export type * from './projections/ddd-graphql-types';
export * from './projections/ddd-graphql-schema';
export type * from './projections/ddd-json-schema-types';
export { default as dddJsonSchemaProjectionSchema } from '../spec/projections/ddd-json-schema.schema.json';
export * from './adapters/avro';
export type * from './adapters/parquet/arrow-types';

export type {AvroDocumentBindings,AvroDocumentProjection} from './projections/avro-json-schema-types';
export { default as avroJsonSchemaProjectionSchema } from '../spec/projections/avro-json-schema.schema.json';
export * from './adapters/graphql';
export type {GraphqlInputBindings,GraphqlInputProjection} from './projections/graphql-input-json-schema-types';
export { default as graphqlInputJsonSchemaProjectionSchema } from '../spec/projections/graphql-input-json-schema.schema.json';
export {parseNativeYaml} from './model/native-json';
export {default as nativeJsonSchema} from '../spec/core/native-json.schema.json';
export * from './adapters/openapi';
export * from './adapters/openapi/references';
export {default as openapiReferenceResultSchema} from '../spec/extensions/openapi/reference-result.schema.json';
export * from './adapters/openapi/extraction';
export {default as openapiSchemaExtractionSchema} from '../spec/extensions/openapi/schema-extraction.schema.json';
export * from './adapters/openapi/scope';
export {default as openapiSchemaIndexSchema} from '../spec/extensions/openapi/schema-index.schema.json';
export {default as openapiSchemaReferenceSchema} from '../spec/extensions/openapi/schema-reference.schema.json';
export type {OpenapiJsonSchemaPolicy,OpenapiJsonSchemaProjection} from './projections/openapi-json-schema-types';
export {default as openapiJsonSchemaProjectionSchema} from '../spec/projections/openapi-json-schema.schema.json';
export * from './adapters/openapi/dynamic';
export {default as openapiDynamicReferenceSchema} from '../spec/extensions/openapi/dynamic-reference.schema.json';
export * from './adapters/typespec';
export {default as typespecCompilerReportSchema} from '../spec/extensions/typespec/compiler-report.schema.json';
export {default as typespecSyntaxLocationsSchema} from '../spec/extensions/typespec/syntax-locations.schema.json';
export * from './adapters/typespec/semantic';
export {default as typespecSemanticGraphSchema} from '../spec/extensions/typespec/semantic-graph.schema.json';
export * from './adapters/typespec/emission';
export {default as typespecJsonSchemaEmissionSchema} from '../spec/extensions/typespec/json-schema-emission.schema.json';
export type {TypeSpecJsonSchemaPolicy} from './projections/typespec-json-schema-types';
export {default as typespecJsonSchemaProjectionSchema} from '../spec/projections/typespec-json-schema.schema.json';
export * from './adapters/smithy';
export {default as smithySchema} from '../spec/extensions/smithy/schema.json';
export {default as smithyNativeStructureSchema} from '../spec/extensions/smithy/native-structure.schema.json';
export * from './adapters/smithy/sources';
export * from './adapters/smithy/assembly';
export {default as smithyNativeAssemblySchema} from '../spec/extensions/smithy/native-assembly.schema.json';
export {default as smithyAssemblyResultSchema} from '../spec/extensions/smithy/assembly-result.schema.json';
export * from './adapters/smithy/worker';
export * from './adapters/smithy/selection';
export {default as smithySelectionResultSchema} from '../spec/extensions/smithy/selection-result.schema.json';
export {default as smithyNativeSelectionSchema} from '../spec/extensions/smithy/native-selection.schema.json';
export type {SmithyJsonSchemaBackend,SmithyJsonSchemaPolicy,SmithyJsonSchemaProjection} from './projections/smithy-json-schema-types';
export {createSmithyJavaScriptJsonSchemaBackend} from './adapters/smithy/json-schema-host-backend';
export {default as smithyJsonSchemaProjectionSchema} from '../spec/projections/smithy-json-schema.schema.json';
export * from './adapters/postgresql';
export * from './adapters/postgresql/declarations';
export {default as postgresqlSchema} from '../spec/extensions/postgresql/schema.json';

export {default as postgresqlNativeAstSchema} from '../spec/extensions/postgresql/native-ast.schema.json';
export * from './adapters/postgresql/catalog';
export {default as postgresqlCatalogSchema} from '../spec/extensions/postgresql-catalog/schema.json';
export {default as postgresqlCatalogCaptureSchema} from '../spec/extensions/postgresql-catalog/capture.schema.json';
export type * from './projections/postgresql-json-schema-types';

export {default as postgresqlRowProjectionSchema} from '../spec/projections/postgresql-row-json-schema.schema.json';
export * from './adapters/arrow';
export {ARROW_IPC_EXTENSION,ARROW_IPC_MAX_BYTES,arrowIpcPackage,ARROW_FLATBUFFER_EXTENSION,arrowFlatbufferPackage} from './adapters/arrow/package';
export type {
 ArrowFlatbufferEncodingBackend,ArrowFlatbufferRoot,ArrowIpcConsistency,ArrowIpcFrame,ArrowIpcLayout,
 ArrowIpcObservationBackend,ArrowIpcRenameResult,ArrowSchemaIpcBackend,
} from './adapters/arrow/api-types';
export {default as arrowSchema} from '../spec/extensions/arrow/schema.json';
export {default as arrowIntegrationSchema} from '../spec/extensions/arrow/integration-schema.json';
export {default as arrowFlatbufferModelSchema} from '../spec/extensions/arrow/flatbuffer-model.schema.json';
export {default as arrowIpcLayoutSchema} from '../spec/extensions/arrow-ipc/layout-result.schema.json';
export {default as arrowIpcConsistencySchema} from '../spec/extensions/arrow-ipc/consistency-result.schema.json';
export {default as arrowIpcRenameSchema} from '../spec/extensions/arrow-ipc/rename-result.schema.json';
export * from './adapters/spark';
export {default as sparkDataTypeSchema} from '../spec/extensions/spark/datatype-schema.json';
export * from './adapters/spark/rename';

export {default as sparkRenameSchema} from '../spec/extensions/spark/rename-result.schema.json';

export type * from "./projections/spark-arrow-types";

export {default as sparkArrowProjectionSchema} from "../spec/projections/spark-arrow.schema.json";

export type * from "./projections/arrow-spark-types";

export {default as arrowSparkProjectionSchema} from "../spec/projections/arrow-spark.schema.json";

export * from "./adapters/delta";
export * from "./adapters/delta/ddl";
export {default as deltaDataTypeSchema} from "../spec/extensions/delta/datatype-schema.json";

export * from "./adapters/delta/table";
export {default as deltaTableContextSchema} from "../spec/extensions/delta-table/context-schema.json";

export * from "./adapters/delta/rename";

export {default as deltaMappedRenameSchema} from "../spec/extensions/delta-table/rename-result.schema.json";

export * from "./adapters/delta/log";
export {default as deltaLogInspectionSchema} from "../spec/extensions/delta-log/inspection.schema.json";
export * from './adapters/delta/actions';
export {default as deltaActionSchema} from '../spec/extensions/delta-log/action-schema.json';
export * from './adapters/delta/reconcile';
export * from './adapters/parquet';
export {getParquetFieldMetadata,importParquetSchema,type ParquetFieldMetadata,type ParquetFieldMetadataResult} from './adapters/parquet/field-metadata';
export {default as parquetFramingSchema} from '../spec/extensions/parquet/framing.schema.json';
export * from './adapters/parquet/footer';
export {default as parquetFooterDecodeSchema} from '../spec/extensions/parquet/footer-decode.schema.json';
export * from './adapters/parquet/metadata';
export {default as parquetMetadataSchema} from '../spec/extensions/parquet/metadata.schema.json';
export {default as parquetMetadataInspectionSchema} from '../spec/extensions/parquet/metadata-inspection.schema.json';
export {default as parquetIdl} from '../spec/extensions/parquet/idl.json';
export * from './adapters/parquet/schema';
export {default as parquetSchemaInspectionSchema} from '../spec/extensions/parquet/schema-inspection.schema.json';
export * from './adapters/parquet/logical';
export {default as parquetLogicalInspectionSchema} from '../spec/extensions/parquet/logical-inspection.schema.json';
export * from './adapters/parquet/containers';
export {default as parquetContainerInspectionSchema} from '../spec/extensions/parquet/container-inspection.schema.json';
export * from './adapters/parquet/encode';
export * from './adapters/parquet/transform';
export {default as parquetMetadataTransformSchema} from '../spec/extensions/parquet/metadata-transform.schema.json';
export * from './adapters/parquet/rename';
export {default as parquetRenameSchema} from '../spec/extensions/parquet/rename.schema.json';
export * from './adapters/parquet/pages';
export {default as parquetPagesSchema} from '../spec/extensions/parquet/pages.schema.json';
export * from './adapters/parquet/bodies';
export {default as parquetPageBodiesSchema} from '../spec/extensions/parquet/page-bodies.schema.json';
export * from './adapters/parquet/levels';
export {default as parquetLevelsSchema} from '../spec/extensions/parquet/levels.schema.json';
export * from './adapters/parquet/physical';
export {default as parquetPhysicalSchema} from '../spec/extensions/parquet/physical.schema.json';
export * from './adapters/parquet/rows';
export {default as parquetRowsSchema} from '../spec/extensions/parquet/rows.schema.json';
export * from './adapters/parquet/values';
export {default as parquetValuesSchema} from '../spec/extensions/parquet/values.schema.json';
export * from './adapters/delta/parquet';

export {default as deltaParquetActionsSchema} from "../spec/extensions/delta-log/parquet-actions.schema.json";

export * from "./adapters/delta/sidecars";

export {default as deltaSidecarReconciliationSchema} from "../spec/extensions/delta-log/sidecar-reconciliation.schema.json";

export * from "./adapters/delta/parquet-checkpoint";

export {default as deltaParquetCheckpointSchema} from "../spec/extensions/delta-log/parquet-checkpoint.schema.json";

export * from "./adapters/parquet/repair-offsets";

export {default as parquetOffsetRepairSchema} from "../spec/extensions/parquet/offset-repair.schema.json";

export * from "./adapters/delta/multipart";

export {default as deltaMultipartSchema} from "../spec/extensions/delta-log/multipart.schema.json";

export * from "./adapters/iceberg";

export * from "./adapters/iceberg/table";
export * from "./adapters/iceberg/table-context";
export * from "./adapters/iceberg/transforms";
export * from "./adapters/iceberg/table-transforms";
export * from "./adapters/iceberg/table-rename";
export * from "./adapters/iceberg/table-promotion";
export * from "./adapters/dbt";
export * from "./adapters/dbt/graph";
export * from "./adapters/dbt/selection";
export * from "./adapters/dbt/artifact";

export * from './adapters/dbt/semantic';

export * from './adapters/odcs';

export * from './adapters/odcs/references';

export * from './adapters/odcs/relationships';

export * from './adapters/odcs/rename';

export * from './adapters/linkml';

export * from './adapters/linkml/imports';
export * from './adapters/linkml/class-slots';
export * from './adapters/linkml/slot-values';
export * from './adapters/linkml/merge';
export * from './adapters/rdf';

export * from "./adapters/jsonld";
export * from './adapters/generalized-rdf';

export {OWL_EXTENSION,owlPackage} from './adapters/owl/package';
export type {
 OwlAnnotationRecord,OwlAxiomAnnotations,OwlDeclaration,OwlDeclarationView,OwlEntityKind,OwlExpressionDescription,OwlExpressionView,
 OwlListAxiom,OwlListAxiomKind,OwlListAxiomView,OwlMalformedListAxiom,OwlOntologyHeader,OwlSpecialAxiom,OwlSpecialAxiomView,
} from './adapters/owl/types';
export * from "./adapters/shacl";
export type {NativeShaclEngineReport as ShaclEngineReport} from './adapters/shacl/rust-default';


export type {ShaclMetadataField,ShaclShapeMetadata,ShaclShapeMetadataNode} from "./adapters/shacl/metadata-types";



export * from './model/field-kind';
export * from './core-ideals/tablespec-field';
export * from './core-ideals/field-tablespec-projection';
export * from './core-ideals/tablespec-record';
export * from './core-ideals/record-tablespec-projection';
export * from './core-ideals/postgresql-field';
export * from './core-ideals/postgresql-record';
export * from './core-ideals/field-postgresql-projection';
export * from './core-ideals/record-postgresql-projection';
export * from './core-ideals/postgresql-ddl-kinds';
export * from './core-ideals/postgresql-composite';

export * from './core-ideals/sqlserver-field';
export * from './core-ideals/sqlserver-record';
export * from './core-ideals/field-sqlserver-projection';
export * from './core-ideals/record-sqlserver-projection';
export * from './core-ideals/avro-field';
export * from './core-ideals/avro-record';
export * from './core-ideals/field-avro-projection';
export * from './core-ideals/record-avro-projection';
export * from './core-ideals/parquet-field';
export * from './core-ideals/parquet-record';
export * from './core-ideals/field-parquet-projection';
export * from './core-ideals/record-parquet-projection';
export * from './model/record-type';
export * from './model/selection-schemas';
export * from './core-ideals/avro-record-type';
export * from './core-ideals/parquet-record-type';
export * from './core-ideals/nullability-tablespec';
export * from './core-ideals/nullability-tablespec-projection';

export * from './core-ideals/nullability-postgresql';
export * from './core-ideals/nullability-postgresql-projection';
export * from './core-ideals/nullability-sqlserver';
export * from './core-ideals/nullability-sqlserver-projection';
export {AVRO_NULLABILITY_EXTENSION,avroNullabilityPackage} from './core-ideals/nullability-avro-package';
export type {AvroNullabilityClassification,AvroNullabilityRequest} from './core-ideals/nullability-avro-types';
export {default as avroNullabilityClassificationSchema} from '../spec/core/avro-nullability-classification.schema.json';
export * from './core-ideals/nullability-avro-projection';
export * from './core-ideals/nullability-parquet';
export * from './core-ideals/nullability-parquet-projection';

export {coreCardinalityOperationV4Schema,coreCardinalityOperationSchema,inspectCoreCardinality,declareCoreCardinality,verifyCoreCardinalityDeclaration} from './model/cardinality';
export type {CoreCardinalityIdentity,CoreCardinalityMeaning,CoreCardinalityInspection,CoreCardinalityRequest,CoreCardinalityDeclaration} from './model/cardinality';

export * from './core-ideals/cardinality-tablespec';
export * from './core-ideals/cardinality-tablespec-projection';
export * from './adapters/postgresql/cardinality-catalog';
export * from './core-ideals/cardinality-postgresql';
export * from './core-ideals/cardinality-postgresql-projection';
export * from './core-ideals/cardinality-sqlserver';
export * from './core-ideals/cardinality-sqlserver-projection';

export type * from './core-ideals/avro-cardinality-types';
export {AVRO_CARDINALITY_EXTENSION,avroCardinalityPackage,avroCardinalityClassificationSchema} from './core-ideals/avro-cardinality-package';
export * from './core-ideals/cardinality-parquet';
export * from './core-ideals/cardinality-parquet-projection';
export * from './core-ideals/cardinality-avro-projection';

export * from './model/facets';

export * from './core-ideals/facets-tablespec';
export * from './core-ideals/facets-tablespec-projection';

export * from './core-ideals/facets-postgresql';

export * from './core-ideals/facets-postgresql-projection';

export * from './core-ideals/facets-sqlserver';

export * from './core-ideals/facets-sqlserver-projection';

export * from './core-ideals/facets-avro';

export * from './core-ideals/facets-avro-projection';

export * from './core-ideals/facets-parquet';
export * from './core-ideals/facets-parquet-projection';

export * from './model/keys';
export {encodeCoreKeyTuple,verifyCoreKeyTuple,readCoreKeyTupleBytes,prepareCoreKeyTuples} from './model/key-tuple';
export type {CoreKeyIdentity,CoreKeyTupleValue,CoreKeyTupleReceipt,PreparedCoreKeyTuples} from './model/key-tuple';
export type {CoreKeyDefinition,CoreKeyFieldReference} from './validation/keys';
export {default as coreKeyOperationSchema} from '../spec/core/key-operation-v2.schema.json';
export {default as coreKeyTupleOperationSchema} from '../spec/core/key-tuple-operation-v4.schema.json';

export * from './core-ideals/key-tablespec';

export * from './core-ideals/key-tablespec-projection';

export * from './adapters/postgresql/key-catalog';
export * from './adapters/postgresql/key-correlation';

export * from './core-ideals/key-postgresql';
export * from './core-ideals/key-postgresql-projection';
export * from './core-ideals/key-sqlserver';
export * from './core-ideals/key-sqlserver-projection';
export {AVRO_KEYS_EXTENSION,avroKeysPackage} from './core-ideals/key-avro-package';
export type {AvroKeyArchive,AvroKeyClassification,AvroKeyObservation,AvroKeyRequest} from './core-ideals/key-avro-types';
export {default as avroKeyClassificationSchema} from '../spec/core/avro-key-classification.schema.json';
export * from './core-ideals/key-avro-projection';
export * from './core-ideals/key-parquet';
export * from './core-ideals/key-parquet-projection';

export {validateRelationshipCandidate} from './validation/relationships';
export type {RelationshipCandidate,CoreRelationship,RelationshipEndpoint,RelationshipTarget,RelationshipMultiplicity} from './validation/relationships';
export {declareCoreRelationship,inspectCoreRelationships,lookupCoreRelationship,verifyCoreRelationshipOperation} from './model/relationships';
export type {CoreRelationshipRequest,CoreRelationshipIdentity,RelationshipModuleIdentity,CoreRelationshipOperation,CoreRelationshipDeclaration,CoreRelationshipInspection,CoreRelationshipLookup,CoreRelationshipMeaning} from './model/relationships';
export {default as coreRelationshipOperationSchema} from '../spec/core/relationship-operation.schema.json';
export {default as coreKeyOperationV2Schema} from '../spec/core/key-operation-v2.schema.json';
export type {CoreRelationshipQuery,CoreRelationshipSelection,CoreRelationshipSelectionEntry} from './model/relationship-selection-types';
export {default as coreRelationshipMetadataSelectionSchema} from '../spec/core/relationship-metadata-selection-v2.schema.json';
export * from './core-ideals/relationship-tablespec';
export type {RelationshipTableSpecRequest,RelationshipTableSpecProjection} from './core-ideals/relationship-tablespec-projection-types';
export {default as relationshipTableSpecProjectionSchema} from '../spec/core/relationship-tablespec-projection.schema.json';
export {AVRO_RELATIONSHIPS_EXTENSION,avroRelationshipsPackage} from './core-ideals/relationship-avro-package';
export type {AvroRelationshipClassification,AvroRelationshipObservation,AvroRelationshipRequest,AvroRelationshipArchive} from './core-ideals/relationship-avro-types';
export {default as avroRelationshipClassificationSchema} from '../spec/core/avro-relationship-classification.schema.json';
export type {RelationshipAvroRequest,RelationshipAvroProjection} from './core-ideals/relationship-avro-projection-types';
export {default as relationshipAvroProjectionSchema} from '../spec/core/relationship-avro-projection.schema.json';
export * from './core-ideals/relationship-parquet';
export type {RelationshipParquetRequest,RelationshipParquetProjection} from './core-ideals/relationship-parquet-projection-types';
export {default as relationshipParquetProjectionSchema} from '../spec/core/relationship-parquet-projection.schema.json';
export * from './projections/ddd-postgresql/relationship-layout';
export * from './core-ideals/relationship-sqlserver';
export type {RelationshipSqlServerRequest,RelationshipSqlServerProjection,SqlServerRelationshipKey} from './core-ideals/relationship-sqlserver-projection-types';
export {default as relationshipSqlServerProjectionSchema} from '../spec/core/relationship-sqlserver-projection.schema.json';
export * from './core-ideals/relationship-postgresql';
export * from './core-ideals/relationship-extras';

export * from './model/schema-properties';
export * from './adapters/javascript-numeric';
export * from './adapters/rfc3339-exact-instant';
export {type CoreLiteral} from './model/schema-literals';
export {coreSchemaPropertiesDocumentSchema,validateSchemaPropertiesDocument} from './validation/schema-properties';

// Declarative action metadata; execution requires a separately qualified consumer.
export {registerActions,declareAction,inspectActions,editAction,assessAction,actionsPackage} from './extensions/actions';
export type {Action,ActionIdentity,ActionParameter,ActionReference,ActionKeyReference,ActionRelationshipReference,ActionRule,ActionRuleReference,ActionFrame,ActionCondition,ActionEffect,ActionBinding,ActionAssignment,ActionEntityBinding,ActionValueBinding,ActionAuthorization,ActionObligation,ActionObligationKind,ActionInspection,InspectedAction,ActionExecutorProfile,ActionAssessment} from './extensions/actions';
// Explicit bounded consumer interpretation, separate from inert metadata inspection.
export {compileActionRule,actionExpressionLimits} from './extensions/actions/expression';
export type {ActionExpression,ActionRulePhase,CompiledActionRule,ActionExpressionType} from './extensions/actions/expression';
export {compileActionSelector,selectActionIdentity,admitActionInputs,prepareActionIdentities} from './extensions/actions/selector';
export type {ActionInputs,ActionEntityInput,CompiledActionSelector,SelectedActionIdentity} from './extensions/actions/selector';
export {evaluateActionRule,actionFieldValueKey} from './extensions/actions/evaluation';
export type {ActionFrameState,ActionBusinessState,ActionRuleState} from './extensions/actions/evaluation';
export {generateDomainPackSchema} from './domain-packs/schema';
export {default as domainPackSchema} from '../spec/extensions/domain-pack/schema.json';
export {default as domainPackPackage} from '../spec/extensions/domain-pack/package.json';

export {generateDatasetSourceSchema} from './domain-packs/source-schema';
export * from './domain-packs/medical';
export * from './domain-packs/public-company';
export {default as datasetSourceSchema} from '../spec/extensions/dataset-source/schema.json';
export {default as datasetSourcePackage} from '../spec/extensions/dataset-source/package.json';
export {inspectDomainPack,requireDomainPackProfile} from './domain-packs/profile';

export {validateCoreRecordValues} from './model/record-values';
export type {CoreRecordValueIdentity,CoreRecordFieldValue,CoreRecordValueCheck} from './model/record-values';
export {validateCoreDatasetValues,verifyCoreDatasetValues,coreDatasetValueOperationSchema} from './model/dataset-values';
export type {CoreDatasetInput,CoreDatasetRecord,CoreDatasetRelationship,CoreDatasetValueCheck} from './model/dataset-values';

export {validateCoreDatasetValuesCompact,verifyCoreDatasetValuesCompact,coreDatasetValueCompactOperationSchema} from './model/dataset-values-compact';
export type {CoreCompactRecordValueCheck,CoreCompactKeyTupleReceipt,CoreDatasetCompactValueCheck} from './model/dataset-values-compact';

export * from './model/csv-boolean-lexical';

export {generateDomainPackLoaderSchema,inspectDomainPackLoader} from './domain-packs/loader';
export {generateLoaderInventorySchema} from './domain-packs/loader-inventory';

export {generateArtifactCollectionSchema} from './domain-packs/artifacts';
export type {CoreEvolutionPolicy} from './model/evolution-types';
export {default as coreEvolutionOperationSchema} from '../spec/core/evolution-operation.schema.json';
export {default as coreEvolutionPolicySchema} from '../spec/core/evolution-policy.schema.json';
export {securityNot,securityAnd,securityOr,composeSecurityRules} from './extensions/security/logic';
export type {SecurityTruth,SecurityDecision,SecurityDisposition,EvaluatedSecurityRule,SecurityComposition} from './extensions/security/logic';
export * from './extensions/security/types';
export {SECURITY_EXTENSION,securityPackage,readSecuritySource,writeSecuritySource,inspectSecurityPolicy,securityRegistry,requireSecurityInterpretation} from './extensions/security/policy';
export type {SecurityInspection} from './extensions/security/policy';
export {evaluateSecurityAccess,evaluateSecurityCollection} from './extensions/security/evaluate';
export type {SecurityFact,SecurityFactCut,SecurityEvaluationRequest,SecurityOutput,SecurityAccessResult,SecurityCollectionResult} from './extensions/security/evaluate';
export {SecurityReadRegistration} from './extensions/security/registration';
export type {SecurityReadHandle} from './extensions/security/registration';
export {SecurityAuthorityGuard} from './extensions/security/authority-guard';
export {evaluateSecurityWrite} from './extensions/security/write';
export type {SecurityWriteProfile,SecurityWriteState,SecurityWriteRequest,SecurityWriteResult} from './extensions/security/write';
export {securityPolicyDependencies,securityIdentityTransportDependencies,type SecurityIdentityTransportDependencies} from './extensions/security/dependencies';
export type {SecurityDependencies} from './extensions/security/dependencies';
export {validateSecurityDisclosure,encodeSecurityDisclosure,decodeSecurityDisclosure} from './extensions/security/disclosure';
export type {SecurityDisclosureBatch} from './extensions/security/disclosure';

// Protection wire metadata only; complete interpretation remains closed.
export {readProtectionSource,writeProtectionSource} from './extensions/security/protection/source';
export {protectionPackage,inspectProtectionCatalog,requireProtectionInterpretation} from './extensions/security/protection/catalog';
export type {ProtectionCatalogInspection} from './extensions/security/protection/catalog';

// Proposed security0.2 source representation, never policy/native activation.
export {securityV2Package,inspectSecurityPolicyV2Source,upgradeSecurityPolicySource,downgradeSecurityPolicySource} from './extensions/security/policy-representation-v2';
export type {SecurityPolicyV2Inspection,SecurityPolicySourceMigration} from './extensions/security/policy-representation-v2';
export {resolveSecurityProtectionSources} from './extensions/security/protection/references';
export type {SecurityProtectionSourceResolution} from './extensions/security/protection/references';

export {evaluateSecurityPolicyV2LegacyAccess} from './extensions/security/policy-v2-legacy-access';
export type {SecurityPolicyV2LegacyAccess} from './extensions/security/policy-v2-legacy-access';
export {resolveSecurityProtectionDomains} from './extensions/security/protection/domains';
export type {ProtectionCoreClosure,ProtectionDomainOccurrence,SecurityProtectionDomainResolution} from './extensions/security/protection/domains';
export {validateProtectionParameters} from './extensions/security/protection/parameters';
export type {ProtectionParameterValidation} from './extensions/security/protection/parameters';
export {inspectProtectionQueryProperties} from './extensions/security/protection/queries';
export type {ProtectionQueryPropertyInspection} from './extensions/security/protection/queries';

export * from './adapters/gregorian-date';
export {inspectProtectionFunction,evaluateProtectionValue,type ProtectionFunctionResult} from './extensions/security/protection/functions';
export {inspectSecurityDisclosureV2,encodeSecurityDisclosureV2,decodeSecurityDisclosureV2} from './extensions/security/protection/disclosure';
export type {SecurityDisclosureBatchV2,SecurityDisclosureColumnV2,SecurityDisclosureCellV2,SecurityDisclosureInspectionV2} from './extensions/security/protection/disclosure';

export {inspectSecurityActionPurposes,type SecurityActionPurposeInspection} from './extensions/security/action-purposes';
export type {SecurityActionPurpose,SecurityActionPurposeDeclaration} from './extensions/security/action-purpose-declarations';
export {inspectProtectionObligations,type ProtectionDeclarationInspection,type ProtectionDeclarationObligation,type ProtectionDeclarationObligationKind} from './extensions/security/protection/obligations';

export {inspectActionPlan,assessActionPlan,prepareActionPlanModel} from './extensions/actions/plans';
export type {BulkJobStatus,BulkClaim,BulkJobState,BulkReconcileEvidence,BulkEvent,BulkTransitionResult,BulkDecisionInput,BulkDecision} from './extensions/actions/bulk-state';
export type {ActionPlanArtifact,ActionPlanModelPin,PortableActionPin,PortableActionPlan,ActionPlanDiagnostic,ActionPlanSelectionInspector,ActionPlanInspectionContext,ActionPlanInspection,ActionPlanCapability,ActionPlanCapabilities,ActionPlanAssessment,PreparedActionPlanModel} from './extensions/actions/plan-types';

export {inspectActionManifest,assessActionManifest} from './extensions/actions/manifests';
export type {ActionManifest,ActionManifestInspection} from './extensions/actions/manifest-types';

export {validateBulkOutcome} from './extensions/actions/bulk';
export type {BulkOutcomeValidation} from './extensions/actions/bulk';

export {constructActionManifest} from './extensions/actions/manifest-construction';
export type {SelectedActionRow,ActionManifestConstruction,ConstructedActionManifest} from './extensions/actions/manifest-construction';

export type {PreparedActionIdentities} from './extensions/actions/selector';
export * from './adapters/access-temporal';
export { RAW_TABLE_BINDING_SUBSET, rawTableBindingProfiles } from './extensions/binding/raw-profiles';
export type { RawTableBindingTarget } from './extensions/binding/raw-profiles';
export * from './model/bit128';
export * from './model/uuid';
export {default as coreBit128KeyTupleSchema} from '../spec/core/key-tuple-operation-v4.schema.json';
export * from './model/scalar-type';
export * from './model/record-members';
export * from './model/reference-links';
export * from './projections/bit128';
export * from './model/bit128-field';
export {default as coreKindOperationV8Schema} from '../spec/core/kind-operation-v8.schema.json';
export {default as coreNullabilityOperationV7Schema} from '../spec/core/nullability-operation-v7.schema.json';
export {default as coreCardinalityOperationV6Schema} from '../spec/core/cardinality-operation-v6.schema.json';
export {default as coreFacetOperationV5Schema} from '../spec/core/facet-operation-v5.schema.json';
export {default as coreKeyOperationV4Schema} from '../spec/core/key-operation-v4.schema.json';
export {default as coreRelationshipOperationV3Schema} from '../spec/core/relationship-operation-v3.schema.json';
export {default as coreBit128SelectionSchema} from '../spec/core/bit128-selection.schema.json';
export {default as coreBit128RelationshipSelectionSchema} from '../spec/core/relationship-metadata-selection-v2.schema.json';
export {projectBit128Model,recoverBit128ModelProjection,type Bit128ModelProjection} from './projections/bit128-model';
export * from './extensions/binding/bit128-record';
export * from './projections/bit128-file-values';
export {default as bit128ModelProjectionSchema} from '../spec/projections/bit128-model.schema.json';

export {validateBit128Dataset,type Bit128DatasetRecord} from './extensions/binding/model-dataset';
export type {ModelLiteral} from './extensions/binding/model-shape-values';

export {prepareCoreInspection} from './model/prepared-inspection';

// Core0.10 semantic reference metadata; term validators remain caller-installed.
export * from './extensions/semantic-types';
export * from './model/semantic-types';
export {default as coreSemanticTypeReferenceSchema} from '../spec/core/semantic-type-reference.schema.json';
export {default as coreSemanticTypesOperationSchema} from '../spec/core/semantic-types-operation.schema.json';
export {generatePythonClient,type PythonClientRequest,type PythonClientResult} from './access';

// Explicit native table declaration inspection; no native deployment authority.
export {TABLES_EXTENSION,tableLifecyclePackage,tableLifecycleRegistry,inspectTableLifecycle} from './extensions/tables';
export type {TableLifecycleInspection} from './extensions/tables';
export type {TableRef,TableKeyRef,TableNativeType,TableDefault,TableColumn,TableExpression,TableRelationshipRef,TableRelationshipStep,TableRowRule,TableCommand,TableCommandRules,TablePolicy,TableIndex,TableCheck,TableForeignKey,TableDeclaration,TableFieldValue,TableSeedRow,TableSeedSet,TableLifecyclePayload,TableOperationValue,TableOperationPredicate,TableOperationAssignment,TableOperationBody,TableOperationV1,RowExpression,RowExpressionLiteralValue,RowExpressionPredicate,RowExpressionAssignment,RowExpressionOperation,TableOperation} from './extensions/tables/types';
// Inert initial deployment compilation; hosts retain native admission authority.
export {compileTableDeployment,verifyTableDeployment} from './table-deployment';
export type {TableDeploymentConfiguration,TableDeploymentBundle,TableDeploymentResult,TableDeploymentStep} from './table-deployment';
// Inert source-bound forward plans; no ledger or execution authority.
export * from './table-migration';

// Portable table lifecycle row_scope authoring; emitted policies remain subject to lifecycle admission.
export * from './table-authoring/row-scope';

export * from './extensions/actions/saga';
export {createSagaResources} from './extensions/actions/saga-resources';

export type {TypeSpecCompilerReport,TypeSpecGraphReport,TypeSpecJsonSchemaEmission} from './adapters/typespec/report-types';
export type {NativeFieldClassification,FieldClassificationInspection,AuthoredFieldProjection,FieldProjectionInspection,AuthoredRecordProjection,RecordProjectionInspection,NativeStructuredClassification,StructuredClassificationInspection} from './core-ideals/report-types';
export {default as fieldProjectionInspectionSchema} from '../spec/core/field-projection-inspection.schema.json';
export {default as recordProjectionInspectionSchema} from '../spec/core/record-projection-inspection.schema.json';
export {default as fieldClassificationInspectionSchema} from '../spec/core/field-classification-inspection.schema.json';
export {default as structuredClassificationInspectionSchema} from '../spec/core/structured-classification-inspection.schema.json';

export * from './adapters/lakeview';
