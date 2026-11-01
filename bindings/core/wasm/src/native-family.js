// SPDX-License-Identifier: MIT OR Apache-2.0
import {encodeRequestWire,fromWire,resultError} from './wire.js';

export const NATIVE_FAMILY_PROFILE='umf.native-family-dispatch/1';

const FAMILIES=Object.freeze({
 avro:{profile:'umf.avro-wire/1',operations:['import','inspect','inspectPayload','fields','export','exportBundle','getNode','editNode','proposeNodeEdit']},
 'avro-json-schema-projection':{profile:'umf.avro-json-schema-projection-wire/1',operations:['projectAvroToJsonSchema']},
 'ddd-json-schema-projection':{profile:'umf.ddd-json-schema-projection-wire/1',operations:['projectDddToJsonSchema','dddFieldBinding','inspectDdd','validateDddPayload','getDddDefinition','editDddDefinition']},
 openapi:{profile:'umf.openapi-wire/1',operations:['import','validate','inspectPayload','export','exportBundle','getNode','lookupResource','extractSchema','indexSchemas','resolveSchemaReference','resolveDynamicReference','resolveObjectReference','edit']},
 linkml:{profile:'umf.native-contract-wire/1',operations:['import','inspect','inspectPayload','export','getNode','editNode','classSlots','slotValues','importContext','importMerge']},
 odcs:{profile:'umf.native-contract-wire/1',operations:['import','inspect','inspectPayload','export','getNode','editNode','resolveReference','relationships','renameElement']},
 tablespec:{profile:'umf.tablespec-wire/1',operations:['importTableSpec','inspectTableSpec','exportTableSpec','getTableSpecTable','getTableSpecColumn','editTableSpecTable','editTableSpecColumn','importTableSpecBundle','exportTableSpecBundle']},
 jsonld:{profile:'umf.jsonld-wire/1',operations:['import','inspectPayload','validate','export','getNode','editNode','expand','flatten','compact','toRdf','fromRdf','fromGeneralizedRdf','frame']},
 sqlserver:{profile:'umf.sqlserver-wire/1',operations:['import','inspect','inspectPayload','export','columns','constraints','indexes','edit','facetType','facetPredicate','facetConstraints']},
 shacl:{profile:'umf.shacl-wire/1',operations:['import','inspect','inspectPayload','export','getQuads','editQuad','getPropertyPath','evaluatePropertyPath','getTargetNodes','getShapeMetadata','validate']},
 owl:{profile:'umf.owl-wire/1',operations:['import','inspect','inspectPayload','export','getQuads','editQuad','getOntologyHeaders','getExpressionView','getListAxioms','getSpecialAxioms','getAxiomAnnotations','getDeclarations']},
 'iceberg-table':{profile:'umf.iceberg-table-wire/1',operations:['import','inspect','inspectPayload','export','getNode','editNode','inspectContext','inspectTransforms','inspectTransformType','proposeRename','proposePromotion']},
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
  request.op=family==='tablespec'?operation:family==='iceberg-table'?`iceberg.table.${operation}`:family==='delta-schema'?`delta/schema.${operation}`:family==='delta-table'?`delta/table.${operation}`:family==='delta-log'?`delta/log.${operation}`:family==='delta-ddl'?`delta.ddl.${operation}`:family==='delta-parquet'?`delta.parquet.${operation}`:`${family}.${operation}`;
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
