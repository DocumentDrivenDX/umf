import {chromium} from 'playwright';
import {createHash} from 'node:crypto';
import corpus from '../../fixtures/relationship/authored/corpus.json';
import {relationshipExtraCases} from './relationship-extras-cases';
import {verifyRelationshipAuthoredCorpus} from './relationship-conformance';
const expected=verifyRelationshipAuthoredCorpus();
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(req){const p=new URL(req.url).pathname;if(p==='/cases')return Response.json({corpus,cases:expected.cases,templates:relationshipExtraCases()});if(p==='/umf.js')return new Response(Bun.file('dist/umf.js'),{headers:{'content-type':'text/javascript'}});return new Response('<!doctype html><title>Relationship admission corpus</title>');}});
let browser;
// @covers US-045-AC4 @covers US-045-AC5 @covers US-045-AC6 @covers US-045-AC7 @covers US-045-AC8 @covers US-045-AC10
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage(),externalRequests:string[]=[];
 await page.route('**/*',route=>{if(!route.request().url().startsWith(`http://127.0.0.1:${server.port}/`)){externalRequests.push(route.request().url());return route.abort();}return route.continue();});await page.goto(`http://127.0.0.1:${server.port}/`);
 const checks=await page.evaluate(async()=>{
  const path='/umf.js',u=await import(path),{corpus,cases,templates}=await(await fetch('/cases')).json();let migrationRecoveries=0,idealRecoveries=0,nativeRecoveries=0,strictBlocks=0,refusals=0;
  const equal=(a:any,b:any)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw Error('Corpus recovery mismatch');};
  for(const c of cases){const legacy=structuredClone(corpus.base);legacy.vocabularies.future={version:'1.0.0'};legacy.extensions={future:{integerText:'9007199254740993',unknown:[null,{retained:true}]}};legacy.modules[0].relationships={futureNative:'uninterpreted collision'};
   const up=u.upgradeRelationshipEnvelope(legacy),author=u.declareCoreRelationship(up.target,{module:'sales'},c.relationship),source=author.target;
   for(const format of ['json','yaml']){const saved=u.readJsonValue(u.writeJsonValue(up,format),format),rolled=u.rollbackRelationshipEnvelope(saved,source);equal(rolled.target,legacy);equal(rolled.source,source);u.verifyRelationshipTransition(rolled);migrationRecoveries++;}
   for(const template of templates.filter((x:any)=>x.name.startsWith((c.id==='bounded-owned-one-to-many'?'owned-one-to-many':c.id)+'-'))){const r=u.projectRelationshipToExtra(source,author,template.request);
    if(template.request.mode==='strict'){if(r.status!=='blocked'||r.target)throw Error('Strict emitted');strictBlocks++;continue;}if(r.status!=='projected')throw Error('Missing report');
    const fresh=u.importRelationshipExtraArchive(r.nativeArchive,'fresh-browser');for(const format of ['json','yaml']){const saved=u.readJsonValue(u.writeJsonValue(r,format),format);equal(u.recoverRelationshipExtraIdeal(saved,fresh),source);idealRecoveries++;equal(u.recoverRelationshipExtraNative(saved,fresh).archive,r.nativeArchive);nativeRecoveries++;const classified=u.classifyRelationshipExtra(fresh,{system:template.request.system,mode:'report',archive:r.nativeArchive});if(classified.target.modules.some((m:any)=>Object.hasOwn(m,'relationships')))throw Error('Native inferred intent');equal(u.recoverRelationshipExtraNative(classified,classified.target).archive,r.nativeArchive);nativeRecoveries++;}
    const forged=structuredClone(r);forged.residuals.pop();let refused=false;try{u.verifyRelationshipExtra(forged,fresh);}catch{refused=true;}if(!refused)throw Error('Forged accepted');refusals++;
   }
  }
  if('Bun'in globalThis||'process'in globalThis)throw Error('Host globals');return {cases:cases.length,migrationRecoveries,idealRecoveries,nativeRecoveries,strictBlocks,blocked:strictBlocks,refusals};
 });
 if(checks.cases!==expected.cases.length||checks.migrationRecoveries!==expected.cases.length*2||checks.idealRecoveries!==expected.cases.length*6||checks.nativeRecoveries!==expected.cases.length*12||checks.strictBlocks!==expected.cases.length*3||checks.refusals!==expected.cases.length*3||externalRequests.length)throw Error('Incomplete browser admission matrix');
 const paths=['scripts/core-ideals/relationship-conformance-browser.ts','scripts/core-ideals/relationship-conformance.ts','scripts/core-ideals/relationship-extras-cases.ts','fixtures/relationship/authored/corpus.json','src/index.ts','dist/umf.js'];
 const sha256=Object.fromEntries(await Promise.all(paths.map(async p=>[p,createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex')])));
 await Bun.write('fixtures/validation/relationship-conformance-browser.json',JSON.stringify({scope:'Nine canonical authored shapes, retained migration and extra schema recoveries; independent native target subsets remain in their own proofs',browser:browser.version(),checks,externalRequests,sha256},null,2)+'\n');console.log(JSON.stringify(checks));
}finally{await browser?.close();server.stop(true);}
