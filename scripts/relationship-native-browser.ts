import {chromium} from 'playwright';
import {createHash} from 'node:crypto';

const base='fixtures/relationship-native/';
const sources={
 rdf:await Bun.file(base+'rdf-domain-range.nq').text(),
 linkml:await Bun.file(base+'linkml-slot.yaml').text(),
 tablespec:await Bun.file(base+'tablespec-foreign-key.json').text()
};
const oracle=await Bun.file(base+'oracle-results.json').json();
for(const [name,raw] of Object.entries(sources))
 if(createHash('sha256').update(raw).digest('hex')!==oracle.sourceSha256[name])throw Error('Stale '+name+' fixture');
const built=await Bun.build({entrypoints:['src/index.ts'],outdir:'.cache/relationship-native-browser',naming:'umf.js',target:'browser',format:'esm'});
if(!built.success)throw Error(built.logs.join('\n'));
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(req){return new URL(req.url).pathname==='/umf.js'?new Response(Bun.file('.cache/relationship-native-browser/umf.js'),{headers:{'content-type':'text/javascript'}}):new Response('<!doctype html><title>Native relationship observations</title>');}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});
 const page=await browser.newPage();
 await page.goto('http://127.0.0.1:'+server.port);
 const result=await page.evaluate(async(sources)=>{
  const path='/umf.js',umf=await import(path);
  const cases=[
   {name:'rdf',document:umf.importRdfNQuads(sources.rdf,{id:'native-rdf'}),exporter:umf.exportRdfNQuads,source:sources.rdf},
   {name:'linkml',document:umf.importLinkmlDocument(sources.linkml,{id:'native-linkml',format:'yaml'}),exporter:umf.exportLinkmlDocument,source:sources.linkml},
   {name:'tablespec',document:umf.importTableSpec(sources.tablespec,{id:'native-tablespec',format:'json'}),exporter:umf.exportTableSpec,source:sources.tablespec}
  ];
  let recoveries=0;
  for(const c of cases){
   if('relationships' in c.document.modules[0])throw Error('Invented authored relationship: '+c.name);
   for(const format of ['json','yaml']){
    const restored=umf.readDocument(umf.writeDocument(c.document,format),format);
    if(c.exporter(restored)!==c.source)throw Error('Archive differs: '+c.name+'/'+format);
    recoveries++;
   }
  }
  return {cases:cases.map(c=>c.name),recoveries,nodeGlobalsAbsent:!('process' in globalThis)&&!('Buffer' in globalThis)};
 },sources);
 if(result.recoveries!==6||!result.nodeGlobalsAbsent)throw Error('Browser baseline changed');
 const output={...result,browser:browser.version(),sourceSha256:oracle.sourceSha256};
 await Bun.write(base+'browser-results.json',JSON.stringify(output,null,2)+'\n');
 console.log(output);
}finally{await browser?.close();server.stop(true);}
