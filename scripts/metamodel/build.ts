// SPDX-License-Identifier: MIT OR Apache-2.0
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {resolve,dirname,relative} from 'node:path';
import {createHash} from 'node:crypto';
import ts from 'typescript-api';
import {parseModel,compileModel,vocabulary} from './compile';
import {structuralSource} from './structural';
import {annotationSchema} from './grammar';
const root=resolve(import.meta.dir,'../..'),json=(v:any)=>JSON.stringify(v,null,2)+'\n',hash=(v:string)=>createHash('sha256').update(v).digest('hex');
const names:Record<string,string>={document:'Document',module:'Module',element:'Element',itemType:'CoreItemTypeReference',semanticType:'CoreSemanticTypeReference'};
const typeName=(s:string)=>names[s]??s[0]!.toUpperCase()+s.slice(1).replace(/[^a-zA-Z0-9]/g,'');
function typeOf(s:any):string {
 if(s===true)return 'unknown';if(s===false)return 'never';if(s.$ref)return typeName(s.$ref.includes('#/$defs/')?s.$ref.split('/').pop():s.$ref.includes('semantic-type-reference')?'semanticType':s.$ref);
 if(Object.hasOwn(s,'const'))return JSON.stringify(s.const);if(s.enum)return s.enum.map((x:any)=>JSON.stringify(x)).join(' | ');
 if(s.anyOf||s.oneOf)return (s.anyOf??s.oneOf).map(typeOf).join(' | ');
 if(s.type==='array')return '('+typeOf(s.items??{})+')[]';
 if(s.type==='object')return '{'+Object.entries(s.properties??{}).map(([k,v])=>JSON.stringify(k)+(s.required?.includes(k)?'':'?')+':'+typeOf(v)+';').join('')+(s.additionalProperties===false?'':'[key:string]:'+(typeof s.additionalProperties==='object'?typeOf(s.additionalProperties):'unknown')+';')+'}';
 if(s.allOf)return s.allOf.map(typeOf).join(' & ');
 return ({string:'string',integer:'number',number:'number',boolean:'boolean',null:'null'} as any)[s.type]??'unknown';
}
async function compilerClosure():Promise<string[]>{
 const found=new Set<string>();
 const visit=async(path:string):Promise<void>=>{if(found.has(path))return;found.add(path);const source=await readFile(resolve(root,path),'utf8'),file=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true);for(const node of file.statements){if((!ts.isImportDeclaration(node)&&!ts.isExportDeclaration(node))||!node.moduleSpecifier||!ts.isStringLiteral(node.moduleSpecifier))continue;if((ts.isImportDeclaration(node)&&node.importClause?.isTypeOnly)||(ts.isExportDeclaration(node)&&node.isTypeOnly))continue;const spec=node.moduleSpecifier.text;if(!spec.startsWith('.'))continue;let target=resolve(dirname(resolve(root,path)),spec);if(!/\.(ts|json)$/.test(target))target+='.ts';await visit(relative(root,target));}};
 await visit('scripts/metamodel/build.ts');return [...found].sort();
}
export async function generate(options:{check?:boolean;outputRoot?:string}={}){
 const text=await readFile(resolve(root,'spec/metamodel/umf.yaml'),'utf8'),result=compileModel(parseModel(text));
 const compilerFiles=[...await compilerClosure(),'package.json','bun.lock'];
 const sources=Object.fromEntries(await Promise.all(['spec/metamodel/umf.yaml',...compilerFiles].map(async p=>[p,hash(await readFile(resolve(root,p),'utf8'))])));
 const provenance={modelSha256:sources['spec/metamodel/umf.yaml'],compilerSha256:hash(json(Object.fromEntries(compilerFiles.map(p=>[p,sources[p]]))))};
 const comment='Generated from spec/metamodel/umf.yaml; model '+provenance.modelSha256+'; compiler '+provenance.compilerSha256;
 for(const resource of [result.core,result.reference,result.pkg])resource.$comment=comment;
 const coreTypes=Object.entries({...result.core.$defs,document:{...result.core,$defs:undefined}}).map(([name,schema])=>'export type '+typeName(name)+' = '+(name==='extensions'?'{[key:string]:Json}':typeOf(schema))+';').join('\n');
 const vocabularyCode='Object.freeze({'+Object.entries(result.domains.vocabulary).map(([key,value])=>JSON.stringify(key)+':Object.freeze('+JSON.stringify(value)+' as const)').join(',')+'})';
 const data='// SPDX-License-Identifier: MIT OR Apache-2.0\n// '+comment+'\n'+`export const CURRENT_CORE_VERSION=${JSON.stringify(result.language.version)} as const;\nexport {default as coreSchema} from '../../spec/core/schema.json';\nexport {default as semanticTypeReferenceSchema} from '../../spec/core/semantic-type-reference.schema.json';\nexport {default as extensionPackageSchema} from '../../spec/core/extension-package.schema.json';\nexport {default as coreConstraints} from '../../spec/metamodel/generated/core-constraints.json';\nexport {default as domainPolicy} from '../../spec/metamodel/generated/domain-policy.json';\nexport const coreVocabulary=${vocabularyCode};\n`+'export type Json=null|boolean|number|string|Json[]|{[key:string]:Json};\n'+coreTypes+'\n';
 const pkg={id:vocabulary,version:'1.0.0',coreVersion:result.language.version,description:'Authored UMF language definitions and inert ordered constraints',schema:annotationSchema,semantics:'Closed declarations are interpreted by the independently bounded metamodel compiler; no raw JSON Schema or executable per-rule callbacks are accepted.',scopes:['document','element'],capabilities:{validation:'structural',directions:[],evidence:[]}};
 const outputs:Record<string,string>={'spec/core/schema.json':json(result.core),'spec/core/semantic-type-reference.schema.json':json(result.reference),'spec/core/extension-package.schema.json':json(result.pkg),'spec/metamodel/package.json':json(pkg),'spec/metamodel/generated/core-constraints.json':json({...result.constraints,provenance}),'spec/metamodel/generated/domain-policy.json':json({...result.domains,provenance}),'spec/metamodel/generated/python-shapes.json':json({profile:'umf.python-shapes/1',currentVersion:result.language.version,schema:result.core,referenceSchema:result.reference,provenance}),'python/umf_access/src/umf_access/generated_core.py':'# SPDX-License-Identifier: MIT OR Apache-2.0\n# '+comment+'\nfrom typing import Final, Literal, TypeAlias\nCURRENT_CORE_VERSION: Final = '+JSON.stringify(result.language.version)+'\nCoreVersion: TypeAlias = Literal['+JSON.stringify(result.language.version)+']\n','src/generated/core-model.ts':data,'src/generated/core-validators.ts':structuralSource([result.core,result.reference,result.pkg])};
 const manifest={profile:'umf.metamodel.outputs/1',provenance,sources,outputs:Object.fromEntries(Object.entries(outputs).map(([p,v])=>[p,{sha256:hash(v),bytes:Buffer.byteLength(v)}]))};outputs['spec/metamodel/generated/manifest.json']=json(manifest);
 const outRoot=options.outputRoot??root;
 if(options.check){for(const [path,value]of Object.entries(outputs)){let actual;try{actual=await readFile(resolve(outRoot,path),'utf8');}catch{throw Error('METAMODEL_MISSING_OUTPUT '+path);}if(actual!==value)throw Error('METAMODEL_STALE_OUTPUT '+path);}for(const dir of ['spec/metamodel/generated','src/generated'])for(const name of await readdir(resolve(outRoot,dir)))if(!Object.hasOwn(outputs,dir+'/'+name))throw Error('METAMODEL_EXTRA_OUTPUT '+dir+'/'+name);}
 else for(const [path,value]of Object.entries(outputs)){await mkdir(dirname(resolve(outRoot,path)),{recursive:true});await writeFile(resolve(outRoot,path),value);}
 return {outputs,manifest,result};
}
if(import.meta.main){const check=process.argv.includes('--check'),index=process.argv.indexOf('--output-root');await generate({check,...(index>=0?{outputRoot:resolve(process.argv[index+1]!)}:{})});if(index<0){const self=Bun.spawn([process.execPath,'scripts/check-metamodel-self.ts'],{cwd:root,stdout:'inherit',stderr:'inherit'});if(await self.exited)throw Error('METAMODEL_SELF_CHECK');if(!check)await generate({check:true});}console.log(check?'Metamodel outputs current':'Metamodel outputs generated');}
