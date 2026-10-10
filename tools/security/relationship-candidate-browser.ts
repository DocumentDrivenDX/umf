import {chromium} from 'playwright';
import {createHash} from 'node:crypto';
const evidence='docs/helix/04-build/evidence/security/relationship-selector-spike.json',retained=await Bun.file(evidence).json();
const source='src/extensions/security/relationship-candidate.ts',paths=[source,'src/model/json.ts','src/model/types.ts',evidence,'tools/security/relationship-candidate-browser.ts'];
const digest=async(p:string)=>createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex');
for(const [p,h] of Object.entries(retained.sourceDigests))if(await digest(p)!==h)throw Error('Stale draft normalization source');
const pins=Object.fromEntries(await Promise.all(paths.map(async p=>[p,await digest(p)])));
const build=await Bun.build({entrypoints:[source],target:'browser',format:'esm'});if(!build.success)throw Error('Candidate browser build failed');const js=await build.outputs[0]!.text();
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){return new URL(request.url).pathname==='/candidate.js'?new Response(js,{headers:{'content-type':'text/javascript'}}):new Response('<!doctype html><title>Relationship normalization candidate</title>');}});
let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:Bun.env.UMF_CHROMIUM_PATH});const page=await browser.newPage();let external=0;
 await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():(external++,route.abort()));await page.goto(`http://127.0.0.1:${server.port}`);
 const observed=await page.evaluate(async(packet)=>{
  const url='/candidate.js',module=await import(url),original=module.resolveCandidateRelationship(packet.original,packet.model,packet.entities),bare=module.resolveCandidateRelationship(packet.bare,packet.model,packet.entities);
  const rejects=(run:()=>unknown)=>{try{run();return false;}catch{return true;}};
  const rows=[{id:'original-plan-correspondence',expected:packet.plans.original,observed:original},{id:'bare-plan-correspondence',expected:packet.plans.bare,observed:bare}];
  for(const term of ['exists','endpoint','identity','attribute','count','distinct','disclose'])rows.push({id:'bare-term-'+term,expected:!['exists','endpoint'].includes(term),observed:rejects(()=>module.requireCandidateWitnessTerm(bare,term))});
  rows.push({id:'copied-plan-refusal',expected:true,observed:rejects(()=>module.requireCandidateWitnessTerm({...bare},'exists'))});
  const entities=structuredClone(packet.entities),alternate=structuredClone(packet.model);const entity=entities[0].type;const record=alternate.modules.find((m:any)=>m.id===entity.moduleId).elements.find((e:any)=>e.id===entity.elementId);record.keys.push({...record.keys[0],id:'alternate',name:'alternate',primary:false});entities[0].keyId='alternate';rows.push({id:'entity-key-mismatch-refusal',expected:true,observed:rejects(()=>module.resolveCandidateRelationship(packet.original,alternate,entities))});
  let calls=0;const getter=structuredClone(packet.original);Object.defineProperty(getter.witness,'keyId',{enumerable:true,get(){calls++;return 'code-key';}});
  rows.push({id:'accessor-refusal',expected:{refused:true,calls:0},observed:{refused:rejects(()=>module.resolveCandidateRelationship(getter,packet.model,packet.entities)),calls}});
  for(const side of ['endpoint','witness'])for(const size of [4096,4097]){
   const selector=structuredClone(packet.original),model=structuredClone(packet.model),identities=structuredClone(packet.entities),keyId='😀'.repeat(size);
   if(side==='endpoint'){const target=selector.endpoints[0].target;selector.endpoints[0].keyId=keyId;identities.find((e:any)=>e.type.elementId===target.elementId).keyId=keyId;model.modules.find((m:any)=>m.id===target.moduleId).elements.find((e:any)=>e.id===target.elementId).keys[0].id=keyId;}
   else{const target=selector.witness.type;selector.witness.keyId=keyId;model.modules.find((m:any)=>m.id===target.moduleId).elements.find((e:any)=>e.id===target.elementId).keys[0].id=keyId;model.modules.find((m:any)=>m.id===selector.relationship.moduleId).relationships.find((r:any)=>r.id===selector.relationship.relationshipId).associationRecord.key=keyId;}
   rows.push({id:'key-bound-'+side+'-'+size,expected:size>4096,observed:rejects(()=>module.resolveCandidateRelationship(selector,model,identities))});
  }
  for(const mutation of ['undirected','plural-source','plural-target','duplicate-relationship']){
   const model=structuredClone(packet.model),relationship=model.modules.find((m:any)=>m.id===packet.original.relationship.moduleId).relationships.find((r:any)=>r.id===packet.original.relationship.relationshipId);
   if(mutation==='undirected')relationship.directed=false;
   if(mutation==='plural-source')relationship.source.push({...relationship.source[0]});
   if(mutation==='plural-target')relationship.target.push({...relationship.target[0]});
   if(mutation==='duplicate-relationship')model.modules.find((m:any)=>m.id===packet.original.relationship.moduleId).relationships.push({...relationship});
   rows.push({id:'unsupported-source-'+mutation,expected:true,observed:rejects(()=>module.resolveCandidateRelationship(packet.original,model,packet.entities))});
  }
  const archived=structuredClone(packet.model),relationship=archived.modules.find((m:any)=>m.id===packet.original.relationship.moduleId).relationships.find((r:any)=>r.id===packet.original.relationship.relationshipId);relationship.retainedAnnotation={opaque:['keep']};
  const archivePlan=module.resolveCandidateRelationship(packet.original,archived,packet.entities);
  rows.push({id:'source-annotation-retention',expected:{opaque:['keep'],frozen:true},observed:{...archivePlan.sourceRelationship.retainedAnnotation,frozen:Object.isFrozen(archivePlan.sourceRelationship.retainedAnnotation.opaque)}});
  const endpoint=original.endpoints[0],witness=original.witness;
  rows.push({id:'selected-endpoint',expected:{kind:'entity-identity',relationship:original.relationship,role:endpoint.role,side:endpoint.side,type:endpoint.target,key:endpoint.key},observed:module.resolveCandidateRelationshipTerm(original,{kind:'endpoint',role:endpoint.role})});
  rows.push({id:'selected-record-identity',expected:{kind:'record-identity',relationship:original.relationship,type:witness.type,key:witness.key},observed:module.resolveCandidateRelationshipTerm(original,{kind:'identity'})});
  const field=witness.attributes[0],attributeInput={kind:'attribute',field:structuredClone(field)},attribute=module.resolveCandidateRelationshipTerm(original,attributeInput);attributeInput.field.elementId='changed';
  rows.push({id:'selected-record-attribute',expected:{kind:'record-attribute',relationship:original.relationship,type:witness.type,field},observed:attribute});
  rows.push({id:'selected-attribute-freeze',expected:true,observed:Object.isFrozen(attribute.field)});
  for(const [name,plan,term] of [
   ['missing-role',original,{kind:'endpoint',role:'missing'}],
   ['wrong-field-owner',original,{kind:'attribute',field:endpoint.target}],
   ['foreign-field',original,{kind:'attribute',field:{...field,documentId:'other'}}],
   ['unknown-qualifier',original,{kind:'identity',extra:true}],
   ['copied-plan',{...original},{kind:'identity'}],
   ['bare-identity',bare,{kind:'identity'}],
   ['bare-attribute',bare,{kind:'attribute',field}]
  ] as const)rows.push({id:'selected-refusal-'+name,expected:true,observed:rejects(()=>module.resolveCandidateRelationshipTerm(plan,term))});
  let termCalls=0;const hostile={kind:'attribute'};Object.defineProperty(hostile,'field',{enumerable:true,get(){termCalls++;return field;}});
  rows.push({id:'selected-accessor-refusal',expected:{refused:true,calls:0},observed:{refused:rejects(()=>module.resolveCandidateRelationshipTerm(original,hostile)),calls:termCalls}});
  return rows;
 },retained);
 if(external||observed.length!==33||observed.some(o=>JSON.stringify(o.expected)!==JSON.stringify(o.observed)))throw Error('Candidate browser mismatch');
 for(const [p,h] of Object.entries(pins))if(await digest(p)!==h)throw Error('Candidate source changed');
 await Bun.write('docs/helix/04-build/evidence/security/relationship-candidate-browser.json',JSON.stringify({status:'draft-candidate-browser-passed',nativeImplementationQualified:false,sourceDigests:pins,browser:await browser.version(),externalRequests:external,observations:observed,scope:'Portable private draft normalization and witness term capability checks in real Chromium; source-authenticated runtime witnesses, public ontology, policy/compiler integration and native enforcement remain unqualified.'},null,2)+'\n');
 console.log(JSON.stringify({status:'passed',checks:33,browser:await browser.version()}));
}finally{await browser?.close();server.stop(true);}
