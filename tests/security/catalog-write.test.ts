/** @covers US-079-AC7 @covers US-079-AC10 @covers US-079-AC16 */
import {test,expect} from 'bun:test';
import {catalogWriteFixture,deleteOwnedResource,storedWriteFixture} from './catalog-write-fixture';
import {compileRuntimeFixture} from './catalog-runtime-fixture';
import {evaluateCandidateCatalogWrite} from '../../src/extensions/security/catalog-write-candidate';
import {ref} from './fixture';
const run=(f:ReturnType<typeof catalogWriteFixture>)=>evaluateCandidateCatalogWrite(compileRuntimeFixture(f),f.owner,f.profile,f.request);
test('catalog transaction guard checks actual normalized original/proposed flat and graph records',()=>{
 for(const [graph,opaque] of [[false,false],[true,false],[true,true]]){const f=catalogWriteFixture(graph,opaque);expect(run(f)).toEqual({decision:'permit',complete:false,authority:false});f.request.after.facts.find((r:any)=>r.type.elementId==='Assignment').fields.find((p:any)=>p.field.elementId==='active').value={boolean:false};expect(run(f).decision).toBe('indeterminate');}
});
test('masked changes require exact per-Field blind designation and actual grant in every required state',()=>{
 const f=catalogWriteFixture();f.policy.rules[0].disclosure[0].disposition={kind:'withheld'};expect(run(f).decision).toBe('permit');const p=f.profile.types.find((p:any)=>p.type.elementId==='Resource');p.readProtection.blindWriteActions=[];expect(run(f).decision).toBe('deny');p.readProtection.blindWriteActions=[{field:ref('salary'),action:'blind-fields'}];f.policy.rules.find((r:any)=>r.id==='writer').actions=f.policy.rules.find((r:any)=>r.id==='writer').actions.filter((a:any)=>a!=='blind-fields');expect(run(f).decision).toBe('deny');
});
test('all-state ordinary grants and original visibility remain independently necessary',()=>{
 const f=catalogWriteFixture();f.profile.types.find((p:any)=>p.type.elementId==='Resource').readProtection.blindWriteActions=[];expect(run(f).decision).toBe('permit');f.policy.rules.find((r:any)=>r.id==='writer').target=[ref('Resource')];f.policy.rules.find((r:any)=>r.id==='writer').condition={op:'eq',left:{kind:'resource',field:ref('salary')},right:{kind:'constant',field:ref('salary'),value:{integerToken:'100'}}};expect(run(f).decision).toBe('deny');
});
test('every changed association Record receives its own Field protections',()=>{
 const f=deleteOwnedResource(catalogWriteFixture());expect(run(f).decision).toBe('permit');f.profile.types.find((p:any)=>p.type.elementId==='Ownership').readProtection.blindWriteActions=[];expect(run(f).decision).toBe('deny');f.request.mutations.pop();expect(run(f).decision).toBe('indeterminate');
});
test('graph role deltas require the fixed owner anchor and its own ownership grant',()=>{
 for(const opaque of [false,true]){const f=deleteOwnedResource(catalogWriteFixture(true,opaque));expect(run(f).decision).toBe('permit');f.policy.rules.push({id:'no-owner',effect:'forbid',actions:['change-owner'],target:[ref('Resource')],condition:{op:'literal',value:true}});expect(run(f).decision).toBe('deny');f.policy.rules.pop();f.profile.associations[0]={source:f.profile.associations[0].source,mode:'immutable'};expect(run(f).decision).toBe('indeterminate');}
});
test('opaque IDs never become cross-cut identity while endpoint multiplicity remains visible',()=>{
 const f=catalogWriteFixture(true,true);f.request.after.graphs[0].witness.id='renamed';expect(run(f).decision).toBe('permit');const extra=structuredClone(f.request.after.graphs[0]);extra.witness.id='parallel';f.request.after.graphs.push(extra);expect(run(f).decision).toBe('indeterminate');
});
test('complete comparison cuts, Subject/context/profiles and exact mutation inventory cannot be weakened',()=>{
 const changes=[(f:any)=>f.request.after.coverage.pop(),(f:any)=>f.request.after.coverage[0].fields.pop(),(f:any)=>f.request.after.subject.key=[{string:'missing'}],(f:any)=>f.request.after.facts[0].fields[0].value={string:'other'},(f:any)=>f.request.mutations.push(structuredClone(f.request.mutations[0])),(f:any)=>f.request.mutations[0].operation='create',(f:any)=>f.request.mutations[0].key=[{string:'other'}],(f:any)=>f.profile.associations.pop(),(f:any)=>f.profile.types[0].readProtection.readAction='update',(f:any)=>f.request.maxSteps=100];
 for(const change of changes){const f=catalogWriteFixture();change(f);expect(run(f)).toEqual({decision:'indeterminate',complete:false,authority:false});}
});

