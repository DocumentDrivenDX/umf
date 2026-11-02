// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import logicalSource from '../../fixtures/binding/raw-profiles/logical.json';
import lakebase from '../../fixtures/binding/raw-profiles/lakebase.json';
import unity from '../../fixtures/binding/raw-profiles/unity-catalog.json';
import spark from '../../fixtures/binding/raw-profiles/spark-delta.json';
import {getBinding,inspectBinding,projectBindingIndexes,readBindingDocument,writeBindingDocument} from '../../src/extensions/binding';
import {createRawTableBindingInspector,inspectRawTableBinding,RAW_TABLE_BINDING_SUBSET,rawTableBindingProfiles} from '../../src/extensions/binding/raw-profiles';
import {inspectCoreRecordMembers} from '../../src/model/record-members';
import type {Document} from '../../src/model/types';
const cases=[lakebase,unity,spark];
function setup(source=lakebase){const binding=structuredClone(source) as unknown as Document,logical=structuredClone(logicalSource) as unknown as Document;const p=getBinding(binding,logical);return {binding,logical,target:{platform:p.target.system,majorVersion:p.target.version}};}
const payload=(binding:Document)=>binding.extensions!['umf.binding'] as any;

test('U-2: all three declarative profiles admit stable core Field bindings without native claims',()=>{
 for(const source of cases){const {binding,logical,target}=setup(source),before=structuredClone({binding,logical,target});
  expect(inspectBinding(binding,logical).valid).toBe(true);
  expect(inspectRawTableBinding(binding,logical,target,'sales')).toEqual({valid:true,complete:true,diagnostics:[]});
  expect(payload(binding).target.subset).toBe(RAW_TABLE_BINDING_SUBSET);
  expect({binding,logical,target}).toEqual(before);
  for(const format of ['json','yaml'] as const)expect(readBindingDocument(writeBindingDocument(binding,logical,format),logical,format)).toEqual(binding);
 }
 expect(rawTableBindingProfiles.map(p=>p.system)).toEqual(['lakebase','unity-catalog','spark-delta']);
 for(const profile of rawTableBindingProfiles){expect(profile.nativeQualification).toBe('UNTESTED');expect(profile.directions).toEqual([]);}
});

test('U-2: opaque target identity compares exactly, without aliases or major inference',()=>{
 for(const source of cases){const {binding,logical,target}=setup(source);
  for(const mismatch of [{...target,majorVersion:target.majorVersion+'.1'},{...target,platform:'postgresql'},{...target,platform:'delta'}])expect(inspectRawTableBinding(binding,logical,mismatch,'sales').valid).toBe(false);
  payload(binding).target.version='17.4';target.majorVersion='17';expect(inspectRawTableBinding(binding,logical,target,'sales').valid).toBe(false);
  target.majorVersion='17.4';expect(inspectRawTableBinding(binding,logical,target,'sales').valid).toBe(true);
 }
});

test('U-2: unsupported physical semantics refuse but generic binding retains the source',()=>{
 const edits:((p:any)=>void)[]=[p=>p.target.subset='other',p=>p.profile='umf-binding-1',p=>p.elements[0].table=undefined,p=>p.elements[0].partition=null,p=>p.fields[0]={module:'sales',element:'orderId',storage:'embedded',documentColumn:'payload',path:['id']},p=>p.indexes=[{name:'pk',kind:'unique',unique:true,on:[{field:{module:'sales',element:'orderId'}}]}],p=>p.future={opaque:['retain']},p=>p.target.future='retain',p=>p.fields[0].future='retain'];
 for(const edit of edits){const {binding,logical,target}=setup();edit(payload(binding));if(payload(binding).elements[0].table===undefined)delete payload(binding).elements[0].table;const before=structuredClone(binding);
  expect(inspectRawTableBinding(binding,logical,target,'sales').valid).toBe(false);expect(binding).toEqual(before);
 }
 const {binding,logical}=setup();payload(binding).indexes=[{name:'pk',kind:'unique',unique:true,on:[{field:{module:'sales',element:'orderId'}}]}];
 expect(projectBindingIndexes(binding,logical,'strict').status).toBe('blocked');expect(projectBindingIndexes(binding,logical,'report').outcomes[0]!.outcome).toBe('unknown');
});

test('U-2: exact logical and module references, table and column collisions refuse',()=>{
 const changes:((b:Document,l:Document)=>void)[]=[(b,l)=>l.id='stale',(b)=>payload(b).logical.coreVersion='0.7.0',(b)=>payload(b).fields[0].element='missing',(b)=>payload(b).elements[0].element='orderId',(b,l)=>{l.modules[0]!.elements.push({id:'other',kind:'field',scalarType:'string',cardinality:'one',nullability:'required',extensions:{}} as any);payload(b).fields.push({module:'sales',element:'other',storage:'column',column:'order_id'});(l.modules[0]!.elements[1] as any).members.push({module:'sales',element:'other'});},(b,l)=>{l.modules[0]!.elements.push({...l.modules[0]!.elements[1],id:'Other'} as any);payload(b).elements.push({module:'sales',element:'Other',table:'orders'});}];
 for(const change of changes){const {binding,logical,target}=setup();change(binding,logical);expect(inspectRawTableBinding(binding,logical,target,'sales').valid).toBe(false);}
 const {binding,logical,target}=setup();expect(inspectRawTableBinding(binding,logical,target,'missing').valid).toBe(false);
});

test('U-2: hostile accessors are rejected without invocation',()=>{
 const {binding,logical,target}=setup();let calls=0;Object.defineProperty(binding,'extensions',{enumerable:true,get(){calls++;throw Error('invoked');}});
 expect(inspectRawTableBinding(binding,logical,target,'sales').valid).toBe(false);expect(calls).toBe(0);
 const fresh=setup();Object.defineProperty(fresh.target,'platform',{enumerable:true,get(){calls++;throw Error('invoked');}});
 expect(inspectRawTableBinding(fresh.binding,fresh.logical,fresh.target,'sales').valid).toBe(false);expect(calls).toBe(0);
});

test('U-2: partial declarations are admitted; selected ColumnSet coverage belongs to CONTRACT-070',()=>{
 const {binding,logical,target}=setup();payload(binding).fields=[];
 expect(inspectRawTableBinding(binding,logical,target,'sales').valid).toBe(true);
 delete (logical.modules[0]!.elements[1] as any).members;
 expect(inspectRawTableBinding(binding,logical,target,'sales').valid).toBe(false);
});

test('raw-profile factory delegates record membership to its injected inspector',()=>{
 const {binding,logical,target}=setup();let calls=0;
 const inspect=createRawTableBindingInspector((source,identity)=>{calls++;return inspectCoreRecordMembers(source,identity);});
 expect(inspect(binding,logical,target,'sales')).toEqual(inspectRawTableBinding(binding,logical,target,'sales'));
 expect(calls).toBe(1);
});

test('raw-profile factory preserves injected inspector error identity',()=>{
 const {binding,logical,target}=setup(),failure=new Error('injected membership inspection failure');let calls=0;
 const inspect=createRawTableBindingInspector(()=>{calls++;throw failure;});
 let caught:unknown;try{inspect(binding,logical,target,'sales');}catch(error){caught=error;}
 expect(calls).toBe(1);expect(caught).toBe(failure);
});
