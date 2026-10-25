// SPDX-License-Identifier: MIT OR Apache-2.0
// Freeze ordered diagnostics from the current TypeScript Delta table inspector.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {importDeltaTable,inspectDeltaTable} from '../../../src/adapters/delta/table';

const hash=(path:string)=>createHash('sha256').update(readFileSync(path)).digest('hex');
const cases:Record<string,unknown>={
  unknownProperties: {
    protocol:{minReaderVersion:3,minWriterVersion:7,readerFeatures:[],writerFeatures:[],futureProtocol:1},
    metaData:{id:'t',format:{provider:'parquet',options:{},futureFormat:true},schemaString:'{"type":"struct","fields":[]}',partitionColumns:[],configuration:{},futureMetadata:true},
    futureRoot:true,
    'future/🚀':true,
  },
  featureRulesAndFutureProtocol: {
    protocol:{minReaderVersion:4,minWriterVersion:8,readerFeatures:['x','x'],writerFeatures:['y']},
    metaData:{id:'t',format:{provider:'csv'},schemaString:'{"type":"struct","fields":[]}',partitionColumns:[],configuration:{alpha:'x'}},
  },
  missingFeatureListsAtPinnedVersions: {
    protocol:{minReaderVersion:3,minWriterVersion:7},
    metaData:{id:'t',format:{provider:'parquet'},schemaString:'{"type":"struct","fields":[]}',partitionColumns:[],configuration:{}},
  },
  embeddedSchemaAndPartitions: {
    protocol:{minReaderVersion:3,minWriterVersion:7,readerFeatures:[],writerFeatures:[]},
    metaData:{id:'t',format:{provider:'parquet'},schemaString:JSON.stringify({type:'struct',future:1,fields:[{name:'x',type:'mystery',nullable:true,metadata:{},extra:true},{name:'x',type:'timestamp_ntz',nullable:true,metadata:{}},{name:'m',type:{type:'map',keyType:'string',valueType:'long'},nullable:true,metadata:{comment:'retained'}}]}),partitionColumns:['missing','missing'],configuration:{}},
  },
  configurationAndMappingMode: {
    protocol:{minReaderVersion:1,minWriterVersion:1},
    metaData:{id:'t',format:{provider:'parquet'},schemaString:'{"type":"struct","fields":[]}',partitionColumns:[],configuration:{'delta.columnMapping.mode':'mystery','delta.columnMapping.maxColumnId':'x','arbitrary':'preserved'}},
  },
  mappingPartialState: {
    protocol:{minReaderVersion:3,minWriterVersion:7,readerFeatures:[],writerFeatures:[]},
    metaData:{id:'t',format:{provider:'parquet'},schemaString:JSON.stringify({type:'struct',fields:[{name:'a',type:'string',nullable:true,metadata:{'delta.columnMapping.id':2,'delta.columnMapping.physicalName':'physical'}},{name:'b',type:'string',nullable:true,metadata:{'delta.columnMapping.id':2,'delta.columnMapping.physicalName':'physical'}}]}),partitionColumns:[],configuration:{'delta.columnMapping.mode':'name','delta.columnMapping.maxColumnId':'1'}},
  },
  mappingMissingMetadataAndInvalidMaximum: {
    protocol:{minReaderVersion:2,minWriterVersion:5},
    metaData:{id:'t',format:{provider:'parquet'},schemaString:JSON.stringify({type:'struct',fields:[{name:'a',type:'string',nullable:true,metadata:{}}]}),partitionColumns:[],configuration:{'delta.columnMapping.mode':'id','delta.columnMapping.maxColumnId':'2147483648'}},
  },
  mappingLexicalVersionTokens: '{"protocol":{"minReaderVersion":2.0,"minWriterVersion":5.0},"metaData":{"id":"t","format":{"provider":"parquet"},"schemaString":"{\\\"type\\\":\\\"struct\\\",\\\"fields\\\":[]}","partitionColumns":[],"configuration":{"delta.columnMapping.mode":"name","delta.columnMapping.maxColumnId":"0"}}}',
  invalidEmbeddedSchema: {
    protocol:{minReaderVersion:3,minWriterVersion:7,readerFeatures:[],writerFeatures:[]},
    metaData:{id:'t',format:{provider:'parquet'},schemaString:'not-json',partitionColumns:[],configuration:{}},
  },
};
const outcomes=Object.entries(cases).map(([id,root])=>{
  const source=typeof root==='string'?root:JSON.stringify(root);
  try {
    const document=importDeltaTable(source,{id});
    const result=inspectDeltaTable(document);
    return {id,source,sourceSha256:createHash('sha256').update(source).digest('hex'),status:'ok',diagnostics:result.diagnostics.map(({code,path,message,severity})=>({code,path,message,severity}))};
  } catch(error) {
    const e=error as Error&{code?:string};
    let diagnostics:unknown=[];
    if(e.code==='DELTA_TABLE_DOCUMENT')try{diagnostics=JSON.parse(e.message);}catch{}
    return {id,source,sourceSha256:createHash('sha256').update(source).digest('hex'),status:'error',code:e.code??null,message:e.message,diagnostics};
  }
});
const evidence={
  profile:'Current TypeScript Delta table warning predecessor',
  runner:'scripts/rust-migration/r8/freeze-delta-table-warnings.ts',
  runnerSha256:hash('scripts/rust-migration/r8/freeze-delta-table-warnings.ts'),
  sources:Object.fromEntries(['src/adapters/delta/table.ts','src/adapters/delta/column-mapping.ts','src/adapters/delta/index.ts','src/model/native-json.ts'].map(path=>[path,hash(path)])),
  cases:outcomes,
};
const outputPath='docs/helix/04-build/evidence/rust-migration/r8-delta-spark-hash/delta-table-warning-predecessor.json';
const serialized=JSON.stringify(evidence,null,2)+'\n';
if(process.argv.includes('--check')) {
  const committed=readFileSync(outputPath,'utf8');
  if(committed!==serialized) throw new Error(`Frozen Delta table warning receipt mismatch: ${outputPath}; regenerate deliberately, then review the exact diff`);
  console.log(`Frozen Delta table warning receipt matches byte-for-byte: ${outputPath}`);
} else {
  writeFileSync(outputPath,serialized);
  console.log(serialized);
}
