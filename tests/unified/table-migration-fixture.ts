// SPDX-License-Identifier: MIT OR Apache-2.0
import fixture from '../binding/fixtures/table-lifecycle-note.json';
/** Independently authored append-table source; no native qualification. */
export function appendedTableSource(){
 const d=structuredClone(fixture) as any,m=d.modules[0],p=m.extensions['umf.tables'],ref=(element:string)=>({module:'demo',element});
 m.elements.push({id:'extraId',kind:'field',scalarType:'string',cardinality:'one',nullability:'required',extensions:{}},{id:'Extra',kind:'record',members:[ref('extraId')],keys:[{id:'primary',name:'primary',primary:true,fields:[ref('extraId')]}],extensions:{}});
 const table=structuredClone(p.tables[0]);table.id='extras';table.name='extras';table.record=ref('Extra');table.columns=[{field:ref('extraId'),name:'id',nativeType:{kind:'text'}}];
 for(const command of ['select','insert','update','delete'])table.policy.person[command]={kind:'deny'};
 p.tables.push(table);return d;
}
