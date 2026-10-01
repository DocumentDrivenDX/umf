import {Kind,parse,print,type ObjectTypeDefinitionNode,type FieldDefinitionNode} from 'graphql';
import {copyJson} from '../../model/json';
import {createValidator} from '../../validation/schema';
import legacy from '../../../spec/core/schema.json';
import relationshipsSchema from '../../../spec/core/relationship-document.schema.json';
import projectionSchema from '../../../spec/projections/ddd-graphql.schema.json';
export {default as dddGraphqlProjectionSchema} from '../../../spec/projections/ddd-graphql.schema.json';
const validator=createValidator(false);validator.addSchema(legacy);validator.addSchema(relationshipsSchema);
const checkResult=validator.compile(projectionSchema);
const checkPolicy=validator.compile({$ref:projectionSchema.$id+'#/$defs/policy'});
import {UmfError,pointer,type Document,type Json,type Diagnostic} from '../../model/types';
import {validateRelationshipCandidate,type RelationshipEndpoint,type CoreRelationship,type RelationshipMultiplicity} from '../../validation/relationships';
import {exportGraphqlSchema,importGraphqlSchema} from '../../adapters/graphql';
import {buildDddEntityGraphql,type DddGraphqlEntityPolicy,type DddGraphqlEntityProjection} from './entities';

export interface DddGraphqlEndpoint {record:RelationshipEndpoint;entity:{module:string;element:string}}
export interface DddGraphqlRelationshipName {
  module:string;id:string;forwardName:string;inverseName?:string;
  orientation?:'source-to-target';forwardUnion?:string;inverseUnion?:string;
}
export interface DddGraphqlPolicy extends DddGraphqlEntityPolicy {
  sourceProfile:'core-ideals';endpoints:DddGraphqlEndpoint[];relationships:DddGraphqlRelationshipName[];
}
export interface DddGraphqlProjection extends Omit<DddGraphqlEntityProjection,'policy'> {
  operation:'project-ddd-graphql';version:'1.0.0';policy:DddGraphqlPolicy;lossPolicy:'strict'|'report';diagnostics:Diagnostic[];
  sourceVersions:{core:'0.7.0';ddd:'0.1.0'};
  targetVersions:{graphqlJs:'17.0.2';graphqlCore:'3.2.12';subset:'schema SDL with scalar fields, object relationships and explicit output unions; no execution'};
}
const identity=(r:{module:string;element:string})=>JSON.stringify([r.module,r.element]);
const relationIdentity=(r:{module:string;id:string})=>JSON.stringify([r.module,r.id]);
const valid=(s:unknown):s is string=>typeof s==='string'&&/^[_A-Za-z][_0-9A-Za-z]*(?![\s\S])/.test(s)&&!s.startsWith('__');
function fail(code:string,message:string):never{throw new UmfError('DDD_GRAPHQL_'+code,message);}
const exact=(value:unknown,keys:string[]):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(k=>keys.includes(k));
const ref=(r:unknown):r is RelationshipEndpoint=>exact(r,['module','element'])&&typeof r.module==='string'&&typeof r.element==='string';
const canonical=(v:Json):string=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v!==null&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k]!)).join(',')+'}':JSON.stringify(v);
const equal=(a:unknown,b:unknown)=>canonical(copyJson(a))===canonical(copyJson(b));

