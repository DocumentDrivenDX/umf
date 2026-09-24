export * from './model/types';
export * from './model/nullability-transition';
export * from './model/nullability';
export * from './adapters/tablespec';
export * from './adapters/sqlserver';
export * from './projections/sqlserver-avro';
export * from './projections/sqlserver-ddl';
export * from './projections/tablespec-avro';
export * from './projections/avro-tablespec';
export * from './projections/tablespec-via-avro';
export * from './projections/postgresql-avro';
export * from './projections/parquet-avro';
export * from './model/json';
export * from './model/serialization';
export * from './model/document';
export * from './model/selection';
export * from './registry/registry';
export * from './validation/document';
export { default as coreSchema } from '../spec/core/schema.json';
export { default as coreNullabilitySchema } from '../spec/core/nullability-document.schema.json';
export { default as extensionPackageSchema } from '../spec/core/extension-package.schema.json';
export * from './adapters/json-schema';
export * from './adapters/protobuf';
export * from './projections/json-schema-protobuf';
export { default as jsonSchemaProtobufProjectionSchema } from '../spec/projections/json-schema-protobuf.schema.json';
export * from './extensions/ddd';
export * from './extensions/binding';
export * from './projections/binding-parquet';
export * from './projections/binding-delta';
export * from './projections/binding-iceberg';
export * from './projections/binding-postgresql/indexes';
export * from './projections/binding-sqlserver/indexes';
export * from './projections/binding-sqlserver/tables';
export * from './projections/binding-sqlserver/tables-indexes';
export * from './projections/ddd-postgresql/tables';
export * from './projections/ddd-postgresql/tables-indexes';
export * from './projections/ddd-graphql/entities';
export * from './projections/ddd-json-schema';
export { default as dddJsonSchemaProjectionSchema } from '../spec/projections/ddd-json-schema.schema.json';
export * from './adapters/avro';
export * from './adapters/parquet/arrow-schema';
export * from './adapters/parquet/arrow-rename';

export * from './projections/avro-json-schema';
export { default as avroJsonSchemaProjectionSchema } from '../spec/projections/avro-json-schema.schema.json';
export * from './adapters/graphql';
export * from './projections/graphql-input-json-schema';
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
export * from './projections/openapi-json-schema';
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
export * from './projections/typespec-json-schema';
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
export * from './projections/smithy-json-schema';
export {default as smithyJsonSchemaProjectionSchema} from '../spec/projections/smithy-json-schema.schema.json';
export * from './adapters/postgresql';
export * from './adapters/postgresql/declarations';
export {default as postgresqlSchema} from '../spec/extensions/postgresql/schema.json';

export {default as postgresqlNativeAstSchema} from '../spec/extensions/postgresql/native-ast.schema.json';
export * from './adapters/postgresql/catalog';
export {default as postgresqlCatalogSchema} from '../spec/extensions/postgresql-catalog/schema.json';
export {default as postgresqlCatalogCaptureSchema} from '../spec/extensions/postgresql-catalog/capture.schema.json';
export * from './projections/postgresql-json-schema';

export {default as postgresqlRowProjectionSchema} from '../spec/projections/postgresql-row-json-schema.schema.json';
export * from './adapters/arrow';
export {default as arrowSchema} from '../spec/extensions/arrow/schema.json';
export {default as arrowIntegrationSchema} from '../spec/extensions/arrow/integration-schema.json';
export * from './adapters/arrow/ipc';
export * from './adapters/arrow/capture';
export * from './adapters/arrow/flatbuffer-model';
export {default as arrowFlatbufferModelSchema} from '../spec/extensions/arrow/flatbuffer-model.schema.json';
export * from './adapters/arrow/flatbuffer-decode';
export * from './adapters/arrow/flatbuffer-encode';
export * from './adapters/arrow/ipc-layout';
export {default as arrowIpcLayoutSchema} from '../spec/extensions/arrow-ipc/layout-result.schema.json';
export * from './adapters/arrow/ipc-consistency';
export {default as arrowIpcConsistencySchema} from '../spec/extensions/arrow-ipc/consistency-result.schema.json';
export * from './adapters/arrow/ipc-rename';
export {default as arrowIpcRenameSchema} from '../spec/extensions/arrow-ipc/rename-result.schema.json';
export * from './adapters/spark';
export {default as sparkDataTypeSchema} from '../spec/extensions/spark/datatype-schema.json';
export * from './adapters/spark/rename';

export {default as sparkRenameSchema} from '../spec/extensions/spark/rename-result.schema.json';

export * from "./projections/spark-arrow";

export {default as sparkArrowProjectionSchema} from "../spec/projections/spark-arrow.schema.json";

export * from "./projections/arrow-spark";

