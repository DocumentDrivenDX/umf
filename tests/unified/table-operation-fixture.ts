// SPDX-License-Identifier: MIT OR Apache-2.0
import fixture from '../binding/fixtures/table-lifecycle-note.json';
import type {TableOperation} from '../../src/extensions/tables';
const ref=(element:string)=>({module:'demo',element});
const parameter=(id:string)=>({kind:'parameter' as const,parameter:id});
const common={version:'umf.table-operation/0.1' as const,consistency:'transaction' as const,replay:'caller-key-required' as const};
const parameters=[{id:'id',field:ref('id')},{id:'owner',field:ref('owner')}];
const values=parameters.map(p=>({field:p.field,value:parameter(p.id)}));
const returning=[ref('id'),ref('owner')];
const where={op:'eq' as const,field:ref('id'),value:parameter('id')};
export const tableOperationDeclarations:TableOperation[]=[
 ...(['many','one','optional','page','count'] as const).map(result=>({version:'umf.table-operation/0.1' as const,id:'read_'+result,parameters:[parameters[1]!],consistency:'statement' as const,replay:'none' as const,
  body:{kind:'read' as const,table:'notes',fields:result==='count'?[]:returning,where:{op:'eq' as const,field:ref('owner'),value:parameter('owner')},orderBy:result==='count'?[]:[{field:ref('id'),direction:'asc' as const}],result,maxRows:result==='many'||result==='page'?100:1,...(result==='page'?{cursorKey:'primary'}:{})}})),
 {...common,id:'create',parameters,body:{kind:'insert',table:'notes',values,returning,maxRows:1}},
 {...common,id:'rename',parameters,body:{kind:'update',table:'notes',where,values:[values[1]!],returning,maxRows:1}},
 {...common,id:'remove',parameters:[parameters[0]!],body:{kind:'delete',table:'notes',where,returning:[],maxRows:10}},
 ...(['ignore','update'] as const).map(onConflict=>({...common,id:'put_'+onConflict,parameters,body:{kind:'upsert' as const,table:'notes',conflictKey:'primary',values,onConflict,updateFields:onConflict==='ignore'?[]:[ref('owner')],returning,maxRows:1 as const}})),
 {...common,id:'create_batch',parameters,batch:{maxItems:100},body:{kind:'insert',table:'notes',values,returning,maxRows:1}},
];
export function tableOperationSource(){
 const source=structuredClone(fixture);
 (source.modules[0]!.extensions['umf.tables'].commands as unknown[]).push(...JSON.parse(JSON.stringify(tableOperationDeclarations)));
 return source;
}
