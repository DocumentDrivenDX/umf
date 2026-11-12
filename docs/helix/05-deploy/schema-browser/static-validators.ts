/** Build-only fixed validators: preserves UMF's canonical JSON equality. */
import Ajv from 'ajv/dist/2020';
import standalone from 'ajv/dist/standalone';
import {_} from 'ajv/dist/compile/codegen';
import {_Code} from 'ajv/dist/compile/codegen/code';
import {generateDomainPackSchema} from '../../../../src/domain-packs/schema';
import {generateDomainPackLoaderSchema} from '../../../../src/index-node-v4';
import {generateArtifactCollectionSchema} from '../../../../src/domain-packs/artifacts';
import {resolve} from 'node:path';
export async function staticValidators(output:string){
 const root=resolve(import.meta.dir,'../../../..');
 const canonical=`function canonical(value){if(Array.isArray(value))return 'a['+value.map(canonical).join(',')+']';if(value!==null&&typeof value==='object')return 'o{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';return JSON.stringify(value);}`;
 const equality=(value:unknown):string=>Array.isArray(value)?'a['+value.map(equality).join(',')+']':value!==null&&typeof value==='object'?'o{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+equality((value as any)[key])).join(',')+'}':JSON.stringify(value);
 const helper=(c:any)=>c.gen.scopeValue('func',{ref:equality,code:new _Code('('+canonical+')')});
 const ajv=new Ajv({allErrors:true,strict:true,allowUnionTypes:true,ownProperties:true,validateFormats:false,code:{source:true,esm:true}});
 const configure=(ajv:any)=>{
 for(const keyword of ['const','enum','uniqueItems'])ajv.removeKeyword(keyword);
 ajv.addKeyword({keyword:'const',code(c:any){const eq=helper(c);c.fail(_`${eq}(${c.data}) !== ${eq}(${c.schemaCode})`);}});
 ajv.addKeyword({keyword:'enum',schemaType:'array',code(c:any){const eq=helper(c);c.fail(_`!${c.schemaCode}.some(value => ${eq}(value) === ${eq}(${c.data}))`);}});
 ajv.addKeyword({keyword:'uniqueItems',type:'array',schemaType:'boolean',code(c:any){const eq=helper(c);if(c.schema)c.fail(_`new Set(${c.data}.map(${eq})).size !== ${c.data}.length`);}});
 };configure(ajv);
 const schemas:any[]=[await Bun.file(resolve(root,'spec/core/schema.json')).json(),await Bun.file(resolve(root,'spec/core/semantic-type-reference.schema.json')).json()];
 schemas.push((await Bun.file(resolve(root,'spec/core/extension-package.schema.json')).json()),generateDomainPackSchema(),generateDomainPackLoaderSchema(),generateArtifactCollectionSchema(),(await Bun.file(resolve(root,'spec/extensions/tablespec/package.json')).json()).schema);
 schemas.push(await Bun.file(resolve(import.meta.dir,'catalog.schema.json')).json());
 const exports:Record<string,string>={},keys:string[]=[];schemas.forEach((s,i)=>{const id=i<2&&s.$id?s.$id:'urn:umf:browser-validator:'+i;ajv.addSchema({...s,$id:id},id);exports['v'+i]=id;keys.push(equality(s));});
 const code=standalone(ajv,exports);
 await Bun.write(output,canonical+'\n'+code+`\nconst checks=[${schemas.map((_,i)=>'v'+i).join(',')}];
const keys=${JSON.stringify(keys)};
export function createValidator(){
 return {
  getSchema(){throw Error('Schema ID is outside the fixed browser profile');},
  addSchema(schema){this.compile(schema);return this;},
  compile(schema){
   const index=keys.indexOf(canonical(schema));
   if(index<0)throw Error('Schema is not in the fixed browser validation profile');
   return checks[index];
  },
 };
}
export const checkCore=v0,checkPackage=v2;
export function installJsonEquality(validator){
 if(validator.fixedBrowserProfile)return;
 throw Error('Dynamic validator configuration is outside the fixed browser profile');
}
`);
}