export {default as arrowSparkProjectionSchema} from "../spec/projections/arrow-spark.schema.json";

export * from "./adapters/delta";
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

export * from "./adapters/shacl";

export * from "./adapters/shacl/engine";

export * from "./adapters/shacl/metadata";

export * from "./adapters/owl";

export * from "./adapters/owl/expressions";

export * from "./adapters/owl/annotations";
export * from "./adapters/owl/axioms";
export * from './adapters/owl/declarations';
export * from './adapters/owl/list-axioms';
export * from './model/field-transition';
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
export * from './model/selection-verification';
export * from './core-ideals/avro-record-type';
export * from './core-ideals/parquet-record-type';
export * from './core-ideals/field-report';
export * from './core-ideals/record-report';
export * from './core-ideals/classification-report';
export * from './core-ideals/structured-report';
export * from './core-ideals/nullability-tablespec';
export * from './core-ideals/nullability-tablespec-projection';

export * from './core-ideals/nullability-postgresql';
export * from './core-ideals/nullability-postgresql-projection';
export * from './core-ideals/nullability-sqlserver';
export * from './core-ideals/nullability-sqlserver-projection';
export * from './core-ideals/nullability-avro';
export * from './core-ideals/nullability-avro-projection';
export * from './core-ideals/nullability-parquet';
export * from './core-ideals/nullability-parquet-projection';

export {default as coreCardinalitySchema} from '../spec/core/cardinality-document.schema.json';
export * from './model/cardinality-transition';
export * from './model/cardinality';

export * from './core-ideals/cardinality-tablespec';
export * from './core-ideals/cardinality-tablespec-projection';
export * from './adapters/postgresql/cardinality-catalog';
export * from './core-ideals/cardinality-postgresql';
export * from './core-ideals/cardinality-postgresql-projection';
export * from './core-ideals/cardinality-sqlserver';
export * from './core-ideals/cardinality-sqlserver-projection';

export * from './core-ideals/cardinality-avro';
export * from './core-ideals/cardinality-parquet';
export * from './core-ideals/cardinality-parquet-projection';
export * from './core-ideals/cardinality-avro-projection';

export {default as coreFacetSchema} from '../spec/core/facet-document.schema.json';
export * from './model/facet-transition';
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
export * from './model/key-transition';
export * from './model/key-tuple';
export type {CoreKeyDefinition,CoreKeyFieldReference} from './validation/keys';
export {default as coreKeyDocumentSchema} from '../spec/core/key-document.schema.json';
export {default as coreKeyOperationSchema} from '../spec/core/key-operation.schema.json';
export {default as coreKeyTransitionSchema} from '../spec/core/key-transition.schema.json';
export {default as coreKeyTupleOperationSchema} from '../spec/core/key-tuple-operation.schema.json';

export * from './core-ideals/key-tablespec';

export * from './core-ideals/key-tablespec-projection';

export * from './adapters/postgresql/key-catalog';
export * from './adapters/postgresql/key-correlation';

export * from './core-ideals/key-postgresql';
export * from './core-ideals/key-postgresql-projection';
export * from './core-ideals/key-sqlserver';
export * from './core-ideals/key-sqlserver-projection';
export * from './core-ideals/key-avro';
export * from './core-ideals/key-avro-projection';
export * from './core-ideals/key-parquet';
export * from './core-ideals/key-parquet-projection';

export {validateRelationshipCandidate} from './validation/relationships';
export type {RelationshipCandidate,CoreRelationship,RelationshipEndpoint,RelationshipTarget,RelationshipMultiplicity} from './validation/relationships';
export {declareCoreRelationship,inspectCoreRelationships,lookupCoreRelationship,verifyCoreRelationshipOperation} from './model/relationships';
export type {CoreRelationshipRequest,CoreRelationshipIdentity,RelationshipModuleIdentity,CoreRelationshipOperation,CoreRelationshipDeclaration,CoreRelationshipInspection,CoreRelationshipLookup,CoreRelationshipMeaning} from './model/relationships';
export {upgradeRelationshipEnvelope,rollbackRelationshipEnvelope,verifyRelationshipTransition} from './model/relationship-transition';
export type {RelationshipUpgradeReceipt,RelationshipRollbackReceipt} from './model/relationship-transition';
export {default as coreRelationshipDocumentSchema} from '../spec/core/relationship-document.schema.json';
export {default as coreRelationshipOperationSchema} from '../spec/core/relationship-operation.schema.json';
export {default as coreRelationshipTransitionSchema} from '../spec/core/relationship-transition.schema.json';
export {default as coreKeyOperationV2Schema} from '../spec/core/key-operation-v2.schema.json';
export {default as coreKeyTupleOperationV2Schema} from '../spec/core/key-tuple-operation-v2.schema.json';
