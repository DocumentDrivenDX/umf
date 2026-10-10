import {resolveCandidateRecordAssociationChecks,resolveCandidateGraphRelationshipChecks,resolveCandidateAssociationChecks} from '../../src/extensions/security/association-checks';
import {resolveCandidateRecordAssociation,requireCandidateEndpointDomainCorrespondence,requireCandidateAssociationClassifications,checkCandidateRecordClassifications} from '../../src/extensions/security/association-candidate';
import {test,expect} from 'bun:test';
import Ajv2020 from 'ajv/dist/2020';
import schema from '../../docs/helix/02-design/spikes/security/association-selector.schema.json';
import {securityFixture} from './fixture';
const validate=new Ajv2020({strict:true}).compile<any>(schema);
test('shared draft selector represents original member-backed associations without inferred graph refs',()=>{
 const {resolution}=securityFixture();
 for(const association of resolution.ontology.associations){
  const selector={kind:'record-members',type:association.type,keyId:association.keyId,endpoints:association.endpoints};
  const before=JSON.stringify(selector);expect(validate(selector)).toBe(true);expect(JSON.stringify(selector)).toBe(before);
  expect(validate({...selector,relationship:{documentId:'d',moduleId:'m',relationshipId:association.type.elementId}})).toBe(false);
  expect(validate({...selector,endpoints:selector.endpoints.map(e=>({...e,side:'source'}))})).toBe(false);
 }
});
test('shared selector keeps graph references and endpoint representation distinct',()=>{
 const ref={documentId:'d',moduleId:'m',elementId:'Staff'};
 const graph={kind:'core-relationship',relationship:{documentId:'d',moduleId:'m',relationshipId:'Staff'},witness:{kind:'opaque-existential'},endpoints:[{role:'staff',side:'source',target:ref,keyId:'key'},{role:'project',side:'target',target:{...ref,elementId:'Project'},keyId:'key'}]};
 expect(validate(graph)).toBe(true);
 for(const invalid of [
  {...graph,relationship:ref},
  {...graph,type:ref},
  {...graph,endpoints:graph.endpoints.map(e=>({...e,fields:[ref]}))},
  {...graph,kind:'record-members'},
  {...graph,witness:{kind:'opaque-existential',keyId:'key'}},
  {...graph,future:true}
 ])expect(validate(invalid)).toBe(false);
 // This is intentionally only a grammar check. Duplicate roles and wrong
 // source references still require semantic admission against pinned documents.
 expect(validate({...graph,endpoints:[graph.endpoints[0],graph.endpoints[0]]})).toBe(true);
});

test('member-backed source correspondence retains original Keys and refuses wrong owners',()=>{
 const {resolution}=securityFixture(),a=resolution.ontology.associations[1]!,source=resolution.documents[0]!.document;
 const selector={kind:'record-members',type:a.type,keyId:a.keyId,endpoints:a.endpoints},entities=resolution.ontology.entities.map(e=>({type:e.type,keyId:e.keyId}));
 const plan=resolveCandidateRecordAssociation(selector,source,entities);
 expect(plan.type).toEqual(a.type);expect(plan.endpoints[0]!.fields).toEqual(a.endpoints[0]!.fields);expect(Object.isFrozen(plan.endpoints[0]!.fields)).toBe(true);
 for(const mutate of [
  (s:any)=>s.endpoints[1].role=s.endpoints[0].role,
  (s:any)=>s.endpoints[0].fields[0].elementId='staffId',
  (s:any)=>s.endpoints[0].fields[0].documentId='foreign',
  (s:any)=>s.endpoints[0].fields=[],
  (s:any)=>s.keyId='missing'
 ]){const s=structuredClone(selector);mutate(s);expect(()=>resolveCandidateRecordAssociation(s,source,entities)).toThrow();}
 selector.endpoints[0]!.fields[0]!.elementId='changed';expect(plan.endpoints[0]!.fields[0]!.elementId).toBe('assignmentStaff');
});

