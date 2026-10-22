/** Private projection-only computation. Full census and rule truth must never be public. */
import {createHash} from 'node:crypto';
import {readJsonValue} from '../../src/model/serialization';
import {compileCandidateCatalogProgram} from '../../src/extensions/security/catalog-program-candidate';
import {evaluateCandidateCatalogReadDisclosureBatchWithinOperation} from '../../src/extensions/security/catalog-runtime-candidate';
import {CandidateSecurityOperationBudget} from '../../src/extensions/security/operation-budget-candidate';
export const DISCLOSURE_CHILD_VERSION='umf.security.private-disclosure-child/0.1-candidate';
export const DISCLOSURE_CHILD_LIMITS=Object.freeze({requestBytes:4194304,responseBytes:16777216,facts:10000});
const fail=():never=>{throw Error('UMF_DISCLOSURE_CHILD_REFUSED');};
function shape(value:any,keys:string[]):void {
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length||keys.some(k=>!Object.hasOwn(value,k)))fail();
}
function freeze(value:any):any {if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}
export function encodeDisclosureChildFrame(value:unknown):Uint8Array {
 const body=Buffer.from(JSON.stringify(value),'utf8');if(!body.length||body.length>DISCLOSURE_CHILD_LIMITS.responseBytes)fail();
 const frame=Buffer.allocUnsafe(body.length+4);frame.writeUInt32BE(body.length);body.copy(frame,4);return frame;
}
/** One locally compiled program, fixed owner/selection, one evaluation; receipts are correlation only. */
export class CurrentDisclosureChildSession {
 private phase:'new'|'initialized'|'terminal'='new';private handle:unknown;private owner:unknown;private selection:unknown;
 private receipt:string|null=null;private initialId:string|null=null;
 process(frame:Uint8Array):Uint8Array {
  if(this.phase==='terminal')fail();let requestId:string|undefined;
  try {
   if(frame.length<5||frame.length>4+DISCLOSURE_CHILD_LIMITS.requestBytes||new DataView(frame.buffer,frame.byteOffset,frame.byteLength).getUint32(0)!==frame.length-4)fail();
   const request:any=freeze(readJsonValue(new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(frame.subarray(4)),'json'));
   if(typeof request.requestId!=='string'||! /^[A-Za-z0-9_-]{1,64}$/.test(request.requestId))fail();requestId=request.requestId;
   if(request.version!==DISCLOSURE_CHILD_VERSION)fail();
   if(request.kind==='initialize') {
    if(this.phase!=='new')fail();shape(request,['version','kind','requestId','sources','owner','selection']);
    shape(request.sources,['policy','catalog','closure','ontology','associationBindings']);
    if(request.sources.catalog===null)fail();
    shape(request.selection,['type','fields']);
    if(!Array.isArray(request.selection.fields)||request.selection.fields.length>256)fail();
    const s=request.sources;this.handle=compileCandidateCatalogProgram(s.policy,s.catalog,s.closure,s.ontology,s.associationBindings);
    this.owner=request.owner;this.selection=request.selection;this.initialId=requestId!;
    this.receipt=createHash('sha256').update(frame).digest('hex');this.phase='initialized';
    return encodeDisclosureChildFrame({version:DISCLOSURE_CHILD_VERSION,kind:'initialized',requestId,sourceReceipt:this.receipt});
   }
   if(this.phase!=='initialized'||request.kind!=='evaluate-disclosure'||request.sourceReceipt!==this.receipt||requestId===this.initialId)fail();
   shape(request,['version','kind','requestId','sourceReceipt','cut']);
   if(!Array.isArray(request.cut?.facts)||!Array.isArray(request.cut?.graphs)||request.cut.facts.length+request.cut.graphs.length>DISCLOSURE_CHILD_LIMITS.facts)fail();
   const result=evaluateCandidateCatalogReadDisclosureBatchWithinOperation(this.handle,this.owner,request.cut,this.selection,new CandidateSecurityOperationBudget(1000000));
   this.clear();
   return encodeDisclosureChildFrame({version:DISCLOSURE_CHILD_VERSION,kind:'disclosure-evaluated',requestId,sourceReceipt:this.receipt,result});
  } catch {
   this.clear();
   if(requestId!==undefined&&this.receipt!==null)return encodeDisclosureChildFrame({version:DISCLOSURE_CHILD_VERSION,kind:'refused',requestId,sourceReceipt:this.receipt,code:'UMF_DISCLOSURE_CHILD_REFUSED'});
   return fail();
  }
 }
 private clear():void {this.phase='terminal';this.handle=undefined;this.owner=undefined;this.selection=undefined;}
}
