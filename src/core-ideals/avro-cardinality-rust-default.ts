// SPDX-License-Identifier: MIT OR Apache-2.0
import {copyJson} from '../model/json';
import {UmfError,type Document} from '../model/types';
import type {AvroCardinalityClassification,AvroCardinalityRequest} from './cardinality-avro';
import type {AvroRecordTypeClassification,AvroRecordTypeRequest} from './avro-record-type';
import type {AvroFieldClassification,AvroFieldRequest} from './avro-field';
import type {AvroRecordClassification,AvroRecordRequest} from './avro-record';
import type {ParquetRecordTypeClassification,ParquetRecordTypeRequest} from './parquet-record-type';
import type {ParquetRecordClassification,ParquetRecordRequest} from './parquet-record';
import type {NullabilityAvroProjection,NullabilityAvroRequest} from './nullability-avro-projection';
import type {CoreNullabilityDeclaration} from '../model/nullability';
import type {FacetsAvroProjection,FacetsAvroRequest} from './facets-avro-projection';
import type {FacetsSqlServerProjection,FacetsSqlServerRequest} from './facets-sqlserver-projection';
import type {CoreFacetDeclaration} from '../model/facets';
import type {CoreKindDeclaration} from '../model/field-kind';
import type {KeyAvroProjection,KeyAvroRequest} from './key-avro-projection';
import type {CoreKeyDeclaration} from '../model/keys';
import type {RelationshipAvroProjection,RelationshipAvroRequest} from './relationship-avro-projection-factory';
import type {RelationshipParquetProjection,RelationshipParquetRequest} from './relationship-parquet-projection-factory';
import type {RelationshipTableSpecProjection,RelationshipTableSpecRequest} from './relationship-tablespec-projection-factory';
import type {AvroKeyClassification,AvroKeyRequest,AvroKeyArchive} from './key-avro';
import type {AvroRelationshipClassification,AvroRelationshipRequest,AvroRelationshipArchive} from './relationship-avro';
import type {AvroNullabilityClassification,AvroNullabilityRequest} from './nullability-avro';
import type {AvroFacetClassification,AvroFacetRequest} from './facets-avro';
import type {ParquetRelationshipClassification,ParquetRelationshipRequest} from './relationship-parquet';
import type {ParquetNullabilityClassification,ParquetNullabilityRequest} from './nullability-parquet';
import type {ParquetFieldClassification,ParquetFieldRequest} from './parquet-field';
import type {ParquetKeyClassification,ParquetKeyRequest} from './key-parquet';
import type {ParquetCardinalityClassification,ParquetCardinalityRequest} from './cardinality-parquet';
import type {ParquetFacetClassification,ParquetFacetRequest} from './facets-parquet';
import type {RelationshipSqlServerProjection,RelationshipSqlServerRequest} from './relationship-sqlserver-projection-factory';
import type {CardinalitySqlServerProjection,CardinalitySqlServerRequest} from './cardinality-sqlserver-projection';
import type {FieldSqlServerProjection,FieldSqlServerRequest} from './field-sqlserver-projection';
import type {RecordSqlServerProjection,RecordSqlServerRequest} from './record-sqlserver-projection';
import type {CoreCardinalityDeclaration} from '../model/cardinality';

