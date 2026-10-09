import {exportJsonSchemaBundle,exportJsonSchema} from '../../../../src/adapters/json-schema/index';
import {exportAvroBundle,exportAvroSchema} from '../../../../src/adapters/avro/index';
import {exportGraphqlBundle,exportGraphqlSchema} from '../../../../src/adapters/graphql/index';
import {exportOpenapiBundle,exportOpenapiDocument} from '../../../../src/adapters/openapi/index';
import {exportDeltaTable} from '../../../../src/adapters/delta/table';
import {exportDeltaLog} from '../../../../src/adapters/delta/log';
import {exportIcebergTable} from '../../../../src/adapters/iceberg/table';
import {exportDbtSemanticManifest} from '../../../../src/adapters/dbt/semantic';
import {exportDbtArtifact} from '../../../../src/adapters/dbt/artifact';
import {exportTypeSpecSources} from '../../../../src/adapters/typespec/index';
import {exportSmithySources} from '../../../../src/adapters/smithy/sources';
import {exportArrowIpcCapture} from '../../../../src/adapters/arrow/capture';
import {exportParquetCapture} from '../../../../src/adapters/parquet/index';
import {exportGeneralizedRdfDataset} from '../../../../src/adapters/generalized-rdf/index';
import {exportSqlServerCatalog} from '../../../../src/adapters/sqlserver/index';
import {exportPostgresqlCatalogCapture} from '../../../../src/adapters/postgresql/catalog';
import {exportProtobufDescriptorSet} from '../../../../src/adapters/protobuf/index';
import {exportSparkSchema} from '../../../../src/adapters/spark/index';
import {exportDeltaSchema} from '../../../../src/adapters/delta/index';
import {exportIcebergSchema} from '../../../../src/adapters/iceberg/index';
import {exportTableSpec} from '../../../../src/adapters/tablespec/index';
import {exportLinkmlDocument} from '../../../../src/adapters/linkml/index';
import {exportOdcsDocument} from '../../../../src/adapters/odcs/index';
import {exportJsonLdDocument} from '../../../../src/adapters/jsonld/index';
import {exportRdfNQuads} from '../../../../src/adapters/rdf/index';
import {exportOwlTurtle} from '../../../../src/adapters/owl/index';
import {exportShaclTurtle} from '../../../../src/adapters/shacl/index';
import {exportDbtManifest} from '../../../../src/adapters/dbt/index';
import {exportSmithyJson} from '../../../../src/adapters/smithy/index';
import {exportArrowSchema} from '../../../../src/adapters/arrow/index';
const adapters={exportJsonSchemaBundle,exportAvroBundle,exportGraphqlBundle,exportOpenapiBundle,exportDeltaTable,exportDeltaLog,exportIcebergTable,exportDbtSemanticManifest,exportDbtArtifact,exportTypeSpecSources,exportSmithySources,exportArrowIpcCapture,exportParquetCapture,exportGeneralizedRdfDataset,exportSqlServerCatalog,exportPostgresqlCatalogCapture,exportJsonSchema,exportAvroSchema,exportGraphqlSchema,exportProtobufDescriptorSet,exportSparkSchema,exportDeltaSchema,exportIcebergSchema,exportOpenapiDocument,exportTableSpec,exportLinkmlDocument,exportOdcsDocument,exportJsonLdDocument,exportRdfNQuads,exportOwlTurtle,exportShaclTurtle,exportDbtManifest,exportSmithyJson,exportArrowSchema};
import type {Parsed} from './explorer-model';
/** Native exporters validate their pinned representation before emitting content. */
const exporters:Record<string,[string,string]>={
 'umf.delta.table':['exportDeltaTable','delta-table.json'],'umf.delta.log':['exportDeltaLog','delta-log.json'],'umf.iceberg.table':['exportIcebergTable','iceberg-table.json'],'umf.dbt.semantic':['exportDbtSemanticManifest','semantic-manifest.json'],'umf.dbt.artifact':['exportDbtArtifact','dbt-artifact.json'],'umf.typespec':['exportTypeSpecSources','typespec-sources.json'],'umf.arrow.ipc':['exportArrowIpcCapture','schema.arrow'],'umf.parquet':['exportParquetCapture','schema.parquet'],'umf.generalized-rdf':['exportGeneralizedRdfDataset','rdf-dataset.json'],'umf.sqlserver':['exportSqlServerCatalog','sqlserver-catalog.json'],'umf.postgresql.catalog':['exportPostgresqlCatalogCapture','postgresql-catalog.json'],
 'umf.json-schema':['exportJsonSchemaBundle','json-schema-bundle.json'],'umf.avro':['exportAvroBundle','avro-bundle.json'],'umf.graphql':['exportGraphqlBundle','graphql-bundle.json'],'umf.protobuf':['exportProtobufDescriptorSet','schema.pb'],
 'umf.spark':['exportSparkSchema','schema.spark.json'],'umf.delta':['exportDeltaSchema','schema.delta.json'],'umf.iceberg':['exportIcebergSchema','schema.iceberg.json'],
 'umf.openapi':['exportOpenapiBundle','openapi-bundle.json'],'umf.tablespec':['exportTableSpec','table.native.txt'],'umf.linkml':['exportLinkmlDocument','schema.linkml.json'],'umf.odcs':['exportOdcsDocument','contract.json'],
 'umf.jsonld':['exportJsonLdDocument','schema.jsonld'],'umf.rdf':['exportRdfNQuads','schema.nq'],'umf.owl':['exportOwlTurtle','schema.owl.ttl'],'umf.shacl':['exportShaclTurtle','schema.shacl.ttl'],
 'umf.dbt.manifest':['exportDbtManifest','manifest.json'],'umf.smithy':['exportSmithyJson','model.smithy.json'],'umf.arrow':['exportArrowSchema','schema.arrow.json'],
};
export function nativeDownloads(parsed:Parsed){if(!parsed.document)return [];const out:{name:string;content:string|Uint8Array}[]=[];for(const id of Object.keys(parsed.document.vocabularies)){const spec=exporters[id];if(!spec)continue;const fn=(adapters as unknown as Record<string,unknown>)[spec[0]];if(typeof fn!=='function')continue;try{out.push({name:spec[1],content:(()=>{const value=['umf.linkml','umf.odcs'].includes(id)?fn(parsed.document,'json'):fn(parsed.document);return typeof value==='string'||value instanceof Uint8Array?value:JSON.stringify(value,null,2);})()});}catch(error){out.push({name:spec[1]+'.export-error.txt',content:'Native recovery blocked: '+String(error instanceof Error?error.message:error)});}}return out;}
