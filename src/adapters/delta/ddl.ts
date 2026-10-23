// SPDX-License-Identifier: MIT OR Apache-2.0
import {CURRENT_CORE_VERSION} from '../../generated/core-model';
import manifest from '../../../spec/extensions/delta-definition/package.json';
import {deltaRegistry, exportDeltaSchema, importDeltaSchema} from './index';
import {validateDocument} from '../../validation/document';
import {copyJson} from '../../model/json';
import {UmfError, type Document, type ExtensionPackage, type Json} from '../../model/types';
import {hashCanonical,sha256Text} from '../../compilation/bundle/hash';

export const DELTA_DEFINITION_EXTENSION='umf.delta.definition';
export const deltaDefinitionPackage=manifest as unknown as ExtensionPackage;
export interface DeltaDefinition {
  profile:'databricks-managed-delta/0.1';
  name:string[];
  clusterBy:string[];
  partitionBy:string[];
  properties:Record<string,string>;
}
export interface SparkDelta4Disposition {
  sourcePointer:string;
  authoredValue:Json;
  outcome:'sql'|'writer-setting'|'unrealized-performance-hint'|'none-authored';
  explanation:string;
}
export interface SparkDelta4DDLRealization {
  targetProfile:'spark-delta4/0.1';
  realizationProfile:'umf.delta.spark-realization/0.1.0';
  target:{profile:'spark-delta4/0.1';kind:'relation';relation:string[];location:string;identitySha256:string}
    | {profile:'spark-delta4/0.1';kind:'delta-path';path:string;identitySha256:string};
  sql:string;
  definition:DeltaDefinition;
  schemaJson:string;
  sourceSha256:string;
  schemaSha256:string;
  writerSettings:{key:string;value:string}[];
  dispositions:SparkDelta4Disposition[];
  qualification:string;
}
const fail=(message:string):never=>{throw new UmfError('DELTA_DDL_UNSUPPORTED',message);};
const identifier=(s:string)=>{
  // Conservative portable subset: no SQL expression, interpolation or session escaping.
  if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(s))fail('Unsupported identifier: '+s);
  return '`'+s+'`';
};
const exact=(value:object,keys:string[])=>{if(Object.keys(value).some(k=>!keys.includes(k)))fail('Unknown content must remain in UMF; generation would discard it');};
const columnComment=(metadata:object):string=>{
  exact(metadata,['comment']);
  if(!Object.hasOwn(metadata,'comment'))return '';
  const value=(metadata as Record<string,unknown>).comment;
  if(typeof value!=='string'||/[\u0000-\u001f\u007f$]/.test(value))fail('Comment requires text without controls or client macro substitution');
  // Databricks regular literals: escape backslashes before single quotes.
  return " COMMENT '"+(value as string).replaceAll('\\','\\\\').replaceAll("'","\\'")+"'";
};
const types:Record<string,string>={string:'STRING',long:'BIGINT',integer:'INT',short:'SMALLINT',byte:'TINYINT',float:'FLOAT',double:'DOUBLE',boolean:'BOOLEAN',binary:'BINARY',date:'DATE',timestamp:'TIMESTAMP',timestamp_ntz:'TIMESTAMP_NTZ'};
const ddlType=(type:unknown,inCollection=false):string=>{
  if(typeof type==='object'&&type!==null&&!Array.isArray(type)){
    const node=type as Record<string,any>;
    if(node.type==='struct'){
      exact(node,['type','fields']);
      if(!Array.isArray(node.fields)||!node.fields.length)fail('Nonempty nested struct required');
      const names=new Set<string>();
      return 'STRUCT<'+node.fields.map((field:Record<string,any>)=>{
        exact(field,['name','type','nullable','metadata']);
        const name=identifier(field.name),normalized=field.name.toLowerCase();
        if(names.has(normalized))fail('Duplicate nested column');names.add(normalized);
        const comment=columnComment(field.metadata);
        if(inCollection&&!field.nullable)fail('Required fields inside collections cannot be preserved by this DDL profile');
        return name+': '+ddlType(field.type,inCollection)+(field.nullable?'':' NOT NULL')+comment;
      }).join(', ')+ '>';
    }
    if(node.type==='array'){
      exact(node,['type','elementType','containsNull']);
      if(node.containsNull!==true)fail('Nonnullable array elements cannot be preserved by SQL type syntax');
      return 'ARRAY<'+ddlType(node.elementType,true)+'>';
    }
    if(node.type==='map'){
      exact(node,['type','keyType','valueType','valueContainsNull']);
      if(node.valueContainsNull!==true)fail('Map value nullability must be explicitly true');
      if(typeof node.keyType!=='string')fail('This profile supports atomic map keys only');
      return 'MAP<'+ddlType(node.keyType,true)+', '+ddlType(node.valueType,true)+'>';
    }
    return fail('Object type has no supported DDL mapping');
  }
  if(typeof type!=='string')return fail('Type has no supported DDL mapping');
  if(Object.hasOwn(types,type))return types[type]!;
  const decimal=/^decimal\(([1-9][0-9]?),([0-9]|[1-9][0-9])\)$/.exec(type);
  if(decimal&&Number(decimal[1])<=38&&Number(decimal[2])<=Number(decimal[1]))
    return 'DECIMAL('+decimal[1]+','+decimal[2]+')';
  return fail('Type has no supported DDL mapping');
};
const properties=new Set(['delta.dataSkippingStatsColumns','delta.targetFileSize','delta.parquet.compression.codec','delta.deletedFileRetentionDuration','delta.logRetentionDuration']);

