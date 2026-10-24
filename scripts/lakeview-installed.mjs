// SPDX-License-Identifier: MIT OR Apache-2.0
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const [packagePath,root]=process.argv.slice(2);
const {createEngine}=await import(pathToFileURL(packagePath+'/index.js').href);
const read=async p=>JSON.parse(await readFile(root+'/'+p,'utf8'));
const engine=createEngine({coreSchema:await read('spec/core/schema.json'),referenceSchema:await read('spec/core/semantic-type-reference.schema.json'),packageSchema:await read('spec/core/extension-package.schema.json'),constraints:await read('spec/metamodel/generated/core-constraints.json'),domainPolicy:await read('spec/metamodel/generated/domain-policy.json')});
const registry=[{manifest:await read('spec/extensions/lakeview/package.json'),kinds:true,nativeValidator:'lakeview/0.2.0'}];
const hash=b=>createHash('sha256').update(b).digest('hex'),results=[];
for(const name of ['marketing-campaign','lexical-quirks','empty-sections']){
 const original=await readFile(root+'/fixtures/lakeview/'+name+'.lvdash.json');
 const text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(original);
 const {document}=engine.importLakeviewDashboard(text,{id:'installed-dashboard'});
 const inspection=engine.inspectExtensionKinds(document,registry);
 if(!inspection.sourceValidation.valid||inspection.entries[0]?.reference.kind!=='dashboard')throw Error('Generic discovery failed '+name);
 const recoveries=[];
 for(const format of ['direct','json','yaml']){
  const restored=format==='direct'?document:engine.readDocument(engine.writeDocument(document,format,registry),format,registry);
  const bytes=Buffer.from(engine.exportLakeviewDashboard(restored),'utf8');
  if(!bytes.equals(original))throw Error('Original byte reconstruction failed '+name+'/'+format);
  recoveries.push({format,sha256:hash(bytes)});
 }
 results.push({name,bytes:original.length,original:hash(original),recoveries,entries:inspection.entries.length});
}
console.log(JSON.stringify({results}));
