import schema from '../../../spec/projections/postgresql-relationship-layout.schema.json';
import {copyJson} from '../../model/json';
import {UmfError,type Document,type Element,type Json,type Diagnostic} from '../../model/types';
import {createValidator} from '../../validation/schema';
import {validateDocument} from '../../validation/document';
import {inspectBinding,type BindingFieldRef,type BindingPayload} from '../../extensions/binding';
import {inspectDdd,type DddEntity} from '../../extensions/ddd';
import type {CoreKeyDefinition,CoreKeyFieldReference} from '../../validation/keys';
import type {CoreRelationship} from '../../validation/relationships';

export interface PostgresqlLayoutType {sqlType:string;nullable:boolean;collation:null|'C'}
export interface PostgresqlLayoutField extends PostgresqlLayoutType {coreField:CoreKeyFieldReference;boundField:BindingFieldRef;table:string;column:string}
export interface PostgresqlLayoutKeyComponent extends PostgresqlLayoutType {keyField:CoreKeyFieldReference;boundField:BindingFieldRef;column:string}
export interface PostgresqlLayoutKey {record:CoreKeyFieldReference;key:string;table:string;constraint:string;components:PostgresqlLayoutKeyComponent[]}
export interface PostgresqlLayoutKeyRef extends CoreKeyFieldReference {key:string}
export interface PostgresqlLayoutEndpointComponent extends PostgresqlLayoutType {keyField:CoreKeyFieldReference;endpointField:BindingFieldRef;endpointColumn:string;carrierField?:BindingFieldRef;carrierColumn:string}
export interface PostgresqlRelationshipLayout {
 relationship:{module:string;id:string};storage:'foreign_key'|'junction'|'edge';carrierTable:string;
 targetKey:PostgresqlLayoutKeyRef;targetConstraint:string;targetComponents:PostgresqlLayoutEndpointComponent[];
 sourceKey?:PostgresqlLayoutKeyRef;sourceConstraint?:string;sourceComponents?:PostgresqlLayoutEndpointComponent[];
 associationRecord?:CoreKeyFieldReference;associationKey?:PostgresqlLayoutKeyRef;
 discriminator?:PostgresqlLayoutType&{column:string;value:string};
}
export interface PostgresqlRelationshipLayoutPolicy {profile:'postgresql-relationship-layout-1';targetVersion:string;fieldLayouts:PostgresqlLayoutField[];keyLayouts:PostgresqlLayoutKey[];relationshipLayouts:PostgresqlRelationshipLayout[]}
export interface PostgresqlRelationshipLayoutResult {
 operation:'validate-postgresql-relationship-layout';version:'1.0.0';status:'validated'|'reported'|'blocked';lossPolicy:'strict'|'report';
 logical:Document;binding:Document;policy:Json;diagnostics:Diagnostic[];
 residuals:{source:'logical'|'binding'|'policy';path:string;reason:string;value:Json}[];
 candidate?:PostgresqlRelationshipLayoutPolicy;
}
const check=createValidator().compile(schema);
const id=(r:{module:string;element:string})=>JSON.stringify([r.module,r.element]);
const boundId=(r:BindingFieldRef)=>JSON.stringify([r.module,r.element,r.field??null]);
const keyId=(r:PostgresqlLayoutKeyRef)=>JSON.stringify([r.module,r.element,r.key]);
const relationshipId=(r:{module:string;id:string})=>JSON.stringify([r.module,r.id]);
const same=(a:{module:string;element:string},b:{module:string;element:string})=>id(a)===id(b);
function safeIdentifier(name:string):boolean {return /^[A-Za-z_]/.test(name)&&! /[^A-Za-z0-9_]/.test(name)&&new TextEncoder().encode(name).length<=63;}
function safeTable(name:string):boolean {const p=name.split('.');return p.length===2&&p.every(safeIdentifier);}
/** Deliberately bounded canonical SQL spelling, not an expression parser. */
function family(type:string):string|undefined {
 if(type.trim()!==type||/[\r\n\u2028\u2029]/.test(type))return undefined;
 if(['smallint','integer','bigint'].includes(type))return 'integer';
 if(type==='boolean')return 'boolean';if(type==='text')return 'string';if(type==='bytea')return 'binary';
 if(type==='date')return 'date';if(['real','double precision'].includes(type))return 'float';
 if(/^timestamp(?:tz)?\([0-6]\)$/.test(type))return 'timestamp';
 const varchar=/^varchar\(([1-9][0-9]{0,7})\)$/.exec(type);if(varchar&&Number(varchar[1])<=10485760)return 'string';
 const numeric=/^numeric\(([1-9][0-9]{0,2}),(0|[1-9][0-9]{0,2})\)$/.exec(type);if(numeric&&Number(numeric[2])<=Number(numeric[1]))return 'decimal';
 return undefined;
}
const typeSame=(a:PostgresqlLayoutType,b:PostgresqlLayoutType)=>a.sqlType===b.sqlType&&a.collation===b.collation;

