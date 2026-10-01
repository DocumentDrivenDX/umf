import {chromium} from 'playwright';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {relationshipExtraCases} from './relationship-extras-cases';
import {projectRelationshipToExtra,importRelationshipExtraArchive,type RelationshipExtraArchive} from '../../src';
const cases=relationshipExtraCases().map(c=>({...c,expectedResult:projectRelationshipToExtra(c.source,c.author,c.request)}));
const native=[
 {system:'graphql',archive:{format:'graphql-sdl',text:'# retained comment\ndirective @future on FIELD_DEFINITION\ntype Query { customer: Customer @future }\ntype Customer { id: ID }\n'}},
 {system:'rdf',archive:{format:'rdf-nquads',blankNodeScope:'native-source',text:await Bun.file('fixtures/relationship-native/rdf-union-domain.nq').text()}},
 {system:'linkml',archive:{format:'linkml-yaml',text:await Bun.file('fixtures/relationship-native/linkml-slot.yaml').text()}}
].map(c=>{const source=importRelationshipExtraArchive(c.archive as RelationshipExtraArchive,'original');source.vocabularies.future={version:'1.0.0'};source.extensions={future:{opaque:['9007199254740993',null]}};return {...c,source};});
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){const path=new URL(request.url).pathname;if(path==='/umf.js')return new Response(Bun.file('dist/umf.js'),{headers:{'content-type':'text/javascript'}});if(path==='/cases')return Response.json({cases,native});return new Response('<!doctype html><html>Relationship additional native profiles</html>',{headers:{'content-type':'text/html'}});}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});
 const page=await browser.newPage(),external:string[]=[];
 await page.route('**/*',route=>{if(!route.request().url().startsWith(`http://127.0.0.1:${server.port}/`)){external.push(route.request().url());return route.abort();}return route.continue();});
 await page.goto(`http://127.0.0.1:${server.port}/`);
 const checks=await page.evaluate(async()=>{
  const path='/umf.js',u=await import(path),{cases,native}=await(await fetch('/cases')).json();
  let projected=0,blocked=0,idealRecoveries=0,nativeRecoveries=0,classificationRecoveries=0,forgedRefusals=0,staleRefusals=0,getterReads=0;
  for(const c of cases){
   const r=u.projectRelationshipToExtra(c.source,c.author,c.request);if(JSON.stringify(r)!==JSON.stringify(c.expectedResult))throw Error('Bun/Chromium extras mismatch');
   if(r.status==='blocked'){if(r.target||r.nativeArchive||r.mappings.length)throw Error('Blocked extra emitted partial target');blocked++;continue;}
   projected++;
   const fresh=u.importRelationshipExtraArchive(r.nativeArchive,'fresh-native');
   const classified=u.classifyRelationshipExtra(fresh,{system:c.request.system,mode:'report',archive:r.nativeArchive});
   if(JSON.stringify(classified.target)!==JSON.stringify(fresh)||classified.target.modules.some((m:any)=>Object.hasOwn(m,'relationships')))throw Error('Native classification invented intent');
   for(const format of ['json','yaml']){
    const receipt=u.readJsonValue(u.writeJsonValue(r,format),format);
    if(JSON.stringify(u.recoverRelationshipExtraIdeal(receipt,classified.target))!==JSON.stringify(c.source))throw Error('Ideal recovery changed meaning');idealRecoveries++;
    if(JSON.stringify(u.recoverRelationshipExtraNative(receipt,fresh).archive)!==JSON.stringify(r.nativeArchive))throw Error('Native archive recovery changed');nativeRecoveries++;
    if(JSON.stringify(u.recoverRelationshipExtraNative(classified,classified.target).document)!==JSON.stringify(fresh))throw Error('Classified native changed');classificationRecoveries++;
   }
   const forged=structuredClone(r);forged.residuals.pop();try{u.verifyRelationshipExtra(forged);}catch{forgedRefusals++;}
   const stale=structuredClone(fresh);stale.extensions={future:{changed:true}};try{u.recoverRelationshipExtraIdeal(r,stale);}catch{staleRefusals++;}
   const policy={...c.request};Object.defineProperty(policy,'records',{enumerable:true,get(){getterReads++;return c.request.records;}});let refused=false;try{u.projectRelationshipToExtra(c.source,c.author,policy);}catch{refused=true;}if(!refused)throw Error('Getter policy accepted');
  }
  let unknownNativeRecoveries=0,classificationStrictBlocks=0;
  for(const c of native){
   const r=u.classifyRelationshipExtra(c.source,{system:c.system,mode:'report',archive:c.archive});
   for(const format of ['json','yaml']){const receipt=u.readJsonValue(u.writeJsonValue(r,format),format),restored=u.recoverRelationshipExtraNative(receipt,r.target);if(JSON.stringify(restored.document)!==JSON.stringify(c.source)||JSON.stringify(restored.archive)!==JSON.stringify(c.archive))throw Error('Unknown native archive content changed');unknownNativeRecoveries++;}
   const strict=u.classifyRelationshipExtra(c.source,{system:c.system,mode:'strict',archive:c.archive});if(strict.status!=='blocked'||strict.target)throw Error('Strict classification emitted a candidate');classificationStrictBlocks++;
  }
  if(forgedRefusals!==projected||staleRefusals!==projected||getterReads!==0||'Bun'in globalThis||'process'in globalThis)throw Error('Refusal/global checks failed');
  return {cases:cases.length,projected,blocked,idealRecoveries,nativeRecoveries,classificationRecoveries,forgedRefusals,staleRefusals,getterReads,unknownNativeRecoveries,classificationStrictBlocks};
 });
 if(external.length)throw Error('External browser request');
 const paths=['src/index.ts','src/core-ideals/relationship-extras.ts','spec/core/relationship-extras.schema.json','scripts/core-ideals/relationship-extras-cases.ts','scripts/core-ideals/relationship-extras-browser.ts','fixtures/relationship/authored/corpus.json','fixtures/relationship-native/rdf-union-domain.nq','fixtures/relationship-native/linkml-slot.yaml','dist/umf.js'];
 await Bun.write('fixtures/validation/relationship-extras/browser.json',JSON.stringify({browser:browser.version(),checks,externalRequests:external,sha256:Object.fromEntries(paths.map(p=>[p,createHash('sha256').update(readFileSync(p)).digest('hex')]))},null,2)+'\n');console.log(JSON.stringify(checks));
}finally{await browser?.close();server.stop(true);}
