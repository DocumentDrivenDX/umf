import {inspectActions,registerActions} from '../../src/extensions/actions';
import {Registry} from '../../src/registry/registry';
import {knownActionModel} from '../../src/extensions/actions/known-model';
import {encodeCoreKeyTuple,type CoreKeyTupleValue} from '../../src/model/key-tuple';
import {actionFieldValueKey} from '../../src/extensions/actions/evaluation';
import {referenceCreationRelationships} from './creation-relationships';
import {copyJson} from '../../src/model/json';
import {UmfError,type Document} from '../../src/model/types';
import {ReferenceActionStore,type ReferenceStoreControl} from './store';
import {snapshotReferenceProjection} from './projection';
import {seedReferenceEntity,validateReferenceFields,referenceAliasIdentity,type NativeReferenceEntity} from './state';
import {verifyReferenceGraph} from './graph';
import {referenceStoreVersion} from './versions';
import {encodeReferenceIdentity,encodeReferenceJson,decodeReferenceJson} from './codec';
const name=(value:unknown):value is string=>typeof value==='string'&&value.length>0&&value.length<=256;
/** Trusted offline operator only. The host must prevent executor exposure before this boundary. */
export class ReferenceActionRestore {
 constructor(readonly store:ReferenceActionStore){}
 /** A backup may erase its earlier fence. Establish a fresh epoch and permanent refusal before exposure. */
 async fenceRestored(store:string):Promise<{store:string;epoch:string}>{
  const epoch=crypto.randomUUID();return this.store.transaction(store,async(tx,control)=>{
   await tx`insert into action_store_epoch(store,identity) values (${control.id},${encodeReferenceIdentity(epoch)})`;
   // Backup authority may predate revocation. Preserve bindings but suspend all token discovery.
   await tx`update action_replay_policy set enabled=false where store=${control.id} and enabled`;
   await tx`update action_store set epoch=${encodeReferenceJson(epoch)},invocation_fenced=true,restore_fenced=true,policy_version=policy_version+1 where id=${control.id}`;
   return {store:control.store,epoch};
  });
 }
 /** Whole restored database stays offline until every retained namespace has been fenced. */
 async fenceRestoredDatabase():Promise<{store:string;epoch:string}[]>{
  return this.store.sql.begin('isolation level read committed',async tx=>{await tx`select singleton from action_registry where singleton for update`;const rows=await tx`select id::text,identity from action_store order by id for update`,result:{store:string;epoch:string}[]=[];for(const row of rows){const epoch=crypto.randomUUID();await tx`insert into action_store_epoch(store,identity) values (${row.id},${encodeReferenceIdentity(epoch)})`;await tx`update action_replay_policy set enabled=false where store=${row.id} and enabled`;await tx`update action_store set epoch=${encodeReferenceJson(epoch)},invocation_fenced=true,restore_fenced=true,policy_version=policy_version+1 where id=${row.id}`;result.push({store:decodeReferenceJson(row.identity) as string,epoch});}return result;});
 }
 /** Explicit new identity accepts validated native content as genesis; no old decisions or authority migrate. */
 async newNamespace(original:string,label:string,sourceInput:Document):Promise<{store:string;epoch:string;version:string}>{
  if(!name(label)||label.length>200||label===original)throw new UmfError('PARAMETER','Expected a distinct new store identity');const newStore=label+'/'+crypto.randomUUID(),copied=copyJson(sourceInput) as unknown as Document,inspection=inspectActions(copied,registerActions(new Registry()));if(!inspection.validation.valid)throw new UmfError('PARAMETER','Invalid genesis document');const source=inspection.source,epoch=crypto.randomUUID();
  return this.store.transaction(original,async(tx,old)=>{
   const [fence]=await tx`select restore_fenced from action_store where id=${old.id}`;if(!old.invocation_fenced||!fence!.restore_fenced)throw new UmfError('REVISION','Uncertain original namespace must remain fenced');
   const graph=await snapshotReferenceProjection(tx,old);
   const visited=new Set<string>(),qualify=(reference:{module:string;element:string})=>{const key=encodeReferenceIdentity(reference);if(visited.has(key))return;visited.add(key);if(!Object.values(reference).every(name))throw new UmfError('ACTION_NATIVE_DOMAIN','Unqualified genesis identity');const record=knownActionModel(source,reference,'record');if(record.references?.length)throw new UmfError('ACTION_NATIVE_DOMAIN','Genesis Record references require separate qualification');for(const member of (record.members??[]) as {module:string;element:string}[]){const field=knownActionModel(source,member,'field');if(!Object.values(member).every(name)||!['boolean','integer','string'].includes(field.scalarType??'')||field.cardinality!=='one'||!['required','absent-allowed'].includes(field.nullability as string)||field.references?.length||field.itemType)throw new UmfError('ACTION_NATIVE_DOMAIN','Unqualified genesis field');}for(const key of (record.keys??[]) as {id:string}[])if(!name(key.id))throw new UmfError('ACTION_NATIVE_DOMAIN','Unqualified genesis key');for(const {relation} of referenceCreationRelationships(source,reference))for(const endpoint of [...relation.source,...relation.target])qualify(endpoint);};
   for(const item of graph.entities){qualify(item.record);const fields=validateReferenceFields(source,item.record,item.fields),definition=knownActionModel(source,item.record,'record'),keys=(definition.keys??[]) as {id:string;primary:boolean;fields:{module:string;element:string}[]}[],aliases=keys.map(key=>{const entity={key:{...item.record,key:key.id},components:key.fields.map(field=>fields[actionFieldValueKey(field)]!)};return {identity:referenceAliasIdentity(entity,encodeCoreKeyTuple(source,entity.key,entity.components as CoreKeyTupleValue[]).bytesHex),tuple:encodeCoreKeyTuple(source,entity.key,entity.components as CoreKeyTupleValue[]).bytesHex,primary:key.primary};}),primary=aliases.find(alias=>alias.primary),stored=await tx`select identity,primary_key from action_entity where store=${old.id} and id=${item.id}`,retained=await tx`select identity from action_key_alias where store=${old.id} and entity=${item.id}`;if(!primary||stored.length!==1||stored[0]!.identity!==primary.identity||stored[0]!.primary_key!==primary.tuple||retained.length!==aliases.length||retained.some((row:any)=>!aliases.some(alias=>alias.identity===row.identity)))throw new UmfError('SELECTOR','Restored alias inventory requires separate reconciliation');}
   const id=await this.store.createWithin(tx,newStore,old.tenant,epoch),control:ReferenceStoreControl={id,store:newStore,tenant:old.tenant,epoch,invocation_fenced:false,business_sequence:0n,policy_version:0n},mapped=new Map<string,string>(),entities:NativeReferenceEntity[]=[];
   for(const item of graph.entities){const version=crypto.randomUUID(),next=await seedReferenceEntity(tx,control,source,item.record,item.fields,version);mapped.set(item.id,next);entities.push({...item,id:next,version});}
   const links=graph.links.map(item=>({...item,sourceEntity:mapped.get(item.sourceEntity)!,targetEntity:mapped.get(item.targetEntity)!}));
   // All imported records are new, including isolated records: every incident lower bound is checked.
   await verifyReferenceGraph(tx,control,source,{entities,changes:entities.map(entity=>({kind:'created',entity})),links:links.map(link=>({kind:'linked',link}))});
   for(const item of links)await tx`insert into action_link(store,identity,relationship,source_entity,target_entity) values (${id},${encodeReferenceIdentity([item.relationship,item.sourceEntity,item.targetEntity])},${encodeReferenceIdentity(item.relationship)},${item.sourceEntity},${item.targetEntity})`;
   return {store:newStore,epoch,version:referenceStoreVersion(control)};
  });
 }
}
