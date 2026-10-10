import {test,expect} from 'bun:test';
import sourceInput from '../spec/domain-packs/commerce/ontology.json';
import {inspectCoreEvolution,verifyCoreEvolution,coreEvolutionPolicySchema} from '../src/model/evolution';
import {validateCoreRecordValues} from '../src/model/record-values';
const policy={profile:'core-0.8-absent-string-additions/0.1'} as const;
const source=()=>structuredClone(sourceInput) as any;
function added(){const s=source(),m=s.modules.find((m:any)=>m.id==='domain');m.elements.push({id:'products.evolution_note',name:'evolution_note',kind:'field',scalarType:'string',cardinality:'one',nullability:'absent-allowed',extensions:{}});m.elements.find((e:any)=>e.id==='products').members.push({module:'domain',element:'products.evolution_note'});return s;}
test('exact source and absent addition preserve; original partial Record semantics retained',()=>{
 const before=source(),after=added();expect((inspectCoreEvolution(before,before,policy)as any).classification).toBe('preserved');
 const r=inspectCoreEvolution(before,after,policy)as any;expect(r.classification).toBe('preserved');expect(r.presenceChecks).toHaveLength(1);
 expect(r.presenceChecks[0]).toEqual(validateCoreRecordValues(after,{module:'domain',element:'products'},[{field:{module:'domain',element:'products.evolution_note'},state:'absent'}]));
 expect(r.presenceChecks[0].validation.valid).toBe(false);expect(r.presenceChecks[0].fields.find((f:any)=>f.field.element==='products.evolution_note').validation.valid).toBe(true);
 expect(verifyCoreEvolution(r,before,after,policy)).toEqual(r);
});
test('known type change breaks; unknown unchanged meaning stays unsupported',()=>{
 const before=source(),after=added();after.modules[0].elements.find((e:any)=>e.id==='order_lines.quantity').scalarType='string';expect((inspectCoreEvolution(before,after,policy)as any).classification).toBe('breaking');
 const unknown=source();unknown.opaque={keep:['雪',null]};const r=inspectCoreEvolution(unknown,unknown,policy)as any;expect(r.classification).toBe('unsupported');expect(r.before.opaque).toEqual(unknown.opaque);
});
test('forged original expectations, policy and result refuse',()=>{
 const b=source(),a=added(),r=inspectCoreEvolution(b,a,policy)as any;
 expect(()=>verifyCoreEvolution(r,a,a,policy)).toThrow();expect(()=>verifyCoreEvolution({...r,complete:false},b,a,policy)).toThrow();expect(()=>inspectCoreEvolution(b,a,{...policy,extra:true}as any)).toThrow();
});
test('required addition, reordered members and changed facet do not preserve',()=>{
 const b=source(),a=added();a.modules[0].elements.at(-1).nullability='required';expect((inspectCoreEvolution(b,a,policy)as any).classification).toBe('breaking');
 const reversed=source();reversed.modules[0].elements.find((e:any)=>e.id==='products').members.reverse();expect((inspectCoreEvolution(b,reversed,policy)as any).classification).not.toBe('preserved');
 const changed=source();changed.modules[0].elements.find((e:any)=>e.id==='products.unit_price').facets.scale=1;expect((inspectCoreEvolution(b,changed,policy)as any).classification).toBe('breaking');
});
test('resource and accessor refusal precede any accepted receipt',()=>{
 const b=source(),a=source();a.opaque='x'.repeat(4000001);expect(()=>inspectCoreEvolution(b,a,policy)).toThrow();const c:any={};Object.defineProperty(c,'id',{enumerable:true,get(){throw Error('accessed')}});expect(()=>inspectCoreEvolution(c,b,policy)).toThrow();
});

test('known breaking changes retain unknown residuals; wrong versions and identity refuse preservation',()=>{
 const b=source(),a=source();a.opaque={native:'uninterpreted'};a.modules[0].elements.find((e:any)=>e.id==='order_lines.quantity').scalarType='string';const r=inspectCoreEvolution(b,a,policy)as any;expect(r.classification).toBe('breaking');expect(r.residuals.some((x:string)=>x.includes('Unknown'))).toBe(true);
 const identity=source();identity.id='urn:other';expect((inspectCoreEvolution(b,identity,policy)as any).classification).toBe('breaking');
 const old=source();old.umf='0.7.0';expect(()=>inspectCoreEvolution(old,b,policy)).toThrow();
});
test('schema exports are snapshots and original inputs/results are independent copies',()=>{
 const b=source(),a=added(),r=inspectCoreEvolution(b,a,policy)as any;const before=JSON.stringify(r);a.modules[0].elements.pop();expect(JSON.stringify(r)).toBe(before);expect(()=>verifyCoreEvolution(r,b,a,policy)).toThrow();
});

