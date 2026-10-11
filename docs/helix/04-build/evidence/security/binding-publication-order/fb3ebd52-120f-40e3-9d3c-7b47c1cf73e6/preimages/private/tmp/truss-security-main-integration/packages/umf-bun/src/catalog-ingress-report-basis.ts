/** Original native-ingress/no-transform report basis; no general adapter support. */
import {requireOriginalCatalogPreparation,type createCatalogInputPreparation} from './catalog-input';
type Prepared=ReturnType<Awaited<ReturnType<typeof createCatalogInputPreparation>>['prepare']>;
export function collectCatalogIngressReportBasis(prepared:Prepared){
 requireOriginalCatalogPreparation(prepared);
 const input=prepared.original.input;
 if(input.transforms.length)throw Error('Complete transform report producer required');
 if(input.binding.state!=='absent')throw Error('Registered binding effect interpretation required');
 if(input.documents.some(document=>document.ingress.kind!=='native'))throw Error('Complete converted ingress loss producer required');
 // No converted artifact or declared transform is admitted by this path.
 // Reversible owner inspection does not replace or transform archival input.
 return Object.freeze({losses:Object.freeze([]),transformRegistrations:Object.freeze([]),
  originalIngress:Object.freeze(input.documents.map((document,index)=>Object.freeze({documentId:document.documentId,contentSha256:document.artifact.sha256,sourcePointer:`/documents/${index}/ingress`,kind:'native' as const}))),
  scope:'original_native_ingress_absent_binding_and_transforms_only' as const});
}
