import type {Parsed} from './explorer-model';
type BrowserSdk=typeof import('../../../../src/index-browser-v4');
const exporters={
 'umf.delta.table':['exportDeltaTable','delta-table.json'],'umf.delta.log':['exportDeltaLog','delta-log.json'],'umf.iceberg.table':['exportIcebergTable','iceberg-table.json'],'umf.dbt.semantic':['exportDbtSemanticManifest','semantic-manifest.json'],'umf.dbt.artifact':['exportDbtArtifact','dbt-artifact.json'],'umf.typespec':['exportTypeSpecSources','typespec-sources.json'],'umf.arrow.ipc':['exportArrowIpcCapture','schema.arrow'],'umf.parquet':['exportParquetCapture','schema.parquet'],'umf.generalized-rdf':['exportGeneralizedRdfDataset','rdf-dataset.json'],'umf.sqlserver':['exportSqlServerCatalog','sqlserver-catalog.json'],'umf.postgresql.catalog':['exportPostgresqlCatalogCapture','postgresql-catalog.json'],
 'umf.json-schema':['exportJsonSchemaBundle','json-schema-bundle.json'],'umf.avro':['exportAvroBundle','avro-bundle.json'],'umf.graphql':['exportGraphqlBundle','graphql-bundle.json'],'umf.protobuf':['exportProtobufDescriptorSet','schema.pb'],
 'umf.spark':['exportSparkSchema','schema.spark.json'],'umf.delta':['exportDeltaSchema','schema.delta.json'],'umf.iceberg':['exportIcebergSchema','schema.iceberg.json'],
 'umf.openapi':['exportOpenapiBundle','openapi-bundle.json'],'umf.tablespec':['exportTableSpec','table.native.txt'],'umf.linkml':['exportLinkmlDocument','schema.linkml.json'],'umf.odcs':['exportOdcsDocument','contract.json'],
 'umf.jsonld':['exportJsonLdDocument','schema.jsonld'],'umf.rdf':['exportRdfNQuads','schema.nq'],'umf.owl':['exportOwlTurtle','schema.owl.ttl'],'umf.shacl':['exportShaclTurtle','schema.shacl.ttl'],
 'umf.dbt.manifest':['exportDbtManifest','manifest.json'],'umf.smithy':['exportSmithyJson','model.smithy.json'],'umf.arrow':['exportArrowSchema','schema.arrow.json'],
} as const satisfies Record<string,readonly [keyof BrowserSdk,string]>;

type ExporterName=(typeof exporters)[keyof typeof exporters][0];
type NativeExporters=Pick<BrowserSdk,ExporterName>;

export async function nativeDownloads(parsed:Parsed,runtime?:NativeExporters){
 const document=parsed.document;
 if(!document)return [];
 const entries=Object.keys(document.vocabularies)
  .filter(id=>Object.hasOwn(exporters,id))
  .map(id=>exporters[id as keyof typeof exporters]);
 if(!entries.length)return [];
 const sdk=runtime??await import('../../../../src/index-browser-v4');
 const out:{name:string;content:string|Uint8Array}[]=[];
 for(const [method,name] of entries){
  try{
   const value=method==='exportLinkmlDocument'||method==='exportOdcsDocument'
    ?sdk[method](document,'json'):sdk[method](document);
   out.push({name,content:typeof value==='string'||value instanceof Uint8Array?value:JSON.stringify(value,null,2)});
  }catch(error){
   out.push({name:name+'.export-error.txt',content:'Native recovery blocked: '+String(error instanceof Error?error.message:error)});
  }
 }
 return out;
}
