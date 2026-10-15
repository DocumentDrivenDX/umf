// @covers US-079-AC3
import {test,expect} from 'bun:test';
import {securityFixture,ref} from './fixture';
import {migrateCandidateSecurityOntology} from '../../src/extensions/security/ontology-migration-candidate';
import {compileCandidateCatalogProgram,readCandidateCatalogProgram} from '../../src/extensions/security/catalog-program-candidate';
import {inspectProtectionCatalog} from '../../src/extensions/security/protection/catalog';
import {checkProtectionFunctionDefinitions,inspectProtectionFunction} from '../../src/extensions/security/protection/functions';
function fixture(){
 const f=securityFixture(),ontology:any=structuredClone(migrateCandidateSecurityOntology(f.resolution.ontology,'logical-v2').target),policy:any={...structuredClone(f.policy),version:'0.2.0',ontology:{documentId:'domain',revision:'logical-v2'}};
 ontology.actionPurposes=[{action:'read',purposes:['read']},{action:'update',purposes:['field']}];
 const documents:any=structuredClone(f.resolution.documents);documents[0].document.modules[0].elements.push({id:'shown',kind:'field',scalarType:'string',cardinality:'one',nullability:'required',extensions:{}});
 const closure={pins:[{documentId:'domain',revision:'schema-1'}],documents};
 const catalog:any={vocabulary:'umf.security.protection',version:'0.1.0',id:'catalog',revision:'c1',transforms:[{id:'mask',version:'1',kind:'mask',function:'constant',inputDomain:ref('salary'),outputDomain:ref('shown'),determinism:'deterministic',reversibility:'none',disclosureProfile:[],queryUse:{},parameters:[{name:'value',field:ref('shown'),value:{string:'hidden'}}]}]};
 policy.protection={id:'catalog',revision:'c1'};policy.rules[0].disclosure=[{field:ref('salary'),disposition:{kind:'transformed',vocabulary:'umf.security.protection',transform:'mask',version:'1',field:ref('shown')}}];
 return {policy,catalog,closure,ontology};
}
const compile=(f:ReturnType<typeof fixture>)=>compileCandidateCatalogProgram(f.policy,f.catalog,f.closure,f.ontology);
test('canonical catalog program retains actual source and compact lexical conditions in one shared closure',()=>{
 const f=fixture(),handle=compile(f),program=readCandidateCatalogProgram(handle);expect(program.policy.version).toBe('0.2.0');expect(program.catalog).toEqual(f.catalog);expect(program.definitions).toHaveLength(1);expect(program.conditions).toHaveLength(2);expect(program.conditions[0].scope).toBe(program.conditions[1].scope);expect(program.closure.documents).toBe(program.ontology.documents);expect(program.conditions[1].condition.expression.op).toBe('exists');expect(program.conditions[1].condition.expression.where.args[1].where.args[1].right.occurrence).toBe(0);expect(program.conditions[0].condition.ontology).toBeUndefined();expect(Object.isFrozen(program.policy.rules[0])).toBe(true);expect((handle as any).authority).toBe(false);
 f.catalog.transforms[0].parameters[0].value.string='changed';expect(program.catalog.transforms[0].parameters[0].value.string).toBe('hidden');expect(()=>readCandidateCatalogProgram(structuredClone(handle))).toThrow();
});
test('genuine no-catalog policies compile directly, including legacy inline constant meaning',()=>{
 const f=fixture();delete f.policy.protection;f.policy.rules[0].disclosure[0].disposition={kind:'transformed',transform:'constant',version:'0.1.0',field:ref('shown'),value:{string:'inline'}};
 const p=readCandidateCatalogProgram(compileCandidateCatalogProgram(f.policy,null,f.closure,f.ontology));expect(p.catalog).toBeNull();expect(p.definitions).toEqual([]);expect(p.policy.rules[0].disclosure[0].disposition.value).toEqual({string:'inline'});expect(()=>compile(f)).toThrow();
});
test('unused pure definitions are checked directly without inventing selected rules',()=>{
 const f=fixture();f.policy.rules=[];const result=checkProtectionFunctionDefinitions(f.policy,f.catalog,f.closure);expect(result.status).toBe('validated-parameters');expect(result.definitions).toHaveLength(1);expect(result.policy).toEqual(f.policy);expect((result.policy as any).rules).toEqual([]);expect(inspectProtectionFunction(f.policy,f.catalog,f.closure,{ruleIndex:0,disclosureIndex:0}).status).toBe('refused');expect(readCandidateCatalogProgram(compile(f)).conditions).toEqual([]);
 f.catalog.transforms[0].function='regex-replace';expect(inspectProtectionCatalog(f.catalog).valid).toBe(true);expect(checkProtectionFunctionDefinitions(f.policy,f.catalog,f.closure).status).toBe('refused');expect(()=>compile(f)).toThrow();
});
test('source pins, live ownership, exact recipe domains and unknown meaning refuse atomically',()=>{
 const mutate=[(f:any)=>f.policy.ontology.revision='stale',(f:any)=>f.closure.pins[0].revision='stale',(f:any)=>f.policy.protection.revision='stale',(f:any)=>f.policy.rules[0].disclosure[0].field=ref('shown'),(f:any)=>f.catalog.transforms[0].parameters[0].value={integerToken:'3'},(f:any)=>f.policy.rules[0].condition={op:'literal',value:false,unknown:true},(f:any)=>f.catalog.transforms.push({...f.catalog.transforms[0],id:'unused',function:'missing'}),(f:any)=>f.ontology.actionPurposes.pop(),(f:any)=>f.policy.rules[0].actions=['undeclared'],(f:any)=>f.policy.rules[0].target.push(ref('Staff'))];
 for(const m of mutate){const f=fixture();m(f);expect(()=>compile(f)).toThrow();}
});
test('rule-target expansion refuses before normalized condition construction',()=>{
 const f=fixture();delete f.policy.protection;f.policy.rules=Array.from({length:17},(_,i)=>({id:'r'+i,effect:'permit',actions:['read'],target:Array.from({length:256},()=>ref('Resource')),condition:{op:'literal',value:true}}));
 expect(()=>compileCandidateCatalogProgram(f.policy,null,f.closure,f.ontology)).toThrow('Rule-target expansion budget exhausted');
});

