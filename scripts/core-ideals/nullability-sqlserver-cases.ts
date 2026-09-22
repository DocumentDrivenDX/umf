import {importSqlServerCatalog,getSqlServerColumnMetadata} from '../../src/adapters/sqlserver';
import {upgradeFieldEnvelope} from '../../src/model/field-transition';
import {upgradeNullabilityEnvelope} from '../../src/model/nullability-transition';
import {classifySqlServerField} from '../../src/core-ideals/sqlserver-field';
import type {SqlServerNullabilityRequest} from '../../src/core-ideals/nullability-sqlserver';
import type {Nullability} from '../../src/model/types';
export function sqlserverAvailabilitySource(nativeSource:string,table:string,column='value'){
 const fields=upgradeFieldEnvelope(importSqlServerCatalog(nativeSource,{id:'nullability-classification'})).target;
 const metadata=getSqlServerColumnMetadata(fields).find(c=>c.table.schema==='availability'&&c.table.name===table&&c.element.name===column);
 if(!metadata)throw Error('Missing column');
 return {source:upgradeNullabilityEnvelope(classifySqlServerField(fields,{nativeSource,column:metadata.path,mode:'strict'}).target!).target,column:metadata.path};
}
export function sqlserverNullabilityCases(nativeSource:string){
 const columns=getSqlServerColumnMetadata(importSqlServerCatalog(nativeSource,{id:'case-discovery'})),cases=[];
 const required=['alias_required','identity_value','required','version_value'];
 const unknown=['checked_required','computed','positive','untrusted'];
 for(const c of columns){
  const {source,column}=sqlserverAvailabilitySource(nativeSource,c.table.name,c.element.name);
  const observed:Nullability=unknown.includes(c.table.name)?'unspecified':required.includes(c.table.name)&&c.element.name==='value'?'required':'absent-allowed';
  for(const scope of ['stored-relation','query-result','write-input','unresolved'] as const)for(const carrier of ['sql-null','unresolved'] as const)for(const mode of ['strict','report'] as const){
   const expected=scope==='stored-relation'&&carrier==='sql-null'?observed:'unspecified';
   const request:SqlServerNullabilityRequest={column,nativeSource,scope,carrier,mode};
   cases.push({id:`${c.table.name}.${c.element.name}:${scope}:${carrier}:${mode}`,source,request,expected,status:mode==='strict'&&expected==='unspecified'?'blocked' as const:'classified' as const});
  }
 }
 return cases;
}
