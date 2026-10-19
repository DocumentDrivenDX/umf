import {test,expect} from 'bun:test';
import {createHash} from 'node:crypto';
import {CurrentQueryChildSession,encodeCurrentQueryFrame} from '../../tools/security/current-query-child';
import originalSource from './protection/query-value-modes-source.json';
const source=structuredClone(originalSource);
for(const entry of source.closure.documents)entry.document.umf='0.10.0';
import {compileCandidateCatalogProgram} from '../../src/extensions/security/catalog-program-candidate';
import {evaluateCandidateCatalogOperationBatch} from '../../src/extensions/security/catalog-operation-batch-candidate';
import {evaluateCandidateQueryValueRoutes} from '../../src/extensions/security/query-value-route-evaluation-candidate';
const ref=(elementId:string)=>({documentId:'domain',moduleId:'m',elementId});
const decode=(frame:Uint8Array)=>JSON.parse(new TextDecoder().decode(frame.subarray(4)));
const initialize=()=>structuredClone({kind:'initialize',requestId:'init',sources:{policy:source.policy,catalog:source.catalog,closure:source.closure,ontology:source.ontology,associationBindings:[],extensionSelection:null}});
const routes=[{id:'predicate',use:{scan:'s0',path:'filters/0/left',type:ref('Resource'),field:ref('salary'),operator:'predicate',operation:'equal',required:['equality']}}];
const operations=[{id:'rules',kind:'read-rules',selection:{type:ref('Resource')}},{id:'cells',kind:'scan',selection:{type:ref('Resource'),fields:[ref('salary')]}},{id:'original',kind:'action',request:{action:'query-original-salary-predicate',resources:[{type:ref('Resource'),key:[{string:'r1'}]}],targets:[ref('Resource')],fields:[]}}];
function start(){const session=new CurrentQueryChildSession(),frame=encodeCurrentQueryFrame(initialize()),reply=decode(session.process(frame));expect(reply).toEqual({kind:'initialized',requestId:'init',sourceReceipt:createHash('sha256').update(frame).digest('hex')});return {session,receipt:reply.sourceReceipt};}
const inspect=(receipt:string)=>({kind:'inspect-routes',requestId:'inspect',sourceReceipt:receipt,owner:source.owner,routes});
const evaluate=(receipt:string)=>({kind:'evaluate',requestId:'evaluate',sourceReceipt:receipt,owner:source.owner,cut:source.logicalCut,operations,routes});
test('original compiler, batch and route results survive the private protocol unchanged',()=>{const {session,receipt}=start();const i=decode(session.process(encodeCurrentQueryFrame(inspect(receipt))));expect(i.kind).toBe('routes-inspected');expect(i.routeResults[0].result.status).toBe('inspected');const out=decode(session.process(encodeCurrentQueryFrame(evaluate(receipt))));const p=compileCandidateCatalogProgram(source.policy,source.catalog,source.closure,source.ontology);expect(out).toEqual({kind:'evaluation',requestId:'evaluate',sourceReceipt:receipt,batch:evaluateCandidateCatalogOperationBatch(p,source.owner,source.logicalCut,operations),routeResults:[{id:'predicate',result:evaluateCandidateQueryValueRoutes(p,source.owner,source.logicalCut,routes[0]!.use)}]});expect(out.batch.authority).toBe(false);expect(()=>session.process(encodeCurrentQueryFrame(evaluate(receipt)))).toThrow();});
test('wrong receipt, ordering, duplicate IDs, changed owner or routes refuse without logical results',()=>{for(const change of ['receipt','owner','routes','id','skip-inspect']){const {session,receipt}=start();if(change!=='skip-inspect')session.process(encodeCurrentQueryFrame(inspect(receipt)));const e:any=evaluate(receipt);if(change==='receipt')e.sourceReceipt='0'.repeat(64);if(change==='owner')e.owner={...e.owner,revision:'changed'};if(change==='routes')e.routes=[{...routes[0],id:'changed'}];if(change==='id')e.requestId='inspect';expect(decode(session.process(encodeCurrentQueryFrame(e)))).toEqual({kind:'refused',requestId:e.requestId,sourceReceipt:receipt,code:'UMF_QUERY_CHILD_REFUSED'});expect(()=>session.process(encodeCurrentQueryFrame(e))).toThrow();}});
test('duplicate JSON keys, malformed UTF8, truncated frames and imported extensions never initialize',()=>{const initial=initialize(),s=JSON.stringify(initial),bad=Buffer.from(s.replace('"kind":"initialize"','"kind":"initialize","kind":"initialize"'));const duplicate=Buffer.alloc(4+bad.length);duplicate.writeUInt32BE(bad.length);bad.copy(duplicate,4);expect(()=>new CurrentQueryChildSession().process(duplicate)).toThrow();expect(()=>new CurrentQueryChildSession().process(Uint8Array.from([0,0,0,1,255]))).toThrow();expect(()=>new CurrentQueryChildSession().process(encodeCurrentQueryFrame(initial).subarray(0,8))).toThrow();for(const selection of [{kind:'candidate-core-extension-closure/0.1'},[],[{id:'other',version:'0.1.0'}]]){const request:any=initialize();request.sources.extensionSelection=selection;expect(decode(new CurrentQueryChildSession().process(encodeCurrentQueryFrame(request))).kind).toBe('refused');}});
test('original unknown/refusal results stay original and no action is turned into a permission',()=>{const {session,receipt}=start();session.process(encodeCurrentQueryFrame(inspect(receipt)));const request:any=evaluate(receipt);request.cut=structuredClone(source.logicalCut);request.cut.expectedGeneration='stale';const out=decode(session.process(encodeCurrentQueryFrame(request)));expect(out.kind).toBe('evaluation');expect(out.batch).toEqual({status:'refused',complete:false,authority:false,operations:[]});expect(out.routeResults[0].result.status).toBe('refused');});
test('real child accepts fragmented frames and emits no partial frame on invalid input',async()=>{
 const entry=new URL('../../tools/security/current-query-child-main.ts',import.meta.url).pathname;
 for(const name of ['fragmented','truncated','oversized','invalid-utf8']){
  const child=Bun.spawn([process.execPath,entry],{stdin:'pipe',stdout:'pipe',stderr:'pipe'}),frame=encodeCurrentQueryFrame(initialize());
  if(name==='fragmented'){child.stdin.write(frame.subarray(0,2));child.stdin.write(frame.subarray(2,9));child.stdin.write(frame.subarray(9));}
  else if(name==='truncated')child.stdin.write(frame.subarray(0,frame.length-1));
  else if(name==='oversized')child.stdin.write(Uint8Array.from([0,64,0,1]));
  else child.stdin.write(Uint8Array.from([0,0,0,1,255]));
  child.stdin.end();const [stdout,stderr,code]=await Promise.all([new Response(child.stdout).arrayBuffer(),new Response(child.stderr).text(),child.exited]);
  if(name==='fragmented'){expect(code).toBe(0);expect(stderr).toBe('');expect(decode(new Uint8Array(stdout)).kind).toBe('initialized');}
  else{expect(code).toBe(2);expect(stdout.byteLength).toBe(0);expect(stderr).toBe('UMF_QUERY_CHILD_REFUSED\n');}
 }
});
test('extension selection is issued locally and a denied separate action remains explicit',()=>{
 const session=new CurrentQueryChildSession(),initial:any=initialize();initial.sources.extensionSelection=[{id:'umf.actions',version:'0.1.0'}];initial.sources.policy.rules=initial.sources.policy.rules.filter((r:any)=>r.id!=='query-original-salary-predicate-permit');
 const frame=encodeCurrentQueryFrame(initial),receipt=decode(session.process(frame)).sourceReceipt;session.process(encodeCurrentQueryFrame(inspect(receipt)));const out=decode(session.process(encodeCurrentQueryFrame(evaluate(receipt))));expect(out.batch.status).toBe('completed');expect(out.batch.operations[2].outcome.rows[0].decision).toBe('deny');expect(out.batch.authority).toBe(false);
});

test('current security source accepts only actual0.10 and refuses unresolved semantic references',()=>{
 for(const version of ['0.8.0','0.9.0']){const request:any=initialize();request.sources.closure.documents[0].document.umf=version;expect(decode(new CurrentQueryChildSession().process(encodeCurrentQueryFrame(request))).kind).toBe('refused');}
 const request:any=initialize();request.sources.closure.documents[0].document.modules[0].elements[0].semanticTypes=[{vocabulary:'example',version:'1',term:'unresolved'}];
 expect(decode(new CurrentQueryChildSession().process(encodeCurrentQueryFrame(request))).kind).toBe('refused');
});
