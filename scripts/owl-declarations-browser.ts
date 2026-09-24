import {chromium} from 'playwright';
const cases=(await Bun.file('fixtures/owl/declarations.json').json()).cases;
const built=await Bun.build({entrypoints:['src/index.ts'],outdir:'.cache/owl-declarations-browser',naming:'umf.js',target:'browser',format:'esm'});if(!built.success)throw Error(String(built.logs));
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(req){return new URL(req.url).pathname==='/umf.js'?new Response(Bun.file('.cache/owl-declarations-browser/umf.js'),{headers:{'content-type':'text/javascript'}}):new Response('<!doctype html><title>OWL declarations</title>');}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage();let externalRequests=0;
 await page.route('**/*',route=>{if(!route.request().url().startsWith('http://127.0.0.1:')){externalRequests++;return route.abort();}return route.continue();});await page.goto('http://127.0.0.1:'+server.port);
 const result=await page.evaluate(async cases=>{
  const path='/umf.js',u=await import(path);let checks=0,edits=0;
  for(const c of cases){
   const original=u.importOwlTurtle(c.input,{id:c.file,baseIRI:'https://example.org/',blankNodeScope:'declarations'}),qs=u.getOwlQuads(original);
   const d=c.editIndex===null?original:u.proposeOwlQuadEdit(original,c.editIndex,{...qs[c.editIndex],subject:{kind:'iri',value:'https://example.org/EditedDeclaration'}}).document;
   const v=u.getOwlDeclarations(u.readDocument(u.writeDocument(d,c.format),c.format));
   if(JSON.stringify(v)!==JSON.stringify(c.view)||u.exportOwlTurtle(v.source)!==c.text||u.exportOwlTurtle(original)!==c.input)throw Error('Declaration recovery/edit differs: '+c.file);
   if(c.editIndex!==null)edits++;checks++;
  }
  return {checks,edits,nodeGlobalsAbsent:!('process'in globalThis)&&!('Buffer'in globalThis)};
 },cases);
 if(externalRequests||!result.nodeGlobalsAbsent)throw Error('Browser boundary differs');
 await Bun.write('fixtures/owl/declarations-browser.json',JSON.stringify({...result,externalRequests,browser:browser.version(),scope:'Explicit declaration views through both UMF formats and copied edits; no OWL validity or inference'},null,2)+'\n');console.log(result);
}finally{await browser?.close();server.stop(true);}
