/** Portable declarations; no file reads, network access or runtime execution. */
export function generatePreservationProfileSchema() {
 return {type:'object',required:['version','handoff','fixity','events','provenance','originals','primary_runtime'],properties:{
  version:{const:'1.0.0'},handoff:{const:'BagIt-1.0'},fixity:{const:'sha256'},events:{const:'PREMIS-3.0-semantic-mapping'},provenance:{const:'PROV-O-JSON-LD'},originals:{const:'authoritative-immutable-bytes'},primary_runtime:{const:'tablespec-python'},qualification:{type:'string',minLength:1},derivations:{type:'array',items:{type:'object',required:['schema_id','source_identity'],properties:{schema_id:{type:'string',minLength:1},source_identity:{type:'string',minLength:1},qualification:{type:'string',minLength:1}},additionalProperties:true}},
 },additionalProperties:true} as const;
}
