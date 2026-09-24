import {chromium} from 'playwright';
const fixture=await Bun.file('fixtures/avro/field-metadata.json').json();
const temporal=await Bun.file('fixtures/avro/temporal-metadata.json').json();
const candidates=await Bun.file('fixtures/avro/candidate-edits.json').json();
const integers=await Bun.file('fixtures/avro/integer-metadata.json').json();
const build=await Bun.build({entrypoints:['src/index.ts'],target:'browser',format:'esm',outdir:'.cache/avro-metadata-browser',naming:'umf.js'});if(!build.success)throw Error(String(build.logs));
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(req){return new URL(req.url).pathname==='/umf.js'?new Response(Bun.file('.cache/avro-metadata-browser/umf.js'),{headers:{'content-type':'text/javascript'}}):new Response('<!doctype html><title>Avro field metadata</title>');}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage();let externalRequests=0;
 await page.route('**/*',r=>{if(!r.request().url().startsWith('http://127.0.0.1:')){externalRequests++;return r.abort();}return r.continue();});await page.goto('http://127.0.0.1:'+server.port);
 const result=await page.evaluate(async ({f,temporal,candidates,integers})=>{
  const path='/umf.js',u=await import(path),doc=u.importAvroSchema(f.source,{id:'fields'});
  const fields=u.getAvroFieldMetadata(doc);if(JSON.stringify(fields)!==JSON.stringify(f.view))throw Error('Metadata differs');
  for(const format of ['json','yaml']){const back=u.readDocument(u.writeDocument(doc,format),format);if(JSON.stringify(u.getAvroFieldMetadata(back))!==JSON.stringify(fields))throw Error('Recovery differs');if(JSON.stringify(JSON.parse(u.exportAvroSchema(back)))!==JSON.stringify(JSON.parse(f.source)))throw Error('Native source differs');}
  const original=u.importAvroSchema('{"type":"record","name":"R","fields":[{"name":"x","type":"int"}]}',{id:'edit'}),edited=u.editAvroNode(original,'/fields/0/type','"string"');
  if(u.getAvroFieldMetadata(original)[0].element.scalarType!=='integer'||u.getAvroFieldMetadata(edited)[0].element.scalarType!=='string')throw Error('Edit not synchronized');
  for(const c of temporal.cases){
   const doc=u.importAvroSchema(c.source,{id:c.id});
   for(const format of ['json','yaml']){
    const back=u.readDocument(u.writeDocument(doc,format),format);
    if((u.getAvroFieldMetadata(back)[0].element.scalarType??null)!==c.expected||(back.modules[1].elements[0].scalarType??null)!==c.expected)throw Error('Temporal metadata differs');
    if(JSON.stringify(JSON.parse(u.exportAvroSchema(back)))!==JSON.stringify(JSON.parse(c.source)))throw Error('Temporal source differs');
   }
  }
  const temporalSource=u.importAvroSchema('{"type":"record","name":"T","fields":[{"name":"v","type":{"type":"long","logicalType":"timestamp-micros"}}]}',{id:'temporal-edit'});
  let blocked=false;try{u.editAvroNode(temporalSource,'/fields/0/type/logicalType',JSON.stringify('timestamp-micros\n'));}catch(e){blocked=(e as {code?:string}).code==='UNSAFE_EDIT';}
  if(!blocked||temporalSource.modules[1].elements[0].scalarType!=='timestamp')throw Error('Temporal edit guard');
  for(const c of candidates.cases){
   const e=c.result.edit,source=u.readDocument(JSON.stringify(c.result.source),'json');
   const text=c.editText;
   const proposal=u.proposeAvroNodeEdit(source,e.path,text,e.dependencyId);
   if(JSON.stringify(proposal)!==JSON.stringify(c.result))throw Error('Candidate differs from Bun');
   if(JSON.stringify(source)!==JSON.stringify(c.result.source))throw Error('Candidate mutated input');
   for(const expected of c.exports){const bundle=u.exportAvroBundle(u.readDocument(u.writeDocument(proposal.document,expected.format),expected.format));if(bundle.schema!==expected.schema||JSON.stringify(bundle.dependencies)!==JSON.stringify(expected.dependencies))throw Error('Candidate recovery differs');}
  }
  for(const c of integers.cases){const d=u.importAvroSchema(c.source,{id:c.document.id});if(JSON.stringify(u.getAvroFieldMetadata(d).map((f:any)=>f.element.scalarType??null))!==JSON.stringify(c.expected))throw Error('Integer metadata differs');for(const output of c.exports){if(u.exportAvroSchema(u.readDocument(u.writeDocument(d,output.format),output.format))!==output.native)throw Error('Integer recovery differs');}const edited=u.proposeAvroNodeEdit(d,'/fields/0/type/'+c.key,'1.0000000000000000001').document;if(u.getAvroFieldMetadata(edited).some((f:any)=>f.element.scalarType!==undefined))throw Error('Inexact edit promoted');}
  return {integerCases:integers.cases.length,integerRecoveries:integers.cases.length*2,fields:fields.length,recoveries:2,edits:1,blockedTemporalEdits:1,temporalCases:temporal.cases.length,temporalRecoveries:2*temporal.cases.length,candidates:candidates.cases.length,candidateRecoveries:2*candidates.cases.length,nodeGlobalsAbsent:!('process'in globalThis)&&!('Buffer'in globalThis)};
 },{f:fixture,temporal,candidates,integers});
 if(externalRequests||!result.nodeGlobalsAbsent)throw Error('Browser boundary');
 await Bun.write('fixtures/avro/field-metadata-browser.json',JSON.stringify({...result,externalRequests,browser:browser.version()},null,2)+'\n');console.log(result);
}finally{await browser?.close();server.stop(true);}
