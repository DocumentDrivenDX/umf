/** Bounded real-Chromium check using the same public browser ESM build path. */
import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {readDocument,validateCoreDatasetValues,verifyCoreDatasetValues} from '../src/index';
import {supplyChainDataset} from '../tests/helpers/supply-chain-dataset';
const directory=resolve(process.argv[2]??'');
if(!process.argv[2]||await Bun.file(join(directory,'report.json')).exists())throw Error('Explicit fresh evidence directory required');
await mkdir(directory);
for(const [entry,name] of [['src/index.ts','umf.js'],['tests/helpers/supply-chain-dataset.ts','consumer.js']]){
 const build=await Bun.build({entrypoints:[entry!],outdir:directory,naming:name!,target:'browser',format:'esm'});
 if(!build.success)throw Error(build.logs.join('\n'));
}
const sourceText=await Bun.file('spec/domain-packs/supply-chain/ontology.json').text();
const graphText=await Bun.file('spec/domain-packs/supply-chain/graph/fixture.json').text();
const server=Bun.serve({port:0,hostname:'127.0.0.1',fetch(request){
 const path=new URL(request.url).pathname;
 if(path==='/')return new Response('<!doctype html><title>UMF original supply-chain dataset check</title>');
 if(path==='/source.json')return new Response(sourceText,{headers:{'content-type':'application/json'}});
 if(path==='/graph.json')return new Response(graphText,{headers:{'content-type':'application/json'}});
 if(['/umf.js','/consumer.js'].includes(path))return new Response(Bun.file(join(directory,path.slice(1))),{headers:{'content-type':'text/javascript'}});
 return new Response('Unknown',{status:404});
}});
let browser:any;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage();await page.goto(server.url.href);
 const result=await page.evaluate(async()=>{
  const corePath='/umf.js',consumerPath='/consumer.js';
  const umf=await import(corePath),consumer=await import(consumerPath);
  const source=umf.readDocument(await(await fetch('/source.json')).text(),'json'),graph=await(await fetch('/graph.json')).json();
  const input=consumer.supplyChainDataset(source,graph),before=JSON.stringify({source,input}),receipt=umf.validateCoreDatasetValues(source,input);
  if(JSON.stringify(receipt.datasetValidation)!==JSON.stringify({valid:true,complete:true,diagnostics:[]})||receipt.records.length!==20||receipt.keys.length!==20||receipt.relationships.length!==23)throw Error('Original complete finite graph refused');
  for(let i=0;i<input.records.length;i++){const r=input.records[i];if(JSON.stringify(receipt.records[i].result)!==JSON.stringify(umf.validateCoreRecordValues(source,r.identity,r.values)))throw Error('Original public Record result differs');}
  for(const edge of graph.edges){const actual=receipt.relationships.find((r:any)=>r.instanceId===edge.key);if(!actual||actual.sourceInstanceId!==edge.source||actual.targetInstanceId!==edge.target)throw Error('Original directed endpoint differs');}
  const nulls=receipt.records.flatMap((r:any)=>r.result.values.filter((v:any)=>v.state==='present'&&v.value===null));if(nulls.length!==2||nulls.some((v:any)=>v.field.element!=='containers.parent_id'))throw Error('Original explicit null parents changed');
  if(JSON.stringify(umf.verifyCoreDatasetValues(receipt,source,input))!==JSON.stringify(receipt)||JSON.stringify({source,input})!==before)throw Error('Original full receipt/recomputation changed');
  const count=(v:any):number=>1+(Array.isArray(v)?v.reduce((n,x)=>n+count(x),0):v!==null&&typeof v==='object'?Object.values(v).reduce<number>((n,x)=>n+count(x),0):0);
  const text=JSON.stringify(receipt);if(count(receipt)>100000||new TextEncoder().encode(text).length>4000000)throw Error('Hard final receipt limits exceeded');
  const controls=[];
  for(const kind of ['oversized-records','oversized-bytes']){
   const changed=structuredClone(input);if(kind==='oversized-records')changed.records=Array(1000).fill(input.records[0]);else changed.context={retained:'x'.repeat(600000)};
   try{umf.validateCoreDatasetValues(source,changed);throw Error('Oversized dataset admitted');}catch(error:any){if(error.code!=='LIMIT')throw error;controls.push({kind,code:error.code});}
  }
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))).map(x=>x.toString(16).padStart(2,'0')).join('');
  return {records:receipt.records.length,keys:receipt.keys.length,relationships:receipt.relationships.length,presentNullParents:nulls.length,values:count(receipt),bytes:new TextEncoder().encode(text).length,receiptSha256:digest,completeFiniteValidation:receipt.datasetValidation,controls};
 });
 const sha=(text:string)=>createHash('sha256').update(text).digest('hex');
 const bunSource=readDocument(sourceText,'json'),bunInput=supplyChainDataset(bunSource,JSON.parse(graphText));
 const bunReceipt=validateCoreDatasetValues(bunSource,bunInput);verifyCoreDatasetValues(bunReceipt,bunSource,bunInput);
 if(result.receiptSha256!==sha(JSON.stringify(bunReceipt)))throw Error('Real browser/public Bun receipt bytes differ');
 const report={profile:'umf-supply-chain-public-dataset-browser/0.1',sourceBase:'de11e172c1eb11e7082b605421ad146ae4740a0d',proposedPatch:true,browserVersion:browser.version(),sourceSha256:sha(sourceText),graphSha256:sha(graphText),browserBundleSha256:sha(await Bun.file(join(directory,'umf.js')).text()),result,qualification:'Original0.8 finite supply-chain graph through public browser ESM API and explicit candidate lexical/null consumer. Hard budgets unchanged, all original Record/Key/relationship receipts retained. Proposed source patch; no native ingestion/storage or Truss authority.'};
 await Bun.write(join(directory,'report.json'),JSON.stringify(report)+'\n');console.log(JSON.stringify(report));
}finally{if(browser)await browser.close();server.stop(true);}
