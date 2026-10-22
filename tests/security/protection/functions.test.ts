// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import type {Element} from '../../../src/model/types';
import {domainFixture,domainRef} from './domain-fixture';
import {evaluateProtectionValue,inspectProtectionFunction} from '../../../src/extensions/security/protection/functions';
import {GREGORIAN_DATE_PROFILE} from '../../../src/adapters/gregorian-date';
const field=(id:string,scalarType:string,extra:any={})=>({id,kind:'field',scalarType,cardinality:'one',nullability:'required',extensions:{},...extra});
function fixture(operation:string,input='string',output='string'){
 const f=domainFixture(),t=f.catalog.transforms[0],elements=f.closure.documents[0]!.document.modules[0]!.elements;
 const [kind,fn]=operation.split('/');t.kind=kind;t.function=fn;t.parameters=[];t.disclosureProfile=[];
 Object.assign(elements[0]!,field('input',input));Object.assign(elements[1]!,field('output',output));
 elements.push(field('text','string'),field('numeric','decimal',{facets:{precision:30,scale:2}}));return f;
}
const elementList=(f:ReturnType<typeof fixture>)=>f.closure.documents[0]!.document.modules[0]!.elements as unknown as Element[];
const parameter=(f:ReturnType<typeof fixture>,name:string,value:any,id='parameter')=>{f.catalog.transforms[0].parameters.push({name,field:domainRef(id),value});};
const number=(f:ReturnType<typeof fixture>,name:string,value:string)=>parameter(f,name,{integerToken:value});
const text=(f:ReturnType<typeof fixture>,name:string,value:string)=>parameter(f,name,{string:value},'text');
const run=(f:ReturnType<typeof fixture>,value:any)=>evaluateProtectionValue(f.policy,f.catalog,f.closure,{ruleIndex:0,disclosureIndex:0,value});
const ready=(f:ReturnType<typeof fixture>)=>inspectProtectionFunction(f.policy,f.catalog,f.closure,{ruleIndex:0,disclosureIndex:0});
const nullable=(f:ReturnType<typeof fixture>)=>{for(const index of [0,1])elementList(f)[index]!.nullability='absent-allowed';};

test('constant changes output family but always checks original input and output domain',()=>{
 const f=fixture('mask/constant','integer');text(f,'value','masked');expect(ready(f).status).toBe('reference-ready');
 const r=run(f,{integerToken:'9007199254740993'});expect(r.status).toBe('transformed');expect(r.value).toEqual({string:'masked'});expect([r.complete,r.authority]).toEqual([false,false]);expect(r.inputDomain).not.toEqual(r.outputDomain);
 expect(run(f,{string:'wrong input'}).status).toBe('refused');elementList(f)[0]!.scalarType='decimal';expect(ready(f).status).toBe('refused');elementList(f)[0]!.scalarType='integer';elementList(f)[1]!.scalarType='integer';expect(run(f,{integerToken:'1'}).status).toBe('refused');
});

test('null-out and constant null are transformed values and never bypass invalid inputs',()=>{
 const f=fixture('mask/null-out','integer');nullable(f);expect(run(f,{integerToken:'3'}).value).toBe(null);expect(run(f,{integerToken:'3'}).status).toBe('transformed');expect(run(f,{string:'wrong'}).status).toBe('refused');
 elementList(f)[1]!.nullability='required';expect(ready(f).status).toBe('refused');
 const c=fixture('mask/constant');nullable(c);parameter(c,'value',null,'output');expect(run(c,{string:'canonical'}).status).toBe('transformed');expect(run(c,{string:'canonical'}).value).toBe(null);
});

test('partial uses Unicode scalars without overlap and exposes short inputs explicitly',()=>{
 const f=fixture('mask/partial');number(f,'prefix','1e0');number(f,'suffix','1');text(f,'padding','*');text(f,'unit','unicode-scalar');
 expect(run(f,{string:'A😀e\u0301Z'}).value).toEqual({string:'A***Z'});
 expect(run(f,{string:'AB'}).value).toEqual({string:'AB'});expect(run(f,{string:'A'}).value).toEqual({string:'A'});expect(run(f,{string:''}).value).toEqual({string:''});
 nullable(f);expect(run(f,null).status).toBe('transformed');expect(run(f,null).value).toBe(null);
 f.catalog.transforms[0].parameters.pop();expect(run(f,null).status).toBe('refused');
});

test('fixed redaction and prefix use explicit units zero counts and output refinements',()=>{
 const f=fixture('mask/fixed-length-redact');number(f,'length','3');text(f,'padding','😀');text(f,'unit','unicode-scalar');
 expect(run(f,{string:'canonical'}).value).toEqual({string:'😀😀😀'});
 f.catalog.transforms[0].parameters[0].value={integerToken:'0'};expect(run(f,{string:'canonical'}).value).toEqual({string:''});
 elementList(f)[1]!.facets={length:{min:1,unit:'unicode-scalar'}};expect(run(f,{string:'canonical'}).status).toBe('refused');
 const p=fixture('generalize/prefix-only');number(p,'length','2');text(p,'unit','unicode-scalar');expect(run(p,{string:'😀a\u0301Z'}).value).toEqual({string:'😀a'});
});

