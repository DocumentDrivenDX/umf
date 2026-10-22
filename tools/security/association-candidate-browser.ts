import {chromium} from 'playwright';
import {createHash} from 'node:crypto';
import {securityFixture} from '../../tests/security/fixture';
import {resolveCandidateRecordAssociation} from '../../src/extensions/security/association-candidate';
const paths=['src/extensions/security/association-candidate.ts','src/model/json.ts','src/model/types.ts','src/extensions/security/types.ts','tests/security/fixture.ts','tools/security/association-candidate-browser.ts'];
const graphCompilerPath='docs/helix/04-build/evidence/security/truss-graph-compiler-input.json',graphSelectorPath='docs/helix/04-build/evidence/security/relationship-selector-spike.json';
paths.push('docs/helix/02-design/spikes/security/policy-v0.2.schema.json','docs/helix/02-design/spikes/security/ontology-v0.2.schema.json',graphCompilerPath,graphSelectorPath,'tools/security/association-browser-entry.ts');
const graphCompiler=await Bun.file(graphCompilerPath).json(),graphSelection=await Bun.file(graphSelectorPath).json(),graphOntology=JSON.parse(graphCompiler.request.ontologyJson);
const graph={document:graphCompiler.transition.target,selector:graphSelection.original,bare:graphSelection.bare,entities:graphSelection.entities,classifications:[...graphOntology.entities,...graphOntology.associations].map((e:any)=>({type:e.type,fields:e.fields}))};
paths.push(...new Bun.Glob('src/**/*').scanSync({onlyFiles:true}),...new Bun.Glob('spec/**/*').scanSync({onlyFiles:true}));
const hash=async(p:string)=>createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex');
const pins=Object.fromEntries(await Promise.all(paths.map(async p=>[p,await hash(p)])));
const {resolution,policy}=securityFixture(),a=resolution.ontology.associations[1]!,model=resolution.documents[0]!.document;
const selector={kind:'record-members',type:a.type,keyId:a.keyId,endpoints:a.endpoints},entities=resolution.ontology.entities.map(e=>({type:e.type,keyId:e.keyId})),plan=resolveCandidateRecordAssociation(selector,model,entities);
const classifications=[...resolution.ontology.entities.filter(e=>['Staff','Project'].includes(e.type.elementId)),a].map(e=>({type:e.type,fields:e.fields}));
const expressionPacket={policy,ontology:resolution.ontology,expression:policy.rules[1]!.condition,selectors:resolution.ontology.associations.map(a=>({kind:'record-members',type:a.type,keyId:a.keyId,endpoints:a.endpoints})),views:[...resolution.ontology.entities,...resolution.ontology.associations].map(e=>({type:e.type,fields:e.fields}))};
const build=await Bun.build({entrypoints:[paths[0]!],target:'browser',format:'esm'});if(!build.success)throw Error('Build failed');const js=await build.outputs[0]!.text();
const checksBuild=await Bun.build({entrypoints:['tools/security/association-browser-entry.ts'],target:'browser',format:'esm'});if(!checksBuild.success)throw Error('Checks build failed');const checksJs=await checksBuild.outputs[0]!.text();
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch:r=>new URL(r.url).pathname==='/checks.js'?new Response(checksJs,{headers:{'content-type':'text/javascript'}}):new URL(r.url).pathname==='/candidate.js'?new Response(js,{headers:{'content-type':'text/javascript'}}):new Response('<!doctype html>')});let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:Bun.env.UMF_CHROMIUM_PATH});const page=await browser.newPage();let external=0;await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():(external++,r.abort()));await page.goto(`http://127.0.0.1:${server.port}`);
 const observations=await page.evaluate(async (p:any)=>{
  const url='/candidate.js',m=await import(url),run=(s:any)=>m.resolveCandidateRecordAssociation(s,p.model,p.entities),refuses=(s:any)=>{try{run(s);return false;}catch{return true;}};
  const original=run(p.selector);const rows:{id:string;expected:unknown;observed:unknown}[]=[{id:'original-plan',expected:p.plan,observed:original}];
  for(const mutation of ['duplicate-role','wrong-owner','foreign-document','arity','missing-key']){
   const s=structuredClone(p.selector);
   if(mutation==='duplicate-role')s.endpoints[1].role=s.endpoints[0].role;
   if(mutation==='wrong-owner')s.endpoints[0].fields[0].elementId='staffId';
   if(mutation==='foreign-document')s.endpoints[0].fields[0].documentId='foreign';
   if(mutation==='arity')s.endpoints[0].fields=[];
   if(mutation==='missing-key')s.keyId='missing';
   rows.push({id:mutation,expected:true,observed:refuses(s)});
  }
  const s=structuredClone(p.selector),copy=run(s);s.endpoints[0].fields[0].elementId='changed';rows.push({id:'frozen-isolated',expected:true,observed:Object.isFrozen(copy.endpoints[0].fields[0])&&copy.endpoints[0].fields[0].elementId===p.selector.endpoints[0].fields[0].elementId});
  let calls=0;const hostile=structuredClone(p.selector);Object.defineProperty(hostile,'keyId',{enumerable:true,get(){calls++;return 'pk';}});rows.push({id:'accessor-refusal',expected:{refused:true,calls:0},observed:{refused:refuses(hostile),calls}});for(const size of [256,257]){
   const model=structuredClone(p.model),selector=structuredClone(p.selector),target=model.modules[0].elements.find((e:any)=>e.id==='Staff'),association=model.modules[0].elements.find((e:any)=>e.id==='Assignment');
   const refs=Array.from({length:size},(_,i)=>({module:'m',element:'part'+i}));target.members=refs;target.keys[0].fields=refs;association.members.push(...refs);selector.endpoints=[{role:'staff',target:p.selector.endpoints[0].target,fields:refs.map(r=>({documentId:model.id,moduleId:r.module,elementId:r.element}))}];
   let refused=false;try{m.resolveCandidateRecordAssociation(selector,model,p.entities);}catch{refused=true;}
   rows.push({id:'mapping-bound-'+size,expected:size>256,observed:refused});
  }
  for(const mutation of ['none','scalar','missing','facet','extension']){
   const model=structuredClone(p.model),field=model.modules[0].elements.find((e:any)=>e.id==='assignmentStaff');
   if(mutation==='scalar')field.scalarType='integer';
   if(mutation==='missing')model.modules[0].elements=model.modules[0].elements.filter((e:any)=>e.id!=='assignmentStaff');
   if(mutation==='facet')field.facets={future:true};
   if(mutation==='extension')field.extensions={future:{equality:'opaque'}};
   const plan=m.resolveCandidateRecordAssociation(p.selector,model,p.entities);let refused=false;try{m.requireCandidateEndpointDomainCorrespondence(plan);}catch{refused=true;}
   rows.push({id:'domain-'+mutation,expected:mutation!=='none',observed:refused});
  }
  let copiedRefused=false;try{m.requireCandidateEndpointDomainCorrespondence({...original});}catch{copiedRefused=true;}
  rows.push({id:'domain-copied-plan',expected:true,observed:copiedRefused});
  const changed=structuredClone(p.model),isolated=m.resolveCandidateRecordAssociation(p.selector,changed,p.entities);changed.modules[0].elements.find((e:any)=>e.id==='assignmentStaff').scalarType='integer';
  let isolation=true;try{m.requireCandidateEndpointDomainCorrespondence(isolated);}catch{isolation=false;}
  rows.push({id:'domain-snapshot-isolation',expected:true,observed:isolation});
  const classified=m.requireCandidateAssociationClassifications(original,p.classifications);
  rows.push({id:'classification-original',expected:p.classifications,observed:classified});
  rows.push({id:'classification-frozen',expected:true,observed:Object.isFrozen(classified[0].fields[0])});
  for(const mutation of ['missing-record','missing-field','duplicate-field','unknown-protection','unknown-query-use']){
   const d=structuredClone(p.classifications);
   if(mutation==='missing-record')d.pop();
   if(mutation==='missing-field')d[0].fields.pop();
   if(mutation==='duplicate-field')d[0].fields.push(d[0].fields[0]);
   if(mutation==='unknown-protection')d[0].fields[0].protection='unknown';
   if(mutation==='unknown-query-use')d[0].fields[0].queryUse={future:'disclosed'};
   let refused=false;try{m.requireCandidateAssociationClassifications(original,d);}catch{refused=true;}
   rows.push({id:'classification-'+mutation,expected:true,observed:refused});
  }
  const checksUrl='/checks.js',checks=await import(checksUrl);
  for(const mutation of ['none','primary','invalid-matching-facet','unknown-extension']){
   const model=structuredClone(p.model);
   if(mutation==='primary')model.modules[0].elements.find((e:any)=>e.id==='Assignment').keys[0].primary=true;
   if(mutation==='invalid-matching-facet')for(const name of ['staffId','assignmentStaff'])model.modules[0].elements.find((e:any)=>e.id===name).facets={length:{max:-1,unit:'unicode-scalar'}};
   if(mutation==='unknown-extension')model.modules[0].elements.find((e:any)=>e.id==='assignmentStaff').extensions={future:{opaque:true}};
   let refused=false;try{checks.resolveCandidateRecordAssociationChecks(p.selector,model,p.entities,p.classifications);}catch{refused=true;}
   rows.push({id:'composed-'+mutation,expected:!['none','primary'].includes(mutation),observed:refused});
   if(mutation==='primary')rows.push({id:'composed-primary-retained',expected:true,observed:checks.resolveCandidateRecordAssociationChecks(p.selector,model,p.entities,p.classifications).plan.key.primary});
  }
  const staff=p.classifications[0],foreign={...staff.type,documentId:'foreign-document'};
  let foreignRefused=false;try{m.checkCandidateRecordClassifications(p.model,[foreign],[{type:foreign,fields:staff.fields}]);}catch{foreignRefused=true;}
  rows.push({id:'classification-foreign-scoped-record',expected:true,observed:foreignRefused});
  const g=p.graph,profile={profile:'association-record-key-agreement/0.1'},graphRun=(selector:any,document:any,interpretation:any)=>checks.resolveCandidateGraphRelationshipChecks(selector,document,g.entities,g.classifications,interpretation);
  const resolved=graphRun(g.selector,g.document,profile);
  rows.push({id:'graph-interpreted-key',expected:{profile:profile.profile,path:'/modules/0/relationships/1/associationRecord/key',keyId:'code-key'},observed:resolved.interpretedQualifier});
  rows.push({id:'graph-source-preserved',expected:g.document.modules[0].relationships[1],observed:resolved.plan.sourceRelationship});
  for(const mutation of ['default','unrelated-warning','wrong-key','bare','malformed-profile']){
   const selector=structuredClone(g.selector),document=structuredClone(g.document);let interpretation:any=profile;
   if(mutation==='default')interpretation=undefined;
   if(mutation==='unrelated-warning')document.modules[0].relationships[1].future=true;
   if(mutation==='wrong-key')selector.witness.keyId='missing';
   if(mutation==='bare')Object.assign(selector,g.bare);
   if(mutation==='malformed-profile')interpretation={...profile,ignoreWarnings:true};
   let refused=false;try{graphRun(selector,document,interpretation);}catch{refused=true;}
   rows.push({id:'graph-refusal-'+mutation,expected:true,observed:refused});
  }
  rows.push({id:'shared-record-kind',expected:'candidate-record-association-checks/0.1',observed:checks.resolveCandidateAssociationChecks(p.selector,p.model,p.entities,p.classifications).kind});
  rows.push({id:'shared-graph-kind',expected:'candidate-graph-relationship-checks/0.1',observed:checks.resolveCandidateAssociationChecks(g.selector,g.document,g.entities,g.classifications,profile).kind});
  for(const [name,selector,interpretation] of [['record-interpretation',p.selector,profile],['unknown-selector',{...p.selector,kind:'future'},undefined]] as const){
   let refused=false;try{checks.resolveCandidateAssociationChecks(selector,p.model,p.entities,p.classifications,interpretation);}catch{refused=true;}
   rows.push({id:'shared-refusal-'+name,expected:true,observed:refused});
  }
  let sharedCalls=0;const sharedHostile={};Object.defineProperty(sharedHostile,'kind',{enumerable:true,get(){sharedCalls++;return 'record-members';}});let sharedRefused=false;try{checks.resolveCandidateAssociationChecks(sharedHostile,p.model,p.entities,p.classifications);}catch{sharedRefused=true;}
  rows.push({id:'shared-accessor-refusal',expected:{refused:true,calls:0},observed:{refused:sharedRefused,calls:sharedCalls}});
  const rawChecks=checks.resolveCandidateAssociationChecks(p.selector,p.model,p.entities,p.classifications),root=checks.createCandidateAssociationScope(),first=checks.bindCandidateAssociationWitness(root,rawChecks,'a'),sibling=checks.bindCandidateAssociationWitness(root,rawChecks,'a');
  const end=checks.resolveCandidateAssociationWitnessTerm(first.witness,{kind:'endpoint',role:'staff'}),attr=checks.resolveCandidateAssociationWitnessTerm(first.witness,{kind:'attribute',field:p.classifications[2].fields.find((f:any)=>f.ref.elementId==='active').ref});
  rows.push({id:'witness-raw-correlation',expected:true,observed:end.witness===attr.witness&&end.witness===first.witness});
  rows.push({id:'witness-sibling-distinction',expected:true,observed:first.witness!==sibling.witness});
  for(const [name,run] of [
   ['shadow',()=>checks.bindCandidateAssociationWitness(first.scope,rawChecks,'a')],
   ['copied-scope',()=>checks.bindCandidateAssociationWitness({...root},rawChecks,'b')],
   ['copied-checks',()=>checks.bindCandidateAssociationWitness(root,{...rawChecks},'b')],
   ['copied-witness',()=>checks.resolveCandidateAssociationWitnessTerm({...first.witness},{kind:'identity'})],
   ['wrong-owner',()=>checks.resolveCandidateAssociationWitnessTerm(first.witness,{kind:'attribute',field:p.classifications[0].fields[0].ref})]
  ] as const){let refused=false;try{run();}catch{refused=true;}rows.push({id:'witness-refusal-'+name,expected:true,observed:refused});}
  const graphBinding=checks.bindCandidateAssociationWitness(root,resolved,'g'),ge=checks.resolveCandidateAssociationWitnessTerm(graphBinding.witness,{kind:'endpoint',role:'staff'}),ga=checks.resolveCandidateAssociationWitnessTerm(graphBinding.witness,{kind:'attribute',field:g.classifications[2].fields.find((f:any)=>f.ref.elementId==='Assignment-active').ref});
  rows.push({id:'witness-graph-correlation',expected:true,observed:ge.witness===ga.witness&&ge.witness===graphBinding.witness});
  let rootRefused=false;try{checks.resolveCandidateAssociationScopeTerm(root,'a',{kind:'identity'});}catch{rootRefused=true;}
  rows.push({id:'active-scope-unbound-refusal',expected:true,observed:rootRefused});
  rows.push({id:'active-scope-first-occurrence',expected:true,observed:checks.resolveCandidateAssociationScopeTerm(first.scope,'a',{kind:'identity'}).witness===first.witness});
  rows.push({id:'active-scope-sibling-occurrence',expected:true,observed:checks.resolveCandidateAssociationScopeTerm(sibling.scope,'a',{kind:'identity'}).witness===sibling.witness});
  let witnessCalls=0;const witnessHostile={kind:'attribute'};Object.defineProperty(witnessHostile,'field',{enumerable:true,get(){witnessCalls++;return p.classifications[2].fields[0].ref;}});let witnessRefused=false;try{checks.resolveCandidateAssociationScopeTerm(first.scope,'a',witnessHostile);}catch{witnessRefused=true;}
  rows.push({id:'active-scope-accessor-refusal',expected:{refused:true,calls:0},observed:{refused:witnessRefused,calls:witnessCalls}});
  const expressionChecks=p.expressionPacket.selectors.map((selector:any)=>{
   const types=new Set([selector.type.elementId,...selector.endpoints.map((e:any)=>e.target.elementId)]),views=p.expressionPacket.views.filter((v:any)=>types.has(v.type.elementId));
   return checks.resolveCandidateAssociationChecks(selector,p.model,p.entities,views);
  });
  const normalized=checks.normalizeCandidateAssociationExpression(p.expressionPacket.expression,expressionChecks),outer=normalized.expression,inner=outer.where.args[1];
  rows.push({id:'expression-nested-correlation',expected:true,observed:inner.where.args[1].left.witness===inner.witness&&inner.where.args[1].right.witness===outer.witness&&inner.where.args[2].left.witness===inner.witness});
  rows.push({id:'expression-residual-count',expected:2,observed:normalized.residuals.length});
  rows.push({id:'expression-frozen',expected:true,observed:Object.isFrozen(inner.where)});
  for(const mutation of ['unbound','shadow','owner','association']){
   const source=structuredClone(p.expressionPacket.expression),inner=source.where.args[1];
   if(mutation==='unbound')inner.where.args[1].left.name='missing';if(mutation==='shadow')inner.as='o';if(mutation==='owner')inner.where.args[2].left.field.elementId='staffId';if(mutation==='association')inner.association.documentId='foreign';
   let refused=false;try{checks.normalizeCandidateAssociationExpression(source,expressionChecks);}catch{refused=true;}
   rows.push({id:'expression-refusal-'+mutation,expected:true,observed:refused});
  }
  let copiedExpressionRefused=false;try{checks.normalizeCandidateAssociationExpression(p.expressionPacket.expression,expressionChecks.map((c:any)=>({...c})));}catch{copiedExpressionRefused=true;}
  rows.push({id:'expression-copied-checks',expected:true,observed:copiedExpressionRefused});
  rows.push({id:'expression-residual-paths',expected:['/where/args/0/right','/where/args/1/where/args/0/right'],observed:normalized.residuals.map((r:any)=>r.path)});
  let lengthCalls=0;const coercible=new Proxy([],{getOwnPropertyDescriptor(target,key){if(key==='length')return {value:{valueOf(){lengthCalls++;return 0;}},writable:true,enumerable:false,configurable:false};return Reflect.getOwnPropertyDescriptor(target,key);}});let lengthRefused=false;try{checks.normalizeCandidateAssociationExpression({op:'literal',value:true},coercible);}catch{lengthRefused=true;}
  rows.push({id:'expression-coercible-length',expected:{refused:true,calls:0},observed:{refused:lengthRefused,calls:lengthCalls}});
  for(const op of ['and','or'])for(const size of [0,64,65]){let refused=false;try{checks.normalizeCandidateAssociationExpression({op,args:Array.from({length:size},()=>({op:'literal',value:true}))},[]);}catch{refused=true;}rows.push({id:'expression-args-'+op+'-'+size,expected:size!==64,observed:refused});}
  for(const size of [15,16]){let expr:any={op:'literal',value:true};for(let i=0;i<size;i++)expr={op:'not',arg:expr};let refused=false;try{checks.normalizeCandidateAssociationExpression(expr,[]);}catch{refused=true;}rows.push({id:'expression-depth-'+size,expected:size===16,observed:refused});}
  const assignment=p.expressionPacket.selectors[1],active=p.expressionPacket.views.find((v:any)=>v.type.elementId==='Assignment').fields.find((f:any)=>f.ref.elementId==='active').ref,assignmentId=p.expressionPacket.views.find((v:any)=>v.type.elementId==='Assignment').fields.find((f:any)=>f.ref.elementId==='assignmentId').ref;
  for(const [name,left,right,expected] of [
   ['nominal',{endpoint:'staff'},{endpoint:'project'},true],
   ['identity-scalar',{endpoint:'staff'},{field:active},true],
   ['scalar-mismatch',{field:active},{field:assignmentId},true],
   ['identity-positive',{endpoint:'project'},{endpoint:'project'},false],
   ['scalar-positive',{field:active},{field:active},false]
  ] as const){const expr={op:'exists',association:assignment.type,as:'a',where:{op:'eq',left:{kind:'variable',name:'a',...left},right:{kind:'variable',name:'a',...right}}};let refused=false;try{checks.normalizeCandidateAssociationExpression(expr,expressionChecks);}catch{refused=true;}rows.push({id:'operand-'+name,expected,observed:refused});}
  rows.push({id:'constant-core-normalized',expected:'constant',observed:inner.where.args[2].right.term.kind});
  const invalidLiteral=structuredClone(p.expressionPacket.expression);invalidLiteral.where.args[1].where.args[2].right.value={string:'true'};let literalRefused=false;try{checks.normalizeCandidateAssociationExpression(invalidLiteral,expressionChecks);}catch{literalRefused=true;}
  rows.push({id:'constant-core-invalid-literal',expected:true,observed:literalRefused});
  const declaredContext={subject:{association:p.expressionPacket.selectors[1].type,endpoint:'staff'},resource:{association:p.expressionPacket.selectors[0].type,endpoint:'resource'}};
  rows.push({id:'context-full-policy-residuals',expected:0,observed:checks.normalizeCandidateAssociationExpression(p.expressionPacket.expression,expressionChecks,declaredContext).residuals.length});
  for(const mutation of ['role','type','foreign','extra']){const context=structuredClone(declaredContext);if(mutation==='role')context.subject.endpoint='missing';if(mutation==='type')context.subject.endpoint='project';if(mutation==='foreign')context.subject.association.documentId='foreign';if(mutation==='extra')(context.subject as any).future=true;let refused=false;try{checks.normalizeCandidateAssociationExpression(p.expressionPacket.expression,expressionChecks,context);}catch{refused=true;}rows.push({id:'context-refusal-'+mutation,expected:true,observed:refused});}
  const foreignField={documentId:'domain',moduleId:'m',elementId:'salary'};let contextOwnerRefused=false;try{checks.normalizeCandidateAssociationExpression({op:'eq',left:{kind:'subject',field:foreignField},right:{kind:'resource',field:foreignField}},expressionChecks,declaredContext);}catch{contextOwnerRefused=true;}rows.push({id:'context-refusal-field-owner',expected:true,observed:contextOwnerRefused});
  for(const [name,carrier] of [['number',123],['boolean',false],['object',{}],['array',[]]] as const){let refused=false;try{checks.normalizeCandidateAssociationExpression({op:'exists',association:assignment.type,as:'a',where:{op:'eq',left:{kind:'variable',name:'a',field:assignmentId},right:{kind:'constant',field:assignmentId,value:{string:carrier}}}},expressionChecks);}catch{refused=true;}rows.push({id:'constant-string-carrier-'+name,expected:true,observed:refused});}
  for(const [name,available,context] of [['foreign',[],{subject:{association:{documentId:'foreign',moduleId:'m',elementId:'missing'},endpoint:'missing'}}],['role',expressionChecks,{subject:{association:assignment.type,endpoint:'missing'}}]] as const){let refused=false;try{checks.normalizeCandidateAssociationExpression({op:'literal',value:true},available,context);}catch{refused=true;}rows.push({id:'context-eager-'+name,expected:true,observed:refused});}
  const changedModel=structuredClone(p.model);changedModel.modules[0].elements.find((e:any)=>e.id==='active').title='changed source';const conflictTypes=new Set([assignment.type.elementId,...assignment.endpoints.map((e:any)=>e.target.elementId)]),conflictViews=p.expressionPacket.views.filter((v:any)=>conflictTypes.has(v.type.elementId)),conflictCheck=checks.resolveCandidateAssociationChecks(assignment,changedModel,p.entities,conflictViews);
  for(const [name,available] of [['forward',[expressionChecks[0],conflictCheck]],['reverse',[conflictCheck,expressionChecks[0]]]] as const){let refused=false;try{checks.normalizeCandidateAssociationExpression({op:'literal',value:true},available);}catch{refused=true;}rows.push({id:'model-coherence-'+name,expected:true,observed:refused});}
  const unicodeModel=structuredClone(p.model),unicodeViews=structuredClone(p.expressionPacket.views),unicodeProject=unicodeModel.modules[0].elements.find((e:any)=>e.id==='Project'),unicodeClassification=unicodeViews.find((v:any)=>v.type.elementId==='Project');
  for(const id of ['é','e\u0301']){unicodeProject.members.push({module:'m',element:id});unicodeModel.modules[0].elements.push({id,kind:'field',scalarType:'string',cardinality:'one',nullability:'required',extensions:{}});unicodeClassification.fields.push({ref:{documentId:'domain',moduleId:'m',elementId:id},protection:'unprotected'});}
  const unicodeBuild=(index:number,views:any)=>{const selector=p.expressionPacket.selectors[index],scope=new Set([selector.type.elementId,...selector.endpoints.map((e:any)=>e.target.elementId)]);return checks.resolveCandidateAssociationChecks(selector,unicodeModel,p.entities,views.filter((v:any)=>scope.has(v.type.elementId)));};
  const unicodeFirst=unicodeBuild(0,unicodeViews),reordered=structuredClone(unicodeViews);reordered.find((v:any)=>v.type.elementId==='Project').fields.reverse();
  for(const mutation of ['equivalent','protection','queryUse']){const views=structuredClone(reordered),field=views.find((v:any)=>v.type.elementId==='Project').fields.find((f:any)=>f.ref.elementId==='é');if(mutation==='protection')field.protection='protected';if(mutation==='queryUse')field.queryUse={predicate:'prohibited'};const second=unicodeBuild(1,views);for(const [order,available] of [['forward',[unicodeFirst,second]],['reverse',[second,unicodeFirst]]] as const){let refused=false;try{checks.normalizeCandidateAssociationExpression({op:'literal',value:true},available);}catch{refused=true;}rows.push({id:'classification-coherence-'+mutation+'-'+order,expected:mutation!=='equivalent',observed:refused});}}
  const transport=checks.serializeCandidateAssociationExpression(checks.normalizeCandidateAssociationExpression(p.expressionPacket.expression,expressionChecks,declaredContext)),wireInner=transport.expression.where.args[1];
  rows.push({id:'transport-correlation',expected:[0,1,1,0],observed:[transport.expression.occurrence,wireInner.occurrence,wireInner.where.args[1].left.occurrence,wireInner.where.args[1].right.occurrence]});
  rows.push({id:'transport-json-roundtrip',expected:true,observed:JSON.stringify(JSON.parse(JSON.stringify(transport)))===JSON.stringify(transport)});
  for(const [name,value] of [['residual',normalized],['copied',{...checks.normalizeCandidateAssociationExpression(p.expressionPacket.expression,expressionChecks,declaredContext)}]] as const){let refused=false;try{checks.serializeCandidateAssociationExpression(value);}catch{refused=true;}rows.push({id:'transport-refusal-'+name,expected:true,observed:refused});}
  rows.push({id:'transport-receiver-roundtrip',expected:true,observed:JSON.stringify(checks.inspectCandidateAssociationExpressionTransport(JSON.parse(JSON.stringify(transport))))===JSON.stringify(transport)});
  for(const mutation of ['occurrence','key','source','context','unknown']){const wire=structuredClone(transport);if(mutation==='occurrence')wire.expression.where.args[1].where.args[1].right.occurrence=1;if(mutation==='key')wire.associations[0].checks.plan.key.id='missing';if(mutation==='source')wire.associations[0].source.modules[0].elements.find((e:any)=>e.id==='ownerProject').scalarType='boolean';if(mutation==='context')wire.sourceExpression.context.subject.endpoint='project';if(mutation==='unknown')wire.future=true;let refused=false;try{checks.inspectCandidateAssociationExpressionTransport(wire);}catch{refused=true;}rows.push({id:'transport-receiver-refusal-'+mutation,expected:true,observed:refused});}
  const migration=checks.migrateCandidateSecurityOntology(p.expressionPacket.ontology,'ontology-2');rows.push({id:'ontology-migration-known',expected:{version:'0.2.0',records:5,residuals:0},observed:{version:migration.target.version,records:migration.target.entities.length,residuals:migration.residuals.length}});
  const unfamiliar=structuredClone(p.expressionPacket.ontology);unfamiliar.associations[1].future={meaning:'kept'};const unknownMigration=checks.migrateCandidateSecurityOntology(unfamiliar,'ontology-2');rows.push({id:'ontology-migration-unknown',expected:{archive:{meaning:'kept'},path:'/associations/1/future'},observed:{archive:unknownMigration.source.associations[1].future,path:unknownMigration.residuals[0].path}});
  for(const name of ['constructor','toString','__proto__']){const ontology=structuredClone(p.expressionPacket.ontology);Object.defineProperty(ontology.entities[0],name,{enumerable:true,value:{meaning:'kept'}});const result=checks.migrateCandidateSecurityOntology(ontology,'ontology-2');rows.push({id:'ontology-migration-reserved-'+name,expected:true,observed:result.residuals.some((r:any)=>r.path==='/entities/0/'+name)});}
  let immutable=Object.isFrozen(migration.target.entities[0].fields[0]);try{migration.target.entities[0].fields[0].protection='protected';}catch{immutable=true;}rows.push({id:'ontology-migration-isolation',expected:true,observed:immutable&&migration.source.entities[0].fields[0].protection==='unprotected'&&migration.target.entities[0].fields!==migration.source.entities[0].fields});
  const ontologyChecked=checks.resolveCandidateSecurityOntology(migration.target,[{revision:p.expressionPacket.ontology.documents[0].revision,document:p.model}]);rows.push({id:'ontology-whole-known',expected:2,observed:ontologyChecked.associations.length});
  for(const mutation of ['stale','classification','unknown','subject']){const ontology=structuredClone(migration.target),documents=[{revision:p.expressionPacket.ontology.documents[0].revision,document:p.model}];if(mutation==='stale')documents[0].revision='stale';if(mutation==='classification')ontology.entities[0].fields=[];if(mutation==='unknown')ontology.entities[0].constructor={meaning:'unknown'};if(mutation==='subject')ontology.subject.elementId='missing';let refused=false;try{checks.resolveCandidateSecurityOntology(ontology,documents);}catch{refused=true;}rows.push({id:'ontology-whole-refusal-'+mutation,expected:true,observed:refused});}
  const policyMigration=checks.migrateCandidateSecurityPolicy(p.expressionPacket.policy,{documentId:'domain',revision:'ontology-2'},'policy-2');rows.push({id:'policy-migration-known',expected:{version:'0.2.0',revision:'policy-2',ontologyRevision:'ontology-2',residuals:0},observed:{version:policyMigration.target.version,revision:policyMigration.target.revision,ontologyRevision:policyMigration.target.ontology.revision,residuals:policyMigration.residuals.length}});
  const unknownPolicy=structuredClone(p.expressionPacket.policy);Object.defineProperty(unknownPolicy.rules[1].condition,'constructor',{enumerable:true,value:{meaning:'kept'}});const unknownPolicyMigration=checks.migrateCandidateSecurityPolicy(unknownPolicy,{documentId:'domain',revision:'ontology-2'},'policy-2');rows.push({id:'policy-migration-unknown',expected:'/rules/1/condition/constructor',observed:unknownPolicyMigration.residuals[0].path});
  const wholePolicyBindings=[{ruleId:'membership',target:policyMigration.target.rules[1].target[0],context:declaredContext}],wholePolicy=checks.resolveCandidateSecurityPolicy(policyMigration.target,migration.target,[{revision:p.expressionPacket.ontology.documents[0].revision,document:p.model}],wholePolicyBindings);rows.push({id:'policy-whole-known',expected:{conditions:2,residuals:0},observed:{conditions:wholePolicy.conditions.length,residuals:wholePolicy.residuals.length}});
  for(const mutation of ['action','disclosure','subject','revision']){const policy=structuredClone(policyMigration.target),bindings=structuredClone(wholePolicyBindings);if(mutation==='action')policy.rules[0].actions=['unknown'];if(mutation==='disclosure')policy.rules[0].disclosure[0].field.elementId='staffId';if(mutation==='subject')bindings[0].context.subject.endpoint='project';if(mutation==='revision')policy.ontology.revision='stale';let refused=false;try{checks.resolveCandidateSecurityPolicy(policy,migration.target,[{revision:p.expressionPacket.ontology.documents[0].revision,document:p.model}],bindings);}catch{refused=true;}rows.push({id:'policy-whole-refusal-'+mutation,expected:true,observed:refused});}
  const tree=(count:number)=>{const groups=Math.ceil((count-1)/65),leaves=count-1-groups;return {op:'and',args:Array.from({length:groups},(_,i)=>({op:'and',args:Array.from({length:i<groups-1?64:leaves-64*(groups-1)},()=>({op:'literal',value:true}))}))};};
  for(const [name,sizes,multiple] of [['4096',[2048,2048],false],['4097',[2048,2049],false],['4226',[2113,2113],false],['multiple-targets',[2048,2048],true]] as const){const policy=structuredClone(policyMigration.target);for(let i=0;i<2;i++){policy.rules[i].condition=tree(sizes[i]);if(multiple){policy.rules[i].target.push({documentId:'domain',moduleId:'m',elementId:'Project'});delete policy.rules[i].disclosure;}}let refused=false;try{checks.resolveCandidateSecurityPolicy(policy,migration.target,[{revision:p.expressionPacket.ontology.documents[0].revision,document:p.model}]);}catch{refused=true;}rows.push({id:'policy-whole-node-bound-'+name,expected:sizes[0]+sizes[1]>4096,observed:refused});}
  const dependencies=checks.candidateSecurityPolicyDependencies(wholePolicy);rows.push({id:'policy-dependencies-fields',expected:['active','assignmentProject','assignmentStaff','ownerProject','ownerResource','projectId','resourceId','staffId'].sort(),observed:dependencies.fields.map((r:any)=>r.elementId).sort()});rows.push({id:'policy-dependencies-associations',expected:['Assignment','Ownership'],observed:dependencies.associations.map((r:any)=>r.type.elementId).sort()});
  let copiedDependencyRefused=false;try{checks.candidateSecurityPolicyDependencies({...wholePolicy});}catch{copiedDependencyRefused=true;}rows.push({id:'policy-dependencies-copied-refusal',expected:true,observed:copiedDependencyRefused});
  for(const mode of ['true','false','secondary','duplicate']){const document=structuredClone(p.model);if(mode==='true'||mode==='false'){for(const record of document.modules[0].elements)if(record.kind==='record')record.keys[0].primary=mode==='true';}else{const resource=document.modules[0].elements.find((e:any)=>e.id==='Resource');resource.keys[0].primary=mode==='duplicate';resource.keys.push({id:'secondary',name:'Secondary',primary:true,fields:[{module:'m',element:'salary'}]});}const result=checks.inspectSecurityPolicy(p.expressionPacket.policy,{ontology:p.expressionPacket.ontology,documents:[{revision:p.expressionPacket.ontology.documents[0].revision,document}]});rows.push({id:'original-primary-'+mode,expected:mode!=='duplicate',observed:result.valid&&result.complete});}
  for(const keyIndex of [0,1])for(const [name,carrier] of [['null',null],['string','true'],['number',1]] as const){const document=structuredClone(p.model),resource=document.modules[0].elements.find((e:any)=>e.id==='Resource');resource.keys.push({id:'secondary',name:'Secondary',primary:true,fields:[{module:'m',element:'salary'}]});resource.keys[keyIndex].primary=carrier;const result=checks.inspectSecurityPolicy(p.expressionPacket.policy,{ontology:p.expressionPacket.ontology,documents:[{revision:p.expressionPacket.ontology.documents[0].revision,document}]});rows.push({id:'original-primary-malformed-'+keyIndex+'-'+name,expected:false,observed:result.valid&&result.complete});}
  return rows;
 },{selector,model,entities,plan,classifications,graph,expressionPacket} as any);
 if(external||observations.length!==144||observations.some(o=>JSON.stringify(o.expected)!==JSON.stringify(o.observed)))throw Error('Browser mismatch');
 for(const [p,h] of Object.entries(pins))if(await hash(p)!==h)throw Error('Source changed');
 await Bun.write('docs/helix/04-build/evidence/security/association-candidate-browser.json',JSON.stringify({status:'draft-association-browser-passed',nativeImplementationQualified:false,externalRequests:external,browser:await browser.version(),sourceDigests:pins,selector,model,entities,plan,classifications,graph,observations,scope:'Private shared relational/graph checked composition, selected descriptor and classification coverage, and explicit draft graph Key-agreement interpretation in Chromium; public policy typing, authenticated interpretation/revision/cut authority, original compiler and native enforcement remain unqualified.'},null,2)+'\n');console.log(JSON.stringify({status:'passed',checks:144}));
}finally{await browser?.close();server.stop(true);}
