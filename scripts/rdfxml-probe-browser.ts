import {chromium} from 'playwright';
import {probeGraphSignature} from '../native/rdfxml/probe';
const literalRun=process.argv.includes('--literals');
const rows=literalRun?(await Bun.file('fixtures/rdfxml/literals.json').json()).results:[...(await Bun.file('fixtures/rdfxml/probe.json').json()).results,...(await Bun.file('fixtures/rdfxml/corpus.json').json()).results];
const cases=rows.map((c:any)=>({...c,signature:c.accepted?probeGraphSignature(c.nquads):null}));
const built=await Bun.build({entrypoints:['native/rdfxml/probe.ts'],outdir:'.cache/rdfxml-browser',naming:'probe.js',target:'browser',format:'esm',plugins:[{name:'browser-process',setup(build){build.onResolve({filter:/^process\/?$/},()=>({path:process.cwd()+'/node_modules/process/browser.js'}));}}]});if(!built.success)throw Error(String(built.logs));
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(req){return new URL(req.url).pathname==='/probe.js'?new Response(Bun.file('.cache/rdfxml-browser/probe.js'),{headers:{'content-type':'text/javascript'}}):new Response('<!doctype html><title>RDF/XML feasibility</title>');}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage();let externalRequests=0;
 await page.route('**/*',route=>{if(!route.request().url().startsWith('http://127.0.0.1:')){externalRequests++;return route.abort();}return route.continue();});await page.goto('http://127.0.0.1:'+server.port);
 const results=await page.evaluate(async cases=>{const path='/probe.js',u=await import(path),results=[];
  for(const c of cases){const r=await u.probeRdfXml(c.input,c.baseIRI,c.profile);results.push({id:c.id,profile:c.profile,accepted:r.accepted,agrees:r.accepted===c.accepted&&r.emitted===c.emitted&&(r.accepted?u.probeGraphSignature(r.nquads)===c.signature:r.error===c.error)});}
  return {results,nodeGlobalsAbsent:!('process'in globalThis)&&!('Buffer'in globalThis)};
 },cases);
 await Bun.write('fixtures/rdfxml/'+(literalRun?'literals-browser':'browser-probe')+'.json',JSON.stringify({...results,externalRequests,browser:browser.version(),scope:'Parser feasibility only; graph occurrence order compared with local blank-label renaming; no UMF adapter'},null,2)+'\n');
 if(externalRequests||!results.nodeGlobalsAbsent||results.results.some(r=>!r.agrees))throw Error('Browser parity failed');console.log({cases:results.results.length,externalRequests,nodeGlobalsAbsent:results.nodeGlobalsAbsent});
}finally{await browser?.close();server.stop(true);}
