/** Private genuinely-new cohort staging; caller retains the original transaction. */
import {randomUUID} from 'node:crypto';
import {requireOriginalCatalogPreparation,type createCatalogInputPreparation} from './catalog-input';
type Prepared=ReturnType<Awaited<ReturnType<typeof createCatalogInputPreparation>>['prepare']>;
type Rows=Record<string,string>[];
export interface CatalogStageConnection {unsafe(query:string,parameters?:unknown[]):Promise<Rows>}
export interface CatalogPropertyHome {documentId:string;moduleId:string;elementId:string;fieldModule:string;fieldId:string;home:'json'|'row'}
const same=(a:{documentId:string;moduleId:string;elementId:string},b:{documentId:string;moduleId:string;elementId:string})=>a.documentId===b.documentId&&a.moduleId===b.moduleId&&a.elementId===b.elementId;
const id=(value:unknown):string=>{if(typeof value!=='string'||!(/^[1-9][0-9]{0,9}$/).test(value)||BigInt(value)>2147483647n)throw Error('Original native catalog ID required');return value};
export async function stageNewCatalogCohort(connection:CatalogStageConnection,prepared:Prepared,homes:readonly CatalogPropertyHome[],origin:unknown){
 requireOriginalCatalogPreparation(prepared);
 if(prepared.original.input.transforms.length)throw Error('Complete transform execution and report producer required');
 const records=prepared.declarations.flatMap(document=>document.records);
 const declared=records.flatMap(record=>record.fields.map(field=>({...record,field})));
 if(homes.length!==declared.length)throw Error('Complete original property home inventory required');
 const selected=declared.map(({field,...record})=>{const matches=homes.filter(home=>same(home,record)&&home.fieldModule===field.fieldModule&&home.fieldId===field.fieldId);if(matches.length!==1||!['json','row'].includes(matches[0].home))throw Error('Unique original property home required');return {record,field,home:matches[0].home}});
 const savepoint='truss_catalog_'+randomUUID().replaceAll('-','');
 await connection.unsafe('SAVEPOINT '+savepoint);
 try{
  await connection.unsafe("SELECT truss.runtime_require_catalog_input(decode($1::text,'hex'))",[prepared.original.originalUtf8Hex]);
  await connection.unsafe('SELECT truss.runtime_require_catalog_document_carrier($1::text::jsonb)',[JSON.stringify(prepared.archiveDocuments)]);
  const revision=await connection.unsafe("SELECT * FROM truss.runtime_stage_catalog_documents($1::text::jsonb,$2::text::jsonb)",[JSON.stringify(prepared.archiveDocuments),JSON.stringify(origin)]);
  if(revision.length!==1)throw Error('Original staged revision correspondence');const rev=id(revision[0].provisional_revision);
  const types=records.length?await connection.unsafe('SELECT * FROM truss.runtime_stage_new_types($1::int,$2::text::jsonb)',[rev,JSON.stringify(records.map(({documentId,moduleId,elementId})=>({documentId,moduleId,elementId})))]):[];
  function type(record:{documentId:string;moduleId:string;elementId:string}){const rows=types.filter(row=>row.document_id===record.documentId&&row.module_id===record.moduleId&&row.element_id===record.elementId);if(rows.length!==1)throw Error('Original allocated Record correspondence');return id(rows[0].type_id)}
  const properties=selected.length?await connection.unsafe('SELECT * FROM truss.runtime_stage_new_properties($1::int,$2::text::jsonb)',[rev,JSON.stringify(selected.map(({record,field,home})=>({ownerTypeId:type(record),fieldModule:field.fieldModule,field:field.declaration,home})))]):[];
  function property(ownerTypeId:string,reference:Record<string,unknown>){const rows=properties.filter(row=>row.owner_type_id===ownerTypeId&&row.field_module===reference.module&&row.field_id===reference.element);if(rows.length!==1)throw Error('Original allocated Field correspondence');return id(rows[0].property_id)}
  const keyCandidates=records.flatMap(record=>record.keys.map(key=>{if(typeof key.primary!=='boolean')throw Error('Original primary key selection required');return {ownerTypeId:type(record),keyId:key.id,primary:key.primary,propertyIds:(key.fields as Record<string,unknown>[]).map(reference=>property(type(record),reference))}}));
  const keys=keyCandidates.length?await connection.unsafe('SELECT * FROM truss.runtime_stage_new_keys($1::int,$2::text::jsonb)',[rev,JSON.stringify(keyCandidates)]):[];
  const relationships=[];
  for(const document of prepared.declarations)for(const relationship of document.relationships){
   const endpoints=(side:'source'|'target')=>{const references=relationship.declaration[side];if(!Array.isArray(references))throw Error('Original relationship endpoint array required');return references.map(reference=>type({documentId:relationship.documentId,moduleId:reference.module,elementId:reference.element}))};
   const rows=await connection.unsafe('SELECT truss.runtime_stage_new_relationship($1::int,$2::text,$3::text,$4::text::jsonb,$5::text::int[],$6::text::int[]) AS relationship_id',[rev,relationship.documentId,relationship.moduleId,JSON.stringify(relationship.declaration),'{'+endpoints('source').join(',')+'}','{'+endpoints('target').join(',')+'}']);
   if(rows.length!==1)throw Error('Original allocated relationship correspondence');relationships.push(Object.freeze({...relationship,relationshipId:id(rows[0].relationship_id)}));
  }
  await connection.unsafe('RELEASE SAVEPOINT '+savepoint);
  return Object.freeze({provisionalRevision:rev,types:Object.freeze(types),properties:Object.freeze(properties),keys:Object.freeze(keys),relationships:Object.freeze(relationships),scope:'provisional_new_catalog_staging_only' as const});
 }catch(error){await connection.unsafe('ROLLBACK TO SAVEPOINT '+savepoint);await connection.unsafe('RELEASE SAVEPOINT '+savepoint);throw error}
}
