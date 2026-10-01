import {chromium} from 'playwright';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {projectDddToGraphql} from '../../src';
import {graphqlCases} from './ddd-graphql-cases';
const cases=graphqlCases().map(f=>({...f,expected:projectDddToGraphql(f.logical,f.policy,'report')}));
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){const path=new URL(request.url).pathname;
 if(path==='/umf.js')return new Response(Bun.file('dist/umf.js'),{headers:{'content-type':'text/javascript'}});
 if(path==='/cases')return Response.json(cases);
 return new Response('<!doctype html><html>DDD and relationship GraphQL projection</html>',{headers:{'content-type':'text/html'}});
}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});
 const page=await browser.newPage(),external:string[]=[];
 await page.route('**/*',route=>{if(!route.request().url().startsWith(`http://127.0.0.1:${server.port}/`)){external.push(route.request().url());return route.abort();}return route.continue();});
 await page.goto(`http://127.0.0.1:${server.port}/`);
 const checks=await page.evaluate(async()=>{
  const path='/umf.js',u=await import(path),cases=await(await fetch('/cases')).json();
  let idealRecoveries=0,nativeRecoveries=0,strictBlocks=0,forgedRefusals=0,staleRefusals=0,getterReads=0;
  for(const f of cases){
   const p=u.projectDddToGraphql(f.logical,f.policy,'report');
   if(JSON.stringify(p)!==JSON.stringify(f.expected))throw Error('Bun/Chromium report mismatch');
   const strict=u.projectDddToGraphql(f.logical,f.policy,'strict');
   if(strict.status!=='blocked'||strict.candidate||strict.targetArchive)throw Error('Strict partial SDL');strictBlocks++;
   for(const format of ['json','yaml']){
    const receipt=u.readJsonValue(u.writeJsonValue(p,format),format);
    const target=u.readJsonValue(u.writeJsonValue(u.importGraphqlSchema(p.candidate,{id:'fresh-native',mode:'schema'}),format),format);
    if(JSON.stringify(u.recoverDddFromGraphql(receipt,target))!==JSON.stringify(f.logical))throw Error('Authored recovery mismatch');idealRecoveries++;
    if(u.recoverDddGraphqlNative(receipt,target)!==p.candidate)throw Error('Native recovery mismatch');nativeRecoveries++;
   }
   const forged=structuredClone(p);forged.residuals.pop();try{u.verifyDddGraphqlProjection(forged);}catch{forgedRefusals++;}
   const stale=u.importGraphqlSchema(p.candidate.replace('id: Int!','id: String'),{id:'stale',mode:'schema'});try{u.recoverDddFromGraphql(p,stale);}catch{staleRefusals++;}
   const bad={...f.policy};Object.defineProperty(bad,'root',{enumerable:true,get(){getterReads++;return f.policy.root;}});
   let refused=false;try{u.projectDddToGraphql(f.logical,bad,'report');}catch{refused=true;}if(!refused)throw Error('Accessor accepted');
  }
  if(forgedRefusals!==cases.length||staleRefusals!==cases.length||getterReads!==0)throw Error('Receipt/accessor refusal failed');
  const f=cases[0],legacy=structuredClone(f.logical);legacy.umf='0.6.0';legacy.modules[0].relationships={futureLegacy:['opaque',1]};
  const upgraded=u.upgradeRelationshipEnvelope(legacy),rollback=u.rollbackRelationshipEnvelope(upgraded,u.recoverDddFromGraphql(f.expected,f.expected.targetArchive));
  if(JSON.stringify(rollback.target)!==JSON.stringify(legacy)||JSON.stringify(rollback.source)!==JSON.stringify(f.logical))throw Error('Migration/rollback changed content');
  const original='# retained native comment\nscalar Mystery\ntype Query { value: Mystery }\n',native=u.importGraphqlSchema(original,{id:'native',mode:'schema'});
  native.vocabularies.future={version:'1.0.0'};native.extensions={future:{unknown:[null,'9007199254740993']}};
  for(const format of ['json','yaml']){const decoded=u.readJsonValue(u.writeJsonValue(native,format),format);if(JSON.stringify(decoded)!==JSON.stringify(native)||u.exportGraphqlSchema(decoded)!==original)throw Error('Native unknown-content round trip');}
  if('Bun'in globalThis||'process'in globalThis||'buildDddEntityGraphql'in u)throw Error('Host API/internal helper leaked into public browser API');
  return {cases:cases.length,idealRecoveries,nativeRecoveries,strictBlocks,forgedRefusals,staleRefusals,getterReads,migrationRollback:true,nativeUnknownRecoveries:2};
 });
 if(external.length)throw Error('External request');
 const paths=['src/index.ts','spec/projections/ddd-graphql.schema.json','src/projections/ddd-graphql/index.ts','src/projections/ddd-graphql/entities.ts','scripts/projections/ddd-graphql-cases.ts','scripts/projections/ddd-graphql-browser.ts','fixtures/projections/ddd-graphql/case.json','fixtures/projections/ddd-authored-relationships/base.json','dist/umf.js'];
 await Bun.write('fixtures/projections/ddd-graphql/browser.json',JSON.stringify({browser:browser.version(),checks,externalRequests:external,sha256:Object.fromEntries(paths.map(p=>[p,createHash('sha256').update(readFileSync(p)).digest('hex')]))},null,2)+'\n');
 console.log(JSON.stringify(checks));
}finally{await browser?.close();server.stop(true);}
