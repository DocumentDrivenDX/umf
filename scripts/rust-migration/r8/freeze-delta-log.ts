import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {captureDeltaLog,inspectDeltaLog} from '../../../src/adapters/delta/log';

const inputs=[
 {id:'line-ending-offsets-exact-numbers',text:'😀\r\n\t \n{"txn":{"appId":"x","version":9223372036854775807}}\n{"future":{"n":1e400}}\nnot json\n{"add":{},"remove":{}}\n{"metaData":null}'},
 {id:'duplicate-decoded-key',text:'{"txn":{"appId":"x","app\\u0049d":"y"}}\n'},
 {id:'unknown-action-and-empty',text:'{"future":{"raw":"keep","n":-0.0e+7}}\n'},
 {id:'empty-source',text:''},
 {id:'trailing-terminators',text:'{"protocol":{}}\r\n\n'},
];
const cases=inputs.map(({id,text})=>{const report=inspectDeltaLog(captureDeltaLog(text,{id}));return {id,text,sourceSha256:createHash('sha256').update(text,'utf8').digest('hex'),parsedAll:report.parsedAll,complete:report.complete,lines:report.lines.map(({line,start,end,terminator,status,action,node})=>({line,start,end,terminator,status,...(action===undefined?{}:{action}),...(node===undefined?{}:{node})})),diagnostics:report.diagnostics.map(({code,path,severity,message})=>({code,path,severity,message}))};});
const generated=JSON.stringify({format:'umf-r8-delta-log-predecessor/1',cases},null,2)+'\n';
if(process.argv.includes('--check')){
 const path='docs/helix/04-build/evidence/rust-migration/r8-delta-spark-hash/delta-log-predecessor.json';
 const committed=await readFile(path,'utf8');
 if(committed!==generated){console.error(`Delta log predecessor packet mismatch: ${path}`);process.exitCode=1;}else console.log(`Delta log predecessor packet matches: ${path}`);
}else process.stdout.write(generated);
