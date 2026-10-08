import {chromium} from 'playwright';
import {readFile} from 'node:fs/promises';
const build=await Bun.build({entrypoints:['src/index.ts'],outdir:'.cache/record-values-browser',naming:'umf.js',target:'browser',format:'esm'});if(!build.success)throw Error(build.logs.join('\n'));
const source=await readFile('fixtures/core/record-values-source.umf.json','utf8');
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){return new URL(request.url).pathname==='/umf.js'?new Response(Bun.file('.cache/record-values-browser/umf.js'),{headers:{'content-type':'text/javascript'}}):new Response('<!doctype html><title>Record value checks</title>');}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.port);
 const result=await page.evaluate(async(text)=>{
  const path='/umf.js',u=await import(path);const original=u.readDocument(text,'json'),source=u.upgradeSchemaPropertiesEnvelope(original).target;
  const identity={module:'fixture',element:'item'},label={field:{module:'fixture',element:'label'},state:'present',value:{string:'雪🙂'}};
  const complete=u.validateCoreRecordValues(source,identity,[label]);
  if(!complete.validation.valid||!complete.validation.complete||complete.documentValidation.complete||complete.fields[1].state!=='absent')throw Error('Complete logical/retained document distinction');
  const optional=u.validateCoreRecordValues(source,identity,[label,{field:{module:'fixture',element:'caption'},state:'present',value:null}]);if(!optional.validation.complete)throw Error('Optional null');
  const required=u.validateCoreRecordValues(source,identity,[]);if(required.validation.valid||required.validation.complete)throw Error('Required omission');
  const unknown=structuredClone(source);unknown['x-future-assertion']={meaning:'retained'};
  const unresolved=u.validateCoreRecordValues(unknown,identity,[label]);if(!unresolved.validation.valid||unresolved.validation.complete||unresolved.source['x-future-assertion'].meaning!=='retained')throw Error('Unknown scope');
  const keyed=structuredClone(source);keyed.modules[0].elements[0].keys=[{id:'item-key',name:'item-key',fields:[{module:'fixture',element:'label'}]}];
  const keys=u.validateCoreRecordValues(keyed,identity,[label]);if(keys.validation.complete||!keys.validation.diagnostics.some((d:any)=>d.code==='RECORD_KEY_CONTEXT_REQUIRED'))throw Error('Dataset key scope');
  let refused=false;try{u.validateCoreRecordValues(original,identity,[label]);}catch{refused=true;}if(!refused)throw Error('Legacy reinterpretation');
  if('process' in globalThis||'Buffer' in globalThis)throw Error('Host globals');
  return {complete,optional,required,unresolved,keys,legacyRefused:true,nodeGlobalsAbsent:true};
 },source);
 await Bun.write('fixtures/validation/core-record-values-browser.json',JSON.stringify({...result,browser:browser.version(),sourceSha256:new Bun.CryptoHasher('sha256').update(source).digest('hex'),qualification:'Actual public API in Chromium: logical Record membership/presence/field checks on explicit core0.8 upgrade, original document warnings retained, unknown and dataset key contexts incomplete. No native rows, default insertion, dataset uniqueness/relationships, qualified validator service or Truss acceptance.'},null,2)+'\n');console.log('Real Chromium logical Record checks passed: '+browser.version());
}finally{await browser?.close();server.stop(true);}
