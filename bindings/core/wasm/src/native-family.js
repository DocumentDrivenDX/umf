// SPDX-License-Identifier: MIT OR Apache-2.0
import {encodeRequestWire,fromWire,resultError} from './wire.js';

export const NATIVE_FAMILY_PROFILE='umf.native-family-dispatch/1';

const FAMILIES=Object.freeze({
 'medical-projection':{profile:'umf.medical-projection-binding/1.0.0',operations:['projectMedicalFhir','projectCdcMortality','projectDicomMetadata','lookupMedicalTerminology']},
 'relationship-extra-projection':{profile:'umf.relationship-extra-projection-binding/1.0.0',operations:['prepareRelationshipToExtra','completeRelationshipToExtra','classifyRelationshipExtra','verifyRelationshipExtra','recoverRelationshipExtraIdeal','recoverRelationshipExtraNative']},
 'cardinality-sqlserver-projection':{profile:'umf.cardinality-sqlserver-projection-binding/1.0.0',operations:['projectCardinalityToSqlServer','recoverCardinalityFromSqlServer']},
 'field-record-sqlserver-projection':{profile:'umf.field-record-sqlserver-projection-binding/1.0.0',operations:['projectFieldToSqlServer','recoverFieldFromSqlServer','projectRecordToSqlServer','recoverRecordFromSqlServer']},
 'relationship-parquet-projection':{profile:'umf.relationship-parquet-projection-binding/1.0.0',operations:['projectRelationshipToParquet','verifyRelationshipParquetProjection','recoverRelationshipParquetIdeal','recoverRelationshipParquetNative']},
 'avro-cardinality':{profile:'umf.avro-cardinality-binding/1.0.0',operations:['classifyAvroCardinality','verifyAvroCardinalityClassification','recoverAvroCardinalityBundle']},
 'avro-classification':{profile:'umf.avro-classification-binding/1.0.0',operations:['classifyAvroField','recoverAvroFieldBundle','classifyAvroRecord','recoverAvroRecordBundle','classifyAvroKeys','verifyAvroKeyClassification','recoverAvroKeySource','classifyAvroRelationships','verifyAvroRelationshipClassification','recoverAvroRelationshipSource','classifyAvroNullability','verifyAvroNullabilityClassification','recoverAvroNullabilityBundle','classifyAvroFacets','verifyAvroFacetClassification','recoverAvroFacetSource']},
 'record-type':{profile:'umf.record-type-binding/1.0.0',operations:['classifyAvroRecordType','recoverAvroRecordTypeBundle','classifyParquetRecordType','recoverParquetRecordTypeBytes','classifyParquetRecord','recoverParquetRecordBytes','classifyParquetRelationships','verifyParquetRelationshipClassification','recoverParquetRelationshipSource','classifyParquetNullability','verifyParquetNullabilityClassification','recoverParquetNullabilityBytes','classifyParquetField','verifyParquetFieldClassification','recoverParquetFieldBytes','classifyParquetKeys','verifyParquetKeyClassification','recoverParquetKeySource','classifyParquetCardinality','verifyParquetCardinalityClassification','recoverParquetCardinalityBytes' ,'classifyParquetFacets','verifyParquetFacetClassification','recoverParquetFacetSource']},
 'nullability-avro-projection':{profile:'umf.nullability-avro-projection-binding/1.0.0',operations:['projectNullabilityToAvro','recoverNullabilityFromAvro']},
 'nullability-sqlserver-projection':{profile:'umf.nullability-sqlserver-projection-binding/1.0.0',operations:['projectNullabilityToSqlServer','recoverNullabilityFromSqlServer']},
 'facets-avro-projection':{profile:'umf.facets-avro-projection-binding/1.0.0',operations:['projectFacetsToAvro','recoverFacetsFromAvro']},
 'facets-sqlserver-projection':{profile:'umf.facets-sqlserver-projection-binding/1.0.0',operations:['projectFacetsToSqlServer','recoverFacetsFromSqlServer']},
 'key-avro-projection':{profile:'umf.key-avro-projection-binding/1.0.0',operations:['projectKeysToAvro','verifyKeysAvroProjection','recoverKeysAvroIdeal']},
 'key-sqlserver-projection':{profile:'umf.key-sqlserver-projection-binding/1.0.0',operations:['projectKeysToSqlServer','verifyKeysSqlServerProjection','recoverKeysSqlServerIdeal']},
 'avro-relationship-projection':{profile:'umf.relationship-avro-projection-binding/1.0.0',operations:['projectRelationshipToAvro','verifyRelationshipAvroProjection','recoverRelationshipAvroIdeal','recoverRelationshipAvroNative']},
 'relationship-sqlserver-projection':{profile:'umf.relationship-sqlserver-projection-binding/1.0.0',operations:['projectRelationshipToSqlServer','verifyRelationshipSqlServerProjection','recoverRelationshipSqlServerIdeal','recoverRelationshipSqlServerBinding','recoverRelationshipSqlServerNative']},
 'relationship-postgresql-projection':{profile:'umf.relationship-postgresql-projection-binding/1.0.0',operations:['prepareProjectRelationshipsToPostgresql','completeProjectRelationshipsToPostgresql','blockProjectRelationshipsToPostgresql','verifyRelationshipsPostgresqlProjection','recoverRelationshipsPostgresqlIdeal','recoverRelationshipsPostgresqlNative']},
 'tablespec-relationship-projection':{profile:'umf.relationship-tablespec-projection-binding/1.0.0',operations:['projectRelationshipToTableSpec','verifyRelationshipTableSpecProjection','recoverRelationshipTableSpecIdeal','recoverRelationshipTableSpecNativeSources']},
 'tablespec-via-avro-projection':{profile:'umf.tablespec-via-avro-projection-wire/1',operations:['projectToTableSpecViaAvro']},
 'parquet-avro-projection':{profile:'umf.parquet-avro-projection-wire/1',operations:['projectParquetToAvro']},
 avro:{profile:'umf.avro-wire/1',operations:['import','inspect','inspectPayload','fields','export','exportBundle','getNode','editNode','proposeNodeEdit']},
 'avro-json-schema-projection':{profile:'umf.avro-json-schema-projection-wire/1',operations:['projectAvroToJsonSchema']},
 'arrow-spark-projection':{profile:'umf.arrow-spark-projection-wire/1',operations:['projectArrowToSpark','projectSparkToArrow']},
 'arrow-flatbuffer-model':{profile:'umf.arrow-flatbuffer-model-wire/1',operations:['importArrowFlatbufferModel','inspectArrowFlatbufferModel','exportArrowFlatbufferModel','proposeArrowFlatbufferEdit','decodeArrowFlatbuffer','prepareArrowFlatbufferEncoding','verifyArrowFlatbufferEncoding']},
 'avro-tablespec-projection':{profile:'umf.avro-tablespec-projection-wire/1',operations:['projectAvroToTableSpec','projectTableSpecToAvro']},
 'postgresql-avro-projection':{profile:'umf.postgresql-avro-projection-wire/1',operations:['projectPostgresqlToAvro']},
 'postgresql-json-schema-projection':{profile:'umf.postgresql-json-schema-projection-wire/1',operations:['projectPostgresqlRowToJsonSchema']},
 'json-schema-protobuf-projection':{profile:'umf.json-schema-protobuf-projection-wire/1',operations:['projectJsonSchemaToProtobuf']},
 'sqlserver-avro-projection':{profile:'umf.sqlserver-avro-projection-wire/1',operations:['projectSqlServerToAvro']},
 'sqlserver-ddl-projection':{profile:'umf.sqlserver-ddl-projection-wire/1',operations:['projectSqlServerToDdl']},
 'binding-sqlserver-planned-index-projection':{profile:'umf.binding-sqlserver-planned-index-projection-wire/1',operations:['projectBindingIndexesAgainstSqlServerPlan']},
 'binding-index-projection':{profile:'umf.binding-index-projection-wire/1',operations:['projectBindingIndexesToSqlServer','prepareBindingIndexesToPostgresql','completeBindingIndexesToPostgresql']},
 'binding-parquet-projection':{profile:'umf.binding-parquet-projection-wire/1',operations:['projectBindingToParquet']},
 'binding-delta-projection':{profile:'umf.binding-delta-projection-wire/1',operations:['projectBindingToDelta']},
 'binding-sqlserver-tables':{profile:'umf.binding-sqlserver-tables-wire/1',operations:['projectBindingTablesToSqlServer','projectBindingTablesAndIndexesFromPlanToSqlServer','projectBindingTablesAndIndexesToSqlServer']},
 'binding-sqlserver-physical':{profile:'umf.binding-sqlserver-physical-wire/1',operations:['projectBindingToSqlServer','verifyBindingSqlServerProjection','recoverBindingSqlServerSources','recoverBindingSqlServerNative']},
 'ddd-json-schema-projection':{profile:'umf.ddd-json-schema-projection-wire/1',operations:['projectDddToJsonSchema','dddFieldBinding','inspectDdd','validateDddPayload','getDddDefinition','editDddDefinition','projectDddEntitiesToGraphql','projectDddToGraphql','verifyDddGraphqlProjection','recoverDddFromGraphql','recoverDddGraphqlNative','validateSqlServerRelationshipLayout','validatePostgresqlRelationshipLayout','prepareDddPostgresqlProjection','completeDddPostgresqlProjection','verifyDddPostgresqlProjection','recoverDddPostgresqlIdeal','recoverDddPostgresqlNative','blockDddPostgresqlProjection','prepareDddPostgresqlTables','completeDddPostgresqlTables','blockDddPostgresqlTables','prepareDddPostgresqlTablesAndIndexes','completeDddPostgresqlTablesAndIndexes','prepareDddPostgresqlTablesAndIndexesCombined']},
 'openapi-json-schema-projection':{profile:'umf.openapi-json-schema-projection-wire/1',operations:['projectOpenapiToJsonSchema']},
 'typespec-smithy-jsonschema-projection':{profile:'umf.typespec-smithy-jsonschema-projection-wire/1',operations:['prepareTypeSpecJsonSchema','completeTypeSpecJsonSchema','prepareSmithyJsonSchema','completeSmithyJsonSchema']},
 openapi:{profile:'umf.openapi-wire/1',operations:['import','validate','inspectPayload','export','exportBundle','getNode','lookupResource','extractSchema','indexSchemas','resolveSchemaReference','resolveDynamicReference','resolveObjectReference','edit']},
 linkml:{profile:'umf.native-contract-wire/1',operations:['import','inspect','inspectPayload','export','getNode','editNode','classSlots','slotValues','importContext','importMerge']},
 odcs:{profile:'umf.native-contract-wire/1',operations:['import','inspect','inspectPayload','export','getNode','editNode','resolveReference','relationships','renameElement']},
 tablespec:{profile:'umf.tablespec-wire/1',operations:['importTableSpec','inspectTableSpec','exportTableSpec','getTableSpecTable','getTableSpecColumn','editTableSpecTable','editTableSpecColumn','importTableSpecBundle','exportTableSpecBundle','classifyTableSpecField','verifyTableSpecFieldClassification','projectFieldToTableSpec','recoverFieldFromTableSpec','classifyTableSpecRecord','verifyTableSpecRecordClassification','projectRecordToTableSpec','recoverRecordFromTableSpec','classifyTableSpecCardinality','verifyTableSpecCardinalityClassification','recoverTableSpecCardinalitySource','classifyTableSpecNullability','verifyTableSpecNullabilityClassification','recoverTableSpecNullabilitySource','classifyTableSpecKeys','verifyTableSpecKeyClassification','recoverTableSpecKeySource','classifyTableSpecFacets','verifyTableSpecFacetClassification','recoverTableSpecFacetSource','classifyTableSpecRelationships','verifyTableSpecRelationshipClassification','recoverTableSpecRelationshipSource']},
 jsonld:{profile:'umf.jsonld-wire/1',operations:['import','inspectPayload','validate','export','getNode','editNode','expand','flatten','compact','toRdf','fromRdf','fromGeneralizedRdf','frame']},
 'postgresql':{profile:'umf.postgresql-catalog-wire/1',operations:['classifyField','verifyFieldClassification','recoverFieldCapture','classifyRecord','verifyRecordClassification','recoverRecordCapture','classifyCardinality','verifyCardinalityClassification','recoverCardinalitySource','classifyNullability','verifyNullabilityClassification','recoverNullabilitySource','prepareKeyParserRequests','classifyKeys','verifyKeyClassification','recoverKeySource','prepareFacetParserRequests','classifyFacets','verifyFacetClassification','recoverFacetSource']},
 sqlserver:{profile:'umf.sqlserver-wire/1',operations:['import','inspect','inspectPayload','export','columns','constraints','indexes','edit','facetType','facetPredicate','facetConstraints','classifyField','verifyFieldClassification','recoverFieldCapture','classifyRecord','verifyRecordClassification','recoverRecordCapture','classifyCardinality','verifyCardinalityClassification','recoverCardinalitySource','classifyNullability','verifyNullabilityClassification','recoverNullabilitySource','classifyKeys','verifyKeyClassification','recoverKeySource','classifyRelationships','verifyRelationshipClassification','recoverRelationshipSource','classifyFacets','verifyFacetClassification','recoverFacetSource']},
 shacl:{profile:'umf.shacl-wire/1',operations:['import','inspect','inspectPayload','export','getQuads','editQuad','getPropertyPath','evaluatePropertyPath','getTargetNodes','getShapeMetadata','validate']},
 owl:{profile:'umf.owl-wire/1',operations:['import','inspect','inspectPayload','export','getQuads','editQuad','getOntologyHeaders','getExpressionView','getListAxioms','getSpecialAxioms','getAxiomAnnotations','getDeclarations']},
 'iceberg-table':{profile:'umf.iceberg-table-wire/1',operations:['import','inspect','inspectPayload','export','getNode','editNode','inspectContext','inspectTransforms','inspectTransformType','proposeRename','proposePromotion']},
 'binding-iceberg-projection':{profile:'umf.binding-iceberg-projection-wire/1',operations:['projectBindingToIceberg']},
 'delta-schema':{profile:'umf-r8-delta-source/0.1.0',operations:['import','inspect','inspectPayload','export','getNode','proposeNodeEdit']},
 'delta-table':{profile:'umf-r8-delta-source/0.1.0',operations:['import','inspect','inspectPayload','export','getNode','getSchema','proposeNodeEdit','renameMappedField']},
 'delta-log':{profile:'umf-r8-delta-log/0.1.0',operations:['capture','export','inspect','inspectActions','reconcileCommits','reconcileCheckpointSidecars']},
 'delta-ddl':{profile:'umf-r8-delta-ddl/0.1.0',operations:['defineTable','generate','generateBundle','realizeSparkDelta4','inspectPayload']},
 'delta-parquet':{profile:'umf-r8-parquet-capture-inspection/0.1.0',operations:['projectActions','reconcileCheckpoint','reconcileMultipart']},
 spark:{profile:'umf.spark-wire/1',operations:['import','inspect','inspectPayload','export','getNode','editNode','renameField']},
});

