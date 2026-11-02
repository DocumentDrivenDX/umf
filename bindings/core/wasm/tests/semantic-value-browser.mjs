import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve, sep} from 'node:path';
import {chromium} from 'playwright';
const repoRoot=resolve(import.meta.dir,'../../../..');
const root=process.env.UMF_SEMANTIC_VALUE_WASM_PACKAGE;
if(!root) throw new Error('Set UMF_SEMANTIC_VALUE_WASM_PACKAGE to the built wasm-bindgen package directory');
const frozenPath=resolve(repoRoot,'tests/rust-core/fixtures/r5-semantic-value/frozen-typescript.json');
const resourceFiles={coreSchema:'spec/core/schema.json',referenceSchema:'spec/core/semantic-type-reference.schema.json',packageSchema:'spec/core/extension-package.schema.json',constraints:'spec/metamodel/generated/core-constraints.json',domainPolicy:'spec/metamodel/generated/domain-policy.json'};
const resources=Object.fromEntries(await Promise.all(Object.entries(resourceFiles).map(async([key,path])=>[key,JSON.parse(await readFile(resolve(repoRoot,path),'utf8'))])));
const server=createServer(async (req,res)=>{
 const path=new URL(req.url??'/', 'http://127.0.0.1').pathname;
 if(path==='/'){res.writeHead(200,{'content-type':'text/html'});res.end('<!doctype html>');return;}
 if(path==='/frozen.json'){res.writeHead(200,{'content-type':'application/json'});res.end(await readFile(frozenPath));return;}
 if(path==='/resources.json'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(resources));return;}
 const local=resolve(root,`.${decodeURIComponent(path)}`);
 if(!local.startsWith(root+sep)){res.writeHead(403);res.end();return;}
 try{const bytes=await readFile(local);res.writeHead(200,{'content-type':local.endsWith('.wasm')?'application/wasm':local.endsWith('.js')?'text/javascript':'application/octet-stream'});res.end(bytes);}catch{res.writeHead(404);res.end('missing');}
});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));const port=server.address().port;
let browser;
try{
 browser=await chromium.launch({headless:true,timeout:30000});const page=await browser.newPage();
 await page.goto(`http://127.0.0.1:${port}/`);
 const result=await page.evaluate(async()=>{
  const wrapper=await import('/index.js');const wasm=await import('/pkg/umf_core_wasm.js');await wasm.default();
  const ref=term=>({vocabulary:'example.contact',version:'1.0.0',term});
  const registry=wrapper.createSemanticTypeRegistry(wasm);
  registry.register(ref('valid'),{},()=>({status:'valid',complete:true,issues:[]}));
  registry.register(ref('invalid'),{},()=>({status:'invalid',complete:true,issues:['bad']}));
  registry.register(ref('throws'),{},()=>{throw new Error('validator broke')});
  registry.register(ref('throws-empty'),{},()=>{throw new Error('')});
  registry.register(ref('throws-utf16'),{},()=>{throw new Error('bad \ud800')});
  registry.register(ref('throws-non-error'),{},()=>{throw {message:'ignored'}});
  registry.register(ref('malformed'),{},()=>()=>{});
  registry.register(ref('extra'),{},()=>({status:'valid',complete:true,issues:[],extra:true}));
  registry.register(ref('unknown-complete'),{},()=>({status:'unknown',complete:true,issues:[]}));
  registry.register(ref('isolation'),{nested:{name:'before'}},(v,d)=>{v.changed=true;d.nested.name='after';return {status:'valid',complete:true,issues:[]};});
  const cases={
   valid:registry.check(ref('valid'),null), invalid:registry.check(ref('invalid'),null),
   unknown_missing_term:registry.check(ref('absent'),null),unknown_missing_validator:(()=>{registry.register(ref('no-validator'),{});return registry.check(ref('no-validator'),null)})(),
   unknown_qualifier:registry.check({...ref('valid'),future:{kept:true}},null),
   throw_error:registry.check(ref('throws'),null),throw_empty_error:registry.check(ref('throws-empty'),null),throw_utf16_error:registry.check(ref('throws-utf16'),null),throw_non_error:registry.check(ref('throws-non-error'),null),
   malformed_non_json_return:registry.check(ref('malformed'),null),malformed_extra_field:registry.check(ref('extra'),null),malformed_unknown_complete:registry.check(ref('unknown-complete'),null),
   input_definition_isolation:registry.check(ref('isolation'),{a:1}),lookup_after_callback:registry.lookup(ref('isolation')),
  };
  const frozen=await (await fetch('/frozen.json')).json();
  const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  const mismatches=[];for(const [key,value] of Object.entries(cases)){const expected=key==='lookup_after_callback'?frozen.cases.direct[key]:frozen.cases.direct[key].value;if(!equal(value,expected))mismatches.push({key,actual:value,expected});}
  const capture=fn=>{try{return {ok:true,value:fn()};}catch(error){return {ok:false,error:{code:error.code??'',message:error.message??String(error),path:error.path??''}};}};
  const registrationCases={};
  const copy={nested:{term:'before'}};const copyRegistry=wrapper.createSemanticTypeRegistry(wasm).register(ref('registration-copy'),copy);copy.nested.term='mutated';const found=copyRegistry.lookup(ref('registration-copy'));if(found)found.nested.term='returned-copy-mutated';registrationCases.copy_and_lookup=capture(()=>copyRegistry.lookup(ref('registration-copy')));
  registrationCases.lookup_missing=capture(()=>wrapper.createSemanticTypeRegistry(wasm).lookup(ref('registration-absent'))===undefined?{$undefined:true}:null);
  registrationCases.duplicate=capture(()=>wrapper.createSemanticTypeRegistry(wasm).register(ref('duplicate'),{}).register(ref('duplicate'),{}));
  registrationCases.malformed_empty_term=capture(()=>wrapper.createSemanticTypeRegistry(wasm).register({...ref('bad'),term:''},{}));
  registrationCases.malformed_non_string_version=capture(()=>wrapper.createSemanticTypeRegistry(wasm).register({...ref('bad'),version:42},{}));
  registrationCases.unknown_identity_qualifier=capture(()=>wrapper.createSemanticTypeRegistry(wasm).register({...ref('bad'),future:true},{}));
  registrationCases.non_object_definition=capture(()=>wrapper.createSemanticTypeRegistry(wasm).register(ref('bad-definition'),[]));
  registrationCases.non_function_validator=capture(()=>wrapper.createSemanticTypeRegistry(wasm).register(ref('bad-validator'),{},42));
  registrationCases.non_function_precedes_duplicate=capture(()=>wrapper.createSemanticTypeRegistry(wasm).register(ref('ordered-validator'),{}).register(ref('ordered-validator'),{},42));
  registrationCases.definition_precedes_non_function=capture(()=>wrapper.createSemanticTypeRegistry(wasm).register(ref('bad-definition-order'),[],42));
  for(const [key,value] of Object.entries(registrationCases)){const expected=frozen.cases.registration[key];if(!equal(value,expected))mismatches.push({key:`registration.${key}`,actual:value,expected});}
  const resources=await (await fetch('/resources.json')).json();const identity={module:'m',element:'e'};
  const aggregate=[];
  const makeAggregateRegistry=()=>wrapper.createSemanticTypeRegistry(wasm)
    .register(ref('one'),{n:1},()=>({status:'valid',complete:true,issues:['one-valid']}))
    .register(ref('two'),{n:2},()=>({status:'invalid',complete:true,issues:['two-invalid']}))
    .register(ref('three'),{n:3},()=>({status:'unknown',complete:false,issues:['three-unknown']}));
  const orderedSource=frozen.cases.aggregate.order_and_invalid_dominates.value.source;
  aggregate.push(['order_and_invalid_dominates',capture(()=>makeAggregateRegistry().validateCoreSemanticTypeValue(resources,orderedSource,identity,null))]);
  aggregate.push(['absent_declaration',capture(()=>wrapper.createSemanticTypeRegistry(wasm).validateCoreSemanticTypeValue(resources,frozen.cases.aggregate.absent_declaration.value.source,identity,null))]);
  aggregate.push(['unknown_dominates_valid',capture(()=>wrapper.createSemanticTypeRegistry(wasm).register(ref('one'),{},()=>({status:'valid',complete:true,issues:[]})).validateCoreSemanticTypeValue(resources,frozen.cases.aggregate.unknown_dominates_valid.value.source,identity,'x'))]);
  const malformed=structuredClone(orderedSource);malformed.modules[0].elements[0].semanticTypes=[];let refusalCallbackCount=0;
  aggregate.push(['document_refusal_precedes_callback',capture(()=>wrapper.createSemanticTypeRegistry(wasm).register(ref('one'),{},()=>{refusalCallbackCount++;return {status:'valid',complete:true,issues:[]};}).validateCoreSemanticTypeValue(resources,malformed,identity,'x'))]);
  aggregate.push(['document_refusal_callback_count',refusalCallbackCount]);
  for(const [key,actual] of aggregate){const expected=frozen.cases.aggregate[key];if(!equal(actual,expected))mismatches.push({key:`aggregate.${key}`,actual,expected});}
  const workRegistry=wrapper.createSemanticTypeRegistry(wasm).register(ref('work'),{},(_v,_d,{reportWork})=>{reportWork(1);reportWork(2);return {status:'valid',complete:true,issues:[]};});
  const repeatedWork=workRegistry.check(ref('work'),null);
  const invalidReports=[];
  for(const [term,amount] of [['negative',-1],['fractional',1.5],['unsafe',Number.MAX_SAFE_INTEGER+1]]){
   const registry=wrapper.createSemanticTypeRegistry(wasm).register(ref(`work-${term}`),{},(_v,_d,{reportWork})=>{reportWork(amount);return {status:'valid',complete:true,issues:[]};});
   let code='';try{registry.check(ref(`work-${term}`),null);}catch(error){code=error.code??'';}invalidReports.push(code);
  }
  if(!equal(repeatedWork,frozen.cases.work.valid_repeated.value)||invalidReports.some(code=>code!=='HOST_CONTROL'))mismatches.push({key:'work',repeatedWork,invalidReports});
  const freshWasm=await import('/pkg/umf_core_wasm.js?semantic-initializer');let initializerCalls=0;
  const initialized=await wrapper.initializeSemanticValueWasm(async()=>({...freshWasm,default:async()=>{initializerCalls++;return freshWasm.default();}}),{WebAssembly:globalThis.WebAssembly});
  const initializedResult=initialized.register(ref('initialized'),{},()=>({status:'valid',complete:true,issues:[]})).check(ref('initialized'),null);
  if(initializerCalls!==1||initializedResult.status!=='valid')mismatches.push({key:'initializer',initializerCalls,initializedResult});
  const {encodeWire,fromWire}=await import('/src/wire.js');
  const req={op:'registry/check',entries:[{reference:ref('boundary'),definition:{},validatorPresent:true,validatorIsFunction:true,validatorToken:1}],reference:ref('boundary'),value:null};
  const chunks=[];const work=4_294_967_296+19;
  const response=JSON.parse(wasm.executeSemanticValueWire(encodeWire(req),(token,request)=>encodeWire({status:'returned',result:{status:'valid',complete:true,issues:[]},reportedWork:work}),amount=>{chunks.push(amount);return '';}));
  const result=fromWire(JSON.parse(response.wire));
  if(result.status!=='valid'||!chunks.includes(4_294_967_295)||!chunks.includes(20))mismatches.push({key:'u64-boundary',chunks,result});
  const bad=JSON.parse(wasm.executeSemanticValueWire(encodeWire(req),()=>{throw new Error('secret dispatcher exception');}));
  const badValue=fromWire(JSON.parse(bad.wire));if(badValue.status!=='unknown'||JSON.stringify(badValue).includes('secret dispatcher'))mismatches.push({key:'dispatcher-exception',badValue});
  let controlCode='';const controlled=JSON.parse(wasm.executeSemanticValueWire(encodeWire(req),()=>encodeWire({status:'returned',result:{status:'valid',complete:true,issues:[]},reportedWork:1}),()=>{throw new Error('secret control');}));
  if(controlled.status!=='error'||JSON.stringify(controlled).includes('secret control'))mismatches.push({key:'control-exception',controlled});else controlCode=controlled.code;
  if(mismatches.length)throw new Error(JSON.stringify(mismatches));
  return {browser: 'Chromium', cases:{direct:Object.keys(cases).length,registration:Object.keys(registrationCases).length,aggregate:aggregate.length}, frozenProfile:frozen.schema, u64Work:{reported:work,limitChunkSeen:chunks.includes(4_294_967_295),remainderSeen:chunks.includes(20)}, work:{repeated:'pass',invalidReports:invalidReports.length}, initializer:{calls:initializerCalls,status:initializedResult.status}, dispatcherException:'generic unknown', controlException:controlCode};
 });
 console.log(JSON.stringify({status:'pass',browserVersion:browser.version(),...result}));
}catch(e){console.error(e);process.exitCode=1;}finally{await browser?.close();server.close();}
