import {retainReferenceReceipt} from './versions';
import {ReferenceCommitUncertain,referenceConnectionFailure} from './transaction-failures';
import {SQL} from 'bun';
import {encodeReferenceIdentity,encodeReferenceJson,decodeReferenceJson} from './codec';
export interface ReferenceStoreControl {id:string;store:string;tenant:string;epoch:string;invocation_fenced:boolean;business_sequence:bigint;policy_version:bigint}
/** Host-only actual PostgreSQL foundation; digest bucket matches always require exact retained identity. */
export class ReferenceActionStore {
 readonly sql:SQL;
 constructor(readonly url:string){this.sql=new SQL({url,max:8});}
 async initialize():Promise<void>{await this.sql.unsafe(await Bun.file(new URL('./store.sql',import.meta.url)).text()).simple();}
 async create(store:string,tenant:string,epoch:string):Promise<string>{return this.sql.begin('isolation level read committed',tx=>this.createWithin(tx,store,tenant,epoch));}
 /** Trusted operator helper for atomic creation with validated genesis content. */
 async createWithin(tx:SQL,store:string,tenant:string,epoch:string):Promise<string>{const identity=encodeReferenceIdentity(store);const rows=await tx`insert into action_store(identity,tenant,epoch) values (${identity},${encodeReferenceJson(tenant)},${encodeReferenceJson(epoch)}) returning id::text`;const id=rows[0]!.id;await tx`insert into action_store_epoch(store,identity) values (${id},${encodeReferenceIdentity(epoch)})`;await retainReferenceReceipt(tx,{id,store,tenant,epoch,invocation_fenced:false,business_sequence:0n,policy_version:0n});return id;}
 async transaction<T>(store:string,operation:(tx:SQL,control:ReferenceStoreControl)=>Promise<T>):Promise<T>{
  const identity=encodeReferenceIdentity(store);
  try{return await this.sql.begin('isolation level read committed',async tx=>{const rows=await tx`select id::text,identity,tenant,epoch,invocation_fenced,business_sequence::text,policy_version::text from action_store where lookup=action_identity_lookup(${identity}) and identity=${identity} for update`;if(rows.length!==1)throw Error('Reference store does not resolve');const row=rows[0]!;return operation(tx,{id:row.id,store:decodeReferenceJson(row.identity) as string,tenant:decodeReferenceJson(row.tenant) as string,epoch:decodeReferenceJson(row.epoch) as string,invocation_fenced:row.invocation_fenced,business_sequence:BigInt(row.business_sequence),policy_version:BigInt(row.policy_version)});});}catch(error){if(referenceConnectionFailure(error))throw new ReferenceCommitUncertain();throw error;}
 }
 async close():Promise<void>{await this.sql.close();}
}
