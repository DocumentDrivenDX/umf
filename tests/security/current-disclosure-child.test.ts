// SPDX-License-Identifier: MIT OR Apache-2.0
/** @covers US-056-AC6 @covers US-056-AC10 */
import {test,expect} from 'bun:test';
import {createHash} from 'node:crypto';
import {CurrentDisclosureChildSession,DISCLOSURE_CHILD_VERSION as version,encodeDisclosureChildFrame as encode} from '../../tools/security/current-disclosure-child';
import source from './protection/current-query-presence-source.json';
import scenarios from './protection/current-query-read-scenarios.json';
const ref=(elementId:string)=>({documentId:'domain',moduleId:'m',elementId});
const decode=(frame:Uint8Array)=>JSON.parse(new TextDecoder().decode(frame.subarray(4)));
function fixture(state='string',denied=false) {
 const s:any=structuredClone(source),cut:any=structuredClone(scenarios.cut);
 s.policy.revision='child-'+state;s.owner.revision='child-owner';s.owner.disclosure={readAction:'read'};
 const disposition=state==='withheld'?{kind:'withheld'}:state==='transformed-null'?{kind:'transformed',vocabulary:'umf.security.protection',transform:'presentation-null',version:'1',field:ref('token')}:{kind:'original'};
 s.policy.rules[0].disclosure.push({field:ref('token'),disposition});
 if(state==='transformed-null') {
  s.catalog.revision='child-null';s.policy.protection={id:s.catalog.id,revision:s.catalog.revision};
  s.catalog.transforms.push({id:'presentation-null',version:'1',kind:'mask',function:'null-out',inputDomain:ref('token'),outputDomain:ref('token'),determinism:'deterministic',reversibility:'none',disclosureProfile:[],queryUse:{},parameters:[]});
 }
 cut.policy={id:s.policy.id,revision:s.policy.revision};cut.ontology={documentId:s.ontology.documentId,revision:s.ontology.revision};cut.protection={id:s.catalog.id,revision:s.catalog.revision};cut.domains=s.closure.pins;cut.owner={id:s.owner.id,revision:s.owner.revision};
 const fact=cut.facts.find((f:any)=>f.type.elementId==='Resource');fact.fields=fact.fields.filter((f:any)=>f.field.elementId!=='token');fact.absent=[];
 if(state==='absent')fact.absent.push(ref('token'));
 else if(state!=='unreported'&&state!=='withheld')fact.fields.push({field:ref('token'),value:state==='null'?null:{string:'opaque-token'}});
 if(state==='withheld')cut.coverage.find((f:any)=>f.type.elementId==='Resource').fields=cut.coverage.find((f:any)=>f.type.elementId==='Resource').fields.filter((f:any)=>f.elementId!=='token');
 if(denied)cut.facts.find((f:any)=>f.type.elementId==='Assignment').fields.find((f:any)=>f.field.elementId==='active').value={boolean:false};
 const initial={version,kind:'initialize',requestId:'init',sources:{policy:s.policy,catalog:s.catalog,closure:s.closure,ontology:s.ontology,associationBindings:[]},owner:s.owner,selection:{type:ref('Resource'),fields:[ref('token')]}};
 return {initial,cut};
}
function start(initial:any) {
 const session=new CurrentDisclosureChildSession(),frame=encode(initial),reply=decode(session.process(frame));
 expect(reply).toEqual({version,kind:'initialized',requestId:'init',sourceReceipt:createHash('sha256').update(frame).digest('hex')});
 return {session,request:(cut:any)=>({version,kind:'evaluate-disclosure',requestId:'evaluate',sourceReceipt:reply.sourceReceipt,cut})};
}
test('five distinct disclosed states retain exact payload and selected provenance through framing',()=>{
 for(const state of ['string','null','absent','withheld','transformed-null']) {
  const {initial,cut}=fixture(state),{session,request}=start(initial),reply=decode(session.process(encode(request(cut))));
  expect(reply.kind).toBe('disclosure-evaluated');expect(reply.result.status).toBe('rendered');expect(reply.result.authority).toBe(false);expect(reply.result.complete).toBe(false);
  const cell=state==='absent'?{disposition:'absent'}:state==='withheld'?{disposition:'withheld'}:state==='transformed-null'?{disposition:'transformed',value:null,selection:{ruleIndex:0,disclosureIndex:1},outputDomain:ref('token'),transform:{id:'presentation-null',version:'1'}}:{disposition:'original',value:state==='null'?null:{string:'opaque-token'}};
  expect(reply.result.batch.rows).toEqual([[cell]]);expect(reply.result.resources).toEqual([{type:ref('Resource'),key:[{string:'r1'}]}]);
  expect(()=>session.process(encode(request(cut)))).toThrow();
 }
});
test('denied census stays private and absent from output; semantic refusals clear every field',()=>{
 const d=fixture('string',true),started=start(d.initial),out=decode(started.session.process(encode(started.request(d.cut))));
 expect(out.result.status).toBe('rendered');expect(out.result.decisions[0].decision).toBe('deny');expect(out.result.batch.rows).toEqual([]);expect(out.result.resources).toEqual([]);
 for(const mode of ['unreported','stale']) {
  const {initial,cut}=fixture(mode==='unreported'?mode:'string');if(mode==='stale')cut.expectedGeneration='stale';
  const {session,request}=start(initial),reply=decode(session.process(encode(request(cut))));
  expect(reply.result).toEqual({version:'umf.security.logical-disclosure-batch/0.1-candidate',status:'refused',complete:false,authority:false,sources:null,decisions:[],resources:[],batch:null});
 }
});
test('owner, fields, operation, receipt, protocol and sequencing cannot be rebound',()=>{
 for(const mode of ['owner','selection','receipt','version','id','kind','extra']) {
  const {initial,cut}=fixture(),{session,request}=start(initial),r:any=request(cut);
  if(mode==='owner')r.owner=initial.owner;if(mode==='selection')r.selection=initial.selection;
  if(mode==='receipt')r.sourceReceipt='0'.repeat(64);if(mode==='version')r.version='old';if(mode==='id')r.requestId='init';if(mode==='kind')r.kind='evaluate';if(mode==='extra')r.operations=[];
  expect(decode(session.process(encode(r)))).toEqual({version,kind:'refused',requestId:r.requestId,sourceReceipt:request(cut).sourceReceipt,code:'UMF_DISCLOSURE_CHILD_REFUSED'});
  expect(()=>session.process(encode(request(cut)))).toThrow();
 }
 const {initial,cut}=fixture();expect(()=>new CurrentDisclosureChildSession().process(encode({version,kind:'evaluate-disclosure',requestId:'early',sourceReceipt:'0'.repeat(64),cut}))).toThrow();
 const x=start(initial);expect(decode(x.session.process(encode(initial))).kind).toBe('refused');
});
test('strict JSON, UTF8, shape and resource refusals terminate the session',()=>{
 const {initial,cut}=fixture();
 const raw=Buffer.from(JSON.stringify(initial).replace('"kind":"initialize"','"kind":"initialize","kind":"initialize"')),dup=Buffer.alloc(raw.length+4);dup.writeUInt32BE(raw.length);raw.copy(dup,4);
 for(const frame of [dup,Uint8Array.from([0,0,0,1,255]),encode(initial).subarray(0,8),encode({...initial,extra:true}),encode({...initial,version:'old'})]) {
  const s=new CurrentDisclosureChildSession();expect(()=>s.process(frame)).toThrow();expect(()=>s.process(encode(initial))).toThrow();
 }
 for(const mode of ['facts','fields','catalog','oversize']) {
  const f=fixture();
  if(mode==='fields'){f.initial.selection.fields=Array(257).fill(ref('token'));expect(()=>new CurrentDisclosureChildSession().process(encode(f.initial))).toThrow();continue;}
  if(mode==='catalog'){f.initial.sources.catalog=null;expect(()=>new CurrentDisclosureChildSession().process(encode(f.initial))).toThrow();continue;}
  const {session,request}=start(f.initial);if(mode==='facts')f.cut.facts=Array(10001).fill({});
  const r:any=request(f.cut);if(mode==='oversize')r.padding='x'.repeat(4194304);
  if(mode==='oversize')expect(()=>session.process(encode(r))).toThrow();
  else expect(decode(session.process(encode(r))).kind).toBe('refused');
  expect(()=>session.process(encode(request(f.cut)))).toThrow();
 }
});
test('actual process accepts fragmented/coalesced frames and never emits partial invalid output',async()=>{
 const entry=new URL('../../tools/security/current-disclosure-child-main.ts',import.meta.url).pathname;
 for(const mode of ['success','truncated','oversize','utf8']) {
  const child=Bun.spawn([process.execPath,entry],{stdin:'pipe',stdout:'pipe',stderr:'pipe'}),{initial,cut}=fixture(),frame=encode(initial);
  if(mode==='success') {
   const receipt=createHash('sha256').update(frame).digest('hex'),tail=encode({version,kind:'evaluate-disclosure',requestId:'eval',sourceReceipt:receipt,cut});
   child.stdin.write(frame.subarray(0,2));child.stdin.write(Buffer.concat([frame.subarray(2),tail]));
  } else if(mode==='truncated')child.stdin.write(frame.subarray(0,frame.length-1));
  else child.stdin.write(mode==='oversize'?Uint8Array.from([0,64,0,1]):Uint8Array.from([0,0,0,1,255]));
  child.stdin.end();const [stdout,stderr,code]=await Promise.all([new Response(child.stdout).arrayBuffer(),new Response(child.stderr).text(),child.exited]);
  if(mode==='success') {expect(code).toBe(0);expect(stderr).toBe('');const b=Buffer.from(stdout),n=b.readUInt32BE(0);expect(decode(b.subarray(0,n+4)).kind).toBe('initialized');expect(decode(b.subarray(n+4)).result.batch.rows[0][0]).toEqual({disposition:'original',value:{string:'opaque-token'}});}
  else {expect(code).toBe(2);expect(stdout.byteLength).toBe(0);expect(stderr).toBe('UMF_DISCLOSURE_CHILD_REFUSED\n');}
 }
},20000);
