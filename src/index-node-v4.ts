// SPDX-License-Identifier: MIT OR Apache-2.0
import {assertPythonClientRustPlatformV4,initializePythonClientRustDefaultV4} from './access/rust-default-v4';
import {bindCoreCardinalityRust} from './access/rust-cardinality-default';
import {bindCoreDatasetValuesCompactRust} from './access/rust-dataset-values-compact-default';
import {bindCoreFacetsRust} from './access/rust-facets-default';
import {bindCoreKeysRust} from './access/rust-keys-default';
import {bindCoreRelationshipsRust} from './access/rust-relationships-default';
import {bindBit128Rust} from './access/rust-bit128-default';
import {bindCsvBooleanLexicalRust} from './access/rust-csv-boolean-default';
import {bindCoreInspectorsRust} from './access/rust-core-inspectors-default';
import {bindCoreSchemaPropertiesRust} from './access/rust-schema-properties-default';
import {bindJavascriptNumericRust} from './access/rust-javascript-numeric-default';
import {bindCoreRecordTypeRust} from './access/rust-record-type-default';
import {bindCoreRecordValuesRust} from './access/rust-record-values-default';
import {bindCoreKeyTupleDefault} from './access/rust-key-tuple-default';
import {bindSemanticTypesRust} from './access/rust-semantic-types-default';
import {bindCoreSemanticTypesRust} from './access/rust-core-semantic-types-default';
import {createSecurityNotRustAdapter} from './extensions/security/rust-not-adapter';
import {createSecurityLogicRustAdapter} from './extensions/security/rust-logic-adapter';
import {createRawTableBindingInspector} from './extensions/binding/raw-profiles-inspector';
import {createAvroRelationshipProjection} from './core-ideals/relationship-avro-projection-factory';
import {createTableSpecRelationshipProjection} from './core-ideals/relationship-tablespec-projection-factory';
import {createSqlServerRelationshipProjection} from './core-ideals/relationship-sqlserver-projection-factory';
import {createRelationshipParquetProjection} from './core-ideals/relationship-parquet-projection-factory';
import {createRelationshipExtras} from './core-ideals/relationship-extras-factory';
import {createRelationshipPostgresql} from './core-ideals/relationship-postgresql-factory';
import {createGeneratedSchemaGraphOperation} from './domain-packs/generated-schema-graph';
import {createDomainPackLoaderInspectionOperation} from './domain-packs/loader-rust';
import {createDomainPackProfileInspectionOperation} from './domain-packs/profile-rust';
import {createSecProjectionRustOperations,utf16LittleEndianBytes} from './domain-packs/sec-projection-rust';
import {createReadDescriptorSetRustCandidate} from './adapters/protobuf/descriptor-rust-candidate';
import type {generateDatasetSourceSchema as DatasetSourceSchemaReference} from './domain-packs/source-schema';
import type {generateDomainPackSchema as DomainPackSchemaReference} from './domain-packs/schema';
import type {generateArtifactCollectionSchema as ArtifactCollectionSchemaReference} from './domain-packs/artifacts';
import type {generateDomainPackLoaderSchema as DomainPackLoaderSchemaReference} from './domain-packs/loader';
import type {generateLoaderInventorySchema as LoaderInventorySchemaReference} from './domain-packs/loader-inventory';