test('member-backed mapping has the same 256 component bound as the draft schema',()=>{
 for(const size of [256,257]){
  const {resolution}=securityFixture(),document=resolution.documents[0]!.document,a=resolution.ontology.associations[1]!,elements=document.modules[0]!.elements;
  const target:any=elements.find(e=>e.id==='Staff')!,association:any=elements.find(e=>e.id==='Assignment')!;
  const refs=Array.from({length:size},(_,i)=>({module:'m',element:'part'+i}));target.members=refs;target.keys![0]!.fields=refs;association.members=[...association.members!,...refs];
  const selector={kind:'record-members',type:a.type,keyId:a.keyId,endpoints:[{role:'staff',target:a.endpoints[0]!.target,fields:refs.map(r=>({documentId:document.id,moduleId:r.module,elementId:r.element}))}]},entities=resolution.ontology.entities.map(e=>({type:e.type,keyId:e.keyId}));
  expect(validate(selector)).toBe(size===256);
  if(size===256)expect(()=>resolveCandidateRecordAssociation(selector,document,entities)).not.toThrow();else expect(()=>resolveCandidateRecordAssociation(selector,document,entities)).toThrow();
 }
});

test('endpoint equality domains resolve from issued snapshot and reject mismatches or unresolved meaning',()=>{
 for(const mutation of ['none','scalar','missing','facet','extension']){
  const {resolution}=securityFixture(),document=resolution.documents[0]!.document,a=resolution.ontology.associations[1]!,field:any=document.modules[0]!.elements.find(e=>e.id==='assignmentStaff');
  if(mutation==='scalar')field.scalarType='integer';
  if(mutation==='missing')document.modules[0]!.elements=document.modules[0]!.elements.filter(e=>e.id!=='assignmentStaff');
  if(mutation==='facet')field.facets={future:true};
  if(mutation==='extension')field.extensions={future:{equality:'opaque'}};
  const plan=resolveCandidateRecordAssociation({kind:'record-members',type:a.type,keyId:a.keyId,endpoints:a.endpoints},document,resolution.ontology.entities.map(e=>({type:e.type,keyId:e.keyId})));
  if(mutation==='none'){expect(()=>requireCandidateEndpointDomainCorrespondence(plan)).not.toThrow();field.scalarType='integer';expect(()=>requireCandidateEndpointDomainCorrespondence(plan)).not.toThrow();expect(()=>requireCandidateEndpointDomainCorrespondence({...plan})).toThrow();}
  else expect(()=>requireCandidateEndpointDomainCorrespondence(plan)).toThrow();
 }
});

test('selected Record classification coverage is explicit, exact and retained',()=>{
 const {resolution}=securityFixture(),a=resolution.ontology.associations[1]!,plan=resolveCandidateRecordAssociation({kind:'record-members',type:a.type,keyId:a.keyId,endpoints:a.endpoints},resolution.documents[0]!.document,resolution.ontology.entities.map(e=>({type:e.type,keyId:e.keyId})));
 const declarations=[...resolution.ontology.entities.filter(e=>['Staff','Project'].includes(e.type.elementId)),a].map(e=>({type:e.type,fields:e.fields}));
 const retained:any=requireCandidateAssociationClassifications(plan,declarations);expect(retained).toEqual(declarations);expect(Object.isFrozen(retained[0].fields[0])).toBe(true);
 for(const mutate of [(d:any)=>d.pop(),(d:any)=>d[0].fields.pop(),(d:any)=>d[0].fields.push(d[0].fields[0]),(d:any)=>d[0].fields[0].protection='unknown',(d:any)=>d[0].fields[0].queryUse={future:'disclosed'}]){
  const d=structuredClone(declarations);mutate(d);expect(()=>requireCandidateAssociationClassifications(plan,d)).toThrow();
 }
 declarations[0]!.fields[0]!.protection='protected';expect(retained[0].fields[0].protection).toBe('unprotected');
 expect(()=>requireCandidateAssociationClassifications({...plan},declarations)).toThrow();
});

