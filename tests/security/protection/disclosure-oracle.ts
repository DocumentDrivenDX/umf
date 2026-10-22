// SPDX-License-Identifier: MIT OR Apache-2.0
import * as api from '../../../src/index';
import packet from './disclosure-fixtures.json';
const sdk=api as any;
const clone=(x:any)=>structuredClone(x);
function change(root:any,operation:any){
 const path=operation.path.slice(1).split('/').map((s:string)=>s.replace(/~1/g,'/').replace(/~0/g,'~'));
 const key=path.pop()!;let at=root;for(const part of path)at=at[part];
 if(operation.op==='remove')delete at[key];else at[key]=clone(operation.value);
}
const ref=(elementId:string)=>({documentId:'s20-core',moduleId:'m',elementId});
export function materialize(c:any){
 const f=clone(packet.base);for(const m of c.changes)change(f,m);
 const x=c.expand;
 if(x?.kind==='rows')f.batch.rows=Array.from({length:x.rows},()=>[{disposition:'withheld'}]);
 if(x?.kind==='columns'){
  const fields=f.closure.documents[0].document.modules[0].elements;
  f.batch.columns=Array.from({length:x.columns},(_,i)=>{const id='column-'+i;fields.push({id,kind:'field',scalarType:'string',cardinality:'one',nullability:'required',extensions:{}});return{field:ref(id),storageEffect:'canonical'};});
  f.batch.rows=Array.from({length:x.rows},()=>f.batch.columns.map(()=>({disposition:'withheld'})));
 }
 if(x?.kind==='string'||x?.kind==='repeated-string'){
  f.batch.columns=[{field:ref('text'),storageEffect:'canonical'}];
  f.batch.rows=Array.from({length:x.rows??1},()=>[{disposition:'original',value:{string:'a'.repeat(x.length)}}]);
 }
 if(x?.kind==='opaque')f.catalog.native={opaque:'a'.repeat(x.length)};
 if(x?.kind==='batch-text')f.batch.rows=[[{disposition:'original',value:{string:'a'.repeat(x.length)}}]];
 return f;
}
function deeplyFrozen(v:any):boolean{return v===null||typeof v!=='object'||(Object.isFrozen(v)&&Object.values(v).every(deeplyFrozen));}
export function runOracle(){
 const rows:any[]=[];
 for(const c of packet.cases as any[]){
  const f=materialize(c),before=JSON.stringify(f);let actual:any,passed=false;
  if(c.wire){let threw=false;try{sdk.decodeSecurityDisclosureV2(c.wire.text,f.policy,f.catalog,f.closure,c.wire.format);}catch{threw=true;}
   passed=threw;actual={refused:threw};
  }else{
   const r=sdk.inspectSecurityDisclosureV2(f.batch,f.policy,f.catalog,f.closure);
   const expected=c.expected==='validated-disclosure';
   let json=false,yaml=false,encoderRefuses=false,decoderRefuses=false;
   if(expected&&r.status==='validated-disclosure'){
    try{for(const format of ['json','yaml']){
     const text=sdk.encodeSecurityDisclosureV2(f.batch,f.policy,f.catalog,f.closure,format);
     const decoded=sdk.decodeSecurityDisclosureV2(text,f.policy,f.catalog,f.closure,format);
     const ok=JSON.stringify(decoded)===JSON.stringify(f.batch)&&deeplyFrozen(decoded);
     if(format==='json')json=ok;else yaml=ok;
    }}catch{}
   }else if(!expected){
    try{sdk.encodeSecurityDisclosureV2(f.batch,f.policy,f.catalog,f.closure);}catch{encoderRefuses=true;}
    try{sdk.decodeSecurityDisclosureV2(JSON.stringify(f.batch),f.policy,f.catalog,f.closure);}catch{decoderRefuses=true;}
   }
   passed=r.status===c.expected&&r.complete===false&&r.authority===false&&deeplyFrozen(r)&&JSON.stringify(r.source)===JSON.stringify(f.batch)
    &&JSON.stringify(r.policy)===JSON.stringify(f.policy)&&JSON.stringify(r.catalog)===JSON.stringify(f.catalog)&&JSON.stringify(r.closure)===JSON.stringify(f.closure)
    &&JSON.stringify(f)===before&&(expected?(JSON.stringify(r.batch)===JSON.stringify(f.batch)&&json&&yaml):(r.batch===null&&encoderRefuses&&decoderRefuses));
   actual={status:r.status,batchNull:r.batch===null,complete:r.complete,authority:r.authority,json,yaml,...(!expected?{encoderRefuses,decoderRefuses}:{}),
    ...(passed?{}:{errors:r.diagnostics.filter((d:any)=>d.severity==='error')})};
  }
  rows.push({id:c.id,expected:c.expected,passed,actual});
 }
 const f=clone(packet.base),r=sdk.inspectSecurityDisclosureV2(f.batch,f.policy,f.catalog,f.closure);
 const states=r.batch?.rows.map((row:any[])=>{const c=row[0];return{disposition:c.disposition,...(Object.hasOwn(c,'value')?{value:c.value}:{}),...(c.outputDomain?{outputDomain:c.outputDomain}:{})};});
 rows.push({id:'five-nonstored-states-distinct-independent-summary',expected:packet.expectedBaseStates,actual:states,passed:JSON.stringify(states)===JSON.stringify(packet.expectedBaseStates)});
 const retained=r.batch?JSON.stringify(r.batch):'';f.batch.rows[0][0]={disposition:'withheld'};f.policy.revision='mutated';f.catalog.revision='mutated';f.closure.pins[0].revision='mutated';
 rows.push({id:'input-mutation-does-not-alter-output',expected:true,actual:r.batch?JSON.stringify(r.batch)===retained:false,passed:r.batch?JSON.stringify(r.batch)===retained:false});
 for(const format of ['',null,'JSON','toml',{},true]){
  let encodeRefused=false,decodeRefused=false;
  try{sdk.encodeSecurityDisclosureV2(packet.base.batch,packet.base.policy,packet.base.catalog,packet.base.closure,format);}catch{encodeRefused=true;}
  try{sdk.decodeSecurityDisclosureV2(JSON.stringify(packet.base.batch),packet.base.policy,packet.base.catalog,packet.base.closure,format);}catch{decodeRefused=true;}
  rows.push({id:'invalid-format-'+JSON.stringify(format),expected:true,actual:{encodeRefused,decodeRefused},passed:encodeRefused&&decodeRefused});
 }
 let getters=0;const hostile={get version(){getters++;return 'umf.security.disclosure/0.2.0';}};
 const hostileResult=sdk.inspectSecurityDisclosureV2(hostile,packet.base.policy,packet.base.catalog,packet.base.closure);
 rows.push({id:'accessor-not-invoked',expected:{getters:0,status:'refused',batch:null},actual:{getters,status:hostileResult.status,batch:hostileResult.batch},passed:getters===0&&hostileResult.status==='refused'&&hostileResult.batch===null});
 const unknown=clone(packet.base.batch) as any;unknown.future={opaque:'preserve\r\n😀'};
 const inspected=sdk.inspectSecurityDisclosureV2(unknown,packet.base.policy,packet.base.catalog,packet.base.closure);
 let retainedUnknown=JSON.stringify(inspected.source)===JSON.stringify(unknown)&&inspected.batch===null;
 for(const format of ['json','yaml'])retainedUnknown&&=JSON.stringify(sdk.readProtectionSource(sdk.writeProtectionSource(unknown,format),format))===JSON.stringify(unknown);
 rows.push({id:'unknown-source-retained-without-batch-admission',expected:true,actual:retainedUnknown,passed:retainedUnknown});
 for(const text of [null,{},1]){
  let code:any=null;try{sdk.decodeSecurityDisclosureV2(text,packet.base.policy,packet.base.catalog,packet.base.closure);}catch(e:any){code=e.code;}
  rows.push({id:'decode-nontext-'+JSON.stringify(text),expected:'SECURITY_DISCLOSURE_V2',actual:code,passed:code==='SECURITY_DISCLOSURE_V2'});
 }
 const large=clone(packet.base) as any;large.batch.rows=[];large.batch.columns=[];
 for(let i=0;i<180;i++){
  const id='\x01'.repeat(4000)+i;
  large.closure.documents[0].document.modules[0].elements.push({id,kind:'field',cardinality:'one',scalarType:'string',nullability:'required',extensions:{}});
  large.batch.columns.push({field:ref(id),storageEffect:'canonical'});
 }
 const largeResult=sdk.inspectSecurityDisclosureV2(large.batch,large.policy,large.catalog,large.closure);let encodeCode:any=null;
 try{sdk.encodeSecurityDisclosureV2(large.batch,large.policy,large.catalog,large.closure);}catch(e:any){encodeCode=e.code;}
 rows.push({id:'encoded-text-cap-is-separate-from-inspection',expected:{status:'validated-disclosure',encodeCode:'SECURITY_DISCLOSURE_V2'},actual:{status:largeResult.status,encodeCode},passed:largeResult.status==='validated-disclosure'&&encodeCode==='SECURITY_DISCLOSURE_V2'});
 const old=sdk.LIMITS.maxTextLength;let fixedBound=false;
 try{sdk.LIMITS.maxTextLength=8_000_000;const x=clone(packet.base) as any;x.batch.rows=[[{disposition:'original',value:{string:'x'.repeat(4_000_001)}}]];
  const r=sdk.inspectSecurityDisclosureV2(x.batch,x.policy,x.catalog,x.closure);fixedBound=r.status==='refused'&&r.batch===null&&r.diagnostics.some((d:any)=>d.code==='SECURITY_DISCLOSURE_V2_BOUND');
 }finally{sdk.LIMITS.maxTextLength=old;}
 rows.push({id:'public-limit-mutation-does-not-widen-private-text-ledger',expected:true,actual:fixedBound,passed:fixedBound});
 return rows;
}
