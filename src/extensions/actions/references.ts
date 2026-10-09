import type {Action,ActionRule} from './types';
export interface ActionReferencePosition {value:unknown;keys:string[];path:string}
/** Only schema-defined reference slots have reference semantics; opaque content is inert. */
export function actionReferencePositions(action:Action,path=''):ActionReferencePosition[] {
 const positions:ActionReferencePosition[]=[];
 const add=(value:unknown,keys:string[],at:string)=>positions.push({value,keys,path:path+at});
 const element=(value:unknown,at:string)=>add(value,['module','element'],at);
 const relationship=(value:unknown,at:string)=>add(value,['module','relationship'],at);
 const rule=(r:ActionRule,at:string)=>r.references.forEach((ref,i)=>{if('record'in ref)element(ref.record,at+'/references/'+i+'/record');else if('relationship'in ref)relationship(ref.relationship,at+'/references/'+i+'/relationship');});
 for(const group of ['parameters','outputs'] as const)action[group].forEach((p,i)=>{if(p.kind==='value')element(p.field,`/${group}/${i}/field`);else add(p.target,['module','element','key'],`/${group}/${i}/target`);});
 for(const group of ['reads','writes'] as const)action[group].forEach((f,i)=>{const at=`/${group}/${i}`;element(f.record,at+'/record');f.fields.forEach((ref,j)=>element(ref,at+'/fields/'+j));f.relationships.forEach((ref,j)=>relationship(ref,at+'/relationships/'+j));rule(f.selector,at+'/selector');});
 for(const group of ['preconditions','postconditions'] as const)action[group].forEach((c,i)=>rule(c.rule,`/${group}/${i}/rule`));
 if(action.binding.kind==='recipe')action.binding.effects.forEach((e,i)=>{const at='/binding/effects/'+i;if(e.kind==='create')element(e.record,at+'/record');if(e.kind==='create'||e.kind==='set')for(const [j,assignment] of (e.values as {field:unknown}[]).entries())element(assignment.field,at+'/values/'+j+'/field');if(e.kind==='link'||e.kind==='unlink')relationship(e.relationship,at+'/relationship');});
 if(action.dddOperation)add(action.dddOperation,['module','element','operation'],'/dddOperation');
 return positions;
}
