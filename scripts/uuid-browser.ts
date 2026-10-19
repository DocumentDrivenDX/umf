// SPDX-License-Identifier: MIT OR Apache-2.0
import {chromium} from 'playwright';
import {createHash} from 'node:crypto';
import oracle from '../fixtures/validation/uuid/bit128-oracle.json';
import {uuidDocument,uuidBinding} from '../tests/helpers/uuid-fixtures';
const bundle=await Bun.file('dist/umf.js').text();
// A separate portable build examines each source import, including a negative control.
async function boundary(entrypoint:string){return Bun.build({entrypoints:[entrypoint],target:'browser',plugins:[{name:'reject-host-imports',setup(build){build.onResolve({filter:/.*/},args=>{if(/^(?:node:|bun:|fs$|path$|child_process$|crypto$)/.test(args.path))throw Error('Forbidden host import: '+args.path);if(/\/src\/model\/(?:bit128|uuid)\.ts$/.test(args.importer.replaceAll('\\','/'))&&!['./types','./bit128'].includes(args.path))throw Error('Forbidden value-codec import: '+args.path);});}}]});}
const portable=await boundary('src/model/uuid.ts');if(!portable.success)throw Error('Portable import boundary failed');
const negative='/tmp/umf-uuid-host-import-control.ts';await Bun.write(negative,"import {readFileSync} from 'node:fs'; export const probe=readFileSync;\n");
async function rejects(entry:string,reason:string){try{const result=await boundary(entry);return !result.success&&result.logs.some(log=>String(log).includes(reason));}catch(error){return (error instanceof AggregateError?error.errors:[error]).some(issue=>String(issue&&typeof issue==='object'&&'message'in issue?issue.message:issue).includes(reason));}}
 const negativeRejected=await rejects(negative,'Forbidden host import');if(!negativeRejected)throw Error('Boundary control did not reject node:fs for the expected reason');
 const layerControl='/tmp/umf-uuid-layer-control/src/model/uuid.ts';await Bun.write(layerControl,"import {Registry} from '../../registry/registry'; export const probe=Registry;\n");
 const layerRejected=await rejects(layerControl,'Forbidden value-codec import');if(!layerRejected)throw Error('Layer boundary did not reject registry import for the expected reason');