/** Complete schema-only projection. Endpoint identity is always explicitly paired. */
export function projectDddToGraphql(input:Document,options:DddGraphqlPolicy,lossPolicy:'strict'|'report'):DddGraphqlProjection {
  const logical=copyJson(input) as unknown as Document,policy=copyJson(options) as unknown as DddGraphqlPolicy;
  if(lossPolicy!=='strict'&&lossPolicy!=='report')fail('POLICY','Expected strict or report loss policy');
  if(!checkPolicy(policy))fail('POLICY','Invalid complete GraphQL projection policy: '+JSON.stringify(checkPolicy.errors));
  if(!exact(policy,['entities','fields','scalars','root','sourceProfile','endpoints','relationships'])||policy.sourceProfile!=='core-ideals'||!Array.isArray(policy.endpoints)||!Array.isArray(policy.relationships))fail('POLICY','Explicit core-ideals entity, endpoint and relationship policies required');
  const validation=validateRelationshipCandidate(logical);
  if(logical.umf!=='0.7.0'||!validation.valid)fail('SOURCE','Valid core 0.7.0 relationship document required');
  if(logical.vocabularies['umf.ddd']?.version!=='0.1.0')fail('SOURCE','DDD 0.1.0 required');
  const {endpoints,relationships,...entityPolicy}=policy;
  const base=buildDddEntityGraphql(logical,entityPolicy,'report',true);
  const residuals=base.residuals,mappings=base.mappings;
  const add=(path:string,reason:string,choice:unknown)=>residuals.push({path,reason,choice:copyJson(choice)});
  const ast=parse(base.candidate!,{noLocation:true});
  const objects=new Map(ast.definitions.filter((d):d is ObjectTypeDefinitionNode=>d.kind===Kind.OBJECT_TYPE_DEFINITION).map(d=>[d.name.value,d]));
  const names=new Set([...objects.keys(),...Object.values(policy.scalars),'String','Boolean','Int','Float','ID']);
  const entityNames=new Map(policy.entities.map(e=>[identity(e),e.name]));
  for(const entity of policy.entities){
    const ddd=logical.modules.find(m=>m.id===entity.module)!.elements.find(e=>e.id===entity.element)!.extensions['umf.ddd'] as unknown as {fields:Record<string,{type:{kind:string}}>};
    for(const [field,meaning] of Object.entries(ddd.fields))if(meaning.type.kind==='scalar'&&!policy.fields.some(f=>identity(f)===identity(entity)&&f.field===field))fail('FIELD','Every selected scalar field requires an explicit name and core Field pairing');
  }
  const endpointNames=new Map<string,string>();
  const pairedEntities=new Set<string>();
  for(const pair of endpoints){
    if(!exact(pair,['record','entity'])||!ref(pair.record)||!ref(pair.entity))fail('ENDPOINT','Expected exact Record and entity references');
    const record=logical.modules.find(m=>m.id===pair.record.module)?.elements.find(e=>e.id===pair.record.element);
    const entity=entityNames.get(identity(pair.entity));
    if(record?.kind!=='record'||!entity)fail('ENDPOINT','Endpoint must pair an existing Record with a selected DDD entity');
    if(endpointNames.has(identity(pair.record))||pairedEntities.has(identity(pair.entity)))fail('ENDPOINT','Record/entity pairs must be one-to-one');
    endpointNames.set(identity(pair.record),entity);pairedEntities.add(identity(pair.entity));
  }
  // No name-based selection and no partial relationship lowering.
  const declared=new Map<string,{relationship:CoreRelationship;path:string}>();
  logical.modules.forEach((m,mi)=>((m.relationships??[]) as CoreRelationship[]).forEach((r,ri)=>declared.set(relationIdentity({module:m.id,id:r.id}),{relationship:r,path:`/modules/${mi}/relationships/${ri}`})));
  const selected=new Set<string>();
  const output=(refs:RelationshipEndpoint[],union:string|undefined,path:string):string=>{
    const types=refs.map(r=>endpointNames.get(identity(r))??fail('ENDPOINT','Every relationship endpoint requires an explicit selected Record/entity pair'));
    if(types.length===1){if(union!==undefined)fail('UNION','Union name supplied for a homogeneous endpoint');return types[0]!;}
    if(!valid(union)||names.has(union))fail('UNION','Heterogeneous outputs require a distinct explicit union name');
    names.add(union);
    const definition=parse(`union ${union} = ${types.join(' | ')}`,{noLocation:true}).definitions[0]!;
    (ast.definitions as (typeof definition)[]).push(definition);
    add(path,'GraphQL output union does not establish endpoint membership, shared identity or resolver type discrimination',refs);
    return union;
  };
  const wrapped=(type:string,bounds:RelationshipMultiplicity)=>bounds.max==='*'||bounds.max>1?`[${type}]`:bounds.min===1?type+'!':type;
  const field=(owner:string,name:string,type:string,path:string)=>{
    const object=objects.get(owner)!;
    if(object.fields?.some(f=>f.name.value===name))fail('NAME','Relationship field collides with an existing field');
    const parsed=parse(`type X { ${name}: ${type} }`,{noLocation:true}).definitions[0] as ObjectTypeDefinitionNode;
    (object as unknown as {fields:FieldDefinitionNode[]}).fields=[...(object.fields??[]),parsed.fields![0]!];
    mappings.push({sourcePath:path,target:owner+'.'+name});
  };
  for(const row of relationships){
    if(!exact(row,['module','id','forwardName','inverseName','orientation','forwardUnion','inverseUnion'])||typeof row.module!=='string'||typeof row.id!=='string'||!valid(row.forwardName)||row.inverseName!==undefined&&!valid(row.inverseName))fail('NAME','Invalid explicit relationship naming policy');
    const id=relationIdentity(row),entry=declared.get(id);
    if(!entry||selected.has(id))fail('RELATIONSHIP','Missing or duplicate exact relationship selection');selected.add(id);
    const {relationship:r,path}=entry;
    if(validation.diagnostics.some(d=>d.code.startsWith('UNKNOWN_RELATIONSHIP')&&(d.path===path||d.path.startsWith(path+'/'))))fail('INCOMPLETE','Unknown relationship qualifiers cannot govern SDL lowering');
    if(r.directed&&row.orientation!==undefined||!r.directed&&row.orientation!=='source-to-target')fail('ORIENTATION','Undirected relationship requires explicit source-to-target display orientation');
    if(r.inverse===undefined&&(row.inverseName!==undefined||row.inverseUnion!==undefined)||r.inverse!==undefined&&!valid(row.inverseName))fail('INVERSE','Inverse policy must match the presence of an authored inverse');
    const target=output(r.target,row.forwardUnion,path+'/target');
    const sources=r.source.map(s=>endpointNames.get(identity(s))??fail('ENDPOINT','Source endpoint lacks an explicit Record/entity pair'));
    for(const source of sources)field(source,row.forwardName,wrapped(target,r.targetMultiplicity),path);
    if(r.inverse!==undefined){
      const source=output(r.source,row.inverseUnion,path+'/source');
      for(const t of r.target)field(endpointNames.get(identity(t))!,row.inverseName!,wrapped(source,r.sourceMultiplicity),path+'/inverse');
      add(path+'/inverse','Paired SDL fields do not enforce inverse consistency or execution',r.inverse);
    }
    add(path+'/target','SDL does not resolve named target Key IDs or enforce referential integrity',r.target);
    add(path+'/sourceMultiplicity','SDL does not enforce source-end participation bounds',r.sourceMultiplicity);
    add(path+'/targetMultiplicity','SDL output wrappers do not enforce stored participation, list minima/maxima, collection uniqueness or item availability',r.targetMultiplicity);
    add(path+'/targetLifecycle','SDL does not enforce ownership or lifecycle',r.targetLifecycle);
    add(path+'/directed',r.directed?'Object-returning SDL fields may be computed; no association execution is implied':'Directed display approximates the authored undirected association',r.directed);
    add(path+'/name','SDL naming policy does not retain authored relationship identity or presentation without this report',{id:r.id,name:r.name});
    if(r.associationRecord)add(path+'/associationRecord','Association Record identity, attributes and endpoint-row correspondence are not enforced by object fields',r.associationRecord);
  }
  if(selected.size!==declared.size)fail('RELATIONSHIP','Every declared relationship needs explicit selection and naming');
  const usedEndpoints=new Set([...declared.values()].flatMap(x=>[...x.relationship.source,...x.relationship.target]).map(identity));
  if(endpoints.some(e=>!usedEndpoints.has(identity(e.record))))fail('ENDPOINT','Unused Record/entity endpoint pairing');
  // Keep every non-projected source surface visible, including unrelated native extensions.
  logical.modules.forEach((m,mi)=>{
    for(const [ei,e] of m.elements.entries()){
      const path=`/modules/${mi}/elements/${ei}`;
      const ddd=e.extensions?.['umf.ddd'];
      if(ddd&&!entityNames.has(identity({module:m.id,element:e.id})))add(path+'/extensions/umf.ddd','Unselected DDD concept, service, repository, event or context-map behavior is retained and not expressed or enforced',ddd);
      if(e.kind==='record')add(path,'Core Record membership, named Keys and equality are retained but not enforced by SDL',e);
      for(const [ext,value] of Object.entries(e.extensions??{}))if(ext!=='umf.ddd')add(path+'/extensions/'+pointer(ext),'Native or unknown extension content has no SDL interpretation',value);
    }
    for(const [ext,value] of Object.entries(m.extensions??{}))if(ext!=='umf.ddd')add(`/modules/${mi}/extensions/${pointer(ext)}`,'Native or unknown module extension remains retained only',value);
  });
  for(const [ext,value] of Object.entries(logical.extensions??{}))add('/extensions/'+pointer(ext),'Document extension content remains retained only',value);
  // All diagnostics about retained unknown content are source-linked, never silently dismissed.
  for(const diagnostic of validation.diagnostics)if(diagnostic.code.startsWith('UNKNOWN'))add(diagnostic.path,'Uninterpreted source content: '+diagnostic.message,diagnostic.code);
  const candidate=print(ast)+'\n';
  const targetArchive=importGraphqlSchema(candidate,{id:'ddd-graphql-target',mode:'schema'});
  if(exportGraphqlSchema(targetArchive)!==candidate)fail('TARGET','Schema-mode archive did not preserve emitted SDL');
  const status=lossPolicy==='strict'&&residuals.length?'blocked':residuals.length?'reported':'proposed';
  const result:DddGraphqlProjection={operation:'project-ddd-graphql',version:'1.0.0',status,logical,policy,lossPolicy,profile:'graphql-js-17.0.2-sdl',sourceVersions:{core:'0.7.0',ddd:'0.1.0'},targetVersions:{graphqlJs:'17.0.2',graphqlCore:'3.2.12',subset:'schema SDL with scalar fields, object relationships and explicit output unions; no execution'},residuals,mappings,diagnostics:residuals.map(r=>({code:'DDD_GRAPHQL_LOSS',path:r.path,severity:'warning',message:r.reason})),...(status==='blocked'?{}:{candidate,targetArchive})};
  if(!checkResult(result))fail('RESULT','Invalid complete projection contract: '+JSON.stringify(checkResult.errors));
  return result;
}