test('exported schema mutation does not loosen private admission',()=>{
 const old=coreEvolutionPolicySchema.additionalProperties;try{coreEvolutionPolicySchema.additionalProperties=true;expect(()=>inspectCoreEvolution(source(),source(),{...policy,extra:1}as any)).toThrow();}finally{coreEvolutionPolicySchema.additionalProperties=old;}
});
test('duplicate additions, changed Keys/defaults, and present-null are not absent preservation',()=>{
 const b=source(),a=added();a.modules[0].elements.find((e:any)=>e.id==='products').members.push({module:'domain',element:'products.evolution_note'});expect(()=>inspectCoreEvolution(b,a,policy)).toThrow();
 const k=source();k.modules[0].elements.find((e:any)=>e.id==='products').keys[0].name='changed';expect((inspectCoreEvolution(b,k,policy)as any).classification).toBe('breaking');
 const d=added();d.modules[0].elements.at(-1).default={kind:'literal',value:{string:'synthetic'}};expect(()=>inspectCoreEvolution(b,d,policy)).toThrow();
 const aa=added();const absent=validateCoreRecordValues(aa,{module:'domain',element:'products'},[{field:{module:'domain',element:'products.evolution_note'},state:'absent'}]);const present=validateCoreRecordValues(aa,{module:'domain',element:'products'},[{field:{module:'domain',element:'products.evolution_note'},state:'present',value:null}]);expect(absent.fields.at(-1)?.validation.valid).toBe(true);expect(present.fields.at(-1)?.state).toBe('present');expect(absent.fields.at(-1)?.state).toBe('absent');expect(present.values.at(-1)).not.toEqual(absent.values.at(-1));
});

test('oversized forged receipt refuses streaming before whole serialization',()=>{
 const b=source(),a=added(),r=inspectCoreEvolution(b,a,policy)as any;r.opaque='x'.repeat(8000000);
 const original=JSON.stringify;let wholeCalls=0;JSON.stringify=function(value:any,...rest:any[]){if((typeof value==='string'&&value.length>4000000)||(value&&typeof value==='object'&&value.opaque?.length>4000000)){wholeCalls++;throw Error('WHOLE_OVERSIZED_SERIALIZATION');}return original(value,...rest as []);}as typeof JSON.stringify;
 try{expect(()=>verifyCoreEvolution(r,b,a,policy)).toThrow('serialized bytes exceeded');expect(wholeCalls).toBe(0);}finally{JSON.stringify=original;}
});
test('aggregate sources are byte bounded before semantic validation',()=>{
 const before=source(),after=source();before.opaque='a'.repeat(2100000);after.opaque='b'.repeat(2100000);expect(()=>inspectCoreEvolution(before,after,policy)).toThrow('serialized bytes exceeded');
});

test('oversized policy text refuses before const canonicalization',()=>{
 const original=JSON.stringify;let wholeCalls=0;JSON.stringify=function(value:any,...rest:any[]){if(typeof value==='string'&&value.length>4000000){wholeCalls++;throw Error('WHOLE_OVERSIZED_STRING');}return original(value,...rest as []);}as typeof JSON.stringify;
 try{expect(()=>inspectCoreEvolution(source(),source(),{profile:'x'.repeat(8000000)}as any)).toThrow('serialized bytes exceeded');expect(wholeCalls).toBe(0);}finally{JSON.stringify=original;}
});

test('valid cross-module additions are explicitly unsupported and wholly retained',()=>{
 const before=source();before.modules.push({id:'other',namespace:'urn:other',elements:[],relationships:[],extensions:{}});const after=structuredClone(before);
 after.modules[1].elements.push({id:'note',name:'note',kind:'field',scalarType:'string',cardinality:'one',nullability:'absent-allowed',extensions:{}});
 after.modules[0].elements.find((e:any)=>e.id==='products').members.push({module:'other',element:'note'});
 const r=inspectCoreEvolution(before,after,policy)as any;expect(r.beforeValidation.complete).toBe(true);expect(r.afterValidation.complete).toBe(true);expect(r.classification).toBe('unsupported');expect(r.before).toEqual(before);expect(r.after).toEqual(after);expect(r.presenceChecks).toHaveLength(0);
});
test('duplicate presentation names retain distinct qualified admitted identities',()=>{
 const before=source(),after=added(),module=after.modules[0];module.elements.at(-1).name='repeated';module.elements.push({...module.elements.at(-1),id:'products.second_note'});module.elements.find((e:any)=>e.id==='products').members.push({module:'domain',element:'products.second_note'});
 const r=inspectCoreEvolution(before,after,policy)as any;expect(r.classification).toBe('preserved');expect(r.presenceChecks).toHaveLength(2);expect(r.changes[0].afterPath).not.toBe(r.changes[1].afterPath);
});
test('new known annotations outside the closed profile remain retained unsupported',()=>{
 const before=source(),after=added();after.modules[0].elements.at(-1).description='Retained known metadata';const r=inspectCoreEvolution(before,after,policy)as any;expect(r.classification).toBe('unsupported');expect(r.after).toEqual(after);
});
test('semantic work exhaustion refuses without raising value or byte limits',()=>{
 const before=source(),after=source();for(let i=0;i<1000;i++)after.modules[0].elements.push({id:'extra'+i,name:'extra',kind:'field',scalarType:'string',cardinality:'one',nullability:'absent-allowed',extensions:{}});expect(()=>inspectCoreEvolution(before,after,policy)).toThrow('budget exceeded');
});
