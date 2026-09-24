import {captureDeltaLog,exportDeltaLog,inspectDeltaLog,readDocument,writeDocument} from '../src';
const base='fixtures/delta/upstream/',manifest=await Bun.file(base+'manifest.json').json(),results=[];
for(const file of manifest.files){
 if(!file.path.endsWith('.json'))continue;
 const raw=new Uint8Array(await Bun.file(base+file.path).arrayBuffer());
 const hash=(bytes:Uint8Array)=>new Bun.CryptoHasher('sha256').update(bytes).digest('hex');
 if(hash(raw)!==file.sha256)throw Error('Source hash changed: '+file.path);
 const text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(raw),doc=captureDeltaLog(text,{id:file.path});
 for(const format of ['json','yaml'] as const){const output=exportDeltaLog(readDocument(writeDocument(doc,format),format));if(output!==text||hash(new TextEncoder().encode(output))!==file.sha256)throw Error('Source changed: '+file.path);}
 const report=inspectDeltaLog(doc);
 if(report.lines.map(l=>text.slice(l.start,l.end)+l.terminator).join('')!==text)throw Error('Locations changed: '+file.path);
 results.push({path:file.path,sha256:file.sha256,parsedAll:report.parsedAll,lines:report.lines.length,parsed:report.lines.filter(l=>l.status==='parsed').length,invalid:report.lines.filter(l=>l.status==='invalid').length,blank:report.lines.filter(l=>l.status==='blank').length,diagnostics:report.diagnostics.map(d=>d.code)});
}
if(results.length!==307)throw Error('Corpus count changed');
const summary={files:results.length,lines:results.reduce((n,r)=>n+r.lines,0),invalid:results.reduce((n,r)=>n+r.invalid,0),blank:results.reduce((n,r)=>n+r.blank,0),unknownActions:results.reduce((n,r)=>n+r.diagnostics.filter(d=>d==='DELTA_LOG_UNKNOWN_ACTION').length,0)};
if(summary.lines!==1725||summary.invalid!==1||summary.blank!==0||summary.unknownActions!==0||results.filter(r=>!r.parsedAll)[0]?.path!=='crates/test/tests/data/checkpoint-v2-table/_delta_log/_autostats/00000000000000000007.0000000000.stats.json')throw Error('Inspection baseline changed');
await Bun.write(base+'log-results.json',JSON.stringify({commit:manifest.commit,...summary,results},null,2)+'\n');console.log(summary);