test('condition and inline literals consume one private normalization ledger across the program',()=>{
 const f=fixture();delete f.policy.protection;f.policy.rules=[{id:'numeric',effect:'permit',actions:['read'],target:[ref('Resource')],condition:{op:'eq',left:{kind:'constant',field:ref('salary'),value:{integerToken:'1e100000'}},right:{kind:'constant',field:ref('salary'),value:{integerToken:'1e100000'}}}}];
 expect(()=>compileCandidateCatalogProgram(f.policy,null,f.closure,f.ontology)).toThrow('resource-exhausted');
 f.policy.rules[0].condition={op:'literal',value:true};f.policy.rules[0].disclosure=[{field:ref('salary'),disposition:{kind:'transformed',transform:'constant',version:'0.1.0',field:ref('salary'),value:{integerToken:'1e100000'}}}];
 expect(()=>compileCandidateCatalogProgram(f.policy,null,f.closure,f.ontology)).toThrow('resource-exhausted');
});
test('explicit binding source is retained detached and endpoint correspondence is mandatory',()=>{
 const f=fixture(),bindings=[{ruleId:'membership',target:ref('Resource'),context:{resource:{association:ref('Ownership'),endpoint:'resource'}}}],program=readCandidateCatalogProgram(compileCandidateCatalogProgram(f.policy,f.catalog,f.closure,f.ontology,bindings));expect(program.bindings).toEqual(bindings);bindings[0]!.context.resource.endpoint='project';expect(program.bindings[0].context.resource.endpoint).toBe('resource');expect(()=>compileCandidateCatalogProgram(f.policy,f.catalog,f.closure,f.ontology,bindings)).toThrow();
});
test('whole catalog recipes share the parameter ledger and clear partial definitions on exhaustion',()=>{
 const f=fixture();f.policy.rules=[];f.catalog.transforms=Array.from({length:200},(_,i)=>({...structuredClone(f.catalog.transforms[0]),id:'unused-'+i,parameters:[{name:'value',field:ref('shown'),value:{string:'x'.repeat(300)}}]}));
 const result=checkProtectionFunctionDefinitions(f.policy,f.catalog,f.closure);expect(result.status).toBe('refused');expect(result.definitions).toEqual([]);expect(result.validated).toEqual([]);expect(result.diagnostics.some(d=>d.code==='PROTECTION_LITERAL_BOUND')).toBe(true);
 expect(inspectProtectionFunction({...f.policy,rules:[{id:'selected',effect:'permit',actions:['read'],target:[ref('Resource')],condition:{op:'literal',value:true},disclosure:[{field:ref('salary'),disposition:{kind:'transformed',vocabulary:'umf.security.protection',transform:'unused-0',version:'1',field:ref('shown')}}]}]},f.catalog,f.closure,{ruleIndex:0,disclosureIndex:0}).status).toBe('reference-ready');
});
