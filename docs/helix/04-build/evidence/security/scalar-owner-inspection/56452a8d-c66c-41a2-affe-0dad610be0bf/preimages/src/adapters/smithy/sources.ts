import {copyJson} from '../../model/json';
import {UmfError,type Document,type Json} from '../../model/types';
import {inspectSmithy,SMITHY_EXTENSION} from './index';
import type {SmithySourcePayload} from './source-profile';
function payload(document:Document):SmithySourcePayload{
 const validation=inspectSmithy(document);if(!validation.valid)throw new UmfError('SMITHY_SOURCES',JSON.stringify(validation.diagnostics));
 const value=document.modules.find(m=>m.id==='schema')?.elements.find(e=>e.id==='schema')?.extensions[SMITHY_EXTENSION];
 if((value as any)?.profile!=='smithy-idl-sources'||document.vocabularies[SMITHY_EXTENSION]?.version!=='0.1.0')throw new UmfError('SMITHY_PROFILE','This operation requires supplied source files');
 return copyJson(value) as unknown as SmithySourcePayload;
}
/** Preserve supplied IDL/JSON text. No browser syntax or semantic validity claim. */
export function importSmithySources(input:{files:Record<string,string>},options:{id:string}):Document{
 const supplied=copyJson(input) as unknown as typeof input;if(Object.keys(supplied).some(k=>k!=='files'))throw new UmfError('SMITHY_SOURCE_INPUT','Unknown source-bundle option');
 const doc:Document={umf:'0.1.0',id:options.id,vocabularies:{[SMITHY_EXTENSION]:{version:'0.1.0'}},modules:[{id:'schema',namespace:'',elements:[{id:'schema',extensions:{[SMITHY_EXTENSION]:{profile:'smithy-idl-sources',files:supplied.files} as unknown as Json}}]}]};payload(doc);return doc;
}
export function exportSmithySources(document:Document){const p=payload(document);if(inspectSmithy(document).diagnostics.some(d=>d.code==='SMITHY_REPRESENTATION'))throw new UmfError('SMITHY_REPRESENTATION','Native source export would discard unknown content');return {files:p.files};}
export function proposeSmithySourceEdit(document:Document,path:string,text:string){
 const p=payload(document);if(!Object.hasOwn(p.files,path)||typeof text!=='string')throw new UmfError('SMITHY_SOURCE_EDIT','Replace an existing supplied file');p.files[path]=text;
 const next=copyJson(document) as unknown as Document;next.modules.find(m=>m.id==='schema')!.elements.find(e=>e.id==='schema')!.extensions[SMITHY_EXTENSION]=p as unknown as Json;payload(next);return {document:next,validation:inspectSmithy(next)};
}
