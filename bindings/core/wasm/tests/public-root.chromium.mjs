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
const icebergFixture=JSON.parse(await readFile(new URL('../../../../fixtures/iceberg/upstream/core/src/test/resources/TableMetadataV2ValidMinimal.json',import.meta.url),'utf8'));
icebergFixture.schemas[0].fields.find(field=>field.id===1).type='int';
const actionFixture=JSON.parse(await readFile(new URL('../../../../fixtures/actions/approve.json',import.meta.url),'utf8'));
const deploymentFixture=JSON.parse(await readFile(new URL('../../../../tests/binding/fixtures/table-lifecycle-note.json',import.meta.url),'utf8'));
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
const deltaSource=' { "type":"struct", "fields":[{"name":"id","type":"long","nullable":false,"metadata":{}}] } ';
const delta=umf.importDeltaSchema(deltaSource,{id:'browser-delta'});
check(JSON.stringify(JSON.parse(umf.exportDeltaSchema(delta)))===JSON.stringify(JSON.parse(deltaSource)),'Delta schema export');
const deltaEdit=umf.proposeDeltaNodeEdit(delta,'/fields/0/name','"renamed"');
check(umf.exportDeltaSchema(deltaEdit.document).includes('renamed'),'Delta changed-node export');
const definition={profile:'databricks-managed-delta/0.1',name:['catalog','schema','items'],clusterBy:['id'],partitionBy:[],properties:{}};
const deltaDefined=umf.defineDeltaTable(deltaSource,definition,{id:'browser-ddl'});
check(umf.generateDeltaDDL(deltaDefined).sql.includes('CREATE TABLE \`catalog\`.\`schema\`.\`items\`'),'Delta managed DDL');
const iceberg=umf.importIcebergTable(JSON.stringify(${JSON.stringify(icebergFixture)}),{id:'browser-iceberg-table'});
const icebergRenamed=umf.proposeIcebergTableRename(iceberg,{fieldId:1,nextSchemaId:1,newName:'renamed'});
check(JSON.parse(umf.exportIcebergTable(icebergRenamed.document)).schemas[1].fields[0].name==='renamed','Iceberg table rename');
const typespec=umf.importTypeSpecSources({entrypoint:'main.tsp',files:{'main.tsp':'model Item { id: string; }'}},{id:'browser-typespec'});
const typespecCompilation=await umf.compileTypeSpecDocument(typespec);
check(typespecCompilation.valid&&typespecCompilation.compiler==='@typespec/compiler@1.16.0','TypeSpec pinned compiler');
const typespecGraph=await umf.getTypeSpecSemanticGraph(typespec,{roots:['Item']});
check(typespecGraph.status==='available'&&typespecGraph.nodes.some(node=>node.kind==='Model'&&node.label==='Item'),'TypeSpec compiler graph');
const actionDocument=${JSON.stringify(actionFixture)};
const action=actionDocument.modules[0].extensions['umf.actions'].actions[0];
const actionState={inputs:{order:{key:{module:'sales',element:'order',key:'pk'},components:[{string:'o1'}]}},pre:{frames:{},links:[]}};
const actionRule={language:'umf.actions.rules',version:'1',expression:JSON.stringify({op:'eq',args:[{literal:{integerToken:'1e2'}},{literal:{integerToken:'100'}}]}),references:[]};
check(umf.evaluateActionRule(actionDocument,action,actionRule,'pre',actionState)===true,'Rust action evaluator');
const deployment=umf.compileTableDeployment({text:JSON.stringify(${JSON.stringify(deploymentFixture)}),configuration:{module:'demo',schema:'browser_deployment',ownerRole:'browser_owner',personRole:'browser_person',batchRole:'browser_batch',groupRoles:{readers:'browser_readers'}}});
check(deployment.status==='compiled'&&deployment.bundle.steps.some(step=>step.sql.includes('CREATE TABLE')),'Rust deployment compiler');
check(umf.verifyTableDeployment(deployment.bundle).source.utf8===deployment.bundle.source.utf8,'Rust deployment verification');
const domainRef=elementId=>({documentId:'domain',moduleId:'m',elementId});
const field=(id,scalarType)=>({id,kind:'field',scalarType,cardinality:'one',nullability:'required',extensions:{}});
const protectionClosure={pins:[{documentId:'domain',revision:'schema1'}],documents:[{revision:'schema1',document:{umf:'0.10.0',id:'domain',vocabularies:{},modules:[{id:'m',namespace:'',elements:[field('input','integer'),field('output','string'),field('parameter','integer'),{id:'record',kind:'record',extensions:{}}]}]}}]};
const protectionCatalog={vocabulary:'umf.security.protection',version:'0.1.0',id:'catalog',revision:'c1',transforms:[{id:'transform',version:'t1',kind:'mask',function:'constant',inputDomain:domainRef('input'),outputDomain:domainRef('output'),determinism:'deterministic',reversibility:'none',disclosureProfile:['equality'],queryUse:{join:'disclosed'},parameters:[{name:'value',field:domainRef('output'),value:{string:'hidden'}}]}]};
const protectionPolicy={vocabulary:'umf.security',version:'0.2.0',id:'p',revision:'p1',ontology:{documentId:'ontology',revision:'o1'},protection:{id:'catalog',revision:'c1'},rules:[{id:'permit',effect:'permit',actions:['read'],target:[domainRef('record')],condition:{op:'literal',value:true},disclosure:[{field:domainRef('input'),disposition:{kind:'transformed',vocabulary:'umf.security.protection',transform:'transform',version:'t1',field:domainRef('output')}}]}]};
const protectionQuery=umf.inspectProtectionQueryProperties(protectionPolicy,protectionCatalog,protectionClosure,{ruleIndex:0,disclosureIndex:0,operator:'join',required:['equality']});
check(protectionQuery.status==='compatible-properties','Rust protection query properties');
let refused=false;
try{umf.importRdfNQuads('invalid nquads',{id:'browser-invalid'});}catch(error){refused=error instanceof umf.UmfError&&error.code==='RDF_SYNTAX';}
check(refused,'Public error mapping');
check(typeof process==='undefined'&&typeof Buffer==='undefined','Browser has no Node globals');
window.umfResult={status:'pass',capabilities:['registry','document','rdf-edit','shacl-validation','owl-view','avro-edit','jsonld-frame','delta-edit','delta-ddl','iceberg-table-rename','typespec-compiler-graph','action-rule','deployment','protection-query'],refusal:'RDF_SYNTAX'};
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
 await Promise.race([page.waitForFunction(()=>window.umfResult,undefined,{timeout:180000}),new Promise((_,reject)=>page.once('pageerror',reject))]);
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 const result=await page.evaluate(()=>window.umfResult);assert.equal(result.status,'pass');
 console.log(JSON.stringify({browser:browser.version(),...result}));
}finally{try{await browser?.close();}finally{await new Promise(done=>server.close(done));}}
