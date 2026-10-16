/** Private held producer/inspection process. No native observation or release authority. */
import {createHash} from 'node:crypto';
import {readJsonValue} from '../../src/model/serialization';
import {canonicalSchemaJson} from '../../src/model/schema-literals';
import {scanPlanJson} from '../../src/extensions/actions/plan-artifacts';
import {compileCandidateCatalogProgram} from '../../src/extensions/security/catalog-program-candidate';
import {evaluateCandidateCatalogReadDisclosureBatchWithinOperation} from '../../src/extensions/security/catalog-runtime-candidate';
import {CandidateSecurityOperationBudget} from '../../src/extensions/security/operation-budget-candidate';
import {inspectSecurityDisclosureV2} from '../../src/extensions/security/protection/disclosure';
import {encodeDisclosureChildFrame} from './current-disclosure-child';
export const NATIVE_DISCLOSURE_CHILD_VERSION='umf.security.private-disclosure-child/0.2-candidate';
export const NATIVE_DISCLOSURE_CHILD_LIMITS=Object.freeze({sourceBytes:4194304,inspectionBytes:16777216,responseBytes:16777216,facts:10000,inspectionNodes:100016});
const fail=():never=>{throw Error('UMF_NATIVE_DISCLOSURE_CHILD_REFUSED');};
const digest=(frame:Uint8Array)=>createHash('sha256').update(frame).digest('hex');
function shape(value:any,keys:string[]):void {
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length||keys.some(k=>!Object.hasOwn(value,k)))fail();
}
function freeze(value:any):any {if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}
/** Exactly one actual fold and one whole V2 check against held sources and original batch. */
export class CurrentNativeDisclosureChildSession {
 private phase:'new'|'initialized'|'awaiting-native'|'terminal'='new';
 private handle:unknown;private sources:any;private owner:unknown;private selection:unknown;private originalBatch:unknown;
 private receipt:string|null=null;private evaluationFrameSha256:string|null=null;private ids=new Set<string>();private inspected=false;
 get maximumRequestBytes():number {return this.phase==='awaiting-native'?NATIVE_DISCLOSURE_CHILD_LIMITS.inspectionBytes:NATIVE_DISCLOSURE_CHILD_LIMITS.sourceBytes;}
 get inspectionCompleted():boolean {return this.inspected;}
 process(frame:Uint8Array):Uint8Array {
  if(this.phase==='terminal')fail();let requestId:string|undefined;
  try {
   if(frame.length<5||frame.length>4+this.maximumRequestBytes||new DataView(frame.buffer,frame.byteOffset,frame.byteLength).getUint32(0)!==frame.length-4)fail();
   const body=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(frame.subarray(4));
   // Reuse the original duplicate-key/Unicode/exact-number scanner for larger
   // native inspection frames; do not round numbers or add a policy evaluator.
   let request:any;
   if(this.phase==='awaiting-native'){scanPlanJson(body,NATIVE_DISCLOSURE_CHILD_LIMITS.inspectionBytes,NATIVE_DISCLOSURE_CHILD_LIMITS.inspectionNodes);request=freeze(JSON.parse(body));}
   else request=freeze(readJsonValue(body,'json'));
   if(typeof request.requestId!=='string'||! /^[A-Za-z0-9_-]{1,64}$/.test(request.requestId))fail();requestId=request.requestId;
   if(request.version!==NATIVE_DISCLOSURE_CHILD_VERSION||this.ids.has(requestId!))fail();this.ids.add(requestId!);
   if(request.kind==='initialize') {
    if(this.phase!=='new')fail();shape(request,['version','kind','requestId','sources','owner','selection']);
    shape(request.sources,['policy','catalog','closure','ontology','associationBindings']);if(request.sources.catalog===null)fail();
    shape(request.selection,['type','fields']);if(!Array.isArray(request.selection.fields)||request.selection.fields.length>256)fail();
    const s=request.sources;this.handle=compileCandidateCatalogProgram(s.policy,s.catalog,s.closure,s.ontology,s.associationBindings);
    this.sources=s;this.owner=request.owner;this.selection=request.selection;this.receipt=digest(frame);this.phase='initialized';
    return encodeDisclosureChildFrame({version:NATIVE_DISCLOSURE_CHILD_VERSION,kind:'initialized',requestId,sourceReceipt:this.receipt});
   }
   if(request.sourceReceipt!==this.receipt)fail();
   if(request.kind==='evaluate-disclosure') {
    if(this.phase!=='initialized')fail();shape(request,['version','kind','requestId','sourceReceipt','cut']);
    if(!Array.isArray(request.cut?.facts)||!Array.isArray(request.cut?.graphs)||request.cut.facts.length+request.cut.graphs.length>NATIVE_DISCLOSURE_CHILD_LIMITS.facts)fail();
    const result=evaluateCandidateCatalogReadDisclosureBatchWithinOperation(this.handle,this.owner,request.cut,this.selection,new CandidateSecurityOperationBudget(1000000));
    if(result.status==='rendered'){this.originalBatch=result.batch;this.evaluationFrameSha256=digest(frame);this.phase='awaiting-native';}
    else this.clear();
    return encodeDisclosureChildFrame({version:NATIVE_DISCLOSURE_CHILD_VERSION,kind:'disclosure-evaluated',requestId,sourceReceipt:this.receipt,result});
   }
   if(request.kind==='inspect-native-disclosure') {
    if(this.phase!=='awaiting-native')fail();shape(request,['version','kind','requestId','sourceReceipt','batch']);
    const result=inspectSecurityDisclosureV2(request.batch,this.sources.policy,this.sources.catalog,this.sources.closure);
    if(result.status!=='validated-disclosure'||result.complete!==false||result.authority!==false||result.batch===null
       ||canonicalSchemaJson(result.batch)!==canonicalSchemaJson(this.originalBatch))fail();
    const reply={version:NATIVE_DISCLOSURE_CHILD_VERSION,kind:'native-disclosure-inspected',requestId,sourceReceipt:this.receipt,
     evaluationFrameSha256:this.evaluationFrameSha256,inspectionFrameSha256:digest(frame),status:'validated-disclosure',complete:false,authority:false};
    this.clear();this.inspected=true;return encodeDisclosureChildFrame(reply);
   }
   return fail();
  } catch {
   this.clear();
   if(requestId!==undefined&&this.receipt!==null)return encodeDisclosureChildFrame({version:NATIVE_DISCLOSURE_CHILD_VERSION,kind:'refused',requestId,sourceReceipt:this.receipt,code:'UMF_NATIVE_DISCLOSURE_CHILD_REFUSED'});
   return fail();
  }
 }
 private clear():void {this.phase='terminal';this.handle=undefined;this.sources=undefined;this.owner=undefined;this.selection=undefined;this.originalBatch=undefined;this.evaluationFrameSha256=null;this.ids.clear();}
}
