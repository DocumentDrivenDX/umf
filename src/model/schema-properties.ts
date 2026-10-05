import {checkSchemaPropertyReceipt} from './schema-properties-receipts';
import {copyJson} from './json';
import {type Document,type Json,type Element,UmfError,type Validation} from './types';
import {validateDocument} from '../validation/document';
import {checkCoreLiteral} from '../validation/schema-properties';
import {checkSchemaLiteral,type CoreLiteral,schemaPropertyNames,canonicalSchemaJson,knownSchemaMembers,schemaError} from './schema-literals';

export type CoreSchemaPropertyIdentity={scope:'document'}|{scope:'module';module:string}|{scope:'element';module:string;element:string};
export interface CoreSchemaPropertyPatch {
 title?:string;aliases?:string[];examples?:CoreLiteral[];allowedValues?:CoreLiteral[];
 default?:{value:CoreLiteral;on:'missing'|'null'|'missing-or-null'};
 facets?:{length?:{min?:number;max?:number;unit:'unicode-scalar'|'byte'};collectionSize?:{min?:number;max?:number};range?:{min?:CoreLiteral;max?:CoreLiteral;minInclusive?:boolean;maxInclusive?:boolean}};
}
export interface CoreSchemaPropertyDeclaration {
 operation:'declare-core-schema-properties';version:'1.0.0';source:Document;target:Document;
 identity:CoreSchemaPropertyIdentity;request:CoreSchemaPropertyPatch;
 provenance:{origin:'authored';path:string;basis:'explicit-author-declaration'};
}
function locate(input:Document,identityInput:CoreSchemaPropertyIdentity){
 const source=copyJson(input) as unknown as Document,identity=copyJson(identityInput) as unknown as CoreSchemaPropertyIdentity;
 const validation=validateDocument(source);if(source.umf!=='0.8.0'||!validation.valid)schemaError('Expected valid 0.8.0 envelope');
 const keys=identity?.scope==='document'?['scope']:identity?.scope==='module'?['scope','module']:identity?.scope==='element'?['scope','module','element']:[];
 knownSchemaMembers(identity,keys,'/identity');if(!keys.length||Object.keys(identity).length!==keys.length)schemaError('Explicit identity required');
 if(identity.scope==='document')return {source,identity,node:source as unknown as Record<string,unknown>,path:'',validation};
 if(typeof identity.module!=='string'||!identity.module)schemaError('Nonempty module ID required');
 const mi=source.modules.findIndex(m=>m.id===identity.module);if(mi<0)schemaError('Module not found');
 const module=source.modules[mi]!;if(identity.scope==='module')return {source,identity,node:module as Record<string,unknown>,path:`/modules/${mi}`,validation};
 if(typeof identity.element!=='string'||!identity.element)schemaError('Nonempty element ID required');
 const ei=module.elements.findIndex(e=>e.id===identity.element);if(ei<0)schemaError('Element not found');
 return {source,identity,node:module.elements[ei]! as Record<string,unknown>,path:`/modules/${mi}/elements/${ei}`,validation};
}
export function inspectCoreSchemaProperties(input:Document,identity:CoreSchemaPropertyIdentity){
 const located=locate(input,identity),properties:Record<string,Json>=Object.create(null);
 for(const key of [...schemaPropertyNames,'facets'])if(Object.hasOwn(located.node,key))properties[key]=copyJson(located.node[key]);
 return {operation:'inspect-core-schema-properties' as const,version:'1.0.0' as const,source:located.source,identity:located.identity,path:located.path,properties,diagnostics:located.validation.diagnostics,provenance:'unverified' as const};
}
export function declareCoreSchemaProperties(input:Document,identity:CoreSchemaPropertyIdentity,patch:CoreSchemaPropertyPatch):CoreSchemaPropertyDeclaration {
 const request=copyJson(patch) as unknown as CoreSchemaPropertyPatch;
 knownSchemaMembers(request,[...schemaPropertyNames,'facets'],'/request');if(!Object.keys(request).length)schemaError('Empty declaration');
 const located=locate(input,identity),targetLocated=locate(located.source,located.identity),target=targetLocated.source,node=targetLocated.node;
 if(identity.scope!=='element'&&Object.keys(request).some(k=>!['title','aliases'].includes(k)))schemaError('Value properties apply only to Fields');
 if(identity.scope==='element'&&node.kind!=='field'&&Object.keys(request).some(k=>!['title','aliases'].includes(k)))schemaError('Value properties apply only to Fields');
 for(const key of schemaPropertyNames)if(Object.hasOwn(request,key)){
  if(key==='default'&&node.default)knownSchemaMembers(node.default,['value','on'],located.path+'/default');
  node[key]=copyJson(request[key]);
 }
 if(request.facets){
  knownSchemaMembers(request.facets,['length','collectionSize','range'],'/request/facets');
  const facets=copyJson(node.facets??{}) as Record<string,Json>;
  for(const [group,changes] of Object.entries(request.facets)){
   const keys=group==='length'?['min','max','unit']:group==='range'?['min','max','minInclusive','maxInclusive']:['min','max'];
   knownSchemaMembers(changes,keys,'/request/facets/'+group);
   if(facets[group])knownSchemaMembers(facets[group],keys,located.path+'/facets/'+group);
   if(group==='length'&&(facets[group] as any)?.unit!==undefined&&(facets[group] as any).unit!==(changes as any).unit)schemaError('Length unit changes require a separate explicit migration');
   facets[group]=copyJson({...facets[group] as object,...changes});
  }
  node.facets=facets;
 }
 if(request.allowedValues)for(const value of request.allowedValues)checkSchemaLiteral(target,node as unknown as Element,value);
 if(request.default)checkSchemaLiteral(target,node as unknown as Element,request.default.value);
 const validation=validateDocument(target);if(!validation.valid)schemaError(JSON.stringify(validation.diagnostics));
 return copyJson({operation:'declare-core-schema-properties',version:'1.0.0',source:located.source,target,identity:located.identity,request,provenance:{origin:'authored',path:located.path,basis:'explicit-author-declaration'}}) as unknown as CoreSchemaPropertyDeclaration;
}
export function verifyCoreSchemaPropertyDeclaration(input:CoreSchemaPropertyDeclaration,current:Document):CoreSchemaPropertyDeclaration {
 const receipt=copyJson(input) as unknown as CoreSchemaPropertyDeclaration;
 if(!checkSchemaPropertyReceipt(receipt))schemaError('Invalid declaration receipt structure');
 if(receipt?.operation!=='declare-core-schema-properties'||receipt.version!=='1.0.0')schemaError('Invalid declaration receipt');
 const expected=declareCoreSchemaProperties(receipt.source,receipt.identity,receipt.request);
 if(canonicalSchemaJson(expected)!==canonicalSchemaJson(receipt)||canonicalSchemaJson(copyJson(current))!==canonicalSchemaJson(expected.target))schemaError('Forged or stale declaration receipt');return expected;
}
export function validateCoreFieldValue(input:Document,field:{module:string;element:string},valueInput:CoreLiteral):Validation {
 const diagnostics:Validation['diagnostics']=[];
 try{
  const value=copyJson(valueInput) as unknown as CoreLiteral;
  if(!checkCoreLiteral(value))schemaError('Invalid typed literal');
  knownSchemaMembers(field,['module','element'],'/identity');
  const located=locate(input,{scope:'element',...field});checkSchemaLiteral(located.source,located.node as unknown as Element,value);
 }catch(error){if(!(error instanceof UmfError))throw error;diagnostics.push({code:error.code,path:error.path,message:error.message,severity:'error'});}
 return {valid:diagnostics.length===0,complete:diagnostics.length===0,diagnostics};
}
export type CoreDefaultInput={state:'missing'}|{state:'present';value:CoreLiteral};
export function resolveCoreDefault(input:Document,field:{module:string;element:string},stateInput:CoreDefaultInput){
 const state=copyJson(stateInput) as unknown as CoreDefaultInput;
 knownSchemaMembers(state,state?.state==='missing'?['state']:['state','value'],'/state');
 if(state.state!=='missing'&&state.state!=='present'||state.state==='present'&&!Object.hasOwn(state,'value'))schemaError('Explicit missing/present state required');
 knownSchemaMembers(field,['module','element'],'/identity');
 const located=locate(input,{scope:'element',...field});if(located.node.kind!=='field')schemaError('Default target must be a Field');
 const declaration=located.node.default as {value:CoreLiteral;on:string}|undefined;
 if(declaration)knownSchemaMembers(declaration,['value','on'],located.path+'/default');
 const applied=!!declaration&&(state.state==='missing'?['missing','missing-or-null'].includes(declaration.on):state.value===null&&['null','missing-or-null'].includes(declaration.on));
 const result:CoreDefaultInput=applied?{state:'present',value:copyJson(declaration!.value) as unknown as CoreLiteral}:state;
 if(result.state==='present'){const validation=validateCoreFieldValue(located.source,field,result.value);if(!validation.valid)schemaError(JSON.stringify(validation.diagnostics));}
 return {operation:'resolve-core-default' as const,version:'1.0.0' as const,source:located.source,identity:copyJson(field),input:state,result,applied};
}
