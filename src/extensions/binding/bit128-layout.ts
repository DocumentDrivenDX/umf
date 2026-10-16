import {expandAssociations,type AssociationLayout} from './model-associations';
import {modelShapes,type JsonCarrier} from './model-shape';
import {checkModelScalar,type ScalarCarrier} from './model-scalar';
import type {Document,Element} from '../../model/types';
import {UmfError} from '../../model/types';
import type {Bit128BindingPayload,Bit128FieldBinding,Bit128Carrier} from './bit128';
import type {CoreRelationship} from '../../validation/relationships';
export interface Bit128Ref {module:string;element:string}
export interface Bit128Key {id:string;name:string;fields:Bit128Ref[];primary?:boolean}
export interface Bit128ForeignKey {module:string;id:string;storage:'foreign_key';fields:Bit128Ref[]}
export interface Bit128Index {name:string;kind:'btree'|'unique';on:{field:Bit128Ref}[];unique:boolean}
export interface Resolved128Field {identity:Bit128Ref;field:Element;carrier:Bit128Carrier|ScalarCarrier|JsonCarrier;slots:string[]}
export interface Resolved128Record {identity:Bit128Ref;record:Element;table:string;fields:Resolved128Field[];keys:Bit128Key[]}
export interface Resolved128Relation {declaration:CoreRelationship;layout:Bit128ForeignKey;source:Resolved128Record;target:Resolved128Record;sourceFields:Resolved128Field[];targetFields:Resolved128Field[];targetKey:Bit128Key}
export interface Resolved128Layout {records:Resolved128Record[];relationships:Resolved128Relation[];indexes:{index:Bit128Index;record:Resolved128Record;fields:Resolved128Field[]}[];associations?:{layout:AssociationLayout;declaration:CoreRelationship}[]}
export const bit128RefKey=(r:Bit128Ref)=>JSON.stringify([r.module,r.element]);
export const bit128CarrierSlots=(c:Bit128Carrier)=>c.kind==='words64'?[c.highColumn,c.lowColumn]:[c.column];
function fail(message:string):never{throw new UmfError('BIT128_LAYOUT',message);}
function known(value:object,names:string[]){if(!value||typeof value!=='object'||Array.isArray(value))fail('Expected layout object');if(Object.keys(value).some(k=>!names.includes(k)))fail('Unknown layout qualifier retained; cannot lower');}
function ref(value:Bit128Ref){known(value,['module','element']);}
/** Receives copied, structurally validated binding/source. No native execution or name inference. */
export function resolveBit128ModelLayout(payload:Bit128BindingPayload,logical:Document):Resolved128Layout {
 const mixed=payload.target.subset==='uuid-model2';
 if(!mixed&&payload.target.subset!=='uuid-model1')fail('Explicit uuid-model1 subset required');
 const {system,version}=payload.target;
 if(!(system==='postgresql'&&/^17(?:\.|$)/.test(version)||system==='sqlserver'&&version==='2022'||system==='avro'&&version==='1.12.0'||system==='parquet'&&version==='2.11.0'||system==='tablespec'&&version==='1.0'))fail('Unsupported versioned model target');
 const nativeName=(name:string,record=false)=>{
  if(typeof name!=='string')fail('Explicit native name required');
  if(['postgresql','sqlserver'].includes(system)&&(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)||name.length>(system==='postgresql'?63:128)))fail('Invalid model SQL identifier');
  if(system==='avro'&&(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)||record&&['null','boolean','int','long','float','double','bytes','string'].includes(name)))fail('Invalid model Avro name');
  if(system==='tablespec'&&!/^[A-Za-z][A-Za-z0-9_]{0,127}$/.test(name))fail('Invalid model TableSpec name');
  if(!name||name.includes('\0'))fail('Invalid native slot name');
 };
 for(const e of payload.elements)if(e.table)nativeName(e.table,true);
 for(const row of payload.fields)if(row.storage==='scalar-carrier'){
  const c=row.carrier;if(!['native-uuid','bytes16','uuid-text','hex128-text','words64'].includes(c.kind))fail('Unknown model carrier');for(const name of bit128CarrierSlots(c))nativeName(name);
  if(c.kind==='words64'&&(!c.signed&&system!=='parquet'||system==='tablespec')||system==='tablespec'&&!['uuid-text','hex128-text'].includes(c.kind))fail('Selected carrier is outside the versioned model target');
 }
 const same=(a:Bit128Ref,b:Bit128Ref)=>bit128RefKey(a)===bit128RefKey(b);
 const shapes=mixed?modelShapes(payload,logical):undefined;
 const declaredRecords=logical.modules.flatMap(m=>m.elements.filter(e=>e.kind==='record').map(record=>({identity:{module:m.id,element:record.id},record})));
 if(!declaredRecords.length)fail('At least one Record required');
 const records:Resolved128Record[]=declaredRecords.map(({identity,record})=>{
  if(record.extensions&&Object.keys(record.extensions).length)fail('Record extension meaning needs a separately qualified layout');
  const binding=payload.elements.find(e=>same(e,identity));
  if(!binding?.table||binding.partition!=null)fail('Each Record requires an unpartitioned exact table binding');
  const members=record.members as Bit128Ref[];
  if(!members?.length)fail('Nonempty explicit Record membership required');
  const fields=members.map(identity=>{
   ref(identity);
   const field=logical.modules.find(m=>m.id===identity.module)?.elements.find(e=>e.id===identity.element);
   const row=payload.fields.find(r=>same(r,identity));
   if(!field||!row)fail('Every member requires an explicit supported carrier');
   if(mixed)return {identity,field,...shapes!.root(identity)};
   if(row.storage!=='scalar-carrier')fail('Every member requires an explicit128-bit scalar carrier');
   if(field.cardinality!=='one'||!['required','absent-allowed'].includes(field.nullability as string))fail('Singular known availability required');
   if(field.extensions&&Object.keys(field.extensions).length)fail('Field extension meaning requires separate native qualification');
   return {identity,field,carrier:row.carrier,slots:bit128CarrierSlots(row.carrier)};
  });
  for(const f of fields)for(const n of f.slots)nativeName(n);
  const nativeSlots=fields.flatMap(f=>f.slots).map(n=>system==='sqlserver'?n.toLowerCase():n);if(new Set(nativeSlots).size!==nativeSlots.length)fail('Native column collision');
  const keys=(record.keys??[]) as unknown as Bit128Key[];
  for(const k of keys){if(k.fields.some(ref=>fields.find(f=>same(f.identity,ref))?.carrier.kind==='json'))fail('Container/group Keys are undefined');known(k,['id','name','fields','primary']);for(const r of k.fields)ref(r);if(k.fields.some(r=>!fields.some(f=>same(r,f.identity))))fail('Key components must belong to the Record');}
  return {identity,record,table:binding.table!,fields,keys};
 });
 const tableNames=records.map(r=>payload.target.system==='sqlserver'?r.table.toLowerCase():r.table);
 if(new Set(tableNames).size!==tableNames.length)fail('Distinct Records cannot share a table in this profile');
 const boundFields=records.flatMap(r=>r.fields.map(f=>bit128RefKey(f.identity)));
 if(new Set(boundFields).size!==boundFields.length||!mixed&&payload.fields.length!==boundFields.length)fail('Each bound Field must have exactly one Record owner');
 if(!mixed&&logical.modules.flatMap(m=>m.elements).some(e=>e.kind!=='record'&&e.kind!=='field'))fail('Unlowered group requires separate layout');
 if(!mixed&&logical.modules.reduce((n,m)=>n+m.elements.filter(e=>e.kind==='field').length,0)!==boundFields.length)fail('Unbound source Field would be lost');
 shapes?.complete();
 if(payload.elements.length!==records.length)fail('Only exact Record table bindings are admitted');
 const expanded=mixed?expandAssociations(payload,logical):{source:logical,payload,associations:[]};
 const relationSource=expanded.source,relationPayload=expanded.payload;
 const relationships:Resolved128Relation[]=[];
 for(const m of relationSource.modules)for(const declaration of (m.relationships??[]) as CoreRelationship[]){
  const rows=(relationPayload.relationships as Bit128ForeignKey[]).filter(r=>r.module===m.id&&r.id===declaration.id);
  if(rows.length!==1)fail('Each relationship requires exactly one explicit layout');
  const layout=rows[0]!;known(layout,['module','id','storage','fields']);
  if(layout.storage!=='foreign_key'||!Array.isArray(layout.fields)||declaration.source.length!==1||declaration.target.length!==1||declaration.associationRecord||!declaration.directed)fail('Relationship needs a supported directed singular-endpoint foreign-key layout');
  for(const r of layout.fields)ref(r);
  const source=records.find(r=>same(r.identity,declaration.source[0]!)),target=records.find(r=>same(r.identity,declaration.target[0]!));
  if(!source||!target)fail('Relationship Records not bound');
  const targetKey=target!.keys.find(k=>k.id===declaration.target[0]!.key);
  if(!targetKey||layout.fields.length!==targetKey.fields.length)fail('Foreign-key component arity differs');
  const sourceFields=layout.fields.map(r=>source!.fields.find(f=>same(f.identity,r))??fail('Foreign-key Field not owned by source'));
  if(new Set(layout.fields.map(bit128RefKey)).size!==layout.fields.length)fail('Repeated foreign-key component');
  const targetFields=targetKey!.fields.map(r=>target!.fields.find(f=>same(f.identity,r))!);
  for(let i=0;i<sourceFields.length;i++){
   const a=sourceFields[i]!,b=targetFields[i]!;
   // Column labels differ; carrier encoding and logical domains must agree exactly.
   if(a.field.scalarType!==b.field.scalarType||a.carrier.kind!==b.carrier.kind||a.carrier.kind==='scalar'&&JSON.stringify(a.field.facets??{})!==JSON.stringify(b.field.facets??{})||a.carrier.kind==='words64'&&b.carrier.kind==='words64'&&a.carrier.signed!==b.carrier.signed)fail('Foreign-key carrier/domain mismatch');
  }
  if(new Set(sourceFields.map(f=>f.field.nullability)).size!==1)fail('Composite foreign-key availability must agree across every component');
  relationships.push({declaration,layout,source:source!,target:target!,sourceFields,targetFields,targetKey:targetKey!});
 }
 if(relationships.length!==relationPayload.relationships.length)fail('Unmatched relationship layout');
 const indexes=(payload.indexes as Bit128Index[]).map(index=>{
  known(index,['name','kind','on','unique']);nativeName(index.name);
  if(!['btree','unique'].includes(index.kind)||index.kind==='unique'&&!index.unique||!index.on?.length)fail('Only explicit Field btree/unique indexes supported');
  const fields=index.on.map(item=>{known(item,['field']);if(!item.field)fail('Document index paths require another profile');ref(item.field);return records.flatMap(r=>r.fields).find(f=>same(f.identity,item.field))??fail('Index Field not bound');});
  const record=records.find(r=>r.fields.includes(fields[0]!))!;
  if(fields.some(f=>!record.fields.includes(f))||new Set(fields).size!==fields.length)fail('Index needs distinct Fields in one Record');
  return {index,record,fields};
 });
 for(const {layout:a} of expanded.associations){const record=records.find(r=>same(r.identity,a.record))!;for(const side of ['source','target'] as const)for(const end of a[side])for(const ref of end.fields){const f=record.fields.find(f=>same(f.identity,ref));if(!f||f.carrier.kind==='json'||a[side].length>1&&f.field.nullability!=='absent-allowed')fail('Polymorphic endpoints need nullable scalar components');}}
 return {records,relationships,indexes,associations:expanded.associations};
}
