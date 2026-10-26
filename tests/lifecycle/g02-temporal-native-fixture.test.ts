// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

test('G02 temporal native packet contains independently compiled carrier transitions and exact manual oracles',async()=>{
 const output=join(tmpdir(),`g02-temporal-fixture-${crypto.randomUUID()}.json`);
 try{
  const result=Bun.spawnSync(['bun','tests/lifecycle/g02-temporal-native-fixture.ts',output],{stdout:'pipe',stderr:'pipe'});
  expect(result.exitCode).toBe(0);if(result.exitCode!==0)throw new Error(new TextDecoder().decode(result.stderr));
  const packet=JSON.parse(await readFile(output,'utf8'));
  expect(packet.version).toBe('umf.g02-temporal-native-fixture/1');
  expect(packet.provenance.adaptation).toContain('synthetic');
  expect(packet.cases.map((item:any)=>item.id)).toEqual([
   'temporal-birthday-date-coalesce','temporal-instant-copy-coalesce','temporal-uuid-copy-coalesce',
   'temporal-boolean-copy-coalesce','temporal-matched-null-date-rollback',
  ]);
  for(const item of packet.cases){
   const previous=JSON.parse(item.initialSource.utf8),next=JSON.parse(item.source.utf8);
   const oldCommands=previous.modules[0].extensions['umf.tables'].commands;
   const newCommands=next.modules[0].extensions['umf.tables'].commands;
   expect(oldCommands).toHaveLength(1);expect(oldCommands[0].id).toBe('create_person');
   expect(newCommands[0]).toEqual(oldCommands[0]);expect(newCommands).toHaveLength(2);
   expect(oldCommands[0].body.values.find((value:any)=>value.field.element==='owner').value).toEqual({kind:'currentPrincipal'});
   expect(item.plan.options.backfills).toHaveLength(1);
   expect(item.plan.options.backfills[0].scopedRows).toBe(true);
  }
  const nullCase=packet.cases.at(-1);
  expect(nullCase.expectedFailure).toBe('null-result');
  expect(nullCase.initialRows.some((row:any)=>row.birthDate===null)).toBe(true);
  expect(packet.cases[3].expectedRows.map((row:any[])=>row.at(-1))).toEqual([false,true,false]);
  expect(packet.cases[0].expectedRows.map((row:any[])=>[row[0],row[3]])).toEqual([['p1','2012-03-04'],['p2','2000-02-29'],['p3','2020-05-06']]);
  expect(packet.cases[1].expectedRows[0][4]).toBe('2020-07-08 09:10:11.123456+00');
  expect(packet.cases[1].expectedRows[1]).toEqual(['p2','g02_bob',null,null,null,'2025-01-02 03:04:05.123456+00',null,null,null,null]);
  expect(packet.cases[1].expectedRows[2][4]).toBe('1998-01-02 03:04:05+00');
  expect(packet.cases[2].expectedRows[1]).toEqual(['p2','g02_bob',null,null,null,null,null,'00000000-0000-4000-8000-000000000009',null,null]);
  const runner=await readFile('tests/lifecycle/g02-temporal-native.py','utf8');
  const metadataStart=runner.indexOf('def metadata_snapshot(');
  const metadataEnd=runner.indexOf('\ndef run_case(',metadataStart);
  expect(metadataStart).toBeGreaterThanOrEqual(0);
  expect(metadataEnd).toBeGreaterThan(metadataStart);
  expect(runner.slice(metadataEnd).startsWith('\ndef run_case(')).toBe(true);
  const metadata=runner.slice(metadataStart,metadataEnd);
  expect(metadata).toContain("cfg['schema']+'.umf_lifecycle_progress'");
  expect(metadata).toContain('pg_catalog.to_regclass(%s)');
  expect(metadata).toContain('if progress_relation is not None:');
  expect(runner).toContain('before_meta[1] is None');
  expect(runner).toContain("progress[0][5]=='ready'");
  expect(runner).toContain("progress[0][6]==hashlib.sha256(b'').hexdigest()");
  expect(runner).toContain("progress is None)");
  expect(runner).toContain('clients-remain-fenced-after-failed-phase');
 }finally{await rm(output,{force:true});}
},30000);