/** Verify the complete retained report by recomputation, including unknown content. */
export function verifyDddGraphqlProjection(input:DddGraphqlProjection,currentTarget?:Document):DddGraphqlProjection {
  const receipt=copyJson(input) as unknown as DddGraphqlProjection;
  if(!checkResult(receipt))fail('RECEIPT','Malformed GraphQL projection contract');
  const expected=projectDddToGraphql(receipt.logical,receipt.policy,receipt.lossPolicy);
  const target=currentTarget===undefined?undefined:copyJson(currentTarget) as unknown as Document;
  if(target&&expected.targetArchive)target.id=expected.targetArchive.id;
  if(!equal(receipt,expected)||target!==undefined&&(!expected.targetArchive||!equal(target,expected.targetArchive)))fail('RECEIPT','Forged or stale GraphQL projection report');
  return expected;
}
export function recoverDddFromGraphql(input:DddGraphqlProjection,currentTarget:Document):Document {
  const receipt=verifyDddGraphqlProjection(input,currentTarget);
  if(!receipt.targetArchive)fail('RECOVERY','Blocked projection has no native recovery');
  return copyJson(receipt.logical) as unknown as Document;
}
export function recoverDddGraphqlNative(input:DddGraphqlProjection,currentTarget:Document):string {
  const receipt=verifyDddGraphqlProjection(input,currentTarget);
  if(!receipt.targetArchive)fail('RECOVERY','Blocked projection has no native recovery');
  return exportGraphqlSchema(receipt.targetArchive);
}
