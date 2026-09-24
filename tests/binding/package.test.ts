import {expect,test} from 'bun:test';
import {bindingRegistry,copyJson,getBinding,inspectBinding,readBindingDocument,writeBindingDocument,type Document} from '../../src';

const logical:Document={umf:'0.1.0',id:'orders-v1',vocabularies:{},modules:[{id:'sales',namespace:'sales',elements:[{id:'Order',extensions:{}},{id:'details',kind:'field',extensions:{}}]}]};
const binding:Document={
  umf:'0.1.0',id:'orders-postgresql',vocabularies:{'umf.binding':{version:'0.1.0'}},modules:[],
  extensions:{'umf.binding':{
    profile:'umf-binding-1',logical:{documentId:'orders-v1',coreVersion:'0.1.0'},
    target:{system:'postgresql',version:'17',subset:'declared-tables'},
    elements:[{module:'sales',element:'Order',table:'orders'}],
    fields:[{module:'sales',element:'details',storage:'embedded',documentColumn:'payload',path:['order','details']}],
    relationships:[],indexes:[]
  }}
};
const clone=()=>copyJson(binding) as unknown as Document;

test('@covers US-046-AC1 @covers US-046-AC2: separate binding preserves logical identity and copied choices',()=>{
  const before=copyJson(logical) as unknown as Document;
  expect(bindingRegistry().get('umf.binding','0.1.0')).toBeDefined();
  expect(inspectBinding(binding,logical).valid).toBe(true);
  const value=getBinding(binding,logical);
  expect(value.target.system).toBe('postgresql');
  expect(value.fields[0]?.path).toEqual(['order','details']);
  value.fields[0]!.path!.push('changed');
  expect(getBinding(binding,logical).fields[0]?.path).toEqual(['order','details']);
  expect(logical).toEqual(before);
});

test('@covers US-046-AC7: independent document round-trips in both UMF formats',()=>{
  for(const format of ['json','yaml'] as const){
    const text=writeBindingDocument(binding,logical,format);
    expect(readBindingDocument(text,logical,format)).toEqual(binding);
  }
});

test('@covers US-046-AC3: stale model and duplicate or missing bindings fail with paths',()=>{
  const stale=copyJson(logical) as unknown as Document;stale.id='different';
  expect(inspectBinding(binding,stale).diagnostics.some(d=>d.code==='BINDING_MODEL')).toBe(true);
  expect(()=>writeBindingDocument(binding,stale)).toThrow();
  const duplicate=clone();
  const p=duplicate.extensions!['umf.binding'] as any;
  p.elements.push({...p.elements[0]});
  expect(inspectBinding(duplicate,logical).diagnostics.some(d=>d.code==='BINDING_DUPLICATE')).toBe(true);
  p.elements=[{module:'sales',element:'missing',table:'missing'}];
  expect(inspectBinding(duplicate,logical).diagnostics.some(d=>d.code==='BINDING_REFERENCE')).toBe(true);
});

test('@covers US-046-AC7: unknown binding content survives but remains incomplete',()=>{
  const future=clone();(future.extensions!['umf.binding'] as any).future={native:[1,'opaque']};
  const inspected=inspectBinding(future,logical);
  expect(inspected.valid).toBe(true);
  expect(inspected.complete).toBe(false);
  expect(inspected.diagnostics.some(d=>d.code==='BINDING_UNKNOWN')).toBe(true);
  expect(readBindingDocument(writeBindingDocument(future,logical,'json'),logical,'json')).toEqual(future);
});

test('@covers US-046-AC2: nested DDD field resolves by owner ID and exact field key',()=>{
  const authored=copyJson(logical) as unknown as Document;
  authored.vocabularies['umf.ddd']={version:'0.1.0'};
  authored.modules[0]!.elements[0]!.extensions['umf.ddd']={kind:'entity',fields:{details:{type:{kind:'scalar',name:'string'},cardinality:'one'}},identity:{fields:['details'],scope:'context'}};
  const bound=clone();
  const p=bound.extensions!['umf.binding'] as any;
  p.fields=[{module:'sales',element:'Order',field:'details',storage:'column',column:'details'}];
  expect(inspectBinding(bound,authored).valid).toBe(true);
  p.fields[0].field='other';
  expect(inspectBinding(bound,authored).diagnostics.some(d=>d.code==='BINDING_REFERENCE')).toBe(true);
});
