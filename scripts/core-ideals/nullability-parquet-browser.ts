import {chromium} from 'playwright';
import {createHash} from 'node:crypto';
const fixture='fixtures/validation/nullability-parquet-native.json';
const native=await Bun.file(fixture).json();
const rows=await Promise.all(native.cases.filter((r:any)=>r.outcome==='accepted').map(async(r:any)=>({...r,bytes:Array.from(new Uint8Array(await Bun.file(r.path).arrayBuffer()))})));
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){const p=new URL(request.url).pathname;if(p==='/umf.js')return new Response(Bun.file('dist/umf.js'),{headers:{'content-type':'text/javascript'}});if(p==='/cases')return Response.json(rows);return new Response('<!doctype html><html><body>Parquet availability discovery</body></html>',{headers:{'content-type':'text/html'}});}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage(),external:string[]=[];
 await page.route('**/*',route=>{if(!route.request().url().startsWith(`http://127.0.0.1:${server.port}/`)){external.push(route.request().url());return route.abort();}return route.continue();});await page.goto(`http://127.0.0.1:${server.port}/`);
 const checks=await page.evaluate(async()=>{
  const path='/umf.js',u=await import(path),rows=await(await fetch('/cases')).json();let recoveries=0,columns=0;
  for(const row of rows){
   const source=u.importParquetSchema(new Uint8Array(row.bytes),{id:row.id}),inventory=u.getParquetFieldMetadata(source);
   if(inventory.status!=='checked')throw Error('Unchecked schema');
   const leaves=inventory.fields.filter((f:any)=>Object.hasOwn(f.nativeField,'type'));if(leaves.length!==row.columns.length)throw Error('Column count');
   for(let i=0;i<leaves.length;i++){const f=leaves[i],n=row.columns[i];if(f.path.join('.')!==n.path||f.definitionLevel!==n.definitionLevel||f.repetitionLevel!==n.repetitionLevel)throw Error('Native level mismatch');columns++;}
   for(const format of ['json','yaml']){const back=u.exportParquetCapture(u.readDocument(u.writeDocument(source,format),format));if(back.length!==row.bytes.length||back.some((b:number,i:number)=>b!==row.bytes[i]))throw Error('Source bytes changed');recoveries++;}
  }
  if('Bun'in globalThis||'process'in globalThis)throw Error('Host globals');return {files:rows.length,columns,recoveries};
 });if(external.length)throw Error('External request');
 const paths=[fixture,'dist/umf.js','scripts/core-ideals/nullability-parquet-browser.ts','src/adapters/parquet/field-metadata.ts','src/adapters/parquet/index.ts',...rows.map(r=>r.path)];
 const fingerprints=Object.fromEntries(await Promise.all(paths.map(async p=>[p,createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex')])));
 await Bun.write('fixtures/validation/nullability-parquet-browser.json',JSON.stringify({scope:'Discovery corpus physical field-level parity and exact native byte recovery; core Nullability classification/projection remain unfinished',browser:browser.version(),checks,externalRequests:external,fingerprints},null,2)+'\n');console.log(JSON.stringify(checks));
}finally{await browser?.close();server.stop(true);}
