import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {importDeltaTable} from '../../../src/adapters/delta/table';
import {renameDeltaMappedField} from '../../../src/adapters/delta/rename';
import {UmfError} from '../../../src/model/errors';

type Case={id:string;text:string;tableId:string;options:{fieldPointer:string;name:string;uninterpretedReferences:'preserve-and-report'}};
const read=(path:string)=>readFile(path,'utf8');
const nameText=await read('fixtures/delta/mapped-data/name/context.json');
const idText=await read('fixtures/delta/mapped-data/id/context.json');
const nestedText=await read('fixtures/delta/mapped-nested/name-legacy/context.json');
const mutate=(source:string,fn:(v:any)=>void)=>{const v=JSON.parse(source);fn(v);return JSON.stringify(v);};
const opts=(fieldPointer='/fields/1',name='area')=>({fieldPointer,name,uninterpretedReferences:'preserve-and-report' as const});
const cases:Case[]=[
 {id:'name-mode-partition-update',text:nameText,tableId:'name',options:opts()},
 {id:'id-mode-partition-update',text:idText,tableId:'id',options:opts()},
 {id:'nested-array-field',text:nestedText,tableId:'nested',options:opts('/fields/1/type/elementType/fields/0','quantity')},
 {id:'collision',text:nameText,tableId:'collision',options:opts('/fields/1','ID')},
 {id:'non-field-pointer',text:nameText,tableId:'bad-pointer',options:opts('/fields/1/metadata','x')},
 {id:'constraint-reference',text:mutate(nameText,v=>v.metaData.configuration['delta.constraints.positive']='id > 0'),tableId:'constraint',options:opts()},
 {id:'unknown-feature',text:mutate(nameText,v=>{v.protocol={minReaderVersion:3,minWriterVersion:7,readerFeatures:['columnMapping','futureFeature'],writerFeatures:['columnMapping','futureFeature']};}),tableId:'future-feature',options:opts()},
 {id:'column-expression',text:mutate(nameText,v=>{const s=JSON.parse(v.metaData.schemaString);s.fields[2].type.fields[0].metadata['delta.generationExpression']='id + 1';v.metaData.schemaString=JSON.stringify(s);}),tableId:'expression',options:opts()},
 {id:'unknown-provider',text:mutate(nameText,v=>v.metaData.format.provider='future'),tableId:'provider',options:opts()},
];
const casesOut=cases.map(c=>{try{return {...c,sourceSha256:createHash('sha256').update(c.text).digest('hex'),result:renameDeltaMappedField(importDeltaTable(c.text,{id:c.tableId}),c.options)};}catch(e){if(e instanceof UmfError)return {...c,sourceSha256:createHash('sha256').update(c.text).digest('hex'),error:{code:e.code,message:e.message,path:e.path}};throw e;}});
const generated=JSON.stringify({format:'umf-r8-delta-rename-predecessor/1',cases:casesOut},null,2)+'\n';
if(process.argv.includes('--check')){const path='docs/helix/04-build/evidence/rust-migration/r8-delta-spark-hash/delta-rename-predecessor.json';const committed=await readFile(path,'utf8');if(committed!==generated){console.error(`Delta rename predecessor packet mismatch: ${path}`);process.exitCode=1;}else console.log(`Delta rename predecessor packet matches: ${path}`);}else process.stdout.write(generated);
