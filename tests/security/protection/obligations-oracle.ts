// SPDX-License-Identifier: MIT OR Apache-2.0
import * as api from '../../../src/index';
import packet from './obligations-fixtures.json';
const sdk=api as any;
const clone=(v:any)=>structuredClone(v);
const equal=(a:any,b:any)=>JSON.stringify(a)===JSON.stringify(b);
function frozen(v:any):boolean{return v===null||typeof v!=='object'||Object.isFrozen(v)&&Object.values(v).every(frozen);}
function change(f:any,op:any){const path=op.path.slice(1).split('/').map((s:string)=>s.replace(/~1/g,'/').replace(/~0/g,'~'));const key=path.pop()!;let at=f;for(const p of path)at=at[p];if(op.op==='remove'){if(Array.isArray(at))at.splice(Number(key),1);else delete at[key];}else at[key]=clone(op.value);}
export function materialize(c:any){
 const f=clone(packet.base);for(const op of c.changes)change(f,op);
 const x=c.expand;
 if(x?.kind==='purposes'){f.ontology.actions=Array.from({length:x.count},(_,i)=>'purpose-'+i);f.ontology.actionPurposes=f.ontology.actions.map((action:string)=>({action,purposes:['other']}));}
 if(x?.kind==='action'){f.ontology.actions[0]='x'.repeat(x.length);f.ontology.actionPurposes[0].action=f.ontology.actions[0];}
 if(x?.kind==='purpose-text')f.ontology.actionPurposes[0].action='x'.repeat(x.length);
 if(x?.kind==='catalog-text')f.catalog.native={opaque:'x'.repeat(x.length)};
 return f;
}
export function runOracle(id:'S21'|'S22'|'S23'){
 const rows:any[]=[];
 for(const c of packet.cases as any[]){
  if(c.group!==id)continue;
  const f=materialize(c),before=JSON.stringify(f);let r:any,passed=false,actual:any;
  try{
   if(c.mode==='purposes'){
    r=sdk.inspectSecurityActionPurposes(f.ontology,f.closure.documents);
    passed=r.status===c.expected&&equal(r.purposes,c.expectedPurposes)&&equal(r.ontology,f.ontology)&&equal(r.documents,f.closure.documents);
    actual={status:r.status,purposesExact:equal(r.purposes,c.expectedPurposes)};
   }else if(c.mode==='codec'){
    r=sdk.inspectSecurityDisclosureV2(f.batch,f.policy,f.catalog,f.closure);
    let json=false,yaml=false,encoderRefuses=false;
    if(c.expected==='validated-disclosure')for(const format of ['json','yaml']){
     const text=sdk.encodeSecurityDisclosureV2(f.batch,f.policy,f.catalog,f.closure,format);
     const decoded=sdk.decodeSecurityDisclosureV2(text,f.policy,f.catalog,f.closure,format);
     const ok=equal(decoded,f.batch)&&frozen(decoded);if(format==='json')json=ok;else yaml=ok;
    }
    else try{sdk.encodeSecurityDisclosureV2(f.batch,f.policy,f.catalog,f.closure);}catch{encoderRefuses=true;}
    passed=r.status===c.expected&&equal(r.source,f.batch)&&equal(r.policy,f.policy)&&equal(r.catalog,f.catalog)&&equal(r.closure,f.closure)
      &&(c.expected==='validated-disclosure'?equal(r.batch,f.batch)&&json&&yaml:r.batch===null&&encoderRefuses);
    actual={status:r.status,json,yaml,encoderRefuses,batchNull:r.batch===null};
   }else{
    r=sdk.inspectProtectionObligations(f.policy,f.catalog,f.closure,f.ontology);
    passed=r.status===c.expected&&equal(r.obligations,c.expectedObligations)&&equal(r.policy,f.policy)&&equal(r.catalog,f.catalog)&&equal(r.closure,f.closure)&&equal(r.ontology,f.ontology);
    if(c.expected==='declared-obligations')passed&&=equal(r.purposes,f.ontology.actionPurposes)&&r.obligations.every((o:any)=>o.status==='unverified');
    actual={status:r.status,obligationsExact:equal(r.obligations,c.expectedObligations),obligationCount:r.obligations.length};
   }
   passed&&=r.complete===false&&r.authority===false&&frozen(r)&&JSON.stringify(f)===before&&(!c.code||r.diagnostics.some((d:any)=>d.severity==='error'&&d.code===c.code));
   actual={...actual,complete:r.complete,authority:r.authority,...(!passed?{errors:r.diagnostics.filter((d:any)=>d.severity==='error')}:{} )};
  }catch(e:any){actual={unexpectedException:e?.message??String(e)};passed=false;}
  rows.push({id:c.id,expected:c.expected,passed,actual});
 }
 const emit=(name:string,expected:any,actual:any,passed:boolean)=>rows.push({id:name,expected,actual,passed});
 const f=clone(packet.base) as any;
 if(id==='S21'){
  const r=sdk.inspectProtectionObligations(f.policy,f.catalog,f.closure,f.ontology),saved=JSON.stringify(r);
  f.catalog.transforms[2].custody.owner='mutated';f.policy.revision='mutated';f.ontology.actionPurposes[0].purposes=['reverse'];f.closure.pins[0].revision='mutated';
  emit('all-four-source-snapshots-detached',true,JSON.stringify(r)===saved,JSON.stringify(r)===saved&&frozen(r));
  let calls=0;const bad={get version(){calls++;return '0.2.0';}};
  const badResult=sdk.inspectProtectionObligations(packet.base.policy,packet.base.catalog,packet.base.closure,bad);
  emit('ontology-accessor-never-invoked',{calls:0,status:'refused',obligations:[]},{calls,status:badResult.status,obligations:badResult.obligations},calls===0&&badResult.status==='refused'&&badResult.obligations.length===0);
  const x=clone(packet.base) as any;x.catalog.transforms[3].reverseAction='alpha';const q=sdk.inspectProtectionObligations(x.policy,x.catalog,x.closure,x.ontology);
  emit('late-refusal-clears-obligations-retains-validated-purposes',true,{empty:q.obligations.length===0,purposes:equal(q.purposes,x.ontology.actionPurposes)},q.status==='refused'&&q.obligations.length===0&&equal(q.purposes,x.ontology.actionPurposes));
  let denied=false;try{sdk.requireProtectionInterpretation(packet.base.catalog);}catch{denied=true;}
  emit('complete-interpretation-stays-closed',true,denied,denied);
  const old=sdk.LIMITS.maxTextLength;let bounded=false;
  try{sdk.LIMITS.maxTextLength=8_000_000;const x=clone(packet.base) as any;x.ontology.actionPurposes[0].action='x'.repeat(4_000_001);const r=sdk.inspectSecurityActionPurposes(x.ontology,x.closure.documents);bounded=r.status==='refused'&&r.purposes.length===0&&r.diagnostics.some((d:any)=>d.code==='SECURITY_ACTION_PURPOSE_BOUND');}finally{sdk.LIMITS.maxTextLength=old;}
  emit('public-limits-cannot-widen-private-purpose-ledger',true,bounded,bounded);
 }
 if(id==='S22'){
  const x=clone(packet.base) as any;delete x.ontology.actionPurposes;
  const q=sdk.inspectSecurityActionPurposes(x.ontology,x.closure.documents);
  emit('missing-purpose-closure-never-defaults-from-action-names',true,{status:q.status,purposes:q.purposes},q.status==='refused'&&q.purposes.length===0);
  const token=sdk.inspectSecurityDisclosureV2(f.batch,f.policy,f.catalog,f.closure);
  const cell=token.batch?.rows[0]?.[0];emit('original-token-remains-exact-opaque-value',f.batch.rows[0][0],cell,equal(cell,f.batch.rows[0][0])&&!Object.hasOwn(cell??{},'plaintext')&&token.authority===false);
  const role=sdk.inspectSecurityActionPurposes(f.ontology,f.closure.documents),saved=JSON.stringify(role);f.ontology.actions[0]='changed';f.closure.documents[0].document.id='changed';
  emit('purpose-snapshot-detached',true,JSON.stringify(role)===saved,JSON.stringify(role)===saved&&frozen(role));
 }
 if(id==='S23'){
  const x=clone(packet.base) as any;x.catalog.transforms[3].custody.propagation.future={unknown:'preserved\u0000🔒'};
  const r=sdk.inspectProtectionObligations(x.policy,x.catalog,x.closure,x.ontology);let roundtrip=true;
  for(const format of ['json','yaml'])roundtrip&&=equal(sdk.readProtectionSource(sdk.writeProtectionSource(r.catalog,format),format),x.catalog);
  emit('unknown-propagation-preserved-json-and-yaml',true,{roundtrip,status:r.status},roundtrip&&r.status==='refused'&&r.obligations.length===0);
  const q=sdk.inspectProtectionObligations(f.policy,f.catalog,f.closure,f.ontology);
  const expected=['history','snapshots','exports','feeds','caches','history','snapshots','exports','feeds','caches'];
  const got=q.obligations.filter((o:any)=>o.kind==='propagation').map((o:any)=>o.declaration.channel);
  emit('ordered-five-channel-obligations-both-stores',expected,got,equal(got,expected));
 }
 return rows;
}
