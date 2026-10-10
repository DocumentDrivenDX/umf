import {test,expect} from 'bun:test';
import {securityFixture} from './fixture';
import {resolveCandidateAssociationChecks} from '../../src/extensions/security/association-checks';
import {normalizeCandidateAssociationExpression,serializeCandidateAssociationExpression,inspectCandidateAssociationExpressionTransport} from '../../src/extensions/security/association-expression';
const fixture=()=>{
 const f=securityFixture(),checks=f.resolution.ontology.associations.map(a=>{const scope=new Set([a.type.elementId,...a.endpoints.map(e=>e.target.elementId)]);return resolveCandidateAssociationChecks({kind:'record-members',type:a.type,keyId:a.keyId,endpoints:a.endpoints},f.resolution.documents[0]!.document,f.resolution.ontology.entities.map(e=>({type:e.type,keyId:e.keyId})),[...f.resolution.ontology.entities,...f.resolution.ontology.associations].filter(e=>scope.has(e.type.elementId)).map(e=>({type:e.type,fields:e.fields})));});return {...f,checks};
};
test('original nested Staff/Project expression retains exact lexical occurrences and explicit typing residuals',()=>{
 const f=fixture(),source=f.policy.rules[1]!.condition,result:any=normalizeCandidateAssociationExpression(source,f.checks),outer=result.expression,inner=outer.where.args[1];
 expect(inner.where.args[1].left.witness).toBe(inner.witness);expect(inner.where.args[1].right.witness).toBe(outer.witness);expect(inner.where.args[2].left.witness).toBe(inner.witness);
 expect(result.residuals).toHaveLength(2);expect(Object.isFrozen(inner.where)).toBe(true);
});
test('unbound, shadowed, wrong-owner and unknown associations refuse normalization',()=>{
 const f=fixture();for(const mutation of ['unbound','shadow','owner','association']){
  const source:any=structuredClone(f.policy.rules[1]!.condition),inner=source.where.args[1];
  if(mutation==='unbound')inner.where.args[1].left.name='missing';if(mutation==='shadow')inner.as='o';if(mutation==='owner')inner.where.args[2].left.field.elementId='staffId';if(mutation==='association')inner.association.documentId='foreign';
  expect(()=>normalizeCandidateAssociationExpression(source,f.checks)).toThrow();
 }
 expect(()=>normalizeCandidateAssociationExpression(f.policy.rules[1]!.condition,f.checks.map(c=>({...c})))).toThrow();
});

test('normalizer refuses coercible collection length and policy grammar boundary violations',()=>{
 let calls=0;const available=new Proxy([],{getOwnPropertyDescriptor(target,key){if(key==='length')return {value:{valueOf(){calls++;return 0;}},writable:true,enumerable:false,configurable:false};return Reflect.getOwnPropertyDescriptor(target,key);}});
 expect(()=>normalizeCandidateAssociationExpression({op:'literal',value:true},available)).toThrow();expect(calls).toBe(0);
 for(const op of ['and','or'])for(const size of [0,64,65]){const expr={op,args:Array.from({length:size},()=>({op:'literal',value:true}))};if(size===64)expect(()=>normalizeCandidateAssociationExpression(expr,[])).not.toThrow();else expect(()=>normalizeCandidateAssociationExpression(expr,[])).toThrow();}
 for(const size of [15,16]){let expr:any={op:'literal',value:true};for(let i=0;i<size;i++)expr={op:'not',arg:expr};if(size===15)expect(()=>normalizeCandidateAssociationExpression(expr,[])).not.toThrow();else expect(()=>normalizeCandidateAssociationExpression(expr,[])).toThrow();}
 const f=fixture(),result=normalizeCandidateAssociationExpression(f.policy.rules[1]!.condition,f.checks);expect(result.residuals.map(r=>r.path)).toEqual(['/where/args/0/right','/where/args/1/where/args/0/right']);
});

test('association operand typing rejects nominal identity and scalar/identity disagreement',()=>{
 const f=fixture(),a=f.resolution.ontology.associations[1]!;
 const expr=(left:any,right:any)=>({op:'exists',association:a.type,as:'a',where:{op:'eq',left:{kind:'variable',name:'a',...left},right:{kind:'variable',name:'a',...right}}});
 expect(()=>normalizeCandidateAssociationExpression(expr({endpoint:'staff'},{endpoint:'project'}),f.checks)).toThrow();
 expect(()=>normalizeCandidateAssociationExpression(expr({endpoint:'staff'},{field:a.fields.find(f=>f.ref.elementId==='active')!.ref}),f.checks)).toThrow();
 expect(()=>normalizeCandidateAssociationExpression(expr({field:a.fields.find(f=>f.ref.elementId==='active')!.ref},{field:a.fields.find(f=>f.ref.elementId==='assignmentId')!.ref}),f.checks)).toThrow();
 expect(normalizeCandidateAssociationExpression(expr({endpoint:'project'},{endpoint:'project'}),f.checks).residuals).toEqual([]);
 expect(normalizeCandidateAssociationExpression(expr({field:a.fields.find(f=>f.ref.elementId==='active')!.ref},{field:a.fields.find(f=>f.ref.elementId==='active')!.ref}),f.checks).residuals).toEqual([]);
});

