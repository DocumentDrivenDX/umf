import {SecurityPublicationCustody} from '../../src/extensions/security/publication-custody';
// @covers US-057-AC2
// @covers US-057-AC7
export async function publicationCustodyCorpus(){
 const observations:{id:string,expected:unknown,observed:unknown}[]=[];
 const check=(id:string,expected:unknown,observed:unknown)=>{observations.push({id,expected,observed});if(JSON.stringify(expected)!==JSON.stringify(observed))throw Error(id);};
 const code=async(operation:()=>unknown)=>{try{await operation();return 'allowed';}catch(error){return (error as {code?:string}).code;}};
 const denied='SECURITY_PUBLICATION_REFUSED',unknown='SECURITY_PUBLICATION_UNKNOWN';
 let calls=0;const p=new SecurityPublicationCustody(async()=>{calls++;});
 check('open-publisher-cannot-retire',denied,await code(()=>p.retire()));
 const original={rows:[{id:'9223372036854775807',value:null}]};const first=p.retain(original);original.rows[0]!.id='changed';
 const replay=p.retain({rows:[{id:'9223372036854775807',value:null}]});
 p.backendLost();p.seal();check('loss-and-replay-block-retirement',denied,await code(()=>p.retire()));check('no-premature-native-call',0,calls);
 check('sealed-cannot-retain',denied,await code(()=>p.retain([])));
 let entered!:()=>void,release!:()=>void;const entry=new Promise<void>(r=>entered=r),ack=new Promise<void>(r=>release=r);
 const consuming=p.consume(first,async payload=>{check('owned-copy-preserves-carriers',{rows:[{id:'9223372036854775807',value:null}]},payload);entered();await ack;});await entry;
 check('inflight-cannot-discard',denied,await code(()=>p.discard(first)));
 check('inflight-cannot-consume-twice',denied,await code(()=>p.consume(first,async()=>{})));
 check('inflight-blocks-retirement',denied,await code(()=>p.retire()));release();await consuming;
 check('drained-handle-cannot-replay',denied,await code(()=>p.consume(first,async()=>{})));
 check('remaining-replay-blocks-retirement',denied,await code(()=>p.retire()));p.discard(replay);await p.retire();check('exact-one-native-retirement',1,calls);
 check('terminal-cannot-retire',denied,await code(()=>p.retire()));check('terminal-cannot-retain',denied,await code(()=>p.retain([])));
 const other=new SecurityPublicationCustody(async()=>{}),foreign=other.retain([]),ownership=new SecurityPublicationCustody(async()=>{}),local=ownership.retain(['local']);
 check('cross-publisher-handle-refuses',denied,await code(()=>ownership.discard(foreign)));ownership.seal();
 check('foreign-refusal-preserves-local-custody',denied,await code(()=>ownership.retire()));ownership.discard(local);
 check('local-drain-allows-own-retirement','allowed',await code(()=>ownership.retire()));
 check('forged-handle-refuses',denied,await code(()=>other.discard({kind:'security-publication-buffer'})));
 let failures=0;const failed=new SecurityPublicationCustody(async()=>{failures++;});const f=failed.retain(['private']);failed.seal();
 check('consumer-failure-quarantines',unknown,await code(()=>failed.consume(f,async()=>{throw Error('private');})));
 check('quarantine-cannot-discard',denied,await code(()=>failed.discard(f)));check('quarantine-cannot-retire',denied,await code(()=>failed.retire()));check('failed-consumer-never-retires-native',0,failures);
 const uncertain=new SecurityPublicationCustody(async()=>{throw Error('possibly committed');});uncertain.seal();
 check('native-failure-unknown',unknown,await code(()=>uncertain.retire()));check('native-unknown-no-retry',denied,await code(()=>uncertain.retire()));
 let getterCalls=0;const hostile=Object.defineProperty({},'secret',{enumerable:true,get(){getterCalls++;return 'secret';}});
 check('accessor-refuses','NON_JSON',await code(()=>other.retain(hostile)));check('accessor-not-invoked',0,getterCalls);
 let reentrantCalls=0,sealCode:unknown,retirementAttempt:Promise<unknown>|undefined;
 const reentrant=new SecurityPublicationCustody(async()=>{reentrantCalls++;});
 const proxy=new Proxy({}, {getPrototypeOf(){
  try{reentrant.seal();sealCode='allowed';}catch(error){sealCode=(error as {code:string}).code;}
  retirementAttempt=code(()=>reentrant.retire());return Object.prototype;
 }});
 const managed=reentrant.retain(proxy);
 check('proxy-reentry-seal-refuses',denied,sealCode);check('proxy-reentry-retirement-refuses',denied,await retirementAttempt);
 check('proxy-reentry-native-not-called',0,reentrantCalls);reentrant.seal();
 check('proxy-retained-buffer-blocks-retirement',denied,await code(()=>reentrant.retire()));reentrant.discard(managed);await reentrant.retire();
 check('proxy-retirement-after-drain',1,reentrantCalls);
 const bounded=new SecurityPublicationCustody(async()=>{});for(let i=0;i<128;i++)bounded.retain(null);
 check('buffer-bound-refuses',denied,await code(()=>bounded.retain(null)));
 return observations;
}
