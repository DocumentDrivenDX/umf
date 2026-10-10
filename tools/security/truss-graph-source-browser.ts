import {chromium} from 'playwright';
import {createHash} from 'node:crypto';
const receipt='docs/helix/04-build/evidence/security/truss-graph-native-stage.json';
const native=await Bun.file(receipt).json();
const source='/Users/erik/Projects/truss/packages/postgresql/src/security-graph-source.ts';
const conditionSource='/Users/erik/Projects/truss/packages/postgresql/src/security-candidate-condition.ts';
const paths=[receipt,source,conditionSource,'/Users/erik/Projects/truss/packages/postgresql/src/security-candidate-endpoint.ts','tools/security/truss-graph-source-browser.ts'];
const digest=async(path:string)=>createHash('sha256').update(new Uint8Array(await Bun.file(path).arrayBuffer())).digest('hex');
for(const [path,hash] of Object.entries(native.sourceDigests))if(await digest(path)!==hash)throw Error('Stale native graph source');
const pins=Object.fromEntries(await Promise.all(paths.map(async path=>[path,await digest(path)])));
const build=await Bun.build({entrypoints:[conditionSource],target:'browser',format:'esm',plugins:[{name:'graph-condition-browser-entry',setup(builder){builder.onLoad({filter:/security-candidate-condition\.ts$/},async args=>({contents:await Bun.file(args.path).text()+"\nexport {createCandidateGraphSource,createCandidateGraphEndpointKeys,requireCandidateGraphSource} from './security-graph-source';\n",loader:'ts'}));}}]});if(!build.success)throw Error('Graph source browser build failed');
const js=await build.outputs[0]!.text();
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){return new URL(request.url).pathname==='/source.js'?new Response(js,{headers:{'content-type':'text/javascript'}}):new Response('<!doctype html><title>Candidate graph source</title>');}});
let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:Bun.env.UMF_CHROMIUM_PATH});const page=await browser.newPage();let external=0;
 await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():(external++,route.abort()));await page.goto(`http://127.0.0.1:${server.port}`);
 const observed=await page.evaluate(async(packet)=>{
  const url='/source.js',module=await import(url),input=structuredClone(packet.input),source=module.createCandidateGraphSource(input);
  const rejected=(run:()=>unknown)=>{try{run();return false;}catch{return true;}};
  let getters=0,iterations=0,lengthReads=0;const getter=structuredClone(input),iterated=structuredClone(input);
  Object.defineProperty(getter.fields[0],'scalar',{enumerable:true,get(){getters++;return 'boolean';}});
  Object.defineProperty(iterated.fields,Symbol.iterator,{value:function*(){iterations++;yield iterated.fields[0];}});
  const proxyInput=structuredClone(input);proxyInput.fields=new Proxy(proxyInput.fields,{get(target,key,receiver){if(key==='length')return ++lengthReads<=3?2:257;return Reflect.get(target,key,receiver);},getOwnPropertyDescriptor(target,key){const own=Reflect.getOwnPropertyDescriptor(target,key);if(own)return own;if(typeof key==='string'&&/^[0-9]+$/.test(key))return {configurable:true,enumerable:true,writable:true,value:{propertyId:String(BigInt(key)+1n),column:'field_'+key,scalar:'boolean'}};return own;}});const proxySource=module.createCandidateGraphSource(proxyInput);
  const keyed=module.createCandidateGraphEndpointKeys({source,sourceKey:packet.keys.sourceKey,targetKey:packet.keys.targetKey});
  const opaque=module.createCandidateGraphSource(packet.opaque.input),opaqueKeyed=module.createCandidateGraphEndpointKeys({source:opaque,sourceKey:packet.keys.sourceKey,targetKey:packet.keys.targetKey});
  const rows=[{id:'native-executed-source-correspondence',expected:packet.source,observed:source},
   {id:'native-opaque-source-correspondence',expected:packet.opaque.source,observed:opaque},
   {id:'native-opaque-key-source-correspondence',expected:packet.opaque.keySource,observed:opaqueKeyed},
   {id:'opaque-invented-properties-refusal',expected:true,observed:rejected(()=>module.createCandidateGraphSource({...packet.opaque.input,fields:input.fields}))},
   {id:'opaque-object-owner-refusal',expected:true,observed:rejected(()=>module.createCandidateGraphSource({...packet.opaque.input,kind:'object'}))},
   {id:'opaque-nonnull-empty-owner-refusal',expected:true,observed:rejected(()=>module.createCandidateGraphSource({...packet.opaque.input,propertyOwnerTypeId:input.propertyOwnerTypeId}))},
   {id:'native-endpoint-key-source-correspondence',expected:packet.keys.source,observed:keyed},
   {id:'endpoint-key-copied-source-refusal',expected:true,observed:rejected(()=>module.createCandidateGraphEndpointKeys({source:{...source},sourceKey:packet.keys.sourceKey,targetKey:packet.keys.targetKey}))},
   {id:'endpoint-key-invalid-namespace-refusal',expected:true,observed:rejected(()=>module.createCandidateGraphEndpointKeys({source,sourceKey:{...packet.keys.sourceKey,namespaceHex:'GG'},targetKey:packet.keys.targetKey}))},
   {id:'captured-array-proxy-length',expected:{matches:true,calls:0},observed:{matches:JSON.stringify(proxySource)===JSON.stringify(source),calls:lengthReads}},
   {id:'copied-source-refusal',expected:true,observed:rejected(()=>module.requireCandidateGraphSource({...source}))},
   {id:'metadata-accessor-refusal',expected:{refused:true,calls:0},observed:{refused:rejected(()=>module.createCandidateGraphSource(getter)),calls:getters}},
   {id:'collection-iterator-refusal',expected:{refused:true,calls:0},observed:{refused:rejected(()=>module.createCandidateGraphSource(iterated)),calls:iterations}},
   {id:'native-int4-overflow-refusal',expected:true,observed:rejected(()=>module.createCandidateGraphSource({...input,typeId:'2147483648'}))},
   {id:'object-owner-mismatch-refusal',expected:true,observed:rejected(()=>module.createCandidateGraphSource({...input,kind:'object'}))}];
  const association={documentId:packet.modelId,moduleId:'m',relationshipId:'BareWorksOn'},exists={exists:{slot:0,association,witness:'opaqueExistential',condition:{literal:true}}};
  const invalid=module.createCandidateGraphSource({...packet.opaque.input,typeId:input.typeId});
  const cases=[['empty-exists',opaqueKeyed,exists],['empty-negated',opaqueKeyed,{not:exists}],['invalid-negated',invalid,{not:exists}],['invalid-true-sibling',invalid,{or:[{literal:true},exists]}],['staged-exists',opaqueKeyed,exists],['rollback-exists',opaqueKeyed,exists]] as const;
  for(const [id,bound,condition] of cases)rows.push({id:'native-condition-'+id,expected:packet.conditionPrograms[id],observed:module.lowerCandidateSecurityCondition({condition,scans:[{association,home:{source:bound},endpoints:[]}]})});
  const reference=(elementId:string)=>({documentId:packet.modelId,moduleId:'m',elementId});
  const compiled=module.lowerCandidateSecurityCondition({condition:packet.originalGraphCondition.rules[0].condition,scans:[{association,home:{source:opaqueKeyed},endpoints:[{association,role:'staff',target:reference('Employee'),keyId:'code-key',targetKeyFields:[reference('Employee-code')],carrier:{incidence:{side:'source'}},columns:['source_key_hex']},{association,role:'project',target:reference('Project'),keyId:'code-key',targetKeyFields:[reference('Project-code')],carrier:{incidence:{side:'target'}},columns:['target_key_hex']}]}],subject:{target:reference('Employee'),keyId:'code-key',keyFields:[reference('Employee-code')],parameters:[1]},resource:{target:reference('Project'),keyId:'code-key',keyFields:[reference('Project-code')],parameters:[2]}});
  rows.push({id:'original-compiler-native-condition-parity',expected:packet.originalGraphCondition.sql,observed:compiled});
  return rows;
 },{...native.candidateEdgeSource,keys:native.candidateEndpointKeySource,opaque:native.candidateOpaqueSource,modelId:native.originalModel.id,conditionPrograms:native.candidateConditionPrograms,originalGraphCondition:native.originalGraphCondition});
 if(observed.length!==22||external||observed.some(row=>JSON.stringify(row.expected)!==JSON.stringify(row.observed)))throw Error('Graph source browser mismatch');
 for(const [path,hash] of Object.entries(pins))if(await digest(path)!==hash)throw Error('Graph source changed during browser run');
 await Bun.write('docs/helix/04-build/evidence/security/truss-graph-source-browser.json',JSON.stringify({status:'passed-candidate-source-correspondence',freshNativeExecution:false,nativeImplementationQualified:false,browser:await browser.version(),externalRequests:external,sourceDigests:pins,observations:observed,scope:'Actual portable candidate source and endpoint-key constructors in Chromium compared with retained native-executed graph projection/validity SQL. Condition SQL parity covers six authored diagnostics, not original compiler graph admission. No new native execution, business-key completeness, original issuer/authority, stable cut or ordinary backend acceptance.'},null,2)+'\n');
 console.log(JSON.stringify({status:'passed',checks:22,browser:await browser.version()}));
}finally{await browser?.close();server.stop(true);}