const server=Bun.serve({port:0,hostname:'127.0.0.1',fetch(req){return new URL(req.url).pathname==='/umf.js'?new Response(bundle,{headers:{'Content-Type':'text/javascript'}}):new Response('<!doctype html><title>UMF UUID verification</title>',{headers:{'Content-Type':'text/html'}});}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});
 const page=await browser.newPage(),externalRequests:string[]=[];const origin='http://127.0.0.1:'+server.port;
 page.on('request',r=>{if(!r.url().startsWith(origin+'/'))externalRequests.push(r.url());});await page.goto(origin);
 const result=await page.evaluate(async ({cases,doc,binding})=>{
  const path='/umf.js',u=await import(path);let codecChecks=0,keyChecks=0,recoveries=0,refusals=0;
  const assert=(ok:boolean)=>{if(!ok)throw Error('UUID browser assertion');};
  const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
  const refuses=(f:()=>unknown)=>{try{f();}catch{refusals++;return;}throw Error('Required refusal missing');};
  const field={module:'m',element:'value'},key={module:'m',element:'record',key:'id'};
  assert(u.validateDocument(doc).complete);
  for(const row of cases){
   const value=u.parseBits128(row.hex);assert(same(u.bits128ToWords(value,true),row.signed));assert(same(u.bits128ToWords(value,false),row.unsigned));
   assert(u.bits128FromWords(row.signed,true).hex===row.hex);assert(u.bits128FromInteger({integerToken:row.integer},false).hex===row.hex);
   assert(u.uuidToBits128(u.parseUuid(row.uuid.toUpperCase())).hex===row.hex);assert(u.bits128FromBytes(u.bits128ToBytes(value)).hex===row.hex);codecChecks+=6;
   assert(u.encodeCoreKeyTuple(doc,key,[{uuid:row.uuid}],{profile:'umf-key-tuple-v2'}).bytesHex===row.uuidKey);keyChecks++;
  }
  for(const fmt of ['json','yaml']){assert(same(u.readDocument(u.writeDocument(doc,fmt),fmt),doc));recoveries++;}
  const UUID=cases[10]!.uuid;
  assert(u.inspectCoreScalarType(doc,field).meaning.scalarType==='uuid');
  assert(u.declareCoreBit128Field(doc,field,'uuid').modules[0].elements[1].scalarType==='uuid');
  assert(u.selectCoreRelationships(doc,{}).version==='2.0.0');
  const nativeBinding=structuredClone(binding);nativeBinding.extensions['umf.binding'].target={system:'postgresql',version:'17',subset:'uuid-carrier1'};
  const proposal=u.projectBit128CarrierSchema(nativeBinding,doc,field,{lossPolicy:'report',obligations:['bits','ordering']});assert(proposal.status==='reported');assert(same(u.recoverBit128CarrierProjection(proposal,proposal.candidate.text).logical,doc));
  const authored=u.declareCoreSchemaProperties(doc,{scope:'element',...field},{default:{value:{uuid:UUID},on:'missing'},allowedValues:[{uuid:UUID}]});
  assert(u.resolveCoreDefault(authored,field,{state:'missing'}).applied);
  assert(u.validateCoreFieldValue(authored,field,{uuid:UUID.toUpperCase()}).valid);
  refuses(()=>u.declareCoreSchemaProperties(doc,{scope:'element',...field},{allowedValues:[{uuid:UUID},{uuid:UUID.toUpperCase()}]}));
  const receipt=u.encodeCoreKeyTuple(doc,key,[{uuid:UUID}],{profile:'umf-key-tuple-v2'});u.verifyCoreKeyTuple(receipt,doc);
  refuses(()=>u.verifyCoreKeyTuple({...receipt,bytesHex:receipt.bytesHex.slice(0,-2)},doc));
  refuses(()=>u.encodeCoreKeyTuple(doc,key,[{uuid:UUID}]));refuses(()=>u.encodeCoreKeyTuple(doc,key,[{uuid:UUID}],{profile:'umf-key-tuple-v1'}));
  assert(same(u.decodeBit128CarrierValue(binding,doc,field,u.encodeBit128CarrierValue(binding,doc,field,{uuid:UUID})),{uuid:UUID}));
  refuses(()=>u.decodeBit128CarrierValue(binding,doc,field,{hi:null,lo:'0'}));
  const retired=structuredClone(doc);retired.umf='0.8.0';
  if(u.validateDocument(retired).valid)throw Error('Retired core marker accepted');refusals++;
  refuses(()=>u.parseBits128('0'.repeat(31)+'\n'));
  refuses(()=>u.parseUuid(UUID+'suffix'));refuses(()=>u.bits128FromWords({high:'0',low:'18446744073709551616'},false));
  assert(!('process'in globalThis)&&!('Bun'in globalThis)&&!('Buffer'in globalThis));
  return {vectors:cases.length,codecChecks,keyChecks,recoveries,refusals,nodeGlobalsAbsent:true};
 },{cases:oracle.cases,doc:uuidDocument() as any,binding:uuidBinding() as any});
 if(externalRequests.length)throw Error('Unexpected external request');
 const sources=['src/model/types.ts','src/model/bit128-field.ts','src/projections/bit128-output-budget.ts','src/model/schema-properties.ts','src/model/relationship-selection.ts','spec/extensions/binding-128/schema.json','src/model/bit128.ts','src/model/uuid.ts','src/model/key-tuple.ts','src/model/schema-literals.ts','src/validation/schema-properties.ts','src/extensions/binding/bit128.ts','src/projections/bit128.ts','spec/core/schema.json','scripts/uuid-browser.ts'];
 const sha256=Object.fromEntries(await Promise.all(sources.map(async p=>[p,createHash('sha256').update(await Bun.file(p).text()).digest('hex')])));
 const evidence={scope:'Portable current-core UUID/carrier codec and authoring qualification; retired core markers refuse; no native execution or full core acceptance',browser:browser.version(),result,externalRequests,negativeRejected,layerRejected,bundleSha256:createHash('sha256').update(bundle).digest('hex'),sha256};
 await Bun.write(process.env.UMF_UUID_BROWSER_EVIDENCE??'fixtures/validation/uuid/browser.json',JSON.stringify(evidence,null,2)+'\n');console.log(evidence);
}finally{await browser?.close();server.stop(true);}
