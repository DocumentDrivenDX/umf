import type {ReferenceHandlerRegistry} from './handlers';
import type {CoreRelationship} from '../../src/validation/relationships';
import {checkActionLiteral} from '../../src/extensions/actions/structure';
import type {SQL} from 'bun';
import {copyJson} from '../../src/model/json';
import {UmfError,type Document} from '../../src/model/types';
import {knownActionModel,knownActionRelationship} from '../../src/extensions/actions/known-model';
import {actionFieldValueKey} from '../../src/extensions/actions/evaluation';
import {selectActionIdentity,type ActionEntityInput} from '../../src/extensions/actions/selector';
import {encodeCoreKeyTuple,type CoreKeyTupleValue} from '../../src/model/key-tuple';
import {checkSchemaLiteral,canonicalSchemaJson,type CoreLiteral} from '../../src/model/schema-literals';
import {readReferenceRevision} from './revisions';
import {referencePreparedHandlers,prepareReferenceAction,type PreparedReferenceAction} from './preparation';
import type {ReferenceStoreControl} from './store';
import {encodeReferenceIdentity,encodeReferenceJson,decodeReferenceJson} from './codec';
export interface NativeReferenceEntity {id:string;record:{module:string;element:string};fields:Record<string,CoreLiteral>;version:string}
export interface FrozenReferenceFrame {id:string;access:'read'|'write';canonical:string;entity:NativeReferenceEntity|null;identity:ActionEntityInput;fields:string[];relationships:string[];create:boolean;delete:boolean}
export interface NativeReferenceLink {relationship:{module:string;relationship:string};sourceEntity:string;targetEntity:string}
export interface FrozenReferenceState {links?:NativeReferenceLink[];frames:FrozenReferenceFrame[];parameters:Map<string,NativeReferenceEntity|null>;missingInputs:string[]}
export function referenceAliasIdentity(entity:ActionEntityInput,tupleHex:string):string{return encodeReferenceIdentity([entity.key.module,entity.key.element,entity.key.key,tupleHex]);}
export function validateReferenceFields(sourceInput:Document,recordInput:{module:string;element:string},fieldsInput:Record<string,CoreLiteral>):Record<string,CoreLiteral>{
 const source=copyJson(sourceInput) as unknown as Document,record=copyJson(recordInput) as unknown as {module:string;element:string};
 const fields=copyJson(fieldsInput) as unknown as Record<string,CoreLiteral>,definition=knownActionModel(source,record,'record'),members=(definition.members??[]) as {module:string;element:string}[];
 if(!fields||typeof fields!=='object'||Array.isArray(fields))throw new UmfError('PARAMETER','Expected native Field map');
 if(Object.keys(fields).some(key=>!members.some(member=>actionFieldValueKey(member)===key)))throw new UmfError('PARAMETER','Unknown native member');
 for(const member of members){const field=knownActionModel(source,member,'field'),key=actionFieldValueKey(member);if(!Object.hasOwn(fields,key)){if(field.nullability==='required')throw new UmfError('PARAMETER','Required native member absent');}else {if(!checkActionLiteral(fields[key]))throw new UmfError('PARAMETER','Expected exact native typed literal');checkSchemaLiteral(source,field,fields[key]!);}}
 return fields;
}
/** Trusted qualified seed writer: all native aliases are established from actual core Key tuples. */
export async function seedReferenceEntity(tx:SQL,control:ReferenceStoreControl,source:Document,record:{module:string;element:string},fieldsInput:Record<string,CoreLiteral>,version='v0'):Promise<string>{
 source=copyJson(source) as unknown as Document;record=copyJson(record) as unknown as {module:string;element:string};
 if(typeof version!=='string'||!version||version.length>256)throw new UmfError('PARAMETER','Invalid native resource version');
 const fields=validateReferenceFields(source,record,fieldsInput),definition=knownActionModel(source,record,'record'),keys=(definition.keys??[]) as {id:string;primary:boolean;fields:{module:string;element:string}[]}[];
 const aliases=keys.map(key=>{const entity:ActionEntityInput={key:{...record,key:key.id},components:key.fields.map(field=>fields[actionFieldValueKey(field)]!)};return {entity,tupleHex:encodeCoreKeyTuple(source,entity.key,entity.components as CoreKeyTupleValue[]).bytesHex};}),primary=aliases.find(alias=>keys.find(key=>key.id===alias.entity.key.key)?.primary);
 if(!primary)throw new UmfError('PARAMETER','Qualified native entity requires primary Key');
 const identity=referenceAliasIdentity(primary.entity,primary.tupleHex),rows=await tx`insert into action_entity(store,identity,record,primary_key,fields,version) values (${control.id},${identity},${encodeReferenceIdentity(record)},${primary.tupleHex},${encodeReferenceJson(fields)},${encodeReferenceJson(version)}) returning id::text`,id=rows[0]!.id;
 for(const alias of aliases){const encoded=referenceAliasIdentity(alias.entity,alias.tupleHex);await tx`insert into action_key_alias(store,identity,entity) values (${control.id},${encoded},${id})`;}
 return id;
}
/** Caller must retain the qualified store lock through execution and commit. */
export async function freezeReferenceState(tx:SQL,control:ReferenceStoreControl,preparedInput:PreparedReferenceAction,handlers?:ReferenceHandlerRegistry):Promise<FrozenReferenceState>{
 const submitted=copyJson(preparedInput) as unknown as PreparedReferenceAction,revision=await readReferenceRevision(tx,control,submitted.target);
 if(canonicalSchemaJson(submitted.deployment??null)!==canonicalSchemaJson(revision.deployment??null))throw new UmfError('SELECTOR','Prepared deployment must match authoritative retained deployment');
 const prepared=prepareReferenceAction(revision,{protocol:'umf.actions.tx/1',target:submitted.target,inputs:submitted.inputs,expectedVersions:submitted.expectedVersions},referencePreparedHandlers(preparedInput,handlers),false);
 if(canonicalSchemaJson(submitted.source)!==canonicalSchemaJson(prepared.source)||canonicalSchemaJson(submitted.action)!==canonicalSchemaJson(prepared.action))throw new UmfError('SELECTOR','Prepared declaration must match authoritative retained source');
 const cache=new Map<string,NativeReferenceEntity|null>();
 const resolve=async(entity:ActionEntityInput,tupleHex:string):Promise<NativeReferenceEntity|null>=>{const identity=referenceAliasIdentity(entity,tupleHex);if(cache.has(identity))return cache.get(identity)!;
  const resolved=await resolveReferenceEntity(tx,control,prepared.source,entity,tupleHex);cache.set(identity,resolved);return resolved;
 };
 const parameters=new Map<string,NativeReferenceEntity|null>(),missingInputs:string[]=[];
 for(const parameter of prepared.action.parameters)if(parameter.kind==='entity'){const entity=prepared.inputs[parameter.id] as ActionEntityInput,tuple=encodeCoreKeyTuple(prepared.source,entity.key,entity.components as CoreKeyTupleValue[]),resolved=await resolve(entity,tuple.bytesHex);parameters.set(parameter.id,resolved);if(!resolved)missingInputs.push(parameter.id);}
 const frames:FrozenReferenceFrame[]=[];
 for(const {declaration,access} of [...prepared.action.reads.map(declaration=>({declaration,access:'read' as const})),...prepared.action.writes.map(declaration=>({declaration,access:'write' as const}))]){const identity=selectActionIdentity(prepared.source,prepared.action,declaration,prepared.inputs),entity=await resolve(identity.entity,identity.tupleHex);frames.push({id:declaration.id,access,canonical:entity?'entity:'+entity.id:'absent:'+referenceAliasIdentity(identity.entity,identity.tupleHex),entity,identity:identity.entity,fields:declaration.fields.map(actionFieldValueKey),relationships:declaration.relationships.map(encodeReferenceIdentity),create:declaration.create,delete:declaration.delete});}
 const links:NativeReferenceLink[]=[],seenLinks=new Set<string>(),queried=new Set<string>();
 const selected=frames.filter(frame=>frame.entity);
 for(const frame of selected)for(const encoded of frame.relationships){
  const targets=new Set(selected.filter(target=>frame.access==='write'||target.access==='read').map(target=>target.entity!.id));
  const queryIdentity=encodeReferenceIdentity([frame.access,encoded,frame.entity!.id]);if(queried.has(queryIdentity))continue;queried.add(queryIdentity);
  const reference=decodeReferenceJson(encoded) as unknown as NativeReferenceLink['relationship'],relation=knownActionRelationship(prepared.source,reference) as CoreRelationship;
  const rows=await tx`select l.source_entity::text,l.target_entity::text,e.record from action_link l join action_entity e on e.store=l.store and e.id=l.target_entity where l.store=${control.id} and l.relationship=${encoded} and l.source_entity=${frame.entity!.id} and l.target_entity=any(${tx.array([...targets],"BIGINT")}) limit ${targets.size+1}`;
  if(rows.length>targets.size)throw new UmfError('SELECTOR','Duplicate native relationship set member');
  const querySeen=new Set<string>();
  for(const row of rows){if(!targets.has(row.target_entity))throw new UmfError('SELECTOR','Relationship snapshot outside selected endpoint permission');const targetRecord=decodeReferenceJson(row.record) as unknown as NativeReferenceEntity['record'];
   if(!relation.source.some(endpoint=>endpoint.module===frame.entity!.record.module&&endpoint.element===frame.entity!.record.element)||!relation.target.some(endpoint=>endpoint.module===targetRecord.module&&endpoint.element===targetRecord.element))throw new UmfError('SELECTOR','Native relationship endpoint Record mismatch');
   const identity=encodeReferenceIdentity([reference,row.source_entity,row.target_entity]);if(querySeen.has(identity))throw new UmfError('SELECTOR','Duplicate native relationship set member');querySeen.add(identity);if(seenLinks.has(identity))continue;seenLinks.add(identity);links.push({relationship:reference,sourceEntity:row.source_entity,targetEntity:row.target_entity});
  }
 }
 // Refuse structural overflow rather than truncate an authoritative snapshot.
 return {frames,parameters,missingInputs,links:copyJson(links) as unknown as NativeReferenceLink[]};
}

