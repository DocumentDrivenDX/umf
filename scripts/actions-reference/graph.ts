import type {CoreRelationship} from '../../src/validation/relationships';
import {knownActionRelationship} from '../../src/extensions/actions/known-model';
import type {SQL} from 'bun';
import {copyJson} from '../../src/model/json';
import {UmfError,type Document} from '../../src/model/types';
import {referenceCreationRelationships} from './creation-relationships';
import {encodeReferenceIdentity,decodeReferenceJson} from './codec';
import type {ReferenceStoreControl} from './store';
import type {NativeReferenceEntity,NativeReferenceLink} from './state';
export interface ReferenceGraphCandidate {entities:NativeReferenceEntity[];changes:{kind:'created'|'updated'|'deleted';entity:NativeReferenceEntity}[];links:{kind:'linked'|'unlinked';link:NativeReferenceLink}[]}
const same=(left:{module:string;element:string},right:{module:string;element:string})=>left.module===right.module&&left.element===right.element;
const linkIdentity=(link:NativeReferenceLink)=>encodeReferenceIdentity(link);
/** Executor-owned invariant reads under the retained store control lock; never a rule/handler snapshot. */
export async function verifyReferenceGraph(tx:SQL,control:ReferenceStoreControl,source:Document,candidateInput:ReferenceGraphCandidate):Promise<void>{
 const candidate=copyJson(candidateInput) as unknown as ReferenceGraphCandidate,entities=new Map(candidate.entities.map(entity=>[entity.id,entity])),deleted=new Set(candidate.changes.filter(change=>change.kind==='deleted').map(change=>change.entity.id)),created=new Set(candidate.changes.filter(change=>change.kind==='created').map(change=>change.entity.id));
 const affected=new Set([...created,...deleted,...candidate.links.flatMap(change=>[change.link.sourceEntity,change.link.targetEntity])]);
 for(const change of candidate.changes)entities.set(change.entity.id,change.entity);
 for(const change of candidate.links){const definition=knownActionRelationship(source,change.link.relationship) as CoreRelationship;if(!definition.directed||definition.targetLifecycle!=='independent'||definition.associationRecord)throw new UmfError('ACTION_NATIVE_RELATIONSHIP','Candidate relationship arrangement unqualified');if(!entities.has(change.link.sourceEntity)||!entities.has(change.link.targetEntity))throw new UmfError('CONSTRAINT','Candidate relationship endpoint unresolved');const from=entities.get(change.link.sourceEntity)!,to=entities.get(change.link.targetEntity)!;if(!definition.source.some(endpoint=>same(endpoint,from.record))||!definition.target.some(endpoint=>same(endpoint,to.record)))throw new UmfError('CONSTRAINT','Candidate relationship orientation mismatch');if(change.kind==='linked'&&(deleted.has(change.link.sourceEntity)||deleted.has(change.link.targetEntity)))throw new UmfError('CONSTRAINT','Candidate relationship reuses deleted endpoint');}
 for(const id of affected){const entity=entities.get(id);if(!entity)throw new UmfError('CONSTRAINT','Candidate invariant endpoint unresolved');
  if(!created.has(id)){if(!/^[1-9][0-9]*$/.test(id))throw new UmfError('CONSTRAINT','Native invariant identity invalid');const rows=await tx`select record from action_entity where store=${control.id} and id=${id}`;if(rows.length!==1||encodeReferenceIdentity(decodeReferenceJson(rows[0]!.record))!==encodeReferenceIdentity(entity.record))throw new UmfError('CONSTRAINT','Native invariant endpoint unresolved or Record mismatch');}
  const incident=referenceCreationRelationships(source,entity.record);
  if(deleted.has(id)){
   const rows=await tx`select relationship,source_entity::text,target_entity::text from action_link where store=${control.id} and (source_entity=${id} or target_entity=${id})`;
   const seen=new Set<string>();for(const row of rows){const link:NativeReferenceLink={relationship:decodeReferenceJson(row.relationship) as unknown as NativeReferenceLink['relationship'],sourceEntity:row.source_entity,targetEntity:row.target_entity};const identity=linkIdentity(link);if(seen.has(identity))throw new UmfError('CONSTRAINT','Duplicate native relationship set member');seen.add(identity);if(!candidate.links.some(change=>change.kind==='unlinked'&&linkIdentity(change.link)===linkIdentity(link)))throw new UmfError('CONSTRAINT','Independent relationships must be explicitly unlinked before deletion');}
   continue;
  }
  for(const {reference,relation} of incident){
   const encoded=encodeReferenceIdentity(reference),edges=new Map<string,NativeReferenceLink>();
   if(!created.has(id)){
    const rows=await tx`select l.source_entity::text,l.target_entity::text,s.record as source_record,t.record as target_record from action_link l join action_entity s on s.store=l.store and s.id=l.source_entity join action_entity t on t.store=l.store and t.id=l.target_entity where l.store=${control.id} and l.relationship=${encoded} and (l.source_entity=${id} or l.target_entity=${id})`;
    for(const row of rows){const sourceRecord=decodeReferenceJson(row.source_record) as unknown as NativeReferenceEntity['record'],targetRecord=decodeReferenceJson(row.target_record) as unknown as NativeReferenceEntity['record'];if(!relation.source.some(endpoint=>same(endpoint,sourceRecord))||!relation.target.some(endpoint=>same(endpoint,targetRecord)))throw new UmfError('CONSTRAINT','Native invariant relationship orientation mismatch');const link={relationship:reference,sourceEntity:row.source_entity,targetEntity:row.target_entity},identity=linkIdentity(link);if(edges.has(identity))throw new UmfError('CONSTRAINT','Duplicate native relationship set member');edges.set(identity,link);}
   }
   for(const change of candidate.links){if(encodeReferenceIdentity(change.link.relationship)!==encoded||change.link.sourceEntity!==id&&change.link.targetEntity!==id)continue;const from=entities.get(change.link.sourceEntity)!,to=entities.get(change.link.targetEntity)!;if(!relation.source.some(endpoint=>same(endpoint,from.record))||!relation.target.some(endpoint=>same(endpoint,to.record)))throw new UmfError('CONSTRAINT','Candidate relationship orientation mismatch');const identity=linkIdentity(change.link);if(change.kind==='linked')edges.set(identity,change.link);else edges.delete(identity);}
   if([...edges.values()].some(link=>deleted.has(link.sourceEntity)||deleted.has(link.targetEntity)))throw new UmfError('CONSTRAINT','Remaining relationship references deleted endpoint');
   const check=(degree:number,bound:{min:number;max:number|'*'})=>{if(degree<bound.min||bound.max!=='*'&&degree>bound.max)throw new UmfError('CONSTRAINT','Final relationship multiplicity violated');};
   if(relation.source.some(endpoint=>same(endpoint,entity.record)))check(new Set([...edges.values()].filter(link=>link.sourceEntity===id).map(link=>link.targetEntity)).size,relation.targetMultiplicity);
   if(relation.target.some(endpoint=>same(endpoint,entity.record)))check(new Set([...edges.values()].filter(link=>link.targetEntity===id).map(link=>link.sourceEntity)).size,relation.sourceMultiplicity);
  }
 }
}
