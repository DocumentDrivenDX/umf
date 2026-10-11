import {inspectCoreRecordTypeReceipt} from '../../src/model/record-type-inspection';
import {declareCoreElementKind} from '../../src/model/field-kind';
import {declareCoreRecordType} from '../../src/model/record-type';
import {inspectCoreReferenceLinks} from '../../src/model/reference-links';
import type {Document} from '../../src/model/types';
import sourceSchema from '../../spec/core/relationship-document.schema.json';
import kindsSchema from '../../spec/core/kind-operation-v6.schema.json';
import receiptSchema from '../../spec/core/record-type-operation-v6.schema.json';
import resultSchema from '../../spec/core/record-type-inspection.schema.json';
import {createValidator} from '../../src/validation/schema';
export function recordTypeOwnerFixture(){
 const source:Document={umf:'0.7.0',id:'d',vocabularies:{},modules:[{id:'m',namespace:'m',elements:[{id:'v',kind:'field',extensions:{},'future/field':{values:['b','a']},references:[{role:'future-role',module:'m',element:'R','future/qualifier':{values:['b','a']}}]},{id:'R',kind:'record',members:[],extensions:{}}]},{id:'other',namespace:'other',elements:[{id:'R',kind:'record',members:[{module:'m',element:'v'}],extensions:{}},{id:'v',kind:'field',extensions:{}}]}]};
 const identity={module:'m',element:'v'},field=declareCoreElementKind(source,identity,'field'),record=declareCoreElementKind(field.target,{module:'other',element:'R'},'record'),receipt=declareCoreRecordType(field,record);
 return {identity,source,receipt,current:receipt.target};
}
export function runRecordTypeOwnerCases(){
 const rows:{id:string;passed:boolean}[]=[];function check(id:string,passed:boolean){rows.push({id,passed});if(!passed)throw Error(id)}
 function refuse(id:string,run:()=>unknown,expected:string|string[]){let actual='';try{run()}catch(error){actual=(error as {code:string}).code}check(id,(Array.isArray(expected)?expected:[expected]).includes(actual))}
 const {identity,receipt,current}=recordTypeOwnerFixture(),result=inspectCoreRecordTypeReceipt(current,identity,receipt),same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
 check('exact-owner-context',same(result.source,current)&&same(result.identity,identity)&&result.path==='/modules/0/elements/0/references/1');
 check('qualified-record-target',same(result.link.target,{identity:{module:'other',element:'R'},path:'/modules/1/elements/0',kind:'record'})&&result.recordPath==='/modules/1/elements/0');
 check('appended-occurrence-retained',result.link.index===1&&result.link.path===result.path&&same(result.link.reference,{role:'record-type',module:'other',element:'R'}));
 check('receipt-transition-retained',same(result.receipt,receipt)&&same(result.receipt.source.modules[0]!.elements[0]!.references,[{role:'future-role',module:'m',element:'R','future/qualifier':{values:['b','a']}}]));
 check('opaque-original-content-retained',same(result.receipt.source.modules[0]!.elements[0]!['future/field'],{values:['b','a']}));
 check('consistency-without-issuer-or-enforcement',result.receiptConsistency==='verified'&&result.issuerAuthority==='unverified'&&result.enforcement==='none'&&result.link.typeAssertion==='unverified');
 check('recursive-record-membership-terminates',result.receipt.recordAuthor.identity.module==='other'&&same(result.source.modules[1]!.elements[0]!.members,[{module:'m',element:'v'}]));
 const generic=inspectCoreReferenceLinks(current,identity);check('bare-links-stay-unverified',(generic.meaning as any).links.every((l:any)=>l.typeAssertion==='unverified'));
 refuse('missing-receipt-does-not-promote-role',()=>inspectCoreRecordTypeReceipt(current,identity,undefined as any),'CORE_RECORD_TYPE_INSPECTION_RECEIPT_REQUIRED');
 refuse('same-name-other-qualified-owner',()=>inspectCoreRecordTypeReceipt(current,{module:'other',element:'v'},receipt),'CORE_RECORD_TYPE_INSPECTION_IDENTITY');
 const stale=structuredClone(current);stale.id='changed';refuse('whole-current-context-stale',()=>inspectCoreRecordTypeReceipt(stale,identity,receipt),'CORE_RECORD_TYPE_STALE');
 const opaque=structuredClone(current);(opaque.modules[0]!.elements[0]!['future/field'] as any).values.reverse();refuse('opaque-current-change-stale',()=>inspectCoreRecordTypeReceipt(opaque,identity,receipt),'CORE_RECORD_TYPE_STALE');
 const roleChanged=structuredClone(current);roleChanged.modules[0]!.elements[0]!.references![1]!.role='future-role';refuse('same-target-role-change-stale',()=>inspectCoreRecordTypeReceipt(roleChanged,identity,receipt),'CORE_RECORD_TYPE_STALE');
 const reordered=structuredClone(current);reordered.modules[0]!.elements[0]!.references!.reverse();refuse('same-population-order-change-stale',()=>inspectCoreRecordTypeReceipt(reordered,identity,receipt),'CORE_RECORD_TYPE_STALE');
 const keyOrder=Object.fromEntries(Object.entries(current).reverse()) as unknown as Document;check('current-object-key-order-harmless',inspectCoreRecordTypeReceipt(keyOrder,identity,receipt).receiptConsistency==='verified');
 const receiptOrder=Object.fromEntries(Object.entries(receipt).reverse());check('receipt-object-key-order-harmless',inspectCoreRecordTypeReceipt(current,identity,receiptOrder as any).receiptConsistency==='verified');
 for(const [id,change] of [
  ['source-opaque',(r:any)=>{r.source.modules[0].elements[0]['future/field'].values.reverse()}],
  ['target-opaque',(r:any)=>{r.target.modules[0].elements[0]['future/field'].values.reverse()}],
  ['target-role',(r:any)=>{r.target.modules[0].elements[0].references[1].role='future-role'}],
  ['target-module',(r:any)=>{r.target.modules[0].elements[0].references[1].module='m'}],
  ['reference-module',(r:any)=>{r.reference.module='m'}],
  ['reference-role',(r:any)=>{r.reference.role='future-role'}],
  ['reference-path',(r:any)=>{r.provenance.idealPath='/modules/0/elements/0/references/0'}],
  ['record-path',(r:any)=>{r.provenance.recordPath='/modules/0/elements/1'}],
  ['field-author-identity',(r:any)=>{r.fieldAuthor.identity.module='other'}],
  ['field-author-kind',(r:any)=>{r.fieldAuthor.provenance.kind='record'}],
  ['field-author-context',(r:any)=>{r.fieldAuthor.source.id='crossed'}],
  ['record-author-context',(r:any)=>{r.recordAuthor.source.id='crossed'}],
  ['missing-kind-author',(r:any)=>{delete r.recordAuthor}],
  ['invented-authentication',(r:any)=>{r.signature='authenticated'}],
  ['invented-native-path',(r:any)=>{r.provenance.nativePath='/native'}],
 ] as const){const changed=structuredClone(receipt);change(changed);refuse('receipt-substitution-'+id,()=>inspectCoreRecordTypeReceipt(current,identity,changed),['CORE_RECORD_TYPE_RECEIPT','CORE_KIND_RECEIPT','CORE_RECORD_TYPE_KIND','CORE_KIND_CONFLICT'])}
 for(const version of ['1.0.0','5.0.0','7.0.0','future'])refuse('unadmitted-receipt-'+version,()=>inspectCoreRecordTypeReceipt(current,identity,{...receipt,version} as any),'CORE_RECORD_TYPE_INSPECTION_VERSION');
 for(const umf of ['0.1.0','0.6.0','0.8.0'])refuse('unadmitted-source-'+umf,()=>inspectCoreRecordTypeReceipt({...current,umf} as Document,identity,receipt),'CORE_REFERENCE_LINKS_VERSION');
 for(const requested of [null,[],{}, {...identity,extra:true}])refuse('invalid-identity-'+JSON.stringify(requested),()=>inspectCoreRecordTypeReceipt(current,requested as any,receipt),'CORE_REFERENCE_LINKS_IDENTITY');
 refuse('missing-qualified-owner',()=>inspectCoreRecordTypeReceipt(current,{module:'m',element:'missing'},receipt),'CORE_REFERENCE_LINKS_MISSING');
 let getters=0;const hostile={...receipt};Object.defineProperty(hostile,'source',{enumerable:true,get(){getters++;return receipt.source}});refuse('receipt-getter-refused',()=>inspectCoreRecordTypeReceipt(current,identity,hostile),'NON_JSON');check('receipt-getter-not-invoked',getters===0);
 const copied=recordTypeOwnerFixture(),isolated=inspectCoreRecordTypeReceipt(copied.current,copied.identity,copied.receipt);(copied.receipt.source.modules[0]!.elements[0]!['future/field'] as any).values.reverse();check('input-copy-isolation',(isolated.receipt.source.modules[0]!.elements[0]!['future/field'] as any).values[0]==='b');isolated.source.id='changed';isolated.receipt.target.id='changed';check('output-copy-isolation',copied.current.id==='d');
 const validator=createValidator();validator.addSchema(sourceSchema);validator.addSchema(kindsSchema);validator.addSchema(receiptSchema);const valid=validator.compile(resultSchema);check('closed-result-positive',valid(result));
 for(const [id,delta] of [['issuer-authority',{issuerAuthority:'authenticated'}],['enforcement',{enforcement:'database'}],['consistency',{receiptConsistency:'unverified'}],['operation-version',{version:'future'}],['extra-authority',{admitted:true}],['bare-link-type-promotion',{link:{...result.link,typeAssertion:'verified'}}]] as const)check('closed-result-refuses-'+id,!valid({...result,...delta}));
 return rows;
}
