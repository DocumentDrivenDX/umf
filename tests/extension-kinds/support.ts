// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,Json,Diagnostic} from '../../src/model/types';
import type {SemanticValidator} from '../../src/registry/registry';
/** Synthetic fixture validator only; no native dashboard support is claimed. */
export const fixtureSemantics:SemanticValidator=(payload:Json,context):Diagnostic[]=>{
  const p=payload as Record<string,any>,out:Diagnostic[]=[];
  const fail=(message:string)=>out.push({code:'EXAMPLE_DASHBOARD_BINDING',path:context.path,message,severity:'error'});
  if(p.kind==='dataset'){
    const match=/^\/modules\/(\d+)\/elements\/(\d+)\//.exec(context.path);
    const owner=match?context.document.modules[Number(match[1])]?.elements[Number(match[2])]:undefined;
    if(owner?.kind!=='record')fail('Dataset shape must be an explicit core Record');
    out.push({code:'EXAMPLE_QUERY_OPAQUE',path:context.path+'/query',message:'Synthetic query is retained without execution or inference',severity:'warning'});
  }
  if(p.kind==='visual'||p.kind==='filter'){
    const record=context.document.modules.find(m=>m.id===p.dataset?.module)?.elements.find(e=>e.id===p.dataset?.element);
    const field=context.document.modules.find(m=>m.id===p.field?.module)?.elements.find(e=>e.id===p.field?.element);
    if(record?.kind!=='record'||(record.extensions['example.dashboard'] as any)?.kind!=='dataset')fail('Consumer must reference a dataset core Record');
    if(field?.kind!=='field'||!record?.members?.some(r=>r.module===p.field?.module&&r.element===p.field?.element))fail('Consumer field must be a member of its dataset Record');
  }
  return out;
};
export const coreRows=(document:Document)=>document.modules.flatMap(m=>m.elements.filter(e=>e.kind==='field').map(e=>({module:m.id,id:e.id,name:e.name,scalarType:e.scalarType})));
