import {test,expect} from 'bun:test';
import {resolveCandidateRelationship,requireCandidateWitnessTerm,resolveCandidateRelationshipTerm} from '../../src/extensions/security/relationship-candidate';
const ref=(elementId:string)=>({documentId:'d',moduleId:'m',elementId});
const record=(id:string)=>({id,kind:'record',members:[{module:'m',element:id+'-code'}],keys:[{id:'key',name:'key',primary:true,fields:[{module:'m',element:id+'-code'}]}]});
const fixture=()=>({model:{umf:'0.8.0',id:'d',modules:[{id:'m',elements:['Staff','Project','Assignment'].map(record),relationships:[{id:'WorksOn',directed:true,source:[{module:'m',element:'Staff'}],target:[{module:'m',element:'Project',key:'key'}],associationRecord:{module:'m',element:'Assignment',key:'key'}},{id:'Bare',directed:true,source:[{module:'m',element:'Staff'}],target:[{module:'m',element:'Project',key:'key'}]}]}]},selector:{kind:'core-relationship',relationship:{documentId:'d',moduleId:'m',relationshipId:'WorksOn'},witness:{kind:'record-key',type:ref('Assignment'),keyId:'key'},endpoints:[{role:'staff',side:'source',target:ref('Staff'),keyId:'key'},{role:'project',side:'target',target:ref('Project'),keyId:'key'}]},entities:['Staff','Project'].map(elementId=>({type:ref(elementId),keyId:'key'}))});
test('selected original Keys and Record attributes remain frozen and primary meaning retained',()=>{
 const f=fixture(),plan=resolveCandidateRelationship(f.selector,f.model,f.entities);
 expect(plan.witness).toEqual({kind:'record-key',type:ref('Assignment'),key:f.model.modules[0]!.elements[2]!.keys[0],sourceRecord:f.model.modules[0]!.elements[2],attributes:[ref('Assignment-code')]});
 expect(plan.endpoints[0]!.key).toEqual(f.model.modules[0]!.elements[0]!.keys[0]);
 f.model.modules[0]!.elements[0]!.keys[0]!.primary=false;
 expect((plan.endpoints[0]!.key as any).primary).toBe(true);expect(Object.isFrozen(plan.endpoints[0]!.key)).toBe(true);
 for(const term of ['exists','endpoint','identity','attribute'] as const)expect(()=>requireCandidateWitnessTerm(plan,term)).not.toThrow();
 expect(()=>requireCandidateWitnessTerm({...plan},'exists')).toThrow();
});
test('bare witnesses support only correlated endpoint access and existence',()=>{
 const f=fixture();f.selector.relationship.relationshipId='Bare';(f.selector as any).witness={kind:'opaque-existential'};
 const plan=resolveCandidateRelationship(f.selector,f.model,f.entities);
 for(const term of ['exists','endpoint'] as const)expect(()=>requireCandidateWitnessTerm(plan,term)).not.toThrow();
 for(const term of ['identity','attribute','count','distinct','disclose'] as const)expect(()=>requireCandidateWitnessTerm(plan,term)).toThrow();
});
test('entity alternate Key choice, duplicate identity and opaque Record replacement refuse',()=>{
 const f=fixture();f.model.modules[0]!.elements[0]!.keys.push({...f.model.modules[0]!.elements[0]!.keys[0]!,id:'alternate',name:'alternate',primary:false});f.entities[0]!.keyId='alternate';expect(()=>resolveCandidateRelationship(f.selector,f.model,f.entities)).toThrow();
 const d=fixture();d.entities.push(d.entities[0]!);expect(()=>resolveCandidateRelationship(d.selector,d.model,d.entities)).toThrow();
 const opaque=fixture();(opaque.selector as any).witness={kind:'opaque-existential'};expect(()=>resolveCandidateRelationship(opaque.selector,opaque.model,opaque.entities)).toThrow();
});
test('metadata accessors are refused without execution',()=>{
 const f=fixture();let calls=0;Object.defineProperty(f.selector.witness,'keyId',{enumerable:true,get(){calls++;return 'key';}});
 expect(()=>resolveCandidateRelationship(f.selector,f.model,f.entities)).toThrow();expect(calls).toBe(0);
});

test('endpoint and witness Key IDs use the schema Unicode code-point boundary',()=>{
 for(const side of ['endpoint','witness'])for(const size of [4096,4097]){
  const f=fixture(),keyId='😀'.repeat(size);
  if(side==='endpoint'){f.entities[0]!.keyId=keyId;f.selector.endpoints[0]!.keyId=keyId;f.model.modules[0]!.elements[0]!.keys[0]!.id=keyId;}
  else{f.selector.witness.keyId=keyId;f.model.modules[0]!.elements[2]!.keys[0]!.id=keyId;f.model.modules[0]!.relationships[0]!.associationRecord!.key=keyId;}
  const run=()=>resolveCandidateRelationship(f.selector,f.model,f.entities);
  if(size===4096)expect(run).not.toThrow();else expect(run).toThrow();
 }
 const f=fixture();f.selector.endpoints[0]!.role='😀'.repeat(4096);expect(()=>resolveCandidateRelationship(f.selector,f.model,f.entities)).not.toThrow();
});

