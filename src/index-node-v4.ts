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
import {bindCoreRecordTypeRust} from './access/rust-record-type-default';
import {createSecurityNotRustAdapter} from './extensions/security/rust-not-adapter';

// Module import resolves only after the native engine is ready. The function
// exported below remains synchronous and never falls back to TypeScript.
assertPythonClientRustPlatformV4(process.platform,process.arch);
const [{createCoreModelRootEngine,createCoreRecordTypeEngine,createBit128Engine,createTemporalEngine,createSecurityLogicEngine,isWireAdmissionError,isNativeUmfCoreError,isBit128EngineError},{CORE_MODEL_RESOURCES},{createPythonClientRustCandidateV4}]=await Promise.all([
 import('../bindings/core/node/index.js'),
 import('./access/core-model-resources'),
 import('./node-v4'),
]);
const generatePythonClient=await initializePythonClientRustDefaultV4(()=>createPythonClientRustCandidateV4());
const model=createCoreModelRootEngine(CORE_MODEL_RESOURCES);
const recordType=bindCoreRecordTypeRust(createCoreRecordTypeEngine(CORE_MODEL_RESOURCES),isNativeUmfCoreError);
const {declareCoreRecordType,verifyCoreRecordTypeDeclaration}=recordType;
const temporal=createTemporalEngine();
const securityNot=createSecurityNotRustAdapter(createSecurityLogicEngine());
const {parseGregorianDate,truncateGregorianDate,parseRfc3339ExactInstant,sameRfc3339ExactInstant}=temporal;
const {validateCsvBooleanLexical,verifyCsvBooleanLexical}=bindCsvBooleanLexicalRust(model,isWireAdmissionError,isNativeUmfCoreError);
const {inspectCoreScalarType,inspectCoreRecordMembers,inspectCoreReferenceLinks}=bindCoreInspectorsRust(model,isWireAdmissionError,isNativeUmfCoreError);
const {inspectCoreSchemaProperties,declareCoreSchemaProperties,validateCoreFieldValue,resolveCoreDefault}=bindCoreSchemaPropertiesRust(model);
const {inspectCoreCardinality,declareCoreCardinality,verifyCoreCardinalityDeclaration}=bindCoreCardinalityRust(model);
const {validateCoreDatasetValuesCompact}=bindCoreDatasetValuesCompactRust(model,isNativeUmfCoreError);
const {inspectCoreFacets,declareCoreFacets,verifyCoreFacetDeclaration,historicalCoreFacetPatch}=bindCoreFacetsRust(model);
const {inspectCoreKeys,lookupCoreKey,declareCoreRecordMembers,declareCoreKey,verifyCoreKeyOperation}=bindCoreKeysRust(model,isNativeUmfCoreError);
const {inspectCoreRelationships,lookupCoreRelationship,declareCoreRelationship,verifyCoreRelationshipOperation}=bindCoreRelationshipsRust(model);
const {parseBits128,parseUuid,bits128FromBytes,bits128ToBytes,uuidFromBits128,uuidToBits128,compareBits128,bits128ToWords,bits128FromWords,bits128ToInteger,bits128FromInteger}=bindBit128Rust(createBit128Engine(),isBit128EngineError);
export * from './index';
export {generatePythonClient,inspectCoreCardinality,declareCoreCardinality,verifyCoreCardinalityDeclaration,validateCoreDatasetValuesCompact,inspectCoreFacets,declareCoreFacets,verifyCoreFacetDeclaration,historicalCoreFacetPatch,inspectCoreKeys,lookupCoreKey,declareCoreRecordMembers,declareCoreKey,verifyCoreKeyOperation,inspectCoreRelationships,lookupCoreRelationship,declareCoreRelationship,verifyCoreRelationshipOperation,inspectCoreScalarType,inspectCoreRecordMembers,inspectCoreReferenceLinks,inspectCoreSchemaProperties,declareCoreSchemaProperties,validateCoreFieldValue,resolveCoreDefault,declareCoreRecordType,verifyCoreRecordTypeDeclaration,parseBits128,parseUuid,bits128FromBytes,bits128ToBytes,uuidFromBits128,uuidToBits128,compareBits128,bits128ToWords,bits128FromWords,bits128ToInteger,bits128FromInteger,validateCsvBooleanLexical,verifyCsvBooleanLexical,parseGregorianDate,truncateGregorianDate,parseRfc3339ExactInstant,sameRfc3339ExactInstant,securityNot};
