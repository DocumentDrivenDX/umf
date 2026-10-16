/** Private pure computation process. No database, issuer or native permission. */
import {createHash} from 'node:crypto';
import {readJsonValue} from '../../src/model/serialization';
import {canonicalSchemaJson} from '../../src/model/schema-literals';
import {compileCandidateCatalogProgram} from '../../src/extensions/security/catalog-program-candidate';
import {createCandidateCoreExtensionClosure} from '../../src/extensions/security/core-extension-closure-candidate';
import {inspectCandidateQueryValueRoutes} from '../../src/extensions/security/query-value-routes-candidate';
import {inspectCandidateReadProjection} from '../../src/extensions/security/read-projection-candidate';
import {evaluateCandidateQueryValueRoutes} from '../../src/extensions/security/query-value-route-evaluation-candidate';
import {evaluateCandidateCatalogOperationBatch} from '../../src/extensions/security/catalog-operation-batch-candidate';
export const PROJECTION_QUERY_PROTOCOL='umf.security.private-query-child/0.2-candidate';
export const PROJECTION_QUERY_LIMITS=Object.freeze({requestBytes:4*1024*1024,responseBytes:16*1024*1024,routes:4096,projections:256,operations:256,scans:16,facts:10000});
const fail=():never=>{throw Error('UMF_QUERY_CHILD_V2_REFUSED');};
function shape(value:any,keys:string[]):void{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length||keys.some(k=>!Object.hasOwn(value,k)))fail();}
function freezeJson(value:any):any{if(value&&typeof value==='object'){for(const child of Object.values(value))freezeJson(child);Object.freeze(value);}return value;}
function id(value:unknown):asserts value is string{if(typeof value!=='string'||! /^[A-Za-z0-9_-]{1,64}$/.test(value))fail();}
export function encodeProjectionQueryFrame(value:unknown):Uint8Array{
 const body=Buffer.from(JSON.stringify(value),'utf8');if(body.length<1||body.length>PROJECTION_QUERY_LIMITS.responseBytes)fail();
 const frame=Buffer.allocUnsafe(4+body.length);frame.writeUInt32BE(body.length);body.copy(frame,4);return frame;
}
/** Each instance retains exactly one original local JS program. Wire hashes are correlation only. */
export class ProjectionQueryChildSession {
 private handle:unknown;private receipt:string|null=null;private phase:'new'|'initialized'|'inspected'|'evaluated'|'failed'='new';private ids=new Set<string>();private inspected:string|null=null;
 process(frame:Uint8Array):Uint8Array{
  if(this.phase==='failed'||this.phase==='evaluated')fail();
  let request:any,requestId:string|undefined;
  try{
   if(frame.length<5||frame.length>4+PROJECTION_QUERY_LIMITS.requestBytes||new DataView(frame.buffer,frame.byteOffset,frame.byteLength).getUint32(0)!==frame.length-4)fail();
   const body=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(frame.subarray(4));request=freezeJson(readJsonValue(body,'json'));id(request.requestId);requestId=request.requestId;
   if(request.protocol!==PROJECTION_QUERY_PROTOCOL)fail();
   if(this.ids.has(requestId!))fail();this.ids.add(requestId!);
   if(request.kind==='initialize'){
    if(this.phase!=='new')fail();this.receipt=createHash('sha256').update(frame).digest('hex');shape(request,['protocol','kind','requestId','sources']);shape(request.sources,['policy','catalog','closure','ontology','associationBindings','extensionSelection']);
    const s=request.sources,extensions=s.extensionSelection===null?undefined:createCandidateCoreExtensionClosure(s.extensionSelection);
    this.handle=compileCandidateCatalogProgram(s.policy,s.catalog,s.closure,s.ontology,s.associationBindings,extensions);this.phase='initialized';return encodeProjectionQueryFrame({protocol:PROJECTION_QUERY_PROTOCOL,kind:'initialized',requestId,sourceReceipt:this.receipt});
   }
   if(this.receipt===null||request.sourceReceipt!==this.receipt)fail();
   if(request.kind==='inspect-inputs'){
    if(this.phase!=='initialized')fail();shape(request,['protocol','kind','requestId','sourceReceipt','owner','routes','projections']);this.routes(request.routes);this.projections(request.projections,request.routes);
    const reply:any={protocol:PROJECTION_QUERY_PROTOCOL,kind:'inputs-inspected',requestId,sourceReceipt:this.receipt,projectionResults:[],routeResults:[]};let bytes=Buffer.byteLength(JSON.stringify(reply),'utf8');
    for(const projection of request.projections){const value={id:projection.id,result:inspectCandidateReadProjection(this.handle,request.owner,projection.selection)};bytes=this.retain(bytes,value,reply.projectionResults.length);reply.projectionResults.push(value);}
    for(const route of request.routes){const value={id:route.id,result:inspectCandidateQueryValueRoutes(this.handle,request.owner,route.use)};bytes=this.retain(bytes,value,reply.routeResults.length);reply.routeResults.push(value);}
    this.inspected=canonicalSchemaJson({owner:request.owner,routes:request.routes,projections:request.projections});this.phase='inspected';return encodeProjectionQueryFrame(reply);
   }
   if(request.kind==='evaluate'){
    if(this.phase!=='inspected')fail();shape(request,['protocol','kind','requestId','sourceReceipt','owner','cut','operations','routes','projections']);this.routes(request.routes);this.projections(request.projections,request.routes);
    if(canonicalSchemaJson({owner:request.owner,routes:request.routes,projections:request.projections})!==this.inspected)fail();
    if(!Array.isArray(request.operations)||request.operations.length<1||request.operations.length>PROJECTION_QUERY_LIMITS.operations||!Array.isArray(request.cut?.facts)||!Array.isArray(request.cut?.graphs)||request.cut.facts.length+request.cut.graphs.length>PROJECTION_QUERY_LIMITS.facts)fail();
    if(request.operations.filter((op:any)=>op?.kind==='scan').length>PROJECTION_QUERY_LIMITS.scans||request.operations.filter((op:any)=>op?.kind==='read-rules').length>PROJECTION_QUERY_LIMITS.scans)fail();
    const fields=request.operations.reduce((n:number,op:any)=>n+(Array.isArray(op?.selection?.fields)?op.selection.fields.length:0)+(Array.isArray(op?.request?.fields)?op.request.fields.length:0),0);if(fields>4096)fail();
    const batch=evaluateCandidateCatalogOperationBatch(this.handle,request.owner,request.cut,request.operations);
    const reply:any={protocol:PROJECTION_QUERY_PROTOCOL,kind:'evaluation',requestId,sourceReceipt:this.receipt,batch,projectionResults:[],routeResults:[]};let bytes=Buffer.byteLength(JSON.stringify(reply),'utf8');if(bytes>PROJECTION_QUERY_LIMITS.responseBytes)fail();
    for(const projection of request.projections){const value={id:projection.id,result:inspectCandidateReadProjection(this.handle,request.owner,projection.selection)};bytes=this.retain(bytes,value,reply.projectionResults.length);reply.projectionResults.push(value);}
    for(const route of request.routes){const value={id:route.id,result:evaluateCandidateQueryValueRoutes(this.handle,request.owner,request.cut,route.use)};bytes=this.retain(bytes,value,reply.routeResults.length);reply.routeResults.push(value);}
    this.phase='evaluated';return encodeProjectionQueryFrame(reply);
   }
   return fail();
  }catch{
   this.phase='failed';this.handle=undefined;this.inspected=null;
   if(requestId!==undefined&&this.receipt!==null)return encodeProjectionQueryFrame({protocol:PROJECTION_QUERY_PROTOCOL,kind:'refused',requestId,sourceReceipt:this.receipt,code:'UMF_QUERY_CHILD_V2_REFUSED'});
   return fail();
  }
 }
 private projections(projections:any,routes:any):void{
  if(!Array.isArray(projections)||projections.length>PROJECTION_QUERY_LIMITS.projections)fail();const ids=new Set<string>(routes.map((r:any)=>r.id));
  for(const projection of projections){shape(projection,['id','selection']);id(projection.id);if(ids.has(projection.id))fail();ids.add(projection.id);shape(projection.selection,['type','field']);for(const key of ['type','field'])shape(projection.selection[key],['documentId','moduleId','elementId']);}
 }
 private routes(routes:any):void{
  if(!Array.isArray(routes)||routes.length>PROJECTION_QUERY_LIMITS.routes)fail();const ids=new Set<string>(),scans=new Set<string>();
  for(const route of routes){shape(route,['id','use']);id(route.id);if(ids.has(route.id))fail();ids.add(route.id);if(typeof route.use?.scan!=='string')fail();scans.add(route.use.scan);}
  if(scans.size>PROJECTION_QUERY_LIMITS.scans)fail();
 }
 private retain(bytes:number,value:unknown,count:number):number{const next=bytes+Buffer.byteLength(JSON.stringify(value),'utf8')+(count?1:0);if(next>PROJECTION_QUERY_LIMITS.responseBytes)fail();return next;}
}
