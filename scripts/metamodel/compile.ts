import {readJsonValue} from '../../src/model/serialization';
import {createHash} from 'node:crypto';
import {checkProgram,checkAnnotation,emitShape,type Shape} from './grammar';
import {assertLiteralPolicy} from '../../src/validation/literal-policy';
export const vocabulary='umf.metamodel';
export function parseModel(text:string):any{return readJsonValue(text,'yaml');}
export function compileModel(model:any){
 const root=model.extensions?.[vocabulary];checkAnnotation(root,true);
 const language=root.language,languageKeys=['version','root','schemaId','semanticReference','semanticReferenceId','packageEnvelope','packageSchemaId'];if(!language||Object.keys(language).some(k=>!languageKeys.includes(k))||languageKeys.some(k=>typeof language[k]!=='string'||!language[k])||model.umf!==language.version||root.constraints?.profile!=='umf.constraints/1')throw Error('METAMODEL_LANGUAGE');
 if(model.vocabularies?.[vocabulary]?.version!=='1.0.0')throw Error('METAMODEL_VOCABULARY_VERSION');
 for(const key of ['schemaId','semanticReferenceId','packageSchemaId']){const url=new URL(language[key]);if(url.hash)throw Error('METAMODEL_RESOURCE_ID');}
 if(new Set([language.schemaId,language.semanticReferenceId,language.packageSchemaId]).size!==3)throw Error('METAMODEL_DUPLICATE_RESOURCE_ID');
 checkProgram(root.constraints);
 const definitions=new Map<string,any>(),fields=new Map<string,any>();
 for(const m of model.modules??[])for(const e of m.elements??[]){const key=m.id+':'+e.id;if(fields.has(key))throw Error('METAMODEL_DUPLICATE '+key);fields.set(key,e);const meta=e.extensions?.[vocabulary];if(meta)checkAnnotation(meta);if(meta?.definition){if(definitions.has(meta.definition))throw Error('METAMODEL_DUPLICATE_DEFINITION '+meta.definition);definitions.set(meta.definition,{...e,module:m.id});}}
 const targets=new Set([...definitions.keys(),language.semanticReferenceId]);
 const rawShape=(e:any):Shape=>{const meta=e.extensions?.[vocabulary]??{};if(meta.shape)return meta.shape;if(e.references?.length){const ref=e.references.find((r:any)=>r.role==='record-type'),target=ref&&fields.get(ref.module+':'+ref.element)?.extensions?.[vocabulary]?.definition;if(!target)throw Error('METAMODEL_DANGLING_FIELD '+e.id);return {tag:'link',target};}if(e.allowedValues)return {tag:'choice',options:e.allowedValues.map((v:any)=>({tag:'constant',value:v.string??v.boolean??v.integerToken}))};if(e.scalarType)return {tag:({string:'text'} as any)[e.scalarType]??e.scalarType};throw Error('METAMODEL_FIELD_SHAPE '+e.id);};
 const shape=(e:any):Shape=>{const value=rawShape(e);return value&&typeof value==='object'&&typeof e.description==='string'&&value.description===undefined?{...value,description:e.description}:value;};
 const defs:Record<string,any>=Object.create(null);
 for(const [name,e]of definitions){const meta=e.extensions[vocabulary];let value=shape(e);if(e.kind==='record'&&e.members){const memberFields:Record<string,any>=Object.create(null),mandatory:string[]=[];for(const r of e.members){const f=fields.get(r.module+':'+r.element);if(!f)throw Error('METAMODEL_DANGLING_MEMBER '+r.element);if(Object.hasOwn(memberFields,f.name))throw Error('METAMODEL_DUPLICATE_PROPERTY '+f.name);memberFields[f.name]=shape(f);if(f.extensions?.[vocabulary]?.presence==='required')mandatory.push(f.name);}value={...value,tag:'object',fields:memberFields,...(mandatory.length?{mandatory}:{})};}defs[name]=emitShape(value,targets);}
 const resource=(name:string,id:string,title?:string)=>{if(!defs[name])throw Error('METAMODEL_MISSING_ROOT '+name);return {$schema:'https://json-schema.org/draft/2020-12/schema',$id:id,...(title?{title}:{}),...defs[name],$defs:Object.fromEntries(Object.entries(defs).filter(([k])=>k!==name))};};
 const core=resource(language.root,language.schemaId,model.title),reference=resource(language.semanticReference,language.semanticReferenceId),pkg=resource(language.packageEnvelope,language.packageSchemaId);
 // Inventories reference authored definitions instead of copying their lists.
 const resolveData=(value:any):any=>{
  if(!value||typeof value!=='object')return value;if(Array.isArray(value))return value.map(resolveData);
  if(Object.hasOwn(value,'$members')){if(Object.keys(value).length!==1)throw Error('METAMODEL_DATA_REFERENCE');const record=definitions.get(value.$members);if(!record?.members)throw Error('METAMODEL_MEMBER_REFERENCE '+value.$members);return record.members.map((r:any)=>fields.get(r.module+':'+r.element)?.name);}
  if(Object.hasOwn(value,'$values')){if(Object.keys(value).length!==1)throw Error('METAMODEL_DATA_REFERENCE');const definition=definitions.get(value.$values);if(!definition)throw Error('METAMODEL_VALUE_REFERENCE '+value.$values);const v=shape(definition);if(v.tag!=='choice'||!v.options.every((x:any)=>x.tag==='constant'))throw Error('METAMODEL_VALUE_REFERENCE '+value.$values);return v.options.map((x:any)=>x.value);}
  if(Object.hasOwn(value,'$keys')){if(Object.keys(value).length!==1)throw Error('METAMODEL_DATA_REFERENCE');const field=fields.get('umf:'+value.$keys);const v=field&&shape(field);if(v?.tag!=='object'||!v.fields)throw Error('METAMODEL_KEY_REFERENCE '+value.$keys);return Object.keys(v.fields);}
  return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,resolveData(v)]));
 };
 // External semantic references remain one generated reusable resource.
 const digest=createHash('sha256').update(JSON.stringify(model)).digest('hex');
 const domains=resolveData(root.domains);assertLiteralPolicy(domains.literal);
 return {model,language,core,reference,pkg,constraints:root.constraints,domains,definitions:defs,digest};
}
