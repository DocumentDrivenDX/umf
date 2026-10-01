import {chromium} from 'playwright';
import {createHash} from 'node:crypto';

const base='fixtures/relationship-native/';
const avroText=await Bun.file(base+'avro-value-and-id.avsc').text();
const parquetBytes=new Uint8Array(await Bun.file(base+'parquet-value-and-id.parquet').arrayBuffer());
const parquetSha=createHash('sha256').update(parquetBytes).digest('hex');
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(req){const path=new URL(req.url).pathname;
 if(path==='/umf.js')return new Response(Bun.file('dist/umf.js'),{headers:{'content-type':'text/javascript'}});
 if(path==='/case')return Response.json({avroText,parquetBytes:Array.from(parquetBytes),parquetSha});
 return new Response('<!doctype html><title>Native relationship counterexamples</title>');
}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});
 const page=await browser.newPage(),external:string[]=[];
 await page.route('**/*',route=>{if(!route.request().url().startsWith(`http://127.0.0.1:${server.port}/`)){external.push(route.request().url());return route.abort();}return route.continue();});
 await page.goto(`http://127.0.0.1:${server.port}/`);
 const result=await page.evaluate(async()=>{
  const path='/umf.js',umf=await import(path),source=await(await fetch('/case')).json();
  const avro=umf.importAvroSchema(source.avroText,{id:'relationship-native-avro'});
  if(umf.exportAvroSchema(avro)!==source.avroText)throw Error('Avro source changed');
  for(const format of ['json','yaml'])if(umf.exportAvroSchema(umf.readDocument(umf.writeDocument(avro,format),format))!==source.avroText)throw Error('Avro codec changed');
  const parquet=umf.captureParquet(Uint8Array.from(source.parquetBytes),{id:'relationship-native-parquet'});
  const paths=umf.inspectParquetSchema(parquet).leaves.map((row:any)=>row.path.join('.'));
  if(JSON.stringify(paths)!==JSON.stringify(['customer_value.id','customer_id']))throw Error('Parquet carrier changed');
  for(const format of ['json','yaml']){
   const bytes=umf.exportParquetCapture(umf.readDocument(umf.writeDocument(parquet,format),format));
   const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
   if(hash!==source.parquetSha)throw Error('Parquet source changed');
  }
  if([...avro.modules,...parquet.modules].some((module:any)=>Object.hasOwn(module,'relationships')))throw Error('Invented authored relationship');
  if('Bun'in globalThis||'process'in globalThis)throw Error('Host globals in browser');
  return {avroRecovered:true,parquetRecovered:true,parquetPaths:paths,authoredRelationshipInferred:false};
 });
 if(external.length)throw Error('External browser request');
 await Bun.write(base+'avro-parquet-browser.json',JSON.stringify({browser:browser.version(),...result,externalRequests:external},null,2)+'\n');
 console.log({browser:browser.version(),...result});
}finally{await browser?.close();server.stop(true);}
