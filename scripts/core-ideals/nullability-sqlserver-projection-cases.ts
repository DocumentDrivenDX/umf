import {declareCoreNullability} from '../../src/model/nullability';
import {sqlServerCarriers as carriers} from '../../src/core-ideals/sqlserver-syntax';
import type {Document,Nullability} from '../../src/model/types';
import type {NullabilitySqlServerRequest} from '../../src/core-ideals/nullability-sqlserver-projection';
export function sqlserverNullabilityProjectionCases(){
 const rows:Array<{id:string;nativeType:keyof typeof carriers;label:Nullability;variant:string;author:ReturnType<typeof declareCoreNullability>;request:NullabilitySqlServerRequest;status:'blocked'|'projected';expectedNotNull:boolean}>=[];let n=0;
 function add(nativeType:keyof typeof carriers,label:Nullability,variant:string,mode:'strict'|'report'){
  const id='availability_'+n++;
  const source:Document={umf:'0.3.0',id:'ideal-'+id,vocabularies:{},modules:[{id:'m',namespace:'availability',elements:[{id:'e',name:'value',kind:'field',description:"Availability 'meaning' \\ retained",scalarType:carriers[nativeType],extensions:{}}]}]};
  const request:NullabilitySqlServerRequest={id,namespace:'availability',tableName:id,columnName:'value',nativeType,mode,scope:'stored-relation',carrier:'sql-null'};
  if(variant==='long-description')source.modules[0]!.elements[0]!.description='x'.repeat(3751);
  if(variant==='unknown'){source.modules[0]!.elements[0]!.future={exactness:'unknown'};}
  if(variant==='namespace')source.modules[0]!.namespace='other';
  if(variant==='type')source.modules[0]!.elements[0]!.scalarType='string';
  if(variant==='scope')request.scope='query-result';
  if(variant==='carrier')request.carrier='unresolved';
  if(variant==='quoted'){request.tableName='quoted]; DROP TABLE dbo.sentinel; --';request.columnName="v]雪'";source.modules[0]!.elements[0]!.name=request.columnName;}
  const author=declareCoreNullability(source,{module:'m',element:'e'},label);
  const loss=['unknown','namespace','type','long-description'].includes(variant)||['scope','carrier'].includes(variant)&&label!=='unspecified';
  rows.push({id,nativeType,label,variant,author,request,status:mode==='strict'&&loss?'blocked' as const:'projected' as const,expectedNotNull:label==='required'&&!['scope','carrier'].includes(variant)});
 }
 for(const type of Object.keys(carriers) as (keyof typeof carriers)[])for(const label of ['required','absent-allowed','unspecified'] as const)add(type,label,'plain','strict');
 for(const variant of ['unknown','namespace','type','scope','carrier','long-description'])for(const label of ['required','absent-allowed','unspecified'] as const)for(const mode of ['strict','report'] as const)add('int',label,variant,mode);
 add('int','required','quoted','strict');return rows;
}
