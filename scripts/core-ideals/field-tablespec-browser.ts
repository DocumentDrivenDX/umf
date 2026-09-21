import {chromium} from 'playwright';
import {importTableSpec,exportTableSpec} from '../../src/adapters/tablespec';
import {upgradeFieldEnvelope} from '../../src/model/field-transition';
import {classifyTableSpecRecord,verifyTableSpecRecordClassification} from '../../src/core-ideals/tablespec-record';
import {classifyTableSpecField} from '../../src/core-ideals/tablespec-field';
import {readDocument,writeDocument} from '../../src/model/document';
const corpus=await Bun.file('fixtures/tablespec/roundtrip.json').json();const rows:any[]=[];
for(const sample of corpus.results){
 const source=upgradeFieldEnvelope(importTableSpec(sample.input,{id:sample.id,format:sample.format})).target;
 for(let column=0;column<source.modules[0]!.elements.length;column++)for(const mode of ['strict','report'] as const){
  const result=classifyTableSpecField(source,{column,mode});if(!result.target)throw Error('Missing native field');
  const exports=['json','yaml'].map(format=>({format,text:exportTableSpec(readDocument(writeDocument(result.target!,format as any),format as any))}));
  if(exports.some(x=>x.text!==sample.input))throw Error('Native source changed');
  const record=classifyTableSpecRecord(source,{recordModule:'records',recordId:'table-record',mode});if(!record.target)throw Error('Record blocked');verifyTableSpecRecordClassification(record,record.target);
  const recordSummary=record.target.modules.at(-1)!.elements[0]!,recordExport=exportTableSpec(record.target);if(recordExport!==sample.input)throw Error('Record native loss');
  rows.push({recordSummary,recordExport,id:sample.id,input:sample.input,nativeFormat:sample.format,column,mode,result,exports});
 }
}
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){const path=new URL(request.url).pathname;if(path==='/umf.js')return new Response(Bun.file('dist/umf.js'),{headers:{'content-type':'text/javascript'}});if(path==='/cases')return Response.json(rows);return new Response('<!doctype html><html><body>Field native classification</body></html>',{headers:{'content-type':'text/html'}});}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage();const external:string[]=[];
 page.on('request',request=>{if(!request.url().startsWith(`http://127.0.0.1:${server.port}/`))external.push(request.url());});await page.goto(`http://127.0.0.1:${server.port}/`);
 const checks=await page.evaluate(async()=>{
  const path='/umf.js',umf=await import(path),rows=await(await fetch('/cases')).json();let recoveries=0,conflicts=0,records=0;
  for(const row of rows){
   const record=umf.classifyTableSpecRecord(row.result.source,{recordModule:'records',recordId:'table-record',mode:row.mode});umf.verifyTableSpecRecordClassification(record,record.target);
   if(JSON.stringify(record.target.modules.at(-1).elements[0])!==JSON.stringify(row.recordSummary)||umf.exportTableSpec(record.target)!==row.recordExport)throw Error('Record membership or source loss');
   const members=umf.selectCoreElements(record.target,{identities:[{module:'records',element:'table-record'}],references:'transitive'}).selection;
   if(members.length!==row.recordSummary.references.length+1)throw Error('Record reference closure');records++;
   const result=umf.classifyTableSpecField(row.result.source,{column:row.column,mode:row.mode});if(JSON.stringify(result)!==JSON.stringify(row.result))throw Error('Classifier parity');umf.verifyTableSpecFieldClassification(result,result.target);
   const stale=umf.copyJson(result.target);stale.future='changed';let refused=false;try{umf.verifyTableSpecFieldClassification(result,stale);}catch{refused=true;}if(!refused)throw Error('Stale classification accepted');
   for(const format of ['json','yaml']){if(umf.exportTableSpec(umf.readDocument(umf.writeDocument(result.target,format),format))!==row.input)throw Error('Native recovery');recoveries++;}
  }
  const original='{"version":"1.0","table_name":"T","columns":[{"name":"x","data_type":"FUTURE"}]}';
  const source=umf.upgradeFieldEnvelope(umf.importTableSpec(original,{id:'conflict',format:'json'})).target;
  for(const mode of ['strict','report']){const author=umf.declareCoreElementKind(source,{module:'table',element:'column:0'},'record');const result=umf.classifyTableSpecField(author.target,{column:0,mode,author});if(result.status!=='blocked'||'target'in result||result.source.modules[0].elements[0].kind!=='record')throw Error('Conflict overwritten');conflicts++;}
  if('Bun'in globalThis||'process'in globalThis)throw Error('Host globals');return {classifications:rows.length,recoveries,conflicts,records};
 });
 if(external.length)throw Error('External requests');
 const evidence={scope:'TableSpec captured table/column up-classification; no full record down-projection or ideal admission claim',browser:browser.version(),checks,externalRequests:external,rows};
 await Bun.write('fixtures/validation/field-tablespec-classification.json',JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify({browser:browser.version(),checks}));
}finally{await browser?.close();server.stop(true);}