test('composed association checks require actual core validity before descriptor matching',()=>{
 for(const mutation of ['none','primary','invalid-matching-facet','unknown-extension']){
  const {resolution}=securityFixture(),document=resolution.documents[0]!.document,a=resolution.ontology.associations[1]!,entities=resolution.ontology.entities.map(e=>({type:e.type,keyId:e.keyId})),classifications=[...resolution.ontology.entities.filter(e=>['Staff','Project'].includes(e.type.elementId)),a].map(e=>({type:e.type,fields:e.fields}));
  const selector={kind:'record-members',type:a.type,keyId:a.keyId,endpoints:a.endpoints};
  if(mutation==='primary')(document.modules[0]!.elements.find(e=>e.id==='Assignment')!.keys as any)[0].primary=true;
  if(mutation==='invalid-matching-facet')for(const name of ['staffId','assignmentStaff'])(document.modules[0]!.elements.find(e=>e.id===name) as any).facets={length:{max:-1,unit:'unicode-scalar'}};
  if(mutation==='unknown-extension')(document.modules[0]!.elements.find(e=>e.id==='assignmentStaff') as any).extensions={future:{opaque:true}};
  const run=()=>resolveCandidateRecordAssociationChecks(selector,document,entities,classifications);
  if(['none','primary'].includes(mutation)){const result=run();expect(Object.isFrozen(result)).toBe(true);if(mutation==='primary')expect((result.plan.key as any).primary).toBe(true);}
  else expect(run).toThrow();
 }
});

test('graph core composition retains original-source refusal and checks independently authored supported sources',async()=>{
 const retained=await Bun.file('docs/helix/04-build/evidence/security/truss-graph-compiler-input.json').json(),selection=await Bun.file('docs/helix/04-build/evidence/security/relationship-selector-spike.json').json(),document=retained.transition.target;
 const ontology=JSON.parse(retained.request.ontologyJson),originalClassifications=[...ontology.entities,...ontology.associations].map((e:any)=>({type:e.type,fields:e.fields}));
 const before=JSON.stringify(document);expect(()=>resolveCandidateGraphRelationshipChecks(selection.original,document,selection.entities,originalClassifications)).toThrow('SECURITY_ASSOCIATION_CORE_UNRESOLVED');expect(JSON.stringify(document)).toBe(before);
 const {resolution}=securityFixture(),source=resolution.documents[0]!.document;
 source.modules[0]!.relationships=[{id:'WorksOn',name:'WorksOn',sourceMultiplicity:{min:0,max:1},targetMultiplicity:{min:0,max:2},targetLifecycle:'independent',directed:true,source:[{module:'m',element:'Staff'}],target:[{module:'m',element:'Project',key:'pk'}],associationRecord:{module:'m',element:'Assignment'}}];
 const ref=(elementId:string)=>({documentId:source.id,moduleId:'m',elementId});
 const selector={kind:'core-relationship',relationship:{documentId:source.id,moduleId:'m',relationshipId:'WorksOn'},witness:{kind:'record-key',type:ref('Assignment'),keyId:'pk'},endpoints:[{role:'staff',side:'source',target:ref('Staff'),keyId:'pk'},{role:'project',side:'target',target:ref('Project'),keyId:'pk'}]};
 const entities=resolution.ontology.entities.map(e=>({type:e.type,keyId:e.keyId})),classifications=[...resolution.ontology.entities.filter(e=>['Staff','Project'].includes(e.type.elementId)),resolution.ontology.associations[1]!].map(e=>({type:e.type,fields:e.fields}));
 const result=resolveCandidateGraphRelationshipChecks(selector,source,entities,classifications);
 expect(result.plan.relationship).toEqual(selector.relationship);expect(result.plan.endpoints.map(e=>e.side)).toEqual(['source','target']);expect(result.plan.endpoints.every(e=>!('fields' in e))).toBe(true);
 expect(()=>resolveCandidateGraphRelationshipChecks(selector,source,entities,classifications.slice(0,2))).toThrow();
});

