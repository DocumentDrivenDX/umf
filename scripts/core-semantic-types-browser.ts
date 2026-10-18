// @covers US-090-AC6
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {CURRENT_CORE_VERSION} from '../src/model/types';
import {semanticTypesCases,semanticTypesFixture} from './core-semantic-types-cases';
import {validateDocument} from '../src/validation/document';
const cases=semanticTypesCases().map(row=>({...row,expected:validateDocument(row.document)}));
const fixture=semanticTypesFixture();
const bundle=await Bun.file('dist/umf.js').text();
const server=Bun.serve({port:0,hostname:'127.0.0.1',fetch(request){
 const path=new URL(request.url).pathname;
 if(path==='/umf.js')return new Response(bundle,{headers:{'content-type':'text/javascript'}});
 if(path==='/cases')return Response.json({cases,fixture});
 return new Response('<!doctype html><html><body>Core semantic types</body></html>',{headers:{'content-type':'text/html'}});
}});
let browser;
try {
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});
 const page=await browser.newPage(),externalRequests:string[]=[];
 await page.route('**/*',route=>{if(!route.request().url().startsWith(`http://127.0.0.1:${server.port}/`)){externalRequests.push(route.request().url());return route.abort();}return route.continue();});
 await page.goto(`http://127.0.0.1:${server.port}/`);
 const result=await page.evaluate(async(currentCore:string)=>{
  const url='/umf.js',u=await import(url),{cases,fixture}=await(await fetch('/cases')).json();
  const checks:string[]=[];
  const canonical=(v:any):string=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v!==null&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
  const same=(a:any,b:any,name:string)=>{if(canonical(a)!==canonical(b))throw Error(name);checks.push(name);};
  const refuses=(fn:()=>unknown,name:string)=>{let rejected=false;try{fn();}catch{rejected=true;}if(!rejected)throw Error(name);checks.push(name);};
  for(const row of cases){same(u.validateDocument(row.document),row.expected,'validation:'+row.id);if(row.expected.valid!==row.valid)throw Error('Authored expected mismatch '+row.id);}
  const identity={module:'contacts',element:'email'},refs=u.getCoreSemanticTypes(fixture,identity),ref=u.copyJson(refs[0]);
  refs[0].term='changed';same(u.getCoreSemanticTypes(fixture,identity)[0].term,'email','copied-access');
  const declaration=u.declareCoreSemanticTypes(fixture,identity,[{vocabulary:'example.new',version:'2.0.0',term:'email'}]);
  same(u.verifyCoreSemanticTypeDeclaration(declaration,declaration.target),declaration,'declaration-verification');
  same(u.getCoreSemanticTypes(fixture,identity)[0].term,'email','authoring-source-isolation');
  const cleared=u.declareCoreSemanticTypes(declaration.target,identity,null).target;same(u.inspectCoreSemanticTypes(cleared,identity).meaning.state,'missing','clear');
  const stale=u.copyJson(declaration.target);stale.modules[0].elements[0].extensions['future.native'].changed=true;refuses(()=>u.verifyCoreSemanticTypeDeclaration(declaration,stale),'stale-declaration');
  const forged=u.copyJson(declaration);forged.provenance.path='/forged';refuses(()=>u.verifyCoreSemanticTypeDeclaration(forged,declaration.target),'forged-declaration');
  refuses(()=>u.declareCoreSemanticTypes(fixture,{module:'contacts',element:'provider'},null),'unknown-qualifier-removal');
  const registry=new u.SemanticTypeRegistry().register(ref,{},(value:unknown)=>({status:value==='accepted'?'valid':'invalid',complete:true,issues:[]}));
  same(u.validateCoreSemanticTypeValue(fixture,identity,'accepted',registry).status,'valid','explicit-validator');
  same(u.validateCoreSemanticTypeValue(fixture,identity,null,registry).status,'invalid','null-validator');
  same(registry.check({...ref,version:'missing'},'accepted').status,'unknown','no-version-fallback');
  same(registry.check({...ref,future:true},'accepted').complete,false,'unknown-qualifier-incomplete');
  const retired=u.copyJson(fixture);retired.umf='0.9.0';
  refuses(()=>u.inspectCoreSemanticTypes(retired,identity),'retired-core-refusal');
  const selection=u.selectCoreElements(fixture,{references:'transitive',identities:[identity]});same(selection.selection.length,1,'external-reference-not-traversed');same(selection.source,fixture,'selection-source-copy');
  for(const format of ['json','yaml']){
   same(u.readDocument(u.writeDocument(fixture,format),format),fixture,'document:'+format);
   const authored=u.readJsonValue(u.writeJsonValue(declaration,format),format);same(u.verifyCoreSemanticTypeDeclaration(authored,authored.target),declaration,'declaration:'+format);
   const selected=u.readJsonValue(u.writeJsonValue(selection,format),format);same(selected,selection,'selection:'+format);
  }
  let invoked=false;const getter=u.copyJson(fixture);Object.defineProperty(getter.modules[0].elements[0],'semanticTypes',{enumerable:true,get(){invoked=true;return [ref];}});same(u.validateDocument(getter).valid,false,'getter-refusal');same(invoked,false,'getter-not-invoked');
  const exact={umf:currentCore,id:'exact-browser',vocabularies:{},modules:[{id:'exact',namespace:'example',elements:[
   {id:'uuid',kind:'field',scalarType:'uuid',nullability:'required',cardinality:'one',examples:[{uuid:'01234567-89ab-cdef-8123-456789abcdef'}],extensions:{}},
   {id:'bits',kind:'field',scalarType:'bits128',examples:[{bits128Hex:'ffffffffffffffffffffffffffffffff'}],extensions:{}}
  ]}]};
  const exactIdentity={module:'exact',element:'uuid'};
  const composed=u.declareCoreSemanticTypes(exact,exactIdentity,[ref]).target;
  same(u.validateDocument(composed).valid,true,'uuid-bits-composition');
  same(u.selectCoreElements(composed,{references:'none',scalarTypes:['uuid','bits128']}).selection.length,2,'uuid-bits-selection');
  const bad=u.copyJson(composed);bad.modules[0].elements[0].examples=[{uuid:'invalid'}];same(u.validateDocument(bad).valid,false,'uuid-invalid-retained');
  for(const format of ['json','yaml'])same(u.readDocument(u.writeDocument(composed,format),format),composed,'uuid-composed:'+format);
  return {cases:cases.length,checks};
 },CURRENT_CORE_VERSION);
 if(externalRequests.length)throw Error('Unexpected external requests');
 const record={scope:'Core 0.10.0 public bundle authored API and Bun/browser validation parity; no publisher domain/native equivalence claim',browser:browser.version(),...result,externalRequests,sha256:{'dist/umf.js':createHash('sha256').update(bundle).digest('hex'),'fixtures/core/semantic-types.json':createHash('sha256').update(new Uint8Array(await Bun.file('fixtures/core/semantic-types.json').arrayBuffer())).digest('hex')}};
 await Bun.write('fixtures/validation/core-semantic-types-browser.json',JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify({browser:record.browser,cases:record.cases,checks:record.checks.length,externalRequests}));
}finally{await browser?.close();server.stop(true);}
