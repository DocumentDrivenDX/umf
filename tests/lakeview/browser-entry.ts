// SPDX-License-Identifier: MIT OR Apache-2.0
import {initializeWasm} from '../../bindings/core/wasm/index.js';
import {coreSchema,semanticTypeReferenceSchema,extensionPackageSchema,coreConstraints,domainPolicy} from '../../src/generated/core-model';
import {importLakeviewDashboardBytes,exportLakeviewDashboardBytes,lakeviewRegistry,projectLakeviewToLegacyDashboard} from '../../src/adapters/lakeview';
import {readDocument,writeDocument} from '../../src/model/document';
import {inspectExtensionKinds} from '../../src/model/extension-kinds';
import {selectCoreElements} from '../../src/model/selection';
import {elementKey} from '../../src/adapters/lakeview/project';
import {legacyIds,legacyFixture,legacyNumericFixture,legacyMixedDefaults,legacySelectionFixture,legacyUnknownWidgetTypes,legacyUnknownFormats,legacyUnknownChannels,legacyFormatFixture,legacyChannelFixture} from './legacy-fixture';
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
  const legacyProject=(view:any)=>projectLakeviewToLegacyDashboard(view,legacyIds,{title:'Legacy browser view'});
  for(const name of ['constructor','toString','__proto__']){
    const projected=legacyProject(legacyFixture(name));
    const filter=projected.elements.get(elementKey('page','filter')) as any;
    const dataset=projected.elements.get(elementKey('data','dataset')) as any;
    if(projected.issues.length||filter?.targets[0]?.field!==name||!Object.hasOwn(dataset?.fields??{},name))throw Error('Legacy own field projection failed '+name);
  }
  for(const token of ['0.10000000000000001','9007199254740993','1e400']){
    const projected=legacyProject(legacyNumericFixture(token,true));
    const filter=projected.elements.get(elementKey('page','filter')) as any;
    if(!filter||filter.default!==undefined||!projected.issues.some(i=>i.code==='LAKEVIEW_FILTER_DEFAULT'&&i.classification==='unsupported'))throw Error('Legacy numeric precision gap hidden '+token);
  }
  for(const example of legacyMixedDefaults){
    const projected=legacyProject(legacySelectionFixture(example.values));
    const filter=projected.elements.get(elementKey('page','filter')) as any;
    const issue=projected.issues[0];
    if(!filter||filter.default!==undefined||projected.issues.length!==1||issue?.code!=='LAKEVIEW_FILTER_DEFAULT'||issue.classification!=='unsupported'||issue.path!=='/pages/0/layout/0/widget/spec/selection/defaultSelection/values')throw Error('Legacy mixed-member precision diagnosis lost '+example.name);
  }
  for(const empty of [{},[]]){
    const projected=legacyProject(legacyFixture('column',{futureOption:empty}));
    if(projected.issues.length!==1||projected.issues[0]?.code!=='LAKEVIEW_UNMAPPED'||projected.issues[0]?.path!=='/pages/0/layout/0/widget/spec/futureOption')throw Error('Legacy empty-container gap hidden');
  }
  for(const widgetType of legacyUnknownWidgetTypes){
    const projected=legacyProject(legacyFixture('column',{widgetType}));
    if(projected.elements.has(elementKey('page','filter'))||!projected.issues.some(i=>i.code==='LAKEVIEW_WIDGET_TYPE'&&i.classification==='unsupported'&&i.path==='/pages/0/layout/0/widget'))throw Error('Legacy unknown widget discriminator projected '+JSON.stringify(widgetType));
  }
  for(const type of legacyUnknownFormats){
    const projected=legacyProject(legacyFormatFixture(type));
    const visual=projected.elements.get(elementKey('page','filter')) as any;
    if(!visual||visual.encodings[0]?.format!==undefined||!projected.issues.some(i=>i.code==='LAKEVIEW_UNMAPPED'&&i.path==='/pages/0/layout/0/widget/spec/encodings/columns/0/format'))throw Error('Legacy unknown format projected '+JSON.stringify(type));
  }
  for(const name of legacyUnknownChannels){
    const projected=legacyProject(legacyChannelFixture(name));
    const visual=projected.elements.get(elementKey('page','filter')) as any;
    if(!visual||JSON.stringify(visual.encodings)!==JSON.stringify([{channel:'column',field:'column',aggregation:'none'}])||!projected.issues.some(i=>i.code==='LAKEVIEW_UNMAPPED'&&i.path==='/pages/0/layout/0/widget/spec/encodings/'+name))throw Error('Legacy unknown channel projected '+name);
  }
  const supported=legacyProject(legacyFormatFixture('number-percent'));
  const supportedVisual=supported.elements.get(elementKey('page','filter')) as any;
  if(supported.issues.length||JSON.stringify(supportedVisual?.encodings)!==JSON.stringify([{channel:'column',field:'column',aggregation:'none',format:{kind:'percent'}}]))throw Error('Legacy supported visual output changed');
  return {results,generic,legacy:{hostileNames:3,numericDefaults:3,unknownEmptyContainers:2,mixedUnknownDefaults:3,unknownWidgetTypes:legacyUnknownWidgetTypes.length,unknownFormats:legacyUnknownFormats.length,unknownChannels:legacyUnknownChannels.length,supportedVisuals:1}};
}
