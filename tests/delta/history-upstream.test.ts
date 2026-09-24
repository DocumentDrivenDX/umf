import {test,expect} from 'bun:test';
import {captureDeltaLog,reconcileDeltaCommits} from '../../src';
test('US-018-AC12: all pinned ordinary-commit prefixes preserve sources and reproduce state or explicit blocks',async()=>{
 const base='fixtures/delta/upstream/',manifest=await Bun.file(base+'manifest.json').json(),report=await Bun.file(base+'history-results.json').json(),hashes=new Map<string,string>(manifest.files.map((f:any)=>[f.path,f.sha256])),sources=new Map();
 expect(report.cases).toBe(303);expect(report.histories).toBe(59);
 for(const c of report.results){const commits=[];for(const v of c.versions){if(!sources.has(v.path)){const raw=new Uint8Array(await Bun.file(base+v.path).arrayBuffer());expect(new Bun.CryptoHasher('sha256').update(raw).digest('hex')).toBe(hashes.get(v.path)!);sources.set(v.path,captureDeltaLog(new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(raw),{id:v.path}));}commits.push({version:v.version,source:sources.get(v.path)});}const r=reconcileDeltaCommits(commits);expect(r.status).toBe(c.status);expect(r.sources).toEqual(commits);expect(r.diagnostics.filter(d=>d.severity==='error')).toEqual(c.errors);if(r.state)expect(new Bun.CryptoHasher('sha256').update(JSON.stringify(r.state)).digest('hex')).toBe(c.stateSha256);else expect(r.state).toBeUndefined();}
},120000);
