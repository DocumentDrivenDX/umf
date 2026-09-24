import {chromium} from 'playwright';
const base='fixtures/odcs/references/',vectors=await Bun.file(base+'cases.json').json(),raw=await Bun.file(vectors.source).text();
const built=await Bun.build({entrypoints:['src/index.ts'],outdir:'.cache/odcs-reference-browser',naming:'umf.js',target:'browser',format:'esm'});if(!built.success)throw Error(built.logs.join('\n'));
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(req){return new URL(req.url).pathname==='/umf.js'?new Response(Bun.file('.cache/odcs-reference-browser/umf.js'),{headers:{'content-type':'text/javascript'}}):new Response('<!doctype html><title>ODCS references</title>');}});let browser;
try{browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.port);
 const result=await page.evaluate(async({raw,cases})=>{const path='/umf.js',u=await import(path),d=u.importOdcsDocument(raw,{id:'relationships',format:'yaml'});let comparisons=0;
 for(const c of cases)for(const f of ['json','yaml']){const r=u.resolveOdcsReference(u.readDocument(u.writeDocument(d,f),f),c);if(u.exportOdcsDocument(r.source)!==raw||r.complete!==false)throw Error('Source/boundary differs');if(c.target?r.target?.path!==c.target:r.status!=='blocked'||!r.diagnostics.some((x:any)=>x.code===c.error))throw Error(c.reference+' outcome differs');comparisons++;}
 return {comparisons,nodeGlobalsAbsent:!('process' in globalThis)&&!('Buffer' in globalThis),scope:'Specification-derived local lookup vectors; no foreign-key enforcement'};
 },{raw,cases:vectors.cases});if(result.comparisons!==26||!result.nodeGlobalsAbsent)throw Error('Browser baseline changed');await Bun.write(base+'browser-results.json',JSON.stringify({...result,browser:browser.version()},null,2)+'\n');console.log(result);
}finally{await browser?.close();server.stop(true);}
