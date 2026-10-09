import {createHash} from 'node:crypto';
import type {ReferenceStoreControl} from './store';
import {encodeReferenceIdentity} from './codec';
export function referenceStoreVersion(control:ReferenceStoreControl,sequence=control.business_sequence):string{return createHash('sha256').update(encodeReferenceIdentity([control.store,control.epoch,sequence.toString()])).digest('hex');}

/** Executor-owned receipt ordering, committed in the same native boundary as its business fact. */
export async function retainReferenceReceipt(tx:import('bun').SQL,control:ReferenceStoreControl,sequence=control.business_sequence):Promise<string>{
 const version=referenceStoreVersion(control,sequence),identity=encodeReferenceIdentity([control.epoch,version]),epoch=encodeReferenceIdentity(control.epoch),encodedVersion=encodeReferenceIdentity(version),rows=await tx`select sequence::text,epoch,version from action_receipt where store=${control.id} and lookup=action_identity_lookup(${identity}) and identity=${identity}`;
 if(rows.length){if(rows.length!==1||rows[0]!.sequence!==sequence.toString()||rows[0]!.epoch!==epoch||rows[0]!.version!==encodedVersion)throw Error('Receipt ordering conflicts with retained identity');return version;}
 await tx`insert into action_receipt(store,identity,epoch,version,sequence) values (${control.id},${identity},${epoch},${encodedVersion},${sequence.toString()})`;return version;
}
