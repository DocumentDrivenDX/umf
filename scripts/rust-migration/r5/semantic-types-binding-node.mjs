// SPDX-License-Identifier: MIT OR Apache-2.0
// Node/Bun replay for the six opt-in semantic-type operations. Set
// UMF_R5_NODE_PACKAGE_PATH to an installed package directory to exercise a
// clean npm-pack install; otherwise this is explicitly a local binding replay.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const packageRoot=process.env.UMF_R5_NODE_PACKAGE_PATH;
const bindingPath=packageRoot?resolve(packageRoot,'index.js'):resolve('bindings/core/node/index.js');
const packageSpecifier=process.env.UMF_R5_NODE_PACKAGE_SPECIFIER;
const {createCoreModelEngine}=await import(packageSpecifier??pathToFileURL(bindingPath).href);
const json=async path=>JSON.parse(await readFile(path,'utf8'));
const paths={coreSchema:'spec/core/schema.json',referenceSchema:'spec/core/semantic-type-reference.schema.json',packageSchema:'spec/core/extension-package.schema.json',constraints:'spec/metamodel/generated/core-constraints.json',domainPolicy:'spec/metamodel/generated/domain-policy.json'};
const resources=Object.fromEntries(await Promise.all(Object.entries(paths).map(async([name,path])=>[name,await json(path)])));
const core=await json('docs/helix/04-build/evidence/rust-migration/r5-core-semantic-types/frozen-typescript.json');
const access=await json('docs/helix/04-build/evidence/rust-migration/r5-semantic-type-accessors/frozen-typescript.json');
const api=createCoreModelEngine(resources), inspection=core.cases.inspect.value, declaration=core.cases.declare.value;
const equal=(actual,expected)=>assert.deepEqual(JSON.parse(JSON.stringify(actual)),expected);
equal(api.inspectCoreSemanticTypes(inspection.source,inspection.identity),inspection);
const receipt=api.declareCoreSemanticTypes(declaration.source,declaration.identity,declaration.request.types);equal(receipt,declaration);
equal(api.verifyCoreSemanticTypeDeclaration(receipt,receipt.target),declaration);
equal(api.getCoreSemanticTypes(inspection.source,inspection.identity),core.cases.get.value);
assert.equal(api.getCoreSemanticTypes(core.cases.inspect_missing.value.source,inspection.identity),undefined);
const got=api.getSemanticTypes(access.caseInputs.document,'m','e');equal(got,access.outcomes.get_copy_success.value.again);
const next=api.setSemanticTypes(access.caseInputs.document,'m','e',access.outcomes.set_copy_on_write.value.result);
const nextAnnotation=next.modules[0].elements[0].extensions['umf.semantic-types'];equal(nextAnnotation,access.outcomes.set_copy_on_write.value.result);
assert.equal(access.caseInputs.document.modules[0].elements[0].extensions['umf.semantic-types'].types[0].term,'email');
let missingTypes,missingAnnotation,missingTargetAnnotation;try{api.declareCoreSemanticTypes(declaration.source,declaration.identity,undefined)}catch(error){missingTypes=error}
try{api.setSemanticTypes(access.caseInputs.document,'m','e',undefined)}catch(error){missingAnnotation=error}
try{api.setSemanticTypes(access.caseInputs.document,'m','absent',undefined)}catch(error){missingTargetAnnotation=error}
assert.equal(missingTypes?.code,'NON_JSON');assert.equal(missingAnnotation?.code,'NON_JSON');assert.equal(missingTargetAnnotation?.message,'Missing requested element');
let zero,cancel,deadline;try{createCoreModelEngine(resources,{controls:{maxWork:0}}).inspectCoreSemanticTypes(inspection.source,inspection.identity)}catch(error){zero=error.code}
try{createCoreModelEngine(resources,{controls:{isCancelled:()=>true}}).inspectCoreSemanticTypes(inspection.source,inspection.identity)}catch(error){cancel=error.code}
try{createCoreModelEngine(resources,{controls:{now:()=>2,deadlineMs:1}}).inspectCoreSemanticTypes(inspection.source,inspection.identity)}catch(error){deadline=error.code}
assert.equal(zero,'RESOURCE_LIMIT');assert.equal(cancel,'CANCELLED');assert.equal(deadline,'DEADLINE');
console.log(JSON.stringify({status:'pass',runtime:process.versions.bun?{host:'Bun',version:Bun.version}:{host:'Node',version:process.version},binding:packageSpecifier?'clean-installed-package-name-import':packageRoot?'clean-installed-package-path-import':'local-binding',operations:6,getAbsent:'undefined',missingVsNull:true,copyIsolation:true,zeroWork:zero,cancel,deadline}));
