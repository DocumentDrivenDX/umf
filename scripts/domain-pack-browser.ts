import {chromium} from 'playwright';
const server=Bun.serve({port:0,hostname:'127.0.0.1',fetch(request){
 return new URL(request.url).pathname==='/umf.js'?new Response(Bun.file('dist/umf.js'),{headers:{'content-type':'text/javascript'}}):new Response('<!doctype html><title>UMF pack schema verification</title>',{headers:{'content-type':'text/html'}});
}});
const browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});
try {
 const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.port}`);
 const result=await page.evaluate(async()=>{
  const path='/umf.js',u=await import(path);let checks=0;
  const check=(v:boolean)=>{checks++;if(!v)throw Error('Pack browser check '+checks);};
  check(JSON.stringify(u.generateDomainPackSchema())===JSON.stringify(u.domainPackSchema));
  const registry=new u.Registry().register(u.domainPackPackage);
  const pack={id:'legal',version:'1.0.0',generator:{id:'tablespec.legal',version:'1.0.0'},domain_types:{client_name:{sample_generation:{method:'generate_client_name'},future:{preserved:true}}},future:{preserved:true}};
  const document={umf:'0.8.0',id:'pack-browser',modules:[],vocabularies:{'umf.domain-pack':{version:'1.0.0'}},extensions:{'umf.domain-pack':pack}};
  check(u.validateDocument(document,registry).valid);
  for(const format of ['json','yaml'])check(JSON.stringify(u.readDocument(u.writeDocument(document,format),format))===JSON.stringify(document));
  check(!u.validateDocument({...document,extensions:{'umf.domain-pack':{...pack,generator:{id:'x'}}}},registry).valid);
  const source={kind:'external',data_kind:'fabricated',reference:'official-fixture.csv',format:'csv',license:{redistribution:'unknown'},future:{preserved:true}};
  const sourceRegistry=new u.Registry().register(u.datasetSourcePackage);
  const sourceDocument={umf:'0.8.0',id:'source-browser',modules:[],vocabularies:{'umf.dataset-source':{version:'1.0.0'}},extensions:{'umf.dataset-source':source}};
  check(u.validateDocument(sourceDocument,sourceRegistry).valid);
  for(const format of ['json','yaml'])check(JSON.stringify(u.readDocument(u.writeDocument(sourceDocument,format),format))===JSON.stringify(sourceDocument));
  check(typeof (globalThis as any).Bun==='undefined'&&typeof (globalThis as any).process==='undefined');
  return {checks};
 });console.log(JSON.stringify({browser:browser.version(),...result}));
}finally{await browser.close();server.stop(true);}
