// SPDX-License-Identifier: MIT OR Apache-2.0
import {chromium} from 'playwright';
import {createHash} from 'node:crypto';
import {inspectTableLifecycle} from '../src/extensions/tables';
import {compileTableDeployment} from '../src/table-deployment';
import fixture from '../tests/binding/fixtures/table-lifecycle-note.json';
const built=await Bun.build({entrypoints:['src/index.ts'],target:'browser',format:'esm',minify:true});
if(!built.success)throw new Error('Table lifecycle browser build failed: '+built.logs.join('\n'));
const bundle=await built.outputs[0]!.text(),expected=JSON.stringify(inspectTableLifecycle(fixture));
const configuration={module:'demo',schema:'plugin_demo',ownerRole:'plugin_owner',personRole:'plugin_person',batchRole:'plugin_batch',groupRoles:{}};
const deployment=JSON.stringify(compileTableDeployment({text:JSON.stringify(fixture),configuration}));
const server=Bun.serve({port:0,hostname:'127.0.0.1',fetch(req){return new URL(req.url).pathname==='/umf.js'?new Response(bundle,{headers:{'Content-Type':'text/javascript'}}):new Response('<!doctype html><title>UMF table declaration verification</title>',{headers:{'Content-Type':'text/html'}});}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});
 const page=await browser.newPage(),origin='http://127.0.0.1:'+server.port,externalRequests:string[]=[];
 page.on('request',r=>{if(!r.url().startsWith(origin+'/'))externalRequests.push(r.url());});await page.goto(origin);
 const result=await page.evaluate(async ({fixture,expected,configuration,deployment})=>{
  const path='/umf.js',u=await import(path);let assertions=0;
  const check=(value:boolean)=>{assertions++;if(!value)throw new Error('Browser table declaration assertion '+assertions);};
  const clone=()=>structuredClone(fixture) as any;
  const payload=(d:any)=>d.modules[0].extensions['umf.tables'];
  const inspected=u.inspectTableLifecycle(fixture);check(JSON.stringify(inspected)===expected);check(inspected.complete&&!inspected.nativeQualified);
  for(const format of ['json','yaml'])check(JSON.stringify(u.readDocument(u.writeDocument(fixture,format),format))===JSON.stringify(fixture));
  const future=clone();payload(future).tables[0].policy.person.select.future={source:'kept'};
  const unknown=u.inspectTableLifecycle(future);check(unknown.valid&&!unknown.complete);check(unknown.source.modules[0].extensions['umf.tables'].tables[0].policy.person.select.future.source==='kept');
  const wide=clone();payload(wide).tables[0].columns[0].name='é'.repeat(32);check(u.inspectTableLifecycle(wide).diagnostics.some((d:any)=>d.code==='TABLES_IDENTIFIER'));
  const invalid=clone();payload(invalid).tables[0].policy.person.select.field.module='foreign';check(!u.inspectTableLifecycle(invalid).valid);
  const decimal=clone();decimal.modules[0].elements.push({id:'amount',kind:'field',scalarType:'decimal',cardinality:'one',nullability:'required',facets:{precision:8,scale:3},extensions:{}});decimal.modules[0].elements[2].members.push({module:'demo',element:'amount'});payload(decimal).tables[0].columns.push({field:{module:'demo',element:'amount'},name:'amount',nativeType:{kind:'numeric',precision:5,scale:2},default:{kind:'literal',value:{decimalToken:'12.301'}}});
  check(u.inspectTableLifecycle(decimal).diagnostics.some((d:any)=>d.code==='TABLES_NATIVE_CAPACITY'));
  for(const value of [null,{},[],1])check(!u.inspectTableLifecycle(value).valid);
  check(!('process'in globalThis)&&!('Bun'in globalThis)&&!('Buffer'in globalThis));
  const compiled=u.compileTableDeployment({text:JSON.stringify(fixture),configuration});
  check(JSON.stringify(compiled)===deployment);check(compiled.status==='compiled');
  check(JSON.stringify(u.verifyTableDeployment(compiled.bundle))===JSON.stringify(compiled.bundle));
  compiled.bundle.steps[0].sql='DROP SCHEMA public CASCADE';let refused=false;
  try{u.verifyTableDeployment(compiled.bundle);}catch{refused=true;}check(refused);
  check(u.compileTableDeployment({text:JSON.stringify(fixture),configuration:{...configuration,schema:'public'}}).status==='blocked');
  return {assertions,metadataParity:true,deploymentParity:true,nativeQualificationClaimed:false,nodeGlobalsAbsent:true};
 },{fixture,expected,configuration,deployment});
 if(externalRequests.length)throw new Error('Table inspection caused an external request');
 const sources=['src/index.ts','scripts/table-lifecycle-browser.ts','tests/binding/fixtures/table-lifecycle-note.json','spec/extensions/tables/schema.json','spec/extensions/tables/package.json','spec/extensions/tables/deployment.schema.json',...['types','context','expressions','columns','policies','seeds','index'].map(n=>'src/extensions/tables/'+n+'.ts'),...['types','configuration','sql','policies','ddl','index'].map(n=>'src/table-deployment/'+n+'.ts')];
 const sourceHashes=Object.fromEntries(await Promise.all(sources.map(async p=>[p,createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex')])));
 const report={scope:'current-core native table declaration inspection and inert initial deployment compilation; no production execution qualification',browser:browser.version(),result,externalRequests,bundleSha256:createHash('sha256').update(bundle).digest('hex'),sourceHashes};
 await Bun.write(process.env.UMF_TABLE_BROWSER_EVIDENCE??'/private/tmp/umf-table-lifecycle-browser.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{await browser?.close();server.stop(true);}
