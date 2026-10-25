// SPDX-License-Identifier: MIT OR Apache-2.0
import {createPythonClientRustCandidateV4} from './browser-v4';
import {initializePythonClientRustDefaultV4} from './access/rust-default-v4';
import {initializeCoreModelRootWasm,initializeBit128Wasm,initializeTemporalWasm} from '../bindings/core/wasm/index.js';
import {CORE_MODEL_RESOURCES} from './access/core-model-resources';
import {bindCoreCardinalityRust} from './access/rust-cardinality-default';
import {bindCoreDatasetValuesCompactRust} from './access/rust-dataset-values-compact-default';
import {bindCoreFacetsRust} from './access/rust-facets-default';
import {bindCoreKeysRust} from './access/rust-keys-default';
import {bindCoreRelationshipsRust} from './access/rust-relationships-default';
import {bindBit128Rust} from './access/rust-bit128-default';
import {bindCsvBooleanLexicalRust} from './access/rust-csv-boolean-default';
import {bindCoreInspectorsRust} from './access/rust-core-inspectors-default';

// Module import resolves only after the browser WASM engine is ready. The
// function exported below remains synchronous and never falls back to TypeScript.
const generatePythonClient=await initializePythonClientRustDefaultV4(()=>createPythonClientRustCandidateV4());
const model=await initializeCoreModelRootWasm(CORE_MODEL_RESOURCES);
const temporal=await initializeTemporalWasm();
const {parseGregorianDate,truncateGregorianDate,parseRfc3339ExactInstant,sameRfc3339ExactInstant}=temporal;
const {validateCsvBooleanLexical,verifyCsvBooleanLexical}=bindCsvBooleanLexicalRust(model);
const {inspectCoreScalarType,inspectCoreRecordMembers,inspectCoreReferenceLinks}=bindCoreInspectorsRust(model);
const {inspectCoreCardinality,declareCoreCardinality,verifyCoreCardinalityDeclaration}=bindCoreCardinalityRust(model);
const {validateCoreDatasetValuesCompact}=bindCoreDatasetValuesCompactRust(model);
const {inspectCoreFacets,declareCoreFacets,verifyCoreFacetDeclaration,historicalCoreFacetPatch}=bindCoreFacetsRust(model);
const {inspectCoreKeys,lookupCoreKey,declareCoreRecordMembers,declareCoreKey}=bindCoreKeysRust(model);
const {inspectCoreRelationships,lookupCoreRelationship,declareCoreRelationship,verifyCoreRelationshipOperation}=bindCoreRelationshipsRust(model);
const {parseBits128,parseUuid,bits128FromBytes,bits128ToBytes,uuidFromBits128,uuidToBits128,compareBits128,bits128ToWords,bits128FromWords,bits128ToInteger,bits128FromInteger}=bindBit128Rust(await initializeBit128Wasm());
export * from './index';
export {generatePythonClient,inspectCoreCardinality,declareCoreCardinality,verifyCoreCardinalityDeclaration,validateCoreDatasetValuesCompact,inspectCoreFacets,declareCoreFacets,verifyCoreFacetDeclaration,historicalCoreFacetPatch,inspectCoreKeys,lookupCoreKey,declareCoreRecordMembers,declareCoreKey,inspectCoreRelationships,lookupCoreRelationship,declareCoreRelationship,verifyCoreRelationshipOperation,inspectCoreScalarType,inspectCoreRecordMembers,inspectCoreReferenceLinks,parseBits128,parseUuid,bits128FromBytes,bits128ToBytes,uuidFromBits128,uuidToBits128,compareBits128,bits128ToWords,bits128FromWords,bits128ToInteger,bits128FromInteger,validateCsvBooleanLexical,verifyCsvBooleanLexical,parseGregorianDate,truncateGregorianDate,parseRfc3339ExactInstant,sameRfc3339ExactInstant};