test('actual stored output-carrier changes require a present vault action and its grant in every required state',()=>{
 const f=storedWriteFixture();expect(run(f).decision).toBe('deny');f.policy.rules.push({id:'vault-permit',effect:'permit',actions:['vault-write'],target:[ref('Resource')],condition:{op:'literal',value:true}});expect(run(f).decision).toBe('permit');
 f.policy.rules.at(-1).condition={op:'eq',left:{kind:'resource',field:ref('token')},right:{kind:'constant',field:ref('token'),value:{string:'old-token'}}};expect(run(f).decision).toBe('deny');delete f.catalog.transforms[0].custody.vaultWriteAction;expect(run(f).decision).toBe('indeterminate');
});

test('mask equality never substitutes for original visibility and no-op updates invent no Field requirements',()=>{
 const f=catalogWriteFixture();f.profile.types.find((p:any)=>p.type.elementId==='Resource').readProtection.blindWriteActions=[];f.policy.rules[0].disclosure[0].disposition={kind:'transformed',transform:'constant',version:'0.1.0',field:ref('salary'),value:{integerToken:'100'}};expect(run(f).decision).toBe('deny');f.request.after=structuredClone(f.request.before);expect(run(f).decision).toBe('permit');
});
test('whole-cut create proves prior absence and guards every created association Record',()=>{
 const f=catalogWriteFixture();f.request.before.facts=f.request.before.facts.filter((r:any)=>!['Resource','Ownership'].includes(r.type.elementId));f.request.mutations[0].operation='create';f.request.mutations.push({operation:'create',type:ref('Ownership'),key:[{string:'o1'}]});Object.assign(f.profile.associations[0],{mode:'owned',ownerType:ref('Resource'),anchor:{kind:'endpoint',role:'resource'}});expect(run(f).decision).toBe('permit');f.request.mutations.pop();expect(run(f).decision).toBe('indeterminate');
});
test('both removed and added retargeting anchors must be explicitly checked',()=>{
 const f=catalogWriteFixture(true,true);f.policy.rules=f.policy.rules.filter((r:any)=>r.id!=='write-membership');for(const cut of [f.request.before,f.request.after]){const row=structuredClone(cut.facts.find((r:any)=>r.type.elementId==='Resource'));row.key=[{string:'r2'}];row.fields.find((p:any)=>p.field.elementId==='resourceId').value={string:'r2'};cut.facts.push(row);}Object.assign(f.profile.associations[0],{mode:'owned',ownerType:ref('Resource'),anchor:{kind:'endpoint',role:'resource'}});f.request.after.graphs[0].endpoints.find((e:any)=>e.role==='resource').key=[{string:'r2'}];expect(run(f).decision).toBe('indeterminate');f.request.mutations.push({operation:'update',type:ref('Resource'),key:[{string:'r2'}]});expect(run(f).decision).toBe('permit');
});
test('ordinary purpose classification cannot be relabelled as other or reused as an implicit blind route',()=>{
 const f=catalogWriteFixture();f.ontology.actionPurposes.find((a:any)=>a.action==='update').purposes=['other'];expect(run(f).decision).toBe('indeterminate');const g=catalogWriteFixture();g.ontology.actionPurposes.find((a:any)=>a.action==='blind-fields').purposes=['field','read'];expect(run(g).decision).toBe('indeterminate');const h=catalogWriteFixture();h.profile.types[0].readProtection.blindWriteActions[0].action='write-fields';expect(run(h).decision).toBe('indeterminate');
});
function attribute(f:any,type:string,name:string,scalarType:string,before:any,after:any){const elements=f.closure.documents[0].document.modules[0].elements;elements.push({id:name,kind:'field',scalarType,cardinality:'one',nullability:'required',extensions:{}});elements.find((e:any)=>e.id===type).members.push({module:'m',element:name});f.ontology.entities.find((e:any)=>e.type.elementId===type).fields.push({ref:ref(name),protection:'protected'});f.owner.storage.push({type:ref(type),field:ref(name),storageEffect:'canonical'});const p=f.profile.types.find((p:any)=>p.type.elementId===type);p.fieldActions.push({field:ref(name),action:'write-fields'});p.policyFields.push(ref(name));p.readProtection.blindWriteActions.push({field:ref(name),action:'blind-fields'});for(const [i,cut] of [f.request.before,f.request.after].entries()){cut.coverage.find((c:any)=>c.type.elementId===type).fields.push(ref(name));for(const row of cut.facts.filter((r:any)=>r.type.elementId===type))row.fields.push({field:ref(name),value:i?after:before});}}
test('a listed ordinary data mutation cannot rewrite current Subject attributes',()=>{
 const f=catalogWriteFixture();attribute(f,'Staff','authority-label','string',{string:'old'},{string:'new'});f.request.mutations.push({operation:'update',type:ref('Staff'),key:[{string:'alice'}]});expect(run(f).decision).toBe('indeterminate');
});
test('unused context and value-profile changes still violate the comparable authority-cut invariant',()=>{
 const f=catalogWriteFixture();f.closure.documents[0].document.modules[0].elements.push({id:'ctx',kind:'field',scalarType:'integer',cardinality:'one',nullability:'required',extensions:{}});f.ontology.context.push(ref('ctx'));f.request.before.context=[{field:ref('ctx'),value:{integerToken:'1'}}];f.request.after.context=[{field:ref('ctx'),value:{integerToken:'2'}}];expect(run(f).decision).toBe('indeterminate');const g=catalogWriteFixture();g.closure.documents[0].document.modules[0].elements.push({id:'date-dto',kind:'field',scalarType:'date',cardinality:'one',nullability:'required',extensions:{}});g.request.after.valueProfiles=[{field:ref('date-dto'),profile:'umf-gregorian-date/1.0.0'}];expect(run(g).decision).toBe('indeterminate');
});

