// SPDX-License-Identifier: MIT OR Apache-2.0
// Exercise the distributed browser entry point. Build it separately, then pass
// its directory here; this harness neither compiles nor substitutes bindings.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {chromium} from 'playwright';

assert(process.argv[2], 'Pass the built SDK directory');
const sdk=resolve(process.argv[2]);
const entry=`
import * as umf from '/sdk/umf-browser.js';
const check=(condition,message)=>{if(!condition)throw Error(message);};
const manifest={id:'example.browser',version:'1.0.0',coreVersion:'0.10.0',description:'Browser baseline',semantics:'Fixture',scopes:['document'],capabilities:{validation:'structural',directions:[],evidence:[]},schema:{type:'object',required:['enabled'],properties:{enabled:{type:'boolean'}}}};
const registry=new umf.Registry().register(manifest);
const structure=registry.get(manifest.id,manifest.version).structure;
check(structure({enabled:true})&&!structure({enabled:'invalid'}),'Registry structure validation');
const parsed=umf.readDocument('umf: 0.10.0\\nid: browser-document\\nvocabularies: {}\\nmodules: []\\n');
check(umf.readDocument(umf.writeDocument(parsed)).id===parsed.id,'YAML document roundtrip');
const rdf=umf.importRdfNQuads('<https://example.test/s> <https://example.test/p> "before" .\\n',{id:'browser-rdf'});
check(umf.validateDocument(rdf,umf.rdfRegistry()).valid,'RDF Registry inspector');
const quad=umf.getRdfQuads(rdf)[0];
const edited=umf.proposeRdfQuadEdit(rdf,0,{...quad,object:{kind:'literal',value:'after',datatype:'http://www.w3.org/2001/XMLSchema#string'}});
check(umf.exportRdfNQuads(edited.document).includes('"after"'),'RDF edit/export');
check(umf.exportRdfNQuads(rdf).includes('"before"'),'RDF original source retained');
const options={id:'browser-shapes',baseIRI:'https://example.test/'};
const shapes=umf.importShaclTurtle('<https://example.test/shape> a <http://www.w3.org/ns/shacl#NodeShape> ; <http://www.w3.org/ns/shacl#targetNode> <https://example.test/alice> ; <http://www.w3.org/ns/shacl#property> [ <http://www.w3.org/ns/shacl#path> <https://example.test/name> ; <http://www.w3.org/ns/shacl#minCount> "1"^^<http://www.w3.org/2001/XMLSchema#integer> ] .',options);
const data=umf.importRdfTurtle('',{...options,id:'browser-data'});
const report=await umf.proposeShaclEngineValidation(shapes,data,{id:'browser-report',blankNodePolicy:'disjoint-inputs'});
check(report.status==='evaluated'&&report.engineConforms===false&&report.report,'SHACL actual count violation');
const ontology=umf.importOwlTurtle('<https://example.test/ontology> a <http://www.w3.org/2002/07/owl#Ontology> .',{...options,id:'browser-owl'});
check(umf.getOwlOntologyHeaders(ontology).length===1,'OWL ontology view');
const avro=umf.importAvroSchema('{"type":"record","name":"Person","fields":[{"name":"name","type":"string"}]}',{id:'browser-avro'});
check(umf.getAvroFieldMetadata(avro).length===1,'Avro derived field metadata');
const avroEdited=umf.editAvroNode(avro,'/fields/0/name','"fullName"');
check(umf.exportAvroSchema(avroEdited).includes('fullName'),'Avro changed-node export');
const jsonld=umf.importJsonLdDocument(JSON.stringify({'@context':{name:'https://schema.org/name'},'@id':'https://example.test/alice',name:'Ada'}),{...options,id:'browser-jsonld'});
const framed=await umf.proposeJsonLdFraming(jsonld,{frame:JSON.stringify({'@context':{name:'https://schema.org/name'},name:{}}),lossPolicy:'report',omitGraph:true});
check(framed.status==='candidate'&&umf.exportJsonLdDocument(framed.candidate).includes('Ada'),'JSON-LD frame with explicit omitGraph');
let refused=false;
try{umf.importRdfNQuads('invalid nquads',{id:'browser-invalid'});}catch(error){refused=error instanceof umf.UmfError&&error.code==='RDF_SYNTAX';}
check(refused,'Public error mapping');
check(typeof process==='undefined'&&typeof Buffer==='undefined','Browser has no Node globals');
window.umfResult={status:'pass',capabilities:['registry','document','rdf-edit','shacl-validation','owl-view','avro-edit','jsonld-frame'],refusal:'RDF_SYNTAX'};
`;
const server=createServer(async(request,response)=>{
 const path=new URL(request.url??'/', 'http://127.0.0.1').pathname;
 if(path==='/'){response.setHeader('content-type','text/html');return response.end('<!doctype html><script type="module" src="/entry.js"></script>');}
 if(path==='/entry.js'){response.setHeader('content-type','text/javascript');return response.end(entry);}
 if(path.startsWith('/sdk/')){
  const file=resolve(sdk,decodeURIComponent(path.slice(5)));
  if(file.startsWith(sdk+sep))try{
   const body=await readFile(file);
   response.setHeader('content-type',file.endsWith('.wasm')?'application/wasm':file.endsWith('.json')?'application/json':'text/javascript');
   return response.end(body);
  }catch{}
 }
 response.writeHead(404);response.end('not found');
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
let browser;
try{
 const address=server.address();assert(address&&typeof address!=='string');
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});
 const page=await browser.newPage();
 const errors=[];const external=[];
 page.on('pageerror',error=>errors.push(String(error)));
 await page.route('**/*',route=>{const url=new URL(route.request().url());if(url.hostname!=='127.0.0.1'){external.push(url.href);return route.abort();}return route.continue();});
 await page.goto('http://127.0.0.1:'+address.port+'/');
 await Promise.race([page.waitForFunction(()=>window.umfResult,undefined,{timeout:120000}),new Promise((_,reject)=>page.once('pageerror',reject))]);
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 const result=await page.evaluate(()=>window.umfResult);assert.equal(result.status,'pass');
 console.log(JSON.stringify({browser:browser.version(),...result}));
}finally{try{await browser?.close();}finally{await new Promise(done=>server.close(done));}}
