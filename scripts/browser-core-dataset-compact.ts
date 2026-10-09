/** Bounded four-pack real browser check of the public compact receipt API. */
import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {readDocument,validateCoreDatasetValuesCompact,verifyCoreDatasetValuesCompact} from '../src/index';
import {supplyChainDataset} from '../tests/helpers/supply-chain-dataset';
const directory=resolve(process.argv[2]??'');if(!process.argv[2])throw Error('Explicit fresh output required');await mkdir(directory);
for(const [entry,name] of [['src/index.ts','umf.js'],['tests/helpers/supply-chain-dataset.ts','consumer.js']]){const build=await Bun.build({entrypoints:[entry!],outdir:directory,naming:name!,target:'browser',format:'esm'});if(!build.success)throw Error(build.logs.join('\n'));}
const packs=['commerce','supply-chain','archaeology','ecology'];
const originals=Object.fromEntries(await Promise.all(packs.map(async pack=>[pack,{source:await Bun.file('spec/domain-packs/'+pack+'/ontology.json').text(),graph:await Bun.file('spec/domain-packs/'+pack+'/graph/fixture.json').text()}])));
const server=Bun.serve({port:0,hostname:'127.0.0.1',fetch(request){const path=new URL(request.url).pathname;if(path==='/')return new Response('<!doctype html><title>UMF compact dataset checks</title>');if(path==='/originals.json')return Response.json(originals);if(['/umf.js','/consumer.js'].includes(path))return new Response(Bun.file(join(directory,path.slice(1))),{headers:{'content-type':'text/javascript'}});return new Response('Unknown',{status:404});}});
let browser:any;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage();await page.goto(server.url.href);
 const results=await page.evaluate(async()=>{
  const corePath='/umf.js',consumerPath='/consumer.js';
  const umf=await import(corePath),consumer=await import(consumerPath),originals=await(await fetch('/originals.json')).json(),results=[];
  for(const [pack,original] of Object.entries(originals) as [string,any][]){
   const source=umf.readDocument(original.source,'json'),graph=JSON.parse(original.graph),input=consumer.supplyChainDataset(source,graph),before=JSON.stringify({source,input});
   const receipt=umf.validateCoreDatasetValuesCompact(source,input);
   if(!receipt.datasetValidation.valid||!receipt.datasetValidation.complete||receipt.records.length!==graph.objects.length||receipt.relationships.length!==graph.edges.length)throw Error('Original finite dataset differs');
   const expand=(f:any)=>{const {sourceRef,...body}=f;if(sourceRef!=='#/source')throw Error('Foreign source reference');return {...body,source:receipt.source};};
   const canonical=(v:any):string=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v!==null&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
   for(const row of receipt.records){const inputRow=input.records.find((r:any)=>r.instanceId===row.instanceId);if(canonical(expand(row.result))!==canonical(umf.validateCoreRecordValues(source,inputRow.identity,inputRow.values)))throw Error('Original Record receipt differs');}
   for(const key of [...receipt.keys.map((r:any)=>r.result),...receipt.relationships.map((r:any)=>r.targetKey)])if(canonical(expand(key))!==canonical(umf.encodeCoreKeyTuple(source,key.identity,key.values)))throw Error('Original Key receipt differs');
   for(const edge of graph.edges){const actual=receipt.relationships.find((r:any)=>r.instanceId===edge.key);if(actual.sourceInstanceId!==edge.source||actual.targetInstanceId!==edge.target)throw Error('Original directed endpoint differs');}
   if(JSON.stringify(umf.verifyCoreDatasetValuesCompact(receipt,source,input))!==JSON.stringify(receipt)||JSON.stringify({source,input})!==before)throw Error('Complete compact recomputation/copy isolation differs');
   const controls=[];
   for(const kind of ['bytes','work','forged-reference']){
    try{if(kind==='forged-reference'){const bad=structuredClone(receipt);bad.records[0].result.sourceRef='#/input';umf.verifyCoreDatasetValuesCompact(bad,source,input);}else{const changed=structuredClone(input);if(kind==='bytes')changed.context='x'.repeat(4000001);else changed.records=Array.from({length:1000},(_,i)=>({...structuredClone(input.records[0]),instanceId:'work-'+i}));umf.validateCoreDatasetValuesCompact(source,changed);}throw Error('Control admitted');}
    catch(error:any){if(error.code!==(kind==='forged-reference'?'CORE_DATASET_COMPACT_RECEIPT':'LIMIT'))throw error;controls.push({kind,code:error.code});}
   }
   const text=JSON.stringify(receipt),bytes=new TextEncoder().encode(text);if(bytes.length>4000000)throw Error('Aggregate byte limit exceeded');
   const sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');
   results.push({pack,records:receipt.records.length,keys:receipt.keys.length,relationships:receipt.relationships.length,presentNulls:input.records.flatMap((r:any)=>r.values).filter((v:any)=>v.state==='present'&&v.value===null).length,receiptSha256:sha,bytes:bytes.length,controls});
  }return results;
 });
 const sha=(s:string)=>createHash('sha256').update(s).digest('hex');
 for(const result of results){const original=originals[result.pack],source=readDocument(original.source,'json'),input=supplyChainDataset(source,JSON.parse(original.graph)),receipt=validateCoreDatasetValuesCompact(source,input);verifyCoreDatasetValuesCompact(receipt,source,input);if(sha(JSON.stringify(receipt))!==result.receiptSha256)throw Error('Browser/Bun bytes differ');await Bun.write(join(directory,result.pack+'-receipt.json'),JSON.stringify(receipt)+'\n');}
 const report={format:'umf-core-dataset-compact-browser/0.1',sourceBase:'fc78a6d48f08b3640748ccac0fc4a9ee06fc61e3',proposedPatch:true,browserVersion:browser.version(),browserBundleSha256:sha(await Bun.file(join(directory,'umf.js')).text()),results,qualification:'Public browser API on four original0.8 finite graph candidates, unchanged resource ceilings, complete source/input custody and individual original public Record/Key parity. No native ingestion or execution claim.'};await Bun.write(join(directory,'report.json'),JSON.stringify(report)+'\n');console.log(JSON.stringify(report));
}finally{if(browser)await browser.close();server.stop(true);}
