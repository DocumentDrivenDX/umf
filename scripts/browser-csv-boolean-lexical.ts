/** Explicit finite lexical profile browser proof; no archive or native conversion. */
import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {readDocument} from '../src/model/document';
import {validateCsvBooleanLexical,verifyCsvBooleanLexical,type CsvBooleanLexicalRequest} from '../src/model/csv-boolean-lexical';
const directory=resolve(process.argv[2]??'');if(!process.argv[2])throw Error('Explicit fresh output required');await mkdir(directory);
const build=await Bun.build({entrypoints:['src/index.ts'],outdir:directory,naming:'umf.js',target:'browser',format:'esm'});if(!build.success)throw Error(build.logs.join('\n'));
const sourceText=await Bun.file('spec/domain-packs/medical/ontology.json').text(),source=readDocument(sourceText,'json');
const requests:CsvBooleanLexicalRequest[]=(['true','false','True','False']as const).map(token=>({profile:'umf.csv-boolean-lexical/1.0.0',field:{module:'domain',element:'patients.active'},token,sourceContext:{file:'separately-retained-original.csv',row:1,column:'active',future:{retained:['雪',null]}}}));
const server=Bun.serve({port:0,hostname:'127.0.0.1',fetch(request){const path=new URL(request.url).pathname;if(path==='/')return new Response('<!doctype html><title>UMF explicit Boolean lexical profile</title>');if(path==='/input.json')return Response.json({sourceText,requests});if(path==='/umf.js')return new Response(Bun.file(join(directory,'umf.js')),{headers:{'content-type':'text/javascript'}});return new Response('Unknown',{status:404});}});
let browser:any;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage();await page.goto(server.url.href);
 const result=await page.evaluate(async()=>{
  const module='/umf.js',umf=await import(module),input=await(await fetch('/input.json')).json(),source=umf.readDocument(input.sourceText,'json'),receipts:any[]=[],controls:string[]=[];
  for(const request of input.requests){const receipt=umf.validateCsvBooleanLexical(source,request);if(receipt.value.boolean!==(request.token==='true'||request.token==='True')||JSON.stringify(receipt.validation)!==JSON.stringify(umf.validateCoreFieldValue(source,request.field,receipt.value))||JSON.stringify(umf.verifyCsvBooleanLexical(receipt,source,request))!==JSON.stringify(receipt))throw Error('Public conversion/validation/recomputation differs');receipts.push(receipt);}
  const refuse=(name:string,action:()=>unknown)=>{let rejected=false;try{action();}catch{rejected=true;}if(!rejected)throw Error('Control admitted '+name);controls.push(name);};
  for(const token of ['TRUE',' true','true ','1','\\N',null])refuse('token:'+JSON.stringify(token),()=>umf.validateCsvBooleanLexical(source,{...input.requests[0],token}));
  refuse('String field',()=>umf.validateCsvBooleanLexical(source,{...input.requests[0],field:{module:'domain',element:'patients.birth_date'}}));
  const restricted=structuredClone(source);restricted.modules[0].elements.find((e:any)=>e.id==='patients.active').allowedValues=[{boolean:false}];const invalid=umf.validateCsvBooleanLexical(restricted,input.requests[0]);if(invalid.validation.valid!==false||JSON.stringify(invalid.validation)!==JSON.stringify(umf.validateCoreFieldValue(restricted,input.requests[0].field,invalid.value)))throw Error('Invalid public verdict lost');
  const unknown=structuredClone(source);unknown.modules[0].elements.find((e:any)=>e.id==='patients.active').facets={futureBooleanRule:{meaning:'unknown'}};const incomplete=umf.validateCsvBooleanLexical(unknown,input.requests[0]);if(incomplete.validation.complete!==false||JSON.stringify(incomplete.validation)!==JSON.stringify(umf.validateCoreFieldValue(unknown,input.requests[0].field,incomplete.value)))throw Error('Unknown public verdict lost');
  const changed=structuredClone(receipts[0]);changed.value.boolean=false;refuse('forged typed value',()=>umf.verifyCsvBooleanLexical(changed,source,input.requests[0]));
  refuse('independent request mismatch',()=>umf.verifyCsvBooleanLexical(receipts[0],source,input.requests[2]));
  const changedSource=structuredClone(source);changedSource.revision='different';refuse('independent source mismatch',()=>umf.verifyCsvBooleanLexical(receipts[0],changedSource,input.requests[0]));
  return {receipts,invalid,incomplete,controls};
 });
 for(let i=0;i<requests.length;i++){const expected=validateCsvBooleanLexical(source,requests[i]!);verifyCsvBooleanLexical(expected,source,requests[i]!);if(JSON.stringify(expected)!==JSON.stringify(result.receipts[i]))throw Error('Original browser/Bun receipt bytes differ');}
 const sha=(v:Uint8Array|string)=>createHash('sha256').update(v).digest('hex');
 await Bun.write(join(directory,'original-input.json'),JSON.stringify({sourceText,requests})+'\n');await Bun.write(join(directory,'receipts.json'),JSON.stringify(result)+'\n');
 const report={format:'umf-csv-boolean-lexical-browser/0.1',sourceBase:'cea3fa03480de1f3437ecd6d23e500bea618e0f3',candidate:true,browserVersion:browser.version(),modelSha256:sha(sourceText),bundleSha256:sha(await Bun.file(join(directory,'umf.js')).bytes()),inputSha256:sha(await Bun.file(join(directory,'original-input.json')).bytes()),receiptsSha256:sha(await Bun.file(join(directory,'receipts.json')).bytes()),tokens:requests.map(r=>r.token),controls:result.controls,qualification:'Explicit caller-selected four-token profile, actual public Field validation and independent original source/request receipt verification. No implicit historical graph, native storage or broader CSV/FHIR semantics.'};await Bun.write(join(directory,'report.json'),JSON.stringify(report)+'\n');console.log(JSON.stringify(report));
}finally{if(browser)await browser.close();server.stop(true);}