test('classification utility refuses a foreign scoped Record even when local labels match',()=>{
 const {resolution}=securityFixture(),document=resolution.documents[0]!.document,staff=resolution.ontology.entities[0]!,foreign={...staff.type,documentId:'foreign-document'};
 expect(()=>checkCandidateRecordClassifications(document,[foreign],[{type:foreign,fields:staff.fields}])).toThrow();
 expect(()=>checkCandidateRecordClassifications(document,[staff.type],[{type:staff.type,fields:staff.fields}])).not.toThrow();
});

test('original graph qualifier requires explicit draft Key-agreement interpretation',async()=>{
 const r=await Bun.file('docs/helix/04-build/evidence/security/truss-graph-compiler-input.json').json(),s=await Bun.file('docs/helix/04-build/evidence/security/relationship-selector-spike.json').json(),ontology=JSON.parse(r.request.ontologyJson),classifications=[...ontology.entities,...ontology.associations].map((e:any)=>({type:e.type,fields:e.fields})),profile={profile:'association-record-key-agreement/0.1'} as const;
 const result=resolveCandidateGraphRelationshipChecks(s.original,r.transition.target,s.entities,classifications,profile);
 expect(result.interpretedQualifier).toEqual({profile:profile.profile,path:'/modules/0/relationships/1/associationRecord/key',keyId:'code-key'});expect((result.plan.sourceRelationship as any).associationRecord.key).toBe('code-key');
 const unknown=structuredClone(r.transition.target);unknown.modules[0].relationships[1].future=true;expect(()=>resolveCandidateGraphRelationshipChecks(s.original,unknown,s.entities,classifications,profile)).toThrow();
 const mismatch=structuredClone(s.original);mismatch.witness.keyId='missing';expect(()=>resolveCandidateGraphRelationshipChecks(mismatch,r.transition.target,s.entities,classifications,profile)).toThrow();
 expect(()=>resolveCandidateGraphRelationshipChecks(s.bare,r.transition.target,s.entities,classifications.slice(0,2),profile)).toThrow();
});

test('shared checked association entrypoint keeps branch semantics and refuses wrong-scope interpretations',async()=>{
 const {resolution}=securityFixture(),a=resolution.ontology.associations[1]!,selector={kind:'record-members',type:a.type,keyId:a.keyId,endpoints:a.endpoints},entities=resolution.ontology.entities.map(e=>({type:e.type,keyId:e.keyId})),classifications=[...resolution.ontology.entities.filter(e=>['Staff','Project'].includes(e.type.elementId)),a].map(e=>({type:e.type,fields:e.fields})),profile={profile:'association-record-key-agreement/0.1'} as const;
 const result=resolveCandidateAssociationChecks(selector,resolution.documents[0]!.document,entities,classifications);expect(result.kind).toBe('candidate-record-association-checks/0.1');
 expect(()=>resolveCandidateAssociationChecks(selector,resolution.documents[0]!.document,entities,classifications,profile)).toThrow();
 expect(()=>resolveCandidateAssociationChecks({...selector,kind:'future'},resolution.documents[0]!.document,entities,classifications)).toThrow();
 let calls=0;const hostile:any={};Object.defineProperty(hostile,'kind',{enumerable:true,get(){calls++;return 'record-members';}});expect(()=>resolveCandidateAssociationChecks(hostile,resolution.documents[0]!.document,entities,classifications)).toThrow();expect(calls).toBe(0);
 const r=await Bun.file('docs/helix/04-build/evidence/security/truss-graph-compiler-input.json').json(),s=await Bun.file('docs/helix/04-build/evidence/security/relationship-selector-spike.json').json(),o=JSON.parse(r.request.ontologyJson),c=[...o.entities,...o.associations].map((e:any)=>({type:e.type,fields:e.fields}));
 expect(resolveCandidateAssociationChecks(s.original,r.transition.target,s.entities,c,profile).kind).toBe('candidate-graph-relationship-checks/0.1');
});
