// SPDX-License-Identifier: MIT OR Apache-2.0
// Check the installed TypeScript reference route against the frozen R5 packet.
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const repo=resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const archive=resolve(process.argv[2]??'');
if(!process.argv[2])throw new Error('Usage: bun scripts/rust-migration/r8/csv-boolean-retirement-reference.mjs <umf-sdk.tgz>');
const temp=await mkdtemp(join(tmpdir(),'umf-csv-reference-'));
const run=async(command,args,cwd=temp)=>{
 const child=Bun.spawn([command,...args],{cwd,stdout:'pipe',stderr:'pipe'});
 const [stdout,stderr]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text()]);
 const code=await child.exited;assert.equal(code,0,`${command} failed (${code})\n${stdout}\n${stderr}`);return stdout.trim();
};
const caseBuilder=`function buildCases(route,source,includeLargeBoundaries=true){
 const request=(token,sourceContext={source:'original.csv',row:1,column:'active',unknown:{retained:['雪',null]}})=>({profile:'umf.csv-boolean-lexical/1.0.0',field:{module:'domain',element:'patients.active'},token,sourceContext});
 const outcome=run=>{try{return {status:'accepted',value:run()}}catch(error){return {status:'refused',name:error.name,prototype:Object.getPrototypeOf(error)?.constructor?.name??null,code:error.code??null,path:error.path??'',message:error.message}}};
 const cases={};for(const token of ['true','false','True','False'])cases['token:'+token]=route.validateCsvBooleanLexical(source,request(token));
 const constrained=structuredClone(source);constrained.modules[0].elements.find(e=>e.id==='patients.active').allowedValues=[{boolean:false}];cases.allowedValueMismatch=route.validateCsvBooleanLexical(constrained,request('True'));
 const unknown=structuredClone(source);unknown.modules[0].elements.find(e=>e.id==='patients.active').facets={futureBooleanRule:{meaning:'unknown'}};cases.unknownSelectedSemantics=route.validateCsvBooleanLexical(unknown,request('true'));
 cases.wrongFieldKind=outcome(()=>route.validateCsvBooleanLexical(source,{...request('true'),field:{module:'domain',element:'patients.birth_date'}}));
 const arrayField=structuredClone(source);arrayField.modules[0].elements.find(e=>e.id==='patients.active').cardinality='array';cases.wrongFieldCardinality=outcome(()=>route.validateCsvBooleanLexical(arrayField,request('true')));
 cases.unsupportedToken=outcome(()=>route.validateCsvBooleanLexical(source,{...request('true'),token:'TRUE'}));
 cases.requestShapeBeforeSourceInspection=outcome(()=>route.validateCsvBooleanLexical({}, {...request('true'),profile:'future'}));
 let reads=0;const guarded=Object.defineProperty({},'umf',{enumerable:true,get(){reads++;return '0.10.0'}});cases.invalidReceiptBeforeExpectedInput={result:outcome(()=>route.verifyCsvBooleanLexical({},guarded,request('true'))),expectedSourceReads:reads};
 let validReads=0;const validGuarded=Object.defineProperty({},'umf',{enumerable:true,get(){validReads++;return '0.10.0'}});cases.validReceiptThenExpectedGetter={result:outcome(()=>route.verifyCsvBooleanLexical(route.validateCsvBooleanLexical(source,request('true')),validGuarded,request('true'))),expectedSourceReads:validReads};
 if(includeLargeBoundaries){const pairRequest=sourceContext=>({profile:'umf.csv-boolean-lexical/1.0.0',field:{module:'domain',element:'patients.active'},sourceContext});const bytes=value=>new TextEncoder().encode(JSON.stringify(value)).length;
 const base=pairRequest('');const baseBytes=bytes({source,request:base});const exact=pairRequest('x'.repeat(4000000-baseBytes));const over=pairRequest(exact.sourceContext+'x');cases.inputByteLimit={limit:4000000,exactPairBytes:bytes({source,request:exact}),exact:outcome(()=>route.validateCsvBooleanLexical(source,exact)),overPairBytes:bytes({source,request:over}),over:outcome(()=>route.validateCsvBooleanLexical(source,over))};
 const empty=route.validateCsvBooleanLexical(source,request('true',''));const receiptBytes=bytes(empty);const atReceipt=request('true','x'.repeat(4000000-receiptBytes));const overReceipt=request('true',atReceipt.sourceContext+'x');cases.receiptByteLimit={limit:4000000,exactReceiptBytes:bytes(route.validateCsvBooleanLexical(source,atReceipt)),exact:outcome(()=>route.validateCsvBooleanLexical(source,atReceipt)),over:outcome(()=>route.validateCsvBooleanLexical(source,overReceipt))};}
 let sourceGetterReads=0;const accessorSource=structuredClone(source);Object.defineProperty(accessorSource,'umf',{enumerable:true,get(){sourceGetterReads++;return '0.10.0'}});cases.adversarialSourceAccessor={result:outcome(()=>route.validateCsvBooleanLexical(accessorSource,request('true'))),getterReads:sourceGetterReads};
 let requestGetterReads=0;const accessorRequest=request('true');Object.defineProperty(accessorRequest,'profile',{enumerable:true,get(){requestGetterReads++;return 'umf.csv-boolean-lexical/1.0.0'}});cases.adversarialRequestAccessor={result:outcome(()=>route.validateCsvBooleanLexical(source,accessorRequest)),getterReads:requestGetterReads};return cases;
}`;
try{
 const pkg=join(temp,'node_modules/@umf/core');await mkdir(pkg,{recursive:true});
 const extracted=Bun.spawnSync(['tar','-xzf',archive,'--strip-components=1','-C',pkg]);assert.equal(extracted.exitCode,0,extracted.stderr.toString());
 const packet=JSON.parse(await readFile(join(repo,'scripts/rust-migration/r5/csv-boolean-default-route/predecessor.json'),'utf8'));
 const source=JSON.parse(await readFile(join(pkg,'dist/spec/domain-packs/medical/ontology.json'),'utf8'));
 await writeFile(join(temp,'packet.json'),JSON.stringify(packet));await writeFile(join(temp,'source.json'),JSON.stringify(source));
 const probe=`import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import * as root from '@umf/core';import * as reference from '@umf/core/reference';const packet=JSON.parse(await readFile('./packet.json','utf8'));const source=JSON.parse(await readFile('./source.json','utf8'));${caseBuilder};const canonical=value=>JSON.stringify(value,(key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(name=>[name,item[name]])):item);const actual=buildCases(reference,source,false);const selected=buildCases(root,source,false);const frozenKeys=Object.keys(packet.cases).filter(key=>key!=='inputByteLimit'&&key!=='receiptByteLimit');for(const key of frozenKeys)assert.equal(canonical(actual[key]),canonical(packet.cases[key]),'frozen case '+key);const mismatches=Object.keys(selected).filter(key=>canonical(actual[key])!==canonical(selected[key]));assert.deepEqual(mismatches,['adversarialRequestAccessor']);for(const route of [actual,selected]){assert.equal(route.adversarialSourceAccessor.getterReads,0);assert.equal(route.adversarialRequestAccessor.getterReads,0)}assert.deepEqual({code:selected.adversarialRequestAccessor.result.code,path:selected.adversarialRequestAccessor.result.path},{code:'ACCESSOR_PROPERTY',path:'/csvRequest'});assert.deepEqual({code:actual.adversarialRequestAccessor.result.code,path:actual.adversarialRequestAccessor.result.path},{code:'NON_JSON',path:'/profile'});console.log(JSON.stringify({runtime:process.version,referenceCases:frozenKeys.length,reference:import.meta.resolve('@umf/core/reference'),default:import.meta.resolve('@umf/core'),frozenCasesMatch:true,adversarial:{reference:{source:actual.adversarialSourceAccessor,request:actual.adversarialRequestAccessor},default:{source:selected.adversarialSourceAccessor,request:selected.adversarialRequestAccessor}},mismatches}));`;
 await writeFile(join(temp,'reference-probe.mjs'),probe);
 const node=await run('node',['reference-probe.mjs']);const bun=await run('bun',['reference-probe.mjs']);
 console.log(JSON.stringify({node:JSON.parse(node),bun:JSON.parse(bun)}));
}finally{await rm(temp,{recursive:true,force:true});}