test('constants use classified source definitions and actual core literal validity',()=>{
 const f=fixture(),source:any=structuredClone(f.policy.rules[1]!.condition);
 const normalized:any=normalizeCandidateAssociationExpression(source,f.checks);expect(normalized.expression.where.args[1].where.args[2].right.term.kind).toBe('constant');
 for(const mutation of ['literal','domain']){const expr=structuredClone(source),constant=expr.where.args[1].where.args[2].right;if(mutation==='literal')constant.value={string:'true'};else{constant.field.elementId='staffId';constant.value={string:'staff'};}expect(()=>normalizeCandidateAssociationExpression(expr,f.checks)).toThrow();}
 const missing=structuredClone(source);missing.where.args[1].where.args[2].right.field.elementId='unknown';expect(normalizeCandidateAssociationExpression(missing,f.checks).residuals.some(r=>r.reason==='constant-field-source-unresolved')).toBe(true);
});

test('declared subject/resource endpoint bindings resolve the full nested policy types',()=>{
 const f=fixture(),context={subject:{association:f.resolution.ontology.associations[1]!.type,endpoint:'staff'},resource:{association:f.resolution.ontology.associations[0]!.type,endpoint:'resource'}};
 expect(normalizeCandidateAssociationExpression(f.policy.rules[1]!.condition,f.checks,context).residuals).toEqual([]);
 for(const mutation of ['role','type','foreign','extra']){const c:any=structuredClone(context);if(mutation==='role')c.subject.endpoint='missing';if(mutation==='type')c.subject.endpoint='project';if(mutation==='foreign')c.subject.association.documentId='foreign';if(mutation==='extra')c.subject.future=true;expect(()=>normalizeCandidateAssociationExpression(f.policy.rules[1]!.condition,f.checks,c)).toThrow();}
 const ownField={op:'eq',left:{kind:'resource',field:{documentId:'domain',moduleId:'m',elementId:'salary'}},right:{kind:'resource',field:{documentId:'domain',moduleId:'m',elementId:'salary'}}};expect(normalizeCandidateAssociationExpression(ownField,f.checks,context).residuals).toEqual([]);
 expect(()=>normalizeCandidateAssociationExpression({...ownField,left:{kind:'subject',field:ownField.left.field}},f.checks,context)).toThrow();
});

test('constant literal wrappers have closed structural validity before field checks',()=>{
 const f=fixture(),a=f.resolution.ontology.associations[1]!,field=a.fields.find(f=>f.ref.elementId==='assignmentId')!.ref;
 for(const malformed of [123,false,{},[]]){const expr={op:'exists',association:a.type,as:'a',where:{op:'eq',left:{kind:'variable',name:'a',field},right:{kind:'constant',field,value:{string:malformed}}}};expect(()=>normalizeCandidateAssociationExpression(expr,f.checks)).toThrow();}
});

test('unused context declarations and conflicting captured models refuse eagerly',()=>{
 const f=fixture(),literal={op:'literal',value:true};
 expect(()=>normalizeCandidateAssociationExpression(literal,[],{subject:{association:{documentId:'foreign',moduleId:'m',elementId:'missing'},endpoint:'missing'}})).toThrow();
 expect(()=>normalizeCandidateAssociationExpression(literal,f.checks,{subject:{association:f.resolution.ontology.associations[1]!.type,endpoint:'missing'}})).toThrow();
 const changed=fixture(),a=changed.resolution.ontology.associations[1]!,document=changed.resolution.documents[0]!.document;(document.modules[0]!.elements.find(e=>e.id==='active') as any).title='changed source';
 const conflict=resolveCandidateAssociationChecks({kind:'record-members',type:a.type,keyId:a.keyId,endpoints:a.endpoints},document,changed.resolution.ontology.entities.map(e=>({type:e.type,keyId:e.keyId})),[...changed.resolution.ontology.entities.filter(e=>['Staff','Project'].includes(e.type.elementId)),a].map(e=>({type:e.type,fields:e.fields})));
 expect(()=>normalizeCandidateAssociationExpression(literal,[f.checks[0]!,conflict])).toThrow();expect(()=>normalizeCandidateAssociationExpression(literal,[conflict,f.checks[0]!])).toThrow();
});


