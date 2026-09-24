import {chromium} from 'playwright';
const cases=(await Bun.file('fixtures/tablespec/roundtrip.json').json()).results;
const splitCases=(await Bun.file('fixtures/tablespec/split.json').json()).results;
const tableCases=(await Bun.file('fixtures/tablespec/table-edits.json').json()).cases;
const metadataCases=(await Bun.file('fixtures/tablespec/table-metadata.json').json()).cases;
const boundaries=await Bun.file('fixtures/tablespec/boundaries.json').json();
const built=await Bun.build({entrypoints:['src/index.ts'],outdir:'.cache/tablespec-browser',naming:'umf.js',target:'browser',format:'esm'});if(!built.success)throw Error(String(built.logs));
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(req){return new URL(req.url).pathname==='/umf.js'?new Response(Bun.file('.cache/tablespec-browser/umf.js'),{headers:{'content-type':'text/javascript'}}):new Response('<!doctype html><title>TableSpec ingestion</title>');}});
let browser;
try{browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage();let externalRequests=0;await page.route('**/*',r=>{if(!r.request().url().startsWith('http://127.0.0.1:')){externalRequests++;return r.abort();}return r.continue();});await page.goto('http://127.0.0.1:'+server.port);
 const result=await page.evaluate(async ({cases,splitCases,tableCases,metadataCases,boundaries})=>{
  const path='/umf.js',u=await import(path);let recoveries=0,edits=0;
  for(const c of cases){
   let d=u.importTableSpec(c.originalInput??c.input,{id:c.id,format:c.format});
   if(c.changes){const original=d;d=u.editTableSpecColumn(d,0,c.changes);if(u.exportTableSpec(original)!==c.originalInput)throw Error('Original mutated');edits++;}
   if(JSON.stringify(d.modules[0].elements.map((e:any)=>e.scalarType??null))!==JSON.stringify(c.scalars))throw Error('Scalar metadata differs');
   for(const format of ['json','yaml']){const output=u.exportTableSpec(u.readDocument(u.writeDocument(d,format),format));if(output!==c.exports.find((e:any)=>e.format===format).text)throw Error('Source differs');recoveries++;}
  }
  let splitRecoveries=0,splitEdits=0;
  for(const c of splitCases){
   const original=u.importTableSpecBundle(c.input,{id:c.id}),edited=u.editTableSpecColumn(original,0,c.changes);
   for(const output of c.exports){
    const recovered=u.exportTableSpecBundle(u.readDocument(u.writeDocument(original,output.format),output.format));
    const editedFiles=u.exportTableSpecBundle(u.readDocument(u.writeDocument(edited,output.format),output.format));
    if(JSON.stringify(recovered)!==JSON.stringify(output.files)||JSON.stringify(editedFiles)!==JSON.stringify(output.editedFiles))throw Error('Split parity differs');
    splitRecoveries++;splitEdits++;
   }
  }
  let tableRecoveries=0;
  for(const c of tableCases){const original=JSON.stringify(c.renamed),edited=u.editTableSpecTable(c.renamed,c.changes);if(JSON.stringify(edited)!==JSON.stringify(c.edited)||JSON.stringify(c.renamed)!==original)throw Error('Table metadata edit differs');for(const output of c.exports){const back=u.readDocument(u.writeDocument(edited,output.format),output.format);if(c.mode==='monolithic'){if(u.exportTableSpec(back)!==output.text)throw Error('Table source differs');}else if(JSON.stringify(u.exportTableSpecBundle(back))!==JSON.stringify(output.files))throw Error('Table bundle differs');tableRecoveries++;}}
  let metadataRecoveries=0;
  for(const c of metadataCases){const before=JSON.stringify(c.source),table=u.getTableSpecTable(c.source);if(JSON.stringify(table)!==JSON.stringify(c.expected))throw Error('Table metadata differs');table.members.columns={kind:'null'};if(JSON.stringify(c.source)!==before)throw Error('Accessor mutated source');for(const format of ['json','yaml']){if(JSON.stringify(u.getTableSpecTable(u.readDocument(u.writeDocument(c.source,format),format)))!==JSON.stringify(c.expected))throw Error('Metadata recovery differs');metadataRecoveries++;}}
  const boundaryDoc=u.importTableSpecBundle(boundaries.files,{id:'suffixes'});if(JSON.stringify(boundaryDoc)!==JSON.stringify(boundaries.document)||JSON.stringify(u.exportTableSpecBundle(boundaryDoc))!==JSON.stringify(boundaries.files))throw Error('Filename boundary parity differs');
  let accessorCalls=0,editGuards=0;
  const getter=Object.defineProperty({},'description',{enumerable:true,get(){accessorCalls++;return {kind:'string',value:'wrong'};}});
  const hidden=Object.defineProperty({},'hidden',{value:'meaning'}),symbol={[Symbol('meaning')]:'keep'};
  const before=JSON.stringify(boundaryDoc);
  for(const change of [null,[],false,42,'',getter,hidden,symbol,Object.create({meaning:'inherited'})])for(const edit of [(x:any)=>u.editTableSpecColumn(boundaryDoc,0,x),(x:any)=>u.editTableSpecTable(boundaryDoc,x)]){try{edit(change);}catch{editGuards++;continue;}throw Error('Non-JSON edit accepted');}
  if(accessorCalls||JSON.stringify(boundaryDoc)!==before)throw Error('Edit invoked getter or mutated source');
  return {filenameBoundaryCases:boundaries.paths.length,editGuards,accessorCalls,metadataCases:metadataCases.length,metadataRecoveries,recoveries,edits,splitRecoveries,splitEdits,tableEdits:tableCases.length,tableRecoveries,nodeGlobalsAbsent:!('process'in globalThis)&&!('Buffer'in globalThis)};
 },{cases,splitCases,tableCases,metadataCases,boundaries});
 if(externalRequests||!result.nodeGlobalsAbsent)throw Error('Browser boundary failure');await Bun.write('fixtures/tablespec/browser.json',JSON.stringify({...result,externalRequests,browser:browser.version()},null,2)+'\n');console.log(result);
}finally{await browser?.close();server.stop(true);}
