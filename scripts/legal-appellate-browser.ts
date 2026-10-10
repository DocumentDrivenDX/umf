import {chromium} from 'playwright';
const root='spec/domain-packs/legal-appellate',pack=await Bun.file(root+'/pack.json').json();
const schemas=await Promise.all(pack.schemas.map(async(s:any)=>({id:s.id,text:await Bun.file(root+'/'+s.reference).text()})));
const server=Bun.serve({port:0,hostname:'127.0.0.1',fetch(request){
 const path=new URL(request.url).pathname;
 if(path==='/fixture')return Response.json({pack,schemas});
 if(path==='/umf.js')return new Response(Bun.file('dist/umf.js'),{headers:{'content-type':'text/javascript'}});
 return new Response('<!doctype html><title>Appellate pack browser validation</title>',{headers:{'content-type':'text/html'}});
}});
const browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});
try{
 const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.port}`);
 const result=await page.evaluate(async()=>{
  const path='/umf.js',u=await import(path),{pack,schemas}=await(await fetch('/fixture')).json();let checks=0;
  const check=(v:boolean)=>{checks++;if(!v)throw Error('Appellate browser check '+checks);};
  const document={umf:'0.8.0',id:'appellate-browser',modules:[],vocabularies:{'umf.domain-pack':{version:'1.0.0'}},extensions:{'umf.domain-pack':pack}};
  check(u.validateDocument(document,new u.Registry().register(u.domainPackPackage)).valid);
  for(const format of ['json','yaml'])check(JSON.stringify(u.readDocument(u.writeDocument(document,format),format))===JSON.stringify(document));
  for(const schema of schemas)check(u.exportTableSpec(u.importTableSpec(schema.text,{id:schema.id,format:'json'}))===schema.text);
  check(pack.sources.csv_annotations.data_kind==='unknown'&&pack.sources.csv_workflow_events.data_kind==='fabricated');
  check(typeof (globalThis as any).Bun==='undefined'&&typeof (globalThis as any).process==='undefined');
  return {checks,schemas:schemas.length};
 });console.log(JSON.stringify({browser:browser.version(),...result}));
}finally{await browser.close();server.stop(true);}
