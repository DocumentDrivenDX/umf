import {chromium} from 'playwright';
import {createHash} from 'node:crypto';
const source='/Users/erik/Projects/truss/packages/postgresql/src/security-graph-locator.ts';
const files=[source,'tools/security/truss-graph-locator-browser.ts','/Users/erik/Projects/truss/tests/security-graph-locator.test.ts'];
const hash=async(p:string)=>createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex');
const sourceDigests=Object.fromEntries(await Promise.all(files.map(async p=>[p,await hash(p)])));
const build=await Bun.build({entrypoints:[source],target:'browser',format:'esm'});if(!build.success)throw Error('Graph locator browser build failed');
const js=await build.outputs[0]!.text();
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(req){return new URL(req.url).pathname==='/locator.js'?new Response(js,{headers:{'content-type':'text/javascript'}}):new Response('<!doctype html><title>Graph locator</title>');}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(Bun.env.UMF_CHROMIUM_PATH?{executablePath:Bun.env.UMF_CHROMIUM_PATH}:{})});
 const page=await browser.newPage();let externalRequests=0;
 await page.route('**/*',route=>{if(new URL(route.request().url()).hostname!=='127.0.0.1'){externalRequests++;return route.abort();}return route.continue();});
 await page.goto(`http://127.0.0.1:${server.port}`);
 const result=await page.evaluate(async()=>{
  const url='/locator.js',{projectSecurityGraphEndpoints:project,projectDeclaredSecurityGraphEndpoints:declaredProject}=await import(url);
  const original=()=>({objects:[{id:'9007199254740993',typeId:'1'},{id:'9007199254740993',typeId:'2'}],edges:[{id:'10',relationshipId:'3',sourceId:'9007199254740993',sourceType:'1',targetId:'9007199254740993',targetType:'2'}]});
  const observations:{id:string;expected:unknown;observed:unknown}[]=[];
  const add=(id:string,expected:unknown,observed:unknown)=>observations.push({id,expected,observed});
  add('typed-original-endpoints',[{id:'10',relationshipId:'3',source:{id:'9007199254740993',typeId:'1'},target:{id:'9007199254740993',typeId:'2'}}],project(original()));
  const parallel=original();parallel.edges.push({...parallel.edges[0]!,id:'11'});add('parallel-edge-identities',['10','11'],project(parallel).map((edge:any)=>edge.id));
  const direction=original();direction.edges[0]!.sourceType='2';direction.edges[0]!.targetType='1';add('directed-role-order',['2','1'],[project(direction)[0].source.typeId,project(direction)[0].target.typeId]);
  const refuse=(value:unknown)=>{try{project(value);return false;}catch(e){return e instanceof Error&&e.message==='TRUSS_SECURITY_GRAPH_LOCATOR_UNSUPPORTED';}};
  for(const [name,value] of [['overflow','9223372036854775808'],['rounded-number',9007199254740992],['noncanonical','01'],['negative-zero','-0']] as const){const input:any=original();input.objects[0].id=value;add(name,true,refuse(input));}
  const unresolved=original();unresolved.objects.pop();add('unresolved-full-tuple',true,refuse(unresolved));
  const duplicateObject=original();duplicateObject.objects.push({...duplicateObject.objects[0]!});add('duplicate-object',true,refuse(duplicateObject));
  const duplicateEdge=original();duplicateEdge.edges.push({...duplicateEdge.edges[0]!});add('duplicate-edge-id',true,refuse(duplicateEdge));
  let getterCalls=0;const accessor=original();Object.defineProperty(accessor.objects[0],'id',{enumerable:true,get(){getterCalls++;return '1';}});add('accessor-refusal',true,refuse(accessor));add('accessor-not-executed',0,getterCalls);
  const mutable=original(),captured=project(mutable);mutable.objects[0]!.typeId='2';add('owned-typed-projection','1',captured[0].source.typeId);add('frozen-projection',true,Object.isFrozen(captured)&&Object.isFrozen(captured[0])&&Object.isFrozen(captured[0].source));
  for(const side of ['objects','edges'] as const){
   const custom=original();let calls=0;Object.defineProperty(custom[side],Symbol.iterator,{value:function*(){calls++;while(true)yield {};}});add(side+'-custom-iterator-refuses',true,refuse(custom));add(side+'-iterator-not-invoked',0,calls);
   const sparse=original();delete sparse[side][0];add(side+'-sparse-refuses',true,refuse(sparse));
  }
  add('object-limit-admitted',0,project({objects:Array.from({length:4096},(_,i)=>({id:String(i),typeId:'1'})),edges:[]}).length);
  add('object-over-limit-refuses',true,refuse({objects:Array(4097).fill({id:'1',typeId:'1'}),edges:[]}));
  const edgeLimit=original();edgeLimit.edges=Array.from({length:4096},(_,i)=>({...edgeLimit.edges[0]!,id:String(i)}));add('edge-limit-admitted',4096,project(edgeLimit).length);edgeLimit.edges.push({...edgeLimit.edges[0]!,id:'4096'});add('edge-over-limit-refuses',true,refuse(edgeLimit));
  add('absent-input-refuses',true,refuse(null));
  const declared=()=>({...original(),declarations:[{relationshipId:'3',sourceType:'1',targetType:'2'}],selectedRelationshipId:'3'});
  const declaredRefuses=(input:unknown)=>{try{declaredProject(input);return false;}catch(e){return e instanceof Error&&e.message==='TRUSS_SECURITY_GRAPH_LOCATOR_UNSUPPORTED';}};
  const multi=declared();multi.declarations.push({relationshipId:'4',sourceType:'1',targetType:'2'});multi.edges.push({...multi.edges[0]!,id:'11',relationshipId:'4'});add('selected-declared-relationship',['10'],declaredProject(multi).map((edge:any)=>edge.id));multi.selectedRelationshipId='4';add('independent-foreign-relationship',['11'],declaredProject(multi).map((edge:any)=>edge.id));
  const empty=declared();empty.edges=[];add('declared-empty-association',[],declaredProject(empty));empty.selectedRelationshipId='4';add('missing-selected-declaration-refuses',true,declaredRefuses(empty));
  const reversed=declared();reversed.edges[0]!.sourceType='2';reversed.edges[0]!.targetType='1';add('undeclared-role-reversal-refuses',true,declaredRefuses(reversed));
  const foreign=declared();foreign.edges[0]!.relationshipId='4';add('undeclared-edge-relationship-refuses',true,declaredRefuses(foreign));
  const duplicate=declared();duplicate.declarations.push({...duplicate.declarations[0]!});add('duplicate-endpoint-declaration-refuses',true,declaredRefuses(duplicate));
  const custom=declared();let declarationCalls=0;Object.defineProperty(custom.declarations,Symbol.iterator,{value:function*(){declarationCalls++;while(true)yield {};}});add('declaration-iterator-refuses',true,declaredRefuses(custom));add('declaration-iterator-not-invoked',0,declarationCalls);
  return {observations,hostGlobals:['Bun','process','Buffer','require'].filter(key=>key in globalThis)};
 });
 if(result.observations.length!==34||new Set(result.observations.map(o=>o.id)).size!==34||result.observations.some(o=>JSON.stringify(o.expected)!==JSON.stringify(o.observed))||externalRequests||result.hostGlobals.length)throw Error('Graph locator browser mismatch');
 for(const [p,h] of Object.entries(sourceDigests))if(await hash(p)!==h)throw Error('Graph locator source changed');
 const receipt={status:'passed',covers:['US-056-AC2'],sourceDigests,browser:browser.version(),...result,externalRequests,scope:'Actual Chromium execution of private portable native-locator validation and typed endpoint projection. Independently stated expected tuples/refusals, exact TEXT native carriers and parallel edge identities. No database execution, original row/catalog authority, business-key/codec resolution, complete graph facts, policy decision or backend acceptance.'};
 await Bun.write('docs/helix/04-build/evidence/security/truss-graph-locator-browser.json',JSON.stringify(receipt,null,2)+'\n');
 console.log(JSON.stringify({status:'passed',observations:34,browser:receipt.browser}));
}finally{await browser?.close();server.stop(true);}
