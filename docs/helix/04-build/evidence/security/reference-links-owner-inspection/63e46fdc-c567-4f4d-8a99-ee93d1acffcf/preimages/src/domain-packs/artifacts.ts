/** Original resource collections; semantic kind, media type and browser view are independent. */
export function generateArtifactCollectionSchema(){
 const text={type:'string',minLength:1};
 const references={type:'array',maxItems:10000,uniqueItems:true,items:text};
 const assertion={type:'object',required:['description'],properties:{description:text,fields:references},additionalProperties:true};
 return {type:'object',required:['version','id','title','view','semantic_kinds','source_ids'],properties:{
  version:{const:'1.0.0'},id:{type:'string',pattern:'^[A-Za-z][A-Za-z0-9_-]*$'},title:text,description:{type:'string'},
  view:{enum:['documents','imaging','other']},semantic_kinds:{...references,minItems:1},source_ids:references,
  media_types:references,metadata_schema_ids:references,derived_schema_ids:references,ontology_schema_ids:references,
  loader_inventory_source_id:text,identity:assertion,grouping:assertion,
 },anyOf:[{properties:{source_ids:{type:'array',minItems:1}}},{required:['loader_inventory_source_id'],properties:{loader_inventory_source_id:text}}],additionalProperties:true} as const;
}
/** Call only after structural pack validation; references never authorize retrieval. */
export function inspectArtifactReferences(pack:any):string[]{
 const diagnostics:string[]=[],collections=pack.artifact_collections??[],schemas=pack.schemas??[],sources=pack.sources??{};
 const ids=collections.map((c:any)=>c.id);
 if(new Set(ids).size!==ids.length)diagnostics.push('Duplicate artifact collection identity');
 for(const collection of collections){
  for(const id of collection.source_ids)if(!Object.hasOwn(sources,id))diagnostics.push('Unresolved artifact source: '+id);
  if(collection.loader_inventory_source_id&&!Object.hasOwn(sources,collection.loader_inventory_source_id))diagnostics.push('Unresolved artifact inventory source');
  for(const field of ['metadata_schema_ids','derived_schema_ids','ontology_schema_ids'])for(const id of collection[field]??[]){
   const schema=schemas.find((s:any)=>s.id===id);
   if(!schema)diagnostics.push('Unresolved artifact schema: '+id);
   else if(field==='metadata_schema_ids'&&schema.format!=='tablespec'||field==='ontology_schema_ids'&&schema.format!=='umf')diagnostics.push('Artifact schema format mismatch: '+id);
  }
 }
 return diagnostics;
}
