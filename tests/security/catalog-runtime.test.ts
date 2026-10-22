// SPDX-License-Identifier: MIT OR Apache-2.0
// @covers US-079-AC3
// @covers US-079-AC4
// @covers US-079-AC5
// @covers US-079-AC6
// @covers US-079-AC10
import {test,expect} from 'bun:test';
import {GREGORIAN_DATE_PROFILE} from '../../src/adapters/gregorian-date';
import {ref} from './fixture';
import {catalogRuntimeFixture,graphRuntimeFixture,compileRuntimeFixture} from './catalog-runtime-fixture';
import {evaluateCandidateCatalogAction} from '../../src/extensions/security/catalog-runtime-candidate';
const run=(f:ReturnType<typeof catalogRuntimeFixture>)=>evaluateCandidateCatalogAction(compileRuntimeFixture(f),f.owner,f.cut,f.request);
test('canonical logical kernel evaluates the actual Staff/project membership and original disposition',()=>{
 const f=catalogRuntimeFixture(),r=run(f);expect(r.status).toBe('evaluated');expect(r.rows).toEqual([{decision:'permit',dispositions:[{field:ref('salary'),disposition:{kind:'original'}}]}]);expect([r.complete,r.authority]).toEqual([false,false]);expect(Object.isFrozen(r.rows)).toBe(true);
 f.cut.facts.find((x:any)=>x.type.elementId==='Assignment').fields.find((x:any)=>x.field.elementId==='active').value={boolean:false};expect(run(f).rows[0]!.decision).toBe('deny');
});
test('directed graph Record and opaque witnesses use native roles, not arbitrary member Fields',()=>{
 for(const opaque of [false,true]){const f=graphRuntimeFixture(opaque);expect(run(f).rows[0]!.decision).toBe('permit');
  f.cut.facts.find((x:any)=>x.type.elementId==='Ownership').fields.find((x:any)=>x.field.elementId==='ownerResource').value={string:'unrelated-column'};expect(run(f).rows[0]!.decision).toBe('permit');
  f.cut.graphs=[];expect(run(f).rows[0]!.decision).toBe('deny');
 }
});
test('graph completeness is separate from endpoint inventory and preflights empty and false branches',()=>{
 const f=graphRuntimeFixture();f.cut.graphCoverage=[];expect(run(f).status).toBe('refused');f.request.resources=[];expect(run(f).status).toBe('refused');
 f.policy.rules[1].condition={op:'and',args:[{op:'literal',value:false},f.policy.rules[1].condition]};expect(run(f).status).toBe('refused');
 const g=graphRuntimeFixture();g.request.resources=[];expect(run(g)).toMatchObject({status:'evaluated',rows:[]});g.cut.graphCoverage[1].roles=[];expect(run(g).status).toBe('refused');
});
test('graph witness attributes require their actual Record fact and independent coverage',()=>{
 for(const change of [(f:any)=>f.cut.graphCoverage[1].fields=[],(f:any)=>f.cut.facts=f.cut.facts.filter((r:any)=>r.type.elementId!=='Assignment'),(f:any)=>f.cut.coverage.find((r:any)=>r.type.elementId==='Assignment').fields=[],(f:any)=>f.cut.graphs[1].witness={kind:'opaque-existential',id:'a1'},(f:any)=>f.cut.graphs[1].endpoints[0].key=[{string:'missing'}]]){const f=graphRuntimeFixture();change(f);expect(run(f).status).toBe('refused');}
});
test('distinct parallel Record witnesses survive and duplicate or contradictory witnesses refuse',()=>{
 const f=graphRuntimeFixture(),relation=f.ontology.associations[1].relationship;
 f.policy.rules=[{id:'two',effect:'permit',actions:['read'],target:[ref('Resource')],disclosure:[{field:ref('salary'),disposition:{kind:'original'}}],condition:{op:'exists',association:relation,as:'a',where:{op:'exists',association:relation,as:'b',where:{op:'not',arg:{op:'eq',left:{kind:'variable',name:'a',identity:true},right:{kind:'variable',name:'b',identity:true}}}}}}];
 expect(run(f).rows[0]!.decision).toBe('deny');const row=structuredClone(f.cut.facts.find((r:any)=>r.type.elementId==='Assignment'));row.key=[{string:'a2'}];row.fields.find((p:any)=>p.field.elementId==='assignmentId').value={string:'a2'};f.cut.facts.push(row);const edge=structuredClone(f.cut.graphs[1]);edge.witness.key=[{string:'a2'}];f.cut.graphs.push(edge);expect(run(f).rows[0]!.decision).toBe('permit');f.cut.graphs.push(structuredClone(edge));expect(run(f).status).toBe('refused');
});
test('typed null is known while absence remains unknown and a missing projection refuses',()=>{
 const f=catalogRuntimeFixture(),field=f.closure.documents[0].document.modules[0].elements.find((e:any)=>e.id==='salary'),row=f.cut.facts.find((r:any)=>r.type.elementId==='Resource');field.nullability='absent-allowed';
 f.policy.rules[0].condition={op:'eq',left:{kind:'resource',field:ref('salary')},right:{kind:'constant',field:ref('salary'),value:null}};row.fields.find((p:any)=>p.field.elementId==='salary').value=null;expect(run(f).rows[0]!.decision).toBe('permit');row.fields=row.fields.filter((p:any)=>p.field.elementId!=='salary');row.absent=[ref('salary')];expect(run(f).rows[0]!.decision).toBe('indeterminate');row.absent=[];expect(run(f).status).toBe('refused');
});
test('source/owner pins, storage coverage, fact identity and all operation bounds refuse atomically',()=>{
 const changes=[(f:any)=>f.cut.owner.revision='stale',(f:any)=>f.cut.policy.revision='stale',(f:any)=>f.cut.domains=[],(f:any)=>f.cut.generation='changed',(f:any)=>f.owner.storage.pop(),(f:any)=>f.cut.facts.push(structuredClone(f.cut.facts[0])),(f:any)=>f.cut.facts[0].fields[0].value={string:'wrong-key'},(f:any)=>f.cut.maxFacts=3,(f:any)=>f.cut.maxSteps=1,(f:any)=>f.request.targets=[],(f:any)=>f.cut.subject.key=[{string:'missing'}]];
 for(const change of changes){const f=catalogRuntimeFixture();change(f);expect(run(f)).toMatchObject({status:'refused',rows:[],authority:false});}
 const f=catalogRuntimeFixture();expect(evaluateCandidateCatalogAction({kind:'candidate-catalog-program/0.1'},f.owner,f.cut,f.request).status).toBe('refused');let calls=0;const hostile={get version(){calls++;return 'bad';}};expect(evaluateCandidateCatalogAction(compileRuntimeFixture(f),hostile,f.cut,f.request).status).toBe('refused');expect(calls).toBe(0);
});
test('catalog transform identity governs conflicts and withheld dominates without rendering values',()=>{
 const f=catalogRuntimeFixture();f.closure.documents[0].document.modules[0].elements.push({id:'shown',kind:'field',scalarType:'string',cardinality:'one',nullability:'required',extensions:{}});
 const transform=(id:string)=>({id,version:'1',kind:'mask',function:'constant',inputDomain:ref('salary'),outputDomain:ref('shown'),determinism:'deterministic',reversibility:'none',disclosureProfile:[],queryUse:{},parameters:[{name:'value',field:ref('shown'),value:{string:'same'}}]});
 f.catalog={vocabulary:'umf.security.protection',version:'0.1.0',id:'c',revision:'1',transforms:[transform('a'),transform('b')]};f.policy.protection={id:'c',revision:'1'};f.cut.protection={id:'c',revision:'1'};
 const disposition=(name:string)=>({kind:'transformed',vocabulary:'umf.security.protection',transform:name,version:'1',field:ref('shown')});f.policy.rules[0].disclosure[0].disposition=disposition('a');
 const permit=structuredClone(f.policy.rules[0]);permit.id='second';permit.disclosure[0].disposition=disposition('b');f.policy.rules.push(permit);expect(run(f).rows[0]).toEqual({decision:'conflict',dispositions:[]});
 const withheld=structuredClone(permit);withheld.id='withheld';withheld.disclosure[0].disposition={kind:'withheld'};f.policy.rules.push(withheld);expect(run(f).rows[0]).toEqual({decision:'permit',dispositions:[{field:ref('salary'),disposition:{kind:'withheld'}}]});
 f.policy.rules.pop();permit.disclosure[0].disposition=disposition('a');expect(run(f).rows[0]!.decision).toBe('permit');expect((run(f).rows[0]!.dispositions[0] as any).disposition).toEqual(disposition('a'));
});
test('withheld disposition does not invent a plaintext projection dependency',()=>{
 const f=catalogRuntimeFixture();f.policy.rules[0].disclosure[0].disposition={kind:'withheld'};f.cut.facts.find((r:any)=>r.type.elementId==='Resource').fields.pop();f.cut.coverage.find((r:any)=>r.type.elementId==='Resource').fields=[ref('resourceId')];expect(run(f).rows[0]!.decision).toBe('permit');
});
test('actual stored output-domain Fields require exact exhaustive owner classification and never infer vault permission',()=>{
 const f=catalogRuntimeFixture(),elements=f.closure.documents[0].document.modules[0].elements;elements.push({id:'clear',kind:'field',scalarType:'integer',cardinality:'one',nullability:'required',extensions:{}},{id:'token',kind:'field',scalarType:'string',cardinality:'one',nullability:'required',extensions:{}});elements.find((e:any)=>e.id==='Resource').members.push({module:'m',element:'token'});f.ontology.entities.find((e:any)=>e.type.elementId==='Resource').fields.push({ref:ref('token'),protection:'protected'});
 f.ontology.actions.push('reverse','vault-write');f.ontology.actionPurposes.push({action:'reverse',purposes:['reverse']},{action:'vault-write',purposes:['vault-write']});
 f.catalog={vocabulary:'umf.security.protection',version:'0.1.0',id:'stored',revision:'1',transforms:[{id:'vault',version:'1',kind:'tokenize',inputDomain:ref('clear'),outputDomain:ref('token'),determinism:'random',reversibility:'vault',reverseAction:'reverse',disclosureProfile:[],queryUse:{},parameters:[],custody:{owner:'host',vaultRef:'vault',vaultWriteAction:'vault-write',formatPreserving:false,storageEffect:'stored-transformed',propagation:{history:'declared',snapshots:'declared',exports:'declared',feeds:'declared',caches:'declared'}}}]};f.policy.protection={id:'stored',revision:'1'};f.cut.protection={id:'stored',revision:'1'};f.policy.rules[0].disclosure=[{field:ref('token'),disposition:{kind:'original'}}];f.request.fields=[ref('token')];f.cut.facts.find((r:any)=>r.type.elementId==='Resource').fields.push({field:ref('token'),value:{string:'opaque-token'}});f.cut.coverage.find((r:any)=>r.type.elementId==='Resource').fields.push(ref('token'));
 const binding={type:ref('Resource'),field:ref('token'),storageEffect:'stored-transformed',storageTransform:{id:'vault',version:'1'}};f.owner.storage.push(binding);expect(run(f).rows[0]).toEqual({decision:'permit',dispositions:[{field:ref('token'),disposition:{kind:'original'}}]});
 f.request.action='vault-write';expect(run(f).rows[0]!.decision).toBe('deny');f.request.action='read';binding.storageTransform.id='wrong';expect(run(f).status).toBe('refused');binding.storageTransform.id='vault';(binding as any).storageEffect='canonical';delete (binding as any).storageTransform;expect(run(f).status).toBe('refused');f.owner.storage.pop();expect(run(f).status).toBe('refused');
});
test('normalized duplicate numeric keys and conflicting known key projections refuse',()=>{
 const f=catalogRuntimeFixture(),elements=f.closure.documents[0].document.modules[0].elements;for(const name of ['projectId','ownerProject','assignmentProject'])elements.find((e:any)=>e.id===name).scalarType='integer';
 const p=f.cut.facts.find((r:any)=>r.type.elementId==='Project');p.key=[{integerToken:'1e0'}];p.fields[0].value={integerToken:'1'};for(const r of f.cut.facts)for(const x of r.fields)if(['ownerProject','assignmentProject'].includes(x.field.elementId))x.value={integerToken:'1.0'};expect(run(f).rows[0]!.decision).toBe('permit');const duplicate=structuredClone(p);duplicate.key=[{integerToken:'1'}];f.cut.facts.push(duplicate);expect(run(f).status).toBe('refused');f.cut.facts.pop();p.fields[0].value={integerToken:'2'};expect(run(f).status).toBe('refused');
});
test('Gregorian values including null require an explicit exact operation profile',()=>{
 const f=catalogRuntimeFixture(),salary=f.closure.documents[0].document.modules[0].elements.find((e:any)=>e.id==='salary'),cell=f.cut.facts.find((r:any)=>r.type.elementId==='Resource').fields.find((p:any)=>p.field.elementId==='salary');salary.scalarType='date';cell.value={date:'2024-02-29'};expect(run(f).status).toBe('refused');f.cut.valueProfiles=[{field:ref('salary'),profile:GREGORIAN_DATE_PROFILE}];expect(run(f).rows[0]!.decision).toBe('permit');cell.value={date:'2023-02-29'};expect(run(f).status).toBe('refused');salary.nullability='absent-allowed';cell.value=null;expect(run(f).rows[0]!.decision).toBe('permit');f.cut.valueProfiles=[];expect(run(f).status).toBe('refused');
});

