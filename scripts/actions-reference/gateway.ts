import type {CoreRelationship} from '../../src/validation/relationships';
import {encodeReferenceIdentity} from './codec';
import {referenceEntityAliases} from './aliases';
import {encodeCoreKeyTuple,type CoreKeyTupleValue} from '../../src/model/key-tuple';
import {referenceAliasIdentity} from './state';
import {checkActionLiteral} from '../../src/extensions/actions/structure';
import {copyJson} from '../../src/model/json';
import {UmfError,type Document} from '../../src/model/types';
import {knownActionModel,knownActionRelationship} from '../../src/extensions/actions/known-model';
import {actionFieldValueKey,type ActionBusinessState} from '../../src/extensions/actions/evaluation';
import {literalIdentity,type CoreLiteral} from '../../src/model/schema-literals';
import {validateReferenceFields,type FrozenReferenceState,type NativeReferenceEntity,type NativeReferenceLink} from './state';
/** Candidate state only. Persistence, other primitives and terminal commit remain executor responsibilities. */
export class ReferenceMutationGateway {
 readonly #source:Document;
 readonly #frames:FrozenReferenceState['frames'];
 readonly #before=new Map<string,NativeReferenceEntity>();
 readonly #current=new Map<string,NativeReferenceEntity>();
 readonly #order:string[]=[];
 readonly #links:NativeReferenceLink[];
 readonly #beforeLinks:NativeReferenceLink[];
 readonly #linkOrder:string[]=[];
 readonly #journal:{kind:'entity'|'link';identity:string}[]=[];
 readonly #deleted=new Set<string>();
 readonly #aliasOwners=new Map<string,string>();
 #operations=0;
 #aborted=false;
 constructor(source:Document,state:FrozenReferenceState){
  this.#links=copyJson(state.links??[]) as unknown as NativeReferenceLink[];this.#beforeLinks=copyJson(this.#links) as unknown as NativeReferenceLink[];
  this.#source=copyJson(source) as unknown as Document;this.#frames=copyJson(state.frames) as unknown as FrozenReferenceState['frames'];
  for(const frame of this.#frames)if(frame.entity){const prior=this.#before.get(frame.canonical);if(prior&&JSON.stringify(prior)!==JSON.stringify(frame.entity))throw new UmfError('SELECTOR','Inconsistent canonical snapshot');this.#before.set(frame.canonical,copyJson(frame.entity) as unknown as NativeReferenceEntity);this.#current.set(frame.canonical,copyJson(frame.entity) as unknown as NativeReferenceEntity);for(const alias of referenceEntityAliases(this.#source,frame.entity)){const owner=this.#aliasOwners.get(alias.identity);if(owner&&owner!==frame.canonical)throw new UmfError('SELECTOR','Conflicting frozen Key ownership');this.#aliasOwners.set(alias.identity,frame.canonical);}}
 }
 private fail(code:string,message:string):never{this.#aborted=true;throw new UmfError(code,message);}
 private begin():void{if(this.#aborted)throw new UmfError('FRAME_ACCESS','Aborted gateway cannot continue');if(++this.#operations>256)this.fail('LIMIT','Gateway operation bound exceeded');}
 read(frameId:string,fieldInput:{module:string;element:string}):CoreLiteral|undefined{
  this.begin();try{
   const field=copyJson(fieldInput) as unknown as {module:string;element:string},frame=this.#frames.find(frame=>frame.id===frameId);
   if(!field||typeof field.module!=='string'||typeof field.element!=='string'||Object.keys(field).some(key=>!['module','element'].includes(key)))return this.fail('FRAME_ACCESS','Exact field reference required');
   if(!frame||frame.access!=='read')return this.fail('FRAME_ACCESS','Declared read frame required');
   if(this.#deleted.has(frame.canonical))return this.fail('FRAME_ACCESS','Deleted canonical entity cannot be reused');
   const key=actionFieldValueKey(field),allowed=new Set(this.#frames.filter(candidate=>candidate.access==='read'&&candidate.canonical===frame.canonical).flatMap(candidate=>candidate.fields));
   if(!allowed.has(key))return this.fail('FRAME_ACCESS','Field outside frozen read permission');
   const entity=this.#current.get(frame.canonical);if(!entity)return this.fail('ENTITY_MISSING','Selected entity absent');
   return Object.hasOwn(entity.fields,key)?copyJson(entity.fields[key]) as CoreLiteral:undefined;
  }catch(error){this.#aborted=true;throw error;}
 }
 exists(frameId:string):boolean{
  this.begin();const frame=this.#frames.find(frame=>frame.id===frameId);
  if(!frame||frame.access!=='read')return this.fail('FRAME_ACCESS','Declared read frame required');
  if(this.#deleted.has(frame.canonical))return this.fail('FRAME_ACCESS','Deleted canonical entity cannot be reused');
  return this.#current.has(frame.canonical);
 }
 linked(relationshipInput:{module:string;relationship:string},sourceFrame:string,targetFrame:string):boolean{
  this.begin();try{
   const relationship=copyJson(relationshipInput) as unknown as {module:string;relationship:string},source=this.#frames.find(frame=>frame.id===sourceFrame),target=this.#frames.find(frame=>frame.id===targetFrame);
   if(!relationship||typeof relationship.module!=='string'||typeof relationship.relationship!=='string'||Object.keys(relationship).some(key=>!['module','relationship'].includes(key)))return this.fail('FRAME_ACCESS','Exact relationship reference required');
   if(!source||!target||source.access!=='read'||target.access!=='read')return this.fail('FRAME_ACCESS','Declared read endpoints required');
   if(this.#deleted.has(source.canonical)||this.#deleted.has(target.canonical))return this.fail('FRAME_ACCESS','Deleted canonical entity cannot be reused');
   const identity=encodeReferenceIdentity(relationship);
   if(!this.#frames.some(frame=>frame.access==='read'&&frame.canonical===source.canonical&&frame.relationships.includes(identity)))return this.fail('FRAME_ACCESS','Relationship outside frozen read permission');
   const definition=knownActionRelationship(this.#source,relationship) as CoreRelationship;
   if(!definition.directed||definition.targetLifecycle!=='independent'||definition.associationRecord)return this.fail('FRAME_ACCESS','Qualified directed independent relationship required');
   const matches=(endpoint:{module:string;element:string},frame:FrozenReferenceState['frames'][number])=>endpoint.module===frame.identity.key.module&&endpoint.element===frame.identity.key.element;
   if(!definition.source.some(endpoint=>matches(endpoint,source))||!definition.target.some(endpoint=>matches(endpoint,target)))return this.fail('FRAME_ACCESS','Relationship endpoint Record orientation mismatch');
   const from=this.#current.get(source.canonical),to=this.#current.get(target.canonical);
   return !!from&&!!to&&this.#links.some(link=>link.sourceEntity===from.id&&link.targetEntity===to.id&&encodeReferenceIdentity(link.relationship)===identity);
  }catch(error){this.#aborted=true;throw error;}
 }
 private mutateLink(kind:'link'|'unlink',relationshipInput:{module:string;relationship:string},sourceFrame:string,targetFrame:string):'changed'|'no-op'{
  this.begin();try{
   const relationship=copyJson(relationshipInput) as unknown as {module:string;relationship:string},source=this.#frames.find(frame=>frame.id===sourceFrame),target=this.#frames.find(frame=>frame.id===targetFrame);
   if(!relationship||typeof relationship.module!=='string'||typeof relationship.relationship!=='string'||Object.keys(relationship).some(key=>!['module','relationship'].includes(key)))return this.fail('FRAME_ACCESS','Exact relationship reference required');
   if(!source||!target||source.access!=='write')return this.fail('FRAME_ACCESS','Declared write source and frozen target required');
   if(this.#deleted.has(source.canonical)||this.#deleted.has(target.canonical))return this.fail('FRAME_ACCESS','Deleted canonical entity cannot be reused');
   const identity=encodeReferenceIdentity(relationship);
   if(!this.#frames.some(frame=>frame.access==='write'&&frame.canonical===source.canonical&&frame.relationships.includes(identity)))return this.fail('FRAME_ACCESS','Relationship outside frozen write permission');
   const definition=knownActionRelationship(this.#source,relationship) as CoreRelationship;
   if(!definition.directed||definition.targetLifecycle!=='independent'||definition.associationRecord)return this.fail('FRAME_ACCESS','Qualified directed independent relationship required');
   const matches=(endpoint:{module:string;element:string},frame:FrozenReferenceState['frames'][number])=>endpoint.module===frame.identity.key.module&&endpoint.element===frame.identity.key.element;
   if(!definition.source.some(endpoint=>matches(endpoint,source))||!definition.target.some(endpoint=>matches(endpoint,target)))return this.fail('FRAME_ACCESS','Relationship endpoint Record orientation mismatch');
   if(!definition.target.some(endpoint=>matches(endpoint,target)&&endpoint.key===target.identity.key.key))return this.fail('FRAME_ACCESS','Relationship target Key mismatch');
   const from=this.#current.get(source.canonical),to=this.#current.get(target.canonical);if(!from||!to)return this.fail('ENTITY_MISSING','Selected relationship endpoint absent');
   const link:NativeReferenceLink={relationship,sourceEntity:from.id,targetEntity:to.id},key=encodeReferenceIdentity(link),index=this.#links.findIndex(candidate=>encodeReferenceIdentity(candidate)===key);
   if(kind==='link'&&index>=0||kind==='unlink'&&index<0)return 'no-op';
   if(kind==='link')this.#links.push(link);else this.#links.splice(index,1);
   if(!this.#linkOrder.includes(key)){this.#linkOrder.push(key);this.#journal.push({kind:'link',identity:key});}return 'changed';
  }catch(error){this.#aborted=true;throw error;}
 }
 link(relationship:{module:string;relationship:string},sourceFrame:string,targetFrame:string):'changed'|'no-op'{return this.mutateLink('link',relationship,sourceFrame,targetFrame);}
 unlink(relationship:{module:string;relationship:string},sourceFrame:string,targetFrame:string):'changed'|'no-op'{return this.mutateLink('unlink',relationship,sourceFrame,targetFrame);}
 /** Net set changes only; restored membership has no business change. */
 linkChanges():{kind:'linked'|'unlinked';link:NativeReferenceLink}[]{
  if(this.#aborted)throw new UmfError('FRAME_ACCESS','Aborted gateway cannot persist');
  return this.#linkOrder.flatMap<{kind:'linked'|'unlinked';link:NativeReferenceLink}>(key=>{const before=this.#beforeLinks.find(link=>encodeReferenceIdentity(link)===key),after=this.#links.find(link=>encodeReferenceIdentity(link)===key);if(!!before===!!after)return [];return [{kind:after?'linked':'unlinked',link:copyJson(after??before!) as unknown as NativeReferenceLink}];});
 }
 delete(frameId:string):'changed'{
  this.begin();const frame=this.#frames.find(frame=>frame.id===frameId);
  if(!frame||frame.access!=='write'||!this.#frames.some(candidate=>candidate.access==='write'&&candidate.canonical===frame.canonical&&candidate.delete))return this.fail('FRAME_ACCESS','Declared canonical delete permission required');
  if(this.#deleted.has(frame.canonical))return this.fail('FRAME_ACCESS','Deleted canonical entity cannot be reused');
  if(!this.#current.has(frame.canonical))return this.fail('ENTITY_MISSING','Selected entity absent');
  if(!this.#before.has(frame.canonical))return this.fail('FRAME_ACCESS','Created entity cannot be deleted in the same action');
  this.#deleted.add(frame.canonical);this.#current.delete(frame.canonical);if(!this.#order.includes(frame.canonical)){this.#order.push(frame.canonical);this.#journal.push({kind:'entity',identity:frame.canonical});}return 'changed';
 }
 create(frameId:string,assignmentsInput:{field:{module:string;element:string};value:CoreLiteral}[]):'changed'{
  this.begin();try{
   const assignments=copyJson(assignmentsInput) as unknown as {field:{module:string;element:string};value:CoreLiteral}[],frame=this.#frames.find(frame=>frame.id===frameId);
   if(!frame||frame.access!=='write'||!this.#frames.some(candidate=>candidate.access==='write'&&candidate.canonical===frame.canonical&&candidate.create))return this.fail('FRAME_ACCESS','Frozen primary create permission required');
   if(this.#deleted.has(frame.canonical))return this.fail('FRAME_ACCESS','Deleted canonical entity cannot be reused');
   if(this.#current.has(frame.canonical))return this.fail('CONSTRAINT','Create identity already exists');
   const record={module:frame.identity.key.module,element:frame.identity.key.element},definition=knownActionModel(this.#source,record,'record'),primary=((definition.keys??[]) as {id:string;primary:boolean}[]).find(key=>key.primary);
   if(!primary||frame.identity.key.key!==primary.id)return this.fail('FRAME_ACCESS','Absent creation requires qualified primary Key');
   if(!Array.isArray(assignments)||!assignments.length||assignments.length>256)return this.fail('LIMIT','Bounded nonempty assignment list required');
   const fields:Record<string,CoreLiteral>=Object.create(null);
   for(const assignment of assignments){if(!assignment||typeof assignment!=='object'||Object.keys(assignment).some(key=>!['field','value'].includes(key))||!Object.hasOwn(assignment,'value')||!assignment.field||typeof assignment.field!=='object'||Object.keys(assignment.field).some(key=>!['module','element'].includes(key)))return this.fail('FRAME_ACCESS','Exact assignment required');const field=actionFieldValueKey(assignment.field);if(Object.hasOwn(fields,field))return this.fail('FRAME_ACCESS','Duplicate create assignment');if(!checkActionLiteral(assignment.value))return this.fail('PARAMETER','Expected exact typed literal');fields[field]=assignment.value;}
   validateReferenceFields(this.#source,record,fields);
   const aliases=referenceEntityAliases(this.#source,{record,fields}),createdPrimary=aliases.find(alias=>alias.primary)!;
   const selected=referenceAliasIdentity(frame.identity,encodeCoreKeyTuple(this.#source,frame.identity.key,frame.identity.components as CoreKeyTupleValue[]).bytesHex);
   if(createdPrimary.identity!==selected)return this.fail('FRAME_ACCESS','Created identity differs from frozen selected primary Key');
   const matching=this.#frames.filter(candidate=>candidate.identity.key.module===record.module&&candidate.identity.key.element===record.element&&aliases.some(alias=>alias.identity===referenceAliasIdentity(candidate.identity,encodeCoreKeyTuple(this.#source,candidate.identity.key,candidate.identity.components as CoreKeyTupleValue[]).bytesHex)));
   const allowed=new Set(matching.filter(candidate=>candidate.access==='write').flatMap(candidate=>candidate.fields));
   if(Object.keys(fields).some(field=>!allowed.has(field)))return this.fail('FRAME_ACCESS','Field outside proven frozen create permission');
   validateReferenceFields(this.#source,record,fields);
   for(const alias of aliases)if(this.#aliasOwners.has(alias.identity))return this.fail('CONSTRAINT','Created Key already belongs to another resource');
   const entity:NativeReferenceEntity={id:'created:'+this.#order.length,record,fields,version:'pending'};
   // Only exact supplied tuples establish new alias equality inside the frozen native boundary.
   for(const candidate of this.#frames)if(!candidate.entity&&candidate.identity.key.module===record.module&&candidate.identity.key.element===record.element){const identity=referenceAliasIdentity(candidate.identity,encodeCoreKeyTuple(this.#source,candidate.identity.key,candidate.identity.components as CoreKeyTupleValue[]).bytesHex);if(aliases.some(alias=>alias.identity===identity))candidate.canonical=frame.canonical;}
   this.#current.set(frame.canonical,entity);this.#order.push(frame.canonical);this.#journal.push({kind:'entity',identity:frame.canonical});for(const alias of aliases)this.#aliasOwners.set(alias.identity,frame.canonical);return 'changed';
  }catch(error){this.#aborted=true;if(error instanceof UmfError&&error.code==='CORE_SCHEMA_PROPERTIES')throw new UmfError('CONSTRAINT',error.message);throw error;}
 }
 set(frameId:string,assignmentsInput:{field:{module:string;element:string};value:CoreLiteral}[]):'changed'|'no-op'{
  this.begin();try{
   const assignments=copyJson(assignmentsInput) as unknown as {field:{module:string;element:string};value:CoreLiteral}[],frame=this.#frames.find(frame=>frame.id===frameId);
   if(!frame||frame.access!=='write')return this.fail('FRAME_ACCESS','Declared write frame required');
   if(this.#deleted.has(frame.canonical))return this.fail('FRAME_ACCESS','Deleted canonical entity cannot be reused');
   const writableFields=new Set(this.#frames.filter(candidate=>candidate.access==='write'&&candidate.canonical===frame.canonical).flatMap(candidate=>candidate.fields));
   const entity=this.#current.get(frame.canonical);if(!entity)return this.fail('ENTITY_MISSING','Selected entity absent');
   if(!Array.isArray(assignments)||!assignments.length||assignments.length>256)return this.fail('LIMIT','Bounded nonempty assignment list required');
   const record=knownActionModel(this.#source,entity.record,'record'),keys=(record.keys??[]) as {fields:{module:string;element:string}[]}[],candidate=copyJson(entity.fields) as unknown as Record<string,CoreLiteral>,seen=new Set<string>();let changed=false;
   for(const assignment of assignments){if(!assignment||typeof assignment!=='object'||Object.keys(assignment).some(key=>!['field','value'].includes(key))||!Object.hasOwn(assignment,'value')||!assignment.field||typeof assignment.field!=='object'||Object.keys(assignment.field).some(key=>!['module','element'].includes(key)))return this.fail('FRAME_ACCESS','Exact assignment required');const field=actionFieldValueKey(assignment.field);if(seen.has(field)||!writableFields.has(field))return this.fail('FRAME_ACCESS','Field outside frozen write permission');seen.add(field);
    if(keys.some(key=>key.fields.some(component=>actionFieldValueKey(component)===field)))return this.fail('FRAME_ACCESS','Every Key component is immutable');
    if(!checkActionLiteral(assignment.value))return this.fail('PARAMETER','Expected exact typed literal');
    const definition=knownActionModel(this.#source,assignment.field,'field'),old=candidate[field],value=assignment.value;
    const equal=Object.hasOwn(candidate,field)&&(old===null||value===null?old===value:literalIdentity(definition,old!)===literalIdentity(definition,value));if(!equal){candidate[field]=value;changed=true;}
   }
   validateReferenceFields(this.#source,entity.record,candidate);
   if(changed){entity.fields=candidate;if(!this.#order.includes(frame.canonical)){this.#order.push(frame.canonical);this.#journal.push({kind:'entity',identity:frame.canonical});}}return changed?'changed':'no-op';
  }catch(error){this.#aborted=true;if(error instanceof UmfError&&error.code==='CORE_SCHEMA_PROPERTIES')throw new UmfError('CONSTRAINT',error.message);throw error;}
 }
 /** Rule snapshots expose declared READ fields and relationship pairs; writes never confer read access. */
 ruleState(phase:'pre'|'post'):ActionBusinessState{
  if(this.#aborted)throw new UmfError('FRAME_ACCESS','Aborted gateway cannot read');
  const entities=phase==='pre'?this.#before:this.#current,frames:ActionBusinessState['frames']=Object.create(null);
  for(const frame of this.#frames.filter(frame=>frame.access==='read')){
   const entity=entities.get(frame.canonical),allowed=new Set(this.#frames.filter(candidate=>candidate.access==='read'&&candidate.canonical===frame.canonical).flatMap(candidate=>candidate.fields));
   frames[frame.id]={exists:!!entity,values:entity?Object.fromEntries(Object.entries(entity.fields).filter(([field])=>allowed.has(field)).map(([field,value])=>[field,copyJson(value)])) as Record<string,CoreLiteral>:{}};
  }
  const links:ActionBusinessState['links']=[],reads=this.#frames.filter(frame=>frame.access==='read');
  for(const link of phase==='pre'?this.#beforeLinks:this.#links)for(const source of reads){
   if(entities.get(source.canonical)?.id!==link.sourceEntity)continue;
   const allowed=this.#frames.some(frame=>frame.access==='read'&&frame.canonical===source.canonical&&frame.relationships.includes(encodeReferenceIdentity(link.relationship)));
   if(!allowed)continue;
   for(const target of reads)if(entities.get(target.canonical)?.id===link.targetEntity)links.push({relationship:copyJson(link.relationship) as unknown as NativeReferenceLink['relationship'],sourceFrame:source.id,targetFrame:target.id});
  }
  return {frames,links};
 }
 updates():NativeReferenceEntity[]{
  if(this.#aborted)throw new UmfError('FRAME_ACCESS','Aborted gateway cannot persist');
  return this.#order.flatMap(canonical=>{const before=this.#before.get(canonical)!,current=this.#current.get(canonical);if(!current||!before)return [];const names=new Set([...Object.keys(before.fields),...Object.keys(current.fields)]),equal=[...names].every(name=>{if(Object.hasOwn(before.fields,name)!==Object.hasOwn(current.fields,name))return false;const a=before.fields[name]!,b=current.fields[name]!;if(a===null||b===null)return a===b;const reference=JSON.parse(name) as [string,string];return literalIdentity(knownActionModel(this.#source,{module:reference[0],element:reference[1]},'field'),a)===literalIdentity(knownActionModel(this.#source,{module:reference[0],element:reference[1]},'field'),b);});return equal?[]:[copyJson(current) as unknown as NativeReferenceEntity];});
 }
 changes():{kind:'created'|'updated'|'deleted';entity:NativeReferenceEntity}[]{
  const updates=new Map(this.updates().map(entity=>[entity.id,entity]));
  return this.#order.flatMap<{kind:'created'|'updated'|'deleted';entity:NativeReferenceEntity}>(canonical=>{const before=this.#before.get(canonical);if(!before)return [{kind:'created' as const,entity:copyJson(this.#current.get(canonical)!) as unknown as NativeReferenceEntity}];if(this.#deleted.has(canonical))return [{kind:'deleted' as const,entity:copyJson(before) as unknown as NativeReferenceEntity}];const update=updates.get(before.id);return update?[{kind:'updated' as const,entity:update}]:[];});
 }

 /** First actual modification order across entity and relationship primitives, filtered to final net changes. */
 candidateChanges():({kind:'created'|'updated'|'deleted';entity:NativeReferenceEntity}|{kind:'linked'|'unlinked';link:NativeReferenceLink})[]{
  const entities=new Map(this.changes().map(change=>[change.entity.id,change])),links=new Map(this.linkChanges().map(change=>[encodeReferenceIdentity(change.link),change]));
  return this.#journal.flatMap<ReturnType<ReferenceMutationGateway['candidateChanges']>[number]>(entry=>{if(entry.kind==='link'){const change=links.get(entry.identity);return change?[change]:[];}const entity=this.#current.get(entry.identity)??this.#before.get(entry.identity),change=entity?entities.get(entity.id):undefined;return change?[change]:[];});
 }

}