// Module import resolves only after the native engine is ready. The function
// exported below remains synchronous and never falls back to TypeScript.
assertPythonClientRustPlatformV4(process.platform,process.arch);
const [{createCoreModelRootKeyTupleEngine,createCoreCardinalityHostInputEngine,createCoreRecordValuesHostInputEngine,createDefaultSemanticTypeRegistry,createCoreRecordTypeEngine,createBit128Engine,createTemporalEngine,createSecurityLogicEngine,createJavascriptNumericEngine,isWireAdmissionError,isNativeUmfCoreError,isBit128EngineError,isHostJsonResponseError,createProtobufDescriptorDocumentEngine,domainPackSchemaGraphJson,datasetSourceSchemaGraphJson,artifactCollectionSchemaGraphJson,domainPackLoaderSchemaGraphJson,loaderInventorySchemaGraphJson,inspectDomainPackLoaderWire,inspectDomainPackProfileWire,projectSecSubmissionsUtf16Wire,projectSecCompanyFactsUtf16Wire},{CORE_MODEL_RESOURCES},{createPythonClientRustCandidateV4}]=await Promise.all([
 import('../bindings/core/node/index.js'),
 import('./access/core-model-resources'),
 import('./node-v4'),
]);
const secProjection=createSecProjectionRustOperations({
 submissions:(input,sourceId)=>projectSecSubmissionsUtf16Wire(Buffer.from(utf16LittleEndianBytes(input)),Buffer.from(utf16LittleEndianBytes(sourceId))),
 companyFacts:(input,sourceId)=>projectSecCompanyFactsUtf16Wire(Buffer.from(utf16LittleEndianBytes(input)),Buffer.from(utf16LittleEndianBytes(sourceId))),
});
const {projectSecSubmissions,projectSecCompanyFacts}=secProjection;
const readDescriptorSetRustCandidate=createReadDescriptorSetRustCandidate(createProtobufDescriptorDocumentEngine(),isNativeUmfCoreError);
const generatePythonClient=await initializePythonClientRustDefaultV4(()=>createPythonClientRustCandidateV4());
const generateDomainPackSchemaOperation=createGeneratedSchemaGraphOperation(domainPackSchemaGraphJson) as typeof DomainPackSchemaReference;
const generateDatasetSourceSchemaOperation=createGeneratedSchemaGraphOperation(datasetSourceSchemaGraphJson) as typeof DatasetSourceSchemaReference;
const generateArtifactCollectionSchemaOperation=createGeneratedSchemaGraphOperation(artifactCollectionSchemaGraphJson) as typeof ArtifactCollectionSchemaReference;
const generateDomainPackLoaderSchemaOperation=createGeneratedSchemaGraphOperation(domainPackLoaderSchemaGraphJson) as typeof DomainPackLoaderSchemaReference;
const generateLoaderInventorySchemaOperation=createGeneratedSchemaGraphOperation(loaderInventorySchemaGraphJson) as typeof LoaderInventorySchemaReference;
const inspectDomainPackLoaderOperation=createDomainPackLoaderInspectionOperation(inspectDomainPackLoaderWire);
const domainPackProfileOperations=createDomainPackProfileInspectionOperation(inspectDomainPackProfileWire);
const {inspectDomainPack,requireDomainPackProfile}=domainPackProfileOperations;
function generateDomainPackSchema(){return generateDomainPackSchemaOperation();}
function generateDatasetSourceSchema(){return generateDatasetSourceSchemaOperation();}
function generateArtifactCollectionSchema(){return generateArtifactCollectionSchemaOperation();}
function generateDomainPackLoaderSchema(){return generateDomainPackLoaderSchemaOperation();}
function generateLoaderInventorySchema(){return generateLoaderInventorySchemaOperation();}
Object.defineProperty(generateDomainPackSchema,'name',{value:'generateDomainPackSchema'});
Object.defineProperty(generateDatasetSourceSchema,'name',{value:'generateDatasetSourceSchema'});
Object.defineProperty(generateArtifactCollectionSchema,'name',{value:'generateArtifactCollectionSchema'});
Object.defineProperty(generateDomainPackLoaderSchema,'name',{value:'generateDomainPackLoaderSchema'});
Object.defineProperty(generateLoaderInventorySchema,'name',{value:'generateLoaderInventorySchema'});
const model=createCoreModelRootKeyTupleEngine(CORE_MODEL_RESOURCES);
const coreKeyTuple=bindCoreKeyTupleDefault(model,isNativeUmfCoreError);
const {readCoreKeyTupleBytes,prepareCoreKeyTuples}=coreKeyTuple;
const {inspectCoreSemanticTypes,getCoreSemanticTypes,declareCoreSemanticTypes,verifyCoreSemanticTypeDeclaration}=bindCoreSemanticTypesRust(model,isNativeUmfCoreError);
const validateCoreRecordValues=bindCoreRecordValuesRust(createCoreRecordValuesHostInputEngine(CORE_MODEL_RESOURCES));
const {SemanticTypeRegistry,validateSemanticTypeValue,validateCoreSemanticTypeValue}=bindSemanticTypesRust(()=>createDefaultSemanticTypeRegistry(),CORE_MODEL_RESOURCES);
type SemanticTypeRegistry=InstanceType<typeof SemanticTypeRegistry>;
const recordType=bindCoreRecordTypeRust(createCoreRecordTypeEngine(CORE_MODEL_RESOURCES),isNativeUmfCoreError);
const {declareCoreRecordType,verifyCoreRecordTypeDeclaration}=recordType;
const temporal=createTemporalEngine();
const securityEngine=createSecurityLogicEngine();
const securityNot=createSecurityNotRustAdapter(securityEngine);
const {securityAnd,securityOr}=createSecurityLogicRustAdapter(securityEngine);
const {parseGregorianDate,truncateGregorianDate,parseRfc3339ExactInstant,sameRfc3339ExactInstant}=temporal;
const {validateCsvBooleanLexical,verifyCsvBooleanLexical}=bindCsvBooleanLexicalRust(model,isWireAdmissionError,isNativeUmfCoreError);
const {inspectCoreScalarType,inspectCoreRecordMembers,inspectCoreReferenceLinks}=bindCoreInspectorsRust(model,isWireAdmissionError,isNativeUmfCoreError);
const inspectRawTableBinding=createRawTableBindingInspector(inspectCoreRecordMembers);
const javascriptNumeric=bindJavascriptNumericRust(()=>createJavascriptNumericEngine(CORE_MODEL_RESOURCES));
const {exactDecimal,integerFromBigInt,integerToBigInt,admitJavascriptNumber,numericToNumberLossless}=javascriptNumeric;
const {inspectCoreSchemaProperties,declareCoreSchemaProperties,validateCoreFieldValue,resolveCoreDefault}=bindCoreSchemaPropertiesRust(model);
const cardinality=bindCoreCardinalityRust(createCoreCardinalityHostInputEngine(CORE_MODEL_RESOURCES),isHostJsonResponseError);
const {inspectCoreCardinality,declareCoreCardinality,verifyCoreCardinalityDeclaration}=cardinality;
const {validateCoreDatasetValuesCompact,verifyCoreDatasetValuesCompact}=bindCoreDatasetValuesCompactRust(model,isNativeUmfCoreError);
const {inspectCoreFacets,declareCoreFacets,verifyCoreFacetDeclaration,historicalCoreFacetPatch}=bindCoreFacetsRust(model);
const {inspectCoreKeys,lookupCoreKey,declareCoreRecordMembers,declareCoreKey,verifyCoreKeyOperation}=bindCoreKeysRust(model,isNativeUmfCoreError);
const relationshipOperations=bindCoreRelationshipsRust(model);
const {inspectCoreRelationships,lookupCoreRelationship,declareCoreRelationship,verifyCoreRelationshipOperation}=relationshipOperations;
const relationshipConsumers={lookupCoreRelationship,verifyCoreRelationshipOperation};
const {projectRelationshipToAvro,verifyRelationshipAvroProjection,recoverRelationshipAvroIdeal,recoverRelationshipAvroNative}=createAvroRelationshipProjection(relationshipConsumers);
const {projectRelationshipToTableSpec,verifyRelationshipTableSpecProjection,recoverRelationshipTableSpecIdeal,recoverRelationshipTableSpecNativeSources}=createTableSpecRelationshipProjection(relationshipConsumers);
const {projectRelationshipToSqlServer,verifyRelationshipSqlServerProjection,recoverRelationshipSqlServerIdeal,recoverRelationshipSqlServerBinding,recoverRelationshipSqlServerNative}=createSqlServerRelationshipProjection(relationshipConsumers);
const {projectRelationshipToParquet,verifyRelationshipParquetProjection,recoverRelationshipParquetIdeal,recoverRelationshipParquetNative}=createRelationshipParquetProjection(relationshipConsumers);
const {projectRelationshipToExtra,verifyRelationshipExtra,recoverRelationshipExtraIdeal,recoverRelationshipExtraNative}=createRelationshipExtras(relationshipConsumers);
const {projectRelationshipsToPostgresql,verifyRelationshipPostgresqlProjection,recoverRelationshipPostgresqlIdeal,recoverRelationshipPostgresqlNative}=createRelationshipPostgresql(relationshipConsumers);
const {parseBits128,parseUuid,bits128FromBytes,bits128ToBytes,uuidFromBits128,uuidToBits128,compareBits128,bits128ToWords,bits128FromWords,bits128ToInteger,bits128FromInteger}=bindBit128Rust(createBit128Engine(),isBit128EngineError);
export * from './index-v4-default';
export {readCoreKeyTupleBytes,prepareCoreKeyTuples};
export {inspectDomainPackLoaderOperation as inspectDomainPackLoader,inspectDomainPack,requireDomainPackProfile};
export {generatePythonClient,generateDomainPackSchema,generateDatasetSourceSchema,generateArtifactCollectionSchema,exactDecimal,integerFromBigInt,integerToBigInt,admitJavascriptNumber,numericToNumberLossless,inspectCoreCardinality,declareCoreCardinality,verifyCoreCardinalityDeclaration,validateCoreDatasetValuesCompact,verifyCoreDatasetValuesCompact,inspectCoreFacets,declareCoreFacets,verifyCoreFacetDeclaration,historicalCoreFacetPatch,inspectCoreKeys,lookupCoreKey,declareCoreRecordMembers,declareCoreKey,verifyCoreKeyOperation,inspectCoreRelationships,lookupCoreRelationship,declareCoreRelationship,verifyCoreRelationshipOperation,inspectCoreScalarType,inspectCoreRecordMembers,inspectCoreReferenceLinks,inspectCoreSemanticTypes,getCoreSemanticTypes,declareCoreSemanticTypes,verifyCoreSemanticTypeDeclaration,inspectRawTableBinding,inspectCoreSchemaProperties,declareCoreSchemaProperties,validateCoreFieldValue,resolveCoreDefault,validateCoreRecordValues,SemanticTypeRegistry,validateSemanticTypeValue,validateCoreSemanticTypeValue,declareCoreRecordType,verifyCoreRecordTypeDeclaration,parseBits128,parseUuid,bits128FromBytes,bits128ToBytes,uuidFromBits128,uuidToBits128,compareBits128,bits128ToWords,bits128FromWords,bits128ToInteger,bits128FromInteger,validateCsvBooleanLexical,verifyCsvBooleanLexical,parseGregorianDate,truncateGregorianDate,parseRfc3339ExactInstant,sameRfc3339ExactInstant,securityNot,securityAnd,securityOr};
export {generateDomainPackLoaderSchema,generateLoaderInventorySchema};
export {projectSecSubmissions,projectSecCompanyFacts};
export {projectSecSubmissions as projectSecSubmissionsRustCandidate,projectSecCompanyFacts as projectSecCompanyFactsRustCandidate};
export {readDescriptorSetRustCandidate};
export {projectRelationshipToAvro,verifyRelationshipAvroProjection,recoverRelationshipAvroIdeal,recoverRelationshipAvroNative,projectRelationshipToTableSpec,verifyRelationshipTableSpecProjection,recoverRelationshipTableSpecIdeal,recoverRelationshipTableSpecNativeSources,projectRelationshipToSqlServer,verifyRelationshipSqlServerProjection,recoverRelationshipSqlServerIdeal,recoverRelationshipSqlServerBinding,recoverRelationshipSqlServerNative,projectRelationshipToParquet,verifyRelationshipParquetProjection,recoverRelationshipParquetIdeal,recoverRelationshipParquetNative,projectRelationshipToExtra,verifyRelationshipExtra,recoverRelationshipExtraIdeal,recoverRelationshipExtraNative,projectRelationshipsToPostgresql,verifyRelationshipPostgresqlProjection,recoverRelationshipPostgresqlIdeal,recoverRelationshipPostgresqlNative};