test('numeric buckets floor negative values and retain exact large integers',()=>{
 const f=fixture('generalize/range-bucket','integer','integer');number(f,'width','10');number(f,'origin','3');expect(run(f,{integerToken:'-1'}).value).toEqual({integerToken:'-7'});
 f.catalog.transforms[0].parameters[0].value={integerToken:'2'};f.catalog.transforms[0].parameters[1].value={integerToken:'0'};expect(run(f,{integerToken:'9007199254740995'}).value).toEqual({integerToken:'9007199254740994'});
 f.catalog.transforms[0].parameters[0].value={integerToken:'0'};expect(ready(f).status).toBe('refused');
});

test('decimal bucket coefficients preserve scale and original spelling without rounding',()=>{
 const f=fixture('generalize/range-bucket','decimal','decimal');for(const i of [0,1])elementList(f)[i]!.facets={precision:30,scale:2};
 parameter(f,'width',{decimalToken:'0.25'},'numeric');parameter(f,'origin',{decimalToken:'0.10'},'numeric');
 const r=run(f,{decimalToken:'-0.010'});expect(r.status).toBe('transformed');expect(r.value).toEqual({decimalToken:'-15e-2'});expect(r.input).toEqual({decimalToken:'-0.010'});
 expect(run(f,{decimalToken:'0.001'}).status).toBe('refused');elementList(f)[1]!.facets={precision:30,scale:3};expect(ready(f).status).toBe('refused');
});

test('explicit Gregorian profile owns date truncation and refuses calendar/refinement substitution',()=>{
 const f=fixture('generalize/truncate-date','date','date');text(f,'calendar',GREGORIAN_DATE_PROFILE);text(f,'unit','quarter');
 expect(ready(f).status).toBe('reference-ready');const r=run(f,{date:'2000-02-29'});expect(r.value).toEqual({date:'2000-01-01'});expect(r.valueProfile).toBe(GREGORIAN_DATE_PROFILE);
 expect(run(f,{date:'1900-02-29'}).status).toBe('refused');expect(run(f,{timestamp:'2000-02-29T00:00:00Z'}).status).toBe('refused');
 nullable(f);expect(run(f,null).status).toBe('transformed');f.catalog.transforms[0].parameters[0].value={string:'inferred'};expect(run(f,null).status).toBe('refused');
});

test('closed signatures scalar domains exact source scope and immutable results refuse substitutions',()=>{
 const f=fixture('mask/constant');text(f,'value','shown');const r=run(f,{string:'canonical'});expect(Object.isFrozen(r)).toBe(true);f.catalog.transforms[0].parameters[0].value={string:'changed'};expect(r.value).toEqual({string:'shown'});
 for(const mutate of [(x:any)=>x.catalog.transforms[0].parameters.push({name:'extra',field:domainRef('text'),value:{string:'x'}}),(x:any)=>x.catalog.transforms[0].determinism='random',(x:any)=>x.closure.documents[0].document.modules[0].elements[0].cardinality='unspecified',(x:any)=>x.closure.documents[0].document.modules[0].elements[0].scalarType='timestamp',(x:any)=>x.catalog.revision='stale']){const x=structuredClone(f);mutate(x);expect(run(x,{string:'value'}).status).toBe('refused');}
 expect(evaluateProtectionValue(f.policy,f.catalog,f.closure,{ruleIndex:0,disclosureIndex:0}).status).toBe('refused');expect(evaluateProtectionValue(f.policy,f.catalog,f.closure,{ruleIndex:0,disclosureIndex:0,value:{string:'v'},allow:true}).status).toBe('refused');
});

test('bounds refuse before producing oversize output and unsupported/native recipes stay closed',()=>{
 const f=fixture('mask/fixed-length-redact');number(f,'length','2042');text(f,'padding','\n');text(f,'unit','unicode-scalar');const r=run(f,{string:'x'});expect(r.status).toBe('refused');expect(r.value).toBe(null);expect(r.diagnostics.some(d=>d.code==='PROTECTION_FUNCTION_BOUND')).toBe(true);
 f.catalog.transforms[0].parameters[0].value={integerToken:'4097'};expect(ready(f).status).toBe('refused');
 const regex=fixture('mask/regex-replace');expect(run(regex,{string:'x'}).status).toBe('refused');
});

test('selected policy Fields cannot be substituted for the declared transform domains',()=>{
 for(const side of ['input','output']){const f=fixture('mask/constant');text(f,'value','shown');const disclosure=f.policy.rules[0].disclosure[0];if(side==='input')disclosure.field=domainRef('text');else disclosure.disposition.field=domainRef('text');expect(ready(f).status).toBe('refused');expect(run(f,{string:'canonical'}).status).toBe('refused');}
});
