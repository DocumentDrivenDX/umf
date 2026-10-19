// SPDX-License-Identifier: MIT OR Apache-2.0
import {inspectStoredLiteral} from './columns';
import {refKey,TableContext} from './context';
import type {TableLifecyclePayload} from './types';
export function inspectSeeds(payload:TableLifecyclePayload,ctx:TableContext):void{
 ctx.unique(payload.seedSets,s=>s.id,ctx.path+'/seedSets','seed-set ID');
 for(const[i,set]of payload.seedSets.entries())for(const[j,row]of set.rows.entries()){
  const path=ctx.path+'/seedSets/'+i+'/rows/'+j,table=payload.tables.find(t=>t.id===row.table);
  if(!table){ctx.add('TABLES_SEED_TABLE',path+'/table','Seed table is not declared by this module');continue;}
  ctx.unique(row.values,v=>refKey(v.field),path+'/values','seed Field');
  for(const[k,entry]of row.values.entries()){
   const location=path+'/values/'+k,column=table.columns.find(c=>refKey(c.field)===refKey(entry.field));
   if(!column){ctx.add('TABLES_SEED_FIELD',location+'/field','Seed Field is not mapped by this table');continue;}
   const field=ctx.field(entry.field,location+'/field');if(field)inspectStoredLiteral(column,field,entry.value,ctx,location+'/value');
   if(column.generated?.generation==='always')ctx.add('TABLES_SEED_GENERATED',location,'Seed cannot override a generated-always column');
  }
  for(const column of table.columns){const field=ctx.element(column.field);if(field?.nullability==='required'&&!column.default&&!column.generated&&!row.values.some(v=>refKey(v.field)===refKey(column.field)))ctx.add('TABLES_SEED_REQUIRED',path+'/values','Seed omits a required create Field');}
 }
}