test('known null compares without allowed-value identity and remains distinct from known absence',()=>{
 const f=catalogWriteFixture();attribute(f,'Resource','optional','boolean',null,null);f.closure.documents[0].document.modules[0].elements.find((e:any)=>e.id==='optional').nullability='absent-allowed';f.ontology.actions.push('write-optional');f.ontology.actionPurposes.push({action:'write-optional',purposes:['field']});f.profile.types.find((p:any)=>p.type.elementId==='Resource').fieldActions.find((p:any)=>p.field.elementId==='optional').action='write-optional';expect(run(f).decision).toBe('permit');const row=f.request.after.facts.find((r:any)=>r.type.elementId==='Resource');row.fields=row.fields.filter((p:any)=>p.field.elementId!=='optional');row.absent.push(ref('optional'));expect(run(f).decision).toBe('deny');
});
test('blind action IDs are distinct from ordinary routes across all type profiles',()=>{
 const f=catalogWriteFixture(),other=f.profile.types.find((p:any)=>p.type.elementId==='Ownership');other.readProtection.blindWriteActions=[];other.fieldActions[0].action='blind-fields';expect(run(f).decision).toBe('indeterminate');
});
test('delete retains declared ownership checks even when the owned incidence inventory is empty',()=>{
 const f=catalogWriteFixture(true,true);f.policy.rules=f.policy.rules.filter((r:any)=>r.id!=='write-membership');for(const cut of [f.request.before,f.request.after])cut.graphs=cut.graphs.filter((g:any)=>g.relationship.relationshipId!=='OwnedBy');f.request.after.facts=f.request.after.facts.filter((r:any)=>r.type.elementId!=='Resource');f.request.mutations[0].operation='delete';Object.assign(f.profile.associations[0],{mode:'owned',ownerType:ref('Resource'),anchor:{kind:'endpoint',role:'resource'}});expect(run(f).decision).toBe('permit');f.policy.rules.push({id:'no-empty-owner',effect:'forbid',actions:['change-owner'],target:[ref('Resource')],condition:{op:'literal',value:true}});expect(run(f).decision).toBe('deny');
});
test('Record-witness attribute changes need both their own Field guard and the association owner guard',()=>{
 const f=catalogWriteFixture(true);f.request.after.facts.find((r:any)=>r.type.elementId==='Ownership').fields.find((p:any)=>p.field.elementId==='ownerResource').value={string:'arbitrary-column'};f.request.mutations.push({operation:'update',type:ref('Ownership'),key:[{string:'o1'}]});Object.assign(f.profile.associations[0],{mode:'owned',ownerType:ref('Resource'),anchor:{kind:'endpoint',role:'resource'}});expect(run(f).decision).toBe('permit');f.profile.types.find((p:any)=>p.type.elementId==='Ownership').readProtection.blindWriteActions=[];expect(run(f).decision).toBe('deny');
});
