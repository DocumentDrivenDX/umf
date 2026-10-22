// SPDX-License-Identifier: MIT OR Apache-2.0
import {chromium} from 'playwright';
import {createHash} from 'node:crypto';
const artifacts=await Bun.file('fixtures/validation/uuid/composition-artifacts.json').json(),bundle=await Bun.file('dist/umf.js').text();
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(req){return new URL(req.url).pathname==='/umf.js'?new Response(bundle,{headers:{'Content-Type':'text/javascript'}}):new Response('<!doctype html><title>UMF composition</title>');}});let browser;
try{browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage(),origin='http://127.0.0.1:'+server.port,external:string[]=[];page.on('request',r=>{if(!r.url().startsWith(origin+'/'))external.push(r.url());});await page.goto(origin);
 const result=await page.evaluate(async(cases)=>{const path='/umf.js',u=await import(path);let rows=0,refusals=0;const assert=(x:boolean)=>{if(!x)throw Error('Composition browser mismatch');};const canonical=(v:any):string=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
 for(const c of cases){const file=!['postgresql','sqlserver'].includes(c.system),projected=u.projectBit128Model(c.binding,c.logical,'report');assert(canonical(projected)===canonical(c.report));assert(canonical(u.recoverBit128ModelProjection(projected,projected.candidate.text))===canonical({logical:c.logical,binding:c.binding}));
  const data=c.records.map((r:any)=>({record:r.record,rows:r.rows.map((row:any)=>{const decoded=file?u.decodeBit128FileRecord(c.binding,c.logical,r.record,row):u.decodeBit128Record(c.binding,c.logical,r.record,row);assert(canonical(file?u.encodeBit128FileRecord(c.binding,c.logical,r.record,decoded):u.encodeBit128Record(c.binding,c.logical,r.record,decoded))===canonical(row));rows++;return decoded;})}));u.validateBit128Dataset(c.binding,c.logical,data);
  const duplicate=structuredClone(data);duplicate[0].rows.push(duplicate[0].rows[0]);try{u.validateBit128Dataset(c.binding,c.logical,duplicate);throw Error('Accepted duplicate key');}catch(e){if((e as any).code!=='MODEL_DATASET')throw e;refusals++;}
  try{u.recoverBit128ModelProjection(projected,projected.candidate.text+' ');throw Error('Accepted stale artifact');}catch(e){if((e as any).code!=='BIT128_MODEL_STALE')throw e;refusals++;}
  assert(canonical(u.readDocument(u.writeDocument(c.logical,'yaml'),'yaml'))===canonical(c.logical));
 }
 assert(!('process'in globalThis)&&!('Bun'in globalThis)&&!('Buffer'in globalThis));return {cases:cases.length,rows,refusals,nodeGlobalsAbsent:true};},artifacts.cases);
 if(external.length)throw Error('External browser requests');await Bun.write('fixtures/validation/uuid/composition-browser.json',JSON.stringify({browser:browser.version(),bundleSha256:createHash('sha256').update(bundle).digest('hex'),result,externalRequests:external},null,2)+'\n');console.log(result);
}finally{await browser?.close();server.stop(true);}
