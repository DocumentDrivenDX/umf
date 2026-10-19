// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {domainFixture,domainRef} from './domain-fixture';
import {validateProtectionParameters} from '../../../src/extensions/security/protection/parameters';
import {inspectProtectionQueryProperties} from '../../../src/extensions/security/protection/queries';
import {LIMITS} from '../../../src/model/json';
const check=(f:ReturnType<typeof domainFixture>,operator:string,required:any[]= ['equality'])=>inspectProtectionQueryProperties(f.policy,f.catalog,f.closure,{ruleIndex:0,disclosureIndex:0,operator,required});
test('conditional properties exercise all five operators and never attest actual query lineage',()=>{
 // @covers US-079-AC13
 // @covers US-079-AC8
 for(const [operator,required] of [['predicate',['equality']],['join',['equality']],['group',['equality']],['order',['order']],['aggregate',['nullity']]] as [string,string[]][]){
  const f=domainFixture(),t=f.catalog.transforms[0];t.determinism='random';t.disclosureProfile=required;t.queryUse[operator]='disclosed';
  const result=check(f,operator,required);expect(result.status).toBe('compatible-properties');expect(result.authority).toBe(false);expect(result.complete).toBe(false);expect(result.use).toEqual({ruleIndex:0,disclosureIndex:0,operator,required});
  t.disclosureProfile=[];expect(check(f,operator,required).status).toBe('refused');
  delete t.queryUse[operator];expect(check(f,operator,required).status).toBe('prohibited');
 }
 const f=domainFixture();f.catalog.transforms[0].queryUse.predicate='disclosed';const conditional=check(f,'predicate',['equality']);expect(conditional.diagnostics.some(d=>d.code==='PROTECTION_QUERY_ASSUMPTIONS')).toBe(true);
});
test('mandatory requirements implied stability and original mode remain separate',()=>{
 const f=domainFixture(),t=f.catalog.transforms[0];t.disclosureProfile=[];t.queryUse={join:'disclosed',group:'disclosed',order:'disclosed',predicate:'original-authorized'};
 for(const operator of ['join','group']){const r=check(f,operator,['length']);expect(r.impliedProperties).toEqual(['equality']);expect(r.requiredProperties).toEqual(['length','equality']);expect(r.missingProperties).toEqual(['length']);expect(r.status).toBe('refused');}
 expect(check(f,'join').status).toBe('compatible-properties');expect(check(f,'order',['equality']).missingProperties).toContain('order');
 expect(check(f,'predicate',['format']).status).toBe('requires-original-action');
 t.determinism='keyed-deterministic';expect(check(f,'join').impliedProperties).toEqual(['equality']);
});
test('random tokens cannot disclose join or group even with an authored equality claim',()=>{
 // @covers US-079-AC14
 const f=domainFixture(),t=f.catalog.transforms[0];delete t.function;t.kind='tokenize';t.determinism='random';t.disclosureProfile=['equality'];t.queryUse={join:'disclosed',group:'disclosed'};t.custody={owner:'o',keyRef:'k',formatPreserving:false,storageEffect:'stored-transformed',propagation:{history:'h',snapshots:'s',exports:'e',feeds:'f',caches:'c'}};
 for(const operator of ['join','group']){const r=check(f,operator);expect(r.status).toBe('refused');expect(r.missingProperties).toEqual([]);expect(r.diagnostics.some(d=>d.code==='PROTECTION_RANDOM_TOKEN_QUERY')).toBe(true);}
 t.queryUse.join='original-authorized';expect(check(f,'join').status).toBe('requires-original-action');
});
test('parameterized properties use exact scope and original typed literal equality without rewriting source',()=>{
 const f=domainFixture(),t=f.catalog.transforms[0];t.queryUse.aggregate='disclosed';t.disclosureProfile=[{kind:'range',bucket:{field:domainRef('parameter'),value:{integerToken:'100'}}}];
 const required=[{kind:'range',bucket:{field:domainRef('parameter'),value:{integerToken:'1e2'}}}],original=structuredClone(f);
 const result=check(f,'aggregate',required);expect(result.status).toBe('compatible-properties');expect(result.catalog).toEqual(original.catalog);expect(f).toEqual(original);
 const different=[{kind:'range',bucket:{field:domainRef('input'),value:{integerToken:'100'}}}];expect(check(f,'aggregate',different).status).toBe('refused');
 t.disclosureProfile=[{kind:'prefix',length:10}];t.queryUse.predicate='disclosed';expect(check(f,'predicate',[{kind:'prefix',length:5}]).status).toBe('refused');
});
test('invalid dependencies source substitutions and indices refuse rather than issue a profile',()=>{
 const f=domainFixture();f.catalog.transforms[0].queryUse.join='disclosed';
 for(const use of [{ruleIndex:0,disclosureIndex:0,operator:'join',required:[]},{ruleIndex:0,disclosureIndex:0,operator:'future',required:['equality']},{ruleIndex:1,disclosureIndex:0,operator:'join',required:['equality']},{ruleIndex:0,disclosureIndex:0,operator:'join',required:['equality'],originalAction:'pretend'}])expect(inspectProtectionQueryProperties(f.policy,f.catalog,f.closure,use).status).toBe('refused');
 const stale=structuredClone(f);stale.catalog.revision='other';expect(check(stale,'join').status).toBe('refused');
 const unknown=structuredClone(f);unknown.catalog.transforms[0].future=true;expect(check(unknown,'join').status).toBe('refused');
});
test('typed parameters apply original literal semantics atomically and preserve unsupported values',()=>{
 // @covers US-079-AC11
 const f=domainFixture();expect(validateProtectionParameters(f.policy,f.catalog,f.closure).status).toBe('validated-parameters');
 for(const value of [{string:'wrong'},{integerToken:'1.1'}]){const bad=structuredClone(f);bad.catalog.transforms[0].parameters[0].value=value;const r=validateProtectionParameters(bad.policy,bad.catalog,bad.closure);expect(r.status).toBe('refused');expect(r.validated).toEqual([]);expect(r.catalog).toEqual(bad.catalog);}
 const unsupported=structuredClone(f);(unsupported.closure.documents[0]!.document.modules[0]!.elements[2]! as any).scalarType='float';unsupported.catalog.transforms[0].parameters[0].value={floatToken:'1'};unsupported.catalog.transforms[0].disclosureProfile=[];expect(validateProtectionParameters(unsupported.policy,unsupported.catalog,unsupported.closure).status).toBe('refused');
});
test('private literal ledgers refuse expansion and cumulative work without caller limit widening',()=>{
 const f=domainFixture();f.catalog.transforms[0].parameters[0].value={integerToken:'1e1000000'};
 const previous=LIMITS.maxTextLength;try{(LIMITS as {maxTextLength:number}).maxTextLength=8_000_000;const r=validateProtectionParameters(f.policy,f.catalog,f.closure);expect(r.status).toBe('refused');expect(r.validated).toEqual([]);expect(r.diagnostics.some(d=>d.code==='PROTECTION_LITERAL_BOUND')).toBe(true);}finally{(LIMITS as {maxTextLength:number}).maxTextLength=previous;}
 const work=domainFixture(),base=work.catalog.transforms[0];base.disclosureProfile=[];work.catalog.transforms=Array.from({length:20},(_,i)=>({...structuredClone(base),id:i===0?'transform':String(i),parameters:Array.from({length:32},(_,j)=>({name:String(j),field:domainRef('output'),value:{string:'x'.repeat(200)}}))}));
 const r=validateProtectionParameters(work.policy,work.catalog,work.closure);expect(r.status).toBe('refused');expect(r.validated).toEqual([]);expect(r.diagnostics.some(d=>d.code==='PROTECTION_LITERAL_BOUND')).toBe(true);
});
test('wire interpretation bounds refuse rather than trim and a known positive is checked',()=>{
 // @covers US-079-AC10
 const f=domainFixture(),base=f.catalog.transforms[0];
 const many=structuredClone(f);many.catalog.transforms=Array.from({length:257},(_,i)=>({...base,id:String(i)}));expect(validateProtectionParameters(many.policy,many.catalog,many.closure).status).toBe('refused');
 const params=structuredClone(f);params.catalog.transforms[0].parameters=Array.from({length:33},(_,i)=>({name:String(i),field:domainRef('parameter'),value:{integerToken:'1'}}));expect(validateProtectionParameters(params.policy,params.catalog,params.closure).status).toBe('refused');
 const literal=structuredClone(f);literal.catalog.transforms[0].parameters=[{name:'value',field:domainRef('output'),value:{string:'x'.repeat(4097)}}];expect(validateProtectionParameters(literal.policy,literal.catalog,literal.closure).status).toBe('refused');expect(validateProtectionParameters(f.policy,f.catalog,f.closure).status).toBe('validated-parameters');
});

test('parameter and query stages share the private literal budget',()=>{
 const f=domainFixture(),t=f.catalog.transforms[0],value={string:'x'.repeat(3000)};
 t.parameters=Array.from({length:30},(_,i)=>({name:String(i),field:domainRef('output'),value}));
 t.disclosureProfile=[{kind:'range',bucket:{field:domainRef('output'),value}}];t.queryUse.aggregate='disclosed';
 expect(validateProtectionParameters(f.policy,f.catalog,f.closure).status).toBe('validated-parameters');
 const r=check(f,'aggregate',t.disclosureProfile);expect(r.status).toBe('refused');expect(r.diagnostics.some(d=>d.code==='PROTECTION_LITERAL_BOUND')).toBe(true);
});
