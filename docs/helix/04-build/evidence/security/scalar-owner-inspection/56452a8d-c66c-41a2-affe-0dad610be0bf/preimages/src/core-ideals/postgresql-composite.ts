import {copyJson} from '../model/json';
import {UmfError,type Document,type Json,type Diagnostic,type Element} from '../model/types';
import {exportPostgresqlCatalogCapture,getPostgresqlCatalogNode} from '../adapters/postgresql/catalog';
import {parseNativeJson,renderTree} from '../model/native-json';
import {validateDocument} from '../validation/document';
import {createValidator} from '../validation/schema';
import fields from '../../spec/core/field-document.schema.json';
import schema from '../../spec/core/postgresql-composite-classification.schema.json';
export {default as postgresqlCompositeClassificationSchema} from '../../spec/core/postgresql-composite-classification.schema.json';
export interface PostgresqlCompositeRequest {recordModule:string;recordId:string;mode:'strict'|'report';nativeSource:string;relation:{schema:string;name:string}}
const binding={id:'umf.postgresql.catalog.composite',version:'1.0.0',nativeVersion:'17.4',subset:'Captured standalone composite member roles only; formatted attribute type names do not resolve scalar families or nested identities'} as const;
export interface PostgresqlCompositeClassification {
 operation:'classify-postgresql-composite';version:'1.0.0';status:'classified'|'blocked';source:Document;target?:Document;request:PostgresqlCompositeRequest;binding:typeof binding;
 mappings:{origin:'classified';kind:'field'|'record';idealPath:string;nativePath:string;nativeFragment:Json;basis:'checked-catalog-composite'|'checked-catalog-composite-attribute';outcome:'exact'|'unknown'}[];
 residuals:{path:string;value:Json;reason:string;recovery:'Source and native fragments retained; resolve conflict then recompute whole record classification'}[];diagnostics:Diagnostic[];
}
const validator=createValidator();validator.addSchema(fields);const check=validator.compile(schema),checkRequest=validator.compile(schema.properties.request);
const canonical=(value:Json):string=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value!==null&&typeof value==='object'?'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key]!)).join(',')+'}':JSON.stringify(value);
export function classifyPostgresqlComposite(input:Document,options:PostgresqlCompositeRequest):PostgresqlCompositeClassification {
 const source=copyJson(input) as unknown as Document,request=copyJson(options) as unknown as PostgresqlCompositeRequest;
 if(!checkRequest(request))throw new UmfError('POSTGRESQL_COMPOSITE_REQUEST',JSON.stringify(checkRequest.errors));
 if(!validateDocument(source).valid||source.umf!=='0.2.0')throw new UmfError('POSTGRESQL_COMPOSITE_VERSION','Explicitly migrated valid envelope required');
 if(exportPostgresqlCatalogCapture(source).json!==renderTree(parseNativeJson(request.nativeSource)))throw new UmfError('POSTGRESQL_COMPOSITE_ARCHIVE','Native archive differs from captured tree');
 const version=getPostgresqlCatalogNode(source,'/serverVersion');if(version.kind!=='number'||Number(version.value)!==170004)throw new UmfError('POSTGRESQL_COMPOSITE_SERVER','This binding requires PostgreSQL 17.4');
 const types=getPostgresqlCatalogNode(source,'/snapshot/compositeTypes');
 const matches=types.kind==='array'?types.items.flatMap((n,index)=>n.kind==='object'&&n.members.schema?.kind==='string'&&n.members.schema.value===request.relation.schema&&n.members.name?.kind==='string'&&n.members.name.value===request.relation.name?[{n,index}]:[]):[];
 if(matches.length!==1)throw new UmfError('POSTGRESQL_COMPOSITE_IDENTITY','Qualified standalone composite is missing or ambiguous');
 const {n:native,index}=matches[0]!,nativePath='/snapshot/compositeTypes/'+index,base='/modules/'+source.modules.length+'/elements';
 const result:PostgresqlCompositeClassification={operation:'classify-postgresql-composite',version:'1.0.0',status:'classified',source,request,binding,mappings:[],residuals:[],diagnostics:[]};
 const block=(code:string,path:string,value:unknown,reason:string)=>{result.status='blocked';result.residuals.push({path,value:copyJson(value),reason,recovery:'Source and native fragments retained; resolve conflict then recompute whole record classification'});result.diagnostics.push({code,path,message:reason,severity:'error'});};
 if(source.modules.some(m=>m.id===request.recordModule))block('COMPOSITE_MODULE_COLLISION','/modules',request.recordModule,'Output module exists; existing assertions cannot be overwritten');
 const attributes=native.members.attributes;
 if(attributes?.kind!=='array'&&attributes?.kind!=='null')throw new UmfError('POSTGRESQL_COMPOSITE_ATTRIBUTES','Expected captured attribute array or empty aggregate');
 const elements:Element[]=[],names=new Set<string>();let previous=0;
 for(const [i,attribute] of (attributes.kind==='array'?attributes.items:[]).entries()){
  const path=nativePath+'/attributes/'+i;
  if(attribute.kind!=='object'||attribute.members.name?.kind!=='string'||attribute.members.position?.kind!=='number')throw new UmfError('POSTGRESQL_COMPOSITE_ATTRIBUTE','Malformed attribute');
  const name=attribute.members.name.value,position=Number(attribute.members.position.value);
  if(!name||names.has(name))block('COMPOSITE_MEMBER_NAME',path,attribute,'Attribute names must be nonempty and unique');names.add(name);
  if(!Number.isSafeInteger(position)||position<=previous)block('COMPOSITE_MEMBER_ORDER',path,attribute,'Attribute positions must be positive and strictly increasing; dropped-position gaps are allowed');previous=position;
  elements.push({id:request.recordId+'/field/'+i,name,kind:'field',extensions:{}});
  result.mappings.push({origin:'classified',kind:'field',idealPath:base+'/'+(i+1)+'/kind',nativePath:path,nativeFragment:copyJson(attribute),basis:'checked-catalog-composite-attribute',outcome:'exact'});
 }
 result.mappings.unshift({origin:'classified',kind:'record',idealPath:base+'/0/kind',nativePath,nativeFragment:copyJson(native),basis:'checked-catalog-composite',outcome:result.status==='classified'?'exact':'unknown'});
 if(result.status==='classified'){
  const target=copyJson(source) as unknown as Document;target.modules.push({id:request.recordModule,namespace:request.relation.schema,elements:[{id:request.recordId,name:request.relation.name,kind:'record',extensions:{},references:elements.map(e=>({role:'member',module:request.recordModule,element:e.id}))},...elements]});
  if(!validateDocument(target).valid)throw new UmfError('POSTGRESQL_COMPOSITE_TARGET','Invalid derived core record');result.target=target;
 }
 const output=copyJson(result);if(!check(output))throw new UmfError('POSTGRESQL_COMPOSITE_RESULT',JSON.stringify(check.errors));return output as unknown as PostgresqlCompositeClassification;
}
export function recoverPostgresqlCompositeCapture(input:PostgresqlCompositeClassification,current:Document):string{
 const receipt=copyJson(input) as unknown as PostgresqlCompositeClassification;if(!check(receipt)||receipt.status!=='classified')throw new UmfError('POSTGRESQL_COMPOSITE_RECEIPT','Expected complete classification receipt');
 const expected=classifyPostgresqlComposite(receipt.source,receipt.request);
 if(canonical(copyJson(expected))!==canonical(copyJson(receipt)))throw new UmfError('POSTGRESQL_COMPOSITE_RECEIPT','Receipt differs from recomputation');
 if(canonical(copyJson(current))!==canonical(copyJson(receipt.target)))throw new UmfError('POSTGRESQL_COMPOSITE_STALE','Current model changed');return receipt.request.nativeSource;
}
