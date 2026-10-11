/** Existing producer fields only; never full report/effect admission. */
import {requireOriginalCatalogExecutionReportCandidate,recheckOriginalCatalogExecutionReportCandidate,type composeCatalogExecutionReportCandidate} from './catalog-execution-report-candidate';
import {createCanonicalAcceptanceReportHandoff} from './canonical-report-handoff';
import {collectCatalogExtensionArtifacts} from './catalog-extension-artifacts';
import {decodeAcceptanceJson} from '../../postgresql/src/acceptance-json';
import {requireOriginalAcceptanceProfileResolver,type createAcceptanceProfileResolver} from './acceptance-profiles';
import type {ProfilePin} from '../../../docs/helix/02-design/contracts/bindings/truss-acceptance-input-v0.1';
import {requireOriginalCatalogReportPreparation,type collectCatalogReportPreparation} from './catalog-report-preparation';
import {recheckCatalogReportDocumentBasis} from './catalog-report-document-basis';
import type {createCatalogInputPreparation} from './catalog-input';
import type {CatalogStageConnection} from './catalog-new-stage';
type Prepared=ReturnType<Awaited<ReturnType<typeof createCatalogInputPreparation>>['prepare']>;
type Basis=Awaited<ReturnType<typeof collectCatalogReportPreparation>>;
// Object order is irrelevant; array order, exact strings and complete key sets matter.
function same(a:unknown,b:unknown):boolean{
 if(a===b)return true;
 if(a===null||b===null||typeof a!=='object'||typeof b!=='object')return false;
 if(Array.isArray(a)||Array.isArray(b))return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>same(v,b[i]));
 const left=a as Record<string,unknown>,right=b as Record<string,unknown>,keys=Object.keys(left).sort(),other=Object.keys(right).sort();
 return keys.length===other.length&&keys.every((k,i)=>k===other[i]&&same(left[k],right[k]));
}
export async function createCatalogReportCorrespondence(dependenciesPackage:string){
 const codec=await createCanonicalAcceptanceReportHandoff(dependenciesPackage);
 const correspondence={async verify(connection:CatalogStageConnection,prepared:Prepared,basis:Basis,wire:Uint8Array){
  requireOriginalCatalogReportPreparation(basis,prepared);
  const encoded=codec.prepare(wire),report=decodeAcceptanceJson(Buffer.from(encoded.originalUtf8Hex,'hex')) as Record<string,unknown>;
  const expected={rev:basis.provisionalRevision,acceptedInput:prepared.original.input,documents:basis.documentBasis.documents,counts:basis.counts,
   provisional:basis.provisional,diagnostics:basis.validationEvidence.diagnostics,documentInterpretations:basis.validationEvidence.documentInterpretations,
   losses:basis.ingressBasis.losses,transformRegistrations:basis.ingressBasis.transformRegistrations,extensions:collectCatalogExtensionArtifacts(prepared).extensions};
  for(const [field,value] of Object.entries(expected))if(!same(report[field],value))throw Error('Original report producer correspondence required: '+field);
  await recheckCatalogReportDocumentBasis(connection,basis.documentBasis);
  return Object.freeze({...encoded,verifiedFields:Object.freeze(Object.keys(expected)),nativeObservation:basis.documentBasis.nativeObservation,
   scope:'ten_original_report_producer_fields_only' as const});
 }};
 const paths=Object.freeze({...correspondence,async verifyWithRegisteredReportProfile(connection:CatalogStageConnection,prepared:Prepared,basis:Basis,wire:Uint8Array,resolver:ReturnType<typeof createAcceptanceProfileResolver>,selected:ProfilePin){
  requireOriginalCatalogReportPreparation(basis,prepared);
  requireOriginalAcceptanceProfileResolver(resolver);
  const registration=resolver.resolveReport(selected);
  const encoded=codec.prepare(wire),report=decodeAcceptanceJson(Buffer.from(encoded.originalUtf8Hex,'hex')) as Record<string,unknown>;
  if(!same(report.reportProfile,registration.profile))throw Error('Original registered report profile correspondence required');
  const result=await correspondence.verify(connection,prepared,basis,wire);
  return Object.freeze({...result,registeredReportArtifact:registration.artifact,
   verifiedFields:Object.freeze([...result.verifiedFields,'reportProfile']),
   scope:'ten_producer_fields_and_registered_report_bytes_only' as const});
 },async verifyWithExecutionCandidate(connection:CatalogStageConnection,prepared:Prepared,basis:Basis,wire:Uint8Array,candidate:Awaited<ReturnType<typeof composeCatalogExecutionReportCandidate>>){
  requireOriginalCatalogExecutionReportCandidate(candidate,connection,prepared,basis);
  const result=await correspondence.verify(connection,prepared,basis,wire);
  const report=decodeAcceptanceJson(Buffer.from(result.originalUtf8Hex,'hex')) as Record<string,unknown>;
  if(!same(report.originalExecution,candidate.candidate))throw Error('Original report producer correspondence required: originalExecution');
  await recheckOriginalCatalogExecutionReportCandidate(candidate,connection,prepared,basis);
  return Object.freeze({...result,verifiedFields:Object.freeze([...result.verifiedFields,'originalExecution']),scope:'eleven_original_report_candidate_fields_only' as const});
 }});
 return Object.freeze({...paths,async verifyWithExecutionAndRegisteredReportProfile(connection:CatalogStageConnection,prepared:Prepared,basis:Basis,wire:Uint8Array,candidate:Awaited<ReturnType<typeof composeCatalogExecutionReportCandidate>>,resolver:ReturnType<typeof createAcceptanceProfileResolver>,selected:ProfilePin){
  requireOriginalCatalogExecutionReportCandidate(candidate,connection,prepared,basis);
  const result=await paths.verifyWithRegisteredReportProfile(connection,prepared,basis,wire,resolver,selected);
  const report=decodeAcceptanceJson(Buffer.from(result.originalUtf8Hex,'hex')) as Record<string,unknown>;
  if(!same(report.originalExecution,candidate.candidate))throw Error('Original report producer correspondence required: originalExecution');
  await recheckOriginalCatalogExecutionReportCandidate(candidate,connection,prepared,basis);
  return Object.freeze({...result,verifiedFields:Object.freeze([...result.verifiedFields,'originalExecution']),scope:'twelve_original_report_candidate_fields_only' as const});
 }});
}
