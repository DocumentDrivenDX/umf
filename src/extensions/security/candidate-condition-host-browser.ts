// SPDX-License-Identifier: MIT OR Apache-2.0
import {createSecurityLogicEngine} from '../../../bindings/core/wasm/index.js';
import {createSecurityCandidateConditionEngine} from '../../../bindings/core/wasm/index.js';
import {createSecurityFunctionsEngine} from '../../../bindings/core/wasm/index.js';
import {createSecurityPolicySourceEngine} from '../../../bindings/core/wasm/index.js';
import {createSecurityProtectionDomainsEngine} from '../../../bindings/core/wasm/index.js';
const wasm=await import('../../../bindings/core/wasm/pkg/umf_core_wasm.js');
await wasm.default();
type Engine={candidateAssociationOperandDomain(input:unknown):unknown;admitCandidateCatalogDateProfiles(input:unknown):unknown;planCandidateEmptyDisclosures(input:unknown):unknown;planCandidateCatalogRequest(input:unknown):unknown;admitCandidateCatalogCut(input:unknown):unknown;checkCandidateDisclosureIdentities(input:unknown):boolean;resolveCandidateCatalogEntityTerm(input:unknown):unknown;prepareCandidateCatalogOntology(input:unknown):unknown;planCandidateCatalogOntology(input:unknown):unknown;prepareCandidateCatalogProgram(input:unknown):unknown;planCandidateCatalogProgram(input:unknown):unknown;compileCandidateCompactCondition(condition:unknown,associationCount:number):unknown;validateCandidateCatalogStorage(program:unknown,owner:unknown,maxSteps:number):unknown;admitCandidateCatalogInventory(inventory:unknown):unknown;selectCandidateCatalogDisclosures(input:unknown):unknown;renderCandidateCatalogCells(input:unknown):unknown;assembleCandidateDisclosureBatch(input:unknown):unknown};
const engine=createSecurityLogicEngine(wasm) as ReturnType<typeof createSecurityLogicEngine>&Engine;
const conditionEngine=createSecurityCandidateConditionEngine(wasm);
const securityFunctions=createSecurityFunctionsEngine(wasm);
const policySource=createSecurityPolicySourceEngine(wasm);
const protectionDomains=createSecurityProtectionDomainsEngine(wasm);
export function catalogRecipe(input:unknown):unknown{return securityFunctions.catalogRecipe(input);}
export function evaluateCandidateCompactCondition(expression:unknown,resourceIndex:number,dispatch:(event:unknown)=>unknown):'T'|'F'|'U'{return conditionEngine.evaluateCandidateCondition(expression,resourceIndex,dispatch);}
export function preflightCandidateCompactCondition(expression:unknown,target:unknown,dispatch:(event:unknown)=>unknown,associations:readonly unknown[]):true{return conditionEngine.preflightCandidateCondition(expression,target,dispatch,associations) as true;}
export function compileCandidateCompactCondition(condition:unknown,associationCount:number):unknown{
 return engine.compileCandidateCompactCondition(condition,associationCount);
}
export function validateCandidateCatalogStorage(program:unknown,owner:unknown,maxSteps:number):unknown{
 return engine.validateCandidateCatalogStorage(program,owner,maxSteps);
}
export function admitCandidateCatalogInventory(inventory:unknown):unknown{return engine.admitCandidateCatalogInventory(inventory);}
export function resolveCandidateRecordAssociation(input:unknown):unknown{return (engine as typeof engine&{resolveCandidateRecordAssociation(input:unknown):unknown}).resolveCandidateRecordAssociation(input);}
export function validateCandidateRelationshipAssociation(input:unknown):unknown{return (engine as typeof engine&{validateCandidateRelationshipAssociation(input:unknown):unknown}).validateCandidateRelationshipAssociation(input);}
export function resolveCandidateRelationshipTerm(input:unknown):unknown{return (engine as typeof engine&{resolveCandidateRelationshipTerm(input:unknown):unknown}).resolveCandidateRelationshipTerm(input);}
export function candidateWitnessTermCapability(input:unknown):unknown{return (engine as typeof engine&{candidateWitnessTermCapability(input:unknown):unknown}).candidateWitnessTermCapability(input);}
export function selectCandidateCatalogDisclosures(input:unknown):unknown{return engine.selectCandidateCatalogDisclosures(input);}
export function renderCandidateCatalogCells(input:unknown):unknown{return engine.renderCandidateCatalogCells(input);}
export function assembleCandidateDisclosureBatch(input:unknown):unknown{return engine.assembleCandidateDisclosureBatch(input);}
export function inspectCandidateProtectionObligations(policy:unknown,catalog:unknown,closure:unknown,ontology:unknown):unknown{return (policySource as any).inspectCandidateCatalogObligations(policy,catalog,closure,ontology);}
export function resolveCandidateProtectionDomains(policy:unknown,catalog:unknown,closure:unknown):unknown{return protectionDomains.resolveSecurityProtectionDomains(policy,catalog,closure);}
export function admitCandidateCatalogOperationBatch(input:unknown):unknown{return (engine as any).admitCandidateCatalogOperationBatch(input);}
export function admitCandidateCatalogScanBatch(input:unknown):unknown{return (engine as any).admitCandidateCatalogScanBatch(input);}
export function composeCandidateCatalogOperationBatch(input:unknown):unknown{return (engine as any).composeCandidateCatalogOperationBatch(input);}
export function composeCandidateCatalogScanBatch(input:unknown):unknown{return (engine as any).composeCandidateCatalogScanBatch(input);}
export function compareCatalogWrite(input:unknown):unknown{return securityFunctions.compareCatalogWrite(input);}
export function foldCatalogWriteDecisions(decisions:unknown):unknown{return securityFunctions.foldCatalogWriteDecisions(decisions as never);}
export function planCatalogWriteIncidence(input:unknown):unknown{return securityFunctions.planCatalogWriteIncidence(input);}
export function admitCatalogWriteProfiles(input:unknown):unknown{return securityFunctions.admitCatalogWriteProfiles(input);}
export function catalogWriteReadNeeds(decisions:unknown):unknown{return securityFunctions.catalogWriteReadNeeds(decisions as never);}
export function resolveCatalogWriteRead(input:Parameters<typeof securityFunctions.resolveCatalogWriteRead>[0]){return securityFunctions.resolveCatalogWriteRead(input);}
export function planCatalogWriteActions(input:unknown):unknown{return securityFunctions.planCatalogWriteActions(input);}
export function validateCatalogWriteDependencies(input:unknown):unknown{return securityFunctions.validateCatalogWriteDependencies(input);}
export function admitCatalogWriteAssociations(input:unknown):unknown{return securityFunctions.admitCatalogWriteAssociations(input);}
export function validateCatalogWriteCoverage(input:unknown):unknown{return securityFunctions.validateCatalogWriteCoverage(input);}
export function prepareCandidateCatalogProgram(input:unknown):unknown{return engine.prepareCandidateCatalogProgram(input);}
export function planCandidateCatalogProgram(input:unknown):unknown{return engine.planCandidateCatalogProgram(input);}
export function prepareCandidateCatalogOntology(input:unknown):unknown{return engine.prepareCandidateCatalogOntology(input);}
export function planCandidateCatalogOntology(input:unknown):unknown{return engine.planCandidateCatalogOntology(input);}
export function resolveCandidateCatalogEntityTerm(input:unknown):unknown{return engine.resolveCandidateCatalogEntityTerm(input);}
export function checkCandidateDisclosureIdentities(input:unknown):boolean{return engine.checkCandidateDisclosureIdentities(input);}
export function normalizeCandidateConditionSource(expression:unknown,dispatch:(event:unknown)=>unknown):unknown{return conditionEngine.normalizeCandidateCondition(expression,dispatch);}
export function admitCandidateCatalogCut(input:unknown):unknown{return engine.admitCandidateCatalogCut(input);}
export function planCandidateCatalogRequest(input:unknown):unknown{return engine.planCandidateCatalogRequest(input);}
export function planCandidateEmptyDisclosures(input:unknown):unknown{return engine.planCandidateEmptyDisclosures(input);}
export function admitCandidateCatalogDateProfiles(input:unknown):unknown{return engine.admitCandidateCatalogDateProfiles(input);}
export function candidateAssociationOperandDomain(input:unknown):unknown{return engine.candidateAssociationOperandDomain(input);}