/** Author a definition using the existing exact Delta schema profile. No native UUID is invented. */
export function defineDeltaTable(schemaText:string,definition:DeltaDefinition,options:{id:string}):Document {
  const doc=importDeltaSchema(schemaText,options);
  doc.vocabularies[DELTA_DEFINITION_EXTENSION]={version:'0.1.0'};
  doc.extensions={[DELTA_DEFINITION_EXTENSION]:copyJson(definition) as unknown as Json};
  generateDeltaDDL(doc);
  return doc;
}

/** Pure browser-compatible CREATE generator. Never applies SQL or changes maintenance policy. */
function generateDeltaDDLForProfile(input:Document, sparkDelta4=false, localTarget?:SparkDelta4TargetBinding):{sql:string;definition:DeltaDefinition;schemaJson:string;qualification:string} {
  const document=copyJson(input) as unknown as Document;
  const validation=validateDocument(document,deltaRegistry().register(deltaDefinitionPackage));
  if(!validation.valid)throw new UmfError('DELTA_DDL_INVALID',JSON.stringify(validation.diagnostics));
  exact(document,['umf','id','vocabularies','modules','extensions']);
  if(document.umf!==CURRENT_CORE_VERSION)fail('This definition profile requires core 0.1.0');
  exact(document.vocabularies,['umf.delta',DELTA_DEFINITION_EXTENSION]);
  for(const declaration of Object.values(document.vocabularies))exact(declaration,['version']);
  if(document.vocabularies[DELTA_DEFINITION_EXTENSION]?.version!=='0.1.0')fail('Missing or unknown definition version');
  exact(document.extensions??{},[DELTA_DEFINITION_EXTENSION]);
  if(document.modules.length!==1)fail('One schema module required');
  const module=document.modules[0]!;
  exact(module,['id','namespace','elements']);
  if(module.id!=='schema'||module.namespace!==''||module.elements.length!==1)fail('Unexpected schema module');
  const element=module.elements[0]!;
  exact(element,['id','extensions']);
  if(element.id!=='schema')fail('Unexpected schema element');
  exact(element.extensions,['umf.delta']);
  const definition=document.extensions?.[DELTA_DEFINITION_EXTENSION] as unknown as DeltaDefinition;
  if(!definition)fail('Missing definition');
  exact(definition,['profile','name','clusterBy','partitionBy','properties']);
  if(definition.clusterBy.length&&definition.partitionBy.length)fail('Liquid clustering and partitioning cannot coexist');
  if(definition.clusterBy.length>4)fail('At most four clustering columns supported');
  const schemaJson=exportDeltaSchema(document),schema=JSON.parse(schemaJson);
  exact(schema,['type','fields']);
  if(schema.type!=='struct'||!schema.fields.length)fail('Nonempty struct required');
  const names=new Set<string>();
  const columns=schema.fields.map((field:{name:string;type:unknown;nullable:boolean;metadata:object})=>{
    exact(field,['name','type','nullable','metadata']);
    const name=identifier(field.name),normalized=field.name.toLowerCase();
    if(names.has(normalized))fail('Duplicate column');names.add(normalized);
    const comment=columnComment(field.metadata);
    return '  '+name+' '+ddlType(field.type)+(field.nullable?'':' NOT NULL')+comment;
  });
  for(const list of [definition.clusterBy,definition.partitionBy]){
    if(new Set(list.map(n=>n.toLowerCase())).size!==list.length)fail('Duplicate layout column');
    for(const name of list){
      if(!names.has(name.toLowerCase()))fail('Layout column absent from schema');
      const field=schema.fields.find((f:{name:string})=>f.name.toLowerCase()===name.toLowerCase());
      if(typeof field.type!=='string')fail('Complex layout columns require a separately qualified profile');
    }
  }
  const values=Object.entries(definition.properties).filter(([key])=>!(sparkDelta4&&['delta.parquet.compression.codec','delta.targetFileSize'].includes(key))).map(([key,value])=>{
    if(!properties.has(key)||!/^[A-Za-z0-9_,. -]+$/.test(value))fail('Property has no supported literal interpretation');
    if(key==='delta.dataSkippingStatsColumns')for(const column of value.split(','))if(!names.has(column.toLowerCase()))fail('Statistics column absent from schema');
    if(key==='delta.targetFileSize'&&!/^[1-9][0-9]{0,15}$/.test(value))fail('Invalid file target');
    if(key==='delta.parquet.compression.codec'&&!['zstd','snappy','gzip','uncompressed','lz4','brotli','lzo'].includes(value.toLowerCase()))fail('Unknown codec');
    if(['delta.deletedFileRetentionDuration','delta.logRetentionDuration'].includes(key)&&!/^interval [1-9][0-9]{0,8} (seconds|minutes|hours|days|weeks)$/.test(value))fail('Unsupported retention interval');
    return "'"+key+"'='"+value+"'";
  });
  const relation=localTarget?.kind==='relation'?localTarget.relation.map(identifier):definition.name.map(identifier);
  let sql='CREATE TABLE '+(localTarget?.kind==='delta-path'?'delta.'+localDeltaPath(localTarget.path):relation.join('.'))+' (\n'+columns.join(',\n')+'\n) USING DELTA';
  if(definition.clusterBy.length)sql+=' CLUSTER BY ('+definition.clusterBy.map(identifier).join(', ')+')';
  if(definition.partitionBy.length)sql+=' PARTITIONED BY ('+definition.partitionBy.map(identifier).join(', ')+')';
  if(localTarget&&localTarget.kind==='relation')sql+=' LOCATION '+localLocation(localTarget.location);
  if(values.length)sql+='\nTBLPROPERTIES ('+values.join(',\n')+')';
  return {sql:sql+';\n',definition,schemaJson,qualification:'Proposed managed Databricks Delta CREATE; no application, migration, protocol/permission/retention admission, predictive optimization change or relationship enforcement. Native target acceptance requires separate evidence.'};
}

