import {recordCase} from './record-tablespec-cases';
import {projectRecordToTableSpec} from '../../src/core-ideals/record-tablespec-projection';
import {chromium} from 'playwright';
import {declareCoreElementKind} from '../../src/model/field-kind';
import {projectFieldToTableSpec,type FieldTableSpecRequest} from '../../src/core-ideals/field-tablespec-projection';
import {exportTableSpec} from '../../src/adapters/tablespec';
import {type Document} from '../../src/model/types';
const rows:any[]=[];
for(const nativeType of ['BOOLEAN','INTEGER','DECIMAL','FLOAT','TEXT','VARCHAR','CHAR','DATE','DATETIME','TIMESTAMP'] as const)for(const mode of ['strict','report'] as const){
 const source:Document={umf:'0.2.0',id:'source',vocabularies:{},modules:[{id:'m',namespace:'sales',elements:[{id:'e',name:'value',extensions:{}}]}]};
 const author=declareCoreElementKind(source,{module:'m',element:'e'},'field'),request:FieldTableSpecRequest={id:'target',tableName:'Sample',columnName:'value',nativeType,mode};
 const result=projectFieldToTableSpec(author,request);if(!result.target)throw Error('Positive failed');rows.push({author,request,result,text:exportTableSpec(result.target)});
}
const records:any[]=[];
for(const mode of ['strict','report'] as const)for(const variant of ['clean','mismatch','missing']){
 const {author,request}=recordCase();request.mode=mode;if(variant==='mismatch')request.fields[0]!.nativeType='INTEGER';if(variant==='missing')request.fields.pop();
 const result=projectRecordToTableSpec(author,request);records.push({variant,author,request,result,...(result.target?{text:exportTableSpec(result.target)}:{})});
}
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){const path=new URL(request.url).pathname;if(path==='/umf.js')return new Response(Bun.file('dist/umf.js'),{headers:{'content-type':'text/javascript'}});if(path==='/cases')return Response.json(rows);if(path==='/records')return Response.json(records);return new Response('<!doctype html><html><body>Field projection</body></html>',{headers:{'content-type':'text/html'}});}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage();const external:string[]=[];
 page.on('request',request=>{if(!request.url().startsWith(`http://127.0.0.1:${server.port}/`))external.push(request.url());});await page.goto(`http://127.0.0.1:${server.port}/`);
 const checks=await page.evaluate(async()=>{
  const path='/umf.js',umf=await import(path),rows=await(await fetch('/cases')).json();let recoveries=0;
  for(const row of rows){
   const result=umf.projectFieldToTableSpec(row.author,row.request);if(JSON.stringify(result)!==JSON.stringify(row.result))throw Error('Projection parity');
   if(!Array.isArray(result.diagnostics)||result.diagnostics.length)throw Error('Success diagnostics');const legacy=umf.copyJson(result);delete legacy.diagnostics;if(JSON.stringify(umf.recoverFieldFromTableSpec(legacy,row.text))!==JSON.stringify(result.source))throw Error('Legacy recovery');
   for(const format of ['json','yaml']){const back=umf.readJsonValue(umf.writeJsonValue(result,format),format);if(JSON.stringify(umf.recoverFieldFromTableSpec(back,row.text))!==JSON.stringify(row.author.target))throw Error('Ideal recovery');recoveries++;}
   const nativeOnly=umf.upgradeFieldEnvelope(umf.importTableSpec(row.text,{id:'native-only',format:'json'})).target;
   if(umf.classifyTableSpecField(nativeOnly,{column:0,mode:'strict'}).mapping.origin!=='classified')throw Error('Author intent inferred');
   let refused=false;try{umf.recoverFieldFromTableSpec(result,row.text+' ');}catch{refused=true;}if(!refused)throw Error('Stale native accepted');
  }
  const source=umf.copyJson(rows[0].author.source);source.modules[0].elements[0].future={constraint:'unknown'};
  const author=umf.declareCoreElementKind(source,{module:'m',element:'e'},'field');
  const strict=umf.projectFieldToTableSpec(author,{...rows[0].request,mode:'strict'}),report=umf.projectFieldToTableSpec(author,{...rows[0].request,mode:'report'});
  if(strict.status!=='blocked'||'target'in strict||report.status!=='projected'||!report.residuals.length)throw Error('Loss policy');
  if(strict.diagnostics.length!==strict.residuals.length||strict.diagnostics.some((d:any)=>d.severity!=='error')||report.diagnostics.length!==report.residuals.length||report.diagnostics.some((d:any)=>d.severity!=='warning'))throw Error('Loss diagnostics');
  const records=await(await fetch('/records')).json();let recordRecoveries=0,recordBlocks=0;
  for(const row of records){
   const result=umf.projectRecordToTableSpec(row.author,row.request);if(JSON.stringify(result)!==JSON.stringify(row.result))throw Error('Record parity');
   if(result.status==='blocked'){if('target'in result)throw Error('Partial record');recordBlocks++;continue;}
   for(const format of ['json','yaml']){const receipt=umf.readJsonValue(umf.writeJsonValue(result,format),format);if(JSON.stringify(umf.recoverRecordFromTableSpec(receipt,row.text))!==JSON.stringify(row.author.target))throw Error('Record recovery');recordRecoveries++;}
   const native=umf.upgradeFieldEnvelope(umf.importTableSpec(row.text,{id:'native-record',format:'json'})).target;
   const classified=umf.classifyTableSpecRecord(native,{recordModule:'records',recordId:'record',mode:'strict'});if(classified.target.modules.at(-1).elements[0].references.length!==3)throw Error('Native record membership');
  }
  if('Bun'in globalThis||'process'in globalThis)throw Error('Host globals');return {projections:rows.length,idealRecoveries:recoveries,lossPolicies:2,recordCases:records.length,recordRecoveries,recordBlocks};
 });
 if(external.length)throw Error('External requests');
 await Bun.write('fixtures/validation/field-tablespec-projection.json',JSON.stringify({scope:'Field and flat Record projection; chosen native types do not prove value-domain equivalence',browser:browser.version(),checks,externalRequests:external,rows,records},null,2)+'\n');console.log(JSON.stringify(checks));
}finally{await browser?.close();server.stop(true);}