type NativeErrorGuard=(error:unknown)=>boolean;
export interface CoreIdealNativeFamilies {
  ['field-record-sqlserver-projection']:{
    projectFieldToSqlServer(fields:{author:CoreKindDeclaration;request:FieldSqlServerRequest}):unknown;
    recoverFieldFromSqlServer(fields:{receipt:FieldSqlServerProjection;nativeText:string}):unknown;
    projectRecordToSqlServer(fields:{author:CoreKindDeclaration;request:RecordSqlServerRequest}):unknown;
    recoverRecordFromSqlServer(fields:{receipt:RecordSqlServerProjection;nativeText:string}):unknown;
  };
  ['cardinality-sqlserver-projection']:{
    projectCardinalityToSqlServer(fields:{author:CoreCardinalityDeclaration;request:CardinalitySqlServerRequest}):unknown;
    recoverCardinalityFromSqlServer(fields:{receipt:CardinalitySqlServerProjection;nativeText:string}):unknown;
  };
  ['avro-cardinality']:{
    classifyAvroCardinality(fields:{source:Document;request:AvroCardinalityRequest}):unknown;
    verifyAvroCardinalityClassification(fields:{receipt:AvroCardinalityClassification;current:Document}):unknown;
    recoverAvroCardinalityBundle(fields:{receipt:AvroCardinalityClassification;current:Document}):unknown;
  };
  ['avro-classification']:{
    classifyAvroField(fields:{source:Document;request:AvroFieldRequest}):unknown;
    recoverAvroFieldBundle(fields:{receipt:AvroFieldClassification;current:Document}):unknown;
    classifyAvroRecord(fields:{source:Document;request:AvroRecordRequest}):unknown;
    recoverAvroRecordBundle(fields:{receipt:AvroRecordClassification;current:Document}):unknown;
    classifyAvroKeys(fields:{source:Document;request:AvroKeyRequest}):unknown;
    verifyAvroKeyClassification(fields:{receipt:AvroKeyClassification;current:Document}):unknown;
    recoverAvroKeySource(fields:{receipt:AvroKeyClassification;current:Document}):unknown;
    classifyAvroRelationships(fields:{source:Document;request:AvroRelationshipRequest}):unknown;
    verifyAvroRelationshipClassification(fields:{receipt:AvroRelationshipClassification;current:Document}):unknown;
    recoverAvroRelationshipSource(fields:{receipt:AvroRelationshipClassification;current:Document}):unknown;
    classifyAvroNullability(fields:{source:Document;request:AvroNullabilityRequest}):unknown;
    verifyAvroNullabilityClassification(fields:{receipt:AvroNullabilityClassification;current:Document}):unknown;
    recoverAvroNullabilityBundle(fields:{receipt:AvroNullabilityClassification;current:Document}):unknown;
    classifyAvroFacets(fields:{source:Document;request:AvroFacetRequest}):unknown;
    verifyAvroFacetClassification(fields:{receipt:AvroFacetClassification;current:Document}):unknown;
    recoverAvroFacetSource(fields:{receipt:AvroFacetClassification;current:Document}):unknown;
  };
  ['record-type']:{
    classifyAvroRecordType(fields:{source:Document;request:AvroRecordTypeRequest}):unknown;
    recoverAvroRecordTypeBundle(fields:{receipt:AvroRecordTypeClassification;current:Document}):unknown;
    classifyParquetRecordType(fields:{source:Document;request:ParquetRecordTypeRequest}):unknown;
    recoverParquetRecordTypeBytes(fields:{receipt:ParquetRecordTypeClassification;current:Document}):unknown;
    classifyParquetRecord(fields:{source:Document;request:ParquetRecordRequest}):unknown;
    recoverParquetRecordBytes(fields:{receipt:ParquetRecordClassification;current:Document}):unknown;
    classifyParquetRelationships(fields:{source:Document;request:ParquetRelationshipRequest}):unknown;
    verifyParquetRelationshipClassification(fields:{receipt:ParquetRelationshipClassification;current:Document}):unknown;
    recoverParquetRelationshipSource(fields:{receipt:ParquetRelationshipClassification;current:Document}):unknown;
    classifyParquetNullability(fields:{source:Document;request:ParquetNullabilityRequest}):unknown;
    verifyParquetNullabilityClassification(fields:{receipt:ParquetNullabilityClassification;current:Document}):unknown;
    recoverParquetNullabilityBytes(fields:{receipt:ParquetNullabilityClassification;current:Document}):unknown;
    classifyParquetField(fields:{source:Document;request:ParquetFieldRequest}):unknown;
    verifyParquetFieldClassification(fields:{receipt:ParquetFieldClassification;current:Document}):unknown;
    recoverParquetFieldBytes(fields:{receipt:ParquetFieldClassification;current:Document}):unknown;
    classifyParquetKeys(fields:{source:Document;request:ParquetKeyRequest}):unknown;
    verifyParquetKeyClassification(fields:{receipt:ParquetKeyClassification;current:Document}):unknown;
    recoverParquetKeySource(fields:{receipt:ParquetKeyClassification;current:Document}):unknown;
    classifyParquetCardinality(fields:{source:Document;request:ParquetCardinalityRequest}):unknown;
    verifyParquetCardinalityClassification(fields:{receipt:ParquetCardinalityClassification;current:Document}):unknown;
    recoverParquetCardinalityBytes(fields:{receipt:ParquetCardinalityClassification;current:Document}):unknown;
    classifyParquetFacets(fields:{source:Document;request:ParquetFacetRequest}):unknown;
    verifyParquetFacetClassification(fields:{receipt:ParquetFacetClassification;current:Document}):unknown;
    recoverParquetFacetSource(fields:{receipt:ParquetFacetClassification;current:Document}):unknown;
  };
  ['nullability-avro-projection']:{
    projectNullabilityToAvro(fields:{author:CoreNullabilityDeclaration;request:NullabilityAvroRequest}):unknown;
    recoverNullabilityFromAvro(fields:{receipt:NullabilityAvroProjection;nativeText:string}):unknown;
  };
  ['facets-sqlserver-projection']:{
    projectFacetsToSqlServer(fields:{author:CoreFacetDeclaration|CoreKindDeclaration;request:FacetsSqlServerRequest}):unknown;
    recoverFacetsFromSqlServer(fields:{receipt:FacetsSqlServerProjection;nativeText:string}):unknown;
  };
  ['facets-avro-projection']:{
    projectFacetsToAvro(fields:{author:CoreFacetDeclaration|CoreKindDeclaration;request:FacetsAvroRequest}):unknown;
    recoverFacetsFromAvro(fields:{receipt:FacetsAvroProjection;nativeText:string}):unknown;
  };
  ['key-avro-projection']:{
    projectKeysToAvro(fields:{source:Document;authors:CoreKeyDeclaration[];request:KeyAvroRequest}):unknown;
    verifyKeysAvroProjection(fields:{receipt:KeyAvroProjection;current:Document}):unknown;
    recoverKeysAvroIdeal(fields:{receipt:KeyAvroProjection;current:Document}):unknown;
  };
  ['avro-relationship-projection']:{
    projectRelationshipToAvro(fields:{source:Document;author:import('../model/relationships').CoreRelationshipDeclaration;request:RelationshipAvroRequest}):unknown;
    verifyRelationshipAvroProjection(fields:{receipt:RelationshipAvroProjection;current:Document}):unknown;
    recoverRelationshipAvroIdeal(fields:{receipt:RelationshipAvroProjection;current:Document}):unknown;
    recoverRelationshipAvroNative(fields:{receipt:RelationshipAvroProjection;current:Document}):unknown;
  };
  ['relationship-sqlserver-projection']:{
    projectRelationshipToSqlServer(fields:{source:Document;author:import('../model/relationships').CoreRelationshipDeclaration;bindingSource:Document;request:RelationshipSqlServerRequest}):unknown;
    verifyRelationshipSqlServerProjection(fields:{receipt:RelationshipSqlServerProjection;current:NonNullable<RelationshipSqlServerProjection['target']>}):unknown;
    recoverRelationshipSqlServerIdeal(fields:{receipt:RelationshipSqlServerProjection;current:NonNullable<RelationshipSqlServerProjection['target']>}):unknown;
    recoverRelationshipSqlServerBinding(fields:{receipt:RelationshipSqlServerProjection;current:NonNullable<RelationshipSqlServerProjection['target']>}):unknown;
    recoverRelationshipSqlServerNative(fields:{receipt:RelationshipSqlServerProjection;current:NonNullable<RelationshipSqlServerProjection['target']>}):unknown;
  };
  ['tablespec-relationship-projection']:{
    projectRelationshipToTableSpec(fields:{source:Document;author:import('../model/relationships').CoreRelationshipDeclaration;nativeSource:Document;nativeTarget:Document;request:RelationshipTableSpecRequest}):unknown;
    verifyRelationshipTableSpecProjection(fields:{receipt:RelationshipTableSpecProjection;current:Document}):unknown;
    recoverRelationshipTableSpecIdeal(fields:{receipt:RelationshipTableSpecProjection;current:Document}):unknown;
    recoverRelationshipTableSpecNativeSources(fields:{receipt:RelationshipTableSpecProjection;current:Document}):unknown;
  };
  ['relationship-parquet-projection']:{
    projectRelationshipToParquet(fields:{source:Document;author:import('../model/relationships').CoreRelationshipDeclaration;request:RelationshipParquetRequest}):unknown;
    verifyRelationshipParquetProjection(fields:{receipt:RelationshipParquetProjection;current:Document}):unknown;
    recoverRelationshipParquetIdeal(fields:{receipt:RelationshipParquetProjection;current:Document}):unknown;
    recoverRelationshipParquetNative(fields:{receipt:RelationshipParquetProjection;current:Document}):unknown;
  };
}
const CONTROL_CODES=new Set(['LIMIT','CAPACITY','RESOURCE_LIMIT','CANCELLED','METER_FAILURE','CANCELLATION_CHECK_FAILURE','CLOCK_CAPABILITY_REQUIRED','DEADLINE','DEADLINE_EXCEEDED']);

