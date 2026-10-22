// SPDX-License-Identifier: MIT OR Apache-2.0
import {CURRENT_CORE_VERSION} from '../generated/core-model';
/** Internal exact-current authoring receipt inspection; consistency is not issuer authority. */
import sourceSchema from '../../spec/core/schema.json';
import kindsSchema from '../../spec/core/kind-operation-v6.schema.json';
import receiptSchema from '../../spec/core/record-type-operation-v6.schema.json';
import resultSchema from '../../spec/core/record-type-inspection.schema.json';
import {copyJson} from './json';
import {UmfError,type Document} from './types';
import {verifyCoreRecordTypeDeclaration,type CoreRecordTypeDeclaration} from './record-type';
import {inspectCoreReferenceLinks,type CoreReferenceLinkIdentity,type CoreReferenceLink} from './reference-links';
import {createValidator} from '../validation/schema';
export interface CoreRecordTypeInspection {
 operation:'inspect-core-record-type-receipt';version:'0.1.0';source:Document;identity:CoreReferenceLinkIdentity;
 path:string;recordPath:string;link:CoreReferenceLink;receipt:CoreRecordTypeDeclaration;
 receiptConsistency:'verified';issuerAuthority:'unverified';enforcement:'none';
}
const validator=createValidator();validator.addSchema(sourceSchema);validator.addSchema(kindsSchema);validator.addSchema(receiptSchema);const check=validator.compile(resultSchema);
/** Current operation receipt. Recompute the kind declarations and authored type link using the owner verifier.
 * Missing receipts and bare role strings are never adopted. Every current-model edit makes the receipt stale. */
export function inspectCoreRecordTypeReceipt(input:Document,identityInput:CoreReferenceLinkIdentity,receiptInput:CoreRecordTypeDeclaration):CoreRecordTypeInspection {
 const source=copyJson(input) as unknown as Document;
 if(source?.umf!==CURRENT_CORE_VERSION)throw new UmfError('CORE_RECORD_TYPE_INSPECTION_SOURCE_VERSION','Only current core 0.10.0 receipt correspondence is admitted');
 const links=inspectCoreReferenceLinks(source,identityInput);
 if(receiptInput===undefined)throw new UmfError('CORE_RECORD_TYPE_INSPECTION_RECEIPT_REQUIRED','A separate explicit authoring receipt is required');
 const candidate=copyJson(receiptInput) as unknown as CoreRecordTypeDeclaration;
 if(candidate?.version!=='6.0.0')throw new UmfError('CORE_RECORD_TYPE_INSPECTION_VERSION','Only the supported record-type receipt format is admitted');
 const receipt=verifyCoreRecordTypeDeclaration(candidate,links.source);
 if(receipt.fieldAuthor.identity.module!==links.identity.module||receipt.fieldAuthor.identity.element!==links.identity.element)throw new UmfError('CORE_RECORD_TYPE_INSPECTION_IDENTITY','Receipt belongs to a different qualified Field');
 const path=receipt.provenance.idealPath;
 const link=links.meaning.state==='present'?links.meaning.links.find(l=>l.path===path):undefined;
 if(!link||link.reference.role!=='record-type'||link.target.kind!=='record'||link.target.path!==receipt.provenance.recordPath||link.target.identity.module!==receipt.reference.module||link.target.identity.element!==receipt.reference.element)throw new UmfError('CORE_RECORD_TYPE_INSPECTION_LINK','Exact authored link and qualified Record target required');
 const result=copyJson({operation:'inspect-core-record-type-receipt',version:'0.1.0',source:links.source,identity:links.identity,path,recordPath:receipt.provenance.recordPath,link,receipt,receiptConsistency:'verified',issuerAuthority:'unverified',enforcement:'none'});
 if(!check(result))throw new UmfError('CORE_RECORD_TYPE_INSPECTION_RESULT',JSON.stringify(check.errors));
 return result as unknown as CoreRecordTypeInspection;
}
