import type {CoreRelationship} from '../../src/validation/relationships';
import type {Document} from '../../src/model/types';
import {UmfError} from '../../src/model/types';
import {knownActionRelationship} from '../../src/extensions/actions/known-model';
type RecordRef={module:string;element:string};
const same=(reference:unknown,record:RecordRef):boolean=>!!reference&&typeof reference==='object'&&(reference as RecordRef).module===record.module&&(reference as RecordRef).element===record.element;
/** Native invariant dependencies include incident declarations absent from action frames. */
export function referenceCreationRelationships(source:Document,record:RecordRef):{reference:{module:string;relationship:string};relation:CoreRelationship}[]{
 const found:ReturnType<typeof referenceCreationRelationships>=[];
 for(const module of source.modules)for(const candidate of (module.relationships??[]) as CoreRelationship[]){if(![...candidate.source,...candidate.target,candidate.associationRecord].some(reference=>same(reference,record)))continue;
  const reference={module:module.id,relationship:candidate.id},relation=knownActionRelationship(source,reference) as CoreRelationship;
  if(!relation.directed||relation.targetLifecycle!=='independent'||relation.associationRecord)throw new UmfError('ACTION_NATIVE_RELATIONSHIP','Incident native relationship arrangement is unqualified');
  found.push({reference,relation});
 }
 return found;
}
/** CREATE currently installs no links; zero degree must satisfy every authored incident lower bound. */
export function verifyReferenceCreationMinima(source:Document,records:RecordRef[]):void{
 for(const record of records)for(const {relation} of referenceCreationRelationships(source,record)){
  if(relation.source.some(reference=>same(reference,record))&&relation.targetMultiplicity.min>0||relation.target.some(reference=>same(reference,record))&&relation.sourceMultiplicity.min>0)throw new UmfError('CONSTRAINT','New resource violates required relationship multiplicity');
 }
}
