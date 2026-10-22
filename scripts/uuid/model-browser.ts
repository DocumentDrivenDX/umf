// SPDX-License-Identifier: MIT OR Apache-2.0
import {chromium} from 'playwright';
import {createHash} from 'node:crypto';
import {uuidModel} from '../../tests/helpers/uuid-model-fixtures';
import oracle from '../../fixtures/validation/uuid/bit128-oracle.json';
const models=['postgresql','sqlserver','avro','parquet','tablespec'].flatMap(system=>(system==='tablespec'?['uuid-text']:['native-uuid','bytes16','uuid-text','words64']).map(kind=>uuidModel(kind,system)));
models.push(uuidModel('words64','parquet','uuid',false));
const bundle=await Bun.file('dist/umf.js').text(),server=Bun.serve({port:0,hostname:'127.0.0.1',fetch(req){return new URL(req.url).pathname==='/umf.js'?new Response(bundle,{headers:{'Content-Type':'text/javascript'}}):new Response('<!doctype html><title>128-bit model qualification</title>');}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage(),origin='http://127.0.0.1:'+server.port,externalRequests:string[]=[];
 page.on('request',r=>{if(!r.url().startsWith(origin+'/'))externalRequests.push(r.url());});await page.goto(origin);
 const result=await page.evaluate(async({models,cases})=>{
  const path='/umf.js',u=await import(path),identity={module:'m',element:'child'};let checks=0,refusals=0;
  const assert=(v:boolean)=>{if(!v)throw Error('Model browser mismatch');};const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
  for(const {binding,logical} of models){
   const target=binding.extensions['umf.binding'].target.system,isFile=['avro','parquet','tablespec'].includes(target);
   const report=u.projectBit128Model(binding,logical,'report');assert(!!report.candidate);assert(same(u.recoverBit128ModelProjection(report,report.candidate.text),{logical,binding}));checks++;
   for(const row of cases){
    const values=[{field:{module:'m',element:'childId'},value:{uuid:row.uuid}},{field:{module:'m',element:'parentRef'},value:{uuid:row.uuid}}];
    const native=isFile?u.encodeBit128FileRecord(binding,logical,identity,values):u.encodeBit128Record(binding,logical,identity,values);
    const decoded=isFile?u.decodeBit128FileRecord(binding,logical,identity,native):u.decodeBit128Record(binding,logical,identity,native);
    assert(same(decoded,values));checks++;
   }
   try{u.recoverBit128ModelProjection(report,report.candidate.text+' ');throw Error('accepted changed artifact');}catch(e){if((e as any).code!=='BIT128_MODEL_STALE')throw e;refusals++;}
   const copied=u.readDocument(u.writeDocument(logical,'yaml'),'yaml');assert(same(copied,logical));checks++;
  }
  assert(!('process'in globalThis)&&!('Bun'in globalThis)&&!('Buffer'in globalThis));return {models:models.length,checks,refusals,nodeGlobalsAbsent:true};
 },{models:models as any,cases:oracle.cases});
 if(externalRequests.length)throw Error('External browser request');
 await Bun.write('fixtures/validation/uuid/model-browser.json',JSON.stringify({browser:browser.version(),bundleSha256:createHash('sha256').update(bundle).digest('hex'),result,externalRequests},null,2)+'\n');console.log(result);
}finally{await browser?.close();server.stop(true);}
