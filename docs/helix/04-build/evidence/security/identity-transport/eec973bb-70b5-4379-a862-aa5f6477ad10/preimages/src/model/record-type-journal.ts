/** Internal explicit transition reconciliation; consistency never authenticates issuer. */
import sourceSchema from '../../spec/core/relationship-document.schema.json';
import kindsSchema from '../../spec/core/kind-operation-v6.schema.json';
import receiptSchema from '../../spec/core/record-type-operation-v6.schema.json';
import resultSchema from '../../spec/core/record-type-journal.schema.json';
import {copyJson} from './json';
import {UmfError,type Document,type Json} from './types';
import {validateDocument} from '../validation/document';
import {createValidator} from '../validation/schema';
import {verifyCoreKindDeclaration,type CoreKindDeclaration} from './field-kind';
import {verifyCoreRecordTypeDeclaration,type CoreRecordTypeDeclaration} from './record-type';
import {inspectCoreReferenceLinks,type CoreReferenceLink} from './reference-links';
export type CoreRecordTypeJournalEvent=CoreKindDeclaration|CoreRecordTypeDeclaration;
export interface CoreRecordTypeJournal {
 operation:'inspect-core-record-type-journal';version:'0.1.0';base:Document;source:Document;events:CoreRecordTypeJournalEvent[];
 types:{eventIndex:number;identity:{module:string;element:string};path:string;recordPath:string;link:CoreReferenceLink;receipt:CoreRecordTypeDeclaration}[];
 receiptConsistency:'verified';issuerAuthority:'unverified';enforcement:'none';
}
const validator=createValidator();validator.addSchema(sourceSchema);validator.addSchema(kindsSchema);validator.addSchema(receiptSchema);const check=validator.compile(resultSchema);
function canonical(v:Json):string{return Array.isArray(v)?'['+v.map(canonical).join(',')+']':v!==null&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k]!)).join(',')+'}':JSON.stringify(v)}
function same(a:unknown,b:unknown){return canonical(a as Json)===canonical(b as Json)}
/** No arbitrary edit events. Complete source continuity is checked before returning any type. */
export function inspectCoreRecordTypeJournal(baseInput:Document,currentInput:Document,eventsInput:readonly CoreRecordTypeJournalEvent[]):CoreRecordTypeJournal{
 const packet=copyJson({base:baseInput,current:currentInput,events:eventsInput}) as unknown as {base:Document;current:Document;events:CoreRecordTypeJournalEvent[]};
 const {base,current,events}=packet;
 if(!Array.isArray(events)||events.length<1||events.length>32)throw new UmfError('CORE_TYPE_JOURNAL_CAPACITY','One to32 explicit events required');
 for(const model of [base,current])if(model?.umf!=='0.7.0'||!validateDocument(model).valid)throw new UmfError('CORE_TYPE_JOURNAL_SOURCE','Original0.7 valid complete models required');
 let previous=base;
 const verified:CoreRecordTypeJournalEvent[]=[];
 for(const event of events){
  if(event?.version!=='6.0.0'||!['declare-core-kind','declare-core-record-type'].includes(event.operation))throw new UmfError('CORE_TYPE_JOURNAL_EVENT','Only original0.7/v6 kind and type events admitted');
  const receipt=event.operation==='declare-core-kind'?verifyCoreKindDeclaration(event,event.target):verifyCoreRecordTypeDeclaration(event,event.target);
  if(!same(receipt.source,previous))throw new UmfError('CORE_TYPE_JOURNAL_GAP','Full event source must equal previous target');
  verified.push(receipt);previous=receipt.target;
 }
 if(!same(previous,current))throw new UmfError('CORE_TYPE_JOURNAL_CURRENT','Full final target must equal current model');
 const types:CoreRecordTypeJournal['types']=[];
 for(const [eventIndex,event] of verified.entries()){
  if(event.operation!=='declare-core-record-type')continue;
  const identity=event.fieldAuthor.identity,inspection=inspectCoreReferenceLinks(current,identity),path=event.provenance.idealPath;
  const mi=current.modules.findIndex(m=>m.id===identity.module),ei=current.modules[mi]?.elements.findIndex(e=>e.id===identity.element)??-1;
  const link=inspection.meaning.state==='present'?inspection.meaning.links.find(l=>l.path===path):undefined;
  if(current.modules[mi]?.elements[ei]?.kind!=='field'||!link||!same(link.reference,event.reference)||link.target.kind!=='record'||link.target.path!==event.provenance.recordPath||link.target.identity.module!==event.reference.module||link.target.identity.element!==event.reference.element)throw new UmfError('CORE_TYPE_JOURNAL_LINK','Every authored type must remain exact in final model');
  types.push({eventIndex,identity,path,recordPath:event.provenance.recordPath,link,receipt:event});
 }
 const result=copyJson({operation:'inspect-core-record-type-journal',version:'0.1.0',base,source:current,events:verified,types,receiptConsistency:'verified',issuerAuthority:'unverified',enforcement:'none'});
 if(!check(result))throw new UmfError('CORE_TYPE_JOURNAL_RESULT',JSON.stringify(check.errors));
 return result as unknown as CoreRecordTypeJournal;
}
