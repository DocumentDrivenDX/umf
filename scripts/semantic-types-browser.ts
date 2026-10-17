import {chromium} from 'playwright';
const built=await Bun.build({entrypoints:['src/extensions/semantic-types/index.ts','src/model/document.ts'],outdir:'dist/semantic-types',target:'browser',format:'esm',splitting:true});
if(!built.success)throw new Error(built.logs.join('\n'));
const server=Bun.serve({port:0,hostname:'127.0.0.1',fetch(request){
 const path=new URL(request.url).pathname;
 if(path.endsWith('.js')&&!path.includes('..'))return new Response(Bun.file('dist/semantic-types'+path),{headers:{'content-type':'text/javascript'}});
 return new Response('<!doctype html><html><body>Semantic type checks</body></html>',{headers:{'content-type':'text/html'}});
}});
let browser;
try {
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});
 const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.port}`);
 const result=await page.evaluate(async()=>{
  const semanticPath='/extensions/semantic-types/index.js',documentPath='/model/document.js';
  const s=await import(semanticPath),d=await import(documentPath);
  const ref={vocabulary:'example.healthcare',version:'2026-01',term:'provider_id'};
  const registry=new s.SemanticTypeRegistry().register(ref,{description:'Illustrative publisher-owned identifier'},(value:unknown)=>({status:value==='accepted'?'valid':'invalid',complete:true,issues:[]}));
  if(registry.check(ref,'accepted').status!=='valid'||registry.check(ref,null).status!=='invalid'||registry.check({...ref,version:'2027'},'accepted').status!=='unknown'||registry.check({...ref,future:true},'accepted').complete)throw new Error('Validator boundary failed');
  const source={umf:'0.1.0',id:'browser',vocabularies:{future:{version:'1.0.0'}},modules:[{id:'m',namespace:'example',elements:[{id:'e',extensions:{future:{domain_type:'provider_id',unknown:{retained:true}}}}]}]};
  const authored=s.setSemanticTypes(source,'m','e',{types:[ref],unknown:{retained:true}});
  if(Object.hasOwn(source.vocabularies,'umf.semantic-types'))throw new Error('Authoring mutated source');
  for(const format of ['json','yaml']){
   const restored=d.readDocument(d.writeDocument(authored,format),format);
   if(JSON.stringify(restored)!==JSON.stringify(authored)||s.getSemanticTypes(restored,'m','e').types[0].term!=='provider_id')throw new Error('Serialization failed');
  }
  return {checks:7};
 });
 console.log(JSON.stringify({browser:browser.version(),...result}));
}finally {await browser?.close();server.stop(true);}
