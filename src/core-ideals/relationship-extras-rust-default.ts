// SPDX-License-Identifier: MIT OR Apache-2.0
import {UmfError,type Document} from '../model/types';
import {copyJson} from '../model/json';
import type {CoreRelationshipDeclaration} from '../model/relationships';
import {importRelationshipExtraArchive} from './relationship-extras-host';
import type {RelationshipExtraArchive,RelationshipExtraClassification,RelationshipExtraClassificationRequest,RelationshipExtraProjection,RelationshipExtraRequest} from './relationship-extras-factory';

type Engine={['relationship-extra-projection']:{
 prepareRelationshipToExtra(fields:{source:Document;author:CoreRelationshipDeclaration;request:RelationshipExtraRequest}):unknown;
 completeRelationshipToExtra(fields:{prepared:unknown;target:Document}):unknown;
 classifyRelationshipExtra(fields:{source:Document;request:RelationshipExtraClassificationRequest;fresh:Document}):unknown;
 verifyRelationshipExtra(fields:{receipt:RelationshipExtraProjection|RelationshipExtraClassification;fresh:Document;current?:Document}):unknown;
 recoverRelationshipExtraIdeal(fields:{receipt:RelationshipExtraProjection;fresh:Document;current?:Document}):unknown;
 recoverRelationshipExtraNative(fields:{receipt:RelationshipExtraProjection|RelationshipExtraClassification;fresh:Document;current?:Document}):unknown;
}};
type NativeGuard=(error:unknown)=>boolean;
type Importers={graphql:(text:string,id:string)=>Document;rdf:(text:string,id:string,scope:string)=>Document;linkml:(text:string,id:string,format:'json'|'yaml')=>Document};
const CONTROL=new Set(['LIMIT','CAPACITY','RESOURCE_LIMIT','CANCELLED','METER_FAILURE','CANCELLATION_CHECK_FAILURE','CLOCK_CAPABILITY_REQUIRED','DEADLINE','DEADLINE_EXCEEDED']);
export function createRelationshipExtrasRustDefault(engine:Engine,importers:Importers,isNative:NativeGuard=()=>false){
 function call<T>(op:()=>unknown):T {try{return op() as T;}catch(error){if(!isNative(error))throw error;const e=error as {code?:unknown;message?:unknown;path?:unknown};if(typeof e.code!=='string'||CONTROL.has(e.code)||!e.code.startsWith('RELATIONSHIP_EXTRA_'))throw error;throw new UmfError(e.code,String(e.message??''),typeof e.path==='string'?e.path:'');}}
 function importArchive(archive:RelationshipExtraArchive,id:string):Document{return importRelationshipExtraArchive(archive,id,importers);}
 function archiveFor(receipt:RelationshipExtraProjection|RelationshipExtraClassification):RelationshipExtraArchive{if(receipt.operation==='classify-relationship-extra')return receipt.request.archive;if(!receipt.nativeArchive)throw new UmfError('RELATIONSHIP_EXTRA_RECEIPT','Projected receipt does not contain a native archive');return receipt.nativeArchive;}
 function targetFor(receipt:RelationshipExtraProjection|RelationshipExtraClassification):Document{return importArchive(archiveFor(receipt),receipt.operation==='classify-relationship-extra'?receipt.source.id:receipt.request.id);}
 function projectRelationshipToExtra(sourceInput:Document,authorInput:CoreRelationshipDeclaration,requestInput:RelationshipExtraRequest):RelationshipExtraProjection{
  const source=copyJson(sourceInput) as Document,author=copyJson(authorInput) as unknown as CoreRelationshipDeclaration,request=copyJson(requestInput) as unknown as RelationshipExtraRequest;
  const prepared=call<{status:string;nativeArchive?:RelationshipExtraArchive}>(()=>engine['relationship-extra-projection'].prepareRelationshipToExtra({source,author,request}));
  if(prepared.status==='blocked')return prepared as unknown as RelationshipExtraProjection;
  if(prepared.status!=='prepared'||!prepared.nativeArchive)throw new UmfError('RELATIONSHIP_EXTRA_RECEIPT','Rust projection did not prepare a native archive');
  const target=importArchive(prepared.nativeArchive,request.id);
  return call<RelationshipExtraProjection>(()=>engine['relationship-extra-projection'].completeRelationshipToExtra({prepared,target}));
 }
 function classifyRelationshipExtra(sourceInput:Document,requestInput:RelationshipExtraClassificationRequest):RelationshipExtraClassification{
  const source=copyJson(sourceInput) as Document,request=copyJson(requestInput) as unknown as RelationshipExtraClassificationRequest;
  const fresh=importArchive(request.archive,source.id);
  return call<RelationshipExtraClassification>(()=>engine['relationship-extra-projection'].classifyRelationshipExtra({source,request,fresh}));
 }
 function verifyRelationshipExtra(receiptInput:RelationshipExtraProjection|RelationshipExtraClassification,currentInput?:Document):RelationshipExtraProjection|RelationshipExtraClassification{
  const receipt=copyJson(receiptInput) as unknown as RelationshipExtraProjection|RelationshipExtraClassification,fresh=targetFor(receipt),current=currentInput===undefined?undefined:copyJson(currentInput) as Document;
  return call<RelationshipExtraProjection|RelationshipExtraClassification>(()=>engine['relationship-extra-projection'].verifyRelationshipExtra({receipt,fresh,...(current===undefined?{}:{current})}));
 }
 function recoverRelationshipExtraIdeal(receiptInput:RelationshipExtraProjection,currentInput:Document):Document{
  const receipt=copyJson(receiptInput) as unknown as RelationshipExtraProjection,fresh=targetFor(receipt),current=copyJson(currentInput) as Document;
  return call<Document>(()=>engine['relationship-extra-projection'].recoverRelationshipExtraIdeal({receipt,fresh,current}));
 }
 function recoverRelationshipExtraNative(receiptInput:RelationshipExtraProjection|RelationshipExtraClassification,currentInput:Document):{document:Document;archive:RelationshipExtraArchive}{
  const receipt=copyJson(receiptInput) as unknown as RelationshipExtraProjection|RelationshipExtraClassification,fresh=targetFor(receipt),current=copyJson(currentInput) as Document;
  return call<{document:Document;archive:RelationshipExtraArchive}>(()=>engine['relationship-extra-projection'].recoverRelationshipExtraNative({receipt,fresh,current}));
 }
 return Object.freeze({projectRelationshipToExtra,classifyRelationshipExtra,verifyRelationshipExtra,recoverRelationshipExtraIdeal,recoverRelationshipExtraNative});
}