test('shared multi-field Unicode Record classifications are exactly order independent',()=>{
 const f=securityFixture(),document=f.resolution.documents[0]!.document,project:any=document.modules[0]!.elements.find(e=>e.id==='Project'),view=f.resolution.ontology.entities.find(e=>e.type.elementId==='Project')!;
 for(const id of ['é','e\u0301']){project.members.push({module:'m',element:id});document.modules[0]!.elements.push({id,kind:'field',scalarType:'string',cardinality:'one',nullability:'required',extensions:{}});view.fields.push({ref:{documentId:'domain',moduleId:'m',elementId:id},protection:'unprotected'});}
 const declarations=(a:any)=>[...f.resolution.ontology.entities.filter(e=>[a.type.elementId,...a.endpoints.map((e:any)=>e.target.elementId)].includes(e.type.elementId)),a].map(e=>({type:e.type,fields:structuredClone(e.fields)}));
 const build=(index:number,views:any)=>{const a=f.resolution.ontology.associations[index]!;return resolveCandidateAssociationChecks({kind:'record-members',type:a.type,keyId:a.keyId,endpoints:a.endpoints},document,f.resolution.ontology.entities.map(e=>({type:e.type,keyId:e.keyId})),views);};
 const first=build(0,declarations(f.resolution.ontology.associations[0])),secondViews=declarations(f.resolution.ontology.associations[1]),shared=secondViews.find((d:any)=>d.type.elementId==='Project')!;
 shared.fields.reverse();const second=build(1,secondViews),literal={op:'literal',value:true};
 for(const available of [[first,second],[second,first]])expect(()=>normalizeCandidateAssociationExpression(literal,available)).not.toThrow();
 for(const mutation of ['protection','queryUse']){const changed=structuredClone(secondViews),field=changed.find((d:any)=>d.type.elementId==='Project')!.fields.find((f:any)=>f.ref.elementId==='é');if(mutation==='protection')field.protection='protected';else field.queryUse={predicate:'prohibited'};const conflict=build(1,changed);for(const available of [[first,conflict],[conflict,first]])expect(()=>normalizeCandidateAssociationExpression(literal,available)).toThrow();}
});


test('JSON transport preserves nested witness correlation and refuses unissued or residual expressions',()=>{
 const f=fixture(),context={subject:{association:f.resolution.ontology.associations[1]!.type,endpoint:'staff'},resource:{association:f.resolution.ontology.associations[0]!.type,endpoint:'resource'}},normalized=normalizeCandidateAssociationExpression(f.policy.rules[1]!.condition,f.checks,context),wire:any=serializeCandidateAssociationExpression(normalized),outer=wire.expression,inner=outer.where.args[1];
 expect([outer.occurrence,inner.occurrence]).toEqual([0,1]);expect(inner.where.args[1].left.occurrence).toBe(1);expect(inner.where.args[1].right.occurrence).toBe(0);
 expect(JSON.parse(JSON.stringify(wire))).toEqual(wire);expect(wire.associations[0].source).toEqual(f.resolution.documents[0]!.document);expect(Object.isFrozen(inner.where)).toBe(true);
 expect(()=>serializeCandidateAssociationExpression({...normalized})).toThrow();expect(()=>serializeCandidateAssociationExpression(normalizeCandidateAssociationExpression(f.policy.rules[1]!.condition,f.checks))).toThrow();
});


test('transport receiver regenerates lexical descriptors and rejects tampered correlation or sources',()=>{
 const f=fixture(),context={subject:{association:f.resolution.ontology.associations[1]!.type,endpoint:'staff'},resource:{association:f.resolution.ontology.associations[0]!.type,endpoint:'resource'}},wire:any=serializeCandidateAssociationExpression(normalizeCandidateAssociationExpression(f.policy.rules[1]!.condition,f.checks,context));
 expect(inspectCandidateAssociationExpressionTransport(JSON.parse(JSON.stringify(wire)))).toEqual(wire);
 for(const mutate of [(w:any)=>w.expression.where.args[1].where.args[1].right.occurrence=1,(w:any)=>w.associations[0].checks.plan.key.id='missing',(w:any)=>w.associations[0].source.modules[0].elements.find((e:any)=>e.id==='ownerProject').scalarType='boolean',(w:any)=>w.sourceExpression.context.subject.endpoint='project',(w:any)=>w.future=true]){const changed=structuredClone(wire);mutate(changed);expect(()=>inspectCandidateAssociationExpressionTransport(changed)).toThrow();}
});


test('receiver retains unused declaration dependencies for literal expressions',()=>{
 const f=fixture(),context={subject:{association:f.resolution.ontology.associations[1]!.type,endpoint:'staff'}},wire:any=serializeCandidateAssociationExpression(normalizeCandidateAssociationExpression({op:'literal',value:true},f.checks,context));
 expect(wire.associations).toHaveLength(2);expect(inspectCandidateAssociationExpressionTransport(wire)).toEqual(wire);
});
