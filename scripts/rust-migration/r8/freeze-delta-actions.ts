import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {captureDeltaLog} from '../../../src/adapters/delta/log';
import {inspectDeltaActions} from '../../../src/adapters/delta/actions';

const inputs=[
 {id:'int64-boundaries',text:'{"txn":{"appId":"x","version":9223372036854775807}}\n{"txn":{"appId":"x","version":-9223372036854775808}}\n{"txn":{"appId":"x","version":9223372036854775808}}\n{"txn":{"appId":"x","version":-9223372036854775809}}'},
 {id:'integer-token-grammar',text:'{"txn":{"appId":"x","version":9007199254740992.1}}\n{"txn":{"appId":"x","version":1e400}}\n{"protocol":{"minReaderVersion":2147483648,"minWriterVersion":2}}'},
 {id:'required-fields-and-shapes',text:'{"add":{}}\n{"cdc":{"path":"p","partitionValues":{},"size":1,"dataChange":true}}\n{"domainMetadata":{"domain":"d","configuration":{},"removed":false}}'},
 {id:'unknown-content-and-provenance',text:'{"txn":{"appId":"x","version":1,"future":9}}\n{"__proto__":{"x":1}}\n{"commitInfo":{"raw":"keep"}}\n{"futureAction":{"opaque":true}}'},
 {id:'duplicate-keys',text:'{"txn":{"appId":"x","app\\u0049d":"y"}}\n'},
 {id:'non-object-commit-info',text:'{"commitInfo":null}\n{"commitInfo":1e400}\n{"commitInfo":[]}'},
];
const cases=inputs.map(({id,text})=>{const r=inspectDeltaActions(captureDeltaLog(text,{id}));return {id,text,sourceSha256:createHash('sha256').update(text,'utf8').digest('hex'),parsedAll:r.parsedAll,complete:r.complete,knownShapesValid:r.knownShapesValid,lines:r.lines.map(({line,start,end,terminator,status,action,node})=>({line,start,end,terminator,status,...(action===undefined?{}:{action}),...(node===undefined?{}:{node})})),diagnostics:r.diagnostics.map(({code,path,severity,message})=>({code,path,severity,message}))};});
const generated=JSON.stringify({format:'umf-r8-delta-actions-predecessor/1',cases},null,2)+'\n';
if(process.argv.includes('--check')){const path='docs/helix/04-build/evidence/rust-migration/r8-delta-spark-hash/delta-actions-predecessor.json';const committed=await readFile(path,'utf8');if(committed!==generated){console.error(`Delta actions predecessor packet mismatch: ${path}`);process.exitCode=1;}else console.log(`Delta actions predecessor packet matches: ${path}`);}else process.stdout.write(generated);
