import {chromium} from 'playwright';
const raw=await Bun.file('native/owl/special-axioms.ttl').text();
const built=await Bun.build({entrypoints:['src/index.ts'],outdir:'.cache/owl-special-browser',naming:'umf.js',target:'browser',format:'esm'});if(!built.success)throw Error(String(built.logs));
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(req){return new URL(req.url).pathname==='/umf.js'?new Response(Bun.file('.cache/owl-special-browser/umf.js'),{headers:{'content-type':'text/javascript'}}):new Response('<!doctype html><title>OWL</title>');}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage();let externalRequests=0;
 await page.route('**/*',route=>{if(!route.request().url().startsWith('http://127.0.0.1:')){externalRequests++;return route.abort();}return route.continue();});await page.goto('http://127.0.0.1:'+server.port);
 const result=await page.evaluate(async raw=>{const path='/umf.js',u=await import(path);let checks=0;for(const format of ['json','yaml']){const d=u.importOwlTurtle(raw,{id:'s',baseIRI:'https://example.org/'}),v=u.getOwlSpecialAxioms(u.readDocument(u.writeDocument(d,format),format));if(v.axioms.length!==6||v.malformed.length!==3||v.complete!==false||u.exportOwlTurtle(v.source)!==raw)throw Error('Special axiom recovery differs');const negative=v.axioms.filter((a:any)=>a.kind==='negativePropertyAssertion');if(negative.length!==2||negative[0].targetKind!=='individual'||negative[1].targetKind!=='value'||negative[1].target.value!=='42')throw Error('Negative assertion differs');checks++;}return {checks,nodeGlobalsAbsent:!('process'in globalThis)&&!('Buffer'in globalThis)};},raw);
 if(externalRequests||!result.nodeGlobalsAbsent)throw Error('Browser boundary differs');await Bun.write('fixtures/owl/special-browser.json',JSON.stringify({...result,externalRequests,browser:browser.version()},null,2)+'\n');console.log(result);
}finally{await browser?.close();server.stop(true);}