/** Route a closed adapter family and operation to Rust without reinterpreting its payload. */
export function createNativeFamilyOperations(executeNativeFamilyWire,controlDispatcher,hostWork,nativeError=(failure)=>Object.assign(new Error(failure.message),failure)){
 if(typeof executeNativeFamilyWire!=='function')throw new TypeError('A native family wire executor is required');
 const invoke=(family,operation,fields={})=>{
  const spec=FAMILIES[family];
  if(!spec)throw new TypeError('Unknown native adapter family');
  if(!spec.operations.includes(operation))throw new TypeError('Unknown operation for native adapter family');
  if(fields===null||typeof fields!=='object'||Array.isArray(fields))throw new TypeError('Native adapter arguments must be an object');
  if(Object.prototype.hasOwnProperty.call(fields,'profile')||Object.prototype.hasOwnProperty.call(fields,'op'))throw new TypeError('Native adapter profile and operation are selected by the family facade');
  const request=Object.create(null);
  for(const key of Object.keys(fields)){
   const descriptor=Object.getOwnPropertyDescriptor(fields,key);
   if(!descriptor||!Object.prototype.hasOwnProperty.call(descriptor,'value'))throw new TypeError('Native adapter arguments must be data properties');
   Object.defineProperty(request,key,{value:descriptor.value,enumerable:true,writable:true,configurable:true});
  }
  request.profile=spec.profile;
  request.op=family==='medical-projection'||family==='relationship-extra-projection'||family==='cardinality-sqlserver-projection'||family==='field-record-sqlserver-projection'||family==='avro-cardinality'||family==='avro-classification'||family==='record-type'||family==='nullability-avro-projection'||family==='nullability-sqlserver-projection'||family==='facets-avro-projection'||family==='key-avro-projection'||family==='key-sqlserver-projection'||family==='avro-relationship-projection'||family==='relationship-parquet-projection'||family==='relationship-postgresql-projection'||family==='relationship-sqlserver-projection'||family==='tablespec-relationship-projection'||family==='tablespec'?operation:family==='iceberg-table'?`iceberg.table.${operation}`:family==='delta-schema'?`delta/schema.${operation}`:family==='delta-table'?`delta/table.${operation}`:family==='delta-log'?`delta/log.${operation}`:family==='delta-ddl'?`delta.ddl.${operation}`:family==='delta-parquet'?`delta.parquet.${operation}`:`${family}.${operation}`;
  hostWork?.(1);
  const requestWire=encodeRequestWire(request,hostWork);
  const responseText=executeNativeFamilyWire(family,requestWire,controlDispatcher);
  hostWork?.(responseText.length);
  const response=JSON.parse(responseText),failure=resultError(response);
  if(failure)throw nativeError(failure);
  hostWork?.(response.wire.length);
  return fromWire(JSON.parse(response.wire),hostWork);
 };
 const result={};
 for(const [family,spec] of Object.entries(FAMILIES)){
  const operations={};
  for(const operation of spec.operations)operations[operation]=fields=>invoke(family,operation,fields);
  result[family]=Object.freeze(operations);
 }
 return Object.freeze(result);
}
