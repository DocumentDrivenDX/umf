import {importAvroSchema,getAvroFieldMetadata} from '../../src/adapters/avro';
import {upgradeFieldEnvelope} from '../../src/model/field-transition';
import {upgradeNullabilityEnvelope} from '../../src/model/nullability-transition';
import {classifyAvroField} from '../../src/core-ideals/avro-field';
import type {AvroNullabilityRequest} from '../../src/core-ideals/nullability-avro';
export function avroAvailabilitySource(nativeSource:string,dependencies:{id:string;schema:string}[]=[],record='availability.Example',name='value'){
 const initial=upgradeFieldEnvelope(importAvroSchema(nativeSource,{id:'availability',dependencies})).target;
 const metadata=getAvroFieldMetadata(initial).find(f=>f.record===record&&f.element.name===name);if(!metadata)throw Error('Missing field');
 const classified=classifyAvroField(initial,{column:metadata.element.id,nativeSource,dependencies,mode:'strict'});if(!classified.target)throw Error('Field blocked');
 return {source:upgradeNullabilityEnvelope(classified.target).target,column:metadata.element.id};
}
export function avroNullabilityCases(rows:{id:string;schema:string}[]){
 const nullable=new Set(['null-first','null-last','null-first-default-null','null-last-default-null','null-first-default-int','null-last-default-int','null-only','multiple-values','nullable-array','nullable-map','optional-parent']);
 const cases=[];
 for(const row of rows){
  const {source,column}=avroAvailabilitySource(row.schema);
  for(const scope of ['underlying-field-value','write-input','reader-resolution','unresolved'] as const)for(const carrier of ['avro-null','unresolved'] as const)for(const mode of ['strict','report'] as const){
   const known=scope==='underlying-field-value'&&carrier==='avro-null',expected:'required'|'absent-allowed'|'unspecified'=known?(nullable.has(row.id)?'absent-allowed':'required'):'unspecified';
   const request:AvroNullabilityRequest={column,nativeSource:row.schema,scope,carrier,mode};
   cases.push({id:`${row.id}:${scope}:${carrier}:${mode}`,source,request,expected,status:!known&&mode==='strict'?'blocked' as const:'classified' as const});
  }
 }
 return cases;
}
