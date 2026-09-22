import {importPostgresqlCatalogCapture,getPostgresqlColumnMetadata} from '../../src/adapters/postgresql/catalog';
import {upgradeFieldEnvelope} from '../../src/model/field-transition';
import {upgradeNullabilityEnvelope} from '../../src/model/nullability-transition';
import {classifyPostgresqlField} from '../../src/core-ideals/postgresql-field';
import type {PostgresqlNullabilityRequest} from '../../src/core-ideals/nullability-postgresql';
import type {Nullability} from '../../src/model/types';
export function postgresqlAvailabilitySource(nativeSource:string,relation:string,column='value'){
 const fields=upgradeFieldEnvelope(importPostgresqlCatalogCapture(nativeSource,{id:'nullability-classification'})).target;
 const metadata=getPostgresqlColumnMetadata(fields).find(c=>c.relation.schema==='availability'&&c.relation.name===relation&&c.element.name===column);
 if(!metadata)throw Error('Missing column: '+relation+'.'+column);
 const field=classifyPostgresqlField(fields,{nativeSource,column:metadata.path,mode:'strict'});
 return {source:upgradeNullabilityEnvelope(field.target!).target,column:metadata.path};
}
export function postgresqlNullabilityCases(nativeSource:string){
 const declared:Record<string,Nullability>={plain:'absent-allowed',required:'required',identity_value:'required'};
 const relations=['plain','required','domain_required','domain_default','column_default','positive','checked_required','unvalidated','identity_value','generated_value','outer_null'];
 const cases=[];
 for(const relation of relations){
  const {source,column}=postgresqlAvailabilitySource(nativeSource,relation);
  for(const scope of ['stored-relation','query-result','write-input','unresolved'] as const)for(const carrier of ['sql-null','unresolved'] as const)for(const mode of ['strict','report'] as const){
   const expected=scope==='stored-relation'&&carrier==='sql-null'?declared[relation]??'unspecified':'unspecified';
   const request:PostgresqlNullabilityRequest={column,nativeSource,scope,carrier,mode};
   cases.push({id:`${relation}:${scope}:${carrier}:${mode}`,source,request,expected,status:mode==='strict'&&expected==='unspecified'?'blocked' as const:'classified' as const});
  }
 }
 return cases;
}
