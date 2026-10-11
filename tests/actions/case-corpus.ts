import vectors from '../../fixtures/actions/cases.json';
import approve from '../../fixtures/actions/approve.json';
import create from '../../fixtures/actions/create-link.json';
import ddd from '../../fixtures/actions/ddd-binding.json';
import composite from '../../fixtures/actions/composite-key.json';
import association from '../../fixtures/actions/association-record.json';
import type * as Umf from '../../src/index';
import type {Document} from '../../src/model/types';
const fixtures:Record<string,unknown>={approve,'create-link':create,'ddd-binding':ddd,'composite-key':composite,'association-record':association};
function canonical(value:unknown):string {if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical((value as Record<string,unknown>)[k])).join(',')+'}';return JSON.stringify(value);}
function assert(condition:unknown,message:string):asserts condition {if(!condition)throw Error(message);}
/** Independently authored expected decisions; identical assertions run in Bun and Chromium. */
export function runActionCaseCorpus(api:typeof Umf) {
 return vectors.cases.map(vector=>{
  const source=JSON.parse(JSON.stringify(fixtures[vector.fixture])) as Document;
  for(const change of vector.changes){const parts=change.path.slice(1).split('/').map(p=>p.replace(/~1/g,'/').replace(/~0/g,'~'));const key=parts.pop()!;let parent:any=source;for(const part of parts)parent=parent[part];
   if(change.op==='remove'){if(Array.isArray(parent))parent.splice(Number(key),1);else delete parent[key];}
   else if(Array.isArray(parent)&&key==='-')parent.push((change as any).value);else Object.defineProperty(parent,key,{value:(change as any).value,writable:true,enumerable:true,configurable:true});
  }
  const before=canonical(source),expected=vector.expected as any;let result:any;
  try {
   const registry=api.registerActions(api.dddRegistry());
   if(vector.operation==='select'){const action=(source.modules[0]!.extensions!['umf.actions'] as any).actions[0],selected=api.selectActionIdentity(source,action,action.writes[0],(vector as any).inputs);assert(canonical(selected.entity.components)===canonical(expected.components),vector.id+': selected component order/value differs');result={selected};}
   else {
    const inspection=api.inspectActions(source,registry);assert(inspection.validation.valid===expected.valid,vector.id+': validity differs');assert(inspection.validation.complete===expected.complete,vector.id+': completeness differs');
    for(const diagnostic of expected.diagnostics)assert(inspection.validation.diagnostics.some(d=>d.code===diagnostic.code&&d.path===diagnostic.path&&d.severity===diagnostic.severity),vector.id+': missing expected diagnostic '+canonical(diagnostic));
    for(const format of ['json','yaml'] as const)assert(canonical(api.readDocument(api.writeDocument(source,format),format))===before,vector.id+': '+format+' round trip changed data');
    result={valid:inspection.validation.valid,complete:inspection.validation.complete,diagnostics:inspection.validation.diagnostics.map(({code,path,severity})=>({code,path,severity})),obligations:inspection.actions.map(a=>a.obligations)};
   }
   assert(!expected.refusal,vector.id+': expected refusal '+expected.refusal);
  }catch(error){if(!expected.refusal)throw error;assert(error instanceof api.UmfError&&error.code===expected.refusal,vector.id+': incorrect refusal '+String(error));result={refusal:expected.refusal};}
  assert(canonical(source)===before,vector.id+': operation mutated source');return {id:vector.id,...result};
 });
}
