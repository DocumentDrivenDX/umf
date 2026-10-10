import {chromium} from 'playwright';
const build=await Bun.build({entrypoints:['src/index.ts'],target:'browser',format:'esm'});if(!build.success)throw Error(build.logs.join('\n'));
const bundle=await build.outputs[0]!.text();
const sample=await Bun.file('spec/domain-packs/court-documents-loader-demo/pack.json').json();
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch:r=>new URL(r.url).pathname==='/umf.js'?new Response(bundle,{headers:{'content-type':'application/javascript'}}):new Response('<!doctype html><title>Loader checks</title>')});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});
 const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.port);
 const results=await page.evaluate(async pack=>{
  const url='/umf.js',u=await import(url);let checks=0;
  const check=(ok:boolean)=>{if(!ok)throw Error('Loader browser check '+checks);checks++;};
  // @covers US-060-AC8
  check(u.inspectDomainPack(pack).valid);check(u.inspectDomainPackLoader({...pack.loader,future:{preserved:'unknown'}}).complete);
  check(!u.inspectDomainPackLoader({...pack.loader,version:'9.0.0'}).valid);
  check(!u.inspectDomainPackLoader({...pack.loader,entrypoint:'../execute.ts'}).valid);
  let invoked=false;const accessor=Object.defineProperty({...pack.loader},'unknown',{enumerable:true,get(){invoked=true;return true;}});
  check(!u.inspectDomainPackLoader(accessor).valid&&!invoked);
  check(u.generateDomainPackLoaderSchema().$id==='urn:umf:domain-pack-loader:1.0.0');
  check(u.generateLoaderInventorySchema().$id==='urn:umf:loader-inventory:1.0.0');
  check(!('Bun' in globalThis)&&!('process' in globalThis)&&!('Buffer' in globalThis));
  return {checks};
 },sample);
 console.log(JSON.stringify({...results,browser:browser.version(),scope:'Portable loader metadata from public browser library; no acquisition'}));
}finally{await browser?.close();server.stop(true);}
