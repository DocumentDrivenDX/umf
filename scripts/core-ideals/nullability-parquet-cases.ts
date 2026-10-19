// SPDX-License-Identifier: MIT OR Apache-2.0
import {importParquetSchema, getParquetFieldMetadata} from '../../src/adapters/parquet/field-metadata';


import {classifyParquetField} from '../../src/core-ideals/parquet-field';
import type {Nullability} from '../../src/model/types';
import type {ParquetNullabilityRequest} from '../../src/core-ideals/nullability-parquet';
export function parquetAvailabilitySource(bytes:Uint8Array,index:number){
 const initial=importParquetSchema(bytes,{id:'availability'});
 const field=classifyParquetField(initial,{index,mode:'strict'});if(!field.target)throw Error('Field blocked');
 return field.target;
}
export interface ParquetAvailabilityFixture {id:string;outcome:string;path?:string;physicalSchema?:string;storeSchema:boolean;leafAvailability?:{row:Nullability;element:Nullability}[]}
export async function parquetNullabilityCases(rows:ParquetAvailabilityFixture[]){
 const cases=[],seen=new Set<string>();
 for(const row of rows){
  if(row.outcome!=='accepted')continue;const key=row.physicalSchema+'|'+row.storeSchema;if(seen.has(key))continue;seen.add(key);
  const bytes=new Uint8Array(await Bun.file(row.path!).arrayBuffer()),inventory=getParquetFieldMetadata(importParquetSchema(bytes,{id:row.id}));
  const leaves=inventory.fields.filter(f=>Object.hasOwn(f.nativeField as object,'type'));
  for(const [ordinal,field] of leaves.entries()){
   const source=parquetAvailabilitySource(bytes,field.index),expectation=row.leafAvailability![ordinal]!;
   for(const scope of ['row-leaf-value','repeated-element-value','write-input','unresolved'] as const)for(const carrier of ['definition-level','unresolved'] as const)for(const mode of ['strict','report'] as const){
    const expected:Nullability=carrier!=='definition-level'?'unspecified':scope==='row-leaf-value'?expectation.row:scope==='repeated-element-value'?expectation.element:'unspecified';
    const request:ParquetNullabilityRequest={index:field.index,scope,carrier,mode};
    cases.push({id:`${row.id}:${field.index}:${scope}:${carrier}:${mode}`,path:row.path!,source,request,expected,status:expected==='unspecified'&&mode==='strict'?'blocked' as const:'classified' as const});
   }
  }
 }
 return cases;
}
