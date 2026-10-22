/** Private composed new-only report basis, never an accepted report or commit grant. */
import {requireOriginalCatalogPreparation,type createCatalogInputPreparation} from './catalog-input';
import {collectCatalogAssertionObservations} from './catalog-assertion-observations';
import {assessCatalogObservationCoverage} from './catalog-observation-coverage';
import {collectCatalogValidationEvidence} from './catalog-validation-evidence';
import {collectCatalogExtensionInventory} from './catalog-extension-inventory';
import {collectCatalogIngressReportBasis} from './catalog-ingress-report-basis';
import {collectCatalogCoreAssertionIdentities} from './catalog-core-assertion-identities';
import {collectCatalogReportDocumentBasis,recheckCatalogReportDocumentBasis} from './catalog-report-document-basis';
import type {CatalogStageConnection} from './catalog-new-stage';
import type {loadUmfDeclarationProducer,loadUmfFieldAssertionProducer} from './index';
type Prepared=ReturnType<Awaited<ReturnType<typeof createCatalogInputPreparation>>['prepare']>;
const originalReportPreparations=new WeakMap<object,Prepared>();
export function requireOriginalCatalogReportPreparation(result:object,prepared:Prepared):void{
 requireOriginalCatalogPreparation(prepared);
 if(originalReportPreparations.get(result)!==prepared)throw Error('Original bound catalog report preparation required');
}
export async function collectCatalogReportPreparation(connection:CatalogStageConnection,prepared:Prepared,revision:string,
 owner:Awaited<ReturnType<typeof loadUmfDeclarationProducer>>,fields:Awaited<ReturnType<typeof loadUmfFieldAssertionProducer>>){
 requireOriginalCatalogPreparation(prepared);
 if(prepared.original.input.transforms.length)throw Error('Complete transform execution and report producer required');
 const ingressBasis=collectCatalogIngressReportBasis(prepared);
 const ownerObservations=collectCatalogAssertionObservations(prepared,owner,fields);
 const observationCoverage=assessCatalogObservationCoverage(prepared,ownerObservations);
 const coreAssertionIdentities=collectCatalogCoreAssertionIdentities(prepared,ownerObservations);
 const extensions=collectCatalogExtensionInventory(prepared);
 const validationEvidence=collectCatalogValidationEvidence(prepared);
 const documentBasis=await collectCatalogReportDocumentBasis(connection,prepared,revision);
 const rows=await connection.unsafe("SELECT c.*,truss.runtime_require_empty_provisional_catalog($1::int) AS provisional_count,o.original_writer_xid::text AS writer_xid,o.operation_ordinal::text AS operation_ordinal,o.effect_generation::text AS effect_generation FROM truss.runtime_collect_new_catalog_counts($1::int) c CROSS JOIN truss.row_home_operation o WHERE o.original_writer_xid=pg_current_xact_id_if_assigned() AND o.phase='admitted'",[revision]);
 if(rows.length!==1)throw Error('Original complete count observation required');const row=rows[0],cut=documentBasis.nativeObservation;
 if(row.writer_xid!==cut.writerXid||row.operation_ordinal!==cut.operationOrdinal||row.effect_generation!==cut.effectGeneration)throw Error('Mixed original report preparation cut');
 const aliases={typesAdded:'types_added',propertiesAdded:'properties_added',keysAdded:'keys_added',relationshipsAdded:'relationships_added',endpointsAdded:'endpoints_added',elementsRetired:'elements_retired'} as const;
 const expected=[...Object.values(aliases),'writer_xid','operation_ordinal','effect_generation','provisional_count'].sort();
 if(JSON.stringify(Object.keys(row).sort())!==JSON.stringify(expected))throw Error('Original count result columns required');
 const counts={} as Record<keyof typeof aliases,string>;
 for(const name of Object.keys(aliases) as (keyof typeof aliases)[]){const value=row[aliases[name]];if(typeof value!=='string'||!/^(0|[1-9][0-9]{0,4})$/.test(value)||BigInt(value)>16384n)throw Error('Original bounded count text required');counts[name]=value;}
 if(row.provisional_count!=='0')throw Error('Original empty provisional inventory proof required');
 if(counts.elementsRetired!=='0')throw Error('Original new-only retirement count required');
 await recheckCatalogReportDocumentBasis(connection,documentBasis);
 const result=Object.freeze({provisionalRevision:revision,documentBasis,counts:Object.freeze(counts),provisional:Object.freeze([]),ownerObservations,observationCoverage,coreAssertionIdentities,extensions,validationEvidence,ingressBasis,
  scope:'original_new_catalog_report_preparation_only' as const});
 originalReportPreparations.set(result,prepared);return result;
}
