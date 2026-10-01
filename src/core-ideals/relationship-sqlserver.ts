import {copyJson} from '../model/json';
import {UmfError,type Document,type Json,type Diagnostic,type ExtensionPackage} from '../model/types';
import {parseNativeJson,renderTree} from '../model/native-json';
import {exportSqlServerCatalog,getSqlServerConstraintMetadata,getSqlServerColumnMetadata} from '../adapters/sqlserver';
import {createValidator} from '../validation/schema';
import legacy from '../../spec/core/schema.json';import fields from '../../spec/core/field-document.schema.json';import nullability from '../../spec/core/nullability-document.schema.json';import cardinality from '../../spec/core/cardinality-document.schema.json';import facets from '../../spec/core/facet-document.schema.json';import keys from '../../spec/core/key-document.schema.json';import relationships from '../../spec/core/relationship-document.schema.json';
import schema from '../../spec/core/sqlserver-relationship-classification.schema.json';import manifest from '../../spec/extensions/sqlserver-relationships/package.json';
export const SQLSERVER_RELATIONSHIPS_EXTENSION='umf.sqlserver.relationships';export const sqlserverRelationshipsPackage=manifest as unknown as ExtensionPackage;
export {default as sqlserverRelationshipClassificationSchema} from '../../spec/core/sqlserver-relationship-classification.schema.json';
export interface SqlServerRelationshipRequest {nativeSource:string;mode:'strict'|'report';profile:'captured-foreign-keys'}
export interface SqlServerRelationshipObservation {nativePath:string;table:{schema:string;name:string};name:string;nativeForeignKey:Json;referencedKeys:{path:string;nativeKey:Json}[];sourceFields:{module:string;element:string}[];targetFields:{module:string;element:string}[];enforcement:'enabled-trusted'|'enabled-untrusted'|'disabled'|'unknown';authorIntent:'unknown';provenance:'inferred';deleteAction:string;updateAction:string;notForReplication:boolean;resolution:'captured-tuple-candidate'|'unresolved'}
const binding=schema.properties.binding.const;
export interface SqlServerRelationshipClassification {operation:'classify-sqlserver-relationships';version:'1.0.0';status:'classified'|'blocked';source:Document;target?:Document;request:SqlServerRelationshipRequest;binding:typeof binding;observations:SqlServerRelationshipObservation[];residuals:{path:string;value:Json;reason:string;outcome:'unknown'|'not-expressible'|'approximated';recovery:string}[];diagnostics:Diagnostic[]}
const validator=createValidator(false);for(const s of [legacy,fields,nullability,cardinality,facets,keys,relationships])validator.addSchema(s);const check=validator.compile(schema),requestCheck=validator.compile(schema.properties.request);
const canonical=(v:Json):string=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v!==null&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k]!)).join(',')+'}':JSON.stringify(v);const same=(a:unknown,b:unknown)=>canonical(copyJson(a))===canonical(copyJson(b));
/** Permission-limited catalog observations; trust flags never establish authored relationship meaning. */
export function classifySqlServerRelationships(input:Document,options:SqlServerRelationshipRequest):SqlServerRelationshipClassification {
 const source=copyJson(input) as unknown as Document,request=copyJson(options) as unknown as SqlServerRelationshipRequest;
 if(!requestCheck(request))throw new UmfError('SQLSERVER_RELATIONSHIP_REQUEST',JSON.stringify(requestCheck.errors));
 const exported=exportSqlServerCatalog(source);if(renderTree(parseNativeJson(request.nativeSource))+'\n'!==exported)throw new UmfError('SQLSERVER_RELATIONSHIP_ARCHIVE','Native text differs from retained catalog');
 const native=JSON.parse(exported),views=getSqlServerConstraintMetadata(source),columns=getSqlServerColumnMetadata(source);
 if(native.profile!=='sqlserver-catalog-v3'||native.state!=='captured'||native.serverVersion!==binding.nativeVersion)throw new UmfError('SQLSERVER_RELATIONSHIP_PROFILE','Captured v3 catalog on SQL Server 16.0.4295.3 required');
 const r:SqlServerRelationshipClassification={operation:'classify-sqlserver-relationships',version:'1.0.0',status:'classified',source,request,binding,observations:[],residuals:[],diagnostics:[]};let blocked=false;
 const loss=(path:string,value:unknown,reason:string)=>r.residuals.push({path,value:copyJson(value),reason,outcome:'unknown',recovery:'Original native archive and unknown content recover exactly from verified receipt'});
 loss('/nativeSource',request.nativeSource,'All unclaimed native catalog refinements remain retained; capture is permission-limited and not authenticated live state');
 const fail=(message:string):never=>{throw new UmfError('SQLSERVER_RELATIONSHIP_CORRELATION',message);};
 for(const [ti,table] of native.tables.entries()){
  const view=views.tables[ti]!;if(!view.available.foreign_keys){blocked=true;loss('/tables/'+ti,table,'FK inventory unavailable; absence is not an empty inventory');continue;}
  for(const [fi,fk] of table.foreign_keys.entries()){
   const path=`/tables/${ti}/foreign_keys/${fi}`,targetIndex=native.tables.findIndex((t:any)=>t.schema===fk.referenced_schema&&t.name===fk.referenced_table),target=native.tables[targetIndex];
   const sourceFields:{module:string;element:string}[]=[],targetFields:{module:string;element:string}[]=[],ordered=[...fk.columns].sort((a:any,b:any)=>a.ordinal-b.ordinal);let resolved=ordered.length>0&&!!target;
   for(const [i,c] of ordered.entries()){
    if(c.ordinal!==i+1)fail('FK ordinals must be contiguous');const ci=table.columns.findIndex((x:any)=>x.column_id===c.column_id&&x.name===c.column_name);if(ci<0)fail('FK source column does not match captured identity');
    const f=columns.find(x=>x.path===`/tables/${ti}/columns/${ci}`);if(!f)fail('Missing copied source Field');sourceFields.push({module:'sqlserver.columns',element:f!.element.id});
    if(target){const j=target.columns.findIndex((x:any)=>x.column_id===c.referenced_column_id&&x.name===c.referenced_column_name);if(j<0)fail('FK target column does not match captured identity');
     const comparatorProperties=['system_type_id','user_type_id','type_schema','type_name','base_type_name','is_user_defined','is_assembly_type','max_length','precision','scale','collation_name'];
     if(comparatorProperties.some(k=>table.columns[ci][k]!==target.columns[j][k]))resolved=false;
     const t=columns.find(x=>x.path===`/tables/${targetIndex}/columns/${j}`);if(!t)fail('Missing copied target Field');targetFields.push({module:'sqlserver.columns',element:t!.element.id});}
   }
   const referencedKeys:{path:string;nativeKey:Json}[]=[];let activeKeyCandidate=false;
   for(const [ki,k] of (target?.keys??[]).entries()){
    const tuple=[...k.columns].sort((a:any,b:any)=>a.key_ordinal-b.key_ordinal);if(tuple.length===ordered.length&&tuple.every((c:any,i:number)=>c.column_id===ordered[i].referenced_column_id&&c.name===ordered[i].referenced_column_name)){referencedKeys.push({path:`/tables/${targetIndex}/keys/${ki}`,nativeKey:copyJson(views.tables[targetIndex]!.keys[ki])});if(!k.is_disabled)activeKeyCandidate=true;}
   }
   // v3 does not capture key_index_id; matching tuples are candidates, never a selected stable Key.
   if(!activeKeyCandidate)resolved=false;
   const knownActions=['NO_ACTION','CASCADE','SET_NULL','SET_DEFAULT'].includes(fk.delete_action)&&['NO_ACTION','CASCADE','SET_NULL','SET_DEFAULT'].includes(fk.update_action);
   r.observations.push({nativePath:path,table:{schema:table.schema,name:table.name},name:fk.name,nativeForeignKey:copyJson(view.foreign_keys[fi]),referencedKeys,sourceFields,targetFields,enforcement:fk.is_disabled?'disabled':!knownActions||!resolved?'unknown':fk.is_not_trusted?'enabled-untrusted':'enabled-trusted',authorIntent:'unknown',provenance:'inferred',deleteAction:fk.delete_action,updateAction:fk.update_action,notForReplication:fk.is_not_for_replication,resolution:resolved?'captured-tuple-candidate':'unresolved'});
   loss(path,view.foreign_keys[fi],'Native actions/trust/replication exceptions and nullable-composite bypass remain native; FK does not establish lifecycle, participation minima or authored stable identity. Matching captured Keys are tuple candidates, not authenticated comparator or Key identity proofs; unequal captured type/collation refinements produce unknown enforcement, and key_index_id is not captured');
  }
 }
 const ext=SQLSERVER_RELATIONSHIPS_EXTENSION;if(source.extensions&&Object.hasOwn(source.extensions,ext)){blocked=true;loss('/extensions/'+ext,source.extensions[ext],'Existing observations cannot be overwritten');}if(source.vocabularies[ext]&&source.vocabularies[ext]!.version!=='1.0.0'){blocked=true;loss('/vocabularies/'+ext,source.vocabularies[ext],'Unsupported classification vocabulary');}
 if(blocked||request.mode==='strict')r.status='blocked';else{r.target=copyJson(source) as unknown as Document;r.target.vocabularies[ext]??={version:'1.0.0'};r.target.extensions??={};r.target.extensions[ext]=copyJson({origin:'classified',binding,observations:r.observations});}
 r.diagnostics=r.residuals.map(x=>({code:'SQLSERVER_RELATIONSHIP_RESIDUAL',path:x.path,message:x.reason,severity:r.status==='blocked'?'error':'warning'}));if(!check(r))throw new UmfError('SQLSERVER_RELATIONSHIP_RESULT',JSON.stringify(check.errors));return copyJson(r) as unknown as SqlServerRelationshipClassification;
}
export function verifySqlServerRelationshipClassification(input:SqlServerRelationshipClassification,current:Document){const r=copyJson(input) as unknown as SqlServerRelationshipClassification;if(!check(r)||r.status!=='classified'||!same(r,classifySqlServerRelationships(r.source,r.request)))throw new UmfError('SQLSERVER_RELATIONSHIP_RECEIPT','Inconsistent classification');if(!same(current,r.target))throw new UmfError('SQLSERVER_RELATIONSHIP_STALE','Classification target changed');return r;}
export function recoverSqlServerRelationshipSource(input:SqlServerRelationshipClassification,current:Document){return verifySqlServerRelationshipClassification(input,current).request.nativeSource;}
