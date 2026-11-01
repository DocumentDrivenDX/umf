// SPDX-License-Identifier: MIT OR Apache-2.0
// Small installed-SDK consumer. It imports only the extracted package's dist files.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {basename,join,resolve,sep} from 'node:path';
import {pathToFileURL} from 'node:url';

const sdk=resolve(process.argv[2]??'');
assert(process.argv[2], 'usage: umf-installed-sdk-consumer.mjs <extracted-sdk-package-root> [--browser]');
const browserMode=process.argv.includes('--browser');
const dist=join(sdk,'dist');
const metadata=JSON.parse(await readFile(join(sdk,'package.json'),'utf8'));
assert.equal(metadata.exports['.'].browser,'./dist/umf-browser.js');
const entry=createRequire(join(sdk,'package.json')).resolve('@umf/core');
assert.equal(entry,join(dist,'umf-node.js'),'public package export should select native Node entry');
await Promise.all(['umf-node.js','umf-browser.js','umf_core_wasm_bg.wasm'].map(name=>readFile(join(dist,name))));
const source={umf:'0.10.0',id:'installed-sdk-consumer',vocabularies:{},modules:[]};
function exercise(publicApi){
 const document=publicApi.readDocument(JSON.stringify(source),'json');
 const validation=publicApi.validateDocument(document);
 assert.equal(validation.valid,true,'ordinary document should validate');
 assert.equal(validation.complete,true,'ordinary document should be complete');
 const exchanged=publicApi.readDocument(publicApi.writeDocument(document,'json'),'json');
 assert.deepEqual(exchanged,document,'JSON read/write roundtrip should preserve the document');
 const refused=publicApi.validateDocument({...source,umf:'99.0.0'});
 assert.equal(refused.valid,false,'unsupported core version should be refused');

 const openapiText=JSON.stringify({openapi:'3.1.0',info:{title:'Installed consumer',version:'1'},paths:{}});
 const openapi=publicApi.importOpenapiDocument(openapiText,{id:'consumer-openapi',format:'json'});
 assert.equal(publicApi.exportOpenapiDocument(openapi),openapiText,'OpenAPI adapter roundtrip should preserve source');

 const cardinalitySource={umf:'0.10.0',id:'ideal',vocabularies:{},modules:[{id:'m',namespace:'',elements:[{id:'f',kind:'field',extensions:{}}]}]};
 const author=publicApi.declareCoreCardinality(cardinalitySource,{module:'m',element:'f'},{cardinality:'one'});
 const request={id:'installed-consumer-projection',recordName:'Example',namespace:'',fieldName:'value',nativeType:'"long"',dependencies:[],availability:'avro-null-value',requireExactValues:false,mode:'strict'};
 const projected=publicApi.projectCardinalityToAvro(author,request);
 assert.equal(projected.status,'projected','ordinary authored Avro projection should succeed');
 assert.deepEqual(publicApi.recoverCardinalityFromAvro(projected,projected.nativeBundle),author.target,'projection recovery should retain authored meaning');
 const blocked=publicApi.projectCardinalityToAvro(author,{...request,nativeType:'{"type":"array","items":"long"}'});
 assert.equal(blocked.status,'blocked','incompatible native shape should be refused');
 return {document:'valid-complete-roundtrip',refusal:true,adapter:'openapi-roundtrip',authoredProjection:'avro-cardinality-projected-and-recovered',projectionRefusal:true};
}
const result=browserMode?{}:exercise(await import(pathToFileURL(entry).href));
if(browserMode){
 const require=createRequire(resolve(process.cwd(),'package.json'));
 const {chromium}=require('playwright');
 const server=createServer(async(req,res)=>{
  const path=new URL(req.url??'/', 'http://127.0.0.1').pathname;
  if(path==='/'){res.setHeader('content-type','text/html');res.end('<!doctype html><title>Installed SDK</title><script type="module" src="/entry.js"></script>');return;}
  if(path==='/entry.js'){
   res.setHeader('content-type','text/javascript');
   res.end(`import * as api from '/sdk/umf-browser.js';\nconst source=${JSON.stringify(source)};\ntry{\nconst document=api.readDocument(JSON.stringify(source),'json');const validation=api.validateDocument(document);if(!validation.valid||!validation.complete)throw Error('document validation');const exchanged=api.readDocument(api.writeDocument(document,'json'),'json');if(JSON.stringify(exchanged)!==JSON.stringify(document))throw Error('document exchange');const refused=api.validateDocument({...source,umf:'99.0.0'});if(refused.valid)throw Error('core-version refusal');const input=${JSON.stringify({openapi:'3.1.0',info:{title:'Installed consumer',version:'1'},paths:{}})};const openapiText=JSON.stringify(input);const openapi=api.importOpenapiDocument(openapiText,{id:'consumer-openapi',format:'json'});if(api.exportOpenapiDocument(openapi)!==openapiText)throw Error('OpenAPI roundtrip');const cardinalitySource=${JSON.stringify({umf:'0.10.0',id:'ideal',vocabularies:{},modules:[{id:'m',namespace:'',elements:[{id:'f',kind:'field',extensions:{}}]}]})};const author=api.declareCoreCardinality(cardinalitySource,{module:'m',element:'f'},{cardinality:'one'});const request=${JSON.stringify({id:'installed-consumer-projection',recordName:'Example',namespace:'',fieldName:'value',nativeType:'"long"',dependencies:[],availability:'avro-null-value',requireExactValues:false,mode:'strict'})};const projected=api.projectCardinalityToAvro(author,request);if(projected.status!=='projected'||JSON.stringify(api.recoverCardinalityFromAvro(projected,projected.nativeBundle))!==JSON.stringify(author.target))throw Error('Avro projection/recovery');const blocked=api.projectCardinalityToAvro(author,{...request,nativeType:'{"type":"array","items":"long"}'});if(blocked.status!=='blocked')throw Error('Avro refusal');window.__umfConsumer={status:'passed',nodeGlobalsAbsent:!('process' in globalThis)&&!('Buffer' in globalThis)};\n}catch(error){window.__umfConsumer={status:'failed',error:String(error)}}`);
   return;
  }
  if(path.startsWith('/sdk/')){
   const file=resolve(dist,decodeURIComponent(path.slice('/sdk/'.length)));
   if(file.startsWith(dist+sep))try{const bytes=await readFile(file);res.setHeader('content-type',file.endsWith('.wasm')?'application/wasm':'text/javascript');res.end(bytes);return;}catch{}
  }
  res.writeHead(404);res.end('not found');
 });
 await new Promise(done=>server.listen({host:'127.0.0.1',port:0},done));
 let browser;
 try{
  const address=server.address();assert(address&&typeof address!=='string');
  browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});
  const page=await browser.newPage(),errors=[],external=[];
  page.on('pageerror',error=>errors.push(String(error)));
  await page.route('**/*',route=>{const url=new URL(route.request().url());if(url.hostname!=='127.0.0.1'){external.push(url.href);return route.abort();}return route.continue();});
  await page.goto(`http://127.0.0.1:${address.port}/`,{timeout:120000});
  await page.waitForFunction(()=>window.__umfConsumer,undefined,{timeout:120000});
  const report=await page.evaluate(()=>window.__umfConsumer);
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.deepEqual(report,{status:'passed',nodeGlobalsAbsent:true});
  result.chromium={version:browser.version(),...report};
 }finally{await browser?.close();await new Promise(done=>server.close(()=>done()));}
}
console.log(JSON.stringify({status:'passed',sdkRoot:basename(sdk),runtime:typeof Bun==='undefined'?'node':'bun',...result}));
