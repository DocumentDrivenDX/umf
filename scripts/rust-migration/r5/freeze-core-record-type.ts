// SPDX-License-Identifier: MIT OR Apache-2.0
// Freeze the current TypeScript Core Record Type declarations and verification order.
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {recordTypeCases} from '../../../scripts/core-ideals/record-type-cases';
import {cardinalityFieldOperationsCases} from '../../../scripts/core-ideals/cardinality-field-operations-cases';
import {declareCoreRecordType,verifyCoreRecordTypeDeclaration} from '../../../src/model/record-type';
import {declareCoreElementKind} from '../../../src/model/field-kind';

const root=new URL('../../../docs/helix/04-build/evidence/rust-migration/r5-core-record-type/',import.meta.url);
const closure=[
 'src/model/record-type.ts','src/model/field-kind.ts','src/model/json.ts','src/model/types.ts',
 'src/validation/document.ts','src/validation/schema.ts','src/validation/internal-schema.ts',
 'spec/core/schema.json','spec/core/kind-operation-v6.schema.json','spec/core/record-type-operation-v6.schema.json',
 'scripts/core-ideals/record-type-cases.ts','scripts/core-ideals/cardinality-field-operations-cases.ts',
];
const sourceClosureSha256:Record<string,string>={};
for(const path of closure)sourceClosureSha256[path]=createHash('sha256').update(await readFile(new URL('../../../'+path,import.meta.url))).digest('hex');
const capture=(f:()=>unknown)=>{try{return {ok:true as const,value:f()};}catch(e){const x=e as {code?:string;message?:string;path?:string};return {ok:false as const,error:{code:x.code??'',message:x.message??String(e),path:x.path??''}};}};
const rows=recordTypeCases();
const successes:Record<string,unknown>={};
for(const c of rows){const receipt=declareCoreRecordType(c.fieldAuthor,c.recordAuthor);successes[`declare-${c.variant}`]=receipt;successes[`verify-${c.variant}`]=verifyCoreRecordTypeDeclaration(receipt,receipt.target);}
const base=rows[0]!;
const withSource=(edit:(source:typeof base.source)=>void)=>{const source=structuredClone(base.source);edit(source);return {field:declareCoreElementKind(source,{module:'sales',element:'slot'},'field'),record:declareCoreElementKind(source,{module:'sales',element:'child'},'record')};};
const scalar=withSource(source=>{source.modules[0]!.elements[1]!.scalarType='string';});
const facets=withSource(source=>{delete source.modules[0]!.elements[1]!.references;source.modules[0]!.elements[1]!.scalarType='integer';source.modules[0]!.elements[1]!.facets={integerWidth:{bits:64,signed:true}};});
const existing=withSource(source=>{source.modules[0]!.elements[1]!.references!.push({role:'record-type',module:'sales',element:'child'});});
const arrayRow=cardinalityFieldOperationsCases()[0]!;
const arraySource=structuredClone(arrayRow.source);
arraySource.modules[0]!.elements.push({id:'item',kind:'field',cardinality:'one',extensions:{}});
const arraySlot=arraySource.modules[0]!.elements.find(e=>e.id===arrayRow.field.element)!;
arraySlot.cardinality='array';arraySlot.itemType={module:'sales',element:'item'};
const arrayAuthors={field:declareCoreElementKind(arraySource,arrayRow.field,'field'),record:declareCoreElementKind(arraySource,arrayRow.record,'record')};
const good=declareCoreRecordType(base.fieldAuthor,base.recordAuthor);
const malformed=structuredClone(good) as unknown as Record<string,unknown>;delete malformed.reference;
const tampered=structuredClone(good);tampered.provenance.recordPath='/forged';
const stale=structuredClone(good.target);stale.future={retained:true};
const current={};let currentReads=0;Object.defineProperty(current,'future',{enumerable:true,get(){currentReads++;return 1;}});
const malformedOrder=structuredClone(good) as unknown as Record<string,unknown>;delete malformedOrder.reference;
const refusals={
 wrongAuthorOrder:capture(()=>declareCoreRecordType(base.recordAuthor,base.fieldAuthor)),
 scalarConflict:capture(()=>declareCoreRecordType(scalar.field,scalar.record)),
 facetsConflict:capture(()=>declareCoreRecordType(facets.field,facets.record)),
 existingRecordTypeReference:capture(()=>declareCoreRecordType(existing.field,existing.record)),
 containerDirectType:capture(()=>declareCoreRecordType(arrayAuthors.field,arrayAuthors.record)),
 malformedReceipt:capture(()=>verifyCoreRecordTypeDeclaration(malformed as never,good.target)),
 tamperedReceipt:capture(()=>verifyCoreRecordTypeDeclaration(tampered,good.target)),
 staleCurrent:capture(()=>verifyCoreRecordTypeDeclaration(good,stale)),
 malformedReceiptBeforeCurrent:{...capture(()=>verifyCoreRecordTypeDeclaration(malformedOrder as never,current as never)),currentReads},
};
const packet={format:'umf-r5-core-record-type-predecessor/1',predecessor:'src/model/record-type.ts',sourceClosureSha256,successes,refusals};
const generated=JSON.stringify(packet,null,2)+'\n';
if(process.argv.includes('--check')){const path=new URL('frozen-typescript.json',root);const committed=await readFile(path,'utf8');if(committed!==generated){console.error(`Core Record Type packet mismatch: ${path.pathname}`);process.exitCode=1;}else console.log(`Core Record Type packet matches: ${root.pathname}frozen-typescript.json`);}else process.stdout.write(generated);