/** Validate retained metadata only. A candidate is a policy, never SQL or native enforcement. */
export function validatePostgresqlRelationshipLayout(logicalInput:Document,bindingInput:Document,policyInput:PostgresqlRelationshipLayoutPolicy,lossPolicy:'strict'|'report'):PostgresqlRelationshipLayoutResult {
 if(lossPolicy!=='strict'&&lossPolicy!=='report')throw new UmfError('POSTGRESQL_LAYOUT_POLICY','Expected strict or report');
 const logical=copyJson(logicalInput) as unknown as Document,binding=copyJson(bindingInput) as unknown as Document,raw=copyJson(policyInput);
 const result:PostgresqlRelationshipLayoutResult={operation:'validate-postgresql-relationship-layout',version:'1.0.0',status:'blocked',lossPolicy,logical,binding,policy:raw,diagnostics:[],residuals:[]};
 const error=(code:string,path:string,message:string)=>result.diagnostics.push({code:'POSTGRESQL_LAYOUT_'+code,path,message,severity:'error'});
 const residual=(source:'logical'|'binding'|'policy',path:string,reason:string,value:unknown)=>result.residuals.push({source,path,reason,value:copyJson(value)});
 const validation=validateDocument(logical);if(!validation.valid||logical.umf!=='0.7.0'){error('MODEL','/logical','A valid experimental core 0.7.0 relationship document is required');return result;}
 const checked=inspectBinding(binding,logical);if(!checked.valid){result.diagnostics.push(...checked.diagnostics);return result;}
 const payload=binding.extensions!['umf.binding'] as unknown as BindingPayload;
 if(payload.profile!=='umf-binding-2'||binding.vocabularies['umf.binding']?.version!=='0.2.0'){error('BINDING','/binding','Explicit stable-ID binding migration is required');return result;}
 if(checked.diagnostics.some(d=>d.code==='BINDING_UNKNOWN')){error('UNKNOWN','/binding','Unknown physical choices block safe layout interpretation');return result;}
 if(!check(raw)){for(const e of check.errors??[])error('STRUCTURE','/policy'+e.instancePath,e.message??'Invalid layout policy');return result;}
 const policy=raw as unknown as PostgresqlRelationshipLayoutPolicy;
 if(payload.target.system!=='postgresql'||payload.target.version!==policy.targetVersion){error('TARGET','/policy/targetVersion','Exact binding PostgreSQL 17 version required');return result;}
 const ddd=inspectDdd(logical);if(!ddd.valid||ddd.diagnostics.some(d=>d.code==='DDD_UNKNOWN')){error('DDD','/logical','Invalid or uninterpreted DDD payload');return result;}
 const elements=new Map<string,Element>(),paths=new Map<string,string>(),owners=new Map<string,CoreKeyFieldReference>();
 logical.modules.forEach((m,mi)=>m.elements.forEach((e,ei)=>{const ref={module:m.id,element:e.id};elements.set(id(ref),e);paths.set(id(ref),`/modules/${mi}/elements/${ei}`);for(const member of (e.members??[]) as CoreKeyFieldReference[])owners.set(id(member),ref);}));
 const tables=new Map<string,string>(),tableOwners=new Map<string,string>(),fields=new Map<string,PostgresqlLayoutField>(),boundFields=new Map<string,PostgresqlLayoutField>(),physical=new Map<string,PostgresqlLayoutField>();
 const constraints=new Set<string>(),relationNames=new Set<string>();
 const addConstraint=(table:string,name:string,path:string,isKey=false)=>{
  if(!safeIdentifier(name))error('IDENTIFIER',path,'Constraint name must be an untruncated portable PostgreSQL identifier');
  const scope=JSON.stringify([table,name]);if(constraints.has(scope))error('COLLISION',path,'Constraint name repeats within one table');constraints.add(scope);
  if(isKey){const relation=JSON.stringify([table.split('.')[0],name]);if(relationNames.has(relation))error('COLLISION',path,'Key index relation name collides in schema');relationNames.add(relation);}
 };
 for(const [i,e] of payload.elements.entries()){
  const path=`/binding/extensions/umf.binding/elements/${i}`;
  if(!e.table||!safeTable(e.table)){error('TABLE',path,'Explicit safe schema.table binding required');continue;}
  if(tableOwners.has(e.table))error('COLLISION',path,'Distinct elements cannot share one table');
  tables.set(id(e),e.table);tableOwners.set(e.table,id(e));relationNames.add(JSON.stringify(e.table.split('.')));
 }
 // PostgreSQL tables and backing key/index relations share one schema namespace.
 for(const [i,index] of payload.indexes.entries()){
  const target=index.on[0],ref=target&&('field'in target?target.field:target.documentPath.field);
  const owner=ref&&(ref.field===undefined?owners.get(id(ref)):ref),table=owner&&tables.get(id(owner));
  if(!safeIdentifier(index.name))error('IDENTIFIER',`/binding/extensions/umf.binding/indexes/${i}/name`,'Unsafe index identifier');
  if(table){const identity=JSON.stringify([table.split('.')[0],index.name]);if(relationNames.has(identity))error('COLLISION',`/binding/extensions/umf.binding/indexes/${i}`,'Index relation name collides in schema');relationNames.add(identity);}
 }
 // All bound scalar columns need a complete inventory, including association attributes.
 for(const [i,f] of policy.fieldLayouts.entries()){
  const path=`/policy/fieldLayouts/${i}`,field=elements.get(id(f.coreField)),owner=owners.get(id(f.coreField)),b=payload.fields.find(row=>boundId(row)===boundId(f.boundField));
  if(fields.has(id(f.coreField))||boundFields.has(boundId(f.boundField)))error('DUPLICATE',path,'Core or bound Field mapping repeats');
  fields.set(id(f.coreField),f);boundFields.set(boundId(f.boundField),f);
  if(!field||field.kind!=='field'||!owner)error('FIELD',path+'/coreField','Exact member Field is required');
  if(!owner||tables.get(id(owner))!==f.table)error('TABLE',path+'/table','Field table differs from its owning Record binding');
  if(!b||b.storage!=='column'||b.column!==f.column)error('FIELD',path+'/boundField','Exact bound column is required');
  if(f.boundField.field!==undefined&&(!owner||!same(owner,f.boundField)))error('FIELD',path+'/boundField','DDD field must belong to the exact owning Record');
  if(f.boundField.field===undefined&&!same(f.coreField,f.boundField))error('FIELD',path+'/boundField','Direct Field binding cannot substitute another ID');
  const type=family(f.sqlType);
  if(!type||!safeTable(f.table)||!safeIdentifier(f.column))error('SQL',path,'Unsafe or unsupported table, column or SQL type');
  if((type==='string'&&f.collation!=='C')||(type!=='string'&&f.collation!==null))error('COLLATION',path,'Text uses explicit C comparison; nontext must have null collation');
  if(field&&(field.scalarType!==type||field.cardinality!=='one'||!['required','absent-allowed'].includes(String(field.nullability))))error('TYPE',path,'Field scalar family, cardinality and availability must be explicit and compatible');
  if(field&&f.nullable!==(field.nullability==='absent-allowed'))error('NULLABILITY',path,'Column NULL carrier differs from the authored Field availability');
  if(f.boundField.field!==undefined){
   const definition=elements.get(id(f.boundField))?.extensions?.['umf.ddd'] as DddEntity|undefined,df=definition?.fields?.[f.boundField.field];
   const dddFamily=type==='binary'?'bytes':type==='timestamp'?'date-time':type;
   if(!df||df.type.kind!=='scalar'||df.type.name!==dddFamily||!['one','optional'].includes(df.cardinality)||f.nullable!==(df.cardinality==='optional'))error('DDD_FIELD',path,'Explicit core-to-DDD map has incompatible scalar or availability meaning');
  }
  const location=JSON.stringify([f.table,f.column]);if(physical.has(location))error('COLLISION',path,'Distinct Field mappings use the same physical column');physical.set(location,f);
  residual('policy',`/fieldLayouts/${i}`,'Declared SQL type, NULL carrier and comparator require separate native/domain enforcement evidence',f);
 }
 for(const [i,b] of payload.fields.entries())if(b.storage==='column'&&!boundFields.has(boundId(b)))error('MISSING',`/binding/extensions/umf.binding/fields/${i}`,'Bound column lacks an explicit Field/type inventory');
 const keys=new Map<string,PostgresqlLayoutKey>();
 for(const [i,k] of policy.keyLayouts.entries()){
  const path=`/policy/keyLayouts/${i}`,record=elements.get(id(k.record)),authored=(record?.keys as CoreKeyDefinition[]|undefined)?.find(row=>row.id===k.key),identity=keyId({...k.record,key:k.key});
  if(keys.has(identity))error('DUPLICATE',path,'Key layout repeats');keys.set(identity,k);
  if(!authored){error('KEY',path+'/key','Exact stable Key ID must resolve; names and primary-key fallback are forbidden');continue;}
  if(tables.get(id(k.record))!==k.table)error('TABLE',path+'/table','Key table must equal the Record binding');
  const bound=payload.elements.find(e=>same(e,k.record));if(bound?.partition!=null)error('PARTITION',path,'Partitioned Key eligibility requires a separate complete partition policy');
  addConstraint(k.table,k.constraint,path+'/constraint',true);
  if(k.components.length!==authored.fields.length)error('COMPONENTS',path+'/components','Exactly one ordered component per authored Key field is required');
  for(const [ci,c] of k.components.entries()){
   const at=path+`/components/${ci}`,f=fields.get(id(c.keyField));
   if(!authored.fields[ci]||!same(authored.fields[ci]!,c.keyField))error('ORDER',at+'/keyField','Component must match the exact ordered authored Key field');
   if(!f||f.table!==k.table||boundId(f.boundField)!==boundId(c.boundField)||f.column!==c.column||!typeSame(f,c)||f.nullable!==c.nullable)error('COMPONENT',at,'Key component differs from the declared bound Field inventory');
   if(authored.primary&&c.nullable)error('NULLABILITY',at,'Primary Key columns cannot be nullable');
  }
 }
 for(const [identity,table] of tables){const record=elements.get(identity);for(const k of (record?.keys??[]) as CoreKeyDefinition[]){const [module,element]=JSON.parse(identity);if(!keys.has(keyId({module,element,key:k.id})))error('MISSING','/policy/keyLayouts','Every bound authored Key requires a layout: '+table+'/'+k.id);}}
 const relationships=new Map<string,{relationship:CoreRelationship;path:string}>();
 logical.modules.forEach((m,mi)=>((m.relationships??[]) as CoreRelationship[]).forEach((r,ri)=>relationships.set(relationshipId({module:m.id,id:r.id}),{relationship:r,path:`/modules/${mi}/relationships/${ri}`})));
 const seen=new Set<string>(),carrierOwners=new Map<string,PostgresqlRelationshipLayout[]>();
 for(const [i,layout] of policy.relationshipLayouts.entries()){
  const path=`/policy/relationshipLayouts/${i}`,identity=relationshipId(layout.relationship),entry=relationships.get(identity),choice=payload.relationships.find(row=>'id'in row&&relationshipId(row)===identity);
  if(seen.has(identity))error('DUPLICATE',path,'Relationship layout repeats');seen.add(identity);
  if(!entry||!choice||choice.storage!==layout.storage){error('RELATIONSHIP',path,'Layout must match one exact stable-ID binding choice');continue;}
  const r=entry.relationship;
  if(r.source.length!==1||r.target.length!==1){error('HETEROGENEOUS',path,'This bounded policy cannot type-check heterogeneous endpoints, including edge discriminators');continue;}
  if(!safeTable(layout.carrierTable))error('TABLE',path+'/carrierTable','Safe explicit carrier table required');
  if(keyId(layout.targetKey)!==keyId(r.target[0]!))error('KEY',path+'/targetKey','Target must use the relationship target Record and exact named Key ID');
  if(layout.storage==='foreign_key'){
   if(tables.get(id(r.source[0]!))!==layout.carrierTable)error('TABLE',path+'/carrierTable','FK carrier must equal the source Record table');
   if(layout.sourceKey||layout.sourceComponents||layout.sourceConstraint||layout.discriminator)error('EXTRA',path,'FK layout has extra junction/edge-only policy');
   if(r.associationRecord)error('ASSOCIATION',path,'An association Record cannot be reduced to a direct FK');
  }else{
   if(!layout.sourceKey||!same(layout.sourceKey,r.source[0]!)||!layout.sourceComponents||!layout.sourceConstraint)error('SOURCE_KEY',path,'Junction/edge requires an exact source Key and complete ordered source map');
   if(layout.storage==='junction'&&layout.discriminator)error('EXTRA',path+'/discriminator','Only edge storage uses a discriminator');
   if(layout.storage==='edge'&&(!layout.discriminator||layout.discriminator.sqlType!=='text'||layout.discriminator.nullable||layout.discriminator.collation!=='C'||!safeIdentifier(layout.discriminator.column)||layout.discriminator.value.includes('\0')))error('DISCRIMINATOR',path+'/discriminator','Edge requires a safe non-null C-collated text discriminator');
  }
  if(r.associationRecord){
   if(!layout.associationRecord||!same(layout.associationRecord,r.associationRecord)||tables.get(id(r.associationRecord))!==layout.carrierTable||!layout.associationKey||!same(layout.associationKey,r.associationRecord)||!keys.has(keyId(layout.associationKey)))error('ASSOCIATION',path,'Association Record, table and stable Key must survive explicitly');
   const record=elements.get(id(r.associationRecord));
   for(const member of (record?.members??[]) as CoreKeyFieldReference[])if(fields.get(id(member))?.table!==layout.carrierTable)error('ASSOCIATION_FIELD',path,'Every association Record member must survive as a declared carrier column');
  }else if(layout.associationRecord||layout.associationKey)error('EXTRA',path,'Policy cannot invent an association Record');
  else if(layout.storage!=='foreign_key'&&tableOwners.has(layout.carrierTable))error('TABLE',path,'Anonymous carrier must not overwrite a bound Record table');
  const previous=carrierOwners.get(layout.carrierTable)??[];
  if(!previous.length&&!tableOwners.has(layout.carrierTable)){
   const relation=JSON.stringify(layout.carrierTable.split('.'));
   if(relationNames.has(relation))error('COLLISION',path+'/carrierTable','Anonymous carrier collides with an index relation');
   relationNames.add(relation);
  }
  if(previous.length&&layout.storage!=='foreign_key'&&previous.some(p=>p.storage!=='edge'||layout.storage!=='edge'))error('COLLISION',path,'Only edge layouts may share anonymous carrier tables');
  previous.push(layout);carrierOwners.set(layout.carrierTable,previous);
  const occupied=new Set<string>();
  const endpoint=(end:'source'|'target',keyRef:PostgresqlLayoutKeyRef|undefined,components:PostgresqlLayoutEndpointComponent[]|undefined,constraint:string|undefined)=>{
   if(!keyRef||!components||!constraint)return;
   const k=keys.get(keyId(keyRef));if(!k){error('KEY',path+'/'+end+'Key','Endpoint Key requires its exact explicit layout');return;}
   addConstraint(layout.carrierTable,constraint,path+'/'+end+'Constraint');
   if(components.length!==k.components.length)error('COMPONENTS',path+'/'+end+'Components','Missing or extra endpoint components');
   components.forEach((c,ci)=>{
    const at=path+`/${end}Components/${ci}`,component=k.components[ci];
    if(!component||!same(component.keyField,c.keyField)||boundId(component.boundField)!==boundId(c.endpointField)||component.column!==c.endpointColumn)error('ORDER',at,'Endpoint components must preserve exact Key order and bound columns');
    if(!component||!typeSame(component,c))error('TYPE',at,'Referencing SQL type and collation must exactly match the endpoint comparator');
    if(!safeIdentifier(c.carrierColumn)||!family(c.sqlType))error('SQL',at,'Unsafe referencing column or type');
    if(occupied.has(c.carrierColumn))error('COLLISION',at,'Endpoint carrier columns overlap');occupied.add(c.carrierColumn);
    if(c.carrierField){const f=boundFields.get(boundId(c.carrierField));if(!f||f.table!==layout.carrierTable||f.column!==c.carrierColumn||!typeSame(f,c)||f.nullable!==c.nullable)error('CARRIER',at,'Referencing Field must match the exact bound carrier column/type/nullability');}
    else if(layout.storage==='foreign_key'||r.associationRecord)error('CARRIER',at,'A bound carrier Record requires an explicit referencing Field');
    if(c.nullable)residual('policy',`/relationshipLayouts/${i}/${end}Components/${ci}`,'PostgreSQL MATCH SIMPLE exempts composite references containing NULL; no authored participation guarantee',c);
   });
  };
  endpoint('target',layout.targetKey,layout.targetComponents,layout.targetConstraint);
  if(layout.storage!=='foreign_key')endpoint('source',layout.sourceKey,layout.sourceComponents,layout.sourceConstraint);
  if(layout.discriminator&&occupied.has(layout.discriminator.column))error('COLLISION',path+'/discriminator','Discriminator aliases an endpoint column');
  // Sharing edge storage requires identical physical layout and distinct values.
  for(const other of previous.slice(0,-1))if(layout.storage==='edge'&&other.storage==='edge'){
   const shape=(l:PostgresqlRelationshipLayout)=>JSON.stringify([l.sourceComponents?.map(c=>[c.carrierColumn,c.sqlType,c.nullable,c.collation]),l.targetComponents.map(c=>[c.carrierColumn,c.sqlType,c.nullable,c.collation]),l.discriminator?.column]);
   if(!layout.sourceKey||!other.sourceKey||keyId(layout.sourceKey)!==keyId(other.sourceKey)||keyId(layout.targetKey)!==keyId(other.targetKey))error('EDGE_ENDPOINT',path,'Shared edge FKs cannot switch endpoint Keys by discriminator; a separate conditional enforcement profile is required');
   if(shape(layout)!==shape(other)||layout.discriminator?.value===other.discriminator?.value)error('COLLISION',path,'Shared edge layouts need identical column shapes and distinct discriminator values');
  }
  residual('logical',entry.path,'Layout validation does not certify Key/relationship enforcement, participation bounds, lifecycle, inverse navigation or association semantics',r);
 }
 for(const [i,choice] of payload.relationships.entries()){
  if(choice.storage==='inline'){residual('binding',`/extensions/umf.binding/relationships/${i}`,'PostgreSQL 17 inline relationship carrier is unsupported',choice);continue;}
  if(!('id'in choice)||!seen.has(relationshipId(choice)))error('MISSING',`/binding/extensions/umf.binding/relationships/${i}`,'Missing exact relationship layout');
 }
 // Unknown logical refinements remain explicit; they cannot be silently treated as proven SQL meaning.
 for(const d of validation.diagnostics.filter(d=>d.code.startsWith('UNKNOWN_'))){
  let value:unknown=logical;
  for(const part of d.path.split('/').slice(1))value=(value as Record<string,unknown>)[part.replace(/~1/g,'/').replace(/~0/g,'~')];
  residual('logical',d.path,'Uninterpreted logical qualifier: '+d.message,value);
 }
 const blocked=result.diagnostics.some(d=>d.severity==='error')||(lossPolicy==='strict'&&result.residuals.length>0);
 result.status=blocked?'blocked':result.residuals.length?'reported':'validated';
 if(!blocked)result.candidate=copyJson(policy) as unknown as PostgresqlRelationshipLayoutPolicy;
 return result;
}
