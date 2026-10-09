import {chromium} from 'playwright';
import {readFile} from 'node:fs/promises';
import {readDocument} from '../src/model/document';
import {commerceDataset} from '../tests/helpers/commerce-dataset';
const sourceText=await readFile('spec/domain-packs/commerce/ontology.json','utf8'),graph=JSON.parse(await readFile('spec/domain-packs/commerce/graph/fixture.json','utf8'));
const input=commerceDataset(readDocument(sourceText,'json'),graph);
const build=await Bun.build({entrypoints:['src/index.ts'],outdir:'.cache/dataset-values-browser',naming:'umf.js',target:'browser',format:'esm'});if(!build.success)throw Error(build.logs.join('\n'));
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){return new URL(request.url).pathname==='/umf.js'?new Response(Bun.file('.cache/dataset-values-browser/umf.js'),{headers:{'content-type':'text/javascript'}}):new Response('<!doctype html><title>Supplied dataset checks</title>');}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.port);
 const result=await page.evaluate(async(payload:string)=>{
  const {sourceText,input}=JSON.parse(payload) as any;
  const path='/umf.js',u=await import(path),source=u.readDocument(sourceText,'json');
  const receipt=u.validateCoreDatasetValues(source,input);u.verifyCoreDatasetValues(receipt,source,input);
  if(!receipt.datasetValidation.valid||!receipt.datasetValidation.complete||receipt.records.length!==11||receipt.keys.length!==11||receipt.relationships.length!==10||receipt.records.some((r:any)=>r.result.validation.complete))throw Error('Original finite commerce context/Record distinction');
  const controls:any[]=[];
  for(const mode of ['duplicate-key','dangling','wrong-source','missing-required']){
   const request=structuredClone(input);
   if(mode==='duplicate-key')request.records.push({...structuredClone(request.records[0]),instanceId:'distinct-same-key'});
   if(mode==='dangling')request.relationships[0].target.values=[{string:'missing'}];
   if(mode==='wrong-source')request.relationships[0].sourceInstanceId=request.records[0].instanceId;
   if(mode==='missing-required')request.relationships.splice(0,1);
   const check=u.validateCoreDatasetValues(source,request);if(check.datasetValidation.valid||check.datasetValidation.complete)throw Error('Invalid dataset admitted');controls.push({mode,input:request,validation:check.datasetValidation});
  }
  const unknown=structuredClone(source);unknown['x-future-policy']={meaning:'retained'};
  const unresolved=u.validateCoreDatasetValues(unknown,input);if(!unresolved.datasetValidation.valid||unresolved.datasetValidation.complete||!unresolved.residuals.length||unresolved.source['x-future-policy'].meaning!=='retained')throw Error('Unknown source context');
  const forged=structuredClone(receipt);forged.keys=[];let refused=false;try{u.verifyCoreDatasetValues(forged,source,input)}catch{refused=true}if(!refused)throw Error('Forged receipt accepted');
  const changed=structuredClone(input);changed.scope.id='different';refused=false;try{u.verifyCoreDatasetValues(receipt,source,changed)}catch{refused=true}if(!refused)throw Error('Request scope custody lost');
  if('process' in globalThis||'Buffer' in globalThis)throw Error('Host globals present');
  return {receipt,controls,unknownValidation:unresolved.datasetValidation,unknownResiduals:unresolved.residuals,forgedRefused:true,reScopedRefused:true,nodeGlobalsAbsent:true};
 },JSON.stringify({sourceText,input}));
 const fingerprints=Object.fromEntries(await Promise.all(['src/model/dataset-values.ts','src/model/record-values.ts','src/model/key-tuple.ts','spec/core/dataset-value-operation.schema.json','.cache/dataset-values-browser/umf.js'].map(async path=>[path,new Bun.CryptoHasher('sha256').update(await Bun.file(path).bytes()).digest('hex')])));
 await Bun.write('fixtures/validation/core-dataset-values-browser.json',JSON.stringify({...result,baseRevision:'45473e71d5dfe9aa80abe3e346243b8efcbf1a37',recordFoundationRevision:'c45c72a2a8a3c4fba61c40c5927dd9091acf8cc3',workingTreeFingerprints:fingerprints,browser:browser.version(),sourceSha256:new Bun.CryptoHasher('sha256').update(sourceText).digest('hex'),qualification:'Actual browser-compatible public dataset operation over original commerce0.8 and explicit candidate lexical conversion. Supplied finite keys/relationship constraints only; unchanged original Record results. No native/global coverage, consumer acceptance, transaction or publication/ACK authority.'},null,2)+'\n');console.log('Real Chromium original commerce supplied dataset checks passed: '+browser.version());
}finally{await browser?.close();server.stop(true);}
