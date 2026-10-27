// SPDX-License-Identifier: MIT OR Apache-2.0
// Replay the frozen R5 core semantic-types packet through V4 default and reference roots.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {isAbsolute,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const root=process.cwd();
const packet=JSON.parse(await readFile(resolve(root,'docs/helix/04-build/evidence/rust-migration/r5-core-semantic-types/frozen-typescript.json'),'utf8'));
const defaultSpecifier=process.env.UMF_R5_DEFAULT_SPECIFIER??'../../../dist/umf-node.js';
const referenceSpecifier=process.env.UMF_R5_REFERENCE_SPECIFIER??'../../../dist/umf.js';
const load=specifier=>import(isAbsolute(specifier)?pathToFileURL(specifier):new URL(specifier,import.meta.url));
const defaultApi=await load(defaultSpecifier);
const referenceApi=await load(referenceSpecifier);
const doc={umf:'0.10.0',id:'r5-semantic-types',vocabularies:{},modules:[{id:'m',namespace:'https://example.test',elements:[{id:'e',extensions:{},semanticTypes:[{vocabulary:'example.contact',version:'1.0.0',term:'email',qualifier:{future:'preserve'}}]}]}]};
const missing=structuredClone(doc);delete missing.modules[0].elements[0].semanticTypes;
const identity={module:'m',element:'e'};
const requested=[{vocabulary:'example.contact',version:'1.0.0',term:'email',qualifier:{future:'preserve'}}];
const old={...structuredClone(missing),umf:'0.9.0'};
const capture=run=>{try{return{ok:true,value:run()}}catch(error){return{ok:false,error:{code:error?.code??null,message:String(error?.message??error),path:error?.path??null}}}};
const json=value=>JSON.parse(JSON.stringify(value));
const outcomes=api=>{
 const cases={
  inspect:()=>api.inspectCoreSemanticTypes(doc,identity),
  inspect_missing:()=>api.inspectCoreSemanticTypes(missing,identity),
  get:()=>api.getCoreSemanticTypes(doc,identity),
  declare:()=>api.declareCoreSemanticTypes(missing,identity,requested),
  declare_missing_types:()=>api.declareCoreSemanticTypes(missing,identity,undefined),
  clear:()=>api.declareCoreSemanticTypes(doc,identity,null),
  invalid_identity_precedes_document:()=>api.inspectCoreSemanticTypes({umf:'bad'},{module:'',element:'e'}),
  invalid_reference_precedes_document:()=>api.declareCoreSemanticTypes({umf:'bad'},identity,[{vocabulary:'',version:'1',term:'x'}]),
  old_version_inspect_refusal:()=>api.inspectCoreSemanticTypes(old,identity),
  old_version_get_refusal:()=>api.getCoreSemanticTypes({...doc,umf:'0.9.0'},identity),
  old_version_declare_refusal:()=>api.declareCoreSemanticTypes(old,identity,requested),
 };
 const result=Object.fromEntries(Object.entries(cases).map(([name,run])=>[name,capture(run)]));
 const declaration=result.declare.value;
 result.verify=capture(()=>api.verifyCoreSemanticTypeDeclaration(declaration,declaration.target));
 const unknown=structuredClone(declaration);unknown.source=doc;unknown.request.types=null;
 result.verify_unknown_qualifier_recompute=capture(()=>api.verifyCoreSemanticTypeDeclaration(unknown,unknown.target));
 const forged=structuredClone(declaration);forged.provenance.origin='forged';
 result.verify_forged=capture(()=>api.verifyCoreSemanticTypeDeclaration(forged,declaration.target));
 const extra=structuredClone(declaration);extra.futureReceiptField=true;
 result.verify_extra_receipt_field=capture(()=>api.verifyCoreSemanticTypeDeclaration(extra,declaration.target));
 const malformed=structuredClone(declaration);malformed.request.types=[];
 result.verify_malformed_request=capture(()=>api.verifyCoreSemanticTypeDeclaration(malformed,declaration.target));
 return json(result);
};
for(const api of [defaultApi,referenceApi])for(const name of ['inspectCoreSemanticTypes','getCoreSemanticTypes','declareCoreSemanticTypes','verifyCoreSemanticTypeDeclaration'])assert.equal(typeof api[name],'function',`missing export ${name}`);
const actual=outcomes(defaultApi),reference=outcomes(referenceApi);
assert.deepEqual(actual,packet.cases,'V4 default route differs from frozen predecessor');
assert.deepEqual(reference,packet.cases,'./reference route differs from frozen predecessor');
assert.equal(actual.inspect.value.meaning.types[0].qualifier.future,'preserve','unknown qualifier content must survive');
console.log(JSON.stringify({status:'pass',cases:Object.keys(actual).length,defaultRoute:'V4 Rust model root',referenceRoute:'TypeScript oracle',unknownQualifierPreserved:true}));
