import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {captureDeltaLog} from '../../../src/adapters/delta/log';
import {reconcileDeltaCommits} from '../../../src/adapters/delta/reconcile';

const protocol={protocol:{minReaderVersion:1,minWriterVersion:2}};
const metadata={metaData:{id:'t',format:{provider:'parquet'},schemaString:'{"type":"struct","fields":[]}',partitionColumns:[],configuration:{}}};
const ordinary=(...actions:object[])=>actions.map(value=>JSON.stringify(value)).join('\n');
const dv=(pathOrInlineDv:string,offset=0)=>({storageType:'i',pathOrInlineDv,offset,sizeInBytes:1,cardinality:1});
const add=(path:string,size:number,deletionVector?:ReturnType<typeof dv>)=>({add:{path,partitionValues:{},size,modificationTime:size,dataChange:true,...(deletionVector?{deletionVector}:{})}});
const remove=(path:string,deletionVector?:ReturnType<typeof dv>,deletionTimestamp=1)=>({remove:{path,deletionTimestamp,dataChange:true,...(deletionVector?{deletionVector}:{})}});
const cases=[
 {id:'empty-history',commits:[] as {version:string;text:string}[]},
 {id:'version-gap',commits:[{version:'0',text:JSON.stringify(protocol)+'\n'+JSON.stringify(metadata)},{version:'2',text:''}]},
 {id:'missing-initial-metadata',commits:[{version:'0',text:JSON.stringify(protocol)}]},
 {id:'valid-state-and-deferred-unknown',commits:[{version:'0',text:[JSON.stringify(protocol),JSON.stringify(metadata),'{"txn":{"appId":"client","version":9223372036854775807}}',JSON.stringify({futureAction:{opaque:[1,'x']}}),JSON.stringify({commitInfo:42})].join('\n')}]},
 {id:'duplicate-protocol-actions',commits:[{version:'0',text:[protocol,protocol,metadata].map(value=>JSON.stringify(value)).join('\n')}]},
 {id:'cross-commit-map-set-retains-order',commits:[
  {version:'0',text:ordinary(protocol,metadata,{txn:{appId:'app-a',version:1}},{txn:{appId:'app-b',version:1}},{domainMetadata:{domain:'domain-a',configuration:'old-a',removed:false}},{domainMetadata:{domain:'domain-b',configuration:'old-b',removed:false}},{add:{path:'file-a',partitionValues:{},size:1,modificationTime:1,dataChange:true}},{add:{path:'file-b',partitionValues:{},size:1,modificationTime:1,dataChange:true}})},
  {version:'1',text:ordinary({txn:{appId:'app-a',version:2}},{domainMetadata:{domain:'domain-a',configuration:'new-a',removed:false}},{add:{path:'file-a',partitionValues:{},size:2,modificationTime:2,dataChange:true}})},
 ]},
 {id:'same-commit-add-remove-conflict',commits:[{version:'0',text:ordinary(protocol,metadata,{add:{path:'same-file',partitionValues:{},size:1,modificationTime:1,dataChange:true}},{remove:{path:'same-file',deletionTimestamp:1,dataChange:true}})}]},
 {id:'cross-commit-remove-clears-prior-add',commits:[
  {version:'0',text:ordinary(protocol,metadata,{add:{path:'gone-file',partitionValues:{},size:1,modificationTime:1,dataChange:true}})},
  {version:'1',text:ordinary({remove:{path:'gone-file',deletionTimestamp:2,dataChange:true}})},
 ]},
 {id:'malformed-utf16-txn-identity',commits:[{version:'0',text:ordinary(protocol,metadata,{txn:{appId:'\ud800',version:1}})}]},
 {id:'cross-commit-same-path-same-dv-replacement-retains-order',commits:[
  {version:'0',text:ordinary(protocol,metadata,add('file-a',1,dv('dv-a')),add('file-b',1,dv('dv-b')))},
  {version:'1',text:ordinary(add('file-a',2,dv('dv-a')))},
 ]},
 {id:'cross-commit-dv-change-without-removal-refused',commits:[
  {version:'0',text:ordinary(protocol,metadata,add('file-a',1,dv('dv-a')))},
  {version:'1',text:ordinary(add('file-a',2,dv('dv-b')))},
 ]},
 {id:'cross-commit-remove-old-dv-before-new-dv',commits:[
  {version:'0',text:ordinary(protocol,metadata,add('file-a',1,dv('dv-a')),add('file-b',1,dv('dv-b')))},
  {version:'1',text:ordinary(remove('file-a',dv('dv-a'),2),add('file-a',2,dv('dv-new')))},
 ]},
 {id:'cross-commit-remove-unknown-dv-retains-ordered-tombstones',commits:[
  {version:'0',text:ordinary(protocol,metadata,add('file-a',1,dv('dv-a')),add('file-b',1,dv('dv-b')))},
  {version:'1',text:ordinary(remove('file-a',dv('dv-a'),2),remove('file-c',dv('dv-c'),3))},
  {version:'2',text:ordinary(remove('file-a',dv('dv-a'),4))},
 ]},
];
const results=cases.map(c=>{const sources=c.commits.map(x=>({version:x.version,source:captureDeltaLog(x.text,{id:x.version})}));const result=reconcileDeltaCommits(sources);const frozenResult=c.id==='malformed-utf16-txn-identity'?{status:result.status,complete:result.complete,sources:result.sources,diagnostics:result.diagnostics,state:{transactions:result.state?.transactions.map(value=>({appIdCodeUnits:[...(value.kind==='object'&&value.members.appId?.kind==='string'?value.members.appId.value:'')].map(char=>char.charCodeAt(0)),version:value.kind==='object'&&value.members.version?.kind==='number'?value.members.version.value:''}))}}:result;return {id:c.id,commits:c.commits.map(x=>({...x,sourceSha256:createHash('sha256').update(x.text).digest('hex')})),result:frozenResult};});
const generated=JSON.stringify({format:'umf-r8-delta-reconcile-predecessor/1',cases:results},null,2)+'\n';
if(process.argv.includes('--check')){const path='docs/helix/04-build/evidence/rust-migration/r8-delta-spark-hash/delta-reconcile-predecessor.json';const committed=await readFile(path,'utf8');if(committed!==generated){console.error(`Delta reconciliation packet mismatch: ${path}`);process.exitCode=1;}else console.log(`Delta reconciliation packet matches: ${path}`);}else process.stdout.write(generated);
