// SPDX-License-Identifier: MIT OR Apache-2.0
/** @covers US-056-AC6 @covers US-056-AC10 */
import {test,expect} from 'bun:test';
import {createHash} from 'node:crypto';
import {CurrentNativeDisclosureChildSession,NATIVE_DISCLOSURE_CHILD_VERSION as version,NATIVE_DISCLOSURE_CHILD_LIMITS as limits} from '../../tools/security/current-native-disclosure-child';
import {CurrentDisclosureChildSession,DISCLOSURE_CHILD_VERSION,encodeDisclosureChildFrame as encode} from '../../tools/security/current-disclosure-child';
import {inspectSecurityDisclosureV2} from '../../src/extensions/security/protection/disclosure';
import vectors from './protection/native-disclosure-child-vectors.json';
const packets:any[]=vectors.packets,sources:any[]=vectors.sources;
const sha=(frame:Uint8Array)=>createHash('sha256').update(frame).digest('hex');
const decode=(frame:Uint8Array)=>JSON.parse(new TextDecoder().decode(frame.subarray(4)));
function rawFrame(body:string):Uint8Array {const b=Buffer.from(body),f=Buffer.alloc(b.length+4);f.writeUInt32BE(b.length);b.copy(f,4);return f;}
function initial(packet:any) {const s=sources[packet.sourceIndex];return {version,kind:'initialize',requestId:'init',sources:{policy:s.policy,catalog:s.catalog,closure:s.closure,ontology:s.ontology,associationBindings:[]},owner:s.owner,selection:packet.selection};}
function start(packet:any) {
 const session=new CurrentNativeDisclosureChildSession(),initialize=encode(initial(packet)),reply=decode(session.process(initialize));
 expect(reply).toEqual({version,kind:'initialized',requestId:'init',sourceReceipt:sha(initialize)});
 const evaluation=encode({version,kind:'evaluate-disclosure',requestId:'eval',sourceReceipt:reply.sourceReceipt,cut:packet.cut});
 return {session,initialize,evaluation,receipt:reply.sourceReceipt,inspection:(batch=packet.result.batch)=>({version,kind:'inspect-native-disclosure',requestId:'inspect',sourceReceipt:reply.sourceReceipt,batch})};
}
function evaluated(packet:any) {const s=start(packet),reply=decode(s.session.process(s.evaluation));expect(reply).toEqual({version,kind:'disclosure-evaluated',requestId:'eval',sourceReceipt:s.receipt,result:packet.result});return s;}
function packet(id:string):any {const p=packets.find(p=>p.id===id);if(!p)throw Error('Missing original vector '+id);return p;}
function refused(session:CurrentNativeDisclosureChildSession,frame:Uint8Array):void {
 let reply:any;try{reply=decode(session.process(frame));}catch{}if(reply!==undefined)expect(reply.kind).toBe('refused');
 expect(session.inspectionCompleted).toBe(false);expect(()=>session.process(frame)).toThrow();
}
test('all 72 original vectors preserve their actual fold; only the identical whole batch completes inspection',()=>{
 expect(packets.length).toBe(72);
 for(const p of packets) {
  const s=evaluated(p);expect(s.session.inspectionCompleted).toBe(false);
  if(p.result.status==='rendered') {
   expect(s.session.maximumRequestBytes).toBe(limits.inspectionBytes);const frame=encode(s.inspection());
   expect(decode(s.session.process(frame))).toEqual({version,kind:'native-disclosure-inspected',requestId:'inspect',sourceReceipt:s.receipt,evaluationFrameSha256:sha(s.evaluation),inspectionFrameSha256:sha(frame),status:'validated-disclosure',complete:false,authority:false});
   expect(s.session.inspectionCompleted).toBe(true);expect(()=>s.session.process(frame)).toThrow();
  } else expect(()=>s.session.process(encode(s.inspection()))).toThrow();
 }
});
test('source-invalid selected occurrence refuses independently of a self-consistent structural carrier',()=>{
 const p=packet('allowed:transformed-null'),s=evaluated(p),b=structuredClone(p.result.batch);b.rows[0][0].selection={ruleIndex:999,disclosureIndex:999};
 const source=sources[p.sourceIndex];expect(inspectSecurityDisclosureV2(b,source.policy,source.catalog,source.closure).status).toBe('refused');refused(s.session,encode(s.inspection(b)));
});
test('valid-but-substituted values, presence, cardinality and order cannot replace the held original',()=>{
 const cases=[['allowed:string','value'],['allowed:null','presence'],['allowed:string','missing'],['allowed:string','duplicate'],['revoked:string','extra'],['mixed:mixed-string','order']];
 for(const [id,mode] of cases) {
  const p=packet(id!),s=evaluated(p),b=structuredClone(p.result.batch);
  if(mode==='value')b.rows[0][0].value={string:'substituted'};if(mode==='presence')b.rows[0][0]={disposition:'absent'};
  if(mode==='missing')b.rows=[];if(mode==='duplicate')b.rows.push(structuredClone(b.rows[0]));
  if(mode==='extra')b.rows.push([{disposition:'original',value:{string:'not-permitted'}}]);if(mode==='order')b.rows.reverse();
  const source=sources[p.sourceIndex];expect(inspectSecurityDisclosureV2(b,source.policy,source.catalog,source.closure).status).toBe('validated-disclosure');refused(s.session,encode(s.inspection(b)));
 }
});
test('source, column, transform and domain metadata cannot drift after actual evaluation',()=>{
 for(const mode of ['version','policy','catalog','domains','field','storage','transform','domain','selection','payload','extra']) {
  const p=packet('allowed:transformed-null'),s=evaluated(p),b=structuredClone(p.result.batch),cell=b.rows[0][0];
  if(mode==='version')b.version='old';if(mode==='policy')b.policy.revision='changed';if(mode==='catalog')b.protection.revision='changed';if(mode==='domains')b.domains=[];
  if(mode==='field')b.columns[0].field.elementId='salary';if(mode==='storage')b.columns[0].storageEffect='canonical';
  if(mode==='transform')cell.transform.version='changed';if(mode==='domain')cell.outputDomain.elementId='salary';if(mode==='selection')cell.selection.disclosureIndex=0;
  if(mode==='payload')delete cell.value;if(mode==='extra')cell.extra=true;refused(s.session,encode(s.inspection(b)));
 }
});
test('protocol sequencing, exact receipt, fixed owner/selection and unique IDs remain closed',()=>{
 const p=packet('allowed:string');
 for(const mode of ['early','repeat-evaluation','receipt','version','owner','selection','cut','duplicate-id']) {
  const s=start(p);if(mode!=='early')s.session.process(s.evaluation);const r:any=s.inspection();
  if(mode==='repeat-evaluation'){refused(s.session,s.evaluation);continue;}
  if(mode==='receipt')r.sourceReceipt='0'.repeat(64);if(mode==='version')r.version=DISCLOSURE_CHILD_VERSION;
  if(mode==='owner')r.owner=initial(p).owner;if(mode==='selection')r.selection=p.selection;if(mode==='cut')r.cut=p.cut;if(mode==='duplicate-id')r.requestId='eval';
  refused(s.session,encode(r));
 }
 const old=new CurrentDisclosureChildSession();expect(()=>old.process(encode(initial(p)))).toThrow();
 const s=new CurrentNativeDisclosureChildSession();expect(()=>s.process(encode({...initial(p),version:DISCLOSURE_CHILD_VERSION}))).toThrow();
});
test('large-frame scanner preserves original strict keys, Unicode and exact numeric meaning',()=>{
 const p=packet('allowed:transformed-null');
 for(const mode of ['duplicate','escaped-duplicate','surrogate','unsafe-number','negative-zero','overflow','underflow','utf8','depth','nodes','truncated']) {
  const s=evaluated(p);let raw=JSON.stringify(s.inspection());
  if(mode==='duplicate')raw=raw.replace('"batch":','"batch":null,"batch":');
  if(mode==='escaped-duplicate')raw=raw.replace('"batch":','"ba\\u0074ch":null,"batch":');
  if(mode==='surrogate')raw=raw.replace('"requestId":"inspect"','"requestId":"\\ud800"');
  const number=mode==='unsafe-number'?'9007199254740993':mode==='negative-zero'?'-0':mode==='overflow'?'1e309':mode==='underflow'?'1e-999':null;
  if(number!==null)raw=raw.replace('"ruleIndex":0','"ruleIndex":'+number);
  if(mode==='depth')raw=raw.replace('"batch":','"padding":'+'['.repeat(65)+'0'+']'.repeat(65)+',"batch":');
  if(mode==='nodes')raw=raw.replace('"batch":','"padding":['+Array(100017).fill('0').join(',')+'],"batch":');
  let frame=rawFrame(raw);if(mode==='utf8')frame=Uint8Array.from([0,0,0,1,255]);if(mode==='truncated')frame=frame.subarray(0,frame.length-1);refused(s.session,frame);
 }
});
test('inspection alone admits larger bounded transport; source limits stay unchanged',()=>{
 const p=packet('allowed:string'),s=evaluated(p),body=JSON.stringify(s.inspection()),frame=rawFrame(' '.repeat(limits.inspectionBytes-Buffer.byteLength(body))+body);
 expect(frame.length).toBe(limits.inspectionBytes+4);expect(decode(s.session.process(frame)).inspectionFrameSha256).toBe(sha(frame));expect(s.session.inspectionCompleted).toBe(true);
 const tooLarge=evaluated(p),oversize=Buffer.alloc(limits.inspectionBytes+5,32);oversize.writeUInt32BE(limits.inspectionBytes+1);refused(tooLarge.session,oversize);
 const fresh=new CurrentNativeDisclosureChildSession(),sourceBody=JSON.stringify(initial(p));expect(()=>fresh.process(rawFrame(' '.repeat(limits.sourceBytes+1-Buffer.byteLength(sourceBody))+sourceBody))).toThrow();
},20000);
test('actual child requires inspection before clean EOF and preserves three fragmented/coalesced exchanges',async()=>{
 const entry=new URL('../../tools/security/current-native-disclosure-child-main.ts',import.meta.url).pathname,p=packet('allowed:string');
 for(const mode of ['complete','initialize-only','evaluate-only','corrupt','truncated','oversize']) {
  const s=start(p),inspection=encode(s.inspection()),child=Bun.spawn([process.execPath,entry],{stdin:'pipe',stdout:'pipe',stderr:'pipe'});
  if(mode==='oversize')child.stdin.write(Uint8Array.from([0,64,0,1]));
  else {child.stdin.write(s.initialize.subarray(0,2));child.stdin.write(s.initialize.subarray(2));if(mode!=='initialize-only')child.stdin.write(s.evaluation);
   if(mode==='complete')child.stdin.write(inspection);if(mode==='truncated')child.stdin.write(inspection.subarray(0,inspection.length-1));
   if(mode==='corrupt'){const r=s.inspection();r.batch=structuredClone(r.batch);r.batch.rows=[];child.stdin.write(encode(r));}}
  child.stdin.end();const [stdout,stderr,code]=await Promise.all([new Response(child.stdout).arrayBuffer(),new Response(child.stderr).text(),child.exited]);
  const frames:any[]=[];let rest=Buffer.from(stdout);while(rest.length){expect(rest.length).toBeGreaterThanOrEqual(4);const n=rest.readUInt32BE();expect(n+4).toBeLessThanOrEqual(rest.length);frames.push(decode(rest.subarray(0,n+4)));rest=rest.subarray(n+4);}
  if(mode==='complete'){expect(code).toBe(0);expect(stderr).toBe('');expect(frames.map(x=>x.kind)).toEqual(['initialized','disclosure-evaluated','native-disclosure-inspected']);expect(frames[2].inspectionFrameSha256).toBe(sha(inspection));}
  else {expect(code).toBe(2);expect(stderr).toBe('UMF_NATIVE_DISCLOSURE_CHILD_REFUSED\n');expect(frames.some(x=>x.kind==='native-disclosure-inspected')).toBe(false);}
 }
},20000);
