// SPDX-License-Identifier: MIT OR Apache-2.0
// Freeze the TypeScript predecessor's exact-tree operation and error outcomes.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {importDeltaSchema,exportDeltaSchema,getDeltaNode,proposeDeltaNodeEdit,inspectDelta} from '../../../src/adapters/delta/index';
import {importDeltaTable,exportDeltaTable,getDeltaTableNode,proposeDeltaTableNodeEdit} from '../../../src/adapters/delta/table';

const text=(path:string)=>readFileSync(path,'utf8');
function outcome(id:string,run:()=>unknown){try{const value=run();return {id,status:'ok',valueSha256:createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex')};}catch(e){const x=e as Error&{code?:string;path?:string};return {id,status:'error',name:x.name,code:x.code??null,path:x.path??null,message:x.message};}}
function hash(path:string){return createHash('sha256').update(readFileSync(path)).digest('hex');}
const schemaText=text('fixtures/delta/nested.json'),tableText=JSON.stringify({protocol:{minReaderVersion:3,minWriterVersion:7,readerFeatures:['timestampNtz'],writerFeatures:['timestampNtz']},metaData:{id:'table',format:{provider:'parquet',options:{}},schemaString:schemaText,partitionColumns:[],configuration:{}}});
const schema=importDeltaSchema(schemaText,{id:'frozen'}),table=importDeltaTable(tableText,{id:'frozen'});
const warningSources={
 unknownPropertiesAndTypes:JSON.stringify({type:'struct',future:1,fields:[{name:'a',type:'mystery',nullable:true,metadata:{},future:true}]}),
 unicodeDuplicateNames:JSON.stringify({type:'struct',fields:[{name:'Å',type:'string',nullable:true,metadata:{}},{name:'å',type:'string',nullable:true,metadata:{}}]}),
 decimalGrammarAndRange:JSON.stringify({type:'struct',fields:[{name:'a',type:'decimal(0,0)',nullable:true,metadata:{}},{name:'b',type:'decimal(-1,2)',nullable:true,metadata:{}},{name:'c',type:'decimal(39,39)',nullable:true,metadata:{}}]}),
 featureAndVoid:JSON.stringify({type:'struct',fields:[{name:'a',type:'timestamp_ntz',nullable:true,metadata:{}},{name:'b',type:'variant',nullable:true,metadata:{}},{name:'c',type:'void',nullable:true,metadata:{}}]}),
 metadataAndMapDefaultNullability:JSON.stringify({type:'struct',fields:[{name:'a',type:{type:'map',keyType:'string',valueType:'long'},nullable:true,metadata:{comment:'x',delta:'y'}}]}),
};
const diagnosticCases=Object.entries(warningSources).map(([id,text])=>{const doc=importDeltaSchema(text,{id});return {id,source:text,sourceSha256:createHash('sha256').update(text).digest('hex'),diagnostics:inspectDelta(doc).diagnostics.map(({code,path,message,severity})=>({code,path,message,severity}))};});
const numericBase='{"protocol":{"minReaderVersion":3,"minWriterVersion":7},"metaData":{"id":"t","format":{"provider":"p"},"schemaString":"{}","partitionColumns":[],"configuration":{},"createdTime":1}}';
const numericInputs: [string,string,string][]=[
 ['protocol-rounded-below-one','minReaderVersion','0.99999999999999999'],
 ['protocol-below-one','minReaderVersion','0.9999999999999998'],
 ['protocol-fraction','minReaderVersion','1.5'],
 ['protocol-exponent-one','minReaderVersion','1e0'],
 ['protocol-overflow','minReaderVersion','1e400'],
 ['created-time-rounded-integer','createdTime','1.00000000000000001'],
 ['created-time-fraction','createdTime','1.5'],
 ['created-time-overflow','createdTime','1e400'],
];
const numericCases=numericInputs.map(([id,field,value])=>{
 const source=field==='createdTime'?numericBase.replace('"createdTime":1',`"createdTime":${value}`):numericBase.replace('"minReaderVersion":3',`"minReaderVersion":${value}`);
 try { importDeltaTable(source,{id});return {id,status:'accepted',diagnostics:[]}; }
 catch(e) { const error=e as Error&{code?:string};const diagnostics=error.code==='DELTA_TABLE_DOCUMENT'?JSON.parse(error.message).filter((d:any)=>d.severity==='error').map(({code,path,message}:any)=>({code,path,message})):[];return {id,status:'rejected',diagnostics}; }
});
const schemaBad=structuredClone(schema) as any;schemaBad.modules[0].elements[0].extensions['umf.delta'].future=true;
const tableBad=structuredClone(table) as any;tableBad.modules[0].elements[0].extensions['umf.delta.table'].future=true;
const schemaInvalid=structuredClone(schema) as any;delete schemaInvalid.modules[0].elements[0].extensions['umf.delta'];
const tableInvalid=structuredClone(table) as any;delete tableInvalid.modules[0].elements[0].extensions['umf.delta.table'];
const cases=[
 outcome('schema.import.roundtrip',()=>exportDeltaSchema(importDeltaSchema(schemaText,{id:'frozen'}))),
 outcome('schema.import.malformed-json',()=>importDeltaSchema('{"type":',{id:'bad'})),
 outcome('schema.export.unknown-representation',()=>exportDeltaSchema(schemaBad)),
 outcome('schema.export.invalid-document',()=>exportDeltaSchema(schemaInvalid)),
 outcome('schema.get.pointer-syntax',()=>getDeltaNode(schema,'not-a-pointer')),
 outcome('schema.get.missing-target',()=>getDeltaNode(schema,'/absent')),
 outcome('schema.edit.pointer-before-replacement-parse',()=>proposeDeltaNodeEdit(schema,'not-a-pointer','{')),
 outcome('schema.edit.replacement-json',()=>proposeDeltaNodeEdit(schema,'/fields','{')),
 outcome('schema.edit.post-edit-shape',()=>proposeDeltaNodeEdit(schema,'/fields/0/nullable','"false"')),
 outcome('schema.get.access-copy-source-unchanged',()=>{const copy=getDeltaNode(schema,'/fields');if(copy.kind==='array')copy.items.pop();return exportDeltaSchema(schema);}),
 outcome('schema.edit.source-unchanged',()=>{const edit=proposeDeltaNodeEdit(schema,'/fields/0/type','"long"');return [exportDeltaSchema(schema),exportDeltaSchema(edit.document)];}),
 outcome('table.import.roundtrip',()=>exportDeltaTable(importDeltaTable(tableText,{id:'frozen'}))),
 outcome('table.import.malformed-json',()=>importDeltaTable('{"protocol":',{id:'bad'})),
 outcome('table.export.unknown-representation',()=>exportDeltaTable(tableBad)),
 outcome('table.export.invalid-document',()=>exportDeltaTable(tableInvalid)),
 outcome('table.get.pointer-syntax',()=>getDeltaTableNode(table,'not-a-pointer')),
 outcome('table.get.missing-target',()=>getDeltaTableNode(table,'/absent')),
 outcome('table.edit.pointer-before-replacement-parse',()=>proposeDeltaTableNodeEdit(table,'not-a-pointer','{')),
 outcome('table.edit.replacement-json',()=>proposeDeltaTableNodeEdit(table,'/metaData/id','{')),
 outcome('table.edit.post-edit-shape',()=>proposeDeltaTableNodeEdit(table,'/protocol/minReaderVersion','"3"')),
 outcome('table.get.access-copy-source-unchanged',()=>{const copy=getDeltaTableNode(table,'/protocol');if(copy.kind==='object')delete copy.members.minReaderVersion;return exportDeltaTable(table);}),
 outcome('table.edit.source-unchanged',()=>{const edit=proposeDeltaTableNodeEdit(table,'/metaData/id','"other"');return [exportDeltaTable(table),exportDeltaTable(edit.document)];}),
];
const sources=['src/adapters/delta/index.ts','src/adapters/delta/table.ts','src/model/native-json.ts'];
const receipt={profile:'TypeScript predecessor source outcomes',operationOrder:'payload validation precedes pointer parsing; pointer parsing precedes replacement JSON parsing; candidate payload/shape validation follows edit',sources:Object.fromEntries(sources.map(path=>[path,hash(path)])),fixtures:{schema:'fixtures/delta/nested.json',schemaSha256:hash('fixtures/delta/nested.json')},cases:cases.map((entry:any)=>entry.status==='ok'?{id:entry.id,status:'ok',valueSha256:entry.valueSha256}:{id:entry.id,status:'error',code:entry.code,path:entry.path,message:entry.code==='DELTA_DOCUMENT'||entry.code==='DELTA_TABLE_DOCUMENT'?JSON.parse(entry.message).filter((d:any)=>d.severity==='error').map((d:any)=>`${d.code} at ${d.path}: ${d.message}`).join('; '):entry.message}),diagnosticCases,numericCases};
console.log(JSON.stringify(receipt,null,2));
