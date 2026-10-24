// SPDX-License-Identifier: MIT OR Apache-2.0
import {initializeWasm} from '../../bindings/core/wasm/index.js';
import {coreSchema,semanticTypeReferenceSchema,extensionPackageSchema,coreConstraints,domainPolicy} from '../../src/generated/core-model';
import {importLakeviewDashboardBytes,exportLakeviewDashboardBytes,lakeviewRegistry} from '../../src/adapters/lakeview';
import {readDocument,writeDocument} from '../../src/model/document';
import {inspectExtensionKinds} from '../../src/model/extension-kinds';
import {selectCoreElements} from '../../src/model/selection';
export async function verify(){
  const url='/wasm/umf_core_wasm.js';
  const runtime=await initializeWasm(()=>import(url),globalThis,{coreSchema,referenceSchema:semanticTypeReferenceSchema,packageSchema:extensionPackageSchema,constraints:coreConstraints,domainPolicy});
  const results=[];let generic:any;
  const hash=async(b:Uint8Array)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(b)))).map(x=>x.toString(16).padStart(2,'0')).join('');
  for(const name of ['marketing-campaign','lexical-quirks','empty-sections']){
    const bytes=new Uint8Array(await(await fetch('/fixture/'+name)).arrayBuffer());
    const {document}=importLakeviewDashboardBytes(bytes,{id:'browser-dashboard'},runtime);
    const original=await hash(bytes),recoveries=[];
    for(const format of ['direct','json','yaml'] as const){
      const restored=format==='direct'?document:readDocument(writeDocument(document,format),format);
      const output=exportLakeviewDashboardBytes(restored,runtime);
      if(output.length!==bytes.length||output.some((b,i)=>b!==bytes[i]))throw Error('Original byte reconstruction failed '+name+'/'+format);
      recoveries.push({format,sha256:await hash(output)});
    }
    if(name==='marketing-campaign'){
      const registry=lakeviewRegistry(runtime),inspection=inspectExtensionKinds(document,registry);
      if(!inspection.sourceValidation.valid||inspection.entries[0]?.reference.kind!=='dashboard')throw Error('Generic Lakeview discovery failed');
      const selected=selectCoreElements(document,{references:'transitive',identities:[{module:document.modules[0]!.id,element:'ds_metric'}]},registry);
      if(!selected.selection.some(e=>e.element.kind==='field'&&e.element.name==='Metric Value'))throw Error('Core Record/Field selection failed');
      generic={kind:inspection.entries[0].reference,entries:inspection.entries.length,coreFields:selected.selection.filter(e=>e.element.kind==='field').map(e=>e.element.name)};
    }
    const changed=structuredClone(document);(changed.extensions!['umf.lakeview'] as any).order.reverse();
    let rejected=false;try{exportLakeviewDashboardBytes(changed,runtime)}catch{rejected=true}
    if(!rejected&&name!=='empty-sections')throw Error('Edited representation exported archived bytes');
    results.push({name,bytes:bytes.length,original,recoveries});
  }
  return {results,generic};
}