/** Executor-owned exact identity lookup, never a handler query capability. */
export async function resolveReferenceEntity(tx:SQL,control:ReferenceStoreControl,source:Document,entity:ActionEntityInput,tupleHex:string):Promise<NativeReferenceEntity|null>{
 const identity=referenceAliasIdentity(entity,tupleHex);
  const rows=await tx`select e.id::text,e.record,e.fields,e.version,e.primary_key from action_key_alias a join action_entity e on e.store=a.store and e.id=a.entity where a.store=${control.id} and a.lookup=action_identity_lookup(${identity}) and a.identity=${identity}`;
  if(rows.length>1)throw new UmfError('SELECTOR','Ambiguous native identity');const row=rows[0],resolved=row?{id:row.id,record:decodeReferenceJson(row.record) as unknown as NativeReferenceEntity['record'],fields:decodeReferenceJson(row.fields) as unknown as Record<string,CoreLiteral>,version:decodeReferenceJson(row.version) as string}:null;
  if(resolved&&encodeReferenceIdentity(resolved.record)!==encodeReferenceIdentity({module:entity.key.module,element:entity.key.element}))throw new UmfError('SELECTOR','Native alias Record mismatch');if(resolved){resolved.fields=validateReferenceFields(source,resolved.record,resolved.fields);const record=knownActionModel(source,resolved.record,'record'),keys=(record.keys??[]) as {id:string;primary:boolean;fields:{module:string;element:string}[]}[],key=keys.find(key=>key.id===entity.key.key),primary=keys.find(key=>key.primary);if(!key||!primary)throw new UmfError('SELECTOR','Native Key definition missing');const tuple=(definition:typeof key)=>encodeCoreKeyTuple(source,{...resolved.record,key:definition.id},definition.fields.map(field=>resolved.fields[actionFieldValueKey(field)]!) as CoreKeyTupleValue[]).bytesHex;if(tuple(key)!==tupleHex||tuple(primary)!==row!.primary_key)throw new UmfError('SELECTOR','Native alias does not match retained entity Key values');}return resolved;
}