/** Public classifier and native recovery facades over existing Rust wire owners. */
export function createCoreIdealRustDefault(engine:CoreIdealNativeFamilies,isNativeUmfCoreError:NativeErrorGuard=()=>false){
  function call<T>(operation:()=>unknown):T{
    try{return operation() as T;}catch(error){
      if(!isNativeUmfCoreError(error))throw error;
      const native=error as {code?:unknown;message?:unknown;path?:unknown};
      if(typeof native.code!=='string'||CONTROL_CODES.has(native.code)||(!/^(FACETS_SQLSERVER_|SQLSERVER_|FIELD_SQLSERVER_|RECORD_SQLSERVER_|AVRO_CARDINALITY_|CARDINALITY_SQLSERVER_|AVRO_FIELD_|AVRO_RECORD_|AVRO_RECORD_TYPE_|AVRO_KEY_|AVRO_RELATIONSHIP_|RELATIONSHIP_SQLSERVER_|RELATIONSHIP_TABLESPEC_|RELATIONSHIP_PARQUET_|AVRO_FACET_|PARQUET_|NULLABILITY_AVRO_|FACETS_AVRO_|KEY_AVRO_)/.test(native.code)&&!['REQUEST','BINDING_DOCUMENT','BINDING_PROFILE'].includes(native.code)))throw error;
      throw new UmfError(native.code,String(native.message??''),typeof native.path==='string'?native.path:'');
    }
  }
  return Object.freeze({
    classifyAvroCardinality(source:Document,request:AvroCardinalityRequest):AvroCardinalityClassification{return call(()=>engine['avro-cardinality'].classifyAvroCardinality({source:copyJson(source) as unknown as Document,request:copyJson(request) as unknown as AvroCardinalityRequest}));},
    verifyAvroCardinalityClassification(receipt:AvroCardinalityClassification,current:Document):AvroCardinalityClassification{return call(()=>engine['avro-cardinality'].verifyAvroCardinalityClassification({receipt:copyJson(receipt) as unknown as AvroCardinalityClassification,current:copyJson(current) as unknown as Document}));},
    recoverAvroCardinalityBundle(receipt:AvroCardinalityClassification,current:Document):{schema:string;dependencies:{id:string;schema:string}[]}{return call(()=>engine['avro-cardinality'].recoverAvroCardinalityBundle({receipt:copyJson(receipt) as unknown as AvroCardinalityClassification,current:copyJson(current) as unknown as Document}));},
    classifyAvroField(source:Document,request:AvroFieldRequest):AvroFieldClassification{return call(()=>engine['avro-classification'].classifyAvroField({source:copyJson(source) as unknown as Document,request:copyJson(request) as unknown as AvroFieldRequest}));},
    recoverAvroFieldBundle(receipt:AvroFieldClassification,current:Document):{schema:string;dependencies:{id:string;schema:string}[]}{return call(()=>engine['avro-classification'].recoverAvroFieldBundle({receipt:copyJson(receipt) as unknown as AvroFieldClassification,current:copyJson(current) as unknown as Document}));},
    classifyAvroRecord(source:Document,request:AvroRecordRequest):AvroRecordClassification{return call(()=>engine['avro-classification'].classifyAvroRecord({source:copyJson(source) as unknown as Document,request:copyJson(request) as unknown as AvroRecordRequest}));},
    recoverAvroRecordBundle(receipt:AvroRecordClassification,current:Document):{schema:string;dependencies:{id:string;schema:string}[]}{return call(()=>engine['avro-classification'].recoverAvroRecordBundle({receipt:copyJson(receipt) as unknown as AvroRecordClassification,current:copyJson(current) as unknown as Document}));},
    classifyAvroKeys(source:Document,request:AvroKeyRequest):AvroKeyClassification{return call(()=>engine['avro-classification'].classifyAvroKeys({source:copyJson(source) as unknown as Document,request:copyJson(request) as unknown as AvroKeyRequest}));},
    verifyAvroKeyClassification(receipt:AvroKeyClassification,current:Document):AvroKeyClassification{return call(()=>engine['avro-classification'].verifyAvroKeyClassification({receipt:copyJson(receipt) as unknown as AvroKeyClassification,current:copyJson(current) as unknown as Document}));},
    recoverAvroKeySource(receipt:AvroKeyClassification,current:Document):AvroKeyArchive{return call(()=>engine['avro-classification'].recoverAvroKeySource({receipt:copyJson(receipt) as unknown as AvroKeyClassification,current:copyJson(current) as unknown as Document}));},
    classifyAvroRelationships(source:Document,request:AvroRelationshipRequest):AvroRelationshipClassification{return call(()=>engine['avro-classification'].classifyAvroRelationships({source:copyJson(source) as unknown as Document,request:copyJson(request) as unknown as AvroRelationshipRequest}));},
    verifyAvroRelationshipClassification(receipt:AvroRelationshipClassification,current:Document):AvroRelationshipClassification{return call(()=>engine['avro-classification'].verifyAvroRelationshipClassification({receipt:copyJson(receipt) as unknown as AvroRelationshipClassification,current:copyJson(current) as unknown as Document}));},
    recoverAvroRelationshipSource(receipt:AvroRelationshipClassification,current:Document):AvroRelationshipArchive{return call(()=>engine['avro-classification'].recoverAvroRelationshipSource({receipt:copyJson(receipt) as unknown as AvroRelationshipClassification,current:copyJson(current) as unknown as Document}));},
    classifyAvroNullability(source:Document,request:AvroNullabilityRequest):AvroNullabilityClassification{return call(()=>engine['avro-classification'].classifyAvroNullability({source:copyJson(source) as unknown as Document,request:copyJson(request) as unknown as AvroNullabilityRequest}) as AvroNullabilityClassification);},
    verifyAvroNullabilityClassification(receipt:AvroNullabilityClassification,current:Document):AvroNullabilityClassification{return call(()=>engine['avro-classification'].verifyAvroNullabilityClassification({receipt:copyJson(receipt) as unknown as AvroNullabilityClassification,current:copyJson(current) as unknown as Document}) as AvroNullabilityClassification);},
    recoverAvroNullabilityBundle(receipt:AvroNullabilityClassification,current:Document):{schema:string;dependencies:{id:string;schema:string}[]}{return call(()=>engine['avro-classification'].recoverAvroNullabilityBundle({receipt:copyJson(receipt) as unknown as AvroNullabilityClassification,current:copyJson(current) as unknown as Document}) as {schema:string;dependencies:{id:string;schema:string}[]});},
    classifyAvroFacets(source:Document,request:AvroFacetRequest):AvroFacetClassification{return call(()=>engine['avro-classification'].classifyAvroFacets({source:copyJson(source) as unknown as Document,request:copyJson(request) as unknown as AvroFacetRequest}) as AvroFacetClassification);},
    verifyAvroFacetClassification(receipt:AvroFacetClassification,current:Document):AvroFacetClassification{return call(()=>engine['avro-classification'].verifyAvroFacetClassification({receipt:copyJson(receipt) as unknown as AvroFacetClassification,current:copyJson(current) as unknown as Document}) as AvroFacetClassification);},
    recoverAvroFacetSource(receipt:AvroFacetClassification,current:Document):{schema:string;dependencies:{id:string;schema:string}[]}{return call(()=>engine['avro-classification'].recoverAvroFacetSource({receipt:copyJson(receipt) as unknown as AvroFacetClassification,current:copyJson(current) as unknown as Document}) as {schema:string;dependencies:{id:string;schema:string}[]});},
    classifyAvroRecordType(source:Document,request:AvroRecordTypeRequest):AvroRecordTypeClassification{return call(()=>engine['record-type'].classifyAvroRecordType({source:copyJson(source) as unknown as Document,request:copyJson(request) as unknown as AvroRecordTypeRequest}));},
    recoverAvroRecordTypeBundle(receipt:AvroRecordTypeClassification,current:Document):{schema:string;dependencies:{id:string;schema:string}[]}{return call(()=>engine['record-type'].recoverAvroRecordTypeBundle({receipt:copyJson(receipt) as unknown as AvroRecordTypeClassification,current:copyJson(current) as unknown as Document}));},
    classifyParquetRecordType(source:Document,request:ParquetRecordTypeRequest):ParquetRecordTypeClassification{return call(()=>engine['record-type'].classifyParquetRecordType({source:copyJson(source) as unknown as Document,request:copyJson(request) as unknown as ParquetRecordTypeRequest}));},
    classifyParquetRecord(source:Document,request:ParquetRecordRequest):ParquetRecordClassification{return call(()=>engine['record-type'].classifyParquetRecord({source:copyJson(source) as unknown as Document,request:copyJson(request) as unknown as ParquetRecordRequest}));},
    recoverParquetRecordBytes(receipt:ParquetRecordClassification,current:Document):Uint8Array{const recovered=call<{bytesHex:string}>(()=>engine['record-type'].recoverParquetRecordBytes({receipt:copyJson(receipt) as unknown as ParquetRecordClassification,current:copyJson(current) as unknown as Document}));if(!/^(?:[0-9a-f]{2})*$/i.test(recovered.bytesHex))throw new UmfError('PARQUET_RECORD_RECEIPT','Rust returned malformed recovered bytes');const bytes=new Uint8Array(recovered.bytesHex.length/2);for(let i=0;i<bytes.length;i++)bytes[i]=Number.parseInt(recovered.bytesHex.slice(i*2,i*2+2),16);return bytes;},
    classifyParquetRelationships(source:Document,request:ParquetRelationshipRequest):ParquetRelationshipClassification{return call(()=>engine['record-type'].classifyParquetRelationships({source:copyJson(source) as unknown as Document,request:copyJson(request) as unknown as ParquetRelationshipRequest}) as ParquetRelationshipClassification);},
    verifyParquetRelationshipClassification(receipt:ParquetRelationshipClassification,current:Document):ParquetRelationshipClassification{return call(()=>engine['record-type'].verifyParquetRelationshipClassification({receipt:copyJson(receipt) as unknown as ParquetRelationshipClassification,current:copyJson(current) as unknown as Document}) as ParquetRelationshipClassification);},
    classifyParquetNullability(source:Document,request:ParquetNullabilityRequest):ParquetNullabilityClassification{return call(()=>engine['record-type'].classifyParquetNullability({source:copyJson(source) as unknown as Document,request:copyJson(request) as unknown as ParquetNullabilityRequest}) as ParquetNullabilityClassification);},
    verifyParquetNullabilityClassification(receipt:ParquetNullabilityClassification,current:Document):ParquetNullabilityClassification{return call(()=>engine['record-type'].verifyParquetNullabilityClassification({receipt:copyJson(receipt) as unknown as ParquetNullabilityClassification,current:copyJson(current) as unknown as Document}) as ParquetNullabilityClassification);},
    recoverParquetNullabilityBytes(receipt:ParquetNullabilityClassification,current:Document):Uint8Array{const recovered=call<{bytesHex:string}>(()=>engine['record-type'].recoverParquetNullabilityBytes({receipt:copyJson(receipt) as unknown as ParquetNullabilityClassification,current:copyJson(current) as unknown as Document}));if(!/^(?:[0-9a-f]{2})*$/i.test(recovered.bytesHex))throw new UmfError('PARQUET_NULLABILITY_RECEIPT','Rust returned malformed recovered bytes');const bytes=new Uint8Array(recovered.bytesHex.length/2);for(let i=0;i<bytes.length;i++)bytes[i]=Number.parseInt(recovered.bytesHex.slice(i*2,i*2+2),16);return bytes;},
    classifyParquetField(source:Document,request:ParquetFieldRequest):ParquetFieldClassification{return call(()=>engine['record-type'].classifyParquetField({source:copyJson(source) as unknown as Document,request:copyJson(request) as unknown as ParquetFieldRequest}) as ParquetFieldClassification);},
    verifyParquetFieldClassification(receipt:ParquetFieldClassification,current:Document):ParquetFieldClassification{return call(()=>engine['record-type'].verifyParquetFieldClassification({receipt:copyJson(receipt) as unknown as ParquetFieldClassification,current:copyJson(current) as unknown as Document}) as ParquetFieldClassification);},
    recoverParquetFieldBytes(receipt:ParquetFieldClassification,current:Document):Uint8Array{const recovered=call<{bytesHex:string}>(()=>engine['record-type'].recoverParquetFieldBytes({receipt:copyJson(receipt) as unknown as ParquetFieldClassification,current:copyJson(current) as unknown as Document}));if(!/^(?:[0-9a-f]{2})*$/i.test(recovered.bytesHex))throw new UmfError('FIELD_CLASSIFICATION_RECEIPT','Rust returned malformed recovered bytes');const bytes=new Uint8Array(recovered.bytesHex.length/2);for(let i=0;i<bytes.length;i++)bytes[i]=Number.parseInt(recovered.bytesHex.slice(i*2,i*2+2),16);return bytes;},
    classifyParquetCardinality(source:Document,request:ParquetCardinalityRequest):ParquetCardinalityClassification{return call(()=>engine['record-type'].classifyParquetCardinality({source:copyJson(source) as unknown as Document,request:copyJson(request) as unknown as ParquetCardinalityRequest}) as ParquetCardinalityClassification);},
    verifyParquetCardinalityClassification(receipt:ParquetCardinalityClassification,current:Document):ParquetCardinalityClassification{return call(()=>engine['record-type'].verifyParquetCardinalityClassification({receipt:copyJson(receipt) as unknown as ParquetCardinalityClassification,current:copyJson(current) as unknown as Document}) as ParquetCardinalityClassification);},
    recoverParquetCardinalityBytes(receipt:ParquetCardinalityClassification,current:Document):Uint8Array{const recovered=call<{bytesHex:string}>(()=>engine['record-type'].recoverParquetCardinalityBytes({receipt:copyJson(receipt) as unknown as ParquetCardinalityClassification,current:copyJson(current) as unknown as Document}));if(!/^(?:[0-9a-f]{2})*$/i.test(recovered.bytesHex))throw new UmfError('PARQUET_CARDINALITY_RECEIPT','Rust returned malformed recovered bytes');const bytes=new Uint8Array(recovered.bytesHex.length/2);for(let i=0;i<bytes.length;i++)bytes[i]=Number.parseInt(recovered.bytesHex.slice(i*2,i*2+2),16);return bytes;},
    classifyParquetFacets(source:Document,request:ParquetFacetRequest):ParquetFacetClassification{return call(()=>engine['record-type'].classifyParquetFacets({source:copyJson(source) as unknown as Document,request:copyJson(request) as unknown as ParquetFacetRequest}) as ParquetFacetClassification);},
    verifyParquetFacetClassification(receipt:ParquetFacetClassification,current:Document):ParquetFacetClassification{return call(()=>engine['record-type'].verifyParquetFacetClassification({receipt:copyJson(receipt) as unknown as ParquetFacetClassification,current:copyJson(current) as unknown as Document}) as ParquetFacetClassification);},
    recoverParquetFacetSource(receipt:ParquetFacetClassification,current:Document):Uint8Array{const recovered=call<{bytesHex:string}>(()=>engine['record-type'].recoverParquetFacetSource({receipt:copyJson(receipt) as unknown as ParquetFacetClassification,current:copyJson(current) as unknown as Document}));if(!/^(?:[0-9a-f]{2})*$/i.test(recovered.bytesHex))throw new UmfError('PARQUET_FACET_RECEIPT','Rust returned malformed recovered bytes');const bytes=new Uint8Array(recovered.bytesHex.length/2);for(let i=0;i<bytes.length;i++)bytes[i]=Number.parseInt(recovered.bytesHex.slice(i*2,i*2+2),16);return bytes;},
    classifyParquetKeys(source:Document,request:ParquetKeyRequest):ParquetKeyClassification{return call(()=>engine['record-type'].classifyParquetKeys({source:copyJson(source) as unknown as Document,request:copyJson(request) as unknown as ParquetKeyRequest}) as ParquetKeyClassification);},
    verifyParquetKeyClassification(receipt:ParquetKeyClassification,current:Document):ParquetKeyClassification{return call(()=>engine['record-type'].verifyParquetKeyClassification({receipt:copyJson(receipt) as unknown as ParquetKeyClassification,current:copyJson(current) as unknown as Document}) as ParquetKeyClassification);},
    recoverParquetKeySource(receipt:ParquetKeyClassification,current:Document):Uint8Array{const recovered=call<{bytesHex:string}>(()=>engine['record-type'].recoverParquetKeySource({receipt:copyJson(receipt) as unknown as ParquetKeyClassification,current:copyJson(current) as unknown as Document}));if(!/^(?:[0-9a-f]{2})*$/i.test(recovered.bytesHex))throw new UmfError('PARQUET_KEY_RECEIPT','Rust returned malformed recovered bytes');const bytes=new Uint8Array(recovered.bytesHex.length/2);for(let i=0;i<bytes.length;i++)bytes[i]=Number.parseInt(recovered.bytesHex.slice(i*2,i*2+2),16);return bytes;},
    recoverParquetRelationshipSource(receipt:ParquetRelationshipClassification,current:Document):Uint8Array{const recovered=call<{bytesHex:string}>(()=>engine['record-type'].recoverParquetRelationshipSource({receipt:copyJson(receipt) as unknown as ParquetRelationshipClassification,current:copyJson(current) as unknown as Document}));if(!/^(?:[0-9a-f]{2})*$/i.test(recovered.bytesHex))throw new UmfError('PARQUET_RELATIONSHIP_RECEIPT','Rust returned malformed recovered bytes');const bytes=new Uint8Array(recovered.bytesHex.length/2);for(let i=0;i<bytes.length;i++)bytes[i]=Number.parseInt(recovered.bytesHex.slice(i*2,i*2+2),16);return bytes;},
    recoverParquetRecordTypeBytes(receipt:ParquetRecordTypeClassification,current:Document):Uint8Array{
      const recovered=call<{bytesHex:string}>(()=>engine['record-type'].recoverParquetRecordTypeBytes({receipt:copyJson(receipt) as unknown as ParquetRecordTypeClassification,current:copyJson(current) as unknown as Document}));
      if(!/^(?:[0-9a-f]{2})*$/i.test(recovered.bytesHex))throw new UmfError('PARQUET_RECORD_TYPE_RECEIPT','Rust returned malformed recovered bytes');
      const bytes=new Uint8Array(recovered.bytesHex.length/2);for(let i=0;i<bytes.length;i++)bytes[i]=Number.parseInt(recovered.bytesHex.slice(i*2,i*2+2),16);return bytes;
    },
    projectNullabilityToAvro(author:CoreNullabilityDeclaration,request:NullabilityAvroRequest):NullabilityAvroProjection{return call(()=>engine['nullability-avro-projection'].projectNullabilityToAvro({author:copyJson(author) as unknown as CoreNullabilityDeclaration,request:copyJson(request) as unknown as NullabilityAvroRequest}) as NullabilityAvroProjection);},
    recoverNullabilityFromAvro(receipt:NullabilityAvroProjection,nativeText:string):Document{return call(()=>engine['nullability-avro-projection'].recoverNullabilityFromAvro({receipt:copyJson(receipt) as unknown as NullabilityAvroProjection,nativeText}) as unknown as Document);},
    projectFacetsToSqlServer(author:CoreFacetDeclaration|CoreKindDeclaration,request:FacetsSqlServerRequest):FacetsSqlServerProjection{return call(()=>engine['facets-sqlserver-projection'].projectFacetsToSqlServer({author:copyJson(author) as unknown as CoreFacetDeclaration|CoreKindDeclaration,request:copyJson(request) as unknown as FacetsSqlServerRequest}) as FacetsSqlServerProjection);},
    recoverFacetsFromSqlServer(receipt:FacetsSqlServerProjection,nativeText:string):Document{return call(()=>engine['facets-sqlserver-projection'].recoverFacetsFromSqlServer({receipt:copyJson(receipt) as unknown as FacetsSqlServerProjection,nativeText}) as unknown as Document);},
    projectFacetsToAvro(author:CoreFacetDeclaration|CoreKindDeclaration,request:FacetsAvroRequest):FacetsAvroProjection{return call(()=>engine['facets-avro-projection'].projectFacetsToAvro({author:copyJson(author) as unknown as CoreFacetDeclaration|CoreKindDeclaration,request:copyJson(request) as unknown as FacetsAvroRequest}) as FacetsAvroProjection);},
    recoverFacetsFromAvro(receipt:FacetsAvroProjection,nativeText:string):Document{return call(()=>engine['facets-avro-projection'].recoverFacetsFromAvro({receipt:copyJson(receipt) as unknown as FacetsAvroProjection,nativeText}) as unknown as Document);},
    projectKeysToAvro(source:Document,authors:CoreKeyDeclaration[],request:KeyAvroRequest):KeyAvroProjection{return call(()=>engine['key-avro-projection'].projectKeysToAvro({source:copyJson(source) as unknown as Document,authors:copyJson(authors) as unknown as CoreKeyDeclaration[],request:copyJson(request) as unknown as KeyAvroRequest}) as KeyAvroProjection);},
    verifyKeysAvroProjection(receipt:KeyAvroProjection,current:Document):KeyAvroProjection{return call(()=>engine['key-avro-projection'].verifyKeysAvroProjection({receipt:copyJson(receipt) as unknown as KeyAvroProjection,current:copyJson(current) as unknown as Document}) as KeyAvroProjection);},
    recoverKeysAvroIdeal(receipt:KeyAvroProjection,current:Document):Document{return call(()=>engine['key-avro-projection'].recoverKeysAvroIdeal({receipt:copyJson(receipt) as unknown as KeyAvroProjection,current:copyJson(current) as unknown as Document}) as unknown as Document);},
    projectRelationshipToAvro(source:Document,author:import('../model/relationships').CoreRelationshipDeclaration,request:RelationshipAvroRequest):RelationshipAvroProjection{return call(()=>engine['avro-relationship-projection'].projectRelationshipToAvro({source:copyJson(source) as unknown as Document,author:copyJson(author) as unknown as import('../model/relationships').CoreRelationshipDeclaration,request:copyJson(request) as unknown as RelationshipAvroRequest}) as RelationshipAvroProjection);},
    verifyRelationshipAvroProjection(receipt:RelationshipAvroProjection,current:Document):RelationshipAvroProjection{return call(()=>engine['avro-relationship-projection'].verifyRelationshipAvroProjection({receipt:copyJson(receipt) as unknown as RelationshipAvroProjection,current:copyJson(current) as unknown as Document}) as RelationshipAvroProjection);},
    recoverRelationshipAvroIdeal(receipt:RelationshipAvroProjection,current:Document):Document{return call(()=>engine['avro-relationship-projection'].recoverRelationshipAvroIdeal({receipt:copyJson(receipt) as unknown as RelationshipAvroProjection,current:copyJson(current) as unknown as Document}) as unknown as Document);},
    recoverRelationshipAvroNative(receipt:RelationshipAvroProjection,current:Document):{schema:string;dependencies:[]}{return call(()=>engine['avro-relationship-projection'].recoverRelationshipAvroNative({receipt:copyJson(receipt) as unknown as RelationshipAvroProjection,current:copyJson(current) as unknown as Document}) as {schema:string;dependencies:[]});},
    projectRelationshipToSqlServer(source:Document,author:import('../model/relationships').CoreRelationshipDeclaration,bindingSource:Document,request:RelationshipSqlServerRequest):RelationshipSqlServerProjection{return call(()=>engine['relationship-sqlserver-projection'].projectRelationshipToSqlServer({source:copyJson(source) as unknown as Document,author:copyJson(author) as unknown as import('../model/relationships').CoreRelationshipDeclaration,bindingSource:copyJson(bindingSource) as unknown as Document,request:copyJson(request) as unknown as RelationshipSqlServerRequest}) as RelationshipSqlServerProjection);},
    verifyRelationshipSqlServerProjection(receipt:RelationshipSqlServerProjection,current:NonNullable<RelationshipSqlServerProjection['target']>):RelationshipSqlServerProjection{return call(()=>engine['relationship-sqlserver-projection'].verifyRelationshipSqlServerProjection({receipt:copyJson(receipt) as unknown as RelationshipSqlServerProjection,current:copyJson(current) as NonNullable<RelationshipSqlServerProjection['target']>}) as RelationshipSqlServerProjection);},
    recoverRelationshipSqlServerIdeal(receipt:RelationshipSqlServerProjection,current:NonNullable<RelationshipSqlServerProjection['target']>):Document{return call(()=>engine['relationship-sqlserver-projection'].recoverRelationshipSqlServerIdeal({receipt:copyJson(receipt) as unknown as RelationshipSqlServerProjection,current:copyJson(current) as NonNullable<RelationshipSqlServerProjection['target']>}) as unknown as Document);},
    recoverRelationshipSqlServerBinding(receipt:RelationshipSqlServerProjection,current:NonNullable<RelationshipSqlServerProjection['target']>):Document{return call(()=>engine['relationship-sqlserver-projection'].recoverRelationshipSqlServerBinding({receipt:copyJson(receipt) as unknown as RelationshipSqlServerProjection,current:copyJson(current) as NonNullable<RelationshipSqlServerProjection['target']>}) as unknown as Document);},
    recoverRelationshipSqlServerNative(receipt:RelationshipSqlServerProjection,current:NonNullable<RelationshipSqlServerProjection['target']>):string{return call(()=>engine['relationship-sqlserver-projection'].recoverRelationshipSqlServerNative({receipt:copyJson(receipt) as unknown as RelationshipSqlServerProjection,current:copyJson(current) as NonNullable<RelationshipSqlServerProjection['target']>}) as string);},
    projectRelationshipToTableSpec(source:Document,author:import('../model/relationships').CoreRelationshipDeclaration,nativeSource:Document,nativeTarget:Document,request:RelationshipTableSpecRequest):RelationshipTableSpecProjection{return call(()=>engine['tablespec-relationship-projection'].projectRelationshipToTableSpec({source:copyJson(source) as unknown as Document,author:copyJson(author) as unknown as import('../model/relationships').CoreRelationshipDeclaration,nativeSource:copyJson(nativeSource) as unknown as Document,nativeTarget:copyJson(nativeTarget) as unknown as Document,request:copyJson(request) as unknown as RelationshipTableSpecRequest}) as RelationshipTableSpecProjection);},
    verifyRelationshipTableSpecProjection(receipt:RelationshipTableSpecProjection,current:Document):RelationshipTableSpecProjection{return call(()=>engine['tablespec-relationship-projection'].verifyRelationshipTableSpecProjection({receipt:copyJson(receipt) as unknown as RelationshipTableSpecProjection,current:copyJson(current) as unknown as Document}) as RelationshipTableSpecProjection);},
    recoverRelationshipTableSpecIdeal(receipt:RelationshipTableSpecProjection,current:Document):Document{return call(()=>engine['tablespec-relationship-projection'].recoverRelationshipTableSpecIdeal({receipt:copyJson(receipt) as unknown as RelationshipTableSpecProjection,current:copyJson(current) as unknown as Document}) as unknown as Document);},
    recoverRelationshipTableSpecNativeSources(receipt:RelationshipTableSpecProjection,current:Document):{source:string|Record<string,string>;target:string|Record<string,string>}{return call(()=>engine['tablespec-relationship-projection'].recoverRelationshipTableSpecNativeSources({receipt:copyJson(receipt) as unknown as RelationshipTableSpecProjection,current:copyJson(current) as unknown as Document}) as {source:string|Record<string,string>;target:string|Record<string,string>});},
    projectRelationshipToParquet(source:Document,author:import('../model/relationships').CoreRelationshipDeclaration,request:RelationshipParquetRequest):RelationshipParquetProjection{return call(()=>engine['relationship-parquet-projection'].projectRelationshipToParquet({source:copyJson(source) as unknown as Document,author:copyJson(author) as unknown as import('../model/relationships').CoreRelationshipDeclaration,request:copyJson(request) as unknown as RelationshipParquetRequest}) as RelationshipParquetProjection);},
    verifyRelationshipParquetProjection(receipt:RelationshipParquetProjection,current:Document):RelationshipParquetProjection{return call(()=>engine['relationship-parquet-projection'].verifyRelationshipParquetProjection({receipt:copyJson(receipt) as unknown as RelationshipParquetProjection,current:copyJson(current) as unknown as Document}) as RelationshipParquetProjection);},
    recoverRelationshipParquetIdeal(receipt:RelationshipParquetProjection,current:Document):Document{return call(()=>engine['relationship-parquet-projection'].recoverRelationshipParquetIdeal({receipt:copyJson(receipt) as unknown as RelationshipParquetProjection,current:copyJson(current) as unknown as Document}) as unknown as Document);},
    recoverRelationshipParquetNative(receipt:RelationshipParquetProjection,current:Document):{hex:string}{return call(()=>engine['relationship-parquet-projection'].recoverRelationshipParquetNative({receipt:copyJson(receipt) as unknown as RelationshipParquetProjection,current:copyJson(current) as unknown as Document}) as {hex:string});},
    projectFieldToSqlServer(author:CoreKindDeclaration,request:FieldSqlServerRequest):FieldSqlServerProjection{return call(()=>engine['field-record-sqlserver-projection'].projectFieldToSqlServer({author:copyJson(author) as unknown as CoreKindDeclaration,request:copyJson(request) as unknown as FieldSqlServerRequest}) as FieldSqlServerProjection);},
    recoverFieldFromSqlServer(receipt:FieldSqlServerProjection,nativeText:string):Document{return call(()=>engine['field-record-sqlserver-projection'].recoverFieldFromSqlServer({receipt:copyJson(receipt) as unknown as FieldSqlServerProjection,nativeText}) as unknown as Document);},
    projectRecordToSqlServer(author:CoreKindDeclaration,request:RecordSqlServerRequest):RecordSqlServerProjection{return call(()=>engine['field-record-sqlserver-projection'].projectRecordToSqlServer({author:copyJson(author) as unknown as CoreKindDeclaration,request:copyJson(request) as unknown as RecordSqlServerRequest}) as RecordSqlServerProjection);},
    recoverRecordFromSqlServer(receipt:RecordSqlServerProjection,nativeText:string):Document{return call(()=>engine['field-record-sqlserver-projection'].recoverRecordFromSqlServer({receipt:copyJson(receipt) as unknown as RecordSqlServerProjection,nativeText}) as unknown as Document);},
    projectCardinalityToSqlServer(author:CoreCardinalityDeclaration,request:CardinalitySqlServerRequest):CardinalitySqlServerProjection{return call(()=>engine['cardinality-sqlserver-projection'].projectCardinalityToSqlServer({author:copyJson(author) as unknown as CoreCardinalityDeclaration,request:copyJson(request) as unknown as CardinalitySqlServerRequest}) as CardinalitySqlServerProjection);},
    recoverCardinalityFromSqlServer(receipt:CardinalitySqlServerProjection,nativeText:string):Document{return call(()=>engine['cardinality-sqlserver-projection'].recoverCardinalityFromSqlServer({receipt:copyJson(receipt) as unknown as CardinalitySqlServerProjection,nativeText}) as unknown as Document);},
  });
}
