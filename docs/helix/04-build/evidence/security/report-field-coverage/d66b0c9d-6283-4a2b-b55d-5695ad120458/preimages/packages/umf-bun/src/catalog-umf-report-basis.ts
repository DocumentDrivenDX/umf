/** Original UMF/support byte custody only; not supported-subset semantic admission. */
import {requireOriginalCatalogPreparation,type createCatalogInputPreparation} from './catalog-input';
type Prepared=ReturnType<Awaited<ReturnType<typeof createCatalogInputPreparation>>['prepare']>;
export function collectCatalogUmfReportBasis(prepared:Prepared){
 requireOriginalCatalogPreparation(prepared);
 const registrations=prepared.registeredProfiles;
 if(!registrations)throw Error('Original registered support artifact required');
 const support=registrations.profiles.filter(item=>item.role==='support'&&item.pointer==='/supportProfile');
 if(support.length!==1)throw Error('One original registered support artifact required');
 const versions:string[]=[];
 for(const document of prepared.documents){
  if(!document.umfVersion)throw Error('Original UMF source version required');
  if(!versions.includes(document.umfVersion))versions.push(document.umfVersion);
 }
 return Object.freeze({sourceVersions:Object.freeze(versions),interpretationProfile:prepared.umfProfile,
  supportProfile:support[0]!.profile,supportArtifact:support[0]!.artifact,
  scope:'original_umf_and_support_byte_basis_only' as const});
}