test('non-record reference metadata preserves the original primitive Field domain',()=>{
 const f=catalogRuntimeFixture();f.closure.documents[0].document.modules[0].elements.find((e:any)=>e.id==='salary').references=[{role:'related',module:'m',element:'Project'}];f.policy.rules[0].condition={op:'eq',left:{kind:'resource',field:ref('salary')},right:{kind:'constant',field:ref('salary'),value:{integerToken:'100'}}};expect(run(f).rows[0]!.decision).toBe('permit');
});

test('flat and graph endpoint domains preserve differing opaque reference metadata',()=>{
 for(const graph of [false,true]){
  const f=graph?graphRuntimeFixture():catalogRuntimeFixture(),elements=f.closure.documents[0].document.modules[0].elements;
  elements.find((e:any)=>e.id==='staffId').references=[{role:'source-note',module:'m',element:'Project'}];
  elements.find((e:any)=>e.id==='assignmentStaff').references=[{role:'different-note',module:'m',element:'Resource'}];
  expect(run(f).rows[0]!.decision).toBe('permit');
 }
});

test('endpoint record-type semantics and malformed opaque references refuse source compilation',()=>{
 for(const references of [[{role:'record-type',module:'m',element:'Project'}],[{role:'source-note',module:'m',element:'Project',extra:true}],[{role:'source-note',module:'m',element:3}]]){
  for(const graph of [false,true]){const f=graph?graphRuntimeFixture():catalogRuntimeFixture();f.closure.documents[0].document.modules[0].elements.find((e:any)=>e.id==='staffId').references=references;expect(()=>compileRuntimeFixture(f)).toThrow();}
 }
});
