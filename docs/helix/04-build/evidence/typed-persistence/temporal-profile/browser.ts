import {chromium} from 'playwright';
const root=process.cwd();
const vectors=await Bun.file(root+'/fixtures/access/golden-vectors/temporal-profile.json').json();
const sample=await Bun.file(root+'/docs/helix/04-build/evidence/typed-persistence/temporal-profile/python-normalization-sample.json').json();
for(const [i,v]of sample.entries())vectors.cases.push({id:'python-sample-'+i,kind:'instant',token:v.token,accept:v.accept,expected:v.accept?{canonicalText:v.canonicalText}:{}});
const build=await Bun.build({entrypoints:[root+'/src/adapters/access-temporal.ts'],target:'browser',format:'esm'});
if(!build.success)throw new Error(String(build.logs));
const bundle=await build.outputs[0]!.text();
const server=Bun.serve({port:0,hostname:'127.0.0.1',fetch(req){return new URL(req.url).pathname==='/profile.js'?new Response(bundle,{headers:{'content-type':'text/javascript'}}):new Response('<!doctype html><title>temporal profile</title>',{headers:{'content-type':'text/html'}});}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});
 const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.port}`);
 const results=await page.evaluate(async(cases)=>{
  const path='/profile.js';const {parseAccessTemporal}=await import(path);
  return cases.map((v:any)=>{try{return {id:v.id,accept:true,value:parseAccessTemporal(v.kind,v.token)}}catch{return {id:v.id,accept:false}}});
 },vectors.cases);
 const {parseAccessTemporal}=await import(root+'/src/adapters/access-temporal.ts');
 for(let i=0;i<results.length;i++){
  const expected=vectors.cases[i], actual=results[i];
  if(actual.accept!==expected.accept)throw new Error('browser verdict '+expected.id);
  if(actual.accept){const bun=parseAccessTemporal(expected.kind,expected.token);if(JSON.stringify(actual.value)!==JSON.stringify(bun))throw new Error('browser/Bun mismatch '+expected.id);for(const [k,v]of Object.entries(expected.expected))if(actual.value[k]!==v)throw new Error('browser expected '+expected.id);}
 }
 console.log(JSON.stringify({status:'passed',browser:await browser.version(),bun:Bun.version,cases:results.length,scope:'Browser-targeted portable profile bundle; every golden verdict and accepted JSON result agrees with Bun; native/backend UNTESTED'},null,2));
}finally{await browser?.close();server.stop(true);}