test('unsupported source shapes refuse without mutating original source',()=>{
 const mutations=[
  (f:ReturnType<typeof fixture>)=>{f.model.modules[0]!.relationships[0]!.directed=false;},
  (f:ReturnType<typeof fixture>)=>{f.model.modules[0]!.relationships[0]!.source.push({module:'m',element:'Project'});},
  (f:ReturnType<typeof fixture>)=>{f.model.modules[0]!.relationships[0]!.target.push({module:'m',element:'Staff',key:'key'});},
  (f:ReturnType<typeof fixture>)=>{f.model.modules[0]!.relationships.push(f.model.modules[0]!.relationships[0]!);},
  (f:ReturnType<typeof fixture>)=>{f.model.modules[0]!.elements[0]!.keys.push(f.model.modules[0]!.elements[0]!.keys[0]!);},
  (f:ReturnType<typeof fixture>)=>{(f.model.modules[0]!.elements[0]!.keys[0] as any).future=true;},
  (f:ReturnType<typeof fixture>)=>{(f.model.modules[0]!.elements[0]!.keys[0] as any).primary='yes';}
 ];
 for(const mutate of mutations){const f=fixture();mutate(f);const before=JSON.stringify(f);expect(()=>resolveCandidateRelationship(f.selector,f.model,f.entities)).toThrow();expect(JSON.stringify(f)).toBe(before);}
});
test('complete relationship and association Record source snapshots retain unconsumed metadata',()=>{
 const f=fixture();(f.model.modules[0]!.relationships[0] as any).retainedAnnotation={opaque:['keep']};(f.model.modules[0]!.elements[2] as any).retainedAnnotation={future:'archive-only'};
 const plan=resolveCandidateRelationship(f.selector,f.model,f.entities);
 expect(plan.sourceRelationship).toEqual(f.model.modules[0]!.relationships[0]);
 if(plan.witness.kind!=='record-key')throw Error('Unexpected witness');expect(plan.witness.sourceRecord).toEqual(f.model.modules[0]!.elements[2]);
 expect(Object.isFrozen((plan.sourceRelationship as any).retainedAnnotation.opaque)).toBe(true);
});

 test('selected terms resolve exact roles and qualified members without authorizing them',()=>{
 const f=fixture(),plan=resolveCandidateRelationship(f.selector,f.model,f.entities);
 expect(resolveCandidateRelationshipTerm(plan,{kind:'endpoint',role:'staff'})).toEqual({kind:'entity-identity',relationship:plan.relationship,role:'staff',side:'source',type:ref('Staff'),key:f.model.modules[0]!.elements[0]!.keys[0]});
 expect(resolveCandidateRelationshipTerm(plan,{kind:'identity'})).toEqual({kind:'record-identity',relationship:plan.relationship,type:ref('Assignment'),key:f.model.modules[0]!.elements[2]!.keys[0]});
 const term:any={kind:'attribute',field:ref('Assignment-code')},resolved:any=resolveCandidateRelationshipTerm(plan,term);term.field.elementId='changed';
 expect(resolved.field).toEqual(ref('Assignment-code'));expect(Object.isFrozen(resolved.field)).toBe(true);
 for(const invalid of [{kind:'endpoint',role:'missing'},{kind:'attribute',field:ref('Staff-code')},{kind:'attribute',field:{...ref('Assignment-code'),documentId:'other'}},{kind:'identity',extra:true}])expect(()=>resolveCandidateRelationshipTerm(plan,invalid as any)).toThrow();
 expect(()=>resolveCandidateRelationshipTerm({...plan},{kind:'identity'})).toThrow();
 f.selector.relationship.relationshipId='Bare';(f.selector as any).witness={kind:'opaque-existential'};const bare=resolveCandidateRelationship(f.selector,f.model,f.entities);
 expect(()=>resolveCandidateRelationshipTerm(bare,{kind:'endpoint',role:'project'})).not.toThrow();
 expect(()=>resolveCandidateRelationshipTerm(bare,{kind:'identity'})).toThrow();expect(()=>resolveCandidateRelationshipTerm(bare,{kind:'attribute',field:ref('Assignment-code')})).toThrow();
 let calls=0;const hostile:any={kind:'attribute'};Object.defineProperty(hostile,'field',{enumerable:true,get(){calls++;return ref('Assignment-code');}});
 expect(()=>resolveCandidateRelationshipTerm(plan,hostile)).toThrow();expect(calls).toBe(0);
 });

test('self-relationship selected endpoints preserve role and side provenance',()=>{
 const f=fixture();f.model.modules[0]!.relationships[0]!.target[0]!.element='Staff';f.selector.endpoints[1]!.target=ref('Staff');
 const plan=resolveCandidateRelationship(f.selector,f.model,f.entities),source:any=resolveCandidateRelationshipTerm(plan,{kind:'endpoint',role:'staff'}),target:any=resolveCandidateRelationshipTerm(plan,{kind:'endpoint',role:'project'});
 expect(source.type).toEqual(target.type);expect(source.key).toEqual(target.key);expect(source.side).toBe('source');expect(target.side).toBe('target');expect(source.role).not.toBe(target.role);expect(source.relationship).toEqual(plan.relationship);
});
