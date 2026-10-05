import {checkSchemaPropertyReceipt} from './schema-properties-receipts';
import {copyJson} from './json';
import {type Document,type Json} from './types';
import {validateDocument} from '../validation/document';
import {schemaPropertyNames,newFacetNames,canonicalSchemaJson,schemaError} from './schema-literals';
export interface SchemaPropertiesUpgradeReceipt {operation:'upgrade-schema-properties-envelope';version:'1.0.0';source:Document;target:Document;residuals:{path:string;value:Json;reason:'Legacy content retained without reinterpretation'}[]}
export function upgradeSchemaPropertiesEnvelope(input:Document):SchemaPropertiesUpgradeReceipt {
 const source=copyJson(input) as unknown as Document;if(source.umf!=='0.7.0'||!validateDocument(source).valid)schemaError('Expected valid 0.7.0 envelope');
 const target=copyJson(source) as unknown as Document;target.umf='0.8.0';const residuals:SchemaPropertiesUpgradeReceipt['residuals']=[];
 const archive=(node:Record<string,unknown>,key:string,path:string)=>{if(Object.hasOwn(node,key)){residuals.push({path:path+'/'+key,value:copyJson(node[key]),reason:'Legacy content retained without reinterpretation'});delete node[key];}};
 for(const key of ['title','aliases'])archive(target,key,'');
 target.modules.forEach((m,mi)=>{const path=`/modules/${mi}`;for(const key of ['title','aliases'])archive(m,key,path);m.elements.forEach((e,ei)=>{const at=path+`/elements/${ei}`;for(const key of schemaPropertyNames)archive(e,key,at);const f=e.facets as Record<string,unknown>|undefined;if(f){for(const key of newFacetNames)archive(f,key,at+'/facets');if(f.length&&typeof f.length==='object')archive(f.length as Record<string,unknown>,'min',at+'/facets/length');}});});
 if(!validateDocument(target).valid)schemaError('Upgrade produced invalid target');
 return copyJson({operation:'upgrade-schema-properties-envelope',version:'1.0.0',source,target,residuals}) as unknown as SchemaPropertiesUpgradeReceipt;
}
export function verifySchemaPropertiesUpgrade(input:SchemaPropertiesUpgradeReceipt):SchemaPropertiesUpgradeReceipt {
 const receipt=copyJson(input) as unknown as SchemaPropertiesUpgradeReceipt;
 if(!checkSchemaPropertyReceipt(receipt)||receipt.operation!=='upgrade-schema-properties-envelope')schemaError('Invalid upgrade receipt structure');
 const expected=upgradeSchemaPropertiesEnvelope(receipt.source);
 if(canonicalSchemaJson(receipt)!==canonicalSchemaJson(expected))schemaError('Forged upgrade receipt');return expected;
}
export function rollbackSchemaPropertiesEnvelope(input:SchemaPropertiesUpgradeReceipt,current:Document){
 const receipt=verifySchemaPropertiesUpgrade(input),source=copyJson(current) as unknown as Document;
 if(source.umf!=='0.8.0'||source.id!==receipt.target.id||!validateDocument(source).valid)schemaError('Invalid rollback source');
 return {operation:'rollback-schema-properties-envelope' as const,version:'1.0.0' as const,source,target:receipt.source,receipt,reason:'Original envelope restored; subsequent content retained in source'};
}
