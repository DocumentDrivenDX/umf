// SPDX-License-Identifier: MIT OR Apache-2.0
import {initializeWasm} from '../../bindings/core/wasm/index.js';
import {Registry} from '../../src/registry/registry';
import {inspectExtensionKinds} from '../../src/model/extension-kinds';
import {selectCoreElements} from '../../src/model/selection';
import {readDocument,writeDocument} from '../../src/model/document';
import {validateDocument} from '../../src/validation/document';
import {coreSchema,semanticTypeReferenceSchema,extensionPackageSchema,coreConstraints,domainPolicy} from '../../src/generated/core-model';
import {fixtureSemantics} from './support';
import type {ExtensionPackage} from '../../src/model/types';
export async function verify(){
  const moduleUrl='/wasm/umf_core_wasm.js';
  const engine=await initializeWasm(()=>import(moduleUrl),globalThis,{coreSchema,referenceSchema:semanticTypeReferenceSchema,packageSchema:extensionPackageSchema,constraints:coreConstraints,domainPolicy});
  const cases=await(await fetch('/cases.json')).json();
  const results=cases.map((c:any)=>{
    const registry=new Registry(engine);
    for(const item of c.registrations)registry.register(item.manifest,undefined,{kinds:item.kinds});
    return {name:c.name,listing:registry.listKinds(),inspection:inspectExtensionKinds(c.document,registry)};
  });
  const manifest=await(await fetch('/package.json')).json();
  const doc=readDocument(await(await fetch('/dashboard.yaml')).text(),'yaml');
  const registry=new Registry(engine).register(manifest as ExtensionPackage,fixtureSemantics,{kinds:true});
  const selection=selectCoreElements(doc,{references:'transitive',identities:[{module:'sales',element:'sales-row'}]},registry);
  if(JSON.stringify(selection.selection.map(e=>e.element.id))!==JSON.stringify(['channel','revenue','sales-row']))throw Error('Core Record/Field composition failed');
  const first=inspectExtensionKinds(doc,registry);
  for(const format of ['json','yaml'] as const){
    const restored=readDocument(writeDocument(doc,format),format);
    if(JSON.stringify(inspectExtensionKinds(restored,registry).entries)!==JSON.stringify(first.entries))throw Error('Serialization changed kind discovery');
  }
  (doc.modules[0]!.elements[3]!.extensions['example.dashboard'] as any).field.element='sales-row';
  if(validateDocument(doc,registry).valid)throw Error('Invalid Record/Field binding accepted');
  return {results,composition:{record:'sales-row',fields:selection.selection.filter(e=>e.element.kind==='field').map(e=>e.element.id),serializationRecoveries:2,invalidBindingRejected:true}};
}
