import {captureDeltaLog,reconcileDeltaCommits,writeDocument,readDocument,exportDeltaLog} from '../src';
import {renderTree} from '../src/model/native-json';
const base='fixtures/delta/history/',results=[],commits=[];
for(let i=0;i<6;i++){
 const text=await Bun.file(base+String(i).padStart(20,'0')+'.json').text(),source=captureDeltaLog(text,{id:'commit-'+i});for(const f of ['json','yaml'] as const)if(exportDeltaLog(readDocument(writeDocument(source,f),f))!==text)throw Error('Source changed');commits.push({version:String(i),source});
 const r=reconcileDeltaCommits(commits);if(r.status!=='reconciled'||!r.state)throw Error(JSON.stringify(r.diagnostics));if(JSON.stringify(r.sources)!==JSON.stringify(commits))throw Error('Source changed');const s=r.state;
 const actions=[{action:'protocol',value:s.protocol},{action:'metaData',value:s.metaData},...s.adds.map(value=>({action:'add',value})),...s.removes.map(value=>({action:'remove',value})),...s.transactions.map(value=>({action:'txn',value})),...s.domains.map(value=>({action:'domainMetadata',value}))];
 await Bun.write(base+'snapshot-'+i+'.jsonl',actions.map(a=>'{' +JSON.stringify(a.action)+':'+renderTree(a.value)+'}').join('\n')+'\n');results.push(r);
}
await Bun.write(base+'results.json',JSON.stringify({versions:results.length,results},null,2)+'\n');console.log({versions:results.length});
