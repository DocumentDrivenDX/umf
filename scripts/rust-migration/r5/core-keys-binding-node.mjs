// SPDX-License-Identifier: MIT OR Apache-2.0
// Replay the frozen CONTRACT-040 operation packet through an installed or local
// opt-in Node/Bun core-model binding.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import frozen from '../../../docs/helix/04-build/evidence/rust-migration/r5-core-keys/frozen-typescript.json' with {type:'json'};
import coreSchema from '../../../spec/core/schema.json' with {type:'json'};
import referenceSchema from '../../../spec/core/semantic-type-reference.schema.json' with {type:'json'};
import packageSchema from '../../../spec/core/extension-package.schema.json' with {type:'json'};
import constraints from '../../../spec/metamodel/generated/core-constraints.json' with {type:'json'};
import domainPolicy from '../../../spec/metamodel/generated/domain-policy.json' with {type:'json'};

const packagePath=process.env.UMF_R5_NODE_PACKAGE_PATH;
const specifier=process.env.UMF_R5_NODE_PACKAGE_SPECIFIER;
const entry=specifier??(packagePath?pathToFileURL(resolve(packagePath,'index.js')).href:pathToFileURL(resolve('bindings/core/node/index.js')).href);
const {createCoreModelEngine}=await import(entry);
const api=createCoreModelEngine({coreSchema,referenceSchema,packageSchema,constraints,domainPolicy});
const methods={
  inspectCoreKeys:(c)=>api.inspectCoreKeys(c.source,c.identity),
  lookupCoreKey:(c)=>api.lookupCoreKey(c.source,c.identity),
  declareCoreRecordMembers:(c)=>api.declareCoreRecordMembers(c.source,c.identity,c.request),
  declareCoreKey:(c)=>api.declareCoreKey(c.source,c.identity,c.request),
  verifyCoreKeyOperation:(c)=>api.verifyCoreKeyOperation(c.receipt,c.current),
};
const operationByCase={
  inspect_known:'inspectCoreKeys',inspect_absent:'inspectCoreKeys',inspect_inapplicable:'inspectCoreKeys',
  lookup_by_stable_id:'lookupCoreKey',lookup_name_does_not_resolve:'lookupCoreKey',
  declare_members_ordered:'declareCoreRecordMembers',declare_key_explicit_primary:'declareCoreKey',
  preserve_unknown_qualifiers:'declareCoreKey',remove_unknown_member_refused:'declareCoreRecordMembers',
  tuple_change_refused:'declareCoreKey',old_profile_refused:'declareCoreKey',extra_identity_refused:'inspectCoreKeys',
  duplicate_member_request_before_source:'declareCoreRecordMembers',duplicate_key_request_before_source:'declareCoreKey',
  lookup_identity_before_source:'lookupCoreKey',receipt_shape_before_recompute:'verifyCoreKeyOperation',
};
const actual={};
for(const [name,method] of Object.entries(operationByCase)){
  const input=frozen.cases[name];
  try{actual[name]={ok:true,value:methods[method](input)};}
  catch(error){actual[name]={ok:false,error:{code:error?.code??'',message:error?.message??String(error),path:error?.path??''}};}
  actual[name]=JSON.parse(JSON.stringify(actual[name]));
  assert.deepStrictEqual(actual[name],frozen.outcomes[name],name);
}
const receipt=frozen.outcomes.declare_key_explicit_primary.value;
const stale={umf:'0.10.0',id:'changed',vocabularies:{},modules:[]};
try{api.verifyCoreKeyOperation(receipt,stale);assert.fail('stale operation should refuse');}
catch(error){actual.verify_stale_document={ok:false,error:{code:error?.code??'',message:error?.message??String(error),path:error?.path??''}};}
actual.verify_stale_document=JSON.parse(JSON.stringify(actual.verify_stale_document));
assert.deepStrictEqual(actual.verify_stale_document,frozen.outcomes.verify_stale_document);
const capture={profile:'r5-core-keys-node/0.1.0',runtime:process.versions.bun?`Bun ${Bun.version}`:`Node ${process.version}`,binding:specifier?'installed-package-name':packagePath?'installed-package-path':'local-binding',actual};
if(process.env.UMF_R5_CORE_KEYS_CAPTURE) await writeFile(process.env.UMF_R5_CORE_KEYS_CAPTURE,JSON.stringify(capture,null,2)+'\n');
console.log(JSON.stringify({status:'pass',cases:Object.keys(actual).length,binding:capture.binding,runtime:capture.runtime,capturePath:process.env.UMF_R5_CORE_KEYS_CAPTURE??null}));