/** Pure managed Databricks Delta CREATE generator. Never applies SQL or changes maintenance policy. */
export function generateDeltaDDL(input:Document):{sql:string;definition:DeltaDefinition;schemaJson:string;qualification:string} {
  return generateDeltaDDLForProfile(input);
}

export type SparkDelta4TargetBinding = {
  /** Existing local relation plus path; useful where a stable catalog relation is available. */
  kind:'relation';
  relation:readonly string[];
  location:string;
} | {
  /** Direct Delta path relation avoids creating a metastore binding for local installations. */
  kind:'delta-path';
  path:string;
}

function localLocation(path:string):string {
  if(typeof path!=='string'||!path.startsWith('/')||path==='/'||path.includes('//')||path.endsWith('/')||/[\u0000-\u001f\u007f]/.test(path))
    fail('target.location must be an absolute local POSIX path without controls, schemes, or noncanonical separators');
  if(path.split('/').slice(1).some(part=>!part||part==='.'||part==='..'))fail('target.location must be a normalized absolute path without dot segments');
  return "'"+path.replaceAll('\\','\\\\').replaceAll("'","\\'")+"'";
}

function localDeltaPath(path:string):string {
  localLocation(path);
  return '`'+path.replaceAll('`','``')+'`';
}

/** Pure local Spark Delta 4 CREATE proposal; no Spark runtime or table is touched. */
export function realizeSparkDelta4DDL(input:Document,target:SparkDelta4TargetBinding):SparkDelta4DDLRealization {
  // Validate the complete original managed source before deriving the local target projection.
  generateDeltaDDLForProfile(input);
  if(!target||!(target.kind==='relation'||target.kind==='delta-path'))fail('target.kind must be a supported local Delta binding');
  if(target.kind==='relation'){
    exact(target,['kind','relation','location']);
    if(!Array.isArray(target.relation)||target.relation.length<1||target.relation.length>3)
      fail('target.relation must have one to three identifier components');
    target.relation.forEach(identifier);
  } else {
    exact(target,['kind','path']);
    localDeltaPath(target.path);
  }
  if(target.kind==='relation')localLocation(target.location);
  const result=generateDeltaDDLForProfile(input,true,target);
  const definition=result.definition;
  const dispositions:SparkDelta4Disposition[]=[];
  const layout=(key:'clusterBy'|'partitionBy',value:string[],explanation:string)=>dispositions.push({
    sourcePointer:'/extensions/umf.delta.definition/'+key,
    authoredValue:copyJson(value) as unknown as Json,
    outcome:value.length?'sql':'none-authored',
    explanation:value.length?explanation:'No columns were authored for this layout choice.'
  });
  layout('clusterBy',definition.clusterBy,'Authored order is emitted as local Delta CLUSTER BY SQL.');
  layout('partitionBy',definition.partitionBy,'Authored order is emitted as local Delta PARTITIONED BY SQL.');
  const properties=Object.entries(definition.properties).sort(([a],[b])=>a<b?-1:a>b?1:0);
  if(!properties.length)dispositions.push({sourcePointer:'/extensions/umf.delta.definition/properties',authoredValue:{},outcome:'none-authored',explanation:'No table properties were authored.'});
  const writerSettings:{key:string;value:string}[]=[];
  for(const [key,value] of properties){
    if(key==='delta.targetFileSize'){
      dispositions.push({sourcePointer:'/extensions/umf.delta.definition/properties/'+key,authoredValue:value,outcome:'unrealized-performance-hint',explanation:'Retained the exact authored byte-size target; local Delta 4 realization does not apply or guarantee this file size.'});
    }else if(key==='delta.parquet.compression.codec'){
      if(value.toLowerCase()!=='zstd')fail('Spark Delta 4 writer mapping is not qualified for codec at /extensions/umf.delta.definition/properties/'+key);
      writerSettings.push({key:'spark.sql.parquet.compression.codec',value:'zstd'});
      dispositions.push({sourcePointer:'/extensions/umf.delta.definition/properties/'+key,authoredValue:value,outcome:'writer-setting',explanation:'Translated to required Spark writer setting spark.sql.parquet.compression.codec=zstd; this proposal does not execute the setting.'});
    }else{
      dispositions.push({sourcePointer:'/extensions/umf.delta.definition/properties/'+key,authoredValue:value,outcome:'sql',explanation:'Authored property is preserved in local Delta table property SQL.'});
    }
  }
  const document=copyJson(input) as unknown as Document;
  const identity=target.kind==='delta-path'
    ? {profile:'spark-delta4/0.1' as const,kind:'delta-path' as const,path:target.path}
    : {profile:'spark-delta4/0.1' as const,kind:'relation' as const,relation:[...target.relation],location:target.location};
  return {
    targetProfile:'spark-delta4/0.1',
    realizationProfile:'umf.delta.spark-realization/0.1.0',
    target:{...identity,identitySha256:hashCanonical(identity)},
    sql:result.sql,
    definition:copyJson(definition) as unknown as DeltaDefinition,
    schemaJson:result.schemaJson,
    sourceSha256:hashCanonical(document),
    schemaSha256:sha256Text(result.schemaJson),
    writerSettings,
    dispositions,
    qualification:'Pure local Spark Delta 4 DDL/config proposal only; no Spark execution, Delta protocol admission, clustering/statistics effectiveness, target-file-size realization, UC behavior or managed Databricks behavior is established.'
  };
}

/** Complete ordered proposal; no partial bundle escapes a failed table export. */
export function generateDeltaDDLBundle(inputs:readonly Document[]):{
  sql:string;
  tables:{documentId:string;sql:string;definition:DeltaDefinition;schemaJson:string;qualification:string}[];
  qualification:string;
} {
  if(!Array.isArray(inputs)||inputs.length===0)fail('Nonempty table document bundle required');
  const ids=new Set<string>(),names=new Set<string>();
  const tables=inputs.map(input=>{
    const result=generateDeltaDDL(input);
    if(result.definition.name.length!==3)fail('Bundle tables require explicit catalog, schema and table names');
    const name=result.definition.name.map(part=>part.toLowerCase()).join('.');
    if(names.has(name))fail('Duplicate qualified table name in bundle');
    if(ids.has(input.id))fail('Duplicate document identity in bundle');
    names.add(name);ids.add(input.id);
    return {documentId:input.id,...result};
  });
  return {sql:tables.map(table=>table.sql).join('\n'),tables,
    qualification:'Complete ordered managed Delta CREATE proposal; generation is all-or-nothing, database application is not atomic. No application, migration, dependency ordering, relationship enforcement or native admission.'};
}
