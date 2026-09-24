import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {captureDeltaLog,exportDeltaLog,inspectDeltaActions,projectBindingToDelta,type Document} from '../../src';

const base='fixtures/projections/ddd-postgresql-tables/';
const graph=await Bun.file(base+'case.json').json();
const binding=await Bun.file(base+'delta-binding.json').json();
const source=await Bun.file(base+'delta-native.jsonl').text();
const native=captureDeltaLog(source,{id:'ddd-order-delta-source'});
const report=projectBindingToDelta(graph.logical as Document,binding as Document,native,'strict');
assert.equal(report.status,'projected');assert.deepEqual(report.residuals,[]);
assert.equal(exportDeltaLog(report.nativeArchive),source);
assert.equal(inspectDeltaActions(captureDeltaLog(report.candidate!,{id:'ddd-order-delta-proposal'})).knownShapesValid,true);
const action=JSON.parse(report.candidate!);
assert.deepEqual(JSON.parse(action.domainMetadata.configuration).clusteringColumns,[{physicalName:['tenant']}]);
await Bun.write(base+'delta-candidate.jsonl',report.candidate!);

const process=Bun.spawn(['uv','run','--with','deltalake==1.6.4','python3','scripts/binding/multi-target-delta-native.py'],{stdout:'pipe',stderr:'pipe'});
const [stdout,stderr,code]=await Promise.all([new Response(process.stdout).text(),new Response(process.stderr).text(),process.exited]);
assert.equal(code,0,stderr||stdout);
const observed=JSON.parse(stdout);
assert.equal(observed.runtime,'deltalake 1.6.4');
const paths=[base+'case.json',base+'delta-binding.json',base+'delta-native.jsonl',base+'delta-candidate.jsonl','src/projections/binding-delta/index.ts','scripts/binding/multi-target-delta-native.py'];
const sha256=Object.fromEntries(await Promise.all(paths.map(async path=>[path,createHash('sha256').update(new Uint8Array(await Bun.file(path).arrayBuffer())).digest('hex')])));
await Bun.write(base+'delta-oracle.json',JSON.stringify({scope:'Shared authored Order graph, separate Delta 3.2 binding and native domainMetadata proposal; no data-file clustering, multi-table generation or writer enforcement claim',native:observed,knownShapesValid:true,clusteringColumns:[['tenant']],sourceRecovered:true,sha256},null,2)+'\n');
console.log({status:report.status,native:observed.runtime,clusteringColumns:[['tenant']]});
